import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { db, sqlite } from '../db'
import { projects } from '../db/schema'
import { and, eq, asc } from 'drizzle-orm'

export async function projectRoutes(fastify: FastifyInstance) {
  // Create project
  fastify.post('/', async (request: FastifyRequest, reply: FastifyReply) => {
    const { workspaceId, name, description } = request.body as {
      workspaceId: string
      name: string
      description?: string
    }

    if (!workspaceId || !name) {
      return reply.status(400).send({ error: 'workspaceId and name are required' })
    }

    const [result] = await db.insert(projects).values({
      workspaceId,
      name,
      description,
    }).returning()

    return reply.status(201).send(result)
  })

  // List projects by workspace
  fastify.get('/workspace/:workspaceId', async (request: FastifyRequest, reply: FastifyReply) => {
    const { workspaceId } = request.params as { workspaceId: string }

    const result = await db.select().from(projects)
      .where(eq(projects.workspaceId, workspaceId))
      .orderBy(asc(projects.createdAt))

    return reply.send(result)
  })

  // Get single project
  fastify.get('/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string }

    const result = await db.select().from(projects).where(eq(projects.id, id)).limit(1)

    if (result.length === 0) {
      return reply.status(404).send({ error: 'Project not found' })
    }

    return reply.send(result[0])
  })

  // Update project metadata
  fastify.patch('/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string }
    const { name, description } = request.body as {
      name?: string
      description?: string | null
    }

    const existing = await db.select().from(projects).where(eq(projects.id, id)).limit(1)
    if (existing.length === 0) {
      return reply.status(404).send({ error: 'Project not found' })
    }

    const normalizedName = typeof name === 'string' ? name.trim() : undefined
    if (name !== undefined && !normalizedName) {
      return reply.status(400).send({ error: 'Project name is required' })
    }

    const [result] = await db.update(projects)
      .set({
        ...(normalizedName !== undefined ? { name: normalizedName } : {}),
        ...(description !== undefined ? { description: description?.trim() || null } : {}),
        updatedAt: new Date(),
      })
      .where(eq(projects.id, id))
      .returning()

    return reply.send(result)
  })

  // Delete project. By default this deletes the project and its tasks.
  // Pass { mode: 'moveTasks', targetProjectId } to move tasks first.
  fastify.delete('/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string }
    const { mode = 'deleteTasks', targetProjectId } = (request.body || {}) as {
      mode?: 'deleteTasks' | 'moveTasks'
      targetProjectId?: string
    }

    const existing = await db.select().from(projects).where(eq(projects.id, id)).limit(1)
    if (existing.length === 0) {
      return reply.status(404).send({ error: 'Project not found' })
    }

    const taskCount = sqlite.prepare('SELECT COUNT(*) AS count FROM tasks WHERE project_id = ?').get(id) as { count: number }

    if (mode === 'moveTasks') {
      if (!targetProjectId || targetProjectId === id) {
        return reply.status(400).send({ error: 'Choose another project to move tasks into' })
      }

      const target = await db.select().from(projects)
        .where(and(eq(projects.id, targetProjectId), eq(projects.workspaceId, existing[0].workspaceId)))
        .limit(1)

      if (target.length === 0) {
        return reply.status(400).send({ error: 'Destination project not found in this workspace' })
      }

      const tx = sqlite.transaction(() => {
        sqlite.prepare('UPDATE tasks SET project_id = ?, updated_at = unixepoch() WHERE project_id = ?').run(targetProjectId, id)
        sqlite.prepare('DELETE FROM projects WHERE id = ?').run(id)
      })
      tx()

      return reply.send({ deletedProjectId: id, movedToProjectId: targetProjectId, movedTaskCount: taskCount.count, deletedTaskCount: 0 })
    }

    if (mode !== 'deleteTasks') {
      return reply.status(400).send({ error: 'Invalid delete mode' })
    }

    await db.delete(projects).where(eq(projects.id, id))
    return reply.send({ deletedProjectId: id, movedTaskCount: 0, deletedTaskCount: taskCount.count })
  })
}
