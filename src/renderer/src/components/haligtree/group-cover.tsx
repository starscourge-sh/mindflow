import { Children, cloneElement, isValidElement, useId, type CSSProperties, type ReactElement, type ReactNode } from 'react'
import { shapes, type shapeTypes } from 'coolshapes-react'
import { NOISE } from './grain'

/**
 * A cover for a deck or a tag with no picture of its own: one large shape and
 * one smaller, from Coolshapes (https://coolshap.es, github.com/realvjy/coolshapes-react
 * v1.0.1; MIT License, Copyright (c) 2024 Coolshapes, used with this notice kept),
 * set cropped off the edges the way a music app's genre tiles are, in the
 * group's own colour on the page's paper (light) or charcoal (dark), with a
 * little grain, and its name small in a corner. Everything is picked from the
 * name, so the same name always gets the same cover and no two names share one.
 *
 * The package draws each shape in its own fixed rainbow gradients, which no
 * theme can tint, so only each shape's outline is read from it (the alpha
 * mask every component draws its shape through) and the colour is the app's.
 */

/** The kinds a cover draws from: every family but the numbers, which would read as a count. */
const KINDS: shapeTypes[] = ['flower', 'star', 'wheel', 'triangle', 'polygon', 'moon', 'ellipse', 'rectangle', 'misc']

type Outline = { id: string; parts: ReactNode }

/** Every element under `node` that `pick` wants, depth first. */
function within(node: ReactNode, pick: (element: ReactElement<{ children?: ReactNode }>) => boolean, found: ReactElement<{ children?: ReactNode }>[] = []): ReactElement<{ children?: ReactNode }>[] {
  Children.forEach(node, (child) => {
    if (!isValidElement<{ children?: ReactNode }>(child)) return
    if (pick(child)) found.push(child)
    within(child.props.children, pick, found)
  })
  return found
}

let outlines: Outline[] | null = null
/** Each shape's outline, as the package draws it (a 200 by 200 box), read once. */
function allOutlines(): Outline[] {
  if (outlines) return outlines
  outlines = KINDS.flatMap((kind) => shapes[kind].map((shape, index) => {
    // A forwardRef component keeps its drawing in `render`; called with no props it gives the shape's tree.
    const tree = (shape as unknown as { render: (props: object, ref: null) => ReactNode }).render({}, null)
    const mask = within(tree, (element) => element.type === 'mask')[0]
    const parts = Children.map(mask?.props.children, (part, at) => (isValidElement(part) ? cloneElement(part, { key: at }) : null))
    return { id: `${kind}-${index + 1}`, parts }
  })).filter((one) => one.parts)
  return outlines
}

/** A number from words, the same each time (FNV-1a), then a run of numbers from it (mulberry32). */
function drawsFrom(words: string): () => number {
  let state = 2166136261
  for (const letter of words) state = Math.imul(state ^ letter.charCodeAt(0), 16777619)
  state >>>= 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let mix = Math.imul(state ^ (state >>> 15), 1 | state)
    mix = (mix + Math.imul(mix ^ (mix >>> 7), 61 | mix)) ^ mix
    return ((mix ^ (mix >>> 14)) >>> 0) / 4294967296
  }
}

type Corner = 'tl' | 'tr' | 'br' | 'bl'
const CORNERS: Corner[] = ['tl', 'tr', 'br', 'bl']

/** The grain, as the image inside the pattern: the same film grain the note covers wear. */
const GRAIN = NOISE.slice(5, -2)

