import { useState, useEffect, useRef, type FormEvent, type ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { taskApi } from '@/lib/api'
import { AppShell } from '@/components/AppShell'
import { DatePicker } from '@/components/DatePicker'
import { DescriptionEditor } from '@/components/DescriptionEditor'
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
  ChevronLeft, ChevronRight, PanelLeftClose, PanelLeftOpen, Plus, X, ListTree, Paperclip, Repeat2
} from 'lucide-react'
import { getCalendarViewDefaults, getCalendarViewState, getOverviewPanelVisible, setCalendarViewState, setOverviewPanelVisible, type CalendarViewMode } from '@/lib/viewSettings'
import { ensureProjectContext, setStoredProjectId, type ProjectRecord } from '@/lib/projectContext'
import {
  ASSIGNEE_OPTIONS,
  getAssigneeOption,
  getTaskOverviewStats,
  normalizeAssignee,
  serializeAssigneeForApi,
  assigneeMatchesFilter,
  RECURRING_OPTIONS,
  type AssigneeFilter,
} from '@/lib/shared'
import { resolveTaskProjectId } from '@/lib/taskForm'
import { dueDateToLocalDateKey, localDateKey } from '@/lib/dates'

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
  subtaskTotal?: number
  subtaskCompleted?: number
  attachmentTotal?: number
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

interface CalendarCache {
  tasks: Task[]
  overviewTasks: Task[]
  projects: ProjectRecord[]
  workspaceId: string
  activeProjectId: string
  projectFilter: string
}

const CALENDAR_CACHE_KEY = 'focusclaw.calendar.snapshot'
const NEW_TASK_EVENT = 'focusclaw:new-task'

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

const PRIORITY_CONFIG: Record<number, { label: string; badge: string; color: string; bgColor: string; borderColor: string; shadowColor: string; activeTextColor: string }> = {
  1: { label: 'Critical', badge: 'badge-critical', color: '#ef4444', bgColor: 'rgba(239,68,68,0.15)', borderColor: 'rgba(239,68,68,0.3)', shadowColor: 'rgba(239,68,68,0.15)', activeTextColor: '#ffffff' },
  2: { label: 'High', badge: 'badge-high', color: '#f97316', bgColor: 'rgba(249,115,22,0.15)', borderColor: 'rgba(249,115,22,0.3)', shadowColor: 'rgba(249,115,22,0.15)', activeTextColor: '#18181b' },
  3: { label: 'Medium', badge: 'badge-medium', color: 'var(--priority-medium)', bgColor: 'var(--priority-medium-bg)', borderColor: 'var(--priority-medium-border)', shadowColor: 'var(--priority-medium-bg)', activeTextColor: 'var(--priority-medium-active-text)' },
  4: { label: 'Low', badge: 'badge-low', color: '#71717a', bgColor: 'rgba(113,113,122,0.12)', borderColor: 'rgba(113,113,122,0.3)', shadowColor: 'rgba(113,113,122,0.14)', activeTextColor: '#ffffff' },
}

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const MAX_VISIBLE_DAY_TASKS = 10
const MAX_VISIBLE_WEEK_TASKS = 10

function addDays(date: Date, days: number): Date {
  const next = new Date(date)
  next.setHours(0, 0, 0, 0)
  next.setDate(next.getDate() + days)
  return next
}

function dateFromKey(dateKey: string): Date {
  const [year, month, day] = dateKey.split('-').map(Number)
  return new Date(year, month - 1, day)
}

function startOfMondayWeek(date: Date): Date {
  const start = new Date(date)
  start.setHours(0, 0, 0, 0)
  const weekday = start.getDay()
  const offset = weekday === 0 ? -6 : 1 - weekday
  start.setDate(start.getDate() + offset)
  return start
}

function formatWeekRange(start: Date, end: Date): string {
  const sameYear = start.getFullYear() === end.getFullYear()
  const sameMonth = sameYear && start.getMonth() === end.getMonth()
  const startOptions: Intl.DateTimeFormatOptions = sameMonth
    ? { month: 'short', day: 'numeric' }
    : sameYear
      ? { month: 'short', day: 'numeric' }
      : { month: 'short', day: 'numeric', year: 'numeric' }
  const endOptions: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' }
  return `${start.toLocaleDateString(undefined, startOptions)}-${end.toLocaleDateString(undefined, endOptions)}`
}

