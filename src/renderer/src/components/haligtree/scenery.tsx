import { MORNING_FROM } from '../../../../main/day-parts'
import { useEffect, useLayoutEffect, useState, type ReactNode } from 'react'
import { sunMoods } from '@/lib/sun'
import { useReading, useSeen } from '@/lib/reads-in'
import { decoded, warm, WAIT } from '@/lib/decoded'
import { contrast } from '@/lib/on-accent'
import { FilmGrain } from './film-grain'
import { AnimatePresence, motion } from 'motion/react'
import { useLive, haligtree, type Mood, type Scene, type Settings } from '@/lib/haligtree'
import { dayOf } from '@/lib/notes'
import { chime } from '@/lib/sound'
import { Shuffle } from 'lucide-react'
import { Tip, toast } from './ui'

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
  // By your sun where it is known (lib/sun.ts), else by the clock.
  const sun = sunMoods()
  if (sun) return sun
  if (hour >= MORNING_FROM && hour < 17) return ['day']
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
/** Below this a painting reads as black under a page's words (the measure scenery.ts calls a night picture). */
const NEAR_BLACK = 0.13

function choose(scenes: Scene[], seed: string, moods: Mood[] | null, wide: boolean): Scene | null {
  // A Day, Week or Month banner is never near black (Moonlit Night on the Dnieper): it read as a dark slab, not a painting.
  const bright = /^(day|week|month):/.test(seed) ? scenes.filter((one) => one.light >= NEAR_BLACK) : scenes
  const shaped = wide ? bright.filter((one) => one.width >= one.height * 1.2) : bright
  const tiers = [shaped.filter((one) => !moods || moods.includes(one.mood)), shaped, bright.length ? bright : scenes]
  const pool = tiers.find((one) => one.length) ?? []
  const key = `${seed}:${moods?.join() ?? ''}:${wide}`
  // Kept once shown: the list grows and reorders as the folders are read again,
  // and a page whose picture changed under you a moment after it opened looked
  // like a carousel. It stays until the seed changes (a new day, a reshuffle).
  const kept = scenes.find((one) => one.url === (picked.get(key) ?? restTaken()[key]))
  if (kept) return (picked.set(key, kept.url), kept)
  // A rest moment's picture, and a day's, week's or month's banner, is one no other of them shows, while there are
  // enough to go round: by chance, two empty pages, or the Week's and Month's pages, showed the same one.
  const taken = /^(rest|day|week|month):/.test(seed) ? new Set([...Object.values(restTaken()), ...picked.values()]) : new Set<string>()
  // The hour's mood first; once its pictures are all in use, one of another mood before a repeat.
  const free = tiers.map((tier) => tier.filter((one) => !taken.has(one.url))).find((one) => one.length) ?? []
  // A day's, week's or month's banner takes the next picture in a fixed shuffled order, one step a day (or week, or
  // month), so none comes back until every other one has had its turn. Scored afresh each day, as before, the same
  // painting came back two days out of three (with 11 pictures, the Wanderer on the 28th and the 30th).
  const dated = /^(day|week|month):(\d{4})-(\d{2})(?:-(\d{2}))?/.exec(seed)
  const from = free.length ? free : pool
  let best: Scene | null = null
  if (dated && from.length) {
    const [, unit, y, m, d] = dated
    const days = Math.floor(Date.UTC(Number(y), Number(m) - 1, Number(d ?? 1)) / 86_400_000)
    const turn = unit === 'day' ? days : unit === 'week' ? Math.floor(days / 7) + 3 : Number(y) * 12 + Number(m) + 7
    // The order is the whole pool's, so a picture taken by another banner is passed over, never reshuffled around.
    const order = [...pool].sort((a, b) => hash(`order:${a.id}`) - hash(`order:${b.id}`))
    for (let step = 0; step < order.length && !best; step++) {
      const one = order[(turn + step) % order.length]
      if (from.includes(one)) best = one
    }
  }
  // Anything else: each picture scored on its own against the seed, so where it sits in the list does not matter.
  best ??= from.reduce<Scene | null>((top, one) => (!top || hash(`${seed}:${one.id}`) > hash(`${seed}:${top.id}`) ? one : top), null)
  if (best) {
    picked.set(key, best.url)
    if (seed.startsWith('rest:')) keepRest(key, best.url)
  }
  return best
}

