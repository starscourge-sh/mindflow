import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react'
import { Gem, Link2, Shuffle } from 'lucide-react'
import { Coolshape, shapes } from 'coolshapes-react'
import { animate, motion, useMotionValue, useSpring, useTransform, type MotionValue } from 'motion/react'
import { Button } from '@/components/ui/button'
import { AliveIcon } from '@/components/ui/alive-icon'
import CopyIcon from '@/components/ui/copy-icon'
import DownloadIcon from '@/components/ui/download-icon'
import { call, haligtree, useLive } from '@/lib/haligtree'
import { useShelf } from '@/lib/books'
import { useReading } from '@/lib/reads-in'
import { useFitText } from '@/lib/fit-text'
import { chime } from '@/lib/sound'
import { still } from '@/lib/motion'
import markGold from '@/assets/mark-gold-leaves.png'
import { dayMonth } from '../../../../main/dates'
import { Tip, refuse, toast } from './ui'
import { useTilt } from './tilt'

/**
 * The reader card, Arc's member card for a commonplace book: a printed card of
 * cream paper with a picture at the top (a shape from coolshapes, with a
 * film grain), your book's
 * name, a title drawn from two lists ("Patient Marginalist"), a round stamp
 * for each milestone reached and a small tag with the day the book began. Its colours are three of the theme's own hues, made
 * rich enough to print, and the title and hues follow from one number kept in
 * settings (readerSeed), so the same card shows every time until “Randomize”.
 */

// Mostly the Lands Between (Elden Ring), a few from Lordran and Drangleic (Dark Souls), and a few of the book's own.
const KINDS = ['Grace-Given', 'Erdtree', 'Haligtree', 'Golden', 'Starscourge', 'Ashen', 'Undead', 'Chosen', 'Hollow', 'Moonlit', 'Carian', 'Crucible', 'Rune-Bearing', 'Wandering', 'Restless', 'Patient', 'Midnight', 'Dragon-Kin', 'Bell-Bearing']
const READERS = ['Tarnished', 'Elden Lord', 'Finger Reader', 'Lorekeeper', 'Scholar', 'Sorcerer', 'Knight', 'Pilgrim', 'Maiden', 'Hunter', 'Archivist', 'Gleaner', 'Sentinel', 'Firekeeper', 'Wretch', 'Prophet', 'Astrologer', 'Vagabond', 'Confessor', 'Champion']
/** The theme's own hues (the tags'), warm to cool, so three in a row always sit well together. Never green beside yellow (their mix is olive), and no brown: both only muddy the picture. */
const HUES = ['yellow', 'orange', 'red', 'pink', 'purple', 'blue', 'green']
/** The coolshapes (coolshap.es, MIT) a card may draw: the soft ones that read as a picture, not the numbers, triangles and boxes. */
const SHAPES = ['star', 'flower', 'wheel', 'polygon', 'moon', 'misc'] as const
type Shape = { type: (typeof SHAPES)[number]; index: number }

/** What the stamps are read from (main 'reader:card'). */
type Facts = { notes: number; since: string | null; linked: boolean; journal: number; reviewed: boolean }

