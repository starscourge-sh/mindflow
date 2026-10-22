import { useEffect, useState, useSyncExternalStore } from 'react'
import { moveToBin } from './to-bin'

import { fieldKeys } from '@/components/capture-kinds/kind-fields'
import { refuse, toast, waiting, quietly } from '@/components/vigil/ui'
import type { Action } from '@/components/search'
import { chime } from '@/lib/sound'
import { detailsShown, fullWidth, setFullWidth, showDetails } from '@/lib/reading'
import { call, useLive, vigil } from '@/lib/vigil'
import { addToQuestion } from '@/components/vigil/questions-view'
import { dayKey, num } from '../../../main/dates'
import { canSplit, frontPane, usePane } from '@/lib/split'
import { openApart } from '@/lib/apart'

/**
 * The main process's `notes:` channels, typed, and the actions built on them
 * that every list and properties column shares: a note's picture, your own
 * order, its kind and fields, the archive, its versions, its links, its
 * files, its own window, and the day's page.
 */

export type NoteTable = 'captures' | 'nuggets'
export type GraphNode = { type: string; id: string; title: string; private: number }
export type MapNode = {
  type: string; id: string; title: string; kind: string; links: number
  /** Its main tag, and that tag's colour on the map: the Tags page's, else one no other tag there has. */
  tag?: string; tint?: string
  /** The first picture in it. */
  picture?: string
}
/** Two linked notes, and how many times either links to the other. */
export type MapEdge = [string, string, number?]
export type NoteMap = { nodes: MapNode[]; edges: MapEdge[]; alone: number; /** The notes left off for having no links (the first 300). */ lonely?: Omit<MapNode, 'links'>[] }
export type Version = { id: number; savedAt: string; size: number }
export type DayEntry = { type: string; id: string; title: string; kind?: string; status?: string; private: number; /** When it happened that day; a dated task's time. */ at?: string | null; allDay?: number }
export type Day = { day: string; exists: boolean; body: unknown; reviewed: boolean; captured: DayEntry[]; resolved: DayEntry[]; studied: DayEntry[]; done: DayEntry[]; /** Tasks planned for or due by the day. */ dated?: DayEntry[] }

export const notes = {
  thumbs: () => call<Record<string, string>>('notes:thumbs'),
  thumb: (src: string, height?: number) => call<string>('notes:thumb', src, height),
  glance: (table: NoteTable) => call<Record<string, string>>('notes:glance', table),
  order: (list: string) => call<string[]>('notes:order', list),
  setOrder: (list: string, ids: string[]) => call('notes:order:set', list, ids),
  fields: (table: NoteTable, id: string) => call<Record<string, string | number>>('notes:fields', table, id),
  tags: (table: NoteTable, id: string) => call<string[]>('notes:tags', table, id),
  setField: (table: NoteTable, id: string, key: string, value: string | number | null) => call('notes:fields:set', table, id, key, value),
  versions: (id: string) => call<Version[]>('notes:versions', id),
  version: (id: number) => call<unknown>('notes:version', id),
  restore: (table: NoteTable | 'day', id: string, version: number) => call<number | null>('notes:version:restore', table, id, version),
  /** Words that could not land, kept as a version: its id, for a Restore. */
  keep: (id: string, body: unknown) => call<number>('notes:version:keep', id, body),
  /** A note's words as stored now, without counting as an open. */
  body: (table: NoteTable, id: string) => call<unknown>('notes:body', table, id),
  graph: (id: string) => call<{ out: GraphNode[]; in: GraphNode[] }>('notes:graph', id),
  /** Every note with a link, each pair of linked notes once, and how many notes have none. */
  map: () => call<NoteMap>('notes:graph:all'),
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
export const smallPicture = (src: string, large = false): Promise<string> => {
  const key = `${large}:${src}`
  let made = small.get(key)
  if (!made) small.set(key, (made = notes.thumb(src, large ? 320 : 96)))
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
   * `unsort`: given when the move switched the list to your own order; Undo puts the old sort back too.
   */
  move: (all: string[], id: string, target: string, after: boolean, quiet?: boolean, shown?: string[], unsort?: () => void) => void
} {
  const order = useLive(() => notes.order(list), [] as string[], [list])
  const rank = new Map(order.map((id, at) => [id, at]))
  const compare = (a: string, b: string): number => (rank.get(a) ?? -1) - (rank.get(b) ?? -1)
  const move = (all: string[], id: string, target: string, after: boolean, quiet = false, shown?: string[], unsort?: () => void): void => {
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
      // A list that was sorted some other way says so, even from the keyboard, so its label never lies.
      if (unsort) toast('Now in your own order', () => (unsort(), void notes.setOrder(list, was)))
      else if (!quiet) quietly(() => void notes.setOrder(list, was))
    })
  }
  return { compare, move }
}

// --- the note open now, for ⌘K to act on

export type OpenNote = { table: NoteTable; type: string; id: string; kind: string; archived: boolean }
// One for each pane of a split page ('' outside the panes): ⌘K acts on the front pane's.
const opened = new Map<string, OpenNote>()
const currentNote = (): OpenNote | null => opened.get(frontPane() ?? '') ?? (frontPane() ? null : (opened.get('') ?? null))
/** Said by whichever view has a note open, for as long as it is open. */
export function useOpenNote(note: OpenNote | null): void {
  const pane = usePane() ?? ''
  useEffect(() => {
    if (note) opened.set(pane, note)
    else opened.delete(pane)
    window.dispatchEvent(new Event('vigil:note-open'))
    // Home's "Jump back in" reads these.
    if (note) void call('home:opened', note.type, note.id)
    return () => void (opened.get(pane) === note && (opened.delete(pane), window.dispatchEvent(new Event('vigil:note-open'))))
  }, [note?.id, note?.kind, note?.archived]) // eslint-disable-line react-hooks/exhaustive-deps
}

