import { useState, useRef, useEffect } from 'react'
import { Tag, Plus, X, Pencil, Trash2 } from 'lucide-react'
import { tagApi } from '@/lib/api'

const TAG_COLORS = [
  { bg: 'rgba(245,61,45,0.15)', border: 'rgba(245,61,45,0.3)', text: '#f53d2d' },
  { bg: 'rgba(34,197,94,0.15)', border: 'rgba(34,197,94,0.3)', text: '#22c55e' },
  { bg: 'rgba(59,130,246,0.15)', border: 'rgba(59,130,246,0.3)', text: '#3b82f6' },
  { bg: 'rgba(168,85,247,0.15)', border: 'rgba(168,85,247,0.3)', text: '#a855f7' },
  { bg: 'rgba(249,115,22,0.15)', border: 'rgba(249,115,22,0.3)', text: '#f97316' },
  { bg: 'var(--tag-yellow-bg)', border: 'var(--tag-yellow-border)', text: 'var(--tag-yellow)' },
]

function colorForTagName(name: string): typeof TAG_COLORS[0] {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  return TAG_COLORS[Math.abs(hash) % TAG_COLORS.length]
}

interface SavedTag {
  id: string
  name: string
  color: string
}

interface TagsEditorProps {
  labels: string[]   // current tag NAMES (not IDs, since we're storing as string[])
  onChange: (tags: string[]) => void
  projectId: string   // needed to load/save tags to DB
}

