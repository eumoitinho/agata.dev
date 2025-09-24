/*
 * SPDX-License-Identifier: AGPL-3.0-only
 * queue.ts - Azure Service Bus Types
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

import type { ServiceBusReceivedMessage } from '@azure/service-bus'

/**
 * Azure Service Bus message metadata for tracking and debugging
 */
export interface ServiceBusMessageMetadata {
  /** Unique identifier for this deployment */
  deploymentId: string
  /** Timestamp when the message was created */
  createdAt: string
  /** User who initiated the deployment */
  userId: string
  /** Organization ID for quota and permissions */
  organizationId: string
  /** Message version for compatibility */
  version: string
  /** Priority level (1-10, higher = more priority) */
  priority?: number
  /** Retry count for this message */
  retryCount?: number
  /** Previous error message if this is a retry */
  lastError?: string
}

/**
 * Core deployment parameters for Azure Service Bus processing
 */
export interface ServiceBusDeploymentParams {
  /** Project ID to deploy */
  projectId: string
  /** Optional custom domain for deployment */
  customDomain?: string
  /** Organization ID for permissions and quota */
  orgId: string
  /** User ID who initiated deployment */
  userId: string
}

/**
 * Azure Service Bus message structure for deployment requests
 */
export interface ServiceBusMessage {
  /** Message metadata */
  metadata: ServiceBusMessageMetadata
  /** Deployment parameters */
  params: ServiceBusDeploymentParams
  /** Optional configuration overrides */
  config?: {
    /** Custom timeout in milliseconds */
    timeout?: number
    /** Skip certain steps (for debugging) */
    skipSteps?: string[]
    /** Enable debug logging */
    debug?: boolean
  }
}

/**
 * Azure Service Bus batch processing interface
 */
export interface ServiceBusBatch {
  /** Array of received messages in this batch */
  messages: ServiceBusReceivedMessage[]
  /** Batch metadata */
  metadata: {
    /** Batch ID for tracking */
    batchId: string
    /** Timestamp when batch was created */
    createdAt: string
    /** Number of messages in batch */
    size: number
  }
}

/**
 * Service Bus processing result for individual messages
 */
export interface ServiceBusProcessingResult {
  /** Azure Service Bus message ID */
  messageId: string
  /** Deployment ID for tracking */
  deploymentId: string
  /** Whether processing was successful */
  success: boolean
  /** Error message if processing failed */
  error?: string
  /** Processing duration in milliseconds */
  duration: number
  /** Final deployment status */
  status?: string
  /** Azure Service Bus delivery count */
  deliveryCount?: number
}

/**
 * Service Bus batch processing result
 */
export interface ServiceBusBatchResult {
  /** Batch ID that was processed */
  batchId: string
  /** Results for individual messages */
  results: ServiceBusProcessingResult[]
  /** Overall batch success rate */
  successRate: number
  /** Total processing time for batch */
  totalDuration: number
  /** Number of messages that need retry */
  retryCount: number
}

/**
 * Service Bus producer options for sending messages
 */
export interface ServiceBusProducerOptions {
  /** Delay before processing (in seconds) */
  delaySeconds?: number
  /** Message deduplication ID */
  messageId?: string
  /** Session ID for session-based queues */
  sessionId?: string
  /** Time to live for the message */
  timeToLive?: number
  /** Scheduled enqueue time */
  scheduledEnqueueTime?: Date
}

/**
 * Dead letter queue message with additional Azure Service Bus context
 */
export interface DLQServiceBusMessage extends ServiceBusMessage {
  /** Reason why message was sent to DLQ */
  dlqReason: 'max_delivery_count_exceeded' | 'processing_timeout' | 'invalid_message' | 'system_error' | 'ttl_expired'
  /** Original queue name */
  originalQueue: string
  /** Final error that caused DLQ placement */
  finalError: string
  /** Total number of delivery attempts */
  totalDeliveries: number
  /** Azure Service Bus delivery count */
  deliveryCount: number
  /** Message enqueued time */
  enqueuedTimeUtc: string
  /** Message expired time if TTL exceeded */
  expiresAtUtc?: string
}

/**
 * Azure Service Bus Queue Configuration
 */
export interface ServiceBusQueueConfig {
  /** Queue name */
  queueName: string
  /** Maximum delivery count before moving to DLQ */
  maxDeliveryCount: number
  /** Message time to live */
  defaultMessageTimeToLive: number
  /** Dead letter queue time to live */
  deadLetteringOnMessageExpiration: boolean
  /** Enable duplicate detection */
  requiresDuplicateDetection: boolean
  /** Duplicate detection history time window */
  duplicateDetectionHistoryTimeWindow?: number
}