/** The same run of numbers from the same seed (mulberry32). */
function drawsFrom(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let mix = Math.imul(state ^ (state >>> 15), 1 | state)
    mix = (mix + Math.imul(mix ^ (mix >>> 7), 61 | mix)) ^ mix
    return ((mix ^ (mix >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * A name for a book no one has named yet, drawn the way the card's title is:
 * a room and what it keeps ("Chapel of Anticipation"). The welcome offers one
 * (Name your book), and it is kept if nothing else is written.
 */
const ROOMS = ['Chapel', 'Library', 'Reading Room', 'Archive', 'Garden', 'Tower', 'Study', 'Lantern Hall', 'Cloister', 'Observatory', 'Atelier', 'Annex']
const KEPT = ['Anticipation', 'Small Hours', 'Second Thoughts', 'Margins', 'Wonder', 'Lamplight', 'Kept Things', 'Quiet Hours', 'Loose Ends', 'First Light', 'Patience', 'Questions']
export function drawBookName(random: () => number = Math.random, not = ''): string {
  for (;;) {
    const name = `${ROOMS[Math.floor(random() * ROOMS.length)]} of ${KEPT[Math.floor(random() * KEPT.length)]}`
    if (name !== not) return name
  }
}

/** A seed from the book's name, for a card never randomized: each book its own. */
export const seedOf = (name: string): number => [...name].reduce((sum, letter) => (Math.imul(sum, 31) + letter.charCodeAt(0)) >>> 0, 7)

/** The title, the picture's three hues (three neighbours in the run, either way round, light to deep) and the shape a seed gives. */
export function cardOf(seed: number): { title: string; hues: [string, string, string]; shape: Shape } {
  const next = drawsFrom(seed)
  const pick = <T,>(list: T[]): T => list[Math.floor(next() * list.length)]
  const start = Math.floor(next() * (HUES.length - 2))
  const reversed = next() < 0.5
  const hues = HUES.slice(start, start + 3) as [string, string, string]
  if (reversed) hues.reverse()
  // The last is the deepest, and the name is written in it: yellow made deep is olive, so it goes first instead.
  if (hues[2] === 'yellow') hues.reverse()
  const title = `${pick(KINDS)} ${pick(READERS)}`
  // Drawn last, so the titles and hues a seed gave before shapes came are still the ones it gives.
  const type = pick([...SHAPES])
  return { title, hues, shape: { type, index: Math.floor(next() * shapes[type].length) } }
}

/**
 * A hue of the theme at a set lightness and strength, so the card is as rich
 * on a dark theme (whose tag colours are pale) as on a light one, and the
 * theme still chooses the hue.
 */
const inked = (hue: string, light: number, strength: number): string => `oklch(from var(--tt-color-text-${hue}) ${light} ${strength} h)`

/** The stamps reached, in the order they are usually reached. */
function stampsOf(facts: Facts): { label: ReactNode; said: string }[] {
  const year = facts.since && Date.now() - new Date(facts.since).getTime() >= 365 * 86400000
  return [
    facts.notes >= 100 && { label: '100', said: 'A hundred notes' },
    facts.linked && { label: <Link2 className="size-3.5" strokeWidth={1.75} />, said: 'A note linked to another' },
    facts.reviewed && { label: <Gem className="size-3.5" strokeWidth={1.75} />, said: 'A first gem reviewed' },
    facts.journal >= 30 && { label: '30', said: 'Thirty days of Journal' },
    facts.notes >= 1000 && { label: '1k', said: 'A thousand notes' },
    year && { label: '1y', said: 'A year since the book began' }
  ].filter((one) => !!one) as { label: ReactNode; said: string }[]
}

/** The card's corners, rounded as on screen: a book's, square at the spine, a little round at the fore-edge. */
const ROUND = 5
const BOOK_CORNERS = '2px 5px 5px 2px'
/** How thick the book is, and how far it stands turned at rest, its spine toward you. */
const THICK = 30
/** How thick each board is, and how far the boards stand out past the pages at the head, foot and fore-edge. */
const BOARD = 3
const OVERHANG = 3
const WIDE_BOOK = 250
const HIGH_BOOK = 375
// Turned the other way at rest: its fore-edge and old pages toward you, the spine round the far side.
// The pose's springs: soft and a little bouncy, so the book sways into each pose and rocks once, never snaps.
const POSE = { stiffness: 90, damping: 11 }
// Turned enough that the pages show down the fore-edge beside the cover: what makes it a book, not a card (the user, 6 Nov).
const REST_TURN = -30
const REST_LEAN = 10
/** Where it comes up from the first time it is shown: lying back, near flat, turned further away. */
const ARRIVE_TURN = -55
const ARRIVE_LEAN = 68
/** How far past its pose it comes as it arrives, as a share of the way it came up: negative is forward. */
const ARRIVE_PAST = -0.2
/** How far from the book, in pixels, the pointer turns it fully; beyond, it keeps following at half that, across the whole page. */
const NEAR_BOOK = 160
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
const CLOTH = `url("data:image/svg+xml;utf8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160"><filter id="n"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch"/><feColorMatrix values="0 0 0 0 0.5  0 0 0 0 0.45  0 0 0 0 0.35  0 0 0 0.9 0"/></filter><rect width="160" height="160" filter="url(#n)"/></svg>')}")`

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

/**
 * One face's light as the book turns: `shade`, how much darker than the cover facing you it is (a black veil's
 * opacity), `glint`, how much brighter (a white one's), and `shine`, the gloss where it catches the light square on
 * (Blinn's half-way rule), with `slide`, how far across the face that shine sits. All motion values, read off the
 * turn each frame, so the light moves without React drawing anything.
 */
function useLight(normal: Normal, pitch: MotionValue<number>, turn: MotionValue<number>, lit: MotionValue<number>): Record<'shade' | 'glint' | 'shine' | 'slide', MotionValue<number>> {
  const seen = useTransform(() => facing(normal, pitch.get(), turn.get()))
  const shade = useTransform(() => lit.get() * Math.min(0.4, Math.max(0, 1 - toneOf(seen.get()) / FACING)))
  const glint = useTransform(() => lit.get() * Math.min(0.2, Math.max(0, toneOf(seen.get()) / FACING - 1)))
  const shine = useTransform(() => {
    const [x, y, z] = seen.get()
    return lit.get() * Math.max(0, x * HALF[0] + y * HALF[1] + z * HALF[2]) ** 24
  })
  // The face turning past the light carries the shine across it, the way a laminated cover's gloss runs as it turns.
  const slide = useTransform(() => (seen.get()[0] - HALF[0]) * -180)
  return { shade, glint, shine, slide }
}

/** A face's light laid over it: the veil, the glint, and with `gloss` the shine that runs across as it turns. */
function Lit({ light, gloss = 0, face }: { light: ReturnType<typeof useLight>; gloss?: number; face: string }): React.JSX.Element {
  const x = useTransform(light.slide, (at) => `${at}%`)
  const opacity = useTransform(light.shine, (at) => at * gloss)
  return (
    <>
      <motion.span aria-hidden data-reader-light={face} className="pointer-events-none absolute inset-0 rounded-[inherit] bg-[#1c140a]" style={{ opacity: light.shade }} />
      <motion.span aria-hidden className="pointer-events-none absolute inset-0 rounded-[inherit] bg-white" style={{ opacity: light.glint }} />
      {gloss > 0 && (
        <span aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]">
          <motion.span data-reader-shine={face} className="absolute inset-y-0 -left-full w-[300%] mix-blend-soft-light"
            style={{ x, opacity, background: 'linear-gradient(100deg, transparent 38%, rgb(255 255 255 / 0.55) 47%, rgb(255 255 255 / 0.9) 50%, rgb(255 255 255 / 0.55) 53%, transparent 62%)' }} />
        </span>
      )}
    </>
  )
}

/**
 * The card alone as a PNG, its corners see-through: taken square (cream to the
 * very corner, so no window colour is caught there) and then rounded here.
 */
async function pictureOf(card: HTMLElement): Promise<Uint8Array> {
  card.scrollIntoView({ block: 'nearest' })
  await document.fonts.ready
  card.style.borderRadius = '0'
  let png: Uint8Array | null
  try {
    await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)))
    const box = card.getBoundingClientRect()
    png = await window.api.pictureOfRect({ x: box.left, y: box.top, width: box.width, height: box.height })
  } finally {
    card.style.borderRadius = ''
  }
  if (!png) throw new Error('the window gave back no picture')
  const taken = await createImageBitmap(new Blob([png as BlobPart], { type: 'image/png' }))
  const canvas = document.createElement('canvas')
  canvas.width = taken.width
  canvas.height = taken.height
  const ink = canvas.getContext('2d')!
  ink.beginPath()
  ink.roundRect(0, 0, taken.width, taken.height, ROUND * (taken.width / card.offsetWidth))
  ink.clip()
  ink.drawImage(taken, 0, 0)
  taken.close()
  const blob = await new Promise<Blob | null>((done) => canvas.toBlob(done, 'image/png'))
  if (!blob) throw new Error('its corners could not be rounded')
  return new Uint8Array(await blob.arrayBuffer())
}

