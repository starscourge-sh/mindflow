import { useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'

import { Button } from '@/components/ui/button'
import { refuse, toast } from '@/components/haligtree/ui'
import { FLOAT } from '@/lib/float'
import { chime } from '@/lib/sound'
import { UNATTRIBUTED } from '@/lib/sources'
import { APP_NAME } from '../../../main/name'
import { linesIn } from '../../../main/blocks'

/**
 * A quote as a card to send or post: its words large in the heading font, who
 * said it and where under them, in the theme's own colours. Drawn on a canvas
 * at the size it is shared at (a square post, or a phone's story), so the
 * sheet shows exactly the picture that is copied or saved.
 */
export type CardQuote = { words: string; who?: string | null; from?: string | null }

const SIZES = {
  square: { label: 'Square', width: 1080, height: 1080, type: 88 },
  story: { label: 'Story', width: 1080, height: 1920, type: 96 }
} as const
type Size = keyof typeof SIZES

/** A CSS variable of the theme, as a colour the canvas can paint. */
const themed = (name: string, fallback: string): string => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback
const fontOf = (name: string, fallback: string): string => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback

/** Words in lines no wider than `width`, at the canvas's current font. */
function wrap(ink: CanvasRenderingContext2D, text: string, width: number): string[] {
  const lines: string[] = []
  for (const paragraph of text.split(/\n+/)) {
    let line = ''
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word
      if (line && ink.measureText(next).width > width) (lines.push(line), (line = word))
      else line = next
    }
    if (line) lines.push(line)
  }
  return lines
}

/** The card, drawn. */
export async function drawCard(canvas: HTMLCanvasElement, quote: CardQuote, size: Size): Promise<void> {
  const { width, height, type } = SIZES[size]
  canvas.width = width
  canvas.height = height
  const ink = canvas.getContext('2d')!
  const paper = themed('--background', '#f5efe2')
  const words = themed('--foreground', '#2b2522')
  const quiet = themed('--muted-foreground', '#7a6f66')
  const brand = themed('--tt-brand-color-400', '#a0662a')
  const heading = fontOf('--mf-heading-font', '') || 'Fraunces, Georgia, serif'
  const text = fontOf('--mf-font', '') || '-apple-system, system-ui, sans-serif'
  await document.fonts.ready

  ink.fillStyle = paper
  ink.fillRect(0, 0, width, height)
  const pad = 112
  const column = width - pad * 2
  const who = quote.who && quote.who !== UNATTRIBUTED ? quote.who : ''
  const from = quote.from?.trim() ?? ''

  // The words as large as fit: smaller only until every line sits in the room left by the name under them.
  const room = height - pad * 2 - 150 - (who ? 64 : 0) - (from ? 52 : 0)
  let at = type
  let lines: string[] = []
  for (; at >= 30; at -= 2) {
    ink.font = `500 ${at}px ${heading}`
    lines = wrap(ink, quote.words.trim(), column)
    if (lines.length * at * 1.3 <= room) break
  }
  const lead = at * 1.3
  const block = 120 + lines.length * lead + (who || from ? 56 : 0) + (who ? 64 : 0) + (from ? 52 : 0)
  let y = Math.max(pad, (height - block) / 2)

  // The opening mark, in the theme's own accent.
  ink.fillStyle = brand
  ink.font = `600 220px ${heading}`
  ink.textBaseline = 'top'
  ink.fillText('“', pad - 8, y - 40)
  y += 120

  ink.fillStyle = words
  ink.font = `500 ${at}px ${heading}`
  for (const line of lines) (ink.fillText(line, pad, y), (y += lead))

  // A short rule, then who and where: only when there is someone to name.
  if (who || from) {
    y += 40
    ink.fillStyle = brand
    ink.fillRect(pad, y, 64, 4)
    y += 28
  }
  if (who) {
    ink.fillStyle = words
    ink.font = `600 40px ${text}`
    ink.fillText(wrap(ink, who, column)[0] ?? '', pad, y)
    y += 64
  }
  if (from) {
    ink.fillStyle = quiet
    ink.font = `400 34px ${text}`
    ink.fillText(wrap(ink, from, column)[0] ?? '', pad, y)
  }

  // Where it was kept, small, at the foot.
  ink.fillStyle = quiet
  ink.font = `500 30px ${text}`
  ink.textBaseline = 'alphabetic'
  ink.fillText(APP_NAME, width - pad - ink.measureText(APP_NAME).width, height - pad / 2 - 8)
}

