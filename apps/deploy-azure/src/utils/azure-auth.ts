/**
 * Azure Authentication and Key Vault Integration
 * Handles Azure AD authentication and secret management
 */

import { DefaultAzureCredential, ManagedIdentityCredential, ClientSecretCredential } from '@azure/identity'
import { SecretClient } from '@azure/keyvault-secrets'
import { createLogger } from './logger'

const logger = createLogger()

// Initialize credential based on environment
export const createAzureCredential = () => {
  if (process.env.AZURE_CLIENT_ID && process.env.AZURE_CLIENT_SECRET && process.env.AZURE_TENANT_ID) {
    // Use service principal authentication
    logger.info('Using Service Principal authentication')
    return new ClientSecretCredential(
      process.env.AZURE_TENANT_ID,
      process.env.AZURE_CLIENT_ID,
      process.env.AZURE_CLIENT_SECRET
    )
  } else if (process.env.NODE_ENV === 'production') {
    // Use managed identity in production
    logger.info('Using Managed Identity authentication')
    return new ManagedIdentityCredential()
  } else {
    // Use default credential chain (includes Azure CLI, Visual Studio, etc.)
    logger.info('Using Default Azure Credential')
    return new DefaultAzureCredential()
  }
}

// Create Azure credential instance
export const azureCredential = createAzureCredential()

/**
 * Key Vault Secret Manager
 */
export class KeyVaultManager {
  private secretClient: SecretClient
  private cache = new Map<string, { value: string; expiry: number }>()
  private cacheTtl = 5 * 60 * 1000 // 5 minutes

  constructor(keyVaultUri: string) {
    this.secretClient = new SecretClient(keyVaultUri, azureCredential)
  }

  /**
   * Get secret from Key Vault with caching
   */
  async getSecret(secretName: string): Promise<string | undefined> {
    try {
      // Check cache first
      const cached = this.cache.get(secretName)
      if (cached && Date.now() < cached.expiry) {
        return cached.value
      }

      logger.debug('Fetching secret from Key Vault', { secretName })

      const secret = await this.secretClient.getSecret(secretName)
      const value = secret.value

      if (value) {
        // Cache the secret
        this.cache.set(secretName, {
          value,
          expiry: Date.now() + this.cacheTtl
        })
      }

      return value

    } catch (error) {
      logger.error('Failed to get secret from Key Vault', {
        secretName,
        error: error instanceof Error ? error.message : String(error)
      })
      return undefined
    }
  }

  /**
   * Set secret in Key Vault
   */
  async setSecret(secretName: string, value: string): Promise<boolean> {
    try {
      await this.secretClient.setSecret(secretName, value)

      // Update cache
      this.cache.set(secretName, {
        value,
        expiry: Date.now() + this.cacheTtl
      })

      logger.info('Secret set in Key Vault', { secretName })
      return true

    } catch (error) {
      logger.error('Failed to set secret in Key Vault', {
        secretName,
        error: error instanceof Error ? error.message : String(error)
      })
      return false
    }
  }

  /**
   * Delete secret from Key Vault
   */
  async deleteSecret(secretName: string): Promise<boolean> {
    try {
      await this.secretClient.beginDeleteSecret(secretName)

      // Remove from cache
      this.cache.delete(secretName)

      logger.info('Secret deleted from Key Vault', { secretName })
      return true

    } catch (error) {
      logger.error('Failed to delete secret from Key Vault', {
        secretName,
        error: error instanceof Error ? error.message : String(error)
      })
      return false
    }
  }

  /**
   * List all secret names
   */
  async listSecrets(): Promise<string[]> {
    try {
      const secrets: string[] = []

      for await (const secretProperties of this.secretClient.listPropertiesOfSecrets()) {
        if (secretProperties.name) {
          secrets.push(secretProperties.name)
        }
      }

      return secrets

    } catch (error) {
      logger.error('Failed to list secrets', {
        error: error instanceof Error ? error.message : String(error)
      })
      return []
    }
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.cache.clear()
    logger.debug('Key Vault cache cleared')
  }
}

/**
 * Environment variable manager with Key Vault fallback
 */
export class SecureConfigManager {
  private keyVault?: KeyVaultManager

  constructor(keyVaultUri?: string) {
    if (keyVaultUri) {
      this.keyVault = new KeyVaultManager(keyVaultUri)
    }
  }

  /**
   * Get configuration value from environment or Key Vault
   */
  async getConfig(key: string, keyVaultSecretName?: string): Promise<string | undefined> {
    // First, try environment variable
    const envValue = process.env[key]
    if (envValue) {
      return envValue
    }

    // Fallback to Key Vault if available
    if (this.keyVault && keyVaultSecretName) {
      logger.debug('Environment variable not found, trying Key Vault', {
        envKey: key,
        secretName: keyVaultSecretName
      })

      return await this.keyVault.getSecret(keyVaultSecretName)
    }

    return undefined
  }

  /**
   * Get required configuration value
   */
  async getRequiredConfig(key: string, keyVaultSecretName?: string): Promise<string> {
    const value = await this.getConfig(key, keyVaultSecretName)

    if (!value) {
      throw new Error(`Required configuration ${key} not found in environment or Key Vault`)
    }

    return value
  }

  /**
   * Store configuration in Key Vault
   */
  async storeConfig(key: string, value: string, keyVaultSecretName?: string): Promise<boolean> {
    if (!this.keyVault) {
      logger.warn('Key Vault not configured, cannot store secret')
      return false
    }

    const secretName = keyVaultSecretName || key.toLowerCase().replace(/_/g, '-')
    return await this.keyVault.setSecret(secretName, value)
  }
}

/**
 * Get managed configuration instance
 */
export function createConfigManager(): SecureConfigManager {
  const keyVaultUri = process.env.AZURE_KEY_VAULT_URI
  return new SecureConfigManager(keyVaultUri)
}

/**
 * Validate Azure authentication
 */
export async function validateAzureAuth(): Promise<boolean> {
  try {
    // Try to get an access token to validate authentication
    const token = await azureCredential.getToken('https://management.azure.com/.default')

    if (token) {
      logger.info('Azure authentication validated successfully')
      return true
    }

    return false

  } catch (error) {
    logger.error('Azure authentication validation failed', {
      error: error instanceof Error ? error.message : String(error)
    })
    return false
  }
}

/**
 * Get Azure resource access token
 */
export async function getAzureToken(scope: string = 'https://management.azure.com/.default'): Promise<string | undefined> {
  try {
    const token = await azureCredential.getToken(scope)
    return token?.token

  } catch (error) {
    logger.error('Failed to get Azure access token', {
      scope,
      error: error instanceof Error ? error.message : String(error)
    })
    return undefined
  }
}