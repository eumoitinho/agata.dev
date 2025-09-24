/*
 * SPDX-License-Identifier: AGPL-3.0-only
 * index.ts
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
 *
 */

export type { TemplateConfig } from './types'
import { fileStructure } from './vite-shadcn-template'
import { azureDeployV3FileStructure, azureDeployV3Template } from './azure-deploy-v3-template'

export const templateConfigs = {
  vite: fileStructure,
  'azure-deploy-v3': azureDeployV3FileStructure
}

export const templateSpecs = {
  vite: {
    id: 'vite',
    name: 'Vite React Template',
    runCommand: 'bun dev'
  },
  'azure-deploy-v3': azureDeployV3Template
}

// Export template registry and utilities
export {
  AVAILABLE_TEMPLATES,
  TEMPLATE_CATEGORIES,
  DEPLOYMENT_TYPES,
  getTemplateById,
  getTemplatesByDeploymentType,
  getTemplatesByCategory,
  isAzureTemplate,
  getTemplateDeploymentConfig
} from './available-templates'