/** Whether any pane has a note open now: a list's hint is about the list, not the note over it. */
export function useAnyNoteOpen(): boolean {
  const [open, setOpen] = useState(() => opened.size > 0)
  useEffect(() => {
    const read = (): void => setOpen(opened.size > 0)
    read()
    window.addEventListener('vigil:note-open', read)
    return () => window.removeEventListener('vigil:note-open', read)
  }, [])
  return open
}

// --- the actions, each with its sound and its way back

/** Ask for a kind, in the small list the Kind picker has. Null if let go. */
export const pickKind = (current: string): Promise<string | null> =>
  new Promise((answer) => void window.dispatchEvent(new CustomEvent('vigil:pick-kind', { detail: { current, answer } })))

/** A new kind for a note: fields it has no room for are held out of sight and come back with a kind that has. Undoable. */
export async function changeKind(table: NoteTable, id: string, from: string, to?: string): Promise<void> {
  const kind = to ?? (await pickKind(from))
  if (!kind || kind === from) return
  const was = await call<{ kind: string; fields: string | null } | null>('notes:kind', table, id, kind, fieldKeys(kind))
  if (!was) return refuse('That note no longer exists, so its kind was not changed')
  chime('retag')
  quietly(() => void call('notes:kind:undo', table, id, was))
}

/** Out of sight, not deleted; or back again. Undoable. */
export async function archive(table: NoteTable, ids: string[], on: boolean, quiet = false, onUndo?: () => void): Promise<void> {
  await call('notes:archive', table, ids, on)
  if (quiet) return
  chime(on ? 'shelve' : 'unshelve')
  const many = ids.length > 1 ? ` ${ids.length}` : ''
  // `onUndo`: what the place it was done from puts back as well (a pass steps back to it).
  // The Archived page lists captures; a gem or a page archived is found under its own page's Display.
  const there = table === 'captures'
  toast(on ? `Archived${many}: kept, out of sight, ${there ? 'in Archived' : 'shown again from Display, Marked, Archived'}` : `Back from the archive${many}`, () => void archive(table, ids, !on, true).then(() => onUndo?.()), 'success', on && there ? { label: 'Open Archived', key: 'V', run: () => window.api.openInHome('view', 'archived') } : undefined)
}

/** Every picture and file in these notes (or every note), under its own name, to a folder. */
export async function saveAttachments(list?: { table: NoteTable; id: string }[]): Promise<void> {
  const done = await waiting('Saving files…', 'working', call<{ saved: number; total: number } | 0 | null>('notes:attachments', list))
  if (done === null) return
  if (!done) return refuse(list ? 'No pictures or files in this note' : 'No pictures or files anywhere yet')
  const { saved, total } = done
  if (!saved) return refuse(`Could not save ${total === 1 ? 'the file' : `any of the ${num(total)} files`}. Pick a folder you can write to and try again`, 'error')
  chime('saved')
  toast(`Saved ${saved < total ? `${saved} of ${total}` : saved} ${total === 1 ? 'file' : 'files'}, under their own names`)
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
  const note = currentNote()
  const page: Action[] = day ? [{ label: "Today's page", cue: null, run: openToday }] : []
  const all: Action = { label: 'Save all attachments', hint: 'Every picture and file, to a folder', cue: null, run: () => void saveAttachments() }
  // Notion's switch, for every page: the words in a reading column, or across the window.
  const width: Action = fullWidth()
    ? { label: 'Contained width', cue: null, run: () => setFullWidth(false) }
    : { label: 'Full width', cue: null, run: () => setFullWidth(true) }
  if (!note) return [...page, width, all]
  // Marked as this note's own, so search ranks them above going somewhere.
  return [
    ...page,
    ...([
      ...(note.type === 'capture' ? [{ label: 'Add as a clue to a question…', cue: null, run: () => void addToQuestion(note.id) }] : []),
      { label: 'Change kind…', cue: null, run: () => void changeKind(note.table, note.id, note.kind) },
      { label: note.archived ? 'Unarchive this note' : 'Archive this note', hint: note.archived ? 'Back in sight' : 'Kept, out of sight', cue: null, run: () => void archive(note.table, [note.id], !note.archived) },
      { label: 'Move to the Bin', hint: 'This note', cue: null, run: () => void moveToBin([{ type: note.type, id: note.id }]) },
      { label: 'Open in a new window', hint: 'This note, in its own window', ...(canSplit() ? { keys: '⌘O' } : {}), cue: null, run: () => openApart(note.type, note.id) },
      { label: 'Set a word aim', hint: 'For this note: 800 words, or 800 by Friday', cue: null, run: () => void window.dispatchEvent(new CustomEvent('mindflow:aim')) },
      { label: 'Version history', hint: 'Of this note', cue: null, run: () => window.dispatchEvent(new CustomEvent('vigil:versions', { detail: note.id })) },
      { label: detailsShown(frontPane()) ? "Hide this note's details" : "Show this note's details", cue: null, run: () => showDetails(!detailsShown(frontPane()), frontPane()) },
      { label: 'Save attachments', hint: "This note's pictures and files", cue: null, run: () => void saveAttachments([{ table: note.table, id: note.id }]) },
    ] as Action[]).map((one) => ({ ...one, own: true })),
    width,
    all
  ]
}
