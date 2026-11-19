import { PlainField, type PlainHandle } from './presets'
import { TabChips } from './tab-chips'
import { DOT as SHARED_DOT, GAP as SHARED_GAP } from './time-dots'
import { dropLines, keepLines } from '@/lib/clue-lines'
import { TIP } from '@/lib/float'
import { ReadsIn, useReading } from '@/lib/reads-in'
import { binItem } from '@/lib/to-bin'
import { useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from 'react'
import { useToday } from '@/lib/use-today'
import { CalendarDays, CalendarPlus, Flag, Plus, Snowflake, StickyNote, Telescope } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { menuIcon } from '@/components/ui/menu-icon-rules'

import { EASE, still } from '@/lib/motion'
import { chime, stamp } from '@/lib/sound'
import { unloaded, useLastAsked, useLive, haligtree, type Gloss, type Item, type ItemFull, type Settings } from '@/lib/haligtree'
import { exampleGoals } from '@/lib/examples'
import { Example } from './example'
import { useKept, useOpened } from '@/lib/nav'
import { readFresh, readNow, useAfterFirstPaint } from '@/lib/early-read'
import { NoteComing } from './note-coming'
import { ShowMore, useShowMore } from './show-more'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Chips } from './display'
import { NoteList, type Entry } from './note-list'
import { RowMenu, copy, copyLinkItem, type MenuItem } from './row-menu'
import { PICKED_MARK } from './pick-mixed'
import { usePickLines } from '@/lib/pick-lines'
import { Empty, Island, Kbd, Page, Prop, Props, Rolling, Stepper, Tip, refuse, toast, typing, useListKeys, quietly } from './ui'
import { useFolding } from './items-view'
import { ICE, KIND_ICON, kindOf } from '@/lib/goal-kind'
import { archive, useOwnOrder } from '@/lib/notes'
import { reword } from './questions-view'
import { Term } from './term'
import { CollectionHeader, MenuButton, useTint } from './collection-header'
import { DatePicker } from './date-picker'
import { ago, dayKey, dayMonth, dayName, noon, num, plural } from '../../../../main/dates'
import { LINE_INK, ProgressBar } from './progress-bar'
import { inkOf, useMilestones, type Milestone } from '@/lib/milestones'
import { stickOnDesktop } from './sticky-note'
import { usePickNotes } from './pick-notes'
import { openItems, useHere } from '@/lib/split'
import { daysBetween, daysLeft, farOff, journey, leftSaid, percent, wayThrough, type Dot } from '../../../../main/goal-days'
import { leftLoud, loud } from '@/lib/loud'
import { clip, quoted } from '../../../../main/clip'
import { Check, EyeOff, X } from '@/components/ui/icons'

/**
 * Goals: a day you are working toward, kept in front of you until it comes.
 * A goal is a nugget row with its own tier, as a question is: it never rots
 * and is never reviewed. It holds dated logs (the same glosses a question's
 * clues are) and shows the road from the day it was set to the day it is
 * for, a dot a day. Once the day has passed it asks how it went.
 */

type Beacon = 'always' | 'sometimes' | 'off'
const ACCENT = 'var(--tt-brand-color-400)'
/** A page's one clear action, filled, as Home's Open is: "Give it a day", "Take off ice". */
const PRIMARY = 'flex h-8 shrink-0 cursor-pointer items-center gap-2 rounded-md px-3 text-control font-semibold transition-transform duration-150 active:scale-[0.97]'

/** The colours a goal can wear (main's GOAL_COLORS), the names a tag's colours use. */
export const GOAL_COLORS = ['blue', 'orange', 'green', 'purple', 'pink', 'yellow', 'red', 'brown'] as const
/** A goal's colour as ink; one from before goals had colours takes the first. */
export const goalInk = (goal: { goalColor?: string | null }): string => `var(--tt-color-text-${goal.goalColor ?? GOAL_COLORS[0]})`
/** The goal a marked day is for: one linked to a goal (its note is `goal:<id>`), else none. */
export const markOf = (one: Pick<Milestone, 'note'>): string | null => (one.note?.startsWith('goal:') ? one.note.slice(5) : null)
/** All the open goals on one sticky, each in its colour with a legend: put up, or back on screen. */
const showAllGoals = (): void => stickOnDesktop('goals', 'all')

/** Today's date, kept current (lib/use-today.ts), for the goals' importers. */
export { useToday }

/** The open goals with a day, nearest first: the ones that count down (Home, the stickies, the menu bar). */
export const openOnes = (all: Item[]): Item[] =>
  all.filter((one) => !one.closedAt && !one.archivedAt && one.goalAt).sort((a, b) => a.goalAt!.localeCompare(b.goalAt!))
/** A someday goal: on the life list, no day to it, so nothing counts down. */
export const someday = (goal: Pick<Item, 'goalAt'>): boolean => !goal.goalAt
/** The open someday goals, the newest first. */
const somedayOnes = (all: Item[]): Item[] =>
  all.filter((one) => !one.closedAt && !one.archivedAt && someday(one)).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
/** A goal's logs on its row: how many, and how long since the last; or that there are none. */
const loggedSaid = (item: Pick<Item, 'clues' | 'lastLog'>): string => item.clues ? `${logsSaid(item.clues)}, last ${ago(item.lastLog ?? '')}` : 'nothing logged'
/** The goal just crossed off, so its page presses the stamp once, with its thud; every later visit finds it already there. */
let crossing: string | null = null

/**
 * What Home shows of your goals (and today's Journal page with it): nothing until you ask, the nearest few, or only
 * the ones you chose, in the order you put them. Kept in Settings (goalsOnHome, goalsNearest, goalsChosen); read here
 * as the settings last said, so a menu built outside a component (goalMenu) says the same as the page it is on.
 */
type HomeGoals = { mode: 'off' | 'nearest' | 'chosen'; nearest: number; ids: string[] }
/** The most that can be chosen: the strip is a glance, never a list. */
export const HOME_GOALS = 3
let homeGoals: HomeGoals = { mode: 'off', nearest: 2, ids: [] }
const homeOf = (settings: Settings | null): HomeGoals => ({ mode: settings?.goalsOnHome ?? 'off', nearest: settings?.goalsNearest ?? 2, ids: settings?.goalsChosen ?? [] })
const sameHome = (a: HomeGoals, b: HomeGoals): boolean => a.mode === b.mode && a.nearest === b.nearest && a.ids.join() === b.ids.join()
/**
 * What was just asked for here, shown before the settings come back saying so: a goal moved up is up in the frame of
 * the press, and the next press is worked out from where it now is. Waiting on the settings, ⌥↓ pressed twice moved
 * a goal once (the second was worked out from the old order) and a move showed half a second late on a busy Mac.
 * `over` is what the settings said when the first of these was asked.
 */
let asked: { goals: HomeGoals; over: HomeGoals } | null = null
/** Writes of it on their way to the settings: while any is, what comes back in between is not the last word. */
let flying = 0
const homeDrawn = new Set<() => void>()
/** The settings, read in whatever component draws goals: Home's choice of them follows as it changes. */
export const useHomeGoals = (settings: Settings | null): HomeGoals => {
  const [, again] = useReducer((n: number) => n + 1, 0)
  useEffect(() => (homeDrawn.add(again), () => void homeDrawn.delete(again)), [])
  const said = homeOf(settings)
  // Every write has landed and the settings have moved on from where they stood: they are the word again (what was
  // asked for, or a change made in another window since).
  if (asked && !flying && !sameHome(said, asked.over)) asked = null
  return (homeGoals = asked?.goals ?? said)
}
const keepHome = (next: Partial<Pick<Settings, 'goalsOnHome' | 'goalsNearest' | 'goalsChosen'>>): Promise<unknown> => {
  const goals: HomeGoals = { mode: next.goalsOnHome ?? homeGoals.mode, nearest: next.goalsNearest ?? homeGoals.nearest, ids: next.goalsChosen ?? homeGoals.ids }
  asked = { goals, over: asked?.over ?? homeGoals }
  homeGoals = goals
  flying++
  for (const draw of homeDrawn) draw()
  return haligtree.setSettings(next).finally(() => {
    // The last one back: if the settings never moved (the same as before was asked for), nothing is waited on.
    if (--flying === 0 && asked && sameHome(asked.goals, asked.over)) asked = null
    for (const draw of homeDrawn) draw()
  })
}
/** The goals Home shows now, out of the open ones (nearest first): the chosen in their own order, or the nearest few. */
export const goalsForHome = (open: Item[], home: HomeGoals): Item[] =>
  home.mode === 'off' ? []
    : home.mode === 'nearest' ? open.slice(0, home.nearest)
      : home.ids.map((id) => open.find((one) => one.id === id)).filter((one): one is Item => !!one).slice(0, HOME_GOALS)
/** Whether a goal is one of those chosen for Home. */
const onHome = (goal: Item): boolean => homeGoals.mode === 'chosen' && homeGoals.ids.includes(goal.id)
/**
 * Choose a goal for Home, or take it off; undoable. Choosing one is also how Home's goals are turned on: from off, or
 * from the nearest few, Home then shows only what was chosen.
 */
export const setOnHome = (goal: Item, on: boolean): void => {
  const was = homeGoals
  const chosen = was.mode === 'chosen' ? was.ids : []
  if (on && chosen.filter((id) => id !== goal.id).length >= HOME_GOALS) return refuse(`Home shows ${HOME_GOALS} goals at most: take one off first`)
  const ids = on ? [...chosen.filter((id) => id !== goal.id), goal.id] : chosen.filter((id) => id !== goal.id)
  chime(on ? 'stick' : 'unstick')
  void keepHome({ goalsOnHome: 'chosen', goalsChosen: ids }).then(() =>
    toast(on ? (was.mode === 'chosen' ? 'Shown on Home' : 'Shown on Home: only the goals you choose show there') : ids.length ? 'Off Home' : 'Off Home: none is chosen now, so no goals show there',
      () => void keepHome({ goalsOnHome: was.mode, goalsChosen: was.ids })))
}
/** A chosen goal a place up or down among the chosen; undoable. */
export const moveOnHome = (goal: Item, by: -1 | 1): void => {
  const was = homeGoals.ids
  const at = was.indexOf(goal.id)
  const to = at + by
  if (homeGoals.mode !== 'chosen' || at < 0 || to < 0 || to >= was.length) return chime('nope')
  const ids = [...was]
  ids.splice(at, 1)
  ids.splice(to, 0, goal.id)
  chime('tap')
  void keepHome({ goalsChosen: ids }).then(() => toast(by < 0 ? 'Moved up on Home' : 'Moved down on Home', () => void keepHome({ goalsChosen: was })))
}

/** The goals put away from Home and today's Journal page; undoable, and Settings brings them back. */
const hideStrip = (): void => {
  const was = homeGoals.mode
  chime('unstick')
  void keepHome({ goalsOnHome: 'off' }).then(() =>
    toast('Goals hidden here. “Goals on Home” in Settings brings them back', () => void keepHome({ goalsOnHome: was })))
}

/** The short name a goal is logged under in quick capture: its last two words, as "+chapter three:" is for "Finish chapter three" (clueTarget finds the goal from it). */
const goalWord = (goal: string): string => goal.trim().toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, '').split(/\s+/).slice(-2).join(' ')

/** A line as it is written in quick capture to log progress on a goal: "+name:" lit as the box lights it, then what was done. */
export function LogLine({ goal, did }: { goal: string; did: string }): React.JSX.Element {
  return (
    <span data-log-line className="inline-flex items-baseline rounded-md border border-foreground/12 bg-popover px-1.5 py-px font-sans text-[0.92em] whitespace-nowrap text-popover-foreground">
      <span className="tiptap-token" data-token-color="purple">+{goalWord(goal)}:</span>&nbsp;{did}
    </span>
  )
}

const logsSaid = (n: number): string => (n ? `${plural(n, 'log')}` : 'no logs yet')
const HOW: Record<string, string> = { 'made it': 'Made it', missed: 'Missed', 'let go': 'Gave it up' }
/** Paused: out of every open list, its countdown stopped, under “On ice” until taken off. */
const onIce = (item: Pick<Item, 'closedHow'>): boolean => item.closedHow === 'on ice'
/** How a settled goal ended, and when: "Made it on 14 Dec"; or since when it is on ice. */
const settledSaid = (item: Item): string => onIce(item) ? `On ice since ${dayMonth(item.closedAt!)}`
  : `${someday(item) && item.closedHow === 'made it' ? 'Crossed off' : HOW[item.closedHow ?? ''] ?? 'Ended'} on ${dayMonth(item.closedAt!)}`
/**
 * Which tab of Goals one sits under: a dated goal still open (Goals), the
 * someday list (its crossed-off ones kept at its foot, as a life list keeps
 * them), on ice, or ended.
 */
type Tab = 'open' | 'someday' | 'iced' | 'settled'
const tabOf = (item: Pick<Item, 'goalAt' | 'closedAt' | 'closedHow'>): Tab =>
  onIce(item) ? 'iced' : someday(item) && (!item.closedAt || item.closedHow === 'made it') ? 'someday' : item.closedAt ? 'settled' : 'open'
/** The tabs, in their fixed order: the goals that count down first, then the life list, the paused, the ended. */
const TABS: { id: Tab; label: string }[] = [{ id: 'open', label: 'Goals' }, { id: 'someday', label: 'Someday' }, { id: 'iced', label: 'On ice' }, { id: 'settled', label: 'Ended' }]

