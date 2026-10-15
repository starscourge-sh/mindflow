import { dropLines, keepLines } from '@/lib/clue-lines'
import { binItem } from '@/lib/to-bin'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Archive, CalendarPlus, Flag, Plus, Wind } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { alive } from '@/components/ui/alive-icon'
import ArrowBackUpIcon from '@/components/ui/arrow-back-up-icon'
import EyeOffIcon from '@/components/ui/eye-off-icon'
import EyeIcon from '@/components/ui/eye-icon'
import SimpleCheckedIcon from '@/components/ui/simple-checked-icon'
import XIcon from '@/components/ui/x-icon'

import { EASE } from '@/lib/motion'
import { chime } from '@/lib/sound'
import { unloaded, useLastAsked, useLive, vigil, type Gloss, type Item, type ItemFull, type Settings } from '@/lib/vigil'
import { exampleGoals } from '@/lib/examples'
import { Example } from './example'
import { archive } from '@/lib/notes'
import { useKept, useOpened } from '@/lib/nav'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Chips } from './display'
import { NoteList, type Entry } from './note-list'
import { RowMenu, copy, type MenuItem } from './row-menu'
import { PICKED_MARK } from './pick-mixed'
import { usePickLines } from '@/lib/pick-lines'
import { Empty, Island, Kbd, Page, Prop, Props, Rolling, Stepper, Tip, Typed, refuse, toast, useListKeys, quietly } from './ui'
import { reword } from './questions-view'
import { Term } from './term'
import { CollectionHeader, Cover, MenuButton, QuietAction, useTint } from './collection-header'
import { DatePicker } from './date-picker'
import { ago, dayKey, dayMonth, dayName, num } from '../../../../main/dates'
import { ProgressBar } from './progress-bar'
import { inkOf, useMilestones, type Milestone } from '@/lib/milestones'
import { usePickNotes } from './pick-notes'
import { asideItem, useHere } from '@/lib/split'
import { noteLinkText } from '@/lib/capture-links'
import { daysBetween, daysLeft, journey, leftSaid, percent, wayThrough, type Dot } from '../../../../main/goal-days'
import { leftLoud, loud } from '@/lib/loud'
import { clip, quoted } from '../../../../main/clip'

// itshover drawings in lucide's place, moving when their control is pointed at.
const ArchiveRestore = alive(ArrowBackUpIcon)
const EyeOff = alive(EyeOffIcon)
const Eye = alive(EyeIcon)
const Check = alive(SimpleCheckedIcon)
const X = alive(XIcon)

/**
 * Goals: a day you are working toward, kept in front of you until it comes.
 * A goal is a nugget row with its own tier, as a question is: it never rots
 * and is never reviewed. It holds dated logs (the same glosses a question's
 * clues are) and shows the road from the day it was set to the day it is
 * for, a dot a day. Once the day has passed it asks how it went.
 */

export type Beacon = 'always' | 'sometimes' | 'off'
const ACCENT = 'var(--tt-brand-color-400)'

/** Today's date, kept current: again at midnight, and each minute when `minutes`. */
export function useToday(minutes = false): string {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const next = minutes ? 60_000 - (Date.now() % 60_000) : new Date().setHours(24, 0, 0, 50) - Date.now()
    const timer = setTimeout(() => setNow(Date.now()), next)
    return () => clearTimeout(timer)
  }, [now, minutes])
  return dayKey(now)
}

/** The open goals, nearest first. */
export const openOnes = (all: Item[]): Item[] =>
  all.filter((one) => !one.closedAt && !one.archivedAt && one.goalAt).sort((a, b) => a.goalAt!.localeCompare(b.goalAt!))

/** The short name a goal is logged under in quick capture: its last two words, as "+chapter three:" is for "Finish chapter three" (clueTarget finds the goal from it). */
export const goalWord = (goal: string): string => goal.trim().toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, '').split(/\s+/).slice(-2).join(' ')

/** A line as it is written in quick capture to log progress on a goal: "+name:" lit as the box lights it, then what was done. */
export function LogLine({ goal, did }: { goal: string; did: string }): React.JSX.Element {
  return (
    <span data-log-line className="inline-flex items-baseline rounded-md border border-foreground/12 bg-popover px-1.5 py-px font-sans text-[0.92em] whitespace-nowrap text-popover-foreground">
      <span className="tiptap-token" data-token-color="purple">+{goalWord(goal)}:</span>&nbsp;{did}
    </span>
  )
}

export const logsSaid = (n: number): string => (n ? `${num(n)} ${n === 1 ? 'log' : 'logs'}` : 'no logs yet')
const HOW: Record<string, string> = { 'made it': 'Made it', missed: 'Missed', 'let go': 'Gave it up' }
/** How a settled goal ended, and when: "Made it on 14 Dec". */
const settledSaid = (item: Item): string => `${HOW[item.closedHow ?? ''] ?? 'Ended'} on ${dayMonth(item.closedAt!)}`
/** The days-left colour: calm far out, the accent in the last month, strong in the last week. */
export const warmth = (left: number): string =>
  left > 30 ? 'var(--muted-foreground)' : left > 7 ? ACCENT : 'var(--tt-color-text-red)'

