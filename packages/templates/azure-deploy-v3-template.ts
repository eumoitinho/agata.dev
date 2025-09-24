/*
 * SPDX-License-Identifier: AGPL-3.0-only
 * azure-deploy-v3-template.ts
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

import type { TemplateConfig } from './types'

export const azureDeployV3Template: TemplateConfig = {
  id: 'azure-deploy-v3',
  name: 'Azure Deploy V3 React App',
  runCommand: 'bun dev',
  fileStructure: {
    "README.md": {
      purpose: "Project documentation and setup instructions",
      description: "Main project documentation with Azure Deploy V3 specific instructions"
    },
    "package.json": {
      purpose: "Node.js package configuration with Azure Deploy V3 deployment scripts",
      description: "Contains scripts for building and deploying to Azure Container Apps"
    },
    "tsconfig.json": {
      purpose: "TypeScript configuration optimized for Azure deployment",
      description: "TypeScript compiler configuration"
    },
    "vite.config.ts": {
      purpose: "Vite build configuration with Azure deployment optimizations",
      description: "Vite bundler configuration for Azure deployment"
    },
    "index.html": {
      purpose: "Main HTML entry point",
      description: "HTML template with Azure-optimized meta tags"
    },
    "azure-deploy.yaml": {
      purpose: "Azure Container Apps deployment configuration",
      description: "Deployment configuration for Azure Container Apps using Deploy V3"
    },
    ".env.example": {
      purpose: "Environment variables template for Azure services",
      description: "Template showing required Azure environment variables"
    },
    "src/main.tsx": {
      purpose: "React application entry point",
      description: "Main React application bootstrap with Azure monitoring"
    },
    "src/App.tsx": {
      purpose: "Main React application component",
      description: "Root React component with Azure integrations"
    },
    "src/components/ui/": {
      purpose: "Shadcn UI components directory",
      description: "Pre-configured UI components from shadcn/ui"
    },
    "src/lib/utils.ts": {
      purpose: "Utility functions with Azure helpers",
      description: "Common utilities and Azure SDK helpers"
    },
    "src/lib/azure.ts": {
      purpose: "Azure services integration",
      description: "Azure SDK integration and helpers"
    },
    "src/hooks/useAzureMonitoring.ts": {
      purpose: "Azure Application Insights monitoring hook",
      description: "React hook for Azure monitoring and telemetry"
    },
    "Dockerfile": {
      purpose: "Container configuration for Azure Container Apps",
      description: "Multi-stage Docker build optimized for Azure"
    },
    "components.json": {
      purpose: "Shadcn UI configuration",
      description: "Configuration for shadcn/ui component system"
    },
    "tailwind.config.js": {
      purpose: "Tailwind CSS configuration",
      description: "Tailwind CSS styling configuration"
    }
  },
  conventions: [
    "Uses Azure Deploy V3 for deployment to Azure Container Apps",
    "Configured for Azure Service Bus, Cosmos DB, and Blob Storage integration",
    "Follows Azure Well-Architected Framework principles",
    "Uses TypeScript for type safety",
    "Implements Azure Application Insights for monitoring",
    "Uses Tailwind CSS with shadcn/ui for consistent UI",
    "Follows React best practices with functional components and hooks",
    "Uses Vite for fast development and optimized production builds",
    "Implements Azure authentication patterns",
    "Uses environment variables for Azure service configuration"
  ],
  dependencies: {
    "react": "^19.1.0",
    "react-dom": "^19.1.0",
    "@types/react": "^19.1.13",
    "@types/react-dom": "^19.1.9",
    "typescript": "^5.9.2",
    "vite": "^6.0.7",
    "@vitejs/plugin-react": "^5.0.0",
    "tailwindcss": "^4.2.11",
    "@tailwindcss/typography": "^0.5.15",
    "autoprefixer": "^11.0.1",
    "postcss": "^8.5.12",
    "clsx": "^2.2.0",
    "tailwind-merge": "^2.6.0",
    "class-variance-authority": "^0.7.1",
    "@radix-ui/react-slot": "^1.2.0",
    "lucide-react": "^0.468.0",
    "@azure/monitor-web": "^1.0.0",
    "@azure/identity": "^4.4.1",
    "@azure/service-bus": "^7.9.5",
    "@azure/storage-blob": "^12.25.0",
    "@azure/app-configuration": "^1.7.0"
  },
  scripts: {
    "dev": "vite",
    "build": "tsc && vite build",
    "lint": "biome check .",
    "preview": "vite preview",
    "typecheck": "tsc --noEmit",
    "deploy": "bun build && az containerapp update --yaml azure-deploy.yaml",
    "azure:logs": "az containerapp logs show --name $PROJECT_NAME --resource-group $AZURE_RESOURCE_GROUP --follow",
    "azure:scale": "az containerapp revision list --name $PROJECT_NAME --resource-group $AZURE_RESOURCE_GROUP"
  }
}

export const azureDeployV3FileStructure = {
  "README.md": {
    "type": "file",
    "isBinary": false,
    "content": `# Azure Deploy V3 React Application

A modern React application template optimized for deployment using Azure Deploy V3 service with Azure Container Apps.

![React](https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)
![Azure](https://img.shields.io/badge/Microsoft_Azure-0078D4?style=for-the-badge&logo=microsoft-azure&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-B73BFE?style=for-the-badge&logo=vite&logoColor=FFD62E)

## Features

- ⚡️ **Azure Deploy V3** - Automated deployment to Azure Container Apps
- 🚀 **React 19** - Latest React with concurrent features
- 🔷 **Azure Integration** - Service Bus, Cosmos DB, Blob Storage
- 🎨 **Shadcn UI + Tailwind** - Modern, accessible UI components
- 📊 **Azure Monitoring** - Application Insights integration
- 🔒 **Azure Authentication** - Enterprise-ready auth patterns
- 🏗️ **TypeScript** - Full type safety
- ⚡ **Vite** - Lightning-fast development

## Azure Services Used

- **Azure Container Apps** - Serverless container hosting
- **Azure Service Bus** - Message queuing
- **Azure Cosmos DB** - NoSQL database
- **Azure Blob Storage** - File storage
- **Azure Application Insights** - Monitoring and telemetry

## Quick Start

### Prerequisites

- Node.js (v18+)
- Bun (recommended) or npm
- Azure CLI
- Azure subscription

### 1. Environment Setup

\`\`\`bash
# Copy environment template
cp .env.example .env

# Configure your Azure services
vim .env
\`\`\`

### 2. Install Dependencies

\`\`\`bash
bun install
\`\`\`

### 3. Development

\`\`\`bash
# Start development server
bun dev

# In another terminal, start Azure services (optional)
# Make sure your .env is configured with Azure connection strings
\`\`\`

### 4. Deploy to Azure

\`\`\`bash
# Build and deploy using Azure Deploy V3
bun deploy

# Or use the Agatta platform deploy command
bun deploy:v3
\`\`\`

## Environment Variables

Create a \`.env\` file with your Azure configuration:

\`\`\`env
# Azure Services
AZURE_SERVICE_BUS_CONNECTION_STRING=your-service-bus-connection
AZURE_COSMOS_DB_CONNECTION_STRING=your-cosmos-db-connection
AZURE_STORAGE_CONNECTION_STRING=your-storage-connection

# Azure Configuration
AZURE_SUBSCRIPTION_ID=your-subscription-id
AZURE_RESOURCE_GROUP=your-resource-group
AZURE_REGION=eastus2

# Application Insights
APPLICATIONINSIGHTS_CONNECTION_STRING=your-app-insights-connection

# Deployment
PROJECT_NAME=your-project-name
\`\`\`

## Project Structure

\`\`\`
src/
├── components/
│   └── ui/              # Shadcn UI components
├── hooks/
│   └── useAzureMonitoring.ts  # Azure monitoring hook
├── lib/
│   ├── azure.ts         # Azure SDK helpers
│   └── utils.ts         # Utility functions
├── App.tsx              # Main app component
└── main.tsx             # Entry point

azure-deploy.yaml        # Azure Container Apps config
Dockerfile              # Container configuration
\`\`\`

## Azure Deploy V3 Integration

This template is optimized for the Agatta Azure Deploy V3 service:

1. **Automatic Builds** - Vite builds are optimized for Azure
2. **Container Deployment** - Multi-stage Docker builds
3. **Service Integration** - Pre-configured Azure SDK clients
4. **Monitoring** - Built-in Application Insights
5. **Scaling** - Auto-scaling based on demand

## Development Commands

\`\`\`bash
# Development
bun dev                  # Start dev server
bun build               # Build for production
bun preview             # Preview production build

# Azure
bun deploy              # Deploy to Azure
bun azure:logs          # View application logs
bun azure:scale         # Check scaling status

# Code Quality
bun lint                # Lint code
bun typecheck           # Type checking
\`\`\`

## Deployment Process

When you run \`bun deploy\`, the Azure Deploy V3 service will:

1. Build your React application with Vite
2. Create a Docker container
3. Push to Azure Container Registry
4. Deploy to Azure Container Apps
5. Configure auto-scaling and health checks
6. Set up monitoring and logging

## Monitoring

Azure Application Insights is pre-configured to track:

- Page views and user interactions
- Performance metrics
- Error tracking
- Custom events and metrics

Access your monitoring dashboard in the Azure portal.

## Contributing

1. Fork the repository
2. Create your feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## License

AGPL-3.0-only - See LICENSE file for details.

---

Built with ❤️ for [Agatta](https://agatta.dev) Azure Deploy V3
`
  },

  "package.json": {
    "type": "file",
    "isBinary": false,
    "content": JSON.stringify({
      "name": "azure-deploy-v3-react-app",
      "version": "1.0.0",
      "description": "React application optimized for Azure Deploy V3",
      "type": "module",
      "scripts": {
        "dev": "vite",
        "build": "tsc && vite build",
        "lint": "biome check .",
        "preview": "vite preview",
        "typecheck": "tsc --noEmit",
        "deploy": "bun build && az containerapp update --yaml azure-deploy.yaml",
        "azure:logs": "az containerapp logs show --name $PROJECT_NAME --resource-group $AZURE_RESOURCE_GROUP --follow",
        "azure:scale": "az containerapp revision list --name $PROJECT_NAME --resource-group $AZURE_RESOURCE_GROUP"
      },
      "dependencies": {
        "react": "^19.1.0",
        "react-dom": "^19.1.0",
        "clsx": "^2.2.0",
        "tailwind-merge": "^2.6.0",
        "class-variance-authority": "^0.7.1",
        "@radix-ui/react-slot": "^1.2.0",
        "lucide-react": "^0.468.0",
        "@azure/monitor-web": "^1.0.0",
        "@azure/identity": "^4.4.1",
        "@azure/service-bus": "^7.9.5",
        "@azure/storage-blob": "^12.25.0",
        "@azure/app-configuration": "^1.7.0"
      },
      "devDependencies": {
        "@types/react": "^19.1.13",
        "@types/react-dom": "^19.1.9",
        "@types/node": "^24.5.2",
        "typescript": "^5.9.2",
        "vite": "^6.0.7",
        "@vitejs/plugin-react": "^5.0.0",
        "tailwindcss": "^4.2.11",
        "@tailwindcss/typography": "^0.5.15",
        "autoprefixer": "^11.0.1",
        "postcss": "^8.5.12",
        "@biomejs/biome": "^2.2.4"
      }
    }, null, 2)
  },

  "azure-deploy.yaml": {
    "type": "file",
    "isBinary": false,
    "content": `# Azure Container Apps deployment configuration for Deploy V3
# This file is used by the Azure Deploy V3 service

properties:
  managedEnvironmentId: /subscriptions/$(AZURE_SUBSCRIPTION_ID)/resourceGroups/$(AZURE_RESOURCE_GROUP)/providers/Microsoft.App/managedEnvironments/$(AZURE_CONTAINER_ENV_NAME)
  configuration:
    activeRevisionsMode: Single
    ingress:
      external: true
      targetPort: 80
      allowInsecure: false
      traffic:
      - weight: 100
        latestRevision: true
    secrets:
    - name: azure-service-bus-connection
      value: $(AZURE_SERVICE_BUS_CONNECTION_STRING)
    - name: azure-cosmos-db-connection
      value: $(AZURE_COSMOS_DB_CONNECTION_STRING)
    - name: azure-storage-connection
      value: $(AZURE_STORAGE_CONNECTION_STRING)
    - name: app-insights-connection
      value: $(APPLICATIONINSIGHTS_CONNECTION_STRING)

  template:
    containers:
    - name: $(PROJECT_NAME)
      image: $(AZURE_CONTAINER_REGISTRY_SERVER)/$(PROJECT_NAME):latest
      env:
      - name: NODE_ENV
        value: "production"
      - name: AZURE_SERVICE_BUS_CONNECTION_STRING
        secretRef: azure-service-bus-connection
      - name: AZURE_COSMOS_DB_CONNECTION_STRING
        secretRef: azure-cosmos-db-connection
      - name: AZURE_STORAGE_CONNECTION_STRING
        secretRef: azure-storage-connection
      - name: APPLICATIONINSIGHTS_CONNECTION_STRING
        secretRef: app-insights-connection
      - name: AZURE_SUBSCRIPTION_ID
        value: $(AZURE_SUBSCRIPTION_ID)
      - name: AZURE_RESOURCE_GROUP
        value: $(AZURE_RESOURCE_GROUP)

      resources:
        cpu: "0.5"
        memory: "1Gi"

      probes:
      - type: Liveness
        httpGet:
          path: "/health"
          port: 80
        initialDelaySeconds: 10
        periodSeconds: 30
      - type: Readiness
        httpGet:
          path: "/health"
          port: 80
        initialDelaySeconds: 5
        periodSeconds: 10

    scale:
      minReplicas: 1
      maxReplicas: 10
      rules:
      - name: http-scaling
        http:
          metadata:
            concurrentRequests: "100"

location: $(AZURE_REGION)
type: Microsoft.App/containerApps
identity:
  type: SystemAssigned`
  },

  "Dockerfile": {
    "type": "file",
    "isBinary": false,
    "content": `# Multi-stage Dockerfile optimized for Azure Container Apps
FROM node:18-alpine AS base

# Install dependencies only when needed
FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Install Bun
RUN npm install -g bun

# Copy package files
COPY package.json bun.lockb* ./
RUN bun install --frozen-lockfile

# Build stage
FROM base AS builder
WORKDIR /app

# Copy dependencies
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Install Bun in builder
RUN npm install -g bun

# Build the application
ENV NODE_ENV=production
RUN bun run build

# Production stage
FROM nginx:alpine AS runner

# Copy built application
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy nginx configuration
COPY <<EOF /etc/nginx/nginx.conf
events {
    worker_connections 1024;
}

http {
    include /etc/nginx/mime.types;
    default_type application/octet-stream;

    # Gzip compression
    gzip on;
    gzip_vary on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript;

    server {
        listen 80;
        server_name localhost;
        root /usr/share/nginx/html;
        index index.html;

        # Health check endpoint
        location /health {
            access_log off;
            return 200 "healthy\\n";
            add_header Content-Type text/plain;
        }

        # Serve static files
        location / {
            try_files \\$uri \\$uri/ /index.html;

            # Cache static assets
            location ~* \\.(js|css|png|jpg|jpeg|gif|ico|svg)\\$ {
                expires 1y;
                add_header Cache-Control "public, immutable";
            }
        }

        # Security headers
        add_header X-Frame-Options "SAMEORIGIN" always;
        add_header X-Content-Type-Options "nosniff" always;
        add_header X-XSS-Protection "1; mode=block" always;
    }
}
EOF

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]`
  },

  ".env.example": {
    "type": "file",
    "isBinary": false,
    "content": `# Azure Deploy V3 React Application Environment Variables

# Azure Services (Required)
AZURE_SERVICE_BUS_CONNECTION_STRING="Endpoint=sb://your-namespace.servicebus.windows.net/;SharedAccessKeyName=RootManageSharedAccessKey;SharedAccessKey=your-key"
AZURE_COSMOS_DB_CONNECTION_STRING="AccountEndpoint=https://your-account.documents.azure.com:443/;AccountKey=your-key"
AZURE_STORAGE_CONNECTION_STRING="DefaultEndpointsProtocol=https;AccountName=yourstorageaccount;AccountKey=your-key;EndpointSuffix=core.windows.net"

# Azure Configuration (Required)
AZURE_SUBSCRIPTION_ID="12345678-1234-1234-1234-123456789012"
AZURE_RESOURCE_GROUP="your-resource-group"
AZURE_REGION="eastus2"
AZURE_CONTAINER_ENV_NAME="your-container-environment"
AZURE_CONTAINER_REGISTRY_SERVER="yourregistry.azurecr.io"

# Application Insights (Optional but recommended)
APPLICATIONINSIGHTS_CONNECTION_STRING="InstrumentationKey=your-key;IngestionEndpoint=https://eastus2-3.in.applicationinsights.azure.com/;LiveEndpoint=https://eastus2.livediagnostics.monitor.azure.com/"

# Project Configuration
PROJECT_NAME="my-azure-react-app"
NODE_ENV="development"

# Vite Development (Optional)
VITE_APP_NAME="Azure React App"
VITE_AZURE_REGION="eastus2"

# Azure Container Registry (for deployment)
ACR_LOGIN_SERVER="yourregistry.azurecr.io"
ACR_USERNAME="yourregistry"
ACR_PASSWORD="your-acr-password"`
  }
}