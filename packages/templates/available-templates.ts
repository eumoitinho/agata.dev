/*
 * SPDX-License-Identifier: AGPL-3.0-only
 * available-templates.ts
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
 * Available project templates in the Agatta platform
 */
export const AVAILABLE_TEMPLATES = {
  'vite': {
    id: 'vite',
    name: 'Vite React Template',
    description: 'Modern React application with Vite, TypeScript, and Shadcn UI',
    category: 'web',
    deploymentType: 'cloudflare', // Uses original Cloudflare Workers deployment
    icon: '⚡',
    tags: ['react', 'vite', 'typescript', 'shadcn'],
    runCommand: 'bun dev',
    buildCommand: 'bun build',
    features: [
      'React 19 with TypeScript',
      'Vite for fast development',
      'Shadcn UI components',
      'Tailwind CSS styling',
      'Component inspector',
      'Cloudflare Workers deployment'
    ]
  },
  'azure-deploy-v3': {
    id: 'azure-deploy-v3',
    name: 'Azure Deploy V3 React App',
    description: 'React application optimized for Azure deployment with Container Apps',
    category: 'web',
    deploymentType: 'azure', // Uses new Azure Deploy V3 service
    icon: '☁️',
    tags: ['react', 'azure', 'typescript', 'container-apps'],
    runCommand: 'bun dev',
    buildCommand: 'bun build',
    deployCommand: 'bun deploy',
    features: [
      'Azure Container Apps deployment',
      'Azure Service Bus integration',
      'Azure Cosmos DB support',
      'Azure Blob Storage',
      'Application Insights monitoring',
      'Auto-scaling and health checks',
      'React 19 with TypeScript',
      'Shadcn UI components',
      'Docker containerization'
    ]
  }
} as const

/**
 * Template categories for organization
 */
export const TEMPLATE_CATEGORIES = {
  web: {
    id: 'web',
    name: 'Web Applications',
    description: 'Frontend web applications and SPAs',
    icon: '🌐'
  },
  api: {
    id: 'api',
    name: 'API Services',
    description: 'Backend APIs and microservices',
    icon: '🔗'
  },
  fullstack: {
    id: 'fullstack',
    name: 'Full Stack',
    description: 'Complete full-stack applications',
    icon: '🚀'
  },
  mobile: {
    id: 'mobile',
    name: 'Mobile Apps',
    description: 'Mobile and hybrid applications',
    icon: '📱'
  }
} as const

/**
 * Deployment types and their characteristics
 */
export const DEPLOYMENT_TYPES = {
  cloudflare: {
    id: 'cloudflare',
    name: 'Cloudflare Workers',
    description: 'Serverless edge computing',
    provider: 'Cloudflare',
    icon: '🔶',
    features: ['Global edge deployment', 'Instant scaling', 'Workers KV storage']
  },
  azure: {
    id: 'azure',
    name: 'Azure Container Apps',
    description: 'Managed container hosting',
    provider: 'Microsoft Azure',
    icon: '☁️',
    features: ['Container-based deployment', 'Azure services integration', 'Auto-scaling', 'Enterprise security']
  }
} as const

/**
 * Get template by ID
 */
export function getTemplateById(templateId: string) {
  return AVAILABLE_TEMPLATES[templateId as keyof typeof AVAILABLE_TEMPLATES]
}

/**
 * Get all templates for a specific deployment type
 */
export function getTemplatesByDeploymentType(deploymentType: string) {
  return Object.values(AVAILABLE_TEMPLATES).filter(
    template => template.deploymentType === deploymentType
  )
}

/**
 * Get all templates for a specific category
 */
export function getTemplatesByCategory(category: string) {
  return Object.values(AVAILABLE_TEMPLATES).filter(
    template => template.category === category
  )
}

/**
 * Check if template uses Azure Deploy V3
 */
export function isAzureTemplate(templateId: string): boolean {
  const template = getTemplateById(templateId)
  return template?.deploymentType === 'azure'
}

/**
 * Get deployment configuration for a template
 */
export function getTemplateDeploymentConfig(templateId: string) {
  const template = getTemplateById(templateId)
  if (!template) return null

  const deploymentType = DEPLOYMENT_TYPES[template.deploymentType as keyof typeof DEPLOYMENT_TYPES]

  return {
    template,
    deploymentType,
    isAzure: template.deploymentType === 'azure',
    isCloudflare: template.deploymentType === 'cloudflare',
    serviceEndpoint: template.deploymentType === 'azure'
      ? '/api/deploy/v3'
      : '/api/deploy/v2'
  }
}