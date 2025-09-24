/**
 * Vercel API Route - Get deployment status
 * GET /api/deploy/[deploymentId]/status - Get deployment status
 */

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { StateManager } from '../../../src/storage/state-manager'
import { loadAzureConfig } from '../../../src/utils/azure-config'
import { createLogger } from '../../../src/utils/logger'

const logger = createLogger()

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { deploymentId } = req.query

  if (!deploymentId || typeof deploymentId !== 'string') {
    return res.status(400).json({
      success: false,
      error: 'Deployment ID is required'
    })
  }

  try {
    // Initialize Azure services
    const config = loadAzureConfig()

    const stateManager = new StateManager(
      config.cosmosConnectionString,
      process.env.AZURE_COSMOS_DATABASE || 'deployments',
      process.env.AZURE_COSMOS_CONTAINER || 'deployments'
    )

    const state = await stateManager.getDeploymentState(deploymentId)

    if (!state) {
      return res.status(404).json({
        success: false,
        error: 'Deployment not found'
      })
    }

    return res.json({
      success: true,
      deploymentId,
      status: state.status,
      progress: state.progress,
      startedAt: state.startedAt,
      completedAt: state.completedAt,
      containerAppUrl: state.metadata?.containerAppUrl,
      customDomainUrl: state.metadata?.customDomainUrl,
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

    return res.status(500).json({
      success: false,
      error: 'Failed to get deployment status'
    })
  }
}