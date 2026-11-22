import type { CSSProperties, HTMLAttributes, ReactNode, Ref } from 'react'
import { motion, useTransform, type MotionStyle, type MotionValue } from 'motion/react'
import markGold from '@/assets/mark-gold-leaves.png'
import type { Hue } from '@/lib/books'
import './shelf.css'

/**
 * A hardback in 3D, the one book every place draws: the reader card on the welcome and in Settings (reader-card.tsx),
 * and each book on the shelf at the sidebar foot's menu (books.tsx BookShelf). Built as a clothbound pocket classic is
 * (the user's photos, 22 Nov): the whole case in one woven cloth (shelf.css .mf-cloth), two boards (the cover at the
 * front, the back behind), each with its own thickness at the head, foot and fore-edge, standing a little proud of the
 * cream pages set in between (the squares), a sunken groove at each joint, and the rounded spine round the left with
 * the name blocked in foil. The card is a paper label pasted on the cover. Each face takes the room's light by how it
 * stands to it. Its inks are the `--mf-card-a`, `-b` and `-c` set on it or above it (light to deep).
 */

export type BookSize = { wide: number; high: number; thick: number; board: number; overhang: number }

/**
 * A hue of the theme at a set lightness and strength, so a book is as rich on a dark theme (whose tag colours are
 * pale) as on a light one, and the theme still chooses the hue.
 */
export const inked = (hue: string, light: number, strength: number): string => `oklch(from var(--tt-color-text-${hue}) ${light} ${strength} h)`

/**
 * Each colour's cloth, as OKLCH lightness and strength, the hue the theme's own: deep ones and pale ones, as a real
 * shelf has, every one far enough from its foil (bright gold on the deep, antique bronze on the pale, picked by lightness in
 * shelf.css) to read at 3:1 or more. The deep ones deep enough for pale gold, as a leather binding is.
 */
const CLOTH: Record<Hue, [number, number]> = { blue: [0.45, 0.13], purple: [0.44, 0.14], pink: [0.76, 0.11], red: [0.46, 0.16], orange: [0.74, 0.14], yellow: [0.87, 0.14], green: [0.45, 0.1], gray: [0.71, 0.01] }
/**
 * A book's cloth, the one rule for every place it is drawn (Settings' reader card, the welcome, the sidebar's shelf):
 * the book's own colour, or with none, its reader card's deepest ink (`--mf-card-c`, set on the book with cardInks).
 * The user, 23 Nov: one book wore grey cloth on the shelf and brown in Settings.
 */
export const clothOf = (hue: Hue | null | undefined): string => (hue ? inked(hue, ...CLOTH[hue]) : 'var(--mf-card-c)')

/**
 * Old paper seen edge on: fine leaf lines (vertical at the fore-edge, across at the foot, crossed here so both show),
 * a grain, and a yellowing that deepens toward the outer edges as old books' pages do.
 */
const LEAVES = `url("data:image/svg+xml;utf8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120"><filter id="g"><feTurbulence type="fractalNoise" baseFrequency="1.4" numOctaves="2" stitchTiles="stitch"/><feColorMatrix values="0 0 0 0 0.45  0 0 0 0 0.35  0 0 0 0 0.15  0 0 0 0.55 0"/></filter><rect width="120" height="120" filter="url(#g)"/></svg>')}")`
const OLD_PAGES = [LEAVES, 'radial-gradient(120% 120% at 30% 25%, #f4ecd3, #e8dcb5 70%, #d6c391)'].join(', ')
/** Each leaf's edge, a fine line: running down the fore-edge, across the foot, a little uneven as real pages lie. */
const EDGE_LINES = (way: 'down' | 'across'): string =>
  `repeating-linear-gradient(${way === 'down' ? 90 : 180}deg, rgb(110 85 35 / 0.28) 0 0.6px, transparent 0.6px 1.9px, rgb(110 85 35 / 0.14) 1.9px 2.4px, transparent 2.4px 3.4px)`
