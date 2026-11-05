import { dropLines, keepLines } from '@/lib/clue-lines'
import { TIP } from '@/lib/float'
import { ReadsIn, useReading } from '@/lib/reads-in'
import { binItem } from '@/lib/to-bin'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useToday } from '@/lib/use-today'
import { CalendarOff, CalendarPlus, Flag, House, Mountain, Plus, Snowflake, StickyNote, Wind } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import SimpleCheckedIcon from '@/components/ui/simple-checked-icon'

import { EASE, still } from '@/lib/motion'
import { chime, stamp } from '@/lib/sound'
import { unloaded, useLastAsked, useLive, haligtree, type Gloss, type Item, type ItemFull, type Settings } from '@/lib/haligtree'
import { exampleGoals } from '@/lib/examples'
import { Example } from './example'
import { archive } from '@/lib/notes'
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
import { Empty, Island, Kbd, Page, Prop, Props, Rolling, Stepper, Tip, refuse, toast, useListKeys, quietly } from './ui'
import { reword } from './questions-view'
import { Term } from './term'
import { CollectionHeader, Cover, MenuButton, QuietAction, useTint } from './collection-header'
import { DatePicker } from './date-picker'
import { ago, dayKey, dayMonth, dayName, noon, num, plural } from '../../../../main/dates'
import { ProgressBar, type BarStyle } from './progress-bar'
import { inkOf, useMilestones, type Milestone } from '@/lib/milestones'
import { stickOnDesktop } from './sticky-note'
import { usePickNotes } from './pick-notes'
import { asideItem, useHere } from '@/lib/split'
import { ROAD_DAYS, daysBetween, daysLeft, journey, leftSaid, percent, wayThrough, type Dot } from '../../../../main/goal-days'
import { leftLoud, loud } from '@/lib/loud'
import { clip, quoted } from '../../../../main/clip'
import { ArchiveRestore, Check, Eye, EyeOff, X } from '@/components/ui/icons'

/**
 * Goals: a day you are working toward, kept in front of you until it comes.
 * A goal is a nugget row with its own tier, as a question is: it never rots
 * and is never reviewed. It holds dated logs (the same glosses a question's
 * clues are) and shows the road from the day it was set to the day it is
 * for, a dot a day. Once the day has passed it asks how it went.
 */

type Beacon = 'always' | 'sometimes' | 'off'
const ACCENT = 'var(--tt-brand-color-400)'

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

/** Whether a goal is chosen for Home: kept in starred_at, which only practice cards otherwise use. */
const onHome = (goal: Item): boolean => !!goal.starredAt
/** Choose a goal for the strip on Home and Today's page, or take it off; undoable. */
const setOnHome = (goal: Item, on: boolean): void => {
  chime(on ? 'stick' : 'unstick')
  void haligtree.star(goal.id, on).then(() =>
    toast(on ? 'Shown on Home: only the goals you choose show there' : 'Off Home', () => void haligtree.star(goal.id, !on)))
}

/** The goals strip put away from Home and today's Journal page; undoable, and Settings › Goals brings it back. */
const hideStrip = (): void => {
  chime('unstick')
  void haligtree.setSettings({ goalStrip: false }).then(() =>
    toast('Goals hidden here. “Goals at the top” in Settings brings them back', () => void haligtree.setSettings({ goalStrip: true })))
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
/** Which tab of Goals one sits under. */
type Tab = 'open' | 'settled' | 'iced'
const tabOf = (item: Item): Tab => (onIce(item) ? 'iced' : item.closedAt ? 'settled' : 'open')
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
          {dateless ? <Mountain className="size-4" style={{ color: ACCENT }} /> : <Flag className="size-4" style={{ color: ACCENT }} />}
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
  if (someday(item)) return {
    id: item.id,
    type: 'goal',
    title: item.title,
    tags: [],
    // A mountain for the life list: calm in the goal's own colour, never warming, as nothing counts down.
    icon: Mountain,
    tint: item.closedAt ? undefined : goalInk(item),
    sub: item.closedAt ? `${settledSaid(item)} · ${logsSaid(item.clues)}`
      : <><span data-someday-row className="font-semibold text-foreground">Someday</span> · {loggedSaid(item)}</>,
    marks: item.private ? <EyeOff className="size-3 shrink-0 text-muted-foreground" aria-label="Private" /> : null,
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
      ? `${settledSaid(item)} · ${logsSaid(item.clues)}`
      // The days left lead, in the goal's own warmth and bold: the one thing a glance down the list is for. Then its logs.
      : <><span {...loud(leftLoud(left), 'font-semibold')} style={{ color: left > 30 ? 'var(--foreground)' : undefined }}>{left < 0 ? `${leftSaid(left)}: did you make it?` : left === 0 ? 'Today' : plural(left, 'day')}</span> · {loggedSaid(item)}</>,
    marks: item.private ? <EyeOff className="size-3 shrink-0 text-muted-foreground" aria-label="Private" /> : null,
    // A thin line of the time gone, plain whatever Settings draws bars as, warming as the day comes.
    bar: item.closedAt ? undefined : <GoalBar left={left} way={wayThrough(item.goalFrom ?? today, item.goalAt ?? today)} as="plain" />,
    dim: !!item.closedAt,
    private: !!item.private,
    bare: true,
    menu
  }
}

/**
 * The open list's groups: goals that share a day under that day's heading
 * ("31 Dec 2027"); once any day is shared every day is headed, so a goal never
 * looks like one of the group above it. None shared, one plain list,
 * nearest first. The someday ones last, under "Someday".
 */
