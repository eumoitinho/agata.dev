/**
 * Vercel API Route - Queue deployment
 * POST /api/deploy - Queue new deployment
 */

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { z } from 'zod'
import { QueueProducer } from '../../src/queue/producer'
import { loadAzureConfig } from '../../src/utils/azure-config'
import { createLogger } from '../../src/utils/logger'
import type { DeploymentParams } from '../../src/types'

const logger = createLogger()

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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    // Validate input
    const validationResult = deploymentParamsSchema.safeParse(req.body)

    if (!validationResult.success) {
      return res.status(400).json({
        success: false,
        error: 'Validation error',
        details: validationResult.error.errors
      })
    }

    const params = validationResult.data as DeploymentParams

    logger.info('New deployment request', {
      projectId: params.projectId,
      organizationId: params.organizationId,
      environment: params.environment
    })

    // Initialize Azure services
    const config = loadAzureConfig()

    const queueProducer = new QueueProducer(
      config.serviceBusConnectionString,
      process.env.AZURE_SERVICE_BUS_QUEUE_NAME || 'deployment-queue'
    )

    // Queue the deployment
    const deploymentId = await queueProducer.queueDeployment(params)

    logger.info('Deployment queued successfully', {
      deploymentId,
      projectId: params.projectId
    })

    return res.json({
      success: true,
      deploymentId,
      status: 'queued',
      message: 'Deployment queued successfully',
      estimatedDuration: '5-10 minutes'
    })

  } catch (error) {
    logger.error('Failed to queue deployment', {
      error: error instanceof Error ? error.message : String(error),
      body: req.body
    })

    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      message: 'Failed to queue deployment'
    })
  }
}