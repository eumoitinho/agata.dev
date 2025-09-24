/*
 * SPDX-License-Identifier: AGPL-3.0-only
 * errors.ts - Azure Deploy V3 Error Handling
 * Copyright (C) 2025 Nextify Limited
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 */

/**
 * Error codes for Agatta Deploy V3 service (Azure)
 */
export const ErrorCodes = {
  // General errors
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  INVALID_REQUEST: 'INVALID_REQUEST',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',

  // Deployment specific errors
  DEPLOYMENT_STEP_FAILED: 'DEPLOYMENT_STEP_FAILED',
  DEPLOYMENT_TIMEOUT: 'DEPLOYMENT_TIMEOUT',
  DEPLOYMENT_QUOTA_EXCEEDED: 'DEPLOYMENT_QUOTA_EXCEEDED',
  DEPLOYMENT_VALIDATION_FAILED: 'DEPLOYMENT_VALIDATION_FAILED',

  // Azure Service Bus specific errors
  SERVICE_BUS_SEND_FAILED: 'SERVICE_BUS_SEND_FAILED',
  SERVICE_BUS_PROCESSING_FAILED: 'SERVICE_BUS_PROCESSING_FAILED',
  SERVICE_BUS_CONNECTION_FAILED: 'SERVICE_BUS_CONNECTION_FAILED',

  // Azure Storage specific errors
  COSMOS_DB_READ_FAILED: 'COSMOS_DB_READ_FAILED',
  COSMOS_DB_WRITE_FAILED: 'COSMOS_DB_WRITE_FAILED',
  COSMOS_DB_CONNECTION_FAILED: 'COSMOS_DB_CONNECTION_FAILED',
  BLOB_STORAGE_READ_FAILED: 'BLOB_STORAGE_READ_FAILED',
  BLOB_STORAGE_WRITE_FAILED: 'BLOB_STORAGE_WRITE_FAILED',

  // Sandbox specific errors
  SANDBOX_CREATE_FAILED: 'SANDBOX_CREATE_FAILED',
  SANDBOX_CONNECT_FAILED: 'SANDBOX_CONNECT_FAILED',
  SANDBOX_COMMAND_FAILED: 'SANDBOX_COMMAND_FAILED',
  SANDBOX_CLEANUP_FAILED: 'SANDBOX_CLEANUP_FAILED',

  // Build specific errors
  BUILD_FAILED: 'BUILD_FAILED',
  BUILD_TIMEOUT: 'BUILD_TIMEOUT',
  BUILD_DEPENDENCY_FAILED: 'BUILD_DEPENDENCY_FAILED',

  // Deploy specific errors
  WORKER_DEPLOY_FAILED: 'WORKER_DEPLOY_FAILED',
  WORKER_START_FAILED: 'WORKER_START_FAILED',
  CUSTOM_DOMAIN_FAILED: 'CUSTOM_DOMAIN_FAILED',

  // Azure specific errors
  AZURE_AUTH_FAILED: 'AZURE_AUTH_FAILED',
  AZURE_SUBSCRIPTION_INVALID: 'AZURE_SUBSCRIPTION_INVALID',
  AZURE_RESOURCE_NOT_FOUND: 'AZURE_RESOURCE_NOT_FOUND',
  AZURE_QUOTA_EXCEEDED: 'AZURE_QUOTA_EXCEEDED',
  KEY_VAULT_ACCESS_FAILED: 'KEY_VAULT_ACCESS_FAILED'
} as const

export type ErrorCode = typeof ErrorCodes[keyof typeof ErrorCodes]

/**
 * Base deployment error class with Azure context
 */
export class DeploymentError extends Error {
  public readonly code: ErrorCode
  public readonly statusCode: number
  public readonly deploymentId?: string
  public readonly userId?: string
  public readonly organizationId?: string
  public readonly azureContext?: {
    subscriptionId?: string
    resourceGroup?: string
    operation?: string
  }
  public readonly retryable: boolean

  constructor(
    code: ErrorCode,
    message: string,
    options: {
      statusCode?: number
      deploymentId?: string
      userId?: string
      organizationId?: string
      azureContext?: {
        subscriptionId?: string
        resourceGroup?: string
        operation?: string
      }
      retryable?: boolean
      cause?: Error
    } = {}
  ) {
    super(message)
    this.name = 'DeploymentError'
    this.code = code
    this.statusCode = options.statusCode || 500
    this.deploymentId = options.deploymentId
    this.userId = options.userId
    this.organizationId = options.organizationId
    this.azureContext = options.azureContext
    this.retryable = options.retryable || false
    this.cause = options.cause
  }

