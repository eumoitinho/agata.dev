/**
 * Azure Configuration and Authentication
 */

import { DefaultAzureCredential } from '@azure/identity'
import type { AzureConfig } from '../types'

// Initialize Azure credentials
export const azureCredential = new DefaultAzureCredential()

// Load Azure configuration from environment
export function loadAzureConfig(): AzureConfig {
  const requiredEnvVars = [
    'AZURE_SUBSCRIPTION_ID',
    'AZURE_RESOURCE_GROUP',
    'AZURE_CONTAINER_REGISTRY',
    'AZURE_SERVICE_BUS_CONNECTION_STRING',
    'AZURE_STORAGE_CONNECTION_STRING',
    'AZURE_COSMOS_CONNECTION_STRING',
    'AZURE_KEY_VAULT_URI'
  ]

  // Validate required environment variables
  for (const envVar of requiredEnvVars) {
    if (!process.env[envVar]) {
      throw new Error(`Missing required environment variable: ${envVar}`)
    }
  }

  return {
    subscriptionId: process.env.AZURE_SUBSCRIPTION_ID!,
    resourceGroup: process.env.AZURE_RESOURCE_GROUP!,
    location: process.env.AZURE_LOCATION || 'eastus',
    containerRegistry: process.env.AZURE_CONTAINER_REGISTRY!,
    serviceBusConnectionString: process.env.AZURE_SERVICE_BUS_CONNECTION_STRING!,
    storageConnectionString: process.env.AZURE_STORAGE_CONNECTION_STRING!,
    cosmosConnectionString: process.env.AZURE_COSMOS_CONNECTION_STRING!,
    keyVaultUri: process.env.AZURE_KEY_VAULT_URI!,
    appInsightsConnectionString: process.env.AZURE_APP_INSIGHTS_CONNECTION_STRING
  }
}

// Environment-specific configuration
export function getEnvironmentConfig(environment: string = 'development') {
  const configs = {
    development: {
      minReplicas: 0,
      maxReplicas: 2,
      cpu: '0.5',
      memory: '1Gi'
    },
    staging: {
      minReplicas: 1,
      maxReplicas: 5,
      cpu: '1',
      memory: '2Gi'
    },
    production: {
      minReplicas: 2,
      maxReplicas: 10,
      cpu: '2',
      memory: '4Gi'
    }
  }

  return configs[environment as keyof typeof configs] || configs.development
}

// Generate container app name
export function generateContainerAppName(projectId: string, environment: string = 'dev'): string {
  const prefix = process.env.AZURE_CONTAINER_APP_NAME_PREFIX || 'libra-app'
  const sanitized = projectId.toLowerCase().replace(/[^a-z0-9-]/g, '-').substring(0, 20)
  return `${prefix}-${sanitized}-${environment}`.substring(0, 60) // Azure limit is 64 chars
}

// Generate resource tags
export function generateResourceTags(params: {
  projectId: string
  userId: string
  organizationId: string
  environment?: string
}) {
  return {
    'libra-project-id': params.projectId,
    'libra-user-id': params.userId,
    'libra-org-id': params.organizationId,
    'libra-environment': params.environment || 'development',
    'libra-managed': 'true',
    'libra-version': '3.0.0',
    'created-at': new Date().toISOString()
  }
}