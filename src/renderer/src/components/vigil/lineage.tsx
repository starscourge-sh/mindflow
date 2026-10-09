import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { hierarchy, tree } from 'd3-hierarchy'
import { alive } from '@/components/ui/alive-icon'
import FileDescriptionIcon from '@/components/ui/file-description-icon'
import LibraryIcon from '@/components/ui/library-icon'
import StackIcon from '@/components/ui/stack-icon'
import CheckedIcon from '@/components/ui/checked-icon'
import QuestionMarkIcon from '@/components/ui/question-mark'

import { vigil } from '@/lib/vigil'
import { EASE, spring, WEIGHT } from '@/lib/motion'
import { Island, Prop, Tip } from './ui'

// itshover drawings in lucide's place, moving when their control is pointed at.
const FileText = alive(FileDescriptionIcon)
const Gem = alive(LibraryIcon)
const Inbox = alive(StackIcon)
const ListTodo = alive(CheckedIcon)
const Orbit = alive(QuestionMarkIcon)

const ICON = { capture: Inbox, nugget: Gem, article: FileText, task: ListTodo, question: Orbit }
const NAME: Record<string, string> = { capture: 'capture', nugget: 'idea', article: 'article', task: 'task', question: 'question' }

type Lin = Awaited<ReturnType<typeof vigil.lineage>>

/**
 * Something read for a note, again when you come back to the window and once
 * things settle after a change elsewhere: links change rarely, and each read
 * scans every body for them.
 */
function useRead<T>(id: string, read: (id: string) => Promise<T>): T | null {
  const [value, setValue] = useState<T | null>(null)
  useEffect(() => {
    let live = true
    const load = (): void => void read(id).then((next) => live && setValue(next))
    load()
    // Again once things settle after a change (a capture lifted out of this
    // one, say), but not on every keystroke of an autosave.
    let timer: ReturnType<typeof setTimeout> | undefined
    // Its own autosaves change what it links to, never what links to it.
    const stop = window.api.captures.onChange((what) => {
      if (what?.every((one) => one.id === id)) return
      clearTimeout(timer)
      timer = setTimeout(load, 1500)
    })
    window.addEventListener('focus', load)
    return () => {
      live = false
      clearTimeout(timer)
      stop()
      window.removeEventListener('focus', load)
    }
  }, [id])
  return value
}

type One = Awaited<ReturnType<typeof vigil.lineage>>['became'][number]
const Row = ({ one, onOpen }: { one: One; onOpen?: (type: string, id: string) => void }): React.JSX.Element => (
  <Prop secret={!!one.private} icon={ICON[one.type as keyof typeof ICON] ?? Inbox} onClick={onOpen && (() => onOpen(one.type, one.id))}>
    {one.title || 'Untitled'}
  </Prop>
)


type Kin = One & { kids: Kin[] }
type Family = { me: One; from: Kin[]; became: Kin[]; linked: One[] }

/** How far the tree reaches each way: enough for a todo, its task, and the note after. */
const DEPTH = 3
/** Each kind in the colour its cards have elsewhere. */
const TINT: Record<string, string> = { capture: 'blue', task: 'green', nugget: 'pink', article: 'brown', question: 'gray' }

/** The note, everything it came from and everything it became, each a few steps out. */
async function readFamily(id: string): Promise<Family> {
  const reads = new Map<string, Promise<Lin>>()
  const lineage = (one: string): Promise<Lin> => {
    if (!reads.has(one)) reads.set(one, vigil.lineage(one))
    return reads.get(one)!
  }
  const seen = new Set([id])
  let me: One | undefined
  const grow = async (at: string, side: 'from' | 'became', depth: number): Promise<Kin[]> => {
    const list = (await lineage(at))[side].filter((one) => !seen.has(one.id))
    list.forEach((one) => seen.add(one.id))
    return Promise.all(list.map(async (one) => {
      // This note's own name and kind, as its nearest relatives list it.
      if (!me || depth > 1) {
        const theirs = await lineage(one.id)
        me ??= [...theirs.from, ...theirs.became].find((other) => other.id === id)
      }
      return { ...one, kids: depth > 1 ? await grow(one.id, side, depth - 1) : [] }
    }))
  }
  const own = await lineage(id)
  const [from, became] = await Promise.all([grow(id, 'from', DEPTH), grow(id, 'became', DEPTH)])
  if (!me && (from.length || became.length)) me = { type: 'capture', id, title: (await vigil.mentions(id)).me }
  return { me: me ?? { type: 'capture', id, title: '' }, from, became, linked: own.linked }
}