/** A goal's mark, small, wherever it shows: its kind's icon in its kind's ink. */
export function GoalMark({ item, className = 'size-3.5 shrink-0', style }: { item: Pick<Item, 'goalAt' | 'closedHow' | 'closedAt' | 'goalColor'>; className?: string; style?: React.CSSProperties }): React.JSX.Element {
  const kind = kindOf(item)
  const Icon = KIND_ICON[kind]
  const ink = onIce(item) ? ICE : item.closedAt ? 'var(--muted-foreground)' : kind === 'someday' ? goalInk(item) : undefined
  return <Icon data-goal-mark={kind} aria-label={kind === 'someday' ? 'Someday goal' : kind === 'iced' ? 'Goal on ice' : 'Goal'} className={className} style={{ color: ink, ...style }} />
}
/** "Jun 2026": when a someday goal went on the list. */
const monthYear = (at: string): string => new Date(at).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
/** A someday goal's logs are its steps: "2 steps logged". */
const stepsSaid = (n: number): string => (n ? `${plural(n, 'step')} logged` : 'no steps logged yet')
/** The days-left colour: calm far out, the accent in the last month, strong in the last week. */
export const warmth = (left: number): string =>
  left > 30 ? 'var(--muted-foreground)' : left > 7 ? ACCENT : 'var(--tt-color-text-red)'

/** A new goal, asked for (its name, its day, why), then opened. Undoable. */
export async function startGoal(open: (type: string, id: string) => void, title = ''): Promise<string | null> {
  const asked = await new Promise<{ title: string; target: string | null; why: string } | null>((answer) =>
    window.dispatchEvent(new CustomEvent('haligtree:new-goal', { detail: { answer, title } })))
  if (!asked) return null
  const id = await haligtree.newGoal(asked.title, asked.target, null, asked.why)
  if (!id) return null
  chime('goal')
  toast(asked.target ? `A goal for ${dayMonth(`${asked.target}T12:00`)}: log as you go` : 'On your someday list: log whenever you take a step', () => void haligtree.dropGoal(id))
  open('goal', id)
  return id
}

/** Settle a goal: made it, missed, or gave it up; or put it on ice for now. Undoable. */
export function settle(item: { id: string; goalAt?: string | null }, how: 'made it' | 'missed' | 'let go' | 'on ice'): void {
  const crossed = how === 'made it' && 'goalAt' in item && !item.goalAt
  if (crossed) crossing = item.id
  void haligtree.closeGoal(item.id, how).then(() => {
    // Crossed off a life list: a ticked box's ta-da, and the stamp's thud on its page.
    chime(crossed ? 'done' : how === 'made it' ? 'answered' : how === 'missed' ? 'called' : how === 'on ice' ? 'unstick' : 'release')
    toast(crossed ? 'Crossed off your list. It rests under “Ended”, logs and all' : how === 'made it' ? 'Made it. It moves to “Ended”' : how === 'missed' ? 'Missed: kept under “Ended”, with its logs'
      : how === 'on ice' ? ('goalAt' in item && !item.goalAt ? 'On ice: it waits under “On ice” until you take it off' : 'On ice: its countdown stops, and it waits under “On ice”') : 'Gave it up: kept under “Ended”, with its logs',
      () => void haligtree.reopenGoal(item.id))
  })
}

/**
 * Its day given or taken away: a someday goal gets a road, a dated one joins the life list ("Make it someday"). Said,
 * with Undo. One action from its panel and from its right-click menu (16 Nov: the menu had no "Make it someday").
 */
function giveDay(item: Pick<Item, 'id' | 'goalAt' | 'goalFrom' | 'createdAt'>, day: string | null, from = item.goalFrom ?? dayKey(item.createdAt)): void {
  const was = { target: item.goalAt, from }
  void haligtree.goalDates(item.id, { target: day }).then((ok) => {
    if (!ok) return chime('nope')
    chime(day ? 'goal' : 'tap')
    toast(day ? `Given a day: ${dayMonth(`${day}T12:00`)}, and the countdown starts` : 'No day now: it waits under “Someday”, no countdown',
      () => void haligtree.goalDates(item.id, was.target ? { target: was.target, from: was.from } : { target: null }))
  })
}

/** Off ice and open again, its day moved out by the days it waited; undoable back onto the ice. */
function thaw(item: Item): void {
  void haligtree.thawGoal(item.id).then((back) => {
    if (!back) return chime('nope')
    chime('hold')
    toast(!back.was ? 'Off ice: back on your someday list' : back.days ? `Off ice: its day moves ${plural(back.days, 'day')} later, the time it was on ice, to ${dayMonth(`${dayKey(noon(back.was).add(back.days, 'day').toDate())}T12:00`)}` : 'Off ice: open again',
      () => void haligtree.goalDates(item.id, { target: back.was }).then(() => haligtree.closeGoal(item.id, 'on ice', back.iced)))
  })
}

/** Several open goals on ice at once, in one notice; undoable all together. */
const iceAll = (ids: string[]): Promise<unknown> => Promise.all(ids.map((id) => haligtree.closeGoal(id, 'on ice'))).then(() => {
  chime('unstick')
  toast(`On ice: ${plural(ids.length, 'goal')}, their countdowns stopped, waiting under “On ice”`, () => void Promise.all(ids.map((id) => haligtree.reopenGoal(id))))
})

/** Several goals off ice at once, each day moved out by the days it waited; undoable back onto the ice. */
const thawAll = (ids: string[]): Promise<unknown> => Promise.all(ids.map((id) => haligtree.thawGoal(id).then((back) => back && { id, ...back }))).then((all) => {
  const backs = all.filter((one) => !!one)
  if (!backs.length) return chime('nope')
  chime('hold')
  toast(`Off ice: ${plural(backs.length, 'goal')} open again, each day moved out by the days it waited`,
    () => void Promise.all(backs.map((back) => haligtree.goalDates(back.id, { target: back.was }).then(() => haligtree.closeGoal(back.id, 'on ice', back.iced)))))
})

/** A settled goal open again; undoable back to how it was settled. */
function reopen(item: Item): void {
  const how = (item.closedHow ?? 'let go') as 'made it' | 'missed' | 'let go'
  void haligtree.reopenGoal(item.id).then(() => {
    chime('hold')
    toast('Open again', () => void haligtree.closeGoal(item.id, how, item.closedAt))
  })
}

/** The new goal over the page: its name, the day, and why, if you want to say. */
export function GoalAsker(): React.JSX.Element | null {
  const [asked, setAsked] = useState<{ answer: (goal: { title: string; target: string | null; why: string } | null) => void; title?: string } | null>(null)
  const [title, setTitle] = useState('')
  const [target, setTarget] = useState<string | null>(null)
  // No day to it: a someday goal, for the life list.
  const [dateless, setDateless] = useState(false)
  const [why, setWhy] = useState('')
  // What is still missing, said beside the button once it is pressed too soon; it shakes each time.
  const [missing, setMissing] = useState<{ text: string; n: number } | null>(null)
  useEffect(() => {
    const onAsk = (event: Event): void => {
      chime('open')
      setMissing(null)
      // Made from something already written (an Inbox capture's "Make it a goal"): its words are the name to start.
      setTitle((event as CustomEvent).detail.title ?? '')
      setTarget(null)
      setDateless(false)
      setWhy('')
      setAsked((event as CustomEvent).detail)
    }
    window.addEventListener('haligtree:new-goal', onAsk)
    return () => window.removeEventListener('haligtree:new-goal', onAsk)
  }, [])
  if (!asked) return null
  const done = (goal: { title: string; target: string | null; why: string } | null): void => {
    asked.answer(goal)
    setAsked(null)
  }
  const keep = (): void => {
    const lack = !title.trim() ? (target || dateless ? 'Name the goal first' : 'Name the goal and pick its day') : dateless ? null : !target ? 'Pick the day it is for, or “Someday”' : dayKey(target) < dayKey() ? 'That day has passed. Pick one ahead' : null
    if (lack) return (chime('nope'), setMissing((was) => ({ text: lack, n: (was?.n ?? 0) + 1 })))
    done({ title: title.trim(), target: dateless ? null : dayKey(target!), why: why.trim() })
  }
  const ready = !!title.trim() && (!!target || dateless)
  const left = target ? daysLeft(dayKey(target)) : null
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 pt-[18vh]" onMouseDown={() => done(null)}>
      <div role="dialog" aria-modal="true" aria-label="New goal" className="flex w-[min(30rem,90vw)] flex-col gap-3 rounded-xl bg-popover p-4 shadow-(--mf-panel-shadow)"
        onMouseDown={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          event.stopPropagation()
          if (event.key === 'Escape') done(null)
          if (event.key === 'Enter' && !(event.target as HTMLElement).closest('[data-slot="popover-content"]')) (event.preventDefault(), keep())
        }}>
        <p className="flex items-center gap-2 text-sm">
          {dateless ? <Telescope className="size-4" style={{ color: ACCENT }} /> : <Flag className="size-4" style={{ color: ACCENT }} />}
          <Rolling by="word" text={dateless ? 'A someday goal: one for your life list, no day to it' : 'A goal: something to have done by a day'} />
        </p>
        <Input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} placeholder={dateless ? 'e.g. Visit Hobbiton' : 'e.g. Run the 10k under an hour'} aria-label="The goal" />
        <div className="flex flex-wrap items-center gap-2 text-control">
          <span className="text-muted-foreground">By</span>
          <DatePicker value={dateless ? null : target} onChange={(day) => (setTarget(day), day && setDateless(false))} placeholder="Pick the day" suggest={['in 1 month', 'in 3 months', 'in 6 months', 'in 1 year']}
            className="border bg-accent/30" />
          <span className="text-muted-foreground">or</span>
          {/* No day at all: a goal for someday, as Tasks' Later is a task for someday. */}
          <Chips options={[{ id: 'someday', label: 'No day: someday' }]} on={() => dateless} pick={() => (chime(dateless ? 'off' : 'on'), setDateless(!dateless))} />
          {!dateless && left !== null && left >= 0 && <span className="text-control font-semibold text-foreground"><Rolling by="word" text={leftSaid(left).toLowerCase()} /></span>}
        </div>
        {dateless && <p data-someday-said className="-mt-1 text-control text-foreground">No countdown and no rush: it waits under “Someday” in Goals, and you log a step whenever you take one.</p>}
        <Input value={why} onChange={(event) => setWhy(event.target.value)} placeholder="Why it matters (if you want to say)" aria-label="Why it matters" />
        <div className="mt-1 flex items-center gap-2">
          {missing && !ready
            ? <p role="alert" className="mr-auto text-xs font-medium text-[var(--tt-color-text-orange)]">{missing.text}</p>
            : <p className="mr-auto text-xs text-muted-foreground">Enter to set it · Escape to leave it</p>}
          <Button variant="ghost" size="sm" onClick={() => done(null)}>Cancel</Button>
          <motion.span key={missing?.n ?? 0} animate={missing ? { x: [0, -6, 6, -4, 4, 0] } : undefined} transition={{ duration: 0.32, ease: 'easeOut' }}>
            <Button size="sm" onClick={keep} aria-disabled={!ready} className={ready ? '' : 'opacity-60'}>Set the goal</Button>
          </motion.span>
        </div>
      </div>
    </div>
  )
}

/** A goal as any list draws it: its name, then its days left, how far along, and its logs. */
const goalEntry = (item: Item, today: string, menu?: MenuItem[]): Entry => {
  // Paused: its mark, "On ice since 1 Nov" said plainly, and its name in a cool, faded ink. A someday one keeps its telescope.
  if (onIce(item)) return {
    id: item.id,
    type: 'goal',
    title: item.title,
    tags: [],
    icon: KIND_ICON[kindOf(item)],
    sub: <span data-iced className="flex min-w-0 items-center gap-1.5" style={{ color: ICE }}><GoalMark item={item} className="size-3 shrink-0" /><span className="truncate">{settledSaid(item)} · {someday(item) ? stepsSaid(item.clues) : logsSaid(item.clues)}</span></span>,
    marks: item.private ? <EyeOff className="size-3 shrink-0 text-muted-foreground" aria-label="Private" /> : null,
    ink: ICE,
    private: !!item.private,
    bare: true,
    menu
  }
  // The life list: no countdown, no bar, nothing warming; when it went on the list and the steps so far.
  // Crossed off, struck through and kept at the list's foot.
  if (someday(item)) return {
    id: item.id,
    type: 'goal',
    title: item.title,
    tags: [],
    icon: Telescope,
    sub: <span className="flex min-w-0 items-center gap-1.5"><GoalMark item={item} className="size-3 shrink-0" /><span className="truncate">{item.closedAt ? settledSaid(item) : `Added ${monthYear(item.createdAt)}`} · {stepsSaid(item.clues)}</span></span>,
    marks: item.private ? <EyeOff className="size-3 shrink-0 text-muted-foreground" aria-label="Private" /> : null,
    done: item.closedHow === 'made it',
    dim: !!item.closedAt,
    private: !!item.private,
    bare: true,
    menu
  }
  const left = daysLeft(item.goalAt ?? today, today)
  return {
    id: item.id,
    type: 'goal',
    title: item.title,
    tags: [],
    icon: Flag,
    tint: item.closedAt ? undefined : warmth(left),
    sub: item.closedAt
      ? <span data-goal-mark="dated">{settledSaid(item)} · {logsSaid(item.clues)}</span>
      // The days left lead, in the goal's own warmth and bold: the one thing a glance down the list is for. Then its logs.
      : <span data-goal-mark="dated"><span {...loud(leftLoud(left), 'font-semibold')} style={{ color: left > 30 ? 'var(--foreground)' : undefined }}>{left < 0 ? `${leftSaid(left)}: did you make it?` : left === 0 ? 'Today' : plural(left, 'day')}</span> · {loggedSaid(item)}</span>,
    marks: item.private ? <EyeOff className="size-3 shrink-0 text-muted-foreground" aria-label="Private" /> : null,
    // A thin line of the time gone, plain whatever Settings draws bars as, warming as the day comes.
    bar: item.closedAt ? undefined : <GoalBar left={left} way={wayThrough(item.goalFrom ?? today, item.goalAt ?? today)} />,
    dim: !!item.closedAt,
    private: !!item.private,
    bare: true,
    menu
  }
}