/** The serif a spine's name is blocked in, on the Settings book and on the shelf's: foil reads as lettering in it. */
const SPINE_SERIF = "'Fraunces Variable', Georgia, serif"
/** The tracking of a spine's name, in ems, as foil blocking spaces small capitals. */
const SPINE_TRACK = 0.06
/** Lines of a spine's name, set close as a spine sets two lines. */
const SPINE_LEAD = 1.05
if (typeof document !== 'undefined') void document.fonts?.load(`700 12px ${SPINE_SERIF}`).catch(() => undefined)
const spineFits = new Map<string, { size: number; lines: number }>()
let ruler: CanvasRenderingContext2D | null | undefined
/**
 * A spine's name set whole, never cut (the user, 22 Nov: "gets cut off with an ellipsis which breaks the illusion of a
 * real book"): the largest size up to `most` at which it runs on one line along `length`, down to 9px; else on two
 * lines across the spine (`across` wide), down to 6.5px, as a real spine sets a long title; else three or more, smaller
 * still. Measured once per name on a canvas (no layout, nothing per render), with a little room spare for the page's own
 * shaping, and kept only once the serif is in, so a name measured in the fallback is measured again.
 */
export function spineType(name: string, length: number, across: number, most: number): { size: number; lines: number } {
  const key = `${name}\n${length}\n${across}\n${most}`
  const known = spineFits.get(key)
  if (known) return known
  ruler ??= typeof document === 'undefined' ? null : document.createElement('canvas').getContext('2d')
  if (!ruler) return { size: most, lines: 1 }
  const pen = ruler
  const words = name.trim().split(/\s+/)
  const room = length * 0.94
  const fits = (size: number, lines: number): boolean => {
    pen.font = `700 ${size}px ${SPINE_SERIF}`
    pen.letterSpacing = `${size * SPINE_TRACK}px`
    const space = pen.measureText(' ').width
    let count = 1
    let line = 0
    for (const word of words) {
      const wide = pen.measureText(word).width
      if (wide > room) return false
      line = line ? line + space + wide : wide
      if (line > room) (count++, (line = wide))
    }
    return count <= lines
  }
  let found = { size: 3, lines: 6 }
  search: for (let lines = 1; lines <= 6; lines++) {
    const floor = lines === 1 ? 9 : lines === 2 ? 6.5 : 3
    for (let size = Math.min(most, Math.floor((across / (lines * SPINE_LEAD)) * 4) / 4); size >= floor; size -= 0.25) {
      if (fits(size, lines)) {
        found = { size, lines }
        break search
      }
    }
  }
  if (document.fonts?.check(`700 12px ${SPINE_SERIF}`) !== false) spineFits.set(key, found)
  return found
}
/** The cover's corners: square at the spine, a little round at the fore-edge. */
export const BOOK_CORNERS = '2px 5px 5px 2px'

/**
 * The hinge groove (a French joint), as on the user's clothbound pocket classic (22 Nov: "notice how on the spine, on
 * both sides, there is a valley?"): where the spine meets each board the cloth is pressed down into a narrow channel
 * that runs the full height, about 3.5% of the cover's width (2 to 3 mm), so the board reads as stepping in from the
 * spine. On a board, from the spine: the valley, darkest a little past its middle, then the board's lip catching the
 * light. At the shelf's size 4px: a dark line of 2.75px and a lip of 1.25px.
 */
