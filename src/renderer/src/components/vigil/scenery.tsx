import { useEffect, useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { useLive, vigil, type Mood, type Scene, type Settings } from '@/lib/vigil'
import { dayOf } from '@/lib/notes'

/**
 * Scenery: a picture from your own folders at the moments that are rest, not
 * work: an empty inbox, a finished review, the top of today's page, a recap,
 * reading. Sites of grace, not wallpaper: nowhere else. The main process makes
 * the smaller copies and says what mood each one is (src/main/scenery.ts);
 * this picks one for the place and the hour, and dims it so words stay
 * readable over it.
 */

export type Place = 'rest' | 'recap' | 'today' | 'focus'

const SWITCH: Record<Place, keyof Settings> = { rest: 'sceneryRest', recap: 'sceneryRecap', today: 'sceneryToday', focus: 'sceneryFocus' }

/** The hour's moods: golden by day, dusk in the evening, night (or candlelight) after. */
function moodsNow(hour = new Date().getHours()): Mood[] {
  if (hour >= 5 && hour < 17) return ['day']
  if (hour >= 17 && hour < 21) return ['dusk']
  return ['night', 'interior']
}

/** A number from words, the same every time, so a seed always picks the same scene. */
const hash = (text: string): number => {
  let n = 2166136261
  for (let i = 0; i < text.length; i++) n = Math.imul(n ^ text.charCodeAt(i), 16777619)
  return n >>> 0
}

/**
 * The scene for a seed: one of the right mood and shape if there is one,
 * else the right shape, else any. Wide places never get a tall picture: a
 * portrait cut to a strip is a picture of someone's chin.
 */
function choose(scenes: Scene[], seed: string, moods: Mood[] | null, wide: boolean): Scene | null {
  const shaped = wide ? scenes.filter((one) => one.width >= one.height * 1.2) : scenes
  const pool = [shaped.filter((one) => !moods || moods.includes(one.mood)), shaped, scenes].find((one) => one.length) ?? []
  return pool.length ? pool[hash(seed) % pool.length] : null
}

/** The settings and the scenes in your folders, while Scenery is on. */
function useScenery(): { settings: Settings | null; scenes: Scene[] } {
  const settings = useLive(vigil.settings, null as Settings | null)
  const folders = settings?.scenery ? settings.sceneryFolders : null
  const found = useLive(
    () => (folders?.length ? vigil.scenery(folders) : Promise.resolve({ scenes: [] as Scene[], scanning: false })),
    { scenes: [] as Scene[], scanning: false },
    [JSON.stringify(folders)]
  )
  return { settings, scenes: folders ? found.scenes : [] }
}

/** sRGB colour of any CSS colour, through a canvas, which understands them all. */
const rgb = (color: string): [number, number, number] => {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 1
  const context = canvas.getContext('2d', { willReadFrequently: true })!
  context.fillStyle = color
  context.fillRect(0, 0, 1, 1)
  const [r, g, b] = context.getImageData(0, 0, 1, 1).data
  return [r, g, b]
}
const luminance = ([r, g, b]: number[]): number => {
  const lin = (v: number): number => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}
const contrast = (a: number[], b: number[]): number => {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p)
  return (x + 0.05) / (y + 0.05)
}

/**
 * How far a scene must be dimmed toward the page colour for the theme's
 * words, plain and muted, to read at 4.5 to 1 over it whatever the picture
 * is: worked out against a pure white and a pure black picture, the worst
 * either could be, aiming a little higher for the buttons that tint it too.
 * Worked out again when the theme changes.
 */
function useReadable(): number {
  const work = (): number => {
    const style = getComputedStyle(document.documentElement)
    const page = rgb(style.getPropertyValue('--background'))
    const inks = [rgb(style.getPropertyValue('--foreground')), rgb(style.getPropertyValue('--muted-foreground'))]
    for (let dim = 0.5; dim < 1; dim += 0.01) {
      const worst = [0, 255].map((v) => page.map((c) => dim * c + (1 - dim) * v))
      if (worst.every((under) => inks.every((ink) => contrast(ink, under) >= 4.8))) return Math.round(dim * 100) / 100
    }
    return 1
  }
  const [floor, setFloor] = useState(work)
  useEffect(() => {
    const watch = new MutationObserver(() => setFloor(work()))
    watch.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'style', 'data-solid'] })
    return () => watch.disconnect()
  }, [])
  return floor
}

