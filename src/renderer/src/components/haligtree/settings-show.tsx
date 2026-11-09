import { AudioLines, Camera, CircleCheck, FileOutput, Gem, Inbox, Repeat2 } from 'lucide-react'
import { tidySpeech } from '@/lib/fillers'
import { Orb } from './orb'
import { PlaceIcon, SECTIONS } from './places'
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { motion } from 'motion/react'
import { BorderBeam } from 'border-beam'
import { allThemes, applyTheme, currentTheme, themeName, type Theme } from '@/lib/theme'
import { chime, step } from '@/lib/sound'
import { EASING, still } from '@/lib/motion'
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

/** A picture to show pictures with: one of Haligtree's own paper drawings. */
const PICTURE = drawingFor('settings-sample').url
const OTHER_PICTURE = drawingFor('a link card').url

/**
 * Choices as tiles: each a small picture of what it gives, its name under
 * it, the chosen one ringed in the accent. One click picks; arrow keys move
 * between them as between radio buttons.
 */
export function Choices({ options, on, pick, label, min = '7.5rem', tall = false }: {
  /** `said`: one line under the name, saying what the choice does. */
  options: { id: string; label: string; show: ReactNode; said?: string }[]
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
            <span aria-hidden data-preview className={`relative block ${tall ? 'h-20' : 'h-16'} overflow-hidden rounded-lg border bg-background transition-[box-shadow,border-color] duration-150 ${chosen ? 'border-transparent ring-2 ring-[var(--tt-brand-color-400)]' : 'group-hover:border-foreground/30'}`}>
              {option.show}
            </span>
            <span className={`px-0.5 text-control ${chosen ? 'text-foreground' : 'text-muted-foreground group-hover:text-foreground'}`}><Weighted on={chosen}>{option.label}</Weighted></span>
            {option.said && <span data-choice-said className="px-0.5 text-meta text-muted-foreground text-pretty">{option.said}</span>}
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
            <span aria-hidden data-preview className={`mf-swatch-${theme} relative flex h-14 flex-col justify-between overflow-hidden rounded-lg border p-2 transition-[box-shadow,border-color] duration-150 ${chosen ? 'border-transparent ring-2 ring-[var(--tt-brand-color-400)]' : 'group-hover:border-foreground/30'}`}
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
 * flag, the plain line's and bar's glow), a rest, and again. Silent. Still, it is full.
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
  { id: 'line', label: 'Plain line' },
  { id: 'plain', label: 'Plain bar' },
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
    <span data-picture-sample className={`flex shrink-0 flex-col items-end gap-1 ${className}`}>
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
  // Brutal's is the ink; Paper keeps the theme's own print, as Soft does.
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

/** The selection bar as it shows, its words beside its icons or not: what "Words on the selection bar" changes. */
export function BarWordsSample({ words }: { words: boolean }): React.JSX.Element {
  const parts: [React.ComponentType<{ className?: string }>, string][] = [[Inbox, 'Capture'], [Gem, 'Gem'], [CircleCheck, 'Task'], [FileOutput, 'Move out'], [Repeat2, 'Sync'], [Camera, 'Image']]
  return (
    <span aria-hidden data-bar-words-sample className="flex items-center gap-0.5 rounded-lg border px-1 py-1 text-control text-muted-foreground shadow-xs" style={{ background: 'color-mix(in srgb, var(--accent) 55%, var(--background))' }}>
      {parts.map(([Icon, label]) => (
        <span key={label} className="flex h-7 items-center gap-1.5 rounded-md px-1.5"><Icon className="size-4" />{words && label}</span>
      ))}
    </span>
  )
}

/** "Lines" and "Emoji" icons, each as a few of the sidebar's rows would show. */
export const menuIconChoices = (): { id: string; label: string; show: ReactNode }[] =>
  [{ id: 'lines', label: 'Lines' }, { id: 'emoji', label: 'Emoji' }].map((one) => ({
    ...one,
    show: (
      <span data-menu-icons-sample={one.id} className="absolute inset-0 flex flex-col items-start justify-center gap-1.5 px-3 text-[12px] leading-none text-foreground">
        {SECTIONS.filter((place) => ['inbox', 'day', 'nuggets'].includes(place.id)).map((place) => (
          <span key={place.id} className="flex items-center gap-2">
            {one.id === 'emoji' ? <span className="mf-emoji-icon flex size-3.5 items-center justify-center text-[0.8125rem]">{place.emoji}</span> : <place.icon className="size-3.5 text-muted-foreground" />}
            {place.label}
          </span>
        ))}
      </span>
    )
  }))

/** A few of the sidebar's pages, as the sidebar draws them: in their own colours, or all in one with "Coloured icons" off. */
export function IconColourSample(): React.JSX.Element {
  return (
    <span aria-hidden data-icon-colour-sample className="flex items-center gap-2.5 rounded-lg border px-2.5 py-1.5 shadow-xs">
      {SECTIONS.filter((one) => ['inbox', 'day', 'nuggets', 'today', 'calendar'].includes(one.id)).map((place) => <PlaceIcon key={place.id} place={place} full />)}
    </span>
  )
}

/** "Soft" and "Rich" highlights, each a line of words marked at its own weight in this theme's colours. */
const HIGHLIGHT_WEIGHT: Record<string, [light: number, dark: number]> = { soft: [28, 42], rich: [58, 70] }
const Marked = ({ hue, weight, children }: { hue: string; weight: number; children: ReactNode }): React.JSX.Element => (
  <mark className="rounded-[3px] px-0.5 text-inherit" style={{ background: `color-mix(in srgb, var(--tt-color-text-${hue}) ${weight}%, transparent)` }}>{children}</mark>
)
export const highlightChoices = (dark: boolean): { id: string; label: string; show: ReactNode }[] =>
  [{ id: 'soft', label: 'Soft' }, { id: 'rich', label: 'Rich' }].map((one) => {
    const weight = HIGHLIGHT_WEIGHT[one.id][dark ? 1 : 0]
    return {
      ...one,
      show: (
        <span data-hl-sample={one.id} className="absolute inset-0 flex flex-col items-start justify-center gap-1.5 px-3 text-[13px] leading-none text-foreground">
          <span><Marked hue="yellow" weight={weight}>kept</Marked> and <Marked hue="green" weight={weight}>found</Marked></span>
          <span><Marked hue="blue" weight={weight}>read</Marked> <Marked hue="pink" weight={weight}>again</Marked></span>
        </span>
      )
    }
  })

/** A #tag chip in one look, drawn as itself whatever the app's look is now, so both choices show side by side. */
const SampleTag = ({ look, tag, hue }: { look: string; tag: string; hue: string }): React.JSX.Element =>
  look === 'dot' ? (
    <span className="flex items-center gap-1.5 rounded-full py-0.5 pr-2 pl-1.5 text-foreground shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--foreground)_20%,transparent)]">
      <span className="size-1.5 rounded-full shrink-0" style={{ background: `var(--tt-color-text-${hue})` }} />#{tag}
    </span>
  ) : (
    <span className="rounded-full px-2 py-0.5" style={{ background: `var(--mf-chip-bg-${hue})`, color: `var(--mf-chip-ink-${hue})` }}>#{tag}</span>
  )

/** How a #tag chip looks, each choice drawn with two chips of its own. */
export const tagLookChoices = [
  { id: 'solid', label: 'Solid' },
  { id: 'dot', label: 'Dot' }
].map((one) => ({
  ...one,
  show: (
    <span data-tag-look-sample={one.id} className="absolute inset-0 flex flex-wrap items-center justify-center gap-1.5 px-2 text-[12px] leading-none">
      <SampleTag look={one.id} tag="reading" hue="blue" />
      <SampleTag look={one.id} tag="ideas" hue="green" />
    </span>
  )
}))

/** The paper a note's page is written on, each choice drawn as a swatch of itself. */
export const paperChoices = [
  { id: 'plain', label: 'Plain' },
  { id: 'dots', label: 'Dots' }
].map((one) => ({ ...one, show: <span data-paper-sample={one.id} className="mf-paper absolute inset-0" /> }))

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
        <img src={OTHER_PICTURE} alt="" draggable={false} className={`relative h-full object-cover ${one.id === 'fill' ? 'w-full object-[50%_30%]' : 'aspect-[3/4] w-auto shadow-[0_0_6px_color-mix(in_oklab,var(--mf-shadow-ink)_25%,transparent)]'}`} />
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
      (card as HTMLElement).animate([{ opacity: 0, transform: 'translateY(8px) scale(0.97)' }, { opacity: 1, transform: 'none' }], { duration: 320, delay: index * 70, easing: EASING, fill: 'backwards' }))
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
  <span data-preview="list-picture" className="flex h-9 w-48 items-center gap-2 rounded-md border bg-background pr-1.5 pl-2.5 text-control">
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

