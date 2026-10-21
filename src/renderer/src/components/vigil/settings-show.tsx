import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { motion } from 'motion/react'
import { BorderBeam } from 'border-beam'
import { allThemes, applyTheme, currentTheme, themeName, type Theme } from '@/lib/theme'
import { chime, step } from '@/lib/sound'
import { useAlive, useSurface } from '@/lib/use-alive'
import { Weighted } from './glide'
import { ProgressBar, type BarStyle } from './progress-bar'
import { DotMatrix } from './dot-matrix'
import { Gleam, Ring, SHADOW, SMOKE_EASE, SOLID, Wisps } from './focus-pill'
import { useFollowLabel, useTilt } from './tilt'
import { drawingFor } from './grain'
import { Struck, Ring as Circled } from './marks'
import { Chips } from './display'
import { Button } from '@/components/ui/button'
import { refuse, toast } from './ui'

/**
 * What a setting will look like, shown where it is chosen: a thumbnail for
 * each choice, or a small live sample beside a switch that changes as the
 * switch does. Built from the same parts as the real thing (the pill's ring,
 * gleam and smoke, the bars, the hand-drawn marks, the private blur), so the
 * sample is never a picture of something else. With Motion off or Reduce
 * motion, each shows its end state, still; sounds play only when asked.
 */

/** A picture to show pictures with: one of Vigil's own paper drawings. */
const PICTURE = drawingFor('settings-sample').url
const OTHER_PICTURE = drawingFor('a link card').url

/**
 * Choices as tiles: each a small picture of what it gives, its name under
 * it, the chosen one ringed in the accent. One click picks; arrow keys move
 * between them as between radio buttons.
 */
export function Choices({ options, on, pick, label, min = '7.5rem', tall = false }: {
  options: { id: string; label: string; show: ReactNode }[]
  on: (id: string) => boolean
  pick: (id: string) => void
  label: string
  /** The narrowest a tile gets before the row wraps. */
  min?: string
  tall?: boolean
}): React.JSX.Element {
  return (
    <div role="radiogroup" aria-label={label} data-choices={label} className="mt-3 grid gap-2" style={{ gridTemplateColumns: `repeat(auto-fit, minmax(min(${min}, 100%), 1fr))`, maxWidth: options.length * 13 + 'rem' }}
      onKeyDown={(event) => {
        const by = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key]
        if (!by) return
        event.preventDefault()
        const at = options.findIndex((one) => on(one.id))
        const next = options[(at + by + options.length) % options.length]
        chime('tap')
        pick(next.id)
        event.currentTarget.querySelector<HTMLElement>(`[data-choice="${next.id}"]`)?.focus()
      }}>
      {options.map((option) => {
        const chosen = on(option.id)
        return (
          <button key={option.id} type="button" role="radio" aria-checked={chosen} tabIndex={chosen ? 0 : -1} data-choice={option.id}
            onClick={() => !chosen && (chime('tap'), pick(option.id))}
            className="group flex min-w-0 flex-col gap-1.5 rounded-xl p-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/50">
            <span aria-hidden className={`relative block ${tall ? 'h-20' : 'h-16'} overflow-hidden rounded-lg border bg-background transition-[box-shadow,border-color] duration-150 ${chosen ? 'border-transparent ring-2 ring-[var(--tt-brand-color-400)]' : 'group-hover:border-foreground/30'}`}>
              {option.show}
            </span>
            <span className={`px-0.5 text-control ${chosen ? 'text-foreground' : 'text-muted-foreground group-hover:text-foreground'}`}><Weighted on={chosen}>{option.label}</Weighted></span>
          </button>
        )
      })}
    </div>
  )
}

// --- Theme -------------------------------------------------------------------

/**
 * Every theme as a small page in its own colours, named under it: click to
 * keep it. With preview on, point at one and the whole window wears it, leave
 * and yours comes back. The dial (below it in Settings) is the same list, to turn.
 */
