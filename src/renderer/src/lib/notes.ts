import { useEffect, useSyncExternalStore } from 'react'

import { CAPTURE_TYPES } from '@/components/capture-kinds/capture-kind-picker'
import { fieldKeys } from '@/components/capture-kinds/kind-fields'
import { beaming, refuse, toast } from '@/components/vigil/ui'
import type { Action } from '@/components/search'
import { chime } from '@/lib/sound'
import { useLive, vigil } from '@/lib/vigil'
import { addToQuestion } from '@/components/vigil/questions-view'
import { dayKey } from '../../../main/dates'

/**
 * The main process's `notes:` channels, typed, and the actions built on them
 * that every list and properties column shares: a note's picture, your own
 * order, its kind and fields, the archive, its versions, its links, its
 * files, its own window, and the day's page.
 */
const call = <T>(channel: string, ...args: unknown[]): Promise<T> => window.api.vigil(channel, ...args) as Promise<T>

export type NoteTable = 'captures' | 'nuggets'
export type GraphNode = { type: string; id: string; title: string; private: number }
export type Version = { id: number; savedAt: string; size: number }
export type DayEntry = { type: string; id: string; title: string; kind?: string; status?: string; private: number }
export type Day = { day: string; exists: boolean; body: unknown; reviewed: boolean; captured: DayEntry[]; resolved: DayEntry[]; studied: DayEntry[]; done: DayEntry[] }

export const notes = {
  thumbs: () => call<Record<string, string>>('notes:thumbs'),
  thumb: (src: string) => call<string>('notes:thumb', src),
  glance: (table: NoteTable) => call<Record<string, string>>('notes:glance', table),
  order: (list: string) => call<string[]>('notes:order', list),
  setOrder: (list: string, ids: string[]) => call('notes:order:set', list, ids),
  fields: (table: NoteTable, id: string) => call<Record<string, string | number>>('notes:fields', table, id),
  setField: (table: NoteTable, id: string, key: string, value: string | number | null) => call('notes:fields:set', table, id, key, value),
  versions: (id: string) => call<Version[]>('notes:versions', id),
  version: (id: number) => call<unknown>('notes:version', id),
  restore: (table: NoteTable | 'day', id: string, version: number) => call<number | null>('notes:version:restore', table, id, version),
  /** Words that could not land, kept as a version: its id, for a Restore. */
  keep: (id: string, body: unknown) => call<number>('notes:version:keep', id, body),
  /** A note's words as stored now, without counting as an open. */
  body: (table: NoteTable, id: string) => call<unknown>('notes:body', table, id),
  graph: (id: string) => call<{ out: GraphNode[]; in: GraphNode[] }>('notes:graph', id),
  day: (day: string) => call<Day>('notes:day', day),
  saveDay: (day: string, patch: { body?: unknown; reviewed?: boolean }) => call('notes:day:save', day, patch)
}

/** A day as the database files it: the local calendar's date. */
export const dayOf = (date = new Date()): string => dayKey(date)

// --- pictures in lists, shared by every row: one read, not one per row

let thumbs: Record<string, string> = {}
let showThumbs = true
const listeners = new Set<() => void>()
let started = false
const loadThumbs = (): void =>
  void Promise.all([notes.thumbs(), vigil.settings()]).then(([found, settings]) => {
    thumbs = found
    showThumbs = (settings as { thumbnails?: boolean }).thumbnails !== false
    listeners.forEach((listen) => listen())
  })
const subscribe = (listen: () => void): (() => void) => {
  if (!started) {
    started = true
    loadThumbs()
    window.api.captures.onChange(loadThumbs)
  }
  listeners.add(listen)
  return () => void listeners.delete(listen)
}
/** The first picture in a note, or nothing; nothing too when the setting is off. */
export const useThumb = (id: string): string | undefined =>
  useSyncExternalStore(subscribe, () => (showThumbs ? thumbs[id] : undefined))

// Each picture made small once, by the main process, then kept here.
const small = new Map<string, Promise<string>>()
export const smallPicture = (src: string): Promise<string> => {
  let made = small.get(src)
  if (!made) small.set(src, (made = notes.thumb(src)))
  return made
}

// --- your own order

/**
 * A list's own order, the one you drag rows into. Rows never placed come
 * first, newest at the top, so something new is never lost at the bottom.
 */
export function useOwnOrder(list: string): {
  compare: (a: string, b: string) => number
  /**
   * Move a row to just before (or after) another, among every row in `all`.
   * `shown`: the ids as on screen, passed when the list is sorted some other way.
   */
  move: (all: string[], id: string, target: string, after: boolean, quiet?: boolean, shown?: string[]) => void
} {
  const order = useLive(() => notes.order(list), [] as string[], [list])
  const rank = new Map(order.map((id, at) => [id, at]))
  const compare = (a: string, b: string): number => (rank.get(a) ?? -1) - (rank.get(b) ?? -1)
  const move = (all: string[], id: string, target: string, after: boolean, quiet = false, shown?: string[]): void => {
    if (id === target) return
    // Dragged while sorted some other way, the rows start from where you see
    // them (the rest after), not from an order you cannot see.
    const seen = new Set(shown)
    const start = shown ? [...shown, ...all.filter((one) => !seen.has(one)).sort(compare)] : [...all].sort(compare)
    const next = start.filter((one) => one !== id)
    const at = next.indexOf(target)
    if (at < 0) return
    next.splice(after ? at + 1 : at, 0, id)
    const was = order
    chime('shift')
    void notes.setOrder(list, next).then(() => {
      if (!quiet) toast('Moved', () => void notes.setOrder(list, was))
    })
  }
  return { compare, move }
}

