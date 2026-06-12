import { randomBytes, scryptSync, createCipheriv, createDecipheriv } from 'node:crypto'
import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, resolve } from 'node:path'
import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import Database, { Database as BetterSqliteDatabase } from 'better-sqlite3'
import { sqlite } from '../db'

const APP_VERSION = 'v2026.6.12'
const SCHEMA_VERSION = 'sqlite-v1'
const FORMAT_VERSION = 1
const BACKUP_DIR = resolve(homedir(), '.focusclaw', 'backups')
const BACKUP_EXT = '.focusclawbackup'
const SNAPSHOT_EXT = '.sqlite'
const SNAPSHOT_PREFIX = 'focusclaw-snapshot-'
const BACKUP_SETTINGS_FILE = 'backup-settings.json'
const MAX_SNAPSHOT_FILES = 5
const MAX_BACKUP_BYTES = 50 * 1024 * 1024

type BackupEnvelope = {
  formatVersion: number
  appVersion: string
  schemaVersion: string
  exportedAt: string
  kdf: { name: 'scrypt'; N: number; r: number; p: number; keyLength: number; saltB64: string }
  cipher: { name: 'aes-256-gcm'; nonceB64: string; tagB64: string }
  ciphertextB64: string
}

type ExportPayload = {
  metadata: { appVersion: string; schemaVersion: string; exportedAt: string }
  data: Record<string, unknown[]>
}

type BackupRow = Record<string, unknown>

type BackupSettings = {
  dailyTime: string
  lastAutomaticSnapshotDate: string
  lastAutomaticSnapshotTime: string
}

type LocalSnapshotInfo = {
  filename: string
  path: string
  sizeBytes: number
  createdAt: string
  mtimeMs: number
}

const KDF_PARAMS = { name: 'scrypt' as const, N: 16384, r: 8, p: 1, keyLength: 32 }
const TABLES = [
  'workspaces',
  'projects',
  'status_definitions',
  'users',
  'workspace_members',
  'tags',
  'tasks',
  'task_tags',
  'activity_log',
] as const

const TABLE_COLUMNS: Record<typeof TABLES[number], string[]> = {
  workspaces: ['id', 'name', 'slug', 'created_at', 'updated_at'],
  projects: ['id', 'workspace_id', 'name', 'description', 'created_at', 'updated_at'],
  status_definitions: ['id', 'workspace_id', 'name', 'order', 'color', 'created_at'],
  users: ['id', 'email', 'password_hash', 'name', 'created_at', 'updated_at'],
  workspace_members: ['id', 'workspace_id', 'user_id', 'role', 'created_at'],
  tags: ['id', 'name', 'color', 'created_at'],
  tasks: [
    'id',
    'project_id',
    'parent_id',
    'title',
    'description',
    'status_id',
    'priority',
    'due_date',
    'start_date',
    'due_date_natural',
    'assignee',
    'labels',
    'position',
    'archived',
    'recurring',
    'recurring_end',
    'depends_on',
    'ai_suggested_priority',
    'ai_suggested_due_date',
    'ai_reasoning',
    'created_at',
    'updated_at',
  ],
  task_tags: ['task_id', 'tag_id', 'created_at'],
  activity_log: ['id', 'task_id', 'user_id', 'action', 'changes', 'created_at'],
}

function formatBackupFilename(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  const yyyy = date.getFullYear()
  const mm = pad(date.getMonth() + 1)
  const dd = pad(date.getDate())
  const hh = pad(date.getHours())
  const mi = pad(date.getMinutes())
  const ss = pad(date.getSeconds())
  return `focusclaw-backup-${yyyy}-${mm}-${dd}-${hh}${mi}${ss}${BACKUP_EXT}`
}