/** Home's month, small: a week to a row, the days with something planned marked, today ringed. Faded while it is off. */
export const HomeMonthSample = ({ on }: { on: boolean }): React.JSX.Element => (
  <span data-preview="home-month" className={`flex h-9 items-center rounded-md border bg-background px-2.5 transition-opacity duration-200 ${on ? '' : 'opacity-40'}`}>
    <span className="grid grid-cols-7 gap-[3px]">
      {Array.from({ length: 28 }, (_, i) => (
        <span key={i} className={`size-[4px] rounded-[1px] ${i === 17 ? 'bg-[var(--tt-brand-color-400)] outline outline-1 outline-offset-1 outline-[var(--tt-brand-color-400)]' : [3, 9, 12, 20, 24].includes(i) ? 'bg-foreground/70' : 'bg-foreground/20'}`} />
      ))}
    </span>
  </span>
)

/** Today's lines over its list, small: "2 of 5 done" with its bar, and the day's hours. Faded while they are off. */
export const DayHintsSample = ({ on }: { on: boolean }): React.JSX.Element => (
  <span data-preview="day-hints" className={`flex h-9 flex-col justify-center gap-[3px] rounded-md border bg-background px-2.5 text-[10px] leading-none font-medium tabular-nums text-foreground transition-opacity duration-200 ${on ? '' : 'opacity-40'}`}>
    <span className="flex items-center gap-1.5">2 of 5 done<span className="w-[28px]"><ProgressBar edge silent value={0.4} label="2 of 5 done" thick={3} duration={0} /></span></span>
    <span style={{ color: 'var(--tt-color-text-orange)' }}>2 h planned, 4 h left</span>
  </span>
)

