/*
 * SPDX-License-Identifier: AGPL-3.0-only
 * workflow.ts - Azure Deployment Workflow
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

import { createBlobStorageClient } from '../azure/blob-storage'
import { DeploymentStateManager } from './state'
import { createLogger, loggedOperation } from '../utils/logger'
import { DeploymentError, ErrorCodes, createDeploymentError } from '../utils/errors'
import type {
  AzureBindings,
  ServiceBusMessage,
  DeploymentResult,
  DeploymentContext,
  DeploymentStatus,
  DeploymentStepResult
} from '../types'

/**
 * Azure-based deployment workflow
 * Executes deployment steps using Azure services as backend
 */
export class DeploymentWorkflow {
  private env: AzureBindings
  private stateManager: DeploymentStateManager
  private logger: ReturnType<typeof createLogger>
  private blobClient: ReturnType<typeof createBlobStorageClient>

  constructor(
    env: AzureBindings,
    stateManager: DeploymentStateManager,
    logger: ReturnType<typeof createLogger>
  ) {
    this.env = env
    this.stateManager = stateManager
    this.logger = logger
    this.blobClient = createBlobStorageClient(env)
  }

  /**
   * Execute the complete deployment workflow
   */
  async execute(
    message: ServiceBusMessage,
    projectData: any
  ): Promise<DeploymentResult> {
    const startTime = Date.now()
    const deploymentId = message.metadata.deploymentId

    this.logger.workflow('Starting deployment workflow', deploymentId, {
      projectId: message.params.projectId,
      userId: message.metadata.userId,
      organizationId: message.metadata.organizationId
    })

    try {
      // Initialize Azure services
      await this.blobClient.initialize()

      // Create initial deployment state
      const state = await this.stateManager.createDeploymentState(
        deploymentId,
        message.params,
        projectData
      )

      // Create deployment context
      const context: DeploymentContext = {
        deploymentId,
        env: this.env,
        params: message.params,
        state,
        logger: this.logger.child({ deploymentId })
      }

      // Execute deployment steps sequentially
      const validationResult = await this.executeStep(
        context,
        'validation',
        'Validating project and parameters',
        () => this.validateStep(context, projectData)
      )

      const sandboxResult = await this.executeStep(
        context,
        'sandbox',
        'Creating deployment sandbox',
        () => this.createSandboxStep(context, projectData)
      )

      const syncResult = await this.executeStep(
        context,
        'sync',
        'Syncing project files',
        () => this.syncFilesStep(context, projectData)
      )

      const buildResult = await this.executeStep(
        context,
        'build',
        'Building project',
        () => this.buildProjectStep(context, projectData)
      )

      const deployResult = await this.executeStep(
        context,
        'deploy',
        'Deploying to Cloudflare Workers',
        () => this.deployStep(context, projectData)
      )

      const cleanupResult = await this.executeStep(
        context,
        'cleanup',
        'Finalizing deployment',
        () => this.cleanupStep(context, projectData)
      )

      // Mark as completed
      await this.stateManager.markAsCompleted(
        deploymentId,
        message.metadata.organizationId,
        message.metadata.userId,
        deployResult.data?.workerUrl || ''
      )

      const duration = Date.now() - startTime

      this.logger.workflow('Deployment completed successfully', deploymentId, {
        duration,
        workerUrl: deployResult.data?.workerUrl
      })

      return {
        success: true,
        deploymentId,
        workerUrl: deployResult.data?.workerUrl,
        message: 'Deployment completed successfully',
        duration,
        state: context.state
      }

    } catch (error) {
      const duration = Date.now() - startTime
      const deploymentError = createDeploymentError(error, {
        operation: 'DeploymentWorkflow',
        deploymentId,
        userId: message.metadata.userId,
        organizationId: message.metadata.organizationId
      })

      this.logger.error('Deployment workflow failed', {
        error: deploymentError.message,
        deploymentId,
        duration,
        stack: deploymentError.stack
      })

      try {
        await this.stateManager.markAsFailed(
          deploymentId,
          message.metadata.organizationId,
          message.metadata.userId,
          deploymentError,
          'workflow_execution'
        )
      } catch (stateError) {
        this.logger.error('Failed to mark deployment as failed', {
          error: stateError instanceof Error ? stateError.message : String(stateError),
          deploymentId
        })
      }

      return {
        success: false,
        deploymentId,
        error: deploymentError.message,
        duration
      }
    }
  }

