import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'

/**
 * A page drawn once, when every read on it is in. A page made of parts that
 * each read their own (Stats' sections, Today's lines, a day's page) drew
 * each part as its read came back: a section popped in between two others
 * and pushed the rest down, a line came in over the list. Each part says
 * whether it is still reading (`useReading`); the page (`useReadsIn`) keeps
 * its whole self unseen, laid out in place, until none is, then shows all of
 * it in one frame. Never longer than its slowest read, and never again once
 * shown: a part that reads afresh later changes in place, as anything does.
 */
type Hold = (id: symbol, reading: boolean, page?: boolean) => void
const Holding = createContext<Hold | null>(null)
/** Whether the page a part is on is on show yet: true outside any page. */
const Seen = createContext(true)
export const useSeen = (): boolean => useContext(Seen)

/** A safety net: a read that never answers (an error) never keeps a page unseen. */
const AT_MOST = 1500

// A test run names each page and part by the place in the code that made it (the frame that called the hook, which
// qa/start-time.mjs reads back through the build's source maps), and keeps, for every page whose limit ran out, what it
// was still waiting for: `window.haligtreeHeld`. Nothing of it in a person's run.
const TEST = typeof window !== 'undefined' && !!window.api?.testRun
const heldPast: { page: string; self: boolean; waiting: string[]; at: number }[] = []
if (TEST) (window as { haligtreeHeld?: typeof heldPast }).haligtreeHeld = heldPast
/** The caller of the hook that asks: a fresh stack's fourth line (the error, this, the hook, its caller). */
const madeAt = (): string => (new Error().stack?.split('\n')[3] ?? '').trim()

/**
 * `apart`: a part that comes in whole on its own, never holding the page it
 * is on (what sits under a note's words never keeps the words waiting).
 * `pages`: a page that waits only for the pages on it, never for a part outside any page (the window's first screen,
 * windows/home.tsx): a part on no page held nothing before the window waited for its screen, and must not hold it now.
 */
export function useReadsIn(reading = false, apart = false, { label = '', pages = false }: { label?: string; pages?: boolean } = {}): { provide: (children: ReactNode) => ReactNode; style: CSSProperties | undefined; counted: boolean } {
  const where = useRef('')
  if (TEST && !where.current) where.current = label || madeAt()
  const readingNow = useRef(reading)
  readingNow.current = reading
  // Kept where a part's say is seen at once: a part that comes in (a section
  // mounted a frame later) says it is reading in its layout effect, which runs
  // before this page's own, so the page never counts itself ready without it.
  const waiting = useRef(new Set<symbol>())
  const [, redraw] = useState(0)
  // Not shown before the parts under it have had their first say (their layout effects run first).
  const [counted, setCounted] = useState(false)
  const [shown, setShown] = useState(false)
  useLayoutEffect(() => setCounted(true), [])
  const hold = useCallback<Hold>((id, on, page) => {
    if ((pages && !page) || waiting.current.has(id) === on) return
    if (on) waiting.current.add(id)
    else waiting.current.delete(id)
    redraw((n) => n + 1)
  }, [pages])
  const ready = counted && !reading && waiting.current.size === 0
  // On show for good only from the frame it is first drawn in (asked of that frame, after every draw before it): counted
  // so in a draw part way through the turn that brought its rows in, Writing went on show for good before two of its
  // rows had their say, and they came into a page already on show, their pictures still on their way (traced in the
  // order the page changed). Until that frame it shows whenever nothing on it is waiting, as before. (Any draw before
  // it asks the frame again, so the page's own say is current when it answers.)
  useLayoutEffect(() => {
    if (shown || !counted || reading || waiting.current.size) return
    const frame = requestAnimationFrame(() => void (!waiting.current.size && setShown(true)))
    return () => cancelAnimationFrame(frame)
  })
  // A page inside another (a pane of Tags, Review in quick capture) is one of its parts: the outer one waits for it too.
  const held = useContext(Holding)
  const parent = apart ? null : held
  const [me] = useState(() => Symbol(TEST ? `page ${where.current}` : 'page'))
  // Said after its own parts have had theirs in this frame, so it is never counted ready a frame too soon.
  useLayoutEffect(() => void parent?.(me, !(shown || (counted && !reading && waiting.current.size === 0)), true))
  useLayoutEffect(() => () => void parent?.(me, false, true), [parent, me])
  useEffect(() => {
    if (shown) return
    const late = setTimeout(() => {
      if (TEST) heldPast.push({ page: me.description ?? '', self: readingNow.current, waiting: [...waiting.current].map((one) => one.description ?? ''), at: Math.round(performance.now()) })
      setShown(true)
    }, AT_MOST)
    return () => clearTimeout(late)
  }, [shown])
  const seen = shown || ready
  const provide = (children: ReactNode): ReactNode => <Holding.Provider value={hold}><Seen.Provider value={seen}>{children}</Seen.Provider></Holding.Provider>
  // `counted`: its parts have had their first say, so a page still unseen now is one that is truly reading.
  return { provide, style: seen ? undefined : { visibility: 'hidden' }, counted }
}

/** A part of a page still waiting on a read: the page it is on waits with it. */
export function useReading(reading: boolean): void {
  const hold = useContext(Holding)
  const where = useRef('')
  if (TEST && !where.current) where.current = madeAt()
  const [id] = useState(() => Symbol(TEST ? `part ${where.current}` : 'reading'))
  useLayoutEffect(() => void hold?.(id, reading), [hold, id, reading])
  useLayoutEffect(() => () => void hold?.(id, false), [hold, id])
}

/** A page, or a panel, that waits for every part on it: see `useReadsIn`. */
export function ReadsIn({ reading = false, apart = false, className, children, ...rest }: { reading?: boolean; apart?: boolean; className?: string; children: ReactNode } & Record<`data-${string}`, string | undefined>): React.JSX.Element {
  const { provide, style } = useReadsIn(reading, apart, { label: TEST ? `ReadsIn ${Object.entries(rest).map(([key, value]) => `${key}=${value}`).join(' ') || className || ''}` : '' })
  return <div className={className} style={style} {...rest}>{provide(children)}</div>
}
