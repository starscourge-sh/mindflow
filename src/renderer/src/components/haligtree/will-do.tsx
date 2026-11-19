import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { call, haligtree, type Task } from '@/lib/haligtree'
import { clock, dayjs, short } from '../../../../main/dates'

import type { BoxPlan, BoxToken } from '@/lib/box-tokens'
import { Kbd, Tip } from './ui'
import { loud } from '@/lib/loud'
import { quoted } from '../../../../main/clip'

type Item = { key: string; effect: string; color: string; tokens: BoxToken[]; notTask?: true; card?: true; info?: true }

/**
 * Under the box, what sending it will do, in plain words: "Start a 5 min
 * timer", "For Fri 19:00", "Priority: High". Each with an × that keeps its
 * words as plain text, as a click on them does. A "+name" that matches
 * nothing offers to start that question, or to leave the words be.
 */
export function WillDo({ plan, joins, list, onSort, onKeep, onNotTask, onNewQuestion, onUncard, orQuestion, asks = false }: {
  /** The open task of the same name it will join instead of being made twice, as the main window's notice says after. */
  joins?: string | null
  /** One line that asks something: it will be kept as a question; its × keeps it a note. */
  asks?: boolean
  /** It will be a task and a line asks something: "or a question" makes it one instead. */
  orQuestion?: () => void
  plan: BoxPlan | null
  /** A task written as a list: what Create makes of it, "7 tasks, 5 steps". */
  list?: string | null
  /** A long page of mixed lines: offered to be sorted rather than made tasks a line. */
  onSort?: (() => void) | null
  onKeep: (tokens: BoxToken[]) => void
  /** A task by its wording: the × makes it a note. */
  onNotTask: () => void
  onNewQuestion: (name: string) => void
  /** The link's card back to its plain address. */
  onUncard: () => void
}): React.JSX.Element | null {
  if (!plan) return null
  const items: Item[] = []
  // Said for a task by its wording or by its tag alike.
  const joined = joins ? `Join your task ${quoted(joins, 48)}, already on your list` : null
  // A list's lines each read for their own day: said once for them all.
  const dates = list ? plan.tokens.filter((one) => one.kind === 'date' && one.day) : []
  for (const token of plan.tokens) {
    if (dates.includes(token)) {
      if (token !== dates[0]) continue
      const days = [...new Map(dates.map((one) => [one.day!.key, one.day!.said])).entries()].sort(([a], [b]) => a.localeCompare(b))
      const effect = new Set(dates.map((one) => one.effect)).size === 1 ? token.effect
        : days.length === 1 ? `For ${days[0][1]}`
        : `Each on its own day, ${days[0][1]} to ${days[days.length - 1][1]}`
      items.push({ key: 'list-dates', effect, color: token.color, tokens: dates })
      // Lines with no day of their own: said beside, so one date never reads as all of them.
      if (plan.undated) items.push({ key: 'list-undated', effect: `${plan.undated} with no day`, color: 'gray', tokens: [], info: true })
      continue
    }
    if (token.kind === 'clue-miss' || token.kind === 'milestone-miss') continue
    // Who said a quote, and where: shown once, in its Who and Where fields under the box, where it can be changed.
    if (token.kind === 'signature') continue
    // A list makes every line a task already, each with its own tags.
    if ((list || onSort) && token.kind === 'task-tag') continue
    const effect = joined && token.kind === 'task-tag' ? joined : token.effect
    const same = items.find((item) => item.effect === effect)
    if (same) same.tokens.push(token)
    else items.push({ key: token.id, effect, color: token.color, tokens: [token] })
  }
  // A task by its wording, with no tag making it one: it still goes to the tasks.
  // A list: a task a line, said with the count; its × keeps it all one note.
  if (list) items.unshift({ key: 'task', effect: `Make ${list}`, color: 'green', tokens: [], notTask: true })
  // A page of mixed lines: kept as a note, then sorted line by line, never one task of it all.
  else if (onSort) items.unshift({ key: 'task', effect: 'Keep the page, then pick what each line becomes', color: 'orange', tokens: [], notTask: true })
  else if (plan.task && plan.kind === 'todo' && !plan.tokens.some((one) => one.kind === 'task-tag'))
    items.unshift({ key: 'task', effect: joined ?? 'Add to your tasks', color: 'green', tokens: [], notTask: true })
  else if (asks) items.unshift({ key: 'question', effect: 'Keep as a question in Writing', color: 'purple', tokens: [], notTask: true })
  // Someone's words, as the Mac's model read them: its × keeps it a note.
  else if (plan.readBy && plan.kind === 'quote') items.unshift({ key: 'quote', effect: 'Keep as a quote', color: 'purple', tokens: [], notTask: true })
  // A link that already made its card: kept as that link, or × for the plain address.
  if (plan.card && plan.url) items.push({ key: 'card', effect: `Save as a link from ${plan.url.hostname.replace(/^www\./, '')}`, color: 'blue', tokens: [], card: true })
  const miss = plan.tokens.find((one) => one.kind === 'clue-miss')
  // "!milestone" that marks nothing: said in grey, with what it needs.
  const unmarked = plan.tokens.find((one) => one.kind === 'milestone-miss')
  if (!items.length && !miss && !unmarked && !onSort) return null
  // It will be a task, and a line asks something: one line says so, Tab makes it a question instead (BoxOffers takes the key).
  return (
    <div data-chrome data-will-do className="flex min-w-0 flex-wrap items-center gap-x-1 gap-y-1 px-[4.75rem] pt-1.5 text-xs text-muted-foreground animate-in fade-in-0 duration-200">
      {items.length > 0 && <span className="mr-0.5 text-muted-foreground">This will:</span>}
      {items.map((item, index) => (
        <span key={item.key} data-will={item.tokens[0]?.kind ?? 'task'} className="inline-flex min-w-0 items-center gap-1 animate-in fade-in-0 duration-200">
          {index > 0 && <span aria-hidden className="mr-0.5 text-muted-foreground/50">·</span>}
          <span aria-hidden className="size-1.5 shrink-0 rounded-full" style={{ backgroundColor: `var(--tt-color-text-${item.color})` }} />
          <span className="min-w-0 truncate text-(--mf-muted-strong)">{item.effect}</span>
          {/* No key beside "Keep as a question": it is what Return does already, and a ⇥ there read as a key you
              had to press. The key is shown only where Tab changes something ("or a question"). */}
          {/* Read by the Mac's own model, not by the wording's rules: said so, as a date read as a guess is. */}
          {plan.readBy && (item.key === 'task' || item.key === 'quote') && (
            <Tip label="Read by Apple Intelligence on this Mac, from your words. Check it, or press × to keep it a note.">
              <span data-will-read {...loud('warn', 'shrink-0 cursor-default')}>read on this Mac</span>
            </Tip>
          )}
          {item.tokens.find((one) => one.guess) && (
            <Tip label={`${item.tokens.find((one) => one.guess)!.guess}. Check it, or click the words to keep them plain.`}>
              <span data-will-guess {...loud('warn', 'shrink-0 cursor-default')}>a guess</span>
            </Tip>
          )}
          {!item.info && <Tip label={item.notTask ? (list || onSort ? 'Keep it all as one note, not tasks' : item.key === 'question' ? 'Keep it as a note, not a question' : item.key === 'quote' ? 'Keep it as a note, not a quote' : 'Keep it as a note, not a task') : item.card ? 'Back to the plain address' : 'Keep as plain text'}>
            <button
              type="button"
              data-will-off
              aria-label={item.notTask ? (list || onSort ? 'Keep it as one note' : item.key === 'question' ? 'Not a question' : item.key === 'quote' ? 'Not a quote' : `Not a task`) : `Keep as plain text: ${item.effect}`}
              className="relative after:absolute after:-inset-1 after:rounded-full flex size-4 shrink-0 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => (item.notTask ? onNotTask() : item.card ? onUncard() : onKeep(item.tokens))}
            >
              <X className="size-3" />
            </button>
          </Tip>}
        </span>
      ))}
      {orQuestion && items.length > 0 && (
        <span data-will="or-question" className="inline-flex shrink-0 items-center gap-1 animate-in fade-in-0 duration-200">
          <span aria-hidden className="text-muted-foreground/50">·</span>
          <Tip label="A question of its own in Writing instead: it collects dated clues until you know the answer">
            <button type="button" data-will-question className="flex items-center gap-1 rounded-md px-1 py-0.5 font-medium text-(--mf-muted-strong) transition-colors hover:bg-accent hover:text-foreground"
              onMouseDown={(event) => event.preventDefault()} onClick={orQuestion}>
              or a question <Kbd>⇥</Kbd>
            </button>
          </Tip>
        </span>
      )}
      {onSort && (
        <span data-will="sort" className="inline-flex min-w-0 flex-wrap items-center gap-1.5 animate-in fade-in-0 duration-200">
          {items.length > 0 && <span aria-hidden className="text-muted-foreground/50">·</span>}
          <span className="min-w-0">Links or sayings among the lines:</span>
          <button type="button" data-will-sort className="rounded-sm px-1 text-(--mf-muted-strong) underline decoration-foreground/25 underline-offset-2 transition-colors hover:bg-accent/60 hover:text-foreground"
            onMouseDown={(event) => event.preventDefault()} onClick={onSort}>
            Sort this out now
          </button>
        </span>
      )}
      {miss && (
        <span data-will="clue-miss" className="inline-flex min-w-0 flex-wrap items-center gap-1.5 animate-in fade-in-0 duration-200">
          {items.length > 0 && <span aria-hidden className="text-muted-foreground/50">·</span>}
          <span className="min-w-0">{miss.effect}: it will be a capture.</span>
          {plan.miss && (
            <button type="button" data-will-new className="rounded-sm px-1 text-(--mf-muted-strong) underline decoration-foreground/25 underline-offset-2 transition-colors hover:bg-accent/60 hover:text-foreground"
              onMouseDown={(event) => event.preventDefault()} onClick={() => onNewQuestion(plan.miss!.name)}>
              Start an open question from this
            </button>
          )}
          <button type="button" data-will-plain className="rounded-sm px-1 text-(--mf-muted-strong) underline decoration-foreground/25 underline-offset-2 transition-colors hover:bg-accent/60 hover:text-foreground"
            onMouseDown={(event) => event.preventDefault()} onClick={() => onKeep([miss])}>
            Keep as plain text
          </button>
        </span>
      )}
      {unmarked && (
        <span data-will="milestone-miss" className="inline-flex min-w-0 flex-wrap items-center gap-1.5 animate-in fade-in-0 duration-200">
          {(items.length > 0 || miss) && <span aria-hidden className="text-muted-foreground/50">·</span>}
          <span aria-hidden className="size-1.5 shrink-0 rounded-full" style={{ backgroundColor: 'var(--tt-color-text-gray)' }} />
          <span className="min-w-0">{unmarked.effect}: no day is marked.</span>
        </span>
      )}
    </div>
  )
}

