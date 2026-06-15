export function resolveTaskProjectId(selectedProjectId: string, activeProjectId: string): string {
  return selectedProjectId || activeProjectId
}