export function ThemeTiles({ preview }: { preview: boolean }): React.JSX.Element {
  const [kept, setKept] = useState<Theme>(currentTheme)
  // A theme loaded from a file or taken away: the tiles are read again.
  const [, setLoaded] = useState(0)
  const worn = useRef<Theme>(kept)
  useEffect(() => {
    const follow = (event: StorageEvent): void => {
      if (event.key !== 'theme' && event.key !== 'custom-themes') return
      setLoaded((n) => n + 1)
      setKept(currentTheme())
      worn.current = currentTheme()
    }
    window.addEventListener('storage', follow)
    // Left while trying one on: yours again.
    return () => {
      window.removeEventListener('storage', follow)
      if (worn.current !== currentTheme()) applyTheme(currentTheme(), false)
    }
  }, [])
  const wear = (theme: Theme, index: number): void => {
    if (worn.current === theme) return
    worn.current = theme
    step(index)
    applyTheme(theme, false)
  }
  return (
    <div data-theme-tiles className="mt-3 grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(6.25rem, 1fr))' }}
      onPointerLeave={() => worn.current !== kept && ((worn.current = kept), applyTheme(kept, false))}>
      {allThemes().map((theme, index) => {
        const chosen = theme === kept
        return (
          <button key={theme} type="button" aria-pressed={chosen} data-theme-tile={theme}
            onPointerEnter={preview ? () => wear(theme, index) : undefined}
            onClick={() => {
              chime('settled')
              worn.current = theme
              setKept(theme)
              applyTheme(theme)
              window.dispatchEvent(new StorageEvent('storage', { key: 'theme' }))
            }}
            className="group flex min-w-0 flex-col gap-1.5 rounded-xl p-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/50">
            <span aria-hidden className={`mf-swatch-${theme} relative flex h-14 flex-col justify-between overflow-hidden rounded-lg border p-2 transition-[box-shadow,border-color] duration-150 ${chosen ? 'border-transparent ring-2 ring-[var(--tt-brand-color-400)]' : 'group-hover:border-foreground/30'}`}
              style={{ background: 'var(--sw-bg)', color: 'var(--sw-ink)' }}>
              <span className="flex items-start justify-between">
                <span className="text-[15px] leading-none font-semibold" style={{ fontFamily: 'var(--mf-heading-font, var(--mf-font))', color: 'var(--sw-heading)' }}>Aa</span>
                <span className="h-2 w-5 rounded-full" style={{ background: 'var(--sw-accent)' }} />
              </span>
              <span className="flex flex-col gap-1">
                <span className="block h-[3px] w-[85%] rounded-full bg-current opacity-60" />
                <span className="block h-[3px] w-[55%] rounded-full" style={{ background: 'var(--sw-quote)' }} />
              </span>
            </span>
            <span className={`truncate px-0.5 text-control ${chosen ? 'text-foreground' : 'text-muted-foreground group-hover:text-foreground'}`}><Weighted on={chosen}>{themeName(theme)}</Weighted></span>
          </button>
        )
      })}
    </div>
  )
}

const JSON_SAMPLE = `{
  "name": "Harbour",
  "bg": "#10202b",
  "ink": "#e3ebf0",
  "accent": "#4fb3bf",
  "yellow": "#e8c46a",
  "green": "#7cc492"
}
`
const CSS_SAMPLE = `/* harbour.css: the theme is named after the file */
:root {
  --bg: #10202b;
  --ink: #e3ebf0;
  --accent: #4fb3bf;
  --yellow: #e8c46a;
  --green: #7cc492;
}
`
/** A line of the sample, each colour with a dot of itself before it. */
const Line = ({ text }: { text: string }): React.JSX.Element => {
  const colour = text.match(/#[0-9a-f]{6}/i)?.[0]
  const [, key, rest] = text.match(/^(\s*"?-{0,2}[a-z]+"?:)(.*)$/) ?? [null, '', text]
  return (
    <span className="flex items-center">
      <span className="whitespace-pre"><span className="text-muted-foreground">{key}</span>{rest}</span>
      {colour && <i className="ml-2 inline-block size-2.5 shrink-0 rounded-full ring-1 ring-foreground/25" style={{ background: colour }} />}
    </span>
  )
}

/**
 * What a theme file looks like, for whoever writes one: a short example of
 * each kind to copy, what it must have, and a starter to save and edit.
 */
export function ThemeFileGuide(): React.JSX.Element {
  const [kind, setKind] = useState<'json' | 'css'>('json')
  const text = kind === 'json' ? JSON_SAMPLE : CSS_SAMPLE
  return (
    <div data-theme-guide className="mt-3">
      <div className="overflow-hidden rounded-lg border bg-background">
        <div className="flex items-center justify-between gap-2 border-b py-1 pr-1 pl-1.5">
          <Chips options={[{ id: 'json', label: 'JSON file' }, { id: 'css', label: 'CSS file' }]} on={(id) => id === kind} pick={(id) => setKind(id as 'json' | 'css')} />
          <Button variant="ghost" size="sm" className="h-7" onClick={() => void navigator.clipboard.writeText(text).then(() => (chime('settled'), toast(kind === 'json' ? 'Copied the JSON example' : 'Copied the CSS example')), () => refuse('Could not copy it', 'error'))}>Copy</Button>
        </div>
        <pre data-theme-sample={kind} className="overflow-x-auto px-3 py-2.5 font-mono text-[12px] leading-[1.6] text-foreground">{text.trimEnd().split('\n').map((line, index) => <Line key={index} text={line} />)}</pre>
      </div>
      <p className="mt-2 text-[0.8125rem] text-foreground"><b className="font-semibold">Needed:</b> bg (the page), ink (the words) and accent (links, buttons, the cursor).</p>
      <p className="mt-0.5 text-[0.8125rem] text-foreground/80"><b className="font-semibold text-foreground">Optional:</b> name, and any of red, orange, yellow, green, blue, purple, pink, brown and gray for coloured text. Yellow colours headings, green colours quotes.</p>
    </div>
  )
}

/** Saves the JSON example where you choose, to change and load back. */
export const saveStarterTheme = (): void =>
  void window.api.exportText('my-theme.json', JSON_SAMPLE).then((saved) => saved && (chime('send'), toast('Saved a starter theme. Change its colours, then load it here')))

// --- Progress bars ------------------------------------------------------------

/**
 * A bar in one style filling on a loop, calmly: from empty to full in about
 * five seconds, its 100% moment (the saber's flare, the dinosaur's hop by its
 * flag, the plain bar's glow), a rest, and again. Silent. Still, it is full.
 */
export function LoopBar({ style }: { style: BarStyle }): React.JSX.Element {
  const moving = useAlive()
  const [at, setAt] = useState(moving ? 0.04 : 1)
  const [round, setRound] = useState(0)
  useEffect(() => {
    if (!moving) return void setAt(1)
    let now = 0.04
    setAt(now)
    let timer: ReturnType<typeof setTimeout>
    const grow = (): void => {
      now = Math.min(1, now + 0.08)
      setAt(now)
      timer = now >= 1 ? setTimeout(() => setRound((n) => n + 1), 2800) : setTimeout(grow, 420)
    }
    timer = setTimeout(grow, 600)
    return () => clearTimeout(timer)
  }, [moving, round])
  return (
    <motion.span key={round} data-loop-bar={style} className="block w-full" initial={moving && round ? { opacity: 0 } : false} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}>
      <ProgressBar as={style} silent value={at} label={`${style} sample`} thick={3} fill="var(--primary)" blade="var(--tt-color-text-green)" />
    </motion.span>
  )
}

