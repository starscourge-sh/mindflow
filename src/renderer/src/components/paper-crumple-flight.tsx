import { createRoot } from 'react-dom/client'
import PaperCrumple from './paper-crumple'
import { hasPath, keepPath, pathKey, type PaperPath } from './paper-path'
import type { Box, Landing } from '@/lib/fly-home'

/** The app's curve for what travels on screen (STANDARDS), as in lib/fly-home.ts. */
const IN_OUT = 'cubic-bezier(0.77, 0, 0.175, 1)'
/** Room round the sheet: PaperCrumple keeps 24px clear on each side before it shrinks the paper. */
const ROOM = 24

/** The user's settings for the paper (React Bits' own example), the same for every sheet. */
const PAPER = { detail: 64, folds: 6, sharpness: 0.6, depth: 0.65, seed: 7 }

/**
 * The paper shapes worked out ahead, as height over width: rows from very long
 * to short, then cards. A sheet takes the nearest, so its folds are ready.
 */
const SHAPES = [1 / 24, 1 / 18, 1 / 14, 1 / 11, 1 / 8, 1 / 6, 1 / 4, 1 / 3, 1 / 2, 3 / 4, 1, 4 / 3]
const nearest = (aspect: number): number => SHAPES.reduce((best, one) => (Math.abs(Math.log(one / aspect)) < Math.abs(Math.log(best / aspect)) ? one : best))

let warmed = false
/**
 * Once the app is idle: every shape's fold path worked out in a worker, one
 * after another, so a move to the Bin finds its paper waiting.
 */
export function warmPaper(): void {
  if (warmed) return
  warmed = true
  const worker = new Worker(new URL('./paper-path.worker.ts', import.meta.url), { type: 'module' })
  const asks = SHAPES.map((aspect) => ({ ...PAPER, width: 1000, height: 1000 * aspect, key: pathKey(1000, 1000 * aspect, PAPER.detail, PAPER.folds, PAPER.sharpness, PAPER.depth, PAPER.seed) }))
  const next = (): void => {
    const ask = asks.shift()
    if (ask) worker.postMessage(ask)
    else (worker.terminate(), warmGl())
  }
  worker.onmessage = (event: MessageEvent<{ key: string } & PaperPath>): void => (keepPath(event.data.key, { samples: event.data.samples, creased: event.data.creased }), next())
  worker.onerror = () => worker.terminate()
  next()
}
/**
 * One sheet drawn out of sight, once: the GPU keeps what it learned about
 * drawing paper (its shaders), so the first real one is drawn in a frame or two.
 */
function warmGl(): void {
  const pen = document.createElement('canvas')
  pen.width = pen.height = 2
  const host = document.createElement('div')
  Object.assign(host.style, { position: 'fixed', left: '-10000px', top: '0', width: '120px', height: '120px', pointerEvents: 'none' })
  document.body.append(host)
  const root = createRoot(host)
  const done = (): void => (root.unmount(), host.remove())
  root.render(
    <PaperCrumple src={pen.toDataURL()} alt="" width={64} height={64} sceneHeight={120} style={{ width: 120, height: 120 }} draggable={false} crumpled
      foldCount={PAPER.folds} foldSharpness={PAPER.sharpness} wrinkleDepth={PAPER.depth} seed={PAPER.seed} detail={PAPER.detail}
      onReady={() => requestAnimationFrame(() => requestAnimationFrame(done))} onError={done} />
  )
}

/** Whether the paper for a sheet this shape is ready (for the probe). */
export const paperReady = (): boolean => SHAPES.every((aspect) => hasPath(pathKey(1000, 1000 * aspect, PAPER.detail, PAPER.folds, PAPER.sharpness, PAPER.depth, PAPER.seed)))

/** A theme colour as the paper's back can take it: three.js reads rgb, not oklch. */
const colourOf = (token: string): string => {
  const pen = document.createElement('canvas').getContext('2d')
  if (!pen) return '#f4f0e8'
  pen.fillStyle = getComputedStyle(document.documentElement).getPropertyValue(token).trim() || '#f4f0e8'
  return pen.fillStyle
}

