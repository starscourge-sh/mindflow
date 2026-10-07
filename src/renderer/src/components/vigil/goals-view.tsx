import { useEffect, useState } from 'react'
import { Flag, Plus, Wind } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { alive } from '@/components/ui/alive-icon'
import Stack3Icon from '@/components/ui/stack-3-icon'
import ArrowBackUpIcon from '@/components/ui/arrow-back-up-icon'
import EyeOffIcon from '@/components/ui/eye-off-icon'
import EyeIcon from '@/components/ui/eye-icon'
import SimpleCheckedIcon from '@/components/ui/simple-checked-icon'
import XIcon from '@/components/ui/x-icon'

import { EASE } from '@/lib/motion'
import { chime } from '@/lib/sound'
import { useLive, vigil, type Gloss, type Item, type ItemFull, type Settings } from '@/lib/vigil'
import { archive } from '@/lib/notes'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Chips } from './display'
import { NoteList, type Entry } from './note-list'
import { RowMenu, copy, type MenuItem } from './row-menu'
import { Empty, Island, Kbd, Page, Prop, Props, Rolling, Stepper, Tip, Typed, refuse, toast, useListKeys } from './ui'
import { CollectionHeader, Cover, MenuButton, QuietAction, useTint } from './collection-header'
import { DatePicker } from './date-picker'
import { ago, dayKey, dayMonth, dayName, num } from '../../../../main/dates'
import { daysBetween, daysLeft, journey, leftSaid, percent, tempus, wayThrough, type Dot } from '../../../../main/goal-days'

// itshover drawings in lucide's place, moving when their control is pointed at.
const Archive = alive(Stack3Icon)
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

export const logsSaid = (n: number): string => (n ? `${num(n)} ${n === 1 ? 'log' : 'logs'}` : 'no logs yet')
const HOW: Record<string, string> = { 'made it': 'Made it', missed: 'Missed', 'let go': 'Let go' }
/** How a settled goal ended, and when: "Made it on 14 Dec". */
const settledSaid = (item: Item): string => `${HOW[item.closedHow ?? ''] ?? 'Settled'} on ${dayMonth(item.closedAt!)}`
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

/** Settle a goal: made it, missed, or let go; undoable. */
export function settle(item: { id: string }, how: 'made it' | 'missed' | 'let go'): void {
  void vigil.closeGoal(item.id, how).then(() => {
    chime(how === 'made it' ? 'answered' : how === 'missed' ? 'called' : 'release')
    toast(how === 'made it' ? 'Made it. It rests under Settled' : how === 'missed' ? 'Missed: kept under Settled, with its logs' : 'Let go: it rests under Settled',
      () => void vigil.reopenGoal(item.id))
  })
}

/** A settled goal open again; undoable back to how it was settled. */
function reopen(item: Item): void {
  const how = (item.closedHow ?? 'let go') as 'made it' | 'missed' | 'let go'
  void vigil.reopenGoal(item.id).then(() => {
    chime('hold')
    toast('Open again', () => void vigil.closeGoal(item.id, how))
  })
}

