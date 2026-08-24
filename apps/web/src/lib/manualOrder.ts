export interface ManualOrderTask {
  id: string
  position: number
}

export function moveTaskBefore(taskIds: string[], draggedId: string, targetId: string): string[] {
  if (draggedId === targetId) return taskIds
  const fromIndex = taskIds.indexOf(draggedId)
  const targetIndex = taskIds.indexOf(targetId)
  if (fromIndex < 0 || targetIndex < 0) return taskIds

  const next = [...taskIds]
  next.splice(fromIndex, 1)
  const insertionIndex = next.indexOf(targetId)
  next.splice(insertionIndex, 0, draggedId)
  return next
}

export function moveTaskAfter(taskIds: string[], draggedId: string, targetId: string): string[] {
  if (draggedId === targetId) return taskIds
  const fromIndex = taskIds.indexOf(draggedId)
  const targetIndex = taskIds.indexOf(targetId)
  if (fromIndex < 0 || targetIndex < 0) return taskIds

  const next = [...taskIds]
  next.splice(fromIndex, 1)
  const insertionIndex = next.indexOf(targetId) + 1
  next.splice(insertionIndex, 0, draggedId)
  return next
}

export function reorderManualSubset<T extends ManualOrderTask>(tasks: T[], orderedTaskIds: string[]): T[] {
  const selected = new Set(orderedTaskIds)
  const selectedSlots = tasks
    .map((task, index) => selected.has(task.id) ? index : -1)
    .filter((index) => index >= 0)
  if (selectedSlots.length !== orderedTaskIds.length) return tasks

  const taskById = new Map(tasks.map((task) => [task.id, task]))
  const next = [...tasks]
  selectedSlots.forEach((slot, index) => {
    const task = taskById.get(orderedTaskIds[index])
    if (task) next[slot] = task
  })
  return next.map((task, position) => ({ ...task, position }))
}
