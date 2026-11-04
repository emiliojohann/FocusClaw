import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../pages/DashboardPage.tsx', import.meta.url), 'utf8')
const css = readFileSync(new URL('../index.css', import.meta.url), 'utf8')
const toolbar = source.slice(source.indexOf('{bulkSelectionMode ? (', source.indexOf('{/* Content */}')), source.indexOf('{manualSortError ? ('))

test('bulk toolbar has a larger left count and right-aligned mobile icon actions', () => {
  assert.match(toolbar, /fc-bulk-actions[^\n]*flex flex-nowrap/)
  assert.match(toolbar, /fc-selection-count btn btn-secondary mr-auto text-xs font-normal tabular-nums/)
  assert.match(toolbar, /data-empty=\{selectedTaskIds.size === 0\}/)
  assert.match(css, /\.fc-selection-count\[data-empty='true'\][\s\S]*?opacity: 0\.45/)
  assert.doesNotMatch(css, /\.fc-bulk-actions \.fc-selection-count\.btn/)
  assert.doesNotMatch(toolbar, /sm:contents/)
  assert.doesNotMatch(toolbar, /shadow-xl/)
  assert.match(toolbar, /\{selectedTaskIds.size\}<span> selected<\/span>/)
  assert.match(toolbar, /aria-label="Reschedule selected tasks"/)
  assert.match(toolbar, /<span className="hidden sm:inline">Reschedule<\/span>/)
  assert.match(toolbar, /aria-label="Delete selected tasks"/)
  assert.match(toolbar, /<span className="hidden sm:inline">Delete<\/span>/)
  assert.ok(toolbar.indexOf('Clear\n') < toolbar.indexOf('ref={bulkRescheduleTrigger}'))
  assert.ok(toolbar.indexOf('ref={bulkRescheduleTrigger}') < toolbar.indexOf('aria-label="Delete selected tasks"'))
  assert.match(toolbar, /fc-bulk-delete/)
  assert.match(css, /:root\[data-theme='light'\] \.fc-bulk-delete\s*\{\s*background: var\(--danger-bg\);\s*color: var\(--priority-critical\);/)
  assert.doesNotMatch(css, /\.fc-bulk-delete\s*\{\s*border: 1px solid currentColor;/)
  assert.match(css, /:root\[data-theme='light'\] \.fc-bulk-actions \.btn\s*\{\s*border: none;/)
  assert.match(toolbar, /fc-bulk-clear/)
  assert.match(css, /\.fc-bulk-actions \.fc-bulk-clear[\s\S]*?padding-inline: 0\.75rem/)
  assert.match(css, /@media \(max-width: 639px\)[\s\S]*?\.fc-bulk-actions \.btn/)
})