export const barChoices = [
  { id: 'plain', label: 'Plain' },
  { id: 'saber', label: 'Lightsaber' },
  { id: 'dino', label: 'Dino run' }
].map((one) => ({ ...one, show: <span className="absolute inset-0 flex items-center px-3"><LoopBar style={one.id as BarStyle} /></span> }))

// --- The session bubble ---------------------------------------------------------

/**
 * The session bubble in small, from its own parts: the ring, the dinosaur in
 * either of its ways, the clock or the count in, and, when asked, its gleam
 * (shown every few seconds here, every 45 or so for real) and its smoke
 * (stronger under the pointer, as it is).
 */
export function MiniBubble({ kind = 'circle', gleam = false, smoke = false, count = null, time = '18:24', goal = 'Write the essay', className = '' }: {
  kind?: 'circle' | 'runner' | 'progress'
  gleam?: boolean
  smoke?: boolean
  count?: number | null
  time?: string
  goal?: string
  className?: string
}): React.JSX.Element {
  const light = useSurface() === 'light'
  const moving = useAlive()
  const [shine, setShine] = useState(0)
  const [over, setOver] = useState(false)
  useEffect(() => {
    if (!gleam) return
    setShine(1)
    const every = setInterval(() => setShine((n) => n + 1), 3600)
    return () => clearInterval(every)
  }, [gleam])
  return (
    <span data-mini-bubble={kind} onPointerEnter={() => setOver(true)} onPointerLeave={() => setOver(false)}
      className={`relative isolate flex h-[34px] min-w-0 items-center gap-2 overflow-hidden rounded-[22px] border pr-3 pl-1.5 font-[system-ui,-apple-system,sans-serif] text-[12px] text-foreground ${SHADOW} ${className}`}
      style={{ backgroundImage: SOLID, backgroundColor: 'Canvas' }}>
      {smoke && moving && <Wisps light={light} />}
      {gleam && shine > 0 && <Gleam key={shine} light={light} />}
      <Ring share={count !== null ? 0 : kind === 'circle' ? 0.62 : 0.62} over={false} paused={false} />
      <span className="min-w-0 flex-1 truncate font-medium">{goal}</span>
      {kind !== 'circle' && count === null && (
        <span className={`shrink-0 ${moving ? 'mf-bubble-run' : 'mf-bubble-still'}`}>
          <ProgressBar as="dino" silent value={kind === 'progress' ? 0.62 : 0} label="Sample" duration={0} className={kind === 'progress' ? 'w-[52px]' : 'w-[34px]'} />
        </span>
      )}
      <span className="flex shrink-0 items-center gap-1.5 font-semibold whitespace-nowrap">
        {count !== null ? <><span className="font-medium text-muted-foreground">Starting in</span><DotMatrix text={String(count)} className="h-[12px]" /></> : <DotMatrix text={time} className="h-[12px]" />}
      </span>
      {smoke && (
        <BorderBeam size="pulse-inner" colorVariant="mono" strength={0.4} css={SMOKE_EASE} brightness={light ? 0.5 : undefined} style={light ? ({ '--beam-stroke-opacity': 9, '--beam-inner-opacity': 0.75 } as CSSProperties) : undefined}
          duration={3.4} theme={light ? 'light' : 'dark'} borderRadius={22} active={moving && over} className="pointer-events-none absolute inset-0">
          <div className="h-full w-full rounded-[22px]" />
        </BorderBeam>
      )}
    </span>
  )
}

