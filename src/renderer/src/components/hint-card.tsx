import { useEffect, useRef, useState } from 'react'
import { ArrowUpRight, ThumbsDown, ThumbsUp, X } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'

import { textOf } from './rot-cards'
import { chime } from '@/lib/sound'
import { vigil } from '@/lib/vigil'
import { toast } from './vigil/ui'

type Hint = NonNullable<Awaited<ReturnType<typeof window.api.hints.next>>>


/**
 * A hint: one nugget you did not ask for, like a tip on a game's loading
 * screen. Up and down change how often it comes back; doing nothing is the
 * normal case and says nothing. It never grades and never schedules.
 */
export function HintCard({ onOpen }: { onOpen: (captureId: string) => void }): React.JSX.Element | null {
  const [hint, setHint] = useState<Hint | null>(null)
  const shownAt = useRef(0)

  // Most opens show nothing: the rate is a setting, a tenth by default.
  useEffect(
    () =>
      window.api.onShown(async () => {
        const { rate } = await vigil.hintRate()
        setAsking(false)
        if (Math.random() < rate) {
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

  // After an up-vote, the card asks once whether it should be tested: the
  // moment a hint stops you is the only moment you will act on it.
  const [asking, setAsking] = useState(false)
  const react = (reaction: 'up' | 'down'): void => {
    if (!hint) return
    void window.api.hints.react(hint.event, hint.id, reaction)
    if (reaction === 'up') {
      chime('promote')
      setAsking(true)
    } else {
      chime('away')
      setHint(null)
    }
  }
  // Ctrl-U and Ctrl-D from anywhere in the prompt, so a vote needs no mouse.
  useEffect(() => {
    if (!hint || asking) return
    const onKey = (event: KeyboardEvent): void => {
      if (!event.ctrlKey || !event.shiftKey) return
      if (event.code === 'ArrowUp') react('up')
      else if (event.code === 'ArrowDown') react('down')
      else return
      event.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  return (
    <AnimatePresence>
      {hint && (
        <motion.div
          key={hint.id}
          initial={{ opacity: 0, y: -6, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, height: 0, marginBottom: 0, transition: { duration: 0.2 } }}
          transition={{ type: 'spring', stiffness: 380, damping: 30 }}
          onAnimationStart={() => chime('hint')}
          className="mt-2 mb-3 overflow-hidden rounded-lg bg-[color-mix(in_srgb,var(--tt-brand-color-400)_10%,transparent)] px-3 py-2.5 text-sm"
        >
          <div className="line-clamp-6 whitespace-pre-line">{textOf(hint.body)}</div>
          {asking ? (
            <input
              autoFocus
              placeholder="Worth testing? Write the question and press Enter"
              onBlur={() => setHint(null)}
              onKeyDown={(event) => {
                if (event.key === 'Escape') return setHint(null)
                if (event.key !== 'Enter' || !event.currentTarget.value.trim()) return
                void vigil.saveItem(hint.id, { prompt: event.currentTarget.value.trim() }).then(() => {
                  toast('Now tested: it joins your review')
                  setHint(null)
                })
              }}
              className="mt-2 w-full rounded-md border bg-background/60 px-2 py-1 outline-none placeholder:text-muted-foreground focus:border-ring"
            />
          ) : (
            <div className="mt-2 flex items-center gap-1 text-muted-foreground [&_svg]:size-3.5">
              <span className="mr-auto text-xs">Hint · {hint.kind}</span>
              {/* Open, or let it go: a hint asks nothing else of you. */}
              {hint.captureId && (
                <button type="button" className="rounded p-1 hover:bg-accent" title="Open" onClick={() => {
                  onOpen(hint.captureId!)
                  setHint(null)
                }}>
                  <ArrowUpRight />
                </button>
              )}
              <button type="button" className="rounded p-1 hover:bg-accent" title="More of this  ⌃⇧↑" onClick={() => react('up')}>
                <ThumbsUp />
              </button>
              <button type="button" className="rounded p-1 hover:bg-accent" title="Less of this  ⌃⇧↓" onClick={() => react('down')}>
                <ThumbsDown />
              </button>
              <button type="button" className="rounded p-1 hover:bg-accent" title="Dismiss" onClick={() => setHint(null)}>
                <X />
              </button>
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  )
}
