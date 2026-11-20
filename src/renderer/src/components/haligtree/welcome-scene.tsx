import { useLayoutEffect, useRef } from 'react'
import markGold from '@/assets/mark-gold-leaves.png'
import { fogIn } from './welcome-fog'
import { NOISE } from './grain'
import { sceneCover, type ScenePlace } from './scene-cover'

export type { ScenePlace }

/**
 * The welcome's arrival, after Dia's onboarding (the user's reference film, 14 Nov): the desktop softens and a fog rolls
 * in over the whole screen, grey and folded, until the light comes and it is a pale lit haze; a trunk passes close; the
 * book is signed in its owner's hand; the fog turns to storm as the mark rises out of it with the name, the scene's top
 * edge coming down first; and the whole scene, words and all, draws in to a window in the middle of the screen, the
 * fog moving on inside it. The welcome then plays in that window (welcome.tsx), and it grows to the app's own size
 * only when the welcome ends.
 *
 * Two windows draw it (main: makeScene, the welcome's own window): the scene window over the whole screen until the
 * scene has become the window (`desk`), and the welcome's window from then on (`window`), each from the same clock,
 * the same stage at the screen's size and the same fog, so the frame where one gives way to the other is the same frame.
 */

/** The arrival's moments, in ms from its start, at the welcome music's 72 beats a minute (lib/sound.ts ambience). */
export const SCENE = {
  /** The desktop darkens a little under a veil, as the fog starts to rise over it (never blurred: Dia's stays sharp). */
  softenFrom: 400,
  softenTo: 1800,
  /** The fog rolls in, the thick of it first and from the foot up. */
  coverFrom: 900,
  coverTo: 3300,
  /** Whole: the welcome's window is put in its place under it, unseen (main: placeForWelcome). */
  covered: 3500,
  /** The light comes. */
  lightFrom: 3300,
  lightTo: 5000,
  /** "A commonplace book kept by …", written on in its owner's hand; it steps up to the top as the mark rises below it. */
  handFrom: 5600,
  handTo: 7600,
  /** The veil goes, unseen under the fog: the desktop is as it was round the window. */
  veilOff: 8400,
  /** The scene's top edge comes down, the first sign of the window it will be. */
  leadFrom: 9400,
  leadTo: 11200,
  /** The mark rises out of the fog as it turns to storm, the name a beat behind it. */
  markFrom: 9600,
  markTo: 11200,
  stormFrom: 9700,
  stormTo: 11400,
  nameFrom: 10400,
  nameTo: 11400,
  /** The whole scene draws in to the window. */
  shrinkFrom: 11300,
  shrinkTo: 12800,
  /** The welcome's window takes over from the scene window: the same frame. */
  handover: 12800,
  /** In the window: the title goes back into the fog, and the page comes in over it from the left. */
  titleOutFrom: 15200,
  titleOutTo: 16200,
  sweepFrom: 16000,
  sweepTo: 17000,
  /** As the page comes, the storm clears to the pale haze it rolled in as, and moves on beside the page (Dia's right side). */
  calmFrom: 16000,
  calmTo: 18200,
  /** The first words, on the beat (21 beats at 72 a minute). */
  words: 17500
} as const

/** The window's corners on screen, as the Mac draws a window's. */
export const CORNER = 12

/** Where the GPU is not to be had: the haze and its gold dawn as still grounds, never a flat sheet. */
const PALE = 'radial-gradient(130% 95% at 32% 18%, #fbf6ee 0%, #efe7da 45%, #e2d6c4 100%)'
const DAWN = 'radial-gradient(70% 60% at 50% 60%, #f6dfae 0%, #f1e6d3 55%, #e7dccb 100%)'

const clamp = (x: number): number => Math.max(0, Math.min(1, x))
const span = (t: number, from: number, to: number): number => clamp((t * 1000 - from) / (to - from))
const ease = (x: number): number => x * x * (3 - 2 * x)
const out = (x: number): number => 1 - (1 - x) ** 3
/** The draw-in: quick to start and a long settle, as a window comes to rest. */
const settle = (x: number): number => 1 - (1 - x) ** 4
const written = (x: number): number => (x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2)

/**
 * The scene at `t0` (Date.now() of its start), at `place`: drawn over the whole screen (`desk`, the scene window) or as
 * the window it has become (`window`, the welcome's own). `onHandover` once a desk frame at or past the handover is
 * drawn. Everything moves by the clock, set straight on the elements each frame, never by a render.
 */