/** The heading over the goals whose day is more than a year off, at the foot of Goals. */
export const FAR_HEAD = 'More than a year away'
/**
 * The open list's sections: goals more than a year away under "More than a
 * year away" at its foot (nearest first is already the list's order), drawn
 * a dot a week until they come within a year, when they move up on their own.
 * Goals that share a day sit under that day's heading ("31 Dec 2027"); once
 * any day is shared every day within the year is headed, so a goal never
 * looks like one of the group above it. Neither, one plain list.
 */
const sectionsOf = (dated: Item[], today: string): Map<string, string> | undefined => {
  const far = (one: Item): boolean => farOff(one.goalAt!, today)
  const near = dated.filter((one) => !far(one))
  const shared = near.some((one, index) => index > 0 && near[index - 1].goalAt === one.goalAt)
  if (!shared && near.length === dated.length) return undefined
  return new Map(dated.flatMap((one): [string, string][] => far(one) ? [[one.id, FAR_HEAD]] : shared ? [[one.id, dayMonth(`${one.goalAt}T12:00`, 'always')]] : []))
}

/**
 * A goal's actions, each with one name everywhere (its row's menu, its page's
 * panel, its page's "…"), and so one icon: menus draw theirs from the words
 * (menu-icon-rules.ts) and the panel asks the same rules (`ICON`).
 */
const ACT = {
  made: (item: Pick<Item, 'goalAt'>): string => (someday(item) ? 'Cross it off' : 'Made it'),
  missed: 'Missed',
  giveUp: 'Give it up',
  ice: 'Put on ice',
  thaw: 'Take off ice',
  reopen: 'Open it again',
  home: (on: boolean): string => (on ? 'Take off Home' : 'Show on Home'),
  secret: (on: boolean): string => (on ? 'Make it not private' : 'Make it private'),
  someday: 'Make it someday'
}
/** A panel line's icon: the one its words wear in every menu. */
const ICON = menuIcon
/** The someday list as one part of its page, and a goal that stands alone in a list kept the latest first (carry.tsx's Parts). */
const SOMEDAY = ':someday'
const ALONE = ':alone:'

/** How it ends, or that it goes on ice: the lines a goal keeper comes for, in the row's menu and the page's panel. */
const endings = (item: Item): MenuItem[] => onIce(item) ? [{ label: ACT.thaw, hint: 'Open again, its day moved out by the days it waited', run: () => thaw(item) }]
  : item.closedAt ? [{ label: ACT.reopen, run: () => reopen(item) }]
  : [
    { label: ACT.made(item), run: () => settle(item, 'made it') },
    ...(someday(item) ? [] : [{ label: ACT.missed, run: () => settle(item, 'missed') }]),
    { label: ACT.giveUp, hint: 'Kept under “Ended”', run: () => settle(item, 'let go') },
    { label: ACT.ice, hint: someday(item) ? 'Paused: out of the list until taken off' : 'Paused: its countdown stops', run: () => settle(item, 'on ice') }
  ]

/** A goal's full right-click menu in a list: how it ends, where it shows, then the goal as a thing (a link, the Bin). */
const goalMenu = (item: Item): MenuItem[] => [
  ...openItems('goal', item.id),
  'separator',
  ...endings(item),
  'separator',
  !item.closedAt && !someday(item) && { label: ACT.someday, hint: 'Off the countdown, onto your someday list', run: () => giveDay(item, null) },
  !item.closedAt && !someday(item) && { label: ACT.home(onHome(item)), hint: onHome(item) ? 'Off the top of Home' : 'At the top of Home', run: () => setOnHome(item, !onHome(item)) },
  { label: ACT.secret(!!item.private), run: () => void haligtree.setPrivate('nuggets', item.id, !item.private) },
  // Goals pause on ice, not in the archive: only one archived before keeps a way back.
  !!item.archivedAt && { label: 'Unarchive', hint: 'Back in sight', run: () => void archive('nuggets', [item.id], false) },
  'separator',
  copyLinkItem(`goal:${item.id}`, item.title),
  binItem([{ type: 'goal', id: item.id }])
]
/** A goal page's "…": only what its panel does not already hold (the panel has how it ends, its day, Home and privacy). */
const pageMenu = (item: Item): MenuItem[] => [...openItems('goal', item.id), 'separator', copyLinkItem(`goal:${item.id}`, item.title), binItem([{ type: 'goal', id: item.id }])]

/**
 * Goals, in the main window: the open ones nearest first, the settled ones
 * under Settled, and the one picked open beside them.
 */
export function GoalsView({ focus, onOpen }: { focus?: string; onOpen?: (type: string, id: string) => void }): React.JSX.Element {
  const all = useLive(() => haligtree.items('goal'), [] as Item[], [], ['item'])
  const today = useToday()
  const [show, setShow] = useState<Tab>('open')
  // Opened from elsewhere with its words already read: on them from the first frame.
  const [open, setOpen] = useState<ItemFull | null>(() => (focus ? readNow<ItemFull>('goal', focus) ?? null : null))
  // The one asked for while it is read: its pane and name at once (note-coming.tsx).
  const [coming, setComing] = useState<string | null>(() => (focus && !open ? focus : null))
  // Goals: the dated ones nearest first. Someday: the life list, newest first, the crossed-off ones at its foot.
  // On ice and Ended: the latest first.
  const listOf = (which: Tab): Item[] => which === 'open' ? openOnes(all)
    : which === 'someday' ? [...somedayOnes(all), ...all.filter((one) => one.closedAt && !one.archivedAt && tabOf(one) === 'someday').sort((a, b) => b.closedAt!.localeCompare(a.closedAt!))]
    : all.filter((one) => one.closedAt && !one.archivedAt && tabOf(one) === which).sort((a, b) => b.closedAt!.localeCompare(a.closedAt!))
  const items = listOf(show)
  // Goals grouped by area of life ("Health", "Travel"), the way Writing groups its pages, with the same groups code
  // (items-view's useFolding): ⌘G, ⇧⌘G, drag in and out, a name, a fold and tree lines. A group spans the kinds and
  // shows under each tab with only that tab's goals in it; goals in no group stay loose below the groups, in the tab's
  // own order (a drag only joins or leaves a group).
  const own = useOwnOrder('goal')
  // Home's choice of goals, for each row's “Show on Home”.
  useHomeGoals(useLive(haligtree.settings, null as Settings | null))
  const letGo = useRef<() => void>(() => undefined)
  // The part of the list a goal stands in, as Tasks has parts (carry.tsx's useTargets). Under Goals, its day, the far
  // ones together under their heading: goals of one part take your own order, and the day still decides the part. The
  // someday list is one part. Where a list is kept the latest first (crossed off, on ice, ended), each goal stands alone.
  const byId = new Map(all.map((one) => [one.id, one]))
  const partOf = (id: string): string | undefined => {
    const one = byId.get(id)
    if (!one) return undefined
    return show === 'open' && one.goalAt ? (farOff(one.goalAt, today) ? FAR_HEAD : dayMonth(`${one.goalAt}T12:00`, 'always')) : show === 'someday' && !one.closedAt ? SOMEDAY : ALONE + id
  }
  // Carried over another part's rows: another day takes it (its day becomes that day); a stretch of time, or a list kept the latest first, says why not.
  const takes = (_id: string, part: string): { words: string } | { refused: string } =>
    part === FAR_HEAD ? { refused: `Its day puts a goal under “${FAR_HEAD}”: change its day on its page to move it` }
      : part === SOMEDAY ? { refused: `It is crossed off: “${ACT.reopen}” puts it back on the list` }
      : part.startsWith(ALONE) ? { refused: `${show === 'someday' ? 'Crossed-off goals' : show === 'iced' ? 'Goals on ice' : 'Ended goals'} stand the latest first: they are not arranged by hand` }
      : { words: `Move to ${part}` }
  const toDay = (id: string, part: string): void => {
    const one = byId.get(id)
    const day = items.find((other) => partOf(other.id) === part)?.goalAt
    if (!one || !day) return
    const was = { target: one.goalAt, from: one.goalFrom }
    void haligtree.goalDates(id, { target: day }).then((ok) => {
      if (!ok) return chime('nope')
      chime('shift')
      toast(`Moved to ${part}`, () => void haligtree.goalDates(id, was.target ? { target: was.target, from: was.from ?? undefined } : { target: null }))
    })
  }
  // A tab takes a carried goal where the goal's own menu has that move, under the menu's words; any other tab stays unlit.
  const tabMove = (id: string, to: string): { label: string; run: () => void } | null => {
    const one = byId.get(id)
    if (!one || to === tabOf(one)) return null
    if (to === 'iced') return one.closedAt ? null : { label: ACT.ice, run: () => settle(one, 'on ice') }
    if (to !== (someday(one) ? 'someday' : 'open')) return null
    return onIce(one) ? { label: ACT.thaw, run: () => thaw(one) } : one.closedAt ? { label: ACT.reopen, run: () => reopen(one) } : null
  }
  // What carrying a goal does under this tab, said once over the list: the grip on a row promises no more than this.
  const dragSaid = show === 'open' ? 'Drag a goal to order it among the goals of its day, or onto another day to move it there. Hold it on another goal to make a group.'
    : show === 'someday' ? 'Drag a goal to put the list in your own order. Hold it on another goal to make a group.'
    : `Drag a goal onto “Goals” or “Someday” above to ${show === 'iced' ? 'take it off ice' : 'open it again'}, or hold it on another goal to make a group.`
  // Your own order, and for goals never placed the order every list of goals has (nearest first, then newest): so what
  // is saved is what was on the page, and an Undo, or a group made, moves no goal that was not carried.
  const folding = useFolding('goal', all, (a, b) => own.compare(a.id, b.id) || (a.goalAt ?? '').localeCompare(b.goalAt ?? '') || b.createdAt.localeCompare(a.createdAt), own.order, items, false, () => letGo.current(), [], () => undefined,
    show === 'open' ? sectionsOf(items, today) : undefined, undefined, { noun: ['goal', 'goals'] }, partOf)
  // The rows in the order they show: the groups first, then the loose goals.
  const rows = folding.rows ?? items
  // Only the last pick lands: a late answer for the goal before is dropped.
  const asked = useLastAsked()
  const pick = (id: string): void => {
    const ready = readNow<ItemFull>('goal', id)
    if (ready) return (asked(), setComing(null), setOpen(ready), setShow(tabOf(ready)))
    if (id !== open?.id) setComing(id)
    asked(readFresh('goal', id, haligtree.item), (found) => {
      setComing(null)
      setOpen(found)
      if (found) setShow(tabOf(found))
    })
  }
  // Open or Settled: the goal beside the list is always one of it, its first, or none.
  const switchTo = (which: Tab): void => {
    setShow(which)
    if (!open || tabOf(open) === which) return
    const first = listOf(which)[0]
    if (first) pick(first.id)
    else (asked(), setComing(null), setOpen(null))
  }
  // Opening one is a step Back returns from; Open or Settled is kept in it.
  useOpened(open?.id, focus, pick, () => (asked(), setComing(null), setOpen(null)), { shown: rows.map((one) => one.id), kind: 'item' })
  useKept('tab', show, setShow, 'open')
  // Read again when anything changes, so a log added from the box shows.
  useEffect(() => {
    // A reload for the one you left, landing after you switch, is dropped.
    let gone = false
    const off = window.api.captures.onChange(() => open && void haligtree.item(open.id).then((found) => void (gone || setOpen(found))))
    return () => void ((gone = true), off())
  }, [open?.id])
  const [cursor, setCursor] = useListKeys(rows.length, { onOpen: (index) => pick(rows[index].id), opened: rows.findIndex((one) => one.id === (coming ?? open?.id)), onExtend: (from, to) => several.picking.extend(rows[from]?.id, rows[to].id) })
  const go = (type: string, id: string): void => (type === 'goal' ? pick(id) : onOpen?.(type, id))
  // x, ⇧-click and ⌘A pick several, for the queue or the archive together.
  const here = useHere()
  const several = usePickNotes(rows.map((one) => one.id), cursor, { here, noun: ['goal', 'goals'], tier: 'goal', titleOf: (id) => items.find((one) => one.id === id)?.title,
    put: show === 'open' || show === 'someday' ? { label: 'Put on ice', hint: 'Paused: their countdowns stop', run: iceAll } : show === 'iced' ? { label: 'Take off ice', hint: 'Open again, each day moved out by the days it waited', run: thawAll } : undefined })
  // Sent here for one goal: the goal is drawn first and the list beside it
  // the frame after, whole (Page's `apart`), so its words never wait behind the list.
  const sent = !!focus && (coming ?? open?.id) === focus
  const [listFirst] = useState(!focus)
  const listLater = useAfterFirstPaint()
  const listShown = listFirst || listLater
  letGo.current = several.letGo
  // A row's menu: what to do with it, the group lines, then picking. Right-clicked among several picked, it speaks for them all.
  // Only this goal's own lines: "Stick all goals" is about every goal, so it lives on the page's bar and in ⌘K, never here.
  const menuFor = (one: Item): MenuItem[] => {
    const many = several.menu(one.id)
    return many ? [...(folding.menu(several.chosen) as MenuItem[]), 'separator', ...many]
      : [{ label: 'Open', keys: '↵', run: () => pick(one.id) }, ...goalMenu(one), 'separator', ...(folding.menu([one.id]) as MenuItem[]), ...several.rowItems(one.id)]
  }
  const entryOf = (one: Item): Entry => goalEntry(one, today, menuFor(one))
  const entries = !listShown ? [] : items.map(entryOf)
  // ⌘G groups the picked goals (or the one under the cursor), ⇧⌘G lets their group go; ⌘K's "Group" too.
  const keyed = useRef<(ungroup: boolean) => void>(() => undefined)
  keyed.current = (ungroup) => {
    const these = several.chosen.length ? several.chosen : rows[cursor] ? [rows[cursor].id] : []
    return ungroup ? folding.ungroup(these) : folding.groupNew(these)
  }
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (!here() || typing() || !event.metaKey || event.ctrlKey || event.altKey || event.code !== 'KeyG') return
      event.preventDefault()
      event.stopPropagation()
      keyed.current(event.shiftKey)
    }
    const onGroup = (event: Event): void => void (here() && keyed.current(!!(event as CustomEvent<boolean>).detail))
    window.addEventListener('keydown', onKey, true)
    window.addEventListener('haligtree:group', onGroup)
    return () => (window.removeEventListener('keydown', onKey, true), window.removeEventListener('haligtree:group', onGroup))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    // The list and the one open beside it come in together, once both are read (lib/reads-in.tsx).
    <ReadsIn className="contents">
      {/* Sent here for one goal: the page waits for it too, so it opens on the goal beside the list, not on the list alone first;
          the goal never waits for the list, which comes in whole beside it once drawn. */}
      <Page aside={!!open || !!coming} waiting={unloaded(all) || unloaded(own.order) || (!!focus && (coming ?? open?.id) !== focus) || !listShown} apart={sent} title="Goals" count={several.chosen.length || undefined} unit={several.chosen.length ? ['selected', 'selected'] : ['goal', 'goals']}
        // Which goals show, at the line's left before the count, on the list's edges as Tasks' tabs (qa/list-edges.mjs): apart from the buttons that make or gather goals.
        lead={several.bar ? undefined : <div data-list-tabs className="flex shrink-0" style={{ marginLeft: 'calc(var(--list-edge) - var(--list-ink) - 3px)' }}><TabChips name="goals" tabs={TABS.map((one) => ({ value: one.id, label: one.label, count: unloaded(all) ? undefined : listOf(one.id).length }))} value={show} onChange={switchTo} drops={Object.fromEntries(TABS.map((one) => [one.id, one.id]))} /></div>}
        actions={several.bar ??
          <span className="flex items-center gap-2">
            {openOnes(all).length > 1 && <Button variant="outline" size="sm" className="h-7 cursor-pointer px-3" data-all-goals-sticky onClick={showAllGoals} title="Every open goal on one sticky, each in its own colour"><StickyNote className="size-3.5" />Stick all goals</Button>}
            {/* Always here, whichever chip is on: nothing in the bar comes or goes as you switch. */}
            <Button variant="outline" size="sm" className="h-7 cursor-pointer px-3" data-new-goal onClick={() => void startGoal(go)}><Plus className="size-3.5" />New goal</Button>
          </span>
        }
      >
        {!listShown ? null : items.length ? (
          <NoteList groups={[['', entries]]} density="list" table="nuggets" selected={coming ?? open?.id} cursor={cursor} onCursor={setCursor} onPick={pick} chosen={several.chosen} picking={several.picking} className="list-edge my-2"
            folds={folding.rows ? { ...folding.folds(menuFor, entryOf), picked: several.chosen, days: show === 'open', onNewNote: pick,
              parts: { of: partOf, take: takes, drop: toDay }, places: { said: (place, id) => tabMove(id, place)?.label ?? null, drop: (id, place) => tabMove(id, place)?.run() },
              hint: { name: `goals-${show}`, said: dragSaid } } : undefined} />
        ) : unloaded(all) ? null : !all.length ? (
          // None set yet: the page as it will look, with a few made-up ones.
          <Example tryIt={<><strong><button type="button" onClick={() => void startGoal(go)} className="text-foreground underline decoration-foreground/25 underline-offset-4 hover:decoration-foreground/60">set a goal</button>: a day you are aiming for.</strong> It counts down at the top of Home and keeps a log of the road there. Or leave the day out: a someday goal, for the life list.</>}>
            <NoteList groups={[['', exampleGoals().filter((one) => tabOf(one) === show).map((one) => goalEntry(one, today))]]} density="list" table="nuggets" cursor={-1} onPick={() => undefined} className="list-edge my-2" />
          </Example>
        ) : show === 'open' ? (
          <Empty title="No goals yet" action={<Button variant="secondary" size="sm" onClick={() => void startGoal(go)}><Plus className="size-3.5" /> New goal</Button>}>
            A goal is a day you are working toward. It stays in front of you, in the menu bar and at the top of Home, counts the days down, and keeps a log of the road there.
            Or pick “No day: someday” for the life list: Visit Hobbiton, Take my parents to Victoria Falls. No countdown, just there until you go.
          </Empty>
        ) : show === 'someday' ? (
          <Empty title="Nothing on your someday list" action={<Button variant="secondary" size="sm" onClick={() => void startGoal(go)}><Plus className="size-3.5" /> New goal</Button>}>
            Your life list: places to go, things to do one day, with no date on them. Make a goal and pick “No day: someday”. Log a step whenever you take one; when it draws near, give it a day and it counts down.
          </Empty>
        ) : show === 'iced' ? (
          <Empty title="No goals on ice">
            A goal you want to pause goes on ice from its page: it leaves Home and the desktop, and its countdown stops. Taken off, its day moves out by the days it waited.
          </Empty>
        ) : (
          <Empty title="No goals ended yet">
            Once a goal's day has passed it asks how it went: made it, missed, or gave it up. It rests here after, logs and all.
          </Empty>
        )}
      </Page>
      {coming && coming !== open?.id ? <NoteComing id={coming} title={all.find((one) => one.id === coming)?.title} /> : open && <GoalDetail key={open.id} item={open}
        top={<ReadsIn apart reading={unloaded(all)} className="contents" data-apart="stepper"><Stepper at={rows.findIndex((one) => one.id === open.id)} total={rows.length} onStep={(to) => pick(rows[to].id)} /></ReadsIn>} />}
    </ReadsIn>
  )
}

