#!/bin/bash

# Build script for Azure Container Instance
# Builds projects in isolated environment

set -euo pipefail

echo "🚀 Starting Azure build process..."

# Configuration from environment
PROJECT_ID=${PROJECT_ID:-"unknown"}
DEPLOYMENT_ID=${DEPLOYMENT_ID:-"unknown"}
BUILD_COMMAND=${BUILD_COMMAND:-"npm run build"}
AZURE_REGISTRY=${AZURE_REGISTRY:-"libra"}
BUILD_TIMEOUT=${BUILD_TIMEOUT:-"600"} # 10 minutes

echo "📋 Build Configuration:"
echo "  Project ID: $PROJECT_ID"
echo "  Deployment ID: $DEPLOYMENT_ID"
echo "  Build Command: $BUILD_COMMAND"
echo "  Registry: $AZURE_REGISTRY"
echo "  Timeout: ${BUILD_TIMEOUT}s"

# Create build directory
BUILD_DIR="/workspace/build"
mkdir -p "$BUILD_DIR"
cd "$BUILD_DIR"

echo "📥 Downloading project files from Azure Blob Storage..."

# Download project files from blob storage
# This would be implemented with Azure CLI or SDK
az storage blob download-batch \
  --source "deployment-artifacts/$PROJECT_ID/$DEPLOYMENT_ID" \
  --destination "$BUILD_DIR" \
  --pattern "*" || {
    echo "❌ Failed to download project files"
    exit 1
  }

echo "✅ Project files downloaded successfully"

# Detect project type and package manager
echo "🔍 Detecting project configuration..."

if [ -f "bun.lockb" ]; then
  PACKAGE_MANAGER="bun"
  INSTALL_CMD="bun install --frozen-lockfile"
elif [ -f "pnpm-lock.yaml" ]; then
  PACKAGE_MANAGER="pnpm"
  INSTALL_CMD="pnpm install --frozen-lockfile"
elif [ -f "yarn.lock" ]; then
  PACKAGE_MANAGER="yarn"
  INSTALL_CMD="yarn install --frozen-lockfile"
else
  PACKAGE_MANAGER="npm"
  INSTALL_CMD="npm ci"
fi

echo "  Package Manager: $PACKAGE_MANAGER"

# Install dependencies
echo "📦 Installing dependencies..."
timeout "$BUILD_TIMEOUT" $INSTALL_CMD || {
  echo "❌ Dependency installation failed or timed out"
  exit 1
}

echo "✅ Dependencies installed successfully"

# Run build command
echo "🔨 Building project..."
timeout "$BUILD_TIMEOUT" eval "$BUILD_COMMAND" || {
  echo "❌ Build failed or timed out"
  exit 1
}

echo "✅ Build completed successfully"

# Create Dockerfile if not exists
if [ ! -f "Dockerfile" ]; then
  echo "📝 Creating Dockerfile..."

  # Detect framework and create appropriate Dockerfile
  if [ -f "next.config.js" ] || [ -f "next.config.mjs" ] || [ -f "next.config.ts" ]; then
    # Next.js project
    cat > Dockerfile << 'EOF'
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY .next ./.next
COPY public ./public
COPY next.config* ./
ENV NODE_ENV=production
EXPOSE 3000
CMD ["npm", "start"]
EOF

  elif [ -f "vite.config.js" ] || [ -f "vite.config.ts" ]; then
    # Vite project
    cat > Dockerfile << 'EOF'
FROM nginx:alpine
COPY dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
EOF

  else
    # Generic Node.js app
    cat > Dockerfile << 'EOF'
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
ENV NODE_ENV=production
EXPOSE 3000
CMD ["npm", "start"]
EOF
  fi

  echo "✅ Dockerfile created"
fi

# Build Docker image
IMAGE_NAME="$AZURE_REGISTRY.azurecr.io/$PROJECT_ID:$DEPLOYMENT_ID"
echo "🐳 Building Docker image: $IMAGE_NAME"

docker build -t "$IMAGE_NAME" . || {
  echo "❌ Docker build failed"
  exit 1
}

echo "✅ Docker image built successfully"

# Login to Azure Container Registry
echo "🔐 Logging into Azure Container Registry..."
az acr login --name "$AZURE_REGISTRY" || {
  echo "❌ ACR login failed"
  exit 1
}

# Push image to registry
echo "📤 Pushing image to registry..."
docker push "$IMAGE_NAME" || {
  echo "❌ Image push failed"
  exit 1
}

echo "✅ Image pushed successfully: $IMAGE_NAME"

# Tag as latest for this project
LATEST_IMAGE="$AZURE_REGISTRY.azurecr.io/$PROJECT_ID:latest"
docker tag "$IMAGE_NAME" "$LATEST_IMAGE"
docker push "$LATEST_IMAGE"

echo "✅ Latest tag updated: $LATEST_IMAGE"

# Upload build logs to blob storage
echo "📄 Uploading build logs..."
BUILD_LOG="/tmp/build.log"
echo "Build completed successfully at $(date)" > "$BUILD_LOG"
echo "Image: $IMAGE_NAME" >> "$BUILD_LOG"
echo "Size: $(docker image inspect --format='{{.Size}}' "$IMAGE_NAME")" >> "$BUILD_LOG"

az storage blob upload \
  --container-name "deployment-logs" \
  --file "$BUILD_LOG" \
  --name "$PROJECT_ID/$DEPLOYMENT_ID/build.log" \
  --overwrite || echo "⚠️ Failed to upload build logs"

echo "🎉 Build process completed successfully!"
echo "Image: $IMAGE_NAME"