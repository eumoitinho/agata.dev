/*
 * SPDX-License-Identifier: AGPL-3.0-only
 * app.ts
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
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 *
 */

import { Scalar } from '@scalar/hono-api-reference'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import type { Bindings, Variables } from './types'

// Create main Hono app instance
const app = new Hono<{ Bindings: Bindings; Variables: Variables }>()

// Error handler
app.onError((err, c) => {
  console.error('[Deploy Workflow] Error:', err)
  return c.json({
    error: 'Internal Server Error',
    message: err.message,
    timestamp: new Date().toISOString()
  }, 500)
})

// Apply global middleware
app.use('*', async (c, next) => {
  const requestId = crypto.randomUUID()
  c.set('requestId', requestId)
  console.log(`[${requestId}] ${c.req.method} ${c.req.url}`)
  await next()
})

app.use('*', cors())

// Root endpoint
app.get('/', async (c) => {
  return c.json({
    message: 'Agatta Deploy Workflow Service (V1)',
    description: 'Cloudflare Workflows-based deployment service',
    endpoints: [
      '/',
      '/health',
      '/api/deploy',
      '/api/deploy/:workflowId/status',
      '/docs',
      '/openapi.json'
    ],
    timestamp: new Date().toISOString(),
    service: 'Agatta Deploy Workflow Service',
    version: '1.0.0',
    features: [
      'Cloudflare Workflows orchestration',
      'Multi-step deployment pipeline',
      'Sandbox build environments',
      'Quota management',
      'Error handling with retries'
    ]
  })
})

// Health check endpoint
app.get('/health', async (c) => {
  return c.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'deploy-workflow',
    version: '1.0.0',
    uptime: process.uptime?.() || 'unknown',
    environment: c.env?.ENVIRONMENT || 'unknown'
  })
})

// Deploy workflow endpoint
app.post('/api/deploy', async (c) => {
  try {
    const body = await c.req.json()
    const { projectId, orgId, userId, customDomain } = body

    // Validate required fields
    if (!projectId || !orgId || !userId) {
      return c.json({
        error: 'Missing required fields',
        message: 'projectId, orgId, and userId are required',
        timestamp: new Date().toISOString()
      }, 400)
    }

    // Trigger workflow
    const workflow = await c.env.DEPLOY_WORKFLOW?.create({
      projectId,
      orgId,
      userId,
      customDomain
    })

    if (!workflow) {
      return c.json({
        error: 'Workflow creation failed',
        message: 'Could not create deployment workflow',
        timestamp: new Date().toISOString()
      }, 500)
    }

    return c.json({
      message: 'Deployment workflow created successfully',
      workflowId: workflow.id,
      projectId,
      status: 'queued',
      timestamp: new Date().toISOString(),
      statusUrl: `/api/deploy/${workflow.id}/status`
    })
  } catch (error: any) {
    console.error('[Deploy] Error creating workflow:', error)
    return c.json({
      error: 'Deployment failed',
      message: error.message || 'Unknown error occurred',
      timestamp: new Date().toISOString()
    }, 500)
  }
})

// Get workflow status
app.get('/api/deploy/:workflowId/status', async (c) => {
  try {
    const workflowId = c.req.param('workflowId')

    // In a real implementation, you would get the workflow instance
    // For now, return a mock status
    return c.json({
      workflowId,
      status: 'running',
      progress: {
        currentStep: 'build-project',
        completedSteps: ['validate-and-prepare', 'create-sandbox', 'sync-files'],
        totalSteps: 6
      },
      timestamp: new Date().toISOString(),
      estimatedCompletion: new Date(Date.now() + 300000).toISOString() // 5 minutes from now
    })
  } catch (error: any) {
    return c.json({
      error: 'Status check failed',
      message: error.message,
      timestamp: new Date().toISOString()
    }, 500)
  }
})

// OpenAPI specification endpoint
app.get('/openapi.json', async (c) => {
  const openApiSpec = {
    openapi: '3.0.0',
    info: {
      title: 'Agatta Deploy Workflow API',
      version: '1.0.0',
      description: 'Cloudflare Workflows-based deployment service for the Agatta platform'
    },
    servers: [
      {
        url: 'https://agatta-deploy-workflow.agatta.workers.dev',
        description: 'Production server'
      }
    ],
    paths: {
      '/health': {
        get: {
          summary: 'Health check',
          responses: {
            '200': {
              description: 'Service is healthy',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      status: { type: 'string' },
                      timestamp: { type: 'string' },
                      service: { type: 'string' }
                    }
                  }
                }
              }
            }
          }
        }
      },
      '/api/deploy': {
        post: {
          summary: 'Create deployment workflow',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['projectId', 'orgId', 'userId'],
                  properties: {
                    projectId: { type: 'string' },
                    orgId: { type: 'string' },
                    userId: { type: 'string' },
                    customDomain: { type: 'string' }
                  }
                }
              }
            }
          },
          responses: {
            '200': {
              description: 'Workflow created successfully',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      message: { type: 'string' },
                      workflowId: { type: 'string' },
                      projectId: { type: 'string' },
                      status: { type: 'string' },
                      timestamp: { type: 'string' }
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

  return c.json(openApiSpec)
})

// Add Scalar API documentation route
app.get(
  '/docs',
  Scalar({
    url: '/openapi.json',
    theme: 'default',
    pageTitle: 'Agatta Deploy Workflow API Documentation',
    customCss: `
      .light-mode {
        --scalar-color-accent: #0099ff;
      }
      .dark-mode {
        --scalar-color-accent: #e36002;
      }
    `,
  })
)

export default app
