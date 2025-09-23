/* Azure / Node runtime entrypoint for Deploy service */
import { serve } from '@hono/node-server'
import { app } from './index'

// Basic health endpoint fallback if not already defined
app.get('/healthz', (c) => c.json({ ok: true, service: 'deploy', mode: 'azure', ts: Date.now() }))

const port = Number(process.env.PORT || 8080)

serve({ fetch: app.fetch, port })

// eslint-disable-next-line no-console
console.log(`[deploy] Azure container listening on :${port}`)
