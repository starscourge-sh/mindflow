import { call, useLive } from '@/lib/haligtree'
import { useKept } from '@/lib/groups'
import { chime } from '@/lib/sound'
import { num, plural } from '../../../main/dates'
import { refuse, toast } from '@/components/haligtree/ui'

/**
 * Folders, one tree for the whole book (src/main/folders.ts): where a thing lives, of any kind. Every way of filing
 * something (a row's menu, right-click, ⌘K, the note's bar, a key, quick capture's `>name`, a drag) ends in `keepIn`,
 * so each says the same notice, plays the same sound and is undone the same way.
 */

export type FolderKind = 'article' | 'nugget' | 'question' | 'capture' | 'task'
export type Thing = { type: FolderKind; id: string }
export type Was = Thing & { folder: string | null; status?: string }
export type Folder = {
  id: string; name: string; icon: string | null; color: string | null; parent: string | null; starred: number; archived: number
  pages: number; gems: number; notes: number; tasks: number; hidden: number
  /** Frecency: keeps counted, less as they age (folders.ts `listFolders`). */
  used: number
  /** When anything in it last changed. */
  edited: string | null
  /** Its front over its list: a cover picture's address, and its words with link cards (a page's stored shape). */
  cover: string | null
  front: string | null
}
export type FolderItem = { type: FolderKind; id: string; title: string; at: string; archived: number }

export const FOLDER_DEPTH = 6

export const folders = {
  list: () => call<Folder[]>('folders'),
  items: (id: string) => call<FolderItem[]>('folders:items', id),
  unfiled: () => call<number>('folders:unfiled'),
  make: (name: string, parent: string | null = null) => call<string>('folders:make', name, parent),
  file: (things: Thing[], folder: string | null) => call<Was[]>('folders:file', things, folder),
  unfile: (was: Was[]) => call<void>('folders:unfile', was),
  of: (table: 'nuggets' | 'captures' | 'tasks') => call<Record<string, string>>('folders:of', table),
  set: (id: string, patch: { name?: string; icon?: string | null; color?: string | null; starred?: boolean; archived?: boolean; cover?: string | null; front?: string | null }) => call<boolean>('folders:set', id, patch),
  nest: (id: string, parent: string | null) => call<true | string>('folders:nest', id, parent),
  place: (id: string, target: string, after: boolean) => call<{ ids: string[]; parent: string | null } | null>('folders:place', id, target, after),
  arrange: (id: string, was: { ids: string[]; parent: string | null }) => call<boolean>('folders:arrange', id, was),
  remove: (id: string) => call<{ row: Record<string, string | number | null>; things: Thing[]; subs: string[] } | null>('folders:remove', id),
  restore: (was: { row: Record<string, string | number | null>; things: Thing[]; subs: string[] }) => call<boolean>('folders:restore', was),
  moved: () => call<{ folders: number; things: number } | { failed: string } | null>('folders:moved'),
  offers: () => call<{ id: string; name: string; n: number }[]>('folders:offers'),
  archiveInstead: (id: string) => call<{ row: Record<string, string | number | null>; things: Thing[]; subs: string[] } | null>('folders:archive-instead', id),
  unarchive: (was: { row: Record<string, string | number | null>; things: Thing[]; subs: string[] }) => call<boolean>('folders:unarchive', was),
  unmove: () => call<boolean>('folders:unmove'),
  moveState: () => call<'moved' | 'undone' | null>('folders:move-state'),
  moveAgain: () => call<{ moved: false; why: string } | { moved: true; folders: number; things: number }>('folders:move-again')
}

/** Every folder, drawn from the first frame from what it last said (as the sidebar's groups are). */
export const useFolders = (): Folder[] => useKept('folders', folders.list, [] as Folder[], [])
/** Where each page, gem or question lives: its folder's id. */
export const useFolderOf = (): Record<string, string> => useLive(() => folders.of('nuggets'), {} as Record<string, string>, [], undefined, 'folders:of:nuggets')

/** What a folder holds itself, every kind, in sight. */
export const heldIn = (one: Folder): number => one.pages + one.gems + one.notes + one.tasks

