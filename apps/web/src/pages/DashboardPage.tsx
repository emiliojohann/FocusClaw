import React, { useState, useEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { taskApi, tagApi } from '@/lib/api'
import {
  Check, Plus, X,
  ChevronRight, AlertCircle, RefreshCw, Clock, Repeat2,
  PanelLeftClose, PanelLeftOpen, LayoutGrid, List, ListTree, Search, Paperclip, ListChecks, Trash2
} from 'lucide-react'
import { AppShell } from '@/components/AppShell'
import { DatePicker } from '@/components/DatePicker'
import { DescriptionEditor } from '@/components/DescriptionEditor'
import { TaskPanel } from '@/components/TaskPanel'
import { getOverviewPanelVisible, getTaskViewDefaults, getTaskViewMode, getTaskViewState, setOverviewPanelVisible, setTaskViewMode, setTaskViewState, type TaskFilter, type TaskSort, type TaskViewMode } from '@/lib/viewSettings'
import { ensureProjectContext, setStoredProjectId, type ProjectRecord } from '@/lib/projectContext'
import {
  ASSIGNEE_OPTIONS,
  getAssigneeOption,
  getTaskOverviewStats,
  normalizeAssignee,
  serializeAssigneeForApi,
  assigneeMatchesFilter,
  PRIORITY_CONFIG,
  RECURRING_OPTIONS,
  type AssigneeFilter,
} from '@/lib/shared'
import { resolveTaskProjectId } from '@/lib/taskForm'
import { dueDateToLocalDateKey } from '@/lib/dates'

interface Task {
  id: string
  title: string
  description?: string
  priority: number
  dueDate?: string
  assignee?: string
  createdAt: string
  updatedAt: string
  projectId?: string
  archived?: boolean
  parentId?: string
  recurring?: string
  dependsOn?: string[]
  aiReasoning?: string
  labels?: string
  tags?: TagRecord[]
  subtaskTotal?: number
  subtaskCompleted?: number
  attachmentTotal?: number
}

interface TagRecord {
  id: string
  name: string
  projectId?: string
  color?: string
}

interface Subtask {
  id: string
  title: string
  description?: string
  priority: number
  dueDate?: string
  parentId?: string
  position: number
  archived: boolean
  createdAt: string
}

interface CommentEntry {
  id: string
  taskId: string
  action: string
  changes: { content?: string; [key: string]: any }
  createdAt: string
  userId?: string
}

interface AttachmentEntry {
  id: string
  taskId: string
  name: string
  kind: string
  uri: string
  mimeType?: string | null
  sizeBytes?: number | null
  createdAt: string
}

interface DashboardCache {
  tasks: Task[]
  projects: ProjectRecord[]
  workspaceId: string
  activeProjectId: string
  projectFilter: string
  tags: TagRecord[]
}

const DASHBOARD_CACHE_KEY = 'focusclaw.dashboard.snapshot'
const NEW_TASK_EVENT = 'focusclaw:new-task'

function readDashboardCache(): DashboardCache | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(DASHBOARD_CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<DashboardCache>
    if (!Array.isArray(parsed.tasks) || !Array.isArray(parsed.projects)) return null
    return {
      tasks: parsed.tasks,
      projects: parsed.projects,
      workspaceId: parsed.workspaceId || '',
      activeProjectId: parsed.activeProjectId || '',
      projectFilter: parsed.projectFilter || 'all',
      tags: Array.isArray(parsed.tags) ? parsed.tags : [],
    }
  } catch {
    return null
  }
}

function writeDashboardCache(snapshot: DashboardCache) {
  try {
    window.localStorage.setItem(DASHBOARD_CACHE_KEY, JSON.stringify(snapshot))
  } catch {
    // Local cache is an enhancement only.
  }
}

const initialDashboardCache = readDashboardCache()
const TASK_VISIBLE_INCREMENT = 50

let lastDashboardTasks: Task[] = initialDashboardCache?.tasks ?? []
let lastDashboardProjects: ProjectRecord[] = initialDashboardCache?.projects ?? []
let lastDashboardWorkspace = initialDashboardCache?.workspaceId ?? ''
let lastDashboardProject = initialDashboardCache?.activeProjectId ?? ''
let lastDashboardProjectFilter = initialDashboardCache?.projectFilter ?? 'all'
let lastDashboardTags: TagRecord[] = initialDashboardCache?.tags ?? []

function parseDueDateAsLocalDate(dateStr: string | undefined): Date | null {
  if (!dateStr) return null
  const dateOnly = dueDateToLocalDateKey(dateStr)
  const parts = dateOnly.split('-').map(Number)
  if (parts.length === 3 && parts.every(Number.isFinite)) {
    const [year, month, day] = parts
    return new Date(year, month - 1, day)
  }
  return new Date(dateStr)
}

function getDueDateClass(dueDateStr: string | undefined): string {
  const due = parseDueDateAsLocalDate(dueDateStr)
  if (!due) return 'text-[var(--text-muted)]'
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1)
  if (due < today) return 'text-red-400'
  if (due >= today && due < tomorrow) return 'text-[var(--warning)]'
  if (due.toDateString() === tomorrow.toDateString()) return 'text-[var(--warning)]'
  return 'text-[var(--text-secondary)]'
}

