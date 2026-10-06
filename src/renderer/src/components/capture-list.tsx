import { useEffect, useState } from 'react'
import { chime } from '@/lib/sound'
import { EyeOff, Pin } from 'lucide-react'

import { CAPTURE_TYPES } from './capture-kinds/capture-kind-picker'
import { EXITS, captureKey, exit } from '@/lib/capture-links'
import { splitTags, vigil } from '@/lib/vigil'
import { makeTask } from '@/lib/tasks'
import { Tags, Tip, VirtualList, pin } from './vigil/ui'
import { RowMenu, copy, type MenuItem } from './vigil/row-menu'
import { stickOnDesktop } from './vigil/sticky-note'
import { Thumb } from './vigil/note-extras'
import { SortableList, SortableRow } from './vigil/sortable'
import { archive, changeKind, openWindow, saveAttachments } from '@/lib/notes'
import { addToQuestion } from './vigil/questions-view'
import { age, daysSince } from '../../../main/dates'

export type CaptureMeta = Awaited<ReturnType<typeof window.api.captures.list>>[number]

/**
 * Every capture, newest first, reloaded whenever any window writes. Archived
 * ones are out of sight unless asked for: `archived` gives every capture.
 */
export function useCaptures(archived = false): CaptureMeta[] {
  const [captures, setCaptures] = useState<CaptureMeta[]>([])
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
  { label: capture.pinnedAt ? 'Unpin' : 'Pin to the prompt', run: () => pin('captures', capture.id, !capture.pinnedAt) },
  { label: capture.private ? 'Not private' : 'Private', run: () => void vigil.setPrivate('captures', capture.id, !capture.private) },
  { label: 'Stick on the desktop', run: () => stickOnDesktop('capture', capture.id) },
  { label: 'Open in a new window', keys: '⌘-click', run: () => openWindow('capture', capture.id) },
  'separator',
  { label: 'Change kind…', run: () => void changeKind('captures', capture.id, capture.kind) },
  { label: capture.archivedAt ? 'Unarchive' : 'Archive', run: () => void archive('captures', [capture.id], !capture.archivedAt) },
  { label: 'Save its pictures and files…', run: () => void saveAttachments([{ table: 'captures', id: capture.id }]) },
  'separator',
  { label: `Copy ${captureKey(capture.number)}`, run: () => copy(captureKey(capture.number), `Copied ${captureKey(capture.number)}`) },
  { label: 'Copy text', run: () => copy(capture.label) }
]

/**
 * Two lines a capture: kind, title and age; then its handle and where it came
 * from. One that has taken an exit is dimmed, the way Linear dims what is read.
 * `cursor` is where the keyboard is, drawn as a ring rather than a fill, so it
 * reads apart from the one that is open.
 */
export function CaptureList({ captures, selected, cursor, chosen = [], onPick, onMove }: {
  captures: CaptureMeta[]
  selected?: string
  cursor?: number
  chosen?: string[]
  onPick?: (id: string) => void
  /** In your own order: a row dragged onto another lands before or after it. */
  onMove?: (id: string, target: string, after: boolean) => void
}): React.JSX.Element {
  return (
    <SortableList items={captures} keyOf={(capture) => capture.id} onMove={onMove}>
    {(captures) => (
    <VirtualList items={captures} keyOf={(capture) => capture.id} cursor={cursor} estimate={58} className="text-sm">
      {(capture, index) => {
        const kind = CAPTURE_TYPES.find((type) => type.id === capture.kind) ?? CAPTURE_TYPES[0]
        const { text, tags } = splitTags(capture.label)
        return (
          <SortableRow id={capture.id}>
          <RowMenu items={captureMenu(capture, onPick)}>
          <button
            data-cursor={index === cursor || undefined}
            type="button"
            // Rows flush, Linear's way: one plain highlight for the one open,
            // a fainter one under the keyboard, a tint for the picked. No
            // outlines and no gaps, so the list reads as a list, not cards.
            className={`group/row relative flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left transition-colors hover:bg-accent/50 ${capture.status === 'open' ? '' : 'opacity-50'} ${chosen.includes(capture.id) ? 'bg-[color-mix(in_srgb,var(--tt-brand-color-400)_14%,transparent)]' : capture.id === selected ? 'bg-accent' : index === cursor ? 'bg-accent/50' : ''}`}
            data-row
            data-id={capture.id}
            data-private={capture.private ? '' : undefined}
            data-open={capture.id === selected ? '' : undefined}
            // ⌘-click: a window of its own, as a browser opens a tab.
            onClick={(event) => (event.metaKey ? openWindow('capture', capture.id) : onPick?.(capture.id))}
          >
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="flex items-center gap-2">
              <kind.icon className="size-4 shrink-0" style={{ color: kind.tint }} />
              <span className="private-text flex-1 truncate">{text || 'Untitled'}</span>
              {capture.pinnedAt && <Pin className="size-3 shrink-0 text-muted-foreground" />}
              {capture.private ? (
                <Tip label="Private: never comes up unasked in quiet hours or safe mode">
                  <EyeOff className="size-3 shrink-0 text-muted-foreground" />
                </Tip>
              ) : null}
              {/* The MF number is for copying and linking, not reading: it shows
                  beside the age on the row under the pointer or the cursor, in
                  room the title gives up, so no row changes height. */}
              <span className={`shrink-0 text-xs text-muted-foreground tabular-nums ${index === cursor || capture.id === selected ? '' : 'hidden group-hover/row:inline'}`}>{captureKey(capture.number)}</span>
              <span className="shrink-0 text-xs text-muted-foreground tabular-nums" style={{ color: capture.status === 'open' ? ageTint(capture.capturedAt, capture.importedAt) : undefined }}>{age(capture.capturedAt)}</span>
            </span>
            {/* A second line only with something on it: an empty one held a gap open under every row. */}
            {(whereFrom(capture.source, capture.label) || tags.length > 0) && (
              <span className="truncate pl-6 text-xs text-muted-foreground">
                {whereFrom(capture.source, capture.label)}
                {tags.length ? <span className={whereFrom(capture.source, capture.label) ? 'ml-2' : ''}><Tags tags={tags} /></span> : null}
              </span>
            )}
            </span>
            <Thumb id={capture.id} />
          </button>
          </RowMenu>
          </SortableRow>
        )
      }}
    </VirtualList>
    )}
    </SortableList>
  )
}
