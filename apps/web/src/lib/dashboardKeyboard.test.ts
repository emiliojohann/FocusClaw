import test from 'node:test'
import assert from 'node:assert/strict'
import { containModalFocus, handleDashboardSearchShortcut, handleModalKeyDown, restoreModalFocus } from './dashboardKeyboard'

function fixture() {
  let active: HTMLElement | null = null
  function control(tagName = 'BUTTON') {
    const element = { tagName, isConnected: true, focus() { active = element as unknown as HTMLElement } }
    return element as unknown as HTMLElement
  }
  const first = control()
  const input = control('INPUT')
  const last = control()
  const search = control('INPUT') as HTMLInputElement
  let controls = [first, input, last]
  const dialog = {
    contains: (node: Node | null) => node === (dialog as unknown as Node) || controls.includes(node as HTMLElement),
    querySelector: () => controls[0] ?? null,
    querySelectorAll: () => controls,
    focus() { active = dialog as unknown as HTMLElement },
  } as unknown as HTMLElement
  return { first, input, last, search, dialog, get active() { return active },
    disableControls() { controls = [] } }
}

function key(key: string, target: HTMLElement, shiftKey = false) {
  const event = { key, target, shiftKey, defaultPrevented: false,
    preventDefault() { event.defaultPrevented = true } }
  return event as unknown as KeyboardEvent
}

test('open modal blocks slash and Escape background search shortcuts without eating modal input', () => {
  const f = fixture()
  let cleared = 0
  for (const target of [f.first, f.input, f.search]) {
    target.focus()
    for (const value of ['/', 'Escape', 'a', 'Tab', 'Enter']) {
      const event = key(value, target)
      handleDashboardSearchShortcut(event, true, 'existing search', f.search, null, f.active, () => cleared++)
      assert.equal(f.active, target)
      assert.equal(event.defaultPrevented, false)
    }
  }
  assert.equal(cleared, 0)
})

test('dashboard search shortcuts resume when closed and preserve input typing', () => {
  const f = fixture()
  let cleared = 0
  const slash = key('/', f.first)
  handleDashboardSearchShortcut(slash, false, '', f.search, null, f.first, () => cleared++)
  assert.equal(f.active, f.search)
  assert.equal(slash.defaultPrevented, true)
  const escape = key('Escape', f.search)
  handleDashboardSearchShortcut(escape, false, 'query', f.search, null, f.search, () => cleared++)
  assert.equal(cleared, 1)
  f.input.focus()
  const typing = key('/', f.input)
  handleDashboardSearchShortcut(typing, false, '', f.search, null, f.input, () => cleared++)
  assert.equal(f.active, f.input)
  assert.equal(typing.defaultPrevented, false)
})

test('Tab recovers escaped focus in either direction and wraps dialog boundaries', () => {
  const f = fixture()
  for (const [start, shift, expected] of [
    [f.search, false, f.first], [f.search, true, f.last],
    [f.first, true, f.last], [f.last, false, f.first],
    [f.dialog, false, f.first], [f.dialog, true, f.last],
  ] as const) {
    start.focus()
    const event = key('Tab', start, shift)
    handleModalKeyDown(event, f.dialog, f.active, () => assert.fail('unexpected cancel'))
    assert.equal(f.active, expected)
    assert.equal(event.defaultPrevented, true)
  }
  f.input.focus()
  const interior = key('Tab', f.input)
  handleModalKeyDown(interior, f.dialog, f.active, () => assert.fail('unexpected cancel'))
  assert.equal(interior.defaultPrevented, false)
})

test('focusin redirects outside focus but preserves date input; pending controls fall back to dialog', () => {
  const f = fixture()
  f.search.focus()
  containModalFocus(f.dialog, f.active)
  assert.equal(f.active, f.first)
  f.input.focus()
  containModalFocus(f.dialog, f.active)
  assert.equal(f.active, f.input)
  f.disableControls()
  f.search.focus()
  containModalFocus(f.dialog, f.active)
  assert.equal(f.active, f.dialog)
  const tab = key('Tab', f.dialog)
  handleModalKeyDown(tab, f.dialog, f.active, () => assert.fail('unexpected cancel'))
  assert.equal(tab.defaultPrevented, true)
  assert.equal(f.active, f.dialog)
})

test('Escape delegates cancellation to pending guard; modal typing is untouched', () => {
  const f = fixture()
  let pending = true
  let cancelled = 0
  const cancel = () => { if (!pending) cancelled++ }
  for (const value of ['/', 'a', 'Enter', 'ArrowDown']) {
    const event = key(value, f.input)
    handleModalKeyDown(event, f.dialog, f.input, cancel)
    assert.equal(event.defaultPrevented, false)
  }
  handleModalKeyDown(key('Escape', f.first), f.dialog, f.first, cancel)
  assert.equal(cancelled, 0)
  pending = false
  const escape = key('Escape', f.first)
  handleModalKeyDown(escape, f.dialog, f.first, cancel)
  assert.equal(cancelled, 1)
  assert.equal(escape.defaultPrevented, true)
})

test('close restores trigger on cancel, stable Select tasks control after successful Apply removes trigger', () => {
  const f = fixture()
  restoreModalFocus(f.last, f.first)
  assert.equal(f.active, f.last)
  Object.assign(f.last, { isConnected: false })
  restoreModalFocus(f.last, f.first)
  assert.equal(f.active, f.first)
  restoreModalFocus(null, f.first)
  assert.equal(f.active, f.first)
})