export const bubbleChoices = [
  { id: 'circle', label: 'Circle' },
  { id: 'runner', label: 'Runner' },
  { id: 'progress', label: 'Runner as progress' }
].map((one) => ({ ...one, show: <span className="absolute inset-0 flex items-center px-2"><MiniBubble kind={one.id as 'circle'} goal={one.id === 'circle' ? 'Essay' : ''} className="w-full" /></span> }))

/**
 * The count in, played on asking: 5, 4, 3, 2, 1 with a tick each (heard with
 * Sounds on), then the clock starts. Off, it starts at once. Played once by
 * itself when the switch is turned on.
 */
export function CountSample({ on }: { on: boolean }): React.JSX.Element {
  const [count, setCount] = useState<number | null>(null)
  const [time, setTime] = useState(0)
  const [running, setRunning] = useState(false)
  // The value last seen: it plays only on a real change, never on a first run
  // (twice in the development build, which a first-run flag let through).
  const last = useRef(on)
  const play = (): void => {
    setRunning(true)
    setTime(0)
    if (on) setCount(5)
    else (chime('on'), setCount(null))
  }
  useEffect(() => {
    if (last.current === on) return
    last.current = on
    if (on) play()
  }, [on]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (count === null) return
    if (count === 0) return void (chime('on'), setCount(null))
    chime('tick')
    const next = setTimeout(() => setCount(count - 1), 1000)
    return () => clearTimeout(next)
  }, [count])
  // The clock, once started, for a few seconds.
  useEffect(() => {
    if (!running || count !== null) return
    if (time >= 4) return void setRunning(false)
    const next = setTimeout(() => setTime((t) => t + 1), 1000)
    return () => clearTimeout(next)
  }, [running, count, time])
  return (
    <div data-preview="count-in" className="mt-3 flex flex-wrap items-center gap-3">
      <MiniBubble count={count} time={time ? `24:${String(60 - time).padStart(2, '0')}` : '25:00'} className="w-60 max-w-full" />
      <Button variant="outline" size="sm" onClick={play} disabled={count !== null}>{count !== null ? 'Counting…' : on ? 'Play the count' : 'Play a start'}</Button>
    </div>
  )
}

// --- Pictures ---------------------------------------------------------------------

/** A picture as it sits in a note: framed or not, tilting or not, its caption riding with the pointer or not. */
export function PictureSample({ tilt = false, follow = false, frame, caption = 'Harbour at dawn', className = '' }: { tilt?: boolean; follow?: boolean; frame?: string; caption?: string | null; className?: string }): React.JSX.Element {
  const lean = useTilt(6, 1.015)
  const label = useFollowLabel({ wrap: true, most: 3 })
  const [riding, setRiding] = useState(false)
  lean.onFlat(() => undefined)
  return (
    <span data-picture-sample className={`flex shrink-0 flex-col items-center gap-1 ${className}`}>
      <span className="relative block"
        onPointerMove={(event) => {
          if (tilt) lean.lean(event, event.currentTarget)
          if (follow && caption && event.pointerType === 'mouse') {
            label.measure(caption)
            label.follow(event.clientX, event.clientY)
            setRiding(true)
          }
        }}
        onPointerLeave={() => (lean.flat(), label.hide(), setRiding(false))}>
        <motion.span className="block" style={{ rotateX: lean.x, rotateY: lean.y, scale: lean.grow, transformPerspective: 700 }}>
          <img src={PICTURE} alt="" draggable={false} className="block h-[60px] w-[84px] object-cover"
            style={frame ? { padding: 4, background: frame, borderRadius: 9, boxShadow: '0 1px 2px rgb(0 0 0 / 0.14), 0 8px 20px -8px rgb(0 0 0 / 0.35)' } : { borderRadius: 4 }} />
        </motion.span>
      </span>
      {caption && <span className={`text-meta text-muted-foreground italic transition-opacity duration-150 ${riding ? 'opacity-0' : ''}`}>{caption}</span>}
      {caption && label.label(caption)}
    </span>
  )
}

/** The postcard's border as the theme's Auto would draw it, worked out the way main.css does. */
const autoPostcard = (): string => {
  const root = document.documentElement
  // Brutal's is the ink; Paper and Swiss keep the theme's own print, as Soft does.
  if (root.dataset.style === 'brutal') return 'var(--foreground)'
  return root.classList.contains('light') || root.classList.contains('paper') || root.hasAttribute('data-light')
    ? 'color-mix(in oklab, white 88%, var(--popover))' : 'color-mix(in oklab, white 84%, var(--background))'
}
export const POSTCARD_BORDERS: Record<string, () => string> = {
  auto: autoPostcard, white: () => '#fff', cream: () => '#f3ead6', black: () => '#18181a', accent: () => 'var(--primary)'
}
export const postcardChoices = (): { id: string; label: string; show: ReactNode }[] =>
  [['auto', 'Auto'], ['white', 'White'], ['cream', 'Cream'], ['black', 'Black'], ['accent', 'Accent']].map(([id, label]) => ({
    id, label, show: <span className="absolute inset-0 grid place-items-center bg-accent/40"><img src={PICTURE} alt="" draggable={false} className="h-[46px] w-[62px] object-cover" style={{ padding: 3, background: POSTCARD_BORDERS[id](), borderRadius: 7, boxShadow: '0 1px 2px rgb(0 0 0 / 0.14), 0 6px 14px -6px rgb(0 0 0 / 0.35)' }} /></span>
  }))