/** The three answers once the day has passed, as small buttons. */
export function Answers({ item, small = false, onPick }: { item: { id: string; goalAt?: string | null }; small?: boolean; /** In place of settling it here: a window that says the answer its own way. */ onPick?: (how: 'made it' | 'missed' | 'let go') => void }): React.JSX.Element {
  const size = small ? 'h-6 px-2 text-xs' : 'h-8 px-3 text-control'
  const pick = (how: 'made it' | 'missed' | 'let go'): void => (onPick ? onPick(how) : settle(item, how))
  // Its day passed and not there yet: a week more, the goal's “+10 min”, with Undo.
  const more = (): void => {
    const target = dayKey(Date.now() + 7 * 86_400_000)
    void haligtree.goalDates(item.id, { target }).then((ok) => {
      if (!ok) return chime('nope')
      chime('more')
      toast(`A week more: now for ${dayMonth(`${target}T12:00`)}`, item.goalAt ? () => void haligtree.goalDates(item.id, { target: item.goalAt! }) : undefined)
    })
  }
  return (
    // Each answer whole on its line: in a narrow card they wrap as chips, never inside one.
    <span className="flex max-w-full shrink-0 flex-wrap items-center gap-1 whitespace-nowrap">
      <button type="button" onClick={(event) => (event.stopPropagation(), pick('made it'))}
        className={`flex items-center gap-1.5 rounded-full bg-primary font-medium text-primary-foreground transition-transform duration-150 motion-safe:hover:scale-[1.03] active:scale-[0.97] ${size}`}>
        <Check className="size-3.5" /> Made it
      </button>
      {(['missed', 'let go'] as const).map((how) => (
        <button key={how} type="button" onClick={(event) => (event.stopPropagation(), pick(how))}
          className={`rounded-full text-muted-foreground transition-colors hover:bg-foreground/[0.07] hover:text-foreground ${size}`}>
          {how === 'missed' ? ACT.missed : ACT.giveUp}
        </button>
      ))}
      <button type="button" data-goal-more title="Not yet: give it seven more days" onClick={(event) => (event.stopPropagation(), more())}
        className={`rounded-full text-muted-foreground transition-colors hover:bg-foreground/[0.07] hover:text-foreground ${size}`}>
        A week more
      </button>
    </span>
  )
}

/**
 * An open goal: the band with its name and how far along, why it matters,
 * the road (a dot a day), then the logs, newest first. Down the right, its
 * dates, the beacon and the ways it can end.
 */