/** A sheet laid over a row: `go` crumples it and sends it to its place, `drop` takes it away untouched. */
export type Sheet = { go: (to: () => Landing | null) => void; drop: () => void }

/**
 * A row's picture laid over the row as paper, flat. Once it is drawn, `lay`
 * takes away the copy of the row that stood in for it till then; `go`
 * crumples it where it was and flies it to `to` (the sidebar's Bin), or with
 * nowhere to go, fades it where it was.
 */
export function sheetOver(box: Box, png: Uint8Array, lay: () => void, crumpleMs: number, flightMs: number): Sheet {
  const url = URL.createObjectURL(new Blob([new Uint8Array(png)], { type: 'image/png' }))
  // The nearest shape worked out ahead: as wide as the row, as tall as that shape makes it.
  const tall = box.width * nearest(box.height / box.width)
  // Room above and below too: a long row crumples into a ribbon that swings well past its own height before it balls.
  const scene = Math.max(tall + ROOM * 2, Math.min(box.width * 0.6, 520))
  const host = document.createElement('div')
  host.setAttribute('data-crumple', '')
  Object.assign(host.style, {
    position: 'fixed', left: `${box.left - ROOM}px`, top: `${box.top + box.height / 2 - scene / 2}px`, width: `${box.width + ROOM * 2}px`, height: `${scene}px`,
    zIndex: '60', pointerEvents: 'none'
  })
  document.body.append(host)
  const root = createRoot(host)
  let [drawn, asked, gone] = [false, null as null | (() => Landing | null), false]
  const done = (): void => {
    if (gone) return
    gone = true
    root.unmount()
    host.remove()
    URL.revokeObjectURL(url)
  }
  const fly = (to: Landing | null): void => {
    const [cx, cy] = [box.left + box.width / 2, box.top + box.height / 2]
    const flight = to
      ? (() => {
          const [dx, dy] = [to.end.left + to.end.width / 2 - cx, to.end.top + to.end.height / 2 - cy]
          // A slight arc: lifted on its way, as a ball of paper is tossed.
          return host.animate(
            [
              { transform: 'translate(0, 0) scale(1)', opacity: 1 },
              { transform: `translate(${dx * 0.5}px, ${dy * 0.5 - 24}px) scale(0.8)`, opacity: 1, offset: 0.5 },
              { transform: `translate(${dx}px, ${dy}px) scale(0.45)`, opacity: 0.5 }
            ],
            { duration: flightMs, easing: IN_OUT, fill: 'forwards' }
          )
        })()
      : host.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 200, easing: 'ease-out', fill: 'forwards' })
    void flight.finished.then(() => (done(), to?.nod()), done)
  }
  const crumple = (to: () => Landing | null): void => {
    paint(true)
    // It crumples where it was for a moment, then flies, still crumpling, to its place.
    void host.animate([{ opacity: 1 }, { opacity: 1 }], { duration: crumpleMs }).finished.then(() => fly(to()), done)
  }
  const paint = (crumpled: boolean): void =>
    root.render(
      <PaperCrumple
        src={url}
        alt=""
        width={box.width}
        height={tall}
        sceneHeight={scene}
        style={{ width: box.width + ROOM * 2, height: scene }}
        className="[&_*]:pointer-events-none"
        releaseBehavior="stay"
        crumpled={crumpled}
        crumpleAmount={0.85}
        crumpleDuration={0.55}
        releaseDuration={0.4}
        foldCount={PAPER.folds}
        foldSharpness={PAPER.sharpness}
        wrinkleDepth={PAPER.depth}
        seed={PAPER.seed}
        detail={PAPER.detail}
        creaseStrength={0.18}
        paperColor={colourOf('--popover')}
        paperTexture={0.08}
        draggable={false}
        returnToOrigin={false}
        onReady={() => {
          drawn = true
          // The copy of the row goes as its paper is drawn.
          lay()
          if (asked) crumple(asked)
        }}
        onError={() => (lay(), done())}
      />
    )
  paint(false)
  return {
    go: (to) => (drawn ? crumple(to) : void (asked = to)),
    drop: done
  }
}
