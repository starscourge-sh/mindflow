import { createPortal } from 'react-dom'
import { X } from 'lucide-react'

import type { BoxPlan, BoxToken } from '@/lib/box-tokens'
import { Tip } from './ui'

type Item = { key: string; effect: string; color: string; tokens: BoxToken[]; notTask?: true; card?: true }

/**
 * Under the box, what sending it will do, in plain words: "Start a 5 min
 * timer", "For Fri 19:00", "Priority: High". Each with an × that keeps its
 * words as plain text, as a click on them does. A "+name" that matches
 * nothing offers to start that question, or to leave the words be.
 */
export function WillDo({ plan, list, onSort, onKeep, onNotTask, onNewQuestion, onUncard }: {
  plan: BoxPlan | null
  /** A Todo written as a list: what Create makes of it, "7 tasks, 5 steps". */
  list?: string | null
  /** A long page of mixed lines: offered to be sorted rather than made tasks a line. */
  onSort?: (() => void) | null
  onKeep: (tokens: BoxToken[]) => void
  /** A todo by its wording: the × makes it a note. */
  onNotTask: () => void
  onNewQuestion: (name: string) => void
  /** The link's card back to its plain address. */
  onUncard: () => void
}): React.JSX.Element | null {
  if (!plan) return null
  const items: Item[] = []
  for (const token of plan.tokens) {
    if (token.kind === 'clue-miss' || token.kind === 'milestone-miss') continue
    // A list makes every line a task already, each with its own tags.
    if (list && token.kind === 'task-tag') continue
    const same = items.find((item) => item.effect === token.effect)
    if (same) same.tokens.push(token)
    else items.push({ key: token.id, effect: token.effect, color: token.color, tokens: [token] })
  }
  // A todo by its wording, with no tag making it one: it still goes to the tasks.
  // A list: a task a line, said with the count; its × keeps it all one note.
  if (list) items.unshift({ key: 'task', effect: `Make ${list}`, color: 'green', tokens: [], notTask: true })
  else if (plan.task && plan.kind === 'todo' && !plan.tokens.some((one) => one.kind === 'task-tag'))
    items.unshift({ key: 'task', effect: 'Add to your tasks', color: 'green', tokens: [], notTask: true })
  // A link that already made its card: kept as that link, or × for the plain address.
  if (plan.card && plan.url) items.push({ key: 'card', effect: `Save as a link from ${plan.url.hostname.replace(/^www\./, '')}`, color: 'blue', tokens: [], card: true })
  const miss = plan.tokens.find((one) => one.kind === 'clue-miss')
  // "!milestone" that marks nothing: said in grey, with what it needs.
  const unmarked = plan.tokens.find((one) => one.kind === 'milestone-miss')
  if (!items.length && !miss && !unmarked && !onSort) return null
  return (
    <div data-chrome data-will-do className="flex min-w-0 flex-wrap items-center gap-x-1 gap-y-1 px-[4.75rem] pt-1.5 text-xs text-muted-foreground animate-in fade-in-0 duration-200">
      {items.length > 0 && <span className="mr-0.5 text-muted-foreground/70">This will:</span>}
      {items.map((item, index) => (
        <span key={item.key} data-will={item.tokens[0]?.kind ?? 'task'} className="inline-flex min-w-0 items-center gap-1 animate-in fade-in-0 duration-200">
          {index > 0 && <span aria-hidden className="mr-0.5 text-muted-foreground/50">·</span>}
          <span aria-hidden className="size-1.5 shrink-0 rounded-full" style={{ backgroundColor: `var(--tt-color-text-${item.color})` }} />
          <span className="min-w-0 truncate text-foreground/80">{item.effect}</span>
          <Tip label={item.notTask ? (list ? 'Keep it all as one note, not tasks' : 'Keep it as a note, not a task') : item.card ? 'Back to the plain address' : 'Keep as plain text'}>
            <button
              type="button"
              data-will-off
              aria-label={item.notTask ? (list ? 'Keep it as one note' : `Not a task`) : `Keep as plain text: ${item.effect}`}
              className="flex size-4 shrink-0 items-center justify-center rounded-sm text-muted-foreground/60 transition-colors hover:bg-accent/60 hover:text-foreground"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => (item.notTask ? onNotTask() : item.card ? onUncard() : onKeep(item.tokens))}
            >
              <X className="size-3" />
            </button>
          </Tip>
        </span>
      ))}
      {onSort && (
        <span data-will="sort" className="inline-flex min-w-0 flex-wrap items-center gap-1.5 animate-in fade-in-0 duration-200">
          {items.length > 0 && <span aria-hidden className="text-muted-foreground/50">·</span>}
          <span className="min-w-0">Lines of different kinds:</span>
          <button type="button" data-will-sort className="rounded-sm px-1 text-foreground/80 underline decoration-foreground/25 underline-offset-2 transition-colors hover:bg-accent/60 hover:text-foreground"
            onMouseDown={(event) => event.preventDefault()} onClick={onSort}>
            Sort this out
          </button>
        </span>
      )}
      {miss && (
        <span data-will="clue-miss" className="inline-flex min-w-0 flex-wrap items-center gap-1.5 animate-in fade-in-0 duration-200">
          {items.length > 0 && <span aria-hidden className="text-muted-foreground/50">·</span>}
          <span className="min-w-0">{miss.effect}: it will be a capture.</span>
          {plan.miss && (
            <button type="button" data-will-new className="rounded-sm px-1 text-foreground/80 underline decoration-foreground/25 underline-offset-2 transition-colors hover:bg-accent/60 hover:text-foreground"
              onMouseDown={(event) => event.preventDefault()} onClick={() => onNewQuestion(plan.miss!.name)}>
              Make it a new question
            </button>
          )}
          <button type="button" data-will-plain className="rounded-sm px-1 text-foreground/80 underline decoration-foreground/25 underline-offset-2 transition-colors hover:bg-accent/60 hover:text-foreground"
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
      className="pointer-events-none fixed z-[100] flex max-w-xs flex-col gap-0.5 rounded-md px-2.5 py-1.5 text-xs bg-popover text-popover-foreground shadow-(--mf-panel-shadow) ring-1 ring-foreground/10 animate-in fade-in-0 zoom-in-95 duration-150"
      style={{ left: Math.max(8, Math.min(rect.left, window.innerWidth - 300)), top: rect.bottom + 6 }}
    >
      <span className="flex items-center gap-1.5">
        <span aria-hidden className="size-1.5 shrink-0 rounded-full" style={{ backgroundColor: `var(--tt-color-text-${token.color})` }} />
        {said}
      </span>
      <span className="text-popover-foreground/60">Click to keep as plain text</span>
    </div>,
    document.body
  )
}
