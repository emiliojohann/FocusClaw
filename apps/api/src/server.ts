import Fastify from 'fastify'
import cors from '@fastify/cors'
import { fileURLToPath } from 'node:url'
import { authPlugin } from './plugins/auth'
import { taskRoutes } from './routes/tasks'
import { workspaceRoutes } from './routes/workspaces'
import { projectRoutes } from './routes/projects'
import { tagRoutes } from './routes/tags'
import { backupRoutes } from './routes/backups'

const PORT = parseInt(process.env.PORT || '3001')
const HOST = process.env.API_HOST || '127.0.0.1'

const defaultOrigins = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  process.env.FOCUSCLAW_PUBLIC_URL,
  process.env.VITE_PRIVATE_APP_URL,
].filter(Boolean) as string[]

const corsOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',').map((origin) => origin.trim()).filter(Boolean)
  : defaultOrigins

export async function createServer() {
  const server = Fastify({
    logger: {
      level: 'info',
      transport: {
        target: 'pino-pretty',
        options: { translateTime: 'HH:MM:ss Z' }
      }
    }
  })

  // Plugins
  await server.register(cors, {
    origin: corsOrigins,
    credentials: true,
    exposedHeaders: ['Content-Disposition'],
  })

  // Auth hook (simple API key)
  await authPlugin(server)

  // Routes — protected by API key
  await server.register(taskRoutes, { prefix: '/api/tasks' })
  await server.register(workspaceRoutes, { prefix: '/api/workspaces' })
  await server.register(projectRoutes, { prefix: '/api/projects' })
  await server.register(tagRoutes, { prefix: '/api/tags' })
  await server.register(backupRoutes, { prefix: '/api/backups' })

  // Health check (no auth)
  server.get('/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }))

  return server
}

// Start server
const start = async () => {
  try {
    const server = await createServer()
    await server.listen({ port: PORT, host: HOST })
    server.log.info(`FocusClaw API running on http://${HOST}:${PORT}`)
  } catch (err) {
    console.error(err)
    process.exit(1)
  }
}

const entrypoint = process.argv[1] ? fileURLToPath(import.meta.url) === process.argv[1] : false
if (entrypoint) start()
