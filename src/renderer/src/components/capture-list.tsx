import { voiceOf } from '@/lib/sources'
import { askFolder } from '@/lib/folders'
import { startGoal } from '@/components/haligtree/goals-view'
import type { Picking } from '@/lib/pick-range'
import { openRead } from './haligtree/read-through'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { chime } from '@/lib/sound'

import { CAPTURE_TYPES } from './capture-kinds/capture-kind-picker'
import { EXITS, exit, exitMany, statusSaid, toWriting } from '@/lib/capture-links'
import { splitTags, together, unread, haligtree, whenLetGo } from '@/lib/haligtree'
import { backSaid, makeTask, snoozeItems } from '@/lib/tasks'
import { Tip, ask, pin, toast, quietly } from './haligtree/ui'
import { copy, copyLinkItem, type RowItem } from './haligtree/row-menu'
import { stickOnDesktop } from './haligtree/sticky-note'
import { NoteList, type Entry } from './haligtree/note-list'
import type { Density } from './haligtree/display'
import { archive, changeKind, publishSite, saveAttachments } from '@/lib/notes'
import { openApart, openSmall } from '@/lib/apart'
import { openItems } from '@/lib/split'
import { binItem, moveToBin } from '@/lib/to-bin'
import { FileText } from 'lucide-react'
import { isFolder, type NoteGroup } from '@/lib/groups'
import { GroupIcon } from './haligtree/kept-groups'
import { queueMenu } from '@/lib/reading-queue'
import { moveToBookItem } from '@/lib/books'
import { addToQuestion, keepAsking } from './haligtree/questions-view'
import { age, dayjs, dayKey, daysSince, num, whenInLine } from '../../../main/dates'
import { EyeOff, Bookmark as Pin } from '@/components/ui/icons'
import type { IslandState } from './haligtree/islands'
import { pictureItems } from '@/lib/note-picture'
import { cardItem } from '@/lib/share-card'
import { headword } from '@/lib/headword'

/** One property out of a capture's fields, or null. */
export const fieldOf = (fields: string | null | undefined, key: string): string | null => {
  try {
    const value = fields ? (JSON.parse(fields) as Record<string, unknown>)[key] : null
    return value == null || value === '' ? null : String(value)
  } catch {
    return null
  }
}

export type CaptureMeta = Awaited<ReturnType<typeof window.api.captures.list>>[number]

/**
 * Listed in the Inbox as it stands (Settings' “Inbox shows”): written, edited,
 * imported or back from hiding in the last `days` days, or pinned. 0 days is
 * everything. Older ones wait behind one line at the list's end; search, tags,
 * ⌘K and the Map find them all the same.
 */
export const inInboxWindow = (capture: CaptureMeta, days: number): boolean => {
  if (!days || capture.pinnedAt) return true
  const from = dayjs().subtract(days, 'day')
  return [capture.capturedAt, capture.editedAt, capture.importedAt, capture.snoozedUntil].some((at) => !!at && dayjs(at).isAfter(from))
}

/** The list as last read, by whether it holds the archived: a page opened again starts on it, drawn whole at once. */
const lastList: Record<'all' | 'kept', { json: string; list: CaptureMeta[] } | undefined> = { all: undefined, kept: undefined }

/**
 * Every capture, newest first, reloaded whenever any window writes. Archived
 * ones are out of sight unless asked for: `archived` gives every capture.
 */
export function useCaptures(archived = false): CaptureMeta[] {
  const which = archived ? 'all' : 'kept'
  const [captures, setCaptures] = useState<CaptureMeta[]>(() => lastList[which]?.list ?? unread([]))
  // The list the state was started on: once `archived` changes, what is shown is the other list.
  const startedOn = useRef(which)
  useEffect(() => {
    // The same list as last time (typing past a note's first line) keeps the
    // old one, so the lists holding it do not redraw on every pause. Compared
    // only with the list shown: after `archived` changed, an answer equal to
    // the new list's last was dropped, and the other list stayed.
    let last: string | undefined = startedOn.current === which ? lastList[which]?.json : undefined
    startedOn.current = which
    let held: CaptureMeta[] | undefined
    const take = (all: CaptureMeta[]): void => {
      // The very list held already: the main process said nothing changed.
      if (all === held) return
      held = all
      const now = JSON.stringify(all)
      if (now === last) return
      last = now
      const list = archived ? [...all] : all.filter((one) => !one.archivedAt)
      lastList[which] = { json: now, list }
      setCaptures(list)
    }
    void window.api.captures.list().then(take)
    // Captures only: a nugget or an article saved leaves this list as it is.
    // Read again with every other read the same change starts, and shown with them (`together`); while a row is carried,
    // once it is let go (a capture saved from quick capture mid-carry grew the list under the hand).
    return window.api.captures.onChange(() => together(window.api.captures.list(), (all) => whenLetGo(() => take(all))), ['capture'])
  }, [archived])
  return captures
}

