import React, { useState, useEffect } from 'react'
import { taskApi, tagApi } from '@/lib/api'
import {
  Check, Plus, X,
  ChevronRight, AlertCircle, RefreshCw, Clock,
  PanelLeftClose, PanelLeftOpen, LayoutGrid, List
} from 'lucide-react'
import { AppShell } from '@/components/AppShell'
import { TaskPanel } from '@/components/TaskPanel'
import { getOverviewPanelVisible, getTaskViewDefaults, getTaskViewMode, setOverviewPanelVisible, setTaskViewMode, type TaskFilter, type TaskSort, type TaskViewMode } from '@/lib/viewSettings'
import { ensureProjectContext, setStoredProjectId, type ProjectRecord } from '@/lib/projectContext'
import {
  ASSIGNEE_OPTIONS,
  getAssigneeOption,
  getTaskOverviewStats,
  normalizeAssignee,
  serializeAssigneeForApi,
  assigneeMatchesFilter,
  PRIORITY_CONFIG,
  type AssigneeFilter,
} from '@/lib/shared'

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

interface DashboardCache {
  tasks: Task[]
  projects: ProjectRecord[]
  workspaceId: string
  activeProjectId: string
  projectFilter: string
  tags: TagRecord[]
}

const DASHBOARD_CACHE_KEY = 'focusclaw.dashboard.snapshot'

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
  const dateOnly = dateStr.split('T')[0]
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
  if (due >= today && due < tomorrow) return 'text-amber-400'
  if (due.toDateString() === tomorrow.toDateString()) return 'text-amber-400'
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

