import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { alive } from '@/components/ui/alive-icon'
import RightChevronIcon from '@/components/ui/right-chevron'
import XIcon from '@/components/ui/x-icon'
import { ArrowUpLeft } from 'lucide-react'

import { chime } from '@/lib/sound'
import { close, everOpened, forget, split, touch, useOpenToday, type OpenFor, type OpenNote } from '@/lib/open-today'
import { useLive, vigil, type Settings } from '@/lib/vigil'
import { RowMenu } from './row-menu'
import type { PaneName } from './split-pairs'
import { Rolling, Tip, refuse } from './ui'

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
const TITLE: Record<OpenFor, string> = { day: 'Open today', week: 'Open this week', never: 'Open' }
const LANDS: Record<OpenFor, string> = {
  day: 'Notes you open land here. Overnight they move to Earlier.',
  week: 'Notes you open land here. After a week they move to Earlier.',
  never: 'Notes you open land here, until you close them.'
}

/** Pinned or a note's table, for pinning one from here. */
const tableOf = (type: string): 'captures' | 'nuggets' => (type === 'capture' ? 'captures' : 'nuggets')

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
 * Open today and Earlier, under Pinned in the sidebar: Arc's way of keeping
 * a sidebar tidy without being asked. A note you open lands under Open
 * today; overnight (or as Settings says) it moves down to Earlier on its own,
 * and opening it again, or dragging it back, brings it up. Pinned ones are
 * never here: Pinned never ages.
 */
export function OpenToday({ narrow, resolve, onOpen, pinned }: {
  narrow: boolean
  /** A note's name and look, or null for one that is gone (binned, archived, deleted). */
  resolve: (type: string, id: string) => PaneName | null
  onOpen: (type: string, id: string) => void
  /** The pinned notes, `type:id`, left out here. */
  pinned: string[]
}): React.JSX.Element | null {
  const settings = useLive(vigil.settings, null as Settings | null)
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
    const items = [
      { label: 'Open', run: () => onOpen(one.type, one.id) },
      'separator' as const,
      { label: 'Pin', run: () => void pinFromSide(one.type, one.id) },
      where === 'open'
        ? { label: 'Move to Earlier', run: () => (chime('shelve'), close(one.type, one.id)) }
        : { label: `Back to ${TITLE[openFor]}`, run: () => (chime('unshelve'), touch(one.type, one.id, openFor)) },
      'separator' as const,
      { label: 'Take off the sidebar', run: () => (chime('away'), forget(one.type, one.id)) }
    ]
    return (
      <motion.div key={keyOf(one)} layout="position" data-open-row={where}
        initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
        exit={{ opacity: 0, height: 0, y: where === 'open' ? 10 : 0, transition: { duration: 0.26, ease: [0.4, 0, 0.2, 1] } }}
        transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }} className="overflow-hidden">
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
              <Tip label={where === 'open' ? 'Move to Earlier' : `Back to ${TITLE[openFor]}`}>
                <button type="button" data-no-split
                  onClick={() => (where === 'open' ? (chime('shelve'), close(one.type, one.id)) : (chime('unshelve'), touch(one.type, one.id, openFor)))}
                  className="absolute top-1/2 right-1 z-10 grid size-5 -translate-y-1/2 place-items-center rounded text-muted-foreground opacity-0 transition-opacity group-hover/open:opacity-100 hover:bg-accent hover:text-foreground focus-visible:opacity-100">
                  {where === 'open' ? <X className="size-3" /> : <ArrowUpLeft className="size-3" />}
                </button>
              </Tip>
            )}
          </span>
        </RowMenu>
      </motion.div>
    )
  }

  const heading = (label: string, extra?: React.ReactNode, fold?: { open: boolean; set: (open: boolean) => void }): React.JSX.Element => (
    narrow ? <div className="mt-3" /> : fold ? (
      <button type="button" data-side-row aria-expanded={fold.open} onClick={() => fold.set(!fold.open)}
        className="mt-3 mb-0.5 flex items-center gap-1 rounded-md px-2 py-0.5 text-left text-meta text-muted-foreground transition-colors duration-80 hover:text-foreground data-[fluid-hover-active]:text-foreground">
        {label}{extra}
        <ChevronRight className={`size-3 transition-transform duration-80 ${fold.open ? 'rotate-90' : ''}`} />
      </button>
    ) : (
      <div className="mt-3 mb-0.5 flex items-center gap-1 px-2 py-0.5 text-meta text-muted-foreground">{label}{extra}</div>
    )
  )

  return (
    <>
      {/* Open today: a place to drop onto as well, to bring a note back up. */}
      <div data-side-drop="open" data-open-today className="rounded-md transition-colors data-[queue-hot]:bg-[color-mix(in_oklab,var(--primary)_12%,transparent)] data-[queue-hot]:ring-1 data-[queue-hot]:ring-[color-mix(in_oklab,var(--primary)_40%,transparent)]">
        {heading(TITLE[openFor])}
        <AnimatePresence initial={false}>
          {visible.map((one) => row(one, 'open'))}
        </AnimatePresence>
        {!narrow && showing.length > SHOWN && (
          <button type="button" data-side-row onClick={() => (chime(more ? 'fold' : 'slide'), setMore(!more))}
            className="flex w-full items-center rounded-md px-2 py-1 text-left text-control text-muted-foreground hover:text-foreground">
            {more ? 'Fewer' : `${showing.length - SHOWN} more`}
          </button>
        )}
        {!narrow && !showing.length && (
          <p data-open-empty className="px-2 pt-0.5 pb-1 text-control text-muted-foreground">
            {!everOpened() ? LANDS[openFor] : !earlier.length ? 'Nothing open yet.' : earlier.some((one) => !one.closed) && openFor === 'day' ? 'Nothing open yet. Yesterday’s notes are under Earlier.' : 'Nothing open yet. The rest are under Earlier.'}
          </p>
        )}
      </div>
      {/* Earlier: what moved down on its own, a click or a drag from coming back. */}
      {!narrow && earlier.length > 0 && (<>
        {heading('Earlier', <Rolling text={earlier.length} className="ml-1 tabular-nums" />, { open: earlierOpen, set: setEarlierOpen })}
        <AnimatePresence initial={false}>
          {earlierOpen && earlier.map((one) => row(one, 'earlier'))}
        </AnimatePresence>
      </>)}
    </>
  )
}
