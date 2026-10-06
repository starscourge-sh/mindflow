import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { chime } from '@/lib/sound'
import { Button } from '@/components/ui/button'
import { Kbd, Rolling, Typed, toast } from './ui'

/**
 * The first-run tour: a handful of cards, each with the part of the window it
 * is about lit up and the rest dimmed. Under two minutes, skippable at any
 * point with Esc, and replayed from Settings. The last card offers to bring
 * in what you already have, through the menu bar's importers.
 */
type Stop = { title: string; text: string; keys?: string[]; at?: string }
const STOPS: Stop[] = [
  { title: 'The box', keys: ['⌘.'], text: 'Press ⌘. from any app and a small box comes up. Write the thought down, press ⌘↵, and you are back where you were.' },
  { title: 'The inbox', at: '[data-tour="inbox"]', keys: ['P', 'R', 'D'], text: 'Everything you write lands in the Inbox. Each capture leaves by one of three exits: Promote keeps it, Resolve says it is done, Discard lets it go.' },
  { title: 'Rot cards', text: 'Nothing is left to rot. A few captures you have not dealt with come back as cards in the Inbox of the box\'s side panel. With the panel shut, a chip at the top of the box says how many ("3 old"); click it to see them.' },
  { title: 'Hints', keys: ['⌃⇧↑', '⌃⇧↓'], text: 'Now and then the box shows you something you kept, so it comes back to you. Thumbs up or down, and the next hints follow what you liked.' },
  { title: 'Finding things', at: '[data-tour="search"]', keys: ['⌘K', '?'], text: '⌘K searches everything and does anything. ? shows every shortcut, whenever you are not typing.' }
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
    if (skipped) toast('Tour skipped: Settings can play it again')
  }
  useEffect(() => {
    if (at < 0) return
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') end(true)
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
          className="pointer-events-none absolute rounded-lg ring-2 ring-primary transition-all duration-300"
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
          <span className="font-semibold text-foreground">{stop?.title ?? 'Bring what you have'}</span>
          {stop?.keys && <span className="flex gap-1">{stop.keys.map((key) => <Kbd key={key}>{key}</Kbd>)}</span>}
          <Rolling text={`${at + 1} / ${STOPS.length + 1}`} className="ml-auto text-meta tabular-nums text-muted-foreground" />
        </div>
        <p className="leading-relaxed text-muted-foreground">
          <Typed text={stop?.text ?? 'Notes from Obsidian, highlights from Readwise or Kindle: bring them in now, or later from Settings or the menu bar icon.'} step={24} delay={150} />
        </p>
        {!stop && (
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => bring('vault')}>Obsidian vault…</Button>
            <Button size="sm" variant="outline" onClick={() => bring('files')}>Readwise or Kindle…</Button>
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
