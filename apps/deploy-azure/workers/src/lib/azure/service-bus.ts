/**
 * Azure Service Bus Client for Cloudflare Workers
 * Lightweight HTTP-based wrapper for Service Bus operations
 */

export class AzureServiceBusClient {
  private namespace: string
  private accessKeyName: string
  private accessKey: string
  private endpoint: string

  constructor(connectionString: string) {
    // Parse connection string: "Endpoint=sb://namespace.servicebus.windows.net/;SharedAccessKeyName=...;SharedAccessKey=..."
    const endpointMatch = connectionString.match(/Endpoint=sb:\/\/([^\/]+)\//)
    const keyNameMatch = connectionString.match(/SharedAccessKeyName=([^;]+)/)
    const keyMatch = connectionString.match(/SharedAccessKey=([^;]+)/)

    if (!endpointMatch || !keyNameMatch || !keyMatch) {
      throw new Error('Invalid Service Bus connection string')
    }

    this.namespace = endpointMatch[1]
    this.accessKeyName = keyNameMatch[1]
    this.accessKey = keyMatch[1]
    this.endpoint = `https://${this.namespace}`
  }

  /**
   * Send a message to a queue
   */
  async sendMessage(queueName: string, message: any): Promise<void> {
    const url = `${this.endpoint}/${queueName}/messages`
    const headers = await this.createHeaders('POST', `/${queueName}/messages`)

    headers['Content-Type'] = 'application/json'

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        Body: JSON.stringify(message),
        ContentType: 'application/json',
        Label: 'deployment-request',
        MessageId: crypto.randomUUID(),
        TimeToLive: 3600000 // 1 hour
      })
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Service Bus send failed: ${response.status} ${error}`)
    }
  }

  /**
   * Receive a message from a queue
   */
  async receiveMessage(queueName: string, options: { maxWaitTime?: number } = {}): Promise<any | null> {
    const timeout = options.maxWaitTime || 5000
    const url = `${this.endpoint}/${queueName}/messages/head?timeout=${Math.floor(timeout / 1000)}`
    const headers = await this.createHeaders('DELETE', `/${queueName}/messages/head`)

    const response = await fetch(url, {
      method: 'DELETE',
      headers
    })

    if (response.status === 204) {
      // No messages available
      return null
    }

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Service Bus receive failed: ${response.status} ${error}`)
    }

    const messageData = await response.text()
    const messageId = response.headers.get('x-ms-messageid')
    const lockToken = response.headers.get('x-ms-locktoken')

    return {
      messageId,
      lockToken,
      body: JSON.parse(messageData)
    }
  }

  /**
   * Complete a message (mark as processed)
   */
  async completeMessage(queueName: string, messageId: string, lockToken?: string): Promise<void> {
    const url = `${this.endpoint}/${queueName}/messages/${messageId}/${lockToken || 'complete'}`
    const headers = await this.createHeaders('DELETE', `/${queueName}/messages/${messageId}/${lockToken || 'complete'}`)

    const response = await fetch(url, {
      method: 'DELETE',
      headers
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Service Bus complete failed: ${response.status} ${error}`)
    }
  }

  /**
   * Get queue statistics
   */
  async getQueueStats(queueName: string): Promise<any> {
    const url = `${this.endpoint}/${queueName}`
    const headers = await this.createHeaders('GET', `/${queueName}`)

    const response = await fetch(url, {
      method: 'GET',
      headers
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Service Bus stats failed: ${response.status} ${error}`)
    }

    const statsXml = await response.text()

    // Simple XML parsing for queue stats (in production, use proper XML parser)
    const activeMessages = this.extractXmlValue(statsXml, 'ActiveMessageCount') || '0'
    const deadLetterMessages = this.extractXmlValue(statsXml, 'DeadLetterMessageCount') || '0'
    const scheduledMessages = this.extractXmlValue(statsXml, 'ScheduledMessageCount') || '0'

    return {
      activeMessages: parseInt(activeMessages),
      deadLetterMessages: parseInt(deadLetterMessages),
      scheduledMessages: parseInt(scheduledMessages),
      lastUpdated: new Date().toISOString()
    }
  }

  /**
   * Create authentication headers for Service Bus REST API
   */
  private async createHeaders(method: string, path: string): Promise<Record<string, string>> {
    const expiry = Math.floor(Date.now() / 1000) + 3600 // 1 hour from now
    const stringToSign = `${method.toUpperCase()}\n${path.toLowerCase()}\n${this.namespace.toLowerCase()}\n${expiry}`

    // Create HMAC-SHA256 signature
    const key = await this.base64ToArrayBuffer(this.accessKey)
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
    const token = `SharedAccessSignature sr=${encodeURIComponent(`https://${this.namespace}${path}`)}&sig=${encodeURIComponent(signatureBase64)}&se=${expiry}&skn=${this.accessKeyName}`

    return {
      'Authorization': token,
      'x-ms-version': '2015-01'
    }
  }

  /**
   * Simple XML value extractor
   */
  private extractXmlValue(xml: string, tagName: string): string | null {
    const regex = new RegExp(`<${tagName}>([^<]+)<\/${tagName}>`)
    const match = xml.match(regex)
    return match ? match[1] : null
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