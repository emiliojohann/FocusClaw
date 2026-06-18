import { useEffect, useMemo, useState } from 'react'
import { Check, Tag, Plus, Pencil, Trash2, X, Save, Download, Upload, Copy, TriangleAlert, RotateCcw, Clock, Monitor, Moon, Sun, ExternalLink } from 'lucide-react'
import { AppShell } from '@/components/AppShell'
import { taskApi, tagApi, backupApi, projectApi, type LocalBackupInfo, type BackupSettings } from '@/lib/api'
import { APP_VERSION, GITHUB_LATEST_RELEASE_URL } from '@/lib/version'
import {
  CALENDAR_VIEW_DEFAULTS,
  TASK_VIEW_DEFAULTS,
  getCalendarViewDefaults,
  getTaskViewDefaults,
  setCalendarViewDefaults,
  setTaskViewDefaults,
  type TaskFilter,
  type TaskSort,
} from '@/lib/viewSettings'
import { ensureProjectContext, type ProjectRecord } from '@/lib/projectContext'
import { THEME_OPTIONS, getThemePreference, setThemePreference, type ThemePreference } from '@/lib/themeSettings'
interface SavedTag { id: string; name: string; projectId?: string; color?: string }

type DeleteProjectMode = 'deleteTasks' | 'moveTasks'

interface SettingsCache {
  projects?: ProjectRecord[]
  tags?: SavedTag[]
  backups?: LocalBackupInfo[]
  backupSettings?: BackupSettings
}

const SETTINGS_CACHE_KEY = 'focusclaw.settings.snapshot'
const DEFAULT_BACKUP_SETTINGS: BackupSettings = { dailyTime: '', lastAutomaticSnapshotDate: '', lastAutomaticSnapshotTime: '' }

function releaseMobileKeyboard() {
  const activeElement = document.activeElement
  if (activeElement instanceof HTMLElement) activeElement.blur()
}

function readSettingsCache(): SettingsCache | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(SETTINGS_CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<SettingsCache>
    const cache: SettingsCache = {}
    if (Array.isArray(parsed.projects)) cache.projects = parsed.projects
    if (Array.isArray(parsed.tags)) cache.tags = parsed.tags
    if (Array.isArray(parsed.backups)) cache.backups = parsed.backups
    if (parsed.backupSettings && typeof parsed.backupSettings === 'object') {
      cache.backupSettings = {
        dailyTime: typeof parsed.backupSettings.dailyTime === 'string' ? parsed.backupSettings.dailyTime : '',
        lastAutomaticSnapshotDate: typeof parsed.backupSettings.lastAutomaticSnapshotDate === 'string' ? parsed.backupSettings.lastAutomaticSnapshotDate : '',
        lastAutomaticSnapshotTime: typeof parsed.backupSettings.lastAutomaticSnapshotTime === 'string' ? parsed.backupSettings.lastAutomaticSnapshotTime : '',
      }
    }
    return Object.keys(cache).length > 0 ? cache : null
  } catch {
    return null
  }
}

function writeSettingsCache(snapshot: SettingsCache) {
  try {
    window.localStorage.setItem(SETTINGS_CACHE_KEY, JSON.stringify({
      ...(readSettingsCache() ?? {}),
      ...snapshot,
    }))
  } catch {
    // Local cache is an enhancement only.
  }
}

const initialSettingsCache = readSettingsCache()

let lastSettingsProjects: ProjectRecord[] = initialSettingsCache?.projects ?? []
let lastSettingsTags: SavedTag[] = initialSettingsCache?.tags ?? []

const TAG_COLORS = [
  { bg: 'rgba(245,61,45,0.15)', border: 'rgba(245,61,45,0.3)', text: '#f53d2d' },
  { bg: 'rgba(34,197,94,0.15)', border: 'rgba(34,197,94,0.3)', text: '#22c55e' },
  { bg: 'rgba(59,130,246,0.15)', border: 'rgba(59,130,246,0.3)', text: '#3b82f6' },
  { bg: 'rgba(168,85,247,0.15)', border: 'rgba(168,85,247,0.3)', text: '#a855f7' },
  { bg: 'rgba(249,115,22,0.15)', border: 'rgba(249,115,22,0.3)', text: '#f97316' },
  { bg: 'var(--tag-yellow-bg)', border: 'var(--tag-yellow-border)', text: 'var(--tag-yellow)' },
]

const HOUR_OPTIONS = Array.from({ length: 12 }, (_, index) => index + 1)
const MINUTE_OPTIONS = Array.from({ length: 12 }, (_, index) => String(index * 5).padStart(2, '0'))
const TAG_PREVIEW_LIMIT = 15
const TAG_SOFT_WARNING_COUNT = 60

function colorForTagName(name: string): typeof TAG_COLORS[0] {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  return TAG_COLORS[Math.abs(hash) % TAG_COLORS.length]
}

