import { useState } from 'react'
import { createPortal } from 'react-dom'
import { FolderOpen, Plus, Trash2, X } from 'lucide-react'
import { taskApi } from '@/lib/api'
import type { ProjectRecord } from '@/lib/projectContext'

type DeleteProjectMode = 'deleteTasks' | 'moveTasks'

interface ProjectSwitcherProps {
  projects: ProjectRecord[]
  activeProjectId: string
  onProjectChange: (projectId: string) => void
  onCreateProject: (name: string) => Promise<void>
  onDeleteProject?: (projectId: string, options: { mode: DeleteProjectMode; targetProjectId?: string }) => Promise<void>
  mobileCompact?: boolean
}

export function ProjectSwitcher({ projects, activeProjectId, onProjectChange, onCreateProject, onDeleteProject, mobileCompact = false }: ProjectSwitcherProps) {
  const [showCreate, setShowCreate] = useState(false)
  const [newProjectName, setNewProjectName] = useState('')
  const [creating, setCreating] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleteMode, setDeleteMode] = useState<DeleteProjectMode>('deleteTasks')
  const [targetProjectId, setTargetProjectId] = useState('')
  const [taskCount, setTaskCount] = useState<number | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')

  const activeProject = projects.find((project) => project.id === activeProjectId)
  const destinationProjects = projects.filter((project) => project.id !== activeProjectId)

  const submitCreate = async () => {
    const normalized = newProjectName.trim()
    if (!normalized) return
    setCreating(true)
    try {
      await onCreateProject(normalized)
      setNewProjectName('')
      setShowCreate(false)
    } finally {
      setCreating(false)
    }
  }

  const openDelete = async () => {
    if (!activeProject || !onDeleteProject) return
    setDeleteOpen(true)
    setDeleteMode('deleteTasks')
    setTargetProjectId(destinationProjects[0]?.id || '')
    setTaskCount(null)
    setDeleteError('')
    try {
      const projectTasks = await taskApi.list(activeProject.id, { includeArchived: true })
      setTaskCount(projectTasks.length)
    } catch {
      setTaskCount(null)
    }
  }

  const submitDelete = async () => {
    if (!activeProject || !onDeleteProject) return
    if (deleteMode === 'moveTasks' && !targetProjectId) {
      setDeleteError('Choose a destination project.')
      return
    }

    setDeleting(true)
    setDeleteError('')
    try {
      await onDeleteProject(activeProject.id, {
        mode: deleteMode,
        ...(deleteMode === 'moveTasks' ? { targetProjectId } : {}),
      })
      setDeleteOpen(false)
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : 'Failed to delete project')
    } finally {
      setDeleting(false)
    }
  }

  const deleteModal = deleteOpen && activeProject ? (
    <>
      <div className="fixed inset-0 z-[200] bg-black/60 backdrop" onClick={() => setDeleteOpen(false)} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-project-switcher-title"
        className="fixed top-1/2 left-1/2 z-[210] flex max-h-[calc(100dvh-1.5rem)] w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-secondary)] shadow-2xl"
      >
        <div className="flex items-start justify-between gap-4 border-b border-[var(--border)] p-5">
          <div className="min-w-0">
            <h3 id="delete-project-switcher-title" className="text-sm font-semibold text-white">Delete {activeProject.name}?</h3>
            <p className="mt-1 text-xs text-zinc-500">
              {taskCount === null ? 'This project may contain tasks.' : `This project contains ${taskCount} task${taskCount === 1 ? '' : 's'}.`}
            </p>
          </div>
          <button onClick={() => setDeleteOpen(false)} className="btn btn-ghost p-1.5" aria-label="Cancel project deletion">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          <div className="space-y-2">
            <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-3 text-xs text-zinc-300">
              <input
                type="radio"
                checked={deleteMode === 'deleteTasks'}
                onChange={() => setDeleteMode('deleteTasks')}
                className="mt-0.5"
              />
              <span>
                <span className="block font-medium text-white">Delete project and tasks</span>
                <span className="text-zinc-500">Permanently deletes tasks that belong to this project.</span>
              </span>
            </label>

            <label className={`flex cursor-pointer items-start gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-3 text-xs text-zinc-300 ${destinationProjects.length === 0 ? 'opacity-50' : ''}`}>
              <input
                type="radio"
                checked={deleteMode === 'moveTasks'}
                disabled={destinationProjects.length === 0}
                onChange={() => setDeleteMode('moveTasks')}
                className="mt-0.5"
              />
              <span className="min-w-0 flex-1">
                <span className="block font-medium text-white">Move tasks, then delete project</span>
                <span className="text-zinc-500">Keeps tasks, subtasks, comments, and universal tags.</span>
                {deleteMode === 'moveTasks' && destinationProjects.length > 0 ? (
                  <select
                    value={targetProjectId}
                    onChange={(event) => setTargetProjectId(event.target.value)}
                    className="input mt-2 w-full text-xs"
                  >
                    {destinationProjects.map((project) => (
                      <option key={project.id} value={project.id}>{project.name}</option>
                    ))}
                  </select>
                ) : null}
              </span>
            </label>
          </div>

          {deleteError ? <p className="mt-3 text-xs text-red-400">{deleteError}</p> : null}

          <div className="mt-5 flex items-center justify-end gap-2">
            <button onClick={() => setDeleteOpen(false)} className="btn btn-secondary text-xs">Cancel</button>
            <button
              onClick={submitDelete}
              disabled={deleting || (deleteMode === 'moveTasks' && !targetProjectId)}
              className="btn btn-primary text-xs bg-red-500 hover:bg-red-400"
            >
              {deleting ? 'Deleting...' : 'Delete Project'}
            </button>
          </div>
        </div>
      </div>
    </>
  ) : null

  return (
    <div className={`flex items-center min-w-0 ${mobileCompact ? 'flex-nowrap gap-1.5 sm:gap-2' : 'flex-wrap gap-2'}`}>
      <div className="fc-control flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-2 min-w-0">
        <FolderOpen className="w-3.5 h-3.5 text-zinc-500" />
        <select
          value={activeProjectId}
          onChange={(e) => onProjectChange(e.target.value)}
          className={`bg-transparent text-xs text-white outline-none h-full ${
            mobileCompact ? 'min-w-[8rem] max-w-[11rem] sm:min-w-[120px] sm:max-w-[180px]' : 'min-w-[10rem] max-w-[14rem] sm:min-w-[120px] sm:max-w-[180px]'
          }`}
          aria-label="Active project"
        >
          {projects.map((project) => (
            <option key={project.id} value={project.id} className="bg-[var(--bg-secondary)]">
              {project.name}
            </option>
          ))}
        </select>
      </div>
      <button
        type="button"
        onClick={() => setShowCreate((value) => !value)}
        className={`btn btn-secondary text-xs fc-control ${mobileCompact ? 'hidden sm:inline-flex' : ''}`}
        title="Create project"
        aria-label={showCreate ? 'Cancel project creation' : 'Create project'}
      >
        {showCreate ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
        <span className="hidden sm:inline">{showCreate ? 'Cancel' : 'Project'}</span>
      </button>
      {onDeleteProject && activeProject ? (
        <button
          type="button"
          onClick={openDelete}
          className="btn btn-ghost text-xs fc-control !w-9 !p-0 text-red-400 hover:bg-red-500/10"
          title="Delete project"
          aria-label="Delete project"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      ) : null}

      {showCreate ? (
        <div className="flex items-center gap-2">
          <input
            value={newProjectName}
            onChange={(e) => setNewProjectName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submitCreate()
              if (e.key === 'Escape') setShowCreate(false)
            }}
            className="input text-xs py-1.5"
            placeholder="Project name"
          />
          <button
            type="button"
            disabled={creating || !newProjectName.trim()}
            onClick={submitCreate}
            className="btn btn-primary text-xs"
          >
            Create
          </button>
        </div>
      ) : null}

      {deleteModal ? createPortal(deleteModal, document.body) : null}
    </div>
  )
}
