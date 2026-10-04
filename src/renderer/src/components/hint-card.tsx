import { useEffect, useState } from 'react'
import { ThumbsDown, ThumbsUp, X } from 'lucide-react'

import { textOf } from './rot-cards'

type Hint = NonNullable<Awaited<ReturnType<typeof window.api.hints.next>>>

/** How often a hint shows when the window comes up. Most opens show nothing. */
const RATE = 0.1

/**
 * A hint: one nugget you did not ask for, like a tip on a game's loading
 * screen. Up and down change how often it comes back; doing nothing is the
 * normal case and says nothing. It never grades and never schedules.
 */
export function HintCard(): React.JSX.Element | null {
  const [hint, setHint] = useState<Hint | null>(null)

  useEffect(
    () =>
      window.api.onShown(() => {
        if (Math.random() < RATE) void window.api.hints.next().then(setHint)
        else setHint(null)
      }),
    []
  )

  if (!hint) return null
  const react = (reaction: 'up' | 'down'): void => {
    void window.api.hints.react(hint.event, hint.id, reaction)
    setHint(null)
  }
  return (
    <div className="mb-3 rounded-md border border-[var(--tt-brand-color-400)]/40 p-2 text-sm">
      <div className="line-clamp-6 whitespace-pre-line">{textOf(hint.body)}</div>
      <div className="mt-2 flex items-center gap-1 text-muted-foreground [&_svg]:size-3.5">
        <span className="mr-auto text-xs">Hint · {hint.kind}</span>
        <button type="button" className="rounded p-1 hover:bg-accent" title="More of this" onClick={() => react('up')}>
          <ThumbsUp />
        </button>
        <button type="button" className="rounded p-1 hover:bg-accent" title="Less of this" onClick={() => react('down')}>
          <ThumbsDown />
        </button>
        <button type="button" className="rounded p-1 hover:bg-accent" title="Dismiss" onClick={() => setHint(null)}>
          <X />
        </button>
      </div>
    </div>
  )
}