function GoalDetail({ item, top }: { item: ItemFull; top?: React.ReactNode }): React.JSX.Element {
  const today = useToday()
  const settings = useLive(haligtree.settings, null as Settings | null)
  useHomeGoals(settings)
  // A someday goal: no day, so no countdown, no road and nothing warming; its own colour, calm.
  const dateless = someday(item)
  const target = item.goalAt ?? today
  const from = item.goalFrom ?? dayKey(item.createdAt)
  const left = daysLeft(target, today)
  const logs = [...item.glosses].reverse()
  const [picked, setPicked] = useState<Dot | null>(null)
  const why = useRef<PlainHandle>(null)
  const ink = onIce(item) ? ICE : item.closedAt ? 'var(--muted-foreground)' : dateless ? goalInk(item) : warmth(Math.max(left, 0))
  const tint = useTint(null, ink)
  const beacon: Beacon = item.beacon ?? settings?.goalBeacon ?? 'sometimes'
  const setBeacon = (mode: Beacon): void => {
    if (mode === beacon) return
    const was = item.beacon
    chime(mode === 'off' ? 'unstick' : 'stick')
    void haligtree.setBeacon(item.id, mode).then(() =>
      toast(mode === 'always' ? 'On screen, on every Space' : mode === 'sometimes' ? 'On screen now and then: it comes out a few times a day' : 'Off screen: the menu bar and Home still show it',
        () => void haligtree.setBeacon(item.id, was)))
  }
  const setDay = (day: string | null): void => giveDay(item, day, from)
  const moveDates = (dates: { target?: string; from?: string }): void => {
    const was = { target, from }
    void haligtree.goalDates(item.id, dates).then(() => {
      chime('tap')
      quietly(() => void haligtree.goalDates(item.id, was))
    })
  }
  const lastLog = logs[0]?.createdAt
  const iced = onIce(item)
  // The kind, small over the name, with its mark: a goal, a someday goal, on ice, ended.
  const label = <><GoalMark item={item} className="size-3.5 shrink-0" />{iced ? (dateless ? 'Someday goal, on ice' : 'Goal, on ice') : item.closedAt ? (dateless ? (item.closedHow === 'made it' ? 'Someday goal, crossed off' : 'Someday goal, ended') : 'Goal, ended') : dateless ? 'Someday goal' : 'Goal'}</>
  // The date line: the day it is for and when it was set; paused or ended, since when, said first.
  const meta = dateless
    ? [item.closedAt ? settledSaid(item) : `Added ${monthYear(item.createdAt)}`, stepsSaid(logs.length), ...(lastLog ? [`last step ${ago(lastLog)}`] : [])]
    : item.closedAt
      ? [settledSaid(item), `for ${dayMonth(`${target}T12:00`, 'always')}`, logsSaid(logs.length)]
      : [`For ${dayMonth(`${target}T12:00`, 'always')}`, `set ${dayMonth(`${from}T12:00`)}`, ...(lastLog ? [`last log ${ago(lastLog)}`] : [])]
  return (
    <div data-open={item.id} data-iced={iced || undefined} className="note-pane flex min-w-0 flex-[1.4] flex-col overflow-y-auto @[40rem]/page:flex-row @[40rem]/page:overflow-visible @[56rem]/page:border-l [&>*:first-child]:min-h-[16rem] [&>*:first-child]:shrink-0 @[40rem]/page:[&>*:first-child]:min-h-0 @[40rem]/page:[&>*:first-child]:shrink">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto pt-3">
        {/* Where it sits in the list, and on the right its "…", as a task's page has its ✕ there. */}
        <div className="page-column flex min-h-7 w-full items-center gap-2 px-5 @[44rem]/note:px-8">
          {top ?? <span />}
          <span className="ml-auto"><MenuButton small items={pageMenu(item)} /></span>
        </div>
        <CollectionHeader
          tint={tint}
          // No cover and no second number: the title, its date line, then the road's own card says the days once.
          cover={null}
          label={label}
          length={item.title.length}
          meta={meta}
          // The page's one clear action for its kind, when it has one: a someday goal is given a day, an iced one taken off ice.
          actions={(dateless && !item.closedAt) || iced ? <>
            {dateless && !item.closedAt && (
              <DatePicker value={null} onChange={(iso) => iso && setDay(dayKey(iso))} suggest={['in 1 month', 'in 3 months', 'in 1 year']}
                className={`${PRIMARY} bg-primary! text-primary-foreground! hover:bg-primary/85!`}>
                <span data-give-day className="contents"><CalendarPlus className="size-4 shrink-0" />Give it a day</span>
              </DatePicker>
            )}
            {iced && <button type="button" data-take-off-ice onClick={() => thaw(item)} className={`${PRIMARY} bg-primary text-primary-foreground hover:bg-primary/85`}><Snowflake className="size-4 shrink-0" />Take off ice</button>}
          </> : null}
          title={
            <PlainField
              line
              label="The goal"
              className="block w-full pb-[0.12em] text-balance"
              style={iced ? { color: ICE } : undefined}
              data-goal-name
              value={item.title === 'Untitled' ? '' : item.title}
              placeholder="What are you working toward?"
              onSave={(title) => void (title && title !== item.title && haligtree.saveItem(item.id, { title }).then(() => chime('noted')))}
            />}
        />
        {/* One column under the name, on its left edge (the header's own gutters): why, the road, then the log field first under it, then the logs. */}
        <div data-goal-body className="page-column flex w-full flex-col gap-4 px-5 pb-16 @[44rem]/note:px-8">
          <PlainField
            data-goal-why
            value={item.why ?? ''}
            placeholder="Why it matters…"
            label="Why it matters"
            onKey={(event) => {
              if (event.key !== 'Enter' || event.shiftKey) return
              event.preventDefault()
              why.current?.blur()
            }}
            handle={why}
            onSave={(text) => void haligtree.saveItem(item.id, { why: text || null }).then(() => chime('noted'))}
            className="mf-ruled private-text block w-full text-body leading-relaxed text-foreground/85 italic"
          />
          {!dateless && !item.closedAt && left < 0 && (
            <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-accent/25 px-4 py-3">
              <span className="mr-auto min-w-0">
                <span className="block font-medium">Did you make it?</span>
                <span className="block text-body text-foreground">{dayName(`${target}T12:00`)} has passed. Say how it went, and <strong className="font-semibold">it moves to Ended</strong>.</span>
              </span>
              <Answers item={item} />
            </div>
          )}
          {dateless && !item.closedAt && (
            // No road and no days: what the life list is for, in one line, by the steps.
            <p data-someday-said className="text-control leading-snug text-foreground">
              <strong className="font-semibold">On your someday list.</strong> No countdown: log each step you take toward it. When it draws near, “Give it a day” and it counts down under “Goals”.
            </p>
          )}
          {!dateless && <RoadCard item={item} from={from} target={target} today={today} picked={picked} onPick={setPicked} />}
          {dateless && item.closedHow === 'made it' && <CrossedOff id={item.id} day={item.closedAt!} />}
          <Logs item={item} picked={picked} onClear={() => setPicked(null)} />
        </div>
      </div>

      <Props>
        <Island compact title="Goal">
          {/* A someday goal is given its day by the page's own filled “Give it a day”: no second one here, only its colour. */}
          {!dateless && (<>
            {/* Its two dates as facts, each changeable: the day it is for, and the day it started. */}
            <DatePicker value={`${target}T12:00`} onChange={(iso) => iso && dayKey(iso) !== target && moveDates({ target: dayKey(iso) })} suggest={['in 1 month', 'in 3 months', 'in 1 year']}>
              <Flag className="size-4 shrink-0" style={{ color: item.closedAt ? undefined : warmth(Math.max(left, 0)) }} />
              <span data-goal-for className="truncate"><span className="text-muted-foreground">For</span> <span className="text-foreground">{dayMonth(`${target}T12:00`, 'always')}</span></span>
            </DatePicker>
            <DatePicker value={`${from}T12:00`} onChange={(iso) => iso && dayKey(iso) !== from && moveDates({ from: dayKey(iso) })}>
              <CalendarDays className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              <span data-goal-started className="truncate"><span className="text-muted-foreground">Started</span> <span className="text-foreground">{dayMonth(`${from}T12:00`, 'always')}</span></span>
            </DatePicker>
            {!item.closedAt && <Prop icon={ICON(ACT.someday)} onClick={() => setDay(null)} tip="Off the countdown, onto your someday list"><span data-goal-no-day>{ACT.someday}</span></Prop>}
          </>)}
          <GoalColor item={item} />
        </Island>
        {/* How it ends, or that it pauses: what a goal keeper comes to the page for, so near the top. On ice, the page's own filled “Take off ice” is the one way back. */}
        {!iced && <Island compact title={item.closedAt ? 'Ended' : 'How it went'}>
          {endings(item).map((one) => one && one !== 'separator' && (
            <Prop key={one.label} icon={ICON(one.label)} onClick={one.run} tip={one.hint}>{one.label}</Prop>
          ))}
        </Island>}
        {/* On screen is a countdown kept in sight: a someday goal has none to keep. */}
        {!item.closedAt && !dateless && (
          <Island compact title="On screen">
            <div className="flex flex-col gap-1.5 px-2 py-1.5">
              <span className="text-control">Keep this goal on screen</span>
              <Chips options={[{ id: 'always', label: 'Always' }, { id: 'sometimes', label: 'Now and then' }, { id: 'off', label: 'Off' }]}
                on={(id) => id === beacon} pick={(id) => setBeacon(id as Beacon)} />
              <span className="text-meta leading-snug text-muted-foreground">
                {beacon === 'always' ? 'On every Space, whenever sticky notes are out.' : beacon === 'sometimes' ? 'Out a few times a day, then tucked away. In the last week it stays.' : 'The menu bar and Home still show it.'}
              </span>
            </div>
            <Prop icon={ICON(ACT.home(onHome(item)))} active={onHome(item)} onClick={() => setOnHome(item, !onHome(item))} tip={onHome(item) ? 'Shown at the top of Home' : 'Home then shows only the goals you choose, in the order you chose them'}>
              <span data-goal-home={onHome(item) ? 'on' : 'off'}>{ACT.home(onHome(item))}</span>
            </Prop>
          </Island>
        )}
        <Island compact name="Surfacing" title={<Term>Surfacing</Term>}>
          <Prop icon={ICON(ACT.secret(!!item.private))} active={!!item.private} onClick={() => void haligtree.setPrivate('nuggets', item.id, !item.private)}
            tip={item.private ? 'Its name is hidden on the desktop, in the menu bar and on Home' : 'Hide its name on the desktop, in the menu bar and on Home'}>
            {ACT.secret(!!item.private)}
          </Prop>
          {/* Goals pause on ice instead; only one archived before keeps a way back. */}
          {item.archivedAt && (
            <Prop icon={ICON('Unarchive')} active onClick={() => void archive('nuggets', [item.id], false)} tip="Bring it back">Unarchive</Prop>
          )}
        </Island>
      </Props>
    </div>
  )
}

/**
 * A someday goal made: crossed off the life list, with an ink stamp set a
 * little askew, as the welcome's seal is pressed. Pressed once, with its
 * thud, when it was just crossed off here; already there every visit after.
 */
function CrossedOff({ id, day }: { id: string; day: string }): React.JSX.Element {
  const [fresh] = useState(() => !still() && crossing === id && Date.now() - new Date(day).getTime() < 10_000)
  useEffect(() => void (crossing = null), [])
  // The library stamp's oxblood on paper; green would be a badge, this is ink.
  const ink = 'var(--goal-stamp)'
  return (
    <motion.div data-crossed-off aria-label={`Crossed off on ${dayMonth(day)}`} role="img"
      className="pointer-events-none mx-auto mt-5 flex w-fit flex-col items-center rounded-md border-[3px] px-5 py-2 text-center mix-blend-multiply [--goal-stamp:#8c2a1e] dark:mix-blend-normal dark:[--goal-stamp:#d9705e]"
      style={{ borderColor: ink, color: ink, fontFamily: '"Fraunces Variable", Georgia, serif' }}
      initial={fresh ? { opacity: 0, scale: 1.32, rotate: -12 } : false}
      animate={fresh ? { opacity: [0, 0.95, 0.88], scale: [1.32, 0.97, 1], rotate: -6 } : { opacity: 0.88, scale: 1, rotate: -6 }}
      transition={fresh ? { duration: 0.34, times: [0, 0.62, 1], ease: ['easeIn', 'easeOut'], delay: 0.25 } : { duration: 0 }}
      onAnimationComplete={() => fresh && stamp()}>
      <span className="text-[1.35rem] leading-none font-semibold tracking-[0.12em]">CROSSED OFF</span>
      <span className="mt-1 text-[0.8rem] tracking-[0.2em] tabular-nums">{dayMonth(day, 'always').toUpperCase()}</span>
    </motion.div>
  )
}

/** A goal's colour, picked from its swatches: what its items wear where goals are shown together. Undoable. */
function GoalColor({ item }: { item: ItemFull }): React.JSX.Element {
  const now = item.goalColor ?? GOAL_COLORS[0]
  const pick = (color: string): void => {
    if (color === now) return
    chime('tap')
    void haligtree.setGoalColor(item.id, color).then(() => quietly(() => void haligtree.setGoalColor(item.id, now)))
  }
  return (
    <div data-goal-color className="flex flex-col gap-1.5 px-2 py-1.5">
      <span className="text-control">Its colour</span>
      <span className="flex flex-wrap items-center gap-0.5">
        {GOAL_COLORS.map((one) => (
          <Tip key={one} label={one[0].toUpperCase() + one.slice(1)}>
            <button type="button" aria-label={one} aria-pressed={now === one} data-goal-swatch={one} onClick={() => pick(one)}
              className={`grid size-6 place-items-center rounded-full transition-transform hover:scale-110 active:scale-[0.97] ${now === one ? 'ring-2 ring-foreground/30 ring-offset-1 ring-offset-popover' : ''}`}>
              <span className="size-3.5 rounded-full shrink-0" style={{ background: `var(--tt-color-text-${one})` }} />
            </button>
          </Tip>
        ))}
      </span>
    </div>
  )
}

/** How many logs each day has, by "2026-10-07". */
const logDays = (logs: Gloss[]): Map<string, Gloss[]> => {
  const days = new Map<string, Gloss[]>()
  for (const log of logs) {
    const day = dayKey(log.createdAt)
    const list = days.get(day)
    if (list) list.push(log)
    else days.set(day, [log])
  }
  return days
}
/** A dot's logs: its day's, or each day's of its week, looked up a day at a time rather than through every day logged. */
const logsIn = (days: Map<string, Gloss[]>, dot: Dot): Gloss[] => {
  if (dot.day === dot.last) return days.get(dot.day) ?? []
  const out: Gloss[] = []
  for (let at = noon(dot.day), day = dot.day; day <= dot.last; at = at.add(1, 'day'), day = dayKey(at.toDate())) out.push(...(days.get(day) ?? []))
  return out
}

/** What a road needs to draw itself, on the page or on the beacon. */
type RoadProps = {
  /** The goal whose road it is: only the days marked for it show on it. */
  goal: string
  from: string
  target: string
  today: string
  logs: Gloss[]
  picked?: Dot | null
  onPick?: (dot: Dot | null) => void
  compact?: boolean
}

/**
 * The road from the day a goal was set to its day, a dot a day. On its page
 * (Road) every marked dot is named in words and a long road wraps into rows;
 * `compact` is the beacon's dense field (Field), where only the marked dots
 * say what they are when pointed at.
 */
export function Journey(props: RoadProps): React.JSX.Element {
  return <Field {...props} />
}

/** The milestones on a road (the same ones that celebrate) and the days marked for this goal. */
function useMarks(goal: string, from: string, target: string): { milestoneIn: (dot: Dot) => string | undefined; milestoneDay: (dot: Dot) => string | undefined; markIn: (dot: Dot) => Milestone | undefined; marksIn: (dot: Dot) => Milestone[] } {
  const shiftDay = (day: string, by: number): string => { const at = new Date(`${day}T12:00`); at.setDate(at.getDate() + by); return dayKey(at.toISOString()) }
  const span = Math.round((new Date(`${target}T12:00`).getTime() - new Date(`${from}T12:00`).getTime()) / 86_400_000)
  const marks: [string, string][] = [[shiftDay(from, Math.round(span / 2)), 'halfway'], [shiftDay(target, -30), 'a month to go'], [shiftDay(target, -7), 'a week to go']]
  // Days marked for this goal on the road (an exam, a launch): a ring in their colour.
  // A day marked for something else, or for another goal, is not this goal's and stays off its road.
  const marked = useMilestones(from, target).filter((one) => markOf(one) === goal)
  const marksIn = (dot: Dot): Milestone[] => marked.filter((one) => one.day >= dot.day && one.day <= dot.last)
  return {
    milestoneIn: (dot) => marks.find(([day]) => day >= from && day >= dot.day && day <= dot.last)?.[1],
    // Its own day, not its dot's: on a road of weeks a dot is a week, and the key names the day itself.
    milestoneDay: (dot) => marks.find(([day]) => day >= from && day >= dot.day && day <= dot.last)?.[0],
    markIn: (dot) => marksIn(dot)[0],
    marksIn
  }
}

