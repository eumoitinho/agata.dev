/*
 * SPDX-License-Identifier: AGPL-3.0-only
 * index.ts - Azure Deploy V3 Service Main Entry Point
 * Copyright (C) 2025 Nextify Limited
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Afferoo General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 */

import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger as honoLogger } from 'hono/logger'
import { prettyJSON } from 'hono/pretty-json'
import { validator } from 'hono/validator'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { createServiceBusClient } from './azure/service-bus'
import { createCosmosDBClient } from './azure/cosmos-db'
import { createProjectAdapter } from './azure/project-adapter'
import { DeploymentStateManager } from './deployment/state'
import { sendToQueue, createDeploymentMessage, scheduleDeployment, sendUrgentDeployment } from './queue/producer'
import { startQueueConsumer, processMessages } from './queue/consumer'
import { createLogger, loggedOperation } from './utils/logger'
import { createDeploymentError, ErrorCodes, DeploymentError } from './utils/errors'
import type {
  AzureBindings,
  DeploymentParams,
  ServiceBusMessage,
  DeploymentState,
  DeploymentStatus
} from './types'

const app = new Hono<{ Bindings: AzureBindings }>()

// Middleware
app.use('*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
}))

app.use('*', honoLogger())
app.use('*', prettyJSON())

// Health check endpoint
app.get('/health', (c) => {
  return c.json({
    service: 'agatta-deploy-v3',
    status: 'healthy',
    version: '3.0.0',
    timestamp: new Date().toISOString(),
    environment: c.env.DEPLOYMENT_ENVIRONMENT || 'development',
    azure: {
      subscriptionId: c.env.AZURE_SUBSCRIPTION_ID,
      region: c.env.AZURE_REGION || 'eastus2'
    }
  })
})

// Deployment status endpoint
app.get('/status/:deploymentId', async (c) => {
  try {
    const deploymentId = c.req.param('deploymentId')
    const organizationId = c.req.header('x-organization-id')
    const userId = c.req.header('x-user-id')

    if (!organizationId || !userId) {
      return c.json({
        success: false,
        error: 'Missing required headers: x-organization-id, x-user-id'
      }, 400)
    }

    const logger = createLogger(c.env, 'deploy-api')
    const cosmosClient = createCosmosDBClient(c.env)
    const stateManager = new DeploymentStateManager(c.env, cosmosClient)

    await cosmosClient.initialize()

    const state = await stateManager.getDeploymentState(deploymentId, organizationId, userId)

    if (!state) {
      return c.json({
        success: false,
        error: 'Deployment not found'
      }, 404)
    }

    return c.json({
      success: true,
      deployment: {
        id: state.id,
        status: state.status,
        progress: state.progress,
        stage: state.stage,
        startedAt: state.startedAt,
        completedAt: state.completedAt,
        config: state.config,
        stepResults: state.stepResults,
        error: state.error
      }
    })

  } catch (error) {
    const logger = createLogger(c.env, 'deploy-api')
    logger.error('Failed to get deployment status', {
      error: error instanceof Error ? error.message : String(error),
      deploymentId: c.req.param('deploymentId')
    })

    return c.json({
      success: false,
      error: 'Failed to retrieve deployment status'
    }, 500)
  }
})

// List deployments endpoint
app.get('/deployments', async (c) => {
  try {
    const organizationId = c.req.header('x-organization-id')
    const userId = c.req.header('x-user-id')
    const limit = parseInt(c.req.query('limit') || '10')
    const continuationToken = c.req.query('continuation')
    const status = c.req.query('status') as DeploymentStatus | undefined

    if (!organizationId || !userId) {
      return c.json({
        success: false,
        error: 'Missing required headers: x-organization-id, x-user-id'
      }, 400)
    }

    const logger = createLogger(c.env, 'deploy-api')
    const cosmosClient = createCosmosDBClient(c.env)
    const stateManager = new DeploymentStateManager(c.env, cosmosClient)

    await cosmosClient.initialize()

    const result = await stateManager.listDeployments(organizationId, userId, {
      limit,
      continuationToken,
      status
    })

    return c.json({
      success: true,
      deployments: result.deployments,
      continuationToken: result.continuationToken
    })

  } catch (error) {
    const logger = createLogger(c.env, 'deploy-api')
    logger.error('Failed to list deployments', {
      error: error instanceof Error ? error.message : String(error)
    })

    return c.json({
      success: false,
      error: 'Failed to list deployments'
    }, 500)
  }
})

// Deployment request schema
const deploymentSchema = z.object({
  projectId: z.string().min(1, 'Project ID is required'),
  customDomain: z.string().optional(),
  config: z.object({
    timeout: z.number().optional(),
    skipSteps: z.array(z.string()).optional(),
    debug: z.boolean().optional(),
    priority: z.number().min(1).max(10).optional()
  }).optional()
})