const grooveOf = (wide: number): number => Math.max(4, Math.round(wide * 0.036))
const grooveOn = (wide: number, way: 'right' | 'left'): { background: string; lip: number } => {
  const lip = wide >= 7 ? 2 : 1.25
  const floor = wide - lip
  return {
    lip,
    background: `linear-gradient(to ${way}, rgb(0 0 0 / 0.3) 0, rgb(0 0 0 / 0.5) ${floor * 0.25}px, rgb(0 0 0 / 0.62) ${floor * 0.55}px, rgb(0 0 0 / 0.45) ${floor - 0.4}px, rgb(255 255 255 / 0.34) ${floor + 0.3}px, rgb(255 255 255 / 0.12) ${wide - 0.4}px, transparent ${wide}px)`
  }
}
/**
 * The same valley seen from the spine, at each of its edges: the board's edge as a lit lip at the very edge, then the
 * channel, then the spine's rounded back rising out of it.
 */
const jointOn = (wide: number, way: 'right' | 'left'): { background: string; lip: number } => {
  const lip = wide >= 6 ? 1.5 : 1.25
  return {
    lip,
    background: `linear-gradient(to ${way}, rgb(255 255 255 / 0.4) 0, rgb(255 255 255 / 0.18) ${lip - 0.35}px, rgb(0 0 0 / 0.55) ${lip + 0.3}px, rgb(0 0 0 / 0.62) ${(lip + wide) / 2}px, rgb(0 0 0 / 0.42) ${wide - 0.6}px, transparent ${wide}px)`
  }
}
/**
 * The cover's printed card, pasted on the cloth as a label is: inset from the board's edges by about 3.4% of its width
 * (4px on the shelf, 9 in Settings), and from the groove by as much again, so the cloth shows all round it.
 */
export function labelOf({ wide, high }: Pick<BookSize, 'wide' | 'high'>): { top: number; left: number; wide: number; high: number } {
  const edge = Math.max(4, Math.round(wide * 0.034))
  const left = grooveOf(wide) + edge
  return { top: edge, left, wide: wide - left - edge, high: high - 2 * edge }
}
/** The cloth turned over each board's edges, seen on its face: a hair lighter at the head and fore-edge, darker at the foot. */
const TURNED_OVER = (fore: 'right' | 'left'): string =>
  `inset ${fore === 'right' ? -1 : 1}px 0 0 rgb(255 255 255 / 0.14), inset 0 1px 0 rgb(255 255 255 / 0.12), inset 0 -1px 0 rgb(0 0 0 / 0.2)`
/** A paper label's edge on cloth: a hairline where it is cut, and the least shadow, as it lies flat, pasted down. */
const LABEL_EDGE = '0 0 0 0.5px rgb(50 30 10 / 0.42), 0 0.5px 1.5px rgb(0 0 0 / 0.3)'

/**
 * Where the light comes from: above, a little to the right and in front, as a window over your shoulder. A unit
 * vector in the page's own terms: x to the right, y down, z toward you.
 */
const LIGHT = ((x: number, y: number, z: number) => [x, y, z].map((one) => one / Math.hypot(x, y, z)))(0.35, -0.5, 0.8)
/** Halfway between the light and your eye: a face turned along it shines. */
const HALF = ((x: number, y: number, z: number) => [x, y, z].map((one) => one / Math.hypot(x, y, z)))(LIGHT[0], LIGHT[1], LIGHT[2] + 1)
type Normal = [number, number, number]
/** A face's outward direction once the book is turned: tipped by `pitch`, then turned by `turn` (rotateX, then rotateY, as motion writes them). */
function facing([x, y, z]: Normal, pitch: number, turn: number): Normal {
  const across = (turn * Math.PI) / 180
  const tip = (pitch * Math.PI) / 180
  const x1 = Math.cos(across) * x + Math.sin(across) * z
  const z1 = -Math.sin(across) * x + Math.cos(across) * z
  return [x1, Math.cos(tip) * y - Math.sin(tip) * z1, Math.sin(tip) * y + Math.cos(tip) * z1]
}
/** How bright a face is: a little light from the room everywhere, and the rest by how square it stands to the light. */
const toneOf = (normal: Normal): number => 0.5 + 0.5 * Math.max(0, normal[0] * LIGHT[0] + normal[1] * LIGHT[1] + normal[2] * LIGHT[2])
/** The cover facing you sets the scale: as bright as that, a face is shown as it is printed. */
const FACING = toneOf([0, 0, 1])

