import type { CSSProperties, HTMLAttributes, ReactNode, Ref } from 'react'
import { motion, useTransform, type MotionValue } from 'motion/react'
import markGold from '@/assets/mark-gold-leaves.png'

/**
 * A hardback in 3D, the one book every place draws: the reader card on the welcome and in Settings (reader-card.tsx),
 * and each book on the shelf at the sidebar foot's menu (books.tsx BookShelf). Built as a hardback is: two boards
 * (the cover at the front, the back behind), each with its own thickness at the head, foot and fore-edge, standing a
 * little proud of the old yellowed pages set in between, and the spine round the left with the name blocked down it in
 * gold. Each face takes the room's light by how it stands to it. Its inks are the `--mf-card-a`, `-b` and `-c` set on
 * it or above it (light to deep): the spine and the cover's words wear the deepest.
 */

export type BookSize = { wide: number; high: number; thick: number; board: number; overhang: number }

/**
 * A hue of the theme at a set lightness and strength, so a book is as rich on a dark theme (whose tag colours are
 * pale) as on a light one, and the theme still chooses the hue.
 */
export const inked = (hue: string, light: number, strength: number): string => `oklch(from var(--tt-color-text-${hue}) ${light} ${strength} h)`

/**
 * Old paper seen edge on: fine leaf lines (vertical at the fore-edge, across at the foot, crossed here so both show),
 * a grain, and a yellowing that deepens toward the outer edges as old books' pages do.
 */
const LEAVES = `url("data:image/svg+xml;utf8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120"><filter id="g"><feTurbulence type="fractalNoise" baseFrequency="1.4" numOctaves="2" stitchTiles="stitch"/><feColorMatrix values="0 0 0 0 0.45  0 0 0 0 0.35  0 0 0 0 0.15  0 0 0 0.55 0"/></filter><rect width="120" height="120" filter="url(#g)"/></svg>')}")`
const OLD_PAGES = [LEAVES, 'radial-gradient(120% 120% at 30% 25%, #f1e6c4, #e2d09c 70%, #cdb377)'].join(', ')
/** Each leaf's edge, a fine line: running down the fore-edge, across the foot, a little uneven as real pages lie. */
const EDGE_LINES = (way: 'down' | 'across'): string =>
  `repeating-linear-gradient(${way === 'down' ? 90 : 180}deg, rgb(110 85 35 / 0.28) 0 0.6px, transparent 0.6px 1.9px, rgb(110 85 35 / 0.14) 1.9px 2.4px, transparent 2.4px 3.4px)`
/** The cover's cloth: fine grey noise, laid on with multiply so the cream reads as a bound cover, not a screen. */
export const CLOTH = `url("data:image/svg+xml;utf8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160"><filter id="n"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch"/><feColorMatrix values="0 0 0 0 0.5  0 0 0 0 0.45  0 0 0 0 0.35  0 0 0 0.9 0"/></filter><rect width="160" height="160" filter="url(#n)"/></svg>')}")`
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
/** The hinge: the cloth pressed into a groove a little in from the spine, shadowed on its spine side, catching the light on the other. */
const HINGE = 'linear-gradient(to right,rgb(0 0 0/0.16),rgb(0 0 0/0.05) 35%,rgb(255 255 255/0.12) 55%,rgb(0 0 0/0.04) 64%,rgb(0 0 0/0.24) 70%,rgb(0 0 0/0.1) 76%,rgb(255 255 255/0.5) 82%,rgb(255 255 255/0.12) 90%,transparent)'

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

