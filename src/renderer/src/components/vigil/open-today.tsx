import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { EASE, byKeys } from '@/lib/motion'
import { alive } from '@/components/ui/alive-icon'
import RightChevronIcon from '@/components/ui/right-chevron'
import XIcon from '@/components/ui/x-icon'
import { ArrowUpLeft } from 'lucide-react'

import { chime } from '@/lib/sound'
import { close, everOpened, forget, split, touch, useOpenToday, type OpenFor, type OpenNote } from '@/lib/open-today'
import { useLive, vigil, type Settings, type Task } from '@/lib/vigil'
import { taskMenu, useTaskNow, type TaskNow } from './tasks-view'
import { RowMenu, copy, type RowItem } from './row-menu'
import type { PaneName } from './split-pairs'
import { Rolling, Tip, ask, pin, refuse, toast, quietly } from './ui'
import { asideItem } from '@/lib/split'
import { openWindow } from '@/lib/notes'
import { exit, noteLinkText } from '@/lib/capture-links'
import { makeTask } from '@/lib/tasks'

const ChevronRight = alive(RightChevronIcon)
const X = alive(XIcon)

/** How many Open today shows before the rest wait behind "N more". */
const SHOWN = 8
/** How long the notes that moved overnight stay where you last saw them, so the move is seen. */
const HOLD_MS = 1200
const SEEN = 'sidebar:open-seen'

const keyOf = (one: { type: string; id: string }): string => `${one.type}:${one.id}`
const still = (): boolean => document.documentElement.dataset.motion === 'off' || matchMedia('(prefers-reduced-motion: reduce)').matches
const readSeen = (): string[] => {
  try {
    return JSON.parse(localStorage.getItem(SEEN) ?? '[]') as string[]
  } catch {
    return []
  }
}

/** The heading's words: what "today" means under the setting. */
export const TITLE: Record<OpenFor, string> = { day: 'Opened today', week: 'Opened this week', never: 'Opened' }
/** Where the notes go once they move down: the second heading. */
export const BEFORE = 'Opened before'
const LANDS: Record<OpenFor, string> = {
  day: `Each note you open is listed here, so you can get back to it. Tomorrow it moves down to “${BEFORE}”.`,
  week: `Each note you open is listed here, so you can get back to it. After a week it moves down to “${BEFORE}”.`,
  never: 'Each note you open is listed here, so you can get back to it, until you close it.'
}
/** Each heading's tip: what the list is, in a line. */
const ABOUT: Record<OpenFor, string> = {
  day: `The notes you opened today, to get back to them. Tomorrow they move down to “${BEFORE}”.`,
  week: `The notes you opened this week, to get back to them. After a week they move down to “${BEFORE}”.`,
  never: 'The notes you opened, to get back to them, until you close them.'
}
const ABOUT_BEFORE = 'Notes you opened before. Open one, or drag it up, to bring it back up.'

/** Pinned or a note's table, for pinning one from here. */
const tableOf = (type: string): 'captures' | 'nuggets' => (type === 'capture' ? 'captures' : 'nuggets')

/**
 * What a right click on a note in the sidebar offers, the same under Pinned,
 * Opened today and Opened before: open it (here, to the side, in a window),
 * what its kind can do next, pin it, copy a link, and the Bin. `place` adds
 * the list's own move.
 */