/**
 * Where a capture came from, short: an imported note's folder ("c++", not
 * "Unisa/old-modules/…/c++/Header Files.md", and without a Notion export's
 * id), or the file its jottings came from. Nothing for a note at a vault's
 * top, whose name already says it, or one typed here.
 */
export function whereFrom(source: string, label = ''): string {
  const strip = (name: string): string => name.replace(/\.(md|html?|csv|json|txt)$/i, '').replace(/\s+[0-9a-f]{32}$/i, '')
  // A folder named for the note in it ("S3/S3.md") says nothing new: the one above it does.
  const folders = source.split('/').slice(0, -1).map(strip).filter((name) => name !== label)
  if (source.includes('/')) return folders.at(-1) ?? ''
  return strip(source) === label ? '' : strip(source)
}

/** How long ago, the way Linear writes it: 5m, 3h, 26d, 4mo, 2y. */
export { age }

/**
 * The colour of an age: the thesis made visible. Fresh is quiet; a month
 * untouched starts to warm, half a year is plainly rotting.
 */
export function ageTint(at: string, importedAt?: string | null): string | undefined {
  // An import is given thirty days before its age shows: its date is old, but it is new here.
  const days = Math.min(daysSince(at), importedAt ? daysSince(importedAt) - 30 : Infinity)
  return days < 30 ? undefined : days < 180 ? 'color-mix(in srgb, var(--tt-color-text-orange) 60%, var(--muted-foreground))' : 'var(--tt-color-text-orange)'
}

/**
 * A tag put on one capture or several, asked for by name, with an undo that
 * puts each back as it was: its words before the tag, and its privacy.
 */