/** Copy the card, or save it to a file, and say so. */
async function shareCard(card: HTMLElement | null, save: boolean, name: string, level: () => Promise<void>): Promise<void> {
  if (!card) return
  await level()
  try {
    const png = await pictureOf(card)
    if (save) {
      if (await window.api.savePicture(`${name.replace(/[/\\:\0]/g, ' ').trim().slice(0, 60) || 'Reader'} reader card.png`, png)) (chime('shutter'), toast('Saved as an image'))
      return
    }
    if (!(await window.api.copyPicture(png))) return refuse('Could not put the image on the clipboard', 'error')
    chime('shutter')
    toast('Copied as an image')
  } catch (error) {
    refuse(`Could not make the image: ${(error as Error).message}`, 'error')
  }
}

/**
 * One coolshape on the cream, in the card's colours: its blurred blobs give
 * the light and dark, and a filter maps the dark to the card's deepest hue,
 * the middle to its middle one and the light to its lightest, then lays on
 * a film grain. So a star or a flower wears the same colours as the name
 * under it, and glides with them on “Randomize”. Pictured at one size, so the
 * card never changes.
 */
function ShapePicture({ shape }: { shape: Shape }): React.JSX.Element {
  return (
    <div data-reader-shape={`${shape.type}-${shape.index}`} className="relative grid aspect-[226/200] place-items-center">
      <svg aria-hidden className="absolute size-0">
        <filter id="mf-card-tint" x="0" y="0" width="100%" height="100%" colorInterpolationFilters="sRGB">
          {/* How light each point is, opaque, stretched so the shape's own light and dark span the whole way. */}
          <feColorMatrix in="SourceGraphic" type="matrix" values="0.3 0.59 0.11 0 0  0.3 0.59 0.11 0 0  0.3 0.59 0.11 0 0  0 0 0 0 1" result="grey" />
          <feComponentTransfer in="grey" result="light">
            <feFuncR type="linear" slope="2" intercept="-0.8" />
            <feFuncG type="linear" slope="2" intercept="-0.8" />
            <feFuncB type="linear" slope="2" intercept="-0.8" />
          </feComponentTransfer>
          {/* How much of each hue: the deepest in the dark, the middle one in between, the lightest in the light. Neighbours mix clean; the two ends straight together would grey. */}
          <feComponentTransfer in="light" result="wa"><feFuncR type="table" tableValues="0 0 1" /><feFuncG type="table" tableValues="0 0 1" /><feFuncB type="table" tableValues="0 0 1" /></feComponentTransfer>
          <feComponentTransfer in="light" result="wb"><feFuncR type="table" tableValues="0 1 0" /><feFuncG type="table" tableValues="0 1 0" /><feFuncB type="table" tableValues="0 1 0" /></feComponentTransfer>
          <feComponentTransfer in="light" result="wc"><feFuncR type="table" tableValues="1 0 0" /><feFuncG type="table" tableValues="1 0 0" /><feFuncB type="table" tableValues="1 0 0" /></feComponentTransfer>
          <feFlood style={{ floodColor: 'var(--mf-card-a)' }} result="a" />
          <feFlood style={{ floodColor: 'var(--mf-card-b)' }} result="b" />
          <feFlood style={{ floodColor: 'var(--mf-card-c)' }} result="c" />
          <feComposite in="a" in2="wa" operator="arithmetic" k1="1" result="pa" />
          <feComposite in="b" in2="wb" operator="arithmetic" k1="1" result="pb" />
          <feComposite in="c" in2="wc" operator="arithmetic" k1="1" result="pc" />
          <feComposite in="pa" in2="pb" operator="arithmetic" k2="1" k3="1" result="pab" />
          <feComposite in="pab" in2="pc" operator="arithmetic" k2="1" k3="1" result="mixed" />
          {/* A film grain, cut back to the shape. */}
          <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="3" stitchTiles="stitch" seed="7" result="noise" />
          <feColorMatrix in="noise" type="matrix" values="0.33 0.33 0.33 0 0  0.33 0.33 0.33 0 0  0.33 0.33 0.33 0 0  0 0 0 0 0.55" result="speckle" />
          <feBlend in="speckle" in2="mixed" mode="overlay" result="grained" />
          <feComposite in="grained" in2="SourceGraphic" operator="in" />
        </filter>
      </svg>
      {/* A new shape comes up softly, while the colours glide. */}
      <Coolshape key={`${shape.type}-${shape.index}`} type={shape.type} index={shape.index} noise={false} size={168} className="mf-rise" style={{ filter: 'url(#mf-card-tint)' }} />
    </div>
  )
}