/** The new goal over the page: its name, the day, and why, if you want to say. */
export function GoalAsker(): React.JSX.Element | null {
  const [asked, setAsked] = useState<{ answer: (goal: { title: string; target: string; why: string } | null) => void } | null>(null)
  const [title, setTitle] = useState('')
  const [target, setTarget] = useState<string | null>(null)
  const [why, setWhy] = useState('')
  useEffect(() => {
    const onAsk = (event: Event): void => {
      chime('open')
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
    if (!title.trim()) return refuse('Name the goal first')
    if (!target) return refuse('Pick the day it is for')
    if (dayKey(target) < dayKey()) return refuse('That day has passed. Pick one ahead')
    done({ title: title.trim(), target: dayKey(target), why: why.trim() })
  }
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
          {left !== null && left >= 0 && <span className="text-xs text-muted-foreground"><Rolling by="word" text={leftSaid(left).toLowerCase()} /></span>}
        </div>
        <Input value={why} onChange={(event) => setWhy(event.target.value)} placeholder="Why it matters (if you want to say)" aria-label="Why it matters" />
        <div className="mt-1 flex items-center gap-2">
          <p className="mr-auto text-xs text-muted-foreground">Enter to set it · Escape to leave it</p>
          <Button variant="ghost" size="sm" onClick={() => done(null)}>Cancel</Button>
          <Button size="sm" onClick={keep} disabled={!title.trim() || !target}>Set the goal</Button>
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
      : `${left < 0 ? `${leftSaid(left)}: did you make it?` : `${leftSaid(left)} · ${percent(wayThrough(item.goalFrom ?? today, item.goalAt ?? today))} of the way`} · ${logsSaid(item.clues)}`,
    marks: item.private ? <EyeOff className="size-3 shrink-0 text-muted-foreground" aria-label="Private" /> : null,
    dim: !!item.closedAt,
    private: !!item.private,
    menu
  }
}

/** What a goal offers besides opening it: its row menu and its page's ··· share it. */
const goalMenu = (item: Item): MenuItem[] => [
  { label: item.private ? 'Not private' : 'Private', run: () => void vigil.setPrivate('nuggets', item.id, !item.private) },
  { label: item.archivedAt ? 'Unarchive' : 'Archive', run: () => void archive('nuggets', [item.id], !item.archivedAt) },
  'separator',
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
  const items = show === 'open' ? openOnes(all) : all.filter((one) => one.closedAt && !one.archivedAt).sort((a, b) => b.closedAt!.localeCompare(a.closedAt!))
  const pick = (id: string): void =>
    void vigil.item(id).then((found) => {
      setOpen(found)
      if (found) setShow(found.closedAt ? 'settled' : 'open')
    })
  useEffect(() => void (focus && pick(focus)), [focus]) // eslint-disable-line react-hooks/exhaustive-deps
  // Read again when anything changes, so a log added from the box shows.
  useEffect(() => window.api.captures.onChange(() => open && void vigil.item(open.id).then(setOpen)), [open?.id])
  const [cursor, setCursor] = useListKeys(items.length, { onOpen: (index) => pick(items[index].id), onBack: () => setOpen(null) })
  const go = (type: string, id: string): void => (type === 'goal' ? pick(id) : onOpen?.(type, id))
  const entries = items.map((one) => goalEntry(one, today, [{ label: 'Open', keys: '↵', run: () => pick(one.id) }, 'separator', ...goalMenu(one)]))
  return (
    <>
      <Page aside={!!open} title="Goals" count={items.length} unit={['goal', 'goals']}
        actions={
          <span className="flex items-center gap-2">
            <Chips className="shrink-0" options={[{ id: 'open', label: 'Open' }, { id: 'settled', label: 'Settled' }]} on={(id) => id === show} pick={(id) => setShow(id as 'open' | 'settled')} />
            <Button variant="ghost" size="sm" onClick={() => void startGoal(go)}><Plus className="size-3.5" /> New goal</Button>
          </span>
        }
      >
        {items.length ? (
          <NoteList groups={[['', entries]]} density="list" table="nuggets" selected={open?.id} cursor={cursor} onCursor={setCursor} onPick={pick} className="mx-3 my-2" />
        ) : show === 'open' ? (
          <Empty shape={['star', 2]} title="No goals yet" action={<Button variant="secondary" size="sm" onClick={() => void startGoal(go)}><Plus className="size-3.5" /> New goal</Button>}>
            A goal is a day you are working toward. It stays in front of you, in the menu bar and at the top of Home, counts the days down, and keeps a log of the road there.
          </Empty>
        ) : (
          <Empty shape={['moon', 1]} title="Nothing settled yet">
            Once a goal's day has passed it asks how it went: made it, missed, or let go. It rests here after, logs and all.
          </Empty>
        )}
      </Page>
      {open && <GoalDetail key={open.id} item={open}
        top={<Stepper at={items.findIndex((one) => one.id === open.id)} total={items.length} onStep={(to) => pick(items[to].id)} />} />}
    </>
  )
}

/** The three answers once the day has passed, as small buttons. */
function Answers({ item, small = false }: { item: { id: string }; small?: boolean }): React.JSX.Element {
  const size = small ? 'h-6 px-2 text-xs' : 'h-8 px-3 text-control'
  return (
    <span className="flex shrink-0 items-center gap-1">
      <button type="button" onClick={(event) => (event.stopPropagation(), settle(item, 'made it'))}
        className={`flex items-center gap-1.5 rounded-full bg-primary font-medium text-primary-foreground transition-transform duration-150 hover:scale-[1.03] active:scale-[0.97] ${size}`}>
        <Check className="size-3.5" /> Made it
      </button>
      {(['missed', 'let go'] as const).map((how) => (
        <button key={how} type="button" onClick={(event) => (event.stopPropagation(), settle(item, how))}
          className={`rounded-full text-muted-foreground transition-colors hover:bg-foreground/[0.07] hover:text-foreground ${size}`}>
          {HOW[how]}
        </button>
      ))}
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
    field?.scrollIntoView({ block: 'center', behavior: document.documentElement.dataset.motion === 'off' ? 'instant' : 'smooth' })
    field?.focus({ preventScroll: true })
  }
  const moveDates = (dates: { target?: string; from?: string }): void => {
    const was = { target, from }
    void vigil.goalDates(item.id, dates).then(() => {
      chime('tap')
      toast(dates.target ? `Now for ${dayMonth(`${dates.target}T12:00`)}` : `Set on ${dayMonth(`${dates.from}T12:00`)}`, () => void vigil.goalDates(item.id, was))
    })
  }
  const lastLog = logs[0]?.createdAt
  return (
    <div className="note-pane flex min-w-0 flex-[1.4] flex-col overflow-y-auto @[40rem]/page:flex-row @[40rem]/page:overflow-visible @[56rem]/page:border-l [&>*:first-child]:min-h-[22rem] [&>*:first-child]:shrink-0 @[40rem]/page:[&>*:first-child]:min-h-0 @[40rem]/page:[&>*:first-child]:shrink">
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
          label={item.closedAt ? 'Goal, settled' : `Goal · ${dayName(`${target}T12:00`)}`}
          length={item.title.length}
          meta={item.closedAt
            ? [settledSaid(item), `for ${dayMonth(`${target}T12:00`)}`, logsSaid(logs.length)]
            : [left < 0 ? `${leftSaid(left)}` : leftSaid(left), `${percent(wayThrough(from, target))} of the way`, logsSaid(logs.length), ...(lastLog ? [`last log ${ago(lastLog)}`] : [])]}
          actions={<>
            <QuietAction label="Add a log" onClick={addLog}><Plus /></QuietAction>
            <MenuButton items={[
              ...(item.closedAt ? [{ label: 'Open it again', run: () => reopen(item) }]
                : [{ label: 'Made it', run: () => settle(item, 'made it') }, { label: 'Missed', run: () => settle(item, 'missed') }, { label: 'Let it go', run: () => settle(item, 'let go') }]),
              'separator',
              ...goalMenu(item)
            ]} />
          </>}
          title={
            <textarea
              rows={1}
              className="block w-full resize-none bg-transparent text-balance outline-none [field-sizing:content] placeholder:text-foreground/50"
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
            className="private-text mt-1 block w-full resize-none bg-transparent px-2 text-body leading-relaxed text-foreground/85 italic outline-none [field-sizing:content] placeholder:text-foreground/45 placeholder:not-italic"
          />
          {!item.closedAt && left < 0 && (
            <div className="mt-5 flex flex-wrap items-center gap-3 rounded-xl border bg-accent/25 px-4 py-3">
              <span className="mr-auto min-w-0">
                <span className="block font-medium">Did you make it?</span>
                <span className="block text-meta text-muted-foreground">{dayName(`${target}T12:00`)} has passed. Say how it went, and it moves to Settled.</span>
              </span>
              <Answers item={item} />
            </div>
          )}
          <section className="mt-6">
            <h3 className="mb-2 flex items-baseline gap-1.5 px-2 text-meta text-muted-foreground">
              The road
              <span className="ml-auto text-xs tabular-nums">{dayMonth(`${from}T12:00`)} to {dayMonth(`${target}T12:00`)} · {num(daysBetween(from, target) + 1)} days</span>
            </h3>
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
            <Plus className="size-4 shrink-0 rotate-45 opacity-0" aria-hidden />
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
        <Island compact title={item.closedAt ? 'Settled' : 'How it went'}>
          {item.closedAt ? (
            <Prop icon={Wind} onClick={() => reopen(item)}>Open it again</Prop>
          ) : (
            <>
              <Prop alive={SimpleCheckedIcon} onClick={() => settle(item, 'made it')}>Made it</Prop>
              <Prop icon={Flag} onClick={() => settle(item, 'missed')}>Missed</Prop>
              <Prop icon={Wind} onClick={() => settle(item, 'let go')}>Let it go</Prop>
            </>
          )}
        </Island>
        <Island compact title="Surfacing">
          <Prop icon={item.private ? EyeOff : Eye} active={!!item.private} onClick={() => void vigil.setPrivate('nuggets', item.id, !item.private)}>
            {item.private ? 'Private: its name stays hidden' : 'Its name can show'}
          </Prop>
          <Prop icon={item.archivedAt ? ArchiveRestore : Archive} active={!!item.archivedAt} onClick={() => void archive('nuggets', [item.id], !item.archivedAt)}>
            {item.archivedAt ? 'Archived: bring it back' : 'Archive'}
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
 * `compact` is the beacon's: no names, no pointing.
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
  // As large as reads, never wider than the space: 22px a dot at most, 12 on the beacon.
  const most = compact ? 12 : 22
  const shown = hover ? logsIn(days, hover) : []
  return (
    <div className="relative" style={{ width: `min(100%, ${road.cols * most}px)` }}>
      {!compact && (
        <div aria-hidden className="relative mb-1 h-4 text-[11px] text-muted-foreground">
          {road.months.map((month) => (
            <span key={month.col} className="absolute top-0 whitespace-nowrap" style={{ left: `${(month.col / road.cols) * 100}%` }}>{month.label}</span>
          ))}
        </div>
      )}
      <svg
        role="img"
        aria-label={`${num(road.dots.length)} ${road.by === 'day' ? 'days' : 'weeks'} from ${dayMonth(`${from}T12:00`)} to ${dayMonth(`${target}T12:00`)}, ${num(road.dots.filter((dot) => dot.past).length)} gone`}
        viewBox={`0 0 ${road.cols} ${road.rows}`}
        className="block h-auto w-full overflow-visible"
        onMouseLeave={() => setHover(null)}
      >
        {road.dots.map((dot) => {
          const logged = logsIn(days, dot).length > 0
          const on = picked?.day === dot.day
          const colour = logged ? ACCENT : 'currentColor'
          const opacity = logged || dot.today ? 1 : dot.past ? 0.5 : 0.13
          return (
            <g key={dot.day}
              onMouseEnter={compact ? undefined : () => setHover(dot)}
              onClick={compact || !onPick ? undefined : () => (chime('tap'), onPick(on ? null : dot))}
              className={compact ? undefined : 'cursor-pointer'}>
              {/* A bigger, unseen target, so the pointer finds each one. */}
              {!compact && <rect x={dot.col} y={dot.row} width={1} height={1} fill="transparent" />}
              {dot.target && <circle cx={dot.col + 0.5} cy={dot.row + 0.5} r={0.46} fill="none" stroke={ACCENT} strokeWidth={0.1} />}
              {on && <circle cx={dot.col + 0.5} cy={dot.row + 0.5} r={0.48} fill="none" stroke="currentColor" strokeWidth={0.08} />}
              <circle cx={dot.col + 0.5} cy={dot.row + 0.5} r={dot.target ? 0.24 : 0.34} fill={dot.target && !logged ? ACCENT : colour}
                className={dot.today ? 'mf-goal-today' : undefined} style={{ opacity: dot.target ? 1 : opacity }} />
            </g>
          )
        })}
      </svg>
      {hover && !compact && (
        <div className={`pointer-events-none absolute z-10 w-max max-w-64 rounded-md ${hover.col < road.cols / 3 ? '-translate-x-3' : hover.col > (road.cols * 2) / 3 ? '-translate-x-[calc(100%-0.75rem)]' : '-translate-x-1/2'} bg-popover px-2.5 py-1.5 text-xs text-popover-foreground shadow-(--mf-panel-shadow) ring-1 ring-foreground/10`}
          style={{ left: `${((hover.col + 0.5) / road.cols) * 100}%`, top: `calc(${((hover.row + 1) / road.rows) * 100}% + 1.25rem + 4px)` }}>
          <span className="block font-medium">
            {hover.day === hover.last ? dayName(`${hover.day}T12:00`) : `${dayMonth(`${hover.day}T12:00`)} to ${dayMonth(`${hover.last}T12:00`)}`}
            {hover.today ? ' · today' : hover.target ? ' · the day' : ''}
          </span>
          <span className="block text-muted-foreground">{shown.length ? `${logsSaid(shown.length)}: ${shown[shown.length - 1].body.replace(/\s+/g, ' ').slice(0, 80)}` : hover.past || hover.today ? 'No log' : `${leftSaid(daysLeft(hover.day, today)).toLowerCase()}`}</span>
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
  const keep = (): void => {
    const text = words.trim()
    if (!text) return
    setWords('')
    void vigil.addClue(item.id, text).then((log) => {
      chime('mark')
      toast('Logged', log ? () => void vigil.dropClue(log) : undefined)
    })
  }
  return (
    <section data-chrome className="mt-8 w-full border-t pt-4 text-body">
      <h3 className="mb-2 flex items-baseline gap-1.5 px-2 text-meta text-muted-foreground">
        Logs {all.length > 0 && <Rolling text={all.length} className="tabular-nums" />}
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
            className="min-w-0 flex-1 resize-none bg-transparent text-control outline-none [field-sizing:content] placeholder:text-foreground/60"
          />
          {words.trim() && <span className="mt-0.5 flex shrink-0 items-center gap-1 text-xs text-muted-foreground"><Kbd>↵</Kbd></span>}
        </div>
      )}
      {logs.length ? (
        <ol className="flex flex-col">
          <AnimatePresence initial={false}>
            {logs.map((log) => {
              const menu: MenuItem[] = [
                { label: 'Copy the log', run: () => copy(log.body) },
                { label: 'Delete the log', danger: true, run: () => void vigil.dropClue(log.id).then(() => (chime('away'), toast('Log deleted', () => void vigil.addClue(item.id, log.body)))) }
              ]
              return (
                <RowMenu key={log.id} items={menu}>
                  <motion.li
                    layout
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, transition: { duration: 0.12 } }}
                    transition={{ duration: 0.18, ease: EASE }}
                    className="group/track relative grid grid-cols-[4.5rem_1fr] items-start gap-2.5 rounded-md px-2 py-1.5 pr-9 hover:bg-foreground/[0.055] has-[[data-state=open]]:bg-foreground/[0.055]"
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
          {picked ? 'No log that day.' : <Typed text="No logs yet. Add one here, or from the box with + and the goal's name." step={28} />}
        </p>
      )}
    </section>
  )
}

/** Tempus: how far through the day, the week, the month and the year, a thin bar each. */
export function TempusBars({ className = '' }: { className?: string }): React.JSX.Element {
  useToday(true)
  const time = tempus()
  return (
    <div className={`grid grid-cols-[2.75rem_1fr_2.25rem] items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground ${className}`}>
      {(['day', 'week', 'month', 'year'] as const).map((unit) => (
        <div key={unit} className="contents">
          <span className="first-letter:uppercase">{unit}</span>
          <span className="relative h-1 overflow-hidden rounded-full bg-foreground/[0.09]">
            <span className="absolute inset-y-0 left-0 rounded-full bg-foreground/45 transition-[width] duration-700 ease-(--mf-ease)" style={{ width: `${time[unit] * 100}%` }} />
          </span>
          <span className="text-right tabular-nums">{percent(time[unit])}</span>
        </div>
      ))}
    </div>
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
    <div className={`flex flex-col ${className}`} aria-label="Goals">
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
                  <span className="shrink-0 text-xs text-muted-foreground">Did you make it?</span>
                  <Answers item={goal} small />
                </>
              ) : (
                <>
                  <span className="shrink-0 text-xs font-medium tabular-nums" style={{ color: left <= 30 ? warmth(left) : undefined }}>{left === 0 ? 'Today' : leftSaid(left)}</span>
                  <span className="hidden shrink-0 text-xs text-muted-foreground @[36rem]/page:inline">· {goal.lastLog ? `last log ${ago(goal.lastLog)}` : 'no logs yet'}</span>
                </>
              )}
            </span>
            <span className="relative ml-5.5 h-px overflow-hidden rounded-full bg-foreground/[0.08]" aria-label={`${percent(way)} of the way`}>
              <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${way * 100}%`, background: `color-mix(in oklab, ${left <= 30 ? warmth(Math.max(left, 0)) : 'var(--foreground)'} ${left <= 30 ? 55 : 35}%, transparent)` }} />
            </span>
          </div>
        )
      })}
      {open.length > 2 && (
        <button type="button" onClick={() => (chime('tap'), onOpen?.('view', 'goals'))} className="self-start rounded-md px-2 py-0.5 text-xs text-muted-foreground hover:text-foreground">
          and {open.length - 2} more
        </button>
      )}
    </div>
  )
}

/**
 * The open goals, small, under the writing in the box: one click logs what
 * you wrote against that goal, nothing captured.
 */
export function GoalChips({ onPick, className = '' }: { onPick: (goal: Item) => void; className?: string }): React.JSX.Element | null {
  const all = useLive(() => vigil.items('goal'), [] as Item[], [], ['item'])
  // The three nearest still ahead: one past its day wants an answer, not a log.
  const open = openOnes(all).filter((one) => daysLeft(one.goalAt!) >= 0).slice(0, 3)
  if (!open.length) return null
  const short = (text: string): string => (text.length > 24 ? `${text.slice(0, 24)}…` : text) || 'Untitled'
  return (
    <div className={`flex min-w-0 flex-wrap items-center gap-1 text-xs text-muted-foreground ${className}`}>
      <span className="mr-0.5 flex shrink-0 items-center gap-1.5">
        <Flag className="size-3.5" />
        <Typed text="Log to" step={30} delay={200} />
      </span>
      <AnimatePresence initial={false}>
        {open.map((goal, index) => (
          <motion.span key={goal.id} layout initial={{ opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.92 }}
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
    refuse('That capture already took an exit. Put it back in the inbox first')
    return false
  }
  chime('mark')
  toast(`Logged to “${goal.title.length > 36 ? `${goal.title.slice(0, 36)}…` : goal.title}”`, () => void vigil.dropClue(log).then(() => (chime('undo'), onUndo?.())))
  return true
}

