/**
 * Deploy to Azure Container Apps
 * Final deployment step that creates or updates the Container App
 */

import { ContainerAppsAPIClient } from '@azure/arm-appcontainers'
import { azureCredential } from '../../utils/azure-config'
import type { DeploymentContext } from '../../types'

export interface DeployResult {
  containerAppUrl: string
  customDomainUrl?: string
  resourceId: string
  revisionName: string
  fqdn: string
}

/**
 * Deploy the built Docker image to Azure Container Apps
 */
export async function deployToContainerApps(context: DeploymentContext): Promise<DeployResult> {
  const { config, params, logger, state } = context

  // Get build results from previous step
  const buildResult = state.stepResults.build
  if (!buildResult?.data?.imageTag) {
    throw new Error('Docker image tag not found from build step')
  }

  const imageTag = buildResult.data.imageTag
  const registryUrl = `${config.containerRegistry}.azurecr.io`
  const fullImageUrl = `${registryUrl}/${imageTag}`

  logger.info('Starting deployment to Azure Container Apps', {
    image: fullImageUrl,
    environment: params.environment || 'development'
  })

  try {
    // Initialize Container Apps client
    const client = new ContainerAppsAPIClient(
      azureCredential,
      config.subscriptionId
    )

    // Generate container app name
    const { generateContainerAppName, getEnvironmentConfig } = await import('../../utils/azure-config')
    const appName = generateContainerAppName(params.projectId, params.environment)
    const envConfig = getEnvironmentConfig(params.environment)

    // Check if container app already exists
    let containerApp
    try {
      containerApp = await client.containerApps.get(
        config.resourceGroup,
        appName
      )
      logger.info('Existing Container App found, updating...', { appName })
    } catch (error) {
      logger.info('Container App not found, creating new...', { appName })
    }

    // Prepare container app configuration
    const containerAppConfig = {
      location: config.location,
      managedEnvironmentId: `/subscriptions/${config.subscriptionId}/resourceGroups/${config.resourceGroup}/providers/Microsoft.App/managedEnvironments/${process.env.AZURE_CONTAINER_APP_ENV || 'libra-environment'}`,
      configuration: {
        ingress: {
          external: true,
          targetPort: params.containerSize?.cpu ? 8080 : 3000,
          transport: 'auto' as const,
          allowInsecure: false,
          traffic: [
            {
              weight: 100,
              latestRevision: true
            }
          ],
          ...(params.customDomain && {
            customDomains: [
              {
                name: params.customDomain,
                bindingType: 'SniEnabled' as const
              }
            ]
          })
        },
        registries: [
          {
            server: registryUrl,
            username: process.env.AZURE_REGISTRY_USERNAME,
            passwordSecretRef: 'registry-password'
          }
        ],
        secrets: [
          {
            name: 'registry-password',
            value: process.env.AZURE_REGISTRY_PASSWORD
          },
          ...(params.envVariables
            ? Object.entries(params.envVariables).map(([key, value]) => ({
                name: key.toLowerCase().replace(/_/g, '-'),
                value
              }))
            : [])
        ]
      },
      template: {
        containers: [
          {
            image: fullImageUrl,
            name: 'app',
            resources: {
              cpu: parseFloat(params.containerSize?.cpu || envConfig.cpu),
              memory: params.containerSize?.memory || envConfig.memory
            },
            env: [
              {
                name: 'PORT',
                value: params.containerSize?.cpu ? '8080' : '3000'
              },
              {
                name: 'NODE_ENV',
                value: params.environment || 'production'
              },
              {
                name: 'PROJECT_ID',
                value: params.projectId
              },
              ...(params.envVariables
                ? Object.entries(params.envVariables).map(([key, value]) => ({
                    name: key,
                    secretRef: key.toLowerCase().replace(/_/g, '-')
                  }))
                : [])
            ],
            ...(params.startCommand && {
              command: params.startCommand.split(' ')
            })
          }
        ],
        scale: {
          minReplicas: envConfig.minReplicas,
          maxReplicas: envConfig.maxReplicas,
          rules: [
            {
              name: 'http-scaling',
              http: {
                metadata: {
                  concurrentRequests: '100'
                }
              }
            }
          ]
        }
      },
      identity: {
        type: 'SystemAssigned' as const
      }
    }

    // Create or update container app
    let deployedApp
    if (containerApp) {
      // Update existing app
      deployedApp = await client.containerApps.beginUpdateAndWait(
        config.resourceGroup,
        appName,
        containerAppConfig
      )
    } else {
      // Create new app
      deployedApp = await client.containerApps.beginCreateOrUpdateAndWait(
        config.resourceGroup,
        appName,
        containerAppConfig
      )
    }

    // Extract deployment information
    const fqdn = deployedApp.configuration?.ingress?.fqdn || ''
    const containerAppUrl = `https://${fqdn}`
    const customDomainUrl = params.customDomain ? `https://${params.customDomain}` : undefined

    logger.info('Container App deployment successful', {
      appName,
      url: containerAppUrl,
      customDomain: customDomainUrl,
      revision: deployedApp.latestRevisionName
    })

    // Configure custom domain DNS if provided
    if (params.customDomain && !containerApp) {
      await configureCustomDomain(params.customDomain, fqdn, logger)
    }

    return {
      containerAppUrl,
      customDomainUrl,
      resourceId: deployedApp.id!,
      revisionName: deployedApp.latestRevisionName!,
      fqdn
    }

  } catch (error) {
    logger.error('Failed to deploy to Container Apps', {
      error: error instanceof Error ? error.message : String(error)
    })
    throw new Error(`Container Apps deployment failed: ${error instanceof Error ? error.message : String(error)}`)
  }
}

/**
 * Configure custom domain DNS settings
 */
async function configureCustomDomain(
  customDomain: string,
  targetFqdn: string,
  logger: any
): Promise<void> {
  try {
    logger.info('Configuring custom domain', {
      customDomain,
      target: targetFqdn
    })

    // In production, this would:
    // 1. Create/update DNS CNAME record pointing to Container App FQDN
    // 2. Configure SSL certificate (managed or custom)
    // 3. Validate domain ownership

    // For now, just log the required DNS configuration
    logger.info('Custom domain configuration required', {
      action: 'Create CNAME record',
      name: customDomain,
      value: targetFqdn,
      ttl: 3600
    })

  } catch (error) {
    logger.warn('Failed to configure custom domain', {
      customDomain,
      error: error instanceof Error ? error.message : String(error)
    })
    // Don't fail deployment if custom domain config fails
  }
}