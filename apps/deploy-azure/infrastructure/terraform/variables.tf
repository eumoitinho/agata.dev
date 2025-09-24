# Azure subscription and tenant
variable "subscription_id" {
  description = "Azure subscription ID"
  type        = string
  default     = ""
}

variable "tenant_id" {
  description = "Azure tenant ID"
  type        = string
  default     = ""
}

# Resource naming
variable "resource_group_name" {
  description = "Name of the resource group"
  type        = string
  default     = "libra-deploy-v3-rg"
}

variable "location" {
  description = "Azure region for resources"
  type        = string
  default     = "East US"
}

variable "project_name" {
  description = "Name of the project"
  type        = string
  default     = "libra-deploy-v3"
}

variable "environment" {
  description = "Environment name (dev, staging, prod)"
  type        = string
  default     = "production"
}

# Container Registry
variable "container_registry_name" {
  description = "Name of the Container Registry"
  type        = string
  default     = "librav3registry"
}

variable "container_registry_sku" {
  description = "SKU for Container Registry"
  type        = string
  default     = "Basic"
  validation {
    condition     = contains(["Basic", "Standard", "Premium"], var.container_registry_sku)
    error_message = "Container registry SKU must be Basic, Standard, or Premium."
  }
}

# Storage Account
variable "storage_account_name" {
  description = "Name of the Storage Account"
  type        = string
  default     = "librav3storage"
}

variable "storage_account_tier" {
  description = "Tier for Storage Account"
  type        = string
  default     = "Standard"
}

variable "storage_replication_type" {
  description = "Replication type for Storage Account"
  type        = string
  default     = "LRS"
}

# Service Bus
variable "servicebus_namespace_name" {
  description = "Name of the Service Bus namespace"
  type        = string
  default     = "libra-v3-servicebus"
}

variable "servicebus_sku" {
  description = "SKU for Service Bus namespace"
  type        = string
  default     = "Standard"
  validation {
    condition     = contains(["Basic", "Standard", "Premium"], var.servicebus_sku)
    error_message = "Service Bus SKU must be Basic, Standard, or Premium."
  }
}

# Cosmos DB
variable "cosmos_account_name" {
  description = "Name of the Cosmos DB account"
  type        = string
  default     = "libra-v3-cosmos"
}

variable "cosmos_consistency_level" {
  description = "Consistency level for Cosmos DB"
  type        = string
  default     = "BoundedStaleness"
  validation {
    condition = contains([
      "BoundedStaleness",
      "Eventual",
      "Session",
      "Strong",
      "ConsistentPrefix"
    ], var.cosmos_consistency_level)
    error_message = "Invalid Cosmos DB consistency level."
  }
}

variable "cosmos_throughput" {
  description = "Throughput for Cosmos DB container"
  type        = number
  default     = 400
  validation {
    condition     = var.cosmos_throughput >= 400 && var.cosmos_throughput <= 1000000
    error_message = "Cosmos DB throughput must be between 400 and 1,000,000."
  }
}

# Key Vault
variable "key_vault_name" {
  description = "Name of the Key Vault"
  type        = string
  default     = "libra-v3-keyvault"
}

variable "key_vault_sku" {
  description = "SKU for Key Vault"
  type        = string
  default     = "standard"
  validation {
    condition     = contains(["standard", "premium"], var.key_vault_sku)
    error_message = "Key Vault SKU must be standard or premium."
  }
}

# Container Apps
variable "container_app_environment_name" {
  description = "Name of the Container App Environment"
  type        = string
  default     = "libra-v3-containerapp-env"
}

# Log Analytics
variable "log_analytics_workspace_name" {
  description = "Name of the Log Analytics Workspace"
  type        = string
  default     = "libra-v3-logs"
}

variable "log_analytics_retention_days" {
  description = "Retention period for logs in days"
  type        = number
  default     = 30
  validation {
    condition     = var.log_analytics_retention_days >= 30 && var.log_analytics_retention_days <= 730
    error_message = "Log Analytics retention must be between 30 and 730 days."
  }
}

# Application Insights
variable "application_insights_name" {
  description = "Name of Application Insights"
  type        = string
  default     = "libra-v3-insights"
}

# Managed Identity
variable "managed_identity_name" {
  description = "Name of the User Assigned Managed Identity"
  type        = string
  default     = "libra-v3-identity"
}

# Tags
variable "tags" {
  description = "Tags to apply to all resources"
  type        = map(string)
  default = {
    Project     = "libra-deploy-v3"
    ManagedBy   = "Terraform"
    CreatedBy   = "Claude"
  }
}