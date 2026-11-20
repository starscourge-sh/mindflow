import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { call, haligtree, type Task } from '@/lib/haligtree'
import { clock, dayjs, plural, whenInLine } from '../../../../main/dates'

import type { BoxPlan, BoxToken } from '@/lib/box-tokens'
import { Kbd, Tip } from './ui'
import { loud } from '@/lib/loud'
import { quoted } from '../../../../main/clip'

type Item = { key: string; effect: string; color: string; tokens: BoxToken[]; notTask?: true; card?: true; info?: true }

/** A task's day as the box read it (main/task-words.ts readTask): said as one part of the line. */
export type BoxWhen = { due: string; allDay: boolean; recurrence: string | null }

const WEEK = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']
/** "every sat" as a person says it: "every Saturday". "every!" (counted from the last time) reads the same. */
const repeatWords = (rule: string): string =>
  rule.replace(/^every!?\s*/i, 'every ').replace(/\b(mon(?!th)|tue|wed|thu|fri|sat|sun)[a-z]*/gi, (word) => dayjs().day(WEEK.indexOf(word.slice(0, 3).toLowerCase())).format('dddd'))

/**
 * A task's when, in plain words, one part of the line: "tomorrow at 15:00", "Saturday, all day", and for a repeat
 * when it starts and that it repeats, "every Saturday from tomorrow, all day". Never "the only one": a repeat is many.
 */
export function whenSaid(read: BoxWhen): string {
  const at = read.allDay ? ', all day' : ` at ${clock(read.due)}`
  if (!read.recurrence) return `${whenInLine(read.due, true)}${at}`
  const counted = /^every!/i.test(read.recurrence) ? ', counted from when you last did it' : ''
  return `${repeatWords(read.recurrence)} from ${whenInLine(read.due, true)}${at}${counted}`
}

/** A part of the line after the first, inside the sentence: "Priority: High" reads "priority: High". */
const inLine = (effect: string): string => effect.replace(/^[A-Z](?![A-Z])/, (letter) => letter.toLowerCase())

/**
 * Under the box, what sending it will do, as one quiet sentence, the way Things and Todoist's quick add say a
 * parsed date: "A task, every Saturday from tomorrow, all day · from Ghostty “herdr”". The words it read stay lit
 * in the box; each part here is pressed to leave it out (its words kept plain, as ⌫ straight after them or a click
 * on them does), struck through while the pointer is on it. Its room is kept whether it says anything or not, so
 * the box never grows or jumps as a reading comes and goes (App.tsx, data-will-line).
 */
