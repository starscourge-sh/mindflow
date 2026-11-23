import { useEffect, useId, useRef, type CSSProperties, type ReactNode } from 'react'
import { Gem, Link2, Shuffle } from 'lucide-react'
import { Coolshape, shapes } from 'coolshapes-react'
import { animate, motion, useMotionValue, useSpring, useTransform } from 'motion/react'
import { Button } from '@/components/ui/button'
import { AliveIcon } from '@/components/ui/alive-icon'
import CopyIcon from '@/components/ui/copy-icon'
import DownloadIcon from '@/components/ui/download-icon'
import { call, haligtree, useLive } from '@/lib/haligtree'
import { useShelf, type BookCard } from '@/lib/books'
import { useReading } from '@/lib/reads-in'
import { useFitText } from '@/lib/fit-text'
import { chime } from '@/lib/sound'
import { still } from '@/lib/motion'
import { dayMonth } from '../../../../main/dates'
import { Tip, refuse, toast } from './ui'
import { useTilt } from './tilt'
import { BookBox, clothOf, inked, labelOf, type BookSize } from './book-box'

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
export type Facts = { notes: number; since: string | null; linked: boolean; journal: number; reviewed: boolean }

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

/** The card's corners when its picture is taken. */
const ROUND = 5
/** The book's size: as wide and tall as a card, 30 thick, its boards 3 thick and standing 3 proud of the pages. */
const BOOK: BookSize = { wide: 250, high: 375, thick: 30, board: 3, overhang: 3 }
const { wide: WIDE_BOOK, thick: THICK } = BOOK
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
function ShapePicture({ shape, rise, grain = true }: { shape: Shape; rise: boolean; grain?: boolean }): React.JSX.Element {
  // Its own filter, so two cards on one page (Settings' and the shelf's) each tint by their own inks.
  const tint = `mf-card-tint${useId().replace(/:/g, '')}`
  return (
    <div data-reader-shape={`${shape.type}-${shape.index}`} className="relative grid aspect-[226/200] place-items-center">
      <svg aria-hidden className="absolute size-0">
        <filter id={tint} x="0" y="0" width="100%" height="100%" colorInterpolationFilters="sRGB">
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
          {/* A film grain, cut back to the shape. Not on the shelf's small card: drawn at a third of its size its grain is
              finer than a pixel, and its noise, worked out afresh each time a turned book shows, can hold the next
              frame back past a turn by the keys. */}
          {grain && <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="3" stitchTiles="stitch" seed="7" result="noise" />}
          {grain && <feColorMatrix in="noise" type="matrix" values="0.33 0.33 0.33 0 0  0.33 0.33 0.33 0 0  0.33 0.33 0.33 0 0  0 0 0 0 0.55" result="speckle" />}
          {grain && <feBlend in="speckle" in2="mixed" mode="overlay" result="grained" />}
          <feComposite in={grain ? 'grained' : 'mixed'} in2="SourceGraphic" operator="in" />
        </filter>
      </svg>
      {/* A new shape comes up softly, while the colours glide. */}
      <Coolshape key={`${shape.type}-${shape.index}`} type={shape.type} index={shape.index} noise={false} size={168} className={rise ? 'mf-rise' : undefined} style={{ filter: `url(#${tint})` }} />
    </div>
  )
}

/** The card's foot line, and the fact under a book's name in Settings › Books: since its oldest note. */
export const sinceSaid = (since: string | null | undefined): string => (since ? `Kept since ${dayMonth(since, 'always')}` : 'Not begun')

/** A card's three inks (light to deep), set on what wears them: the whole book in Settings, the cover alone on the shelf. */
export const cardInks = (hues: [string, string, string]): CSSProperties =>
  ({ '--mf-card-a': inked(hues[0], 0.82, 0.13), '--mf-card-b': inked(hues[1], 0.66, 0.19), '--mf-card-c': inked(hues[2], 0.44, 0.15) }) as CSSProperties

/** The card's own size, the label pasted on the Settings book's cover: drawn at it, and scaled wherever it is shown smaller (the sidebar's shelf). */
const LABEL = labelOf(BOOK)

/**
 * What is printed on the cover's label: the picture, the book's name, its title, the stamps and the day it began. One
 * drawing for the reader card (Settings, the welcome) and for every book on the sidebar's shelf, scaled. Laid out in the
 * label's own padding (`flex flex-col p-4`). `small`, on the shelf: no hover tips on its stamps (the
 * shelf sits in a menu, and a tip there is a second floating thing) and its picture there at once, never rising in each
 * time the menu opens.
 */