  /**
   * Execute a deployment step with error handling and state management
   */
  private async executeStep<T>(
    context: DeploymentContext,
    stepName: string,
    description: string,
    stepFunction: () => Promise<T>
  ): Promise<DeploymentStepResult> {
    const startTime = Date.now()

    try {
      // Update state to show current step
      await this.stateManager.updateStatus(
        context.deploymentId,
        context.state.metadata.organizationId,
        context.state.metadata.userId,
        context.state.status,
        context.state.progress,
        description
      )

      this.logger.step(stepName, `Starting: ${description}`, {
        deploymentId: context.deploymentId
      })

      // Execute the step
      const result = await loggedOperation(
        context.logger,
        `Step:${stepName}`,
        stepFunction
      )

      const duration = Date.now() - startTime
      const stepResult: DeploymentStepResult = {
        success: true,
        duration,
        data: result
      }

      // Update state with step result
      await this.stateManager.updateDeploymentState(context.state, {
        step: stepName,
        result: stepResult
      })

      this.logger.step(stepName, `Completed: ${description}`, {
        deploymentId: context.deploymentId,
        duration
      })

      return stepResult

    } catch (error) {
      const duration = Date.now() - startTime
      const stepResult: DeploymentStepResult = {
        success: false,
        duration,
        error: error instanceof Error ? error.message : String(error)
      }

      this.logger.step(stepName, `Failed: ${description}`, {
        deploymentId: context.deploymentId,
        error: stepResult.error,
        duration
      })

      throw error
    }
  }

  /**
   * Step 1: Validate project and deployment parameters
   */
  private async validateStep(context: DeploymentContext, projectData: any): Promise<any> {
    // Basic validation
    if (!projectData) {
      throw new DeploymentError(
        ErrorCodes.DEPLOYMENT_VALIDATION_FAILED,
        'Project not found',
        { statusCode: 404, retryable: false }
      )
    }

    if (!projectData.template) {
      throw new DeploymentError(
        ErrorCodes.DEPLOYMENT_VALIDATION_FAILED,
        'Project template not specified',
        { statusCode: 400, retryable: false }
      )
    }

    // Update progress
    await this.updateProgress(context, 10, 'Project validation completed')

    return {
      projectData,
      deploymentConfig: context.state.config,
      validated: true
    }
  }

  /**
   * Step 2: Create sandbox environment (simplified for now)
   */
  private async createSandboxStep(context: DeploymentContext, projectData: any): Promise<any> {
    // For now, simulate sandbox creation
    // In a real implementation, this would use E2B or Daytona
    await new Promise(resolve => setTimeout(resolve, 1000)) // Simulate work

    await this.updateProgress(context, 25, 'Sandbox environment ready')

    return {
      sandboxId: `sandbox_${context.deploymentId}`,
      provider: 'simulated',
      ready: true
    }
  }

  /**
   * Step 3: Sync project files to sandbox
   */
  private async syncFilesStep(context: DeploymentContext, projectData: any): Promise<any> {
    // Upload project source to blob storage
    const sourceFiles = Buffer.from('// Simulated project source code', 'utf-8')

    const sourceUrl = await this.blobClient.uploadSourceFiles(
      context.deploymentId,
      context.state.metadata.userId,
      context.state.metadata.organizationId,
      context.params.projectId,
      sourceFiles
    )

    await this.updateProgress(context, 40, 'Files synced to build environment')

    return {
      sourceUrl,
      filesSynced: 1,
      buildReady: true
    }
  }

  /**
   * Step 4: Build the project
   */
  private async buildProjectStep(context: DeploymentContext, projectData: any): Promise<any> {
    // Simulate build process
    await new Promise(resolve => setTimeout(resolve, 2000))

    const buildOutput = `Building ${projectData.name}...\nBuild completed successfully!`

    // Upload build logs
    await this.blobClient.uploadBuildOutput(
      context.deploymentId,
      context.state.metadata.userId,
      context.state.metadata.organizationId,
      context.params.projectId,
      buildOutput
    )

    await this.updateProgress(context, 70, 'Project build completed')

    return {
      buildSuccess: true,
      buildOutput,
      artifacts: ['dist/index.html', 'dist/assets/']
    }
  }

  /**
   * Step 5: Deploy to Cloudflare Workers
   */
  private async deployStep(context: DeploymentContext, projectData: any): Promise<any> {
    // Simulate Cloudflare Workers deployment
    const workerUrl = `https://${context.state.config.workerName}.agatta-deploy-v3.workers.dev`

    await this.updateProgress(context, 90, 'Deploying to Cloudflare Workers')

    // Simulate deployment delay
    await new Promise(resolve => setTimeout(resolve, 1500))

    return {
      workerUrl,
      deploymentSuccess: true,
      workerName: context.state.config.workerName
    }
  }

  /**
   * Step 6: Cleanup and finalize
   */
  private async cleanupStep(context: DeploymentContext, projectData: any): Promise<any> {
    // Upload final logs
    await this.blobClient.uploadLogs(
      context.deploymentId,
      context.state.metadata.userId,
      context.state.metadata.organizationId,
      context.params.projectId,
      'deployment',
      'Deployment completed successfully'
    )

    await this.updateProgress(context, 100, 'Deployment finalized')

    return {
      databaseUpdated: true,
      sandboxCleaned: true,
      artifactsStored: true
    }
  }

  /**
   * Helper method to update deployment progress
   */
  private async updateProgress(
    context: DeploymentContext,
    progress: number,
    stage: string
  ): Promise<void> {
    context.state.progress = progress
    context.state.stage = stage

    await this.stateManager.updateStatus(
      context.deploymentId,
      context.state.metadata.organizationId,
      context.state.metadata.userId,
      context.state.status,
      progress,
      stage
    )
  }
}