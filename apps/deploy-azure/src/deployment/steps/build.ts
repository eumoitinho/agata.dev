/**
 * Build Docker Image Step
 * Builds the Docker image and pushes it to Azure Container Registry
 */

import type { DeploymentContext } from '../../types'
import { exec } from 'node:child_process'
import { promisify } from 'node:util'

const execAsync = promisify(exec)

export interface BuildResult {
  imageTag: string
  imageSha: string
  registryUrl: string
  buildDuration: number
  size: string
}

/**
 * Build Docker image and push to Azure Container Registry
 */
export async function buildDockerImage(context: DeploymentContext): Promise<BuildResult> {
  const { config, params, logger, state } = context

  // Get sync results from previous step
  const syncResult = state.stepResults.sync
  if (!syncResult?.data?.localPath) {
    throw new Error('Local path not found from sync step')
  }

  const projectPath = syncResult.data.localPath
  const startTime = Date.now()

  logger.info('Starting Docker image build', {
    projectPath,
    registry: config.containerRegistry
  })

  try {
    // Generate image tag
    const imageTag = generateImageTag(params.projectId, params.environment)
    const registryUrl = `${config.containerRegistry}.azurecr.io`
    const fullImageUrl = `${registryUrl}/${imageTag}`

    // Step 1: Login to Azure Container Registry
    logger.info('Logging in to Azure Container Registry', { registry: config.containerRegistry })

    await execAsync(`az acr login --name ${config.containerRegistry}`)

    // Step 2: Build Docker image
    logger.info('Building Docker image', { image: fullImageUrl })

    const dockerfilePath = `${projectPath}/Dockerfile`
    const buildCommand = params.buildCommand || 'npm run build'

    // Create Dockerfile if it doesn't exist
    await ensureDockerfile(projectPath, buildCommand, params.startCommand)

    // Build the image
    const buildArgs = [
      `docker build`,
      `-t ${fullImageUrl}`,
      `--build-arg BUILD_COMMAND="${buildCommand}"`,
      params.environment ? `--build-arg NODE_ENV=${params.environment}` : '',
      `--platform linux/amd64`,
      projectPath
    ].filter(Boolean).join(' ')

    const { stdout: buildOutput } = await execAsync(buildArgs, {
      maxBuffer: 10 * 1024 * 1024 // 10MB buffer
    })

    logger.info('Docker image built successfully', {
      image: fullImageUrl,
      output: buildOutput.slice(-500) // Log last 500 chars
    })

    // Step 3: Get image details
    const { stdout: inspectOutput } = await execAsync(
      `docker inspect ${fullImageUrl} --format='{{.Id}}|{{.Size}}'`
    )

    const [imageSha, sizeBytes] = inspectOutput.trim().split('|')
    const size = formatBytes(parseInt(sizeBytes || '0'))

    // Step 4: Push to Azure Container Registry
    logger.info('Pushing image to registry', { image: fullImageUrl })

    const { stdout: pushOutput } = await execAsync(`docker push ${fullImageUrl}`, {
      maxBuffer: 10 * 1024 * 1024
    })

    logger.info('Image pushed successfully', {
      image: fullImageUrl,
      size,
      output: pushOutput.slice(-500)
    })

    // Step 5: Tag as latest for this project
    const latestTag = `${params.projectId}:latest`
    await execAsync(`docker tag ${fullImageUrl} ${registryUrl}/${latestTag}`)
    await execAsync(`docker push ${registryUrl}/${latestTag}`)

    const buildDuration = Date.now() - startTime

    logger.info('Docker build completed', {
      imageTag,
      imageSha: imageSha?.substring(0, 12) || 'unknown',
      size,
      duration: buildDuration
    })

    return {
      imageTag,
      imageSha: imageSha?.substring(0, 12) || 'unknown',
      registryUrl,
      buildDuration,
      size
    }

  } catch (error) {
    logger.error('Docker build failed', {
      error: error instanceof Error ? error.message : String(error)
    })
    throw new Error(`Docker build failed: ${error instanceof Error ? error.message : String(error)}`)
  }
}

/**
 * Generate unique image tag
 */
function generateImageTag(projectId: string, environment?: string): string {
  const timestamp = new Date().toISOString().replace(/[-:T.]/g, '').substring(0, 14)
  const env = environment || 'dev'
  return `${projectId}:${env}-${timestamp}`
}

/**
 * Ensure Dockerfile exists
 */
async function ensureDockerfile(
  projectPath: string,
  buildCommand: string,
  startCommand?: string
): Promise<void> {
  const fs = await import('node:fs/promises')
  const path = await import('node:path')

  const dockerfilePath = path.join(projectPath, 'Dockerfile')

  try {
    await fs.access(dockerfilePath)
    // Dockerfile exists
  } catch {
    // Create default Dockerfile
    const defaultDockerfile = `
# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY bun.lockb* ./
COPY yarn.lock* ./
COPY pnpm-lock.yaml* ./

# Install dependencies
RUN if [ -f bun.lockb ]; then \\
      npm install -g bun && bun install --frozen-lockfile; \\
    elif [ -f pnpm-lock.yaml ]; then \\
      npm install -g pnpm && pnpm install --frozen-lockfile; \\
    elif [ -f yarn.lock ]; then \\
      npm install -g yarn && yarn install --frozen-lockfile; \\
    else \\
      npm ci; \\
    fi

# Copy source code
COPY . .

# Build application
ARG BUILD_COMMAND="npm run build"
RUN $BUILD_COMMAND

# Runtime stage
FROM node:20-alpine

WORKDIR /app

# Install production dependencies only
COPY package*.json ./
RUN npm ci --only=production

# Copy built application
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/build ./build
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public

# Set environment
ARG NODE_ENV=production
ENV NODE_ENV=$NODE_ENV

# Expose port
EXPOSE 3000

# Start application
CMD ${startCommand || '["npm", "start"]'}
`.trim()

    await fs.writeFile(dockerfilePath, defaultDockerfile)
  }
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