type Pose = { pitch: MotionValue<number>; turn: MotionValue<number>; lit: MotionValue<number> }
/** A book held back on the shelf (books.tsx ShelfBook): a dark veil over its spine and over its cover, 0 none. */
export type Veil = { spine: MotionValue<number>; cover: MotionValue<number> }

/**
 * One face's light laid over it as the book turns: a black veil by how much darker than the cover facing you it is, a
 * white one by how much brighter, and with `gloss` the shine where it catches the light square on (Blinn's half-way
 * rule), carried across the face as it turns, the way a laminated cover's gloss runs. All motion values, read off the
 * turn each frame, so the light moves without React drawing anything.
 */
function Lit({ normal, pose: { pitch, turn, lit }, gloss = 0, face, veil }: { normal: Normal; pose: Pose; gloss?: number; face: string; veil?: MotionValue<number> }): React.JSX.Element {
  const seen = useTransform(() => facing(normal, pitch.get(), turn.get()))
  const shade = useTransform(() => lit.get() * Math.min(0.4, Math.max(0, 1 - toneOf(seen.get()) / FACING)))
  const glint = useTransform(() => lit.get() * Math.min(0.2, Math.max(0, toneOf(seen.get()) / FACING - 1)))
  const opacity = useTransform(() => {
    const [x, y, z] = seen.get()
    return gloss * lit.get() * Math.max(0, x * HALF[0] + y * HALF[1] + z * HALF[2]) ** 24
  })
  const x = useTransform(() => `${(seen.get()[0] - HALF[0]) * -180}%`)
  return (
    <>
      <motion.span aria-hidden data-reader-light={face} className="pointer-events-none absolute inset-0 rounded-[inherit] bg-[#1c140a]" style={{ opacity: shade }} />
      <motion.span aria-hidden className="pointer-events-none absolute inset-0 rounded-[inherit] bg-white" style={{ opacity: glint }} />
      {gloss > 0 && (
        <span aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]">
          <motion.span data-reader-shine={face} className="absolute inset-y-0 -left-full w-[300%] mix-blend-soft-light"
            style={{ x, opacity, background: 'linear-gradient(100deg, transparent 38%, rgb(255 255 255 / 0.55) 47%, rgb(255 255 255 / 0.9) 50%, rgb(255 255 255 / 0.55) 53%, transparent 62%)' }} />
        </span>
      )}
      {/* Last, over the shine and the words too: a book held back on the shelf, a little darker, as a whole. */}
      {veil && <motion.span aria-hidden data-reader-veil={face} className="pointer-events-none absolute inset-0 rounded-[inherit] bg-black" style={{ opacity: veil }} />}
    </>
  )
}

/**
 * Where the foil on a rounded spine catches the light, as a share of the spine's width from its back joint (0) to its
 * front (1): the point whose face turns half way between the light and your eye (`HALF`), the spine's back taken as
 * rounded through 60 degrees each way from its middle. It moves toward the front joint as the cover comes round.
 */
const GLINT = (Math.atan2(HALF[0], HALF[2]) * 180) / Math.PI
const glintAt = (turn: number): string => String(Math.min(1.3, Math.max(-0.3, (1 + (GLINT + 90 - turn) / 60) / 2)))

