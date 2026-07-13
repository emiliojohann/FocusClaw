import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Bold, Code2, Eye, Italic, Link, List, ListOrdered } from 'lucide-react'

export const DESCRIPTION_MAX_LENGTH = 10000
const DESCRIPTION_EDITOR_MIN_HEIGHT = 224
const DESCRIPTION_EDITOR_MAX_HEIGHT = 520

type DescriptionMode = 'live' | 'code'
type MarkdownFormat = 'bold' | 'italic' | 'link' | 'bullet' | 'numbered' | 'code'

interface DescriptionEditorProps {
  value: string
  onChange: (value: string) => void
  label?: string
  rows?: number
  minHeight?: number
  placeholder?: string
}

function clampDescriptionEditorHeight(height: number, minHeight: number): number {
  return Math.min(DESCRIPTION_EDITOR_MAX_HEIGHT, Math.max(minHeight, height))
}

function sanitizeHttpUrl(value: string | null): string {
  if (!value) return ''
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.toString() : ''
  } catch {
    return ''
  }
}

function appendInlineMarkdown(parent: HTMLElement, value: string) {
  const tokenPattern = /(\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)|\*\*([^*]+)\*\*|\*([^*]+)\*|`([^`]+)`)/gi
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = tokenPattern.exec(value)) !== null) {
    if (match.index > lastIndex) parent.append(document.createTextNode(value.slice(lastIndex, match.index)))

    const [, rawToken, linkLabel, linkHref, boldText, italicText, codeText] = match
    if (linkLabel && linkHref) {
      const safeHref = sanitizeHttpUrl(linkHref)
      if (safeHref) {
        const link = document.createElement('a')
        link.href = safeHref
        link.textContent = linkLabel
        parent.append(link)
      } else {
        parent.append(document.createTextNode(linkLabel))
      }
    } else if (boldText) {
      const strong = document.createElement('strong')
      strong.textContent = boldText
      parent.append(strong)
    } else if (italicText) {
      const emphasis = document.createElement('em')
      emphasis.textContent = italicText
      parent.append(emphasis)
    } else if (codeText) {
      const code = document.createElement('code')
      code.textContent = codeText
      parent.append(code)
    } else {
      parent.append(document.createTextNode(rawToken))
    }

    lastIndex = match.index + rawToken.length
  }

  if (lastIndex < value.length) parent.append(document.createTextNode(value.slice(lastIndex)))
}

function markdownToEditableNodes(value: string): Node[] {
  if (!value.trim()) return []
  const lines = value.split('\n')
  const nodes: Node[] = []
  let listElement: HTMLUListElement | HTMLOListElement | null = null

  const closeList = () => {
    if (!listElement) return
    nodes.push(listElement)
    listElement = null
  }

  lines.forEach((line) => {
    const bullet = line.match(/^\s*[-*]\s+(.+)$/)
    const numbered = line.match(/^\s*\d+\.\s+(.+)$/)

    if (bullet || numbered) {
      const nextMode = bullet ? 'ul' : 'ol'
      if (!listElement || listElement.tagName.toLowerCase() !== nextMode) {
        closeList()
        listElement = document.createElement(nextMode) as HTMLUListElement | HTMLOListElement
      }
      const item = document.createElement('li')
      appendInlineMarkdown(item, (bullet || numbered)?.[1] || '')
      listElement.append(item)
      return
    }

    closeList()
    const paragraph = document.createElement('p')
    if (line.trim()) appendInlineMarkdown(paragraph, line)
    else paragraph.append(document.createElement('br'))
    nodes.push(paragraph)
  })

  closeList()
  return nodes
}

function normalizeEditableText(value: string): string {
  return value
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function htmlNodeToMarkdown(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent || ''
  if (node.nodeType !== Node.ELEMENT_NODE) return ''

  const element = node as HTMLElement
  const tagName = element.tagName.toLowerCase()
  const children = Array.from(element.childNodes)
    .filter((child) => {
      if (child.nodeType !== Node.ELEMENT_NODE) return true
      const childTagName = (child as HTMLElement).tagName.toLowerCase()
      return childTagName !== 'ul' && childTagName !== 'ol'
    })
    .map(htmlNodeToMarkdown)
    .join('')

  if (tagName === 'strong' || tagName === 'b') return `**${children}**`
  if (tagName === 'em' || tagName === 'i') return `*${children}*`
  if (tagName === 'code') return `\`${children}\``
  if (tagName === 'a') {
    const href = sanitizeHttpUrl(element.getAttribute('href'))
    return href ? `[${children}](${href})` : children
  }
  if (tagName === 'li') return children.trim()
  if (tagName === 'br') return '\n'
  return children
}

