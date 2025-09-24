/*
 * SPDX-License-Identifier: AGPL-3.0-only
 * azure/blob-storage.ts - Azure Blob Storage Client
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

import {
  BlobServiceClient,
  ContainerClient,
  BlockBlobClient,
  BlobDownloadResponseParsed,
  BlobUploadCommonResponse
} from '@azure/storage-blob'
import type { AzureBindings } from '../types'
import { BlobStorageError, createDeploymentError } from '../utils/errors'
import { createLogger, type Logger } from '../utils/logger'

/**
 * Blob storage configuration for different types of files
 */
export interface BlobStorageConfig {
  containerName: string
  /** Time-to-live for blobs (in days) */
  ttlDays?: number
  /** Content type for uploaded blobs */
  contentType?: string
  /** Access tier (Hot, Cool, Archive) */
  accessTier?: string
}

/**
 * Blob metadata for tracking deployment artifacts
 */
export interface BlobMetadata {
  deploymentId: string
  userId: string
  organizationId: string
  projectId: string
  fileType: 'logs' | 'artifacts' | 'source' | 'build-output'
  createdAt: string
  stage?: string
  version: string
}

/**
 * Azure Blob Storage Client wrapper for deployment files and artifacts
 */
export class AzureBlobStorageClient {
  private client: BlobServiceClient
  private logger: Logger

  // Container configurations
  private readonly containers = {
    logs: { containerName: 'deployment-logs', ttlDays: 7, contentType: 'text/plain' },
    artifacts: { containerName: 'deployment-artifacts', ttlDays: 30, contentType: 'application/octet-stream' },
    source: { containerName: 'source-files', ttlDays: 7, contentType: 'application/zip' },
    buildOutput: { containerName: 'build-output', ttlDays: 7, contentType: 'text/plain' }
  }

  constructor(connectionString: string, env: AzureBindings) {
    this.client = BlobServiceClient.fromConnectionString(connectionString)
    this.logger = createLogger(env, 'blob-storage')
  }

  /**
   * Initialize containers if they don't exist
   */
  async initialize(): Promise<void> {
    try {
      const containerNames = Object.values(this.containers).map(config => config.containerName)

      for (const containerName of containerNames) {
        const containerClient = this.client.getContainerClient(containerName)

        // Create container if it doesn't exist with private access
        const createResponse = await containerClient.createIfNotExists({
          access: 'container' // Container-level access for easier URL sharing within the deployment system
        })

        if (createResponse.succeeded) {
          this.logger.azure('BlobStorage', 'Container created', { containerName })
        }

        // Set lifecycle management policy to auto-delete based on TTL
        // Note: In production, this would be configured via Azure Portal or ARM templates
      }

      this.logger.azure('BlobStorage', 'Initialized successfully', {
        containers: containerNames
      })

    } catch (error) {
      this.logger.error('Failed to initialize Blob Storage', {
        error: error instanceof Error ? error.message : String(error)
      })

      throw new BlobStorageError('initialize', 'Failed to initialize storage containers', {
        cause: error instanceof Error ? error : new Error(String(error))
      })
    }
  }

  /**
   * Upload deployment logs
   */
  async uploadLogs(
    deploymentId: string,
    userId: string,
    organizationId: string,
    projectId: string,
    stage: string,
    logContent: string
  ): Promise<string> {
    const config = this.containers.logs
    const blobName = `${organizationId}/${userId}/${deploymentId}/logs/${stage}.log`

    return this.uploadBlob(
      config.containerName,
      blobName,
      logContent,
      {
        deploymentId,
        userId,
        organizationId,
        projectId,
        fileType: 'logs',
        stage,
        createdAt: new Date().toISOString(),
        version: '1.0'
      },
      config
    )
  }

  /**
   * Upload build artifacts
   */
  async uploadArtifacts(
    deploymentId: string,
    userId: string,
    organizationId: string,
    projectId: string,
    artifactBuffer: Buffer,
    fileName: string
  ): Promise<string> {
    const config = this.containers.artifacts
    const blobName = `${organizationId}/${userId}/${deploymentId}/artifacts/${fileName}`

    return this.uploadBlob(
      config.containerName,
      blobName,
      artifactBuffer,
      {
        deploymentId,
        userId,
        organizationId,
        projectId,
        fileType: 'artifacts',
        createdAt: new Date().toISOString(),
        version: '1.0'
      },
      config
    )
  }