// --- the note open now, for ⌘K to act on

export type OpenNote = { table: NoteTable; type: string; id: string; kind: string; archived: boolean }
let current: OpenNote | null = null
/** Said by whichever view has a note open, for as long as it is open. */
export function useOpenNote(note: OpenNote | null): void {
  useEffect(() => {
    current = note
    return () => void (current === note && (current = null))
  }, [note?.id, note?.kind, note?.archived]) // eslint-disable-line react-hooks/exhaustive-deps
}

// --- the actions, each with its sound and its way back

const label = (kind: string): string => CAPTURE_TYPES.find((type) => type.id === kind)?.label ?? 'Note'

/** Ask for a kind, in the small list the Kind picker has. Null if let go. */
export const pickKind = (current: string): Promise<string | null> =>
  new Promise((answer) => void window.dispatchEvent(new CustomEvent('vigil:pick-kind', { detail: { current, answer } })))

/** A new kind for a note, keeping the fields it still has room for; undoable. */
export async function changeKind(table: NoteTable, id: string, from: string, to?: string): Promise<void> {
  const kind = to ?? (await pickKind(from))
  if (!kind || kind === from) return
  const was = await call<{ kind: string; fields: string | null } | null>('notes:kind', table, id, kind, fieldKeys(kind))
  if (!was) return refuse('That note no longer exists, so its kind was not changed')
  chime('retag')
  toast(`Now a ${label(kind).toLowerCase()}`, () => void call('notes:kind:undo', table, id, was))
}

/** Out of sight, not deleted; or back again. Undoable. */
export async function archive(table: NoteTable, ids: string[], on: boolean, quiet = false): Promise<void> {
  await call('notes:archive', table, ids, on)
  chime(on ? 'shelve' : 'unshelve')
  if (quiet) return
  const many = ids.length > 1 ? ` ${ids.length}` : ''
  toast(on ? `Archived${many}: out of sight, not gone` : `Back from the archive${many}`, () => void archive(table, ids, !on, true))
}

/** Every picture and file in these notes (or every note), under its own name, to a folder. */
export async function saveAttachments(list?: { table: NoteTable; id: string }[]): Promise<void> {
  const done = await beaming(call<{ saved: number; total: number } | 0 | null>('notes:attachments', list))
  if (done === null) return
  if (!done) return refuse(list ? 'No pictures or files in this note' : 'No pictures or files anywhere yet')
  const { saved, total } = done
  if (!saved) return refuse(`Could not save ${total === 1 ? 'the file' : `any of the ${total} files`}. Pick a folder you can write to and try again`)
  chime('saved')
  toast(`Saved ${saved < total ? `${saved} of ${total}` : saved} ${total === 1 ? 'file' : 'files'}, under their own names`)
}

/** A note in a window of its own: ⌘-click on any row. */
export const openWindow = (type: string, id: string): void => {
  chime('window')
  void call('notes:window', type === 'capture' ? 'capture' : type, id)
  // Closed here once it has a window of its own: two editors on one note
  // would each save over the other's words.
  window.dispatchEvent(new CustomEvent('vigil:opened-apart', { detail: id }))
}

/** Go to today's page, in the main window. */
export const openToday = (): void => {
  chime('day')
  window.api.openInHome('view', 'day')
}

/**
 * What ⌘K offers for the note open now, and the day's page always: the same
 * in the box and the main window. The main window lists the page with its
 * sections already, so it passes `day: false`.
 */
export function noteActions({ day = true }: { day?: boolean } = {}): Action[] {
  const note = current
  const page: Action[] = day ? [{ label: "Today's page", cue: null, run: openToday }] : []
  const all: Action = { label: 'Save every picture and file to a folder', cue: null, run: () => void saveAttachments() }
  if (!note) return [...page, all]
  // Marked as this note's own, so search ranks them above going somewhere.
  return [
    ...page,
    ...([
      ...(note.type === 'capture' ? [{ label: 'Add to a question…', cue: null, run: () => void addToQuestion(note.id) }] : []),
      { label: 'Change kind…', cue: null, run: () => void changeKind(note.table, note.id, note.kind) },
      { label: note.archived ? 'Unarchive this note' : 'Archive this note', cue: null, run: () => void archive(note.table, [note.id], !note.archived) },
      { label: 'Open this note in a new window', cue: null, run: () => openWindow(note.type, note.id) },
      { label: 'Version history of this note', cue: null, run: () => window.dispatchEvent(new CustomEvent('vigil:versions', { detail: note.id })) },
      { label: "Save this note's pictures and files", cue: null, run: () => void saveAttachments([{ table: note.table, id: note.id }]) },
    ] as Action[]).map((one) => ({ ...one, own: true })),
    all
  ]
}
