/**
 * What a project is, and how deep they go: pure, so the windows read it too (lib/projects.ts) without pulling the main
 * process into their bundle. Kept by src/main/projects.ts.
 */

export const LIST = 'projects'
export const GROUPS = 'task-groups'
/** How deep projects go: a project and three levels inside it, as Todoist's. */
export const PROJECT_DEPTH = 4

export type Project = {
  id: string; name: string; icon: string | null; color: string | null; parent: string | null; starred: number; archived: number; folded: number
  /** Its own open tasks (not its projects'), out of the Bin. */
  open: number
}
export type TaskGroup = { id: string; name: string; project: string | null; folded: number }

/** Where a task was, for Undo: its project and its group. */
export type Was = { id: string; project: string | null; group: string | null }