// Deploy project endpoint
app.post('/deploy', zValidator('json', deploymentSchema), async (c) => {
  try {
    const data = c.req.valid('json')
    const organizationId = c.req.header('x-organization-id')
    const userId = c.req.header('x-user-id')

    if (!organizationId || !userId) {
      return c.json({
        success: false,
        error: 'Missing required headers: x-organization-id, x-user-id'
      }, 400)
    }

    const logger = createLogger(c.env, 'deploy-api')

    // Validate project exists and user has access
    const cosmosClient = createCosmosDBClient(c.env)
    const projectAdapter = createProjectAdapter(c.env, cosmosClient)
    const projectData = await projectAdapter.getProjectData(data.projectId)

    if (!projectData) {
      return c.json({
        success: false,
        error: 'Project not found'
      }, 404)
    }

    // Create deployment parameters
    const params: DeploymentParams = {
      projectId: data.projectId,
      customDomain: data.customDomain,
      orgId: organizationId,
      userId: userId
    }

    // Create deployment message
    const message = createDeploymentMessage(params, data.config)

    // Send to queue
    await sendToQueue(c.env, message)

    logger.workflow('Deployment queued successfully', message.metadata.deploymentId, {
      projectId: data.projectId,
      userId,
      organizationId
    })

    return c.json({
      success: true,
      deploymentId: message.metadata.deploymentId,
      status: 'queued',
      message: 'Deployment has been queued for processing'
    })

  } catch (error) {
    const logger = createLogger(c.env, 'deploy-api')
    logger.error('Failed to queue deployment', {
      error: error instanceof Error ? error.message : String(error)
    })

    if (error instanceof DeploymentError) {
      return c.json({
        success: false,
        error: error.message,
        code: error.code
      }, error.statusCode || 500)
    }

    return c.json({
      success: false,
      error: 'Failed to queue deployment'
    }, 500)
  }
})

// Schedule deployment endpoint
app.post('/deploy/schedule', zValidator('json', deploymentSchema.extend({
  delaySeconds: z.number().min(1).max(86400) // Max 24 hours
})), async (c) => {
  try {
    const data = c.req.valid('json')
    const organizationId = c.req.header('x-organization-id')
    const userId = c.req.header('x-user-id')

    if (!organizationId || !userId) {
      return c.json({
        success: false,
        error: 'Missing required headers: x-organization-id, x-user-id'
      }, 400)
    }

    const logger = createLogger(c.env, 'deploy-api')

    // Validate project exists
    const cosmosClient = createCosmosDBClient(c.env)
    const projectAdapter = createProjectAdapter(c.env, cosmosClient)
    const projectData = await projectAdapter.getProjectData(data.projectId)

    if (!projectData) {
      return c.json({
        success: false,
        error: 'Project not found'
      }, 404)
    }

    const params: DeploymentParams = {
      projectId: data.projectId,
      customDomain: data.customDomain,
      orgId: organizationId,
      userId: userId
    }

    const deploymentId = await scheduleDeployment(c.env, params, data.delaySeconds, data.config)

    return c.json({
      success: true,
      deploymentId,
      status: 'scheduled',
      scheduledFor: new Date(Date.now() + (data.delaySeconds * 1000)).toISOString(),
      message: 'Deployment has been scheduled'
    })

  } catch (error) {
    const logger = createLogger(c.env, 'deploy-api')
    logger.error('Failed to schedule deployment', {
      error: error instanceof Error ? error.message : String(error)
    })

    return c.json({
      success: false,
      error: 'Failed to schedule deployment'
    }, 500)
  }
})

// Urgent deployment endpoint (high priority)
app.post('/deploy/urgent', zValidator('json', deploymentSchema.omit({ config: true })), async (c) => {
  try {
    const data = c.req.valid('json')
    const organizationId = c.req.header('x-organization-id')
    const userId = c.req.header('x-user-id')

    if (!organizationId || !userId) {
      return c.json({
        success: false,
        error: 'Missing required headers: x-organization-id, x-user-id'
      }, 400)
    }

    // Validate project exists
    const cosmosClient = createCosmosDBClient(c.env)
    const projectAdapter = createProjectAdapter(c.env, cosmosClient)
    const projectData = await projectAdapter.getProjectData(data.projectId)

    if (!projectData) {
      return c.json({
        success: false,
        error: 'Project not found'
      }, 404)
    }

    const params: DeploymentParams = {
      projectId: data.projectId,
      customDomain: data.customDomain,
      orgId: organizationId,
      userId: userId
    }

    const deploymentId = await sendUrgentDeployment(c.env, params)

    return c.json({
      success: true,
      deploymentId,
      status: 'queued-urgent',
      priority: 10,
      message: 'Urgent deployment has been queued'
    })

  } catch (error) {
    const logger = createLogger(c.env, 'deploy-api')
    logger.error('Failed to queue urgent deployment', {
      error: error instanceof Error ? error.message : String(error)
    })

    return c.json({
      success: false,
      error: 'Failed to queue urgent deployment'
    }, 500)
  }
})

