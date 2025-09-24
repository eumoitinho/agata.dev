/**
 * Structured Logger for Azure Deployment Service
 */

import type { Logger } from '../types'

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3
}

interface LogEntry {
  level: string
  message: string
  timestamp: string
  deploymentId?: string
  data?: any
}

export class AzureLogger implements Logger {
  private level: LogLevel
  private deploymentId?: string

  constructor(deploymentId?: string, level: string = 'info') {
    this.deploymentId = deploymentId
    this.level = this.parseLogLevel(level)
  }

  private parseLogLevel(level: string): LogLevel {
    switch (level.toLowerCase()) {
      case 'debug': return LogLevel.DEBUG
      case 'info': return LogLevel.INFO
      case 'warn': return LogLevel.WARN
      case 'error': return LogLevel.ERROR
      default: return LogLevel.INFO
    }
  }

  private log(level: LogLevel, levelStr: string, message: string, data?: any) {
    if (level < this.level) return

    const entry: LogEntry = {
      level: levelStr,
      message,
      timestamp: new Date().toISOString(),
      ...(this.deploymentId && { deploymentId: this.deploymentId }),
      ...(data && { data })
    }

    // In production, this would send to Application Insights
    console.log(JSON.stringify(entry))
  }

  debug(message: string, data?: any): void {
    this.log(LogLevel.DEBUG, 'DEBUG', message, data)
  }

  info(message: string, data?: any): void {
    this.log(LogLevel.INFO, 'INFO', message, data)
  }

  warn(message: string, data?: any): void {
    this.log(LogLevel.WARN, 'WARN', message, data)
  }

  error(message: string, data?: any): void {
    this.log(LogLevel.ERROR, 'ERROR', message, data)
  }

  // Create child logger with specific context
  child(context: { deploymentId?: string; [key: string]: any }): AzureLogger {
    const childLogger = new AzureLogger(
      context.deploymentId || this.deploymentId,
      process.env.LOG_LEVEL || 'info'
    )
    return childLogger
  }
}

// Factory function to create logger
export function createLogger(deploymentId?: string): AzureLogger {
  return new AzureLogger(deploymentId, process.env.LOG_LEVEL || 'info')
}