function AssigneeBadge({ assignee, compact = false }: { assignee?: string; compact?: boolean }) {
  const owner = getAssigneeOption(assignee)
  const Icon = owner.icon
  return (
    <span
      className={`badge h-4 shrink-0 px-1.5 py-0 text-[9px] leading-none ${compact ? 'max-w-[4.75rem] gap-1' : 'gap-1'}`}
      style={{ background: `${owner.color}18`, color: owner.color, borderColor: `${owner.color}30` }}
      title={`Owner: ${owner.label}`}
    >
      <Icon className="w-2.5 h-2.5" />
      <span className="truncate">{owner.label}</span>
    </span>
  )
}

function SubtaskIndicator({ task, compact = false }: { task: Task; compact?: boolean }) {
  const total = task.subtaskTotal || 0
  if (total === 0) return null
  const completed = task.subtaskCompleted || 0
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-elevated)] font-medium text-zinc-400 ${compact ? 'h-4 px-1 text-[9px]' : 'h-5 px-1.5 text-[10px]'}`}
      title={`${completed}/${total} subtasks complete`}
      aria-label={`${completed} of ${total} subtasks complete`}
    >
      <ListTree className={compact ? 'h-2.5 w-2.5 text-zinc-500' : 'h-3 w-3 text-zinc-500'} />
      {completed}/{total}
    </span>
  )
}

function formatRecurringLabel(recurring: string | undefined): string {
  if (!recurring) return ''
  const option = RECURRING_OPTIONS.find((item) => item.value === recurring)
  return option ? `Repeats ${option.label.toLowerCase()}` : 'Repeats'
}

function RecurringIndicator({ recurring, compact = false }: { recurring?: string; compact?: boolean }) {
  if (!recurring) return null
  const label = formatRecurringLabel(recurring)
  return (
    <span className={`fc-recurring-icon ${compact ? 'fc-task-indicator-compact' : ''}`.trim()} title={label} aria-label={label}>
      <Repeat2 className={compact ? 'h-2.5 w-2.5' : 'h-3.5 w-3.5'} />
    </span>
  )
}

function AttachmentIndicator({ count = 0, compact = false }: { count?: number; compact?: boolean }) {
  if (count <= 0) return null
  const label = `${count} ${count === 1 ? 'attachment' : 'attachments'}`
  return (
    <span className={`fc-recurring-icon fc-attachment-icon ${compact ? 'fc-task-indicator-compact' : ''}`.trim()} title={label} aria-label={label}>
      <Paperclip className={compact ? 'h-2.5 w-2.5' : 'h-3.5 w-3.5'} />
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
    border: `1px solid ${isCompleted ? 'rgba(113,113,122,0.28)' : priority.borderColor}`,
    borderLeft: `3px solid ${isCompleted ? 'rgba(113,113,122,0.75)' : priority.color}`,
    textDecoration: isCompleted ? 'line-through' : 'none',
    boxShadow: isDragging ? `0 10px 28px ${priority.shadowColor}` : undefined,
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
      <span className="flex min-w-0 items-center gap-1.5">
        <span className="min-w-0 flex-1 truncate text-[11px] leading-4">{task.title}</span>
        <SubtaskIndicator task={task} compact />
        <RecurringIndicator recurring={task.recurring} compact />
        <AttachmentIndicator count={task.attachmentTotal} compact />
      </span>
    </button>
  )
}

function CalendarDayCell({
  dateKey,
  isTodayDay,
  children,
  className = '',
}: {
  dateKey: string
  isTodayDay: boolean
  children: ReactNode
  className?: string
}) {
  const { isOver, setNodeRef } = useDroppable({
    id: `date:${dateKey}`,
    data: { dateKey },
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

function CalendarAgendaTaskRow({ task, projectName, onOpen }: { task: Task; projectName: string; onOpen: (task: Task) => void }) {
  const priority = PRIORITY_CONFIG[task.priority] || PRIORITY_CONFIG[4]
  const isCompleted = !!task.archived

  return (
    <button
      type="button"
      onClick={() => onOpen(task)}
      className="w-full rounded-xl border p-3 text-left transition-colors hover:bg-[var(--bg-elevated)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
      style={{
        background: isCompleted ? 'rgba(113,113,122,0.10)' : priority.bgColor,
        borderColor: isCompleted ? 'rgba(113,113,122,0.28)' : priority.borderColor,
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
          <span className="block truncate text-[11px] text-zinc-500">{projectName}</span>
        </span>
        {!isCompleted && (
          <span className={`badge ${priority.badge} h-4 shrink-0 px-1.5 py-0 text-[9px] leading-none`}>
            {priority.label}
          </span>
        )}
        <SubtaskIndicator task={task} />
        <RecurringIndicator recurring={task.recurring} />
        <AttachmentIndicator count={task.attachmentTotal} />
        <AssigneeBadge assignee={task.assignee} compact />
      </span>
    </button>
  )
}

function compareAgendaTasks(a: Task, b: Task): number {
  if (!!a.archived !== !!b.archived) return Number(a.archived) - Number(b.archived)
  const priorityDiff = (a.priority || 4) - (b.priority || 4)
  if (priorityDiff !== 0) return priorityDiff
  const aCreated = a.createdAt ? new Date(a.createdAt).getTime() : 0
  const bCreated = b.createdAt ? new Date(b.createdAt).getTime() : 0
  return aCreated - bCreated
}

function shouldKeepTaskInCalendar(task: Task, projectFilter: string, showCompleted: boolean): boolean {
  if (!task.dueDate) return false
  if (!showCompleted && task.archived) return false
  return projectFilter === 'all' || task.projectId === projectFilter
}

export default function CalendarPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const calendarDefaults = getCalendarViewDefaults()
  const calendarViewState = getCalendarViewState()
  const [tasks, setTasks] = useState<Task[]>(lastCalendarTasks)
  const [overviewTasks, setOverviewTasks] = useState<Task[]>(lastCalendarOverviewTasks)
  const [projects, setProjects] = useState<ProjectRecord[]>(lastCalendarProjects)
  const [activeWorkspace, setActiveWorkspace] = useState(lastCalendarWorkspace)
  const [activeProject, setActiveProject] = useState(lastCalendarProject)
  const [projectFilter, setProjectFilter] = useState(calendarViewState.projectFilter || lastCalendarProjectFilter)
  const [currentDate, setCurrentDate] = useState(new Date())
  const [calendarMode, setCalendarMode] = useState<CalendarViewMode>(calendarViewState.mode || 'month')
  const [loading, setLoading] = useState(!initialCalendarCache)
  const [initialized, setInitialized] = useState(lastCalendarProjects.length > 0)
  const [initError, setInitError] = useState('')
  const [showCompleted, setShowCompleted] = useState(calendarViewState.showCompleted ?? calendarDefaults.showCompleted)
  const [assigneeFilter, setAssigneeFilter] = useState<AssigneeFilter>((calendarViewState.assigneeFilter || 'all') as AssigneeFilter)
  const [overviewPanelVisible, setOverviewPanelVisibleState] = useState(getOverviewPanelVisible)
  const [moveError, setMoveError] = useState('')
  const [activeDragTaskId, setActiveDragTaskId] = useState('')
  const [agendaDate, setAgendaDate] = useState<string | null>(null)
  const lastCalendarLoadKey = useRef('')
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))

  const [showNewTaskForm, setShowNewTaskForm] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newDescription, setNewDescription] = useState('')
  const [newPriority, setNewPriority] = useState(2)
  const [newDueDate, setNewDueDate] = useState('')
  const [newAssignee, setNewAssignee] = useState('')
  const [newProjectId, setNewProjectId] = useState('')
  const [newRecurring, setNewRecurring] = useState('')
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
      setCalendarMode('month')
      setCalendarViewState({ showCompleted: defaults.showCompleted, assigneeFilter: 'all', projectFilter: 'all', mode: 'month' })
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
  const [editRecurring, setEditRecurring] = useState('')
  const [editTags, setEditTags] = useState<string[]>([])
  const [saving, setSaving] = useState(false)

  const [subtasks, setSubtasks] = useState<any[]>([])
  const [attachments, setAttachments] = useState<AttachmentEntry[]>([])
  const [showSubtaskForm, setShowSubtaskForm] = useState(false)
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('')
  const [newSubtaskPriority, setNewSubtaskPriority] = useState(2)
  const [addingSubtask, setAddingSubtask] = useState(false)
  const [comments, setComments] = useState<CommentEntry[]>([])
  const [newComment, setNewComment] = useState('')
  const [newAttachmentName, setNewAttachmentName] = useState('')
  const [newAttachmentUri, setNewAttachmentUri] = useState('')
  const [newAttachmentKind, setNewAttachmentKind] = useState('file')
  const [submittingComment, setSubmittingComment] = useState(false)
  const [addingAttachment, setAddingAttachment] = useState(false)

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

  const updateAttachmentTotal = (taskId: string, delta: number) => {
    const updateTask = (task: Task) => (
      task.id === taskId
        ? { ...task, attachmentTotal: Math.max((task.attachmentTotal || 0) + delta, 0) }
        : task
    )
    setCachedTasks((prev) => prev.map(updateTask))
    setOverviewTasks((prev) => {
      const nextTasks = prev.map(updateTask)
      lastCalendarOverviewTasks = nextTasks
      return nextTasks
    })
    setSelectedTask((prev) => prev ? updateTask(prev) : prev)
  }

  useEffect(() => { initWorkspace() }, [])
  useEffect(() => {
    if (!initialized || !activeProject || projects.length === 0) return
    const projectIds = projectFilter === 'all'
      ? projects.map((project) => project.id)
      : [projectFilter]
    const loadKey = calendarLoadKey(projectFilter, showCompleted, projectIds)
    if (lastCalendarLoadKey.current === loadKey) return
    void loadTasks()
  }, [initialized, activeProject, projectFilter, showCompleted, projects])

  const initWorkspace = async () => {
    try {
      const context = await ensureProjectContext()
      const initialProjectId = context.projects.some((project) => project.id === lastCalendarProject)
        ? lastCalendarProject
        : context.activeProjectId
      const storedProjectFilter = calendarViewState.projectFilter || lastCalendarProjectFilter
      const initialProjectFilter = storedProjectFilter === 'all' || context.projects.some((project) => project.id === storedProjectFilter)
        ? storedProjectFilter
        : 'all'
      const initialProjectIds = initialProjectFilter === 'all'
        ? context.projects.map((project) => project.id)
        : [initialProjectFilter]
      const { calendarTasks, overviewTasks } = await fetchCalendarTasks(initialProjectIds, showCompleted)
      lastCalendarLoadKey.current = calendarLoadKey(initialProjectFilter, showCompleted, initialProjectIds)

      setProjects(context.projects)
      setActiveWorkspace(context.workspace.id)
      setActiveProject(initialProjectId)
      setProjectFilter(initialProjectFilter)
      setCalendarViewState({ projectFilter: initialProjectFilter })
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
    setCalendarViewState({ projectFilter: projectId })
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
    const targetProjectId = resolveTaskProjectId(newProjectId)
    if (!targetProjectId) return
    setCreating(true)
    try {
      const task = await taskApi.create({
        projectId: targetProjectId,
        title: newTitle.trim(),
        description: newDescription,
        priority: newPriority,
        dueDate: newDueDate || undefined,
        assignee: serializeAssigneeForApi(newAssignee),
        recurring: newRecurring || undefined,
      })
      if (activeProject !== targetProjectId) {
        setActiveProject(targetProjectId)
        setStoredProjectId(activeWorkspace, targetProjectId)
        lastCalendarProject = targetProjectId
      }
      if (projectFilter !== 'all' && projectFilter !== targetProjectId) {
        setProjectFilter(targetProjectId)
        lastCalendarProjectFilter = targetProjectId
        setCalendarViewState({ projectFilter: targetProjectId })
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
      setNewRecurring('')
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

  const calendarLoadKey = (projectFilterValue: string, includeCompleted: boolean, projectIds: string[]) =>
    JSON.stringify({
      projectFilter: projectFilterValue,
      includeCompleted,
      projectIds: [...projectIds].sort(),
    })

  const loadTasks = async (options?: { showCompletedOverride?: boolean; projectFilterOverride?: string }) => {
    if (!activeProject || projects.length === 0) return
    try {
      if (tasks.length === 0) setLoading(true)
      const includeCompleted = options?.showCompletedOverride ?? showCompleted
      const projectFilterValue = options?.projectFilterOverride ?? projectFilter
      const projectIds = projectFilterValue === 'all'
        ? projects.map((project) => project.id)
        : [projectFilterValue]
      lastCalendarLoadKey.current = calendarLoadKey(projectFilterValue, includeCompleted, projectIds)
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
  const monthDateKeys = Array.from({ length: daysInMonth }, (_, index) =>
    localDateKey(new Date(year, month, index + 1))
  )
  const weekStart = startOfMondayWeek(currentDate)
  const weekStartTime = weekStart.getTime()
  const weekDates = Array.from({ length: 7 }, (_, index) => addDays(weekStart, index))
  const weekDateKeys = weekDates.map(localDateKey)
  const weekEnd = weekDates[6]
  const visibleDateKeys = calendarMode === 'week' ? weekDateKeys : monthDateKeys
  const calendarTitle = calendarMode === 'week' ? formatWeekRange(weekStart, weekEnd) : `${MONTHS[month]} ${year}`

  const prevCalendarPeriod = () => setCurrentDate(calendarMode === 'week' ? addDays(currentDate, -7) : new Date(year, month - 1, 1))
  const nextCalendarPeriod = () => setCurrentDate(calendarMode === 'week' ? addDays(currentDate, 7) : new Date(year, month + 1, 1))
  const goToToday = () => setCurrentDate(new Date())

  const formatDateInput = (date: Date) =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`

  const openNewTaskForm = () => {
    const today = new Date()
    const todayKey = localDateKey(today)
    const defaultDueDate = calendarMode === 'week'
      ? (weekDateKeys.includes(todayKey) ? today : weekStart)
      : today.getFullYear() === year && today.getMonth() === month
        ? today
        : new Date(year, month, 1)
    setNewProjectId('')
    setNewDueDate(formatDateInput(defaultDueDate))
    setShowNewTaskForm(true)
  }

  useEffect(() => {
    const handleNewTask = () => {
      if (!initialized) return
      openNewTaskForm()
    }
    window.addEventListener(NEW_TASK_EVENT, handleNewTask)
    return () => window.removeEventListener(NEW_TASK_EVENT, handleNewTask)
  }, [initialized, projectFilter, activeProject, projects, year, month, calendarMode, weekStartTime])

  useEffect(() => {
    if (new URLSearchParams(location.search).get('newTask') !== '1') return
    if (!initialized) return
    openNewTaskForm()
    navigate('/calendar', { replace: true })
  }, [location.search, initialized, projectFilter, activeProject, projects, year, month, calendarMode, weekStartTime, navigate])

  const getTasksForDate = (dateKey: string): Task[] =>
    tasks.filter(t => dueDateToLocalDateKey(t.dueDate) === dateKey && assigneeMatchesFilter(t.assignee, assigneeFilter))

  const totalCalendarCells = startDayOfWeek + daysInMonth + trailingEmptyDays
  const getCalendarCellBorders = (cellIndex: number) => {
    const isLastColumn = cellIndex % 7 === 6
    const isLastRow = cellIndex >= totalCalendarCells - 7
    return `${isLastColumn ? '' : 'border-r border-[var(--border)]'} ${isLastRow ? '' : 'border-b border-[var(--border)]'}`
  }

  const formatAgendaDate = (dateKey: string) =>
    dateFromKey(dateKey).toLocaleDateString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })

  const handleTaskDrop = async (event: DragEndEvent) => {
    const overId = event.over?.id
    const taskId = event.active.data.current?.taskId as string | undefined
    if (!overId || !taskId) return
    const nextDate = String(overId).startsWith('date:') ? String(overId).replace('date:', '') : ''
    if (!/^\d{4}-\d{2}-\d{2}$/.test(nextDate)) return
    const original = tasks.find((t) => t.id === taskId)
    if (!original?.dueDate) return
    const currentDateOnly = dueDateToLocalDateKey(original.dueDate)
    if (currentDateOnly === nextDate) return

    setMoveError('')
    setCachedTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, dueDate: nextDate } : t)))
    try {
      const updated = await taskApi.update(taskId, { dueDate: nextDate })
      setCachedTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, dueDate: updated.dueDate ?? nextDate } : t)))
      if (selectedTask?.id === taskId) {
        setSelectedTask((prev) => (prev ? { ...prev, dueDate: updated.dueDate ?? nextDate } : prev))
        setEditDueDate(dueDateToLocalDateKey(updated.dueDate ?? nextDate))
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
    setAgendaDate(null)
    setSelectedTask(task)
    setEditTitle(task.title); setEditDescription(task.description || '')
    setEditPriority(task.priority)
    setEditDueDate(dueDateToLocalDateKey(task.dueDate))
    setEditAssignee(normalizeAssignee(task.assignee))
    setEditProjectId(task.projectId || activeProject)
    setEditRecurring(task.recurring || '')
    setPanelLoading(true); setSubtasks([]); setComments([]); setAttachments([]); setShowSubtaskForm(false)
    try {
      const [taskData, commentData, subtaskData, attachmentData] = await Promise.all([
        taskApi.get(task.id),
        taskApi.getComments(task.id),
        taskApi.getSubtasks(task.id),
        taskApi.getAttachments(task.id),
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
    } catch (err) { console.error('Failed to load task:', err) }
    finally { setPanelLoading(false) }
  }

  const closeTaskPanel = () => {
    setSelectedTask(null); setComments([]); setNewComment('')
    setAttachments([]); setNewAttachmentName(''); setNewAttachmentUri(''); setNewAttachmentKind('file')
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
      const keepUpdatedTask = shouldKeepTaskInCalendar(updated, projectFilter, showCompleted)
      setCachedTasks((prev) => (
        keepUpdatedTask
          ? prev.map((t) => t.id === selectedTask.id ? updated : t)
          : prev.filter((t) => t.id !== selectedTask.id)
      ))
      setOverviewTasks((prev) => prev.map((t) => t.id === selectedTask.id ? updated : t))
      lastCalendarOverviewTasks = lastCalendarOverviewTasks.map((t) => t.id === selectedTask.id ? updated : t)
      setSelectedTask(updated)
      closeTaskPanel()
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
      setCachedTasks((prev) => prev.map((task) => (
        task.id === selectedTask.id
          ? { ...task, subtaskTotal: (task.subtaskTotal || 0) + 1 }
          : task
      )))
      setOverviewTasks((prev) => prev.map((task) => (
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
      setOverviewTasks((prev) => prev.map(updateCounts))
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
        setOverviewTasks((prev) => prev.map(updateCounts))
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

  const handleDeleteTask = async () => {
    if (!selectedTask) return
    if (!confirm(`Delete "${selectedTask.title}"? This cannot be undone.`)) return
    try {
      await taskApi.delete(selectedTask.id)
      setSelectedTask(null)
      await loadTasks()
    } catch (err) { console.error(err) }
  }

  const isTodayDate = (dateKey: string): boolean => dateKey === localDateKey(new Date())

  const visibleCalendarTasks = tasks.filter((task) => assigneeMatchesFilter(task.assignee, assigneeFilter))
  const filteredOverviewTasks = overviewTasks
    .filter((task) => assigneeMatchesFilter(task.assignee, assigneeFilter))
    .filter((task) => showCompleted || !task.archived)
  const displayedStats = getTaskOverviewStats(filteredOverviewTasks)
  const projectNameById = new Map(projects.map((project) => [project.id, project.name]))
  const getProjectName = (task: Task) => (task.projectId ? projectNameById.get(task.projectId) : undefined) || 'Project'
  const agendaTasks = agendaDate ? getTasksForDate(agendaDate).sort(compareAgendaTasks) : []
  const mobileAgendaDays = visibleDateKeys.map((dateKey) => ({
    dateKey,
    tasks: getTasksForDate(dateKey).sort(compareAgendaTasks),
  })).filter(({ tasks }) => calendarMode === 'week' || tasks.length > 0)
  const showBlockingLoader = loading && visibleCalendarTasks.length > 0

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
        <div className="flex justify-between items-center"><span className="text-zinc-400 text-xs">Medium</span><span className="text-[var(--priority-medium)] font-medium text-xs">{displayedStats.medium}</span></div>
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
                <p className="fc-calendar-subtitle-full text-xs text-zinc-500 mt-0.5 truncate">{calendarTitle} · {visibleCalendarTasks.filter((t: Task) => !t.archived).length} active · {visibleCalendarTasks.filter((t: Task) => t.archived).length} completed shown</p>
                <p className="fc-calendar-subtitle-landscape text-xs text-zinc-500 mt-0.5 truncate">{calendarTitle} · {visibleCalendarTasks.filter((t: Task) => !t.archived).length} active · {visibleCalendarTasks.filter((t: Task) => t.archived).length} completed shown</p>
                {moveError && <p className="text-xs text-red-400 mt-1">{moveError}</p>}
              </div>
            </div>
            <div className="fc-work-header-actions flex items-center justify-end gap-1.5 min-w-0 sm:gap-2">
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
            <div
              className="-mx-3 flex items-center gap-1.5 overflow-x-auto whitespace-nowrap px-3 pb-1 pr-10 sm:mx-0 sm:gap-2 sm:px-0 sm:pr-0 fc-scrollbar-hidden"
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
                value={assigneeFilter}
                onChange={(e) => {
                  const nextAssigneeFilter = e.target.value as AssigneeFilter
                  setAssigneeFilter(nextAssigneeFilter)
                  setCalendarViewState({ assigneeFilter: nextAssigneeFilter })
                }}
                className="input text-xs fc-control fc-select-control fc-filter-select fc-filter-select-owner shrink-0"
                style={{ width: 158, minWidth: 158 }}
              >
                <option value="all">Owner: All</option>
                <option value="user">Owner: User</option>
                <option value="agent">Owner: Agent</option>
                <option value="unassigned">Owner: Unassigned</option>
              </select>
              <button onClick={goToToday} className="btn btn-secondary text-xs fc-control shrink-0">Today</button>
              <div className="flex h-9 shrink-0 items-center rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-0.5">
                {(['month', 'week'] as CalendarViewMode[]).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => {
                      setCalendarMode(mode)
                      setAgendaDate(null)
                      setCalendarViewState({ mode })
                    }}
                    className={`h-8 rounded-lg px-3 text-xs font-medium transition-colors ${
                      calendarMode === mode
                        ? 'bg-[var(--accent)] text-white'
                        : 'text-zinc-400 hover:bg-[var(--bg-elevated)] hover:text-zinc-200'
                    }`}
                  >
                    {mode === 'month' ? 'Month' : 'Week'}
                  </button>
                ))}
              </div>
              <div className="flex shrink-0 items-center rounded-xl border border-[var(--border)] bg-[rgba(34,197,94,0.06)]">
                <button onClick={prevCalendarPeriod} className="p-2 hover:bg-[var(--bg-card)] rounded-l-xl transition-colors">
                  <ChevronLeft className="w-4 h-4 text-zinc-400" />
                </button>
                <span className="px-3 text-white font-medium text-sm min-w-[128px] text-center sm:min-w-[140px] sm:px-4">{calendarTitle}</span>
                <button onClick={nextCalendarPeriod} className="p-2 hover:bg-[var(--bg-card)] rounded-r-xl transition-colors">
                  <ChevronRight className="w-4 h-4 text-zinc-400" />
                </button>
              </div>
              <button
                onClick={() => {
                  setShowCompleted((v) => {
                    const nextShowCompleted = !v
                    setCalendarViewState({ showCompleted: nextShowCompleted })
                    return nextShowCompleted
                  })
                }}
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
          {showBlockingLoader ? (
            <div className="flex items-center justify-center py-20"><div className="spinner" /></div>
          ) : (
            <>
              <div className="md:hidden space-y-3">
                {mobileAgendaDays.length === 0 ? (
                  <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-6 text-center">
                    <CalendarDays className="mx-auto mb-3 h-6 w-6 text-[var(--accent)]" />
                    <p className="text-sm font-medium text-white">No dated tasks this {calendarMode}</p>
                    <p className="mt-1 text-xs text-zinc-500">Create a task with a due date or change filters.</p>
                  </div>
                ) : (
                  mobileAgendaDays.map(({ dateKey, tasks }) => (
                    <section key={dateKey} className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-3">
                      <div className="mb-2 flex items-center justify-between gap-3">
                        <div>
                          <h3 className={`text-sm font-semibold ${isTodayDate(dateKey) ? 'text-[var(--accent-hover)]' : 'text-white'}`}>{formatAgendaDate(dateKey)}</h3>
                          <p className="text-[11px] text-zinc-500">{tasks.length} {tasks.length === 1 ? 'task' : 'tasks'}</p>
                        </div>
                      </div>
                      {tasks.length > 0 ? (
                        <div className="space-y-2">
                          {tasks.map((task) => (
                          <CalendarAgendaTaskRow key={task.id} task={task} projectName={getProjectName(task)} onOpen={openTaskPanel} />
                          ))}
                        </div>
                      ) : (
                        <p className="rounded-lg border border-dashed border-[var(--border-subtle)] px-3 py-4 text-center text-xs text-zinc-500">No tasks</p>
                      )}
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

                  {calendarMode === 'month' ? (
                    <div className="grid grid-cols-7">
                      {Array.from({ length: startDayOfWeek }).map((_, i) => (
                        <div key={`empty-start-${i}`} className={`min-h-[120px] bg-[var(--bg-primary)] p-2 ${getCalendarCellBorders(i)}`} />
                      ))}

                      {monthDateKeys.map((dateKey, i) => {
                        const day = i + 1
                        const cellIndex = startDayOfWeek + i
                        const dayTasks = getTasksForDate(dateKey).sort(compareAgendaTasks)
                        const visibleTasks = dayTasks.slice(0, MAX_VISIBLE_DAY_TASKS)
                        const hiddenTasks = dayTasks.slice(MAX_VISIBLE_DAY_TASKS)
                        return (
                          <CalendarDayCell key={dateKey} dateKey={dateKey} isTodayDay={isTodayDate(dateKey)} className={getCalendarCellBorders(cellIndex)}>
                            <div className={`text-sm font-medium mb-2 ${isTodayDate(dateKey) ? 'text-[var(--accent)]' : 'text-[var(--text-secondary)]'}`}>{day}</div>
                            <div className="space-y-1">
                              {visibleTasks.map((task) => (
                                <CalendarTaskChip key={task.id} task={task} onOpen={openTaskPanel} />
                              ))}
                              {hiddenTasks.length > 0 && (
                                <button
                                  type="button"
                                  onClick={(event) => {
                                    event.stopPropagation()
                                    setAgendaDate(dateKey)
                                  }}
                                  className="w-full rounded-md px-2 py-1 text-left text-[10px] font-medium text-zinc-500 transition-colors hover:bg-[var(--bg-elevated)] hover:text-zinc-300"
                                  title={`Show all ${dayTasks.length} tasks for ${formatAgendaDate(dateKey)}`}
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
                  ) : (
                    <div className="grid grid-cols-7">
                      {weekDateKeys.map((dateKey, index) => {
                        const date = dateFromKey(dateKey)
                        const dayTasks = getTasksForDate(dateKey).sort(compareAgendaTasks)
                        const visibleTasks = dayTasks.slice(0, MAX_VISIBLE_WEEK_TASKS)
                        const hiddenTasks = dayTasks.slice(MAX_VISIBLE_WEEK_TASKS)
                        const isLastColumn = index === weekDateKeys.length - 1
                        return (
                          <CalendarDayCell
                            key={dateKey}
                            dateKey={dateKey}
                            isTodayDay={isTodayDate(dateKey)}
                            className={`min-h-[360px] ${isLastColumn ? '' : 'border-r border-[var(--border)]'}`}
                          >
                            <div className="mb-3 flex items-start justify-between gap-2">
                              <div>
                                <div className={`text-sm font-semibold ${isTodayDate(dateKey) ? 'text-[var(--accent)]' : 'text-[var(--text-secondary)]'}`}>{date.getDate()}</div>
                                <div className="text-[10px] uppercase tracking-wider text-zinc-600">{date.toLocaleDateString(undefined, { month: 'short' })}</div>
                              </div>
                              <span className="rounded-md bg-[var(--bg-elevated)] px-1.5 py-0.5 text-[10px] font-medium text-zinc-500">
                                {dayTasks.length}
                              </span>
                            </div>
                            <div className="space-y-1">
                              {visibleTasks.map((task) => (
                                <CalendarTaskChip key={task.id} task={task} onOpen={openTaskPanel} />
                              ))}
                              {hiddenTasks.length > 0 && (
                                <button
                                  type="button"
                                  onClick={(event) => {
                                    event.stopPropagation()
                                    setAgendaDate(dateKey)
                                  }}
                                  className="w-full rounded-md px-2 py-1 text-left text-[10px] font-medium text-zinc-500 transition-colors hover:bg-[var(--bg-elevated)] hover:text-zinc-300"
                                  title={`Show all ${dayTasks.length} tasks for ${formatAgendaDate(dateKey)}`}
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
                    </div>
                  )}
                </div>
              </DndContext>
            </>
          )}
        </div>
      {agendaDate && (
        <>
          <div className="fixed inset-0 bg-black/60 z-40 backdrop" onClick={() => setAgendaDate(null)} />
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
                  {formatAgendaDate(agendaDate)} · {agendaTasks.length} {agendaTasks.length === 1 ? 'task' : 'tasks'}
                </p>
              </div>
              <button onClick={() => setAgendaDate(null)} className="btn btn-ghost p-1.5" title="Close agenda">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {agendaTasks.map((task) => (
                <CalendarAgendaTaskRow key={task.id} task={task} projectName={getProjectName(task)} onOpen={openTaskPanel} />
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
          onDelete={handleDeleteTask}
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
              <DescriptionEditor
                value={newDescription}
                onChange={setNewDescription}
                label="Description"
                rows={4}
                minHeight={112}
                placeholder="Add details..."
              />
              <div>
                <label className="mb-2 block text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Project</label>
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
                          className={`badge ${config.badge} w-full justify-center border py-2 transition-all ${isActive ? 'opacity-100' : 'opacity-80 hover:opacity-100'}`}
                          style={isActive ? { background: config.color, borderColor: config.color, color: config.activeTextColor } : undefined}
                        >
                          {config.label}
                        </button>
                      )
                    })}
                  </div>
                </div>
                <div className="fc-new-task-date-field">
                  <label className="mb-2 block text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Due Date</label>
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
                  <label className="mb-2 block text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Repeats</label>
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
              <button type="submit" disabled={creating || !newTitle.trim() || !resolveTaskProjectId(newProjectId)} className="btn btn-primary w-full">
                {creating ? 'Creating...' : 'Create Task'}
              </button>
            </form>
          </div>
        </>
      )}
    </AppShell>
  )
}
