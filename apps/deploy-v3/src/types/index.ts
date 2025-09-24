/*
 * SPDX-License-Identifier: AGPL-3.0-only
 * types/index.ts
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
 * Azure Container Apps Environment Variables
 */
export interface AzureBindings {
  // Database
  POSTGRES_URL: string
  DATABASE_ID?: string

  // Azure Services
  AZURE_SUBSCRIPTION_ID: string
  AZURE_SERVICE_BUS_CONNECTION_STRING: string
  AZURE_COSMOS_CONNECTION_STRING: string
  AZURE_STORAGE_CONNECTION_STRING: string
  AZURE_KEY_VAULT_URI?: string

  // Service Configuration
  DEPLOYMENT_QUEUE_NAME?: string
  ENVIRONMENT?: string
  LOG_LEVEL?: string

  // Authentication
  BETTER_AUTH_SECRET: string

  // Platform Mode
  PLATFORM_MODE?: 'cloudflare' | 'azure' | 'hybrid'
}

/**
 * Request Context Variables
 */
export interface Variables {
  requestId: string
  logger: {
    info: (message: string, data?: any) => void
    warn: (message: string, data?: any) => void
    error: (message: string, data?: any) => void
  }
}

// Re-export types from other modules
export * from './deployment'
export * from './queue'