/** Home's four bars of time gone, small: the day, the week, the month and the year. Faded while it is off. */
export const TimeGoneSample = ({ on }: { on: boolean }): React.JSX.Element => (
  <span data-preview="home-time-gone" className={`flex h-9 items-center gap-2 rounded-md border bg-background px-2.5 text-[11px] text-muted-foreground transition-opacity duration-200 ${on ? '' : 'opacity-40'}`}>
    {([['D', 60], ['W', 40], ['M', 70], ['Y', 80]] as const).map(([name, share]) => (
      <span key={name} className="flex flex-col items-center gap-[3px] leading-none">
        <span className="flex h-[4px] w-[22px] items-center"><ProgressBar edge silent value={share / 100} label={`${share}% gone`} thick={4} duration={0} className="w-full" /></span>
        {name}
      </span>
    ))}
  </span>
)

/** A heading with its arrow, folded or not: on, the arrow is there and its lines can fold away; off, no arrow. */
export const FoldSample = ({ on }: { on: boolean }): React.JSX.Element => (
  <span data-preview="fold" className="flex h-9 w-40 items-center gap-1 rounded-md border bg-background px-2 text-control font-semibold text-foreground">
    <span aria-hidden className={`inline-block w-3 text-[10px] text-muted-foreground transition-opacity duration-200 ${on ? '' : 'opacity-0'}`}>▸</span>
    Chapter one
    <span className={`ml-1 flex flex-col gap-[3px] transition-opacity duration-200 ${on ? 'opacity-25' : ''}`}>
      <span className="block h-[2px] w-8 rounded-full bg-foreground/50" />
      <span className="block h-[2px] w-6 rounded-full bg-foreground/50" />
    </span>
  </span>
)