export function WillDo({ plan, when, source, joins, list, onSort, onKeep, onNotTask, onNewQuestion, onUncard, orQuestion, asks = false }: {
  /** The task's day as read, said as one part ("every Saturday from tomorrow, all day"), with the day around it. */
  when?: BoxWhen | null
  /** Where you were as the box came up: the line's last, quiet part (App.tsx). */
  source?: ((alone: boolean) => React.ReactNode) | null
  /** The open task of the same name it will join instead of being made twice, as the main window's notice says after. */
  joins?: string | null
  /** One line that asks something: it will be kept as a question; pressed, it stays a note. */
  asks?: boolean
  /** It will be a task and a line asks something: "or a question" makes it one instead. */
  orQuestion?: () => void
  plan: BoxPlan | null
  /** A task written as a list: what Create makes of it, "7 tasks, 5 steps". */
  list?: string | null
  /** A long page of mixed lines: offered to be sorted rather than made tasks a line. */
  onSort?: (() => void) | null
  onKeep: (tokens: BoxToken[]) => void
  /** A task by its wording: pressed, it is a note. */
  onNotTask: () => void
  onNewQuestion: (name: string) => void
  /** The link's card back to its plain address. */
  onUncard: () => void
}): React.JSX.Element | null {
  const items: Item[] = []
  if (plan) {
    // Said for a task by its wording or by its tag alike.
    const joined = joins ? `Join your task ${quoted(joins, 48)}, already on your list` : null
    // A list's lines each read for their own day: said once for them all.
    const dates = list ? plan.tokens.filter((one) => one.kind === 'date' && one.day) : []
    // A task's day and its repeat: one part, "every Saturday from tomorrow, all day", never two that disagree.
    const whenTokens = when && plan.task && !list ? plan.tokens.filter((one) => one.kind === 'date' || (one.kind === 'repeat' && /^Repeat/.test(one.effect))) : []
    for (const token of plan.tokens) {
      if (whenTokens.includes(token)) {
        if (token === whenTokens[0]) items.push({ key: 'when', effect: whenSaid(when!), color: token.color, tokens: whenTokens })
        continue
      }
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
    // A list: a task a line, said with the count; pressed, it is all one note.
    if (list) items.unshift({ key: 'task', effect: `Make ${list}`, color: 'green', tokens: [], notTask: true })
    // A page of mixed lines: kept as a note, then sorted line by line, never one task of it all.
    else if (onSort) items.unshift({ key: 'task', effect: 'Keep the page, then pick what each line becomes', color: 'orange', tokens: [], notTask: true })
    else if (plan.task && plan.kind === 'todo' && !plan.tokens.some((one) => one.kind === 'task-tag'))
      items.unshift({ key: 'task', effect: joined ?? 'A task', color: 'green', tokens: [], notTask: true })
    else if (asks) items.unshift({ key: 'question', effect: 'Keep as a question in Writing', color: 'purple', tokens: [], notTask: true })
    // Someone's words, as the Mac's model read them: pressed, it stays a note.
    else if (plan.readBy && plan.kind === 'quote') items.unshift({ key: 'quote', effect: 'Keep as a quote', color: 'purple', tokens: [], notTask: true })
    // A link that already made its card: kept as that link, or pressed for the plain address.
    if (plan.card && plan.url) items.push({ key: 'card', effect: `Save as a link from ${plan.url.hostname.replace(/^www\./, '')}`, color: 'blue', tokens: [], card: true })
  }
  const miss = plan?.tokens.find((one) => one.kind === 'clue-miss')
  // "!milestone" that marks nothing: said in grey, with what it needs.
  const unmarked = plan?.tokens.find((one) => one.kind === 'milestone-miss')
  if (!items.length && !miss && !unmarked && !onSort && !source) return null
  const off = (item: Item): string => item.notTask ? (list || onSort ? 'Keep it all as one note, not tasks' : item.key === 'question' ? 'Keep it as a note, not a question' : item.key === 'quote' ? 'Keep it as a note, not a quote' : 'Keep it as a note, not a task')
    : item.card ? 'Back to the plain address' : `Leave it out: keep ${quoted(item.tokens.map((one) => one.text).join(' '), 32)} as plain words`
  const dot = <span aria-hidden className="px-1.5 text-muted-foreground/50">·</span>
  return (
    <span data-will-do className="flex min-w-0 flex-wrap items-center gap-y-1">
      {items.map((item, index) => (
        <span key={item.key} data-will={item.key === 'when' ? 'date' : item.tokens[0]?.kind ?? 'task'} className="inline-flex min-w-0 items-center">
          {index > 0 && <span aria-hidden className="whitespace-pre">, </span>}
          {item.info ? <span className="min-w-0 truncate">{item.effect}</span> : (
            <Tip label={off(item)}>
              <button
                type="button"
                data-will-off
                aria-label={item.notTask ? (list || onSort ? 'Keep it as one note' : item.key === 'question' ? 'Not a question' : item.key === 'quote' ? 'Not a quote' : 'Not a task') : `Keep as plain text: ${item.effect}`}
                className="min-w-0 cursor-pointer truncate rounded-sm text-(--mf-muted-strong) decoration-foreground/50 transition-colors hover:text-foreground hover:line-through"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => (item.notTask ? onNotTask() : item.card ? onUncard() : onKeep(item.tokens))}
              >
                {index > 0 ? inLine(item.effect) : item.effect}
              </button>
            </Tip>
          )}
          {/* The day around it, said after the day: what it lands between. Never for a repeat, which lands on many days. */}
          {item.key === 'when' && !when!.recurrence && <Around due={when!.due} allDay={when!.allDay} />}
          {/* Read by the Mac's own model, not by the wording's rules: said so, as a date read as a guess is. */}
          {plan?.readBy && (item.key === 'task' || item.key === 'quote') && (
            <Tip label="Read by Apple Intelligence on this Mac, from your words. Check it, or press it to keep it a note.">
              <span data-will-read {...loud('warn', 'ml-1.5 shrink-0 cursor-default')}>read on this Mac</span>
            </Tip>
          )}
          {item.tokens.find((one) => one.guess) && (
            <Tip label={`${item.tokens.find((one) => one.guess)!.guess}. Check it, or click the words to keep them plain.`}>
              <span data-will-guess {...loud('warn', 'ml-1.5 shrink-0 cursor-default')}>a guess</span>
            </Tip>
          )}
        </span>
      ))}
      {/* It will be a task, and a line asks something: "or a question", Tab makes it one instead (BoxOffers takes the key). */}
      {orQuestion && items.length > 0 && (
        <span data-will="or-question" className="inline-flex shrink-0 items-center">
          {dot}
          <Tip label="A question of its own in Writing instead: it collects dated clues until you know the answer">
            <button type="button" data-will-question className="flex cursor-pointer items-center gap-1 rounded-md px-1 font-medium text-(--mf-muted-strong) transition-colors hover:bg-accent hover:text-foreground"
              onMouseDown={(event) => event.preventDefault()} onClick={orQuestion}>
              or a question <Kbd>⇥</Kbd>
            </button>
          </Tip>
        </span>
      )}
      {onSort && (
        <span data-will="sort" className="inline-flex min-w-0 flex-wrap items-center gap-1.5">
          {items.length > 0 && dot}
          <span className="min-w-0">Links or sayings among the lines:</span>
          <button type="button" data-will-sort className="cursor-pointer rounded-sm px-1 text-(--mf-muted-strong) underline decoration-foreground/25 underline-offset-2 transition-colors hover:bg-accent/60 hover:text-foreground"
            onMouseDown={(event) => event.preventDefault()} onClick={onSort}>
            Sort this out now
          </button>
        </span>
      )}
      {miss && (
        <span data-will="clue-miss" className="inline-flex min-w-0 flex-wrap items-center gap-1.5">
          {items.length > 0 && dot}
          <span className="min-w-0">{miss.effect}: it will be a capture.</span>
          {plan?.miss && (
            <button type="button" data-will-new className="cursor-pointer rounded-sm px-1 text-(--mf-muted-strong) underline decoration-foreground/25 underline-offset-2 transition-colors hover:bg-accent/60 hover:text-foreground"
              onMouseDown={(event) => event.preventDefault()} onClick={() => onNewQuestion(plan.miss!.name)}>
              Start an open question from this
            </button>
          )}
          <button type="button" data-will-plain className="cursor-pointer rounded-sm px-1 text-(--mf-muted-strong) underline decoration-foreground/25 underline-offset-2 transition-colors hover:bg-accent/60 hover:text-foreground"
            onMouseDown={(event) => event.preventDefault()} onClick={() => onKeep([miss])}>
            Keep as plain text
          </button>
        </span>
      )}
      {unmarked && (
        <span data-will="milestone-miss" className="inline-flex min-w-0 flex-wrap items-center gap-1.5">
          {(items.length > 0 || miss) && dot}
          <span className="min-w-0">{unmarked.effect}: no day is marked.</span>
        </span>
      )}
      {source && (
        <span className="inline-flex min-w-0 items-center">
          {(items.length > 0 || miss || unmarked || onSort) && dot}
          {source(!(items.length > 0 || miss || unmarked || onSort))}
        </span>
      )}
    </span>
  )
}