/**
 * Where a thing came from, what it became, and what links to it. A promoted
 * capture stays as it was written, so its words before the nugget was edited
 * are always one click away, and the nugget one click back. Its family is a
 * small tree, older on the left and newer on the right, with this note lit.
 */
export function Lineage({ id, onOpen }: { id: string; onOpen?: (type: string, id: string) => void }): React.JSX.Element | null {
  const family = useRead(id, readFamily)
  if (!family) return null
  return (
    <>
      {family.from.length + family.became.length > 0 && (
        <Island compact title="Family">
          <FamilyTree key={id} family={family} onOpen={onOpen} />
        </Island>
      )}
      {family.linked.length > 0 && (
        <Island compact title="Linked from">
          {family.linked.map((one) => <Row key={one.id} one={one} onOpen={onOpen} />)}
        </Island>
      )}
    </>
  )
}

// The tree's measures, in px.
const ROW = 30 // from one row's middle to the next
const BOX = 24 // a node's height
const GAP = 26 // between columns, where the links run
const HAND = 7 // the fold dot, this far outside its node
const CHIP = 26 // a node shown as its icon alone
const ROOMY = 90 // the least a node needs to show its title
const ROOMY_ME = 150 // the least for this note to keep its title beside the others'
// The border colour reads as nothing this thin, so a softened muted ink, as the sidebar's branches.
const QUIET = 'color-mix(in oklab, var(--muted-foreground) 45%, transparent)'
// One curve from (0, 0) to (1, 1), stretched by each link's transform, so a link moves and grows as a transform alone.
const CURVE = 'M0,0 C0.5,0 0.5,1 1,1'

type Spot = { x: number; y: number }
type Node = { key: string; parent: string; one: One; side: -1 | 0 | 1; at: Spot; w: number; bare: boolean; hand: Spot | null; hidden: number }
type Link = { key: string; parent: string; from: Spot; to: Spot }

const depthOf = (list: Kin[]): number => (list.length ? 1 + Math.max(...list.map((kin) => depthOf(kin.kids))) : 0)
const countOf = (list: Kin[]): number => list.reduce((sum, kin) => sum + 1 + countOf(kin.kids), 0)