/** A video and a line being written under it: on, the video shows paused and the line starts with its time; off, it plays on and the line is plain. */
export const TypePauseSample = ({ on }: { on: boolean }): React.JSX.Element => (
  <span data-preview="type-pause" data-on={on || undefined} className="flex h-9 w-40 items-center gap-2 rounded-md border bg-background px-2 text-control text-foreground">
    <span aria-hidden className="flex h-5 w-7 shrink-0 items-center justify-center rounded-[4px] bg-foreground/80 text-[9px] text-background">{on ? '❙❙' : '▶'}</span>
    <span className="truncate">{on && <span className="text-primary underline decoration-primary/40 underline-offset-2">[4:05]</span>} tides turn</span>
  </span>
)

/** A misspelt word as that place shows it: on, its soft squiggle; off, the word left plain. */
export const SpellSample = ({ on, words }: { on: boolean; words: string }): React.JSX.Element => (
  <span data-preview="spell" data-on={on || undefined} className="flex h-9 w-40 items-center justify-center rounded-md border bg-background px-2.5 text-control text-foreground">
    <span className="underline decoration-wavy decoration-1 underline-offset-[3px] transition-[text-decoration-color] duration-200"
      style={{ textDecorationColor: on ? 'color-mix(in oklab, var(--tt-cursor-color) 55%, transparent)' : 'transparent' }}>{words}</span>
  </span>
)

/** A line with a date in it: on, the date is lit and its day said under it; off, plain words. */
export const DatesSample = ({ on }: { on: boolean }): React.JSX.Element => (
  <span data-preview="dates-lit" data-on={on || undefined} className="flex h-9 w-40 items-center justify-center rounded-md border bg-background px-2 text-control text-foreground">
    {/* One run of words: as two flex items, the space between them was dropped ("dueFriday"). */}
    <span>Essay due <span className={`transition-colors duration-200 ${on ? 'mf-date-word' : ''}`}>Friday 3pm</span></span>
  </span>
)

/** A note's last line and, on, the quiet offer under it; off, nothing under it. */
export const OffersSample = ({ on }: { on: boolean }): React.JSX.Element => (
  <span data-preview="offers" data-on={on || undefined} className="flex h-9 w-40 flex-col justify-center gap-1 rounded-md border bg-background px-2">
    <span className="block h-[2px] w-[80%] rounded-full bg-foreground/30" />
    <span className={`flex items-center gap-1 rounded-[4px] border px-1 text-[9px] leading-[13px] text-muted-foreground transition-opacity duration-200 ${on ? '' : 'opacity-0'}`}>
      <b className="font-medium text-foreground">Names “Stoicism”.</b> Link it
    </span>
  </span>
)

/** The top bar once a note has scrolled: its first line there, faintly, or the bar left plain. */
export const TitleTopSample = ({ on }: { on: boolean }): React.JSX.Element => (
  <span data-preview="title-top" className="flex h-9 w-40 flex-col overflow-hidden rounded-md border bg-background">
    <span className="flex h-3.5 shrink-0 items-center border-b px-1.5 text-[9px] leading-none text-muted-foreground">
      <span className={`transition-opacity duration-200 ${on ? '' : 'opacity-0'}`}>Weekend in Lisbon</span>
    </span>
    <span className="flex flex-1 flex-col justify-center gap-[3px] px-1.5">
      <span className="block h-[2px] w-[85%] rounded-full bg-foreground/30" />
      <span className="block h-[2px] w-[65%] rounded-full bg-foreground/30" />
    </span>
  </span>
)

/**
 * A page being written, line after line. On, the line being typed stays in
 * the middle and the lines above slide up; off, the line walks down the page
 * and the page stays. With motion off or reduced, a still picture: the line in
 * the middle (on) or near the foot (off).
 */