export function BookBox({ size: { wide, high, thick, board, overhang }, pitch, turn, lit, scale, perspective, name, edges = true, ribbon = false, shelf = false, veil, cover, children, className = '', style }: {
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
   * On the shelf (books.tsx BookShelf): the same hardback, quarter bound: a woven cloth spine in the book's own colour
   * (`--mf-spine-bg`), rounded, with head and tail caps and foil rules, its name up it from the foot whole in the serif
   * in foil, bright gold on a deep spine and antique bronze on a pale one (shelf.css); the cover printed paper, its card
   * crisp. Off: the spine in the card's deepest ink, its name in the serif in gold foil.
   */
  shelf?: boolean
  /** On the shelf, a book not pulled out: its spine and its cover dimmed, each by its own amount. */
  veil?: Veil
  /** The cover's own element: its ref, data and padding. */
  cover?: HTMLAttributes<HTMLDivElement> & { ref?: Ref<HTMLDivElement> } & { [data: `data-${string}`]: string }
  /** What is printed on the cover. */
  children?: ReactNode
  className?: string
  style?: CSSProperties
}): React.JSX.Element {
  const pose = { pitch, turn, lit }
  const hinge = Math.round(wide * 0.072)
  // The gold rules on the spine, set in from the head and foot as far as the book is tall allows.
  const rule = Math.max(5, Math.round(high * 0.048))
  // The spine's words only while the spine stands toward you: gone before the cover comes round, so none ever shows at
  // the cover's edge of a book turned out (21 Nov: the spine's name, squeezed thin, read as a ghost down the cover).
  const words = useTransform(turn, (at) => Math.min(1, Math.max(0, (Math.sin((at * Math.PI) / 180) - 0.55) / 0.3)))
  // The name's room along the spine, between the rules, and the size and lines it is set in there, whole.
  const along = high - 2 * (rule + (shelf ? 8 : 9))
  const type = spineType(name, along, thick - (shelf ? 5 : 8), shelf ? 12 : 11)
  const set = { maxHeight: along, fontSize: type.size, lineHeight: SPINE_LEAD, whiteSpace: type.lines > 1 ? 'normal' : 'nowrap' } as const
  return (
    <motion.div className={`${className || 'relative'} [transform-style:preserve-3d]`} style={{ width: wide, height: high, rotateX: pitch, rotateY: turn, scale, transformPerspective: perspective, ...style }}>
      {edges && (
        <>
          {/* The back cover: plain cloth, the press's mark small in its middle, as a hardback's back board. */}
          <div aria-hidden data-reader-back className="absolute inset-0 flex flex-col items-center justify-center gap-1 [backface-visibility:hidden]" style={{ transform: `rotateY(180deg) translateZ(${thick / 2}px)`, borderRadius: '5px 2px 2px 5px', background: `${CLOTH}, #f3ecd6`, color: 'var(--mf-card-c)' }}>
            <img src={markGold} alt="" draggable={false} className="size-9 opacity-80" />
            <span className="text-[0.5rem] font-semibold tracking-[0.18em] uppercase" style={{ fontFamily: "'Fraunces Variable', Georgia, serif" }}>Haligtree</span>
            <span aria-hidden className="pointer-events-none absolute inset-y-0 right-0 rounded-r-[inherit]" style={{ width: hinge, background: HINGE.replace('to right', 'to left') }} />
            <Lit normal={[0, 0, -1]} pose={pose} gloss={0.5} face="back" />
          </div>
          {/* The page block, set in from the boards' edges, its leaves a fine line each and shadowed where the boards close over them. */}
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
            <div key={`fore${side}`} aria-hidden data-reader-board className="absolute top-0 h-full [backface-visibility:hidden]"
              style={{ left: (wide - board) / 2, width: board, transform: `translateZ(${side * (thick / 2 - board / 2)}px) rotateY(90deg) translateZ(${wide / 2}px)`, background: `${CLOTH}, #e6dcbc` }}>
              <Lit normal={[1, 0, 0]} pose={pose} face="board" />
            </div>,
            ...[-1, 1].map((down) => (
              <div key={`${down}${side}`} aria-hidden className="absolute left-[2px] [backface-visibility:hidden]"
                style={{ top: (high - board) / 2, height: board, width: wide - 2, transform: `translateZ(${side * (thick / 2 - board / 2)}px) rotateX(${-90 * down}deg) translateZ(${high / 2}px)`, background: `${CLOTH}, #e6dcbc` }}>
                <Lit normal={[0, down, 0]} pose={pose} face="board" />
              </div>
            ))
          ])}
        </>
      )}
      {/* The spine, rounded, so lit in a band down its middle and falling dark to either hinge, a quarter binding as many
          cloth books have, its name blocked down it between two gilt rules. On the shelf, cloth in the book's own colour;
          else the cover's ink with its name in gold foil. */}
      {shelf ? (
        <div aria-hidden data-reader-spine-face className="mf-shelf-spine absolute top-0 flex h-full items-center justify-center overflow-hidden rounded-[2px] [backface-visibility:hidden]"
          style={{ left: (wide - thick) / 2, width: thick, transform: `rotateY(-90deg) translateZ(${wide / 2}px)` }}>
          <span className="mf-shelf-spine-rule" style={{ top: rule }} />
          <span className="mf-shelf-spine-rule" style={{ bottom: rule }} />
          {/* Its name whole between the rules, in foil pressed into the cloth: the foil over its own impression. */}
          <motion.span data-spine-words className="mf-shelf-spine-words" style={{ ...set, opacity: words }}>
            <span aria-hidden className="mf-shelf-spine-deboss">{name}</span>
            <span data-spine-title className="mf-shelf-spine-title">{name}</span>
          </motion.span>
          <Lit normal={[-1, 0, 0]} pose={pose} gloss={0.5} face="spine" veil={veil?.spine} />
        </div>
      ) : (
        <div aria-hidden data-reader-spine-face className="absolute top-0 flex h-full items-center justify-center overflow-hidden rounded-[3px] [backface-visibility:hidden]"
          style={{ left: (wide - thick) / 2, width: thick, transform: `rotateY(-90deg) translateZ(${wide / 2}px)`, background: `linear-gradient(to right, rgb(0 0 0 / 0.42), rgb(0 0 0 / 0.08) 22%, rgb(255 255 255 / 0.16) 48%, rgb(255 255 255 / 0.05) 62%, rgb(0 0 0 / 0.12) 80%, rgb(0 0 0 / 0.45)), ${CLOTH}, var(--mf-card-c)` }}>
          <span className="absolute inset-x-[5px] h-[3px] border-y border-[#d9bd78]/80" style={{ top: rule }} />
          <span className="absolute inset-x-[5px] h-[3px] border-y border-[#d9bd78]/80" style={{ bottom: rule }} />
          {/* Its name whole between the rules, smaller or on two lines when long, never cut. */}
          <motion.span data-spine-title className="bg-[linear-gradient(to_bottom,#f3dfa2,#c9a55a_45%,#f0d894_60%,#b8924a)] bg-clip-text text-center font-bold tracking-[0.06em] text-balance text-transparent"
            style={{ writingMode: 'vertical-rl', fontFamily: SPINE_SERIF, ...set, opacity: words }}>{name}</motion.span>
          <Lit normal={[-1, 0, 0]} pose={pose} gloss={0.8} face="spine" />
        </div>
      )}
      {ribbon && (
        // Laid in at the head and hanging out at the foot between the pages.
        <div aria-hidden data-reader-ribbon className="absolute w-[9px]"
          style={{ left: wide * 0.704, top: high - 12, height: 50, transform: 'translateZ(2px) rotate(4deg)', transformOrigin: 'top', clipPath: 'polygon(0 0, 100% 0, 100% 100%, 50% 88%, 0 100%)', background: 'linear-gradient(to right, rgb(0 0 0 / 0.3), transparent 30%, rgb(255 255 255 / 0.18) 50%, transparent 70%, rgb(0 0 0 / 0.3)), repeating-linear-gradient(to bottom, rgb(0 0 0 / 0.12) 0 1px, transparent 1px 2px), #7d1d22' }}>
          <Lit normal={[0, 0, 1]} pose={pose} face="ribbon" />
        </div>
      )}
      {/* The cover: cream paper in every theme, as a printed card is, its words in the book's own ink, never the theme's. */}
      <div {...cover} className={`absolute inset-0 bg-[#fffbea] [backface-visibility:hidden] ${cover?.className ?? ''}`}
        style={{ transform: `translateZ(${thick / 2}px)`, borderRadius: BOOK_CORNERS, color: 'var(--mf-card-c)', ...cover?.style }}>
        {children}
        <span aria-hidden data-reader-spine className="pointer-events-none absolute inset-y-0 left-0 rounded-l-[inherit]" style={{ width: hinge, background: HINGE }} />
        {/* The cloth's grain, on the full-size book. Not on the shelf's: there the cover is the printed paper, crisp under
            its card's art and words as a label is (the user, 22 Nov: grain laid over it, "I can barely even read the text
            now"); the cloth is the spine's (shelf.css). */}
        {!shelf && <span aria-hidden data-reader-grain className="pointer-events-none absolute inset-0 rounded-[inherit] opacity-[0.22] mix-blend-multiply" style={{ backgroundImage: CLOTH }} />}
        {/* And the room's light on the cover as it turns: darker turned away, and a gloss that runs across it. */}
        <Lit normal={[0, 0, 1]} pose={pose} gloss={0.55} face="front" veil={veil?.cover} />
      </div>
    </motion.div>
  )
}
