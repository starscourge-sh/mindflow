import { useEffect, useRef, useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { BellRing, CalendarDays, Check, Mic, Play } from 'lucide-react'
import { EASE } from '@/lib/motion'
import { chime } from '@/lib/sound'
import { calendar } from '@/lib/mac-calendar'
import { haligtree, type Settings } from '@/lib/haligtree'
import { Button } from '@/components/ui/button'
import { DEMOS, DemoLive } from './power-demos'
import { APP_NAME } from '../../../../main/name'

/**
 * The right-hand side of the welcome's own steps (welcome.tsx, Split), shown
 * rather than told: the tiles of Out of the box, each a real feature's small
 * demo (power-demos.tsx, the Powers page's own); the Permissions list, each
 * asked for in place with its state read live; and the Plan's placeholder.
 */

/**
 * What it does with nothing set up, one tile each, in the order a first day meets them: catch, read, see it again,
 * remember, find, look back. `ms` is one run of its demo (the sum of its steps), so the next starts as it ends.
 */
const TILES: { id: string; name: string; line: string; ms: number }[] = [
  { id: 'taskwords', name: 'Quick capture', line: 'Words become a task, its day and time read from them.', ms: 6600 },
  { id: 'pdfcard', name: 'Reading', line: 'Words picked in a PDF become a card for Review.', ms: 5300 },
  { id: 'feed', name: 'The Feed', line: 'The day’s own things come back as posts, until you are caught up.', ms: 5600 },
  { id: 'review', name: 'Review', line: 'A gem asks its question as you start to forget it.', ms: 4600 },
  { id: 'lookitup', name: '⌘K', line: 'Find a note, or look the words up.', ms: 5300 },
  { id: 'wrapped', name: 'Wrapped', line: 'Your month and year, played back like a story.', ms: 4900 }
]

/**
 * The tiles, playing in turn: the one playing is ringed in gold with a line filling along its foot for as long as
 * its demo runs, then the next one plays, scrolled to if it is out of sight. A click plays a tile from its start.
 * The first waits for the step's words to be read; until then, and still (Motion off, Reduce motion), none plays and
 * each holds its last step, which shows what it gives you.
 */
export function Tiles({ still, wait }: { still: boolean; /** How long the step's words are read before the first tile plays: nothing moves while they are. */ wait: number }): React.JSX.Element {
  const [on, setOn] = useState(-1)
  useEffect(() => {
    if (still) return
    const timer = setTimeout(() => setOn(0), wait)
    return () => clearTimeout(timer)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  // Each start of a tile counted, so a click on the one playing plays it again from its start.
  const [round, setRound] = useState(0)
  // The round each tile last started on: its demo is drawn afresh only as it starts, so one that stops settles in place, gliding to its last step.
  const started = useRef<Record<number, number>>({})
  const grid = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (on < 0) return
    // Still, a tile plays only when clicked, and only once.
    const timer = setTimeout(() => (setOn(still ? -1 : (on + 1) % TILES.length), setRound((n) => n + 1)), TILES[on].ms)
    // Out of sight in a short window: brought into view, gliding (at once with Reduce motion).
    grid.current?.querySelector<HTMLElement>(`[data-tile="${TILES[on].id}"]`)?.scrollIntoView({ block: 'nearest', behavior: still ? 'auto' : 'smooth' })
    return () => clearTimeout(timer)
  }, [on, round, still])
  return (
    <div ref={grid} data-tiles className="mf-more grid max-h-full w-full grid-cols-[repeat(auto-fill,minmax(15.5rem,1fr))] gap-3 overflow-y-auto overscroll-contain p-1">
      {TILES.map((tile, i) => {
        const Demo = DEMOS[tile.id]
        const live = i === on
        if (live) started.current[i] = round
        return (
          <button key={tile.id} type="button" data-tile={tile.id} data-playing={live || undefined} aria-label={`${tile.name}: ${tile.line}${live ? ' Playing.' : ' Play it.'}`}
            // A click leaves the keys where they were: ↵ after it still means Continue, not this tile again.
            onMouseDown={(event) => event.preventDefault()} onClick={() => (chime('tap'), setOn(i), setRound((n) => n + 1))}
            className={`group relative flex flex-col overflow-hidden rounded-lg border bg-popover text-left text-popover-foreground shadow-[0_1px_2px_color-mix(in_oklab,var(--mf-shadow-ink)_10%,transparent)] transition-[border-color,box-shadow] duration-300 ease-(--mf-ease) hover:shadow-(--mf-panel-shadow) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${live ? 'border-[color-mix(in_oklab,var(--primary)_55%,transparent)]' : 'border-foreground/10 hover:border-foreground/20'}`}>
            {/* The demo's stage: the size every demo is drawn for, so none moves the tile as it plays. */}
            {/* Played again from its start: the run under way fades out as the new one fades in, in the same place, never a cut. */}
            <span aria-hidden className="pointer-events-none grid h-[9.5rem] place-items-center overflow-hidden bg-[color-mix(in_oklab,var(--foreground)_3%,var(--popover))] px-3">
              <AnimatePresence initial={false}>
                <motion.span key={started.current[i] ?? -1} className="flex w-full justify-center [grid-area:1/1]"
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25, ease: EASE }}>
                  <DemoLive.Provider value={live}>{Demo && <Demo live={live} />}</DemoLive.Provider>
                </motion.span>
              </AnimatePresence>
            </span>
            <span className="flex items-start gap-2 px-3 pt-2.5 pb-3">
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="text-[0.9375rem] leading-snug font-semibold text-foreground">{tile.name}</span>
                <span className="text-[0.875rem] leading-snug text-(--mf-wl-body)">{tile.line}</span>
              </span>
              {/* Play, on a tile waiting its turn; gone while it plays, the line along its foot saying so instead. */}
              <motion.span aria-hidden className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-foreground/[0.06] text-muted-foreground group-hover:text-foreground"
                initial={false} animate={{ opacity: live ? 0 : 1, scale: live ? 0.8 : 1 }} transition={{ duration: 0.2, ease: EASE }}>
                <Play className="size-3 translate-x-px" fill="currentColor" />
              </motion.span>
            </span>
            <AnimatePresence>
              {live && (
                <motion.span key={round} aria-hidden data-tile-progress className="absolute inset-x-0 bottom-0 h-[2px] origin-left bg-primary"
                  initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} exit={{ opacity: 0, transition: { duration: 0.2 } }} transition={{ duration: tile.ms / 1000, ease: 'linear' }} />
              )}
            </AnimatePresence>
          </button>
        )
      })}
    </div>
  )
}

