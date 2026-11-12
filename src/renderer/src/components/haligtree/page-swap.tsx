import { useEffect, useInsertionEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { useReadsIn } from '@/lib/reads-in'

/**
 * One page swapped for the next the way Finder and Mail swap them: the new
 * page goes on show the frame its reads are in (lib/reads-in.tsx), and until
 * then the page you were on stays on show where it was, never an empty
 * window between the two. A page whose reads are already in (nearly all of
 * them, nearly always) is there in the very next frame and the old one gone
 * in that same frame; the slowest read never holds the old one longer than
 * the page itself would wait.
 *
 * The page being left is asked nothing on the way. Anything said on it that its boxes inherit (`inert`, no pointer
 * events, hidden from sight), a class given to it, or a box put in beside it (the next page, a cover) makes the
 * browser work out every box under it again, and under a long note that is every one of its blocks: 115 to 160 ms
 * a time for the 7,017-block "Exam Cliff Notes", two or three times in one leave. So the two pages each have a
 * place of their own that is always in the page: the next page is made in the empty one, out of sight, while the
 * one being left stays as it is in its own; the frame the next is ready, the place being left is taken out of
 * the page in one step (`display: none`, 4 ms). Only a page that must wait for the next one's reads is held as a
 * picture, by a cover that is always there coming on over it and by its giving up the keys.
 */
export function PageSwap({ id, children }: { id: string; children: ReactNode }): React.JSX.Element {
  const [seen, setSeen] = useState<string | null>(null)
  // The page known to be still reading once its parts have had their first say: only then is the one before it held.
  const [waits, setWaits] = useState<string | null>(null)
  const ready = seen === id
  // The page last on show, as it was last drawn: what stays up while the next one reads.
  const shown = useRef<{ id: string; node: ReactNode }>({ id, node: children })
  // The page just left: out of the layout the frame the next one shows (so that frame lays out only
  // the new page), and taken down once that frame is painted. Taken down in it, a big page's every menu and motion let go first (Home's took 25ms).
  const left = useRef<{ id: string; node: ReactNode } | null>(null)
  if (ready && shown.current.id !== id) left.current = shown.current
  if (ready) shown.current = { id, node: children }
  const old = !ready && shown.current.id !== id ? shown.current : null
  const leaving = !old && left.current && left.current.id !== id ? left.current : null
  const held = !!old && waits === id
  const [, redraw] = useState(0)
  useEffect(() => {
    if (!leaving) return
    let after = 0
    const frame = requestAnimationFrame(() => void (after = window.setTimeout(() => ((left.current = null), redraw((n) => n + 1)), 0)))
    return () => (cancelAnimationFrame(frame), clearTimeout(after))
  }, [leaving])
  // Which of the two places each page on the page is in: the next page takes the one the page being left is not in.
  const places = useRef<Record<string, 0 | 1>>({})
  const going = old ?? leaving
  for (const page of Object.keys(places.current)) if (page !== id && page !== going?.id) delete places.current[page]
  places.current[id] ??= going && places.current[going.id] === 0 ? 1 : 0
  const boxes = useRef<[HTMLDivElement | null, HTMLDivElement | null]>([null, null])
  const [keep] = useState(() => ([0, 1] as const).map((place) => (box: HTMLDivElement | null): void => void (boxes.current[place] = box)))
  const picture = (): HTMLDivElement | null => (going ? boxes.current[places.current[going.id] ?? 0] : null)
  // A selection inside the page being put away is let go of before the page is: left in a page that is no longer
  // drawn, the browser looks for where to show it through everything the page held (seconds, in a long note).
  useInsertionEffect(() => {
    const selection = leaving ? document.getSelection() : null
    if (selection?.rangeCount && picture()?.contains(selection.anchorNode)) selection.removeAllRanges()
  }, [leaving]) // eslint-disable-line react-hooks/exhaustive-deps
  // Held, it is only a picture of where you were: it gives up the keys and takes none back (a slow Tags kept Home up
  // for a moment, and Home's arrows focused one of its cards there, which the next Enter opened).
  useLayoutEffect(() => {
    const page = held ? picture() : null
    if (!page) return
    const refuse = (event: FocusEvent): void => void (event.target instanceof HTMLElement && event.target.blur())
    if (document.activeElement instanceof HTMLElement && page.contains(document.activeElement)) document.activeElement.blur()
    page.addEventListener('focusin', refuse)
    return () => page.removeEventListener('focusin', refuse)
  }, [held]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="relative flex min-w-0 flex-1">
      {([0, 1] as const).map((place) => {
        const next = places.current[id] === place
        const last = !!going && places.current[going.id] === place
        // On the page: the place of the page to come, and of the one being left until the next is seen. Marked
        // unless it is the page to come's, so nothing counts the other as a page (panes.tsx, lib/hero.ts).
        return (
          <div key={place} ref={keep[place]} className="absolute inset-0 flex min-w-0" style={next || (last && !!old) ? undefined : { display: 'none' }} data-page-held={next ? undefined : ''}>
            {[last && going && <Held key={going.id}>{going.node}</Held>, next && <Held key={id} onSeen={() => (setSeen(id), setWaits(null))} onWaits={() => setWaits(id)}>{children}</Held>].filter(Boolean)}
          </div>
        )
      })}
      {/* What takes the pointer in a held page's place: always there, on show only while a page is held. */}
      <div data-page-held="" className="absolute inset-0 z-[90]" style={held ? undefined : { display: 'none' }} />
    </div>
  )
}

/**
 * One page, unseen until every read on it is in; once seen, says so, and says so too if its parts have had their
 * first say and it is still reading.
 */
function Held({ onSeen, onWaits, children }: { onSeen?: () => void; onWaits?: () => void; children: ReactNode }): React.JSX.Element {
  const { provide, style, counted } = useReadsIn()
  const on = style === undefined
  useLayoutEffect(() => void (on && onSeen?.()), [on]) // eslint-disable-line react-hooks/exhaustive-deps
  useLayoutEffect(() => void (counted && !on && onWaits?.()), [counted, on]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="flex min-w-0 flex-1" style={style}>
      {provide(children)}
    </div>
  )
}
