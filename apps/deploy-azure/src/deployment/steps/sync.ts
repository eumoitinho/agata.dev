/**
 * Sync Files to Azure Blob Storage Step
 * Uploads project files to Azure Blob Storage for building
 */

import { BlobServiceClient } from '@azure/storage-blob'
import type { DeploymentContext } from '../../types'
import { createReadStream } from 'node:fs'
import { readdir, stat } from 'node:fs/promises'
import { join, relative } from 'node:path'

export interface SyncResult {
  blobPrefix: string
  filesUploaded: number
  totalSize: number
  containerName: string
  localPath: string
}

/**
 * Sync project files to Azure Blob Storage
 */
export async function syncFilesToStorage(context: DeploymentContext): Promise<SyncResult> {
  const { config, params, logger } = context

  logger.info('Starting file sync to Azure Blob Storage', {
    projectId: params.projectId
  })

  try {
    // Initialize Blob Service Client
    const blobServiceClient = BlobServiceClient.fromConnectionString(
      config.storageConnectionString
    )

    // Container name for deployment artifacts
    const containerName = process.env.AZURE_STORAGE_CONTAINER_ARTIFACTS || 'deployment-artifacts'
    const containerClient = blobServiceClient.getContainerClient(containerName)

    // Ensure container exists
    await containerClient.createIfNotExists({
      access: 'container' // Public read access for artifacts
    })

    // Generate blob prefix for this deployment
    const blobPrefix = `${params.projectId}/${context.deploymentId}`

    // Get project files from database or API
    // For now, we'll use a temporary directory
    const localPath = `/tmp/libra-projects/${params.projectId}`

    // Download project files from source (GitHub, etc.)
    await downloadProjectFiles(params, localPath, logger)

    // Upload files to blob storage
    const uploadResult = await uploadDirectory(
      localPath,
      containerClient,
      blobPrefix,
      logger
    )

    logger.info('File sync completed', {
      filesUploaded: uploadResult.filesUploaded,
      totalSize: formatBytes(uploadResult.totalSize),
      blobPrefix
    })

    return {
      blobPrefix,
      filesUploaded: uploadResult.filesUploaded,
      totalSize: uploadResult.totalSize,
      containerName,
      localPath
    }

  } catch (error) {
    logger.error('File sync failed', {
      error: error instanceof Error ? error.message : String(error)
    })
    throw new Error(`File sync failed: ${error instanceof Error ? error.message : String(error)}`)
  }
}

/**
 * Download project files from source
 */
async function downloadProjectFiles(
  params: any,
  localPath: string,
  logger: any
): Promise<void> {
  // In production, this would:
  // 1. Clone from GitHub if gitUrl is provided
  // 2. Download from project storage
  // 3. Extract from uploaded archive

  logger.info('Downloading project files', {
    projectId: params.projectId,
    branch: params.branch || 'main'
  })

  // For now, create a simple example project
  const fs = await import('node:fs/promises')
  await fs.mkdir(localPath, { recursive: true })

  // Create a simple Node.js app
  const packageJson = {
    name: params.projectName || 'libra-project',
    version: '1.0.0',
    scripts: {
      start: 'node index.js',
      build: 'echo "Building project..."'
    },
    dependencies: {
      express: '^4.18.0'
    }
  }

  const indexJs = `
const express = require('express');
const app = express();
const port = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.json({
    message: 'Hello from Azure Container Apps!',
    project: '${params.projectName}',
    environment: '${params.environment || 'production'}'
  });
});

app.get('/health', (req, res) => {
  res.json({ status: 'healthy' });
});

app.listen(port, () => {
  console.log(\`Server running on port \${port}\`);
});
`

  await fs.writeFile(join(localPath, 'package.json'), JSON.stringify(packageJson, null, 2))
  await fs.writeFile(join(localPath, 'index.js'), indexJs.trim())
}

/**
 * Upload directory to blob storage
 */
async function uploadDirectory(
  dirPath: string,
  containerClient: any,
  blobPrefix: string,
  logger: any
): Promise<{ filesUploaded: number; totalSize: number }> {
  let filesUploaded = 0
  let totalSize = 0

  async function uploadFile(filePath: string) {
    const relativePath = relative(dirPath, filePath)
    const blobName = `${blobPrefix}/${relativePath}`
    const blockBlobClient = containerClient.getBlockBlobClient(blobName)

    const fileStats = await stat(filePath)
    const stream = createReadStream(filePath)

    await blockBlobClient.uploadStream(stream, fileStats.size, 4, {
      blobHTTPHeaders: {
        blobContentType: getMimeType(filePath)
      }
    })

    filesUploaded++
    totalSize += fileStats.size

    logger.debug('Uploaded file', {
      file: relativePath,
      size: formatBytes(fileStats.size)
    })
  }

  async function processDirectory(currentPath: string) {
    const entries = await readdir(currentPath, { withFileTypes: true })

    for (const entry of entries) {
      const fullPath = join(currentPath, entry.name)

      // Skip node_modules and other large directories
      if (shouldSkipPath(entry.name)) {
        continue
      }

      if (entry.isDirectory()) {
        await processDirectory(fullPath)
      } else {
        await uploadFile(fullPath)
      }
    }
  }

  await processDirectory(dirPath)

  return { filesUploaded, totalSize }
}

/**
 * Determine if path should be skipped during upload
 */
function shouldSkipPath(name: string): boolean {
  const skipPatterns = [
    'node_modules',
    '.git',
    '.next',
    'dist',
    'build',
    '.cache',
    'coverage',
    '.env',
    '.env.local'
  ]

  return skipPatterns.includes(name) || name.startsWith('.')
}

/**
 * Get MIME type for file
 */
function getMimeType(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase()

  const mimeTypes: Record<string, string> = {
    html: 'text/html',
    css: 'text/css',
    js: 'application/javascript',
    json: 'application/json',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    svg: 'image/svg+xml',
    pdf: 'application/pdf',
    zip: 'application/zip'
  }

  return mimeTypes[ext || ''] || 'application/octet-stream'
}

/**
 * Format bytes to human readable
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes'
  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`
}