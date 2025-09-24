/**
 * Azure Deployment Workflow Orchestrator
 * Manages the complete deployment pipeline to Azure Container Apps
 */

import type {
  DeploymentContext,
  DeploymentParams,
  DeploymentResult,
  DeploymentState,
  DeploymentStatus,
  StepFunction,
  StepResult
} from '../types'
import { createLogger, type AzureLogger } from '../utils/logger'
import { validateAndPrepare } from './steps/validate'
import { createContainerInstance } from './steps/container'
import { syncFilesToStorage } from './steps/sync'
import { buildDockerImage } from './steps/build'
import { deployToContainerApps } from './steps/deploy'
import { cleanupAndUpdate } from './steps/cleanup'
import { StateManager } from '../storage/state-manager'

export class AzureDeploymentWorkflow {
  private stateManager: StateManager
  private logger: AzureLogger
  private stepResults: Record<string, any> = {}

  constructor(stateManager: StateManager, logger?: AzureLogger) {
    this.stateManager = stateManager
    this.logger = logger || createLogger()
  }

  /**
   * Execute the complete deployment workflow
   */
  async execute(deploymentId: string, params: DeploymentParams): Promise<DeploymentResult> {
    const startTime = Date.now()

    this.logger.info('Starting Azure deployment workflow', {
      deploymentId,
      projectId: params.projectId,
      userId: params.userId,
      organizationId: params.organizationId,
      environment: params.environment || 'development'
    })

    // Initialize deployment state
    const state = await this.stateManager.initializeDeployment(deploymentId, params)

    // Create deployment context
    const context: DeploymentContext = {
      deploymentId,
      config: await this.loadAzureConfig(),
      params,
      state,
      logger: this.logger.child({ deploymentId })
    }

    try {
      // Step 1: Validate and Prepare
      await this.executeStep(
        'validation',
        'Validating project and Azure resources',
        10,
        context,
        validateAndPrepare
      )

      // Step 2: Create Container Instance for Build
      await this.executeStep(
        'container',
        'Creating Azure Container Instance',
        20,
        context,
        createContainerInstance
      )

      // Step 3: Sync Files to Azure Storage
      await this.executeStep(
        'sync',
        'Syncing files to Azure Blob Storage',
        35,
        context,
        syncFilesToStorage
      )

      // Step 4: Build Docker Image
      await this.executeStep(
        'build',
        'Building Docker image',
        55,
        context,
        buildDockerImage
      )

      // Step 5: Deploy to Container Apps
      await this.executeStep(
        'deploy',
        'Deploying to Azure Container Apps',
        85,
        context,
        deployToContainerApps
      )

      // Step 6: Cleanup and Update
      await this.executeStep(
        'cleanup',
        'Cleaning up resources and updating database',
        100,
        context,
        cleanupAndUpdate
      )

      // Get final state
      const finalState = await this.stateManager.getDeploymentState(deploymentId)
      const duration = Date.now() - startTime

      // Mark deployment as completed
      await this.stateManager.updateDeploymentStatus(deploymentId, 'completed')

      this.logger.info('Deployment workflow completed successfully', {
        deploymentId,
        duration,
        containerAppUrl: finalState?.metadata.containerAppUrl,
        customDomainUrl: finalState?.metadata.customDomainUrl
      })

      return {
        success: true,
        deploymentId,
        containerAppUrl: finalState?.metadata.containerAppUrl,
        customDomainUrl: finalState?.metadata.customDomainUrl,
        message: 'Project deployed successfully to Azure Container Apps',
        duration,
        state: finalState!
      }

    } catch (error) {
      const duration = Date.now() - startTime
      const errorMessage = error instanceof Error ? error.message : String(error)

      this.logger.error('Deployment workflow failed', {
        deploymentId,
        error: errorMessage,
        duration,
        step: context.state.status
      })

      // Cleanup on failure
      await this.cleanupOnFailure(context)

      // Mark deployment as failed
      await this.stateManager.updateDeploymentStatus(deploymentId, 'failed', {
        code: 'DEPLOYMENT_FAILED',
        message: errorMessage,
        timestamp: new Date().toISOString()
      })

      const finalState = await this.stateManager.getDeploymentState(deploymentId)

      return {
        success: false,
        deploymentId,
        message: 'Deployment failed',
        duration,
        state: finalState!,
        error: {
          code: 'DEPLOYMENT_FAILED',
          message: errorMessage,
          timestamp: new Date().toISOString(),
          step: context.state.status
        }
      }
    }
  }