export function sideMenu(type: string, id: string, title: string, { onOpen, pinned, kind, status, place, openFor = 'day', task, now }: {
  onOpen: (type: string, id: string) => void
  /** A task: the menu it has on Today, with the sidebar's own moves after it. */
  task?: Task
  now?: TaskNow
  pinned: boolean
  /** A capture's kind and where it stands, for "Mark done" and "Make it a task". */
  kind?: string
  status?: string
  place?: 'open' | 'before'
  openFor?: OpenFor
}): RowItem[] {
  const capture = type === 'capture'
  const waiting = capture && (status ?? 'open') === 'open'
  if (type === 'task' && task)
    return [
      ...taskMenu(task, { open: () => onOpen(type, id), now }),
      'separator',
      place === 'open' && { label: `Move down to “${BEFORE}”`, run: () => moveDown(type, id, openFor) },
      place === 'before' && { label: `Move up to “${TITLE[openFor]}”`, run: () => (chime('unshelve'), touch(type, id, openFor)) },
      place && { label: 'Remove from the sidebar', run: () => (chime('away'), forget(type, id), toast(`Off the sidebar. Opening it again brings it back`, () => touch(type, id, openFor))) }
    ]
  return [
    { label: 'Open', run: () => onOpen(type, id) },
    asideItem(type, id),
    { label: 'Open in a new window', run: () => openWindow(type, id) },
    'separator',
    waiting && kind === 'todo' && { label: 'Mark it done', run: () => void exit(id, 'resolved') },
    waiting && kind !== 'todo' && { label: 'Make it a task', run: () => void makeTask({ capture: id }) },
    !capture && {
      label: 'Rename…',
      run: () => void ask('A new name', title, undefined, title).then((name) => {
        const next = name?.trim()
        if (!next || next === title) return
        void vigil.saveItem(id, { title: next }).then(() => (chime('noted'), quietly(() => void vigil.saveItem(id, { title }))))
      })
    },
    { label: 'Copy link', hint: 'Paste it into any note to link here', run: () => copy(noteLinkText(capture ? id : `${type}:${id}`, title), 'Copied a link: paste it into any note') },
    'separator',
    pinned
      ? { label: 'Unpin', run: () => pin(tableOf(type), id, false) }
      : { label: 'Pin to the sidebar', run: () => void pinFromSide(type, id) },
    place === 'open' && { label: `Move down to “${BEFORE}”`, run: () => moveDown(type, id, openFor) },
    place === 'before' && { label: `Move up to “${TITLE[openFor]}”`, run: () => (chime('unshelve'), touch(type, id, openFor)) },
    place && { label: 'Remove from the sidebar', run: () => (chime('away'), forget(type, id), toast(`Off the sidebar. Opening it again brings it back`, () => touch(type, id, openFor))) },
    'separator',
    capture
      ? waiting && { label: 'Move to the Bin', danger: true, run: () => void exit(id, 'discarded') }
      : { label: 'Move to the Bin', danger: true, run: () => void vigil.toBin(id).then(() => (chime('away'), toast('In the Bin', () => void vigil.restore(type, id)))) }
  ]
}

/** Done with a note for now: down to Opened before, said, with a way back up (that list starts folded, so the move is otherwise unseen). */
const moveDown = (type: string, id: string, openFor: OpenFor): void => {
  chime('shelve')
  close(type, id)
  quietly(() => touch(type, id, openFor))
}

/** Pin a note from the sidebar: three at most, as everywhere. Unpinned again, it is back under Open today. */
export async function pinFromSide(type: string, id: string): Promise<boolean> {
  const done = await vigil.pin(tableOf(type), id, true)
  if (!done) {
    refuse('Three notes are pinned already. Unpin one first')
    return false
  }
  // It leaves Open today by being shown under Pinned; in quiet hours, when an
  // untidied capture is not shown pinned, it stays here instead of vanishing.
  chime('pin')
  return true
}

/**
 * Opened today and Opened before, under Pinned in the sidebar: Arc's way of keeping
 * a sidebar tidy without being asked. A note you open lands under Open
 * today; overnight (or as Settings says) it moves down to Opened before on its own,
 * and opening it again, or dragging it back, brings it up. Pinned ones are
 * never here: Pinned never ages.
 */
