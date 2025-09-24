/**
 * Vercel API Route - Health check
 * GET /api/health - Health check endpoint
 */

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { StateManager } from '../src/storage/state-manager'
import { loadAzureConfig } from '../src/utils/azure-config'
import { createLogger } from '../src/utils/logger'

const logger = createLogger()

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const startTime = Date.now()

  try {
    // Test Azure services connectivity
    const config = loadAzureConfig()

    const stateManager = new StateManager(
      config.cosmosConnectionString,
      process.env.AZURE_COSMOS_DATABASE || 'deployments',
      process.env.AZURE_COSMOS_CONTAINER || 'deployments'
    )

    // Try to perform a simple query to test connectivity
    const stats = await stateManager.getDeploymentStats('health-check')

    const responseTime = Date.now() - startTime

    return res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      responseTime: `${responseTime}ms`,
      platform: 'Vercel',
      region: process.env.VERCEL_REGION || 'unknown',
      services: {
        cosmosDb: 'connected',
        serviceBus: 'not-tested',
        storage: 'not-tested'
      },
      environment: {
        nodeEnv: process.env.NODE_ENV,
        port: process.env.PORT || '3000',
        azureRegion: process.env.AZURE_LOCATION
      }
    })

  } catch (error) {
    logger.error('Health check failed', {
      error: error instanceof Error ? error.message : String(error)
    })

    const responseTime = Date.now() - startTime

    return res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      responseTime: `${responseTime}ms`,
      error: error instanceof Error ? error.message : 'Unknown error',
      platform: 'Vercel',
      region: process.env.VERCEL_REGION || 'unknown'
    })
  }
}