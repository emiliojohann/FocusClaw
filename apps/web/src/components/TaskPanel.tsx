import {
  Check, CalendarDays, X, Bot, User, Plus,
  MessageSquare, Send, BarChart3, Trash2
} from 'lucide-react'
import { createPortal } from 'react-dom'
import { TagsEditor } from './TagsEditor'
import {
  ASSIGNEE_OPTIONS,
  normalizeAssignee,
} from '@/lib/shared'
import { useEffect, useState } from 'react'

interface CommentEntry {
  id: string
  taskId: string
  action: string
  changes: { content?: string; [key: string]: any }
  createdAt: string
  userId?: string
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

const PRIORITY_CONFIG: Record<number, { label: string; badge: string; color: string; bgColor: string }> = {
  1: { label: 'Critical', badge: 'badge-critical', color: '#ef4444', bgColor: 'rgba(239,68,68,0.15)' },
  2: { label: 'High', badge: 'badge-high', color: '#f97316', bgColor: 'rgba(249,115,22,0.15)' },
  3: { label: 'Medium', badge: 'badge-medium', color: '#eab308', bgColor: 'rgba(234,179,8,0.15)' },
  4: { label: 'Low', badge: 'badge-low', color: '#71717a', bgColor: 'rgba(113,113,122,0.12)' },
}

interface TaskPanelProps {
  // Panel state
  selectedTask: any
  panelLoading: boolean
  editTitle: string
  editDescription: string
  editPriority: number
  editDueDate: string
  editAssignee: string
  editProjectId: string
  editTags: string[]
  saving: boolean
  
  // Comments & subtasks
  comments: CommentEntry[]
  subtasks: Subtask[]
  newComment: string
  submittingComment: boolean
  showSubtaskForm: boolean
  newSubtaskTitle: string
  newSubtaskPriority: number
  addingSubtask: boolean
  
  // Setters
  setEditTitle: (v: string) => void
  setEditDescription: (v: string) => void
  setEditPriority: (v: number) => void
  setEditDueDate: (v: string) => void
  setEditAssignee: (v: string) => void
  setEditProjectId: (v: string) => void
  setEditTags: (v: string[]) => void
  setNewComment: (v: string) => void
  setShowSubtaskForm: (v: boolean) => void
  setNewSubtaskTitle: (v: string) => void
  setNewSubtaskPriority: (v: number) => void
  
  // Handlers
  onClose: () => void
  onSave: () => void
  onReopen?: () => void
  onDelete?: () => void
  onAddSubtask: () => void
  onDeleteSubtask?: (subtaskId: string) => void
  onAddComment: () => void
  
  // Config
  projectId: string
  icon?: 'tasks' | 'calendar'
  showDelete?: boolean
  projects?: Array<{ id: string; name: string }>
}

function formatFullDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString('en-US', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true,
  })
}

function readTaskLabels(task: any): string[] {
  if (!task?.labels) return []
  try {
    const labels = typeof task.labels === 'string' ? JSON.parse(task.labels) : task.labels
    return Array.isArray(labels) ? labels : []
  } catch {
    return []
  }
}

