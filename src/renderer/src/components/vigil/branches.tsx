import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { motion, useReducedMotion } from 'motion/react'

// Drawn in the list's own left padding, so no row moves: the trunk a few px
// left of the rows' edge, each branch curving off it and just into its row.
const TRUNK = -4.5
const BEND = 4.5
const TIP = 5
// The border colour reads as nothing this thin, so a softened muted ink instead.
const QUIET = 'color-mix(in oklab, var(--muted-foreground) 45%, transparent)'

/** An open group's rows hung off a thin trunk from its heading, a curved branch
 *  to each; the way down to the page you are on is lit, and moves with you.
 *  Bare, as on the icon rail, just the rows. */
export function Branches({ current, bare, className, children }: { current: number; bare?: boolean; className?: string; children: ReactNode }): React.JSX.Element {
  const box = useRef<HTMLDivElement>(null)
  // Where each row's middle sits, read off the rows themselves, since their heights differ.
  const [mids, setMids] = useState<number[]>([])
  const still = useReducedMotion()
  useLayoutEffect(() => {
    const rows = box.current
    if (!rows) return
    const measure = (): void => {
      // Rows only: nothing hidden or lifted out of the flow gets a twig of its own.
      // A row that holds a fold of its own under it (data-twig-head) takes its twig at its own first line.
      const next = [...rows.children].filter((row): row is HTMLElement => row instanceof HTMLElement && row.offsetHeight > 1 && !/^(fixed|absolute)$/.test(getComputedStyle(row).position))
        .map((row) => row.offsetTop + ('twigHead' in row.dataset && row.firstElementChild instanceof HTMLElement ? row.firstElementChild.offsetHeight : row.offsetHeight) / 2)
      setMids((before) => (before.join() === next.join() ? before : next))
    }
    measure()
    const watch = new ResizeObserver(measure)
    watch.observe(rows)
    return () => watch.disconnect()
  }, [])
  const twig = (y: number): string => `A ${BEND} ${BEND} 0 0 0 ${TRUNK + BEND} ${y} H ${TIP}`
  const line = { fill: 'none', strokeWidth: 1 } as const
  return (
    <div ref={box} className={`relative ${className ?? ''}`}>
      {children}
      {!bare && mids.length > 0 && (
        <svg aria-hidden className="pointer-events-none absolute inset-0 size-full overflow-visible">
          <motion.path d={`M ${TRUNK} -2 V ${mids[mids.length - 1] - BEND}`} {...line} stroke={QUIET} strokeLinecap="round"
            initial={still ? false : { pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: still ? 0 : 0.2, ease: 'easeOut' }} />
          {mids.map((y, k) => (
            <motion.path key={k} d={`M ${TRUNK} ${y - BEND} ${twig(y)}`} {...line} stroke={QUIET} strokeLinecap="round"
              initial={still ? false : { pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: still ? 0 : 0.2, delay: still ? 0 : 0.05 + k * 0.025, ease: 'easeOut' }} />
          ))}
          {/* From the top every time, so moving between pages, the light runs down the trunk and round. */}
          {mids.map((y, k) => (
            <motion.path key={`lit${k}`} d={`M ${TRUNK} -2 V ${y - BEND} ${twig(y)}`} {...line} stroke="var(--primary)"
              initial={still ? false : { pathLength: 0 }} animate={{ pathLength: k === current ? 1 : 0 }} transition={{ duration: still ? 0 : 0.3, ease: 'easeOut' }} />
          ))}
        </svg>
      )}
    </div>
  )
}
