/*
 * SPDX-License-Identifier: AGPL-3.0-only
 * tests/setup.ts - Test Environment Setup
 * Copyright (C) 2025 Nextify Limited
 */

import { beforeEach, afterEach, vi } from 'vitest'
import type { AzureBindings } from '../src/types'

// Mock environment for testing
export const mockEnv: AzureBindings = {
  // Azure Service Bus (mocked)
  AZURE_SERVICE_BUS_CONNECTION_STRING: 'Endpoint=sb://test.servicebus.windows.net/;SharedAccessKeyName=test;SharedAccessKey=testkey',
  DEPLOYMENT_QUEUE_NAME: 'test-deployment-queue',

  // Azure Cosmos DB (mocked)
  AZURE_COSMOS_DB_CONNECTION_STRING: 'AccountEndpoint=https://test.documents.azure.com:443/;AccountKey=testkey',
  COSMOS_DATABASE_NAME: 'test-agatta-deploy-v3',
  COSMOS_CONTAINER_NAME: 'test-deployments',

  // Azure Blob Storage (mocked)
  AZURE_STORAGE_CONNECTION_STRING: 'DefaultEndpointsProtocol=https;AccountName=test;AccountKey=testkey;EndpointSuffix=core.windows.net',

  // Azure Configuration
  AZURE_SUBSCRIPTION_ID: '12345678-1234-1234-1234-123456789012',
  AZURE_RESOURCE_GROUP: 'test-agatta-rg',
  AZURE_REGION: 'eastus2',
  AZURE_TENANT_ID: '87654321-4321-4321-4321-210987654321',

  // Database (mocked)
  DATABASE_URL: 'postgresql://test:test@localhost:5432/test_agatta',
  DIRECT_URL: 'postgresql://test:test@localhost:5432/test_agatta',

  // Application Configuration
  DEPLOYMENT_ENVIRONMENT: 'test',
  LOG_LEVEL: 'debug',

  // Queue Configuration
  ENABLE_QUEUE_CONSUMER: false,
  QUEUE_CONSUMER_CONCURRENCY: 2,

  // Cloudflare (mocked)
  CLOUDFLARE_API_TOKEN: 'test-cloudflare-token',
  CLOUDFLARE_ACCOUNT_ID: 'test-cloudflare-account',

  // Optional
  WEBHOOK_URL: undefined,
  SLACK_WEBHOOK_URL: undefined
}

// Mock Azure SDK clients
export const mockAzureClients = {
  serviceBus: {
    sendMessage: vi.fn(),
    sendBatch: vi.fn(),
    receiveMessages: vi.fn().mockResolvedValue([]),
    completeMessage: vi.fn(),
    abandonMessage: vi.fn(),
    deadLetterMessage: vi.fn(),
    close: vi.fn()
  },
  cosmosDb: {
    createDeployment: vi.fn(),
    getDeployment: vi.fn(),
    updateDeployment: vi.fn(),
    updateDeploymentStatus: vi.fn(),
    listDeployments: vi.fn().mockResolvedValue({ deployments: [], continuationToken: undefined }),
    deleteDeployment: vi.fn(),
    initialize: vi.fn()
  },
  blobStorage: {
    initialize: vi.fn(),
    uploadLogs: vi.fn().mockResolvedValue('https://test.blob.core.windows.net/logs/test.log'),
    uploadArtifacts: vi.fn().mockResolvedValue('https://test.blob.core.windows.net/artifacts/test.zip'),
    uploadSourceFiles: vi.fn().mockResolvedValue('https://test.blob.core.windows.net/source/test.zip'),
    uploadBuildOutput: vi.fn().mockResolvedValue('https://test.blob.core.windows.net/build/test.log'),
    downloadLogs: vi.fn().mockResolvedValue('Mock log content'),
    listDeploymentFiles: vi.fn().mockResolvedValue([]),
    deleteDeploymentFiles: vi.fn()
  }
}

// Mock database
export const mockDb = {
  select: vi.fn().mockReturnThis(),
  from: vi.fn().mockReturnThis(),
  where: vi.fn().mockReturnThis(),
  update: vi.fn().mockReturnThis(),
  set: vi.fn().mockReturnThis(),
  then: vi.fn().mockResolvedValue([{
    id: 'test-project-123',
    name: 'Test Project',
    template: 'vite-react',
    organizationId: 'test-org-123',
    userId: 'test-user-123',
    deploymentStatus: 'idle'
  }])
}

// Global test setup
beforeEach(() => {
  // Reset all mocks
  vi.clearAllMocks()

  // Mock Azure SDK modules
  vi.mock('@azure/service-bus', () => ({
    ServiceBusClient: {
      createFromConnectionString: vi.fn().mockReturnValue({
        createSender: vi.fn().mockReturnValue(mockAzureClients.serviceBus),
        createReceiver: vi.fn().mockReturnValue(mockAzureClients.serviceBus),
        close: mockAzureClients.serviceBus.close
      })
    }
  }))

  vi.mock('@azure/cosmos', () => ({
    CosmosClient: vi.fn().mockImplementation(() => ({
      database: vi.fn().mockReturnValue({
        container: vi.fn().mockReturnValue(mockAzureClients.cosmosDb)
      })
    }))
  }))

  vi.mock('@azure/storage-blob', () => ({
    BlobServiceClient: {
      fromConnectionString: vi.fn().mockReturnValue({
        getContainerClient: vi.fn().mockReturnValue(mockAzureClients.blobStorage)
      })
    }
  }))

  // Mock database
  vi.mock('@agatta/db', () => ({
    project: { id: 'id', name: 'name', template: 'template' },
    getDbForHono: vi.fn().mockReturnValue(mockDb),
    eq: vi.fn()
  }))
})

afterEach(() => {
  vi.restoreAllMocks()
})

// Test utilities
export function createMockDeploymentMessage(overrides: Partial<any> = {}) {
  return {
    metadata: {
      deploymentId: 'deploy_test_123',
      createdAt: new Date().toISOString(),
      userId: 'test-user-123',
      organizationId: 'test-org-123',
      version: '3.0',
      priority: 5,
      retryCount: 0,
      ...overrides.metadata
    },
    params: {
      projectId: 'test-project-123',
      customDomain: 'test.example.com',
      orgId: 'test-org-123',
      userId: 'test-user-123',
      ...overrides.params
    },
    config: {
      timeout: 600000,
      skipSteps: [],
      debug: false,
      ...overrides.config
    }
  }
}

export function createMockDeploymentState(overrides: Partial<any> = {}) {
  return {
    id: 'deploy_test_123',
    status: 'pending',
    progress: 0,
    stage: 'Initializing deployment',
    startedAt: new Date().toISOString(),
    stepResults: {},
    config: {
      projectId: 'test-project-123',
      workerName: 'test-project-deploy_test_123',
      customDomain: 'test.example.com',
      template: 'vite-react',
      timeout: 600000
    },
    metadata: {
      userId: 'test-user-123',
      organizationId: 'test-org-123',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      version: '3.0'
    },
    ...overrides
  }
}