import { useEffect, useState, type ReactNode } from 'react'
import { contrast } from '@/lib/on-accent'

import { chime } from '@/lib/sound'
import { keyFor } from '@/lib/keys'
import { smallPicture } from '@/lib/notes'
import { AliveIcon } from '@/components/ui/alive-icon'
import DotsHorizontalIcon from '@/components/ui/dots-horizontal-icon'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuShortcut, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { openLook } from '@/components/image/image-look'
import { RowMenu, flat, type MenuItem, type RowItem } from './row-menu'
import { Tip } from './ui'
import { GrainFill, PAPER_INK, useNoteCover } from './grain'
import { Tilt } from './tilt'
import { PICKED_MARK } from './pick-mixed'
import { BookOpen as Read } from '@/components/ui/icons'

/**
 * A collection read as a page, the way a music app shows an album: a band
 * tinted from its cover, the cover, what it is, its name set large, a line of
 * counts, then a row of what you can do with it. The tag page and an open
 * question share it.
 */

type RGB = [number, number, number]

/** Any CSS colour, `var(--x)` and oklch too, as sRGB: the browser works it out, a canvas reads it. */
function rgbOf(css: string): RGB {
  const probe = document.createElement('i')
  probe.style.color = css
  document.body.append(probe)
  const said = getComputedStyle(probe).color
  probe.remove()
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 1
  const context = canvas.getContext('2d', { willReadFrequently: true })!
  context.fillStyle = said
  context.fillRect(0, 0, 1, 1)
  const [r, g, b] = context.getImageData(0, 0, 1, 1).data
  return [r, g, b]
}

/**
 * A picture's colour: shrunk to a few pixels and averaged, the vivid pixels
 * counting for more, so a red cup on a grey table reads red, not grey. Once
 * per picture.
 */
const sampled = new Map<string, Promise<RGB | null>>()
function colourOf(src: string): Promise<RGB | null> {
  if (!sampled.has(src))
    // The small copy the main process makes for lists: a data URL, which a canvas may read, where the stored file is another origin.
    sampled.set(src, (src.startsWith('mindflow:') ? smallPicture(src) : Promise.resolve(src))
      .then(async (small) => {
        if (!small) throw new Error('no picture')
        const image = new Image()
        image.crossOrigin = 'anonymous'
        image.src = small
        await image.decode()
        return image
      })
      .then((image) => {
        const canvas = document.createElement('canvas')
        canvas.width = canvas.height = 16
        const context = canvas.getContext('2d', { willReadFrequently: true })!
        context.drawImage(image, 0, 0, 16, 16)
        const data = context.getImageData(0, 0, 16, 16).data
        const sum = [0, 0, 0, 0]
        for (let at = 0; at < data.length; at += 4) {
          const [r, g, b, a] = [data[at], data[at + 1], data[at + 2], data[at + 3]]
          const weight = (a / 255) * (0.08 + ((Math.max(r, g, b) - Math.min(r, g, b)) / 255) ** 1.5)
          sum[0] += r * weight
          sum[1] += g * weight
          sum[2] += b * weight
          sum[3] += weight
        }
        return sum[3] ? (sum.slice(0, 3).map((v) => Math.round(v / sum[3])) as RGB) : null
      })
      .catch(() => null))
  return sampled.get(src)!
}

/** Worked out again when the theme changes: a light band in a dark theme would shout. */
function useTheme(): number {
  const [turn, setTurn] = useState(0)
  useEffect(() => {
    const watch = new MutationObserver(() => setTurn((n) => n + 1))
    watch.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'style', 'data-theme', 'data-solid'] })
    return () => watch.disconnect()
  }, [])
  return turn
}

/**
 * The band's colour: the cover's (or the given colour), mixed into the page
 * colour only as far as the words, plain and grey, still read at 4.5 to 1
 * over it, in light themes and dark.
 */
export function useTint(src: string | null | undefined, colour: string | null | undefined): string | null {
  const theme = useTheme()
  const [tint, setTint] = useState<string | null>(null)
  useEffect(() => {
    let live = true
    void (src ? colourOf(src) : Promise.resolve(null)).then((found) => {
      if (!live) return
      const from = found ?? (colour ? rgbOf(colour) : null)
      if (!from) return setTint(null)
      const style = getComputedStyle(document.documentElement)
      const page = rgbOf(style.getPropertyValue('--background'))
      const inks = [rgbOf(style.getPropertyValue('--foreground')), rgbOf(style.getPropertyValue('--muted-foreground'))]
      for (let share = 0.55; share > 0.04; share -= 0.01) {
        const mixed = page.map((c, i) => Math.round(share * from[i] + (1 - share) * c)) as RGB
        if (inks.every((ink) => contrast(ink, mixed) >= 4.6)) return setTint(`rgb(${mixed.join(' ')})`)
      }
      setTint(null)
    })
    return () => void (live = false)
  }, [src, colour, theme])
  return tint
}

