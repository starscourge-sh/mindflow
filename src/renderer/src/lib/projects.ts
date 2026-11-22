import { call, useLive } from '@/lib/haligtree'
import { useKept } from '@/lib/groups'
import { chime } from '@/lib/sound'
import { num } from '../../../main/dates'
import { news, quietly, refuse, toast } from '@/components/haligtree/ui'
import type { Project, TaskGroup, Was } from '../../../main/projects'
import type { Folder } from '@/lib/folders'

export type { Project, TaskGroup } from '../../../main/projects'
export { PROJECT_DEPTH } from '../../../main/projects'

/**
 * Projects, where tasks live (src/main/projects.ts), as Todoist keeps them. Every way of moving a task into one (its
 * menu, right-click on several, ⇧⌘M, ⌘K, quick capture, a drag onto a project) ends in `moveToProject`, so each says
 * the same notice, plays the same sound and is undone the same way.
 */

type Removed = { row: Record<string, string | number | null>; was: Was[]; subs: string[] }
type Ungrouped = { was: Was[]; gone: Record<string, string | number | null>[] }

export const projects = {
  list: () => call<Project[]>('projects'),
  make: (name: string, parent: string | null = null) => call<string>('projects:make', name, parent),
  file: (ids: string[], project: string | null) => call<Was[]>('projects:file', ids, project),
  unfile: (was: Was[]) => call<void>('projects:unfile', was),
  set: (id: string, patch: { name?: string; icon?: string | null; color?: string | null; starred?: boolean; archived?: boolean; folded?: boolean }) => call<boolean>('projects:set', id, patch),
  nest: (id: string, parent: string | null) => call<true | string>('projects:nest', id, parent),
  place: (id: string, target: string, after: boolean) => call<{ ids: string[]; parent: string | null } | null>('projects:place', id, target, after),
  arrange: (id: string, was: { ids: string[]; parent: string | null }) => call<boolean>('projects:arrange', id, was),
  remove: (id: string) => call<Removed | null>('projects:remove', id),
  restore: (was: Removed) => call<boolean>('projects:restore', was),
  groups: () => call<TaskGroup[]>('projects:groups'),
  group: (ids: string[], name: string) => call<{ id: string; was: Was[] }>('projects:group', ids, name),
  join: (ids: string[], group: string) => call<Was[]>('projects:join', ids, group),
  ungroup: (ids: string[]) => call<Ungrouped>('projects:ungroup', ids),
  regroup: (was: Ungrouped) => call<boolean>('projects:regroup', was),
  moved: () => call<{ tasks: number; projects: number } | null>('projects:moved'),
  unmove: () => call<number>('projects:unmove')
}

/** Every project, drawn from the first frame from what it last said (as the sidebar's folders are). */
export const useProjects = (): Project[] => useKept('projects', projects.list, [] as Project[], [])
export const useTaskGroups = (): TaskGroup[] => useLive(projects.groups, [] as TaskGroup[], [], undefined, 'projects:groups')

/** Projects read as folders are, so the one picker and quick capture's ">name" match them the same way (lib/folders.ts `matchFolders`). */
export const asFolders = (all: Project[]): Folder[] => all.map((one) => ({ ...one, pages: 0, gems: 0, notes: 0, tasks: one.open, hidden: 0, used: 0, edited: null, cover: null, front: null }))

/** A project's path, outermost first. */
export function projectPath(all: Project[], id: string | null): Project[] {
  const byId = new Map(all.map((one) => [one.id, one]))
  const path: Project[] = []
  for (let at = id ? byId.get(id) : undefined, steps = 0; at && steps < 12; at = at.parent ? byId.get(at.parent) : undefined, steps++) path.unshift(at)
  return path
}

/** Open tasks in a project and every project inside it. */
export const openIn = (all: Project[], id: string): number => all.reduce((sum, one) => sum + (one.id === id ? one.open : one.parent === id ? openIn(all, one.id) : 0), 0)

const said = (n: number): string => (n === 1 ? 'the task' : `${num(n)} tasks`)

