import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { EASE, byKeys } from '@/lib/motion'

// Drawn in the list's own left padding, so no row moves: the trunk a few px
// left of the rows' edge, each branch curving off it and ending a pixel short of its row, so a lit row's highlight
// never sits over the line (it ran 5px under it).
const TRUNK = -4.5
const BEND = 3.5
const TIP = -1
// The border colour reads as nothing this thin, so a softened muted ink instead.
// The text's own colour, faded: so the lines show on the page, on the dark frame and on any theme alike (a fixed
// grey from the page went missing on the dark frame).
const QUIET = 'color-mix(in oklab, currentColor 30%, transparent)'

/** An open group's rows hung off a thin trunk from its heading, a curved branch
 *  to each; given `current`, the way down to that row is lit, and moves with you (a page's contents). The sidebar
 *  gives none: its lit row's own highlight says where you are, and every line there stays the one quiet grey (the
 *  user, 20 Nov: one folder's line in blue beside grey ones).
 *  Bare, as on the icon rail, just the rows. */
export function Branches({ current = -1, bare, rows: deep, className, children }: { current?: number; bare?: boolean; /** Where the rows are, when they sit deeper than its own children (a list that drags); each twig meets the row's first line. */ rows?: string; className?: string; children: ReactNode }): React.JSX.Element {
  const box = useRef<HTMLDivElement>(null)
  // Where each row's middle sits, read off the rows themselves, since their heights differ.
  const [mids, setMids] = useState<number[]>([])
  const still = useReducedMotion()
  useLayoutEffect(() => {
    const rows = box.current
    if (!rows) return
    const measure = (): void => {
      // Rows only: nothing hidden or lifted out of the flow gets a twig of its own, nor a row's own
      // branches under it (data-no-twig: a folder's subfolders, hung off a trunk of their own).
      const top = rows.getBoundingClientRect().top
      const next = deep
        ? [...rows.querySelectorAll<HTMLElement>(deep)].filter((row) => row.offsetHeight > 1).map((row) => {
          const first = row.querySelector<HTMLElement>('[data-side-row]') ?? row
          const r = first.getBoundingClientRect()
          return Math.round(r.top - top + r.height / 2)
        })
        : [...rows.children].filter((row): row is HTMLElement => row instanceof HTMLElement && row.offsetHeight > 1 && !row.hasAttribute('data-no-twig') && !/^(fixed|absolute)$/.test(getComputedStyle(row).position)).map((row) => row.offsetTop + (row.dataset.twigTop ? Number(row.dataset.twigTop) : row.offsetHeight / 2))
      setMids((before) => (before.join() === next.join() ? before : next))
    }
    // Read once laid out, never as the list mounts: the size watch tells of it at its first layout, before that
    // frame is painted, when where the rows sit costs nothing to ask. Read at once, it laid the half-built page
    // out there and then (a second pane opening spent a quarter of a second on it).
    const watch = new ResizeObserver(measure)
    watch.observe(rows)
    // A row dragged out and back in can leave the list the same height, which
    // a size watch never hears: the twigs stayed where the rows had been.
    // Rows coming, going or being lifted out and set down are heard here, and read once at the next frame for them all.
    let frame = 0
    const moved = new MutationObserver(() => void (frame ||= requestAnimationFrame(() => ((frame = 0), measure()))))
    moved.observe(rows, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class'] })
    return () => (watch.disconnect(), moved.disconnect(), cancelAnimationFrame(frame))
  }, [])
  const twig = (y: number): string => `A ${BEND} ${BEND} 0 0 0 ${TRUNK + BEND} ${y} H ${TIP}`
  const line = { fill: 'none', strokeWidth: 1 } as const
  return (
    <div ref={box} className={`relative ${className ?? ''}`}>
      {children}
      {!bare && mids.length > 0 && (
        <svg aria-hidden className="pointer-events-none absolute inset-0 size-full overflow-visible">
          <motion.path d={`M ${TRUNK} -2 V ${mids[mids.length - 1] - BEND}`} {...line} stroke={QUIET} strokeLinecap="round"
            initial={still ? false : { pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: still ? 0 : 0.2, ease: EASE }} />
          {mids.map((y, k) => (
            <motion.path key={k} d={`M ${TRUNK} ${y - BEND} ${twig(y)}`} {...line} stroke={QUIET} strokeLinecap="round"
              initial={still ? false : { pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: still ? 0 : 0.2, delay: still ? 0 : 0.05 + k * 0.025, ease: EASE }} />
          ))}
          {/* From the top every time, so moving between pages, the light runs down
              the trunk and round; moved by a key (G and a letter), it is there at once. */}
          {current >= 0 && mids.map((y, k) => (
            <motion.path key={`lit${k}`} d={`M ${TRUNK} -2 V ${y - BEND} ${twig(y)}`} {...line} stroke="var(--primary)"
              initial={still ? false : { pathLength: 0 }} animate={{ pathLength: k === current ? 1 : 0 }} transition={{ duration: still || byKeys() ? 0 : 0.2, ease: EASE }} />
          ))}
        </svg>
      )}
    </div>
  )
}

/** An entry of a list that nests, with the entries under it; `at` is its place in the flat list. */
export type TreeNode<T> = { at: number; item: T; kids: TreeNode<T>[] }

/** A flat list, each entry with its depth (or heading level), back into a tree: an entry holds every deeper one after it. */
export function treeOf<T>(items: T[], depth: (item: T) => number): TreeNode<T>[] {
  const top: TreeNode<T>[] = []
  const path: TreeNode<T>[] = []
  items.forEach((item, at) => {
    const node: TreeNode<T> = { at, item, kids: [] }
    while (path.length && depth(path[path.length - 1].item) >= depth(item)) path.pop()
    ;(path.length ? path[path.length - 1].kids : top).push(node)
    path.push(node)
  })
  return top
}

const holds = <T,>(node: TreeNode<T>, at: number): boolean => node.at === at || node.kids.some((one) => holds(one, at))

/**
 * A whole tree drawn the one way the app draws nesting: each level its own
 * Branches, stepped in under the row above it, the way down to the entry at
 * `here` lit. `open` says whether an entry's own are showing (all, if not given).
 */
export function Tree<T>({ nodes, here, row, open, className }: { nodes: TreeNode<T>[]; here: number; row: (node: TreeNode<T>) => ReactNode; open?: (node: TreeNode<T>) => boolean; className?: string }): React.JSX.Element {
  return (
    <Branches current={nodes.findIndex((one) => holds(one, here))} className={className}>
      {nodes.flatMap((node) => [
        row(node),
        node.kids.length > 0 && (open?.(node) ?? true) && (
          <div key={`${node.at}:in`} data-no-twig="">
            <Tree nodes={node.kids} here={here} row={row} open={open} className={className} />
          </div>
        )
      ])}
    </Branches>
  )
}