const byDay = (dated: Item[], entries: Entry[]): [string, Entry[]][] => {
  const shared = dated.some((one, index) => index > 0 && dated[index - 1].goalAt === one.goalAt)
  const groups: [string, Entry[]][] = []
  dated.forEach((one, index) => {
    const name = shared ? dayMonth(`${one.goalAt}T12:00`, 'always') : ''
    const last = groups.at(-1)
    if (last && last[0] === name) last[1].push(entries[index])
    else groups.push([name, [entries[index]]])
  })
  if (entries.length > dated.length) groups.push(['Someday', entries.slice(dated.length)])
  return groups
}

/** What a goal offers besides opening it: its row menu and its page's ··· share it. */
const goalMenu = (item: Item): MenuItem[] => [
  asideItem('goal', item.id),
  'separator',
  onIce(item) ? { label: 'Take off ice', hint: 'Open again, its day moved out by the days it waited', run: () => thaw(item) }
    : !item.closedAt && { label: 'Put on ice', hint: someday(item) ? 'Paused: out of the list until taken off' : 'Paused: its countdown stops', run: () => settle(item, 'on ice') },
  !item.closedAt && !someday(item) && { label: onHome(item) ? 'Take off Home' : 'Show on Home', hint: onHome(item) ? 'Off the top of Home' : 'At the top of Home', run: () => setOnHome(item, !onHome(item)) },
  { label: item.private ? 'Make it not private' : 'Make it private', run: () => void haligtree.setPrivate('nuggets', item.id, !item.private) },
  // Goals pause on ice, not in the archive: only one archived before keeps a way back.
  !!item.archivedAt && { label: 'Unarchive', hint: 'Back in sight', run: () => void archive('nuggets', [item.id], false) },
  binItem([{ type: 'goal', id: item.id }]),
  'separator',
  { label: 'Stick all goals on the desktop', hint: 'Each in its own colour, with a legend', about: 'list', run: showAllGoals },
  copyLinkItem(`goal:${item.id}`, item.title),
  { label: 'Copy the goal', run: () => copy(item.title) }
]

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
  // Open: the dated ones nearest first, then the someday ones under their own heading, as Tasks keeps Later last.
  const listOf = (which: Tab): Item[] => which === 'open' ? [...openOnes(all), ...somedayOnes(all)] : all.filter((one) => one.closedAt && !one.archivedAt && tabOf(one) === which).sort((a, b) => b.closedAt!.localeCompare(a.closedAt!))
  const items = listOf(show)
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
  useOpened(open?.id, focus, pick, () => (asked(), setComing(null), setOpen(null)), { shown: items.map((one) => one.id), kind: 'item' })
  useKept('tab', show, setShow, 'open')
  // Read again when anything changes, so a log added from the box shows.
  useEffect(() => {
    // A reload for the one you left, landing after you switch, is dropped.
    let gone = false
    const off = window.api.captures.onChange(() => open && void haligtree.item(open.id).then((found) => void (gone || setOpen(found))))
    return () => void ((gone = true), off())
  }, [open?.id])
  const [cursor, setCursor] = useListKeys(items.length, { onOpen: (index) => pick(items[index].id), opened: items.findIndex((one) => one.id === (coming ?? open?.id)), onExtend: (from, to) => several.picking.extend(items[from]?.id, items[to].id) })
  const go = (type: string, id: string): void => (type === 'goal' ? pick(id) : onOpen?.(type, id))
  // x, ⇧-click and ⌘A pick several, for the queue or the archive together.
  const several = usePickNotes(items.map((one) => one.id), cursor, { here: useHere(), noun: ['goal', 'goals'], tier: 'goal', titleOf: (id) => items.find((one) => one.id === id)?.title,
    put: show === 'open' ? { label: 'Put on ice', hint: 'Paused: their countdowns stop', run: iceAll } : show === 'iced' ? { label: 'Take off ice', hint: 'Open again, each day moved out by the days it waited', run: thawAll } : undefined })
  // Sent here for one goal: the goal is drawn first and the list beside it
  // the frame after, whole (Page's `apart`), so its words never wait behind the list.
  const sent = !!focus && (coming ?? open?.id) === focus
  const [listFirst] = useState(!focus)
  const listLater = useAfterFirstPaint()
  const listShown = listFirst || listLater
  const entries = !listShown ? [] : items.map((one) => goalEntry(one, today, several.menu(one.id) ?? [{ label: 'Open', keys: '↵', run: () => pick(one.id) }, 'separator', ...goalMenu(one), ...several.rowItems(one.id)]))
  return (
    // The list and the one open beside it come in together, once both are read (lib/reads-in.tsx).
    <ReadsIn className="contents">
      {/* Sent here for one goal: the page waits for it too, so it opens on the goal beside the list, not on the list alone first;
          the goal never waits for the list, which comes in whole beside it once drawn. */}
      <Page aside={!!open || !!coming} waiting={unloaded(all) || (!!focus && (coming ?? open?.id) !== focus) || !listShown} apart={sent} title="Goals" count={several.chosen.length || items.length} unit={several.chosen.length ? ['selected', 'selected'] : ['goal', 'goals']}
        // Which goals show, at the line's left before the count, on the list's edges as Tasks' tabs (qa/list-edges.mjs): apart from the buttons that make or gather goals.
        lead={several.bar ? undefined : <div data-list-tabs className="flex shrink-0" style={{ marginLeft: 'calc(var(--list-edge) - var(--list-ink))' }}><Chips className="shrink-0" options={[{ id: 'open', label: 'Open' }, { id: 'settled', label: 'Ended' }, { id: 'iced', label: 'On ice' }]} on={(id) => id === show} pick={(id) => switchTo(id as Tab)} /></div>}
        actions={several.bar ??
          <span className="flex items-center gap-2">
            {openOnes(all).length > 1 && <Button variant="ghost" size="sm" data-all-goals-sticky onClick={showAllGoals} title="Every open goal on one sticky, each in its own colour"><StickyNote className="size-3.5" /> All on one sticky</Button>}
            {/* Always here, whichever chip is on: nothing in the bar comes or goes as you switch. */}
            <Button variant="ghost" size="sm" onClick={() => void startGoal(go)}><Plus className="size-3.5" /> New goal</Button>
          </span>
        }
      >
        {!listShown ? null : items.length ? (
          <NoteList groups={show === 'open' ? byDay(openOnes(all), entries) : [['', entries]]} dayHeads density="list" table="nuggets" selected={coming ?? open?.id} cursor={cursor} onCursor={setCursor} onPick={pick} chosen={several.chosen} picking={several.picking} className="list-edge my-2" />
        ) : unloaded(all) ? null : !all.length ? (
          // None set yet: the page as it will look, with a few made-up ones.
          <Example tryIt={<><strong><button type="button" onClick={() => void startGoal(go)} className="text-foreground underline decoration-foreground/25 underline-offset-4 hover:decoration-foreground/60">set a goal</button>: a day you are aiming for.</strong> It counts down at the top of Home and keeps a log of the road there. Or leave the day out: a someday goal, for the life list.</>}>
            <NoteList groups={(() => {
              const shown = exampleGoals().filter((one) => (show === 'open') === !one.closedAt)
              return ([['', shown.filter((one) => !someday(one)).map((one) => goalEntry(one, today))], ['Someday', shown.filter(someday).map((one) => goalEntry(one, today))]] as [string, Entry[]][]).filter(([, list]) => list.length)
            })()} density="list" table="nuggets" cursor={-1} onPick={() => undefined} className="list-edge my-2" />
          </Example>
        ) : show === 'open' ? (
          <Empty title="No goals yet" action={<Button variant="secondary" size="sm" onClick={() => void startGoal(go)}><Plus className="size-3.5" /> New goal</Button>}>
            A goal is a day you are working toward. It stays in front of you, in the menu bar and at the top of Home, counts the days down, and keeps a log of the road there.
            Or pick “No day: someday” for the life list: Visit Hobbiton, Take my parents to Victoria Falls. No countdown, just there until you go.
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
        top={<ReadsIn apart reading={unloaded(all)} className="contents" data-apart="stepper"><Stepper at={items.findIndex((one) => one.id === open.id)} total={items.length} onStep={(to) => pick(items[to].id)} /></ReadsIn>} />}
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
          {HOW[how]}
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
  // A someday goal: no day, so no countdown, no road and nothing warming; its own colour, calm.
  const dateless = someday(item)
  const target = item.goalAt ?? today
  const from = item.goalFrom ?? dayKey(item.createdAt)
  const left = daysLeft(target, today)
  const logs = [...item.glosses].reverse()
  const [picked, setPicked] = useState<Dot | null>(null)
  const ink = item.closedAt ? 'var(--muted-foreground)' : dateless ? goalInk(item) : warmth(Math.max(left, 0))
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
  const addLog = (): void => {
    const field = document.querySelector<HTMLTextAreaElement>('[data-log-field]')
    field?.scrollIntoView({ block: 'center', behavior: still() ? 'instant' : 'smooth' })
    field?.focus({ preventScroll: true })
  }
  // Its day given or taken away: a someday goal gets a road, a dated one joins the life list. Said, with Undo.
  const setDay = (day: string | null): void => {
    const was = { target: item.goalAt, from: item.goalFrom ?? from }
    void haligtree.goalDates(item.id, { target: day }).then((ok) => {
      if (!ok) return chime('nope')
      chime(day ? 'goal' : 'tap')
      toast(day ? `Given a day: ${dayMonth(`${day}T12:00`)}, and the countdown starts` : 'No day now: it waits under “Someday”, no countdown',
        () => void haligtree.goalDates(item.id, was.target ? { target: was.target, from: was.from } : { target: null }))
    })
  }
  const moveDates = (dates: { target?: string; from?: string }): void => {
    const was = { target, from }
    void haligtree.goalDates(item.id, dates).then(() => {
      chime('tap')
      quietly(() => void haligtree.goalDates(item.id, was))
    })
  }
  const lastLog = logs[0]?.createdAt
  return (
    <div data-open={item.id} className="note-pane flex min-w-0 flex-[1.4] flex-col overflow-y-auto @[40rem]/page:flex-row @[40rem]/page:overflow-visible @[56rem]/page:border-l [&>*:first-child]:min-h-[16rem] [&>*:first-child]:shrink-0 @[40rem]/page:[&>*:first-child]:min-h-0 @[40rem]/page:[&>*:first-child]:shrink">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto pt-3">
        <div className="flex min-h-7 items-center gap-2 px-3 @[40rem]/page:px-[4.25rem]">
          {top ?? <span />}
        </div>
        <CollectionHeader
          tint={tint}
          cover={<Cover colour={ink} seed={item.id}>
            {/* Its mark, never its number: the days left are said once, large, beside it. */}
            {dateless ? <Mountain className="size-[42cqi]" strokeWidth={1.6} /> : <Flag className="size-[42cqi]" strokeWidth={1.6} />}
          </Cover>}
          label={onIce(item) ? (dateless ? 'Someday goal, on ice' : 'Goal, on ice') : item.closedAt ? (dateless ? 'Someday goal, ended' : 'Goal, ended') : dateless ? 'Goal · Someday' : 'Goal'}
          length={item.title.length}
          meta={dateless
            ? [item.closedAt ? settledSaid(item) : 'Someday, no day to it', logsSaid(logs.length), ...(lastLog ? [`last log ${ago(lastLog)}`] : [])]
            : item.closedAt
            ? [settledSaid(item), `for ${dayMonth(`${target}T12:00`)}`, logsSaid(logs.length)]
            // The one number, large, with the day it counts to; then the time gone and the logs, in words.
            : [...(left < 0 ? [] : [`${percent(wayThrough(from, target))} of the time gone`]), logsSaid(logs.length), ...(lastLog ? [`last log ${ago(lastLog)}`] : [])]}
          // The one number, large, on its own line, with the day it counts to.
          big={!dateless && !item.closedAt && (
            <p className="flex flex-wrap items-baseline gap-x-2 text-control text-foreground">
              <span data-goal-left className="text-[1.75rem] leading-tight font-semibold tracking-[-0.02em] tabular-nums" style={{ color: left > 30 ? 'var(--foreground)' : warmth(Math.max(left, 0)) }}>{left === 0 ? 'Today' : left < 0 ? leftSaid(left) : plural(left, 'day')}</span>
              <span className="whitespace-nowrap">{left === 0 ? 'is the day' : left < 0 ? `since ${dayMonth(`${target}T12:00`, 'always')}` : `to ${dayMonth(`${target}T12:00`, 'always')}`}</span>
            </p>
          )}
          actions={<>
            {/* Ended, a goal takes no more logs (its field is gone): no "+" that would do nothing. */}
            {!item.closedAt && <span data-goal-add className="contents"><QuietAction label="Add a log" onClick={addLog}><Plus /></QuietAction></span>}
            <MenuButton items={[
              ...(onIce(item) ? [] : item.closedAt ? [{ label: 'Open it again', run: () => reopen(item) }]
                : [{ label: 'Made it', run: () => settle(item, 'made it') }, ...(dateless ? [] : [{ label: 'Missed', run: () => settle(item, 'missed') }]), { label: 'Give it up', hint: 'Kept under “Ended”', run: () => settle(item, 'let go') }]),
              'separator',
              ...goalMenu(item)
            ]} />
            {/* When it began, on the row with what you do to it: said as a date, not left to guess. */}
            <span data-goal-set className="ml-2 text-xs text-muted-foreground">{dateless ? `Added on ${dayMonth(item.createdAt)}` : `Set on ${dayMonth(`${from}T12:00`)}`}</span>
          </>}
          title={
            <textarea
              rows={1}
              className="block w-full resize-none overflow-hidden bg-transparent pb-[0.12em] text-balance outline-none [field-sizing:content] placeholder:text-foreground/70"
              defaultValue={item.title === 'Untitled' ? '' : item.title}
              placeholder="What are you working toward?"
              onKeyDown={(event) => {
                if (event.key !== 'Enter' || event.shiftKey) return
                event.preventDefault()
                event.currentTarget.blur()
              }}
              onBlur={(event) => {
                const title = event.target.value.trim()
                if (title && title !== item.title) void haligtree.saveItem(item.id, { title }).then(() => chime('noted'))
              }}
            />}
        />
        <div className="page-narrow mx-auto w-full px-10 pb-16">
          <textarea
            rows={1}
            defaultValue={item.why ?? ''}
            placeholder="Why it matters…"
            onKeyDown={(event) => {
              if (event.key !== 'Enter' || event.shiftKey) return
              event.preventDefault()
              event.currentTarget.blur()
            }}
            onBlur={(event) => {
              const why = event.target.value.trim()
              if (why !== (item.why ?? '')) void haligtree.saveItem(item.id, { why: why || null }).then(() => chime('noted'))
            }}
            className="private-text mt-1 block w-full resize-none bg-transparent px-2 text-body leading-relaxed text-foreground/85 italic outline-none [field-sizing:content] placeholder:text-foreground/70 placeholder:not-italic"
          />
          {dateless && item.closedHow === 'made it' && <CrossedOff id={item.id} day={item.closedAt!} />}
          {!dateless && !item.closedAt && left < 0 && (
            <div className="mt-5 flex flex-wrap items-center gap-3 rounded-xl border bg-accent/25 px-4 py-3">
              <span className="mr-auto min-w-0">
                <span className="block font-medium">Did you make it?</span>
                <span className="block text-body text-foreground">{dayName(`${target}T12:00`)} has passed. Say how it went, and <strong className="font-semibold">it moves to Ended</strong>.</span>
              </span>
              <Answers item={item} />
            </div>
          )}
          {dateless ? (
            <section data-someday-page className="mt-6">
              <h3 className="mb-1 px-2 text-meta text-muted-foreground">Someday</h3>
              {/* No road to draw: what it is for, and the steps so far, in plain words. */}
              <p className="px-2 text-control leading-snug text-foreground">
                {item.closedAt ? <>Kept here, logs and all.</>
                  : <>No day and no countdown: it waits for its time. Log each step you take toward it. When it draws near, “Give it a day” and it gets a road.</>}
                {logs.length ? <> <strong className="font-semibold">{logsSaid(logs.length)}</strong> since {dayMonth(item.createdAt)}.</> : null}
              </p>
            </section>
          ) : <section className="mt-6">
            <h3 className="mb-1 px-2 text-meta text-muted-foreground">The road</h3>
            {/* The point first: how many of the days gone have a log; then the road's own span, quieter. */}
            <p data-goal-showed className="mb-3 px-2 text-control leading-snug text-foreground tabular-nums">
              {(() => {
                const gone = Math.max(1, Math.min(daysBetween(from, today), daysBetween(from, target)) + 1)
                const logged = new Set(item.glosses.map((one) => dayKey(one.createdAt)).filter((day) => day >= from && day <= today)).size
                return <strong className="font-semibold">{num(logged)} of {num(gone)} {gone === 1 ? 'day' : 'days'} logged</strong>
              })()}
              <span className="text-muted-foreground"> so far · {num(daysBetween(from, target) + 1)} days, {dayMonth(`${from}T12:00`)} to {dayMonth(`${target}T12:00`)}</span>
            </p>
            <div data-road className="px-2"><Journey goal={item.id} from={from} target={target} today={today} logs={item.glosses} picked={picked} onPick={setPicked} /></div>
          </section>}
          <Logs item={item} picked={picked} onClear={() => setPicked(null)} />
        </div>
      </div>

      <Props>
        <Island compact title="Goal">
          {/* Ended, a someday goal has no day to give: only its colour stays to change. */}
          {dateless ? !item.closedAt && (
            <DatePicker value={null} onChange={(iso) => iso && setDay(dayKey(iso))} suggest={['in 1 month', 'in 3 months', 'in 1 year']}>
              <Mountain className="size-4 shrink-0" style={{ color: ink }} />
              <span data-someday-day className="truncate">Someday · “Give it a day”</span>
            </DatePicker>
          ) : (<>
            <DatePicker value={`${target}T12:00`} onChange={(iso) => iso && dayKey(iso) !== target && moveDates({ target: dayKey(iso) })} suggest={['in 1 month', 'in 3 months', 'in 1 year']}>
              <Flag className="size-4 shrink-0" style={{ color: item.closedAt ? undefined : warmth(Math.max(left, 0)) }} />
              <span className="truncate">For {dayMonth(`${target}T12:00`, 'always')}</span>
            </DatePicker>
            <DatePicker value={`${from}T12:00`} onChange={(iso) => iso && dayKey(iso) !== from && moveDates({ from: dayKey(iso) })}>
              <CalendarPlus className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              <span className="truncate text-muted-foreground">Set {dayMonth(`${from}T12:00`, 'always')}</span>
            </DatePicker>
            {!item.closedAt && <Prop icon={CalendarOff} onClick={() => setDay(null)} tip="Off the countdown, onto your life list"><span data-goal-no-day>No day: someday</span></Prop>}
          </>)}
          <GoalColor item={item} />
        </Island>
        {/* On screen is a countdown kept in sight: a someday goal has none to keep. */}
        {!item.closedAt && !dateless && (
          <Island compact title="On screen">
            <div className="flex flex-col gap-1.5 px-2 py-1.5">
              <span className="text-control">Keep this goal on screen</span>
              <Chips options={[{ id: 'always', label: 'Always' }, { id: 'sometimes', label: 'Now and then' }, { id: 'off', label: 'Off' }]}
                on={(id) => id === beacon} pick={(id) => setBeacon(id as Beacon)} />
              <span className="text-meta leading-snug text-muted-foreground">
                {beacon === 'always' ? 'On every Space, all the time.' : beacon === 'sometimes' ? 'Out a few times a day, then tucked away. In the last week it stays.' : 'The menu bar and Home still show it.'}
              </span>
            </div>
            <Prop icon={House} active={onHome(item)} onClick={() => setOnHome(item, !onHome(item))} tip={onHome(item) ? 'Shown at the top of Home; click to take it off' : 'Show it at the top of Home: once you choose any, only the ones you choose show there'}>
              <span data-goal-home={onHome(item) ? 'on' : 'off'}>{onHome(item) ? 'Shown on Home' : 'Show on Home'}</span>
            </Prop>
          </Island>
        )}
        <Island compact title={onIce(item) ? 'On ice' : item.closedAt ? 'Ended' : 'How it went'}>
          {onIce(item) ? (
            <Prop icon={Snowflake} onClick={() => thaw(item)} tip="Open again, its day moved out by the days it waited">Take off ice</Prop>
          ) : item.closedAt ? (
            <Prop icon={Wind} onClick={() => reopen(item)}>Open it again</Prop>
          ) : (
            <>
              <Prop alive={SimpleCheckedIcon} onClick={() => settle(item, 'made it')} tip={dateless ? 'Crossed off your list' : undefined}>Made it</Prop>
              {!dateless && <Prop icon={Flag} onClick={() => settle(item, 'missed')}>Missed</Prop>}
              <Prop icon={Wind} onClick={() => settle(item, 'let go')} tip="Kept under “Ended”">Give it up</Prop>
              <Prop icon={Snowflake} onClick={() => settle(item, 'on ice')} tip={dateless ? 'Paused: out of the list until taken off' : 'Paused: off Home and the desktop, its countdown stopped'}>On ice</Prop>
            </>
          )}
        </Island>
        <Island compact name="Surfacing" title={<Term>Surfacing</Term>}>
          <Prop icon={item.private ? EyeOff : Eye} active={!!item.private} onClick={() => void haligtree.setPrivate('nuggets', item.id, !item.private)}>
            {item.private ? 'Private: its name stays hidden' : 'Its name can show'}
          </Prop>
          {/* Goals pause on ice instead; only one archived before keeps a way back. */}
          {item.archivedAt && (
            <Prop icon={ArchiveRestore} active onClick={() => void archive('nuggets', [item.id], false)} tip="Bring it back">Unarchive</Prop>
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
              <span className="size-3.5 rounded-full" style={{ background: `var(--tt-color-text-${one})` }} />
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
  return props.compact ? <Field {...props} /> : <Road {...props} />
}

/** The milestones on a road (the same ones that celebrate) and the days marked for this goal. */
function useMarks(goal: string, from: string, target: string): { milestoneIn: (dot: Dot) => string | undefined; markIn: (dot: Dot) => Milestone | undefined; marksIn: (dot: Dot) => Milestone[] } {
  const shiftDay = (day: string, by: number): string => { const at = new Date(`${day}T12:00`); at.setDate(at.getDate() + by); return dayKey(at.toISOString()) }
  const span = Math.round((new Date(`${target}T12:00`).getTime() - new Date(`${from}T12:00`).getTime()) / 86_400_000)
  const marks: [string, string][] = [[shiftDay(from, Math.round(span / 2)), 'halfway'], [shiftDay(target, -30), 'a month to go'], [shiftDay(target, -7), 'a week to go']]
  // Days marked for this goal on the road (an exam, a launch): a ring in their colour.
  // A day marked for something else, or for another goal, is not this goal's and stays off its road.
  const marked = useMilestones(from, target).filter((one) => markOf(one) === goal)
  const marksIn = (dot: Dot): Milestone[] => marked.filter((one) => one.day >= dot.day && one.day <= dot.last)
  return {
    milestoneIn: (dot) => marks.find(([day]) => day >= from && day >= dot.day && day <= dot.last)?.[1],
    markIn: (dot) => marksIn(dot)[0],
    marksIn
  }
}

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
      {dot.target && <circle cx={x} cy={y} r={0.56 * cell} fill="none" stroke={ACCENT} strokeWidth={0.14 * cell} />}
      {dot.today && <circle cx={x} cy={y} r={0.56 * cell} fill="none" stroke={ACCENT} strokeWidth={0.1 * cell} className="mf-goal-today" />}
      {marker && !dot.target && !dot.today && <circle cx={x} cy={y} r={0.52 * cell} fill="none" stroke="currentColor" strokeWidth={0.08 * cell} style={{ opacity: 0.6 }} />}
      {mark && !dot.target && <circle data-road-marked={mark.id} cx={x} cy={y} r={0.56 * cell} fill="none" stroke={inkOf(mark)} strokeWidth={0.12 * cell} />}
      {on && <circle cx={x} cy={y} r={0.6 * cell} fill="none" stroke="currentColor" strokeWidth={0.08 * cell} />}
      <circle cx={x} cy={y} r={(dot.target ? 0.32 : dot.today ? 0.4 : 0.34) * cell} fill={dot.target && !logged ? ACCENT : colour} style={{ opacity: dot.target ? 1 : opacity }} />
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

/** Smallest a dot's cell may be on the page: a dot about 10px across, still seen and pointed at. */
const ROAD_CELL = 15
/** Largest: a short road's dots stop growing here. */
const ROAD_MOST = 22
/** The months' column at the left of a wrapped road. */
const ROAD_LEFT = 64
const LANE = 15
/** "Nov" for "2026-11-05". */
const monthOf = (day: string): string => dayMonth(`${day}T12:00`, 'never').split(' ')[1]

/**
 * A goal's road on its page: only its own days, from the day it was set to
 * the day itself. Short, one row of days across the width. Longer, a week a
 * column, Monday at the top. Too long for the width at a dot about 10px, it
 * wraps into rows of weeks, each with its months at the left, so the days stay
 * dots you can see and point at. Every marked dot is named in words over its
 * own row: Today, Halfway, A month to go, A week to go, The day, the goal's
 * own days. Pointed at, a dot says its day and its logs; clicked, the logs
 * below show only that day.
 */
function Road({ goal, from, target, today, logs, picked, onPick }: RoadProps): React.JSX.Element {
  const road = journey(from, target, today, ROAD_DAYS)
  const days = useMemo(() => logDays(logs), [logs])
  const { milestoneIn, markIn, marksIn } = useMarks(goal, from, target)
  const [hover, setHover] = useState<Dot | null>(null)
  const [width, setWidth] = useState(0)
  const box = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const node = box.current
    if (!node) return
    const watch = new ResizeObserver(() => setWidth(node.clientWidth))
    watch.observe(node)
    setWidth(node.clientWidth)
    return () => watch.disconnect()
  }, [])
  // One row of days, a week a column, or weeks wrapped into rows of `per` columns.
  const line = road.by === 'day' && road.dots.length * 14 <= width
  const across = line ? road.dots.length : road.cols
  const wrap = !line && width > 0 && width / across < ROAD_CELL
  const left = wrap ? ROAD_LEFT : 0
  const per = wrap ? Math.max(4, Math.floor((width - left) / ROAD_CELL)) : across
  const step = !width ? ROAD_MOST : wrap ? ROAD_CELL : line ? width / across : Math.min(width / across, ROAD_MOST)
  const cell = Math.min(step, ROAD_MOST)
  const rows = line ? 1 : road.rows
  // Each dot's band (row of the wrapped road) and its column inside it.
  const placed = road.dots.map((dot, index) => {
    const col = line ? index : dot.col
    return { dot, band: Math.floor(col / per), x: (col % per + 0.5) * step }
  })
  const bands = Math.max(1, Math.ceil(across / per))
  const wide = per * step
  return (
    <div ref={box} data-road-wrapped={wrap || undefined} className="relative w-full" onMouseLeave={() => setHover(null)}>
      {width > 0 && Array.from({ length: bands }, (_, band) => {
        const here = placed.filter((one) => one.band === band)
        if (!here.length) return null
        // Every marked dot in this row named in words over it, lifted a lane where two would touch,
        // and no hair from a higher name runs through a lower one.
        const marks = here.flatMap(({ dot, x }) => {
          const words: [string, string?][] = []
          if (dot.today) words.push(['Today'])
          const milestone = milestoneIn(dot)
          if (milestone && !dot.target) words.push([milestone[0].toUpperCase() + milestone.slice(1)])
          for (const one of marksIn(dot)) words.push([clip(one.title, 24), inkOf(one)])
          if (dot.target) words.push(['The day', ACCENT])
          return words.map(([word, ink], n) => ({ key: `${dot.day}-${n}`, x, word, ink, size: word.length * 6.2 + 4 }))
        })
        const named: (typeof marks[number] & { lane: number; left: number })[] = []
        for (const mark of marks) {
          const at = Math.max(0, Math.min(wide - mark.size, mark.x - mark.size / 2))
          const covers = (from: number, to: number, x: number): boolean => x >= from - 4 && x <= to + 4
          const clash = (lane: number, hairs: boolean): boolean => named.some((one) =>
            one.lane === lane ? at < one.left + one.size + 8 && one.left < at + mark.size + 8 : !hairs ? false : one.lane > lane ? covers(at, at + mark.size, one.x) : covers(one.left, one.left + one.size, mark.x))
          let lane = 0
          while (lane < 4 && clash(lane, true)) lane += 1
          if (lane === 4) for (lane = 0; clash(lane, false); lane += 1);
          named.push({ ...mark, lane, left: at })
        }
        const lanes = named.length ? Math.max(...named.map((one) => one.lane)) + 1 : 0
        const top = lanes ? lanes * LANE + 6 : band ? 10 : 0
        const first = here[0].dot.day
        const last = here[here.length - 1].dot.last
        const shownHover = hover && here.some((one) => one.dot.day === hover.day) ? here.find((one) => one.dot.day === hover.day)! : null
        // The months under a road that does not wrap, never two names touching.
        const months: { x: number; label: string }[] = []
        if (!wrap) for (const one of line ? road.dots.flatMap((dot, index) => (index === 0 || dot.day.endsWith('-01') ? [{ col: index, label: dayMonth(`${dot.day}T12:00`) }] : [])) : road.months) {
          const was = months.at(-1)
          const x = one.col * step
          if (!was || was.x + was.label.length * 6.2 + 8 <= x) months.push({ x, label: one.label })
        }
        return (
          <div key={band} data-road-band={band} className="relative flex" style={{ marginTop: band ? 8 : 0 }}>
            {wrap && (
              // Which months this row holds, at its left, level with its dots.
              <div aria-hidden data-road-months className="shrink-0 pr-2 text-[11px] leading-tight text-muted-foreground tabular-nums" style={{ width: left, paddingTop: top }}>
                {/* "Nov 2026" over "to Jan": the year where the road starts and wherever a row starts a new one. */}
                <span className="block font-medium text-foreground/80">{monthOf(first)}{band === 0 || first.slice(0, 4) !== placed.find((one) => one.band === band - 1)?.dot.day.slice(0, 4) ? ` ${first.slice(0, 4)}` : ''}</span>
                {monthOf(last) !== monthOf(first) && <span className="block">to {monthOf(last)}</span>}
              </div>
            )}
            <div className="relative" style={{ width: wide }}>
              {lanes > 0 && (
                <div className="relative" style={{ height: top }}>
                  {named.map((one) => (
                    <span key={one.key} data-road-label className="absolute text-[11px] leading-none font-medium whitespace-nowrap text-foreground" style={{ left: one.left, bottom: one.lane * LANE + 6, color: one.ink }}>{one.word}</span>
                  ))}
                  {/* A hair from each name down to its dot's column. */}
                  {named.map((one) => (
                    <span key={`${one.key}-tick`} aria-hidden className="absolute bottom-0 w-px bg-foreground/25" style={{ left: one.x, height: one.lane * LANE + 4 }} />
                  ))}
                </div>
              )}
              {!lanes && top > 0 && <div style={{ height: top }} />}
              <svg role="img" aria-label={`${dayMonth(`${first}T12:00`)} to ${dayMonth(`${last}T12:00`)}: ${num(here.length)} ${road.by === 'day' ? 'days' : 'weeks'}, ${num(here.filter((one) => one.dot.past).length)} gone`}
                viewBox={`0 0 ${wide} ${rows * cell}`} style={{ width: wide }} className="block h-auto overflow-visible">
                {here.map(({ dot, x }) => (
                  <RoadDot key={dot.day} dot={dot} x={x} y={((line ? 0 : dot.row) + 0.5) * cell} cell={cell} logged={logsIn(days, dot).length > 0}
                    marker={milestoneIn(dot)} mark={markIn(dot)} on={picked?.day === dot.day} compact={false}
                    onEnter={() => setHover(dot)} onClick={onPick ? () => (chime('tap'), onPick(picked?.day === dot.day ? null : dot)) : undefined} />
                ))}
              </svg>
              {months.length > 0 && (
                <div aria-hidden className="relative mt-1.5 h-4 text-[11px] text-muted-foreground">
                  {months.map((month) => <span key={month.x} className="absolute top-0 whitespace-nowrap" style={{ left: month.x }}>{month.label}</span>)}
                </div>
              )}
              {shownHover && (
                <div className={`pointer-events-none absolute z-10 w-max max-w-64 rounded-md ${shownHover.x < wide / 3 ? '-translate-x-3' : shownHover.x > (wide * 2) / 3 ? '-translate-x-[calc(100%-0.75rem)]' : '-translate-x-1/2'} bg-popover px-2.5 py-1.5 text-xs text-popover-foreground shadow-(--mf-panel-shadow) ring-1 ring-foreground/10`}
                  style={{ left: shownHover.x, top: top + ((line ? 0 : shownHover.dot.row) + 1) * cell + 4 }}>
                  <DotTip dot={shownHover.dot} today={today} days={days} milestoneIn={milestoneIn} markIn={markIn} />
                </div>
              )}
            </div>
          </div>
        )
      })}
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
          <circle key={`before-${index}`} cx={((index % across) + 0.5) * step} cy={(Math.floor(index / across) + 0.5) * cell} r={0.34 * cell} fill="currentColor" style={{ opacity: 0.06 }} />
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
    <section data-chrome className="mt-8 w-full border-t pt-4 text-body">
      <h3 className="mb-2 flex items-baseline gap-1.5 px-2 text-meta text-muted-foreground">
        Progress log {all.length > 0 && <Rolling text={all.length} className="tabular-nums" />}
        {picked && (
          <button type="button" onClick={() => (chime('tap'), onClear())} className="ml-auto flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs text-foreground/80 hover:bg-accent">
            {picked.day === picked.last ? dayMonth(`${picked.day}T12:00`) : `Week of ${dayMonth(`${picked.day}T12:00`)}`} <X className="size-3" />
          </button>
        )}
      </h3>
      {!item.closedAt && (
        <div className="mx-2 mb-3 flex items-start gap-2 rounded-lg border bg-accent/30 px-3 py-2 focus-within:border-foreground/25">
          <Plus className="mt-1 size-3.5 shrink-0 text-muted-foreground" />
          <textarea
            data-log-field
            rows={1}
            value={words}
            onChange={(event) => setWords(event.target.value)}
            onKeyDown={(event) => {
              event.stopPropagation()
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault()
                keep()
              }
              if (event.key === 'Escape') event.currentTarget.blur()
            }}
            placeholder="A log: what you did, where it stands, what you think"
            className="min-w-0 flex-1 resize-none bg-transparent text-control outline-none [field-sizing:content] placeholder:text-foreground/70"
          />
          {words.trim() && <span className="mt-0.5 flex shrink-0 items-center gap-1 text-xs text-muted-foreground"><Kbd>↵</Kbd></span>}
        </div>
      )}
      {logs.length ? (
        <ol ref={list} className="flex flex-col">
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
        <p className="px-2 pb-2 text-control text-muted-foreground">
          <span data-log-empty>{picked ? 'No log that day.' : item.closedAt ? 'No logs were kept.' : 'Nothing logged yet: write the first above.'}</span>
        </p>
      )}
      <ShowMore total={logs.length} shown={few.shown.length} few={LOG_FEW} onMore={few.onMore} onFewer={few.onFewer} className="mx-1 mb-1" />
    </section>
  )
}

/** How many logs show before "Show more". */
const LOG_FEW = 50

/** A goal's road as a bar, one look on Home and the Goals page: its warmth in the last month, plain before. */
export function GoalBar({ left, way, className = '', as }: { left: number; way: number; className?: string; /** One look whatever Settings says: the list's plain line. */ as?: BarStyle }): React.JSX.Element {
  const warm = left <= 30 ? warmth(Math.max(left, 0)) : null
  return (
    <ProgressBar value={way} label={`${percent(way)} of the time gone`} as={as} className={className} thick={1} track="color-mix(in oklab, var(--foreground) 8%, transparent)"
      fill={`color-mix(in oklab, ${warm ?? 'var(--foreground)'} ${warm ? 55 : 35}%, transparent)`}
      blade={warm ?? 'var(--tt-color-text-blue)'} />
  )
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
  const open = openOnes(all)
  if (!open.length || settings?.goalStrip === false) return null
  // Chosen for Home, only those show (three at most); none chosen, the nearest two.
  const chosen = open.filter(onHome).slice(0, 3)
  const shown = chosen.length ? chosen : open.slice(0, 2)
  return (
    <div className={`flex flex-col ${className}`} role="group" aria-label="Goals">
      {shown.map((goal) => {
        const left = daysLeft(goal.goalAt!, today)
        const way = wayThrough(goal.goalFrom ?? today, goal.goalAt!)
        // Right-click: what to do with this goal here, and the strip itself put away (Settings, Goals, brings it back).
        const menu: MenuItem[] = [
          { label: 'Open the goal', run: () => onOpen?.('goal', goal.id) },
          { label: onHome(goal) ? 'Take off Home' : 'Show on Home', run: () => setOnHome(goal, !onHome(goal)) },
          'separator',
          { label: 'Hide goals here', run: hideStrip }
        ]
        return (
          <RowMenu key={goal.id} items={menu}>
          <div role="button" tabIndex={0} data-strip-goal={goal.id} data-private={goal.private ? '' : undefined}
            onClick={() => (chime('open'), onOpen?.('goal', goal.id))}
            onKeyDown={(event) => event.key === 'Enter' && event.target === event.currentTarget && onOpen?.('goal', goal.id)}
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
                  <span className="hidden shrink-0 text-foreground/80 @[36rem]/page:inline">· {goal.lastLog ? `last log ${ago(goal.lastLog)}` : 'no logs yet'}</span>
                </>
              )}
            </span>
            <GoalBar left={left} way={way} className="ml-5.5" />
          </div>
          </RowMenu>
        )
      })}
      {open.length > shown.length && (
        <button type="button" data-goal-more-count onClick={() => (chime('tap'), onOpen?.('view', 'goals'))} className="inline-flex min-h-6 items-center self-start rounded-md px-2 text-meta text-foreground/75 transition-colors duration-80 hover:bg-accent/60 hover:text-foreground">
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
  const short = (text: string): string => clip(text, 24) || 'Untitled'
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
                className="private-text max-w-48 truncate rounded-full border px-2 py-0.5 text-foreground/80 transition-colors hover:border-foreground/30 hover:bg-accent hover:text-foreground">
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