export function TypewriterSample({ on }: { on: boolean }): React.JSX.Element {
  const LINE = 7
  const [line, setLine] = useState(2)
  const [quiet] = useState(() => still())
  useEffect(() => {
    if (quiet) return void setLine(on ? 2 : 3)
    setLine(on ? 2 : 0)
    const timer = setInterval(() => setLine((was) => (on ? (was >= 7 ? 2 : was + 1) : (was + 1) % 4)), 900)
    return () => clearInterval(timer)
  }, [on, quiet])
  // On: the page moves so the line sits in the middle row; off: the page rests and the line moves.
  const shift = on ? (line - 2) * LINE : 0
  const at = line
  const widths = [82, 64, 76, 58, 70, 66, 80, 60]
  return (
    <span data-preview="typewriter" className="relative flex h-9 w-28 overflow-hidden rounded-md border bg-background">
      <span className="absolute inset-x-2 top-[0.5px] flex flex-col" style={{ transform: `translateY(${-shift}px)`, transition: quiet ? undefined : 'transform 360ms var(--mf-ease)' }}>
        {/* Always as many lines (the most it shows): lines added and dropped as it played moved the page round it. */}
        {Array.from({ length: 14 }, (_, i) => (
          <span key={i} className="flex h-[7px] items-center">
            <span className={`block h-[2px] rounded-full ${i === at ? 'bg-[var(--tt-brand-color-400)]' : i < at ? 'bg-foreground/45' : 'bg-transparent'}`} style={{ width: `${widths[i % widths.length]}%` }} />
          </span>
        ))}
      </span>
      {/* Where the middle of the page is: the line stays on it while this is on. */}
      <span aria-hidden className={`absolute inset-x-0 top-1/2 h-[7px] -translate-y-1/2 bg-foreground/[0.06] transition-opacity duration-200 ${on ? 'opacity-100' : 'opacity-0'}`} />
    </span>
  )
}

// A desktop picture for the sticky samples: bright, so what each material does to it shows.
const WALL = 'linear-gradient(135deg, #5b7fd4 0%, #b77fc0 45%, #f2a65e 100%)'
const NOTE_LINES = (ink: string): React.JSX.Element => (
  <span className="flex flex-col gap-[3px] p-1.5">
    <span className="block h-[2px] w-[80%] rounded-full" style={{ background: ink }} />
    <span className="block h-[2px] w-[60%] rounded-full" style={{ background: ink }} />
    <span className="block h-[2px] w-[70%] rounded-full" style={{ background: ink }} />
  </span>
)
/** Your own desktop picture (main/frost.ts), read once for the material previews; the made-up one until it comes, or when it can't be read. */
let wallpaper: Promise<string | null> | null = null
function useWallpaper(): string {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    let live = true
    void (wallpaper ??= window.api?.wallpaper?.() ?? Promise.resolve(null)).then((one) => live && setUrl(one), () => undefined)
    return () => void (live = false)
  }, [])
  return url ? `center / cover no-repeat url("${url}")` : WALL
}
/**
 * A sticky on your desktop in each material, drawn over your own desktop picture: paper is the note's own colour,
 * solid, nothing showing through; glass is the Mac's window glass, your desktop showing through it, blurred.
 */