/** A folder's path, outermost first: "Work / Clients / Acme". */
export function pathOf(all: Folder[], id: string | null): Folder[] {
  const byId = new Map(all.map((one) => [one.id, one]))
  const path: Folder[] = []
  for (let at = id ? byId.get(id) : undefined, steps = 0; at && steps < 12; at = at.parent ? byId.get(at.parent) : undefined, steps++) path.unshift(at)
  return path
}
export const pathSaid = (all: Folder[], id: string | null): string => pathOf(all, id).map((one) => one.name).join(' / ')

/** What these things are, said: "the page", "3 notes". */
const said = (things: Thing[]): string => {
  if (things.length !== 1) return `${num(things.length)} things`
  return ({ article: 'the page', nugget: 'the gem', question: 'the question', capture: 'the note', task: 'the task' } as const)[things[0].type]
}

/**
 * These things kept in a folder (null: in none), with the notice, sound and Undo every move has. A note from the Inbox
 * leaves it ("out of the Inbox"); taken out of every folder, it goes back there.
 */
export async function keepIn(things: Thing[], folder: { id: string; name: string } | null): Promise<void> {
  if (!things.length) return
  const was = await folders.file(things, folder?.id ?? null)
  const moved = was.filter((one) => one.folder !== (folder?.id ?? null))
  if (!moved.length) return refuse(folder ? `Already in ${folder.name}` : 'Already in no folder')
  const fromInbox = folder && was.some((one) => one.type === 'capture' && one.status === 'open')
  chime(folder ? 'gather' : 'separate')
  toast(folder ? `Kept ${said(moved)} in ${folder.name}${fromInbox ? ', out of the Inbox' : ''}` : `Took ${said(moved)} out of its folder`, () => void folders.unfile(was).then(() => chime(folder ? 'separate' : 'gather')))
}

/** A new folder named `name` (in `parent`), and these things kept in it: one step, one notice, one Undo for both. */
export async function keepInNew(things: Thing[], name: string, parent: string | null = null): Promise<string> {
  const id = await folders.make(name, parent)
  chime('promote')
  if (!things.length) {
    toast(`Made the folder ${name}`, () => void folders.remove(id))
    return id
  }
  const was = await folders.file(things, id)
  toast(`Kept ${said(things)} in the new folder ${name}`, () => void folders.unfile(was).then(() => folders.remove(id)))
  return id
}

/** Asks the one folder picker to open for these things (folder-picker.tsx, mounted once in the main window). */
/** Writing's and Gems' old folders back as they were before the move (folders.ts `unmoveFolders`), said with its own Undo: the move again. */
export async function putFoldersBack(): Promise<void> {
  if (!(await folders.unmove())) return refuse('Nothing to put back: the old folders were never moved')
  chime('separate')
  toast('Writing’s and Gems’ old folders are back as they were', () => void moveFoldersAgain())
}
/** The move made again, after its own backup copy; said with Undo. */
export async function moveFoldersAgain(): Promise<void> {
  const done = await folders.moveAgain()
  if (!done.moved) return refuse(done.why === 'nothing to move' ? 'No folders in Writing or Gems to move' : `Not moved: ${done.why}`)
  chime('gather')
  toast(`Moved into Folders again: ${plural(done.folders, 'folder')} holding ${plural(done.things, 'thing')}`, () => void putFoldersBack())
}

/** `at`: what it stands beside; left out, what was last pressed (picker-at.tsx `placeFor`). */
export const askFolder = (things: Thing[], at?: Element | null): void => void window.dispatchEvent(new CustomEvent('haligtree:keep-in-folder', { detail: { things, at } }))

/** Finds a folder by its name or a path typed with "/" between levels, any case: quick capture's `>work/clients`. */
export function findFolder(all: Folder[], typed: string): Folder | undefined {
  const parts = typed.split('/').map((one) => one.trim().toLowerCase()).filter(Boolean)
  if (!parts.length) return undefined
  const last = parts.at(-1)!
  return all.find((one) => {
    if (one.name.toLowerCase() !== last) return false
    const path = pathOf(all, one.id).map((at) => at.name.toLowerCase())
    return parts.every((part, at) => path[path.length - parts.length + at] === part)
  }) ?? all.find((one) => one.name.toLowerCase().startsWith(last))
}
