import { useState, useSyncExternalStore, type CSSProperties } from 'react'
import { vigil, type Scene } from '@/lib/vigil'

/**
 * Covers: soft, grainy pictures from one folder (Settings › Appearance ›
 * Covers, under Gradients), behind whatever has no picture of its own: a tag's page, a note
 * of only words, a tile on Home, the brief without Scenery. Each thing always
 * gets the same one, picked from its id, and tinted toward its own colour so
 * it still says what it is. The main process keeps small copies, the same
 * way it does for Scenery (src/main/scenery.ts); lists only ever load those.
 * With no folder, nothing here shows and the plain colour tiles stay.
 *
 * A note's own cover (a row's square, a tile, a card) is one of the paper
 * drawings bundled with the app (assets/drawings), the first choice in
 * Settings › Appearance › Covers, or with Gradients one of the bundled soft
 * gradients (assets/gradients), or your own folder's when you choose one.
 */

/** A cover, whether it is one of the bundled paper drawings, and whether that drawing is a busy one. */
export type Cover = Scene & { paper?: boolean; busy?: boolean }

/**
 * The drawings that are busy or dark (battles, crowds, a sheet of studies):
 * worn faded further toward the paper, so they read as quiet as the rest.
 * See assets/drawings/SOURCES.txt.
 */
const BUSY = new Set(['38925', '41199', '41200', '43094', '44273', '44549', '49870', '50855', '52910', '65488', '83402'])
/** The bundled drawings, in name order so a note keeps the same one. */
export const DRAWINGS: Cover[] = Object.entries(import.meta.glob('../../assets/drawings/*.webp', { eager: true, import: 'default' }) as Record<string, string>)
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([path, url]) => {
    const name = path.split('/').pop()!
    return { id: `drawing:${name}`, url, small: url, mood: 'day', width: 0, height: 0, pixel: false, color: '#ece4d4', light: 0.85, paper: true, busy: BUSY.has(name.replace('.webp', '')) }
  })

/** Each bundled gradient's average colour and lightness, to paint while it loads and to shade words on it. */
const TONES: Record<string, [string, number]> = {
  'w-1': ['#592f12', 0.21], 'w-2': ['#4c3000', 0.2], 'w-3': ['#5f5736', 0.34], 'w-4': ['#3a3696', 0.24], 'w-5': ['#522667', 0.2],
  'w-6': ['#1e4769', 0.25], 'w-7': ['#014740', 0.22], 'w-8': ['#0f4a66', 0.25], 'w-9': ['#3d0742', 0.09]
}
/** The bundled soft gradients (assets/gradients): Gradients works with no folder of your own. */
export const GRADIENTS: Cover[] = Object.entries(import.meta.glob('../../assets/gradients/*.webp', { eager: true, import: 'default' }) as Record<string, string>)
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([path, url]) => {
    const name = path.split('/').pop()!.replace('.webp', '')
    const [color, light] = TONES[name] ?? ['#3a3030', 0.2]
    return { id: `gradient:${name}`, url, small: url, mood: 'day', width: 0, height: 0, pixel: false, color, light }
  })

/** The ink words and icons are drawn in on a paper cover. */
export const PAPER_INK = '#2a2219'
/** An icon's colour on paper: the kind's colour, deepened to ink. */
export const inkOf = (tint?: string): string => (tint ? `color-mix(in oklab, ${tint} 45%, ${PAPER_INK})` : PAPER_INK)
/** An icon on a paper cover: in ink, with a breath of paper round it so the drawing's lines never cross it. */
export const onPaper = (tint?: string): CSSProperties => ({ color: inkOf(tint), filter: 'drop-shadow(0 0 1.5px rgb(240 233 219 / 0.95)) drop-shadow(0 0 3px rgb(240 233 219 / 0.7))' })

let covers: Scene[] = []
/** Whether the Covers folder has been looked at once: until then, none is not known to be none. */
let coversRead = false
let style: 'paper' | 'gradients' = 'paper'
const told = new Set<() => void>()
let started = false

