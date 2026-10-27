import { useEffect, useRef, type CSSProperties } from 'react'
import { Shuffle } from 'lucide-react'
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
 * The reader card, Arc's member card for a commonplace book: your book's name,
 * a title drawn from two lists ("Patient Marginalist"), the day the book
 * began, and a round stamp for each milestone reached. Its picture is two of
 * the theme's own hues, and the title and hues follow from one number kept in
 * settings (readerSeed), so the same card shows every time until “Randomize”.
 */

const KINDS = ['Vague', 'Mighty', 'Ancient', 'Patient', 'Restless', 'Gentle', 'Wandering', 'Precious', 'Quiet', 'Curious', 'Tireless', 'Midnight']
const READERS = ['Archivist', 'Collector', 'Scribe', 'Gardener', 'Reader', 'Annotator', 'Keeper', 'Wanderer', 'Marginalist', 'Cartographer', 'Gleaner', 'Copyist']
/** The theme's own hues (the tags'), so the picture suits every theme, light or dark. */
const HUES = ['blue', 'purple', 'pink', 'red', 'orange', 'yellow', 'green', 'brown']

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

/** The title and the picture's two hues and slant a seed gives. */
export function cardOf(seed: number): { title: string; hues: [string, string]; angle: number } {
  const next = drawsFrom(seed)
  const pick = <T,>(list: T[]): T => list[Math.floor(next() * list.length)]
  const first = pick(HUES)
  const second = pick(HUES.filter((one) => one !== first))
  return { title: `${pick(KINDS)} ${pick(READERS)}`, hues: [first, second], angle: Math.round(140 + next() * 80) }
}

/** The stamps reached, in the order they are usually reached. */
function stampsOf(facts: Facts): { label: string; said: string }[] {
  const year = facts.since && Date.now() - new Date(facts.since).getTime() >= 365 * 86400000
  return [
    facts.notes >= 100 && { label: '100', said: 'A hundred notes' },
    facts.linked && { label: 'Link', said: 'A note linked to another' },
    facts.reviewed && { label: 'Gem', said: 'A first gem reviewed' },
    facts.journal >= 30 && { label: '30', said: 'Thirty days of Journal' },
    facts.notes >= 1000 && { label: '1,000', said: 'A thousand notes' },
    year && { label: '1 yr', said: 'A year since the book began' }
  ].filter((one): one is { label: string; said: string } => !!one)
}

/** The card as the window shows it, taken as a PNG: put where it can be seen whole, then taken after it is painted. */
async function pictureOf(card: HTMLElement): Promise<Uint8Array> {
  card.scrollIntoView({ block: 'nearest' })
  await document.fonts.ready
  await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)))
  const box = card.getBoundingClientRect()
  const png = await window.api.pictureOfRect({ x: box.left, y: box.top, width: box.width, height: box.height })
  if (!png) throw new Error('the window gave back no picture')
  return png
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

export function ReaderCard({ seed: saved, point }: { seed: number | undefined; /** Changed when ⌘K's “Your reader card” asks for it: brought into view. */ point?: number }): React.JSX.Element {
  const shelf = useShelf()
  const facts = useLive(() => call<Facts>('reader:card'), null as Facts | null)
  const card = useRef<HTMLDivElement>(null)
  useEffect(() => void (point && card.current?.scrollIntoView({ block: 'center' })), [point])
  const name = shelf?.name ?? ''
  const seed = saved ?? seedOf(name)
  const { title, hues, angle } = cardOf(seed)
  const stamps = facts ? stampsOf(facts) : []
  return (
    <div className="mt-3 flex flex-col items-center gap-3">
      <div
        ref={card}
        data-reader-card
        data-hues={hues.join(' ')}
        className="w-full max-w-[21rem] rounded-2xl border bg-[color-mix(in_oklab,var(--card)_90%,var(--tt-color-text-yellow))] p-3 shadow-sm"
        style={{ '--a': `var(--tt-color-text-${hues[0]})`, '--b': `var(--tt-color-text-${hues[1]})` } as CSSProperties}
      >
        {/* Two bands of colour that meet softly, the way Arc's card is painted. */}
        <div
          aria-hidden
          className="h-28 rounded-xl transition-[background] duration-500"
          style={{ background: `radial-gradient(120% 90% at 20% 15%, color-mix(in oklab, var(--a) 55%, white) 0%, transparent 60%), linear-gradient(${angle}deg, var(--a) 0%, var(--a) 38%, var(--b) 72%, var(--b) 100%)` }}
        />
        <div className="px-2 pt-4 pb-1">
          <p data-reader-name className="truncate text-[1.75rem] leading-tight font-bold tracking-[-0.02em] text-foreground" style={{ fontFamily: "'Fraunces Variable', Georgia, serif" }}>{name || ' '}</p>
          <p data-reader-title={title} className="mt-1 font-mono text-[0.75rem] tracking-[0.14em] text-foreground/80 uppercase"><Rolling text={title} by="word" /></p>
          <p data-reader-since className="mt-1 text-[0.8125rem] whitespace-nowrap text-foreground/80">{facts?.since ? `Since ${dayMonth(facts.since, 'always')}` : 'Not started yet'}</p>
          {/* Room for every stamp on one line, kept even before the first, so the card never changes height. */}
          <div className="mt-4 flex min-h-11 items-end justify-end">
            <div data-reader-stamps className="flex gap-1">
              {stamps.map((one, at) => (
                <Tip key={one.label} label={one.said}>
                  <span
                    data-reader-stamp={one.said}
                    className="grid size-11 place-items-center rounded-full border-[1.5px] border-dashed font-mono text-[0.625rem] font-semibold tracking-wide uppercase"
                    style={{ color: `var(--${at % 2 ? 'b' : 'a'})`, borderColor: `var(--${at % 2 ? 'b' : 'a'})`, rotate: `${((seed >>> at) % 7) * 3 - 9}deg` }}
                  >{one.label}</span>
                </Tip>
              ))}
            </div>
          </div>
        </div>
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        <Button variant="outline" size="sm" data-reader-randomize onClick={() => {
          let next = seed
          // A new draw, never the one on show.
          while (cardOf(next).title === title) next = Math.floor(Math.random() * 2 ** 31)
          chime('anew')
          void haligtree.setSettings({ readerSeed: next })
        }}><Shuffle className="size-4" /> Randomize</Button>
        <Button variant="outline" size="sm" data-reader-save onClick={() => void shareCard(card.current, true, name)}><AliveIcon icon={DownloadIcon} size={16} /> Save as image…</Button>
        <Button variant="outline" size="sm" data-reader-copy onClick={() => void shareCard(card.current, false, name)}><AliveIcon icon={CopyIcon} size={16} /> Copy as image</Button>
      </div>
    </div>
  )
}