function FamilyTree({ family, onOpen }: { family: Family; onOpen?: (type: string, id: string) => void }): React.JSX.Element {
  const box = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  useLayoutEffect(() => {
    const el = box.current
    if (!el) return
    const measure = (): void => setWidth(el.clientWidth)
    measure()
    const watch = new ResizeObserver(measure)
    watch.observe(el)
    return () => watch.disconnect()
  }, [])
  const [folded, setFolded] = useState<Set<string>>(() => new Set())
  const still = useReducedMotion() || document.documentElement.dataset.motion === 'off'

  const { nodes, links, height } = useMemo(() => {
    const left = depthOf(family.from)
    const cols = left + depthOf(family.became) + 1
    // As wide as the column allows, never sprawling across a wide page. Too
    // narrow for every title, this note (its title is the page's own) is its
    // icon alone, then the older columns too, so the newest keeps its words;
    // an icon alone is named when pointed at.
    const even = (width - GAP * (cols - 1)) / cols
    const rest = (width - CHIP - GAP * (cols - 1)) / Math.max(1, cols - 1)
    const worded = cols - 1 === left ? cols - 2 : cols - 1
    const bareAt = (col: number): boolean => even < ROOMY_ME && (col === left || (rest < ROOMY && col !== worded))
    const bares = Array.from({ length: cols }, (_, col) => bareAt(col))
    const room = (width - GAP * (cols - 1) - bares.filter(Boolean).length * CHIP) / Math.max(1, bares.filter((one) => !one).length)
    const widths = bares.map((one) => (one ? CHIP : Math.max(0, Math.min(200, room))))
    const bare = bares.some(Boolean)
    const ox = bare ? 0 : (width - widths.reduce((sum, w) => sum + w, 0) - (cols - 1) * GAP) / 2
    const colX = (col: number): number => ox + widths.slice(0, col).reduce((sum, w) => sum + w + GAP, 0)
    const keyOf = (side: number, depth: number, id: string): string => (depth ? `${side}:${id}` : 'me')
    const root: Kin = { ...family.me, kids: [] }
    const placed: (Omit<Node, 'at' | 'hand' | 'w' | 'bare'> & { depth: number; row: number; kids: boolean })[] = []
    for (const side of [-1, 1] as const) {
      const list = side < 0 ? family.from : family.became
      const top = hierarchy<Kin>({ ...root, kids: list }, (kin) => (kin.id === root.id || !folded.has(`${side}:${kin.id}`) ? kin.kids : null))
      tree<Kin>().nodeSize([ROW, 1])(top)
      for (const node of top.descendants()) {
        if (!node.depth && side > 0) continue
        placed.push({
          key: keyOf(side, node.depth, node.data.id),
          parent: node.parent ? keyOf(side, node.parent.depth, node.parent.data.id) : '',
          one: node.data,
          side: node.depth ? side : 0,
          depth: node.depth,
          row: node.x ?? 0,
          kids: node.depth > 0 && node.data.kids.length > 0,
          hidden: folded.has(`${side}:${node.data.id}`) ? countOf(node.data.kids) : 0
        })
      }
    }
    const lowest = Math.min(...placed.map((one) => one.row))
    const nodes: Node[] = placed.map((one) => {
      const col = left + one.side * one.depth
      const at = { x: colX(col), y: one.row - lowest }
      const w = widths[col]
      return { ...one, at, w, bare: bares[col], hand: one.kids ? { x: one.side > 0 ? at.x + w + HAND : at.x - HAND, y: at.y + BOX / 2 } : null }
    })
    const byKey = new Map(nodes.map((node) => [node.key, node]))
    const links: Link[] = nodes.filter((node) => node.parent).map((node) => {
      const parent = byKey.get(node.parent)!
      const mid = (spot: Spot): Spot => ({ x: spot.x, y: spot.y + BOX / 2 })
      // From the parent's dot (this note has none: its own edge) to the near edge of the child.
      const from = parent.hand ?? mid({ x: node.side > 0 ? parent.at.x + parent.w : parent.at.x, y: parent.at.y })
      return { key: node.key, parent: node.parent, from, to: mid({ x: node.side > 0 ? node.at.x : node.at.x + node.w, y: node.at.y }) }
    })
    const height = Math.max(...nodes.map((node) => node.at.y)) + BOX
    return { nodes, links, height }
  }, [family, folded, width])

  // Where each node and its dot are now, for those leaving to fold back into.
  const now = new Map(nodes.map((node) => [node.key, node]))
  const move = still ? { duration: 0 } : { duration: 0.24, ease: EASE }
  const fade = { duration: spring.slow.exit.duration, ease: EASE }
  const enter = { x: move, y: move, scaleX: move, scaleY: move, opacity: fade }
  const leave = { ...fade, ...(still ? { x: { duration: 0 }, y: { duration: 0 } } : {}) }
  const toggle = (key: string): void => setFolded((was) => {
    const next = new Set(was)
    if (!next.delete(key)) next.add(key)
    return next
  })

  return (
    <div className="px-2 py-2.5">
      <div ref={box} className="relative" style={{ height }}>
        {width > 0 && (
          <>
            <svg aria-hidden className="pointer-events-none absolute inset-0 size-full overflow-visible">
              <AnimatePresence initial={false} custom={now}>
                {links.map((link) => {
                  const shape = { x: link.from.x, y: link.from.y, scaleX: link.to.x - link.from.x, scaleY: link.to.y - link.from.y || 0.001 }
                  return (
                    <motion.path
                      key={link.key}
                      d={CURVE}
                      fill="none"
                      stroke={QUIET}
                      strokeWidth={1}
                      vectorEffect="non-scaling-stroke"
                      style={{ originX: 0, originY: 0 }}
                      custom={now}
                      variants={{
                        // Grown out of the parent, as the D3 tree's links are.
                        from: still ? { ...shape, opacity: 0 } : { ...shape, scaleX: 0, scaleY: 0, opacity: 0 },
                        here: { ...shape, opacity: 1, transition: enter },
                        gone: (spots: Map<string, Node>) => {
                          const hand = spots.get(link.parent)?.hand
                          return still || !hand ? { opacity: 0, transition: leave } : { x: hand.x, y: hand.y, scaleX: 0, scaleY: 0, opacity: 0, transition: leave }
                        }
                      }}
                      initial="from"
                      animate="here"
                      exit="gone"
                    />
                  )
                })}
              </AnimatePresence>
            </svg>
            <AnimatePresence initial={false} custom={now}>
              {nodes.map((node) => (
                <motion.div
                  key={node.key}
                  className="absolute top-0 left-0"
                  style={{ width: node.w, height: BOX }}
                  custom={now}
                  variants={{
                    from: (spots: Map<string, Node>) => {
                      const parent = spots.get(node.parent)?.at
                      return still || !parent ? { ...node.at, opacity: 0 } : { ...parent, opacity: 0 }
                    },
                    here: { ...node.at, opacity: 1, transition: enter },
                    gone: (spots: Map<string, Node>) => {
                      const parent = spots.get(node.parent)?.at
                      return still || !parent ? { opacity: 0, transition: leave } : { ...parent, opacity: 0, transition: leave }
                    }
                  }}
                  initial="from"
                  animate="here"
                  exit="gone"
                >
                  <Kinfolk node={node} onOpen={onOpen} />
                  {node.hand && <Fold node={node} folded={node.hidden > 0} onToggle={() => toggle(node.key)} still={still} />}
                </motion.div>
              ))}
            </AnimatePresence>
          </>
        )}
      </div>
    </div>
  )
}