export function BookBox({ size: { wide, high, thick, board, overhang }, pitch, turn, lit, scale, perspective, name, cloth: clothColor, edges = true, ribbon = false, shelf = false, veil, cover, label, children, className = '', style }: {
  size: BookSize
  /** Tipped back (rotateX) and turned (rotateY, 90 the spine to you, 0 the cover), in degrees. */
  pitch: MotionValue<number>
  turn: MotionValue<number>
  /** 1 lit by the room, 0 shown as printed. */
  lit: MotionValue<number>
  scale?: MotionValue<number>
  perspective: number
  /** Blocked down the spine. */
  name: string
  /** The back, the pages, the head and foot and the boards' edges: off where the book only ever turns between its spine and its cover (no hooks for faces never seen). */
  edges?: boolean
  /** A ribbon to keep your place, hanging out at the foot. */
  ribbon?: boolean
  /**
   * On the shelf (books.tsx BookShelf): its name up the spine from the foot, as a row of spines reads. Off (Settings):
   * its name down the spine.
   */
  shelf?: boolean
  /** The cloth's colour (clothOf): the same for one book wherever it is drawn. */
  cloth: string
  /** On the shelf, a book not pulled out: its spine and its cover dimmed, each by its own amount. */
  veil?: Veil
  /** The cover's own element: its ref and data. */
  cover?: HTMLAttributes<HTMLDivElement> & { ref?: Ref<HTMLDivElement> } & { [data: `data-${string}`]: string }
  /** The paper label pasted on the cover, that the card is printed on: its ref and its layout. */
  label?: HTMLAttributes<HTMLDivElement> & { ref?: Ref<HTMLDivElement> }
  /** What is printed on the cover's label. */
  children?: ReactNode
  className?: string
  style?: CSSProperties
}): React.JSX.Element {
  const pose = { pitch, turn, lit }
  const groove = grooveOf(wide)
  const front = grooveOn(groove, 'right')
  const back = grooveOn(groove, 'left')
  // The valley seen from the spine at each joint, and the spine's round back between them.
  const joint = Math.round(thick * 0.2)
  const paper = labelOf({ wide, high })
  // The foil rules on the spine, set in from the head and foot as far as the book is tall allows.
  const rule = Math.max(5, Math.round(high * 0.048))
  // The spine's words only while the spine stands toward you: gone before the cover comes round, so none ever shows at
  // the cover's edge of a book turned out (21 Nov: the spine's name, squeezed thin, read as a ghost down the cover).
  const words = useTransform(turn, (at) => Math.min(1, Math.max(0, (Math.sin((at * Math.PI) / 180) - 0.55) / 0.3)))
  // The foil's bright line, carried across the spine as it turns (shelf.css .mf-book-spine-title).
  const glint = useTransform(turn, glintAt)
  // The name's room along the spine, between the rules, and across it, between the valleys; the size and lines it is set in there, whole.
  const along = high - 2 * (rule + (shelf ? 8 : 9))
  const type = spineType(name, along, thick - 2 * joint + 2, shelf ? 12 : 11)
  const set = { maxHeight: along, fontSize: type.size, lineHeight: SPINE_LEAD, whiteSpace: type.lines > 1 ? 'normal' : 'nowrap', '--mf-foil-at': glint } as unknown as MotionStyle
  // Its cloth, one colour wherever the book is drawn; the weave finer on the larger book, as the same linen is.
  const cloth = { '--mf-cloth': clothColor, '--mf-weave': shelf ? '6px' : '4px' } as CSSProperties
  // A board's edge, the cloth turned over it: a little lighter than the board's face, and rounded, so lit along its middle.
  const edgeOf = (way: 'right' | 'bottom'): string => `linear-gradient(to ${way}, rgb(0 0 0 / 0.3), rgb(255 255 255 / 0.18) 50%, rgb(0 0 0 / 0.3)), oklch(from var(--mf-cloth) calc(l + 0.06) c h)`
  return (
    <motion.div className={`${className || 'relative'} mf-book-case [transform-style:preserve-3d]`} style={{ width: wide, height: high, rotateX: pitch, rotateY: turn, scale, transformPerspective: perspective, ...cloth, ...style }}>
      {edges && (
        <>
          {/* The back board: the same cloth, the press's mark small in its middle in foil, and its own groove at the spine. */}
          <div aria-hidden data-reader-back className="mf-cloth absolute inset-0 flex flex-col items-center justify-center gap-1 [backface-visibility:hidden]" style={{ transform: `rotateY(180deg) translateZ(${thick / 2}px)`, borderRadius: '5px 2px 2px 5px', boxShadow: TURNED_OVER('left'), color: 'var(--mf-foil-mid)' }}>
            <img src={markGold} alt="" draggable={false} className="size-9 opacity-90" />
            <span className="text-[0.5rem] font-semibold tracking-[0.18em] uppercase" style={{ fontFamily: SPINE_SERIF }}>Haligtree</span>
            <span aria-hidden data-hinge-groove="back" data-lip={back.lip} className="pointer-events-none absolute inset-y-0 right-0" style={{ width: groove, background: back.background }} />
            <Lit normal={[0, 0, -1]} pose={pose} gloss={0.3} face="back" />
          </div>
          {/* The page block, set in from the boards' edges (the squares), its leaves a fine line each and shadowed where the boards close over them. */}
          <div aria-hidden data-reader-pages className="absolute [backface-visibility:hidden]"
            style={{ top: overhang, left: (wide - (thick - 2 * board)) / 2, width: thick - 2 * board, height: high - 2 * overhang, transform: `rotateY(90deg) translateZ(${wide / 2 - overhang}px)`, background: `linear-gradient(to right, rgb(60 40 10 / 0.35), transparent 22%, transparent 80%, rgb(60 40 10 / 0.3)), ${EDGE_LINES('down')}, ${OLD_PAGES}` }}>
            <Lit normal={[1, 0, 0]} pose={pose} face="fore" />
          </div>
          {[-1, 1].map((down) => (
            <div key={down} aria-hidden className="absolute [backface-visibility:hidden]"
              style={{ left: 2, top: (high - (thick - 2 * board)) / 2, height: thick - 2 * board, width: wide - 2 - overhang, transform: `rotateX(${-90 * down}deg) translateZ(${high / 2 - overhang}px)`, background: `linear-gradient(to bottom, rgb(60 40 10 / 0.35), transparent 22%, transparent 80%, rgb(60 40 10 / 0.3)), ${EDGE_LINES('across')}, ${OLD_PAGES}` }}>
              {/* The headband (and tailband): a little coloured thread where the pages meet the spine. */}
              <span className="absolute inset-y-[2px] left-0 w-[5px] rounded-r-[1px] bg-[repeating-linear-gradient(to_bottom,var(--mf-card-a)_0_1.5px,var(--mf-card-b)_1.5px_3px)]" />
              <Lit normal={[0, down, 0]} pose={pose} face={down > 0 ? 'foot' : 'head'} />
            </div>
          ))}
          {/* Each board's own edge, cloth turned over a board: at the fore-edge, the head and the foot of each. */}
          {[1, -1].map((side) => [
            <div key={`fore${side}`} aria-hidden data-reader-board className="absolute top-0 h-full rounded-[1px] [backface-visibility:hidden]"
              style={{ left: (wide - board) / 2, width: board, transform: `translateZ(${side * (thick / 2 - board / 2)}px) rotateY(90deg) translateZ(${wide / 2}px)`, background: edgeOf('right') }}>
              <Lit normal={[1, 0, 0]} pose={pose} face="board" />
            </div>,
            ...[-1, 1].map((down) => (
              <div key={`${down}${side}`} aria-hidden className="absolute left-[2px] rounded-[1px] [backface-visibility:hidden]"
                style={{ top: (high - board) / 2, height: board, width: wide - 2, transform: `translateZ(${side * (thick / 2 - board / 2)}px) rotateX(${-90 * down}deg) translateZ(${high / 2}px)`, background: edgeOf('bottom') }}>
                <Lit normal={[0, down, 0]} pose={pose} face="board" />
              </div>
            ))
          ])}
        </>
      )}
      {/* The spine, rounded, the same cloth as the boards: lit in a band down its middle and falling into the valley at
          each joint, its head and tail caps domed a little, its name blocked in foil between two foil rules. */}
      <div aria-hidden data-reader-spine-face className="mf-book-spine absolute top-0 flex h-full items-center justify-center overflow-hidden [backface-visibility:hidden]"
        style={{ left: (wide - thick) / 2, width: thick, transform: `rotateY(-90deg) translateZ(${wide / 2}px)`, borderRadius: `${Math.round(thick * 0.25)}px / ${shelf ? 2 : 3}px` }}>
        {(['back', 'front'] as const).map((side) => {
          const valley = jointOn(joint, side === 'back' ? 'right' : 'left')
          return <span key={side} aria-hidden data-joint={side} data-lip={valley.lip} className="pointer-events-none absolute inset-y-0" style={{ [side === 'back' ? 'left' : 'right']: 0, width: joint, background: valley.background }} />
        })}
        <span className="mf-book-spine-rule" style={{ top: rule, insetInline: joint }} />
        <span className="mf-book-spine-rule" style={{ bottom: rule, insetInline: joint }} />
        {/* Its name whole between the rules, in foil pressed into the cloth: the foil over its own impression. Up from
            the foot on the shelf, as a row of spines reads; down from the head in Settings. */}
        <motion.span data-spine-words data-up={shelf || undefined} className="mf-book-spine-words" style={{ ...set, opacity: words }}>
          <span aria-hidden className="mf-book-spine-deboss">{name}</span>
          <span data-spine-title className="mf-book-spine-title">{name}</span>
        </motion.span>
        <Lit normal={[-1, 0, 0]} pose={pose} gloss={shelf ? 0.5 : 0.8} face="spine" veil={veil?.spine} />
      </div>
      {ribbon && (
        // Laid in at the head and hanging out at the foot between the pages.
        <div aria-hidden data-reader-ribbon className="absolute w-[9px]"
          style={{ left: wide * 0.704, top: high - 12, height: 50, transform: 'translateZ(2px) rotate(4deg)', transformOrigin: 'top', clipPath: 'polygon(0 0, 100% 0, 100% 100%, 50% 88%, 0 100%)', background: 'linear-gradient(to right, rgb(0 0 0 / 0.3), transparent 30%, rgb(255 255 255 / 0.18) 50%, transparent 70%, rgb(0 0 0 / 0.3)), repeating-linear-gradient(to bottom, rgb(0 0 0 / 0.12) 0 1px, transparent 1px 2px), #7d1d22' }}>
          <Lit normal={[0, 0, 1]} pose={pose} face="ribbon" />
        </div>
      )}
      {/* The cover: the same cloth as the spine, its groove at the spine, and the card printed on a cream paper label
          pasted on it, crisp, its words in the book's own ink in every theme, the cloth showing all round it. */}
      <div {...cover} data-book-cover className={`mf-cloth absolute inset-0 [backface-visibility:hidden] ${cover?.className ?? ''}`}
        style={{ transform: `translateZ(${thick / 2}px)`, borderRadius: BOOK_CORNERS, boxShadow: TURNED_OVER('right'), ...cover?.style }}>
        <span aria-hidden data-hinge-groove="front" data-lip={front.lip} className="pointer-events-none absolute inset-y-0 left-0" style={{ width: groove, background: front.background }} />
        <div {...label} data-cover-label className={`absolute overflow-hidden rounded-[1.5px] bg-[#fffbea] ${label?.className ?? ''}`}
          style={{ top: paper.top, left: paper.left, width: paper.wide, height: paper.high, boxShadow: LABEL_EDGE, color: 'var(--mf-card-c)', ...label?.style }}>
          {children}
        </div>
        {/* And the room's light on the cover as it turns: darker turned away, and the soft sheen cloth has running across it. */}
        <Lit normal={[0, 0, 1]} pose={pose} gloss={0.3} face="front" veil={veil?.cover} />
      </div>
    </motion.div>
  )
}