function formatSnapshotFilename(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  const yyyy = date.getFullYear()
  const mm = pad(date.getMonth() + 1)
  const dd = pad(date.getDate())
  const hh = pad(date.getHours())
  const mi = pad(date.getMinutes())
  const ss = pad(date.getSeconds())
  const ms = String(date.getMilliseconds()).padStart(3, '0')
  return `${SNAPSHOT_PREFIX}${yyyy}-${mm}-${dd}-${hh}${mi}${ss}-${ms}${SNAPSHOT_EXT}`
}

function sanitizeBackupFilename(name: string): string {
  const base = basename(name)
  if (!base.endsWith(BACKUP_EXT)) throw new Error('Invalid backup filename')
  if (base.includes('..') || base.includes('/') || base.includes('\\')) throw new Error('Invalid backup filename')
  return base
}

function sanitizeSnapshotFilename(name: string): string {
  const base = basename(name)
  if (!base.startsWith(SNAPSHOT_PREFIX) || !base.endsWith(SNAPSHOT_EXT)) throw new Error('Invalid snapshot filename')
  if (base.includes('..') || base.includes('/') || base.includes('\\')) throw new Error('Invalid snapshot filename')
  return base
}

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`
}

function deriveKey(passphrase: string, salt: Buffer): Buffer {
  return scryptSync(passphrase, salt, KDF_PARAMS.keyLength, {
    N: KDF_PARAMS.N,
    r: KDF_PARAMS.r,
    p: KDF_PARAMS.p,
    maxmem: 128 * 1024 * 1024,
  })
}

function encryptBackup(passphrase: string, payload: ExportPayload): BackupEnvelope {
  const plaintext = Buffer.from(JSON.stringify(payload), 'utf8')
  const salt = randomBytes(16)
  const nonce = randomBytes(12)
  const key = deriveKey(passphrase, salt)
  const cipher = createCipheriv('aes-256-gcm', key, nonce)
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()])
  const tag = cipher.getAuthTag()

  return {
    formatVersion: FORMAT_VERSION,
    appVersion: APP_VERSION,
    schemaVersion: SCHEMA_VERSION,
    exportedAt: payload.metadata.exportedAt,
    kdf: { ...KDF_PARAMS, saltB64: salt.toString('base64') },
    cipher: { name: 'aes-256-gcm', nonceB64: nonce.toString('base64'), tagB64: tag.toString('base64') },
    ciphertextB64: ciphertext.toString('base64'),
  }
}

function decryptBackup(passphrase: string, envelope: BackupEnvelope): ExportPayload {
  try {
    if (envelope.formatVersion !== FORMAT_VERSION) throw new Error('Unsupported backup format')
    if (envelope.kdf.name !== 'scrypt' || envelope.cipher.name !== 'aes-256-gcm') throw new Error('Unsupported encryption scheme')

    const salt = Buffer.from(envelope.kdf.saltB64, 'base64')
    const nonce = Buffer.from(envelope.cipher.nonceB64, 'base64')
    const tag = Buffer.from(envelope.cipher.tagB64, 'base64')
    const ciphertext = Buffer.from(envelope.ciphertextB64, 'base64')
    const key = scryptSync(passphrase, salt, envelope.kdf.keyLength, {
      N: envelope.kdf.N,
      r: envelope.kdf.r,
      p: envelope.kdf.p,
      maxmem: 128 * 1024 * 1024,
    })

    const decipher = createDecipheriv('aes-256-gcm', key, nonce)
    decipher.setAuthTag(tag)
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8')
    const parsed = JSON.parse(plaintext) as ExportPayload
    if (!parsed?.data || typeof parsed.data !== 'object') throw new Error('Invalid payload data')
    return parsed
  } catch {
    throw new Error('Failed to decrypt backup. Check passphrase or file integrity.')
  }
}

function exportDataFromDatabase(database: BetterSqliteDatabase, exportedAt = new Date().toISOString()): ExportPayload {
  const data: Record<string, unknown[]> = {}
  for (const table of TABLES) {
    data[table] = database.prepare(`SELECT * FROM ${table}`).all() as unknown[]
  }
  return {
    metadata: {
      appVersion: APP_VERSION,
      schemaVersion: SCHEMA_VERSION,
      exportedAt,
    },
    data: normalizeBackupData(data),
  }
}

function exportCurrentData(): ExportPayload {
  return exportDataFromDatabase(sqlite)
}

function exportSnapshotData(snapshotPath: string): ExportPayload {
  const snapshotDb = new Database(snapshotPath, { readonly: true, fileMustExist: true })
  try {
    return exportDataFromDatabase(snapshotDb)
  } finally {
    snapshotDb.close()
  }
}

function rowsFor(data: Record<string, unknown[]>, table: typeof TABLES[number]): BackupRow[] {
  return Array.isArray(data[table]) ? data[table] as BackupRow[] : []
}

function stringId(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function normalizeBackupData(data: Record<string, unknown[]>): Record<string, unknown[]> {
  const workspaces = rowsFor(data, 'workspaces').filter((row) => stringId(row.id))
  const workspaceIds = new Set(workspaces.map((row) => row.id as string))

  const users = rowsFor(data, 'users').filter((row) => stringId(row.id))
  const userIds = new Set(users.map((row) => row.id as string))

  const projects = rowsFor(data, 'projects').filter((row) => {
    const id = stringId(row.id)
    const workspaceId = stringId(row.workspace_id)
    return Boolean(id && workspaceId && workspaceIds.has(workspaceId))
  })
  const projectIds = new Set(projects.map((row) => row.id as string))

  const statusDefinitions = rowsFor(data, 'status_definitions').filter((row) => {
    const id = stringId(row.id)
    const workspaceId = stringId(row.workspace_id)
    return Boolean(id && workspaceId && workspaceIds.has(workspaceId))
  })
  const statusIds = new Set(statusDefinitions.map((row) => row.id as string))

  let taskRows = rowsFor(data, 'tasks').filter((row) => {
    const id = stringId(row.id)
    const projectId = stringId(row.project_id)
    const statusId = row.status_id === null || row.status_id === undefined ? undefined : stringId(row.status_id)
    return Boolean(id && projectId && projectIds.has(projectId) && (!statusId || statusIds.has(statusId)))
  })

  let taskIds = new Set(taskRows.map((row) => row.id as string))
  let changed = true
  while (changed) {
    const next = taskRows.filter((row) => {
      const parentId = row.parent_id === null || row.parent_id === undefined ? undefined : stringId(row.parent_id)
      return !parentId || taskIds.has(parentId)
    })
    changed = next.length !== taskRows.length
    taskRows = next
    taskIds = new Set(taskRows.map((row) => row.id as string))
  }

  const tagByName = new Map<string, BackupRow>()
  const tagIdRedirects = new Map<string, string>()
  for (const row of rowsFor(data, 'tags')) {
    const id = stringId(row.id)
    const rawName = typeof row.name === 'string' ? row.name : ''
    const name = rawName.trim().toLowerCase().replace(/\s+/g, '-')
    if (!id || !name) continue

    const existing = tagByName.get(name)
    if (existing) {
      tagIdRedirects.set(id, existing.id as string)
      continue
    }

    row.name = name
    delete row.project_id
    tagByName.set(name, row)
  }
  const tags = [...tagByName.values()]
  const tagIds = new Set(tags.map((row) => row.id as string))

  const workspaceMembers = rowsFor(data, 'workspace_members').filter((row) => {
    const id = stringId(row.id)
    const workspaceId = stringId(row.workspace_id)
    const userId = stringId(row.user_id)
    return Boolean(id && workspaceId && userId && workspaceIds.has(workspaceId) && userIds.has(userId))
  })

  const seenTaskTags = new Set<string>()
  const taskTags = rowsFor(data, 'task_tags').filter((row) => {
    const taskId = stringId(row.task_id)
    const rawTagId = stringId(row.tag_id)
    const tagId = rawTagId ? tagIdRedirects.get(rawTagId) || rawTagId : undefined
    row.tag_id = tagId
    if (!taskId || !tagId || !taskIds.has(taskId) || !tagIds.has(tagId)) return false
    const key = `${taskId}:${tagId}`
    if (seenTaskTags.has(key)) return false
    seenTaskTags.add(key)
    return true
  })

  const activityLog = rowsFor(data, 'activity_log').filter((row) => {
    const id = stringId(row.id)
    const taskId = stringId(row.task_id)
    return Boolean(id && taskId && taskIds.has(taskId))
  })

  return {
    workspaces,
    projects,
    status_definitions: statusDefinitions,
    users,
    workspace_members: workspaceMembers,
    tags,
    tasks: taskRows,
    task_tags: taskTags,
    activity_log: activityLog,
  }
}

async function ensureBackupDir() {
  await mkdir(BACKUP_DIR, { recursive: true })
}

function settingsPath() {
  return resolve(BACKUP_DIR, BACKUP_SETTINGS_FILE)
}

function isValidDailyTime(value: string) {
  return value === '' || /^([01]\d|2[0-3]):[0-5]\d$/.test(value)
}

function localDateKey(date = new Date()) {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function scheduledDateFor(date: Date, dailyTime: string) {
  const [hours, minutes] = dailyTime.split(':').map(Number)
  const scheduled = new Date(date)
  scheduled.setHours(hours, minutes, 0, 0)
  return scheduled
}

async function readBackupSettings(): Promise<BackupSettings> {
  await ensureBackupDir()
  try {
    const parsed = JSON.parse(await readFile(settingsPath(), 'utf8')) as Partial<BackupSettings>
    return {
      dailyTime: typeof parsed.dailyTime === 'string' && isValidDailyTime(parsed.dailyTime) ? parsed.dailyTime : '',
      lastAutomaticSnapshotDate: typeof parsed.lastAutomaticSnapshotDate === 'string' ? parsed.lastAutomaticSnapshotDate : '',
      lastAutomaticSnapshotTime: typeof parsed.lastAutomaticSnapshotTime === 'string' && isValidDailyTime(parsed.lastAutomaticSnapshotTime) ? parsed.lastAutomaticSnapshotTime : '',
    }
  } catch {
    return { dailyTime: '', lastAutomaticSnapshotDate: '', lastAutomaticSnapshotTime: '' }
  }
}

async function writeBackupSettings(settings: BackupSettings) {
  await ensureBackupDir()
  await writeFile(settingsPath(), JSON.stringify(settings, null, 2), 'utf8')
}

async function listSnapshotFiles(): Promise<LocalSnapshotInfo[]> {
  await ensureBackupDir()
  const names = (await readdir(BACKUP_DIR)).filter((name) => name.startsWith(SNAPSHOT_PREFIX) && name.endsWith(SNAPSHOT_EXT))
  const withStats = await Promise.all(names.map(async (filename) => {
    const fullPath = resolve(BACKUP_DIR, filename)
    const s = await stat(fullPath)
    return {
      filename,
      path: fullPath,
      sizeBytes: s.size,
      createdAt: s.birthtime.toISOString(),
      mtimeMs: s.mtimeMs,
    }
  }))
  return withStats.sort((a, b) => b.mtimeMs - a.mtimeMs)
}

async function pruneSnapshots(limit: number) {
  const files = await listSnapshotFiles()
  const toDelete = files.slice(limit)
  for (const file of toDelete) {
    await rm(file.path, { force: true })
  }
}

async function createSnapshot(kind: 'manual' | 'automatic' = 'manual'): Promise<LocalSnapshotInfo & { kind: 'manual' | 'automatic' }> {
  await ensureBackupDir()
  assertDbIntegrity('before snapshot')
  const filename = formatSnapshotFilename(new Date())
  const fullPath = resolve(BACKUP_DIR, filename)
  await sqlite.backup(fullPath)
  await pruneSnapshots(MAX_SNAPSHOT_FILES)
  const s = await stat(fullPath)
  return {
    filename,
    path: fullPath,
    sizeBytes: s.size,
    createdAt: s.birthtime.toISOString(),
    mtimeMs: s.mtimeMs,
    kind,
  }
}

async function createSafetyCopy(prefix: string) {
  await ensureBackupDir()
  const safetyPath = resolve(BACKUP_DIR, `${prefix}-${Date.now()}.sqlite`)
  await sqlite.backup(safetyPath)
  return safetyPath
}

function restoreFromPayload(payload: ExportPayload) {
  for (const table of TABLES) {
    if (!Array.isArray(payload.data[table])) throw new Error(`Invalid table data: ${table}`)
  }
  const normalizedData = normalizeBackupData(payload.data)

  sqlite.exec('PRAGMA foreign_keys = OFF')
  const tx = sqlite.transaction(() => {
    sqlite.exec('DELETE FROM task_tags')
    sqlite.exec('DELETE FROM activity_log')
    sqlite.exec('DELETE FROM tasks')
    sqlite.exec('DELETE FROM tags')
    sqlite.exec('DELETE FROM status_definitions')
    sqlite.exec('DELETE FROM workspace_members')
    sqlite.exec('DELETE FROM projects')
    sqlite.exec('DELETE FROM workspaces')
    sqlite.exec('DELETE FROM users')

    for (const table of TABLES) {
      const rows = normalizedData[table] as Array<Record<string, unknown>>
      for (const row of rows) {
        const cols = TABLE_COLUMNS[table].filter((col) => Object.prototype.hasOwnProperty.call(row, col))
        if (cols.length === 0) continue
        const placeholders = cols.map(() => '?').join(',')
        const values = cols.map((c) => row[c])
        const quotedTable = quoteIdentifier(table)
        const quotedColumns = cols.map(quoteIdentifier).join(',')
        sqlite.prepare(`INSERT INTO ${quotedTable} (${quotedColumns}) VALUES (${placeholders})`).run(...values)
      }
    }

    const foreignKeyViolations = sqlite.prepare('PRAGMA foreign_key_check').all() as unknown[]
    if (foreignKeyViolations.length > 0) {
      throw new Error('Import failed foreign key validation')
    }

    const integrityRows = sqlite.prepare('PRAGMA integrity_check').all() as Array<{ integrity_check?: string }>
    if (!integrityRows.every((row) => row.integrity_check === 'ok')) {
      throw new Error('Import failed integrity check')
    }
  })
  try {
    tx()
  } finally {
    sqlite.exec('PRAGMA foreign_keys = ON')
  }
}

function assertDbIntegrity(stage: string) {
  const integrityRows = sqlite.prepare('PRAGMA integrity_check').all() as Array<{ integrity_check?: string }>
  if (!integrityRows.every((row) => row.integrity_check === 'ok')) {
    throw new Error(`Database integrity check failed ${stage}`)
  }
}

export async function backupRoutes(fastify: FastifyInstance) {
  let scheduleTimer: NodeJS.Timeout | undefined

  const runAutomaticSnapshotIfDue = async () => {
    const settings = await readBackupSettings()
    if (!settings.dailyTime) return

    const now = new Date()
    const today = localDateKey(now)
    if (settings.lastAutomaticSnapshotDate === today && settings.lastAutomaticSnapshotTime === settings.dailyTime) return
    if (now < scheduledDateFor(now, settings.dailyTime)) return

    await createSnapshot('automatic')
    await writeBackupSettings({ ...settings, lastAutomaticSnapshotDate: today, lastAutomaticSnapshotTime: settings.dailyTime })
  }

  const scheduleNextAutomaticSnapshot = async () => {
    if (scheduleTimer) clearTimeout(scheduleTimer)
    const settings = await readBackupSettings()
    if (!settings.dailyTime) return

    const now = new Date()
    const nextRun = scheduledDateFor(now, settings.dailyTime)
    if (nextRun <= now) nextRun.setDate(nextRun.getDate() + 1)
    const delayMs = Math.max(1000, nextRun.getTime() - now.getTime())

    scheduleTimer = setTimeout(async () => {
      try {
        await runAutomaticSnapshotIfDue()
      } catch (error) {
        fastify.log.error(error, 'Failed to create automatic snapshot')
      } finally {
        await scheduleNextAutomaticSnapshot()
      }
    }, delayMs)
  }

  fastify.addHook('onClose', async () => {
    if (scheduleTimer) clearTimeout(scheduleTimer)
  })

  try {
    await runAutomaticSnapshotIfDue()
  } catch (error) {
    fastify.log.error(error, 'Failed to create missed automatic snapshot')
  }
  await scheduleNextAutomaticSnapshot()

  fastify.get('/settings', async () => {
    return readBackupSettings()
  })

  fastify.put('/settings', async (request: FastifyRequest, reply: FastifyReply) => {
    const { dailyTime } = request.body as { dailyTime?: string }
    if (typeof dailyTime !== 'string' || !isValidDailyTime(dailyTime)) {
      return reply.status(400).send({ error: 'dailyTime must be empty or HH:MM' })
    }

    const current = await readBackupSettings()
    const next = { ...current, dailyTime }
    await writeBackupSettings(next)

    try {
      await runAutomaticSnapshotIfDue()
    } catch (error) {
      fastify.log.error(error, 'Failed to create automatic snapshot after settings update')
    }
    await scheduleNextAutomaticSnapshot()
    return readBackupSettings()
  })

  fastify.get('/', async () => {
    const snapshots = await listSnapshotFiles()
    return snapshots.map(({ mtimeMs, ...rest }) => rest).slice(0, MAX_SNAPSHOT_FILES)
  })

  fastify.post('/snapshots', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const snapshot = await createSnapshot('manual')
      const { mtimeMs, ...rest } = snapshot
      return rest
    } catch (error: any) {
      return reply.status(500).send({ error: error?.message || 'Failed to create snapshot' })
    }
  })

  fastify.post('/snapshots/:fileName/restore', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { fileName } = request.params as { fileName: string }
      const safeName = sanitizeSnapshotFilename(fileName)
      const fullPath = resolve(BACKUP_DIR, safeName)
      const snapshotStats = await stat(fullPath)
      if (snapshotStats.size > MAX_BACKUP_BYTES) {
        return reply.status(400).send({ error: `Snapshot exceeds ${Math.floor(MAX_BACKUP_BYTES / (1024 * 1024))}MB limit` })
      }

      const payload = exportSnapshotData(fullPath)
      assertDbIntegrity('before restore')
      const safetyBackupPath = await createSafetyCopy('focusclaw-safety-before-restore')
      restoreFromPayload(payload)
      assertDbIntegrity('after restore')
      return { success: true, safetyBackupPath, restoredAt: new Date().toISOString(), metadata: payload.metadata }
    } catch (error: any) {
      return reply.status(400).send({ error: error?.message || 'Failed to restore snapshot' })
    }
  })

  fastify.post('/snapshots/:fileName/export', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { fileName } = request.params as { fileName: string }
      const { passphrase } = request.body as { passphrase?: string }
      if (!passphrase || passphrase.length < 6) return reply.status(400).send({ error: 'Passphrase must be at least 6 characters' })

      const safeName = sanitizeSnapshotFilename(fileName)
      const fullPath = resolve(BACKUP_DIR, safeName)
      const snapshotStats = await stat(fullPath)
      if (snapshotStats.size > MAX_BACKUP_BYTES) {
        return reply.status(400).send({ error: `Snapshot exceeds ${Math.floor(MAX_BACKUP_BYTES / (1024 * 1024))}MB limit` })
      }

      const payload = exportSnapshotData(fullPath)
      const envelope = encryptBackup(passphrase, payload)
      const encryptedFilename = formatBackupFilename(new Date())
      return reply
        .header('Content-Type', 'application/octet-stream')
        .header('Content-Disposition', `attachment; filename="${encryptedFilename}"`)
        .send(Buffer.from(JSON.stringify(envelope), 'utf8'))
    } catch (error: any) {
      return reply.status(400).send({ error: error?.message || 'Failed to export snapshot' })
    }
  })

  fastify.delete('/snapshots/:fileName', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { fileName } = request.params as { fileName: string }
      const safeName = sanitizeSnapshotFilename(fileName)
      await rm(resolve(BACKUP_DIR, safeName))
      return reply.status(204).send()
    } catch {
      return reply.status(404).send({ error: 'Snapshot not found' })
    }
  })

  fastify.post('/export', async (request: FastifyRequest, reply: FastifyReply) => {
    const { passphrase } = request.body as { passphrase?: string }
    if (!passphrase || passphrase.length < 6) return reply.status(400).send({ error: 'Passphrase must be at least 6 characters' })

    await ensureBackupDir()
    const payload = exportCurrentData()
    const envelope = encryptBackup(passphrase, payload)
    const filename = formatBackupFilename(new Date())
    const fullPath = resolve(BACKUP_DIR, filename)
    await writeFile(fullPath, JSON.stringify(envelope), 'utf8')
    const s = await stat(fullPath)
    return { filename, path: fullPath, sizeBytes: s.size, createdAt: s.birthtime.toISOString(), metadata: payload.metadata }
  })

  fastify.post('/import', async (request: FastifyRequest, reply: FastifyReply) => {
    const { passphrase, fileName, fileContentBase64 } = request.body as { passphrase?: string; fileName?: string; fileContentBase64?: string }
    if (!passphrase) return reply.status(400).send({ error: 'Passphrase is required' })
    if (!fileName && !fileContentBase64) return reply.status(400).send({ error: 'Provide fileName or fileContentBase64' })

    let raw: string
    try {
      if (fileContentBase64) {
        raw = Buffer.from(fileContentBase64, 'base64').toString('utf8')
      } else {
        const safeName = sanitizeBackupFilename(fileName as string)
        const backupStats = await stat(resolve(BACKUP_DIR, safeName))
        if (backupStats.size > MAX_BACKUP_BYTES) {
          return reply.status(400).send({ error: `Backup file exceeds ${Math.floor(MAX_BACKUP_BYTES / (1024 * 1024))}MB limit` })
        }
        raw = await readFile(resolve(BACKUP_DIR, safeName), 'utf8')
      }
      if (Buffer.byteLength(raw, 'utf8') > MAX_BACKUP_BYTES) {
        return reply.status(400).send({ error: `Backup payload exceeds ${Math.floor(MAX_BACKUP_BYTES / (1024 * 1024))}MB limit` })
      }
      const envelope = JSON.parse(raw) as BackupEnvelope
      const payload = decryptBackup(passphrase, envelope)

      assertDbIntegrity('before import')
      const safetyPath = await createSafetyCopy('focusclaw-safety-before-import')

      restoreFromPayload(payload)
      assertDbIntegrity('after import')
      return { success: true, safetyBackupPath: safetyPath, importedAt: new Date().toISOString(), metadata: payload.metadata }
    } catch (error: any) {
      return reply.status(400).send({ error: error?.message || 'Import failed' })
    }
  })

  fastify.get('/download/:fileName', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { fileName } = request.params as { fileName: string }
      const safeName = sanitizeBackupFilename(fileName)
      const fullPath = resolve(BACKUP_DIR, safeName)
      await stat(fullPath)
      return reply.header('Content-Type', 'application/octet-stream')
        .header('Content-Disposition', `attachment; filename="${safeName}"`)
        .send(await readFile(fullPath))
    } catch {
      return reply.status(404).send({ error: 'Backup file not found' })
    }
  })

  fastify.delete('/:fileName', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { fileName } = request.params as { fileName: string }
      const safeName = sanitizeBackupFilename(fileName)
      await rm(resolve(BACKUP_DIR, safeName))
      return reply.status(204).send()
    } catch {
      return reply.status(404).send({ error: 'Backup file not found' })
    }
  })
}