/** A road's day as a small square with soft corners, as every mark in the app is (never a dot): drawn from its centre and half-size. */
const Sq = ({ cx, cy, r, ...rest }: { cx: number; cy: number; r: number } & Omit<React.SVGProps<SVGRectElement>, 'x' | 'y' | 'r'>): React.JSX.Element => (
  <rect x={cx - r} y={cy - r} width={2 * r} height={2 * r} rx={r * 0.45} {...rest} />
)

/** One dot of a road: gone days dim, logged days in the accent, today breathing, the day itself ringed. */
function RoadDot({ dot, x, y, cell, logged, marker, mark, on, compact, onEnter, onClick }: {
  dot: Dot; x: number; y: number; cell: number; logged: boolean; marker?: string; mark?: Milestone; on: boolean; compact: boolean
  onEnter?: () => void; onClick?: () => void
}): React.JSX.Element {
  const colour = logged ? ACCENT : 'currentColor'
  // Quiet by default: days gone are dim, a logged day bright, and only
  // today and the day itself at full strength, so the eye goes to where you are.
  // On the page the plain days are a little stronger: there they are read one by one, not as a field.
  const opacity = dot.today ? 1 : logged ? (dot.past && compact ? 0.7 : 1) : marker ? 0.5 : dot.past ? (compact ? 0.24 : 0.3) : compact ? 0.12 : 0.16
  return (
    <g data-road-day={dot.day} data-road-logged={logged || undefined} onMouseEnter={onEnter} onClick={onClick} className={compact ? undefined : 'cursor-pointer'}>
      {/* A bigger, unseen target, so the pointer finds each one. */}
      {!compact && <rect x={x - cell / 2} y={y - cell / 2} width={cell} height={cell} fill="transparent" />}
      {dot.target && <Sq cx={x} cy={y} r={0.56 * cell} fill="none" stroke={ACCENT} strokeWidth={0.14 * cell} />}
      {dot.today && <Sq cx={x} cy={y} r={0.56 * cell} fill="none" stroke={ACCENT} strokeWidth={0.1 * cell} className="mf-goal-today" />}
      {marker && !dot.target && !dot.today && <Sq cx={x} cy={y} r={0.52 * cell} fill="none" stroke="currentColor" strokeWidth={0.08 * cell} style={{ opacity: 0.6 }} />}
      {mark && !dot.target && <Sq data-road-marked={mark.id} cx={x} cy={y} r={0.56 * cell} fill="none" stroke={inkOf(mark)} strokeWidth={0.12 * cell} />}
      {on && <Sq cx={x} cy={y} r={0.6 * cell} fill="none" stroke="currentColor" strokeWidth={0.08 * cell} />}
      <Sq cx={x} cy={y} r={(dot.target ? 0.32 : dot.today ? 0.4 : 0.34) * cell} fill={dot.target && !logged ? ACCENT : colour} style={{ opacity: dot.target ? 1 : opacity }} />
    </g>
  )
}

/** A dot pointed at on the page: its day, what it marks, and its last log or how far off it is. */
function DotTip({ dot, today, days, milestoneIn, markIn }: { dot: Dot; today: string; days: Map<string, Gloss[]>; milestoneIn: (dot: Dot) => string | undefined; markIn: (dot: Dot) => Milestone | undefined }): React.JSX.Element {
  const shown = logsIn(days, dot)
  const mark = markIn(dot)
  return (
    <>
      <span className="block font-medium">
        {dot.day === dot.last ? dayName(`${dot.day}T12:00`) : `${dayMonth(`${dot.day}T12:00`)} to ${dayMonth(`${dot.last}T12:00`)}`}
        {dot.today ? ' · today' : dot.target ? ' · the day' : milestoneIn(dot) ? ` · ${milestoneIn(dot)}` : ''}
        {mark ? ` · ${mark.icon ? `${mark.icon} ` : ''}${mark.title}` : ''}
      </span>
      <span className="block text-muted-foreground">{shown.length ? `${logsSaid(shown.length)}: ${clip(shown[shown.length - 1].body.replace(/\s+/g, ' '), 81)}` : dot.past || dot.today ? 'No log' : leftSaid(daysLeft(dot.day, today)).toLowerCase()}</span>
    </>
  )
}

/** A road's dot, its gap, and so its step: small and tight, as Mono's charts are (memory: compact-dots). */
const DOT = SHARED_DOT
const GAP = SHARED_GAP
const STEP = DOT + GAP
/** The tightest a road packs to fit a narrow card: 7px dots, a little over 2px apart. */
const TIGHT = 9.3
/** Up to a month, a road is one line of days; longer, a column a week, Monday at the top. */
const ONE_LINE = 31
/** "Nov" for "2026-11-05", "Jan 2027" where a year turns. */
const monthOf = (day: string, year = false): string => { const [, m] = dayMonth(`${day}T12:00`, 'never').split(' '); return year ? `${m} ${day.slice(0, 4)}` : m }

/**
 * A goal's road as one compact card, after Mono's charts: one big number at
 * the top left with small pills beside it, then the road, small dots packed
 * tight, the months named under it. Days gone are solid ink, days ahead barely
 * there, today the brightest dot, logged days in the goal's colour. Up to a
 * month it is one line of days; longer, a column a week, Monday on top, as a
 * year-of-days calendar is; a year of weeks too wide for the card wraps into
 * two half-years, each its own row of whole weeks. More than a year away it is
 * a dot a week, a column a month (journey), and says so; it turns into days
 * by itself once the day is within a year. Marked days (Halfway, A month to
 * go, the goal's own) are ticks over a line or rings round their dot, named in
 * a key under the card. On ice, the road stops on the day it went on ice, in a
 * cool ink; ended, on the day it ended. Pointed at, a dot says its day and its
 * logs; clicked, the logs below show only that day.
 */
function RoadCard({ item, from, target, today: now, picked, onPick }: { item: ItemFull; from: string; target: string; today: string; picked: Dot | null; onPick: (dot: Dot | null) => void }): React.JSX.Element {
  const iced = onIce(item)
  // Frozen where it stopped: on ice since, or ended on, that day.
  const today = item.closedAt ? (dayKey(item.closedAt) < now ? dayKey(item.closedAt) : now) : now
  const road = journey(from, target, today)
  const weeks = road.by === 'week'
  const days = useMemo(() => logDays(item.glosses), [item.glosses])
  const { milestoneIn, milestoneDay, marksIn } = useMarks(item.id, from, target)
  const [hover, setHover] = useState<Dot | null>(null)
  const [width, setWidth] = useState(0)
  // The room the page gives the card, measured outside it: the card itself is only as wide as its road.
  const box = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const node = box.current
    if (!node) return
    const watch = new ResizeObserver(() => setWidth(node.clientWidth))
    watch.observe(node)
    setWidth(node.clientWidth)
    return () => watch.disconnect()
  }, [])
  const line = !weeks && road.dots.length <= ONE_LINE
  // Longer than a line, the calendar shape journey lays out: a column a week (Monday on top), or a column a month of weeks.
  const across = line ? road.dots.length : road.cols
  const rows = line ? 1 : road.rows
  const room = (width || 640) - 26
  // One map while every column fits at 7px dots. Wider (a year of weeks beside the list), whole columns wrap into even
  // bands, two half-years for a year, each with its own months under it: never a gap in the middle of a row.
  const bands = Math.max(1, Math.ceil((across * TIGHT - (TIGHT - 7)) / room))
  const per = Math.ceil(across / bands)
  const step = Math.min(STEP, Math.max(TIGHT, room / per))
  const dot = step >= STEP ? DOT : Math.max(7, Math.min(DOT, step - 2.3))
  const placed = road.dots.map((one, index) => {
    const col = line ? index : one.col
    return { dot: one, band: Math.floor(col / per), x: (col % per) * step + dot / 2, y: (line ? 0 : one.row) * step + dot / 2 }
  })
  const mapWidth = per * step - (step - dot)
  const mapHeight = rows * step - (step - dot)
  // The time before the goal was set, very faint and silent, so the road's field reaches across the card: only room filled,
  // never a date to read. As the desktop card's field does. A road of days, or one that wraps into bands, stands as it is on a line.
  // No field of faint days before the road: it filled most of the card with nothing to read and pushed the road to its edge.
  const ghost = 0
  const ghostWidth = ghost * step
  const left = daysLeft(target, today)
  const ink = iced ? ICE : 'var(--foreground)'
  const lit = goalInk(item)
  // Every marked day, named once in the key, in road order: today, the milestones, the goal's own days, the day itself.
  const marks = placed.flatMap(({ dot }) => {
    // `day` is the dot it marks, `on` the day it names (a week's dot names the day inside it).
    const out: { day: string; on: string; word: string; ink: string }[] = []
    const milestone = milestoneIn(dot)
    // A road of weeks has no room for "a month to go" and "a week to go" beside the day itself: they come with the days, within a year.
    const near = weeks && daysBetween(milestoneDay(dot) ?? dot.day, target) < 45
    if (milestone && !dot.target && !near) out.push({ day: dot.day, on: milestoneDay(dot) ?? dot.day, word: milestone[0].toUpperCase() + milestone.slice(1), ink: 'var(--foreground)' })
    for (const one of marksIn(dot)) out.push({ day: dot.day, on: one.day, word: clip(one.title, 28), ink: inkOf(one) })
    if (dot.target) out.push({ day: dot.day, on: target, word: 'The day', ink: ACCENT })
    return out
  })
  const ticked = new Map(marks.map((one) => [one.day, one.ink]))
  const shownHover = hover && placed.find((one) => one.dot.day === hover.day)
  // The months under a band, a name where a month starts (the year where it turns, or on a band's first name when it is not this year), never two touching.
  const monthsUnder = (here: typeof placed): { x: number; label: string }[] => {
    const under: { x: number; label: string }[] = []
    const columns = new Map<number, string>()
    for (const { dot: one, x } of here) if (!columns.has(x)) columns.set(x, one.day)
    let before = ''
    for (const [x, day] of columns) {
      const month = day.slice(0, 7)
      if (month !== before) {
        // The first name carries its year when the band reaches into another year, so "Apr" never sits beside "Jan 2027" bare.
        const label = monthOf(day, !under.length ? day.slice(0, 4) !== now.slice(0, 4) || here.at(-1)!.dot.last.slice(0, 4) !== day.slice(0, 4) : day.slice(5, 7) === '01')
        const at = x - dot / 2
        const was = under.at(-1)
        if (!was || was.x + was.label.length * 6.4 + 6 <= at) under.push({ x: at, label })
      }
      before = month
    }
    return under
  }
  const unit = weeks ? 'weeks' : 'days'
  // One unit throughout: a road of weeks counts in weeks, a road of days in days.
  const each = weeks ? 'week' : 'day'
  const gonePlaced = placed.filter(({ dot: one }) => one.past || one.today)
  const loggedDots = gonePlaced.filter(({ dot: one }) => logsIn(days, one).length > 0).length
  const leftIn = left > 0 && weeks ? Math.ceil(left / 7) : left
  // The marks named on the road itself, under their dots: the day, now, your own days, then the milestones,
  // each where it is; one that would run into a name already placed is left to its dot's tip.
  const nowWord = iced ? 'Went on ice' : item.closedAt ? 'Ended' : weeks ? 'This week' : 'Today'
  const named = [
    ...placed.filter(({ dot: one }) => one.target).map((one) => ({ ...one, word: 'The day', ink: ACCENT, rank: 0 })),
    ...placed.filter(({ dot: one }) => one.today).map((one) => ({ ...one, word: nowWord, ink: iced ? ICE : ACCENT, rank: 1 })),
    ...marks.filter((one) => one.word !== 'The day').map((one) => ({ ...placed.find((at) => at.dot.day === one.day)!, word: one.word, ink: one.ink === 'var(--foreground)' ? 'var(--muted-foreground)' : one.ink, rank: 2 }))
  ].filter((one) => one.dot)
  const wordsUnder = (band: number): { x: number; word: string; ink: string; end: boolean }[] => {
    const out: { from: number; to: number; x: number; word: string; ink: string; end: boolean }[] = []
    for (const one of named.filter((at) => at.band === band).sort((a, b) => a.rank - b.rank)) {
      const wide = one.word.length * 6.2 + 4
      const end = one.x - dot / 2 + wide > mapWidth
      const from = end ? one.x + dot / 2 - wide : one.x - dot / 2
      if (from < 0 || out.some((was) => from < was.to + 8 && from + wide > was.from - 8)) continue
      out.push({ from, to: from + wide, x: one.x, word: one.word, ink: one.ink, end })
    }
    return out
  }
  return (
    <div ref={box} className="w-full">
    <section data-road-card data-road-by={road.by} aria-label="The road" className="mf-chart w-fit max-w-full" style={{ minWidth: mapWidth + 26 }}>
      {/* The one number, large, and beside it what it means, small. */}
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span data-goal-left className="mf-big-number text-[1.5rem] leading-none tracking-[-0.02em]" style={{ color: iced ? ICE : !item.closedAt && left <= 30 ? warmth(Math.max(left, 0)) : 'var(--foreground)' }}>
          {left === 0 ? 'Today' : left < 0 ? leftSaid(left) : plural(leftIn, each)}
        </span>
        <span className="text-meta text-muted-foreground">{iced ? 'left when it went on ice' : item.closedAt ? 'left when it ended' : left === 0 ? 'is the day' : left < 0 ? 'past the day' : `to ${dayMonth(`${target}T12:00`)}`}</span>
        <span className="flex flex-wrap gap-1 self-center">
          <span data-road-pill className="rounded-sm bg-foreground/[0.07] px-1.5 py-px text-meta text-foreground tabular-nums">{percent(wayThrough(from, target, new Date(`${today}T${today === now ? new Date().toTimeString().slice(0, 8) : '23:59:59'}`)))} gone</span>
          {/* Nothing logged yet says nothing: the count turns up with the first log. */}
          {loggedDots > 0 && <span data-road-pill data-road-logged-count className="rounded-sm bg-foreground/[0.07] px-1.5 py-px text-meta text-foreground tabular-nums">{num(loggedDots)} of {plural(gonePlaced.length, each)} logged</span>}
          {iced && <span data-road-pill className="rounded-sm px-1.5 py-px text-meta" style={{ color: ICE, background: `color-mix(in oklab, ${ICE} 14%, transparent)` }}>Frozen {dayMonth(`${today}T12:00`)}</span>}
        </span>
      </div>
      {/* How to read it, in one line: what a dot is, and which have gone. */}
      <p data-road-rule className="mt-1.5 text-meta text-(--mf-muted-strong)">Each square is a {each}, the solid ones gone</p>
      <div className="mt-3" onMouseLeave={() => setHover(null)}>
        {width > 0 && Array.from({ length: bands }, (_, band) => {
          const here = placed.filter((one) => one.band === band)
          if (!here.length) return null
          const under = monthsUnder(here)
          return (
            <div key={band} data-road-band={band} className={`relative ${band ? 'mt-2.5' : ''}`} style={ghost ? { marginLeft: ghostWidth } : undefined}>
              {/* 5 down: the road's own drawing keeps 5 above its dots, for the ticks. */}
              {ghost > 0 && (
                <svg aria-hidden data-road-ghost width={ghostWidth} height={mapHeight} className="pointer-events-none absolute" style={{ left: -ghostWidth, top: 5 }}>
                  {Array.from({ length: ghost }, (_, col) => Array.from({ length: rows }, (_, row) => (
                    // A road of weeks has four weeks to most months: its last row is sparse, as the road's own is.
                    weeks && row === rows - 1 && col % 3 !== 1 ? null : <rect key={`${col}-${row}`} x={col * step} y={row * step} width={dot} height={dot} rx={2} fill="var(--foreground)" opacity={0.05} />
                  )))}
                </svg>
              )}
              <svg role="img" aria-label={`${dayMonth(`${here[0].dot.day}T12:00`)} to ${dayMonth(`${here.at(-1)!.dot.last}T12:00`)}, a dot a ${road.by}: ${num(here.filter((one) => one.dot.past).length)} of ${num(here.length)} ${unit} gone`}
                width={mapWidth} height={mapHeight + 5} viewBox={`0 -5 ${mapWidth} ${mapHeight + 5}`} className="block overflow-visible">
                {here.map(({ dot: one, x, y }) => {
                  const has = logsIn(days, one).length > 0
                  const tick = ticked.get(one.day) ?? (one.target ? ACCENT : undefined)
                  return (
                    <g key={one.day} data-road-day={one.day} data-road-now={one.today || undefined} data-road-logged={has || undefined} className="cursor-pointer"
                      onMouseEnter={() => setHover(one)} onClick={() => (chime('tap'), onPick(picked?.day === one.day ? null : one))}>
                      {/* The whole cell is its target, gap and all. */}
                      <rect x={x - step / 2} y={y - step / 2} width={step} height={step} fill="transparent" />
                      {/* A marked day: a tick over a line of days, a ring round its dot in a block; named in the key below. */}
                      {tick && line && <rect data-road-tick x={x - 0.75} y={y - dot / 2 - 5} width={1.5} height={3.5} rx={0.75} fill={tick} />}
                      {tick && !line && <rect data-road-tick x={x - dot / 2 - 1.2} y={y - dot / 2 - 1.2} width={dot + 2.4} height={dot + 2.4} rx={3} fill="none" stroke={tick} strokeWidth={1} />}
                      <rect data-dot x={x - dot / 2} y={y - dot / 2} width={dot} height={dot} rx={2}
                        fill={one.today ? (iced ? ICE : ACCENT) : has ? lit : ink}
                        opacity={one.today || has ? 1 : one.past ? (iced ? 0.55 : 0.82) : 0.13} />
                      {picked?.day === one.day && <rect x={x - dot / 2 - 1.25} y={y - dot / 2 - 1.25} width={dot + 2.5} height={dot + 2.5} rx={3} fill="none" stroke="var(--foreground)" strokeWidth={1} />}
                    </g>
                  )
                })}
              </svg>
              <div aria-hidden className="relative mt-1 h-3.5 text-[11px] leading-none text-muted-foreground" style={{ width: mapWidth }}>
                {under.map((month) => <span key={month.x} className="absolute top-0 whitespace-nowrap" style={month.x + month.label.length * 6.5 + 2 > mapWidth ? { right: 0 } : { left: month.x }}>{month.label}</span>)}
              </div>
              {/* The marks named where they are, under their dots. */}
              {wordsUnder(band).length > 0 && (
                <div data-road-names className="relative mt-1 h-3.5 text-[11px] leading-none font-medium" style={{ width: mapWidth }}>
                  {wordsUnder(band).map((one) => (
                    <span key={one.word} data-road-label className="absolute top-0 whitespace-nowrap" style={{ color: one.ink, ...(one.end ? { right: mapWidth - one.x - dot / 2 } : { left: one.x - dot / 2 }) }}>{one.word}</span>
                  ))}
                </div>
              )}
              {shownHover && shownHover.band === band && (
                <div data-road-tip className={`pointer-events-none absolute z-10 w-max max-w-64 ${TIP} ${shownHover.x < mapWidth / 3 ? '-translate-x-3' : shownHover.x > (mapWidth * 2) / 3 ? '-translate-x-[calc(100%-0.75rem)]' : '-translate-x-1/2'}`}
                  style={{ left: shownHover.x, top: shownHover.y + step + 4 }}>
                  <DotTip dot={shownHover.dot} today={today} days={days} milestoneIn={milestoneIn} markIn={(one) => marksIn(one)[0]} />
                </div>
              )}
            </div>
          )
        })}
      </div>
    </section>
    </div>
  )
}

