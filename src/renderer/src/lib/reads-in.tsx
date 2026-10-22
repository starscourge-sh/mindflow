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
type Hold = (id: symbol, reading: boolean) => void
const Holding = createContext<Hold | null>(null)
/** Whether the page a part is on is on show yet: true outside any page. */
const Seen = createContext(true)
export const useSeen = (): boolean => useContext(Seen)

/** A safety net: a read that never answers (an error) never keeps a page unseen. */
const AT_MOST = 1500

export function useReadsIn(reading = false): { provide: (children: ReactNode) => ReactNode; style: CSSProperties | undefined } {
  // Kept where a part's say is seen at once: a part that comes in (a section
  // mounted a frame later) says it is reading in its layout effect, which runs
  // before this page's own, so the page never counts itself ready without it.
  const waiting = useRef(new Set<symbol>())
  const [, redraw] = useState(0)
  // Not shown before the parts under it have had their first say (their layout effects run first).
  const [counted, setCounted] = useState(false)
  const [shown, setShown] = useState(false)
  useLayoutEffect(() => setCounted(true), [])
  const hold = useCallback<Hold>((id, on) => {
    if (waiting.current.has(id) === on) return
    if (on) waiting.current.add(id)
    else waiting.current.delete(id)
    redraw((n) => n + 1)
  }, [])
  const ready = counted && !reading && waiting.current.size === 0
  useLayoutEffect(() => void (!shown && counted && !reading && waiting.current.size === 0 && setShown(true)))
  // A page inside another (a pane of Tags, Review in quick capture) is one of its parts: the outer one waits for it too.
  const parent = useContext(Holding)
  const [me] = useState(() => Symbol('page'))
  // Said after its own parts have had theirs in this frame, so it is never counted ready a frame too soon.
  useLayoutEffect(() => void parent?.(me, !(shown || (counted && !reading && waiting.current.size === 0))))
  useLayoutEffect(() => () => void parent?.(me, false), [parent, me])
  useEffect(() => {
    if (shown) return
    const late = setTimeout(() => setShown(true), AT_MOST)
    return () => clearTimeout(late)
  }, [shown])
  const seen = shown || ready
  const provide = (children: ReactNode): ReactNode => <Holding.Provider value={hold}><Seen.Provider value={seen}>{children}</Seen.Provider></Holding.Provider>
  return { provide, style: seen ? undefined : { visibility: 'hidden' } }
}

/** A part of a page still waiting on a read: the page it is on waits with it. */
export function useReading(reading: boolean): void {
  const hold = useContext(Holding)
  const [id] = useState(() => Symbol('reading'))
  useLayoutEffect(() => void hold?.(id, reading), [hold, id, reading])
  useLayoutEffect(() => () => void hold?.(id, false), [hold, id])
}

/** A page, or a panel, that waits for every part on it: see `useReadsIn`. */
export function ReadsIn({ reading = false, className, children, ...rest }: { reading?: boolean; className?: string; children: ReactNode } & Record<`data-${string}`, string | undefined>): React.JSX.Element {
  const { provide, style } = useReadsIn(reading)
  return <div className={className} style={style} {...rest}>{provide(children)}</div>
}