export default function SettingsPage() {
  const [projects, setProjects] = useState<ProjectRecord[]>(lastSettingsProjects)
  const [activeWorkspaceId, setActiveWorkspaceId] = useState('')
  const [tags, setTags] = useState<SavedTag[]>(lastSettingsTags)
  const [loading, setLoading] = useState(!initialSettingsCache?.projects || !initialSettingsCache?.tags)
  const [newTagName, setNewTagName] = useState('')
  const [savingTag, setSavingTag] = useState(false)
  const [tagSearch, setTagSearch] = useState('')
  const [showAllTags, setShowAllTags] = useState(false)
  const [editingTagId, setEditingTagId] = useState<string | null>(null)
  const [editingTagName, setEditingTagName] = useState('')
  const [newProjectName, setNewProjectName] = useState('')
  const [creatingProject, setCreatingProject] = useState(false)
  const [tagPendingDelete, setTagPendingDelete] = useState<SavedTag | null>(null)
  const [deletingTag, setDeletingTag] = useState(false)
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null)
  const [editingProjectName, setEditingProjectName] = useState('')
  const [savingProjectId, setSavingProjectId] = useState('')
  const [projectPendingDelete, setProjectPendingDelete] = useState<ProjectRecord | null>(null)
  const [deleteProjectMode, setDeleteProjectMode] = useState<DeleteProjectMode>('deleteTasks')
  const [deleteProjectTargetId, setDeleteProjectTargetId] = useState('')
  const [deleteProjectTaskCount, setDeleteProjectTaskCount] = useState<number | null>(null)
  const [deletingProject, setDeletingProject] = useState(false)
  const [projectMessage, setProjectMessage] = useState('')
  const [projectError, setProjectError] = useState('')

  const [defaultSort, setDefaultSort] = useState<TaskSort>(TASK_VIEW_DEFAULTS.sort)
  const [defaultFilter, setDefaultFilter] = useState<TaskFilter>(TASK_VIEW_DEFAULTS.filter)
  const [defaultShowCompleted, setDefaultShowCompleted] = useState(CALENDAR_VIEW_DEFAULTS.showCompleted)
  const [theme, setTheme] = useState<ThemePreference>(() => getThemePreference())

  const [savedMessage, setSavedMessage] = useState('')
  const [backups, setBackups] = useState<LocalBackupInfo[]>(initialSettingsCache?.backups ?? [])
  const [backupsLoaded, setBackupsLoaded] = useState(Boolean(initialSettingsCache?.backups))
  const [backupSettings, setBackupSettings] = useState<BackupSettings>(initialSettingsCache?.backupSettings ?? DEFAULT_BACKUP_SETTINGS)
  const [dailyBackupTime, setDailyBackupTime] = useState(initialSettingsCache?.backupSettings?.dailyTime ?? '')
  const [timePickerOpen, setTimePickerOpen] = useState(false)
  const [backupSettingsMessage, setBackupSettingsMessage] = useState('')
  const [exportBackup, setExportBackup] = useState<LocalBackupInfo | null>(null)
  const [exportPassphrase, setExportPassphrase] = useState('')
  const [restoreBackup, setRestoreBackup] = useState<LocalBackupInfo | null>(null)
  const [deleteBackupTarget, setDeleteBackupTarget] = useState<LocalBackupInfo | null>(null)
  const [importPassphrase, setImportPassphrase] = useState('')
  const [selectedBackupFile, setSelectedBackupFile] = useState<File | null>(null)
  const [importConfirmOpen, setImportConfirmOpen] = useState(false)
  const [backupMessage, setBackupMessage] = useState('')
  const [backupError, setBackupError] = useState('')
  const [backupLoading, setBackupLoading] = useState(false)
  const [copiedKey, setCopiedKey] = useState('')

  const devPort = Number(import.meta.env.VITE_DEV_PORT || 5173)
  const devHost = String(import.meta.env.VITE_DEV_HOST || '127.0.0.1')
  const privateAppUrlOverride = String(import.meta.env.VITE_PRIVATE_APP_URL || '').trim()
  const privateAppHostOverride = String(import.meta.env.VITE_PRIVATE_APP_HOST || '').trim()
  const localAppUrl = `http://127.0.0.1:${devPort}`
  const browserHost = typeof window !== 'undefined' ? window.location.hostname : ''
  const browserHostIsLocal = browserHost === 'localhost' || browserHost === '127.0.0.1' || browserHost === ''
  const inferredPrivateAppHost = devHost !== '127.0.0.1' && devHost !== 'localhost'
    ? devHost
    : ''
  const privateAppHost = privateAppHostOverride || inferredPrivateAppHost || (!browserHostIsLocal ? browserHost : '')
  const privateAppUrl = privateAppUrlOverride || (privateAppHost ? `http://${privateAppHost}:${devPort}` : '')

  useEffect(() => {
    const taskDefaults = getTaskViewDefaults()
    const calendarDefaults = getCalendarViewDefaults()
    setDefaultSort(taskDefaults.sort)
    setDefaultFilter(taskDefaults.filter)
    setDefaultShowCompleted(calendarDefaults.showCompleted)
  }, [])

  useEffect(() => {
    initWorkspaceAndProjects()
    loadBackups()
    loadBackupSettings()
  }, [])

  const initWorkspaceAndProjects = async () => {
    try {
      const context = await ensureProjectContext()
      setActiveWorkspaceId(context.workspace.id)
      setProjects(context.projects)
      lastSettingsProjects = context.projects
      await loadTags(context.projects)
    } catch (err) {
      console.error('Failed to initialize settings:', err)
    } finally {
      setLoading(false)
    }
  }

  const loadTags = async (projectsToLoad = projects) => {
    try {
      const loadedTags = await tagApi.list()
      setTags(loadedTags)
      lastSettingsTags = loadedTags
      writeSettingsCache({ projects: projectsToLoad, tags: loadedTags })
    } catch (err) {
      console.error('Failed to load tags:', err)
    }
  }

  const sortedTags = useMemo(() => {
    const tagByName = new Map<string, SavedTag>()
    for (const tag of tags) {
      if (!tagByName.has(tag.name)) tagByName.set(tag.name, tag)
    }
    return [...tagByName.values()].sort((a, b) => a.name.localeCompare(b.name))
  }, [tags])

  const filteredTags = useMemo(() => {
    const query = tagSearch.trim().toLowerCase()
    if (!query) return sortedTags
    return sortedTags.filter((tag) => tag.name.toLowerCase().includes(query))
  }, [sortedTags, tagSearch])

  const visibleTags = useMemo(() => {
    if (tagSearch.trim() || showAllTags) return filteredTags
    return filteredTags.slice(0, TAG_PREVIEW_LIMIT)
  }, [filteredTags, showAllTags, tagSearch])

  const hiddenTagCount = Math.max(filteredTags.length - visibleTags.length, 0)

  const sortedProjects = useMemo(() => {
    return [...projects].sort((a, b) => a.name.localeCompare(b.name))
  }, [projects])

  const createTag = async () => {
    const normalized = newTagName.trim().toLowerCase().replace(/\s+/g, '-')
    if (!normalized) return
    if (tags.some((t) => t.name === normalized)) return

    setSavingTag(true)
    try {
      const createdTag = await tagApi.create(undefined, normalized)
      setTags((prev) => {
        const nextTags = [...prev, createdTag]
        lastSettingsTags = nextTags
        writeSettingsCache({ projects, tags: nextTags })
        return nextTags
      })
      setNewTagName('')
    } catch (err) {
      console.error('Failed to create tag:', err)
    } finally {
      setSavingTag(false)
    }
  }

  const saveTagRename = async () => {
    if (!editingTagId) return
    const normalized = editingTagName.trim().toLowerCase().replace(/\s+/g, '-')
    if (!normalized) return

    try {
      const currentTag = tags.find((tag) => tag.id === editingTagId)
      if (!currentTag) return
      await tagApi.update(currentTag.id, { name: normalized })
      setTags((prev) => {
        const nextTags = prev.map((tag) => tag.id === currentTag.id ? { ...tag, name: normalized } : tag)
        lastSettingsTags = nextTags
        writeSettingsCache({ projects, tags: nextTags })
        return nextTags
      })
      setEditingTagId(null)
      setEditingTagName('')
      releaseMobileKeyboard()
    } catch (err) {
      console.error('Failed to rename tag:', err)
    }
  }

  const confirmDeleteTag = async () => {
    if (!tagPendingDelete) return
    setDeletingTag(true)
    try {
      await tagApi.remove(tagPendingDelete.id)
      setTags((prev) => {
        const nextTags = prev.filter((tag) => tag.id !== tagPendingDelete.id)
        lastSettingsTags = nextTags
        writeSettingsCache({ projects, tags: nextTags })
        return nextTags
      })
      setTagPendingDelete(null)
    } catch (err) {
      console.error('Failed to delete tag:', err)
    } finally {
      setDeletingTag(false)
    }
  }

  const startProjectRename = (project: ProjectRecord) => {
    setEditingProjectId(project.id)
    setEditingProjectName(project.name)
    setProjectMessage('')
    setProjectError('')
  }

  const createProject = async () => {
    const normalized = newProjectName.trim()
    if (!normalized || !activeWorkspaceId) return
    setCreatingProject(true)
    setProjectMessage('')
    setProjectError('')
    try {
      const createdProject = await projectApi.create(activeWorkspaceId, normalized) as ProjectRecord
      setProjects((prev) => {
        const nextProjects = [...prev, createdProject]
        lastSettingsProjects = nextProjects
        writeSettingsCache({ projects: nextProjects, tags })
        return nextProjects
      })
      setNewProjectName('')
      releaseMobileKeyboard()
      setProjectMessage('Project created')
      window.setTimeout(() => setProjectMessage(''), 1500)
    } catch (err: any) {
      setProjectError(err?.message || 'Failed to create project')
    } finally {
      setCreatingProject(false)
    }
  }

  const saveProjectRename = async () => {
    if (!editingProjectId) return
    const normalized = editingProjectName.trim()
    if (!normalized) return

    setSavingProjectId(editingProjectId)
    setProjectMessage('')
    setProjectError('')
    try {
      const updatedProject = await projectApi.update(editingProjectId, { name: normalized }) as ProjectRecord
      setProjects((prev) => {
        const nextProjects = prev.map((project) => project.id === updatedProject.id ? { ...project, ...updatedProject } : project)
        lastSettingsProjects = nextProjects
        writeSettingsCache({ projects: nextProjects, tags })
        return nextProjects
      })
      setEditingProjectId(null)
      setEditingProjectName('')
      releaseMobileKeyboard()
      setProjectMessage('Project renamed')
      window.setTimeout(() => setProjectMessage(''), 1500)
    } catch (err: any) {
      setProjectError(err?.message || 'Failed to rename project')
    } finally {
      setSavingProjectId('')
    }
  }

  const requestProjectDelete = async (project: ProjectRecord) => {
    const destinationProject = projects.find((candidate) => candidate.id !== project.id)
    setProjectPendingDelete(project)
    setDeleteProjectMode('deleteTasks')
    setDeleteProjectTargetId(destinationProject?.id || '')
    setDeleteProjectTaskCount(null)
    setProjectMessage('')
    setProjectError('')
    try {
      const projectTasks = await taskApi.list(project.id, { includeArchived: true })
      setDeleteProjectTaskCount(projectTasks.length)
    } catch {
      setDeleteProjectTaskCount(null)
    }
  }

  const cancelProjectDelete = () => {
    if (deletingProject) return
    setProjectPendingDelete(null)
    setDeleteProjectTaskCount(null)
  }

  const confirmProjectDelete = async () => {
    if (!projectPendingDelete) return
    if (deleteProjectMode === 'moveTasks' && !deleteProjectTargetId) {
      setProjectError('Choose a destination project.')
      return
    }

    setDeletingProject(true)
    setProjectError('')
    setProjectMessage('')
    try {
      await projectApi.remove(projectPendingDelete.id, {
        mode: deleteProjectMode,
        ...(deleteProjectMode === 'moveTasks' ? { targetProjectId: deleteProjectTargetId } : {}),
      })

      let nextProjects = projects.filter((project) => project.id !== projectPendingDelete.id)
      if (nextProjects.length === 0 && activeWorkspaceId) {
        const created = await projectApi.create(activeWorkspaceId, 'Inbox') as ProjectRecord
        nextProjects = [created]
      }

      setProjects(nextProjects)
      lastSettingsProjects = nextProjects
      writeSettingsCache({ projects: nextProjects, tags })
      setProjectPendingDelete(null)
      setDeleteProjectTaskCount(null)
      setProjectMessage('Project deleted')
      window.setTimeout(() => setProjectMessage(''), 1500)
    } catch (err: any) {
      setProjectError(err?.message || 'Failed to delete project')
    } finally {
      setDeletingProject(false)
    }
  }

  const saveDefaults = () => {
    setTaskViewDefaults({ sort: defaultSort, filter: defaultFilter })
    setCalendarViewDefaults({ showCompleted: defaultShowCompleted })
    setSavedMessage('Saved defaults')
    window.setTimeout(() => setSavedMessage(''), 1500)
  }

  const chooseTheme = (preference: ThemePreference) => {
    setTheme(preference)
    setThemePreference(preference)
  }

  const resetDefaults = () => {
    setDefaultSort(TASK_VIEW_DEFAULTS.sort)
    setDefaultFilter(TASK_VIEW_DEFAULTS.filter)
    setDefaultShowCompleted(CALENDAR_VIEW_DEFAULTS.showCompleted)
    setTaskViewDefaults(TASK_VIEW_DEFAULTS)
    setCalendarViewDefaults(CALENDAR_VIEW_DEFAULTS)
    setSavedMessage('Reset to factory defaults')
    window.setTimeout(() => setSavedMessage(''), 1500)
  }

  const exportTasksCsv = () => {
    const link = document.createElement('a')
    link.href = taskApi.exportCSV()
    link.download = ''
    link.click()
  }

  const formatBytes = (size: number): string => {
    if (size < 1024) return `${size} B`
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
    return `${(size / (1024 * 1024)).toFixed(2)} MB`
  }

  const formatScheduleTime = (value: string): string => {
    if (!value) return 'Select time'
    const [hourText, minuteText] = value.split(':')
    const hour = Number(hourText)
    if (Number.isNaN(hour)) return value
    const period = hour >= 12 ? 'PM' : 'AM'
    const displayHour = hour % 12 || 12
    return `${displayHour}:${minuteText} ${period}`
  }

  const getScheduleParts = (value: string) => {
    const [hourText, minuteText = '00'] = value.split(':')
    const hour24 = Number(hourText)
    const safeHour = Number.isFinite(hour24) ? hour24 : 9
    const minute = Math.round(Number(minuteText) / 5) * 5
    const safeMinute = String(minute === 60 ? 55 : minute).padStart(2, '0')
    return {
      hour: safeHour % 12 || 12,
      minute: MINUTE_OPTIONS.includes(minuteText) ? minuteText : safeMinute,
      period: safeHour >= 12 ? 'PM' : 'AM',
    }
  }

  const setSchedulePart = (next: Partial<{ hour: number; minute: string; period: string }>) => {
    const current = getScheduleParts(dailyBackupTime || backupSettings.dailyTime || '09:00')
    const hour = next.hour ?? current.hour
    const minute = next.minute ?? current.minute
    const period = next.period ?? current.period
    let hour24 = hour % 12
    if (period === 'PM') hour24 += 12
    setDailyBackupTime(`${String(hour24).padStart(2, '0')}:${minute}`)
  }

  const loadBackups = async () => {
    try {
      const list = await backupApi.list()
      setBackups(list)
      setBackupsLoaded(true)
      writeSettingsCache({ backups: list })
    } catch (err) {
      console.error('Failed to load backups:', err)
      setBackupsLoaded(true)
    }
  }

  const loadBackupSettings = async () => {
    try {
      const settings = await backupApi.getSettings()
      setBackupSettings(settings)
      setDailyBackupTime(settings.dailyTime)
      writeSettingsCache({ backupSettings: settings })
    } catch (err) {
      console.error('Failed to load backup settings:', err)
    }
  }

  const saveBackupSchedule = async () => {
    setBackupLoading(true)
    try {
      const settings = await backupApi.updateSettings(dailyBackupTime)
      setBackupSettings(settings)
      setDailyBackupTime(settings.dailyTime)
      writeSettingsCache({ backupSettings: settings })
      setTimePickerOpen(false)
      setBackupSettingsMessage(settings.dailyTime ? 'Automatic snapshot schedule saved.' : 'Automatic snapshots disabled.')
      window.setTimeout(() => setBackupSettingsMessage(''), 1800)
      await loadBackups()
    } catch (err: any) {
      setBackupSettingsMessage(err?.message || 'Failed to save schedule')
    } finally {
      setBackupLoading(false)
    }
  }

  const disableBackupSchedule = async () => {
    setDailyBackupTime('')
    setBackupLoading(true)
    try {
      const settings = await backupApi.updateSettings('')
      setBackupSettings(settings)
      writeSettingsCache({ backupSettings: settings })
      setTimePickerOpen(false)
      setBackupSettingsMessage('Automatic snapshots disabled.')
      window.setTimeout(() => setBackupSettingsMessage(''), 1800)
    } catch (err: any) {
      setBackupSettingsMessage(err?.message || 'Failed to disable schedule')
    } finally {
      setBackupLoading(false)
    }
  }

  const createSnapshot = async () => {
    setBackupLoading(true)
    try {
      await backupApi.createSnapshot()
      setBackupMessage('Local snapshot created. Keeping latest 5 snapshots.')
      await loadBackups()
    } catch (err: any) {
      setBackupError(err?.message || 'Failed to create snapshot')
    } finally {
      setBackupLoading(false)
    }
  }

  const requestEncryptedExport = (backup: LocalBackupInfo) => {
    setExportBackup(backup)
    setExportPassphrase('')
  }

  const exportEncryptedSnapshot = async () => {
    if (!exportBackup || !exportPassphrase.trim()) return
    if (exportPassphrase.length < 6) {
      setBackupError('Passphrase must be at least 6 characters')
      return
    }
    setBackupLoading(true)
    try {
      const result = await backupApi.exportSnapshotEncrypted(exportBackup.filename, exportPassphrase)
      const url = URL.createObjectURL(result.blob)
      const link = document.createElement('a')
      link.href = url
      link.download = result.filename
      link.click()
      URL.revokeObjectURL(url)
      setBackupMessage('Encrypted backup downloaded.')
      setExportBackup(null)
      setExportPassphrase('')
    } catch (err: any) {
      setBackupError(err?.message || 'Failed to export encrypted backup')
    } finally {
      setBackupLoading(false)
    }
  }

  const restoreSnapshot = async () => {
    if (!restoreBackup) return
    setBackupLoading(true)
    try {
      const result = await backupApi.restoreSnapshot(restoreBackup.filename)
      setBackupMessage(`Snapshot restored. Safety backup saved at: ${result.safetyBackupPath}`)
      setRestoreBackup(null)
      await loadBackups()
    } catch (err: any) {
      setBackupError(err?.message || 'Failed to restore snapshot')
    } finally {
      setBackupLoading(false)
    }
  }

  const requestImportBackup = () => {
    if (!selectedBackupFile || !importPassphrase.trim()) return
    if (importPassphrase.length < 6) {
      setBackupError('Passphrase must be at least 6 characters')
      return
    }
    setImportConfirmOpen(true)
  }

  const importBackup = async () => {
    if (!selectedBackupFile || !importPassphrase.trim()) {
      setImportConfirmOpen(false)
      return
    }
    setImportConfirmOpen(false)
    setBackupLoading(true)
    try {
      const buffer = await selectedBackupFile.arrayBuffer()
      const bytes = new Uint8Array(buffer)
      let binary = ''
      const chunkSize = 0x8000
      for (let i = 0; i < bytes.length; i += chunkSize) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize))
      }
      const fileContentBase64 = btoa(binary)
      const result = await backupApi.importEncrypted({
        passphrase: importPassphrase,
        fileName: selectedBackupFile.name,
        fileContentBase64,
      })
      setBackupMessage(`Import complete. Safety backup saved at: ${result.safetyBackupPath}`)
      setSelectedBackupFile(null)
      setImportPassphrase('')
      await loadBackups()
    } catch (err: any) {
      setBackupError(err?.message || 'Import failed')
    } finally {
      setBackupLoading(false)
    }
  }

  const deleteBackup = async () => {
    if (!deleteBackupTarget) return
    const { filename } = deleteBackupTarget
    setBackupLoading(true)
    try {
      await backupApi.deleteSnapshot(filename)
      setBackupMessage('Local snapshot deleted.')
      setDeleteBackupTarget(null)
      await loadBackups()
    } catch (err: any) {
      setBackupError(err?.message || 'Failed to delete snapshot')
    } finally {
      setBackupLoading(false)
    }
  }

  const copyText = async (key: string, value: string) => {
    if (!value) return
    try {
      await navigator.clipboard.writeText(value)
      setCopiedKey(key)
      window.setTimeout(() => setCopiedKey(''), 1200)
    } catch (err) {
      console.error('Failed to copy text:', err)
    }
  }

  return (
    <AppShell activeView="settings" mainClassName="fc-settings-main flex-1 min-w-0 overflow-auto p-3 sm:p-4 md:p-6">
        <div className="max-w-4xl mx-auto space-y-6">
          <div>
            <h2 className="text-lg font-semibold text-white">Settings</h2>
          </div>

          <section className="card p-5">
            <div className="flex items-center justify-between gap-3 mb-4">
              <h3 className="text-sm font-semibold text-white">Appearance</h3>
              <span className="text-[10px] text-zinc-500 uppercase tracking-wider">Local</span>
            </div>

            <div>
              <label className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-2 block">Theme</label>
              <div className="grid grid-cols-3 gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] p-1">
                {THEME_OPTIONS.map((option) => {
                  const active = theme === option.value
                  const Icon = option.value === 'system' ? Monitor : option.value === 'dark' ? Moon : Sun
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => chooseTheme(option.value)}
                      className={`btn h-10 text-xs ${active ? 'btn-primary' : 'btn-ghost'}`}
                      aria-pressed={active}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      {option.label}
                    </button>
                  )
                })}
              </div>
            </div>
          </section>

          <section className="card p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-white">Default View Settings</h3>
              {savedMessage ? <span className="text-[11px] text-green-400">{savedMessage}</span> : null}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-2 block">Tasks: Default Filter</label>
                <select value={defaultFilter} onChange={(e) => setDefaultFilter(e.target.value as TaskFilter)} className="input text-xs fc-control fc-select-control w-full">
                  <option value="all">Active Tasks</option>
                  <option value="dueToday">Due Today</option>
                  <option value="dueThisWeek">Due This Week</option>
                  <option value="dueNextWeek">Due Next Week</option>
                  <option value="pastDue">Past Due</option>
                  <option value="noDate">No Date</option>
                  <option value="archived">Completed</option>
                </select>
              </div>
              <div>
                <label className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-2 block">Tasks: Default Sort</label>
                <select value={defaultSort} onChange={(e) => setDefaultSort(e.target.value as TaskSort)} className="input text-xs fc-control fc-select-control w-full">
                  <option value="priority">Priority</option>
                  <option value="dueDate">Due Date</option>
                  <option value="createdAt">Created</option>
                </select>
              </div>
              <div>
                <label className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-2 block">Calendar</label>
                <button
                  type="button"
                  onClick={() => setDefaultShowCompleted((v) => !v)}
                  className={`btn fc-control w-full text-xs ${defaultShowCompleted ? 'btn-primary' : 'btn-secondary'}`}
                >
                  {defaultShowCompleted ? 'Default: Show Completed' : 'Default: Hide Completed'}
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 mt-4 lg:flex lg:items-center">
              <button onClick={saveDefaults} className="btn btn-primary w-full text-xs lg:w-auto"><Save className="w-3.5 h-3.5" />Save Defaults</button>
              <button onClick={resetDefaults} className="btn btn-secondary w-full text-xs lg:w-auto">Reset to Factory</button>
            </div>
          </section>

          <section className="card p-5">
            <div className="flex items-center justify-between gap-3 mb-3">
              <h3 className="text-sm font-semibold text-white">Project Management</h3>
              <div className="flex items-center gap-2">
                {projectMessage ? <span className="text-[11px] text-green-400">{projectMessage}</span> : null}
                {projectError ? <span className="text-[11px] text-red-400">{projectError}</span> : null}
                {sortedProjects.length > 0 ? (
                  <span className="text-[10px] text-zinc-500 uppercase tracking-wider">{sortedProjects.length} projects</span>
                ) : null}
              </div>
            </div>
            {loading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2" aria-hidden="true">
                <div className="h-[46px] rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)]" />
                <div className="h-[46px] rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)]" />
              </div>
            ) : (
              <>
                <div className="mb-3 flex flex-col gap-2 sm:flex-row">
                  <input
                    type="text"
                    value={newProjectName}
                    onChange={(e) => setNewProjectName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') createProject() }}
                    placeholder="New project name"
                    className="input text-xs"
                  />
                  <button
                    type="button"
                    onClick={createProject}
                    disabled={creatingProject || !newProjectName.trim() || !activeWorkspaceId}
                    className="btn btn-primary text-xs sm:w-32"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    {creatingProject ? 'Adding...' : 'Add Project'}
                  </button>
                </div>
                {sortedProjects.length === 0 ? (
                  <p className="text-xs text-zinc-500">No projects yet.</p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {sortedProjects.map((project) => {
                      const isEditing = editingProjectId === project.id
                      const isSaving = savingProjectId === project.id
                      return (
                        <div
                          key={project.id}
                          className={`min-h-[46px] rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] p-2 ${isEditing ? 'space-y-2' : 'flex items-center justify-between gap-2'}`}
                        >
                          {isEditing ? (
                            <>
                              <input
                                type="text"
                                autoFocus
                                autoComplete="off"
                                value={editingProjectName}
                                onChange={(e) => setEditingProjectName(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') saveProjectRename()
                                  if (e.key === 'Escape') { setEditingProjectId(null); releaseMobileKeyboard() }
                                }}
                                className="input text-xs !py-1.5 w-full"
                              />
                              <div className="flex items-center justify-end gap-1.5">
                                <button
                                  onClick={saveProjectRename}
                                  disabled={isSaving || !editingProjectName.trim()}
                                  className="btn btn-primary text-xs"
                                >
                                  {isSaving ? 'Saving...' : 'Save'}
                                </button>
                                <button onClick={() => { setEditingProjectId(null); releaseMobileKeyboard() }} className="btn btn-ghost p-1.5" aria-label="Cancel project rename">
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </>
                          ) : (
                            <>
                              <span className="min-w-0 truncate text-xs font-medium text-zinc-200">{project.name}</span>
                              <div className="flex shrink-0 items-center gap-1">
                                <button onClick={() => startProjectRename(project)} className="btn btn-ghost p-1.5" title="Rename project">
                                  <Pencil className="w-3.5 h-3.5" />
                                </button>
                                <button onClick={() => requestProjectDelete(project)} className="btn btn-ghost p-1.5 text-red-400 hover:bg-red-500/10" title="Delete project">
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </>
            )}
          </section>

          <section className="card p-5">
            <div className="flex items-center justify-between gap-3 mb-3">
              <h3 className="text-sm font-semibold text-white">Tag Management</h3>
              {sortedTags.length > 0 ? (
                <span className="text-[10px] text-zinc-500 uppercase tracking-wider">{sortedTags.length} tags</span>
              ) : null}
            </div>
            {loading ? (
              <div className="space-y-4" aria-hidden="true">
                <div className="flex gap-2">
                  <div className="input text-xs h-10" />
                  <div className="btn btn-primary text-xs h-10 w-28" />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2">
                  <div className="h-[46px] rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)]" />
                  <div className="h-[46px] rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)]" />
                  <div className="hidden sm:block h-[46px] rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)]" />
                </div>
              </div>
            ) : (
              <>
                <div className="flex flex-col sm:flex-row gap-2 mb-3">
                  <input
                    type="text"
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize="none"
                    spellCheck={false}
                    value={newTagName}
                    onChange={(e) => setNewTagName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') createTag() }}
                    className="input text-xs flex-1"
                    placeholder="new tag name"
                  />
                  <button disabled={savingTag || !newTagName.trim()} onClick={createTag} className="btn btn-primary text-xs">
                    <Plus className="w-3.5 h-3.5" /> Add Tag
                  </button>
                </div>

                <div className="mb-3">
                  <input
                    type="search"
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize="none"
                    spellCheck={false}
                    value={tagSearch}
                    onChange={(e) => setTagSearch(e.target.value)}
                    className="input text-xs w-full"
                    placeholder="search tags"
                    aria-label="Search tags"
                  />
                </div>

                {sortedTags.length >= TAG_SOFT_WARNING_COUNT ? (
                  <div className="mb-3 flex items-start gap-2 rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
                    <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <p>Tag list is getting long. Search, merge, or delete unused tags when it starts slowing you down.</p>
                  </div>
                ) : null}

                <div>
                  {sortedTags.length === 0 ? (
                    <p className="text-xs text-zinc-500">No saved tags yet.</p>
                  ) : filteredTags.length === 0 ? (
                    <p className="text-xs text-zinc-500">No tags match your search.</p>
                  ) : (
                    <>
                      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2">
                        {visibleTags.map((tag) => {
                          const c = colorForTagName(tag.name)
                          const isEditing = editingTagId === tag.id
                          return (
                            <div
                              key={tag.id}
                              className={`min-h-[46px] rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] p-2 ${isEditing ? 'space-y-2' : 'flex items-center justify-between gap-2'}`}
                            >
                              {isEditing ? (
                                <>
                                  <input
                                    type="text"
                                    autoFocus
                                    autoComplete="off"
                                    autoCorrect="off"
                                    autoCapitalize="none"
                                    spellCheck={false}
                                    value={editingTagName}
                                    onChange={(e) => setEditingTagName(e.target.value)}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') saveTagRename()
                                      if (e.key === 'Escape') { setEditingTagId(null); releaseMobileKeyboard() }
                                    }}
                                    className="input text-xs !py-1.5 w-full"
                                  />
                                  <div className="flex items-center justify-end gap-1.5">
                                    <button onClick={saveTagRename} className="btn btn-primary text-xs">Save</button>
                                    <button onClick={() => { setEditingTagId(null); releaseMobileKeyboard() }} className="btn btn-ghost p-1.5" aria-label="Cancel rename"><X className="w-3.5 h-3.5" /></button>
                                  </div>
                                </>
                              ) : (
                                <>
                                  <span className="inline-flex min-w-0 items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-medium border" style={{ background: c.bg, borderColor: c.border, color: c.text }}>
                                    <Tag className="w-2.5 h-2.5 shrink-0" />
                                    <span className="min-w-0 whitespace-normal break-words leading-tight">{tag.name}</span>
                                  </span>
                                  <div className="flex shrink-0 items-center gap-1">
                                    <button onClick={() => { setEditingTagId(tag.id); setEditingTagName(tag.name) }} className="btn btn-ghost p-1.5" title="Rename">
                                      <Pencil className="w-3.5 h-3.5" />
                                    </button>
                                    <button onClick={() => setTagPendingDelete(tag)} className="btn btn-ghost p-1.5 text-red-400 hover:bg-red-500/10" title="Delete">
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                </>
                              )}
                            </div>
                          )
                        })}
                      </div>

                      {!tagSearch.trim() && sortedTags.length > TAG_PREVIEW_LIMIT ? (
                        <div className="mt-3 flex items-center justify-between gap-3">
                          <p className="text-[11px] text-zinc-500">
                            {showAllTags ? 'Showing all tags.' : `${hiddenTagCount} more tags hidden.`}
                          </p>
                          <button onClick={() => setShowAllTags((value) => !value)} className="btn btn-secondary text-xs">
                            {showAllTags ? 'Show Less' : `Show All ${sortedTags.length}`}
                          </button>
                        </div>
                      ) : null}
                    </>
                  )}
                </div>
              </>
            )}
          </section>

          <section className="card p-5">
            <div className="flex items-start justify-between gap-3 mb-3">
              <h3 className="text-sm font-semibold text-white">Tasks Export</h3>
              <button onClick={exportTasksCsv} className="btn btn-secondary text-xs">
                <Download className="w-3.5 h-3.5" /> Export CSV
              </button>
            </div>
            <p className="text-xs text-zinc-500">Exports every task across every project, including completed tasks, with a project column.</p>
          </section>

          <section className="card p-5">
            <div className="flex items-center justify-between gap-3 mb-3">
              <h3 className="text-sm font-semibold text-white">Backups</h3>
              <span className="text-[10px] text-zinc-500 uppercase tracking-wider">5 saved</span>
            </div>
            <p className="text-xs text-zinc-500 mb-4">
              Local snapshots are unencrypted safety copies stored at <span className="text-zinc-400">~/.focusclaw/backups</span>. Encrypted downloads require a passphrase.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
              <div className="space-y-2">
                <label className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider block">Automatic local snapshots</label>
                <div className="flex items-center gap-1.5 sm:gap-2">
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setTimePickerOpen((open) => !open)}
                      className="h-10 w-[132px] rounded-xl border border-[var(--border)] bg-[linear-gradient(180deg,rgba(255,255,255,0.055),rgba(255,255,255,0.015))] px-2 text-left text-xs text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] hover:border-zinc-600 hover:bg-[var(--bg-elevated)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)] focus-visible:outline-offset-2 sm:w-auto sm:min-w-[156px] sm:px-3"
                      aria-label="Choose automatic snapshot time"
                    >
                      <span className="flex items-center gap-2">
                        <span className="grid h-6 w-6 place-items-center rounded-lg bg-[var(--accent-subtle)] text-[var(--accent-hover)]">
                          <Clock className="w-3.5 h-3.5" />
                        </span>
                        <span className={dailyBackupTime ? 'font-medium text-white' : 'text-zinc-500'}>{formatScheduleTime(dailyBackupTime)}</span>
                      </span>
                    </button>

                    {timePickerOpen ? (
                      <div className="absolute left-0 top-12 z-30 w-[286px] rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] p-3 shadow-2xl shadow-black/40">
                        <div className="flex items-center justify-between gap-2 mb-3">
                          <div className="inline-flex rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] p-1">
                            {(['AM', 'PM'] as const).map((period) => {
                              const active = getScheduleParts(dailyBackupTime || backupSettings.dailyTime || '09:00').period === period
                              return (
                                <button
                                  key={period}
                                  type="button"
                                  onClick={() => setSchedulePart({ period })}
                                  className={`h-7 px-3 rounded-md text-[11px] font-semibold transition-colors ${active ? 'bg-[var(--accent)] text-white' : 'text-zinc-500 hover:text-white'}`}
                                >
                                  {period}
                                </button>
                              )
                            })}
                          </div>
                          <button type="button" onClick={() => setTimePickerOpen(false)} className="btn btn-ghost p-1.5" aria-label="Close time picker">
                            <Check className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        <div className="grid grid-cols-[1fr_1.1fr] gap-3">
                          <div>
                            <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-600 mb-2">Hour</p>
                            <div className="grid grid-cols-4 gap-1">
                              {HOUR_OPTIONS.map((hour) => {
                                const active = getScheduleParts(dailyBackupTime || backupSettings.dailyTime || '09:00').hour === hour
                                return (
                                  <button
                                    key={hour}
                                    type="button"
                                    onClick={() => setSchedulePart({ hour })}
                                    className={`h-8 rounded-lg text-xs font-medium transition-colors ${active ? 'bg-[var(--accent-subtle)] text-[var(--accent-hover)] border border-[rgba(245,61,45,0.25)]' : 'text-zinc-400 hover:bg-[var(--bg-elevated)] hover:text-white'}`}
                                  >
                                    {hour}
                                  </button>
                                )
                              })}
                            </div>
                          </div>

                          <div>
                            <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-600 mb-2">Minute</p>
                            <div className="grid grid-cols-4 gap-1">
                              {MINUTE_OPTIONS.map((minute) => {
                                const active = getScheduleParts(dailyBackupTime || backupSettings.dailyTime || '09:00').minute === minute
                                return (
                                  <button
                                    key={minute}
                                    type="button"
                                    onClick={() => setSchedulePart({ minute })}
                                    className={`h-8 rounded-lg text-xs font-medium transition-colors ${active ? 'bg-[var(--accent-subtle)] text-[var(--accent-hover)] border border-[rgba(245,61,45,0.25)]' : 'text-zinc-400 hover:bg-[var(--bg-elevated)] hover:text-white'}`}
                                  >
                                    {minute}
                                  </button>
                                )
                              })}
                            </div>
                          </div>
                        </div>
                      </div>
                    ) : null}
                  </div>
                  <button disabled={backupLoading} onClick={saveBackupSchedule} className="btn btn-secondary px-2 text-xs shrink-0 sm:px-4">
                    <Save className="hidden w-3.5 h-3.5 sm:block" /> Save
                  </button>
                  <button disabled={backupLoading || (!dailyBackupTime && !backupSettings.dailyTime)} onClick={disableBackupSchedule} className="btn btn-ghost px-2 text-xs shrink-0 sm:px-4">
                    Disable
                  </button>
                </div>
                <p className="text-xs text-zinc-500">
                  {backupSettings.dailyTime
                    ? `Daily at ${backupSettings.dailyTime}${backupSettings.lastAutomaticSnapshotDate ? ` · last run ${backupSettings.lastAutomaticSnapshotDate}` : ''}`
                    : 'Choose a time and save to enable automatic snapshots.'}
                </p>
                {backupSettingsMessage ? <p className="text-xs text-green-400">{backupSettingsMessage}</p> : null}
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider block">Manual local snapshot</label>
                <button disabled={backupLoading} onClick={createSnapshot} className="btn btn-primary text-xs">
                  <Download className="w-3.5 h-3.5" /> Create Snapshot
                </button>
                <p className="text-xs text-zinc-500">Restore local snapshots without a passphrase, or export one as an encrypted backup.</p>
              </div>
            </div>

            <div className="mb-5 rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] p-3">
              <label className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider block mb-2">Import encrypted backup (replace)</label>
              <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] gap-2">
                <input
                  type="file"
                  accept=".focusclawbackup"
                  onChange={(e) => setSelectedBackupFile(e.target.files?.[0] || null)}
                  className="input text-xs"
                />
                <input
                  type="password"
                  value={importPassphrase}
                  onChange={(e) => setImportPassphrase(e.target.value)}
                  className="input text-xs"
                  placeholder="Backup passphrase"
                />
                <button disabled={backupLoading || !selectedBackupFile || !importPassphrase.trim()} onClick={requestImportBackup} className="btn btn-secondary text-xs">
                  <Upload className="w-3.5 h-3.5" /> Import
                </button>
              </div>
            </div>

            {backupMessage ? <p className="text-xs text-zinc-400 mb-3">{backupMessage}</p> : null}

            <div className="space-y-2">
              {backups.length === 0 ? (
                <p className="min-h-[56px] text-xs text-zinc-500">
                  {backupsLoaded ? 'No local snapshots found yet.' : 'Loading local snapshots...'}
                </p>
              ) : backups.map((backup) => (
                <div key={backup.filename} className="flex items-center justify-between gap-3 p-2 rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)]">
                  <div className="text-xs text-zinc-300 min-w-0">
                    <p className="font-medium truncate">{backup.filename}</p>
                    <p className="text-zinc-500">{new Date(backup.createdAt).toLocaleString()} · {formatBytes(backup.sizeBytes)}</p>
                    <p className="text-zinc-600 truncate">{backup.path}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button onClick={() => setRestoreBackup(backup)} className="btn btn-ghost p-1.5" title="Restore snapshot">
                      <RotateCcw className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => requestEncryptedExport(backup)} className="btn btn-ghost p-1.5" title="Encrypted download">
                      <Download className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => setDeleteBackupTarget(backup)} className="btn btn-ghost p-1.5 text-red-400 hover:bg-red-500/10" title="Delete snapshot">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="card p-5">
            <div className="flex items-center justify-between gap-3 mb-3">
              <h3 className="text-sm font-semibold text-white">Private Access</h3>
              <span className="text-[10px] text-zinc-500 uppercase tracking-wider">URLs</span>
            </div>
            <p className="text-xs text-zinc-500 mb-4">
              Use these app URLs to open this FocusClaw instance locally or from another device on your private Tailscale network.
            </p>

            <div className="space-y-2">
              <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] p-3">
                <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-1">Local App URL</p>
                <div className="flex items-center gap-2">
                  <code className="text-xs text-zinc-300 break-all flex-1">{localAppUrl}</code>
                  <button onClick={() => copyText('local-app-url', localAppUrl)} className="btn btn-ghost p-1.5" title="Copy local app URL">
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                </div>
                {copiedKey === 'local-app-url' ? <p className="text-[11px] text-green-400 mt-1">Copied</p> : null}
              </div>

              <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] p-3">
                <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-1">Tailscale / Private App URL</p>
                <div className="flex items-center gap-2">
                  <code className="text-xs text-zinc-300 break-all flex-1">{privateAppUrl || 'Not configured'}</code>
                  {privateAppUrl ? (
                    <button onClick={() => copyText('private-app-url', privateAppUrl)} className="btn btn-ghost p-1.5" title="Copy private app URL">
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                  ) : null}
                </div>
                <p className="mt-1 text-[11px] text-zinc-500">Set this with Tailscale mode or <span className="font-mono">VITE_PRIVATE_APP_URL</span>.</p>
                {copiedKey === 'private-app-url' ? <p className="text-[11px] text-green-400 mt-1">Copied</p> : null}
              </div>
            </div>
          </section>

          <section className="card p-5">
            <div className="flex items-center justify-between gap-3 mb-3">
              <h3 className="text-sm font-semibold text-white">Contact & Feedback</h3>
              <span className="text-[10px] text-zinc-500 uppercase tracking-wider">Support</span>
            </div>
            <p className="text-xs text-zinc-500 mb-4">Feature requests, comments, bugs, or just saying hi are welcome.</p>
            <a
              href="mailto:social@focusclaw.app?subject=FocusClaw%20feedback"
              className="btn btn-primary text-xs w-full sm:w-auto"
            >
              Contact
            </a>
          </section>

          <section className="card p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-white">About FocusClaw</h3>
              <span className="text-[10px] text-zinc-500 uppercase tracking-wider">{APP_VERSION}</span>
            </div>
            <div className="space-y-2 text-xs text-zinc-400">
              <p>
                Built by{' '}
                <a
                  href="https://x.com/emeeliojohann"
                  target="_blank"
                  rel="noreferrer"
                  className="text-[var(--accent-hover)] hover:underline"
                >
                  @emeeliojohann
                </a>
              </p>
              <p>Released under the MIT License.</p>
              <p>
                <a
                  href={GITHUB_LATEST_RELEASE_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-[var(--accent-hover)] hover:underline"
                >
                  Latest GitHub release
                  <ExternalLink className="w-3 h-3" />
                </a>
              </p>
              <div className="mt-4 border-t border-[var(--border)] pt-4">
                <h4 className="mb-2 text-xs font-semibold text-white">Donate</h4>
                <p className="mb-3 text-zinc-400">Help fund open-source development, maintenance, and hosting for FocusClaw.</p>
                <a
                  href="https://donate.stripe.com/fZu3cv8dF0sN3lO77KgMw00"
                  target="_blank"
                  rel="noreferrer"
                  className="btn btn-danger inline-flex w-full items-center justify-center text-xs sm:w-auto"
                >
                  Donate to FocusClaw
                </a>
              </div>
              <p className="mt-5 text-zinc-600">Copyright © 2026 Long Life Ramen LLC.</p>
            </div>
          </section>
        </div>
      {importConfirmOpen ? (
        <>
          <div className="fixed inset-0 bg-black/60 z-[200] backdrop" onClick={() => setImportConfirmOpen(false)} />
          <div className="fixed top-1/2 left-1/2 z-[210] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-[var(--border)] bg-[var(--bg-secondary)] shadow-2xl">
            <div className="flex items-center justify-between p-5 border-b border-[var(--border)]">
              <div className="flex items-center gap-2">
                <TriangleAlert className="w-4 h-4 text-amber-400" />
                <h3 className="text-white font-semibold text-sm">Import Backup</h3>
              </div>
              <button onClick={() => setImportConfirmOpen(false)} className="btn btn-ghost p-1.5" aria-label="Cancel backup import">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5">
              <p className="text-sm text-zinc-300">
                Importing <span className="text-white font-medium">{selectedBackupFile?.name}</span> will replace all current FocusClaw data.
              </p>
              <p className="text-xs text-zinc-500 mt-2">A local safety DB backup will be created before the import runs.</p>
              <div className="flex items-center justify-end gap-2 mt-5">
                <button onClick={() => setImportConfirmOpen(false)} className="btn btn-secondary text-xs">
                  Cancel
                </button>
                <button onClick={importBackup} className="btn btn-primary text-xs">
                  <Upload className="w-3.5 h-3.5" />
                  Import & Replace
                </button>
              </div>
            </div>
          </div>
        </>
      ) : null}

      {exportBackup ? (
        <>
          <div className="fixed inset-0 bg-black/60 z-[200] backdrop" onClick={() => setExportBackup(null)} />
          <div className="fixed top-1/2 left-1/2 z-[210] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-[var(--border)] bg-[var(--bg-secondary)] shadow-2xl">
            <div className="flex items-center justify-between p-5 border-b border-[var(--border)]">
              <div className="flex items-center gap-2">
                <Download className="w-4 h-4 text-[var(--accent)]" />
                <h3 className="text-white font-semibold text-sm">Encrypted Download</h3>
              </div>
              <button onClick={() => setExportBackup(null)} className="btn btn-ghost p-1.5" aria-label="Cancel encrypted download">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5">
              <p className="text-sm text-zinc-300 mb-3">
                Export <span className="text-white font-medium">{exportBackup.filename}</span> as an encrypted backup.
              </p>
              <input
                autoFocus
                type="password"
                value={exportPassphrase}
                onChange={(e) => setExportPassphrase(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') exportEncryptedSnapshot() }}
                className="input text-xs"
                placeholder="Passphrase (not stored)"
              />
              <p className="text-xs text-zinc-500 mt-2">This passphrase will be required to import the downloaded file.</p>
              <div className="flex items-center justify-end gap-2 mt-5">
                <button onClick={() => setExportBackup(null)} className="btn btn-secondary text-xs" disabled={backupLoading}>
                  Cancel
                </button>
                <button onClick={exportEncryptedSnapshot} className="btn btn-primary text-xs" disabled={backupLoading || !exportPassphrase.trim()}>
                  <Download className="w-3.5 h-3.5" />
                  Download
                </button>
              </div>
            </div>
          </div>
        </>
      ) : null}

      {restoreBackup ? (
        <>
          <div className="fixed inset-0 bg-black/60 z-[200] backdrop" onClick={() => setRestoreBackup(null)} />
          <div className="fixed top-1/2 left-1/2 z-[210] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-[var(--border)] bg-[var(--bg-secondary)] shadow-2xl">
            <div className="flex items-center justify-between p-5 border-b border-[var(--border)]">
              <div className="flex items-center gap-2">
                <TriangleAlert className="w-4 h-4 text-amber-400" />
                <h3 className="text-white font-semibold text-sm">Restore Snapshot</h3>
              </div>
              <button onClick={() => setRestoreBackup(null)} className="btn btn-ghost p-1.5" aria-label="Cancel snapshot restore">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5">
              <p className="text-sm text-zinc-300">
                Restoring <span className="text-white font-medium">{restoreBackup.filename}</span> will replace all current FocusClaw data.
              </p>
              <p className="text-xs text-zinc-500 mt-2">A local safety DB backup will be created before the restore runs.</p>
              <div className="flex items-center justify-end gap-2 mt-5">
                <button onClick={() => setRestoreBackup(null)} className="btn btn-secondary text-xs" disabled={backupLoading}>
                  Cancel
                </button>
                <button onClick={restoreSnapshot} className="btn btn-primary text-xs" disabled={backupLoading}>
                  <RotateCcw className="w-3.5 h-3.5" />
                  Restore
                </button>
              </div>
            </div>
          </div>
        </>
      ) : null}

      {deleteBackupTarget ? (
        <>
          <div className="fixed inset-0 bg-black/60 z-[200] backdrop" onClick={() => setDeleteBackupTarget(null)} />
          <div className="fixed top-1/2 left-1/2 z-[210] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-[var(--border)] bg-[var(--bg-secondary)] shadow-2xl">
            <div className="flex items-center justify-between p-5 border-b border-[var(--border)]">
              <div className="flex items-center gap-2">
                <TriangleAlert className="w-4 h-4 text-amber-400" />
                <h3 className="text-white font-semibold text-sm">Delete Snapshot</h3>
              </div>
              <button onClick={() => setDeleteBackupTarget(null)} className="btn btn-ghost p-1.5" aria-label="Cancel snapshot deletion">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5">
              <p className="text-sm text-zinc-300">
                Delete <span className="text-white font-medium">{deleteBackupTarget.filename}</span>?
              </p>
              <p className="text-xs text-zinc-500 mt-2">This removes the local snapshot file. Encrypted downloads you already saved elsewhere are not affected.</p>
              <div className="flex items-center justify-end gap-2 mt-5">
                <button onClick={() => setDeleteBackupTarget(null)} className="btn btn-secondary text-xs" disabled={backupLoading}>
                  Cancel
                </button>
                <button onClick={deleteBackup} className="btn text-xs bg-red-500/15 text-red-300 hover:bg-red-500/25" disabled={backupLoading}>
                  <Trash2 className="w-3.5 h-3.5" />
                  {backupLoading ? 'Deleting...' : 'Delete Snapshot'}
                </button>
              </div>
            </div>
          </div>
        </>
      ) : null}

      {projectPendingDelete ? (
        <>
          <div className="fixed inset-0 bg-black/60 z-[200] backdrop" onClick={cancelProjectDelete} />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-project-title"
            className="fixed top-1/2 left-1/2 z-[210] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-secondary)] shadow-2xl"
          >
            <div className="flex items-start justify-between gap-4 border-b border-[var(--border)] px-5 py-4">
              <div className="min-w-0">
                <h3 id="delete-project-title" className="text-white font-semibold text-sm">Delete Project</h3>
                <p className="mt-1 text-xs text-zinc-500">
                  {deleteProjectTaskCount === null ? 'This project may contain tasks.' : `This project contains ${deleteProjectTaskCount} task${deleteProjectTaskCount === 1 ? '' : 's'}.`}
                </p>
              </div>
              <button onClick={cancelProjectDelete} className="btn btn-ghost p-1.5" aria-label="Cancel project deletion" disabled={deletingProject}>
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5">
              <p className="mb-3 text-sm leading-5 text-zinc-400">
                Choose what to do with <span className="break-words text-white font-medium">{projectPendingDelete.name}</span>.
              </p>
              <div className="space-y-2">
                <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-3 text-xs text-zinc-300">
                  <input
                    type="radio"
                    checked={deleteProjectMode === 'deleteTasks'}
                    onChange={() => setDeleteProjectMode('deleteTasks')}
                    className="mt-0.5"
                  />
                  <span>
                    <span className="block font-medium text-white">Delete project and tasks</span>
                    <span className="text-zinc-500">Permanently removes tasks that belong to this project.</span>
                  </span>
                </label>
                <label className={`flex cursor-pointer items-start gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-3 text-xs text-zinc-300 ${projects.length <= 1 ? 'opacity-50' : ''}`}>
                  <input
                    type="radio"
                    checked={deleteProjectMode === 'moveTasks'}
                    disabled={projects.length <= 1}
                    onChange={() => setDeleteProjectMode('moveTasks')}
                    className="mt-0.5"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium text-white">Move tasks, then delete project</span>
                    <span className="text-zinc-500">Keeps tasks, subtasks, comments, and universal tags.</span>
                    {deleteProjectMode === 'moveTasks' && projects.length > 1 ? (
                      <select
                        value={deleteProjectTargetId}
                        onChange={(event) => setDeleteProjectTargetId(event.target.value)}
                        className="input mt-2 w-full text-xs"
                      >
                        {projects.filter((project) => project.id !== projectPendingDelete.id).map((project) => (
                          <option key={project.id} value={project.id}>{project.name}</option>
                        ))}
                      </select>
                    ) : null}
                  </span>
                </label>
              </div>
              <div className="mt-5 grid grid-cols-2 gap-2">
                <button onClick={cancelProjectDelete} className="btn btn-secondary w-full text-xs" disabled={deletingProject}>
                  Cancel
                </button>
                <button onClick={confirmProjectDelete} className="btn w-full text-xs bg-red-500/15 text-red-300 hover:bg-red-500/25" disabled={deletingProject || (deleteProjectMode === 'moveTasks' && !deleteProjectTargetId)}>
                  {deletingProject ? 'Deleting...' : 'Delete Project'}
                </button>
              </div>
            </div>
          </div>
        </>
      ) : null}

      {tagPendingDelete ? (
        <>
          <div className="fixed inset-0 bg-black/60 z-[200] backdrop" onClick={() => setTagPendingDelete(null)} />
          <div className="fixed top-1/2 left-1/2 z-[210] w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-secondary)] shadow-2xl">
            <div className="flex items-center justify-between p-5 border-b border-[var(--border)]">
              <h3 className="text-white font-semibold text-sm">Delete Tag</h3>
              <button onClick={() => setTagPendingDelete(null)} className="btn btn-ghost p-1.5" aria-label="Cancel tag deletion">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5">
              <p className="text-sm text-zinc-300">
                Delete <span className="break-all text-white font-medium">{tagPendingDelete.name}</span>?
              </p>
              <p className="text-xs text-zinc-500 mt-2">This removes the tag from every task that currently uses it.</p>
              <div className="grid grid-cols-2 gap-2 mt-5">
                <button onClick={() => setTagPendingDelete(null)} className="btn btn-secondary w-full text-xs" disabled={deletingTag}>
                  Cancel
                </button>
                <button onClick={confirmDeleteTag} className="btn btn-primary w-full text-xs" disabled={deletingTag}>
                  <Trash2 className="w-3.5 h-3.5" />
                  {deletingTag ? 'Deleting...' : 'Delete'}
                </button>
              </div>
            </div>
          </div>
        </>
      ) : null}

      {backupError ? (
        <>
          <div className="fixed inset-0 bg-black/60 z-[220] backdrop" onClick={() => setBackupError('')} />
          <div
            className="fixed top-1/2 left-1/2 z-[230] w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-red-500/20 bg-[var(--bg-secondary)] shadow-2xl"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="backup-error-title"
          >
            <div className="flex items-center justify-between p-5 border-b border-[var(--border)]">
              <div className="flex items-center gap-2">
                <TriangleAlert className="w-4 h-4 text-red-400" />
                <h3 id="backup-error-title" className="text-white font-semibold text-sm">Backup Error</h3>
              </div>
              <button onClick={() => setBackupError('')} className="btn btn-ghost p-1.5" aria-label="Close backup error">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5">
              <p className="text-sm text-zinc-300">{backupError}</p>
              <div className="flex items-center justify-end mt-5">
                <button onClick={() => setBackupError('')} className="btn btn-primary text-xs">
                  OK
                </button>
              </div>
            </div>
          </div>
        </>
      ) : null}
    </AppShell>
  )
}
