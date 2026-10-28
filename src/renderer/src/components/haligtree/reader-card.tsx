import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react'
import { Gem, Link2, Rows2, Shapes, Shuffle } from 'lucide-react'
import { Coolshape, shapes } from 'coolshapes-react'
import { motion } from 'motion/react'
import { Button } from '@/components/ui/button'
import { AliveIcon } from '@/components/ui/alive-icon'
import CopyIcon from '@/components/ui/copy-icon'
import DownloadIcon from '@/components/ui/download-icon'
import { call, haligtree, useLive } from '@/lib/haligtree'
import { useShelf } from '@/lib/books'
import { chime } from '@/lib/sound'
import { dayMonth } from '../../../../main/dates'
import { Rolling, Tip, refuse, toast } from './ui'
import { useTilt } from './tilt'

/**
 * The reader card, Arc's member card for a commonplace book: a printed card of
 * cream paper with a picture at the top (a shape from coolshapes, or two bands
 * of colour parted by a cream arch, both with a film grain), your book's
 * name, a title drawn from two lists ("Patient Marginalist"), a round stamp
 * for each milestone reached and a small tag with the day the book began. Its colours are three of the theme's own hues, made
 * rich enough to print, and the title and hues follow from one number kept in
 * settings (readerSeed), so the same card shows every time until “Randomize”.
 */

// Mostly the Lands Between (Elden Ring), a few from Lordran and Drangleic (Dark Souls), and a few of the book's own.
const KINDS = ['Grace-Given', 'Erdtree', 'Haligtree', 'Golden', 'Starscourge', 'Ashen', 'Undead', 'Chosen', 'Hollow', 'Moonlit', 'Carian', 'Crucible', 'Rune-Bearing', 'Wandering', 'Restless', 'Patient', 'Midnight', 'Dragon-Kin', 'Bell-Bearing']
const READERS = ['Tarnished', 'Elden Lord', 'Finger Reader', 'Lorekeeper', 'Scholar', 'Sorcerer', 'Knight', 'Pilgrim', 'Maiden', 'Hunter', 'Archivist', 'Gleaner', 'Sentinel', 'Firekeeper', 'Wretch', 'Prophet', 'Astrologer', 'Vagabond', 'Confessor', 'Champion']
/** The theme's own hues (the tags'), warm to cool, so three in a row always sit well together. Never green beside yellow (their mix is olive), and no brown: both only muddied the bands. */
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

/** The card's corners, rounded as on screen. */
const ROUND = 5

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
async function shareCard(card: HTMLElement | null, save: boolean, name: string, level: () => void): Promise<void> {
  if (!card) return
  level()
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

/** The picture's size, in its own units: the card's width less its margins. */
const WIDE = 226
const HIGH = 200

/**
 * Two bands of colour with a cream arch between: the top band's lower edge
 * bows down, the bottom band's upper edge bows up, so the cream is thinnest in
 * the middle. Each band is a gradient of the card's colours, which glide to
 * the new ones on “Randomize” (they are registered colours, main.css). A film
 * grain lies over the bands alone, as on the welcome's gradient: fine grey
 * noise, laid on with “overlay” so it lightens and darkens the colour beneath
 * without greying it, and kept off the cream.
 */
function Bands(): React.JSX.Element {
  return (
    <svg aria-hidden viewBox={`0 0 ${WIDE} ${HIGH}`} className="block w-full">
      <defs>
        <linearGradient id="mf-card-top" x1="0" y1="0" x2="0.35" y2="1">
          <stop offset="0" style={{ stopColor: 'var(--mf-card-a)' }} />
          <stop offset="1" style={{ stopColor: 'var(--mf-card-b)' }} />
        </linearGradient>
        <linearGradient id="mf-card-bottom" x1="0.65" y1="0" x2="0" y2="1">
          <stop offset="0" style={{ stopColor: 'var(--mf-card-b)' }} />
          <stop offset="1" style={{ stopColor: 'var(--mf-card-c)' }} />
        </linearGradient>
        <filter id="mf-card-grain" x="0" y="0" width="100%" height="100%" colorInterpolationFilters="sRGB">
          <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="3" stitchTiles="stitch" seed="7" result="noise" />
          {/* Grey, and as strong everywhere: the noise's own see-through spots would only thin it. */}
          <feColorMatrix in="noise" type="matrix" values="0.33 0.33 0.33 0 0  0.33 0.33 0.33 0 0  0.33 0.33 0.33 0 0  0 0 0 0 0.55" result="grey" />
          <feBlend in="grey" in2="SourceGraphic" mode="overlay" result="grained" />
          <feComposite in="grained" in2="SourceGraphic" operator="in" />
        </filter>
      </defs>
      <g filter="url(#mf-card-grain)">
        <path d={`M0 0H${WIDE}V96Q${WIDE / 2} 128 0 96Z`} fill="url(#mf-card-top)" />
        <path d={`M0 ${HIGH}V142Q${WIDE / 2} 106 ${WIDE} 142V${HIGH}Z`} fill="url(#mf-card-bottom)" />
      </g>
    </svg>
  )
}

/**
 * One coolshape on the cream, in the card's colours: its blurred blobs give
 * the light and dark, and a filter maps the dark to the card's deepest hue,
 * the middle to its middle one and the light to its lightest, then lays on
 * the bands' grain. So a star or a flower wears the same colours as the name
 * under it, and glides with them on “Randomize”. Pictured at the bands' size,
 * so the card never changes.
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
          {/* The same grain as the bands', then cut back to the shape. */}
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