function blockNodeToMarkdown(node: Node): string[] {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.textContent || ''
    return text.trim() ? [text] : []
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return []

  const element = node as HTMLElement
  const tagName = element.tagName.toLowerCase()

  if (tagName === 'ul' || tagName === 'ol') {
    return Array.from(element.children).flatMap((child, index) => {
      const marker = tagName === 'ol' ? `${index + 1}.` : '-'
      const itemText = htmlNodeToMarkdown(child).trim()
      const nested = Array.from(child.childNodes)
        .filter((nestedNode) => nestedNode.nodeType === Node.ELEMENT_NODE && ['ul', 'ol'].includes((nestedNode as HTMLElement).tagName.toLowerCase()))
        .flatMap(blockNodeToMarkdown)
        .map((line) => `  ${line}`)
      return [`${marker} ${itemText}`, ...nested]
    })
  }

  if (tagName === 'div' || tagName === 'p') {
    const nestedBlocks = Array.from(element.childNodes)
      .filter((child) => child.nodeType === Node.ELEMENT_NODE && ['ul', 'ol'].includes((child as HTMLElement).tagName.toLowerCase()))
      .flatMap(blockNodeToMarkdown)
    const text = htmlNodeToMarkdown(element).trim()
    return text ? [text, ...nestedBlocks] : nestedBlocks
  }

  if (tagName === 'br') return ['']
  return [htmlNodeToMarkdown(element).trim()]
}

function editableHtmlToMarkdown(root: HTMLElement): string {
  const lines: string[] = []

  Array.from(root.childNodes).forEach((node) => {
    lines.push(...blockNodeToMarkdown(node))
  })

  return normalizeEditableText(lines.join('\n'))
}

function insertInlineCode(editor: HTMLElement) {
  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0) return

  const range = selection.getRangeAt(0)
  if (!editor.contains(range.commonAncestorContainer)) return

  const code = document.createElement('code')
  code.textContent = selection.toString() || 'code'
  range.deleteContents()
  range.insertNode(code)
  range.setStartAfter(code)
  range.setEndAfter(code)
  selection.removeAllRanges()
  selection.addRange(range)
}