/**
 * The square on the left: a picture, or a tile with words or a mark on it,
 * over a grain cover tinted its colour (or the colour alone, with no Covers
 * folder). A picture opens large in Quick Look, lifting from where it sits.
 */
export function Cover({ src, colour, seed, children, caption = '' }: { src?: string | null; colour: string; seed?: string; children?: ReactNode; caption?: string }): React.JSX.Element {
  const [broken, setBroken] = useState(false)
  const grain = useNoteCover(seed)
  useEffect(() => setBroken(false), [src])
  const box = 'relative aspect-square w-24 shrink-0 overflow-hidden rounded-lg shadow-[0_10px_30px_-8px_rgb(0_0_0/0.45),0_2px_8px_rgb(0_0_0/0.18)] [container-type:inline-size] @[30rem]/band:w-32 @[44rem]/band:w-44 @[60rem]/band:w-52'
  if (src && !broken) {
    const picture = <img src={src} alt="" draggable={false} onError={() => setBroken(true)} className="size-full object-cover" />
    return (
      <Tilt className="shrink-0 rounded-lg" caption={caption || undefined}>
        <Tip label="Look at it">
          <button type="button" onClick={(event) => (chime('look'), void openLook(src, event.currentTarget.querySelector('img'), caption))} className={`${box} cursor-zoom-in transition-transform duration-150 ease-out active:scale-[0.98]`}>{picture}</button>
        </Tip>
      </Tilt>
    )
  }
  return (
    <div className={box} style={grain ? undefined : { background: `linear-gradient(140deg, color-mix(in oklab, ${colour} 78%, white), color-mix(in oklab, ${colour} 72%, black))` }}>
      {grain && <GrainFill cover={grain} tint={colour} />}
      <div className={`absolute inset-0 flex items-end p-[9cqi] font-heading text-[clamp(0.75rem,14cqi,2.5rem)] leading-none font-bold tracking-[-0.03em] break-all ${grain?.paper ? '' : 'text-white drop-shadow-[0_1px_2px_rgb(0_0_0/0.25)]'}`} style={grain?.paper ? { color: PAPER_INK } : undefined}>{children}</div>
    </div>
  )
}

/**
 * The header itself. `title` is the name, or a field to change it in; `meta`
 * its counts, the first part in the ink colour; `actions` the row under it.
 * `length`, the title's characters: a long one is set smaller, as a music app
 * sets a long album name, so a sentence never towers over the page.
 */
export function CollectionHeader({ tint, cover, label, title, length = 0, meta, actions }: {
  tint: string | null
  cover: ReactNode
  label: string
  title: ReactNode
  length?: number
  meta: string[]
  actions: ReactNode
}): React.JSX.Element {
  return (
    <header
      className="@container/band relative"
      // The colour runs down behind the actions and fades into the page, as the band does in a music app.
      // It rises out of the page too, so no hard edge sits under the page's header line like a stray band.
      style={{ background: tint ? `linear-gradient(180deg, var(--background) 0%, ${tint} 30%, ${tint} 50%, var(--background) 100%)` : undefined }}
    >
      <div className="page-column flex items-end gap-4 px-5 pt-6 pb-4 @[44rem]/band:gap-6 @[44rem]/band:px-8 @[44rem]/band:pt-10 @[44rem]/band:pb-5">
        {cover}
        <div className="flex min-w-0 flex-1 flex-col gap-1 @[44rem]/band:gap-2">
          <span className="text-xs font-medium text-foreground/90">{label}</span>
          <div className={`min-w-0 font-heading ${length > 70 ? 'text-[clamp(1.25rem,3.2cqi,2.25rem)] leading-[1.12]' : length > 28 ? 'text-[clamp(1.4rem,4.4cqi,3.25rem)] leading-[1.06]' : 'text-[clamp(1.6rem,6.5cqi,5rem)] leading-[1.02]'} font-bold tracking-[-0.035em] text-balance break-words text-foreground [&>span]:line-clamp-3`}>{title}</div>
          <p className="mt-1 line-clamp-2 text-control text-muted-foreground">
            {meta.map((part, index) => (
              <span key={index}>
                {index > 0 && <span aria-hidden className="mx-1.5">·</span>}
                <span className={index === 0 ? 'font-medium text-foreground' : ''}>{part}</span>
              </span>
            ))}
          </p>
        </div>
      </div>
      <div className="page-column flex flex-wrap items-center gap-1 px-5 pb-4 @[44rem]/band:gap-2 @[44rem]/band:px-8 @[44rem]/band:pb-5">{actions}</div>
    </header>
  )
}