/** A new goal, asked for (its name, its day, why), then opened. Undoable. */
export async function startGoal(open: (type: string, id: string) => void): Promise<void> {
  const asked = await new Promise<{ title: string; target: string; why: string } | null>((answer) =>
    window.dispatchEvent(new CustomEvent('vigil:new-goal', { detail: { answer } })))
  if (!asked) return
  const id = await vigil.newGoal(asked.title, asked.target, null, asked.why)
  if (!id) return
  chime('goal')
  toast(`A goal for ${dayMonth(`${asked.target}T12:00`)}: log as you go`, () => void vigil.dropGoal(id))
  open('goal', id)
}

/** Settle a goal: made it, missed, or gave it up; undoable. */
export function settle(item: { id: string }, how: 'made it' | 'missed' | 'let go'): void {
  void vigil.closeGoal(item.id, how).then(() => {
    chime(how === 'made it' ? 'answered' : how === 'missed' ? 'called' : 'release')
    toast(how === 'made it' ? 'Made it. It moves to “Ended”' : how === 'missed' ? 'Missed: kept under “Ended”, with its logs' : 'Gave it up: kept under “Ended”, with its logs',
      () => void vigil.reopenGoal(item.id))
  })
}

/** A settled goal open again; undoable back to how it was settled. */
function reopen(item: Item): void {
  const how = (item.closedHow ?? 'let go') as 'made it' | 'missed' | 'let go'
  void vigil.reopenGoal(item.id).then(() => {
    chime('hold')
    toast('Open again', () => void vigil.closeGoal(item.id, how, item.closedAt))
  })
}

/** The new goal over the page: its name, the day, and why, if you want to say. */
export function GoalAsker(): React.JSX.Element | null {
  const [asked, setAsked] = useState<{ answer: (goal: { title: string; target: string; why: string } | null) => void } | null>(null)
  const [title, setTitle] = useState('')
  const [target, setTarget] = useState<string | null>(null)
  const [why, setWhy] = useState('')
  // What is still missing, said beside the button once it is pressed too soon; it shakes each time.
  const [missing, setMissing] = useState<{ text: string; n: number } | null>(null)
  useEffect(() => {
    const onAsk = (event: Event): void => {
      chime('open')
      setMissing(null)
      setTitle('')
      setTarget(null)
      setWhy('')
      setAsked((event as CustomEvent).detail)
    }
    window.addEventListener('vigil:new-goal', onAsk)
    return () => window.removeEventListener('vigil:new-goal', onAsk)
  }, [])
  if (!asked) return null
  const done = (goal: { title: string; target: string; why: string } | null): void => {
    asked.answer(goal)
    setAsked(null)
  }
  const keep = (): void => {
    const lack = !title.trim() ? (target ? 'Name the goal first' : 'Name the goal and pick its day') : !target ? 'Pick the day it is for' : dayKey(target) < dayKey() ? 'That day has passed. Pick one ahead' : null
    if (lack) return (chime('nope'), setMissing((was) => ({ text: lack, n: (was?.n ?? 0) + 1 })))
    done({ title: title.trim(), target: dayKey(target!), why: why.trim() })
  }
  const ready = !!title.trim() && !!target
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
        <p className="flex items-center gap-2 text-sm"><Flag className="size-4" style={{ color: ACCENT }} /> A goal: something to have done by a day</p>
        <Input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. Run the 10k under an hour" aria-label="The goal" />
        <div className="flex flex-wrap items-center gap-2 text-control">
          <span className="text-muted-foreground">By</span>
          <DatePicker value={target} onChange={setTarget} placeholder="Pick the day" suggest={['in 1 month', 'in 3 months', 'in 6 months', 'in 1 year']}
            className="border bg-accent/30" />
          {left !== null && left >= 0 && <span className="text-control font-semibold text-foreground"><Rolling by="word" text={leftSaid(left).toLowerCase()} /></span>}
        </div>
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
      // The days left lead, in the goal's own warmth and bold: the one thing a glance down the list is for.
      : <><span {...loud(leftLoud(left), 'font-semibold')} style={{ color: left > 30 ? 'var(--foreground)' : undefined }}>{left < 0 ? `${leftSaid(left)}: did you make it?` : leftSaid(left)}</span>{left < 0 ? '' : ` · ${percent(wayThrough(item.goalFrom ?? today, item.goalAt ?? today))} of the way`} · {logsSaid(item.clues)}</>,
    marks: item.private ? <EyeOff className="size-3 shrink-0 text-muted-foreground" aria-label="Private" /> : null,
    // The road so far, drawn as Home draws it: warming in the last month, full on the day.
    bar: item.closedAt ? undefined : <GoalBar left={left} way={wayThrough(item.goalFrom ?? today, item.goalAt ?? today)} />,
    dim: !!item.closedAt,
    private: !!item.private,
    menu
  }
}