/** These tasks moved into a project (null: out of every project), with the notice, sound and Undo every move has. */
export async function moveToProject(ids: string[], project: { id: string; name: string } | null, { away = false }: { /** From quick capture as it goes: said in the main window too. */ away?: boolean } = {}): Promise<void> {
  if (!ids.length) return
  const was = await projects.file(ids, project?.id ?? null)
  const moved = was.filter((one) => one.project !== (project?.id ?? null))
  if (!moved.length) return refuse(project ? `Already in ${project.name}` : 'Already in no project')
  chime(project ? 'gather' : 'separate')
  const text = project ? `Moved ${said(moved.length)} to ${project.name}` : `Took ${said(moved.length)} out of its project`
  toast(text, () => void projects.unfile(was).then(() => chime(project ? 'separate' : 'gather')))
  if (away) window.api.sayInHome({ text, moved: was, undo: [], open: null })
}

/** A new project named `name` (in `parent`), these tasks moved into it: one step, one notice, one Undo for both. */
export async function moveToNewProject(ids: string[], name: string, parent: string | null = null): Promise<string> {
  const id = await projects.make(name, parent)
  chime('promote')
  if (!ids.length) {
    toast(`Made the project ${name}`, () => void projects.remove(id))
    return id
  }
  const was = await projects.file(ids, id)
  toast(`Moved ${said(ids.length)} to the new project ${name}`, () => void projects.unfile(was).then(() => projects.remove(id)))
  return id
}

/** Asks the one picker (folder-picker.tsx) to open for these tasks: "Move to project…". */
export const askProject = (ids: string[], at?: Element | null): void => void window.dispatchEvent(new CustomEvent('haligtree:keep-in-folder', { detail: { things: ids.map((id) => ({ type: 'task', id })), at } }))
/** The picker asked to move a project into another (its "Move to…"). */
export const askProjectFor = (project: Project, at?: Element | null): void => void window.dispatchEvent(new CustomEvent('haligtree:keep-in-folder', { detail: { things: [], movingProject: project, at } }))

/** A new project (in `parent`, opened to show it), named in place where it appears, as Finder names a new folder; ⌘Z takes it back. */
export async function newProjectHere(parent: string | null = null): Promise<void> {
  if (parent) void projects.set(parent, { folded: false })
  const id = await projects.make('New project', parent)
  chime('promote')
  quietly(() => void projects.remove(id))
  window.dispatchEvent(new CustomEvent('haligtree:project-name', { detail: { id } }))
}

/** Picked tasks gathered in a new group (⌘G, or a task dropped on a task), named in place on its heading. */
export async function groupTasks(ids: string[]): Promise<string | null> {
  if (ids.length < 2) return (refuse('Pick two tasks or more to group them'), null)
  const made = await projects.group(ids, 'New group')
  chime('gather')
  toast(`Grouped ${said(ids.length)}`, () => void projects.ungroup(ids).then(() => chime('separate')))
  window.dispatchEvent(new CustomEvent('haligtree:task-group-name', { detail: { id: made.id } }))
  return made.id
}

/** A task dropped on one in a group: into that group, said with Undo. */
export async function joinGroup(ids: string[], group: TaskGroup): Promise<void> {
  const was = await projects.join(ids, group.id)
  if (!was.length) return refuse('That group is gone')
  chime('gather')
  toast(`Moved ${said(ids.length)} into ${group.name}`, () => void projects.unfile(was).then(() => chime('separate')))
}

/** Picked tasks out of their groups (⇧⌘G); a group left empty goes, and Undo brings it back. */
export async function ungroupTasks(ids: string[]): Promise<void> {
  const was = await projects.ungroup(ids)
  if (!was.was.length) return refuse('None of these is in a group')
  chime('separate')
  toast(`Took ${said(was.was.length)} out of ${was.was.length === 1 ? 'its group' : 'their groups'}`, () => void projects.regroup(was).then(() => chime('gather')))
}

/** The one-time move of tasks out of folders into projects, said once with Undo (projects.ts `moveTasksToProjects`). */
export async function sayProjectMove(onShow: () => void): Promise<void> {
  const said_ = await projects.moved()
  if (!said_?.tasks) return
  news(`Tasks live in projects now: ${said_.tasks === 1 ? 'the task' : `${num(said_.tasks)} tasks`} kept in folders moved into ${said_.projects === 1 ? 'a project' : `${num(said_.projects)} projects`} of the same name. Nothing was lost.`,
    () => void projects.unmove().then((n) => (chime('separate'), toast(`Put ${said(n)} back in their folders`))), 'info', { label: 'Show me', key: 'S', run: onShow })
}