export function ReaderCard({ seed: saved, picture = 'shape', point, named, bare = false }: {
  seed: number | undefined
  /** The name to show in place of the open book's: the welcome's, as it is typed. */
  named?: string
  /** The card alone, without its copy, save, picture and Randomize buttons. */
  bare?: boolean
  /** The picture at the top: a coolshape, or the two bands (readerPicture). */
  picture?: 'shape' | 'bands'
  /** Changed when ⌘K's “Your reader card” asks for it: brought into view. */
  point?: number
}): React.JSX.Element {
  const shelf = useShelf()
  const facts = useLive(() => call<Facts>('reader:card'), null as Facts | null)
  const card = useRef<HTMLDivElement>(null)
  // The card tips toward the pointer as a picture in full screen does (tilt.tsx), a little less far: it is held, not studied.
  const tilt = useTilt(7, 1.02)
  // Flat at once, no spring and no sheen, before its picture is taken.
  const level = (): void => {
    tilt.flat()
    for (const one of [tilt.x, tilt.y, tilt.glow]) one.jump(0)
    tilt.grow.jump(1)
  }
  useEffect(() => void (point && card.current?.scrollIntoView({ block: 'center' })), [point])
  const name = shelf?.name ?? ''
  const seed = saved ?? seedOf(name)
  const { title, hues, shape } = cardOf(seed)
  const stamps = facts ? stampsOf(facts) : []
  const actions: { tip: string; icon: ReactNode; data: string; run: () => void }[] = [
    { tip: 'Copy as image', icon: <AliveIcon icon={CopyIcon} size={15} />, data: 'data-reader-copy', run: () => void shareCard(card.current, false, name, level) },
    { tip: 'Save as image…', icon: <AliveIcon icon={DownloadIcon} size={15} />, data: 'data-reader-save', run: () => void shareCard(card.current, true, name, level) },
    picture === 'shape'
      ? { tip: 'Show two bands instead', icon: <Rows2 className="size-[15px]" />, data: 'data-reader-picture', run: () => void haligtree.setSettings({ readerPicture: 'bands' }) }
      : { tip: 'Show a shape instead', icon: <Shapes className="size-[15px]" />, data: 'data-reader-picture', run: () => void haligtree.setSettings({ readerPicture: 'shape' }) },
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
      <div data-reader-hold onPointerMove={(event) => void tilt.lean(event, event.currentTarget)} onPointerLeave={tilt.flat}>
        {/* Cream paper in every theme, as a printed card is: its words take the card's own colour, never the theme's. */}
        <motion.div
          ref={card}
          data-reader-card
          data-hues={hues.join(' ')}
          data-picture={picture}
          className="relative flex h-[375px] w-[250px] shrink-0 flex-col bg-[#fffbea] p-3 shadow-[0_1px_2px_rgb(0_0_0/0.08),0_12px_32px_-8px_rgb(0_0_0/0.28)]"
          style={{ rotateX: tilt.x, rotateY: tilt.y, scale: tilt.grow, transformPerspective: 700, ...({ borderRadius: ROUND, transition: '--mf-card-a 700ms ease-out, --mf-card-b 700ms ease-out, --mf-card-c 700ms ease-out', color: 'var(--mf-card-c)', '--mf-card-a': inked(hues[0], 0.82, 0.13), '--mf-card-b': inked(hues[1], 0.66, 0.19), '--mf-card-c': inked(hues[2], 0.44, 0.15) } as CSSProperties) }}
        >
          {picture === 'shape' ? <ShapePicture shape={shape} /> : <div className="overflow-hidden rounded-[2px]"><Bands /></div>}
          <p data-reader-name className="mt-3 line-clamp-2 text-[1.375rem] leading-[1.12] font-bold tracking-[-0.015em] break-words" style={{ fontFamily: "'Fraunces Variable', Georgia, serif" }}>{name || ' '}</p>
          <p data-reader-title={title} className="mt-1.5 font-mono text-[0.625rem] font-medium tracking-[0.16em] uppercase"><Rolling text={title} by="word" /></p>
          <div className="mt-auto flex items-end justify-between gap-2">
            <div className="flex min-w-0 flex-col items-start gap-2">
              {/* Room for a row of stamps, kept even before the first, so the card never changes. */}
              <div data-reader-stamps className="flex min-h-[30px] pl-1.5">
                {stamps.map((one, at) => (
                  <Tip key={one.said} label={one.said}>
                    <span
                      data-reader-stamp={one.said}
                      className="-ml-1.5 grid size-[30px] place-items-center rounded-full border-[1.5px] border-current bg-[#fffbea] font-mono text-[0.5625rem] font-bold tracking-tight"
                      style={{ rotate: `${((seed >>> at) % 5) * 2 - 4}deg` }}
                    >{one.label}</span>
                  </Tip>
                ))}
              </div>
              <span data-reader-since className="flex items-stretch border border-current font-mono text-[0.4375rem] leading-none font-medium tracking-[0.05em] whitespace-nowrap uppercase">
                <span className="px-1 py-[3px]">Haligtree</span>
                <span aria-hidden className="w-2.5 border-x border-current bg-[repeating-linear-gradient(135deg,currentColor_0_1px,transparent_1px_3px)]" />
                <span className="px-1 py-[3px]">{facts?.since ? dayMonth(facts.since, 'always') : 'Not begun'}</span>
              </span>
            </div>
            <p aria-hidden data-reader-book className="shrink-0 text-right text-[0.5625rem] leading-[1.2] font-semibold tracking-[0.08em] uppercase" style={{ fontFamily: "'Fraunces Variable', Georgia, serif" }}>Commonplace<br />Book</p>
          </div>
          {/* A soft light where the pointer is, as the card tips. */}
          <motion.span aria-hidden className="pointer-events-none absolute inset-0 rounded-[inherit]" style={{ background: tilt.sheen, opacity: tilt.glow }} />
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
