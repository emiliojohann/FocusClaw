import { FastifyRequest, FastifyReply } from 'fastify'
import { db } from '../db/index'
import { tags } from '../db/schema'
import { eq } from 'drizzle-orm'
import { normalizeTagName, removeTagFromTasks, syncAllTaskLabelCaches } from '../lib/taskTags'

export async function tagRoutes(fastify: any) {
  // GET / — list all universal tags
  fastify.get('/', async (_request: FastifyRequest, reply: FastifyReply) => {
    const result = await db.select().from(tags).orderBy(tags.name)
    return reply.send(result)
  })

  // GET /:projectId — legacy-compatible route; tags are now universal
  fastify.get('/:projectId', async (request: FastifyRequest, reply: FastifyReply) => {
    const { projectId } = request.params as { projectId: string }
    if (!projectId) return reply.status(400).send({ error: 'projectId is required' })

    const result = await db.select().from(tags).orderBy(tags.name)
    return reply.send(result)
  })

  // POST / — create a new tag
  fastify.post('/', async (request: FastifyRequest, reply: FastifyReply) => {
    const { projectId, name, color } = request.body as {
      projectId: string
      name: string
      color?: string
    }
    const normalizedName = normalizeTagName(name)
    void projectId
    if (!normalizedName) return reply.status(400).send({ error: 'name is required' })

    const existing = await db.select().from(tags)
      .where(eq(tags.name, normalizedName))
      .limit(1)
    if (existing.length > 0) return reply.send(existing[0])

    const [tag] = await db.insert(tags).values({
      name: normalizedName,
      color: color || '#6B7280',
    }).returning()

    return reply.status(201).send(tag)
  })

  // PUT /:id — update a tag (rename)
  fastify.put('/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string }
    const { name, color } = request.body as { name?: string; color?: string }
    if (!id) return reply.status(400).send({ error: 'id is required' })

    const existing = await db.select().from(tags).where(eq(tags.id, id)).limit(1)
    if (existing.length === 0) return reply.status(404).send({ error: 'Tag not found' })

    const updates: Record<string, string> = {}
    if (name !== undefined) {
      const normalizedName = normalizeTagName(name)
      if (!normalizedName) return reply.status(400).send({ error: 'Tag name is required' })
      const duplicate = await db.select().from(tags)
        .where(eq(tags.name, normalizedName))
        .limit(1)
      if (duplicate.length > 0 && duplicate[0].id !== id) return reply.status(409).send({ error: 'A tag with that name already exists' })
      updates.name = normalizedName
    }
    if (color !== undefined) updates.color = color

    if (Object.keys(updates).length === 0) return reply.status(400).send({ error: 'No fields to update' })

    const [updated] = await db.update(tags).set(updates).where(eq(tags.id, id)).returning()
    syncAllTaskLabelCaches()
    return reply.send(updated)
  })

  // DELETE /:id — delete a tag
  fastify.delete('/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string }
    if (!id) return reply.status(400).send({ error: 'id is required' })

    const existing = await db.select().from(tags).where(eq(tags.id, id)).limit(1)
    if (existing.length === 0) return reply.status(404).send({ error: 'Tag not found' })

    const updatedTaskCount = removeTagFromTasks(id, existing[0].name)
    await db.delete(tags).where(eq(tags.id, id))
    return reply.send({ deletedTagId: id, updatedTaskCount })
  })
}