/** One of the family: its kind's icon and its title, opening it; this note lit and still. */
function Kinfolk({ node, onOpen }: { node: Node; onOpen?: (type: string, id: string) => void }): React.JSX.Element {
  const Icon = ICON[node.one.type as keyof typeof ICON] ?? Inbox
  const face = (
    <>
      <Icon className="size-3.5 shrink-0" style={{ color: `var(--tt-color-text-${TINT[node.one.type] ?? 'gray'})` }} />
      {!node.bare && <span className={`min-w-0 truncate ${node.one.private ? 'private-text' : ''}`}>{node.one.title || 'Untitled'}</span>}
    </>
  )
  const shape = `flex size-full items-center gap-1.5 rounded-md text-left text-meta ${node.bare ? 'justify-center' : 'px-1.5'}`
  if (node.key === 'me')
    return <div aria-current="page" aria-label={node.bare ? node.one.title || 'Untitled' : undefined} className={`${shape} bg-accent text-foreground ring-1 ring-border`} style={{ fontWeight: WEIGHT.chosen }} data-private={node.one.private ? '' : undefined}>{face}</div>
  return (
    <Tip label={`Open the ${NAME[node.one.type] ?? 'note'}: ${node.one.title || 'Untitled'}`}>
      <motion.button
        type="button"
        whileTap={{ scale: 0.97 }}
        transition={spring.fast}
        data-private={node.one.private ? '' : undefined}
        onClick={onOpen && (() => onOpen(node.one.type, node.one.id))}
        className={`${shape} text-muted-foreground hover:bg-accent hover:text-foreground`}
      >
        {face}
      </motion.button>
    </Tip>
  )
}

/** The dot where a node's branch leaves it: hollow while open, filled while folded away. */
function Fold({ node, folded, onToggle, still }: { node: Node; folded: boolean; onToggle: () => void; still: boolean }): React.JSX.Element {
  const left = node.side > 0 ? `calc(100% + ${HAND - 8}px)` : `${-HAND - 8}px`
  return (
    <Tip label={folded ? `Show ${node.hidden} more` : 'Fold this branch'}>
      <motion.button
        type="button"
        aria-expanded={!folded}
        whileTap={{ scale: 0.97 }}
        transition={spring.fast}
        onClick={onToggle}
        className="group absolute flex size-4 items-center justify-center rounded-full"
        style={{ left, top: BOX / 2 - 8 }}
      >
        <span className="relative size-2 rounded-full border border-muted-foreground/70 bg-background group-hover:border-foreground">
          <motion.span
            className="absolute inset-0 rounded-full bg-muted-foreground group-hover:bg-foreground"
            initial={false}
            animate={{ opacity: folded ? 1 : 0 }}
            transition={still ? { duration: 0 } : spring.fast}
          />
        </span>
      </motion.button>
    </Tip>
  )
}