/** The one filled button: read them, from the top. Worded like Home's Open, its key in the tip. */
export function PlayButton({ label, onClick }: { label: string; onClick: () => void }): React.JSX.Element {
  return (
    <Tip label={label}>
      <button
        type="button"
        onClick={onClick}
        className="mr-1.5 flex h-9 shrink-0 items-center gap-2 rounded-full bg-primary px-4 text-control font-semibold text-primary-foreground shadow-[0_6px_16px_-8px_rgb(0_0_0/0.5)] transition-transform duration-150 ease-(--mf-ease) outline-none motion-safe:hover:scale-[1.03] focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background active:scale-[0.97]"
      >
        <Read className="size-4" />
        {label.split('  ')[0]}
      </button>
    </Tip>
  )
}

const QUIET = 'flex size-9 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-[color,background-color,scale] duration-150 ease-out hover:bg-foreground/[0.06] hover:text-foreground active:scale-[0.94] data-[state=open]:text-foreground aria-pressed:text-primary [&_svg]:size-5'

/** One of the small round buttons after it. */
export function QuietAction({ label, onClick, pressed, children }: { label: string; onClick: () => void; pressed?: boolean; children: ReactNode }): React.JSX.Element {
  return (
    <Tip label={label}>
      <button type="button" aria-pressed={pressed} onClick={onClick} className={QUIET}>{children}</button>
    </Tip>
  )
}