/** Where a cover's two shapes sit and turn, and which they are: what `data-cover` says, so a probe can compare two. */
export function coverOf(name: string, label: Corner | null = 'bl'): { big: Outline; small: Outline; at: Corner; other: Corner; turn: [number, number]; size: [number, number] } {
  const all = allOutlines()
  const next = drawsFrom(name.replace(/^#/, '').toLowerCase())
  const big = all[Math.floor(next() * all.length)]
  let small = all[Math.floor(next() * all.length)]
  if (small.id === big.id) small = all[(all.indexOf(big) + 7) % all.length]
  // The big shape and the small one take two corners the name does not.
  const free = CORNERS.filter((corner) => corner !== label)
  const at = free[Math.floor(next() * free.length)]
  const rest = free.filter((corner) => corner !== at)
  const other = rest[Math.floor(next() * rest.length)]
  return { big, small, at, other, turn: [Math.round(next() * 360), Math.round(next() * 360)], size: [105 + Math.round(next() * 35), 48 + Math.round(next() * 20)] }
}

/** A shape `size`% of the cover's shorter side, its centre near `corner` so a good part of it is cut off by the edge: a wide glass front shows whole shapes, not a slice. */
const placed = (corner: Corner, size: number, turn: number, reach: number): CSSProperties => ({
  position: 'absolute',
  width: `${size}cqmin`,
  aspectRatio: '1',
  [corner[0] === 't' ? 'top' : 'bottom']: `${-size * reach}cqmin`,
  [corner[1] === 'l' ? 'left' : 'right']: `${-size * reach}cqmin`,
  rotate: `${turn}deg`
})

function Shape({ outline, fill, style }: { outline: Outline; fill: [string, string]; style: CSSProperties }): React.JSX.Element {
  const id = useId().replace(/[^\w-]/g, '')
  return (
    <svg viewBox="0 0 200 200" aria-hidden data-shape={outline.id} style={style}>
      <defs>
        <mask id={`${id}m`} maskUnits="userSpaceOnUse" x="0" y="0" width="200" height="200" style={{ maskType: 'alpha' }}>{outline.parts}</mask>
        <linearGradient id={`${id}g`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" style={{ stopColor: fill[0] }} />
          <stop offset="1" style={{ stopColor: fill[1] }} />
        </linearGradient>
        <pattern id={`${id}n`} width="160" height="160" patternUnits="userSpaceOnUse"><image href={GRAIN} width="160" height="160" /></pattern>
      </defs>
      <g mask={`url(#${id}m)`}>
        <rect width="200" height="200" fill={`url(#${id}g)`} />
        <rect width="200" height="200" fill={`url(#${id}n)`} style={{ mixBlendMode: 'overlay', opacity: 0.55 }} />
      </g>
    </svg>
  )
}

/**
 * The cover itself, filling the box it is put in. `tint` is the group's colour
 * (a theme variable); `label` the corner its name sits in, or null for none
 * (where the name is already said beside it).
 */
export function GroupCover({ name, tint, label = 'bl', lone = false, className = '', style }: { name: string; tint: string; label?: Corner | null; /** One shape only, for small covers in a grid of many, where two each read as busy. */ lone?: boolean; className?: string; style?: CSSProperties }): React.JSX.Element {
  const cover = coverOf(name, label)
  // On the page's own paper or charcoal: the big shape in the colour, deepening toward the page; the small one paler.
  const deep = `color-mix(in oklab, ${tint} 88%, var(--foreground))`
  const soft = `color-mix(in oklab, ${tint} 45%, var(--background))`
  return (
    <div aria-hidden data-group-cover={name} data-cover={`${cover.big.id}/${cover.small.id}/${cover.at}${cover.other}/${cover.turn.join('.')}`} data-cover-tint={tint}
      // Placed by its caller when it says so (absolute inset-0 over a card): its own "relative" won over
      // that, it had no height, and its shapes, sized by its height, were drawn at nothing.
      className={`${/\b(absolute|fixed)\b/.test(className) ? '' : 'relative '}overflow-hidden [container-type:size] ${className}`} style={{ background: `color-mix(in oklab, ${tint} 12%, var(--background))`, ...style }}>
      {!lone && <Shape outline={cover.small} fill={[soft, `color-mix(in oklab, ${tint} 70%, var(--background))`]} style={placed(cover.other, cover.size[1], cover.turn[1], 0.22)} />}
      <Shape outline={cover.big} fill={[tint, deep]} style={placed(cover.at, cover.size[0], cover.turn[0], 0.3)} />
      {label && (
        <span data-cover-label className={`absolute max-w-[80%] truncate font-heading text-[clamp(9px,9cqmin,15px)] leading-tight font-semibold ${label[0] === 't' ? 'top-[7cqmin]' : 'bottom-[7cqmin]'} ${label[1] === 'l' ? 'left-[8cqmin]' : 'right-[8cqmin]'}`}
          style={{ color: `color-mix(in oklab, ${tint} 40%, var(--foreground))` }}>{name}</span>
      )}
    </div>
  )
}
