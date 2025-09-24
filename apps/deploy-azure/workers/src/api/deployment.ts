/**
 * Cloudflare Workers - Deployment API Routes
 * Interfaces with Azure services for deployment management
 */

import { Hono } from 'hono'
import { z } from 'zod'
import type { Env } from '../index'
import { AzureServiceBusClient } from '../lib/azure/service-bus'
import { AzureCosmosClient } from '../lib/azure/cosmos'

const app = new Hono<{ Bindings: Env }>()

// Validation schema
const deploymentParamsSchema = z.object({
  projectId: z.string().min(1, 'Project ID is required'),
  userId: z.string().min(1, 'User ID is required'),
  organizationId: z.string().min(1, 'Organization ID is required'),
  projectName: z.string().min(1, 'Project name is required'),
  templateType: z.string().optional(),
  branch: z.string().default('main'),
  commitSha: z.string().optional(),
  environment: z.enum(['development', 'staging', 'production']).default('development'),
  customDomain: z.string().optional(),
  envVariables: z.record(z.string(), z.string()).optional(),
  buildCommand: z.string().optional(),
  startCommand: z.string().optional(),
  containerSize: z.object({
    cpu: z.string(),
    memory: z.string()
  }).optional()
})

/**
 * Queue a new deployment
 */
app.post('/', async (c) => {
  try {
    const body = await c.req.json()
    const validationResult = deploymentParamsSchema.safeParse(body)

    if (!validationResult.success) {
      return c.json({
        success: false,
        error: 'Validation error',
        details: validationResult.error.errors
      }, 400)
    }

    const params = validationResult.data

    console.log('New deployment request:', {
      projectId: params.projectId,
      organizationId: params.organizationId,
      environment: params.environment,
      datacenter: (c.req.raw.cf as any)?.colo
    })

    // Initialize Azure Service Bus client
    const serviceBus = new AzureServiceBusClient(
      c.env.AZURE_SERVICE_BUS_CONNECTION_STRING
    )

    // Generate deployment ID
    const deploymentId = crypto.randomUUID()

    // Initialize deployment state in Cosmos DB
    const cosmos = new AzureCosmosClient(
      c.env.AZURE_COSMOS_CONNECTION_STRING,
      'deployments',
      'deployments'
    )

    const initialState = {
      id: deploymentId,
      deploymentId,
      projectId: params.projectId,
      status: 'queued' as const,
      progress: 0,
      startedAt: new Date().toISOString(),
      stepResults: {},
      metadata: {
        version: '3.0.0',
        architecture: 'hybrid',
        requestDatacenter: (c.req.raw.cf as any)?.colo,
        requestCountry: (c.req.raw.cf as any)?.country
      },
      partitionKey: params.organizationId
    }

    await cosmos.createItem(initialState)

    // Queue deployment message
    const queueMessage = {
      deploymentId,
      params,
      timestamp: new Date().toISOString(),
      requestId: crypto.randomUUID()
    }

    await serviceBus.sendMessage('deployment-queue', queueMessage)

    console.log('Deployment queued successfully:', {
      deploymentId,
      projectId: params.projectId
    })

    return c.json({
      success: true,
      deploymentId,
      status: 'queued',
      message: 'Deployment queued successfully',
      estimatedDuration: '5-10 minutes',
      architecture: 'Cloudflare Workers + Azure Backend',
      requestInfo: {
        datacenter: (c.req.raw.cf as any)?.colo,
        country: (c.req.raw.cf as any)?.country,
        city: (c.req.raw.cf as any)?.city
      }
    })

  } catch (error) {
    console.error('Failed to queue deployment:', error)

    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      message: 'Failed to queue deployment'
    }, 500)
  }
})

/**
 * Get deployment status
 */
app.get('/:deploymentId/status', async (c) => {
  const deploymentId = c.req.param('deploymentId')

  try {
    const cosmos = new AzureCosmosClient(
      c.env.AZURE_COSMOS_CONNECTION_STRING,
      'deployments',
      'deployments'
    )

    const state = await cosmos.getItem(deploymentId)

    if (!state) {
      return c.json({
        success: false,
        error: 'Deployment not found'
      }, 404)
    }

    return c.json({
      success: true,
      deploymentId,
      status: state.status,
      progress: state.progress,
      startedAt: state.startedAt,
      completedAt: state.completedAt,
      containerAppUrl: state.metadata?.containerAppUrl,
      customDomainUrl: state.metadata?.customDomainUrl,
      error: state.error,
      steps: Object.entries(state.stepResults || {}).map(([name, result]: [string, any]) => ({
        name,
        success: result.success,
        duration: result.duration,
        error: result.error
      })),
      requestInfo: {
        datacenter: (c.req.raw.cf as any)?.colo,
        responseTime: '< 50ms'
      }
    })

  } catch (error) {
    console.error('Failed to get deployment status:', error)

    return c.json({
      success: false,
      error: 'Failed to get deployment status'
    }, 500)
  }
})

/**
 * Cancel a deployment
 */
app.post('/:deploymentId/cancel', async (c) => {
  const deploymentId = c.req.param('deploymentId')

  try {
    const cosmos = new AzureCosmosClient(
      c.env.AZURE_COSMOS_CONNECTION_STRING,
      'deployments',
      'deployments'
    )

    const state = await cosmos.getItem(deploymentId)

    if (!state) {
      return c.json({
        success: false,
        error: 'Deployment not found'
      }, 404)
    }

    if (state.status === 'completed' || state.status === 'failed') {
      return c.json({
        success: false,
        error: 'Cannot cancel completed or failed deployment'
      }, 400)
    }

    // Update status to cancelled
    const updatedState = {
      ...state,
      status: 'cancelled',
      completedAt: new Date().toISOString(),
      error: {
        code: 'USER_CANCELLED',
        message: 'Deployment cancelled by user',
        timestamp: new Date().toISOString()
      }
    }

    await cosmos.updateItem(deploymentId, updatedState)

    console.log('Deployment cancelled:', deploymentId)

    return c.json({
      success: true,
      deploymentId,
      message: 'Deployment cancelled successfully'
    })

  } catch (error) {
    console.error('Failed to cancel deployment:', error)

    return c.json({
      success: false,
      error: 'Failed to cancel deployment'
    }, 500)
  }
})

export { app as deploymentRoutes }