function Sticky({ made }: { made: 'paper' | 'glass' }): React.JSX.Element {
  const desk = useWallpaper()
  return (
    <span className="absolute inset-0" style={{ background: desk }}>
      <span className="absolute top-2.5 left-1/2 block h-12 w-16 -translate-x-1/2 overflow-hidden rounded-[5px] shadow-[0_6px_14px_-4px_rgb(0_0_0/0.45)]" style={{ background: made === 'paper' ? '#f6e7a6' : undefined }}>
        {made === 'glass' && <span className="absolute -inset-4 blur-[8px] saturate-150" style={{ background: desk }} />}
        {made === 'glass' && <span className="absolute inset-0 bg-[rgb(255_255_255/0.22)] ring-1 ring-white/40 ring-inset" />}
        <span className="relative block">{NOTE_LINES(made === 'glass' ? 'rgb(20 20 28 / 0.75)' : 'rgb(40 34 25 / 0.6)')}</span>
      </span>
    </span>
  )
}
export const stickyChoices = [
  { id: 'paper', label: 'Paper', said: 'Solid, in the note’s own colour.' },
  { id: 'glass', label: 'Glass', said: 'Your desktop shows through, blurred.' }
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
      <span ref={note} className="absolute top-1.5 left-4 block h-6 w-8 rounded-[3px] bg-[#f6e7a6] shadow-[0_3px_6px_-2px_color-mix(in_oklab,var(--mf-shadow-ink)_40%,transparent)]" style={{ transform: 'rotate(-2deg)' }}>
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
        className="absolute top-1 right-1.5 flex h-7 w-11 items-start gap-1 rounded-[4px] bg-popover p-1 shadow-[0_3px_6px_-2px_color-mix(in_oklab,var(--mf-shadow-ink)_40%,transparent)] transition-transform duration-300 ease-(--mf-ease) motion-reduce:transition-none"
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
    {bubble && <span className="absolute top-[9px] left-1/2 flex h-2.5 w-11 -translate-x-1/2 items-center gap-1 rounded-full bg-popover px-1 shadow-sm ring-1 ring-foreground/20"><span className="size-1.5 rounded-full shrink-0 border border-[var(--tt-brand-color-400)]" /><span className="h-[2px] flex-1 rounded-full bg-foreground/40" /></span>}
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
    show: <Screen><span className="absolute top-0 left-1/2 flex h-[9px] w-[74px] -translate-x-1/2 items-center justify-between rounded-b-[5px] bg-black px-1"><span className="size-1.5 rounded-full shrink-0 border border-[var(--tt-brand-color-400)]" /><span className="text-[6px] leading-none font-semibold text-white">18:24</span></span></Screen>
  },
  {
    id: 'free', label: 'Where I put it',
    show: <Screen><span className="absolute right-2.5 bottom-3 flex h-3 w-14 items-center gap-1 rounded-full bg-popover px-1 shadow-sm ring-1 ring-foreground/20"><span className="size-1.5 rounded-full shrink-0 border border-[var(--tt-brand-color-400)]" /><span className="h-[2px] flex-1 rounded-full bg-foreground/40" /></span></Screen>
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
/** A page with a picture on it, as wide as each “Pictures in notes” choice draws one. */
const PicturedPage = ({ width }: { width: string }): React.JSX.Element => (
  <Screen>
    <span className="absolute inset-x-3 top-[10px] flex flex-col gap-[3px]">
      <span className="block h-[2px] w-[80%] rounded-full bg-foreground/30" />
      <span className="block h-7 rounded-[3px] bg-[color-mix(in_oklab,var(--tt-color-text-blue)_35%,transparent)]" style={{ width }} />
      <span className="block h-[2px] w-[90%] rounded-full bg-foreground/30" />
    </span>
  </Screen>
)
export const pictureSizeChoices = [
  { id: 'full', label: 'Full width', show: <PicturedPage width="100%" /> },
  { id: 'medium', label: 'Medium', show: <PicturedPage width="60%" /> },
  { id: 'small', label: 'Small', show: <PicturedPage width="35%" /> }
]
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
  { id: 'word-kind', label: 'Only for Term', show: <OneWordBox meaning chip /> },
  { id: 'off', label: 'Never', show: <OneWordBox meaning={false} /> }
]

// --- Voice notes ------------------------------------------------------------------

const SAID = [
  { at: '0:00', words: 'Pick up eggs on the way home.' },
  { at: '0:03', words: 'And call Mum about Sunday.' }
]

/**
 * "Transcribe voice notes as you record them", shown: a recording just kept,
 * then (on) the Orb listening and its words coming in under it, each line
 * led by its time, as a note shows them. Off, the recording stays as it is.
 */