export function TaskPanel({
  selectedTask,
  panelLoading,
  editTitle,
  editDescription,
  editPriority,
  editDueDate,
  editAssignee,
  editProjectId,
  editTags,
  saving,
  comments,
  subtasks,
  newComment,
  submittingComment,
  showSubtaskForm,
  newSubtaskTitle,
  newSubtaskPriority,
  addingSubtask,
  setEditTitle,
  setEditDescription,
  setEditPriority,
  setEditDueDate,
  setEditAssignee,
  setEditProjectId,
  setEditTags,
  setNewComment,
  setShowSubtaskForm,
  setNewSubtaskTitle,
  setNewSubtaskPriority,
  onClose,
  onSave,
  onReopen,
  onDelete,
  onAddSubtask,
  onDeleteSubtask,
  onAddComment,
  projectId,
  icon = 'tasks',
  showDelete = false,
  projects = [],
}: TaskPanelProps) {
  const [subtaskPendingDelete, setSubtaskPendingDelete] = useState<Subtask | null>(null)
  const [closeConfirmOpen, setCloseConfirmOpen] = useState(false)
  const IconComponent = icon === 'calendar' ? CalendarDays : Check
  const selectedDueDate = selectedTask?.dueDate ? selectedTask.dueDate.split('T')[0] : ''
  const selectedLabels = readTaskLabels(selectedTask)
  const hasUnsavedChanges = !!selectedTask && !panelLoading && (
    editTitle !== (selectedTask.title || '') ||
    editDescription !== (selectedTask.description || '') ||
    editPriority !== selectedTask.priority ||
    editDueDate !== selectedDueDate ||
    normalizeAssignee(editAssignee) !== normalizeAssignee(selectedTask.assignee) ||
    editProjectId !== (selectedTask.projectId || projectId) ||
    JSON.stringify(editTags) !== JSON.stringify(selectedLabels)
  )

  const requestClose = () => {
    if (hasUnsavedChanges) {
      setCloseConfirmOpen(true)
      return
    }
    onClose()
  }

  useEffect(() => {
    const scrollY = window.scrollY
    const previousOverflow = document.body.style.overflow
    const previousOverscroll = document.body.style.overscrollBehavior
    const previousHtmlOverflow = document.documentElement.style.overflow
    const previousHtmlOverscroll = document.documentElement.style.overscrollBehavior

    document.body.style.overflow = 'hidden'
    document.body.style.overscrollBehavior = 'none'
    document.documentElement.style.overflow = 'hidden'
    document.documentElement.style.overscrollBehavior = 'none'

    return () => {
      document.body.style.overflow = previousOverflow
      document.body.style.overscrollBehavior = previousOverscroll
      document.documentElement.style.overflow = previousHtmlOverflow
      document.documentElement.style.overscrollBehavior = previousHtmlOverscroll
      window.scrollTo(0, scrollY)
    }
  }, [])

  const panel = (
    <>
      <div className="fixed inset-0 bg-black/60 z-[200] backdrop touch-none overflow-hidden" onClick={requestClose} />
      <div className="fc-task-panel-drawer fixed inset-0 h-[100svh] w-screen max-w-[100vw] overflow-hidden overscroll-none touch-pan-y pb-[env(safe-area-inset-bottom)] sm:inset-y-0 sm:left-auto sm:right-0 sm:w-[420px] bg-[var(--bg-secondary)] border-l border-[var(--border)] z-[210] flex flex-col animate-slide-in-right">
        {/* Panel Header */}
        <div className="flex items-center justify-between p-5 border-b border-[var(--border)]">
          <div className="flex items-center gap-2">
            <IconComponent className="w-4 h-4 text-[var(--accent)]" />
            <h3 className="text-white font-semibold text-sm">Task Details</h3>
          </div>
          <button onClick={requestClose} className="btn btn-ghost p-1.5">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Panel Content */}
        <div className="fc-task-panel-scroll min-w-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-none touch-pan-y">
          {panelLoading ? (
            <div className="flex items-center justify-center py-20">
              <div className="spinner" />
            </div>
          ) : (
            <div className="fc-task-panel-content p-5 space-y-5">
              {/* Title */}
              <div>
                <label className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-2 block">Title</label>
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="input"
                />
              </div>

              {/* Description */}
              <div>
                <label className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-2 block">Description</label>
                <textarea
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  rows={3}
                  className="input resize-none"
                  placeholder="Add a description..."
                />
              </div>

              {/* Assignee */}
              <div>
                <label className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-2 block">Assignee</label>
                <div className="flex gap-2">
                  {ASSIGNEE_OPTIONS.map((agent) => {
                    const Icon = agent.icon
                    const isActive = normalizeAssignee(editAssignee) === agent.id
                    return (
                      <button
                        key={agent.filter}
                        onClick={() => setEditAssignee(agent.id)}
                        className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg border text-xs font-medium transition-all"
                        style={isActive 
                          ? { background: `${agent.color}12`, borderColor: `${agent.color}40`, color: agent.color }
                          : { borderColor: 'var(--border)', color: 'var(--text-muted)' }
                        }
                      >
                        <Icon className="w-3.5 h-3.5" />
                        {agent.label}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Priority + Due Date */}
              <div className="space-y-3">
                <div>
                  <label className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-2 block">Project</label>
                  <select
                    value={editProjectId}
                    onChange={(e) => setEditProjectId(e.target.value)}
                    className="input text-xs fc-control fc-select-control w-full"
                  >
                    {projects.map((project) => (
                      <option key={project.id} value={project.id}>{project.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-2 block">Priority</label>
                  <div className="grid grid-cols-2 gap-2">
                    {[1, 2, 3, 4].map((p) => {
                      const config = PRIORITY_CONFIG[p]
                      const isActive = editPriority === p
                      return (
                        <button
                          key={p}
                          onClick={() => setEditPriority(p)}
                          className={`badge ${config.badge} h-10 min-w-0 w-full justify-center overflow-hidden border px-2 py-0 text-xs transition-all ${isActive ? 'ring-1 ring-inset ring-current' : 'opacity-80 hover:opacity-100'}`}
                        >
                          <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: config.color }} />
                          <span className="truncate">{config.label}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>
                <div>
                  <label className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-2 block">Due Date</label>
                  <div className="flex min-w-0 items-center gap-2">
                    <input
                      type="date"
                      value={editDueDate}
                      onChange={(e) => setEditDueDate(e.target.value)}
                      className="input fc-date-input min-w-0 flex-1 text-xs"
                    />
                    {editDueDate ? (
                      <button
                        type="button"
                        onClick={() => setEditDueDate('')}
                        className="btn btn-secondary fc-control shrink-0 px-3 text-xs"
                        aria-label="Clear due date"
                        title="Clear due date"
                      >
                        <X className="h-3.5 w-3.5" />
                        <span className="hidden sm:inline">Clear</span>
                      </button>
                    ) : null}
                  </div>
                  {!editDueDate ? (
                    <p className="fc-date-helper">
                      <span className="fc-date-helper-desktop">Click to select a date</span>
                      <span className="fc-date-helper-mobile">Tap to select a date</span>
                    </p>
                  ) : null}
                </div>
              </div>

              {/* Tags */}
              <div>
                <label className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-2 block">Tags</label>
                <TagsEditor labels={editTags} onChange={setEditTags} projectId={projectId} />
              </div>

              {/* Save Button */}
              <button
                onClick={onSave}
                disabled={saving}
                className="btn btn-primary w-full"
              >
                {saving ? 'Saving...' : 'Save Changes'}
              </button>

              {/* Completion / Delete */}
              {selectedTask?.archived && onReopen ? (
                <button onClick={onReopen} className="btn btn-secondary w-full">
                  Reopen Task
                </button>
              ) : null}
              {showDelete && onDelete ? (
                <div className="flex items-center justify-between pt-1">
                  <span className="text-[10px] font-semibold text-zinc-600 uppercase tracking-wider">Danger Zone</span>
                  <button onClick={onDelete} className="btn btn-ghost text-xs text-red-400 hover:bg-red-500/10 px-3 py-1.5">
                    <Trash2 className="w-3.5 h-3.5" />
                    Delete Task
                  </button>
                </div>
              ) : null}

              {/* Subtasks */}
              <div className="pt-2 border-t border-[var(--border)]">
                <div className="flex items-center justify-between mb-3">
                  <label className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">Subtasks</label>
                  <button
                    onClick={() => setShowSubtaskForm(!showSubtaskForm)}
                    className="btn btn-ghost text-[10px] py-1 px-2"
                  >
                    <Plus className="w-3 h-3" /> Add
                  </button>
                </div>

                {showSubtaskForm && (
                  <div className="mb-3 p-3 rounded-xl bg-[var(--bg-card)] border border-[var(--border-subtle)] space-y-2">
                    <input
                      type="text"
                      value={newSubtaskTitle}
                      onChange={(e) => setNewSubtaskTitle(e.target.value)}
                      placeholder="Subtask title..."
                      className="input text-xs"
                    />
                    <div className="flex gap-2">
                      <select
                        value={newSubtaskPriority}
                        onChange={(e) => setNewSubtaskPriority(Number(e.target.value))}
                        className="input text-xs fc-control fc-select-control w-auto"
                      >
                        <option value={1}>Critical</option>
                        <option value={2}>High</option>
                        <option value={3}>Medium</option>
                        <option value={4}>Low</option>
                      </select>
                      <button
                        onClick={onAddSubtask}
                        disabled={addingSubtask || !newSubtaskTitle.trim()}
                        className="btn btn-primary text-xs flex-1"
                      >
                        Add
                      </button>
                    </div>
                  </div>
                )}

                <div className="space-y-1.5">
                  {subtasks.length === 0 ? (
                    <p className="text-zinc-600 text-xs text-center py-3">No subtasks</p>
                  ) : (
                    subtasks.map((st) => {
                      const sp = PRIORITY_CONFIG[st.priority] || PRIORITY_CONFIG[4]
                      return (
                        <div
                          key={st.id}
                          className="flex items-center gap-2 p-2 rounded-lg bg-[var(--bg-elevated)]"
                        >
                          <div
                            className="w-1.5 h-1.5 rounded-full"
                            style={{ background: st.archived ? '#22c55e' : '#71717a' }}
                          />
                          <span className={`flex-1 text-xs ${st.archived ? 'text-zinc-600 line-through' : 'text-zinc-300'}`}>
                            {st.title}
                          </span>
                          <BarChart3 className="w-3 h-3" style={{ color: sp.color }} />
                          {onDeleteSubtask ? (
                            <button
                              type="button"
                              onClick={() => setSubtaskPendingDelete(st)}
                              className="btn btn-ghost p-1 text-zinc-500 hover:text-red-400 hover:bg-red-500/10"
                              title="Delete subtask"
                              aria-label={`Delete subtask ${st.title}`}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          ) : null}
                        </div>
                      )
                    })
                  )}
                </div>
              </div>

              {/* Comments */}
              <div className="pt-2 border-t border-[var(--border)]">
                <label className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-3 block">
                  <MessageSquare className="w-3 h-3 inline mr-1" />
                  Comments
                </label>

                <div className="space-y-2 mb-3">
                  {comments.length === 0 ? (
                    <p className="text-zinc-600 text-xs text-center py-3">No comments yet</p>
                  ) : (
                    comments.map((comment) => {
                      const isAgent = comment.userId === 'agent'
                      return (
                        <div
                          key={comment.id}
                          className={`p-3 rounded-xl text-xs ${
                            isAgent
                              ? 'bg-[var(--accent-subtle)] border border-[rgba(245,61,45,0.2)]'
                              : 'bg-[var(--bg-elevated)]'
                          }`}
                        >
                          <div className="flex items-center gap-1.5 mb-1.5">
                            {isAgent ? (
                              <span className="text-[var(--accent)] text-[10px] flex items-center gap-1 font-medium">
                                <Bot className="w-3 h-3" /> Agent
                              </span>
                            ) : (
                              <span className="text-zinc-400 text-[10px] flex items-center gap-1">
                                <User className="w-3 h-3" /> User
                              </span>
                            )}
                            <span className="text-zinc-600 text-[10px] ml-auto">
                              {formatFullDate(comment.createdAt)}
                            </span>
                          </div>
                          <p className="text-zinc-200 leading-relaxed whitespace-pre-wrap">
                            {typeof comment.changes === 'string'
                              ? JSON.parse(comment.changes).content
                              : comment.changes.content}
                          </p>
                        </div>
                      )
                    })
                  )}
                </div>

                {/* Comment input */}
                <div className="relative">
                  <textarea
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    placeholder="Add a comment..."
                    rows={2}
                    className="input text-xs pr-10"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault()
                        onAddComment()
                      }
                    }}
                  />
                  <button
                    onClick={onAddComment}
                    disabled={submittingComment || !newComment.trim()}
                    className="absolute right-2 bottom-2 btn btn-ghost p-1.5"
                  >
                    <Send className="w-3.5 h-3.5 text-[var(--accent)]" />
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {subtaskPendingDelete && onDeleteSubtask ? (
        <div className="fixed inset-0 z-[220] flex items-center justify-center bg-black/70 px-4 animate-fade-in">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-subtask-title"
            className="w-full max-w-sm rounded-2xl border border-[var(--border)] bg-[var(--bg-secondary)] p-5 shadow-2xl shadow-black/40"
          >
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-red-500/10 text-red-400">
                <Trash2 className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <h4 id="delete-subtask-title" className="text-sm font-semibold text-white">Delete subtask?</h4>
                <p className="mt-1 text-sm leading-5 text-zinc-400">
                  This will remove <span className="font-medium text-zinc-200">"{subtaskPendingDelete.title}"</span> from this task.
                </p>
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setSubtaskPendingDelete(null)}
                className="btn btn-secondary text-xs"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  onDeleteSubtask(subtaskPendingDelete.id)
                  setSubtaskPendingDelete(null)
                }}
                className="btn text-xs bg-red-500/15 text-red-300 hover:bg-red-500/25"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {closeConfirmOpen ? (
        <div className="fixed inset-0 z-[230] flex items-center justify-center bg-black/70 px-4 animate-fade-in">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="unsaved-task-title"
            className="w-full max-w-sm rounded-2xl border border-[var(--border)] bg-[var(--bg-secondary)] p-5 shadow-2xl shadow-black/40"
          >
            <h4 id="unsaved-task-title" className="text-sm font-semibold text-white">Save changes?</h4>
            <p className="mt-2 text-sm leading-5 text-zinc-400">This task has unsaved edits.</p>
            <div className="mt-5 grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setCloseConfirmOpen(false)}
                className="btn btn-secondary text-xs"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={onClose}
                className="btn btn-ghost text-xs"
              >
                Discard
              </button>
              <button
                type="button"
                onClick={onSave}
                disabled={saving}
                className="btn btn-primary text-xs"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )

  return createPortal(panel, document.body)
}