/** What a goal offers besides opening it: its row menu and its page's ··· share it. */
const goalMenu = (item: Item): MenuItem[] => [
  asideItem('goal', item.id),
  'separator',
  { label: item.private ? 'Not private' : 'Private', run: () => void vigil.setPrivate('nuggets', item.id, !item.private) },
  { label: item.archivedAt ? 'Unarchive' : 'Archive', hint: item.archivedAt ? 'Back in sight' : 'Kept, out of sight', run: () => void archive('nuggets', [item.id], !item.archivedAt) },
  binItem([{ type: 'goal', id: item.id }]),
  'separator',
  { label: 'Copy link', hint: 'Paste it into any note to link here', run: () => copy(noteLinkText(`goal:${item.id}`, item.title), 'Copied a link: paste it into any note') },
  { label: 'Copy the goal', run: () => copy(item.title) }
]

/**
 * Goals, in the main window: the open ones nearest first, the settled ones
 * under Settled, and the one picked open beside them.
 */
export function GoalsView({ focus, onOpen }: { focus?: string; onOpen?: (type: string, id: string) => void }): React.JSX.Element {
  const all = useLive(() => vigil.items('goal'), [] as Item[], [], ['item'])
  const today = useToday()
  const [show, setShow] = useState<'open' | 'settled'>('open')
  const [open, setOpen] = useState<ItemFull | null>(null)
  const listOf = (which: 'open' | 'settled'): Item[] => which === 'open' ? openOnes(all) : all.filter((one) => one.closedAt && !one.archivedAt).sort((a, b) => b.closedAt!.localeCompare(a.closedAt!))
  const items = listOf(show)
  // Only the last pick lands: a late answer for the goal before is dropped.
  const asked = useLastAsked()
  const pick = (id: string): void =>
    asked(vigil.item(id), (found) => {
      setOpen(found)
      if (found) setShow(found.closedAt ? 'settled' : 'open')
    })
  // Open or Settled: the goal beside the list is always one of it, its first, or none.
  const switchTo = (which: 'open' | 'settled'): void => {
    setShow(which)
    if (!open || !!open.closedAt === (which === 'settled')) return
    const first = listOf(which)[0]
    if (first) pick(first.id)
    else (asked(), setOpen(null))
  }
  // Opening one is a step Back returns from; Open or Settled is kept in it.
  useOpened(open?.id, focus, pick, () => (asked(), setOpen(null)), { shown: items.map((one) => one.id), kind: 'item' })
  useKept('tab', show, setShow, 'open')
  // Read again when anything changes, so a log added from the box shows.
  useEffect(() => {
    // A reload for the one you left, landing after you switch, is dropped.
    let gone = false
    const off = window.api.captures.onChange(() => open && void vigil.item(open.id).then((found) => void (gone || setOpen(found))))
    return () => void ((gone = true), off())
  }, [open?.id])
  const [cursor, setCursor] = useListKeys(items.length, { onOpen: (index) => pick(items[index].id) })
  const go = (type: string, id: string): void => (type === 'goal' ? pick(id) : onOpen?.(type, id))
  // x, ⇧-click and ⌘A pick several, for the queue or the archive together.
  const several = usePickNotes(items.map((one) => one.id), cursor, { here: useHere(), noun: ['goal', 'goals'], tier: 'goal', titleOf: (id) => items.find((one) => one.id === id)?.title })
  const entries = items.map((one) => goalEntry(one, today, several.menu(one.id) ?? [{ label: 'Open', keys: '↵', run: () => pick(one.id) }, 'separator', ...goalMenu(one), ...several.rowItems(one.id)]))
  return (
    <>
      <Page aside={!!open} title="Goals" count={several.chosen.length || items.length} unit={several.chosen.length ? ['selected', 'selected'] : ['goal', 'goals']}
        actions={several.bar ??
          <span className="flex items-center gap-2">
            <Chips className="shrink-0" options={[{ id: 'open', label: 'Open' }, { id: 'settled', label: 'Ended' }]} on={(id) => id === show} pick={(id) => switchTo(id as 'open' | 'settled')} />
            <Button variant="ghost" size="sm" onClick={() => void startGoal(go)}><Plus className="size-3.5" /> New goal</Button>
          </span>
        }
      >
        {items.length ? (
          <NoteList groups={[['', entries]]} density="list" table="nuggets" selected={open?.id} cursor={cursor} onCursor={setCursor} onPick={pick} chosen={several.chosen} onChoose={several.toggle} className="mx-3 my-2" />
        ) : unloaded(all) ? null : !all.length ? (
          // None set yet: the page as it will look, with a few made-up ones.
          <Example tryIt={<><strong><button type="button" onClick={() => void startGoal(go)} className="text-foreground underline decoration-foreground/25 underline-offset-4 hover:decoration-foreground/60">set a goal</button>: a day you are aiming for.</strong> It counts down at the top of Home and keeps a log of the road there.</>}>
            <NoteList groups={[['', exampleGoals().filter((one) => (show === 'open') === !one.closedAt).map((one) => goalEntry(one, today))]]} density="list" table="nuggets" cursor={-1} onPick={() => undefined} className="mx-3 my-2" />
          </Example>
        ) : show === 'open' ? (
          <Empty title="No goals yet" action={<Button variant="secondary" size="sm" onClick={() => void startGoal(go)}><Plus className="size-3.5" /> New goal</Button>}>
            A goal is a day you are working toward. It stays in front of you, in the menu bar and at the top of Home, counts the days down, and keeps a log of the road there.
          </Empty>
        ) : (
          <Empty title="No goals ended yet">
            Once a goal's day has passed it asks how it went: made it, missed, or gave it up. It rests here after, logs and all.
          </Empty>
        )}
      </Page>
      {open && <GoalDetail key={open.id} item={open}
        top={<Stepper at={items.findIndex((one) => one.id === open.id)} total={items.length} onStep={(to) => pick(items[to].id)} />} />}
    </>
  )
}