export async function tagCaptures(ids: string[]): Promise<void> {
  const tag = (await ask(`Tag ${ids.length === 1 ? 'it' : `these ${ids.length}`} with`, 'thesis', { field: 'tag', action: ids.length === 1 ? 'Tag it' : `Tag ${num(ids.length)}` }))?.trim().replace(/^#/, '')
  if (!tag) return
  const before = (await Promise.all(ids.map((id) => window.api.captures.get(id)))).flatMap((one) => (one ? [one] : []))
  await haligtree.bulk(ids, { tag })
  chime('tag')
  void (ids.length === 1 ? quietly : (undo: () => void) => toast(`Tagged ${num(ids.length)} with #${tag}`, undo))(() => void Promise.all(before.map((one) => Promise.all([
    window.api.captures.save(one.id, { body: one.body, fetched: true }),
    !one.private ? haligtree.setPrivate('captures', one.id, false, true) : undefined
  ]))).then(() => chime('undo')))
}

/**
 * One way a capture can go: a menu's line (row-menu.tsx draws it, its icon from its words) that the details' island
 * draws as a row too, in the colour its exit has everywhere.
 */
export type Way = { id: string; label: string; hint?: string; keys?: string; tint?: string; danger?: boolean; run: () => void; /** The places inside it, opened beside the line in a menu. */ items?: RowItem[] }

/**
 * Where a capture can go: the ONE list its details' island (“Where it goes”), the chip over its open page, ⌘K and
 * its right-click menu draw from, so a way out has one name, one key and one way of happening wherever it is taken.
 * In the Inbox: what it can become first, then the ways to be done with it, the Bin last. Out of the Inbox: the way
 * back, and the Bin. `folders`: Writing's folders, offered beside “Move to Writing” where a menu can open them.
 */
export const captureWays = (capture: Pick<CaptureMeta, 'id' | 'kind' | 'status'>, { onBack, folders = [], merge }: {
  /** That way out undone: back on it. */ onBack?: (id: string) => void
  folders?: NoteGroup[]
  /** Opens the picker of the note to merge it into, where one is on the page. */ merge?: () => void
} = {}): Way[] => {
  const back = onBack && ((): void => onBack(capture.id))
  if (capture.status !== 'open') return [
    // A promoted capture stays out: what it became is where it lives now.
    ...(capture.status !== 'promoted' ? [{ id: 'back', label: 'Back to the Inbox', run: () => void window.api.captures.save(capture.id, { status: 'open' }).then(() => chime('undo')) }] : []),
    // Dealt with, it can still go to the Bin, and comes back from there as it was.
    ...(capture.status !== 'discarded' ? [{ id: 'discarded', label: 'Move to the Bin', tint: 'red', danger: true, run: () => void moveToBin([{ type: 'capture', id: capture.id, status: capture.status }]) }] : [])
  ]
  const way = (status: string, hint?: string): Way => {
    const one = EXITS.find((each) => each.status === status)!
    return { id: status, label: one.label, hint, keys: one.key.toUpperCase(), tint: one.tint, run: () => void exit(capture.id, status, back) }
  }
  // Writing's folders, named as a page's own “Move to folder” names them (items-view.tsx): by name, and two of one
  // name (a "Drafts" in "Notes" and one in "Essays") with the folders they sit in, "Notes / Drafts".
  const places = folders.filter(isFolder)
  const named = (one: NoteGroup): string => one.name.trim().toLowerCase()
  const pathOf = (one: NoteGroup): string => {
    if (places.filter((other) => named(other) === named(one)).length < 2) return one.name
    const path = [one.name]
    for (let up = places.find((other) => other.id === one.parent); up && path.length < 4; up = places.find((other) => other.id === up!.parent)) path.unshift(up.name)
    return path.join(' / ')
  }
  const writing = way('writing', 'It becomes a page, to write out')
  return [
    way('promoted', 'It can come back to you, and be tested'),
    places.length ? {
      ...writing,
      items: [
        { label: 'Writing', hint: 'In no folder', keys: writing.keys, icon: <FileText aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />, run: writing.run },
        'separator',
        ...places.map((one) => ({ id: `folder-${one.id}`, label: pathOf(one), icon: <GroupIcon icon={one.icon} color={one.color} className="size-3.5" />, run: () => void toWriting([capture.id], one.id, back) }))
      ]
    } : writing,
    { id: 'task', label: 'Make it a task', tint: 'orange', run: () => void makeTask({ capture: capture.id }, undefined, { onUndo: back }) },
    // A lookup that did not satisfy keeps being asked; anything else can be held as a question.
    capture.kind === 'word'
      ? { id: 'keep', label: 'Keep asking', hint: 'An open question, this its first clue', run: () => void keepAsking(capture.id) }
      : way('question', 'Its words become the first clue'),
    { id: 'clue', label: 'Add as a clue to a question…', run: () => void addToQuestion(capture.id) },
    way('resolved', 'Done with it, and out of the Inbox'),
    ...(merge ? [{ id: 'merge', label: 'Merge into another note…', run: merge }] : []),
    { ...way('discarded'), danger: true }
  ]
}

/** What a way out is called for several picked at once ("Move 3 to Writing"), by the exit's own name for one. */
const MANY: Record<string, (n: string) => string> = {
  promoted: (n) => `Save ${n} as gems`,
  writing: (n) => `Move ${n} to Writing`,
  question: (n) => `Start ${n} open questions`,
  resolved: (n) => `Resolve ${n}`
}

/**
 * The ways out for several captures picked at once, each with the key that takes it on the selection: the same lines
 * in the selection's right-click menu and in ⌘K, taken through `exitMany` as the keys take them.
 */
export const selectionWays = (ids: string[], after?: () => void): Way[] =>
  !ids.length ? [] : (['promoted', 'writing', 'question', 'resolved'] as const).map((status) => {
    const one = EXITS.find((each) => each.status === status)!
    // One capture among what is picked (the rest tasks): the exit by its own name.
    return { id: status, label: ids.length === 1 ? one.label : MANY[status](num(ids.length)), keys: one.key.toUpperCase(), tint: one.tint, run: () => void exitMany(ids, status).then((went) => went && after?.()) }
  })

/** A capture's right-click menu: the same on a row in the list and on a card. */
export const captureMenu = (capture: CaptureMeta, onPick?: (id: string) => void): RowItem[] => [
  { label: 'Open', run: () => onPick?.(capture.id), keys: '↵' },
  'separator',
  // Its ways out, from the one list every surface draws them from (`captureWays`). Resolve on its own line, the one
  // most taken; everything it can become together on one line beside it, so the menu stays short (each still has its
  // key: P, W, H). The Bin is the menu's last line, as on every card.
  ...((): RowItem[] => {
    const ways = captureWays(capture)
    const by = (id: string): Way[] => ways.filter((one) => one.id === id)
    return capture.status === 'open'
      ? [
          ...by('resolved').map(({ hint: _, ...one }) => one),
          ...by('keep'),
          { label: 'Turn it into', items: [
            ...['promoted', 'writing', 'question', 'task'].flatMap((id) => by(id)).map(({ hint: _, ...one }) => one),
            // A goal, with a day or none (Someday, for the life list): named from the capture's words, opened on Goals.
            { label: 'Make it a goal…', hint: 'With a day, or Someday with none', run: () => void startGoal((type, id) => window.api.openInHome(type, id), capture.label.split('\n')[0].slice(0, 120)) },
            ...by('clue').map((one) => ({ ...one, hint: 'Filed under a question you already have' })),
            'separator' as const,
            { label: 'Change kind…', run: () => void changeKind('captures', capture.id, capture.kind) }
          ] }
        ]
      : by('back')
  })(),
  capture.status !== 'discarded' && snoozeItems('capture', capture, () => onPick?.(capture.id)),
  'separator',
  // Out of the Inbox, into a place: Folders' one picker (lib/folders.ts).
  capture.status !== 'discarded' && { label: 'Keep in folder…', keys: '⇧⌘M', run: () => askFolder([{ type: 'capture', id: capture.id }]) },
  capture.status !== 'discarded' && moveToBookItem([{ table: 'captures', id: capture.id }], [{ type: 'capture', id: capture.id, status: capture.status }]),
  { label: 'Add a tag…', run: () => void tagCaptures([capture.id]) },
  { label: capture.pinnedAt ? 'Remove from Favorites' : 'Add to Favorites', run: () => pin('captures', capture.id, !capture.pinnedAt) },
  { label: capture.private ? 'Make it not private' : 'Make it private', run: () => void haligtree.setPrivate('captures', capture.id, !capture.private) },
  { label: 'Stick on the desktop', run: () => stickOnDesktop('capture', capture.id) },
  { label: 'Open in a new window', keys: '⌥⌘-click', run: () => openApart('capture', capture.id) },
  { label: 'Open in a small window', hint: 'Keeps writing there while quick capture stays free', run: () => openSmall('capture', capture.id) },
  // A Word is one word and its meaning: nothing to read through or queue up.
  // Its hint one line, as every menu line's: at "the notes it links to open in place" it ran to two in the submenu.
  capture.kind !== 'word' && { label: 'Read', hint: 'Read it through, its links open in place', run: () => openRead(capture.id) },
  ...openItems('capture', capture.id),
  capture.kind !== 'word' && queueMenu(capture.id),
  'separator',
  capture.status !== 'open' && { label: 'Change kind…', run: () => void changeKind('captures', capture.id, capture.kind) },
  { label: capture.archivedAt ? 'Unarchive' : 'Archive', hint: capture.archivedAt ? 'Back in sight' : 'Kept, out of sight', run: () => void archive('captures', [capture.id], !capture.archivedAt) },
  copyLinkItem(capture.id, capture.label),
  // Taking it elsewhere, together, so the menu stays short.
  { label: 'Export', items: [
    { label: 'Copy text', run: () => copy(capture.label) },
    { label: 'Save attachments…', hint: 'Its pictures and files, to a folder', run: () => void saveAttachments([{ table: 'captures', id: capture.id }]) },
    { label: 'Publish as a website…', hint: 'With the notes it links to, as web pages', run: () => void publishSite(capture.id) },
    ...pictureItems(`capture-${capture.id}`, capture.label),
    // A quote waiting in the Inbox can go out as a card too: its line, who said it and where.
    ...(capture.kind === 'quote' ? [cardItem({ body: () => window.api.captures.get(capture.id).then((one) => one?.body), title: capture.label, attribution: capture.attribution, medium: capture.medium })] : [])
  ] },
  // Housekeeping last, as on every card's menu.
  capture.status !== 'discarded' && 'separator',
  capture.status !== 'discarded' && binItem([{ type: 'capture', id: capture.id, status: capture.status }])
]

/** A capture as any list draws it: its kind, its words, when and where from, and its menu. */
export const captureEntry = (capture: CaptureMeta, onPick?: (id: string) => void): Entry => {
  const kind = CAPTURE_TYPES.find((type) => type.id === capture.kind) ?? CAPTURE_TYPES[0]
  const { text, tags } = splitTags(capture.label, capture.tagLine)
  return {
    id: capture.id,
    type: 'capture',
    title: text,
    tags,
    icon: kind.icon,
    tint: kind.tint,
    age: age(capture.capturedAt),
    // Only one still waiting goes stale: one that took its exit is done.
    // A word with its meaning is not waiting on anything: only one still asked warms with age.
    ageTint: capture.status === 'open' && capture.lookup !== 'answered' ? ageTint(capture.capturedAt, capture.importedAt) : undefined,
    // A dimmed one says why: which exit it took. One hidden until a day, or back from it today, says so.
    // A Word still waiting for its meaning says so on its meaning's own line (`head`), never twice.
    sub: [capture.snoozedUntil && capture.status !== 'discarded' && (capture.snoozedUntil > dayKey() ? `Hidden until ${whenInLine(capture.snoozedUntil)}` : capture.snoozedUntil === dayKey() && backSaid(capture)),
      capture.status !== 'open' && statusSaid(capture.status, capture.keptIn), capture.attribution, capture.kind === 'word' && capture.medium, whereFrom(capture.source, capture.label)].filter(Boolean).join(' · ') || undefined,
    marks: (
      <>
        {capture.pinnedAt && (
          <Tip label="In Favorites: in the sidebar, and in quick capture">
            <Pin className="size-3 shrink-0 text-muted-foreground" />
          </Tip>
        )}
        {capture.private ? (
          <Tip label="Private: never comes up unasked in quiet hours or safe mode">
            <EyeOff className="size-3 shrink-0 text-muted-foreground" />
          </Tip>
        ) : null}
      </>
    ),
    // No V-number on the row: it means nothing to a reader; Details keeps it for merging.
    // One that has taken an exit is dimmed, the way Linear dims what is read.
    dim: capture.status !== 'open',
    // A word's voice is the same on every Lookup: a dot that tells nothing, left off.
    voice: capture.kind === 'task' || capture.kind === 'todo' || capture.kind === 'word' ? undefined : voiceOf({ type: 'capture', kind: capture.kind, attribution: capture.attribution, medium: capture.medium, label: capture.label, location: fieldOf(capture.fields, 'location') }),
    private: !!capture.private,
    // A Lookup, as a dictionary sets it: the word, then its meaning (lib/headword.ts; the title itself is never changed).
    head: capture.kind === 'word' ? { ...headword(text, fieldOf(capture.fields, 'definition')), asked: capture.lookup === 'asked', where: capture.medium || undefined } : undefined,
    menu: captureMenu(capture, onPick)
  }
}

/**
 * Captures at any of Display's sizes, grouped as Display asks. `cursor` is
 * where the keyboard is, drawn apart from the one that is open.
 */
export function CaptureList({ groups, density = 'list', selected, cursor, onCursor, chosen = [], onPick, onOpen, picking, onMove, after, menu, entryOf, islands, columns, className }: {
  groups: [string, CaptureMeta[]][]
  /** Each kind its own island (islands.tsx). */
  islands?: Record<string, IslandState>
  density?: Density
  selected?: string
  cursor: number
  onCursor?: (index: number) => void
  chosen?: string[]
  onPick: (id: string) => void
  onOpen?: (id: string) => void
  /** ⌘-click, ⇧-click and a plain click, as Finder picks. */
  picking?: Picking
  /** In your own order: a row dragged onto another lands before or after it. */
  onMove?: (id: string, target: string, after: boolean) => void
  /** Drawn under a row: a thought being written under it. */
  after?: (entry: { id: string }) => ReactNode
  /** A row's right-click menu in place of the usual one: the list's own, when rows are picked. */
  menu?: (capture: CaptureMeta, usual: RowItem[]) => RowItem[]
  /** A row drawn its own way, where the list holds more than captures (a task in Everything). */
  entryOf?: (capture: CaptureMeta) => Entry | undefined
  /** Newspaper columns of one-line rows (note-list's `columns`). */
  columns?: boolean
  className?: string
}): React.JSX.Element {
  return (
    <NoteList
      groups={groups.map(([name, list]) => [name, list.map((one) => {
        const entry = entryOf?.(one) ?? captureEntry(one, onPick)
        return menu ? { ...entry, menu: menu(one, entry.menu ?? []) } : entry
      })])}
      density={density}
      table="captures"
      cursor={cursor}
      onCursor={onCursor}
      selected={selected}
      chosen={chosen}
      onPick={onPick}
      onOpen={onOpen}
      picking={picking}
      onMove={onMove}
      after={after}
      islands={islands}
      columns={columns}
      className={className}
    />
  )
}
