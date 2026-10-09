import { useEffect, useState, type ReactNode } from 'react'
import { chime } from '@/lib/sound'
import { alive } from '@/components/ui/alive-icon'
import EyeOffIcon from '@/components/ui/eye-off-icon'
import BookmarkIcon from '@/components/ui/bookmark-icon'

import { CAPTURE_TYPES } from './capture-kinds/capture-kind-picker'
import { EXITS, captureKey, exit } from '@/lib/capture-links'
import { splitTags, unread, vigil } from '@/lib/vigil'
import { makeTask } from '@/lib/tasks'
import { Tip, pin } from './vigil/ui'
import { copy, type MenuItem } from './vigil/row-menu'
import { stickOnDesktop } from './vigil/sticky-note'
import { NoteList, type Entry } from './vigil/note-list'
import type { Density } from './vigil/display'
import { archive, changeKind, openWindow, saveAttachments } from '@/lib/notes'
import { copyToBookItem } from '@/lib/books'
import { addToQuestion } from './vigil/questions-view'
import { age, daysSince } from '../../../main/dates'

// itshover drawings in lucide's place, moving when their control is pointed at.
const EyeOff = alive(EyeOffIcon)
const Pin = alive(BookmarkIcon)

export type CaptureMeta = Awaited<ReturnType<typeof window.api.captures.list>>[number]

/**
 * Every capture, newest first, reloaded whenever any window writes. Archived
 * ones are out of sight unless asked for: `archived` gives every capture.
 */
export function useCaptures(archived = false): CaptureMeta[] {
  const [captures, setCaptures] = useState<CaptureMeta[]>(() => unread([]))
  useEffect(() => {
    // The same list as last time (typing past a note's first line) keeps the
    // old one, so the lists holding it do not redraw on every pause.
    let last: string | undefined
    let held: CaptureMeta[] | undefined
    const reload = (): void => void window.api.captures.list().then((all) => {
      // The very list held already: the main process said nothing changed.
      if (all === held) return
      held = all
      const now = JSON.stringify(all)
      if (now === last) return
      last = now
      setCaptures(archived ? [...all] : all.filter((one) => !one.archivedAt))
    })
    reload()
    // Captures only: a nugget or an article saved leaves this list as it is.
    return window.api.captures.onChange(reload, ['capture'])
  }, [archived])
  return captures
}

/** How long ago, the way Linear writes it: 5m, 3h, 26d, 4mo, 2y. */
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

/** A capture's right-click menu: the same on a row in the list and on a card. */
export const captureMenu = (capture: CaptureMeta, onPick?: (id: string) => void): MenuItem[] => [
  { label: 'Open', run: () => onPick?.(capture.id), keys: '↵' },
  'separator',
  ...(capture.status === 'open'
    ? EXITS.map((one) => ({ label: one.label, keys: one.key.toUpperCase(), danger: one.status === 'discarded', run: () => void exit(capture.id, one.status) }))
    : [{ label: 'Back to the inbox', run: () => void window.api.captures.save(capture.id, { status: 'open' }).then(() => chime('undo')) }]),
  capture.status === 'open' && { label: 'Make it a task', run: () => void makeTask({ capture: capture.id }) },
  capture.status === 'open' && { label: 'Add to a question…', run: () => void addToQuestion(capture.id) },
  'separator',
  { label: capture.pinnedAt ? 'Unpin' : 'Pin to the box', run: () => pin('captures', capture.id, !capture.pinnedAt) },
  { label: capture.private ? 'Not private' : 'Private', run: () => void vigil.setPrivate('captures', capture.id, !capture.private) },
  { label: 'Stick on the desktop', run: () => stickOnDesktop('capture', capture.id) },
  { label: 'Open in a new window', keys: '⌘-click', run: () => openWindow('capture', capture.id) },
  'separator',
  { label: 'Change kind…', run: () => void changeKind('captures', capture.id, capture.kind) },
  { label: capture.archivedAt ? 'Unarchive' : 'Archive', run: () => void archive('captures', [capture.id], !capture.archivedAt) },
  { label: 'Save its pictures and files…', run: () => void saveAttachments([{ table: 'captures', id: capture.id }]) },
  copyToBookItem([{ table: 'captures', id: capture.id }]),
  'separator',
  { label: `Copy ${captureKey(capture.number)}`, run: () => copy(captureKey(capture.number), `Copied ${captureKey(capture.number)}`) },
  { label: 'Copy text', run: () => copy(capture.label) }
]

/** A capture as any list draws it: its kind, its words, when and where from, and its menu. */
export const captureEntry = (capture: CaptureMeta, onPick?: (id: string) => void): Entry => {
  const kind = CAPTURE_TYPES.find((type) => type.id === capture.kind) ?? CAPTURE_TYPES[0]
  const { text, tags } = splitTags(capture.label)
  return {
    id: capture.id,
    type: 'capture',
    title: text,
    tags,
    icon: kind.icon,
    tint: kind.tint,
    age: age(capture.capturedAt),
    // Only one still waiting goes stale: one that took its exit is done.
    ageTint: capture.status === 'open' ? ageTint(capture.capturedAt, capture.importedAt) : undefined,
    sub: [capture.attribution, whereFrom(capture.source, capture.label)].filter(Boolean).join(' · ') || undefined,
    marks: (
      <>
        {capture.pinnedAt && <Pin className="size-3 shrink-0 text-muted-foreground" />}
        {capture.private ? (
          <Tip label="Private: never comes up unasked in quiet hours or safe mode">
            <EyeOff className="size-3 shrink-0 text-muted-foreground" />
          </Tip>
        ) : null}
      </>
    ),
    hint: captureKey(capture.number),
    // One that has taken an exit is dimmed, the way Linear dims what is read.
    dim: capture.status !== 'open',
    private: !!capture.private,
    menu: captureMenu(capture, onPick)
  }
}

/**
 * Captures at any of Display's sizes, grouped as Display asks. `cursor` is
 * where the keyboard is, drawn apart from the one that is open.
 */
export function CaptureList({ groups, density = 'list', selected, cursor, onCursor, chosen = [], onPick, onOpen, onChoose, onMove, after, className }: {
  groups: [string, CaptureMeta[]][]
  density?: Density
  selected?: string
  cursor: number
  onCursor?: (index: number) => void
  chosen?: string[]
  onPick: (id: string) => void
  onOpen?: (id: string) => void
  onChoose?: (id: string) => void
  /** In your own order: a row dragged onto another lands before or after it. */
  onMove?: (id: string, target: string, after: boolean) => void
  /** Drawn under a row: a thought being written under it. */
  after?: (entry: { id: string }) => ReactNode
  className?: string
}): React.JSX.Element {
  return (
    <NoteList
      groups={groups.map(([name, list]) => [name, list.map((one) => captureEntry(one, onPick))])}
      density={density}
      table="captures"
      cursor={cursor}
      onCursor={onCursor}
      selected={selected}
      chosen={chosen}
      onPick={onPick}
      onOpen={onOpen}
      onChoose={onChoose}
      onMove={onMove}
      after={after}
      className={className}
    />
  )
}