  /**
   * Convert error to JSON for logging/API responses
   */
  toJSON() {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      statusCode: this.statusCode,
      deploymentId: this.deploymentId,
      userId: this.userId,
      organizationId: this.organizationId,
      azureContext: this.azureContext,
      retryable: this.retryable,
      stack: this.stack,
      timestamp: new Date().toISOString()
    }
  }

  /**
   * Check if error is retryable
   */
  isRetryable(): boolean {
    return this.retryable
  }
}

/**
 * Azure Service Bus specific error
 */
export class ServiceBusError extends DeploymentError {
  constructor(
    operation: string,
    message: string,
    options: {
      queueName?: string
      messageId?: string
      cause?: Error
    } = {}
  ) {
    super(
      ErrorCodes.SERVICE_BUS_PROCESSING_FAILED,
      `Service Bus ${operation} failed: ${message}`,
      {
        statusCode: 500,
        retryable: true,
        azureContext: {
          operation: `ServiceBus:${operation}`
        },
        cause: options.cause
      }
    )
    this.name = 'ServiceBusError'
  }
}

/**
 * Azure Cosmos DB specific error
 */
export class CosmosDBError extends DeploymentError {
  constructor(
    operation: string,
    message: string,
    options: {
      databaseId?: string
      containerId?: string
      documentId?: string
      cause?: Error
    } = {}
  ) {
    super(
      ErrorCodes.COSMOS_DB_WRITE_FAILED,
      `Cosmos DB ${operation} failed: ${message}`,
      {
        statusCode: 500,
        retryable: true,
        azureContext: {
          operation: `CosmosDB:${operation}`
        },
        cause: options.cause
      }
    )
    this.name = 'CosmosDBError'
  }
}

/**
 * Azure Blob Storage specific error
 */
export class BlobStorageError extends DeploymentError {
  constructor(
    operation: string,
    message: string,
    options: {
      containerName?: string
      blobName?: string
      cause?: Error
    } = {}
  ) {
    super(
      ErrorCodes.BLOB_STORAGE_WRITE_FAILED,
      `Blob Storage ${operation} failed: ${message}`,
      {
        statusCode: 500,
        retryable: true,
        azureContext: {
          operation: `BlobStorage:${operation}`
        },
        cause: options.cause
      }
    )
    this.name = 'BlobStorageError'
  }
}

/**
 * Validation error for deployment parameters
 */
export class ValidationError extends DeploymentError {
  constructor(message: string, field?: string) {
    super(
      ErrorCodes.DEPLOYMENT_VALIDATION_FAILED,
      `Validation failed: ${message}`,
      {
        statusCode: 400,
        retryable: false
      }
    )
    this.name = 'ValidationError'
  }
}

/**
 * Quota exceeded error
 */
export class QuotaError extends DeploymentError {
  constructor(resource: string, limit: number, current: number) {
    super(
      ErrorCodes.DEPLOYMENT_QUOTA_EXCEEDED,
      `Quota exceeded for ${resource}: ${current}/${limit}`,
      {
        statusCode: 429,
        retryable: false
      }
    )
    this.name = 'QuotaError'
  }
}

/**
 * Timeout error for long-running operations
 */
export class TimeoutError extends DeploymentError {
  constructor(operation: string, timeoutMs: number) {
    super(
      ErrorCodes.DEPLOYMENT_TIMEOUT,
      `Operation ${operation} timed out after ${timeoutMs}ms`,
      {
        statusCode: 408,
        retryable: true
      }
    )
    this.name = 'TimeoutError'
  }
}

/**
 * Helper function to create deployment errors from unknown errors
 */
export function createDeploymentError(
  error: unknown,
  context: {
    operation?: string
    deploymentId?: string
    userId?: string
    organizationId?: string
  } = {}
): DeploymentError {
  if (error instanceof DeploymentError) {
    return error
  }

  if (error instanceof Error) {
    return new DeploymentError(
      ErrorCodes.INTERNAL_ERROR,
      error.message,
      {
        cause: error,
        deploymentId: context.deploymentId,
        userId: context.userId,
        organizationId: context.organizationId,
        azureContext: {
          operation: context.operation
        }
      }
    )
  }

  return new DeploymentError(
    ErrorCodes.INTERNAL_ERROR,
    `Unknown error: ${String(error)}`,
    {
      deploymentId: context.deploymentId,
      userId: context.userId,
      organizationId: context.organizationId,
      azureContext: {
        operation: context.operation
      }
    }
  )
}

/**
 * Helper function to determine if an error should trigger a retry
 */
export function shouldRetry(error: unknown, attemptNumber: number, maxRetries: number = 3): boolean {
  if (attemptNumber >= maxRetries) {
    return false
  }

  if (error instanceof DeploymentError) {
    return error.isRetryable()
  }

  // Default retry logic for unknown errors
  return true
}