/**
 * The beacon's road: a dense field, like a phone's dot widget: small dots,
 * day after day, left to right, filling the card. The days before the goal
 * was set fill the rows ahead of it, faint, so the field is always full and
 * the goal's own days sit at its end, the day itself last. The card is
 * dragged by its whole face, so the marked dots get a spot each to point at.
 */
function Field({ goal, from, target, today, logs }: RoadProps): React.JSX.Element {
  const road = journey(from, target, today)
  const days = useMemo(() => logDays(logs), [logs])
  const { milestoneIn, markIn } = useMarks(goal, from, target)
  const [hover, setHover] = useState<Dot | null>(null)
  const most = 12
  const [width, setWidth] = useState(0)
  const [height, setHeight] = useState(0)
  const box = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const node = box.current
    if (!node) return
    const measure = (): void => (setWidth(node.clientWidth), setHeight(node.clientHeight))
    const watch = new ResizeObserver(measure)
    watch.observe(node)
    measure()
    return () => watch.disconnect()
  }, [])
  const flow = width > 0
  // A long road (a goal a year away) packs its dots smaller until it fits the card.
  let across = flow ? Math.max(7, Math.floor(width / 9)) : road.cols
  while (flow && height > 0 && across < width / 3 && Math.ceil(road.dots.length / across) * (width / across) > height) across += 1
  const room = flow ? Math.max(Math.ceil(road.dots.length / across), Math.floor(height / (width / across))) : 0
  const lead = flow ? Math.min(365, Math.max(0, room * across - road.dots.length)) : 0
  const down = flow ? Math.ceil((lead + road.dots.length) / across) : road.rows
  const place = (dot: Dot, index: number): Dot => (flow ? { ...dot, col: (index + lead) % across, row: Math.floor((index + lead) / across) } : dot)
  const step = width ? width / across : most
  const cell = flow ? step : Math.min(step, most)
  const at = (dot: Dot): { x: number; y: number } => ({ x: (dot.col + 0.5) * step, y: (dot.row + 0.5) * cell })
  return (
    <div ref={box} className="relative h-full w-full">
      <svg
        role="img"
        aria-label={`${num(road.dots.length)} ${road.by === 'day' ? 'days' : 'weeks'} from ${dayMonth(`${from}T12:00`)} to ${dayMonth(`${target}T12:00`)}, ${num(road.dots.filter((dot) => dot.past).length)} gone`}
        viewBox={`0 0 ${across * step} ${down * cell}`}
        className="block h-auto w-full overflow-visible"
        onMouseLeave={() => setHover(null)}
      >
        {Array.from({ length: lead }, (_, index) => (
          <Sq key={`before-${index}`} cx={((index % across) + 0.5) * step} cy={(Math.floor(index / across) + 0.5) * cell} r={0.34 * cell} fill="currentColor" style={{ opacity: 0.06 }} />
        ))}
        {road.dots.map((given, index) => {
          const dot = place(given, index)
          return <RoadDot key={dot.day} dot={dot} x={at(dot).x} y={at(dot).y} cell={cell} logged={logsIn(days, dot).length > 0} marker={milestoneIn(dot)} mark={markIn(dot)} on={false} compact />
        })}
      </svg>
      {road.dots.map((given, index) => {
        const dot = place(given, index)
        if (!dot.today && !dot.target && !milestoneIn(dot) && !markIn(dot) && !logsIn(days, dot).length) return null
        const { x, y } = at(dot)
        return <span key={dot.day} aria-hidden data-road-mark onMouseEnter={() => setHover(dot)} onMouseLeave={() => setHover(null)}
          className="absolute rounded-full" style={{ left: x - cell * 0.6, top: y - cell * 0.6, width: cell * 1.2, height: cell * 1.2, WebkitAppRegion: 'no-drag' } as React.CSSProperties} />
      })}
      {hover && (() => {
        const { x, y } = at(hover)
        const date = dayMonth(`${hover.day}T12:00`)
        const marker = milestoneIn(hover)
        const head = hover.today ? `Today · ${leftSaid(daysLeft(target, today)).toLowerCase()}` : hover.target ? `${date} · the day` : marker ? `${marker[0].toUpperCase()}${marker.slice(1)} · ${date}` : date
        const named = markIn(hover)
        const said = logsIn(days, hover)
        // Inside the little window: under the dot in the top half, over it in the bottom; from the nearer side.
        const below = y < height / 2
        const side = x < width / 3 ? { left: 0 } : x > (width * 2) / 3 ? { right: 0 } : { left: x, transform: 'translateX(-50%)' }
        return (
          <div className={`pointer-events-none absolute z-10 w-max max-w-full ${TIP}`}
            style={{ ...side, ...(below ? { top: y + cell * 0.8 } : { bottom: height - y + cell * 0.8 }) }}>
            <span className="block font-medium">{head}{named ? ` · ${named.title}` : ''}</span>
            {said.length > 0 && <span className="block max-w-56 truncate text-muted-foreground">{logsSaid(said.length)}: {said[said.length - 1].body.replace(/\s+/g, ' ')}</span>}
          </div>
        )
      })()}
    </div>
  )
}

/**
 * The logs: dated, newest first, one row each. A line at the top takes the
 * next one; a day picked on the road shows that day's alone.
 */
