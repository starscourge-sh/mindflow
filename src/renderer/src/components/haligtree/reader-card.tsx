import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react'
import { Gem, Link2, Shuffle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { AliveIcon } from '@/components/ui/alive-icon'
import CopyIcon from '@/components/ui/copy-icon'
import DownloadIcon from '@/components/ui/download-icon'
import { call, haligtree, useLive } from '@/lib/haligtree'
import { useShelf } from '@/lib/books'
import { chime } from '@/lib/sound'
import { dayMonth } from '../../../../main/dates'
import { Rolling, Tip, refuse, toast } from './ui'

/**
 * The reader card, Arc's member card for a commonplace book: a printed card of
 * cream paper with a picture at the top (two bands of colour parted by a cream
 * arch), your book's name, a title drawn from two lists ("Patient
 * Marginalist"), a round stamp for each milestone reached and a small tag with
 * the day the book began. Its colours are three of the theme's own hues, made
 * rich enough to print, and the title and hues follow from one number kept in
 * settings (readerSeed), so the same card shows every time until “Randomize”.
 */

const KINDS = ['Vague', 'Mighty', 'Ancient', 'Patient', 'Restless', 'Gentle', 'Wandering', 'Precious', 'Quiet', 'Curious', 'Tireless', 'Midnight']
const READERS = ['Archivist', 'Collector', 'Scribe', 'Gardener', 'Reader', 'Annotator', 'Keeper', 'Wanderer', 'Marginalist', 'Cartographer', 'Gleaner', 'Copyist']
/** The theme's own hues (the tags'), warm to cool, so three in a row always sit well together. Never green beside yellow (their mix is olive), and no brown: both only muddied the bands. */
const HUES = ['yellow', 'orange', 'red', 'pink', 'purple', 'blue', 'green']

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

/** A seed from the book's name, for a card never randomized: each book its own. */
const seedOf = (name: string): number => [...name].reduce((sum, letter) => (Math.imul(sum, 31) + letter.charCodeAt(0)) >>> 0, 7)

/** The title and the picture's three hues a seed gives: three neighbours in the run, either way round, light to deep. */
export function cardOf(seed: number): { title: string; hues: [string, string, string] } {
  const next = drawsFrom(seed)
  const pick = <T,>(list: T[]): T => list[Math.floor(next() * list.length)]
  const start = Math.floor(next() * (HUES.length - 2))
  const reversed = next() < 0.5
  const hues = HUES.slice(start, start + 3) as [string, string, string]
  if (reversed) hues.reverse()
  // The last is the deepest, and the name is written in it: yellow made deep is olive, so it goes first instead.
  if (hues[2] === 'yellow') hues.reverse()
  return { title: `${pick(KINDS)} ${pick(READERS)}`, hues }
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
async function shareCard(card: HTMLElement | null, save: boolean, name: string): Promise<void> {
  if (!card) return
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
 * the new ones on “Randomize” (they are registered colours, main.css).
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
      </defs>
      <path d={`M0 0H${WIDE}V96Q${WIDE / 2} 128 0 96Z`} fill="url(#mf-card-top)" />
      <path d={`M0 ${HIGH}V142Q${WIDE / 2} 106 ${WIDE} 142V${HIGH}Z`} fill="url(#mf-card-bottom)" />
    </svg>
  )
}

export function ReaderCard({ seed: saved, point }: { seed: number | undefined; /** Changed when ⌘K's “Your reader card” asks for it: brought into view. */ point?: number }): React.JSX.Element {
  const shelf = useShelf()
  const facts = useLive(() => call<Facts>('reader:card'), null as Facts | null)
  const card = useRef<HTMLDivElement>(null)
  useEffect(() => void (point && card.current?.scrollIntoView({ block: 'center' })), [point])
  const name = shelf?.name ?? ''
  const seed = saved ?? seedOf(name)
  const { title, hues } = cardOf(seed)
  const stamps = facts ? stampsOf(facts) : []
  const actions: { tip: string; icon: ReactNode; data: string; run: () => void }[] = [
    { tip: 'Copy as image', icon: <AliveIcon icon={CopyIcon} size={15} />, data: 'data-reader-copy', run: () => void shareCard(card.current, false, name) },
    { tip: 'Save as image…', icon: <AliveIcon icon={DownloadIcon} size={15} />, data: 'data-reader-save', run: () => void shareCard(card.current, true, name) },
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
    <div className="flex flex-col items-center gap-4 pt-6 pb-2">
      {/* Cream paper in every theme, as a printed card is: its words take the card's own colour, never the theme's. */}
      <div
        ref={card}
        data-reader-card
        data-hues={hues.join(' ')}
        className="flex h-[375px] w-[250px] shrink-0 flex-col bg-[#fffbea] p-3 shadow-[0_1px_2px_rgb(0_0_0/0.08),0_12px_32px_-8px_rgb(0_0_0/0.28)]"
        style={{ borderRadius: ROUND, transition: '--mf-card-a 700ms ease-out, --mf-card-b 700ms ease-out, --mf-card-c 700ms ease-out', color: 'var(--mf-card-c)', '--mf-card-a': inked(hues[0], 0.82, 0.13), '--mf-card-b': inked(hues[1], 0.66, 0.19), '--mf-card-c': inked(hues[2], 0.44, 0.15) } as CSSProperties}
      >
        <div className="overflow-hidden rounded-[2px]"><Bands /></div>
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
            <span data-reader-since className="flex items-stretch border border-current font-mono text-[0.4375rem] leading-none font-medium tracking-[0.08em] whitespace-nowrap uppercase">
              <span className="px-1.5 py-[3px]">Haligtree</span>
              <span aria-hidden className="w-2.5 border-x border-current bg-[repeating-linear-gradient(135deg,currentColor_0_1px,transparent_1px_3px)]" />
              <span className="px-1.5 py-[3px]">{facts?.since ? dayMonth(facts.since, 'always') : 'Not begun'}</span>
            </span>
          </div>
          <p aria-hidden className="shrink-0 text-right text-[0.5625rem] leading-[1.2] font-semibold tracking-[0.1em] uppercase" style={{ fontFamily: "'Fraunces Variable', Georgia, serif" }}>Commonplace<br />Book</p>
        </div>
      </div>
      <div className="flex gap-1">
        {actions.map((one) => (
          <Tip key={one.tip} label={one.tip}>
            <Button variant="ghost" size="icon" aria-label={one.tip} {...{ [one.data]: '' }} onClick={one.run} className="text-muted-foreground hover:text-foreground">{one.icon}</Button>
          </Tip>
        ))}
      </div>
    </div>
  )
}