export const linkChoices = [
  { id: 'fill', label: 'Fill' },
  { id: 'whole', label: 'Whole' }
].map((one) => ({
  ...one,
  show: (
    <span className="absolute inset-1.5 flex overflow-hidden rounded-md border bg-popover">
      {/* A tall picture in a wide box: cropped to fill it, or whole with its own colours blurred either side. */}
      <span className="relative flex w-[52%] shrink-0 justify-center overflow-hidden bg-muted">
        {one.id === 'whole' && <img src={OTHER_PICTURE} alt="" draggable={false} className="absolute inset-0 size-full scale-125 object-cover opacity-70 blur-[6px]" />}
        <img src={OTHER_PICTURE} alt="" draggable={false} className={`relative h-full object-cover ${one.id === 'fill' ? 'w-full object-[50%_30%]' : 'aspect-[3/4] w-auto shadow-[0_0_6px_rgb(0_0_0/0.25)]'}`} />
      </span>
      <span className="flex flex-1 flex-col justify-center gap-1 px-2">
        <span className="block h-[3px] w-[80%] rounded-full bg-foreground/60" />
        <span className="block h-[3px] w-[55%] rounded-full bg-foreground/25" />
      </span>
    </span>
  )
}))

// --- Small samples beside a switch -----------------------------------------------

/** Three cards arriving one after another, eased in: replayed as the switch changes and when pointed at. Off, they are simply there. */
export function MotionSample({ on }: { on: boolean }): React.JSX.Element {
  const cards = useRef<HTMLSpanElement>(null)
  const play = (): void => {
    const still = !on || matchMedia('(prefers-reduced-motion: reduce)').matches
    if (still) return
    ;[...(cards.current?.children ?? [])].forEach((card, index) =>
      (card as HTMLElement).animate([{ opacity: 0, transform: 'translateY(8px) scale(0.97)' }, { opacity: 1, transform: 'none' }], { duration: 320, delay: index * 70, easing: 'cubic-bezier(0.23, 1, 0.32, 1)', fill: 'backwards' }))
  }
  useEffect(play, [on]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <span ref={cards} data-preview="motion" onPointerEnter={play} className="flex h-9 items-end gap-1 rounded-md border bg-background px-1.5 pb-1.5">
      {[0, 1, 2].map((one) => <span key={one} className="block h-5 w-6 rounded-[4px] border bg-accent" />)}
    </span>
  )
}

/** A private note's title in a list: blurred until pointed at, with Blurring on (it follows the real switch). */
export const BlurSample = (): React.JSX.Element => (
  <span data-preview="blur" data-private className="flex h-9 cursor-default items-center gap-2 rounded-md border bg-background px-2.5 text-control">
    <span className="size-1.5 shrink-0 rounded-full bg-[var(--tt-color-text-purple)]" />
    <span className="private-text whitespace-nowrap">Gift ideas for Sam</span>
  </span>
)

/** A checklist line struck through by hand and a day ringed, written with the pen again each time the switch turns. */
export const MarksSample = ({ on }: { on: boolean }): React.JSX.Element => (
  <span key={String(on)} data-preview="marks" className="flex h-9 items-center gap-3 rounded-md border bg-background px-2.5 text-control text-foreground">
    <Struck seed="settings-sample" draw={on}>Water the plants</Struck>
    <Circled seed="settings-day" draw={on} ink="var(--tt-brand-color-400)">12</Circled>
  </span>
)

/** A row in a list, its first picture at its end, or not. */
export const ListPictureSample = ({ on }: { on: boolean }): React.JSX.Element => (
  <span data-preview="list-picture" className="flex h-9 w-44 items-center gap-2 rounded-md border bg-background pr-1.5 pl-2.5 text-control">
    <span className="size-1.5 shrink-0 rounded-full bg-[var(--tt-color-text-blue)]" />
    <span className="min-w-0 flex-1 truncate">Weekend in Lisbon</span>
    {on && <img src={PICTURE} alt="" draggable={false} className="size-6 shrink-0 rounded-[4px] object-cover" />}
  </span>
)