/** ··· as a button: the same lines a right click gives. */
export function MenuButton({ items, label = 'More', small = false }: { items: MenuItem[]; label?: string; small?: boolean }): React.JSX.Element {
  const shown = items.filter(Boolean) as Exclude<MenuItem, false | null | undefined>[]
  return (
    <DropdownMenu modal={false}>
      <Tip label={label}>
        <DropdownMenuTrigger asChild>
          <button type="button" className={small ? 'flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-foreground/[0.08] hover:text-foreground data-[state=open]:text-foreground' : QUIET}>
            <AliveIcon icon={DotsHorizontalIcon} size={small ? 16 : 20} />
          </button>
        </DropdownMenuTrigger>
      </Tip>
      <DropdownMenuContent align={small ? 'end' : 'start'} className="w-56">
        {shown.map((item, index) =>
          item === 'separator' ? (
            index > 0 && index < shown.length - 1 && shown[index - 1] !== 'separator' && <DropdownMenuSeparator key={`separator-${index}`} />
          ) : (
            <DropdownMenuItem key={item.label} variant={item.danger ? 'destructive' : 'default'} onSelect={item.run}>
              {item.label}
              {item.keys && keyFor(item.keys) && <DropdownMenuShortcut>{keyFor(item.keys)}</DropdownMenuShortcut>}
            </DropdownMenuItem>
          )
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** The view switch on the right of the actions, in words, the way a music app says "List". */
export function ViewSwitch<T extends string>({ value, options, onChange }: { value: T; options: { id: T; label: string; icon: ReactNode }[]; onChange: (to: T) => void }): React.JSX.Element {
  return (
    <span className="ml-auto flex items-center rounded-full p-0.5 text-control">
      {options.map((one) => (
        <button
          key={one.id}
          type="button"
          aria-pressed={value === one.id}
          onClick={() => void (value !== one.id && (chime(one.id === options[0].id ? 'fold' : 'slide'), onChange(one.id)))}
          className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 transition-colors [&_svg]:size-3.5 ${value === one.id ? 'bg-foreground/[0.07] text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
        >
          {one.icon}
          <span className="hidden @[30rem]/band:inline">{one.label}</span>
        </button>
      ))}
    </span>
  )
}

/** A row of a numbered list: its title and icon, its other columns, and what it offers on hover. */
export type Track = {
  key: string
  title: string
  icon?: ReactNode
  cells: ReactNode[]
  private?: boolean
  onOpen: (event: React.MouseEvent | React.KeyboardEvent) => void
  /** Read from this one on. */
  onPlay: () => void
  playLabel?: string
  add?: { label: string; icon: ReactNode; run: () => void; on?: boolean }
  menu: RowItem[]
  /** "type:id", for x to pick the row with the focus; `picked` draws it picked. */
  pick?: string
  picked?: boolean
}

/**
 * The numbered list: quiet column names, then a row each. Pointed at, a
 * row's number becomes a book (read from here) and its add and ···
 * show at the right, the rest of the time out of the way.
 */
export function TrackList({ columns, tracks }: { columns: { label: string; size: string; wide?: boolean }[]; tracks: Track[] }): React.JSX.Element {
  // One width per column for every row, so the dates and counts line up.
  // A column marked wide (a date) goes when the page is narrow, so the title keeps its room.
  const template = (list: typeof columns): string => `2.25rem minmax(0,1fr) ${list.map((one) => one.size).join(' ')} 4.25rem`
  const grid = { '--wide': template(columns), '--narrow': template(columns.filter((one) => !one.wide)) } as React.CSSProperties
  const shape = '[grid-template-columns:var(--narrow)] @[40rem]/page:[grid-template-columns:var(--wide)]'
  const shown = (wide?: boolean): string => (wide ? 'hidden @[40rem]/page:block' : '')
  return (
    <div role="table" className="page-column px-3 @[44rem]/page:px-6">
      <div role="row" className={`sticky top-0 z-10 grid items-center gap-x-3 border-b border-border/60 bg-background px-2 py-1.5 text-xs text-muted-foreground @[40rem]/page:gap-x-4 ${shape}`} style={grid}>
        <span role="columnheader" className="text-right tabular-nums">#</span>
        <span role="columnheader">Title</span>
        {columns.map((one) => <span key={one.label} role="columnheader" className={`text-right ${shown(one.wide)}`}>{one.label}</span>)}
        <span />
      </div>
      <div className="py-1.5">
        {tracks.map((track, index) => (
          <RowMenu key={track.key} items={track.menu}>
            <div
              role="row"
              tabIndex={0}
              data-private={track.private ? '' : undefined}
              data-pick={track.pick}
              data-picked={track.picked || undefined}
              onClick={(event) => !(event.target as HTMLElement).closest('button') && track.onOpen(event)}
              onKeyDown={(event) => event.key === 'Enter' && event.target === event.currentTarget && track.onOpen(event)}
              className={`group/track grid h-10 cursor-default items-center gap-x-3 rounded-md px-2 text-control outline-none hover:bg-foreground/[0.055] focus-visible:bg-foreground/[0.055] focus-visible:ring-1 focus-visible:ring-ring/40 has-[[data-state=open]]:bg-foreground/[0.055] @[40rem]/page:gap-x-4 ${PICKED_MARK} ${shape}`}
              style={grid}
            >
              <span className="relative flex h-full items-center justify-end">
                <span className="text-muted-foreground tabular-nums group-focus-within/track:opacity-0 group-hover/track:opacity-0">{index + 1}</span>
                <Tip label={track.playLabel ?? 'Read from here'}>
                  <button type="button" onClick={track.onPlay} className="absolute inset-y-0 right-0 flex w-6 items-center justify-end text-foreground opacity-0 group-focus-within/track:opacity-100 group-hover/track:opacity-100">
                    <Read className="size-3.5" />
                  </button>
                </Tip>
              </span>
              <span className="flex min-w-0 items-center gap-2.5">
                {track.icon}
                <span className="private-text truncate text-foreground">{track.title || 'Untitled'}</span>
              </span>
              {track.cells.map((cell, at) => <span key={at} className={`truncate text-right text-muted-foreground tabular-nums whitespace-nowrap ${shown(columns[at]?.wide)}`}>{cell}</span>)}
              <span className="flex items-center justify-end gap-0.5 opacity-0 group-focus-within/track:opacity-100 group-hover/track:opacity-100 has-[[data-state=open]]:opacity-100">
                {track.add && (
                  <Tip label={track.add.label}>
                    <button type="button" aria-pressed={track.add.on} onClick={track.add.run} className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-foreground/[0.08] hover:text-foreground aria-pressed:text-primary [&_svg]:size-4">{track.add.icon}</button>
                  </Tip>
                )}
                <MenuButton small items={flat(track.menu)} />
              </span>
            </div>
          </RowMenu>
        ))}
      </div>
    </div>
  )
}

/** Words in a note's body, counted from its document. */
export function wordsIn(body: unknown): number {
  let words = 0
  const walk = (node: unknown): void => {
    if (!node || typeof node !== 'object') return
    const { text, content } = node as { text?: string; content?: unknown[] }
    if (text) words += text.split(/\s+/).filter(Boolean).length
    content?.forEach(walk)
  }
  if (typeof body === 'string') return body.split(/\s+/).filter(Boolean).length
  walk(body)
  return words
}

/** The first picture in a note's body, or nothing. */
export function pictureIn(body: unknown): string | null {
  let found: string | null = null
  const walk = (node: unknown): void => {
    if (found || !node || typeof node !== 'object') return
    const { type, attrs, content } = node as { type?: string; attrs?: { src?: string }; content?: unknown[] }
    if (type === 'image' && attrs?.src && /^(mindflow|https?):/.test(attrs.src)) found = attrs.src
    content?.forEach(walk)
  }
  walk(body)
  return found
}
