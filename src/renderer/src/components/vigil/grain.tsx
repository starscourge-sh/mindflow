import { useSyncExternalStore, type CSSProperties } from 'react'
import { vigil, type Scene } from '@/lib/vigil'

/**
 * Covers: soft, grainy pictures from one folder (Settings › Scenery ›
 * Covers), behind whatever has no picture of its own: a tag's page, a note
 * of only words, a tile on Home, the brief without Scenery. Each thing always
 * gets the same one, picked from its id, and tinted toward its own colour so
 * it still says what it is. The main process keeps small copies, the same
 * way it does for Scenery (src/main/scenery.ts); lists only ever load those.
 * With no folder, nothing here shows and the plain colour tiles stay.
 */

let covers: Scene[] = []
const told = new Set<() => void>()
let started = false

/** One look at the folder for every tile in the window, again after any change. */
function start(): void {
  if (started) return
  started = true
  const load = async (): Promise<void> => {
    const folder = (await vigil.settings()).coversFolder || ''
    const found = folder ? (await vigil.scenery([folder], 'covers')).scenes.filter((one) => one.small) : []
    // In name order, so the same thing keeps the same cover from one start to the next.
    found.sort((a, b) => (a.name ?? '').localeCompare(b.name ?? '') || a.id.localeCompare(b.id))
    if (found.map((one) => one.small).join() === covers.map((one) => one.small).join()) return
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

/** The cover for a thing, by its id; null with no Covers folder (or none ready yet). */
export function useCover(seed: string | null | undefined): Scene | null {
  const all = useSyncExternalStore(subscribe, () => covers)
  return seed && all.length ? all[hash(seed) % all.length] : null
}

/** Film grain over any size, drawn once by the browser: the pictures' own grain is lost in a small copy. */
const NOISE = `url("data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160"><filter id="n"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" stitchTiles="stitch"/><feColorMatrix values="0 0 0 0 .5  0 0 0 0 .5  0 0 0 0 .5  0 0 0 .9 0"/></filter><rect width="100%" height="100%" filter="url(#n)"/></svg>')}")`

/**
 * A cover filling the box it is put in (which must be positioned): the
 * picture, its tint laid over in soft light, a little grain, and a shade at
 * the foot so white words on it read. `large` takes the bigger copy, for a
 * hero; anything in a list stays on the small one.
 */
export function GrainFill({ cover, tint, large = false, shade = 'foot', className = '', style }: {
  cover: Scene
  /** Its kind's or tag's colour, any CSS colour. */
  tint?: string
  large?: boolean
  /** Where words sit on it: a shade at the foot, all over, or none. */
  shade?: 'foot' | 'all' | 'none'
  className?: string
  style?: CSSProperties
}): React.JSX.Element {
  return (
    <span aria-hidden className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`} style={{ background: cover.color, ...style }}>
      <img src={large ? cover.url : cover.small} alt="" decoding="async" draggable={false} className="absolute inset-0 size-full object-cover" />
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