// Delete deployment endpoint
app.delete('/deployments/:deploymentId', async (c) => {
  try {
    const deploymentId = c.req.param('deploymentId')
    const organizationId = c.req.header('x-organization-id')
    const userId = c.req.header('x-user-id')

    if (!organizationId || !userId) {
      return c.json({
        success: false,
        error: 'Missing required headers: x-organization-id, x-user-id'
      }, 400)
    }

    const logger = createLogger(c.env, 'deploy-api')
    const cosmosClient = createCosmosDBClient(c.env)
    const stateManager = new DeploymentStateManager(c.env, cosmosClient)

    await cosmosClient.initialize()

    await stateManager.deleteDeployment(deploymentId, organizationId, userId)

    return c.json({
      success: true,
      message: 'Deployment deleted successfully'
    })

  } catch (error) {
    const logger = createLogger(c.env, 'deploy-api')
    logger.error('Failed to delete deployment', {
      error: error instanceof Error ? error.message : String(error),
      deploymentId: c.req.param('deploymentId')
    })

    return c.json({
      success: false,
      error: 'Failed to delete deployment'
    }, 500)
  }
})

// Process messages endpoint (for manual processing/testing)
app.post('/process', async (c) => {
  try {
    const maxMessages = parseInt(c.req.query('maxMessages') || '10')

    const result = await loggedOperation(
      createLogger(c.env, 'deploy-api'),
      'ProcessMessages',
      () => processMessages(c.env, maxMessages)
    )

    return c.json({
      success: true,
      batchResult: result
    })

  } catch (error) {
    const logger = createLogger(c.env, 'deploy-api')
    logger.error('Failed to process messages', {
      error: error instanceof Error ? error.message : String(error)
    })

    return c.json({
      success: false,
      error: 'Failed to process messages'
    }, 500)
  }
})

// Start queue consumer endpoint (for debugging)
app.post('/consumer/start', async (c) => {
  try {
    // This would typically be handled by the Container Apps scaling
    // but included for testing/debugging purposes
    const logger = createLogger(c.env, 'deploy-api')
    logger.info('Queue consumer start requested - this is handled by Container Apps scaling')

    return c.json({
      success: true,
      message: 'Queue consumer is handled by Azure Container Apps auto-scaling'
    })

  } catch (error) {
    return c.json({
      success: false,
      error: 'Failed to start consumer'
    }, 500)
  }
})

// OpenAPI documentation endpoint
app.get('/openapi', (c) => {
  return c.json({
    openapi: '3.0.0',
    info: {
      title: 'Agatta Deploy V3 API',
      version: '3.0.0',
      description: 'Azure-based deployment service for Agatta projects'
    },
    servers: [
      {
        url: c.req.url.replace(/\/openapi.*$/, ''),
        description: 'Current server'
      }
    ],
    paths: {
      '/health': {
        get: {
          summary: 'Health check',
          responses: {
            '200': {
              description: 'Service status',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      service: { type: 'string' },
                      status: { type: 'string' },
                      version: { type: 'string' },
                      timestamp: { type: 'string' }
                    }
                  }
                }
              }
            }
          }
        }
      },
      '/deploy': {
        post: {
          summary: 'Deploy a project',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['projectId'],
                  properties: {
                    projectId: { type: 'string' },
                    customDomain: { type: 'string' },
                    config: {
                      type: 'object',
                      properties: {
                        timeout: { type: 'number' },
                        debug: { type: 'boolean' },
                        priority: { type: 'number', minimum: 1, maximum: 10 }
                      }
                    }
                  }
                }
              }
            }
          },
          responses: {
            '200': {
              description: 'Deployment queued successfully',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: { type: 'boolean' },
                      deploymentId: { type: 'string' },
                      status: { type: 'string' }
                    }
                  }
                }
              }
            }
          }
        }
      },
      '/status/{deploymentId}': {
        get: {
          summary: 'Get deployment status',
          parameters: [
            {
              name: 'deploymentId',
              in: 'path',
              required: true,
              schema: { type: 'string' }
            }
          ],
          responses: {
            '200': {
              description: 'Deployment status',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: { type: 'boolean' },
                      deployment: {
                        type: 'object',
                        properties: {
                          id: { type: 'string' },
                          status: { type: 'string' },
                          progress: { type: 'number' },
                          stage: { type: 'string' }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  })
})

// Error handling middleware
app.onError((err, c) => {
  const logger = createLogger(c.env, 'deploy-api')
  logger.error('Unhandled error', {
    error: err.message,
    stack: err.stack,
    url: c.req.url,
    method: c.req.method
  })

  return c.json({
    success: false,
    error: 'Internal server error'
  }, 500)
})

// 404 handler
app.notFound((c) => {
  return c.json({
    success: false,
    error: 'Endpoint not found'
  }, 404)
})

export default app