export default function DashboardPage() {
  const taskViewDefaults = getTaskViewDefaults()
  const [tasks, setTasks] = useState<Task[]>(lastDashboardTasks)
  const [projects, setProjects] = useState<ProjectRecord[]>(lastDashboardProjects)
  const [activeWorkspace, setActiveWorkspace] = useState(lastDashboardWorkspace)
  const [activeProject, setActiveProject] = useState(lastDashboardProject)
  const [projectFilter, setProjectFilter] = useState(lastDashboardProjectFilter)
  const [loading, setLoading] = useState(!initialDashboardCache)
  const [initialized, setInitialized] = useState(lastDashboardProjects.length > 0)
  const [initError, setInitError] = useState('')

  const [showNewTaskForm, setShowNewTaskForm] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newDescription, setNewDescription] = useState('')
  const [newPriority, setNewPriority] = useState(2)
  const [newDueDate, setNewDueDate] = useState('')
  const [newAssignee, setNewAssignee] = useState('')
  const [newProjectId, setNewProjectId] = useState('')
  const [creating, setCreating] = useState(false)

  const [subtasks, setSubtasks] = useState<Subtask[]>([])
  const [showSubtaskForm, setShowSubtaskForm] = useState(false)
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('')
  const [newSubtaskPriority, setNewSubtaskPriority] = useState(2)
  const [addingSubtask, setAddingSubtask] = useState(false)

  const [sort, setSort] = useState<TaskSort>(taskViewDefaults.sort)
  const [filter, setFilter] = useState<TaskFilter>(taskViewDefaults.filter)
  const [allTags, setAllTags] = useState<TagRecord[]>(lastDashboardTags)
  const [tagFilter, setTagFilter] = useState<string>('all')
  const [assigneeFilter, setAssigneeFilter] = useState<AssigneeFilter>('all')
  const [overviewPanelVisible, setOverviewPanelVisibleState] = useState(getOverviewPanelVisible)
  const [viewMode, setViewModeState] = useState<TaskViewMode>(getTaskViewMode)
  const [visibleTaskCount, setVisibleTaskCount] = useState(TASK_VISIBLE_INCREMENT)

  const [selectedTask, setSelectedTask] = useState<Task | null>(null)
  const [taskPendingDelete, setTaskPendingDelete] = useState<Task | null>(null)
  const [deletingTask, setDeletingTask] = useState(false)
  const [panelLoading, setPanelLoading] = useState(false)
  const [comments, setComments] = useState<CommentEntry[]>([])
  const [newComment, setNewComment] = useState('')
  const [submittingComment, setSubmittingComment] = useState(false)

  const [editTitle, setEditTitle] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [editPriority, setEditPriority] = useState(2)
  const [editDueDate, setEditDueDate] = useState('')
  const [editAssignee, setEditAssignee] = useState('')
  const [editProjectId, setEditProjectId] = useState('')
  const [editTags, setEditTags] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [resetSpinning, setResetSpinning] = useState(false)

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

  const handleReset = async () => {
    try {
      setResetSpinning(true)
      const defaults = getTaskViewDefaults()
      setSort(defaults.sort)
      setFilter(defaults.filter)
      setProjectFilter('all')
      lastDashboardProjectFilter = 'all'
      setTagFilter('all')
      setAssigneeFilter('all')
      await loadTasks({ sortOverride: defaults.sort, filterOverride: defaults.filter, projectFilterOverride: 'all' })
    } finally {
      window.setTimeout(() => setResetSpinning(false), 450)
    }
  }

  useEffect(() => { initWorkspace() }, [])
  useEffect(() => { if (initialized && activeProject && projects.length > 0) loadTasks() }, [initialized, activeProject, projectFilter, sort, filter, projects])
  useEffect(() => { if (initialized && activeProject && projects.length > 0) loadProjectTags() }, [initialized, activeProject, projectFilter, selectedTask, projects])
  useEffect(() => { setVisibleTaskCount(TASK_VISIBLE_INCREMENT) }, [projectFilter, sort, filter, tagFilter, assigneeFilter])

  const initWorkspace = async () => {
    try {
      const context = await ensureProjectContext()
      const initialProjectFilter = lastDashboardProjectFilter === 'all' || context.projects.some((project) => project.id === lastDashboardProjectFilter)
        ? lastDashboardProjectFilter
        : context.activeProjectId
      const initialProjectIds = initialProjectFilter === 'all'
        ? context.projects.map((project) => project.id)
        : [initialProjectFilter]
      const [initialTasks, initialTags] = await Promise.all([
        fetchTasksForProjectIds(initialProjectIds, sort, filter),
        tagApi.list(),
      ])
      initialTags.sort((a: TagRecord, b: TagRecord) => a.name.localeCompare(b.name))

      setProjects(context.projects)
      setActiveWorkspace(context.workspace.id)
      setActiveProject(context.activeProjectId)
      setProjectFilter(initialProjectFilter)
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
    if (projectId !== 'all') {
      setActiveProject(projectId)
      setStoredProjectId(activeWorkspace, projectId)
      lastDashboardProject = projectId
    }
  }

  const fetchTasksForProjectIds = async (projectIds: string[], sortValue: TaskSort, filterValue: TaskFilter) => {
    const sortOrder = sortValue === 'createdAt' ? 'desc' : 'asc'
    const results = await Promise.all(projectIds.map((projectId) => taskApi.list(projectId, {
        sort: sortValue,
        order: sortOrder,
        filter: filterValue,
        includeArchived: filterValue !== 'archived',
      })
    ))
    return results
      .flat()
      .filter((t: Task) => !t.parentId)
      .sort((a: Task, b: Task) => compareTasks(a, b, sortValue))
  }

  const loadTasks = async (options?: { sortOverride?: TaskSort; filterOverride?: TaskFilter; projectFilterOverride?: string }) => {
    if (!activeProject) return
    try {
      if (tasks.length === 0) setLoading(true)
      const sortValue = options?.sortOverride ?? sort
      const filterValue = options?.filterOverride ?? filter
      const projectFilterValue = options?.projectFilterOverride ?? projectFilter
      const projectIds = projectFilterValue === 'all'
        ? projects.map((project) => project.id)
        : [projectFilterValue]
      if (projectIds.length === 0) return

      const nextTasks = await fetchTasksForProjectIds(projectIds, sortValue, filterValue)
      setCachedTasks(nextTasks)
    } catch (err) { console.error(err) }
    finally { setLoading(false) }
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
    const targetProjectId = newProjectId || activeProject
    if (!targetProjectId) return
    setCreating(true)
    try {
      const task = await taskApi.create({
        projectId: targetProjectId, title: newTitle.trim(),
        description: newDescription || undefined, priority: newPriority,
        dueDate: newDueDate || undefined, assignee: serializeAssigneeForApi(newAssignee),
      })
      if (activeProject !== targetProjectId) {
        setActiveProject(targetProjectId)
        setStoredProjectId(activeWorkspace, targetProjectId)
        lastDashboardProject = targetProjectId
      }
      if (projectFilter !== 'all' && projectFilter !== targetProjectId) {
        setProjectFilter(targetProjectId)
        lastDashboardProjectFilter = targetProjectId
      }
      setCachedTasks((prev) => [task, ...prev])
      setNewTitle(''); setNewDescription(''); setNewPriority(2)
      setNewDueDate(''); setNewAssignee(''); setNewProjectId(''); setShowNewTaskForm(false)
      await loadTasks({ projectFilterOverride: projectFilter !== 'all' && projectFilter !== targetProjectId ? targetProjectId : undefined })
    } catch (err) { console.error(err) }
    finally { setCreating(false) }
  }

  const openNewTaskForm = () => {
    const defaultProjectId = projectFilter !== 'all' ? projectFilter : activeProject
    setNewProjectId(defaultProjectId || projects[0]?.id || '')
    setShowNewTaskForm(true)
  }

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

  const closeTaskPanel = () => {
    if (taskPendingDelete) return
    setSelectedTask(null); setComments([]); setNewComment('')
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
    setEditDueDate(task.dueDate ? task.dueDate.split('T')[0] : '')
    setEditAssignee(normalizeAssignee(task.assignee))
    setEditProjectId(task.projectId || activeProject)
    setEditTags(task.labels ? JSON.parse(task.labels) : [])
    setPanelLoading(true); setSubtasks([]); setShowSubtaskForm(false)
    try {
      const [taskData, commentData, subtaskData] = await Promise.all([
        taskApi.get(task.id), taskApi.getComments(task.id), taskApi.getSubtasks(task.id),
      ])
      setEditTitle(taskData.title); setEditDescription(taskData.description || '')
      setEditPriority(taskData.priority)
      setEditDueDate(taskData.dueDate ? taskData.dueDate.split('T')[0] : '')
      setEditAssignee(normalizeAssignee(taskData.assignee))
      setEditProjectId(taskData.projectId || activeProject)
      setEditTags(taskData.labels ? JSON.parse(taskData.labels) : [])
      setComments(commentData.filter((c: CommentEntry) => c.action === 'comment'))
      setSubtasks(subtaskData)
    } catch (err) { console.error(err) }
    finally { setPanelLoading(false) }
  }

  const handleSaveTask = async () => {
    if (!selectedTask) return
    setSaving(true)
    try {
      const updated = await taskApi.update(selectedTask.id, {
        title: editTitle, description: editDescription || undefined,
        priority: editPriority, dueDate: editDueDate || null,
        assignee: serializeAssigneeForApi(editAssignee),
        projectId: editProjectId,
        labels: editTags,
      })
      if (updated.projectId !== activeProject) {
        setCachedTasks((prev) => prev.filter((t) => t.id !== selectedTask.id))
      } else {
        setCachedTasks((prev) => prev.map((t) => t.id === selectedTask.id ? updated : t))
      }
      setSelectedTask(updated)
      closeTaskPanel()
      await loadTasks()
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
      setNewSubtaskTitle(''); setNewSubtaskPriority(2); setShowSubtaskForm(false)
    } catch (err) { console.error(err) }
    finally { setAddingSubtask(false) }
  }

  const handleDeleteSubtask = async (subtaskId: string) => {
    try {
      await taskApi.deleteSubtask(subtaskId)
      setSubtasks((prev) => prev.filter((st) => st.id !== subtaskId))
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

  const filteredTasks = tasks.filter((task) => {
    if (!assigneeMatchesFilter(task.assignee, assigneeFilter)) return false
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
  })
  const selectedTagName = allTags.find((tag) => tag.id === tagFilter)?.name
  const visibleTasks = filteredTasks.slice(0, visibleTaskCount)
  const hiddenTaskCount = Math.max(filteredTasks.length - visibleTasks.length, 0)
  const displayedStats = getTaskOverviewStats(filteredTasks)
  const projectNameById = new Map(projects.map((project) => [project.id, project.name]))

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
          <span className="text-yellow-400 font-medium text-xs">{displayedStats.medium}</span>
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
              <button
                onClick={openNewTaskForm}
                disabled={!initialized}
                className="btn btn-primary text-xs fc-control shrink-0 px-2 sm:px-4"
              >
                <Plus className="w-3.5 h-3.5" />
                New Task
              </button>
            </div>
          </div>
          <div className="pb-3 md:pb-4">
            <div className="-mx-3 flex items-center gap-1.5 overflow-x-auto whitespace-nowrap px-3 pb-1 pr-10 sm:mx-0 sm:gap-2 sm:px-0 sm:pr-0 fc-scrollbar-hidden">
              <button onClick={handleReset} className="btn btn-secondary text-xs fc-control !w-9 !p-0 shrink-0" title="Reset">
                <RefreshCw
                  className="w-3.5 h-3.5"
                  style={resetSpinning ? { animation: 'spinOnce 0.45s linear 1' } : undefined}
                />
              </button>
              {initialized ? (
                <select
                  value={projectFilter}
                  onChange={(e) => handleProjectFilterChange(e.target.value)}
                  className="input text-xs fc-control fc-select-control fc-filter-select shrink-0"
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
                onChange={(e) => setFilter(e.target.value as any)}
                className="input text-xs fc-control fc-select-control fc-filter-select shrink-0"
                style={{ width: 158, minWidth: 158 }}
              >
                <option value="all">Status: All</option>
                <option value="dueToday">Status: Today</option>
                <option value="dueThisWeek">Status: Week</option>
                <option value="pastDue">Status: Past Due</option>
                <option value="noDate">Status: No Date</option>
                <option value="archived">Status: Done</option>
              </select>
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as any)}
                className="input text-xs fc-control fc-select-control fc-filter-select shrink-0"
                style={{ width: 164, minWidth: 164 }}
              >
                <option value="priority">Sort: Priority</option>
                <option value="dueDate">Sort: Due</option>
                <option value="createdAt">Sort: Newest</option>
              </select>
              <select
                value={tagFilter}
                onChange={(e) => setTagFilter(e.target.value)}
                className="input text-xs fc-control fc-select-control fc-filter-select shrink-0"
                style={{ width: 164, minWidth: 164 }}
              >
                <option value="all">Tag: All</option>
                {allTags.map((tag) => (
                  <option key={tag.id} value={tag.id}>Tag: {tag.name}</option>
                ))}
              </select>
              <select
                value={assigneeFilter}
                onChange={(e) => setAssigneeFilter(e.target.value as AssigneeFilter)}
                className="input text-xs fc-control fc-select-control fc-filter-select shrink-0"
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
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="spinner" />
            </div>
          ) : filteredTasks.length === 0 ? (
            <div className="text-center py-20">
              <img src="/fc-logo.png" alt="" aria-hidden="true" className="w-11 h-11 mx-auto mb-3 rounded-xl shadow-lg shadow-[rgba(245,61,45,0.2)]" />
              <p className="text-[var(--text-secondary)] font-medium">No matching tasks</p>
              <p className="text-xs text-[var(--text-muted)] mt-1">
                {tagFilter === 'all' && assigneeFilter === 'all'
                  ? 'Create a task or switch filters'
                  : `No tasks found${tagFilter === 'all' ? '' : ` with tag "${selectedTagName || 'selected'}"`}`}
              </p>
              <button
                onClick={openNewTaskForm}
                className="btn btn-primary text-xs mt-4"
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
                return (
                  <div
                    key={task.id}
                    onClick={() => openTaskPanel(task)}
                    className={`card card-hover p-4 min-h-[150px] flex flex-col gap-3 cursor-pointer transition-opacity ${isCompleted ? 'opacity-70 bg-[var(--bg-secondary)]' : ''}`}
                    style={{ borderLeft: `4px solid ${isCompleted ? 'rgba(113,113,122,0.75)' : priority.color}` }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      {isCompleted ? (
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
                      <AssigneeBadge assignee={task.assignee} />
                    </div>

                    <div className="min-w-0 flex-1 space-y-2">
                      <span className={`block text-sm font-medium break-words ${isCompleted ? 'text-zinc-500 line-through' : 'text-[var(--text-primary)]'}`}>{task.title}</span>
                      <div className="flex items-center gap-2 flex-wrap">
                        {projectFilter === 'all' && task.projectId ? (
                          <span className="fc-project-pill text-xs leading-5 text-zinc-300">{projectNameById.get(task.projectId) || 'Project'}</span>
                        ) : null}
                        {isCompleted && <span className="badge badge-muted text-[10px]">Done</span>}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`badge ${priority.badge} text-[10px] shadow-sm`} style={{ background: priority.bgColor, color: priority.color, borderColor: `${priority.color}33` }}>
                        <PriorityIcon className="w-3 h-3" />
                        {priority.label}
                      </span>
                      {task.dueDate && (
                        <span className={`text-[10px] flex items-center gap-1 ${getDueDateClass(task.dueDate)}`}>
                          <Clock className="w-3 h-3" />
                          {formatDueDate(task.dueDate)}
                        </span>
                      )}
                      {task.recurring && (
                        <span className="badge badge-recurring text-[10px]">Recurring</span>
                      )}
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
                return (
                  <div
                    key={task.id}
                    onClick={() => openTaskPanel(task)}
                    className={`card card-hover p-3 sm:p-4 flex items-start sm:items-center gap-3 cursor-pointer transition-opacity ${isCompleted ? 'opacity-70 bg-[var(--bg-secondary)]' : ''}`}
                    style={{ borderLeft: `4px solid ${isCompleted ? 'rgba(113,113,122,0.75)' : priority.color}` }}
                  >
                    {isCompleted ? (
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
                    <div className="flex-1 min-w-0 self-start">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-sm font-medium ${isCompleted ? 'text-zinc-500 line-through' : 'text-[var(--text-primary)]'}`}>{task.title}</span>
                        {isCompleted && <span className="badge badge-muted text-[10px]">Done</span>}
                        {projectFilter === 'all' && task.projectId ? (
                          <span className="fc-project-pill hidden items-center gap-1.5 rounded-full border border-zinc-700/70 bg-zinc-800/70 px-2.5 py-1 text-[10px] font-medium text-zinc-300 whitespace-nowrap sm:inline-flex">{projectNameById.get(task.projectId) || 'Project'}</span>
                        ) : null}
                      </div>
                      {projectFilter === 'all' && task.projectId ? (
                        <span className="fc-project-pill mt-1 block text-xs leading-5 text-zinc-300 sm:hidden">{projectNameById.get(task.projectId) || 'Project'}</span>
                      ) : null}
                      <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                        <span className="sm:hidden"><AssigneeBadge assignee={task.assignee} /></span>
                        <span className={`badge ${priority.badge} text-[10px] shadow-sm`} style={{ background: priority.bgColor, color: priority.color, borderColor: `${priority.color}33` }}>
                          <PriorityIcon className="w-3 h-3" />
                          {priority.label}
                        </span>
                        {task.dueDate && (
                          <span className={`text-[10px] flex items-center gap-1 ${getDueDateClass(task.dueDate)}`}>
                            <Clock className="w-3 h-3" />
                            {formatDueDate(task.dueDate)}
                          </span>
                        )}
                        {task.recurring && (
                          <span className="badge badge-recurring text-[10px]">Recurring</span>
                        )}
                      </div>
                    </div>
                    <div className="hidden sm:block"><AssigneeBadge assignee={task.assignee} /></div>
                    <ChevronRight className="hidden sm:block w-4 h-4 text-zinc-600 flex-shrink-0" />
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
          editTags={editTags}
          saving={saving}
          comments={comments}
          subtasks={subtasks}
          newComment={newComment}
          submittingComment={submittingComment}
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
          setEditTags={setEditTags}
          setNewComment={setNewComment}
          setShowSubtaskForm={setShowSubtaskForm}
          setNewSubtaskTitle={setNewSubtaskTitle}
          setNewSubtaskPriority={setNewSubtaskPriority}
          onClose={closeTaskPanel}
          onSave={handleSaveTask}
          onReopen={handleReopenTask}
          onDelete={requestDeleteTask}
          showDelete={true}
          onAddSubtask={handleAddSubtask}
          onDeleteSubtask={handleDeleteSubtask}
          onAddComment={handleAddComment}
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
              <div>
                <label className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-2 block">Description (optional)</label>
                <textarea
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  rows={2}
                  className="input resize-none"
                  placeholder="Add details..."
                />
              </div>
              <div>
                <label className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-2 block">Project</label>
                <select
                  value={newProjectId}
                  onChange={(e) => setNewProjectId(e.target.value)}
                  className="input text-xs"
                >
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
                          className={`badge ${config.badge} w-full justify-center py-2 border transition-all ${isActive ? 'ring-1 ring-current' : 'opacity-80 hover:opacity-100'}`}
                        >
                          <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: config.color }} />
                          {config.label}
                        </button>
                      )
                    })}
                  </div>
                </div>
                <div className="fc-new-task-date-field">
                  <label className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-2 block">Due Date</label>
                  <div className="fc-new-task-date-row">
                    <input
                      type="date"
                      value={newDueDate}
                      onChange={(e) => setNewDueDate(e.target.value)}
                      className="input fc-date-input fc-new-task-date-input min-w-0 flex-1 text-xs"
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
              <button type="submit" disabled={creating || !newTitle.trim() || !newProjectId} className="btn btn-primary w-full">
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
                <button onClick={handleDeleteTask} className="btn w-full text-xs bg-red-500/15 text-red-300 hover:bg-red-500/25" disabled={deletingTask}>
                  {deletingTask ? 'Deleting...' : 'Delete'}
                </button>
              </div>
            </div>
          </div>
        </>
      ) : null}
    </AppShell>
  )
}