export function WelcomeScene({ t0, place, mode, name, onHandover }: { t0: number; place: ScenePlace; mode: 'desk' | 'window'; name: string; onHandover?: () => void }): React.JSX.Element {
  const stage = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const veil = useRef<HTMLDivElement>(null)
  const hand = useRef<HTMLParagraphElement>(null)
  const mark = useRef<HTMLImageElement>(null)
  const title = useRef<HTMLHeadingElement>(null)
  const words = useRef<HTMLDivElement>(null)
  const handed = useRef(onHandover)
  handed.current = onHandover
  const { width: W, height: H } = place.screen
  const box = place.window
  const { scale: s1, cutX, cutY } = sceneCover(place)

  useLayoutEffect(() => {
    // Kept for the cleanup: React may drop the ref before it runs.
    const surface = canvas.current
    const fog = surface ? fogIn(surface) : null
    // No GPU to be had: the stage's own ground stands in, shaped as the fog is (lit from above, darker to the corners).
    if (!fog && stage.current) stage.current.style.background = PALE
    let frame = 0
    let said = false
    // A film made off screen (qa/welcome-scene-film.mjs) draws chosen moments itself: the clock it sets, never a handover.
    const qa = window as { qaSceneNow?: number; qaScenePaint?: () => void }
    const paint = (): void => {
      const t = ((qa.qaSceneNow ?? Date.now()) - t0) / 1000
      const storm = ease(span(t, SCENE.stormFrom, SCENE.stormTo)) * (1 - ease(span(t, SCENE.calmFrom, SCENE.calmTo)))
      // No trunk passes now (`trunk` far off): a dark blur crossing the haze read as a smudge on the screen.
      if (fog) fog.draw({ time: t, cover: ease(span(t, SCENE.coverFrom, SCENE.coverTo)), light: ease(span(t, SCENE.lightFrom, SCENE.lightTo)), storm, trunk: -9 })
      else if (stage.current) stage.current.style.background = storm > 0.5 ? DAWN : PALE
      // The words: the hand writes alone in the pale fog, then steps down under the name as the mark rises with it.
      const handIn = span(t, SCENE.handFrom, SCENE.handTo)
      const rise = out(span(t, SCENE.markFrom, SCENE.markTo))
      const named = out(span(t, SCENE.nameFrom, SCENE.nameTo))
      const gone = ease(span(t, SCENE.titleOutFrom, SCENE.titleOutTo))
      if (hand.current) {
        hand.current.style.opacity = String(ease(Math.min(1, handIn * 3)))
        hand.current.style.clipPath = `inset(-60% ${(100 - written(handIn) * 115).toFixed(2)}% -60% -15%)`
        const up = ease(span(t, SCENE.leadFrom, SCENE.markFrom + 900))
        // It steps up over the mark as the mark rises, at its own size: nothing in the arrival grows and then shrinks.
        hand.current.style.transform = `translate(-50%, ${(-0.215 * H * up).toFixed(1)}px) rotate(-3deg)`
      }
      if (mark.current) {
        mark.current.style.opacity = String(rise)
        mark.current.style.transform = `translate(-50%, ${((1 - rise) * 0.62 * H).toFixed(1)}px)`
      }
      if (title.current) {
        title.current.style.opacity = String(named)
        title.current.style.transform = `translate(-50%, ${((1 - named) * 0.02 * H).toFixed(1)}px)`
      }
      if (words.current) {
        words.current.style.opacity = String(1 - gone)
        words.current.style.transform = `translateY(${(-0.012 * H * gone).toFixed(1)}px) scale(${(1 + 0.03 * gone).toFixed(4)})`
      }
      if (mode === 'desk' && stage.current) {
        const soft = ease(span(t, SCENE.softenFrom, SCENE.softenTo)) * (1 - ease(span(t, SCENE.veilOff - 600, SCENE.veilOff)))
        if (veil.current) veil.current.style.opacity = String(0.38 * soft)
        // The top edge first, then the whole scene draws in to the window: one scale (nothing stretched) about the
        // middle, moved onto the window's middle, and a clip in the stage's own space that becomes the window's frame.
        const k = settle(span(t, SCENE.shrinkFrom, SCENE.shrinkTo))
        const lead = ease(span(t, SCENE.leadFrom, SCENE.leadTo)) * 0.09 * H
        const scale = 1 + (s1 - 1) * k
        // The top edge has come down by `lead` before the draw-in; from there it goes on down to the window's own top
        // (never back up), while the other edges come in to the window's from where they stood.
        const top = lead + (cutY - lead) * k
        const foot = cutY * k
        const side = cutX * k
        const dx = box.x + box.width / 2 - W / 2
        const dy = box.y + box.height / 2 - H / 2
        stage.current.style.transform = `translate(${(dx * k).toFixed(2)}px, ${(dy * k).toFixed(2)}px) scale(${scale.toFixed(5)})`
        stage.current.style.clipPath = `inset(${top.toFixed(2)}px ${side.toFixed(2)}px ${foot.toFixed(2)}px ${side.toFixed(2)}px round ${((CORNER * k) / scale).toFixed(2)}px)`
        if (!said && qa.qaSceneNow === undefined && t * 1000 >= SCENE.handover) {
          said = true
          handed.current?.()
        }
      }
    }
    const tick = (): void => {
      paint()
      frame = requestAnimationFrame(tick)
    }
    tick()
    qa.qaScenePaint = paint
    // In the window: covering it at whatever size it is, as the scene window's last frame did at the window's own size.
    const room = mode === 'window' ? stage.current?.parentElement : null
    const cover = room && new ResizeObserver(() => {
      if (!stage.current) return
      const scale = Math.max(room.clientWidth / W, room.clientHeight / H)
      stage.current.style.transform = `scale(${scale.toFixed(5)})`
    })
    if (room && cover) cover.observe(room)
    return () => {
      cancelAnimationFrame(frame)
      cover?.disconnect()
      // React's development build (StrictMode, the user's `npm run dev`) undoes a first mount at once and mounts again on
      // the same canvas: losing its GPU context here left the second mount none, and the fog fell back to its plain ground
      // (15 Nov, the user's frames). It is let go only once the canvas has really left the page.
      setTimeout(() => void (surface?.isConnected || fog?.lose()), 0)
    }
  }, [t0, mode, W, H, box.x, box.y, box.width, box.height, s1])

  const say = name ? `A commonplace book kept by ${name}` : 'A commonplace book'
  // The stage is the screen's size in both windows: drawn as it is over the screen, or scaled into the window, in its
  // middle, covering it (its size as the scene was drawn in to, the scene window's last frame exactly; any other size,
  // a window moved or made larger, still covered).
  const placed: React.CSSProperties = mode === 'desk'
    ? { left: 0, top: 0 }
    : { left: `calc((100% - ${W}px) / 2)`, top: `calc((100% - ${H}px) / 2)`, transform: `scale(${s1})` }
  return (
    <div aria-hidden data-welcome-scene={mode} className="pointer-events-none absolute inset-0 overflow-hidden">
      {mode === 'desk' && <div ref={veil} className="absolute inset-0 bg-[#2a2723]" style={{ opacity: 0 }} />}
      <div ref={stage} data-scene-stage="" className="absolute origin-center overflow-hidden" style={{ width: W, height: H, ...placed }}>
        <canvas ref={canvas} className="absolute inset-0 size-full" />
        {/* Haligtree's grain over the fog, as on the welcome's paper (grain.tsx). */}
        <div className="absolute inset-0 opacity-[0.05] mix-blend-overlay" style={{ backgroundImage: NOISE, backgroundSize: '160px' }} />
        {/* The book's own brown ink on the light haze (Paper's), with a soft halo of the haze itself so it reads on any fold. */}
        <div ref={words} className="absolute inset-0 origin-center text-[#3b2a18]" style={{ textShadow: `0 0 ${W * 0.012}px rgba(255, 249, 238, 0.55)` }}>
          <img ref={mark} src={markGold} alt="" draggable={false} className="absolute left-1/2 block" style={{ top: 0.315 * H, width: 0.056 * W, opacity: 0, filter: `drop-shadow(0 ${W * 0.002}px ${W * 0.006}px rgba(90, 60, 20, 0.22))` }} />
          <h1 ref={title} className="absolute left-1/2 m-0 font-heading leading-none font-semibold tracking-[-0.02em] whitespace-nowrap" style={{ top: 0.44 * H, fontSize: 0.07 * W, opacity: 0 }}>Haligtree</h1>
          <p ref={hand} className="absolute left-1/2 m-0 leading-none whitespace-nowrap [font-family:'Haligtree_Signature',cursive]" style={{ top: 0.46 * H, fontSize: 0.03 * W, opacity: 0 }}>{say}</p>
        </div>
      </div>
    </div>
  )
}
