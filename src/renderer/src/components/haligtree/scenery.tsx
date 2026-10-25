import { useEffect, useLayoutEffect, useState, type ReactNode } from 'react'
import { useReading } from '@/lib/reads-in'
import { contrast } from '@/lib/on-accent'
import { AnimatePresence, motion } from 'motion/react'
import { useLive, haligtree, type Mood, type Scene, type Settings } from '@/lib/haligtree'
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
  const tiers = [shaped.filter((one) => !moods || moods.includes(one.mood)), shaped, scenes]
  const pool = tiers.find((one) => one.length) ?? []
  const key = `${seed}:${moods?.join() ?? ''}:${wide}`
  // Kept once shown: the list grows and reorders as the folders are read again,
  // and a page whose picture changed under you a moment after it opened looked
  // like a carousel. It stays until the seed changes (a new day, a reshuffle).
  const kept = scenes.find((one) => one.url === (picked.get(key) ?? restTaken()[key]))
  if (kept) return (picked.set(key, kept.url), kept)
  // A rest moment's picture is one no other place has today, while there are
  // enough to go round: by chance, two empty pages showed the same one.
  const taken = seed.startsWith('rest:') ? new Set(Object.values(restTaken())) : new Set<string>()
  // The hour's mood first; once its pictures are all in use, one of another mood before a repeat.
  const free = tiers.map((tier) => tier.filter((one) => !taken.has(one.url))).find((one) => one.length) ?? []
  // Each picture scored on its own against the seed, so where it sits in the
  // list does not matter, and a picture added later only wins its share.
  const best = (free.length ? free : pool).reduce<Scene | null>((top, one) => (!top || hash(`${seed}:${one.id}`) > hash(`${seed}:${top.id}`) ? one : top), null)
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
/** Pictures already decoded in this window: shown without waiting again. */
const decoded = new Set<string>()
/** Each picture's decode, started once, as soon as a place picks it. */
const warming = new Map<string, Promise<boolean>>()
function warm(url: string): Promise<boolean> {
  let done = warming.get(url)
  if (!done) {
    const image = new Image()
    image.src = url
    done = image.decode().then(() => (decoded.add(url), true), () => (warming.delete(url), false))
    warming.set(url, done)
  }
  return done
}
/** How long a page holds its first paint for its picture: past it, the blurred copy, then the fade. */
const WAIT = 150
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
 * Worked out again when the theme changes.
 */
function useReadable(target = 4.8): number {
  const work = (): number => {
    const style = getComputedStyle(document.documentElement)
    const page = rgb(style.getPropertyValue('--background'))
    const inks = [rgb(style.getPropertyValue('--foreground')), rgb(style.getPropertyValue('--muted-foreground'))]
    for (let dim = 0.5; dim < 1; dim += 0.01) {
      const worst = [0, 255].map((v) => page.map((c) => dim * c + (1 - dim) * v))
      if (worst.every((under) => inks.every((ink) => contrast(ink, under) >= target))) return Math.round(dim * 100) / 100
    }
    return 1
  }
  const [floor, setFloor] = useState(work)
  useEffect(() => setFloor(work()), [target]) // eslint-disable-line react-hooks/exhaustive-deps
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
  // Where words sit over the picture itself (focus, reading), a busy painting
  // still fights them at an average contrast that passes: aim higher there,
  // and soften the picture so no sharp bright edge sits behind a letter.
  const covered = text === 'all' || text === 'middle' || text === 'left'
  const floor = useReadable(covered ? 7 : 4.8)
  const lightPage = (() => {
    const [r, g, b] = rgb(getComputedStyle(document.documentElement).getPropertyValue('--background'))
    return (r * 299 + g * 587 + b * 114) / 1000 > 140
  })()
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
  // so the first frame is already the painting.
  useReading(!!scene && !shown && !late)
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
      setFades(!!settings?.motion && (waited || !!shown))
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
    <div aria-hidden data-scene={place} className={`pointer-events-none overflow-hidden ${rounded} ${className}`} style={{ maskImage: melt, background: shown || !late ? undefined : `color-mix(in srgb, ${scene.color} 30%, transparent)` }}>
      {/* While the full picture decodes: its small copy, softened, so the page
          starts on the picture rather than on a flat colour. */}
      {!shown && late && scene.small && <img src={scene.small} alt="" className="absolute inset-0 size-full scale-110 object-cover blur-xl" />}
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
  'heart-of-the-andes': 'The Heart of the Andes, Frederic Edwin Church'
}
/** A credit for the day's picture, the way a caption names a painting: its name, then where it hangs. */
const credit = (name?: string, folder?: string): string | null =>
  ((folder === 'Sandbox scenery' || folder === 'Scenery') && name && PAINTINGS[name]) || [readable(name), readable(folder)].filter(Boolean).join(', ') || null

/** The credit for a scene, or nothing when its name says nothing fit to print. */
export const sceneCredit = (scene?: Scene | null): string | null => (scene ? credit(scene.name, scene.folder) : null)

/** A picture's credit as a caption reads under a print: on the page in full, never in a system tooltip. */
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
    <div className="relative aspect-[4/1] min-h-28 w-full">
      {/* Not the hour's mood: a day keeps one picture from morning to night. */}
      <Scenery place="today" seed={seed} mood={['day', 'dusk', 'night', 'interior']} fade className="absolute inset-0" rounded="rounded-xl" soft />
    </div>
    {named && <figcaption className="mt-1.5 flex justify-end"><PictureCredit className="text-right">{named}</PictureCredit></figcaption>}
    </figure>
  )
}

/** The day's scene itself, the same one its banner shows: for words that name it. */
export function useDayScene(day: string): Scene | null | undefined {
  const { settings, scenes, loading, scanning } = useScenery()
  const on = !!settings?.scenery && !!settings.sceneryToday
  const scene = settings && on && !loading && !scanning ? choose(scenes, `day:${day}:${settings.sceneryShuffle ?? 0}`, ['day', 'dusk', 'night', 'interior'], true) : null
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
  // Still looking through the folders with nothing found yet is not known either.
  if (!settings || (on && (loading || scanning))) return undefined
  if (!on) return null
  if (url && !decoded.has(url) && late !== url) return undefined
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
