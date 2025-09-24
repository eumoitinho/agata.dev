/**
 * Vercel API Route - Main endpoint
 * GET / - Service info
 */

import type { VercelRequest, VercelResponse } from '@vercel/node'

export default function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  return res.json({
    name: 'Agatta Azure Deployment Service V3',
    version: '1.0.0',
    status: 'running',
    timestamp: new Date().toISOString(),
    region: process.env.VERCEL_REGION || 'unknown',
    platform: 'Vercel'
  })
}