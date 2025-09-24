/**
 * Create Azure Container Instance Step
 * Provisions a container instance for building the project
 */

import { ContainerInstanceManagementClient } from '@azure/arm-containerinstance'
import { azureCredential } from '../../utils/azure-config'
import type { DeploymentContext } from '../../types'

export interface ContainerResult {
  containerId: string
  containerGroupName: string
  ipAddress: string
  fqdn?: string
  state: string
}

/**
 * Create Azure Container Instance for build environment
 */
export async function createContainerInstance(context: DeploymentContext): Promise<ContainerResult> {
  const { config, params, logger } = context

  logger.info('Creating Azure Container Instance', {
    projectId: params.projectId,
    resourceGroup: config.resourceGroup
  })

  try {
    // Initialize Container Instance client
    const client = new ContainerInstanceManagementClient(
      azureCredential,
      config.subscriptionId
    )

    // Generate container group name
    const containerGroupName = `build-${params.projectId}-${Date.now()}`
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .substring(0, 63)

    // Container configuration
    const containerGroup = {
      location: config.location,
      containers: [
        {
          name: 'build-container',
          image: 'mcr.microsoft.com/azure-cli:latest', // Base image with Azure CLI and Docker
          resources: {
            requests: {
              cpu: parseFloat(process.env.BUILD_CONTAINER_CPU || '2'),
              memoryInGB: parseFloat(process.env.BUILD_CONTAINER_MEMORY || '4')
            }
          },
          environmentVariables: [
            { name: 'PROJECT_ID', value: params.projectId },
            { name: 'DEPLOYMENT_ID', value: context.deploymentId },
            { name: 'NODE_ENV', value: params.environment || 'production' }
          ],
          command: ['/bin/bash', '-c', 'tail -f /dev/null'] // Keep container running
        }
      ],
      osType: 'Linux' as const,
      restartPolicy: 'Never' as const,
      ipAddress: {
        type: 'Public' as const,
        ports: [
          {
            protocol: 'TCP' as const,
            port: 22 // SSH port for file transfer
          }
        ],
        dnsNameLabel: containerGroupName
      },
      identity: {
        type: 'SystemAssigned' as const
      }
    }

    logger.info('Creating container group', { name: containerGroupName })

    // Create the container group
    const operation = await client.containerGroups.beginCreateOrUpdate(
      config.resourceGroup,
      containerGroupName,
      containerGroup
    )

    // Wait for creation to complete
    const createdGroup = await operation.pollUntilDone()

    // Get container details
    const ipAddress = createdGroup.ipAddress?.ip || ''
    const fqdn = createdGroup.ipAddress?.fqdn
    const state = createdGroup.containers?.[0]?.instanceView?.currentState?.state || 'Unknown'

    logger.info('Container instance created successfully', {
      containerGroupName,
      ipAddress,
      fqdn,
      state
    })

    // Wait for container to be running
    await waitForContainerReady(client, config.resourceGroup, containerGroupName, logger)

    return {
      containerId: createdGroup.id!,
      containerGroupName,
      ipAddress,
      fqdn,
      state: 'Running'
    }

  } catch (error) {
    logger.error('Failed to create container instance', {
      error: error instanceof Error ? error.message : String(error)
    })
    throw new Error(`Container instance creation failed: ${error instanceof Error ? error.message : String(error)}`)
  }
}

/**
 * Wait for container to be in running state
 */
async function waitForContainerReady(
  client: ContainerInstanceManagementClient,
  resourceGroup: string,
  containerGroupName: string,
  logger: any
): Promise<void> {
  const maxAttempts = 30
  const delayMs = 5000

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const group = await client.containerGroups.get(resourceGroup, containerGroupName)
      const state = group.containers?.[0]?.instanceView?.currentState?.state

      if (state === 'Running') {
        logger.info('Container is ready', { containerGroupName })
        return
      }

      if (state === 'Terminated' || state === 'Failed') {
        throw new Error(`Container entered ${state} state`)
      }

      logger.info(`Waiting for container to be ready (${attempt + 1}/${maxAttempts})`, {
        currentState: state
      })

      await new Promise(resolve => setTimeout(resolve, delayMs))

    } catch (error) {
      if (attempt === maxAttempts - 1) {
        throw new Error(`Container failed to become ready: ${error instanceof Error ? error.message : String(error)}`)
      }
    }
  }

  throw new Error('Container failed to become ready within timeout period')
}