/** The page colour at a strength, for a gradient stop. */
const veil = (strength: number): string => `color-mix(in srgb, var(--background) ${Math.round(Math.min(1, strength) * 100)}%, transparent)`

/**
 * One scene, filling the box it is put in (which must be positioned). When
 * the scene changes, the new one is decoded first and then fades in over the
 * old, with Motion on; with it off, it simply changes. Only the scene on show
 * is kept: the old one goes once the new one is in.
 *
 * `text` says where words sit over it ('below', 'left', 'middle', 'all'): there the
 * dimming rises to what the theme needs for 4.5 to 1; elsewhere it is your
 * Dimness. `fade` lets the picture melt away at the bottom into whatever is
 * behind, the frosted desktop included.
 */
export function Scenery({ place, seed, mood, text = 'none', fade = false, wide = true, soft = false, className = '', rounded = '' }: {
  place: Place
  seed: string
  /** The moods that fit, over the hour's. */
  mood?: Mood[]
  text?: 'none' | 'below' | 'left' | 'middle' | 'all'
  fade?: boolean
  wide?: boolean
  /** Nothing written over it: only a touch of the Dimness, so the painting shows. */
  soft?: boolean
  className?: string
  rounded?: string
}): React.JSX.Element | null {
  const { settings, scenes } = useScenery()
  const floor = useReadable()
  const on = !!settings?.scenery && settings[SWITCH[place]] !== false
  const moods = mood ?? (settings?.sceneryTime ? moodsNow() : null)
  const scene = on ? choose(scenes, `${seed}:${settings?.sceneryShuffle ?? 0}`, moods, wide) : null
  const [shown, setShown] = useState<Scene | null>(null)
  useEffect(() => {
    if (!scene || scene.url === shown?.url) return
    // Decoded off the page's thread before it is shown, so the fade never stutters.
    let gone = false
    const image = new Image()
    image.src = scene.url
    void image.decode().then(() => !gone && setShown(scene), () => !gone && setShown(null))
    return () => void (gone = true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene?.url])
  if (!on || !scene) return null
  const dim = Math.min(0.95, Math.max(0, settings?.sceneryDim ?? 0.5)) * (soft ? 0.35 : 1)
  const strong = Math.max(dim, floor)
  const over = {
    none: veil(dim),
    below: `linear-gradient(to bottom, ${veil(dim)} 0%, ${veil(dim)} 22%, ${veil(strong)} 52%, ${veil(strong)} 100%)`,
    // The words on the left, and the controls along the top.
    left: `linear-gradient(to bottom, ${veil(strong)} 0, ${veil(strong)} 3.5rem, transparent 6rem), linear-gradient(to right, ${veil(strong)} 0%, ${veil(strong)} 55%, ${veil(dim)} 100%)`,
    all: veil(strong),
    middle: `linear-gradient(to right, ${veil(dim)} 0, ${veil(dim)} calc(50% - 34rem), ${veil(strong)} calc(50% - 22rem), ${veil(strong)} calc(50% + 22rem), ${veil(dim)} calc(50% + 34rem), ${veil(dim)} 100%)`
  }[text]
  const melt = fade ? 'linear-gradient(to bottom, black 0%, black 40%, transparent 96%)' : undefined
  return (
    <div aria-hidden className={`pointer-events-none overflow-hidden ${rounded} ${className}`} style={{ maskImage: melt, background: shown ? undefined : `color-mix(in srgb, ${scene.color} 30%, transparent)` }}>
      <AnimatePresence initial={!!settings?.motion}>
        {shown && (
          <motion.img
            key={shown.url}
            src={shown.url}
            alt=""
            decoding="async"
            draggable={false}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: settings?.motion ? 0.9 : 0, ease: 'easeOut' }}
            className={`absolute inset-0 size-full object-cover ${rounded}`}
            // Most of these are landscapes with the sky above and the subject
            // a little over the middle; a tall portrait's face sits higher.
            style={{ objectPosition: shown.height > shown.width ? 'center 30%' : 'center 42%', imageRendering: shown.pixel ? 'pixelated' : undefined }}
          />
        )}
      </AnimatePresence>
      <div className="absolute inset-0" style={{ background: over }} />
    </div>
  )
}