/** The hint over a lit token: what it will do, and that a click keeps it plain. */
export function TokenHint({ hover }: { hover: { token: BoxToken; rect: DOMRect } | null }): React.JSX.Element | null {
  if (!hover) return null
  const { token, rect } = hover
  const said = token.kind === 'clue-miss' ? `${token.effect}: it will be a capture` : token.effect
  return createPortal(
    <div
      role="tooltip"
      data-token-hint
      // In by `mf-pop` (main.css), as every tip is: grown down from the token by a clip, never faded (it is frosted).
      data-state="open" data-side="bottom"
      className="mf-pop mf-frost pointer-events-none fixed z-[100] flex max-w-xs flex-col gap-0.5 rounded-md px-2.5 py-1.5 text-xs bg-popover text-popover-foreground shadow-(--mf-panel-shadow) ring-1 ring-foreground/10"
      style={{ left: Math.max(8, Math.min(rect.left, window.innerWidth - 300)), top: rect.bottom + 6 }}
    >
      <span className="flex items-center gap-1.5">
        <span aria-hidden className="size-1.5 shrink-0 rounded-full" style={{ backgroundColor: `var(--tt-color-text-${token.color})` }} />
        {said}
      </span>
      {token.guess && <span data-token-guess {...loud('warn')}>A guess: {token.guess.replace(/^Read/, 'read')}</span>}
      <span className="text-muted-foreground">Click to keep as plain text</span>
    </div>,
    document.body
  )
}