export function TagsEditor({ labels, onChange, projectId }: TagsEditorProps) {
  const [editing, setEditing] = useState(false)
  const [input, setInput] = useState('')
  const [showDropdown, setShowDropdown] = useState(false)
  const [savedTags, setSavedTags] = useState<SavedTag[]>([])
  const [editingTagId, setEditingTagId] = useState<string | null>(null)
  const [editingTagName, setEditingTagName] = useState('')
  const [tagPendingDelete, setTagPendingDelete] = useState<SavedTag | null>(null)
  const [deletingTag, setDeletingTag] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // Load saved tags from DB
  useEffect(() => {
    if (!projectId || !editing) return
    tagApi.list(projectId)
      .then(setSavedTags)
      .catch(console.error)
  }, [editing, projectId])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setEditing(false)
        setShowDropdown(false)
        setEditingTagId(null)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const addTag = async (raw: string) => {
    const name = raw.trim().toLowerCase().replace(/\s+/g, '-')
    if (!name || labels.includes(name)) return

    // Check if this exact tag already exists in DB
    let existing = savedTags.find(t => t.name === name)
    if (!existing) {
      // Create it in DB
      try {
        existing = await tagApi.create(projectId, name)
        setSavedTags(prev => [...prev, existing!])
      } catch (err) {
        console.error('Failed to create tag:', err)
      }
    }

    onChange([...labels, name])
    setInput('')
    setShowDropdown(false)
  }

  const removeTag = (name: string) => onChange(labels.filter(t => t !== name))

  const selectSavedTag = (tag: SavedTag) => {
    if (!labels.includes(tag.name)) {
      onChange([...labels, tag.name])
    }
    setShowDropdown(false)
  }

  const startEditTag = (tag: SavedTag) => {
    setEditingTagId(tag.id)
    setEditingTagName(tag.name)
  }

  const saveEditTag = async () => {
    if (!editingTagId || !editingTagName.trim()) return
    const newName = editingTagName.trim().toLowerCase().replace(/\s+/g, '-')
    if (!newName) return

    try {
      await tagApi.update(editingTagId, { name: newName })
      setSavedTags(prev => prev.map(t => t.id === editingTagId ? { ...t, name: newName } : t))
      // Update all task labels that used the old name
      onChange(labels.map(l => l === savedTags.find(t => t.id === editingTagId)?.name ? newName : l))
    } catch (err) {
      console.error('Failed to rename tag:', err)
    }
    setEditingTagId(null)
    setEditingTagName('')
  }

  const deleteTag = async () => {
    if (!tagPendingDelete) return
    setDeletingTag(true)
    try {
      await tagApi.remove(tagPendingDelete.id)
      setSavedTags(prev => prev.filter(t => t.id !== tagPendingDelete.id))
      // Remove from current labels too
      onChange(labels.filter(l => l !== tagPendingDelete.name))
      setTagPendingDelete(null)
    } catch (err) {
      console.error('Failed to delete tag:', err)
    } finally {
      setDeletingTag(false)
    }
    setEditingTagId(null)
  }

  // Available tags = saved tags not yet assigned
  const availableTags = savedTags.filter(t => !labels.includes(t.name))

  return (
    <div ref={ref} className="relative">
      <div className="flex flex-wrap gap-1.5">
        {labels.map(tagName => {
          const c = colorForTagName(tagName)
          const savedTag = savedTags.find(t => t.name === tagName)
          return (
            <span
              key={tagName}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-medium border group relative"
              style={{ background: c.bg, borderColor: c.border, color: c.text }}
            >
              <Tag className="w-2.5 h-2.5" />
              {tagName}
              <div className="flex items-center gap-0.5 ml-0.5">
                {savedTag && (
                  <button
                    onClick={() => startEditTag(savedTag)}
                    className="opacity-0 group-hover:opacity-100 hover:bg-white/10 rounded transition-all p-0.5"
                    title="Edit tag"
                  >
                    <Pencil className="w-2.5 h-2.5" />
                  </button>
                )}
                <button onClick={() => removeTag(tagName)} className="hover:opacity-70 rounded transition-all p-0.5">
                  <X className="w-2.5 h-2.5" />
                </button>
              </div>
            </span>
          )
        })}
        <button
          onClick={() => { setEditing(true); setInput(''); setShowDropdown(true) }}
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] text-zinc-500 border border-dashed border-[var(--border)] hover:border-zinc-500 hover:text-zinc-300 transition-colors"
        >
          <Plus className="w-2.5 h-2.5" /> Add tag
        </button>
      </div>

      {editing && (
        <div className="mt-2 relative">
          {showDropdown && availableTags.length > 0 && (
            <div
              className="mb-2 max-h-32 overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-2"
              style={{ width: 'min(calc(100vw - 24px), 28rem)', maxWidth: '100%' }}
            >
              <p className="text-[10px] text-zinc-600 mb-1.5 font-medium">Saved tags:</p>
              <div className="flex flex-wrap gap-1">
                {availableTags.map(tag => {
                  const c = colorForTagName(tag.name)
                  return (
                    <button
                      key={tag.id}
                      onClick={() => selectSavedTag(tag)}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-medium border cursor-pointer hover:opacity-80"
                      style={{ background: c.bg, borderColor: c.border, color: c.text }}
                    >
                      <Tag className="w-2.5 h-2.5" />
                      {tag.name}
                    </button>
                  )
                })}
              </div>
            </div>
          )}
          <div className="flex gap-2">
            <input
              type="text"
              autoFocus
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck={false}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag(input) }
                if (e.key === 'Escape') { setEditing(false) }
              }}
              placeholder={availableTags.length > 0 ? 'or type new tag name...' : 'type new tag, press Enter'}
              className="input text-xs flex-1"
            />
            <button onClick={() => addTag(input)} className="btn btn-primary text-xs">Add</button>
          </div>
        </div>
      )}

      {/* Edit tag modal */}
      {editingTagId && (
        <div className="fixed inset-0 z-[220] flex items-center justify-center bg-black/60 p-4">
          <div
            className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] p-4"
            style={{ width: 'min(calc(100vw - 24px), 28rem)', maxWidth: 'calc(100vw - 24px)' }}
          >
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-medium text-white">Edit Tag</p>
              <button onClick={() => setEditingTagId(null)} className="btn btn-ghost p-1">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                autoFocus
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="none"
                spellCheck={false}
                value={editingTagName}
                onChange={e => setEditingTagName(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') saveEditTag()
                  if (e.key === 'Escape') setEditingTagId(null)
                }}
                className="input text-xs flex-1"
                placeholder="Tag name..."
              />
            </div>
            <div className="flex gap-2 mt-3">
              <button
                onClick={saveEditTag}
                className="btn btn-primary text-xs flex-1"
              >
                Rename
              </button>
              <button
                onClick={() => {
                  const tag = savedTags.find((savedTag) => savedTag.id === editingTagId)
                  if (tag) setTagPendingDelete(tag)
                }}
                className="btn btn-ghost text-xs text-red-400 hover:bg-red-500/10 px-3"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}

      {tagPendingDelete && (
        <div className="fixed inset-0 z-[230] flex items-center justify-center bg-black/70 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-editor-tag-title"
            className="w-full max-w-sm rounded-2xl border border-[var(--border)] bg-[var(--bg-secondary)] p-5 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 id="delete-editor-tag-title" className="text-sm font-semibold text-white">Delete Tag</h3>
                <p className="mt-1 text-sm leading-5 text-zinc-400">
                  Delete <span className="break-all font-medium text-zinc-200">{tagPendingDelete.name}</span> from all tasks?
                </p>
              </div>
              <button onClick={() => setTagPendingDelete(null)} className="btn btn-ghost p-1.5" aria-label="Cancel tag deletion" disabled={deletingTag}>
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-2">
              <button onClick={() => setTagPendingDelete(null)} className="btn btn-secondary text-xs" disabled={deletingTag}>
                Cancel
              </button>
              <button onClick={deleteTag} className="btn text-xs bg-red-500/15 text-red-300 hover:bg-red-500/25" disabled={deletingTag}>
                {deletingTag ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
