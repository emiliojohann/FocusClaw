import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const dashboard = readFileSync(new URL('../pages/DashboardPage.tsx', import.meta.url), 'utf8')
const css = readFileSync(new URL('../index.css', import.meta.url), 'utf8')

test('list and grid mount fresh selection squares instead of transitioning from completion wrappers', () => {
  const squares = [...dashboard.matchAll(/<div\s+key="bulk-selection"\s+className=\{`[^`]+`\}\s+role="checkbox"/g)]
  assert.equal(squares.length, 2)
  assert.equal((dashboard.match(/role="checkbox"/g) ?? []).length, squares.length)
  for (const square of squares) assert.match(square[0], /transition-colors/)
  assert.equal((dashboard.match(/<Check className="fc-selection-check h-3 w-3"/g) ?? []).length, 2)
  assert.match(css, /\.fc-selection-check\s*\{\s*color: #fff;/)
})