export function CardFace({ seed, name, facts, small = false }: { seed: number; name: string; facts: Facts | null; small?: boolean }): React.JSX.Element {
  const nameLine = useRef<HTMLParagraphElement>(null)
  useFitText(nameLine, name, { most: 22, least: 13, way: 'down' })
  const { title, shape } = cardOf(seed)
  const stamps = facts ? stampsOf(facts) : []
  return (
    <>
      <ShapePicture shape={shape} rise={!small} grain={!small} />
      {/* Smaller the longer the name, so every name up to the field's 60 letters shows whole, in up to three lines. */}
      <p ref={nameLine} data-reader-name className="mt-3 line-clamp-3 leading-[1.12] font-bold tracking-[-0.015em] break-words" style={{ fontFamily: "'Fraunces Variable', Georgia, serif", fontSize: 22 }}>{name || ' '}</p>
      {/* Plain words, not rolled: a roll measures its letters on the page, and on a book turned in 3D (it turns toward the
          pointer) they measure short, so the words were cut through their middles. */}
      <p data-reader-title={title} className="mt-2 font-mono text-[0.5625rem] font-medium tracking-[0.16em] uppercase">{title}</p>
      {/* What the book is, on its own line under its title: beside four stamps it ran off the label ("COMMONPLAC", the user, 24 Nov). */}
      <p aria-hidden data-reader-book className="mt-0.5 font-mono text-[0.5rem] font-medium tracking-[0.14em] uppercase opacity-70">Commonplace book</p>
      {/* The foot: the stamps, and the day's tag under them. */}
      <div className="mt-auto flex flex-col items-stretch gap-2.5 border-t border-current/15 pt-2.5">
        <div className="flex items-end justify-between gap-2">
          {/* Room for a row of stamps, kept even before the first, so the card never changes. */}
          <div data-reader-stamps className="flex min-h-[26px] gap-1">
            {stamps.map((one) => (
              <Tip key={one.said} label={small ? '' : one.said}>
                <span
                  data-reader-stamp={one.said}
                  className="grid size-[26px] place-items-center rounded-full border border-current/60 font-mono text-[0.5625rem] font-medium tracking-tight"
                >{one.label}</span>
              </Tip>
            ))}
          </div>
        </div>
        <div className="flex">
          {/* One quiet line, as a member card's "Member since": no box, no hatching. */}
          <span data-reader-since className="font-mono text-[0.5rem] leading-none font-medium tracking-[0.14em] whitespace-nowrap uppercase">
            {sinceSaid(facts?.since)}
          </span>
        </div>
      </div>
      {/* A printed rule round the label, in its ink, as a pasted cover label has. */}
      <span aria-hidden data-reader-frame className="pointer-events-none absolute inset-[7px] rounded-[1px] border border-current opacity-[0.14]" />
    </>
  )
}

/**
 * A book's cover on the sidebar's shelf: its reader card, the same drawing as in Settings, scaled to the label on the
 * shelf book's cover (`size`) in the card's own inks. The open book's read as Settings reads it: the seed kept in settings, else
 * the name's, and the stamps from the book.
 */
export function ShelfCover({ name, size }: { name: string; size: BookSize }): React.JSX.Element {
  const settings = useLive(haligtree.settings, null as Awaited<ReturnType<typeof haligtree.settings>> | null)
  const facts = useLive(() => call<Facts>('reader:card'), null as Facts | null, [], undefined, 'reader:card')
  return <CardCover name={name} size={size} seed={settings?.readerSeed ?? seedOf(name)} facts={facts} />
}

/**
 * Any other book's cover on the shelf: its own reader card, as main read it from that book's file (books:card,
 * main/books.ts cardOf), so Caelid wears its octagon and Garden its starburst. A book with no file yet: its name's seed, no stamps.
 */
export function OtherCover({ name, size, card }: { name: string; size: BookSize; card: BookCard | null }): React.JSX.Element {
  return <CardCover name={name} size={size} seed={card?.seed ?? seedOf(name)} facts={card?.facts ?? null} />
}

function CardCover({ name, size, seed, facts }: { name: string; size: BookSize; seed: number; facts: Facts | null }): React.JSX.Element {
  // Laid out as the Settings label is and scaled to this book's label, a hair wider or narrower to fill it exactly.
  const label = labelOf(size)
  const scale = label.high / LABEL.high
  return (
    <div data-shelf-card className="absolute top-0 left-0 flex origin-top-left flex-col p-4"
      style={{ width: label.wide / scale, height: LABEL.high, scale, color: 'var(--mf-card-c)', ...cardInks(cardOf(seed).hues) }}>
      <CardFace seed={seed} name={name} facts={facts} small />
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
  // Its shadow on the table: narrower as it turns edge on (a book is wide but thin), and off to the left, away from
  // the light, a little further as the spine comes round.
  // Its width keeps to its resting pose while the book only sways (its arrival, the pointer it watches, the tilt under
  // the hand): only a throw that spins it round narrows it. Following every sway, its width wavered while the page's
  // words were read (welcome-read, Name it, 964ms); it slides with the sway instead (shadowAt).
  const shadowWide = useTransform(() => {
    const angle = ((REST_TURN + spinY.get()) * Math.PI) / 180
    return Math.max(0.22, (Math.abs(Math.cos(angle)) * WIDE_BOOK + Math.abs(Math.sin(angle)) * THICK) / WIDE_BOOK)
  })
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
  const seed = saved ?? seedOf(name)
  const { title, hues } = cardOf(seed)
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
        {/* The book (book-box.tsx): its colours set on the whole book, so the spine and the cover wear the same ink, and
            its cloth the one the shelf's book wears (clothOf). */}
        <BookBox size={BOOK} pitch={pitched} turn={turned} lit={lit} scale={tilt.grow} perspective={1000} name={name} cloth={clothOf(shelf?.color)} ribbon
          style={{ transition: '--mf-card-a 700ms ease-out, --mf-card-b 700ms ease-out, --mf-card-c 700ms ease-out', ...cardInks(hues) }}
          cover={{ 'data-reader-card': '', 'data-hues': hues.join(' ') }} label={{ ref: card, className: 'flex flex-col p-4' }}>
          <CardFace seed={seed} name={name} facts={facts} />
          {/* A soft light where the pointer is, as the card tips. */}
          <motion.span aria-hidden className="pointer-events-none absolute inset-0 rounded-[inherit]" style={{ background: tilt.sheen, opacity: tilt.glow }} />
        </BookBox>
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