type Near = { at: string | null; title: string }
/**
 * A task with a day, seen where it will land before it is kept (the user, 17 Nov, of Woday's launcher: "new event
 * tomorrow 10:00 Design meeting" previewed in its day), said as the end of its when: "after 9:00 Standup", "between
 * 9:00 Standup and 11:00 Lunch", or for a day with no time "with 2 more that day". Nothing when the day is empty.
 * Read once per day typed, not per key.
 */
function Around({ due, allDay }: { due: string; allDay: boolean }): React.JSX.Element | null {
  const key = dayjs(due).format('YYYY-MM-DD')
  const [day, setDay] = useState<Near[] | null>(null)
  useEffect(() => {
    let live = true
    const from = dayjs(due).startOf('day')
    void Promise.all([
      haligtree.tasks().catch(() => [] as Task[]),
      call<{ title: string; start: string; allDay?: boolean | number }[]>('events', from.toISOString(), from.add(1, 'day').toISOString()).catch(() => [])
    ]).then(([tasks, events]) => live && setDay([
      ...tasks.filter((one) => one.status === 'open' && one.dueAt && dayjs(one.dueAt).format('YYYY-MM-DD') === key).map((one): Near => ({ at: one.allDay ? null : one.dueAt, title: one.title })),
      ...events.map((one): Near => ({ at: one.allDay ? null : one.start, title: one.title }))
    ]))
    return () => void (live = false)
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps
  if (!day?.length) return null
  const named = (one: Near): React.JSX.Element => <><span className="tabular-nums">{clock(one.at!)}</span> <span className="inline-block max-w-32 truncate align-bottom">{one.title}</span></>
  const timed = day.filter((one) => one.at).sort((a, b) => a.at!.localeCompare(b.at!))
  const at = dayjs(due).valueOf()
  const before = allDay ? undefined : timed.filter((one) => dayjs(one.at).valueOf() <= at).at(-1)
  const after = allDay ? undefined : timed.find((one) => dayjs(one.at).valueOf() > at)
  const said = before && after ? <>between {named(before)} and {named(after)}</> : before ? <>after {named(before)}</> : after ? <>before {named(after)}</> : `with ${plural(day.length, 'more', 'more')} that day`
  return <span data-day-around className="min-w-0 truncate whitespace-pre text-muted-foreground">, {said}</span>
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
      className="mf-pop mf-frost pointer-events-none fixed z-[100] flex max-w-xs flex-col gap-0.5 rounded-tip px-2.5 py-1.5 text-xs bg-popover text-popover-foreground shadow-(--mf-panel-shadow) ring-1 ring-foreground/10"
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