  /**
   * Upload source files (zip archive)
   */
  async uploadSourceFiles(
    deploymentId: string,
    userId: string,
    organizationId: string,
    projectId: string,
    sourceZip: Buffer
  ): Promise<string> {
    const config = this.containers.source
    const blobName = `${organizationId}/${userId}/${deploymentId}/source.zip`

    return this.uploadBlob(
      config.containerName,
      blobName,
      sourceZip,
      {
        deploymentId,
        userId,
        organizationId,
        projectId,
        fileType: 'source',
        createdAt: new Date().toISOString(),
        version: '1.0'
      },
      config
    )
  }

  /**
   * Upload build output logs
   */
  async uploadBuildOutput(
    deploymentId: string,
    userId: string,
    organizationId: string,
    projectId: string,
    buildOutput: string
  ): Promise<string> {
    const config = this.containers.buildOutput
    const blobName = `${organizationId}/${userId}/${deploymentId}/build-output.log`

    return this.uploadBlob(
      config.containerName,
      blobName,
      buildOutput,
      {
        deploymentId,
        userId,
        organizationId,
        projectId,
        fileType: 'build-output',
        createdAt: new Date().toISOString(),
        version: '1.0'
      },
      config
    )
  }

  /**
   * Generic blob upload method
   */
  private async uploadBlob(
    containerName: string,
    blobName: string,
    content: string | Buffer,
    metadata: BlobMetadata,
    config: BlobStorageConfig
  ): Promise<string> {
    try {
      const containerClient = this.client.getContainerClient(containerName)
      const blockBlobClient = containerClient.getBlockBlobClient(blobName)

      const uploadOptions = {
        blobHTTPHeaders: {
          blobContentType: config.contentType || 'application/octet-stream'
        },
        metadata: {
          ...metadata,
          ttlDays: config.ttlDays?.toString() || '7'
        },
        tier: config.accessTier as any
      }

      let response: BlobUploadCommonResponse

      if (typeof content === 'string') {
        response = await blockBlobClient.upload(content, content.length, uploadOptions)
      } else {
        response = await blockBlobClient.upload(content, content.length, uploadOptions)
      }

      const blobUrl = blockBlobClient.url

      this.logger.azure('BlobStorage', 'Blob uploaded successfully', {
        containerName,
        blobName,
        blobUrl,
        requestId: response.requestId,
        contentLength: typeof content === 'string' ? content.length : content.length,
        deploymentId: metadata.deploymentId
      })

      return blobUrl

    } catch (error) {
      this.logger.error('Failed to upload blob to storage', {
        error: error instanceof Error ? error.message : String(error),
        containerName,
        blobName,
        deploymentId: metadata.deploymentId
      })

      throw new BlobStorageError('uploadBlob', 'Failed to upload file to blob storage', {
        containerName,
        blobName,
        cause: error instanceof Error ? error : new Error(String(error))
      })
    }
  }

  /**
   * Download deployment logs
   */
  async downloadLogs(
    deploymentId: string,
    userId: string,
    organizationId: string,
    stage?: string
  ): Promise<string> {
    try {
      const containerName = this.containers.logs.containerName
      const blobName = stage
        ? `${organizationId}/${userId}/${deploymentId}/logs/${stage}.log`
        : `${organizationId}/${userId}/${deploymentId}/logs/`

      const containerClient = this.client.getContainerClient(containerName)
      const blockBlobClient = containerClient.getBlockBlobClient(blobName)

      const downloadResponse: BlobDownloadResponseParsed = await blockBlobClient.download(0)

      if (!downloadResponse.readableStreamBody) {
        throw new Error('No content in blob')
      }

      const content = await this.streamToString(downloadResponse.readableStreamBody)

      this.logger.azure('BlobStorage', 'Logs downloaded successfully', {
        containerName,
        blobName,
        deploymentId,
        contentLength: content.length
      })

      return content

    } catch (error) {
      this.logger.error('Failed to download logs from storage', {
        error: error instanceof Error ? error.message : String(error),
        deploymentId,
        stage
      })

      throw new BlobStorageError('downloadLogs', 'Failed to download logs from blob storage', {
        containerName: this.containers.logs.containerName,
        cause: error instanceof Error ? error : new Error(String(error))
      })
    }
  }