/** How far through the day, as beads or a bar, as the menu bar's menu draws it. */
export const TempusSample = ({ dots }: { dots: boolean }): React.JSX.Element => (
  <span data-preview="tempus" className="flex h-9 items-center gap-2 rounded-md border bg-background px-2.5 text-control text-foreground">
    Day
    {dots ? (
      <span className="flex gap-[3px]">{Array.from({ length: 10 }, (_, i) => <span key={i} className={`size-[5px] rounded-full ${i < 6 ? 'bg-foreground' : 'bg-foreground/20'}`} />)}</span>
    ) : (
      <span className="relative block h-[5px] w-[67px] overflow-hidden rounded-full bg-foreground/15"><span className="absolute inset-y-0 left-0 w-[60%] rounded-full bg-foreground" /></span>
    )}
    <span className="text-muted-foreground tabular-nums">60%</span>
  </span>
)

// A desktop picture for the sticky samples: bright, so what each material does to it shows.
const WALL = 'linear-gradient(135deg, #5b7fd4 0%, #b77fc0 45%, #f2a65e 100%)'
const NOTE_LINES = (ink: string): React.JSX.Element => (
  <span className="flex flex-col gap-[3px] p-1.5">
    <span className="block h-[2px] w-[80%] rounded-full" style={{ background: ink }} />
    <span className="block h-[2px] w-[60%] rounded-full" style={{ background: ink }} />
    <span className="block h-[2px] w-[70%] rounded-full" style={{ background: ink }} />
  </span>
)
/** A sticky on the desktop in each material: paper, frost (the picture blurred and whitened, leaning) or glass (blurred and dimmed, straight). */
const Sticky = ({ made }: { made: 'paper' | 'frost' | 'glass' }): React.JSX.Element => (
  <span className="absolute inset-0" style={{ background: WALL }}>
    <span className="absolute top-2.5 left-1/2 block h-11 w-14 -translate-x-1/2 overflow-hidden rounded-[5px] shadow-[0_4px_10px_-3px_rgb(0_0_0/0.4)]" style={{ transform: `translateX(-50%) rotate(${made === 'glass' ? 0 : -3}deg)`, background: made === 'paper' ? '#f6e7a6' : undefined }}>
      {made !== 'paper' && <span className="absolute -inset-4 blur-[7px]" style={{ background: WALL }} />}
      {made === 'frost' && <span className="absolute inset-0 bg-white/55" />}
      {made === 'glass' && <span className="absolute inset-0 bg-[rgb(20_20_28/0.38)] ring-1 ring-white/25 ring-inset" />}
      <span className="relative block">{NOTE_LINES(made === 'glass' ? 'rgb(255 255 255 / 0.8)' : 'rgb(40 34 25 / 0.6)')}</span>
    </span>
  </span>
)
export const stickyChoices = [
  { id: 'paper', label: 'Paper' },
  { id: 'frost', label: 'Wallpaper frost' },
  { id: 'glass', label: 'Glass' }
].map((one) => ({ ...one, show: <Sticky made={one.id as 'paper'} /> }))

/** A sticky that now and then lifts a little and settles, every few seconds here (every half hour or so for real), and when pointed at. */
export function StirSample({ on }: { on: boolean }): React.JSX.Element {
  const note = useRef<HTMLSpanElement>(null)
  const moving = useAlive()
  const stir = (): void => void note.current?.animate([{ transform: 'rotate(-2deg)' }, { transform: 'translateY(-3px) rotate(-4deg)', offset: 0.35 }, { transform: 'translateY(0.5px) rotate(-1.5deg)', offset: 0.75 }, { transform: 'rotate(-2deg)' }], { duration: 1100, easing: 'cubic-bezier(0.45, 0, 0.55, 1)' })
  useEffect(() => {
    if (!on || !moving) return
    stir()
    const every = setInterval(stir, 4200)
    return () => clearInterval(every)
  }, [on, moving])
  return (
    <span data-preview="stir" onPointerEnter={() => on && moving && stir()} className="relative block h-9 w-16 overflow-hidden rounded-md border" style={{ background: WALL }}>
      <span ref={note} className="absolute top-1.5 left-4 block h-6 w-8 rounded-[3px] bg-[#f6e7a6] shadow-[0_3px_6px_-2px_rgb(0_0_0/0.4)]" style={{ transform: 'rotate(-2deg)' }}>
        <span className="block scale-75">{NOTE_LINES('rgb(40 34 25 / 0.55)')}</span>
      </span>
    </span>
  )
}

/**
 * A goal's card tucked away by the clock, small: on, it waits as a slim tab
 * at the desktop's edge and opens out of it while pointed at, as the real one does.
 */