/** Where a permission stands: read from macOS (or the setting it serves), asked for in place, refused. */
type Stand = 'reading' | 'unasked' | 'asking' | 'granted' | 'denied' | 'off'
type Row = { id: 'calendar' | 'mic' | 'alerts'; icon: typeof Mic; name: string; line: string }
const ROWS: Row[] = [
  { id: 'calendar', icon: CalendarDays, name: 'Your Mac’s calendar', line: 'Today’s events in Today’s report and the week. Read only: nothing is changed or sent.' },
  { id: 'mic', icon: Mic, name: 'Microphone', line: 'For voice notes, and for recording a call or a lecture.' },
  { id: 'alerts', icon: BellRing, name: 'Alerts at a task’s time', line: 'A notification when a task is due. macOS asks with the first one, sent now.' }
]
const SPAN = (): [string, string] => [new Date().toISOString(), new Date(Date.now() + 86400000).toISOString()]

/** Each one's state, read now and again whenever the window comes back (from System Settings, say). */
function useStands(): [Record<Row['id'], Stand>, (id: Row['id'], to: Stand) => void] {
  const [stands, setStands] = useState<Record<Row['id'], Stand>>({ calendar: 'reading', mic: 'reading', alerts: 'reading' })
  const set = (id: Row['id'], to: Stand): void => setStands((now) => ({ ...now, [id]: to }))
  useEffect(() => {
    let live = true
    const read = (): void => {
      void Promise.all([haligtree.settings(), calendar.events(...SPAN()).catch(() => null), window.api.haligtree<'granted' | 'unasked' | 'denied'>('mic:status').catch(() => null)]).then(([settings, said, mic]) => {
        if (!live) return
        // The calendar counts as given only when macOS allows it AND the setting that reads it is on.
        const cal: Stand = !said || said.status === 'none' ? 'off' : said.status === 'denied' ? 'denied' : said.status === 'on' && settings.macCalendar ? 'granted' : 'unasked'
        setStands((now) => ({
          calendar: now.calendar === 'asking' ? 'asking' : cal,
          mic: now.mic === 'asking' ? 'asking' : mic === 'granted' ? 'granted' : mic === 'denied' ? 'denied' : mic ? 'unasked' : 'off',
          alerts: settings.notify === 'alerts' ? 'granted' : 'unasked'
        }))
      })
    }
    read()
    window.addEventListener('focus', read)
    return () => ((live = false), window.removeEventListener('focus', read))
  }, [])
  return [stands, set]
}

