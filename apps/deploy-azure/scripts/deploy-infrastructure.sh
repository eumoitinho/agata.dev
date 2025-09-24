#!/bin/bash

# Azure Deploy V3 - Infrastructure Deployment Script
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
TERRAFORM_DIR="./infrastructure/terraform"
TFVARS_FILE="terraform.tfvars"

# Functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

check_prerequisites() {
    log_info "Checking prerequisites..."

    # Check Azure CLI
    if ! command -v az &> /dev/null; then
        log_error "Azure CLI is not installed. Please install it first:"
        echo "curl -sL https://aka.ms/InstallAzureCLIDeb | sudo bash"
        exit 1
    fi

    # Check Terraform
    if ! command -v terraform &> /dev/null; then
        log_error "Terraform is not installed. Please install it first:"
        echo "https://learn.hashicorp.com/tutorials/terraform/install-cli"
        exit 1
    fi

    # Check if logged in to Azure
    if ! az account show &> /dev/null; then
        log_error "Not logged in to Azure. Please run: az login"
        exit 1
    fi

    log_success "Prerequisites check passed"
}

setup_terraform_vars() {
    log_info "Setting up Terraform variables..."

    if [ ! -f "$TERRAFORM_DIR/$TFVARS_FILE" ]; then
        log_warning "terraform.tfvars not found, creating from example..."
        cp "$TERRAFORM_DIR/terraform.tfvars.example" "$TERRAFORM_DIR/$TFVARS_FILE"

        # Get current Azure context
        SUBSCRIPTION_ID=$(az account show --query id -o tsv)
        TENANT_ID=$(az account show --query tenantId -o tsv)

        # Update tfvars with current subscription
        sed -i "s/your-azure-subscription-id/$SUBSCRIPTION_ID/g" "$TERRAFORM_DIR/$TFVARS_FILE"
        sed -i "s/your-azure-tenant-id/$TENANT_ID/g" "$TERRAFORM_DIR/$TFVARS_FILE"

        log_warning "Please review and update $TERRAFORM_DIR/$TFVARS_FILE before continuing"
        echo "Press Enter to continue or Ctrl+C to exit..."
        read -r
    fi
}

deploy_infrastructure() {
    log_info "Deploying Azure infrastructure..."

    cd "$TERRAFORM_DIR"

    # Initialize Terraform
    log_info "Initializing Terraform..."
    terraform init

    # Plan deployment
    log_info "Planning Terraform deployment..."
    terraform plan -var-file="$TFVARS_FILE" -out="tfplan"

    echo
    log_warning "Review the Terraform plan above. Do you want to proceed with deployment? (y/N)"
    read -r response

    if [[ "$response" =~ ^[Yy]$ ]]; then
        # Apply deployment
        log_info "Applying Terraform deployment..."
        terraform apply "tfplan"

        # Output configuration
        log_info "Generating environment configuration..."
        terraform output -json > "../terraform-outputs.json"

        log_success "Infrastructure deployment completed!"
        log_info "Terraform outputs saved to terraform-outputs.json"
    else
        log_warning "Deployment cancelled by user"
        rm -f tfplan
        exit 0
    fi

    cd - > /dev/null
}

generate_env_config() {
    log_info "Generating .env configuration..."

    if [ ! -f "infrastructure/terraform-outputs.json" ]; then
        log_error "Terraform outputs not found. Run deployment first."
        exit 1
    fi

    # Create .env file from outputs
    cat > .env << EOF
# Azure Deploy V3 Configuration
# Generated automatically from Terraform outputs

# Azure Core Configuration
AZURE_SUBSCRIPTION_ID=$(az account show --query id -o tsv)
AZURE_TENANT_ID=$(az account show --query tenantId -o tsv)
AZURE_RESOURCE_GROUP=$(jq -r '.resource_group_name.value' infrastructure/terraform-outputs.json)
AZURE_LOCATION="East US"

# Container Registry
AZURE_CONTAINER_REGISTRY=$(jq -r '.container_registry_login_server.value' infrastructure/terraform-outputs.json)
AZURE_CONTAINER_REGISTRY_USERNAME=$(jq -r '.container_registry_admin_username.value' infrastructure/terraform-outputs.json)
AZURE_CONTAINER_REGISTRY_PASSWORD=$(jq -r '.container_registry_admin_password.value' infrastructure/terraform-outputs.json)

# Service Bus
AZURE_SERVICE_BUS_CONNECTION_STRING=$(jq -r '.servicebus_connection_string.value' infrastructure/terraform-outputs.json)
AZURE_SERVICE_BUS_QUEUE_NAME="deployment-queue"

# Storage
AZURE_STORAGE_CONNECTION_STRING=$(jq -r '.storage_account_connection_string.value' infrastructure/terraform-outputs.json)
AZURE_STORAGE_CONTAINER_NAME="deployments"

# Cosmos DB
AZURE_COSMOS_CONNECTION_STRING=$(jq -r '.cosmos_connection_string.value' infrastructure/terraform-outputs.json)
AZURE_COSMOS_DATABASE_NAME="deployments"
AZURE_COSMOS_CONTAINER_NAME="deployments"

# Key Vault
AZURE_KEY_VAULT_URI=$(jq -r '.key_vault_uri.value' infrastructure/terraform-outputs.json)

# Container Apps
AZURE_CONTAINER_APP_ENVIRONMENT_ID=$(jq -r '.container_app_environment_id.value' infrastructure/terraform-outputs.json)

# Managed Identity
AZURE_MANAGED_IDENTITY_CLIENT_ID=$(jq -r '.managed_identity_client_id.value' infrastructure/terraform-outputs.json)

# Application Insights
AZURE_APPLICATION_INSIGHTS_CONNECTION_STRING=$(jq -r '.application_insights_connection_string.value' infrastructure/terraform-outputs.json)

# Application Settings
PORT=3010
NODE_ENV=production
LOG_LEVEL=info

# Deployment Configuration
MAX_CONCURRENT_DEPLOYMENTS=10
DEPLOYMENT_TIMEOUT_MS=600000
BUILD_CONTAINER_CPU=2
BUILD_CONTAINER_MEMORY=4Gi

# Queue Configuration
ENABLE_QUEUE_CONSUMER=true
QUEUE_BATCH_SIZE=5
MAX_DEPLOYMENT_RETRIES=3

# Feature Flags
ENABLE_AUTO_SCALING=true
ENABLE_CDN_INTEGRATION=true
ENABLE_MULTI_REGION=false
EOF

    log_success ".env file generated successfully!"
    log_warning "Review the .env file and add any additional configuration as needed"
}

cleanup() {
    log_info "Cleaning up temporary files..."
    rm -f "$TERRAFORM_DIR/tfplan"
    rm -f "$TERRAFORM_DIR/.terraform.lock.hcl"
}

show_next_steps() {
    echo
    log_success "🎉 Infrastructure deployment completed!"
    echo
    log_info "Next steps:"
    echo "1. Review the generated .env file"
    echo "2. Build and deploy the application:"
    echo "   bun install"
    echo "   bun run build"
    echo "   bun run azure:deploy"
    echo
    echo "3. Test the deployment:"
    echo "   curl http://localhost:3010/health"
    echo
    log_info "For more information, see the README.md file"
}

# Main execution
main() {
    echo "🚀 Azure Deploy V3 - Infrastructure Deployment"
    echo "=============================================="
    echo

    check_prerequisites
    setup_terraform_vars
    deploy_infrastructure
    generate_env_config
    cleanup
    show_next_steps
}

# Handle interrupts
trap cleanup EXIT INT TERM

# Run main function
main "$@"