  /**
   * List blobs for a deployment
   */
  async listDeploymentFiles(
    deploymentId: string,
    userId: string,
    organizationId: string,
    fileType?: 'logs' | 'artifacts' | 'source' | 'build-output'
  ): Promise<Array<{
    name: string
    url: string
    size: number
    lastModified: Date
    contentType: string
    metadata: Record<string, string>
  }>> {
    try {
      const containers = fileType
        ? [this.containers[fileType]]
        : Object.values(this.containers)

      const allFiles: any[] = []

      for (const config of containers) {
        const containerClient = this.client.getContainerClient(config.containerName)
        const prefix = `${organizationId}/${userId}/${deploymentId}/`

        const listOptions = {
          prefix,
          includeMetadata: true
        }

        for await (const blob of containerClient.listBlobsFlat(listOptions)) {
          const blobClient = containerClient.getBlobClient(blob.name)

          allFiles.push({
            name: blob.name,
            url: blobClient.url,
            size: blob.properties.contentLength || 0,
            lastModified: blob.properties.lastModified || new Date(),
            contentType: blob.properties.contentType || 'application/octet-stream',
            metadata: blob.metadata || {}
          })
        }
      }

      this.logger.azure('BlobStorage', 'Deployment files listed', {
        deploymentId,
        fileCount: allFiles.length,
        fileType
      })

      return allFiles

    } catch (error) {
      this.logger.error('Failed to list deployment files', {
        error: error instanceof Error ? error.message : String(error),
        deploymentId,
        fileType
      })

      throw new BlobStorageError('listDeploymentFiles', 'Failed to list deployment files', {
        cause: error instanceof Error ? error : new Error(String(error))
      })
    }
  }

  /**
   * Delete all files for a deployment
   */
  async deleteDeploymentFiles(
    deploymentId: string,
    userId: string,
    organizationId: string
  ): Promise<void> {
    try {
      let deletedCount = 0

      for (const config of Object.values(this.containers)) {
        const containerClient = this.client.getContainerClient(config.containerName)
        const prefix = `${organizationId}/${userId}/${deploymentId}/`

        for await (const blob of containerClient.listBlobsFlat({ prefix })) {
          try {
            await containerClient.deleteBlob(blob.name)
            deletedCount++
          } catch (error) {
            this.logger.warn('Failed to delete blob', {
              blobName: blob.name,
              error: error instanceof Error ? error.message : String(error)
            })
          }
        }
      }

      this.logger.azure('BlobStorage', 'Deployment files deleted', {
        deploymentId,
        deletedCount
      })

    } catch (error) {
      this.logger.error('Failed to delete deployment files', {
        error: error instanceof Error ? error.message : String(error),
        deploymentId
      })

      throw new BlobStorageError('deleteDeploymentFiles', 'Failed to delete deployment files', {
        cause: error instanceof Error ? error : new Error(String(error))
      })
    }
  }

  /**
   * Helper method to convert stream to string
   */
  private async streamToString(readableStream: NodeJS.ReadableStream): Promise<string> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = []
      readableStream.on('data', (data) => {
        chunks.push(data instanceof Buffer ? data : Buffer.from(data))
      })
      readableStream.on('end', () => {
        resolve(Buffer.concat(chunks).toString())
      })
      readableStream.on('error', reject)
    })
  }
}

/**
 * Create Azure Blob Storage client instance
 */
export function createBlobStorageClient(env: AzureBindings): AzureBlobStorageClient {
  return new AzureBlobStorageClient(env.AZURE_STORAGE_CONNECTION_STRING, env)
}