function Logs({ item, picked, onClear }: { item: ItemFull; picked: Dot | null; onClear: () => void }): React.JSX.Element {
  const [words, setWords] = useState('')
  const logField = useRef<PlainHandle>(null)
  const all = [...item.glosses].reverse()
  const logs = picked ? all.filter((log) => dayKey(log.createdAt) >= picked.day && dayKey(log.createdAt) <= picked.last) : all
  // Several logs at once: ⇧- or ⌘-click, x, ⌘A, ⌫ removes them with one Undo, Esc lets go.
  const list = useRef<HTMLOListElement>(null)
  const lines = usePickLines(logs.map((log) => log.id), list, { one: 'log', many: 'logs' })
  // The newest few, then more a press at a time, as a task's log has them: a goal kept for years
  // has thousands, and drawing every one held the window for seconds as the goal opened.
  const few = useShowMore(logs, LOG_FEW, `${item.id} ${picked?.day ?? ''}`)
  const keep = (): void => {
    const text = words.trim()
    if (!text) return
    setWords('')
    // Written as a list: a log a line, with one Undo.
    void keepLines(item.id, text).then((many) => {
      if (!many) return keepOne()
      chime('mark')
      quietly(() => (void dropLines(many), setWords((now) => (now.trim() ? `${text}\n${now}` : text))))
    })
    const keepOne = (): void => void haligtree.addClue(item.id, text).then((log) => {
      chime('mark')
      // Taken back, the words are in the line again, ahead of anything typed since.
      quietly(log ? () => (void haligtree.dropClue(log), setWords((now) => (now.trim() ? `${text}\n${now}` : text))) : undefined)
    })
  }
  return (
    <>
      {/* The page's main act, first under the road: write what you did, Enter keeps it. */}
      {!item.closedAt && (
        <div data-log-box className="flex items-start gap-2 rounded-lg border bg-accent/30 px-3 py-2 focus-within:border-foreground/25">
          <Plus aria-hidden className="mt-1 size-3.5 shrink-0 text-muted-foreground" />
          <PlainField
            data-log-field
            handle={logField}
            vimStart="insert"
            value={words}
            label={someday(item) ? 'Log a step' : 'Add a log'}
            onChange={setWords}
            onKey={(event) => {
              event.stopPropagation()
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault()
                keep()
              }
              if (event.key === 'Escape') (event.preventDefault(), logField.current?.blur())
            }}
            placeholder={someday(item) ? 'A step: what you did toward it, what you found out' : 'A log: what you did, where it stands, what you think'}
            className="min-w-0 flex-1 text-control"
          />
          {words.trim() && <span className="mt-0.5 flex shrink-0 items-center gap-1 text-xs text-muted-foreground"><Kbd>↵</Kbd></span>}
        </div>
      )}
    <section data-chrome className="w-full border-t pt-4 text-body">
      <h3 className="mb-2 flex items-baseline gap-1.5 text-meta text-muted-foreground">
        <span data-someday-steps={someday(item) || undefined}>{someday(item) ? 'Steps so far' : 'Progress log'}</span> {all.length > 0 && <Rolling text={all.length} className="tabular-nums" />}
        {picked && (
          <button type="button" onClick={() => (chime('tap'), onClear())} className="ml-auto flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs text-(--mf-muted-strong) hover:bg-accent">
            {picked.day === picked.last ? dayMonth(`${picked.day}T12:00`) : `Week of ${dayMonth(`${picked.day}T12:00`)}`} <X className="size-3" />
          </button>
        )}
      </h3>
      {logs.length ? (
        <ol ref={list} className="-mx-2 flex flex-col">
          <AnimatePresence initial={false}>
            {few.shown.map((log) => {
              const menu: MenuItem[] = lines.picked(log.id) && lines.count > 1 ? [
                { label: `Copy ${num(lines.count)} logs`, run: () => copy(logs.filter((one) => lines.picked(one.id)).map((one) => one.body).join('\n')) },
                'separator',
                { label: `Remove ${num(lines.count)} logs`, keys: '⌫', danger: true, run: () => lines.remove(logs.filter((one) => lines.picked(one.id)).map((one) => one.id)) },
                'separator',
                lines.count < logs.length && { label: 'Select all', about: 'list', keys: '⌘A', run: lines.all },
                { label: 'Clear the selection', keys: 'esc', run: lines.clear }
              ] : [
                { label: 'Change the words…', run: () => void reword(log.id, log.body, 'log') },
                { label: 'Copy the log', run: () => copy(log.body) },
                'separator',
                { label: 'Remove the log', keys: '⌫', danger: true, run: () => lines.remove([log.id]) },
                'separator',
                { label: lines.picked(log.id) ? 'Unselect' : 'Select', about: 'list', keys: 'X', run: () => lines.toggle(log.id) },
                lines.count < logs.length && { label: 'Select all', about: 'list', keys: '⌘A', run: lines.all }
              ]
              return (
                <RowMenu key={log.id} items={menu}>
                  <motion.li
                    layout="position"
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, transition: { duration: 0.12 } }}
                    transition={{ duration: 0.18, ease: EASE }}
                    data-line-id={log.id}
                    data-picked={lines.picked(log.id) || undefined}
                    tabIndex={-1}
                    onClickCapture={(event) => lines.click(event, log.id) && event.stopPropagation()}
                    className={`group/track relative grid grid-cols-[4.5rem_1fr] items-start gap-2.5 rounded-md px-2 py-1.5 pr-9 outline-none hover:bg-foreground/[0.055] has-[[data-state=open]]:bg-foreground/[0.055] ${PICKED_MARK}`}
                  >
                    <Tip label={dayName(log.createdAt)}>
                      <span className="pt-px text-xs text-muted-foreground tabular-nums">{dayMonth(log.createdAt)}</span>
                    </Tip>
                    <span className="min-w-0">
                      <span className="private-text block whitespace-pre-line">{log.body}</span>
                      {log.sourceKey && <span className="text-xs text-muted-foreground">from {log.sourceKey}</span>}
                    </span>
                    <span className="absolute top-0.5 right-1 opacity-0 group-focus-within/track:opacity-100 group-hover/track:opacity-100 has-[[data-state=open]]:opacity-100"><MenuButton small items={menu} /></span>
                  </motion.li>
                </RowMenu>
              )
            })}
          </AnimatePresence>
        </ol>
      ) : (
        <p className="pb-2 text-control text-muted-foreground">
          <span data-log-empty>{picked ? 'No log that day.' : item.closedAt ? 'No logs were kept.' : someday(item) ? 'No steps yet: write the first above.' : 'Nothing logged yet: write the first above.'}</span>
        </p>
      )}
      <ShowMore total={logs.length} shown={few.shown.length} few={LOG_FEW} onMore={few.onMore} onFewer={few.onFewer} className="-mx-1 mb-1" />
    </section>
    </>
  )
}

/** How many logs show before "Show more". */
const LOG_FEW = 50

/** A goal's road as a bar, one look on Home and the Goals page, in the style Settings picks: its warmth in the last month, plain before. */
export function GoalBar({ left, way, className = '' }: { left: number; way: number; className?: string }): React.JSX.Element {
  const warm = left <= 30 ? warmth(Math.max(left, 0)) : null
  const ink = warm ? `color-mix(in oklab, ${warm} 55%, transparent)` : LINE_INK
  return <ProgressBar value={way} label={`${percent(way)} of the time gone`} className={className} thick={3} ink={ink} fill={ink} blade={warm ?? 'var(--tt-color-text-blue)'} />
}

/**
 * The open goals, quiet, at the top of Home and Today's page: nearest first,
 * two at most and how many more. Each says its days left, a thin line of the
 * time gone, and when it was last logged. Past its day, it asks how it went.
 */
export function GoalStrip({ onOpen, className = '' }: { onOpen?: (type: string, id: string) => void; className?: string }): React.JSX.Element | null {
  const settings = useLive(haligtree.settings, null as Settings | null)
  const all = useLive(() => haligtree.items('goal'), [] as Item[], [], ['item'])
  // Whatever page it is on waits for it (lib/reads-in.tsx): never a card popping in over the rest.
  useReading(!settings || unloaded(all))
  const today = useToday()
  const home = useHomeGoals(settings)
  const open = openOnes(all)
  // Off until asked for; then the nearest few, or only the chosen, in the order they were put.
  const shown = goalsForHome(open, home)
  if (!shown.length) return null
  const chosen = home.mode === 'chosen'
  return (
    <div className={`flex flex-col ${className}`} role="group" aria-label="Goals" data-goals-home={home.mode}>
      {shown.map((goal, at) => {
        const left = daysLeft(goal.goalAt!, today)
        const way = wayThrough(goal.goalFrom ?? today, goal.goalAt!)
        // Right-click: this goal here, its place among the chosen, what Home shows at all, and the strip put away.
        const menu: MenuItem[] = [
          { label: 'Open the goal', run: () => onOpen?.('goal', goal.id) },
          chosen && at > 0 && { label: 'Move up', keys: '⌥↑', run: () => moveOnHome(goal, -1) },
          chosen && at < shown.length - 1 && { label: 'Move down', keys: '⌥↓', run: () => moveOnHome(goal, 1) },
          chosen ? { label: 'Take off Home', run: () => setOnHome(goal, false) } : { label: 'Show only this one', hint: 'Home then shows the goals you choose', run: () => setOnHome(goal, true) },
          'separator',
          { label: 'Choose what shows here…', hint: 'In Settings', run: () => window.dispatchEvent(new CustomEvent('haligtree:settings-at', { detail: 'goals-home' })) },
          { label: 'Hide goals here', run: hideStrip }
        ]
        return (
          <RowMenu key={goal.id} items={menu}>
          <div role="button" tabIndex={0} data-strip-goal={goal.id} data-private={goal.private ? '' : undefined}
            onClick={() => (chime('open'), onOpen?.('goal', goal.id))}
            onKeyDown={(event) => {
              if (event.target !== event.currentTarget) return
              if (event.key === 'Enter') return void onOpen?.('goal', goal.id)
              // Among the chosen, ⌥↑ and ⌥↓ (or ⌥K and ⌥J) move it, as they move a row in any list of your own order.
              const by = !chosen || !event.altKey || event.metaKey || event.ctrlKey ? 0 : event.code === 'ArrowUp' || event.code === 'KeyK' ? -1 : event.code === 'ArrowDown' || event.code === 'KeyJ' ? 1 : 0
              if (!by) return
              event.preventDefault()
              moveOnHome(goal, by as -1 | 1)
              // The row keeps the keys as it moves: the same goal, in its new place.
              const id = goal.id
              requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-strip-goal="${CSS.escape(id)}"]`)?.focus())
            }}
            className="group/goal flex cursor-pointer flex-col gap-1.5 rounded-md px-2 py-1.5 text-control outline-none transition-colors hover:bg-foreground/[0.045] focus-visible:bg-foreground/[0.045]">
            <span className="flex min-w-0 items-center gap-2">
              <Flag className="size-3.5 shrink-0" style={{ color: warmth(Math.max(left, 0)) }} />
              <span className="private-text min-w-0 flex-1 truncate font-medium text-foreground">{goal.title}</span>
              {left < 0 ? (
                <>
                  <span className="shrink-0 font-medium text-foreground">Did you make it?</span>
                  <Answers item={goal} small />
                </>
              ) : (
                <>
                  <span {...loud(leftLoud(left), 'shrink-0 font-semibold tabular-nums')}>{left === 0 ? 'Today' : leftSaid(left)}</span>
                  <span className="hidden shrink-0 text-(--mf-muted-strong) @[36rem]/page:inline">· {goal.lastLog ? `last log ${ago(goal.lastLog)}` : 'no logs yet'}</span>
                </>
              )}
            </span>
            <GoalBar left={left} way={way} className="ml-5.5" />
          </div>
          </RowMenu>
        )
      })}
      {open.length > shown.length && (
        <button type="button" data-goal-more-count onClick={() => (chime('tap'), onOpen?.('view', 'goals'))} className="inline-flex min-h-6 items-center self-start rounded-md px-2 text-meta text-muted-foreground transition-colors duration-80 hover:bg-accent/60 hover:text-foreground">
          {open.length - shown.length} more {open.length - shown.length === 1 ? 'goal' : 'goals'}, in Goals →
        </button>
      )}
    </div>
  )
}

/** The goals a log can go to: the three nearest still ahead (one past its day wants an answer, not a log). */
export const goalsToLog = (all: Item[]): Item[] => openOnes(all).filter((one) => daysLeft(one.goalAt!) >= 0).slice(0, 3)

/**
 * The open goals, small, under the writing in the box: one click logs what
 * you wrote against that goal, nothing captured.
 */
export function GoalChips({ onPick, className = '', only }: { onPick: (goal: Item) => void; className?: string; /** Only the ones this says yes to: the box offers those its words are about. */ only?: (title: string) => boolean }): React.JSX.Element | null {
  const all = useLive(() => haligtree.items('goal'), [] as Item[], [], ['item'])
  // The three nearest still ahead: one past its day wants an answer, not a log.
  const open = goalsToLog(all).filter((one) => !only || only(one.title))
  if (!open.length) return null
  const short = (text: string): string => clip(text, 24) || 'New note'
  return (
    <div className={`flex min-w-0 flex-wrap items-center gap-1 text-xs text-muted-foreground ${className}`}>
      <span className="mr-0.5 flex shrink-0 items-center gap-1.5">
        <Flag className="size-3.5" />
        Log to
      </span>
      <AnimatePresence initial={false}>
        {open.map((goal, index) => (
          <motion.span key={goal.id} layout="position" initial={{ opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.92 }}
            transition={{ duration: 0.18, delay: index * 0.025, ease: EASE }}>
            <Tip label={`${goal.title} · ${leftSaid(daysLeft(goal.goalAt!)).toLowerCase()}`}>
              <button type="button" onClick={() => onPick(goal)} data-private={goal.private ? '' : undefined}
                className="private-text max-w-48 truncate rounded-full border px-2 py-0.5 text-(--mf-muted-strong) transition-colors hover:border-foreground/30 hover:bg-accent hover:text-foreground">
                {short(goal.title)}
              </button>
            </Tip>
          </motion.span>
        ))}
      </AnimatePresence>
    </div>
  )
}

/** Words written in the box, logged against a goal; an open capture moves into it. Undoable. */
export async function logInto(goal: Item, from: { captureId?: string; text?: string }, onUndo?: () => void): Promise<boolean> {
  const log = await haligtree.addClue(goal.id, from.text ?? '', from.captureId)
  if (!log) {
    refuse('That capture was already dealt with. Put it back in the Inbox first')
    return false
  }
  chime('mark')
  toast(`Logged to ${quoted(goal.title, 36)}`, () => void haligtree.dropClue(log).then(() => (chime('undo'), onUndo?.())))
  return true
}

