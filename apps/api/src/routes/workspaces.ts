import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { db } from '../db'
import { workspaces } from '../db/schema'
import { eq, asc } from 'drizzle-orm'

export async function workspaceRoutes(fastify: FastifyInstance) {
  // Create workspace
  fastify.post('/', async (request: FastifyRequest, reply: FastifyReply) => {
    const { name, slug } = request.body as { name: string; slug: string }

    if (!name || !slug) {
      return reply.status(400).send({ error: 'name and slug are required' })
    }

    const [result] = await db.insert(workspaces).values({ name, slug }).returning()
    return reply.status(201).send(result)
  })

  // List workspaces
  fastify.get('/', async (_request: FastifyRequest, reply: FastifyReply) => {
    const result = await db.select().from(workspaces).orderBy(asc(workspaces.createdAt))
    return reply.send(result)
  })

  // Get workspace by slug
  fastify.get('/:slug', async (request: FastifyRequest, reply: FastifyReply) => {
    const { slug } = request.params as { slug: string }
    const result = await db.select().from(workspaces).where(eq(workspaces.slug, slug)).limit(1)

    if (result.length === 0) {
      return reply.status(404).send({ error: 'Workspace not found' })
    }

    return reply.send(result[0])
  })

  // Update workspace
  fastify.patch('/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string }
    const updates = request.body as Partial<{ name: string; slug: string }>

    const [result] = await db.update(workspaces)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(workspaces.id, id))
      .returning()

    if (!result) {
      return reply.status(404).send({ error: 'Workspace not found' })
    }

    return reply.send(result)
  })

  // Delete workspace
  fastify.delete('/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string }

    const [result] = await db.delete(workspaces).where(eq(workspaces.id, id)).returning()

    if (!result) {
      return reply.status(404).send({ error: 'Workspace not found' })
    }

    return reply.status(204).send()
  })
}