/** One look at the folder for every tile in the window, again after any change. */
function start(): void {
  if (started) return
  started = true
  const load = async (): Promise<void> => {
    const settings = await vigil.settings()
    const folder = settings.coversFolder || ''
    const was = style
    style = settings.coverStyle === 'gradients' ? 'gradients' : 'paper'
    if (style !== was) told.forEach((tell) => tell())
    // Asked even with no folder, so the main process stops copying a cleared one.
    const found = (await vigil.scenery(folder ? [folder] : [], 'covers')).scenes.filter((one) => one.small)
    // In name order, so the same thing keeps the same cover from one start to the next.
    found.sort((a, b) => (a.name ?? '').localeCompare(b.name ?? '') || a.id.localeCompare(b.id))
    const first = !coversRead
    coversRead = true
    if (found.map((one) => one.small).join() === covers.map((one) => one.small).join()) return void (first && told.forEach((tell) => tell()))
    covers = found
    told.forEach((tell) => tell())
  }
  void load()
  window.api.captures.onChange(() => void load())
}

const subscribe = (tell: () => void): (() => void) => {
  start()
  told.add(tell)
  return () => void told.delete(tell)
}

/** A number from words, the same every time. */
const hash = (text: string): number => {
  let n = 2166136261
  for (let i = 0; i < text.length; i++) n = Math.imul(n ^ text.charCodeAt(i), 16777619)
  return n >>> 0
}

/** One of the bundled paper drawings, the same one for the same words every time. */
export const drawingFor = (seed: string): Cover => DRAWINGS[hash(seed) % DRAWINGS.length]

/** Whether the Covers folder has been looked at yet: a page drawn from a cover waits for it (lib/reads-in.tsx). */
export function useCoversRead(): boolean {
  return useSyncExternalStore(subscribe, () => coversRead)
}

/** The cover for a thing, by its id; null with no Covers folder (or none ready yet). */
export function useCover(seed: string | null | undefined): Cover | null {
  const all = useSyncExternalStore(subscribe, () => covers)
  return seed && all.length ? all[hash(seed) % all.length] : null
}

/**
 * Which of a set of covers a note wears: first asked, it takes the one its id
 * hashes to unless one of the last few notes handed a cover (its neighbours
 * on the page, since a list asks in order) already wears that one, then the
 * next free one. Kept for the session, so a note never changes cover while
 * you look; two cards side by side never match.
 */
const handed = new Map<string, Map<string, number>>()
const lately = new Map<string, string[]>()
export function spreadPick(set: string, seed: string, count: number): number {
  const kept = handed.get(set) ?? handed.set(set, new Map()).get(set)!
  const recent = lately.get(set) ?? lately.set(set, []).get(set)!
  // How many neighbours to keep clear of: most of the set, never all of it.
  const clear = Math.min(count - 1, 10)
  let at = kept.get(seed)
  if (at === undefined) {
    const taken = new Set(recent.slice(-clear).map((one) => kept.get(one)))
    at = hash(seed) % count
    for (let step = 0; step < count && taken.has(at); step++) at = (at + 1) % count
    kept.set(seed, at)
  }
  if (recent.at(-1) !== seed) {
    const was = recent.indexOf(seed)
    if (was >= 0) recent.splice(was, 1)
    recent.push(seed)
    if (recent.length > 40) recent.shift()
  }
  return at
}

/**
 * A note's cover: a paper drawing, or with Covers set to Gradients a soft
 * gradient (your Covers folder's when one is chosen, else the bundled ones).
 * Neighbours on a page never wear the same one (see spreadPick).
 */
export function useNoteCover(seed: string | null | undefined): Cover | null {
  const folder = useSyncExternalStore(subscribe, () => covers)
  const paper = useSyncExternalStore(subscribe, () => style === 'paper')
  if (!seed) return null
  const set = paper ? DRAWINGS : folder.length ? folder : GRADIENTS
  return set.length ? set[spreadPick(paper ? 'paper' : folder.length ? 'folder' : 'gradients', seed, set.length)] : null
}

/** Film grain over any size, drawn once by the browser: the pictures' own grain is lost in a small copy. */
export const NOISE = `url("data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160"><filter id="n"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" stitchTiles="stitch"/><feColorMatrix values="0 0 0 0 .5  0 0 0 0 .5  0 0 0 0 .5  0 0 0 .9 0"/></filter><rect width="100%" height="100%" filter="url(#n)"/></svg>')}")`