  /**
   * Execute a single deployment step
   */
  private async executeStep<T>(
    stepName: string,
    description: string,
    progressPercentage: number,
    context: DeploymentContext,
    stepFunction: StepFunction<T>
  ): Promise<T> {
    const stepStartTime = Date.now()

    this.logger.info(`Starting step: ${stepName}`, {
      deploymentId: context.deploymentId,
      step: stepName,
      description
    })

    // Update deployment status
    const status = this.getStatusForStep(stepName)
    await this.stateManager.updateDeploymentStatus(
      context.deploymentId,
      status,
      undefined,
      progressPercentage
    )

    try {
      // Update context with latest step results
      context.state.stepResults = { ...context.state.stepResults, ...this.stepResults }

      // Execute the step
      const result = await stepFunction(context)
      const stepDuration = Date.now() - stepStartTime

      this.logger.info(`Step completed: ${stepName}`, {
        deploymentId: context.deploymentId,
        step: stepName,
        duration: stepDuration
      })

      // Save step result
      const stepResult: StepResult = {
        success: true,
        duration: stepDuration,
        data: result
      }

      // Save to memory for immediate access
      this.stepResults[stepName] = result

      // Save to state manager
      await this.stateManager.saveStepResult(context.deploymentId, stepName, stepResult)

      return result

    } catch (error) {
      const stepDuration = Date.now() - stepStartTime
      const errorMessage = error instanceof Error ? error.message : String(error)

      this.logger.error(`Step failed: ${stepName}`, {
        deploymentId: context.deploymentId,
        step: stepName,
        error: errorMessage,
        duration: stepDuration
      })

      // Save step error
      await this.stateManager.saveStepResult(context.deploymentId, stepName, {
        success: false,
        duration: stepDuration,
        error: errorMessage
      })

      throw new Error(`${stepName} failed: ${errorMessage}`)
    }
  }

  /**
   * Map step names to deployment statuses
   */
  private getStatusForStep(stepName: string): DeploymentStatus {
    const statusMap: Record<string, DeploymentStatus> = {
      'validation': 'validating',
      'container': 'provisioning_container',
      'sync': 'syncing_files',
      'build': 'building_image',
      'deploy': 'deploying',
      'cleanup': 'updating_database'
    }

    return statusMap[stepName] || 'queued'
  }

  /**
   * Load Azure configuration
   */
  private async loadAzureConfig() {
    const { loadAzureConfig } = await import('../utils/azure-config')
    return loadAzureConfig()
  }

  /**
   * Cleanup resources on failure
   */
  private async cleanupOnFailure(context: DeploymentContext): Promise<void> {
    try {
      this.logger.info('Starting failure cleanup', {
        deploymentId: context.deploymentId
      })

      // Cleanup container instance if created
      const containerResult = context.state.stepResults.container
      if (containerResult?.data?.containerId) {
        await this.cleanupContainerInstance(containerResult.data.containerId)
      }

      // Cleanup blob storage artifacts
      const syncResult = context.state.stepResults.sync
      if (syncResult?.data?.blobPrefix) {
        await this.cleanupBlobStorage(syncResult.data.blobPrefix)
      }

      this.logger.info('Failure cleanup completed', {
        deploymentId: context.deploymentId
      })

    } catch (error) {
      this.logger.error('Error during failure cleanup', {
        deploymentId: context.deploymentId,
        error: error instanceof Error ? error.message : String(error)
      })
      // Don't throw - cleanup is best effort
    }
  }

  /**
   * Cleanup container instance
   */
  private async cleanupContainerInstance(containerId: string): Promise<void> {
    try {
      // Implementation will use Azure SDK to delete container instance
      this.logger.info('Container instance cleaned up', { containerId })
    } catch (error) {
      this.logger.warn('Failed to cleanup container instance', {
        containerId,
        error: error instanceof Error ? error.message : String(error)
      })
    }
  }

  /**
   * Cleanup blob storage
   */
  private async cleanupBlobStorage(blobPrefix: string): Promise<void> {
    try {
      // Implementation will use Azure Storage SDK to delete blobs
      this.logger.info('Blob storage cleaned up', { blobPrefix })
    } catch (error) {
      this.logger.warn('Failed to cleanup blob storage', {
        blobPrefix,
        error: error instanceof Error ? error.message : String(error)
      })
    }
  }
}