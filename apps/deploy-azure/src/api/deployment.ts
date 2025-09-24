/**
 * Deployment API Routes
 * Handles deployment requests and status queries
 */

import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import type { QueueProducer } from '../queue/producer'
import type { StateManager } from '../storage/state-manager'
import { createLogger } from '../utils/logger'
import type { DeploymentParams } from '../types'

const logger = createLogger()

// Validation schemas
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

export function deploymentRoutes(
  queueProducer: QueueProducer,
  stateManager: StateManager
) {
  const app = new Hono()

  /**
   * Queue a new deployment
   */
  app.post(
    '/',
    async (c) => {
      const body = await c.req.json()
      const validationResult = deploymentParamsSchema.safeParse(body)

      if (!validationResult.success) {
        return c.json({
          success: false,
          error: 'Validation error',
          details: validationResult.error.errors
        }, 400)
      }

      const params = validationResult.data as DeploymentParams

      try {
        logger.info('New deployment request', {
          projectId: params.projectId,
          organizationId: params.organizationId,
          environment: params.environment
        })

        // Queue the deployment
        const deploymentId = await queueProducer.queueDeployment(params)

        logger.info('Deployment queued successfully', {
          deploymentId,
          projectId: params.projectId
        })

        return c.json({
          success: true,
          deploymentId,
          status: 'queued',
          message: 'Deployment queued successfully',
          estimatedDuration: '5-10 minutes'
        })

      } catch (error) {
        logger.error('Failed to queue deployment', {
          error: error instanceof Error ? error.message : String(error),
          params
        })

        return c.json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
          message: 'Failed to queue deployment'
        }, 500)
      }
    }
  )

  /**
   * Get deployment status
   */
  app.get('/:deploymentId/status', async (c) => {
    const deploymentId = c.req.param('deploymentId')

    try {
      const state = await stateManager.getDeploymentState(deploymentId)

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
        containerAppUrl: state.metadata.containerAppUrl,
        customDomainUrl: state.metadata.customDomainUrl,
        error: state.error,
        steps: Object.entries(state.stepResults).map(([name, result]) => ({
          name,
          success: result.success,
          duration: result.duration,
          error: result.error
        }))
      })

    } catch (error) {
      logger.error('Failed to get deployment status', {
        deploymentId,
        error: error instanceof Error ? error.message : String(error)
      })

      return c.json({
        success: false,
        error: 'Failed to get deployment status'
      }, 500)
    }
  })

  /**
   * Get deployment logs
   */
  app.get('/:deploymentId/logs', async (c) => {
    const deploymentId = c.req.param('deploymentId')

    try {
      const state = await stateManager.getDeploymentState(deploymentId)

      if (!state) {
        return c.json({
          success: false,
          error: 'Deployment not found'
        }, 404)
      }

      // In production, this would fetch logs from Azure Blob Storage
      const logs = Object.entries(state.stepResults).map(([step, result]) => ({
        step,
        timestamp: state.startedAt,
        level: result.success ? 'info' : 'error',
        message: result.success
          ? `${step} completed successfully in ${result.duration}ms`
          : `${step} failed: ${result.error}`,
        data: result.data
      }))

      return c.json({
        success: true,
        deploymentId,
        logs
      })

    } catch (error) {
      logger.error('Failed to get deployment logs', {
        deploymentId,
        error: error instanceof Error ? error.message : String(error)
      })

      return c.json({
        success: false,
        error: 'Failed to get deployment logs'
      }, 500)
    }
  })

  /**
   * Cancel a deployment
   */
  app.post('/:deploymentId/cancel', async (c) => {
    const deploymentId = c.req.param('deploymentId')

    try {
      const state = await stateManager.getDeploymentState(deploymentId)

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
      await stateManager.updateDeploymentStatus(deploymentId, 'cancelled', {
        code: 'USER_CANCELLED',
        message: 'Deployment cancelled by user',
        timestamp: new Date().toISOString()
      })

      logger.info('Deployment cancelled', { deploymentId })

      return c.json({
        success: true,
        deploymentId,
        message: 'Deployment cancelled successfully'
      })

    } catch (error) {
      logger.error('Failed to cancel deployment', {
        deploymentId,
        error: error instanceof Error ? error.message : String(error)
      })

      return c.json({
        success: false,
        error: 'Failed to cancel deployment'
      }, 500)
    }
  })

  /**
   * Retry a failed deployment
   */
  app.post('/:deploymentId/retry', async (c) => {
    const deploymentId = c.req.param('deploymentId')

    try {
      const state = await stateManager.getDeploymentState(deploymentId)

      if (!state) {
        return c.json({
          success: false,
          error: 'Deployment not found'
        }, 404)
      }

      if (state.status !== 'failed') {
        return c.json({
          success: false,
          error: 'Can only retry failed deployments'
        }, 400)
      }

      // Create new deployment with same parameters
      const retryParams: DeploymentParams = {
        projectId: state.projectId,
        userId: '', // Would get from original state
        organizationId: '', // Would get from original state
        projectName: '', // Would get from original state
        environment: 'development' // Would get from original state
      }

      const newDeploymentId = await queueProducer.queueDeployment(retryParams)

      logger.info('Deployment retry queued', {
        originalDeploymentId: deploymentId,
        newDeploymentId
      })

      return c.json({
        success: true,
        originalDeploymentId: deploymentId,
        newDeploymentId,
        message: 'Retry deployment queued successfully'
      })

    } catch (error) {
      logger.error('Failed to retry deployment', {
        deploymentId,
        error: error instanceof Error ? error.message : String(error)
      })

      return c.json({
        success: false,
        error: 'Failed to retry deployment'
      }, 500)
    }
  })

  /**
   * List deployments for a project
   */
  app.get('/project/:projectId', async (c) => {
    const projectId = c.req.param('projectId')
    const limit = Number(c.req.query('limit') || 10)

    try {
      const deployments = await stateManager.listDeploymentsByProject(projectId, limit)

      return c.json({
        success: true,
        projectId,
        deployments: deployments.map(d => ({
          deploymentId: d.deploymentId,
          status: d.status,
          progress: d.progress,
          startedAt: d.startedAt,
          completedAt: d.completedAt,
          containerAppUrl: d.metadata.containerAppUrl,
          error: d.error
        }))
      })

    } catch (error) {
      logger.error('Failed to list deployments', {
        projectId,
        error: error instanceof Error ? error.message : String(error)
      })

      return c.json({
        success: false,
        error: 'Failed to list deployments'
      }, 500)
    }
  })

  return app
}