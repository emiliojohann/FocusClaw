import { useState, useEffect, type FormEvent, type ReactNode } from 'react'
import { taskApi } from '@/lib/api'
import { AppShell } from '@/components/AppShell'
import { TaskPanel } from '@/components/TaskPanel'
import {
  DndContext,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import {
  CalendarDays, AlertCircle, RefreshCw,
  ChevronLeft, ChevronRight, PanelLeftClose, PanelLeftOpen, Plus, X
} from 'lucide-react'
import { getCalendarViewDefaults, getOverviewPanelVisible, setOverviewPanelVisible } from '@/lib/viewSettings'
import { ensureProjectContext, setStoredProjectId, type ProjectRecord } from '@/lib/projectContext'
import {
  ASSIGNEE_OPTIONS,
  getAssigneeOption,
  getTaskOverviewStats,
  normalizeAssignee,
  serializeAssigneeForApi,
  assigneeMatchesFilter,
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
  labels?: string
}

interface CommentEntry {
  id: string
  taskId: string
  action: string
  changes: { content?: string; [key: string]: any }
  createdAt: string
  userId?: string
}

interface CalendarCache {
  tasks: Task[]
  overviewTasks: Task[]
  projects: ProjectRecord[]
  workspaceId: string
  activeProjectId: string
  projectFilter: string
}

const CALENDAR_CACHE_KEY = 'focusclaw.calendar.snapshot'

function readCalendarCache(): CalendarCache | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(CALENDAR_CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<CalendarCache>
    if (!Array.isArray(parsed.tasks) || !Array.isArray(parsed.overviewTasks) || !Array.isArray(parsed.projects)) return null
    return {
      tasks: parsed.tasks,
      overviewTasks: parsed.overviewTasks,
      projects: parsed.projects,
      workspaceId: parsed.workspaceId || '',
      activeProjectId: parsed.activeProjectId || '',
      projectFilter: parsed.projectFilter || 'all',
    }
  } catch {
    return null
  }
}

function writeCalendarCache(snapshot: CalendarCache) {
  try {
    window.localStorage.setItem(CALENDAR_CACHE_KEY, JSON.stringify(snapshot))
  } catch {
    // Local cache is an enhancement only.
  }
}

const initialCalendarCache = readCalendarCache()

let lastCalendarTasks: Task[] = initialCalendarCache?.tasks ?? []
let lastCalendarOverviewTasks: Task[] = initialCalendarCache?.overviewTasks ?? []
let lastCalendarProjects: ProjectRecord[] = initialCalendarCache?.projects ?? []
let lastCalendarWorkspace = initialCalendarCache?.workspaceId ?? ''
let lastCalendarProject = initialCalendarCache?.activeProjectId ?? ''
let lastCalendarProjectFilter = initialCalendarCache?.projectFilter ?? 'all'

const PRIORITY_CONFIG: Record<number, { label: string; badge: string; color: string; bgColor: string }> = {
  1: { label: 'Critical', badge: 'badge-critical', color: '#ef4444', bgColor: 'rgba(239,68,68,0.15)' },
  2: { label: 'High', badge: 'badge-high', color: '#f97316', bgColor: 'rgba(249,115,22,0.15)' },
  3: { label: 'Medium', badge: 'badge-medium', color: '#eab308', bgColor: 'rgba(234,179,8,0.15)' },
  4: { label: 'Low', badge: 'badge-low', color: '#71717a', bgColor: 'rgba(113,113,122,0.12)' },
}

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const MAX_VISIBLE_DAY_TASKS = 2

function AssigneeBadge({ assignee, compact = false }: { assignee?: string; compact?: boolean }) {
  const owner = getAssigneeOption(assignee)
  const Icon = owner.icon
  return (
    <span
      className={`badge h-4 shrink-0 px-1.5 py-0 text-[9px] leading-none ${compact ? 'max-w-[4.75rem] gap-1' : ''}`}
      style={{ background: `${owner.color}18`, color: owner.color, borderColor: `${owner.color}30` }}
      title={`Owner: ${owner.label}`}
    >
      <Icon className="w-2.5 h-2.5" />
      <span className="truncate">{owner.label}</span>
    </span>
  )
}

