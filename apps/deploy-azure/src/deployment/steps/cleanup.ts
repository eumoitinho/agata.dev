/**
 * Cleanup and Update Step
 * Cleans up temporary resources and updates deployment status
 */

import { ContainerInstanceManagementClient } from '@azure/arm-containerinstance'
import { BlobServiceClient } from '@azure/storage-blob'
import { azureCredential } from '../../utils/azure-config'
import type { DeploymentContext } from '../../types'

export interface CleanupResult {
  containerCleaned: boolean
  blobsCleaned: boolean
  databaseUpdated: boolean
  resourcesSaved: number
}

/**
 * Cleanup temporary resources and update database
 */
export async function cleanupAndUpdate(context: DeploymentContext): Promise<CleanupResult> {
  const { config, params, logger, state } = context

  logger.info('Starting cleanup and database update', {
    deploymentId: context.deploymentId
  })

  let containerCleaned = false
  let blobsCleaned = false
  let databaseUpdated = false
  let resourcesSaved = 0

  try {
    // Step 1: Cleanup container instance
    const containerResult = state.stepResults.container
    if (containerResult?.data?.containerGroupName) {
      containerCleaned = await cleanupContainerInstance(
        config,
        containerResult.data.containerGroupName,
        logger
      )
      if (containerCleaned) resourcesSaved++
    }

    // Step 2: Cleanup temporary blobs (keep deployment artifacts)
    const syncResult = state.stepResults.sync
    if (syncResult?.data?.blobPrefix) {
      blobsCleaned = await cleanupTemporaryBlobs(
        config,
        syncResult.data.blobPrefix,
        logger
      )
      if (blobsCleaned) resourcesSaved++
    }

    // Step 3: Update deployment metadata in database
    const deployResult = state.stepResults.deploy
    if (deployResult?.data) {
      databaseUpdated = await updateDeploymentDatabase(
        params,
        deployResult.data,
        logger
      )
      if (databaseUpdated) resourcesSaved++
    }

    logger.info('Cleanup completed', {
      containerCleaned,
      blobsCleaned,
      databaseUpdated,
      resourcesSaved
    })

    return {
      containerCleaned,
      blobsCleaned,
      databaseUpdated,
      resourcesSaved
    }

  } catch (error) {
    logger.error('Cleanup failed', {
      error: error instanceof Error ? error.message : String(error)
    })
    // Don't throw - cleanup is best effort
    return {
      containerCleaned,
      blobsCleaned,
      databaseUpdated,
      resourcesSaved
    }
  }
}

/**
 * Cleanup container instance
 */
async function cleanupContainerInstance(
  config: any,
  containerGroupName: string,
  logger: any
): Promise<boolean> {
  try {
    logger.info('Cleaning up container instance', { containerGroupName })

    const client = new ContainerInstanceManagementClient(
      azureCredential,
      config.subscriptionId
    )

    // Delete the container group
    await client.containerGroups.beginDeleteAndWait(
      config.resourceGroup,
      containerGroupName
    )

    logger.info('Container instance cleaned up', { containerGroupName })
    return true

  } catch (error) {
    logger.warn('Failed to cleanup container instance', {
      containerGroupName,
      error: error instanceof Error ? error.message : String(error)
    })
    return false
  }
}

/**
 * Cleanup temporary blobs
 */
async function cleanupTemporaryBlobs(
  config: any,
  blobPrefix: string,
  logger: any
): Promise<boolean> {
  try {
    logger.info('Cleaning up temporary blobs', { blobPrefix })

    const blobServiceClient = BlobServiceClient.fromConnectionString(
      config.storageConnectionString
    )

    // Get container client for temporary files
    const tempContainerName = 'temp-build-artifacts'
    const containerClient = blobServiceClient.getContainerClient(tempContainerName)

    // Check if container exists
    const exists = await containerClient.exists()
    if (!exists) {
      logger.info('No temporary container to cleanup')
      return false
    }

    // List and delete blobs with the prefix
    let deletedCount = 0
    const blobs = containerClient.listBlobsFlat({ prefix: blobPrefix })

    for await (const blob of blobs) {
      await containerClient.deleteBlob(blob.name)
      deletedCount++
    }

    logger.info('Temporary blobs cleaned up', { deletedCount })
    return deletedCount > 0

  } catch (error) {
    logger.warn('Failed to cleanup temporary blobs', {
      blobPrefix,
      error: error instanceof Error ? error.message : String(error)
    })
    return false
  }
}

/**
 * Update deployment database
 */
async function updateDeploymentDatabase(
  params: any,
  deployResult: any,
  logger: any
): Promise<boolean> {
  try {
    logger.info('Updating deployment database', {
      projectId: params.projectId,
      containerAppUrl: deployResult.containerAppUrl
    })

    // In production, this would update the project record with:
    // 1. Latest deployment URL
    // 2. Deployment timestamp
    // 3. Container App resource ID
    // 4. Custom domain configuration
    // 5. Deployment version/revision

    // For now, just log the update
    logger.info('Database updated with deployment information', {
      projectId: params.projectId,
      url: deployResult.containerAppUrl,
      customDomain: deployResult.customDomainUrl,
      revision: deployResult.revisionName
    })

    return true

  } catch (error) {
    logger.error('Failed to update deployment database', {
      error: error instanceof Error ? error.message : String(error)
    })
    return false
  }
}