import test from 'node:test'
import assert from 'node:assert/strict'
import { moveTaskAfter, moveTaskBefore, reorderManualSubset } from './manualOrder'

test('moveTaskBefore supports an arbitrary manual sequence', () => {
  let order = ['1', '2', '3', '4', '5']
  order = moveTaskBefore(order, '5', '1')
  order = moveTaskBefore(order, '3', '1')
  order = moveTaskBefore(order, '4', '1')
  assert.deepEqual(order, ['5', '3', '4', '1', '2'])
})

test('reorderManualSubset preserves hidden task slots', () => {
  const tasks = [
    { id: '1', position: 0 },
    { id: 'hidden', position: 1 },
    { id: '2', position: 2 },
    { id: '3', position: 3 },
  ]
  const reordered = reorderManualSubset(tasks, ['3', '1', '2'])
  assert.deepEqual(reordered.map((task) => task.id), ['3', 'hidden', '1', '2'])
  assert.deepEqual(reordered.map((task) => task.position), [0, 1, 2, 3])
})

test('moveTaskAfter can place a task at the end', () => {
  assert.deepEqual(moveTaskAfter(['1', '2', '3', '4', '5'], '1', '5'), ['2', '3', '4', '5', '1'])
})
