import { useEffect, useRef, useState, type ReactNode } from 'react'
import { contrast } from '@/lib/on-accent'
import { cn } from '@/lib/cn'
import { chime } from '@/lib/sound'
import { keyFor } from '@/lib/keys'
import { smallPicture } from '@/lib/notes'
import { AliveIcon } from '@/components/ui/alive-icon'
import DotsHorizontalIcon from '@/components/ui/dots-horizontal-icon'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuShortcut, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { dangerLast, fits, type MenuItem } from './row-menu'
import { Tip } from './ui'
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
    sampled.set(src, (src.startsWith('haligtree:') ? smallPicture(src) : Promise.resolve(src))
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
 * The header itself. `title` is the name, or a field to change it in; `meta`
 * its counts, the first part in the ink colour; `actions` the row under it.
 * `length`, the title's characters: a long one is set smaller, as a music app
 * sets a long album name, so a sentence never towers over the page.
 */
export function CollectionHeader({ tint, cover, label, title, length = 0, big, meta, actions }: {
  tint: string | null
  cover: ReactNode
  /** What kind of page it is, small over the name: words, or words with the kind's own mark. */
  label: ReactNode
  title: ReactNode
  length?: number
  /** The one thing to know, on its own line under the name, larger than the counts (a goal's days left). */
  big?: ReactNode
  meta: ReactNode[]
  actions?: ReactNode
}): React.JSX.Element {
  return (
    <header
      data-collection-header
      className="@container/band relative"
      // The colour runs down behind the actions and fades into the page, as the band does in a music app.
      // It rises out of the page too, so no hard edge sits under the page's header line like a stray band.
      style={{ background: tint ? `linear-gradient(180deg, var(--background) 0%, ${tint} 30%, ${tint} 50%, var(--background) 100%)` : undefined }}
    >
      <div className="page-column relative flex items-end gap-4 px-5 pt-6 pb-4 @[44rem]/band:gap-6 @[44rem]/band:px-8 @[44rem]/band:pt-10 @[44rem]/band:pb-5">
        {cover}
        <div className="flex min-w-0 flex-1 flex-col gap-1 @[44rem]/band:gap-2">
          <span className="flex items-center gap-1.5 text-xs font-medium text-foreground/90">{label}</span>
          {/* The page's own name, as its heading: what a screen reader lands on and lists. */}
          <h1 className={`min-w-0 font-heading ${length > 70 ? 'text-[clamp(1.25rem,3.2cqi,2.25rem)] leading-[1.12]' : length > 28 ? 'text-[clamp(1.4rem,4.4cqi,3.25rem)] leading-[1.06]' : 'text-[clamp(1.6rem,6.5cqi,5rem)] leading-[1.02]'} font-bold tracking-[-0.035em] text-balance break-words text-foreground [&>span]:line-clamp-3 [&>span]:-mb-[0.2em] [&>span]:pb-[0.2em]`}>{title}</h1>
          {big}
          <p className="mt-1 line-clamp-2 text-control text-muted-foreground">
            {/* Each part whole on its line ("4 logs", never "4" then "logs"): the line breaks only between parts, after the dot. */}
            {meta.map((part, index) => (
              <span key={index}>
                <span data-meta-part className={`whitespace-nowrap ${index === 0 ? 'font-medium text-foreground' : ''}`}>{part}</span>
                {index < meta.length - 1 && <><span aria-hidden className="mx-1.5">·</span>{'\u200B'}</>}
              </span>
            ))}
          </p>
        </div>
      </div>
      {/* No row at all when there is nothing to do here: an empty row read as a gap under the date line. */}
      {actions && <div className="page-column relative flex flex-wrap items-center gap-1 px-5 pb-4 @[44rem]/band:gap-2 @[44rem]/band:px-8 @[44rem]/band:pb-5">{actions}</div>}
    </header>
  )
}

/** The one filled button: read them, from the top. Home's Open, the same size and shape, its key in the tip. */
export function PlayButton({ label, onClick, icon: Icon = Read }: { label: string; onClick: () => void; icon?: React.ComponentType<{ className?: string }> }): React.JSX.Element {
  return (
    <Tip label={label}>
      <button
        type="button"
        onClick={onClick}
        className="mr-1 flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-full bg-primary px-3.5 text-control font-semibold text-primary-foreground shadow-[0_6px_16px_-8px_color-mix(in_oklab,var(--mf-shadow-ink)_50%,transparent)] transition-transform duration-150 ease-(--mf-ease) outline-none motion-safe:hover:scale-[1.03] focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background active:scale-[0.97]"
      >
        {/* On a phone's width the words alone, so the row's other actions stay on its line. */}
        <span className="hidden @[26rem]/band:contents"><Icon className="size-4" /></span>
        {label.split('  ')[0]}
      </button>
    </Tip>
  )
}

const QUIET = 'flex size-9 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-[color,background-color,scale] duration-150 ease-out hover:bg-foreground/[0.06] hover:text-foreground active:scale-[0.94] data-[state=open]:text-foreground aria-pressed:text-primary aria-pressed:[&_svg]:fill-current [&_svg]:size-5'

/** ··· as a button: the same lines a right click gives. */
export function MenuButton({ items, label = 'More', small = false, name, icon, className }: { /** Or made as it opens, so a button on every card of a list makes no menu until one is opened. */ items: MenuItem[] | (() => MenuItem[]); label?: string; small?: boolean; /** Its data-menu, for a probe. */ name?: string; /** In place of the three dots (a post's ×). */ icon?: React.ReactNode; className?: string }): React.JSX.Element {
  // Its lines made only while it is open (a right click's menu does the same, row-menu.tsx), kept while it fades out.
  const [open, setOpen] = useState(false)
  const built = useRef<Exclude<MenuItem, false | null | undefined>[]>([])
  // The same rule as a right click: a page's own ⋯ is the list's menu, so only lines that cannot run here are left out.
  if (open) built.current = dangerLast(fits(typeof items === 'function' ? items() : items, true)).filter(Boolean) as Exclude<MenuItem, false | null | undefined>[]
  const shown = built.current
  return (
    <DropdownMenu modal={false} onOpenChange={setOpen}>
      <Tip label={label}>
        <DropdownMenuTrigger asChild>
          <button type="button" aria-label={label} data-menu={name} className={cn(small ? 'flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-foreground/[0.08] hover:text-foreground data-[state=open]:text-foreground' : QUIET, className)}>
            {icon ?? <AliveIcon icon={DotsHorizontalIcon} size={small ? 16 : 20} />}
          </button>
        </DropdownMenuTrigger>
      </Tip>
      <DropdownMenuContent align={small ? 'end' : 'start'} className="w-56">
        {shown.map((item, index) =>
          item === 'separator' ? (
            index > 0 && index < shown.length - 1 && shown[index - 1] !== 'separator' && <DropdownMenuSeparator key={`separator-${index}`} />
          ) : (
            <DropdownMenuItem key={item.label} data-menu-item={item.id} variant={item.danger ? 'destructive' : 'default'} onSelect={item.run}>
              {item.icon}
              {item.label}
              {item.trail}
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

/** The first picture in a note's body, or nothing. */
export function pictureIn(body: unknown): string | null {
  let found: string | null = null
  const walk = (node: unknown): void => {
    if (found || !node || typeof node !== 'object') return
    const { type, attrs, content } = node as { type?: string; attrs?: { src?: string }; content?: unknown[] }
    if (type === 'image' && attrs?.src && /^(haligtree|https?):/.test(attrs.src)) found = attrs.src
    content?.forEach(walk)
  }
  walk(body)
  return found
}