export function OpenToday({ narrow, resolve, onOpen, pinned, about }: {
  narrow: boolean
  /** A note's name and look, or null for one that is gone (binned, archived, deleted). */
  resolve: (type: string, id: string) => PaneName | null
  onOpen: (type: string, id: string) => void
  /** The pinned notes, `type:id`, left out here. */
  pinned: string[]
  /** A capture's kind and where it stands, or a task as it is, for its menu. */
  about?: (type: string, id: string) => { kind?: string; status?: string; task?: Task }
}): React.JSX.Element | null {
  const settings = useLive(vigil.settings, null as Settings | null)
  const taskNow = useTaskNow()
  const openFor: OpenFor = settings?.sidebarOpenFor ?? 'day'
  const { list, now } = useOpenToday()
  const [more, setMore] = useState(false)
  const [earlierOpen, setEarlierOpenState] = useState(() => {
    try {
      return localStorage.getItem('sidebar:earlier') === 'open'
    } catch {
      return false
    }
  })
  const setEarlierOpen = (open: boolean): void => {
    chime(open ? 'slide' : 'fold')
    setEarlierOpenState(open)
    try {
      localStorage.setItem('sidebar:earlier', open ? 'open' : 'shut')
    } catch {
      // Open for now.
    }
  }
  const live = list.filter((one) => !pinned.includes(keyOf(one)) && resolve(one.type, one.id))
  const parts = split(live, openFor, now)
  // The notes' names are read in a moment after the window opens: until then, nothing is judged moved.
  const ready = !list.length || live.length > 0

  // The overnight move, seen: notes that were under Open today when you last
  // looked, and have moved on their own since, stay a moment, then slide down.
  const [held, setHeld] = useState<string[]>([])
  const heldFor = useRef<string>('')
  useEffect(() => {
    if (document.hidden || !ready) return
    const seen = readSeen()
    const moved = parts.earlier.filter((one) => !one.closed && seen.includes(keyOf(one))).map(keyOf)
    const sign = moved.join(' ')
    if (moved.length && !still() && sign !== heldFor.current) {
      heldFor.current = sign
      setHeld(moved)
      const timer = setTimeout(() => setHeld([]), HOLD_MS)
      return () => clearTimeout(timer)
    }
    return undefined
  }, [now, ready]) // eslint-disable-line react-hooks/exhaustive-deps
  // What Open today shows now, remembered for the next look.
  useEffect(() => {
    if (document.hidden || !ready || held.length) return
    try {
      localStorage.setItem(SEEN, JSON.stringify(parts.open.map(keyOf)))
    } catch {
      // The move is simply there next time.
    }
  })

  const showing = [...parts.open, ...parts.earlier.filter((one) => held.includes(keyOf(one)))]
  const earlier = parts.earlier.filter((one) => !held.includes(keyOf(one)))
  const visible = more ? showing : showing.slice(0, SHOWN)

  const row = (one: OpenNote, where: 'open' | 'earlier'): React.JSX.Element | null => {
    const name = resolve(one.type, one.id)
    if (!name) return null
    const Icon = name.icon
    const items = sideMenu(one.type, one.id, name.title, { onOpen, pinned: false, ...about?.(one.type, one.id), now: taskNow, place: where === 'open' ? 'open' : 'before', openFor })
    return (
      <motion.div key={keyOf(one)} layout="position" data-open-row={where}
        // Opened or closed by a key (⌘K, ⌘W), the row is simply there or gone;
        // by the pointer it grows in, and leaves quicker than it came.
        initial={byKeys() ? false : { opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
        variants={{ gone: () => (byKeys() ? { opacity: 0, height: 0, transition: { duration: 0 } } : { opacity: 0, height: 0, y: where === 'open' ? 6 : 0, transition: { duration: 0.15, ease: EASE } }) }}
        exit="gone"
        transition={{ duration: 0.22, ease: EASE }} className="overflow-hidden">
        <RowMenu items={items}>
          <span className="group/open relative flex min-w-0">
            <Tip label={narrow ? name.title || 'Untitled' : ''}>
              <button
                type="button"
                data-side-row
                data-private={name.private ? '' : undefined}
                data-drag-open={keyOf(one)}
                onClick={() => (chime('tap'), onOpen(one.type, one.id))}
                className={`flex min-w-0 flex-1 items-center gap-2.5 rounded-md py-1.5 ${where === 'earlier' ? 'text-foreground/70' : 'text-foreground/80'} ${narrow ? 'justify-center px-0' : 'pr-7 pl-2'}`}
              >
                <Icon className="size-4 shrink-0" style={name.tint ? { color: name.tint } : undefined} />
                {!narrow && <span className="private-text min-w-0 flex-1 truncate text-left">{name.title || 'Untitled'}</span>}
              </button>
            </Tip>
            {!narrow && (
              <Tip label={where === 'open' ? `Done with it for now: it moves down to “${BEFORE}”` : `Move it back up to “${TITLE[openFor]}”`}>
                <button type="button" data-no-split
                  onClick={() => (where === 'open' ? moveDown(one.type, one.id, openFor) : (chime('unshelve'), touch(one.type, one.id, openFor)))}
                  className="after:absolute after:-inset-0.5 after:rounded-full absolute top-1/2 right-1 z-10 grid size-5 -translate-y-1/2 place-items-center rounded text-muted-foreground opacity-0 transition-opacity group-hover/open:opacity-100 hover:bg-accent hover:text-foreground focus-visible:opacity-100">
                  {where === 'open' ? <X className="size-3" /> : <ArrowUpLeft className="size-3" />}
                </button>
              </Tip>
            )}
          </span>
        </RowMenu>
      </motion.div>
    )
  }

  const heading = (label: string, tip: string, extra?: React.ReactNode, fold?: { open: boolean; set: (open: boolean) => void }): React.JSX.Element => (
    narrow ? <div className="mt-3" /> : fold ? (
      <Tip label={tip}>
        <button type="button" data-side-row aria-expanded={fold.open} onClick={() => fold.set(!fold.open)}
          className="mt-3 mb-0.5 flex items-center gap-1 rounded-md px-2 py-0.5 text-left text-meta text-muted-foreground transition-colors duration-80 hover:text-foreground data-[fluid-hover-active]:text-foreground">
          {label}{extra}
          <ChevronRight className={`size-3 transition-transform duration-80 ${fold.open ? 'rotate-90' : ''}`} />
        </button>
      </Tip>
    ) : (
      <Tip label={tip}>
        <div data-open-heading className="mt-3 mb-0.5 flex w-fit items-center gap-1 px-2 py-0.5 text-meta text-muted-foreground">{label}{extra}</div>
      </Tip>
    )
  )

  return (
    <>
      {/* Open today: a place to drop onto as well, to bring a note back up. */}
      <div data-side-drop="open" data-open-today className="rounded-md transition-colors data-[queue-hot]:bg-[color-mix(in_oklab,var(--primary)_12%,transparent)] data-[queue-hot]:ring-1 data-[queue-hot]:ring-[color-mix(in_oklab,var(--primary)_40%,transparent)]">
        {heading(TITLE[openFor], ABOUT[openFor])}
        <AnimatePresence initial={false}>
          {visible.map((one) => row(one, 'open'))}
        </AnimatePresence>
        {!narrow && showing.length > SHOWN && (
          <button type="button" data-side-row onClick={() => (chime(more ? 'fold' : 'slide'), setMore(!more))}
            className="flex w-full items-center rounded-md px-2 py-1 text-left text-control text-muted-foreground hover:text-foreground">
            {more ? 'Fewer' : `${showing.length - SHOWN} more`}
          </button>
        )}
        {/* Only once the names are read: never "Nothing opened" while they load. */}
        {!narrow && ready && !showing.length && (
          <p data-open-empty className="px-2 pt-0.5 pb-1 text-control text-muted-foreground">
            {!everOpened() ? LANDS[openFor] : !earlier.length ? 'Nothing opened yet.' : earlier.some((one) => !one.closed) && openFor === 'day' ? `Nothing opened yet today. Yesterday’s notes are under “${BEFORE}”.` : `Nothing opened yet. The rest are under “${BEFORE}”.`}
          </p>
        )}
      </div>
      {/* Opened before: what moved down on its own, a click or a drag from coming back. */}
      {!narrow && earlier.length > 0 && (<>
        {heading(BEFORE, ABOUT_BEFORE, <Rolling text={earlier.length} className="ml-1 tabular-nums" />, { open: earlierOpen, set: setEarlierOpen })}
        <AnimatePresence initial={false}>
          {earlierOpen && earlier.map((one) => row(one, 'earlier'))}
        </AnimatePresence>
      </>)}
    </>
  )
}