type Around = { at: string | null; title: string; kind: 'task' | 'event'; mine?: true }
/**
 * A task with a day, seen where it will land before it is kept (the user, 17 Nov, of Woday's launcher: "new event
 * tomorrow 10:00 Design meeting" previewed in its day): that day's timed tasks and events in order, the new one lit
 * in its place among them, and how many more are all day. Read once per day typed, not per key.
 */
export function DayAround({ due, allDay, title }: { due: string; allDay: boolean; title: string }): React.JSX.Element | null {
  const key = dayjs(due).format('YYYY-MM-DD')
  const [day, setDay] = useState<Around[] | null>(null)
  useEffect(() => {
    let live = true
    const from = dayjs(due).startOf('day')
    void Promise.all([
      haligtree.tasks().catch(() => [] as Task[]),
      call<{ title: string; start: string; allDay?: boolean | number }[]>('events', from.toISOString(), from.add(1, 'day').toISOString()).catch(() => [])
    ]).then(([tasks, events]) => live && setDay([
      ...tasks.filter((one) => one.status === 'open' && one.dueAt && dayjs(one.dueAt).format('YYYY-MM-DD') === key).map((one): Around => ({ at: one.allDay ? null : one.dueAt, title: one.title, kind: 'task' })),
      ...events.map((one): Around => ({ at: one.allDay ? null : one.start, title: one.title, kind: 'event' }))
    ]))
    return () => void (live = false)
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps
  if (!day) return null
  const mine: Around = { at: allDay ? null : due, title: title || 'This task', kind: 'task', mine: true }
  const all = [...day.filter((one) => one.at), ...(allDay ? [] : [mine])].sort((a, b) => a.at!.localeCompare(b.at!))
  // The new one and its nearest neighbours: two before it and two after, at most.
  const here = allDay ? 0 : all.indexOf(mine)
  const shown = allDay ? all.slice(0, 3) : all.slice(Math.max(0, here - 2), here + 3)
  const loose = day.filter((one) => !one.at).length + (allDay ? 1 : 0)
  return (
    <div data-chrome data-day-around className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 px-[4.75rem] pt-1 text-xs text-muted-foreground animate-in fade-in-0 duration-200">
      <span>{short(due, true)}:</span>
      {shown.map((one, at) => (
        <span key={`${one.kind}:${one.at}:${one.title}:${at}`} data-day-item={one.mine ? 'mine' : one.kind}
          className={one.mine ? 'inline-flex min-w-0 items-center gap-1 rounded-sm bg-accent px-1 font-medium text-foreground' : 'inline-flex min-w-0 items-center gap-1'}>
          {at > 0 && <span aria-hidden className="text-muted-foreground/50">·</span>}
          {one.at && <span className="tabular-nums text-(--mf-muted-strong)">{clock(one.at)}</span>}
          <span className="max-w-40 truncate">{one.mine ? quoted(one.title, 40) : one.title}</span>
        </span>
      ))}
      {loose > 0 && <span>{shown.length ? '· ' : ''}{allDay ? (loose === 1 ? 'all day, the only one' : `${loose} all day, this one too`) : `${loose} more all day`}</span>}
    </div>
  )
}
