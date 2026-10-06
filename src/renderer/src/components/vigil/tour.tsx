import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { chime } from '@/lib/sound'
import { Button } from '@/components/ui/button'
import { Kbd, Rolling, Typed, toast, Pressed } from './ui'

/**
 * The first-run tour: the loop in one card a step, with the part of the window
 * it is about lit up and the rest dimmed. Catch it, it waits in the Inbox, tidy
 * daily, decide weekly, and it comes back. About a minute, skippable with Esc,
 * replayed from Settings. The last card brings in what you already have.
 */
type Stop = { title: string; text: string; keys?: string[]; at?: string }
const STOPS: Stop[] = [
  { title: 'Catch it', keys: ['⌘.'], text: 'Press ⌘. in any app, write the thought, and send it with ⌘↵. You are back where you were.' },
  { title: 'It waits in the Inbox', at: '[data-tour="inbox"]', keys: ['G I'], text: 'Everything you send lands here. Nothing to sort as you write: that comes later, a few minutes at a time.' },
  { title: 'Tidy, each day', text: 'Once a day the box offers a few minutes over your latest captures: add tags, bold a line, fold the rest. Nothing to decide.' },
  { title: 'Decide, each week', keys: ['P', 'R', 'D'], text: 'On your deciding day, go through what waited, one at a time: Promote to keep it, Resolve when it is done, Discard to let it go.' },
  { title: 'It comes back to you', at: '[data-tour="review"]', keys: ['G R'], text: 'What you keep returns on its own: a hint in the box now and then, old captures as cards, and Review for what you want to remember.' },
  { title: 'Find anything', at: '[data-tour="search"]', keys: ['⌘K', '?'], text: '⌘K searches every note and runs every action. ? lists every key.' }
]

const seen = (): boolean => {
  try {
    return localStorage.getItem('tour') === 'done'
  } catch {
    return true
  }
}
const markSeen = (): void => {
  try {
    localStorage.setItem('tour', 'done')
  } catch {
    // Shown again next time, which is the lesser harm.
  }
}

export function Tour({ firstRun = false }: { firstRun?: boolean }): React.JSX.Element | null {
  // -1 is closed; STOPS.length is the import card.
  const [at, setAt] = useState(-1)
  useEffect(() => {
    const start = (): void => (chime('read'), setAt(0))
    window.addEventListener('vigil:tour', start)
    // A first run: nothing written yet and the tour never seen. Brings the
    // window forward, since the app starts in the background.
    if (firstRun && !seen())
      void window.api.captures.list().then((list) => {
        if (list.length || seen()) return
        window.api.openInHome('view', 'inbox')
        start()
      })
    return () => window.removeEventListener('vigil:tour', start)
  }, [firstRun])

  const stop = STOPS[at] as Stop | undefined
  // Where the lit part is, measured after layout and again when the window changes size.
  const [rect, setRect] = useState<DOMRect | null>(null)
  const card = useRef<HTMLDivElement>(null)
  // The card's own height, followed as its sentence types in, so it can be kept inside the window.
  const [cardH, setCardH] = useState(200)
  useLayoutEffect(() => {
    const el = card.current
    if (!el) return
    const watch = new ResizeObserver(() => setCardH(el.offsetHeight))
    watch.observe(el)
    return () => watch.disconnect()
  }, [at])
  useLayoutEffect(() => {
    const measure = (): void => setRect(stop?.at ? document.querySelector(stop.at)?.getBoundingClientRect() ?? null : null)
    // The lit part may be scrolled out of its list in a small window: bring it into view first.
    if (stop?.at) document.querySelector(stop.at)?.scrollIntoView({ block: 'nearest' })
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [stop?.at])

  const go = (to: number): void => {
    // The import card is the last: nothing past it to go to.
    if (to < 0 || to > STOPS.length) return void chime('nope')
    chime('page')
    setAt(to)
  }
  const end = (skipped: boolean): void => {
    markSeen()
    chime(skipped ? 'away' : 'done')
    setAt(-1)
    if (skipped) toast('Tour skipped: Settings can play it again', undefined, 'info')
  }
  useEffect(() => {
    if (at < 0) return
    const onKey = (event: KeyboardEvent): void => {
      // Esc on the last card is finishing, not skipping.
      if (event.key === 'Escape') end(at < STOPS.length)
      else if (event.key === 'ArrowRight' || (event.key === 'Enter' && at < STOPS.length)) go(at + 1)
      else if (event.key === 'ArrowLeft') go(at - 1)
      else return
      event.preventDefault()
      event.stopPropagation()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  })
  if (at < 0) return null

  const bring = (what: 'vault' | 'files'): void => {
    chime('open')
    void window.api.importFrom(what)
  }
  const pad = 6
  // The card goes under the lit part, or over it, and never past the window's edges.
  const fit = (top: number): number => Math.max(16, Math.min(top, window.innerHeight - cardH - 16))
  const top = !rect ? '30%' : rect.bottom + pad + 10 + cardH + 16 <= window.innerHeight ? rect.bottom + pad + 10 : fit(rect.top - pad - 10 - cardH)
  return (
    <div role="dialog" aria-label="Tour" className="fixed inset-0 z-[60]">
      {/* The dim, with a hole where the lit part is: one shadow, spread wide. */}
      {rect ? (
        <div
          className="pointer-events-none absolute rounded-lg ring-2 ring-primary transition-[left,top,width,height] duration-250 ease-(--mf-ease)"
          style={{ left: rect.left - pad, top: rect.top - pad, width: rect.width + pad * 2, height: rect.height + pad * 2, boxShadow: '0 0 0 9999px rgb(0 0 0 / 0.55)' }}
        />
      ) : (
        <div className="absolute inset-0 bg-black/55 animate-in fade-in-0 duration-200" />
      )}
      <div
        key={at}
        ref={card}
        className="absolute left-1/2 w-[min(26rem,calc(100vw-2rem))] -translate-x-1/2 rounded-xl border bg-background p-4 text-body shadow-(--mf-panel-shadow) animate-in fade-in-0 slide-in-from-bottom-2 duration-200"
        style={{ top }}
      >
        <div className="mb-1 flex items-center gap-2">
          <span className="font-semibold text-foreground">{stop?.title ?? 'Coming from Obsidian or Notion?'}</span>
          {stop?.keys && <span className="flex gap-1">{stop.keys.map((key) => <Pressed key={key} keys={key} />)}</span>}
          <Rolling text={`${at + 1} / ${STOPS.length + 1}`} className="ml-auto text-meta tabular-nums text-muted-foreground" />
        </div>
        <p className="leading-relaxed text-muted-foreground">
          <Typed text={stop?.text ?? 'Bring your notes in now, or any time from Settings, under Import and backups.'} step={24} delay={150} />
        </p>
        {!stop && (
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => bring('vault')}>Obsidian vault or Notion export…</Button>
            <Button size="sm" variant="outline" onClick={() => bring('files')}>Readwise, Kindle, Markdown…</Button>
          </div>
        )}
        <div className="mt-4 flex items-center gap-2">
          <Button size="sm" variant="ghost" onClick={() => end(true)}>Skip <Kbd>Esc</Kbd></Button>
          <span className="flex-1" />
          {at > 0 && <Button size="sm" variant="ghost" onClick={() => go(at - 1)}>Back</Button>}
          {stop
            ? <Button size="sm" onClick={() => go(at + 1)}>Next <Kbd>↵</Kbd></Button>
            : <Button size="sm" onClick={() => end(false)}>Done</Button>}
        </div>
      </div>
    </div>
  )
}
