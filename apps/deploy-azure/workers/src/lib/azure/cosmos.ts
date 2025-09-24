/**
 * Azure Cosmos DB Client for Cloudflare Workers
 * Lightweight REST API wrapper for Cosmos DB operations
 */

export class AzureCosmosClient {
  private endpoint: string
  private masterKey: string
  private databaseId: string
  private containerId: string

  constructor(connectionString: string, databaseId: string, containerId: string) {
    // Parse connection string: "AccountEndpoint=https://...;AccountKey=...;"
    const endpointMatch = connectionString.match(/AccountEndpoint=([^;]+)/)
    const keyMatch = connectionString.match(/AccountKey=([^;]+)/)

    if (!endpointMatch || !keyMatch) {
      throw new Error('Invalid Cosmos DB connection string')
    }

    this.endpoint = endpointMatch[1]
    this.masterKey = keyMatch[1]
    this.databaseId = databaseId
    this.containerId = containerId
  }

  /**
   * Create a new item in the container
   */
  async createItem(item: any): Promise<any> {
    const url = `${this.endpoint}/dbs/${this.databaseId}/colls/${this.containerId}/docs`
    const headers = await this.createHeaders('POST', 'docs', `dbs/${this.databaseId}/colls/${this.containerId}`)

    headers['Content-Type'] = 'application/json'
    headers['x-ms-documentdb-partitionkey'] = `["${item.partitionKey}"]`

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(item)
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Cosmos DB create failed: ${response.status} ${error}`)
    }

    return await response.json()
  }

  /**
   * Get an item by ID
   */
  async getItem(id: string, partitionKey?: string): Promise<any | null> {
    const url = `${this.endpoint}/dbs/${this.databaseId}/colls/${this.containerId}/docs/${id}`
    const headers = await this.createHeaders('GET', 'docs', `dbs/${this.databaseId}/colls/${this.containerId}/docs/${id}`)

    if (partitionKey) {
      headers['x-ms-documentdb-partitionkey'] = `["${partitionKey}"]`
    }

    const response = await fetch(url, {
      method: 'GET',
      headers
    })

    if (response.status === 404) {
      return null
    }

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Cosmos DB get failed: ${response.status} ${error}`)
    }

    return await response.json()
  }

  /**
   * Update an item
   */
  async updateItem(id: string, item: any): Promise<any> {
    const url = `${this.endpoint}/dbs/${this.databaseId}/colls/${this.containerId}/docs/${id}`
    const headers = await this.createHeaders('PUT', 'docs', `dbs/${this.databaseId}/colls/${this.containerId}/docs/${id}`)

    headers['Content-Type'] = 'application/json'
    headers['x-ms-documentdb-partitionkey'] = `["${item.partitionKey}"]`

    const response = await fetch(url, {
      method: 'PUT',
      headers,
      body: JSON.stringify(item)
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Cosmos DB update failed: ${response.status} ${error}`)
    }

    return await response.json()
  }

  /**
   * Query items
   */
  async queryItems(query: string, parameters: any[] = []): Promise<any[]> {
    const url = `${this.endpoint}/dbs/${this.databaseId}/colls/${this.containerId}/docs`
    const headers = await this.createHeaders('POST', 'docs', `dbs/${this.databaseId}/colls/${this.containerId}`)

    headers['Content-Type'] = 'application/query+json'
    headers['x-ms-documentdb-isquery'] = 'true'

    const queryBody = {
      query,
      parameters: parameters.map((param, index) => ({
        name: `@param${index}`,
        value: param
      }))
    }

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(queryBody)
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Cosmos DB query failed: ${response.status} ${error}`)
    }

    const result = await response.json()
    return result.Documents || []
  }

  /**
   * Delete old items (for cleanup)
   */
  async deleteOldItems(cutoffDate: string): Promise<number> {
    try {
      const query = 'SELECT c.id, c.partitionKey FROM c WHERE c.completedAt < @cutoffDate'
      const items = await this.queryItems(query, [cutoffDate])

      let deletedCount = 0
      for (const item of items) {
        await this.deleteItem(item.id, item.partitionKey)
        deletedCount++
      }

      return deletedCount
    } catch (error) {
      console.error('Failed to delete old items:', error)
      return 0
    }
  }

  /**
   * Delete an item
   */
  private async deleteItem(id: string, partitionKey: string): Promise<void> {
    const url = `${this.endpoint}/dbs/${this.databaseId}/colls/${this.containerId}/docs/${id}`
    const headers = await this.createHeaders('DELETE', 'docs', `dbs/${this.databaseId}/colls/${this.containerId}/docs/${id}`)

    headers['x-ms-documentdb-partitionkey'] = `["${partitionKey}"]`

    const response = await fetch(url, {
      method: 'DELETE',
      headers
    })

    if (!response.ok && response.status !== 404) {
      const error = await response.text()
      throw new Error(`Cosmos DB delete failed: ${response.status} ${error}`)
    }
  }

  /**
   * Create authentication headers for Cosmos DB REST API
   */
  private async createHeaders(verb: string, resourceType: string, resourceId: string): Promise<Record<string, string>> {
    const date = new Date().toUTCString()
    const stringToSign = `${verb.toLowerCase()}\n${resourceType.toLowerCase()}\n${resourceId}\n${date.toLowerCase()}\n\n`

    // Create HMAC-SHA256 signature
    const key = await this.base64ToArrayBuffer(this.masterKey)
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      key,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    )

    const signature = await crypto.subtle.sign(
      'HMAC',
      cryptoKey,
      new TextEncoder().encode(stringToSign)
    )

    const signatureBase64 = await this.arrayBufferToBase64(signature)
    const authorization = `type=master&ver=1.0&sig=${signatureBase64}`

    return {
      'Authorization': encodeURIComponent(authorization),
      'x-ms-date': date,
      'x-ms-version': '2020-07-15'
    }
  }

  /**
   * Convert base64 string to ArrayBuffer
   */
  private async base64ToArrayBuffer(base64: string): Promise<ArrayBuffer> {
    const binaryString = atob(base64)
    const bytes = new Uint8Array(binaryString.length)
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i)
    }
    return bytes.buffer
  }

  /**
   * Convert ArrayBuffer to base64 string
   */
  private async arrayBufferToBase64(buffer: ArrayBuffer): Promise<string> {
    const bytes = new Uint8Array(buffer)
    let binaryString = ''
    for (let i = 0; i < bytes.length; i++) {
      binaryString += String.fromCharCode(bytes[i])
    }
    return btoa(binaryString)
  }
}