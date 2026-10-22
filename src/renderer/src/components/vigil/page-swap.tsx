import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { useReadsIn } from '@/lib/reads-in'

/**
 * One page swapped for the next the way Finder and Mail swap them: the new
 * page goes on show the frame its reads are in (lib/reads-in.tsx), and until
 * then the page you were on stays on show where it was, never an empty
 * window between the two. A page whose reads are already in (nearly all of
 * them, nearly always) is there in the very next frame and the old one gone
 * in that same frame; the slowest read never holds the old one longer than
 * the page itself would wait.
 */
export function PageSwap({ id, children }: { id: string; children: ReactNode }): React.JSX.Element {
  const [seen, setSeen] = useState<string | null>(null)
  const ready = seen === id
  // The page last on show, as it was last drawn: what stays up while the next one reads.
  const shown = useRef<{ id: string; node: ReactNode }>({ id, node: children })
  // The page just left: out of sight the frame the next one shows, and taken down once that frame
  // is painted. Taken down in it, a big page's every menu and motion let go first (Home's took 25ms).
  const left = useRef<{ id: string; node: ReactNode } | null>(null)
  if (ready && shown.current.id !== id) left.current = shown.current
  if (ready) shown.current = { id, node: children }
  const old = !ready && shown.current.id !== id ? shown.current : null
  const leaving = !old && left.current && left.current.id !== id ? left.current : null
  const [, redraw] = useState(0)
  useEffect(() => {
    if (!leaving) return
    let after = 0
    const frame = requestAnimationFrame(() => void (after = window.setTimeout(() => ((left.current = null), redraw((n) => n + 1)), 0)))
    return () => (cancelAnimationFrame(frame), clearTimeout(after))
  }, [leaving])
  const pages = [
    old && <Held key={old.id} over>{old.node}</Held>,
    leaving && <Held key={leaving.id} over gone>{leaving.node}</Held>,
    <Held key={id} onSeen={() => setSeen(id)}>{children}</Held>
  ].filter(Boolean)
  return <div className="relative flex min-w-0 flex-1">{pages}</div>
}

/** One page, unseen until every read on it is in; once seen, says so. `gone`: on its way out, unseen. */
function Held({ over = false, gone = false, onSeen, children }: { over?: boolean; gone?: boolean; onSeen?: () => void; children: ReactNode }): React.JSX.Element {
  const { provide, style } = useReadsIn()
  const on = style === undefined
  useLayoutEffect(() => void (on && onSeen?.()), [on]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className={over ? 'pointer-events-none absolute inset-0 flex min-w-0' : 'flex min-w-0 flex-1'} style={gone ? { display: 'none' } : style} inert={gone || undefined}>
      {provide(children)}
    </div>
  )
}
