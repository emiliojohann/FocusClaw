import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../pages/DashboardPage.tsx', import.meta.url), 'utf8')
const picker = readFileSync(new URL('../components/DatePicker.tsx', import.meta.url), 'utf8')

test('inline reschedule calendar has no shadow while floating calendars retain theirs', () => {
  assert.match(picker, /inline\s*\? 'relative mt-2'\s*:\s*`absolute shadow-2xl/)
  assert.doesNotMatch(picker, /p-3 shadow-2xl \$\{inline/)
})

const dialog = source.slice(source.indexOf('{bulkRescheduleOpen ? ('), source.indexOf('{bulkDeletePending &&'))

test('bulk reschedule keeps concise title-case copy and uses the shared task calendar', () => {
  assert.match(dialog, />Reschedule Selected Tasks<\/h3>/)
  assert.match(dialog, /\['Next Week', 7\]/)
  assert.doesNotMatch(dialog, /Set a new due date for|Scheduling off today|Project, status, and completion/)
  assert.match(dialog, /Next week means seven days from today\./)
  assert.doesNotMatch(dialog, /type="date"/)
  assert.match(dialog, /<DatePicker[\s\S]*?inline/)
  assert.match(dialog, /disabled=\{bulkRescheduling\}/)
  assert.match(dialog, /aria-describedby="bulk-reschedule-note"/)
  assert.match(dialog, /id="bulk-reschedule-note"/)
  assert.match(dialog, /text-\[var\(--text-primary\)\]/)
  assert.match(dialog, /text-\[var\(--text-muted\)\]/)
})