export function TuckSample({ on }: { on: boolean }): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const out = !on || open
  return (
    <span data-preview="tuck" onPointerEnter={() => (setOpen(true), on && chime('slide'))} onPointerLeave={() => setOpen(false)}
      className="relative block h-9 w-20 overflow-hidden rounded-md border" style={{ background: WALL }}>
      <span data-preview-card={out ? 'card' : 'tab'}
        className="absolute top-1 right-1.5 flex h-7 w-11 items-start gap-1 rounded-[4px] bg-popover p-1 shadow-[0_3px_6px_-2px_rgb(0_0_0/0.4)] transition-transform duration-300 ease-(--mf-ease) motion-reduce:transition-none"
        style={{ transform: out ? 'translateX(0)' : 'translateX(calc(100% - 4px))' }}>
        <svg viewBox="0 0 10 10" className="size-2.5 shrink-0 -rotate-90" aria-hidden>
          <circle cx="5" cy="5" r="3.6" fill="none" stroke="currentColor" strokeOpacity={0.2} strokeWidth={1.6} />
          <circle cx="5" cy="5" r="3.6" fill="none" stroke="var(--tt-color-text-orange)" strokeWidth={1.6} strokeDasharray="14 23" />
        </svg>
        <span className="mt-0.5 flex flex-1 flex-col gap-[3px]">
          <span className="block h-[2px] w-full rounded-full bg-foreground/50" />
          <span className="block h-[2px] w-2/3 rounded-full bg-foreground/30" />
        </span>
      </span>
    </span>
  )
}

// --- Where things go ------------------------------------------------------------

/** A screen, small: its menu bar, and whatever sits on it. */
const Screen = ({ children, notch = false }: { children?: ReactNode; notch?: boolean }): React.JSX.Element => (
  <span className="absolute inset-1.5 overflow-hidden rounded-md border bg-accent/40">
    <span className="absolute inset-x-0 top-0 h-[5px] bg-foreground/10" />
    {notch && <span className="absolute top-0 left-1/2 h-[7px] w-7 -translate-x-1/2 rounded-b-[4px] bg-black" />}
    {children}
  </span>
)
/** Quick capture in small: a box with a line to write on. */
const Box = ({ className = '', style }: { className?: string; style?: CSSProperties }): React.JSX.Element => (
  <span className={`absolute block h-3.5 w-12 rounded-[4px] border border-foreground/30 bg-popover shadow-sm ${className}`} style={style}>
    <span className="absolute top-1/2 left-1.5 block h-[2px] w-5 -translate-y-1/2 rounded-full bg-foreground/50" />
  </span>
)
export const boxPlaceChoices = [
  { id: 'last', label: 'Where you left it', show: <Screen><Box className="bottom-2.5 left-2.5" /></Screen> },
  { id: 'top', label: 'Near the top', show: <Screen><Box className="top-3 left-1/2 -translate-x-1/2" /></Screen> },
  { id: 'centre', label: 'Middle', show: <Screen><Box className="top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" /></Screen> }
]
const Pointer = ({ className = '' }: { className?: string }): React.JSX.Element => (
  <svg viewBox="0 0 10 14" className={`absolute h-3 w-2.5 ${className}`} aria-hidden><path d="M1 1l7.5 7.5H5l2 4.2-1.6.8-2-4.3L1 11.5z" fill="var(--foreground)" stroke="var(--background)" strokeWidth="0.8" /></svg>
)
const TwoScreens = ({ on }: { on: 'left' | 'right' }): React.JSX.Element => (
  <span className="absolute inset-1.5 flex gap-1">
    {(['left', 'right'] as const).map((side) => (
      <span key={side} className="relative flex-1 overflow-hidden rounded-md border bg-accent/40">
        <span className="absolute inset-x-0 top-0 h-[5px] bg-foreground/10" />
        {on === side && <Box className="top-1/2 left-1/2 w-9 -translate-x-1/2 -translate-y-1/2" />}
        {side === 'right' && <Pointer className="right-2 bottom-1.5" />}
      </span>
    ))}
  </span>
)
export const boxScreenChoices = [
  { id: 'pointer', label: 'Where the pointer is', show: <TwoScreens on="right" /> },
  { id: 'same', label: 'Where it was', show: <TwoScreens on="left" /> }
]

/** Quick capture with its side panel open: grown on both sides about its middle, or to the right. */
export const CentredSample = ({ on }: { on: boolean }): React.JSX.Element => (
  <span data-preview="centred" className="relative block h-9 w-28 overflow-hidden rounded-md border bg-accent/40">
    {/* Where it was before the panel opened, and the middle of the screen. */}
    <span className="absolute inset-y-1 left-1/2 w-px border-l border-dashed border-foreground/30" />
    <span className={`absolute top-1/2 flex h-5 -translate-y-1/2 overflow-hidden rounded-[4px] border border-foreground/30 bg-popover shadow-sm left-[36px] transition-transform duration-300 ${on ? '-translate-x-4' : ''}`}>
      <span className="flex w-10 items-center border-r border-foreground/15"><span className="ml-1.5 block h-[2px] w-5 rounded-full bg-foreground/50" /></span>
      <span className="block w-8 bg-[color-mix(in_oklab,var(--tt-brand-color-400)_22%,transparent)]" />
    </span>
  </span>
)