/** Today's rest pictures, place by place, kept for the day so each place keeps its own across windows and reloads. */
const REST_KEY = 'scenery-rest'
function restTaken(): Record<string, string> {
  try {
    const saved = JSON.parse(localStorage.getItem(REST_KEY) ?? 'null') as { day: string; by: Record<string, string> } | null
    return saved?.day === dayOf() ? saved.by : {}
  } catch {
    return {}
  }
}
function keepRest(key: string, url: string): void {
  try {
    localStorage.setItem(REST_KEY, JSON.stringify({ day: dayOf(), by: { ...restTaken(), [key]: url } }))
  } catch {
    // Not kept: the next window picks again, a repeat at worst.
  }
}
/** The picture each place has shown, for as long as this window is open. */
const picked = new Map<string, string>()

/** The settings and the scenes in your folders, while Scenery is on. */
const NOT_YET = { scenes: [] as Scene[], scanning: false, key: '' }
function useScenery(): { settings: Settings | null; scenes: Scene[]; loading: boolean; scanning: boolean } {
  const settings = useLive(haligtree.settings, null as Settings | null)
  // Off is asked too, with no folders, so the main process stops copying them; only not yet known is not.
  const folders = settings ? (settings.scenery ? settings.sceneryFolders : []) : null
  const key = JSON.stringify(folders)
  // Each answer carries the folders it is for: one kept from before the settings were read (no folders) is not
  // this one's, and counting it as read drew the words plain, then moved them down under the scene once it came.
  const found = useLive(
    () => (folders ? haligtree.scenery(folders) : Promise.resolve({ scenes: [] as Scene[], scanning: false })).then((one) => ({ ...one, key })),
    NOT_YET,
    [key]
  )
  // `loading`: not answered for these folders yet, which a page waits for. `scanning`: still looking
  // through them with nothing found yet, which is not "no pictures": the scene's room is kept, unwaited.
  return { settings, scenes: folders?.length && found.key === key ? found.scenes : [], loading: !!folders?.length && found.key !== key, scanning: !!folders?.length && found.key === key && found.scanning && !found.scenes.length }
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

/**
 * How far a scene must be dimmed toward the page colour for the theme's
 * words, plain and muted, to read at 4.5 to 1 over it whatever the picture
 * is: worked out against a pure white and a pure black picture, the worst
 * either could be, aiming a little higher for the buttons that tint it too.
 * Worked out again when the theme changes, never as it draws: reading the page's colours forces the browser to work
 * out every style on the page first, and a Journal day of 5,000 notes spent 7 seconds there on each draw (qa/day-scale.mjs).
 * `light`: whether the page colour is a light one.
 */
function useReadable(target = 4.8): { floor: number; light: boolean } {
  const work = (): { floor: number; light: boolean } => {
    const style = getComputedStyle(document.documentElement)
    const page = rgb(style.getPropertyValue('--background'))
    const light = (page[0] * 299 + page[1] * 587 + page[2] * 114) / 1000 > 140
    const inks = [rgb(style.getPropertyValue('--foreground')), rgb(style.getPropertyValue('--muted-foreground'))]
    for (let dim = 0.5; dim < 1; dim += 0.01) {
      const worst = [0, 255].map((v) => page.map((c) => dim * c + (1 - dim) * v))
      if (worst.every((under) => inks.every((ink) => contrast(ink, under) >= target))) return { floor: Math.round(dim * 100) / 100, light }
    }
    return { floor: 1, light }
  }
  const [floor, setFloor] = useState(work)
  // The same answer keeps the same object, so nothing draws again for it.
  const again = (): void => setFloor((was) => { const now = work(); return now.floor === was.floor && now.light === was.light ? was : now })
  useEffect(again, [target]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const watch = new MutationObserver(again)
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
export function Scenery({ place, seed, mood, text = 'none', fade = false, wide = true, soft = false, cloudy = false, className = '', rounded = '' }: {
  place: Place
  seed: string
  /** The moods that fit, over the hour's. */
  mood?: Mood[]
  text?: 'none' | 'below' | 'left' | 'middle' | 'all'
  fade?: boolean
  wide?: boolean
  /** Nothing written over it: only a touch of the Dimness, so the painting shows. */
  soft?: boolean
  /** The sky is overcast: a faint cloud shadow passes over now and then, not the warm light. */
  cloudy?: boolean
  className?: string
  rounded?: string
}): React.JSX.Element | null {
  const { settings, scenes } = useScenery()
  // Where words sit over the picture itself (focus, reading), a busy painting
  // still fights them at an average contrast that passes: aim higher there,
  // and soften the picture so no sharp bright edge sits behind a letter.
  const covered = text === 'all' || text === 'middle' || text === 'left'
  const { floor, light: lightPage } = useReadable(covered ? 7 : 4.8)
  const on = !!settings?.scenery && settings[SWITCH[place]] !== false
  const moods = mood ?? (settings?.sceneryTime ? moodsNow() : null)
  const scene = on ? choose(scenes, `${seed}:${settings?.sceneryShuffle ?? 0}`, moods, wide) : null
  // A picture decoded once this session shows at once after that: coming back
  // to a page put up its plain colour first while the same file decoded again.
  const [shown, setShown] = useState<Scene | null>(() => (scene && decoded.has(scene.url) ? scene : null))
  // Whether the picture on show came in with a fade: only a change of scene
  // on a page already up, or one that missed the wait below. A window just
  // opened (a book switch starts a new one, its cache empty) drew the plain
  // colour, then the blurred copy, then the picture over it: a flash.
  const [fades, setFades] = useState(false)
  // Waited for past the budget: only then the stand-in (the blurred copy) and the fade.
  const [late, setLate] = useState(false)
  if (scene) void warm(scene.url)
  // The page it is on holds its first paint for the picture, a moment at most,
  // so the first frame is already the painting. One that comes into a page already up fades in.
  useReading(!!scene && !shown && !late)
  const seen = useSeen()
  useEffect(() => {
    if (!scene || scene.url === shown?.url) return
    if (decoded.has(scene.url)) return void (setFades(!!settings?.motion && !!shown), setShown(scene))
    // Decoded off the page's thread before it is shown, so the fade never stutters.
    let gone = false
    let waited = false
    const budget = setTimeout(() => ((waited = true), setLate(true)), WAIT)
    void warm(scene.url).then((ok) => {
      clearTimeout(budget)
      if (gone) return
      setFades(!!settings?.motion && (waited || !!shown || seen))
      setShown(ok ? scene : null)
      setLate(!ok)
    })
    return () => void ((gone = true), clearTimeout(budget))
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
    // Nothing stands in for the picture: no blurred small copy, no tinted colour (both read as the picture broken, a
    // flash, for a file on this Mac). Until it is decoded the box is the page itself; then the painting fades in.
    <div aria-hidden data-scene={place} data-shown={shown ? '' : undefined} data-fades={fades ? '' : undefined} className={`pointer-events-none overflow-hidden ${rounded} ${className}`} style={{ maskImage: melt }}>
      {/* The painting breathes: a slow pan and zoom, and now and then a wash of
          light (or a cloud's shadow) across it. Transform only, on the
          compositor; still while away, while you type, and under reduced motion (main.css). */}
      <div data-drift className="mf-drift absolute inset-0">
      <AnimatePresence initial={false}>
        {shown && (
          <motion.img
            key={shown.url}
            src={shown.url}
            alt=""
            decoding="async"
            draggable={false}
            initial={fades ? { opacity: 0 } : false}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: settings?.motion ? 0.9 : 0, ease: 'easeOut' }}
            className={`absolute inset-0 size-full object-cover ${rounded}`}
            // Most of these are landscapes with the sky above and the subject
            // a little over the middle; a tall portrait's face sits higher.
            style={{
              objectPosition: shown.height > shown.width ? 'center 30%' : 'center 42%',
              imageRendering: shown.pixel ? 'pixelated' : undefined,
              // Blurred, and pulled toward the page: darker under a dark theme,
              // lighter under a light one. Scaled a touch so the blur's soft
              // edge stays outside the frame instead of greying its border.
              ...(covered ? { filter: `blur(14px) brightness(${lightPage ? 1.15 : 0.7}) saturate(0.85)`, transform: 'scale(1.06)' } : {})
            }}
          />
        )}
      </AnimatePresence>
      </div>
      {/* Film grain over the painting, under the veil and every word. */}
      {shown && settings?.sceneryGrain !== false && <FilmGrain />}
      {shown && <div data-wash={cloudy ? 'cloud' : 'light'} className="mf-wash absolute inset-0" />}
      {/* The veil for the words, with the painting only: alone on the empty box it was a dark gradient, the flash. */}
      {shown && <div className="absolute inset-0" style={{ background: over }} />}
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
  // Said before the first paint, so a rest drawn plain for a frame never then grows its scene above the words.
  useLayoutEffect(() => {
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
  // Before it has been counted: first if no other rest is on show.
  return resting.includes(me) ? resting[0] === me : wanted && (!resting.length || ahead)
}

/**
 * A rest moment: the empty state it wraps, with a wide scene above it melting
 * down into the page, the sentence over the quiet end of it. With Scenery
 * off, or no pictures yet, just the empty state.
 */
export function Rest({ seed, children, compact = false, strip = false, off = false, className }: {
  seed: string
  children: ReactNode
  /** Laid out as a column with these classes (an example that fills its page), the scene over its top. */
  className?: string
  /** In the prompt's narrow panel. */
  compact?: boolean
  /** A one-line rest, like "Nothing rotting": a low band rather than a scene. */
  strip?: boolean
  /** Not a rest moment this time (the same empty state, another list). */
  off?: boolean
}): React.JSX.Element {
  const { settings, scenes, loading, scanning } = useScenery()
  // Its page waits for the settings and the pictures (lib/reads-in.tsx): drawn before, the words sat plain, then moved down under the scene.
  useReading(!off && (!settings || loading))
  const first = useFirst(!off && !!settings?.scenery && !!settings.sceneryRest, !strip)
  if (off || !first || !settings?.scenery || !settings.sceneryRest || (!scenes.length && !loading && !scanning)) return <>{children}</>
  const [height, room] = strip ? ['h-24', 'pt-14'] : compact ? ['h-60', 'pt-20'] : ['h-[min(34rem,72vh)]', 'pt-[min(9rem,16vh)]']
  // The pictures still on their way: their room kept, so the words never jump down when the scene fades in.
  const outer = `relative isolate ${compact || strip ? 'mx-1 mt-1' : 'mx-5 mt-8'}${className ? ` flex min-w-0 flex-col ${className}` : ''}`
  const inner = `relative ${room}${className ? ' flex min-h-0 min-w-0 flex-1 flex-col' : ''}`
  if (!scenes.length) return <div className={outer}><div className={inner}>{children}</div></div>
  return (
    <div className={outer}>
      <Scenery place="rest" seed={`rest:${seed}:${dayOf()}`} text="below" fade rounded="rounded-xl" className={`absolute inset-x-0 top-0 ${height}`} />
      <div className={inner}>{children}</div>
    </div>
  )
}

/** Words fit to print: not a camera's counter, a hash or a random upload name. */
const readable = (raw?: string): string | null => {
  const words = raw?.replace(/_+/g, ' ').replace(/\S+\.(com|net|org|io|co)\b|\(\d+\)|\bwallpapers?\b/gi, ' ').trim().replace(/^[\d\s._-]+(?=\D)/, '').replace(/(?<=\w)-(?=\w)/g, ' ').replace(/\s+/g, ' ').trim()
  if (!words || /^(img|dsc|dscn|pxl|photo|image|screenshot|screen shot)\b/i.test(words)) return null
  return words.split(' ').some((word) => /^[A-Z]?[a-z]{2,}[,.]?$/.test(word)) ? words : null
}
/** The sandbox's own landscapes, named as a museum would: the painting, then the painter. */
const PAINTINGS: Record<string, string> = {
  'lake-tahoe': 'Lake Tahoe in Winter, Albert Bierstadt',
  'landers-peak': "Lander's Peak, Albert Bierstadt",
  'mont-blanc': 'Mont Blanc, Albert Bierstadt',
  wanderer: 'Wanderer above the Sea of Fog, Caspar David Friedrich',
  bernina: 'Bernina, Switzerland, Albert Bierstadt',
  'evening-prairie': 'Evening on the Prairie, Albert Bierstadt',
  jungfrau: 'The Jungfrau, Albert Bierstadt',
  'harbor-entrance': 'Entrance to the Harbor, Eugène Boudin',
  'grand-manan': 'Morning at Grand Manan, Alfred Thompson Bricher',
  'lake-lucerne': 'Lake Lucerne, Albert Bierstadt',
  'penobscot-bay': 'Lumber Schooners at Evening on Penobscot Bay, Fitz Henry Lane',
  'sierra-nevada': 'Among the Sierra Nevada, California, Albert Bierstadt',
  'the-oxbow': 'The Oxbow, Thomas Cole',
  'twilight-wilderness': 'Twilight in the Wilderness, Frederic Edwin Church',
  'fighting-temeraire': 'The Fighting Temeraire, J. M. W. Turner',
  'pine-forest': 'Morning in a Pine Forest, Ivan Shishkin',
  'ninth-wave': 'The Ninth Wave, Ivan Aivazovsky',
  'hay-wain': 'The Hay Wain, John Constable',
  'yellowstone': 'The Grand Canyon of the Yellowstone, Thomas Moran',
  'heart-of-the-andes': 'The Heart of the Andes, Frederic Edwin Church',
  'storm-rocky-mountains': "A Storm in the Rocky Mountains, Mt. Rosalie, Albert Bierstadt",
  'yosemite-valley': "Looking Down Yosemite Valley, California, Albert Bierstadt",
  'cotopaxi': "Cotopaxi, Frederic Edwin Church",
  'the-icebergs': "The Icebergs, Frederic Edwin Church",
  'savage-state': "The Course of Empire: The Savage State, Thomas Cole",
  'schroon-mountain': "View of Schroon Mountain, Essex County, New York, After a Storm, Thomas Cole",
  'green-river-cliffs': "Green River Cliffs, Wyoming, Thomas Moran",
  'moonrise-over-the-sea': "Moonrise over the Sea, Caspar David Friedrich",
  'riesengebirge': "Morning in the Riesengebirge, Caspar David Friedrich",
  'rain-steam-speed': "Rain, Steam and Speed, J. M. W. Turner",
  'dido-building-carthage': "Dido building Carthage, J. M. W. Turner",
  'salisbury-cathedral': "Salisbury Cathedral from the Meadows (sketch), John Constable",
  'wivenhoe-park': "Wivenhoe Park, Essex, John Constable",
  'rye': "Rye, Ivan Shishkin",
  'dnieper-moonlight': "Moonlit Night on the Dnieper, Arkhip Kuindzhi",
  'lake-george': "Lake George, John Frederick Kensett",
  'approaching-thunder-storm': "Approaching Thunder Storm, Martin Johnson Heade",
}
/** A credit for the day's picture, the way a caption names a painting: its name, then where it hangs. */
const credit = (name?: string, folder?: string): string | null =>
  ((folder === 'Sandbox scenery' || folder === 'Scenery') && name && PAINTINGS[name]) || [readable(name), readable(folder)].filter(Boolean).join(', ') || null

/** The credit for a scene, or nothing when its name says nothing fit to print. */
export const sceneCredit = (scene?: Scene | null): string | null => (scene ? credit(scene.name, scene.folder) : null)

/** A picture's credit as a caption reads under a print: on the page in full, never in a system tooltip. */
/** Beside a banner's credit: another picture, at once, with Undo. Every banner moves on together, as Settings' "Show another" does. */
export function AnotherPicture(): React.JSX.Element | null {
  const { settings } = useScenery()
  if (!settings?.scenery) return null
  const another = (): void => {
    const was = settings.sceneryShuffle ?? 0
    void haligtree.setSettings({ sceneryShuffle: was + 1 })
    chime('scene')
    toast('Another picture', () => void haligtree.setSettings({ sceneryShuffle: was }))
  }
  return (
    <Tip label="Another picture">
      <button type="button" data-another-picture onClick={another}
        className="inline-flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring">
        <Shuffle className="size-3.5" />
      </button>
    </Tip>
  )
}

export function PictureCredit({ children, className = '' }: { children: ReactNode; className?: string }): React.JSX.Element {
  return <span data-picture-credit className={`min-w-0 text-meta leading-snug text-pretty text-muted-foreground italic ${className}`}>{children}</span>
}

/**
 * Today's page's banner: a painted strip of the day's scene, one a day and
 * the same all that day.
 */
export function DayBanner({ day, seed = `day:${day}` }: { day: string; /** A week's or a month's own, so it is not the same picture as its first day's. */ seed?: string }): React.JSX.Element | null {
  const { settings, scenes, loading } = useScenery()
  // Its page waits for it: a banner arriving a beat late pushed the whole page down.
  useReading(!settings || (!!settings.scenery && !!settings.sceneryToday && loading))
  if (!settings?.scenery || !settings.sceneryToday || !scenes.length) return null
  // Named as the day's own picture is: the same scene the banner below picks.
  const named = sceneCredit(choose(scenes, `${seed}:${settings.sceneryShuffle ?? 0}`, ['day', 'dusk', 'night', 'interior'], true))
  // The same band as every empty page's: its corners and its fade into the page, never a framed print (Postcards is for memories).
  return (
    <figure className="mb-5">
    {/* In a short window it gives way (a quarter of the height at most), so the page's own words are in the first screen. */}
    <div className="relative aspect-[4/1] max-h-[24vh] min-h-16 w-full [@media(min-height:640px)]:min-h-28">
      {/* Not the hour's mood: a day keeps one picture from morning to night. */}
      <Scenery place="today" seed={seed} mood={['day', 'dusk', 'night', 'interior']} fade className="absolute inset-0" rounded="rounded-xl" soft />
    </div>
    {named && <figcaption className="mt-1.5 flex items-center justify-end gap-1"><PictureCredit className="text-right">{named}</PictureCredit><AnotherPicture /></figcaption>}
    </figure>
  )
}

/** The day's scene itself, the same one its banner shows: for words that name it. */
/** The painting each day showed first, this session (see useDayScene). */
const dayPicks = new Map<string, string>()

export function useDayScene(day: string): Scene | null | undefined | 'coming' {
  const { settings, scenes, loading, scanning } = useScenery()
  const seen = useSeen()
  const on = !!settings?.scenery && !!settings.sceneryToday
  const seed = `day:${day}:${settings?.sceneryShuffle ?? 0}`
  // The day keeps the painting it first showed: the folders are read in while they are still being looked through,
  // and a pick made again from the longer list swapped the picture under the words a moment after the app opened.
  const kept = dayPicks.get(seed)
  const picked = settings && on && !loading && !scanning ? (scenes.find((one) => one.url === kept) ?? choose(scenes, seed, ['day', 'dusk', 'night', 'interior'], true)) : null
  if (picked) dayPicks.set(seed, picked.url)
  const scene = picked
  // Nor is a picture not yet decoded, for a moment: its page holds its first paint for it, so a window
  // just opened (a book switch) draws the painting in its first frame, not its stand-in.
  const [, redraw] = useState(0)
  const [late, setLate] = useState<string | null>(null)
  const url = scene?.url
  useEffect(() => {
    if (!url || decoded.has(url)) return
    let gone = false
    const budget = setTimeout(() => !gone && setLate(url), WAIT)
    void warm(url).then(() => !gone && redraw((n) => n + 1))
    return () => void ((gone = true), clearTimeout(budget))
  }, [url])
  // Not known yet (undefined) is not none (null): the page waits, so the words are not drawn plain and then moved under the picture.
  if (!settings || (on && loading)) return undefined
  if (!on) return null
  // Still looking through the folders with nothing found yet: a painting is coming, never waited for (a whole folder
  // the first time), its room kept. Found after the page is up, it comes in as soon as it is decoded.
  if (scanning) return 'coming'
  if (url && !decoded.has(url) && late !== url && !seen) return undefined
  return scene
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