export function TranscribeSample({ on }: { on: boolean }): React.JSX.Element {
  const [stage, setStage] = useState<'kept' | 'listening' | 'words'>(on ? 'words' : 'kept')
  // The value last seen: it plays only on a real change, never on a first run.
  const last = useRef(on)
  const play = (): void => {
    chime('saved')
    setStage(on ? 'listening' : 'kept')
  }
  useEffect(() => {
    if (last.current === on) return
    last.current = on
    setStage(on ? 'listening' : 'kept')
  }, [on])
  // The listening lasts a moment, then the words arrive.
  useEffect(() => {
    if (stage !== 'listening') return
    const next = setTimeout(() => (chime('noted'), setStage('words')), 1400)
    return () => clearTimeout(next)
  }, [stage])
  return (
    <div data-preview="transcribe" className="mt-3 flex flex-wrap items-start gap-3">
      <div className="flex w-72 max-w-full flex-col gap-2 rounded-lg border border-border/60 bg-background p-3">
        <div className="flex items-center gap-2 rounded-md bg-muted/60 px-2.5 py-2 text-control">
          <AudioLines className="size-4 shrink-0 text-muted-foreground" />
          <span className="truncate">Voice note 31 Oct 15.51</span>
        </div>
        {stage === 'listening' && <Orb state="listening" label="Listening…" />}
        {stage === 'words' && SAID.map((line, i) => (
          <motion.p key={line.at} initial={still() ? false : { opacity: 0, y: 4, filter: 'blur(3px)' }} animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }} transition={{ delay: i * 0.35, duration: 0.35 }}
            className="text-control text-muted-foreground">
            <span className="mr-1 text-[var(--tt-brand-color-500)] underline decoration-current/35 underline-offset-2 tabular-nums">[{line.at}]</span>{line.words}
          </motion.p>
        ))}
      </div>
      <Button variant="outline" size="sm" onClick={play} disabled={stage === 'listening'}>{on ? 'Record one' : 'Keep one'}</Button>
    </div>
  )
}

/**
 * "Tidy transcripts", shown: one line as it was said, and (on) the same line
 * as it is kept, the ums and the doubled word gone; off, as said.
 */
const SAID_LINE = 'Um, so the the Venetian statute, uh, came first, you know.'
export function TidySample({ on }: { on: boolean }): React.JSX.Element {
  return (
    <div data-preview="tidy" className="mt-3 flex w-80 max-w-full flex-col gap-1.5 rounded-lg border border-border/60 bg-background p-3 text-control">
      <p className="text-xs text-muted-foreground">As said</p>
      <p className="text-muted-foreground">{SAID_LINE}</p>
      <p className="mt-1 text-xs text-muted-foreground">Kept in the note</p>
      <motion.p key={String(on)} data-tidy-kept initial={still() ? false : { opacity: 0, y: 3 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
        {on ? tidySpeech(SAID_LINE) : SAID_LINE}
      </motion.p>
    </div>
  )
}

/** Talk to type, shown: the key, then the words coming in faint and firming up, as in a note. */
const TALK_WORDS = ['Pick up', 'Pick up the', 'Pick up the books from', 'Pick up the books from the library.']
export function TalkSample({ on, keys, taps }: { on: boolean; keys: string; taps: boolean }): React.JSX.Element {
  const [heard, setHeard] = useState(on ? TALK_WORDS.length : 0)
  const play = (): void => {
    chime('listen')
    setHeard(1)
  }
  useEffect(() => {
    if (!heard || heard >= TALK_WORDS.length) return
    const next = setTimeout(() => {
      if (heard + 1 === TALK_WORDS.length) chime('listened')
      setHeard(heard + 1)
    }, 450)
    return () => clearTimeout(next)
  }, [heard])
  const listening = heard > 0 && heard < TALK_WORDS.length
  return (
    <div data-preview="talk" className="mt-3 flex flex-wrap items-center gap-3">
      <div className="flex min-h-11 w-72 max-w-full items-center gap-1 rounded-lg border border-border/60 bg-background px-3 py-2 text-control">
        <span className={listening ? 'mf-talk-faint' : ''}>{heard ? TALK_WORDS[heard - 1] : <span className="text-muted-foreground">{on ? `${taps ? 'Tap' : 'Hold'} ${keys} and talk` : 'Talk to type is off'}</span>}</span>
        {listening && <Orb state="listening" />}
      </div>
      <Button variant="outline" size="sm" onClick={play} disabled={!on || listening}>Show me</Button>
    </div>
  )
}