/** A note's words for its card: its lines (not its headings), or its title when it has none. */
const wordsIn = (body: unknown, title: string): string => {
  const lines = linesIn(body).filter((one) => !one.heading && one.text.trim()).map((one) => one.text.trim())
  return (lines.join('\n') || title).slice(0, 600)
}

/** A note's menu line for its card, in the same Export group as its picture. */
export const cardItem = (note: { body: () => Promise<unknown>; title: string; attribution?: string | null; medium?: string | null }): { label: string; hint: string; run: () => void } => ({
  label: 'Share as card…',
  hint: 'The quote as a picture to post, square or story',
  // Its words as kept now, read as the line is picked: a list row carries only its title.
  run: () => void note.body().catch(() => null).then((body) => shareAsCard({ words: wordsIn(body, note.title), who: note.attribution, from: note.medium }))
})

const pngOf = async(canvas: HTMLCanvasElement): Promise<Uint8Array> => {
  const blob = await new Promise<Blob | null>((done) => canvas.toBlob(done, 'image/png'))
  if (!blob) throw new Error('the card could not be drawn')
  return new Uint8Array(await blob.arrayBuffer())
}

/** Open the sheet for a quote: the card first, then Square or Story, Copy or Save. */
export function shareAsCard(quote: CardQuote): void {
  if (!quote.words.trim()) return refuse('Nothing to put on a card. Pick some words first')
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  chime('open')
  root.render(<CardSheet quote={quote} onClose={() => (root.unmount(), host.remove())} />)
}

function CardSheet({ quote, onClose }: { quote: CardQuote; onClose: () => void }): React.JSX.Element {
  const canvas = useRef<HTMLCanvasElement>(null)
  const [size, setSize] = useState<Size>('square')
  useEffect(() => {
    const draw = (): void => void (canvas.current && drawCard(canvas.current, quote, size))
    draw()
    // In the theme on screen: drawn again when it changes (light to dark, another theme) while the sheet is open.
    const watch = new MutationObserver(draw)
    watch.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'style', 'data-style', 'data-light'] })
    return () => watch.disconnect()
  }, [quote, size])
  useEffect(() => {
    const keys = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      onClose()
    }
    window.addEventListener('keydown', keys, true)
    return () => window.removeEventListener('keydown', keys, true)
  }, [onClose])
  const name = `${(quote.who && quote.who !== UNATTRIBUTED ? quote.who : quote.words).replace(/[/\\:\0\n]/g, ' ').trim().slice(0, 50)} card.png`
  const copy = async (): Promise<void> => {
    if (!canvas.current) return
    if (!(await window.api.copyPicture(await pngOf(canvas.current)))) return refuse('Could not put the card on the clipboard', 'error')
    chime('shutter')
    toast('Card copied as an image')
    onClose()
  }
  const save = async (): Promise<void> => {
    if (!canvas.current) return
    if (await window.api.savePicture(name, await pngOf(canvas.current))) (chime('shutter'), toast('Card saved as an image'), onClose())
  }
  return (
    <div data-share-card className="fixed inset-0 z-[1000] grid place-items-center bg-black/40 animate-in fade-in-0 duration-150" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div role="dialog" aria-label="Share as card" className={`flex max-h-[calc(100vh-48px)] w-[440px] max-w-[calc(100vw-24px)] flex-col gap-4 rounded-xl p-5 ${FLOAT} animate-in zoom-in-95 duration-200`}>
        <h2 className="font-serif text-xl leading-tight font-semibold text-foreground">Share as card</h2>
        <div className="grid min-h-0 place-items-center">
          <canvas ref={canvas} data-card-canvas className="max-h-[56vh] max-w-full rounded-lg border border-border object-contain" style={{ aspectRatio: `${SIZES[size].width} / ${SIZES[size].height}` }} />
        </div>
        <div role="radiogroup" aria-label="Card size" className="flex gap-1 self-start rounded-lg bg-accent/60 p-1">
          {(Object.keys(SIZES) as Size[]).map((one) => (
            <button key={one} type="button" role="radio" aria-checked={size === one} data-card-size={one}
              onClick={() => size !== one && (chime('tap'), setSize(one))}
              className={`cursor-pointer rounded-md px-3 py-1 text-control transition-colors active:scale-[0.97] ${size === one ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
              {SIZES[one].label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" onClick={onClose} className="text-control">Cancel <kbd className="ml-1 font-sans text-key opacity-70">Esc</kbd></Button>
          <span className="flex-1" />
          <Button variant="secondary" data-card-save onClick={() => void save()} className="text-control">Save as PNG…</Button>
          <Button data-card-copy onClick={() => void copy()} className="text-control">Copy</Button>
        </div>
      </div>
    </div>
  )
}