function CalendarTaskChip({ task, onOpen }: { task: Task; onOpen: (task: Task) => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `task:${task.id}`,
    data: { taskId: task.id },
    disabled: task.archived,
  })

  const priority = PRIORITY_CONFIG[task.priority] || PRIORITY_CONFIG[4]
  const isCompleted = !!task.archived
  const style = {
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
    opacity: isDragging ? 0.65 : 1,
    background: isCompleted ? 'rgba(113,113,122,0.14)' : priority.bgColor,
    color: isCompleted ? 'rgba(161,161,170,0.72)' : priority.color,
    border: `1px solid ${isCompleted ? 'rgba(113,113,122,0.28)' : priority.color + '30'}`,
    borderLeft: `3px solid ${isCompleted ? 'rgba(113,113,122,0.75)' : priority.color}`,
    textDecoration: isCompleted ? 'line-through' : 'none',
    boxShadow: isDragging ? `0 10px 28px ${priority.color}26` : undefined,
    zIndex: isDragging ? 20 : undefined,
    transition: isDragging
      ? 'none'
      : 'transform 160ms ease, opacity 160ms ease, background-color 160ms ease, border-color 160ms ease',
    willChange: isDragging ? 'transform' : undefined,
  } as const

  return (
    <button
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      onClick={() => onOpen(task)}
      className={`group w-full text-left px-2 py-1.5 rounded-lg transition-all hover:opacity-90 hover:shadow-sm touch-none ${
        isCompleted ? 'cursor-pointer' : isDragging ? 'cursor-grabbing scale-[1.02]' : 'cursor-grab active:cursor-grabbing'
      }`}
      style={style}
      title={task.title}
    >
      <span className="block min-w-0 truncate text-[11px] leading-4">{task.title}</span>
    </button>
  )
}

function CalendarDayCell({
  day,
  isTodayDay,
  children,
  className = '',
}: {
  day: number
  isTodayDay: boolean
  children: ReactNode
  className?: string
}) {
  const { isOver, setNodeRef } = useDroppable({
    id: `day:${day}`,
    data: { day },
  })

  return (
    <div
      ref={setNodeRef}
      className={`min-h-[120px] p-2 transition-colors duration-150 ${
        isTodayDay ? 'bg-[var(--accent-subtle)]' : 'bg-[var(--bg-primary)]'
      } ${isOver ? 'bg-[rgba(245,61,45,0.12)] ring-1 ring-[var(--accent)] ring-inset' : ''} ${className}`}
    >
      {children}
    </div>
  )
}

function CalendarAgendaTaskRow({ task, onOpen }: { task: Task; onOpen: (task: Task) => void }) {
  const priority = PRIORITY_CONFIG[task.priority] || PRIORITY_CONFIG[4]
  const isCompleted = !!task.archived

  return (
    <button
      type="button"
      onClick={() => onOpen(task)}
      className="w-full rounded-xl border p-3 text-left transition-colors hover:bg-[var(--bg-elevated)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
      style={{
        background: isCompleted ? 'rgba(113,113,122,0.10)' : priority.bgColor,
        borderColor: isCompleted ? 'rgba(113,113,122,0.28)' : `${priority.color}30`,
      }}
    >
      <span className="flex items-center gap-2 min-w-0">
        <span
          className="h-8 w-1 rounded-full shrink-0"
          style={{ background: isCompleted ? 'rgba(113,113,122,0.75)' : priority.color }}
        />
        <span className="min-w-0 flex-1">
          <span className={`block truncate text-sm font-medium ${isCompleted ? 'text-zinc-500 line-through' : 'text-white'}`}>
            {task.title}
          </span>
          <span className="block truncate text-[11px] text-zinc-500">{isCompleted ? 'Completed' : priority.label}</span>
        </span>
        {!isCompleted && <span className={`badge ${priority.badge} shrink-0 text-[10px]`}>{priority.label}</span>}
        {isCompleted && <span className="shrink-0 text-[10px] font-medium text-zinc-500">Done</span>}
        <AssigneeBadge assignee={task.assignee} />
      </span>
    </button>
  )
}