export function DescriptionEditor({
  value,
  onChange,
  label = 'Description',
  rows = 8,
  minHeight = DESCRIPTION_EDITOR_MIN_HEIGHT,
  placeholder = 'Write description...',
}: DescriptionEditorProps) {
  const [mode, setMode] = useState<DescriptionMode>('live')
  const [editorHeight, setEditorHeight] = useState(minHeight)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const liveEditorRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const surface = mode === 'live' ? liveEditorRef.current : textareaRef.current
    if (!surface || typeof ResizeObserver === 'undefined') return undefined

    const observer = new ResizeObserver(() => {
      const nextHeight = clampDescriptionEditorHeight(Math.round(surface.getBoundingClientRect().height), minHeight)
      setEditorHeight((height) => (
        Math.abs(height - nextHeight) > 1 ? nextHeight : height
      ))
    })

    observer.observe(surface)
    return () => observer.disconnect()
  }, [mode, minHeight])

  useEffect(() => {
    const editor = liveEditorRef.current
    if (!editor || mode !== 'live' || document.activeElement === editor) return
    editor.replaceChildren(...markdownToEditableNodes(value))
  }, [mode, value])

  const applyMarkdownFormat = (kind: MarkdownFormat) => {
    if (mode === 'live') {
      const editor = liveEditorRef.current
      if (!editor) return
      editor.focus()
      if (kind === 'bold') document.execCommand('bold')
      if (kind === 'italic') document.execCommand('italic')
      if (kind === 'link') {
        const href = window.prompt('Link URL')
        const safeHref = sanitizeHttpUrl(href)
        if (safeHref) document.execCommand('createLink', false, safeHref)
      }
      if (kind === 'bullet') document.execCommand('insertUnorderedList')
      if (kind === 'numbered') document.execCommand('insertOrderedList')
      if (kind === 'code') insertInlineCode(editor)
      onChange(editableHtmlToMarkdown(editor))
      return
    }

    const textarea = textareaRef.current
    const start = textarea?.selectionStart ?? value.length
    const end = textarea?.selectionEnd ?? value.length
    const selected = value.slice(start, end)
    const fallback = kind === 'link' ? 'Link text' : kind === 'code' ? 'code' : 'text'
    let replacement = selected || fallback

    if (kind === 'bold') replacement = `**${replacement}**`
    if (kind === 'italic') replacement = `*${replacement}*`
    if (kind === 'code') replacement = `\`${replacement}\``
    if (kind === 'link') replacement = `[${replacement}](https://example.com)`
    if (kind === 'bullet') replacement = selected ? selected.split('\n').map((line) => `- ${line}`).join('\n') : '- List item'
    if (kind === 'numbered') replacement = selected ? selected.split('\n').map((line, index) => `${index + 1}. ${line}`).join('\n') : '1. List item'

    const next = `${value.slice(0, start)}${replacement}${value.slice(end)}`
    onChange(next)
    window.setTimeout(() => {
      textareaRef.current?.focus()
      textareaRef.current?.setSelectionRange(start + replacement.length, start + replacement.length)
    }, 0)
  }

  const handleLiveInput = (event: FormEvent<HTMLDivElement>) => {
    onChange(editableHtmlToMarkdown(event.currentTarget))
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <label className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">{label}</label>
        <div className="fc-description-mode-toggle flex items-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-1">
          <button
            type="button"
            onClick={() => setMode('live')}
            className={`btn min-w-0 flex-1 !h-7 !px-2 text-[10px] ${mode === 'live' ? 'btn-primary' : 'btn-ghost'}`}
            aria-pressed={mode === 'live'}
          >
            <Eye className="h-3 w-3" />
            Live
          </button>
          <button
            type="button"
            onClick={() => setMode('code')}
            className={`btn min-w-0 flex-1 !h-7 !px-2 text-[10px] ${mode === 'code' ? 'btn-primary' : 'btn-ghost'}`}
            aria-pressed={mode === 'code'}
          >
            <Code2 className="h-3 w-3" />
            Code
          </button>
        </div>
      </div>
      {mode === 'live' ? (
        <div className="mb-2 flex flex-wrap gap-1 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-1">
          {[
            { kind: 'bold' as const, icon: Bold, label: 'Bold' },
            { kind: 'italic' as const, icon: Italic, label: 'Italic' },
            { kind: 'link' as const, icon: Link, label: 'Link' },
            { kind: 'bullet' as const, icon: List, label: 'Bulleted list' },
            { kind: 'numbered' as const, icon: ListOrdered, label: 'Numbered list' },
            { kind: 'code' as const, icon: Code2, label: 'Inline code' },
          ].map((item) => {
            const Icon = item.icon
            return (
              <button
                key={item.kind}
                type="button"
                onClick={() => applyMarkdownFormat(item.kind)}
                className="btn btn-ghost !h-8 !w-8 !p-0"
                title={item.label}
                aria-label={item.label}
              >
                <Icon className="h-3.5 w-3.5" />
              </button>
            )
          })}
        </div>
      ) : null}
      <div className="fc-description-field">
        <div className="fc-resizable-surface-frame">
          {mode === 'live' ? (
            <div
              ref={liveEditorRef}
              contentEditable
              suppressContentEditableWarning
              role="textbox"
              aria-multiline="true"
              aria-label={label}
              className="input fc-resizable-text-surface fc-description-editor-surface fc-description-live-surface"
              style={{ height: editorHeight, minHeight }}
              data-placeholder={placeholder}
              onInput={handleLiveInput}
              onBlur={handleLiveInput}
            />
          ) : (
            <textarea
              ref={textareaRef}
              value={value}
              onChange={(e) => onChange(e.target.value)}
              maxLength={DESCRIPTION_MAX_LENGTH}
              rows={rows}
              className="input fc-resizable-text-surface fc-description-editor-surface fc-description-code-surface"
              style={{ height: editorHeight, minHeight }}
              placeholder="Write Markdown..."
            />
          )}
        </div>
        <div
          className={`fc-description-counter text-right text-[10px] ${value.length > DESCRIPTION_MAX_LENGTH * 0.9 ? 'text-amber-300' : 'text-zinc-400'}`}
          aria-live="polite"
        >
          {value.length}/{DESCRIPTION_MAX_LENGTH}
        </div>
      </div>
    </div>
  )
}