/**
 * A cover filling the box it is put in (which must be positioned): the
 * picture, its tint laid over in soft light, a little grain, and a shade at
 * the foot so white words on it read. `large` takes the bigger copy, for a
 * hero; anything in a list stays on the small one.
 */
export function GrainFill({ cover, tint, large = false, shade = 'foot', className = '', style }: {
  cover: Cover
  /** Its kind's or tag's colour, any CSS colour. */
  tint?: string
  large?: boolean
  /** Where words sit on it: a shade at the foot, all over, or none. */
  shade?: 'foot' | 'all' | 'none'
  className?: string
  style?: CSSProperties
}): React.JSX.Element {
  // A copy that failed to load is tried again a little later, a few times: it may be being made again.
  const [tries, setTries] = useState(0)
  if (cover.paper) return <PaperFill cover={cover} tint={tint} shade={shade} className={className} style={style} />
  return (
    <span aria-hidden className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`} style={{ background: cover.color, ...style }}>
      <img key={tries} src={large ? cover.url : cover.small} alt="" decoding="async" draggable={false} className="absolute inset-0 size-full object-cover"
        onError={() => tries < 4 && setTimeout(() => setTries(tries + 1), 3000 * (tries + 1))} />
      {tint && (
        <>
          {/* Soft light keeps the picture's glow; a touch of plain colour says whose it is. */}
          <span className="absolute inset-0 mix-blend-soft-light" style={{ background: tint }} />
          <span className="absolute inset-0 mix-blend-color opacity-45" style={{ background: tint }} />
        </>
      )}
      <span className="absolute inset-0 opacity-[0.22] mix-blend-overlay" style={{ backgroundImage: NOISE, backgroundSize: '160px' }} />
      {shade !== 'none' && (
        // A bright one (a cream glow) a shade darker again, so white words keep 4.5 to 1 on any of them.
        <span className="absolute inset-0" style={{
          background: `linear-gradient(rgb(0 0 0 / ${Math.min(0.2, Math.max(0, (cover.light - 0.22) * 1.5)).toFixed(2)}) 0 0), ${shade === 'all' ? 'rgb(0 0 0 / 0.32)' : 'linear-gradient(to top, rgb(0 0 0 / 0.5), rgb(0 0 0 / 0.12) 60%, transparent)'}`
        }} />
      )}
    </span>
  )
}

/**
 * A paper drawing filling its box: cropped in a little so no mount edge
 * shows, muted toward the page, a breath of its kind's colour, and where
 * words sit on it a wash of paper so ink reads (see PAPER_INK). On a dark
 * page it dims like paper in a low room.
 */
function PaperFill({ cover, tint, shade, className, style }: {
  cover: Cover
  tint?: string
  shade: 'foot' | 'all' | 'none'
  className: string
  style?: CSSProperties
}): React.JSX.Element {
  return (
    <span aria-hidden data-paper-cover className={`mf-paper-cover pointer-events-none absolute inset-0 overflow-hidden ${className}`} style={{ background: cover.color, ...style }}>
      {/* A busy or dark drawing is faded further toward the paper, so it sits as quietly as the rest. */}
      <img src={cover.url} alt="" decoding="async" draggable={false} className={`absolute inset-0 size-full scale-[1.12] object-cover ${cover.busy ? 'opacity-55 [filter:saturate(0.4)_contrast(0.7)_brightness(1.18)]' : 'opacity-90 [filter:saturate(0.6)_contrast(0.9)_brightness(1.04)]'}`} />
      {tint && <span className="absolute inset-0 mix-blend-multiply" style={{ background: `color-mix(in oklab, ${tint} 16%, white)` }} />}
      {shade !== 'none' && (
        <span className="absolute inset-0" style={{
          background: shade === 'all' ? 'rgb(240 233 219 / 0.5)' : 'linear-gradient(to top, rgb(240 233 219 / 0.85), rgb(240 233 219 / 0.35) 55%, transparent)'
        }} />
      )}
    </span>
  )
}
