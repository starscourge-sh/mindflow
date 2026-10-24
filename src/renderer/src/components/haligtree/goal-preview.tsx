import { useEffect, useState, type ReactNode } from 'react'
import { PartyPopper } from 'lucide-react'
import { haligtree } from '@/lib/haligtree'
import { chime } from '@/lib/sound'
import { ProgressBar } from './progress-bar'
import { SECTIONS, showWords } from './places'
import { toast } from './ui'
import { num } from '../../../../main/dates'

/**
 * A page that needs a fuller book to say much (the Feed, Stats) is never
 * locked: until its goal is met it shows the goal, large, with how far along
 * you are, and under it the page itself drawn from made-up content, faded,
 * so you can see what you are building toward. Met once, it is the real page
 * for good (`readyShown`), said once with a chime, and its sidebar row comes on.
 */
export function GoalPreview({ on = true, goal, counts, parts, heading, children, className = '' }: {
  /** What counts toward it, in a sentence. */
  counts: string
  /** False draws the children as they are, so a page wraps its body once and switches with a flag. */
  on?: boolean
  className?: string
  /** The goal, in one sentence. */
  goal: string
  /** Each count toward it: how many, of how many, called what. */
  parts: { have: number; need: number; what: string }[]
  /** Over the faded page: "What your Feed will look like". */
  heading: string
  children: ReactNode
}): React.JSX.Element {
  if (!on) return <>{children}</>
  return (
    <div data-goal-preview className={`flex min-w-0 flex-col ${className}`}>
      <section data-goal className="mb-6 flex flex-col gap-3 rounded-xl border border-foreground/15 bg-background px-4 py-4">
        <p className="font-heading text-[1.25rem] leading-snug font-semibold tracking-[-0.01em] text-foreground">{goal}</p>
        <p data-goal-progress className="text-body font-medium text-foreground tabular-nums">
          {parts.map((part) => `${num(Math.min(part.have, part.need))} of ${num(part.need)} ${part.what}`).join(' · ')}
        </p>
        <div className="flex gap-3">
          {parts.map((part) => <ProgressBar key={part.what} value={part.have / part.need} label={`${num(part.have)} of ${num(part.need)} ${part.what}`} thick={6} className="flex-1" silent />)}
        </div>
        <p className="text-body text-foreground/85">{counts}</p>
      </section>
      <p className="mb-2 text-body font-medium text-foreground/80">{heading}</p>
      <div data-goal-sample inert aria-hidden className="pointer-events-none flex min-w-0 flex-col opacity-55 saturate-[0.85] select-none [mask-image:linear-gradient(to_bottom,black_calc(100%-6rem),transparent)]">
        {children}
      </div>
    </div>
  )
}

/** Pages whose moment is being said now, so a second effect (StrictMode, a quick reload) says it once. */
const saying = new Set<string>()

/**
 * Whether the page is real yet: its goal met now (`met`), or met once before.
 * The first time it is met, `moment` is true for this visit: the page says it
 * is ready, with a chime, and its sidebar row comes on if it was off, with Undo.
 * Null while it is still being read. `say` false only reads (Home's card): the moment is the page's.
 */
export function useReady(id: 'feed' | 'stats', met: boolean | null, say = true): { real: boolean | null; moment: boolean } {
  const [shown, setShown] = useState<boolean | null>(null)
  const [moment, setMoment] = useState(false)
  useEffect(() => void haligtree.settings().then((now) => setShown((now.readyShown ?? []).includes(id))), [id])
  useEffect(() => {
    if (!say || shown !== false || !met || saying.has(id)) return
    saying.add(id)
    setShown(true)
    setMoment(true)
    void (async () => {
      const now = await haligtree.settings()
      if ((now.readyShown ?? []).includes(id)) return
      await haligtree.setSettings({ readyShown: [...(now.readyShown ?? []), id] })
      chime('cheer')
      const was = now.sidebarShown ?? []
      const place = SECTIONS.find((one) => one.id === id)
      if (place && !was.includes(id)) {
        await haligtree.setSettings({ sidebarShown: [...was, id] })
        toast(showWords(place, false).said, () => void haligtree.setSettings({ sidebarShown: was }).then(() => chime('off')))
      }
    })().finally(() => saying.delete(id))
  }, [id, met, shown, say])
  return { real: shown === null || met === null ? null : shown || met, moment }
}

/** The one-time line over a page that has just become real. */
export function ReadyMoment({ said, more, className = '' }: { said: string; more: string; className?: string }): React.JSX.Element {
  return (
    <section data-ready-moment role="status" className={`mb-6 flex items-center gap-3 rounded-xl border border-foreground/15 bg-background px-4 py-3.5 ${className}`}>
      <PartyPopper aria-hidden className="size-6 shrink-0 text-(--tt-color-text-pink)" />
      <div className="flex min-w-0 flex-col">
        <p className="font-heading text-[1.25rem] leading-snug font-semibold tracking-[-0.01em] text-foreground">{said}</p>
        <p className="text-body text-foreground/85">{more}</p>
      </div>
    </section>
  )
}