/** A window with a note in it, and where the session's time shows: the bubble above, a line at the note's foot, or both. */
const NoteWindow = ({ bubble, foot }: { bubble: boolean; foot: boolean }): React.JSX.Element => (
  <Screen>
    {bubble && <span className="absolute top-[9px] left-1/2 flex h-2.5 w-11 -translate-x-1/2 items-center gap-1 rounded-full bg-popover px-1 shadow-sm ring-1 ring-foreground/20"><span className="size-1.5 rounded-full border border-[var(--tt-brand-color-400)]" /><span className="h-[2px] flex-1 rounded-full bg-foreground/40" /></span>}
    <span className="absolute inset-x-5 top-[24px] flex flex-col gap-[3px]">
      <span className="block h-[2px] w-[80%] rounded-full bg-foreground/45" />
      <span className="block h-[2px] w-[65%] rounded-full bg-foreground/30" />
    </span>
    {foot && <span className="absolute inset-x-5 bottom-1.5 flex items-center gap-1 border-t border-foreground/15 pt-1"><span className="flex gap-[2px]">{[1, 1, 1, 0, 0].map((lit, i) => <span key={i} className={`size-[3px] rounded-full ${lit ? 'bg-[var(--tt-brand-color-400)]' : 'bg-foreground/25'}`} />)}</span><span className="ml-auto text-[8px] leading-none text-muted-foreground tabular-nums">18:24</span></span>}
  </Screen>
)
export const timerShowsChoices = [
  { id: 'bubble', label: 'The bubble', show: <NoteWindow bubble foot={false} /> },
  { id: 'note', label: 'The note', show: <NoteWindow bubble={false} foot /> },
  { id: 'both', label: 'Both', show: <NoteWindow bubble foot /> }
]
export const pillSitsChoices = [
  {
    id: 'notch', label: 'Under the notch',
    show: <Screen><span className="absolute top-0 left-1/2 flex h-[9px] w-[74px] -translate-x-1/2 items-center justify-between rounded-b-[5px] bg-black px-1"><span className="size-1.5 rounded-full border border-[var(--tt-brand-color-400)]" /><span className="text-[6px] leading-none font-semibold text-white">18:24</span></span></Screen>
  },
  {
    id: 'free', label: 'Where I put it',
    show: <Screen><span className="absolute right-2.5 bottom-3 flex h-3 w-14 items-center gap-1 rounded-full bg-popover px-1 shadow-sm ring-1 ring-foreground/20"><span className="size-1.5 rounded-full border border-[var(--tt-brand-color-400)]" /><span className="h-[2px] flex-1 rounded-full bg-foreground/40" /></span></Screen>
  }
]

/** A page in a window: its column narrow, wide, or edge to edge. */
const Column = ({ width }: { width: string }): React.JSX.Element => (
  <Screen>
    <span className="absolute inset-y-0 left-0 w-3 border-r border-foreground/10 bg-foreground/5" />
    <span className="absolute top-[12px] right-1 left-4 flex justify-center">
      <span className="flex flex-col gap-[3px]" style={{ width }}>
        <span className="block h-[3px] w-[55%] rounded-full bg-foreground/60" />
        {[100, 92, 97, 70].map((w, i) => <span key={i} className="block h-[2px] rounded-full bg-foreground/30" style={{ width: `${w}%` }} />)}
      </span>
    </span>
  </Screen>
)
export const widthChoices = [
  { id: 'narrow', label: 'Narrow', show: <Column width="48%" /> },
  { id: 'wide', label: 'Wide', show: <Column width="74%" /> },
  { id: 'full', label: 'Full', show: <Column width="96%" /> }
]

/**
 * Quick capture holding one word, small, and what each “Word meanings”
 * choice does with it: the meaning under it in faint lines whenever the box
 * holds one word, the same only once the Word kind is picked, or nothing.
 */
const OneWordBox = ({ meaning, chip = false }: { meaning: boolean; chip?: boolean }): React.JSX.Element => (
  <span className="absolute inset-1.5 overflow-hidden rounded-md border bg-popover">
    <span className="absolute top-2 left-2 text-[0.625rem] leading-none font-medium text-foreground">petrichor</span>
    {meaning && <>
      <span className="absolute top-[1.15rem] left-2 h-[3px] w-14 rounded-full bg-foreground/35" />
      <span className="absolute top-[1.5rem] left-2 h-[3px] w-9 rounded-full bg-foreground/20" />
    </>}
    {chip && <span className="absolute bottom-1.5 left-2 rounded-full border border-[var(--tt-color-text-green)]/50 px-1 text-[0.5rem] leading-[0.7rem] text-[var(--tt-color-text-green)]">Word</span>}
  </span>
)
export const meaningChoices = [
  { id: 'one-word', label: 'Any one word', show: <OneWordBox meaning /> },
  { id: 'word-kind', label: 'Only for Word', show: <OneWordBox meaning chip /> },
  { id: 'off', label: 'Never', show: <OneWordBox meaning={false} /> }
]