/**
 * The rest moments on show in this window, so only one of them gets a scene:
 * two pictures stacked in one panel is wallpaper, not a pause. A full one
 * goes ahead of a one-line strip.
 */
const resting: symbol[] = []
const told = new Set<() => void>()
function useFirst(wanted: boolean, ahead: boolean): boolean {
  const [me] = useState(() => Symbol('rest'))
  const [, redraw] = useState(0)
  useEffect(() => {
    if (!wanted) return
    if (ahead) resting.unshift(me)
    else resting.push(me)
    const tell = (): void => redraw((n) => n + 1)
    told.add(tell)
    told.forEach((one) => one())
    return () => {
      resting.splice(resting.indexOf(me), 1)
      told.delete(tell)
      told.forEach((one) => one())
    }
  }, [wanted, ahead, me])
  return resting[0] === me
}

/**
 * A rest moment: the empty state it wraps, with a wide scene above it melting
 * down into the page, the sentence over the quiet end of it. With Scenery
 * off, or no pictures yet, just the empty state.
 */
export function Rest({ seed, children, compact = false, strip = false, off = false }: {
  seed: string
  children: ReactNode
  /** In the prompt's narrow panel. */
  compact?: boolean
  /** A one-line rest, like "Nothing rotting": a low band rather than a scene. */
  strip?: boolean
  /** Not a rest moment this time (the same empty state, another list). */
  off?: boolean
}): React.JSX.Element {
  const { settings, scenes } = useScenery()
  const first = useFirst(!off && !!settings?.scenery && !!settings.sceneryRest, !strip)
  if (off || !first || !settings?.scenery || !settings.sceneryRest || !scenes.length) return <>{children}</>
  const [height, room] = strip ? ['h-24', 'pt-14'] : compact ? ['h-60', 'pt-20'] : ['h-[min(34rem,72vh)]', 'pt-[min(9rem,16vh)]']
  return (
    <div className={`relative isolate ${compact || strip ? 'mx-1 mt-1' : 'mx-4 mt-3'}`}>
      <Scenery place="rest" seed={`rest:${seed}:${dayOf()}`} text="below" fade rounded="rounded-xl" className={`absolute inset-x-0 top-0 ${height}`} />
      <div className={`relative ${room}`}>{children}</div>
    </div>
  )
}

/**
 * Today's page's banner: a painted strip of the day's scene, one a day and
 * the same all that day, framed like a print when Postcards is on.
 */
export function DayBanner({ day }: { day: string }): React.JSX.Element | null {
  const { settings, scenes } = useScenery()
  if (!settings?.scenery || !settings.sceneryToday || !scenes.length) return null
  const framed = !!settings.postcards
  return (
    <div className={`relative mb-5 aspect-[4/1] min-h-28 w-full overflow-hidden rounded-xl ${framed ? 'bg-white p-1.5 shadow-[0_1px_2px_color-mix(in_oklab,var(--mf-shadow-ink)_14%,transparent),0_10px_28px_-10px_color-mix(in_oklab,var(--mf-shadow-ink)_35%,transparent)]' : ''}`}>
      <div className="relative size-full overflow-hidden rounded-lg">
        {/* Not the hour's mood: a day keeps one picture from morning to night. */}
        <Scenery place="today" seed={`day:${day}`} mood={['day', 'dusk', 'night', 'interior']} className="absolute inset-0" rounded="rounded-lg" soft />
      </div>
    </div>
  )
}

/**
 * Behind Focus (⇧⌘F): a scene filling the window, dimmed far enough that the
 * words over it read as well as on the plain page. Only while focus is on.
 */
export function FocusScenery(): React.JSX.Element | null {
  const [on, setOn] = useState(() => document.documentElement.dataset.focus === 'on')
  useEffect(() => {
    const watch = new MutationObserver(() => setOn(document.documentElement.dataset.focus === 'on'))
    watch.observe(document.documentElement, { attributes: true, attributeFilter: ['data-focus'] })
    return () => watch.disconnect()
  }, [])
  if (!on) return null
  // Words can be anywhere in focus, so the whole window is dimmed for them.
  return <Scenery place="focus" seed={`focus:${dayOf()}`} text="all" className="fixed inset-0 -z-10" />
}
