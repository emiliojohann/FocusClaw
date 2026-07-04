import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'

// Simple API key auth for MVP
// Set API_KEY env var to protect the API.
// For local single-user development, leaving API_KEY unset disables auth.

function isLoopbackHost(host: string | undefined): boolean {
  const normalized = (host || '127.0.0.1').trim().toLowerCase()
  return normalized === '127.0.0.1' || normalized === 'localhost' || normalized === '::1'
}

export async function authPlugin(fastify: FastifyInstance) {
  // Skip auth entirely if no API_KEY is set (solo local mode)
  if (!process.env.API_KEY) {
    if (!isLoopbackHost(process.env.API_HOST)) {
      throw new Error('API_KEY is required when API_HOST is not loopback.')
    }
    fastify.log.warn('API_KEY is unset; API auth is disabled for local-only development.')
    return
  }

  fastify.addHook('preHandler', async (request: FastifyRequest, reply: FastifyReply) => {
    // Skip auth for health endpoint
    if (request.url === '/health') return

    const apiKey = request.headers['x-api-key'] as string | undefined
    const validKey = process.env.API_KEY

    if (apiKey !== validKey) {
      return reply.status(401).send({ error: 'Invalid or missing API key.' })
    }
  })
}
