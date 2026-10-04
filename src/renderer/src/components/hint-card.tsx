import { useEffect, useRef, useState } from 'react'
import { ThumbsDown, ThumbsUp, X } from 'lucide-react'

import { textOf } from './rot-cards'
import { chime } from '@/lib/sound'
import { vigil } from '@/lib/vigil'

type Hint = NonNullable<Awaited<ReturnType<typeof window.api.hints.next>>>


/**
 * A hint: one nugget you did not ask for, like a tip on a game's loading
 * screen. Up and down change how often it comes back; doing nothing is the
 * normal case and says nothing. It never grades and never schedules.
 */
export function HintCard(): React.JSX.Element | null {
  const [hint, setHint] = useState<Hint | null>(null)
  const shownAt = useRef(0)

  // Most opens show nothing: the rate is a setting, a tenth by default.
  useEffect(
    () =>
      window.api.onShown(async () => {
        const { hintRate } = await vigil.settings()
        if (Math.random() < hintRate) {
          const next = await window.api.hints.next()
          shownAt.current = Date.now()
          setHint(next)
        } else setHint(null)
      }),
    []
  )
  // Dwell: how long it was on screen before the window went. Every hint
  // produces one, where a vote is rare, so it is the signal that says most.
  useEffect(() => {
    if (!hint) return
    const onHide = (): void => {
      if (document.visibilityState === 'hidden') void window.api.hints.dwell(hint.event, Date.now() - shownAt.current)
    }
    document.addEventListener('visibilitychange', onHide)
    return () => document.removeEventListener('visibilitychange', onHide)
  }, [hint])

  if (!hint) return null
  const react = (reaction: 'up' | 'down'): void => {
    void window.api.hints.react(hint.event, hint.id, reaction)
    if (reaction === 'up') chime('promote')
    setHint(null)
  }
  return (
    <div className="mb-4 rounded-lg bg-[color-mix(in_srgb,var(--tt-brand-color-400)_10%,transparent)] px-3 py-2.5 text-sm">
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