/** The three answers once the day has passed, as small buttons. */
export function Answers({ item, small = false, onPick }: { item: { id: string; goalAt?: string | null }; small?: boolean; /** In place of settling it here: a window that says the answer its own way. */ onPick?: (how: 'made it' | 'missed' | 'let go') => void }): React.JSX.Element {
  const size = small ? 'h-6 px-2 text-xs' : 'h-8 px-3 text-control'
  const pick = (how: 'made it' | 'missed' | 'let go'): void => (onPick ? onPick(how) : settle(item, how))
  // Its day passed and not there yet: a week more, the goal's “+10 min”, with Undo.
  const more = (): void => {
    const target = dayKey(Date.now() + 7 * 86_400_000)
    void vigil.goalDates(item.id, { target }).then((ok) => {
      if (!ok) return chime('nope')
      chime('more')
      toast(`A week more: now for ${dayMonth(`${target}T12:00`)}`, item.goalAt ? () => void vigil.goalDates(item.id, { target: item.goalAt! }) : undefined)
    })
  }
  return (
    <span className="flex shrink-0 items-center gap-1">
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
export function GoalDetail({ item, top }: { item: ItemFull; top?: React.ReactNode }): React.JSX.Element {
  const today = useToday()
  const settings = useLive(vigil.settings, null as Settings | null)
  const target = item.goalAt ?? today
  const from = item.goalFrom ?? dayKey(item.createdAt)
  const left = daysLeft(target, today)
  const logs = [...item.glosses].reverse()
  const [picked, setPicked] = useState<Dot | null>(null)
  const tint = useTint(null, item.closedAt ? 'var(--muted-foreground)' : warmth(Math.max(left, 0)))
  const beacon: Beacon = item.beacon ?? settings?.goalBeacon ?? 'sometimes'
  const setBeacon = (mode: Beacon): void => {
    if (mode === beacon) return
    const was = item.beacon
    chime(mode === 'off' ? 'unstick' : 'stick')
    void vigil.setBeacon(item.id, mode).then(() =>
      toast(mode === 'always' ? 'On screen, on every Space' : mode === 'sometimes' ? 'On screen now and then: it comes out a few times a day' : 'Off screen: the menu bar and Home still show it',
        () => void vigil.setBeacon(item.id, was)))
  }
  const addLog = (): void => {
    const field = document.querySelector<HTMLTextAreaElement>('[data-log-field]')
    field?.scrollIntoView({ block: 'center', behavior: document.documentElement.dataset.motion === 'off' || matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' })
    field?.focus({ preventScroll: true })
  }
  const moveDates = (dates: { target?: string; from?: string }): void => {
    const was = { target, from }
    void vigil.goalDates(item.id, dates).then(() => {
      chime('tap')
      quietly(() => void vigil.goalDates(item.id, was))
    })
  }
  const lastLog = logs[0]?.createdAt
  return (
    <div data-open={item.id} className="note-pane flex min-w-0 flex-[1.4] flex-col overflow-y-auto @[40rem]/page:flex-row @[40rem]/page:overflow-visible @[56rem]/page:border-l [&>*:first-child]:min-h-[22rem] [&>*:first-child]:shrink-0 @[40rem]/page:[&>*:first-child]:min-h-0 @[40rem]/page:[&>*:first-child]:shrink">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto pt-3">
        <div className="flex min-h-7 items-center justify-between gap-2 px-3 @[40rem]/page:px-[4.25rem]">
          {top ?? <span />}
          <span className="text-xs text-muted-foreground">Set {dayMonth(`${from}T12:00`)}</span>
        </div>
        <CollectionHeader
          tint={tint}
          cover={<Cover colour={item.closedAt ? 'var(--muted-foreground)' : warmth(Math.max(left, 0))} seed={item.id}>
            {item.closedAt ? <Flag className="size-[42cqi]" strokeWidth={1.6} /> : <span className="tabular-nums">{left < 0 ? '?' : left}</span>}
          </Cover>}
          label={item.closedAt ? 'Goal, ended' : `Goal · ${dayName(`${target}T12:00`)}`}
          length={item.title.length}
          meta={item.closedAt
            ? [settledSaid(item), `for ${dayMonth(`${target}T12:00`)}`, logsSaid(logs.length)]
            : [left < 0 ? `${leftSaid(left)}` : leftSaid(left), `${percent(wayThrough(from, target))} of the way`, logsSaid(logs.length), ...(lastLog ? [`last log ${ago(lastLog)}`] : [])]}
          actions={<>
            <QuietAction label="Add a log" onClick={addLog}><Plus /></QuietAction>
            <MenuButton items={[
              ...(item.closedAt ? [{ label: 'Open it again', run: () => reopen(item) }]
                : [{ label: 'Made it', run: () => settle(item, 'made it') }, { label: 'Missed', run: () => settle(item, 'missed') }, { label: 'Give it up', hint: 'Kept under “Ended”', run: () => settle(item, 'let go') }]),
              'separator',
              ...goalMenu(item)
            ]} />
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
                if (title && title !== item.title) void vigil.saveItem(item.id, { title }).then(() => chime('noted'))
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
              if (why !== (item.why ?? '')) void vigil.saveItem(item.id, { why: why || null }).then(() => chime('noted'))
            }}
            className="private-text mt-1 block w-full resize-none bg-transparent px-2 text-body leading-relaxed text-foreground/85 italic outline-none [field-sizing:content] placeholder:text-foreground/70 placeholder:not-italic"
          />
          {!item.closedAt && left < 0 && (
            <div className="mt-5 flex flex-wrap items-center gap-3 rounded-xl border bg-accent/25 px-4 py-3">
              <span className="mr-auto min-w-0">
                <span className="block font-medium">Did you make it?</span>
                <span className="block text-body text-foreground">{dayName(`${target}T12:00`)} has passed. Say how it went, and <strong className="font-semibold">it moves to Ended</strong>.</span>
              </span>
              <Answers item={item} />
            </div>
          )}
          <section className="mt-6">
            <h3 className="mb-1 px-2 text-meta text-muted-foreground">The road</h3>
            {/* How often you showed up for it: days with a log against the days gone, in the page's own ink. */}
            <p data-goal-showed className="mb-2 px-2 text-control leading-snug text-foreground tabular-nums">
              {dayMonth(`${from}T12:00`)} to {dayMonth(`${target}T12:00`)}, <strong className="font-semibold">{num(daysBetween(from, target) + 1)} days</strong>.{' '}
              {(() => {
                const gone = Math.max(1, Math.min(daysBetween(from, today), daysBetween(from, target)) + 1)
                const logged = new Set(item.glosses.map((one) => dayKey(one.createdAt)).filter((day) => day >= from && day <= today)).size
                return <>Logged on <strong className="font-semibold">{num(logged)} of {num(gone)} {gone === 1 ? 'day' : 'days'}</strong> so far{gone > 1 ? `, ${Math.round((logged / gone) * 100)}%` : ''}.</>
              })()}
            </p>
            <div className="px-2"><Journey from={from} target={target} today={today} logs={item.glosses} picked={picked} onPick={setPicked} /></div>
          </section>
          <Logs item={item} picked={picked} onClear={() => setPicked(null)} />
        </div>
      </div>

      <Props>
        <Island compact title="Goal">
          <DatePicker value={`${target}T12:00`} onChange={(iso) => iso && dayKey(iso) !== target && moveDates({ target: dayKey(iso) })} suggest={['in 1 month', 'in 3 months', 'in 1 year']}>
            <Flag className="size-4 shrink-0" style={{ color: item.closedAt ? undefined : warmth(Math.max(left, 0)) }} />
            <span className="truncate">For {dayMonth(`${target}T12:00`, 'always')}</span>
          </DatePicker>
          <DatePicker value={`${from}T12:00`} onChange={(iso) => iso && dayKey(iso) !== from && moveDates({ from: dayKey(iso) })}>
            <CalendarPlus className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            <span className="truncate text-muted-foreground">Set {dayMonth(`${from}T12:00`, 'always')}</span>
          </DatePicker>
        </Island>
        {!item.closedAt && (
          <Island compact title="On screen">
            <div className="flex flex-col gap-1.5 px-2 py-1.5">
              <span className="text-control">Keep this goal on screen</span>
              <Chips options={[{ id: 'always', label: 'Always' }, { id: 'sometimes', label: 'Now and then' }, { id: 'off', label: 'Off' }]}
                on={(id) => id === beacon} pick={(id) => setBeacon(id as Beacon)} />
              <span className="text-meta leading-snug text-muted-foreground">
                {beacon === 'always' ? 'On every Space, all the time.' : beacon === 'sometimes' ? 'Out a few times a day, then tucked away. In the last week it stays.' : 'The menu bar and Home still show it.'}
              </span>
            </div>
          </Island>
        )}
        <Island compact title={item.closedAt ? 'Ended' : 'How it went'}>
          {item.closedAt ? (
            <Prop icon={Wind} onClick={() => reopen(item)}>Open it again</Prop>
          ) : (
            <>
              <Prop alive={SimpleCheckedIcon} onClick={() => settle(item, 'made it')}>Made it</Prop>
              <Prop icon={Flag} onClick={() => settle(item, 'missed')}>Missed</Prop>
              <Prop icon={Wind} onClick={() => settle(item, 'let go')} tip="Kept under “Ended”">Give it up</Prop>
            </>
          )}
        </Island>
        <Island compact title={<Term>Surfacing</Term>}>
          <Prop icon={item.private ? EyeOff : Eye} active={!!item.private} onClick={() => void vigil.setPrivate('nuggets', item.id, !item.private)}>
            {item.private ? 'Private: its name stays hidden' : 'Its name can show'}
          </Prop>
          <Prop icon={item.archivedAt ? ArchiveRestore : Archive} active={!!item.archivedAt} onClick={() => void archive('nuggets', [item.id], !item.archivedAt)} tip={item.archivedAt ? 'Bring it back' : 'Kept, out of sight'}>
            {item.archivedAt ? 'Unarchive' : 'Archive'}
          </Prop>
        </Island>
      </Props>
    </div>
  )
}

/** How many logs each day has, by "2026-10-07". */
const logDays = (logs: Gloss[]): Map<string, Gloss[]> => {
  const days = new Map<string, Gloss[]>()
  for (const log of logs) {
    const day = dayKey(log.createdAt)
    days.set(day, [...(days.get(day) ?? []), log])
  }
  return days
}
const logsIn = (days: Map<string, Gloss[]>, dot: Dot): Gloss[] =>
  dot.day === dot.last ? days.get(dot.day) ?? [] : [...days].filter(([day]) => day >= dot.day && day <= dot.last).flatMap(([, list]) => list)

/**
 * The road from the day a goal was set to its day: a dot a day, a column a
 * week, as the focus timer draws its figures. Gone days lit, today breathing,
 * days with a log in the accent, the day itself ringed. Pointed at, a dot
 * says its day and its logs; clicked, the logs below show only that day.
 * `compact` is the beacon's: no names, and only the marked dots (today, the
 * day, the milestones, days with a log) say what they are when pointed at.
 */
export function Journey({ from, target, today, logs, picked, onPick, compact = false }: {
  from: string
  target: string
  today: string
  logs: Gloss[]
  picked?: Dot | null
  onPick?: (dot: Dot | null) => void
  compact?: boolean
}): React.JSX.Element {
  const road = journey(from, target, today)
  const days = logDays(logs)
  const [hover, setHover] = useState<Dot | null>(null)
  // The road spans the whole width it is given, like the bars under it: the
  // weeks spread out evenly, each dot as large as reads (22px at most, 12 on
  // the beacon) and always round. Measured, so a short road never stops half way.
  const most = compact ? 12 : 22
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
  // The beacon's road is a dense field instead, like a phone's dot widget:
  // small dots, day after day, left to right, filling the card. The days
  // before the goal was set fill the rows ahead of it, faint, so the field is
  // always full and the goal's own days sit at its end, the day itself last.
  const flow = compact && width > 0
  // On the page, a week a column as before, but small dots and as many weeks
  // as the width holds: the weeks before the goal was set fill the left, faint,
  // so the road always runs edge to edge and ends on the day itself.
  const weeks = !compact && width > 0 && road.by === 'day'
  const before = weeks ? Math.max(0, Math.floor(width / 15) - road.cols) : 0
  // A long road (a goal a year away) packs its dots smaller until it fits the card.
  let across = flow ? Math.max(7, Math.floor(width / 9)) : road.cols + before
  while (flow && height > 0 && across < width / 3 && Math.ceil(road.dots.length / across) * (width / across) > height) across += 1
  const room = flow ? Math.max(Math.ceil(road.dots.length / across), Math.floor(height / (width / across))) : 0
  const lead = flow ? Math.min(365, Math.max(0, room * across - road.dots.length)) : weeks ? before * road.rows : 0
  const down = flow ? Math.ceil((lead + road.dots.length) / across) : road.rows
  const place = (dot: Dot, index: number): Dot =>
    flow ? { ...dot, col: (index + lead) % across, row: Math.floor((index + lead) / across) } : { ...dot, col: dot.col + before }
  const step = width ? width / across : most
  const cell = flow || weeks ? step : Math.min(step, most)
  const at = (dot: Dot): { x: number; y: number } => ({ x: (dot.col + 0.5) * step, y: (dot.row + 0.5) * cell })
  // The milestones on the way, the same ones that celebrate: halfway, a month to go, a week to go.
  const shiftDay = (day: string, by: number): string => { const at = new Date(`${day}T12:00`); at.setDate(at.getDate() + by); return dayKey(at.toISOString()) }
  const span = Math.round((new Date(`${target}T12:00`).getTime() - new Date(`${from}T12:00`).getTime()) / 86_400_000)
  const marks: [string, string][] = [[shiftDay(from, Math.round(span / 2)), 'halfway'], [shiftDay(target, -30), 'a month to go'], [shiftDay(target, -7), 'a week to go']]
  const milestoneIn = (dot: Dot): string | undefined => marks.find(([day]) => day >= from && day >= dot.day && day <= dot.last)?.[1]
  // Days marked for something on the road (an exam, a launch): a ring in their colour, named when pointed at.
  const marked = useMilestones(from, target)
  const markIn = (dot: Dot): Milestone | undefined => marked.find((one) => one.day >= dot.day && one.day <= dot.last)
  const shown = hover ? logsIn(days, hover) : []
  return (
    <div ref={box} className={`relative w-full ${compact ? 'h-full' : ''}`}>
      {!compact && (
        <div aria-hidden className="relative mb-1 h-4 text-[11px] text-muted-foreground">
          {road.months.map((month) => (
            <span key={month.col} className="absolute top-0 whitespace-nowrap" style={{ left: `${((month.col + before) / across) * 100}%` }}>{month.label}</span>
          ))}
        </div>
      )}
      <svg
        role="img"
        aria-label={`${num(road.dots.length)} ${road.by === 'day' ? 'days' : 'weeks'} from ${dayMonth(`${from}T12:00`)} to ${dayMonth(`${target}T12:00`)}, ${num(road.dots.filter((dot) => dot.past).length)} gone`}
        viewBox={`0 0 ${across * step} ${down * cell}`}
        className="block h-auto w-full overflow-visible"
        onMouseLeave={() => setHover(null)}
      >
        {Array.from({ length: lead }, (_, index) => (
          <circle key={`before-${index}`} cx={((weeks ? Math.floor(index / road.rows) : index % across) + 0.5) * step} cy={((weeks ? index % road.rows : Math.floor(index / across)) + 0.5) * cell} r={0.34 * cell} fill="currentColor" style={{ opacity: 0.06 }} />
        ))}
        {road.dots.map((given, index) => {
          const dot = place(given, index)
          const logged = logsIn(days, dot).length > 0
          const on = picked?.day === dot.day
          const marker = milestoneIn(dot)
          const colour = logged ? ACCENT : 'currentColor'
          // Quiet by default: days gone are dim, a logged day a little brighter, and only
          // today and the day itself at full strength, so the eye goes to where you are.
          const opacity = dot.today ? 1 : logged ? (dot.past ? 0.7 : 1) : marker ? 0.5 : dot.past ? 0.24 : 0.12
          return (
            <g key={dot.day}
              onMouseEnter={compact ? undefined : () => setHover(dot)}
              onClick={compact || !onPick ? undefined : () => (chime('tap'), onPick(on ? null : dot))}
              className={compact ? undefined : 'cursor-pointer'}>
              {/* A bigger, unseen target, so the pointer finds each one. */}
              {!compact && <rect x={dot.col * step} y={dot.row * cell} width={step} height={cell} fill="transparent" />}
              {/* The day itself: a bold ring round a full dot, in the accent. */}
              {dot.target && <circle cx={at(dot).x} cy={at(dot).y} r={0.56 * cell} fill="none" stroke={ACCENT} strokeWidth={0.14 * cell} />}
              {/* Today: a halo that breathes round a full, bright dot. */}
              {dot.today && <circle cx={at(dot).x} cy={at(dot).y} r={0.56 * cell} fill="none" stroke={ACCENT} strokeWidth={0.1 * cell} className="mf-goal-today" />}
              {/* A milestone on the way (halfway, a month to go, a week to go): a quiet ring. */}
              {marker && !dot.target && !dot.today && <circle cx={at(dot).x} cy={at(dot).y} r={0.52 * cell} fill="none" stroke="currentColor" strokeWidth={0.08 * cell} style={{ opacity: 0.6 }} />}
              {markIn(dot) && !dot.target && <circle data-road-marked cx={at(dot).x} cy={at(dot).y} r={0.56 * cell} fill="none" stroke={inkOf(markIn(dot)!)} strokeWidth={0.12 * cell} />}
              {on && <circle cx={at(dot).x} cy={at(dot).y} r={0.6 * cell} fill="none" stroke="currentColor" strokeWidth={0.08 * cell} />}
              <circle cx={at(dot).x} cy={at(dot).y} r={(dot.target ? 0.32 : dot.today ? 0.4 : 0.34) * cell} fill={dot.target && !logged ? ACCENT : colour}
                style={{ opacity: dot.target ? 1 : opacity }} />
            </g>
          )
        })}
      </svg>
      {/* The beacon is dragged by its whole card, which swallows the pointer: the
          marked dots get a small spot each that is not, to be pointed at. */}
      {compact && road.dots.map((given, index) => {
        const dot = place(given, index)
        if (!dot.today && !dot.target && !milestoneIn(dot) && !markIn(dot) && !logsIn(days, dot).length) return null
        const { x, y } = at(dot)
        return <span key={dot.day} aria-hidden data-road-mark onMouseEnter={() => setHover(dot)} onMouseLeave={() => setHover(null)}
          className="absolute rounded-full" style={{ left: x - cell * 0.6, top: y - cell * 0.6, width: cell * 1.2, height: cell * 1.2, WebkitAppRegion: 'no-drag' } as React.CSSProperties} />
      })}
      {hover && compact && (() => {
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
          <div className="pointer-events-none absolute z-10 w-max max-w-full rounded-md bg-popover px-2 py-1 text-[11px] leading-snug text-popover-foreground shadow-(--mf-panel-shadow) ring-1 ring-foreground/10"
            style={{ ...side, ...(below ? { top: y + cell * 0.8 } : { bottom: height - y + cell * 0.8 }) }}>
            <span className="block font-medium">{head}{named ? ` · ${named.title}` : ''}</span>
            {said.length > 0 && <span className="block max-w-56 truncate text-muted-foreground">{logsSaid(said.length)}: {said[said.length - 1].body.replace(/\s+/g, ' ')}</span>}
          </div>
        )
      })()}
      {hover && !compact && (
        <div className={`pointer-events-none absolute z-10 w-max max-w-64 rounded-md ${hover.col < across / 3 ? '-translate-x-3' : hover.col > (across * 2) / 3 ? '-translate-x-[calc(100%-0.75rem)]' : '-translate-x-1/2'} bg-popover px-2.5 py-1.5 text-xs text-popover-foreground shadow-(--mf-panel-shadow) ring-1 ring-foreground/10`}
          style={{ left: `${((hover.col + 0.5) / across) * 100}%`, top: `calc(${((hover.row + 1) / road.rows) * 100}% + 1.25rem + 4px)` }}>
          <span className="block font-medium">
            {hover.day === hover.last ? dayName(`${hover.day}T12:00`) : `${dayMonth(`${hover.day}T12:00`)} to ${dayMonth(`${hover.last}T12:00`)}`}
            {hover.today ? ' · today' : hover.target ? ' · the day' : milestoneIn(hover) ? ` · ${milestoneIn(hover)}` : ''}
            {markIn(hover) ? ` · ${markIn(hover)!.icon ? `${markIn(hover)!.icon} ` : ''}${markIn(hover)!.title}` : ''}
          </span>
          <span className="block text-muted-foreground">{shown.length ? `${logsSaid(shown.length)}: ${clip(shown[shown.length - 1].body.replace(/\s+/g, ' '), 81)}` : hover.past || hover.today ? 'No log' : `${leftSaid(daysLeft(hover.day, today)).toLowerCase()}`}</span>
        </div>
      )}
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
    const keepOne = (): void => void vigil.addClue(item.id, text).then((log) => {
      chime('mark')
      // Taken back, the words are in the line again, ahead of anything typed since.
      quietly(log ? () => (void vigil.dropClue(log), setWords((now) => (now.trim() ? `${text}\n${now}` : text))) : undefined)
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
            {logs.map((log) => {
              const menu: MenuItem[] = lines.picked(log.id) && lines.count > 1 ? [
                { label: `Copy ${num(lines.count)} logs`, run: () => copy(logs.filter((one) => lines.picked(one.id)).map((one) => one.body).join('\n')) },
                'separator',
                { label: `Remove ${num(lines.count)} logs`, keys: '⌫', danger: true, run: () => lines.remove(logs.filter((one) => lines.picked(one.id)).map((one) => one.id)) },
                'separator',
                lines.count < logs.length && { label: 'Select all', keys: '⌘A', run: lines.all },
                { label: 'Clear the selection', keys: 'esc', run: lines.clear }
              ] : [
                { label: 'Change the words…', run: () => void reword(log.id, log.body, 'log') },
                { label: 'Copy the log', run: () => copy(log.body) },
                'separator',
                { label: 'Remove the log', keys: '⌫', danger: true, run: () => lines.remove([log.id]) },
                'separator',
                { label: lines.picked(log.id) ? 'Unselect' : 'Select', keys: 'X', run: () => lines.toggle(log.id) },
                logs.length > 1 && { label: 'Select all', keys: '⌘A', run: lines.all }
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
          {picked ? 'No log that day.' : item.closedAt ? 'No logs were kept. Open the goal again to add one.' : <Typed text={`Nothing logged yet. Write what you did above, or in quick capture start a line with “+${goalWord(item.title)}:” and what you did.`} step={28} />}
        </p>
      )}
    </section>
  )
}

/** A goal's road as a bar, one look on Home and the Goals page: its warmth in the last month, plain before. */
export function GoalBar({ left, way, className = '' }: { left: number; way: number; className?: string }): React.JSX.Element {
  const warm = left <= 30 ? warmth(Math.max(left, 0)) : null
  return (
    <ProgressBar value={way} label={`${percent(way)} of the way`} className={className} thick={1} track="color-mix(in oklab, var(--foreground) 8%, transparent)"
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
  const settings = useLive(vigil.settings, null as Settings | null)
  const all = useLive(() => vigil.items('goal'), [] as Item[], [], ['item'])
  const today = useToday()
  const open = openOnes(all)
  if (!open.length || settings?.goalStrip === false) return null
  const shown = open.slice(0, 2)
  return (
    <div className={`flex flex-col ${className}`} role="group" aria-label="Goals">
      {shown.map((goal) => {
        const left = daysLeft(goal.goalAt!, today)
        const way = wayThrough(goal.goalFrom ?? today, goal.goalAt!)
        return (
          <div key={goal.id} role="button" tabIndex={0} data-private={goal.private ? '' : undefined}
            onClick={() => (chime('open'), onOpen?.('goal', goal.id))}
            onKeyDown={(event) => event.key === 'Enter' && event.target === event.currentTarget && onOpen?.('goal', goal.id)}
            className="group/goal flex cursor-default flex-col gap-1.5 rounded-md px-2 py-1.5 text-control outline-none transition-colors hover:bg-foreground/[0.045] focus-visible:bg-foreground/[0.045]">
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
        )
      })}
      {open.length > 2 && (
        <button type="button" onClick={() => (chime('tap'), onOpen?.('view', 'goals'))} className="self-start rounded-md px-2 py-0.5 text-xs text-muted-foreground hover:text-foreground">
          {open.length - 2} more {open.length - 2 === 1 ? 'goal' : 'goals'}, in Goals →
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
  const all = useLive(() => vigil.items('goal'), [] as Item[], [], ['item'])
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
  const log = await vigil.addClue(goal.id, from.text ?? '', from.captureId)
  if (!log) {
    refuse('That capture was already dealt with. Put it back in the Inbox first')
    return false
  }
  chime('mark')
  toast(`Logged to ${quoted(goal.title, 36)}`, () => void vigil.dropClue(log).then(() => (chime('undo'), onUndo?.())))
  return true
}