function formatDueDate(dateStr: string | undefined): string {
  const due = parseDueDateAsLocalDate(dateStr)
  if (!due) return ''
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1)
  if (due < today) return `Past due ${due.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
  if (due.toDateString() === today.toDateString()) return 'Due today'
  if (due.toDateString() === tomorrow.toDateString()) return 'Due tomorrow'
  return due.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function formatRecurringLabel(recurring: string | undefined): string {
  if (!recurring) return ''
  const option = RECURRING_OPTIONS.find((item) => item.value === recurring)
  return option ? `Repeats ${option.label.toLowerCase()}` : 'Repeats'
}

function RecurringIndicator({ recurring, className = '' }: { recurring?: string; className?: string }) {
  if (!recurring) return null
  const label = formatRecurringLabel(recurring)
  return (
    <span className={`fc-recurring-icon ${className}`.trim()} title={label} aria-label={label}>
      <Repeat2 className="w-3.5 h-3.5" />
    </span>
  )
}

function AttachmentIndicator({ count = 0, className = '' }: { count?: number; className?: string }) {
  if (count <= 0) return null
  const label = `${count} ${count === 1 ? 'attachment' : 'attachments'}`
  return (
    <span className={`fc-recurring-icon fc-attachment-icon ${className}`.trim()} title={label} aria-label={label}>
      <Paperclip className="w-3.5 h-3.5" />
    </span>
  )
}

function compareTasks(a: Task, b: Task, sort: TaskSort): number {
  if (!!a.archived !== !!b.archived) return Number(a.archived) - Number(b.archived)
  if (sort === 'createdAt') {
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  }
  if (sort === 'dueDate') {
    const aDue = a.dueDate ? new Date(a.dueDate).getTime() : Number.MAX_SAFE_INTEGER
    const bDue = b.dueDate ? new Date(b.dueDate).getTime() : Number.MAX_SAFE_INTEGER
    return aDue - bDue
  }
  return (a.priority || 4) - (b.priority || 4)
}

function isTaskInProjectFilter(task: Task, projectFilter: string): boolean {
  return projectFilter === 'all' || task.projectId === projectFilter
}

function isTaskInDateFilter(task: Task, filter: TaskFilter): boolean {
  if (filter === 'all') return true
  if (filter === 'archived') return !!task.archived
  if (task.archived) return false

  const due = parseDueDateAsLocalDate(task.dueDate)
  if (filter === 'noDate') return !due
  if (!due) return false

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)

  const dayAfterTomorrow = new Date(tomorrow)
  dayAfterTomorrow.setDate(tomorrow.getDate() + 1)

  const weekStart = new Date(today)
  weekStart.setDate(today.getDate() - today.getDay())
  weekStart.setHours(0, 0, 0, 0)

  const nextWeekStart = new Date(weekStart)
  nextWeekStart.setDate(weekStart.getDate() + 7)

  const nextWeekEnd = new Date(nextWeekStart)
  nextWeekEnd.setDate(nextWeekStart.getDate() + 7)

  if (filter === 'pastDue') return due < today
  if (filter === 'dueToday') return due >= today && due < tomorrow
  if (filter === 'dueTomorrow') return due >= tomorrow && due < dayAfterTomorrow
  if (filter === 'dueThisWeek') return due >= today && due < nextWeekStart
  if (filter === 'dueNextWeek') return due >= nextWeekStart && due < nextWeekEnd
  return true
}

function shouldKeepTaskInDashboard(task: Task, projectFilter: string, filter: TaskFilter): boolean {
  return isTaskInProjectFilter(task, projectFilter) && isTaskInDateFilter(task, filter)
}

function taskMatchesTagFilter(task: Task, tagFilter: string, allTags: TagRecord[]): boolean {
  if (tagFilter === 'all') return true
  if (task.tags?.some((tag) => tag.id === tagFilter)) return true
  if (!task.labels) return false

  try {
    const labels = JSON.parse(task.labels) as string[]
    const selectedTag = allTags.find((tag) => tag.id === tagFilter)
    return Array.isArray(labels) && !!selectedTag && labels.includes(selectedTag.name)
  } catch {
    return false
  }
}

function taskMatchesSearch(task: Task, searchValue: string): boolean {
  const query = searchValue.trim().toLowerCase()
  if (!query) return true
  return [task.title, task.description]
    .filter((value): value is string => typeof value === 'string')
    .some((value) => value.toLowerCase().includes(query))
}

function shouldShowTaskInCurrentView(
  task: Task,
  options: {
    projectFilter: string
    filter: TaskFilter
    assigneeFilter: AssigneeFilter
    tagFilter: string
    searchValue: string
    allTags: TagRecord[]
  }
): boolean {
  return (
    shouldKeepTaskInDashboard(task, options.projectFilter, options.filter) &&
    assigneeMatchesFilter(task.assignee, options.assigneeFilter) &&
    taskMatchesTagFilter(task, options.tagFilter, options.allTags) &&
    taskMatchesSearch(task, options.searchValue)
  )
}

function AssigneeBadge({ assignee }: { assignee?: string }) {
  const owner = getAssigneeOption(assignee)
  const Icon = owner.icon
  return (
    <span className="badge shrink-0 text-[10px]" style={{ background: `${owner.color}18`, color: owner.color, borderColor: `${owner.color}30` }}>
      <Icon className="w-3 h-3" />
      {owner.label}
    </span>
  )
}

function SubtaskIndicator({ task }: { task: Task }) {
  const total = task.subtaskTotal || 0
  if (total === 0) return null
  const completed = task.subtaskCompleted || 0
  return (
    <span
      className="inline-flex h-5 shrink-0 items-center gap-1 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-1.5 text-[10px] font-medium text-zinc-400"
      title={`${completed}/${total} subtasks complete`}
      aria-label={`${completed} of ${total} subtasks complete`}
    >
      <ListTree className="h-3 w-3 text-zinc-500" />
      {completed}/{total}
    </span>
  )
}

export default function DashboardPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const taskViewDefaults = getTaskViewDefaults()
  const taskViewState = getTaskViewState()
  const [tasks, setTasks] = useState<Task[]>(lastDashboardTasks)
  const [projects, setProjects] = useState<ProjectRecord[]>(lastDashboardProjects)
  const [activeWorkspace, setActiveWorkspace] = useState(lastDashboardWorkspace)
  const [activeProject, setActiveProject] = useState(lastDashboardProject)
  const [projectFilter, setProjectFilter] = useState(taskViewState.projectFilter || lastDashboardProjectFilter)
  const [loading, setLoading] = useState(!initialDashboardCache || lastDashboardTasks.length === 0)
  const [showColdLoadSkeleton, setShowColdLoadSkeleton] = useState(false)
  const [initialized, setInitialized] = useState(lastDashboardProjects.length > 0)
  const [initError, setInitError] = useState('')

  const [showNewTaskForm, setShowNewTaskForm] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newDescription, setNewDescription] = useState('')
  const [newPriority, setNewPriority] = useState(2)
  const [newDueDate, setNewDueDate] = useState('')
  const [newAssignee, setNewAssignee] = useState('')
  const [newProjectId, setNewProjectId] = useState('')
  const [newRecurring, setNewRecurring] = useState('')
  const [creating, setCreating] = useState(false)

  const [subtasks, setSubtasks] = useState<Subtask[]>([])
  const [showSubtaskForm, setShowSubtaskForm] = useState(false)
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('')
  const [newSubtaskPriority, setNewSubtaskPriority] = useState(2)
  const [addingSubtask, setAddingSubtask] = useState(false)

  const [sort, setSort] = useState<TaskSort>(taskViewState.sort || taskViewDefaults.sort)
  const [filter, setFilter] = useState<TaskFilter>(taskViewState.filter || taskViewDefaults.filter)
  const [allTags, setAllTags] = useState<TagRecord[]>(lastDashboardTags)
  const [tagFilter, setTagFilter] = useState<string>(taskViewState.tagFilter || 'all')
  const [assigneeFilter, setAssigneeFilter] = useState<AssigneeFilter>((taskViewState.assigneeFilter || 'all') as AssigneeFilter)
  const [searchQuery, setSearchQuery] = useState(taskViewState.searchQuery || '')
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState((taskViewState.searchQuery || '').trim())
  const [overviewPanelVisible, setOverviewPanelVisibleState] = useState(getOverviewPanelVisible)
  const [viewMode, setViewModeState] = useState<TaskViewMode>(getTaskViewMode)
  const [visibleTaskCount, setVisibleTaskCount] = useState(TASK_VISIBLE_INCREMENT)
  const [mobileSearchExpanded, setMobileSearchExpanded] = useState(Boolean(taskViewState.searchQuery))
  const desktopSearchInputRef = useRef<HTMLInputElement | null>(null)
  const mobileSearchInputRef = useRef<HTMLInputElement | null>(null)

  const [selectedTask, setSelectedTask] = useState<Task | null>(null)
  const [taskPendingDelete, setTaskPendingDelete] = useState<Task | null>(null)
  const [deletingTask, setDeletingTask] = useState(false)
  const [bulkSelectionMode, setBulkSelectionMode] = useState(false)
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(() => new Set())
  const [bulkDeletePending, setBulkDeletePending] = useState(false)
  const [bulkDeleting, setBulkDeleting] = useState(false)
  const [bulkDeleteError, setBulkDeleteError] = useState('')
  const [bulkDeleteMessage, setBulkDeleteMessage] = useState('')
  const [panelLoading, setPanelLoading] = useState(false)
  const [comments, setComments] = useState<CommentEntry[]>([])
  const [attachments, setAttachments] = useState<AttachmentEntry[]>([])
  const [newComment, setNewComment] = useState('')
  const [newAttachmentName, setNewAttachmentName] = useState('')
  const [newAttachmentUri, setNewAttachmentUri] = useState('')
  const [newAttachmentKind, setNewAttachmentKind] = useState('file')
  const [submittingComment, setSubmittingComment] = useState(false)
  const [addingAttachment, setAddingAttachment] = useState(false)

  const [editTitle, setEditTitle] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [editPriority, setEditPriority] = useState(2)
  const [editDueDate, setEditDueDate] = useState('')
  const [editAssignee, setEditAssignee] = useState('')
  const [editProjectId, setEditProjectId] = useState('')
  const [editRecurring, setEditRecurring] = useState('')
  const [editTags, setEditTags] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [resetSpinning, setResetSpinning] = useState(false)
  const lastDashboardLoadKey = useRef('')

  useEffect(() => {
    if (!showNewTaskForm) return
    const previousBodyOverflow = document.body.style.overflow
    const previousBodyOverscroll = document.body.style.overscrollBehavior
    const previousHtmlOverflow = document.documentElement.style.overflow
    document.body.style.overflow = 'hidden'
    document.body.style.overscrollBehavior = 'none'
    document.documentElement.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousBodyOverflow
      document.body.style.overscrollBehavior = previousBodyOverscroll
      document.documentElement.style.overflow = previousHtmlOverflow
    }
  }, [showNewTaskForm])

  const toggleOverviewPanel = () => {
    setOverviewPanelVisibleState((visible) => {
      const nextVisible = !visible
      setOverviewPanelVisible(nextVisible)
      return nextVisible
    })
  }
  const toggleViewMode = () => {
    setViewModeState((mode) => {
      const nextMode = mode === 'list' ? 'grid' : 'list'
      setTaskViewMode(nextMode)
      return nextMode
    })
  }

  const setCachedTasks = (updater: Task[] | ((prev: Task[]) => Task[])) => {
    setTasks((prev) => {
      const nextTasks = typeof updater === 'function' ? updater(prev) : updater
      lastDashboardTasks = nextTasks
      writeDashboardCache({
        tasks: nextTasks,
        projects: lastDashboardProjects,
        workspaceId: lastDashboardWorkspace,
        activeProjectId: lastDashboardProject,
        projectFilter: lastDashboardProjectFilter,
        tags: lastDashboardTags,
      })
      return nextTasks
    })
  }

  const updateAttachmentTotal = (taskId: string, delta: number) => {
    const updateTask = (task: Task) => (
      task.id === taskId
        ? { ...task, attachmentTotal: Math.max((task.attachmentTotal || 0) + delta, 0) }
        : task
    )
    setCachedTasks((prev) => prev.map(updateTask))
    setSelectedTask((prev) => prev ? updateTask(prev) : prev)
  }

  function updateTaskSearch(value: string) {
    setSearchQuery(value)
    setTaskViewState({ searchQuery: value })
  }

  function clearTaskSearch(collapseMobile = false) {
    setSearchQuery('')
    setDebouncedSearchQuery('')
    setTaskViewState({ searchQuery: '' })
    if (collapseMobile) setMobileSearchExpanded(false)
  }

  function openMobileTaskSearch() {
    setMobileSearchExpanded(true)
    window.requestAnimationFrame(() => mobileSearchInputRef.current?.focus())
  }

  const handleReset = async () => {
    try {
      setResetSpinning(true)
      setBulkSelectionMode(false)
      setSelectedTaskIds(new Set())
      setBulkDeletePending(false)
      const defaults = getTaskViewDefaults()
      setSort(defaults.sort)
      setFilter(defaults.filter)
      setProjectFilter('all')
      lastDashboardProjectFilter = 'all'
      setTagFilter('all')
      setAssigneeFilter('all')
      setSearchQuery('')
      setDebouncedSearchQuery('')
      setMobileSearchExpanded(false)
      setTaskViewState({
        sort: defaults.sort,
        filter: defaults.filter,
        projectFilter: 'all',
        tagFilter: 'all',
        assigneeFilter: 'all',
        searchQuery: '',
      })
      await loadTasks({ sortOverride: defaults.sort, filterOverride: defaults.filter, projectFilterOverride: 'all', searchOverride: '' })
    } finally {
      window.setTimeout(() => setResetSpinning(false), 450)
    }
  }

  useEffect(() => { initWorkspace() }, [])
  useEffect(() => {
    if (!loading || initialized) {
      setShowColdLoadSkeleton(false)
      return
    }

    const handle = window.setTimeout(() => setShowColdLoadSkeleton(true), 220)
    return () => window.clearTimeout(handle)
  }, [initialized, loading])
  useEffect(() => {
    if (!initialized || !activeProject || projects.length === 0) return
    const projectIds = projectFilter === 'all'
      ? projects.map((project) => project.id)
      : [projectFilter]
    const loadKey = dashboardLoadKey(projectFilter, sort, filter, projectIds, debouncedSearchQuery)
    if (lastDashboardLoadKey.current === loadKey) return
    void loadTasks()
  }, [initialized, activeProject, projectFilter, sort, filter, debouncedSearchQuery, projects])
  useEffect(() => { if (initialized && activeProject && projects.length > 0) loadProjectTags() }, [initialized, activeProject, projectFilter, selectedTask, projects])
  useEffect(() => { setVisibleTaskCount(TASK_VISIBLE_INCREMENT) }, [projectFilter, sort, filter, tagFilter, assigneeFilter, debouncedSearchQuery])
  useEffect(() => {
    setBulkSelectionMode(false)
    setSelectedTaskIds(new Set())
    setBulkDeletePending(false)
    setBulkDeleteError('')
  }, [projectFilter, sort, filter, tagFilter, assigneeFilter, debouncedSearchQuery])
  useEffect(() => {
    const handle = window.setTimeout(() => setDebouncedSearchQuery(searchQuery.trim()), 200)
    return () => window.clearTimeout(handle)
  }, [searchQuery])
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      const isTypingTarget = target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.isContentEditable
      if (event.key === '/' && !isTypingTarget) {
        event.preventDefault()
        desktopSearchInputRef.current?.focus()
      } else if (
        event.key === 'Escape' &&
        searchQuery &&
        (document.activeElement === desktopSearchInputRef.current || document.activeElement === mobileSearchInputRef.current)
      ) {
        event.preventDefault()
        clearTaskSearch()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [searchQuery])

  const initWorkspace = async () => {
    try {
      const context = await ensureProjectContext()
      const storedProjectFilter = taskViewState.projectFilter || lastDashboardProjectFilter
      const initialProjectFilter = storedProjectFilter === 'all' || context.projects.some((project) => project.id === storedProjectFilter)
        ? storedProjectFilter
        : context.activeProjectId
      const initialProjectIds = initialProjectFilter === 'all'
        ? context.projects.map((project) => project.id)
        : [initialProjectFilter]
      const initialSearchQuery = (taskViewState.searchQuery || '').trim()
      const [initialTasks, initialTags] = await Promise.all([
        fetchTasksForProjectIds(initialProjectIds, sort, filter, initialSearchQuery),
        tagApi.list(),
      ])
      lastDashboardLoadKey.current = dashboardLoadKey(initialProjectFilter, sort, filter, initialProjectIds, initialSearchQuery)
      initialTags.sort((a: TagRecord, b: TagRecord) => a.name.localeCompare(b.name))

      setProjects(context.projects)
      setActiveWorkspace(context.workspace.id)
      setActiveProject(context.activeProjectId)
      setProjectFilter(initialProjectFilter)
      setTaskViewState({ projectFilter: initialProjectFilter })
      setAllTags(initialTags)
      setCachedTasks(initialTasks)
      lastDashboardProjects = context.projects
      lastDashboardWorkspace = context.workspace.id
      lastDashboardProject = context.activeProjectId
      lastDashboardProjectFilter = initialProjectFilter
      lastDashboardTags = initialTags
      writeDashboardCache({
        tasks: initialTasks,
        projects: context.projects,
        workspaceId: context.workspace.id,
        activeProjectId: context.activeProjectId,
        projectFilter: initialProjectFilter,
        tags: initialTags,
      })
      setInitialized(true)
    } catch (err) {
      setInitError('Failed to connect to API. Make sure the server is running.')
    } finally {
      setLoading(false)
    }
  }

  const handleProjectFilterChange = (projectId: string) => {
    setProjectFilter(projectId)
    lastDashboardProjectFilter = projectId
    setTagFilter('all')
    setTaskViewState({ projectFilter: projectId, tagFilter: 'all' })
    if (projectId !== 'all') {
      setActiveProject(projectId)
      setStoredProjectId(activeWorkspace, projectId)
      lastDashboardProject = projectId
    }
  }

  const fetchTasksForProjectIds = async (projectIds: string[], sortValue: TaskSort, filterValue: TaskFilter, searchValue: string) => {
    const sortOrder = sortValue === 'createdAt' ? 'desc' : 'asc'
    const results = await Promise.all(projectIds.map((projectId) => taskApi.list(projectId, {
        sort: sortValue,
        order: sortOrder,
        filter: filterValue,
        includeArchived: filterValue !== 'archived' && filterValue !== 'pastDue',
        search: searchValue,
      })
    ))
    return results
      .flat()
      .filter((t: Task) => !t.parentId)
      .sort((a: Task, b: Task) => compareTasks(a, b, sortValue))
  }

  const dashboardLoadKey = (projectFilterValue: string, sortValue: TaskSort, filterValue: TaskFilter, projectIds: string[], searchValue: string) =>
    JSON.stringify({
      projectFilter: projectFilterValue,
      sort: sortValue,
      filter: filterValue,
      projectIds: [...projectIds].sort(),
      search: searchValue,
    })

  const loadTasks = async (options?: { sortOverride?: TaskSort; filterOverride?: TaskFilter; projectFilterOverride?: string; searchOverride?: string }) => {
    if (!activeProject) return
    try {
      const hasExistingTasks = tasks.length > 0
      if (!hasExistingTasks) setLoading(true)
      const sortValue = options?.sortOverride ?? sort
      const filterValue = options?.filterOverride ?? filter
      const projectFilterValue = options?.projectFilterOverride ?? projectFilter
      const searchValue = options?.searchOverride ?? debouncedSearchQuery
      const projectIds = projectFilterValue === 'all'
        ? projects.map((project) => project.id)
        : [projectFilterValue]
      if (projectIds.length === 0) return
      lastDashboardLoadKey.current = dashboardLoadKey(projectFilterValue, sortValue, filterValue, projectIds, searchValue)

      const nextTasks = await fetchTasksForProjectIds(projectIds, sortValue, filterValue, searchValue)
      setCachedTasks(nextTasks)
    } catch (err) { console.error(err) }
    finally {
      setLoading(false)
    }
  }

  const loadProjectTags = async () => {
    if (!activeProject) return
    try {
      const tags = await tagApi.list()
      tags.sort((a: TagRecord, b: TagRecord) => a.name.localeCompare(b.name))
      setAllTags(tags)
      lastDashboardTags = tags
      writeDashboardCache({
        tasks: lastDashboardTasks,
        projects: lastDashboardProjects,
        workspaceId: lastDashboardWorkspace,
        activeProjectId: lastDashboardProject,
        projectFilter: lastDashboardProjectFilter,
        tags,
      })
    } catch (err) {
      console.error('Failed to load tags:', err)
    }
  }

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newTitle.trim()) return
    const targetProjectId = resolveTaskProjectId(newProjectId)
    if (!targetProjectId) return
    setCreating(true)
    try {
      const task = await taskApi.create({
        projectId: targetProjectId, title: newTitle.trim(),
        description: newDescription, priority: newPriority,
        dueDate: newDueDate || undefined, assignee: serializeAssigneeForApi(newAssignee),
        recurring: newRecurring || undefined,
      })
      if (activeProject !== targetProjectId) {
        setActiveProject(targetProjectId)
        setStoredProjectId(activeWorkspace, targetProjectId)
        lastDashboardProject = targetProjectId
      }
      if (projectFilter !== 'all' && projectFilter !== targetProjectId) {
        setProjectFilter(targetProjectId)
        lastDashboardProjectFilter = targetProjectId
        setTaskViewState({ projectFilter: targetProjectId })
      }
      const nextProjectFilter = projectFilter !== 'all' && projectFilter !== targetProjectId ? targetProjectId : projectFilter
      const keepCreatedTask = shouldShowTaskInCurrentView(task, {
        projectFilter: nextProjectFilter,
        filter,
        assigneeFilter,
        tagFilter,
        searchValue: debouncedSearchQuery,
        allTags,
      })
      if (keepCreatedTask) {
        setCachedTasks((prev) => [task, ...prev].sort((a, b) => compareTasks(a, b, sort)))
      }
      setNewTitle(''); setNewDescription(''); setNewPriority(2)
      setNewDueDate(''); setNewAssignee(''); setNewProjectId(''); setNewRecurring(''); setShowNewTaskForm(false)
      await loadTasks({ projectFilterOverride: projectFilter !== 'all' && projectFilter !== targetProjectId ? targetProjectId : undefined })
    } catch (err) { console.error(err) }
    finally { setCreating(false) }
  }

  const openNewTaskForm = () => {
    setNewProjectId('')
    setShowNewTaskForm(true)
  }

  useEffect(() => {
    const handleNewTask = () => {
      if (!initialized) return
      openNewTaskForm()
    }
    window.addEventListener(NEW_TASK_EVENT, handleNewTask)
    return () => window.removeEventListener(NEW_TASK_EVENT, handleNewTask)
  }, [initialized, projectFilter, activeProject, projects])

  useEffect(() => {
    if (new URLSearchParams(location.search).get('newTask') !== '1') return
    if (!initialized) return
    openNewTaskForm()
    navigate('/', { replace: true })
  }, [location.search, initialized, projectFilter, activeProject, projects, navigate])

  const handleCompleteTask = async (taskId: string) => {
    try {
      await taskApi.finish(taskId)
      await loadTasks()
    } catch (err) { console.error(err) }
  }

  const handleReopenTask = async () => {
    if (!selectedTask) return
    try {
      await taskApi.update(selectedTask.id, { archived: false })
      setCachedTasks((prev) => prev.map((t) => t.id === selectedTask.id ? { ...t, archived: false } : t))
      setSelectedTask(null)
    } catch (err) { console.error(err) }
  }

  const handleDeleteTask = async () => {
    if (!taskPendingDelete) return
    setDeletingTask(true)
    try {
      await taskApi.delete(taskPendingDelete.id)
      setCachedTasks((prev) => prev.filter((t) => t.id !== taskPendingDelete.id))
      if (selectedTask?.id === taskPendingDelete.id) setSelectedTask(null)
      setTaskPendingDelete(null)
    } catch (err) {
      console.error(err)
    } finally {
      setDeletingTask(false)
    }
  }

  const requestDeleteTask = () => {
    if (!selectedTask) return
    setTaskPendingDelete(selectedTask)
  }

  const toggleBulkSelectionMode = () => {
    setBulkSelectionMode((active) => !active)
    setSelectedTask(null)
    setSelectedTaskIds(new Set())
    setBulkDeletePending(false)
    setBulkDeleteError('')
  }

  const toggleTaskSelection = (taskId: string) => {
    setSelectedTaskIds((current) => {
      const next = new Set(current)
      if (next.has(taskId)) next.delete(taskId)
      else next.add(taskId)
      return next
    })
  }

  const cancelBulkDelete = () => {
    if (bulkDeleting) return
    setBulkDeletePending(false)
    setBulkDeleteError('')
  }

  const handleBulkDelete = async () => {
    const taskIds = [...selectedTaskIds]
    if (taskIds.length === 0) return

    setBulkDeleting(true)
    setBulkDeleteError('')
    try {
      const { deletedCount } = await taskApi.bulkDelete(taskIds)
      setCachedTasks((current) => {
        const deletedIds = new Set(selectedTaskIds)
        let foundDescendant = true
        while (foundDescendant) {
          foundDescendant = false
          for (const task of current) {
            if (task.parentId && deletedIds.has(task.parentId) && !deletedIds.has(task.id)) {
              deletedIds.add(task.id)
              foundDescendant = true
            }
          }
        }
        return current.filter((task) => !deletedIds.has(task.id))
      })
      setBulkDeletePending(false)
      setBulkSelectionMode(false)
      setSelectedTaskIds(new Set())
      setBulkDeleteMessage(`${deletedCount} ${deletedCount === 1 ? 'task' : 'tasks'} deleted`)
      window.setTimeout(() => setBulkDeleteMessage(''), 3000)
    } catch (err) {
      setBulkDeleteError(err instanceof Error ? err.message : 'Could not delete the selected tasks')
    } finally {
      setBulkDeleting(false)
    }
  }

  const closeTaskPanel = () => {
    if (taskPendingDelete) return
    setSelectedTask(null); setComments([]); setNewComment('')
    setAttachments([]); setNewAttachmentName(''); setNewAttachmentUri(''); setNewAttachmentKind('file')
  }

  const cancelDeleteTask = () => {
    if (deletingTask) return
    setTaskPendingDelete(null)
  }

  const openTaskPanel = async (task: Task) => {
    setTaskPendingDelete(null)
    setSelectedTask(task)
    setEditTitle(task.title); setEditDescription(task.description || '')
    setEditPriority(task.priority)
    setEditDueDate(dueDateToLocalDateKey(task.dueDate))
    setEditAssignee(normalizeAssignee(task.assignee))
    setEditProjectId(task.projectId || activeProject)
    setEditRecurring(task.recurring || '')
    setEditTags(task.labels ? JSON.parse(task.labels) : [])
    setPanelLoading(true); setSubtasks([]); setAttachments([]); setShowSubtaskForm(false)
    try {
      const [taskData, commentData, subtaskData, attachmentData] = await Promise.all([
        taskApi.get(task.id), taskApi.getComments(task.id), taskApi.getSubtasks(task.id), taskApi.getAttachments(task.id),
      ])
      setEditTitle(taskData.title); setEditDescription(taskData.description || '')
      setEditPriority(taskData.priority)
      setEditDueDate(dueDateToLocalDateKey(taskData.dueDate))
      setEditAssignee(normalizeAssignee(taskData.assignee))
      setEditProjectId(taskData.projectId || activeProject)
      setEditRecurring(taskData.recurring || '')
      setEditTags(taskData.labels ? JSON.parse(taskData.labels) : [])
      setComments(commentData.filter((c: CommentEntry) => c.action === 'comment'))
      setSubtasks(subtaskData)
      setAttachments(attachmentData)
    } catch (err) { console.error(err) }
    finally { setPanelLoading(false) }
  }

  const handleSaveTask = async () => {
    if (!selectedTask) return
    setSaving(true)
    try {
      const updated = await taskApi.update(selectedTask.id, {
        title: editTitle, description: editDescription,
        priority: editPriority, dueDate: editDueDate || null,
        assignee: serializeAssigneeForApi(editAssignee),
        projectId: editProjectId,
        recurring: editRecurring || null,
        labels: editTags,
      })
      const keepUpdatedTask = shouldShowTaskInCurrentView(updated, {
        projectFilter,
        filter,
        assigneeFilter,
        tagFilter,
        searchValue: debouncedSearchQuery,
        allTags,
      })
      setCachedTasks((prev) => (
        keepUpdatedTask
          ? prev.map((t) => t.id === selectedTask.id ? updated : t).sort((a, b) => compareTasks(a, b, sort))
          : prev.filter((t) => t.id !== selectedTask.id)
      ))
      setSelectedTask(updated)
      closeTaskPanel()
    } catch (err) { console.error('Failed to save task:', err) }
    finally { setSaving(false) }
  }

  const handleAddSubtask = async () => {
    if (!selectedTask || !newSubtaskTitle.trim()) return
    setAddingSubtask(true)
    try {
      const subtask = await taskApi.addSubtask(selectedTask.id, {
        title: newSubtaskTitle.trim(), priority: newSubtaskPriority,
      })
      setSubtasks((prev) => [...prev, subtask])
      setCachedTasks((prev) => prev.map((task) => (
        task.id === selectedTask.id
          ? { ...task, subtaskTotal: (task.subtaskTotal || 0) + 1 }
          : task
      )))
      setSelectedTask((prev) => prev ? { ...prev, subtaskTotal: (prev.subtaskTotal || 0) + 1 } : prev)
      setNewSubtaskTitle(''); setNewSubtaskPriority(2); setShowSubtaskForm(false)
    } catch (err) { console.error(err) }
    finally { setAddingSubtask(false) }
  }

  const handleUpdateSubtask = async (subtaskId: string, updates: Partial<{ title: string; priority: number; archived: boolean }>) => {
    const previousSubtask = subtasks.find((st) => st.id === subtaskId)
    const updated = await taskApi.updateSubtask(subtaskId, updates)
    setSubtasks((prev) => prev.map((st) => st.id === subtaskId ? updated : st))
    if (selectedTask && previousSubtask && previousSubtask.archived !== updated.archived) {
      const completedDelta = updated.archived ? 1 : -1
      const updateCounts = (task: Task) => task.id === selectedTask.id
        ? {
            ...task,
            subtaskCompleted: Math.max((task.subtaskCompleted || 0) + completedDelta, 0),
          }
        : task
      setCachedTasks((prev) => prev.map(updateCounts))
      setSelectedTask((prev) => prev ? updateCounts(prev) : prev)
    }
  }

  const handleDeleteSubtask = async (subtaskId: string) => {
    const deletingSubtask = subtasks.find((st) => st.id === subtaskId)
    try {
      await taskApi.deleteSubtask(subtaskId)
      setSubtasks((prev) => prev.filter((st) => st.id !== subtaskId))
      if (selectedTask) {
        const completedDelta = deletingSubtask?.archived ? -1 : 0
        const updateCounts = (task: Task) => task.id === selectedTask.id
          ? {
              ...task,
              subtaskTotal: Math.max((task.subtaskTotal || 0) - 1, 0),
              subtaskCompleted: Math.max((task.subtaskCompleted || 0) + completedDelta, 0),
            }
          : task
        setCachedTasks((prev) => prev.map(updateCounts))
        setSelectedTask((prev) => prev ? updateCounts(prev) : prev)
      }
    } catch (err) { console.error(err) }
  }

  const handleAddComment = async () => {
    if (!selectedTask || !newComment.trim()) return
    setSubmittingComment(true)
    try {
      await taskApi.addComment(selectedTask.id, newComment.trim())
      const updated = await taskApi.getComments(selectedTask.id)
      setComments(updated.filter((c: CommentEntry) => c.action === 'comment'))
      setNewComment('')
    } catch (err) { console.error(err) }
    finally { setSubmittingComment(false) }
  }

  const handleUpdateComment = async (commentId: string, content: string) => {
    if (!selectedTask) return
    const updated = await taskApi.updateComment(selectedTask.id, commentId, content)
    setComments((prev) => prev.map((comment) => comment.id === commentId ? updated : comment))
  }

  const handleDeleteComment = async (commentId: string) => {
    if (!selectedTask) return
    await taskApi.deleteComment(selectedTask.id, commentId)
    setComments((prev) => prev.filter((comment) => comment.id !== commentId))
  }

  const handleAddAttachment = async () => {
    if (!selectedTask || !newAttachmentName.trim() || !newAttachmentUri.trim()) return
    setAddingAttachment(true)
    try {
      const attachment = await taskApi.addAttachment(selectedTask.id, {
        name: newAttachmentName.trim(),
        kind: newAttachmentKind,
        uri: newAttachmentUri.trim(),
      })
      setAttachments((prev) => [...prev, attachment])
      updateAttachmentTotal(selectedTask.id, 1)
      setNewAttachmentName('')
      setNewAttachmentUri('')
      setNewAttachmentKind('file')
    } catch (err) { console.error(err) }
    finally { setAddingAttachment(false) }
  }

  const handlePickLocalAttachment = async () => {
    setAddingAttachment(true)
    try {
      const picked = await taskApi.pickLocalAttachment()
      if (!picked) return
      setNewAttachmentName((current) => current.trim() ? current : picked.name)
      setNewAttachmentUri(picked.uri)
      setNewAttachmentKind(picked.kind)
    } catch (err) {
      console.error(err)
      throw err
    }
    finally { setAddingAttachment(false) }
  }

  const handleDeleteAttachment = async (attachmentId: string) => {
    if (!selectedTask) return
    await taskApi.deleteAttachment(selectedTask.id, attachmentId)
    setAttachments((prev) => prev.filter((attachment) => attachment.id !== attachmentId))
    updateAttachmentTotal(selectedTask.id, -1)
  }

  const handleUpdateAttachmentName = async (attachmentId: string, name: string) => {
    if (!selectedTask) return
    const updated = await taskApi.updateAttachmentName(selectedTask.id, attachmentId, name)
    setAttachments((prev) => prev.map((attachment) => attachment.id === attachmentId ? updated : attachment))
  }

  const handleOpenAttachment = async (attachmentId: string) => {
    if (!selectedTask) return
    await taskApi.openAttachment(selectedTask.id, attachmentId)
  }

  const filteredTasks = tasks.filter((task) => {
    if (!assigneeMatchesFilter(task.assignee, assigneeFilter)) return false
    return taskMatchesTagFilter(task, tagFilter, allTags)
  })
  const selectedTagName = allTags.find((tag) => tag.id === tagFilter)?.name
  const visibleTasks = filteredTasks.slice(0, visibleTaskCount)
  const hiddenTaskCount = Math.max(filteredTasks.length - visibleTasks.length, 0)
  const displayedStats = getTaskOverviewStats(filteredTasks)
  const projectNameById = new Map(projects.map((project) => [project.id, project.name]))
  const showBlockingLoader = showColdLoadSkeleton && tasks.length === 0

  if (initError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--bg-primary)]">
        <div className="text-center max-w-md">
          <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-[var(--danger-bg)] flex items-center justify-center">
            <AlertCircle className="w-7 h-7 text-[var(--danger)]" />
          </div>
          <p className="text-[var(--text-primary)] font-medium mb-2">{initError}</p>
          <button onClick={() => window.location.reload()} className="btn btn-secondary text-sm">Retry</button>
        </div>
      </div>
    )
  }

  const sidebarStats = (
    <div className="mx-3 mb-3 p-3 rounded-xl bg-[var(--bg-card)] border border-[var(--border-subtle)]">
      <h3 className="text-[10px] font-semibold text-zinc-600 uppercase tracking-wider mb-2.5">Overview</h3>
      <div className="space-y-1.5">
        <div className="flex justify-between items-center">
          <span className="text-zinc-400 text-xs">Total</span>
          <span className="text-white font-medium text-xs">{displayedStats.total}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-zinc-400 text-xs">Completed</span>
          <span className="text-zinc-500 font-medium text-xs">{displayedStats.completed}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-zinc-400 text-xs">Critical</span>
          <span className="text-red-400 font-medium text-xs">{displayedStats.critical}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-zinc-400 text-xs">High</span>
          <span className="text-orange-400 font-medium text-xs">{displayedStats.high}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-zinc-400 text-xs">Medium</span>
          <span className="text-[var(--priority-medium)] font-medium text-xs">{displayedStats.medium}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-zinc-400 text-xs">Low</span>
          <span className="text-zinc-400 font-medium text-xs">{displayedStats.low}</span>
        </div>
      </div>
    </div>
  )

  return (
    <AppShell
      activeView="tasks"
      sidebarVisible={overviewPanelVisible}
      sidebarContent={sidebarStats}
      mainClassName="flex-1 flex flex-col min-w-0"
    >
        {/* Header */}
        <header className="bg-[var(--bg-secondary)]/80 backdrop-blur-xl border-b border-[var(--border)] px-3 sm:px-4 md:px-6">
          <div className="fc-work-header min-h-[var(--header-height)] flex flex-col items-stretch justify-center gap-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:py-0">
            <div className="flex items-center gap-3 md:gap-4 min-w-0">
              <button
                onClick={toggleOverviewPanel}
                className="btn btn-secondary text-xs fc-control !w-9 !p-0 shrink-0 fc-desktop-only"
                title={overviewPanelVisible ? 'Hide overview panel' : 'Show overview panel'}
              >
                {overviewPanelVisible ? <PanelLeftClose className="w-3.5 h-3.5" /> : <PanelLeftOpen className="w-3.5 h-3.5" />}
              </button>
              <div className="min-w-0">
                <h2 className="text-lg font-semibold text-white">Tasks</h2>
                <p className="fc-tasks-subtitle-full text-xs text-zinc-500 mt-0.5 truncate">{displayedStats.total} tasks · {displayedStats.completed} completed · {displayedStats.critical} critical · {displayedStats.high} high</p>
                <p className="fc-tasks-subtitle-landscape text-xs text-zinc-500 mt-0.5 truncate">{displayedStats.total} tasks · {displayedStats.completed} completed · {displayedStats.critical} critical · {displayedStats.high} high</p>
              </div>
            </div>
            <div className="fc-work-header-actions flex items-center justify-end gap-1.5 min-w-0 sm:gap-2">
              <div className="relative hidden w-[190px] shrink-0 sm:block">
                <input
                  ref={desktopSearchInputRef}
                  type="search"
                  value={searchQuery}
                  onChange={(e) => updateTaskSearch(e.target.value)}
                  placeholder="Search tasks"
                  disabled={!initialized}
                  className="input fc-control fc-search-input fc-search-input-desktop w-full text-xs"
                  aria-label="Search tasks"
                />
                {searchQuery ? (
                  <button
                    type="button"
                    onClick={() => clearTaskSearch()}
                    className="absolute right-2 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-md text-zinc-500 transition-colors hover:bg-[var(--bg-elevated)] hover:text-zinc-200"
                    aria-label="Clear task search"
                    title="Clear search"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                ) : null}
              </div>
              <button
                onClick={openNewTaskForm}
                disabled={!initialized}
                className="btn btn-primary text-xs fc-control shrink-0 px-2 sm:px-4 fc-desktop-only"
              >
                <Plus className="w-3.5 h-3.5" />
                New Task
              </button>
            </div>
          </div>
          <div className="pb-3 md:pb-4">
            <div className="-mx-3 flex items-center gap-1.5 overflow-x-auto whitespace-nowrap px-3 pb-1 pr-10 sm:mx-0 sm:gap-2 sm:px-0 sm:pr-0 fc-scrollbar-hidden">
              <button
                type="button"
                onClick={toggleBulkSelectionMode}
                disabled={!initialized || filteredTasks.length === 0}
                className={`btn text-xs fc-control !w-9 !p-0 shrink-0 ${bulkSelectionMode ? 'bg-[var(--accent)]/15 text-[var(--accent)]' : 'btn-secondary'}`}
                aria-pressed={bulkSelectionMode}
                aria-label={bulkSelectionMode ? 'Cancel task selection' : 'Select tasks'}
                title={bulkSelectionMode ? 'Cancel task selection' : 'Select tasks'}
              >
                {bulkSelectionMode ? <X className="h-3.5 w-3.5" /> : <ListChecks className="h-3.5 w-3.5" />}
              </button>
              <button onClick={handleReset} className="btn btn-secondary text-xs fc-control !w-9 !p-0 shrink-0" title="Reset">
                <RefreshCw
                  className="w-3.5 h-3.5"
                  style={resetSpinning ? { animation: 'spinOnce 0.45s linear 1' } : undefined}
                />
              </button>
              {mobileSearchExpanded || searchQuery ? (
                <div className="relative w-[190px] min-w-[190px] shrink-0 fc-mobile-search-only">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" />
                  <input
                    ref={mobileSearchInputRef}
                    type="search"
                    value={searchQuery}
                    onChange={(e) => updateTaskSearch(e.target.value)}
                    placeholder="Search tasks"
                    disabled={!initialized}
                    className="input fc-control fc-search-input w-full text-xs"
                    aria-label="Search tasks"
                  />
                  <button
                    type="button"
                    onClick={() => clearTaskSearch(true)}
                    className="absolute right-2 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-md text-zinc-500 transition-colors hover:bg-[var(--bg-elevated)] hover:text-zinc-200"
                    aria-label="Close task search"
                    title="Close search"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={openMobileTaskSearch}
                  disabled={!initialized}
                  className="btn btn-secondary text-xs fc-control !w-9 !p-0 shrink-0 fc-mobile-search-only"
                  aria-label="Search tasks"
                  title="Search tasks"
                >
                  <Search className="h-3.5 w-3.5" />
                </button>
              )}
              {initialized ? (
                <select
                  value={projectFilter}
                  onChange={(e) => handleProjectFilterChange(e.target.value)}
                  className="input text-xs fc-control fc-select-control fc-filter-select fc-filter-select-project shrink-0"
                  style={{ width: 162, minWidth: 162 }}
                >
                  <option value="all">Project: All</option>
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>Project: {project.name}</option>
                  ))}
                </select>
              ) : (
                <div className="fc-control rounded-xl border border-[var(--border)] bg-[var(--bg-card)] shrink-0" style={{ width: 162, minWidth: 162 }} aria-hidden="true" />
              )}
              <select
                value={filter}
                onChange={(e) => {
                  const nextFilter = e.target.value as TaskFilter
                  setFilter(nextFilter)
                  setTaskViewState({ filter: nextFilter })
                }}
                className="input text-xs fc-control fc-select-control fc-filter-select fc-filter-select-status shrink-0"
                style={{ width: 158, minWidth: 158 }}
              >
                <option value="all">Status: All</option>
                <option value="dueToday">Status: Today</option>
                <option value="dueTomorrow">Status: Tomorrow</option>
                <option value="dueThisWeek">Status: Week</option>
                <option value="dueNextWeek">Status: Next Week</option>
                <option value="pastDue">Status: Past Due</option>
                <option value="noDate">Status: No Date</option>
                <option value="archived">Status: Done</option>
              </select>
              <select
                value={sort}
                onChange={(e) => {
                  const nextSort = e.target.value as TaskSort
                  setSort(nextSort)
                  setTaskViewState({ sort: nextSort })
                }}
                className="input text-xs fc-control fc-select-control fc-filter-select fc-filter-select-sort shrink-0"
                style={{ width: 164, minWidth: 164 }}
              >
                <option value="priority">Sort: Priority</option>
                <option value="dueDate">Sort: Due</option>
                <option value="createdAt">Sort: Newest</option>
              </select>
              <select
                value={tagFilter}
                onChange={(e) => {
                  setTagFilter(e.target.value)
                  setTaskViewState({ tagFilter: e.target.value })
                }}
                className="input text-xs fc-control fc-select-control fc-filter-select fc-filter-select-tag shrink-0"
                style={{ width: 164, minWidth: 164 }}
              >
                <option value="all">Tag: All</option>
                {allTags.map((tag) => (
                  <option key={tag.id} value={tag.id}>Tag: {tag.name}</option>
                ))}
              </select>
              <select
                value={assigneeFilter}
                onChange={(e) => {
                  const nextAssigneeFilter = e.target.value as AssigneeFilter
                  setAssigneeFilter(nextAssigneeFilter)
                  setTaskViewState({ assigneeFilter: nextAssigneeFilter })
                }}
                className="input text-xs fc-control fc-select-control fc-filter-select fc-filter-select-owner shrink-0"
                style={{ width: 158, minWidth: 158 }}
              >
                <option value="all">Owner: All</option>
                <option value="user">Owner: User</option>
                <option value="agent">Owner: Agent</option>
                <option value="unassigned">Owner: Unassigned</option>
              </select>
              <button
                onClick={toggleViewMode}
                className="btn btn-secondary text-xs fc-control !w-9 !p-0 shrink-0 ml-auto fc-desktop-only"
                title={viewMode === 'list' ? 'Switch to grid view' : 'Switch to list view'}
                aria-label={viewMode === 'list' ? 'Switch to grid view' : 'Switch to list view'}
              >
                {viewMode === 'list' ? <LayoutGrid className="w-3.5 h-3.5" /> : <List className="w-3.5 h-3.5" />}
              </button>
              <div className="w-3 shrink-0 sm:hidden" aria-hidden="true" />
            </div>
          </div>
        </header>

        {/* Content */}
        <div className="flex-1 overflow-auto p-3 sm:p-4 md:p-6">
          {bulkSelectionMode ? (
            <div className="sticky top-0 z-30 mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)]/95 p-3 shadow-xl backdrop-blur-xl">
              <span className="mr-auto text-xs font-medium text-zinc-300">
                {selectedTaskIds.size} selected
              </span>
              <button
                type="button"
                onClick={() => setSelectedTaskIds(new Set())}
                disabled={selectedTaskIds.size === 0}
                className="btn btn-secondary text-xs font-normal"
              >
                Clear
              </button>
              <button
                type="button"
                onClick={() => { setBulkDeleteError(''); setBulkDeletePending(true) }}
                disabled={selectedTaskIds.size === 0}
                className="btn text-xs font-normal bg-red-500/15 text-red-300"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete
              </button>
            </div>
          ) : null}
          {showBlockingLoader ? (
            <div className="fc-task-loading-skeleton" aria-hidden="true">
              {Array.from({ length: 6 }).map((_, index) => (
                <div className="fc-task-skeleton-card" key={index}>
                  <div className="fc-task-skeleton-line fc-task-skeleton-line-title" />
                  <div className="fc-task-skeleton-line" />
                  <div className="fc-task-skeleton-meta">
                    <span />
                    <span />
                    <span />
                  </div>
                </div>
              ))}
            </div>
          ) : filteredTasks.length === 0 ? (
            <div className="text-center py-20">
              <p className="text-[var(--text-secondary)] font-medium">No matching tasks</p>
              <p className="text-xs text-[var(--text-muted)] mt-1">
                {debouncedSearchQuery
                  ? `No tasks found for "${debouncedSearchQuery}"`
                  : tagFilter === 'all' && assigneeFilter === 'all'
                    ? 'Create a task or switch filters'
                  : `No tasks found${tagFilter === 'all' ? '' : ` with tag "${selectedTagName || 'selected'}"`}`}
              </p>
              <button
                onClick={openNewTaskForm}
                className="btn btn-primary text-xs mt-4 fc-desktop-only"
              >
                <Plus className="w-3.5 h-3.5" /> New Task
              </button>
            </div>
          ) : viewMode === 'grid' ? (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {visibleTasks.map((task) => {
                const priority = PRIORITY_CONFIG[task.priority] || PRIORITY_CONFIG[4]
                const PriorityIcon = priority.icon
                const isCompleted = !!task.archived
                const isSelected = selectedTaskIds.has(task.id)
                return (
                  <div
                    key={task.id}
                    onClick={() => bulkSelectionMode ? toggleTaskSelection(task.id) : openTaskPanel(task)}
                    className={`card card-hover p-4 min-h-[150px] flex flex-col gap-3 cursor-pointer transition-opacity ${isCompleted ? 'opacity-70 bg-[var(--bg-secondary)]' : ''}`}
                    style={{ borderLeft: `4px solid ${isCompleted ? 'rgba(113,113,122,0.75)' : priority.color}` }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      {bulkSelectionMode ? (
                        <div
                          className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md border-2 transition-colors sm:h-5 sm:w-5 ${isSelected ? 'border-[var(--accent)] bg-[var(--accent)]' : 'border-zinc-600'}`}
                          role="checkbox"
                          aria-checked={isSelected}
                        >
                          {isSelected ? <Check className="h-3 w-3 text-white" /> : null}
                        </div>
                      ) : isCompleted ? (
                        <div className="w-5 h-5 rounded-full border-2 border-zinc-600 bg-zinc-700/30 flex items-center justify-center flex-shrink-0 mt-0.5">
                          <Check className="w-3 h-3 text-zinc-500" />
                        </div>
                      ) : (
                        <button
                          onClick={(e) => { e.stopPropagation(); handleCompleteTask(task.id) }}
                          className="w-7 h-7 sm:w-5 sm:h-5 rounded-full border-2 border-zinc-600 hover:border-[var(--accent)] hover:bg-[var(--accent)]/10 flex-shrink-0 transition-colors"
                          title="Mark complete"
                        />
                      )}
                      <div className="ml-auto flex shrink-0 items-center justify-end gap-1.5">
                        <SubtaskIndicator task={task} />
                        <RecurringIndicator recurring={task.recurring} className="fc-recurring-icon-mobile" />
                        <AttachmentIndicator count={task.attachmentTotal} className="fc-recurring-icon-mobile" />
                        <AssigneeBadge assignee={task.assignee} />
                      </div>
                    </div>

                    <div className="min-w-0 flex-1 space-y-2">
                      <span className={`block text-sm font-medium break-words ${isCompleted ? 'text-zinc-500 line-through' : 'text-[var(--text-primary)]'}`}>{task.title}</span>
                      <div className="flex items-center gap-2 flex-wrap">
                      </div>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`badge ${priority.badge} fc-task-priority-pill text-xs shadow-sm`} style={{ background: priority.bgColor, color: priority.color, borderColor: priority.borderColor }}>
                        <PriorityIcon className="w-3 h-3" />
                        {priority.label}
                      </span>
                      {projectFilter === 'all' && task.projectId ? (
                        <span className="fc-project-pill text-xs leading-5 text-zinc-300">{projectNameById.get(task.projectId) || 'Project'}</span>
                      ) : null}
                      {task.dueDate && (
                        <span className={`text-[10px] flex items-center gap-1 ${getDueDateClass(task.dueDate)}`}>
                          <Clock className="w-3 h-3" />
                          {formatDueDate(task.dueDate)}
                        </span>
                      )}
                      <RecurringIndicator recurring={task.recurring} className="fc-recurring-icon-desktop" />
                      <AttachmentIndicator count={task.attachmentTotal} className="fc-recurring-icon-desktop" />
                    </div>
                  </div>
                )
              })}
              </div>
              {hiddenTaskCount > 0 ? (
                <div className="flex justify-center pt-4">
                  <button onClick={() => setVisibleTaskCount((count) => count + TASK_VISIBLE_INCREMENT)} className="btn btn-secondary text-xs">
                    Show more ({hiddenTaskCount} remaining)
                  </button>
                </div>
              ) : null}
            </>
          ) : (
            <>
              <div className="space-y-2">
              {visibleTasks.map((task) => {
                const priority = PRIORITY_CONFIG[task.priority] || PRIORITY_CONFIG[4]
                const PriorityIcon = priority.icon
                const isCompleted = !!task.archived
                const isSelected = selectedTaskIds.has(task.id)
                return (
                  <div
                    key={task.id}
                    onClick={() => bulkSelectionMode ? toggleTaskSelection(task.id) : openTaskPanel(task)}
                    className={`card card-hover p-3 sm:p-4 cursor-pointer transition-opacity ${isCompleted ? 'opacity-70 bg-[var(--bg-secondary)]' : ''}`}
                    style={{ borderLeft: `4px solid ${isCompleted ? 'rgba(113,113,122,0.75)' : priority.color}` }}
                  >
                    <div className="flex items-start gap-3">
                      {bulkSelectionMode ? (
                        <div
                          className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md border-2 transition-colors sm:h-5 sm:w-5 ${isSelected ? 'border-[var(--accent)] bg-[var(--accent)]' : 'border-zinc-600'}`}
                          role="checkbox"
                          aria-checked={isSelected}
                        >
                          {isSelected ? <Check className="h-3 w-3 text-white" /> : null}
                        </div>
                      ) : isCompleted ? (
                        <div className="w-7 h-7 sm:w-5 sm:h-5 rounded-full border-2 border-zinc-600 bg-zinc-700/30 flex items-center justify-center flex-shrink-0 mt-0.5">
                          <Check className="w-3 h-3 text-zinc-500" />
                        </div>
                      ) : (
                        <button
                          onClick={(e) => { e.stopPropagation(); handleCompleteTask(task.id) }}
                          className="w-7 h-7 sm:w-5 sm:h-5 rounded-full border-2 border-zinc-600 hover:border-[var(--accent)] hover:bg-[var(--accent)]/10 flex-shrink-0 mt-0.5 transition-colors"
                          title="Mark complete"
                        />
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <span className={`block text-sm font-medium break-words ${isCompleted ? 'text-zinc-500 line-through' : 'text-[var(--text-primary)]'}`}>{task.title}</span>
                          </div>
                          <div className="ml-auto flex shrink-0 items-center justify-end gap-1.5">
                            <SubtaskIndicator task={task} />
                            <RecurringIndicator recurring={task.recurring} className="fc-recurring-icon-mobile" />
                            <AttachmentIndicator count={task.attachmentTotal} className="fc-recurring-icon-mobile" />
                            <AssigneeBadge assignee={task.assignee} />
                            <ChevronRight className="hidden sm:block w-4 h-4 text-zinc-600 flex-shrink-0" />
                          </div>
                        </div>
                        <div className="fc-task-meta-row mt-2">
                          <span className={`badge ${priority.badge} fc-task-priority-pill text-xs shadow-sm`} style={{ background: priority.bgColor, color: priority.color, borderColor: priority.borderColor }}>
                            <PriorityIcon className="w-3 h-3" />
                            {priority.label}
                          </span>
                          {projectFilter === 'all' && task.projectId ? (
                            <span className="fc-project-pill text-xs leading-5 text-zinc-300">{projectNameById.get(task.projectId) || 'Project'}</span>
                          ) : null}
                          {task.dueDate && (
                            <span className={`fc-due-pill text-[10px] ${getDueDateClass(task.dueDate)}`}>
                              <Clock className="w-3 h-3" />
                              {formatDueDate(task.dueDate)}
                            </span>
                          )}
                          <RecurringIndicator recurring={task.recurring} className="fc-recurring-icon-desktop" />
                          <AttachmentIndicator count={task.attachmentTotal} className="fc-recurring-icon-desktop" />
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
              </div>
              {hiddenTaskCount > 0 ? (
                <div className="flex justify-center pt-4">
                  <button onClick={() => setVisibleTaskCount((count) => count + TASK_VISIBLE_INCREMENT)} className="btn btn-secondary text-xs">
                    Show more ({hiddenTaskCount} remaining)
                  </button>
                </div>
              ) : null}
            </>
          )}
        </div>
      {/* Task Panel */}
      {selectedTask && (
        <TaskPanel
          selectedTask={selectedTask}
          panelLoading={panelLoading}
          editTitle={editTitle}
          editDescription={editDescription}
          editPriority={editPriority}
          editDueDate={editDueDate}
          editAssignee={editAssignee}
          editProjectId={editProjectId}
          editRecurring={editRecurring}
          editTags={editTags}
          saving={saving}
          comments={comments}
          subtasks={subtasks}
          attachments={attachments}
          newComment={newComment}
          newAttachmentName={newAttachmentName}
          newAttachmentUri={newAttachmentUri}
          submittingComment={submittingComment}
          addingAttachment={addingAttachment}
          showSubtaskForm={showSubtaskForm}
          newSubtaskTitle={newSubtaskTitle}
          newSubtaskPriority={newSubtaskPriority}
          addingSubtask={addingSubtask}
          setEditTitle={setEditTitle}
          setEditDescription={setEditDescription}
          setEditPriority={setEditPriority}
          setEditDueDate={setEditDueDate}
          setEditAssignee={setEditAssignee}
          setEditProjectId={setEditProjectId}
          setEditRecurring={setEditRecurring}
          setEditTags={setEditTags}
          setNewComment={setNewComment}
          setNewAttachmentUri={setNewAttachmentUri}
          setShowSubtaskForm={setShowSubtaskForm}
          setNewSubtaskTitle={setNewSubtaskTitle}
          setNewSubtaskPriority={setNewSubtaskPriority}
          onClose={closeTaskPanel}
          onSave={handleSaveTask}
          onReopen={handleReopenTask}
          onDelete={requestDeleteTask}
          showDelete={true}
          onAddSubtask={handleAddSubtask}
          onUpdateSubtask={handleUpdateSubtask}
          onDeleteSubtask={handleDeleteSubtask}
          onAddComment={handleAddComment}
          onAddAttachment={handleAddAttachment}
          onPickLocalAttachment={handlePickLocalAttachment}
          onOpenAttachment={handleOpenAttachment}
          onUpdateAttachmentName={handleUpdateAttachmentName}
          onDeleteAttachment={handleDeleteAttachment}
          onUpdateComment={handleUpdateComment}
          onDeleteComment={handleDeleteComment}
          projectId={activeProject}
          projects={projects}
          icon="tasks"
        />
      )}

      {/* New Task Form */}
      {showNewTaskForm && (
        <>
          <div className="fixed inset-0 bg-black/60 z-[200] backdrop" onClick={() => setShowNewTaskForm(false)} />
          <div className="fc-modal-surface fixed top-1/2 left-1/2 z-[210] flex max-h-[calc(100dvh-1.5rem)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-secondary)] shadow-2xl">
            <div className="flex items-center justify-between p-5 border-b border-[var(--border)]">
              <h3 className="text-white font-semibold text-sm">New Task</h3>
              <button onClick={() => setShowNewTaskForm(false)} className="btn btn-ghost p-1.5">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleCreateTask} className="fc-modal-scroll min-h-0 flex-1 space-y-4 overflow-y-auto overflow-x-hidden p-5">
              <div>
                <label className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-2 block">Title</label>
                <input
                  type="text"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="e.g. Finish quarterly report"
                  className="input"
                  autoFocus
                />
              </div>
              <DescriptionEditor
                value={newDescription}
                onChange={setNewDescription}
                label="Description"
                rows={4}
                minHeight={112}
                placeholder="Add details..."
              />
              <div>
                <label className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-2 block">Project</label>
                <select
                  value={newProjectId}
                  onChange={(e) => setNewProjectId(e.target.value)}
                  className="input text-xs"
                  required
                >
                  <option value="">Select a project</option>
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>{project.name}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-3">
                <div>
                  <label className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-2 block">Priority</label>
                  <div className="grid grid-cols-2 gap-2">
                    {[1, 2, 3, 4].map((p) => {
                      const config = PRIORITY_CONFIG[p]
                      const isActive = newPriority === p
                      return (
                        <button
                          key={p}
                          type="button"
                          onClick={() => setNewPriority(p)}
                          className={`badge ${config.badge} w-full justify-center py-2 border transition-all ${isActive ? 'opacity-100' : 'opacity-80 hover:opacity-100'}`}
                          style={isActive ? { background: config.color, borderColor: config.color, color: config.activeTextColor } : undefined}
                        >
                          {config.label}
                        </button>
                      )
                    })}
                  </div>
                </div>
                <div className="fc-new-task-date-field">
                  <label className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-2 block">Due Date</label>
                  <div className="fc-new-task-date-row">
                    <DatePicker
                      value={newDueDate}
                      onChange={setNewDueDate}
                      className="min-w-0 flex-1"
                      buttonClassName="fc-date-input fc-new-task-date-input"
                    />
                    {newDueDate ? (
                      <button
                        type="button"
                        onClick={() => setNewDueDate('')}
                        className="btn btn-secondary fc-control shrink-0 px-3 text-xs"
                        aria-label="Clear due date"
                        title="Clear due date"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    ) : null}
                  </div>
                  {!newDueDate ? (
                    <p className="fc-date-helper">
                      <span className="fc-date-helper-desktop">Click to select a date</span>
                      <span className="fc-date-helper-mobile">Tap to select a date</span>
                    </p>
                  ) : null}
                </div>
                <div>
                  <label className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-2 block">Repeats</label>
                  <select
                    value={newRecurring}
                    onChange={(e) => setNewRecurring(e.target.value)}
                    className="input text-xs fc-control fc-select-control w-full"
                  >
                    {RECURRING_OPTIONS.map((option) => (
                      <option key={option.value || 'none'} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-2 block">Assignee</label>
                <div className="flex gap-2">
                  {ASSIGNEE_OPTIONS.map((agent) => {
                    const Icon = agent.icon
                    const isActive = normalizeAssignee(newAssignee) === agent.id
                    return (
                      <button
                        key={agent.filter}
                        type="button"
                        onClick={() => setNewAssignee(agent.id)}
                        className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg border text-xs font-medium transition-all"
                        style={isActive ? { background: `${agent.color}12`, borderColor: `${agent.color}40`, color: agent.color } : { borderColor: 'var(--border)', color: 'var(--text-muted)' }}
                      >
                        <Icon className="w-3.5 h-3.5" />
                        {agent.label}
                      </button>
                    )
                  })}
                </div>
              </div>
              <button type="submit" disabled={creating || !newTitle.trim() || !resolveTaskProjectId(newProjectId)} className="btn btn-primary w-full">
                {creating ? 'Creating...' : 'Create Task'}
              </button>
            </form>
          </div>
        </>
      )}
      {taskPendingDelete ? (
        <>
          <div className="fixed inset-0 bg-black/70 z-[220] backdrop" onClick={cancelDeleteTask} />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-task-title"
            className="fixed top-1/2 left-1/2 z-[230] w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-secondary)] shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-4">
              <h3 id="delete-task-title" className="text-white font-semibold text-sm">Delete Task</h3>
              <button onClick={cancelDeleteTask} className="btn btn-ghost p-1.5" aria-label="Cancel task deletion" disabled={deletingTask}>
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5">
              <p className="text-sm leading-5 text-zinc-400">
                Delete <span className="break-words text-white font-medium">{taskPendingDelete.title}</span>?
              </p>
              <p className="mt-2 text-xs leading-5 text-zinc-500">This removes the task, its subtasks, and comments.</p>
              <div className="grid grid-cols-2 gap-2 mt-5">
                <button onClick={cancelDeleteTask} className="btn btn-secondary w-full text-xs" disabled={deletingTask}>
                  Cancel
                </button>
                <button onClick={handleDeleteTask} className="btn w-full text-xs bg-red-500/15 text-red-300" disabled={deletingTask}>
                  {deletingTask ? 'Deleting...' : 'Delete'}
                </button>
              </div>
            </div>
          </div>
        </>
      ) : null}
      {bulkDeletePending && selectedTaskIds.size > 0 ? (
        <>
          <div className="fixed inset-0 bg-black/70 z-[220] backdrop" onClick={cancelBulkDelete} />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="bulk-delete-task-title"
            className="fixed top-1/2 left-1/2 z-[230] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-secondary)] shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-4">
              <h3 id="bulk-delete-task-title" className="text-sm font-semibold text-white">
                Delete {selectedTaskIds.size} {selectedTaskIds.size === 1 ? 'Task' : 'Tasks'}
              </h3>
              <button onClick={cancelBulkDelete} className="btn btn-ghost p-1.5" aria-label="Cancel bulk task deletion" disabled={bulkDeleting}>
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-5">
              <p className="text-sm leading-5 text-zinc-300">
                Permanently delete {selectedTaskIds.size} selected {selectedTaskIds.size === 1 ? 'task' : 'tasks'}?
              </p>
              <ul className="mt-3 max-h-32 space-y-1 overflow-y-auto text-xs text-zinc-400">
                {filteredTasks.filter((task) => selectedTaskIds.has(task.id)).slice(0, 5).map((task) => (
                  <li key={task.id} className="truncate">• {task.title}</li>
                ))}
                {selectedTaskIds.size > 5 ? <li className="text-zinc-500">• and {selectedTaskIds.size - 5} more</li> : null}
              </ul>
              <p className="mt-3 text-xs leading-5 text-zinc-500">
                This also removes subtasks, comments, tag links, and attachment metadata. Linked files remain untouched.
              </p>
              {bulkDeleteError ? <p className="mt-3 text-xs text-red-300">{bulkDeleteError}</p> : null}
              <div className="mt-5 grid grid-cols-2 gap-2">
                <button onClick={cancelBulkDelete} className="btn btn-secondary w-full text-xs" disabled={bulkDeleting}>
                  Cancel
                </button>
                <button onClick={handleBulkDelete} className="btn w-full text-xs bg-red-500/15 text-red-300" disabled={bulkDeleting}>
                  {bulkDeleting ? 'Deleting...' : `Delete ${selectedTaskIds.size} ${selectedTaskIds.size === 1 ? 'Task' : 'Tasks'}`}
                </button>
              </div>
            </div>
          </div>
        </>
      ) : null}
      {bulkDeleteMessage ? (
        <div className="fixed bottom-5 left-1/2 z-[240] -translate-x-1/2 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-2 text-xs font-medium text-[var(--success)] shadow-xl" role="status">
          {bulkDeleteMessage}
        </div>
      ) : null}
    </AppShell>
  )
}
