import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { chime } from '@/lib/sound'
import { byKeys } from '@/lib/motion'
import { Button } from '@/components/ui/button'
import { Kbd, Rolling, Pressed } from './ui'
import { enterSandbox } from '@/lib/sandbox'

/**
 * Three places to know, after the welcome's Start fresh: where captures
 * wait, where to find anything, and the checklist that shows the rest. Each
 * lit up with the rest of the window dimmed. The ideas themselves are the
 * welcome's (welcome.tsx); this only says where things are. Esc ends it.
 */
type Stop = { title: string; text: string; keys?: string[]; at: string; /** Offer the sandbox too, for a power shown in your own notes. */ sandbox?: boolean }
const STOPS: Stop[] = [
  { title: 'Your Inbox', at: '[data-tour="inbox"]', keys: ['G I'], text: 'Everything you catch waits here. Nothing to sort as you write: that comes later, a few minutes at a time.' },
  { title: 'Find anything', at: '[data-tour="search"]', keys: ['⌘K'], text: 'Every note, and every action Vigil has. Press ? for every key.' },
  { title: 'Getting started', at: '[data-tour="started"]', text: 'A short list of firsts. It ticks itself as you do them, and goes once you are done.' }
]

export function Tour(): React.JSX.Element | null {
  // -1 is closed.
  const [at, setAt] = useState(-1)
  // The three stops, or one thing pointed at from elsewhere (What Vigil can do's Show me).
  const [stops, setStops] = useState(STOPS)
  useEffect(() => {
    const start = (): void => (setStops(STOPS), setAt(0))
    const point = (event: Event): void => (setStops([(event as CustomEvent<Stop>).detail]), setAt(0))
    window.addEventListener('vigil:tour-stops', start)
    window.addEventListener('vigil:point', point)
    return () => (window.removeEventListener('vigil:tour-stops', start), window.removeEventListener('vigil:point', point))
  }, [])

  // Page hints keep quiet under it.
  useEffect(() => void document.documentElement.toggleAttribute('data-touring', at >= 0), [at])
  const stop = stops[at] as Stop | undefined
  // Where the lit part is, measured after layout and again when the window changes size.
  const [rect, setRect] = useState<DOMRect | null>(null)
  const card = useRef<HTMLDivElement>(null)
  const [cardH, setCardH] = useState(160)
  useLayoutEffect(() => {
    const el = card.current
    if (!el) return
    const watch = new ResizeObserver(() => setCardH(el.offsetHeight))
    watch.observe(el)
    return () => watch.disconnect()
  }, [at])
  useLayoutEffect(() => {
    const measure = (): void => setRect(stop?.at ? document.querySelector(stop.at)?.getBoundingClientRect() ?? null : null)
    if (stop?.at) document.querySelector(stop.at)?.scrollIntoView({ block: 'nearest' })
    measure()
    // The page under it may still be settling in.
    const again = setTimeout(measure, 260)
    window.addEventListener('resize', measure)
    return () => (clearTimeout(again), window.removeEventListener('resize', measure))
  }, [stop?.at])

  const end = (skipped: boolean): void => {
    chime(skipped ? 'away' : 'done')
    setAt(-1)
  }
  const go = (to: number): void => {
    if (to < 0) return void chime('nope')
    if (to >= stops.length) return end(false)
    chime('page')
    setAt(to)
  }
  useEffect(() => {
    if (at < 0) return
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') end(true)
      else if (event.key === 'ArrowRight' || event.key === 'Enter') go(at + 1)
      else if (event.key === 'ArrowLeft') go(at - 1)
      else return
      event.preventDefault()
      event.stopPropagation()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  })
  if (at < 0 || !stop) return null

  // A row in a list gets its own outline, never one that spills onto its neighbours.
  const pad = rect && rect.height < 48 ? 0 : 6
  // The card beside the lit part where it is a narrow column (the sidebar), else under or over it, never past the window's edges.
  const fit = (top: number): number => Math.max(16, Math.min(top, window.innerHeight - cardH - 16))
  const beside = !!rect && rect.right + 16 + 320 < window.innerWidth && rect.width < window.innerWidth * 0.4
  const style = !rect
    ? { top: '30%', left: '50%', transform: 'translateX(-50%)' }
    : beside
      ? { top: fit(rect.top - 8), left: rect.right + pad + 14 }
      : { top: rect.bottom + pad + 10 + cardH + 16 <= window.innerHeight ? rect.bottom + pad + 10 : fit(rect.top - pad - 10 - cardH), left: Math.max(16, Math.min(rect.left, window.innerWidth - 336)) }
  return (
    <div role="dialog" aria-label="Where things are" className="fixed inset-0 z-[60]">
      {/* The dim, with a hole where the lit part is, outlined: one shadow, spread wide (a ring class would be overwritten by it). */}
      {rect ? (
        <div
          className="pointer-events-none absolute rounded-lg transition-[left,top,width,height] duration-250 ease-(--mf-ease)"
          style={{ left: rect.left - pad, top: rect.top - pad, width: rect.width + pad * 2, height: rect.height + pad * 2, boxShadow: '0 0 0 2px var(--primary), 0 0 0 9999px rgb(0 0 0 / 0.55)' }}
        />
      ) : (
        <div className="absolute inset-0 bg-black/55" />
      )}
      <div
        key={at}
        ref={card}
        className={`absolute w-[min(20rem,calc(100vw-2rem))] rounded-xl border bg-background p-4 text-body shadow-(--mf-panel-shadow) ${byKeys() ? '' : 'animate-in fade-in-0 slide-in-from-bottom-2 duration-200'}`}
        style={style}
      >
        <div className="mb-1 flex items-center gap-2">
          <span className="font-heading text-heading font-semibold text-foreground">{stop.title}</span>
          {stop.keys && <span className="flex gap-1">{stop.keys.map((key) => <Pressed key={key} keys={key} />)}</span>}
          {stops.length > 1 && <Rolling text={`${at + 1} of ${stops.length}`} className="ml-auto text-meta tabular-nums text-muted-foreground" />}
        </div>
        <p className="leading-relaxed text-muted-foreground">{stop.text}</p>
        <div className="mt-4 flex items-center gap-2">
          {stops.length > 1 && <Button size="sm" variant="ghost" onClick={() => end(true)}>Skip <Kbd>Esc</Kbd></Button>}
          {stop.sandbox && <Button size="sm" variant="ghost" onClick={() => (setAt(-1), void enterSandbox())}>Try it in the sandbox</Button>}
          <span className="flex-1" />
          {at > 0 && <Button size="sm" variant="ghost" onClick={() => go(at - 1)}>Back</Button>}
          <Button size="sm" onClick={() => go(at + 1)}>{stops.length === 1 ? 'Got it' : at === stops.length - 1 ? 'Done' : 'Next'} <Kbd>↵</Kbd></Button>
        </div>
      </div>
    </div>
  )
}