export default function CalendarPage() {
  const calendarDefaults = getCalendarViewDefaults()
  const [tasks, setTasks] = useState<Task[]>(lastCalendarTasks)
  const [overviewTasks, setOverviewTasks] = useState<Task[]>(lastCalendarOverviewTasks)
  const [projects, setProjects] = useState<ProjectRecord[]>(lastCalendarProjects)
  const [activeWorkspace, setActiveWorkspace] = useState(lastCalendarWorkspace)
  const [activeProject, setActiveProject] = useState(lastCalendarProject)
  const [projectFilter, setProjectFilter] = useState(lastCalendarProjectFilter)
  const [currentDate, setCurrentDate] = useState(new Date())
  const [loading, setLoading] = useState(!initialCalendarCache)
  const [initialized, setInitialized] = useState(lastCalendarProjects.length > 0)
  const [initError, setInitError] = useState('')
  const [showCompleted, setShowCompleted] = useState(calendarDefaults.showCompleted)
  const [assigneeFilter, setAssigneeFilter] = useState<AssigneeFilter>('all')
  const [overviewPanelVisible, setOverviewPanelVisibleState] = useState(getOverviewPanelVisible)
  const [moveError, setMoveError] = useState('')
  const [activeDragTaskId, setActiveDragTaskId] = useState('')
  const [agendaDay, setAgendaDay] = useState<number | null>(null)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))

  const [showNewTaskForm, setShowNewTaskForm] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newDescription, setNewDescription] = useState('')
  const [newPriority, setNewPriority] = useState(2)
  const [newDueDate, setNewDueDate] = useState('')
  const [newAssignee, setNewAssignee] = useState('')
  const [newProjectId, setNewProjectId] = useState('')
  const [creating, setCreating] = useState(false)

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

  const handleReset = async () => {
    try {
      setResetSpinning(true)
      const defaults = getCalendarViewDefaults()
      setShowCompleted(defaults.showCompleted)
      setAssigneeFilter('all')
      setProjectFilter('all')
      lastCalendarProjectFilter = 'all'
      setCurrentDate(new Date())
      await loadTasks({ showCompletedOverride: defaults.showCompleted, projectFilterOverride: 'all' })
    } finally {
      window.setTimeout(() => setResetSpinning(false), 450)
    }
  }
  const toggleOverviewPanel = () => {
    setOverviewPanelVisibleState((visible) => {
      const nextVisible = !visible
      setOverviewPanelVisible(nextVisible)
      return nextVisible
    })
  }

  const [selectedTask, setSelectedTask] = useState<Task | null>(null)
  const [panelLoading, setPanelLoading] = useState(false)
  const [editTitle, setEditTitle] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [editPriority, setEditPriority] = useState(2)
  const [editDueDate, setEditDueDate] = useState('')
  const [editAssignee, setEditAssignee] = useState('')
  const [editProjectId, setEditProjectId] = useState('')
  const [editTags, setEditTags] = useState<string[]>([])
  const [saving, setSaving] = useState(false)

  const [subtasks, setSubtasks] = useState<any[]>([])
  const [showSubtaskForm, setShowSubtaskForm] = useState(false)
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('')
  const [newSubtaskPriority, setNewSubtaskPriority] = useState(2)
  const [addingSubtask, setAddingSubtask] = useState(false)
  const [comments, setComments] = useState<CommentEntry[]>([])
  const [newComment, setNewComment] = useState('')
  const [submittingComment, setSubmittingComment] = useState(false)

  const setCachedTasks = (updater: Task[] | ((prev: Task[]) => Task[])) => {
    setTasks((prev) => {
      const nextTasks = typeof updater === 'function' ? updater(prev) : updater
      lastCalendarTasks = nextTasks
      writeCalendarCache({
        tasks: nextTasks,
        overviewTasks: lastCalendarOverviewTasks,
        projects: lastCalendarProjects,
        workspaceId: lastCalendarWorkspace,
        activeProjectId: lastCalendarProject,
        projectFilter: lastCalendarProjectFilter,
      })
      return nextTasks
    })
  }

  useEffect(() => { initWorkspace() }, [])
  useEffect(() => { if (initialized && activeProject && projects.length > 0) loadTasks() }, [initialized, activeProject, projectFilter, showCompleted, projects])

  const initWorkspace = async () => {
    try {
      const context = await ensureProjectContext()
      const initialProjectId = context.projects.some((project) => project.id === lastCalendarProject)
        ? lastCalendarProject
        : context.activeProjectId
      const initialProjectFilter = lastCalendarProjectFilter === 'all' || context.projects.some((project) => project.id === lastCalendarProjectFilter)
        ? lastCalendarProjectFilter
        : 'all'
      const initialProjectIds = initialProjectFilter === 'all'
        ? context.projects.map((project) => project.id)
        : [initialProjectFilter]
      const { calendarTasks, overviewTasks } = await fetchCalendarTasks(initialProjectIds, showCompleted)

      setProjects(context.projects)
      setActiveWorkspace(context.workspace.id)
      setActiveProject(initialProjectId)
      setProjectFilter(initialProjectFilter)
      setCachedTasks(calendarTasks)
      setOverviewTasks(overviewTasks)
      lastCalendarProjects = context.projects
      lastCalendarWorkspace = context.workspace.id
      lastCalendarProject = initialProjectId
      lastCalendarProjectFilter = initialProjectFilter
      lastCalendarOverviewTasks = overviewTasks
      writeCalendarCache({
        tasks: calendarTasks,
        overviewTasks,
        projects: context.projects,
        workspaceId: context.workspace.id,
        activeProjectId: initialProjectId,
        projectFilter: initialProjectFilter,
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
    lastCalendarProjectFilter = projectId
    if (projectId !== 'all') {
      setActiveProject(projectId)
      setStoredProjectId(activeWorkspace, projectId)
      lastCalendarProject = projectId
    }
    closeTaskPanel()
  }

  const handleCreateTask = async (e: FormEvent) => {
    e.preventDefault()
    if (!newTitle.trim()) return
    const targetProjectId = newProjectId || activeProject
    if (!targetProjectId) return
    setCreating(true)
    try {
      const task = await taskApi.create({
        projectId: targetProjectId,
        title: newTitle.trim(),
        description: newDescription || undefined,
        priority: newPriority,
        dueDate: newDueDate || undefined,
        assignee: serializeAssigneeForApi(newAssignee),
      })
      if (activeProject !== targetProjectId) {
        setActiveProject(targetProjectId)
        setStoredProjectId(activeWorkspace, targetProjectId)
        lastCalendarProject = targetProjectId
      }
      if (projectFilter !== 'all' && projectFilter !== targetProjectId) {
        setProjectFilter(targetProjectId)
        lastCalendarProjectFilter = targetProjectId
      }
      if (task.dueDate && (projectFilter === 'all' || projectFilter === targetProjectId)) {
        setCachedTasks((prev) => [task, ...prev])
      }
      setNewTitle('')
      setNewDescription('')
      setNewPriority(2)
      setNewDueDate('')
      setNewAssignee('')
      setNewProjectId('')
      setShowNewTaskForm(false)
      await loadTasks({ projectFilterOverride: projectFilter !== 'all' && projectFilter !== targetProjectId ? targetProjectId : undefined })
    } catch (err) {
      console.error(err)
    } finally {
      setCreating(false)
    }
  }

  const fetchCalendarTasks = async (projectIds: string[], includeCompleted: boolean) => {
    const [calendarResults, overviewResults] = await Promise.all([
      Promise.all(projectIds.map((projectId) => taskApi.list(projectId, includeCompleted ? { includeArchived: true } : {}))),
      Promise.all(projectIds.map((projectId) => taskApi.list(projectId, { includeArchived: true }))),
    ])
    const result = calendarResults.flat()
    const calendarTasks = result.filter((t: Task) => !t.parentId && t.dueDate)
    const overviewTasks = overviewResults.flat()
    return { calendarTasks, overviewTasks }
  }

  const loadTasks = async (options?: { showCompletedOverride?: boolean; projectFilterOverride?: string }) => {
    if (!activeProject || projects.length === 0) return
    try {
      if (tasks.length === 0) setLoading(true)
      const includeCompleted = options?.showCompletedOverride ?? showCompleted
      const projectFilterValue = options?.projectFilterOverride ?? projectFilter
      const projectIds = projectFilterValue === 'all'
        ? projects.map((project) => project.id)
        : [projectFilterValue]
      const { calendarTasks, overviewTasks } = await fetchCalendarTasks(projectIds, includeCompleted)
      setCachedTasks(calendarTasks)
      setOverviewTasks(overviewTasks)
      lastCalendarOverviewTasks = overviewTasks
      lastCalendarProjectFilter = projectFilterValue
      writeCalendarCache({
        tasks: calendarTasks,
        overviewTasks,
        projects: lastCalendarProjects,
        workspaceId: lastCalendarWorkspace,
        activeProjectId: lastCalendarProject,
        projectFilter: lastCalendarProjectFilter,
      })
    } catch (err) { console.error('Failed to load tasks:', err) }
    finally { setLoading(false) }
  }

  const refreshOverviewStats = async () => {
    if (!activeProject || projects.length === 0) return
    const projectIds = projectFilter === 'all'
      ? projects.map((project) => project.id)
      : [projectFilter]
    const overviewTasks = (await Promise.all(projectIds.map((projectId) => taskApi.list(projectId, { includeArchived: true })))).flat()
    setOverviewTasks(overviewTasks)
    lastCalendarOverviewTasks = overviewTasks
    writeCalendarCache({
      tasks: lastCalendarTasks,
      overviewTasks,
      projects: lastCalendarProjects,
      workspaceId: lastCalendarWorkspace,
      activeProjectId: lastCalendarProject,
      projectFilter: lastCalendarProjectFilter,
    })
  }

  const year = currentDate.getFullYear()
  const month = currentDate.getMonth()
  const firstDayOfMonth = new Date(year, month, 1)
  const lastDayOfMonth = new Date(year, month + 1, 0)
  const daysInMonth = lastDayOfMonth.getDate()
  let startDayOfWeek = firstDayOfMonth.getDay() - 1
  if (startDayOfWeek < 0) startDayOfWeek = 6
  const trailingEmptyDays = (7 - ((startDayOfWeek + daysInMonth) % 7)) % 7

  const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1))
  const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1))
  const goToToday = () => setCurrentDate(new Date())

  const formatDateInput = (date: Date) =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`

  const openNewTaskForm = () => {
    const today = new Date()
    const defaultDueDate = today.getFullYear() === year && today.getMonth() === month
      ? today
      : new Date(year, month, 1)
    const defaultProjectId = projectFilter !== 'all' ? projectFilter : activeProject
    setNewProjectId(defaultProjectId || projects[0]?.id || '')
    setNewDueDate(formatDateInput(defaultDueDate))
    setShowNewTaskForm(true)
  }

  const getTasksForDay = (day: number): Task[] => {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    return tasks.filter(t => t.dueDate && t.dueDate.split('T')[0] === dateStr && assigneeMatchesFilter(t.assignee, assigneeFilter))
  }

  const totalCalendarCells = startDayOfWeek + daysInMonth + trailingEmptyDays
  const getCalendarCellBorders = (cellIndex: number) => {
    const isLastColumn = cellIndex % 7 === 6
    const isLastRow = cellIndex >= totalCalendarCells - 7
    return `${isLastColumn ? '' : 'border-r border-[var(--border)]'} ${isLastRow ? '' : 'border-b border-[var(--border)]'}`
  }

  const formatAgendaDate = (day: number) =>
    new Date(year, month, day).toLocaleDateString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })

  const formatDateForDay = (day: number) =>
    `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`

  const handleTaskDrop = async (event: DragEndEvent) => {
    const overId = event.over?.id
    const taskId = event.active.data.current?.taskId as string | undefined
    if (!overId || !taskId) return
    const dayRaw = String(overId).replace('day:', '')
    const nextDay = Number(dayRaw)
    if (!Number.isInteger(nextDay) || nextDay < 1 || nextDay > daysInMonth) return

    const nextDate = formatDateForDay(nextDay)
    const original = tasks.find((t) => t.id === taskId)
    if (!original?.dueDate) return
    const currentDateOnly = original.dueDate.split('T')[0]
    if (currentDateOnly === nextDate) return

    setMoveError('')
    setCachedTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, dueDate: nextDate } : t)))
    try {
      const updated = await taskApi.update(taskId, { dueDate: nextDate })
      setCachedTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, dueDate: updated.dueDate ?? nextDate } : t)))
      if (selectedTask?.id === taskId) {
        setSelectedTask((prev) => (prev ? { ...prev, dueDate: updated.dueDate ?? nextDate } : prev))
        setEditDueDate((updated.dueDate ?? nextDate).split('T')[0])
      }
      await refreshOverviewStats()
    } catch (err) {
      console.error('Failed to move task to new date:', err)
      setCachedTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, dueDate: original.dueDate } : t)))
      setMoveError('Failed to reschedule task. Please try again.')
    }
  }

  const handleDragStart = (event: DragStartEvent) => {
    setActiveDragTaskId((event.active.data.current?.taskId as string | undefined) ?? '')
  }

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveDragTaskId('')
    void handleTaskDrop(event)
  }

  const openTaskPanel = async (task: Task) => {
    setAgendaDay(null)
    setSelectedTask(task)
    setEditTitle(task.title); setEditDescription(task.description || '')
    setEditPriority(task.priority)
    setEditDueDate(task.dueDate ? task.dueDate.split('T')[0] : '')
    setEditAssignee(normalizeAssignee(task.assignee))
    setEditProjectId(task.projectId || activeProject)
    setPanelLoading(true); setSubtasks([]); setComments([]); setShowSubtaskForm(false)
    try {
      const [taskData, commentData, subtaskData] = await Promise.all([
        taskApi.get(task.id),
        taskApi.getComments(task.id),
        taskApi.getSubtasks(task.id),
      ])
      setEditTitle(taskData.title); setEditDescription(taskData.description || '')
      setEditPriority(taskData.priority)
      setEditDueDate(taskData.dueDate ? taskData.dueDate.split('T')[0] : '')
      setEditAssignee(normalizeAssignee(taskData.assignee))
      setEditProjectId(taskData.projectId || activeProject)
      setEditTags(taskData.labels ? JSON.parse(taskData.labels) : [])
      setComments(commentData.filter((c: CommentEntry) => c.action === 'comment'))
      setSubtasks(subtaskData)
    } catch (err) { console.error('Failed to load task:', err) }
    finally { setPanelLoading(false) }
  }

  const closeTaskPanel = () => { setSelectedTask(null); setComments([]); setNewComment('') }

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
      if (projectFilter !== 'all' && updated.projectId !== projectFilter) {
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

  const handleReopenTask = async () => {
    if (!selectedTask) return
    try {
      await taskApi.update(selectedTask.id, { archived: false })
      setCachedTasks((prev) => prev.map((t) => t.id === selectedTask.id ? { ...t, archived: false } : t))
      setSelectedTask(null)
      await refreshOverviewStats()
    } catch (err) { console.error('Failed to reopen task:', err) }
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

  const handleDeleteTask = async () => {
    if (!selectedTask) return
    if (!confirm(`Delete "${selectedTask.title}"? This cannot be undone.`)) return
    try {
      await taskApi.delete(selectedTask.id)
      setSelectedTask(null)
      await loadTasks()
    } catch (err) { console.error(err) }
  }

  const isToday = (day: number): boolean => {
    const today = new Date()
    return today.getFullYear() === year && today.getMonth() === month && today.getDate() === day
  }

  const visibleCalendarTasks = tasks.filter((task) => assigneeMatchesFilter(task.assignee, assigneeFilter))
  const filteredOverviewTasks = overviewTasks
    .filter((task) => assigneeMatchesFilter(task.assignee, assigneeFilter))
    .filter((task) => showCompleted || !task.archived)
  const displayedStats = getTaskOverviewStats(filteredOverviewTasks)
  const agendaTasks = agendaDay ? getTasksForDay(agendaDay).sort((a, b) => Number(a.archived) - Number(b.archived)) : []
  const mobileAgendaDays = Array.from({ length: daysInMonth }, (_, index) => {
    const day = index + 1
    return {
      day,
      tasks: getTasksForDay(day).sort((a, b) => Number(a.archived) - Number(b.archived)),
    }
  }).filter(({ tasks }) => tasks.length > 0)

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
        <div className="flex justify-between items-center"><span className="text-zinc-400 text-xs">Total</span><span className="text-white font-medium text-xs">{displayedStats.total}</span></div>
        <div className="flex justify-between items-center"><span className="text-zinc-400 text-xs">Completed</span><span className="text-zinc-500 font-medium text-xs">{displayedStats.completed}</span></div>
        <div className="flex justify-between items-center"><span className="text-zinc-400 text-xs">Critical</span><span className="text-red-400 font-medium text-xs">{displayedStats.critical}</span></div>
        <div className="flex justify-between items-center"><span className="text-zinc-400 text-xs">High</span><span className="text-orange-400 font-medium text-xs">{displayedStats.high}</span></div>
        <div className="flex justify-between items-center"><span className="text-zinc-400 text-xs">Medium</span><span className="text-yellow-400 font-medium text-xs">{displayedStats.medium}</span></div>
        <div className="flex justify-between items-center"><span className="text-zinc-400 text-xs">Low</span><span className="text-zinc-400 font-medium text-xs">{displayedStats.low}</span></div>
      </div>
    </div>
  )

  return (
    <AppShell
      activeView="calendar"
      sidebarVisible={overviewPanelVisible}
      sidebarContent={sidebarStats}
      mainClassName="flex-1 flex flex-col min-w-0"
    >
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
                <h2 className="text-lg font-semibold text-white">Calendar</h2>
                <p className="fc-calendar-subtitle-full text-xs text-zinc-500 mt-0.5 truncate">{MONTHS[month]} {year} · {visibleCalendarTasks.filter((t: Task) => !t.archived).length} active · {visibleCalendarTasks.filter((t: Task) => t.archived).length} completed shown</p>
                <p className="fc-calendar-subtitle-landscape text-xs text-zinc-500 mt-0.5 truncate">{MONTHS[month]} {year} · {visibleCalendarTasks.filter((t: Task) => !t.archived).length} active · {visibleCalendarTasks.filter((t: Task) => t.archived).length} completed shown</p>
                {moveError && <p className="text-xs text-red-400 mt-1">{moveError}</p>}
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
          <div className="relative pb-3 md:pb-4">
            <div
              className="-mx-3 flex items-center gap-1.5 overflow-x-auto whitespace-nowrap px-3 pb-1 pr-10 sm:mx-0 sm:gap-2 sm:px-0 sm:pr-8 fc-scrollbar-hidden"
            >
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
              <button onClick={goToToday} className="btn btn-secondary text-xs fc-control shrink-0">Today</button>
              <div className="flex shrink-0 items-center rounded-xl border border-[var(--border)] bg-[rgba(34,197,94,0.06)]">
                <button onClick={prevMonth} className="p-2 hover:bg-[var(--bg-card)] rounded-l-xl transition-colors">
                  <ChevronLeft className="w-4 h-4 text-zinc-400" />
                </button>
                <span className="px-3 text-white font-medium text-sm min-w-[128px] text-center sm:min-w-[140px] sm:px-4">{MONTHS[month]} {year}</span>
                <button onClick={nextMonth} className="p-2 hover:bg-[var(--bg-card)] rounded-r-xl transition-colors">
                  <ChevronRight className="w-4 h-4 text-zinc-400" />
                </button>
              </div>
              <button
                onClick={() => setShowCompleted((v) => !v)}
                className="btn btn-secondary text-xs fc-control shrink-0"
                title={showCompleted ? 'Hide completed tasks' : 'Show completed tasks'}
              >
                {showCompleted ? 'Completed: Shown' : 'Completed: Hidden'}
              </button>
              <div className="w-3 shrink-0" aria-hidden="true" />
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-auto p-3 sm:p-4 md:p-6">
          {loading ? (
            <div className="flex items-center justify-center py-20"><div className="spinner" /></div>
          ) : (
            <>
              <div className="md:hidden space-y-3">
                {mobileAgendaDays.length === 0 ? (
                  <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-6 text-center">
                    <CalendarDays className="mx-auto mb-3 h-6 w-6 text-[var(--accent)]" />
                    <p className="text-sm font-medium text-white">No dated tasks this month</p>
                    <p className="mt-1 text-xs text-zinc-500">Create a task with a due date or change filters.</p>
                  </div>
                ) : (
                  mobileAgendaDays.map(({ day, tasks }) => (
                    <section key={day} className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-3">
                      <div className="mb-2 flex items-center justify-between gap-3">
                        <div>
                          <h3 className={`text-sm font-semibold ${isToday(day) ? 'text-[var(--accent-hover)]' : 'text-white'}`}>{formatAgendaDate(day)}</h3>
                          <p className="text-[11px] text-zinc-500">{tasks.length} {tasks.length === 1 ? 'task' : 'tasks'}</p>
                        </div>
                      </div>
                      <div className="space-y-2">
                        {tasks.map((task) => (
                          <CalendarAgendaTaskRow key={task.id} task={task} onOpen={openTaskPanel} />
                        ))}
                      </div>
                    </section>
                  ))
                )}
              </div>

              <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd} onDragCancel={() => setActiveDragTaskId('')}>
                <div className="hidden rounded-xl overflow-hidden border border-[var(--border)] md:block">
                  <div className="grid grid-cols-7 border-b border-[var(--border)]">
                    {DAYS.map((day) => (
                      <div key={day} className="py-3 text-center text-xs font-semibold text-zinc-500 bg-[var(--bg-secondary)] border-r border-[var(--border)] last:border-r-0">{day}</div>
                    ))}
                  </div>

                  <div className="grid grid-cols-7">
                  {Array.from({ length: startDayOfWeek }).map((_, i) => (
                    <div key={`empty-start-${i}`} className={`min-h-[120px] bg-[var(--bg-primary)] p-2 ${getCalendarCellBorders(i)}`} />
                  ))}

                  {Array.from({ length: daysInMonth }).map((_, i) => {
                    const day = i + 1
                    const cellIndex = startDayOfWeek + i
                    const dayTasks = getTasksForDay(day).sort((a, b) => Number(a.archived) - Number(b.archived))
                    const visibleTasks = dayTasks.slice(0, MAX_VISIBLE_DAY_TASKS)
                    const hiddenTasks = dayTasks.slice(MAX_VISIBLE_DAY_TASKS)
                    return (
                      <CalendarDayCell key={day} day={day} isTodayDay={isToday(day)} className={getCalendarCellBorders(cellIndex)}>
                        <div className={`text-sm font-medium mb-2 ${isToday(day) ? 'text-[var(--accent)]' : 'text-[var(--text-secondary)]'}`}>{day}</div>
                        <div className="space-y-1">
                          {visibleTasks.map((task) => (
                            <CalendarTaskChip key={task.id} task={task} onOpen={openTaskPanel} />
                          ))}
                          {hiddenTasks.length > 0 && (
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation()
                                setAgendaDay(day)
                              }}
                              className="w-full rounded-md px-2 py-1 text-left text-[10px] font-medium text-zinc-500 transition-colors hover:bg-[var(--bg-elevated)] hover:text-zinc-300"
                              title={`Show all ${dayTasks.length} tasks for ${formatAgendaDate(day)}`}
                            >
                              +{hiddenTasks.length} more
                            </button>
                          )}
                          {activeDragTaskId && dayTasks.length === 0 && (
                            <div className="h-6 rounded-md border border-dashed border-[rgba(245,61,45,0.28)] bg-[rgba(245,61,45,0.05)]" />
                          )}
                        </div>
                      </CalendarDayCell>
                    )
                  })}

                  {Array.from({ length: trailingEmptyDays }).map((_, i) => (
                    <div
                      key={`empty-end-${i}`}
                      className={`min-h-[120px] bg-[var(--bg-primary)] p-2 ${getCalendarCellBorders(startDayOfWeek + daysInMonth + i)}`}
                    />
                  ))}
                  </div>
                </div>
              </DndContext>
            </>
          )}
        </div>
      {agendaDay && (
        <>
          <div className="fixed inset-0 bg-black/60 z-40 backdrop" onClick={() => setAgendaDay(null)} />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="calendar-agenda-title"
            className="fixed inset-4 sm:inset-auto sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:w-full sm:max-w-md bg-[var(--bg-secondary)] border border-[var(--border)] rounded-2xl z-50 flex flex-col max-h-[80vh] shadow-2xl"
          >
            <div className="flex items-center justify-between gap-3 p-5 border-b border-[var(--border)]">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <CalendarDays className="w-4 h-4 text-[var(--accent)]" />
                  <h3 id="calendar-agenda-title" className="text-sm font-semibold text-white">Day Agenda</h3>
                </div>
                <p className="mt-1 text-xs text-zinc-500">
                  {formatAgendaDate(agendaDay)} · {agendaTasks.length} {agendaTasks.length === 1 ? 'task' : 'tasks'}
                </p>
              </div>
              <button onClick={() => setAgendaDay(null)} className="btn btn-ghost p-1.5" title="Close agenda">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {agendaTasks.map((task) => (
                <CalendarAgendaTaskRow key={task.id} task={task} onOpen={openTaskPanel} />
              ))}
            </div>
          </div>
        </>
      )}

      {/* Task Detail Panel */}
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
          onDelete={handleDeleteTask}
          onAddSubtask={handleAddSubtask}
          onDeleteSubtask={handleDeleteSubtask}
          onAddComment={handleAddComment}
          projectId={activeProject}
          projects={projects}
          icon="calendar"
          showDelete={true}
        />
      )}

      {showNewTaskForm && (
        <>
          <div className="fixed inset-0 bg-black/60 z-40 backdrop" onClick={() => setShowNewTaskForm(false)} />
          <div className="fc-modal-surface fixed top-1/2 left-1/2 z-50 flex max-h-[calc(100dvh-1.5rem)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-secondary)] shadow-2xl">
            <div className="flex items-center justify-between border-b border-[var(--border)] p-5">
              <h3 className="text-sm font-semibold text-white">New Task</h3>
              <button onClick={() => setShowNewTaskForm(false)} className="btn btn-ghost p-1.5">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleCreateTask} className="fc-modal-scroll min-h-0 flex-1 space-y-4 overflow-y-auto overflow-x-hidden p-5">
              <div>
                <label className="mb-2 block text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Title</label>
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
                <label className="mb-2 block text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Description (optional)</label>
                <textarea
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  rows={2}
                  className="input resize-none"
                  placeholder="Add details..."
                />
              </div>
              <div>
                <label className="mb-2 block text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Project</label>
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
                  <label className="mb-2 block text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Priority</label>
                  <div className="grid grid-cols-2 gap-2">
                    {[1, 2, 3, 4].map((p) => {
                      const config = PRIORITY_CONFIG[p]
                      const isActive = newPriority === p
                      return (
                        <button
                          key={p}
                          type="button"
                          onClick={() => setNewPriority(p)}
                          className={`badge ${config.badge} w-full justify-center border py-2 transition-all ${isActive ? 'ring-1 ring-current' : 'opacity-80 hover:opacity-100'}`}
                        >
                          <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: config.color }} />
                          {config.label}
                        </button>
                      )
                    })}
                  </div>
                </div>
                <div className="fc-new-task-date-field">
                  <label className="mb-2 block text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Due Date</label>
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
                <label className="mb-2 block text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Assignee</label>
                <div className="flex gap-2">
                  {ASSIGNEE_OPTIONS.map((agent) => {
                    const Icon = agent.icon
                    const isActive = normalizeAssignee(newAssignee) === agent.id
                    return (
                      <button
                        key={agent.filter}
                        type="button"
                        onClick={() => setNewAssignee(agent.id)}
                        className="flex-1 rounded-lg border py-2 text-xs font-medium transition-all flex items-center justify-center gap-1.5"
                        style={isActive ? { background: `${agent.color}12`, borderColor: `${agent.color}40`, color: agent.color } : { borderColor: 'var(--border)', color: 'var(--text-muted)' }}
                      >
                        <Icon className="h-3.5 w-3.5" />
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
    </AppShell>
  )
}