export function ReaderCard({ seed: saved, point, named, bare = false, arrive, watching = false }: {
  seed: number | undefined
  /** The name to show in place of the open book's: the welcome's, as it is typed. */
  named?: string
  /** The card alone, without its copy, save and Randomize buttons. */
  bare?: boolean
  /** Changed when ⌘K's “Your reader card” asks for it: brought into view. */
  point?: number
  /** Shown for the first time (the welcome's “Name it”): it waits lying nearly flat ("wait"), then comes up into its pose ("go"), as Stripe Press's books do. Given "go" once it can be seen. */
  arrive?: 'wait' | 'go'
  /** It watches the pointer anywhere on the page, as it does on the welcome. */
  watching?: boolean
}): React.JSX.Element {
  const shelf = useShelf()
  const facts = useLive(() => call<Facts>('reader:card'), null as Facts | null)
  // Its "Kept since" line and stamps come with the page, never "Not begun" a beat before them.
  useReading(facts === null)
  const card = useRef<HTMLDivElement>(null)
  // The card tips toward the pointer as a picture in full screen does (tilt.tsx), a little less far: it is held, not studied.
  const tilt = useTilt(7, 1.02)
  // A real book, as Stripe Press's: at rest it stands turned a little, its spine to you; pointed at, it turns to face
  // you and leans toward the pointer. Motion off, it faces you and stays.
  const turn = useSpring(still() ? 0 : REST_TURN, POSE)
  // Arriving: 1 while it waits lying back, eased to 0 on a slow soft spring of its own as it stands up (the pointer's springs stay quick).
  const rise = useMotionValue(arrive && !still() ? 1 : 0)
  // Grabbed and dragged, it turns in the hand, any way round (its back, its spine, its pages); let go, it carries on
  // with the throw, slows, and settles home on a soft spring. Plain values, moved by hand and by animate(), so a grab
  // mid-spin takes it from wherever it is, at no jump.
  const spinY = useMotionValue(0)
  const spinX = useMotionValue(0)
  const grab = useRef<{ x: number; y: number; ry: number; rx: number } | null>(null)
  const turned = useTransform(() => turn.get() + tilt.y.get() + spinY.get() + rise.get() * (ARRIVE_TURN - REST_TURN))
  // And at rest it leans back a little too, as a book stood on a shelf is seen from just above (Stripe Press's pose).
  const lean = useSpring(still() ? 0 : REST_LEAN, POSE)
  // Arriving, it starts from lying back and turned away, comes up and a little further forward than its pose (about
  // 12°), then settles back into it on a spring with no bounce, once. A held book tipped toward you, then set right.
  useEffect(() => {
    if (arrive !== 'go' || rise.get() <= 0) return
    const forward = animate(rise, ARRIVE_PAST, { duration: 0.7, ease: [0.22, 1, 0.36, 1] })
    let back: ReturnType<typeof animate> | undefined
    void forward.then(() => void (back = animate(rise, 0, { type: 'spring', stiffness: 70, damping: 17, restDelta: 0.001 })))
    return () => (forward.stop(), back?.stop())
  }, [arrive]) // eslint-disable-line react-hooks/exhaustive-deps
  // On the welcome it keeps an eye on the pointer: it turns and leans toward it wherever it goes on the page, by how far
  // across the page it is, at half strength far off and in full close by, on the pose's own springs, until the pointer
  // comes onto it and it faces you.
  const over = useRef(false)
  // While its picture is taken: the pointer over it leaves it be.
  const shooting = useRef(false)
  // Turned to face you: at once with motion off, on the pose's springs otherwise.
  const face = (): void => void (still() ? (turn.jump(0), lean.jump(0)) : (turn.set(0), lean.set(0)))
  useEffect(() => {
    if (!watching || still()) return
    const follow = (event: PointerEvent): void => {
      const box = card.current?.getBoundingClientRect()
      if (!box || over.current || grab.current) return
      // How far across the page from the book, -1 at one window edge to 1 at the other, so it moves all the way over.
      const across = (at: number, from: number, size: number): number => Math.max(-1, Math.min(1, (at - from) / Math.max(1, at < from ? from : size - from)))
      // How far the pointer is from the book's edge: close by it answers in full, measured by the book's own size.
      const off = Math.hypot(Math.max(box.left - event.clientX, 0, event.clientX - box.right), Math.max(box.top - event.clientY, 0, event.clientY - box.bottom))
      const near = Math.max(0, 1 - off / NEAR_BOOK)
      const by = (at: number, from: number, size: number, half: number): number => near * Math.max(-1, Math.min(1, (at - from) / (half + 60))) + (1 - near) * 0.5 * across(at, from, size)
      turn.set(REST_TURN + by(event.clientX, box.left + box.width / 2, innerWidth, box.width / 2) * 9)
      lean.set(REST_LEAN - by(event.clientY, box.top + box.height / 2, innerHeight, box.height / 2) * 6)
    }
    addEventListener('pointermove', follow)
    return () => removeEventListener('pointermove', follow)
  }, [watching]) // eslint-disable-line react-hooks/exhaustive-deps
  const pitched = useTransform(() => tilt.x.get() + spinX.get() + lean.get() + rise.get() * (ARRIVE_LEAN - REST_LEAN))
  // The light on each face, from where it points now; 0 while its picture is taken, so the cover is shown as printed.
  const lit = useMotionValue(1)
  const front = useLight([0, 0, 1], pitched, turned, lit)
  const back = useLight([0, 0, -1], pitched, turned, lit)
  const spine = useLight([-1, 0, 0], pitched, turned, lit)
  const fore = useLight([1, 0, 0], pitched, turned, lit)
  const head = useLight([0, -1, 0], pitched, turned, lit)
  const foot = useLight([0, 1, 0], pitched, turned, lit)
  // Its shadow on the table: narrower as it turns edge on (a book is wide but thin), and off to the left, away from
  // the light, a little further as the spine comes round.
  const shadowWide = useTransform(() => Math.max(0.22, (Math.abs(Math.cos((turned.get() * Math.PI) / 180)) * WIDE_BOOK + Math.abs(Math.sin((turned.get() * Math.PI) / 180)) * THICK) / WIDE_BOOK))
  const shadowAt = useTransform(() => -10 + Math.sin((turned.get() * Math.PI) / 180) * 14)
  const letGo = (): void => {
    if (!grab.current) return
    grab.current = null
    // Carried on as far as the throw would take it, then home by the nearest whole turn (the same book), so a hard
    // throw spins round once or twice and a soft one only eases back.
    const y = spinY.get()
    const throwY = spinY.getVelocity()
    const home = 360 * Math.round((y + throwY * 0.35) / 360)
    void animate(spinY, home, { type: 'spring', velocity: throwY, stiffness: 60, damping: 13, restDelta: 0.01 }).then(() => {
      if (!grab.current) spinY.jump(spinY.get() - home)
    })
    void animate(spinX, 0, { type: 'spring', velocity: spinX.getVelocity(), stiffness: 90, damping: 15 })
  }
  // Before its picture is taken it eases round to face you, flat and unlit (no spring, no sheen), then is set exactly
  // flat; it was snapped there at once, an abrupt jump the moment Copy or Save was pressed. Motion off, it is set at once.
  const level = async (): Promise<void> => {
    if (!still()) {
      const ease = { duration: 0.35, ease: [0.25, 0.1, 0.25, 1] as const }
      for (const one of [turn, lean, tilt.x, tilt.y, tilt.glow, spinX, spinY, lit]) one.stop()
      shooting.current = true
      await Promise.all([...[turn, lean, tilt.x, tilt.y, tilt.glow, spinX, spinY, lit].map((one) => animate(one, 0, ease)), animate(tilt.grow, 1, ease)])
      // The pose's springs follow the ease a beat behind: let them come in before the last exact set, so it lands, not jumps.
      for (let frame = 0; frame < 30 && (Math.abs(turned.get()) > 0.3 || Math.abs(pitched.get()) > 0.3); frame++) await new Promise((done) => requestAnimationFrame(done))
    }
    for (const one of [turn, lean, tilt.x, tilt.y, tilt.glow, spinX, spinY, lit]) one.jump(0)
    tilt.grow.jump(1)
  }
  // And eases back into its pose after, on the pose's own springs.
  const unlevel = (): void => {
    shooting.current = false
    void animate(lit, 1, { duration: 0.35 })
    if (!still()) (turn.set(REST_TURN), lean.set(REST_LEAN))
  }
  useEffect(() => void (point && card.current?.scrollIntoView({ block: 'center' })), [point])
  const name = named ?? shelf?.name ?? ''
  const nameLine = useRef<HTMLParagraphElement>(null)
  useFitText(nameLine, name, { most: 22, least: 13, way: 'down' })
  const seed = saved ?? seedOf(name)
  const { title, hues, shape } = cardOf(seed)
  const stamps = facts ? stampsOf(facts) : []
  const actions: { tip: string; icon: ReactNode; data: string; run: () => void }[] = [
    { tip: 'Copy as image', icon: <AliveIcon icon={CopyIcon} size={15} />, data: 'data-reader-copy', run: () => void shareCard(card.current, false, name, level).finally(unlevel) },
    { tip: 'Save as image…', icon: <AliveIcon icon={DownloadIcon} size={15} />, data: 'data-reader-save', run: () => void shareCard(card.current, true, name, level).finally(unlevel) },
    {
      tip: 'Randomize', icon: <Shuffle className="size-[15px]" />, data: 'data-reader-randomize', run: () => {
        let next = seed
        // A new draw, never the one on show.
        while (cardOf(next).title === title) next = Math.floor(Math.random() * 2 ** 31)
        chime('anew')
        void haligtree.setSettings({ readerSeed: next })
      }
    }
  ]
  return (
    <div className="flex flex-col items-center gap-3 pt-1">
      {/* The pointer is read on a wrapper that never tips, as Tilt does: read on the card, a corner tips out from under it and flickers. */}
      {/* A press nudges the book where it is pressed, a little further back and a touch smaller, and on letting go it
          springs back to lean toward the pointer again. */}
      <div data-reader-hold className="relative mb-[34px]" onPointerEnter={() => ((over.current = true), shooting.current || face())} onPointerMove={(event) => {
          const held = grab.current
          if (shooting.current) return
          if (held) return void (spinY.set(held.ry + (event.clientX - held.x) * 0.6), spinX.set(Math.max(-70, Math.min(70, held.rx - (event.clientY - held.y) * 0.4))))
          if (!event.buttons) tilt.lean(event, event.currentTarget)
        }}
        onPointerLeave={() => ((over.current = false), grab.current || tilt.flat(), !still() && !grab.current && !shooting.current && (turn.set(REST_TURN), lean.set(REST_LEAN)))}
        onPointerDown={(event) => {
          if (event.button !== 0) return
          event.currentTarget.setPointerCapture(event.pointerId)
          // Caught where it is, even mid-throw: the spin stops under the hand and goes on from there.
          spinY.stop()
          spinX.stop()
          grab.current = { x: event.clientX, y: event.clientY, ry: spinY.get(), rx: spinX.get() }
          tilt.flat()
          face()
          chime('tap')
        }}
        onPointerUp={(event) => (letGo(), tilt.lean({ ...event, buttons: 0 }, event.currentTarget))} onPointerCancel={letGo} onLostPointerCapture={letGo}
        style={{ cursor: grab.current ? 'grabbing' : 'grab', touchAction: 'none' }}>
        {/* Its shadow on the table under it: a wide soft one from the room, and a tight dark one where it stands,
            both narrowing as it turns edge on and lying away from the light. */}
        <motion.div aria-hidden data-reader-shadow className="pointer-events-none absolute inset-x-3 -bottom-5 h-8 rounded-[50%] bg-black/25 blur-[18px]" style={{ x: shadowAt, scaleX: shadowWide }} />
        <motion.div aria-hidden className="pointer-events-none absolute inset-x-6 -bottom-1.5 h-3 rounded-[50%] bg-black/40 blur-[6px]" style={{ x: shadowAt, scaleX: shadowWide }} />
        {/* The book is a box in 3D, built as a hardback is: two boards (the cover at the front, the back behind), each
            with its own thickness at the head, foot and fore-edge, standing a little proud of the old yellowed pages
            set in between, and the spine round the left. Each face takes the light by how it stands to it. */}
        {/* Its colours are set on the whole book, so the spine and the cover wear the same ink. Cream paper in every
            theme, as a printed card is: its words take the card's own colour, never the theme's. */}
        <motion.div className="relative h-[375px] w-[250px] [transform-style:preserve-3d]" style={{ rotateX: pitched, rotateY: turned, scale: tilt.grow, transformPerspective: 1000, ...({ transition: '--mf-card-a 700ms ease-out, --mf-card-b 700ms ease-out, --mf-card-c 700ms ease-out', '--mf-card-a': inked(hues[0], 0.82, 0.13), '--mf-card-b': inked(hues[1], 0.66, 0.19), '--mf-card-c': inked(hues[2], 0.44, 0.15) } as CSSProperties) }}>
          {/* The back cover: plain cloth, the press's mark small in its middle, as a hardback's back board. */}
          <div aria-hidden data-reader-back className="absolute inset-0 flex flex-col items-center justify-center gap-1 [backface-visibility:hidden]" style={{ transform: `rotateY(180deg) translateZ(${THICK / 2}px)`, borderRadius: '5px 2px 2px 5px', background: `${CLOTH}, #f3ecd6`, color: 'var(--mf-card-c)' }}>
            <img src={markGold} alt="" draggable={false} className="size-9 opacity-80" />
            <span className="text-[0.5rem] font-semibold tracking-[0.18em] uppercase" style={{ fontFamily: "'Fraunces Variable', Georgia, serif" }}>Haligtree</span>
            <span aria-hidden className="pointer-events-none absolute inset-y-0 right-0 w-[18px] rounded-r-[inherit] bg-[linear-gradient(to_left,rgb(0_0_0/0.16),rgb(0_0_0/0.05)_35%,rgb(255_255_255/0.12)_55%,rgb(0_0_0/0.04)_64%,rgb(0_0_0/0.24)_70%,rgb(0_0_0/0.1)_76%,rgb(255_255_255/0.5)_82%,rgb(255_255_255/0.12)_90%,transparent)]" />
            <Lit light={back} gloss={0.5} face="back" />
          </div>
          {/* The spine: rounded, so lit in a band down its middle and falling dark to either hinge. */}
          <div aria-hidden data-reader-spine-face className="absolute top-0 flex h-full items-center justify-center overflow-hidden rounded-[3px] [backface-visibility:hidden]"
            style={{ left: (WIDE_BOOK - THICK) / 2, width: THICK, transform: `rotateY(-90deg) translateZ(${WIDE_BOOK / 2}px)`, background: `linear-gradient(to right, rgb(0 0 0 / 0.42), rgb(0 0 0 / 0.08) 22%, rgb(255 255 255 / 0.16) 48%, rgb(255 255 255 / 0.05) 62%, rgb(0 0 0 / 0.12) 80%, rgb(0 0 0 / 0.45)), ${CLOTH}, var(--mf-card-c)` }}>
            {/* A quarter binding, as many cloth books have: the spine in the cover's ink, its name blocked down it in gold
                foil between two gold rules at the head and foot. */}
            <span className="absolute inset-x-[5px] top-[18px] h-[3px] border-y border-[#d9bd78]/80" />
            <span className="absolute inset-x-[5px] bottom-[18px] h-[3px] border-y border-[#d9bd78]/80" />
            <span className="bg-[linear-gradient(to_bottom,#f3dfa2,#c9a55a_45%,#f0d894_60%,#b8924a)] bg-clip-text text-[0.6875rem] font-bold tracking-[0.06em] whitespace-nowrap text-transparent" style={{ writingMode: 'vertical-rl', fontFamily: "'Fraunces Variable', Georgia, serif" }}>{name}</span>
            <Lit light={spine} gloss={0.8} face="spine" />
          </div>
          {/* The page block, set in from the boards' edges, its leaves a fine line each and shadowed where the boards
              close over them. */}
          <div aria-hidden data-reader-pages className="absolute [backface-visibility:hidden]"
            style={{ top: OVERHANG, left: (WIDE_BOOK - (THICK - 2 * BOARD)) / 2, width: THICK - 2 * BOARD, height: HIGH_BOOK - 2 * OVERHANG, transform: `rotateY(90deg) translateZ(${WIDE_BOOK / 2 - OVERHANG}px)`, background: `linear-gradient(to right, rgb(60 40 10 / 0.35), transparent 22%, transparent 80%, rgb(60 40 10 / 0.3)), ${EDGE_LINES('down')}, ${OLD_PAGES}` }}>
            <Lit light={fore} face="fore" />
          </div>
          {[head, foot].map((light, at) => (
            <div key={at} aria-hidden className="absolute [backface-visibility:hidden]"
              style={{ left: 2, top: (HIGH_BOOK - (THICK - 2 * BOARD)) / 2, height: THICK - 2 * BOARD, width: WIDE_BOOK - 2 - OVERHANG, transform: `rotateX(${at ? -90 : 90}deg) translateZ(${HIGH_BOOK / 2 - OVERHANG}px)`, background: `linear-gradient(to bottom, rgb(60 40 10 / 0.35), transparent 22%, transparent 80%, rgb(60 40 10 / 0.3)), ${EDGE_LINES('across')}, ${OLD_PAGES}` }}>
              {/* The headband (and tailband): a little coloured thread where the pages meet the spine. */}
              <span className="absolute inset-y-[2px] left-0 w-[5px] rounded-r-[1px] bg-[repeating-linear-gradient(to_bottom,var(--mf-card-a)_0_1.5px,var(--mf-card-b)_1.5px_3px)]" />
              <Lit light={light} face={at ? 'foot' : 'head'} />
            </div>
          ))}
          {/* Each board's own edge, cloth turned over a board: at the fore-edge, the head and the foot of each. */}
          {[1, -1].map((side) => [
            <div key={`fore${side}`} aria-hidden data-reader-board className="absolute top-0 h-full [backface-visibility:hidden]"
              style={{ left: (WIDE_BOOK - BOARD) / 2, width: BOARD, transform: `translateZ(${side * (THICK / 2 - BOARD / 2)}px) rotateY(90deg) translateZ(${WIDE_BOOK / 2}px)`, background: `${CLOTH}, #e6dcbc` }}>
              <Lit light={fore} face="board" />
            </div>,
            ...[head, foot].map((light, at) => (
              <div key={`${at}${side}`} aria-hidden className="absolute left-[2px] [backface-visibility:hidden]"
                style={{ top: (HIGH_BOOK - BOARD) / 2, height: BOARD, width: WIDE_BOOK - 2, transform: `translateZ(${side * (THICK / 2 - BOARD / 2)}px) rotateX(${at ? -90 : 90}deg) translateZ(${HIGH_BOOK / 2}px)`, background: `${CLOTH}, #e6dcbc` }}>
                <Lit light={light} face="board" />
              </div>
            ))
          ])}
          {/* A ribbon to keep your place, laid in at the head and hanging out at the foot between the pages. */}
          <div aria-hidden data-reader-ribbon className="absolute left-[176px] w-[9px]"
            style={{ top: HIGH_BOOK - 12, height: 50, transform: 'translateZ(2px) rotate(4deg)', transformOrigin: 'top', clipPath: 'polygon(0 0, 100% 0, 100% 100%, 50% 88%, 0 100%)', background: 'linear-gradient(to right, rgb(0 0 0 / 0.3), transparent 30%, rgb(255 255 255 / 0.18) 50%, transparent 70%, rgb(0 0 0 / 0.3)), repeating-linear-gradient(to bottom, rgb(0 0 0 / 0.12) 0 1px, transparent 1px 2px), #7d1d22' }}>
            <Lit light={front} face="ribbon" />
          </div>
        <div
          ref={card}
          data-reader-card
          data-hues={hues.join(' ')}
          className="absolute inset-0 flex flex-col bg-[#fffbea] py-4 pr-4 pl-[1.75rem] [backface-visibility:hidden]"
          style={{ transform: `translateZ(${THICK / 2}px)`, borderRadius: BOOK_CORNERS, color: 'var(--mf-card-c)' }}
        >
          <ShapePicture shape={shape} />
          {/* Smaller the longer the name, so every name up to the field's 60 letters shows whole, in up to three lines. */}
          <p ref={nameLine} data-reader-name className="mt-3 line-clamp-3 leading-[1.12] font-bold tracking-[-0.015em] break-words" style={{ fontFamily: "'Fraunces Variable', Georgia, serif", fontSize: 22 }}>{name || ' '}</p>
          {/* Plain words, not rolled: a roll measures its letters on the page, and on a book turned in 3D (it turns toward the
              pointer) they measure short, so the words were cut through their middles. */}
          <p data-reader-title={title} className="mt-2 font-mono text-[0.5625rem] font-medium tracking-[0.16em] uppercase">{title}</p>
          {/* The foot: the stamps with "Commonplace Book" beside them, and the day's tag under both, so the two never meet
              on a cover narrowed by its spine. */}
          <div className="mt-auto flex flex-col items-stretch gap-2.5 border-t border-current/15 pt-2.5">
            <div className="flex items-end justify-between gap-2">
              {/* Room for a row of stamps, kept even before the first, so the card never changes. */}
              <div data-reader-stamps className="flex min-h-[26px] gap-1">
                {stamps.map((one) => (
                  <Tip key={one.said} label={one.said}>
                    <span
                      data-reader-stamp={one.said}
                      className="grid size-[26px] place-items-center rounded-full border border-current/60 font-mono text-[0.5625rem] font-medium tracking-tight"
                    >{one.label}</span>
                  </Tip>
                ))}
              </div>
              <p aria-hidden data-reader-book className="shrink-0 text-right font-mono text-[0.5rem] leading-[1.3] font-medium tracking-[0.14em] uppercase">Commonplace<br />Book</p>
            </div>
            <div className="flex">
              {/* One quiet line, as a member card's "Member since": no box, no hatching. */}
              <span data-reader-since className="font-mono text-[0.5rem] leading-none font-medium tracking-[0.14em] whitespace-nowrap uppercase">
                {facts?.since ? `Kept since ${dayMonth(facts.since, 'always')}` : 'Not begun'}
              </span>
            </div>
          </div>
          {/* A tooled frame on the cover, two fine rules in its ink, as a cloth binding is blocked; clear of the spine. */}
          <span aria-hidden data-reader-frame className="pointer-events-none absolute top-[7px] right-[7px] bottom-[7px] left-[19px] rounded-[2px] border border-current opacity-[0.14]" />
          {/* The hinge: the cloth pressed into a groove a little in from the spine, where the cover bends open; shadowed on
              its spine side, catching the light on the other, and the strip before it rounded over the joint. */}
          <span aria-hidden data-reader-spine className="pointer-events-none absolute inset-y-0 left-0 w-[18px] rounded-l-[inherit] bg-[linear-gradient(to_right,rgb(0_0_0/0.16),rgb(0_0_0/0.05)_35%,rgb(255_255_255/0.12)_55%,rgb(0_0_0/0.04)_64%,rgb(0_0_0/0.24)_70%,rgb(0_0_0/0.1)_76%,rgb(255_255_255/0.5)_82%,rgb(255_255_255/0.12)_90%,transparent)]" />
          <span aria-hidden data-reader-grain className="pointer-events-none absolute inset-0 rounded-[inherit] opacity-[0.22] mix-blend-multiply" style={{ backgroundImage: CLOTH }} />
          {/* A soft light where the pointer is, as the card tips. */}
          <motion.span aria-hidden className="pointer-events-none absolute inset-0 rounded-[inherit]" style={{ background: tilt.sheen, opacity: tilt.glow }} />
          {/* And the room's light on the cover as it turns: darker turned away, and a gloss that runs across it. */}
          <Lit light={front} gloss={0.55} face="front" />
        </div>
        </motion.div>
      </div>
      {!bare && <div className="flex gap-1">
        {actions.map((one) => (
          <Tip key={one.tip} label={one.tip}>
            <Button variant="ghost" size="icon" aria-label={one.tip} {...{ [one.data]: '' }} onClick={one.run} className="text-muted-foreground hover:text-foreground">{one.icon}</Button>
          </Tip>
        ))}
      </div>}
    </div>
  )
}
