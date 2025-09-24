/**
 * Azure Deployment Service V3 - Type Definitions
 */

import type { ServiceBusMessage } from '@azure/service-bus'

// Deployment Status
export type DeploymentStatus =
  | 'idle'
  | 'queued'
  | 'validating'
  | 'provisioning_container'
  | 'syncing_files'
  | 'building_image'
  | 'pushing_registry'
  | 'deploying'
  | 'configuring_domain'
  | 'updating_database'
  | 'completed'
  | 'failed'
  | 'cancelled'

// Deployment Parameters
export interface DeploymentParams {
  projectId: string
  userId: string
  organizationId: string
  projectName: string
  templateType?: string
  branch?: string
  commitSha?: string
  environment?: 'development' | 'staging' | 'production'
  customDomain?: string
  envVariables?: Record<string, string>
  buildCommand?: string
  startCommand?: string
  containerSize?: ContainerSize
}

// Container Size Configuration
export interface ContainerSize {
  cpu: string     // e.g., "0.5", "1", "2"
  memory: string  // e.g., "1Gi", "2Gi", "4Gi"
}

// Deployment State
export interface DeploymentState {
  deploymentId: string
  projectId: string
  status: DeploymentStatus
  progress: number
  startedAt: string
  completedAt?: string
  stepResults: Record<string, StepResult>
  error?: DeploymentError
  metadata: DeploymentMetadata
}

// Step Result
export interface StepResult {
  success: boolean
  duration: number
  data?: any
  error?: string
  logs?: string[]
}

// Deployment Metadata
export interface DeploymentMetadata {
  containerAppUrl?: string
  customDomainUrl?: string
  registryImage?: string
  containerId?: string
  resourceGroupId?: string
  subscriptionId?: string
  buildId?: string
  version?: string
}

// Deployment Error
export interface DeploymentError {
  code: string
  message: string
  details?: any
  timestamp: string
  step?: string
}

// Deployment Result
export interface DeploymentResult {
  success: boolean
  deploymentId: string
  containerAppUrl?: string
  customDomainUrl?: string
  message: string
  duration: number
  state: DeploymentState
  error?: DeploymentError
}

// Queue Message
export interface DeploymentQueueMessage {
  deploymentId: string
  params: DeploymentParams
  retryCount: number
  enqueuedAt: string
}

// Azure Configuration
export interface AzureConfig {
  subscriptionId: string
  resourceGroup: string
  location: string
  containerRegistry: string
  serviceBusConnectionString: string
  storageConnectionString: string
  cosmosConnectionString: string
  keyVaultUri: string
  appInsightsConnectionString?: string
}

// Container Apps Configuration
export interface ContainerAppConfig {
  name: string
  environment: string
  registryUrl: string
  image: string
  cpu: string
  memory: string
  minReplicas: number
  maxReplicas: number
  port: number
  envVars?: Array<{
    name: string
    value?: string
    secretRef?: string
  }>
  customDomains?: Array<{
    name: string
    certificateId?: string
  }>
}

// Build Configuration
export interface BuildConfig {
  dockerfile: string
  context: string
  buildArgs?: Record<string, string>
  target?: string
  platform?: string
}

// Deployment Context
export interface DeploymentContext {
  deploymentId: string
  config: AzureConfig
  params: DeploymentParams
  state: DeploymentState
  logger: Logger
}

// Logger Interface
export interface Logger {
  info(message: string, data?: any): void
  warn(message: string, data?: any): void
  error(message: string, data?: any): void
  debug(message: string, data?: any): void
}

// Step Function Type
export type StepFunction<T = any> = (context: DeploymentContext) => Promise<T>

// Health Check Response
export interface HealthCheckResponse {
  status: 'healthy' | 'degraded' | 'unhealthy'
  timestamp: string
  services: {
    serviceBus: ServiceHealth
    storage: ServiceHealth
    cosmos: ServiceHealth
    containerApps: ServiceHealth
  }
  deployments: {
    active: number
    queued: number
    failed24h: number
  }
}

// Service Health
export interface ServiceHealth {
  status: 'up' | 'down' | 'degraded'
  latency?: number
  error?: string
}

// Deployment Statistics
export interface DeploymentStats {
  total: number
  successful: number
  failed: number
  averageDuration: number
  byStatus: Record<DeploymentStatus, number>
  byEnvironment: Record<string, number>
}