/** What macOS must allow, a row each: its name, what it is for, and its one control, the state it is in said beside it. */
export function Grants(): React.JSX.Element {
  const [stands, set] = useStands()
  const answered = (id: Row['id'], yes: boolean): void => (set(id, yes ? 'granted' : 'denied'), chime(yes ? 'on' : 'nope'))
  const ask = (id: Row['id']): void => {
    set(id, 'asking')
    if (id === 'calendar') {
      // As Settings' own switch does: on, then macOS asks once.
      void haligtree.setSettings({ macCalendar: true }).then(() => calendar.ask(...SPAN())).then((said) => answered(id, said.status === 'on'), () => answered(id, false))
    } else if (id === 'mic') {
      void window.api.haligtree<boolean>('mic:ask').then((yes) => answered(id, yes), () => answered(id, false))
    } else {
      void haligtree.setSettings({ notify: 'alerts' as Settings['notify'] }).then(() => window.api.haligtree('notify:sample')).then(() => answered(id, true), () => answered(id, false))
    }
  }
  const privacy = (id: Row['id']): void => (chime('open'), void window.api.haligtree(id === 'calendar' ? 'calendar:privacy' : 'mic:privacy'))
  return (
    <div data-grants className="flex w-full max-w-[40rem] flex-col rounded-xl border border-foreground/10 bg-popover p-1.5 text-popover-foreground shadow-(--mf-panel-shadow)">
      {ROWS.filter((row) => stands[row.id] !== 'off').map((row) => {
        const Icon = row.icon
        const stand = stands[row.id]
        return (
          <div key={row.id} data-grant={row.id} data-state={stand} className="flex items-center gap-3 rounded-lg px-3 py-3 [&+&]:border-t [&+&]:border-foreground/[0.07]">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[color-mix(in_oklab,var(--primary)_14%,transparent)] text-[color-mix(in_oklab,var(--primary)_85%,var(--foreground))]"><Icon className="size-[1.125rem]" strokeWidth={1.9} /></span>
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="text-[0.9375rem] leading-snug font-semibold text-foreground">{row.name}</span>
              <span className="text-[0.875rem] leading-snug text-(--mf-wl-body)">{row.line}</span>
            </span>
            {/* One place for its control, the same width whatever it says, so the row never shifts as it changes. */}
            <span className="grid min-w-[10.5rem] shrink-0 justify-items-end">
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.span key={stand === 'reading' || stand === 'asking' ? 'wait' : stand} className="[grid-area:1/1]"
                  initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.96 }} transition={{ duration: 0.18, ease: EASE }}>
                  {stand === 'granted' ? (
                    <span data-granted className="flex h-8 items-center gap-1.5 text-[0.875rem] font-medium" style={{ color: 'var(--tt-color-text-green)' }}>
                      <Check className="size-4" strokeWidth={2.6} />{row.id === 'alerts' ? 'Alerts on' : 'Access granted'}
                    </span>
                  ) : stand === 'denied' ? (
                    <Button size="sm" variant="outline" data-grant-privacy onClick={() => privacy(row.id)}>Open Privacy settings</Button>
                  ) : stand === 'unasked' ? (
                    <Button size="sm" data-grant-ask onClick={() => (chime('tap'), ask(row.id))}>{row.id === 'alerts' ? 'Turn on alerts' : 'Grant access'}</Button>
                  ) : (
                    <span className="flex h-8 items-center text-[0.875rem] text-(--mf-wl-quiet)">{stand === 'asking' ? 'Waiting for macOS…' : ''}</span>
                  )}
                </motion.span>
              </AnimatePresence>
            </span>
          </div>
        )
      })}
    </div>
  )
}

/**
 * The Plan step's words. A PLACEHOLDER, to be written once the plan and its trial are decided: until then it names
 * no price, no term and no trial length, and says plainly that it is a placeholder.
 */
export const PLAN_WORDS = {
  title: 'Your plan.',
  line: 'Placeholder: what a plan adds, and how its trial works, will be said here once they are decided.',
  card: `Plan details for ${APP_NAME} go here.`
}

/** The Plan's right-hand side: an empty, dashed frame marked as a placeholder, so nobody takes it for an offer. */
export function PlanCard(): React.JSX.Element {
  return <Frame>{PLAN_WORDS.card}</Frame>
}

function Frame({ children }: { children: ReactNode }): React.JSX.Element {
  return (
    <div data-plan-placeholder className="flex h-[14rem] w-full max-w-[34rem] flex-col items-start justify-center gap-2 rounded-xl border border-dashed border-foreground/25 px-6">
      <span className="rounded-full bg-foreground/[0.07] px-2 py-0.5 text-[0.8125rem] font-semibold text-(--mf-wl-body)">Placeholder</span>
      <span className="text-[1.0625rem] leading-snug text-foreground">{children}</span>
    </div>
  )
}
