import { stageBusy, stageSheet, warmShape, warmStage, PAPER } from './paper-crumple'
import { keepPath, pathKey, type PaperPath } from './paper-path'
import type { Box, Landing } from '@/lib/fly-home'

/** The app's curve for what travels on screen (STANDARDS), as in lib/fly-home.ts. */
const IN_OUT = 'cubic-bezier(0.77, 0, 0.175, 1)'
/**
 * The paper shapes worked out ahead, as height over width: rows from very long
 * to short, then cards. A sheet takes the nearest, so its folds are ready.
 */
const SHAPES = [1 / 24, 1 / 18, 1 / 14, 1 / 11, 1 / 8, 1 / 6, 1 / 4, 1 / 3, 1 / 2, 3 / 4, 1, 4 / 3]
const nearest = (aspect: number): number => SHAPES.reduce((best, one) => (Math.abs(Math.log(one / aspect)) < Math.abs(Math.log(best / aspect)) ? one : best))
const keyOf = (aspect: number): string => pathKey(1000, 1000 * aspect, PAPER.detail, PAPER.foldCount, PAPER.foldSharpness, PAPER.wrinkleDepth, PAPER.seed)

let warmed = false
/**
 * Once the app is idle: every shape's fold path worked out in a worker, one
 * after another, each shape's mesh built as it comes in, and last the one
 * stage made with its shaders compiled. A move to the Bin then draws at once.
 */
export function warmPaper(): void {
  if (warmed) return
  warmed = true
  const worker = new Worker(new URL('./paper-path.worker.ts', import.meta.url), { type: 'module' })
  const asks = SHAPES.map((aspect) => ({ width: 1000, height: 1000 * aspect, detail: PAPER.detail, folds: PAPER.foldCount, sharpness: PAPER.foldSharpness, depth: PAPER.wrinkleDepth, seed: PAPER.seed, key: keyOf(aspect) }))
  const next = (): void => {
    const ask = asks.shift()
    if (ask) return void worker.postMessage(ask)
    worker.terminate()
    // Each step its own idle moment, so none is a long task.
    requestIdleCallback(() => warmStage())
  }
  worker.onmessage = (event: MessageEvent<{ key: string } & PaperPath>): void => {
    keepPath(event.data.key, { samples: event.data.samples, creased: event.data.creased })
    const aspect = SHAPES[SHAPES.length - asks.length - 1]
    requestIdleCallback(() => (warmShape(1000, 1000 * aspect), next()))
  }
  worker.onerror = () => worker.terminate()
  next()
}

/**
 * The paper's back: a shade lighter than the page (the foreground mixed in), so
 * in a dark theme a ball of it reads as paper, not a hole. As rgb: three.js reads no oklch.
 */
const paperBack = (): string => {
  const probe = document.createElement('span')
  probe.style.color = 'color-mix(in srgb, var(--foreground) 14%, var(--popover))'
  document.body.append(probe)
  const seen = getComputedStyle(probe).color
  probe.remove()
  const pen = document.createElement('canvas').getContext('2d')
  if (!pen) return '#f4f0e8'
  pen.fillStyle = seen || '#f4f0e8'
  return pen.fillStyle
}

/** A sheet laid over a row: `go` crumples it and sends it to its place, `drop` takes it away untouched. */
export type Sheet = { go: (to: () => Landing | null, after?: () => void) => void; drop: () => void }

/**
 * A row's picture laid over the row as paper, flat, on the one stage. Once
 * its first frame is on screen, `lay` takes away the copy of the row that
 * stood in for it; `go` crumples it where it was and flies it to `to` (the
 * sidebar's Bin), or with nowhere to go, fades it where it was. With the
 * stage taken (several rows at once), the copy simply fades.
 */
export async function sheetOver(box: Box, png: Uint8Array, lay: (fade?: boolean) => void, crumpleMs: number, flightMs: number): Promise<Sheet> {
  if (stageBusy()) return { go: (_to, after) => (lay(true), after?.()), drop: () => lay() }
  // Decoded off the page's thread, upside down as WebGL reads it.
  const image = await createImageBitmap(new Blob([new Uint8Array(png)], { type: 'image/png' }), { imageOrientation: 'flipY' })
  if (stageBusy()) return (image.close(), { go: (_to, after) => (lay(true), after?.()), drop: () => lay() })
  // The nearest shape worked out ahead: as wide as the row, as tall as that shape makes it.
  const tall = box.width * nearest(box.height / box.width)
  let [drawn, asked] = [false, null as null | (() => Landing | null)]
  let then: (() => void) | undefined
  const crumple = (to: () => Landing | null): void => {
    sheet.crumple()
    // It crumples where it was for a moment, then flies, still crumpling, to its place.
    void sheet.canvas.animate([{ opacity: 1 }, { opacity: 1 }], { duration: crumpleMs }).finished.then(() => fly(to()), () => (sheet.clear(), then?.()))
  }
  const sheet = stageSheet(image, box.width, tall, box.left + box.width / 2, box.top + box.height / 2, paperBack(), () => {
    drawn = true
    // The copy of the row goes as its paper is on screen.
    lay()
    if (asked) crumple(asked)
  })
  const fly = (to: Landing | null): void => {
    const [cx, cy] = [box.left + box.width / 2, box.top + box.height / 2]
    const flight = to
      ? (() => {
          const [dx, dy] = [to.end.left + to.end.width / 2 - cx, to.end.top + to.end.height / 2 - cy]
          // A slight arc: lifted on its way, as a ball of paper is tossed.
          return sheet.canvas.animate(
            [
              { transform: 'translate(0, 0) scale(1)', opacity: 1 },
              { transform: `translate(${dx * 0.5}px, ${dy * 0.5 - 24}px) scale(0.8)`, opacity: 1, offset: 0.5 },
              { transform: `translate(${dx}px, ${dy}px) scale(0.45)`, opacity: 0.5 }
            ],
            { duration: flightMs, easing: IN_OUT, fill: 'forwards' }
          )
        })()
      : sheet.canvas.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 200, easing: 'ease-out', fill: 'forwards' })
    void flight.finished.then(() => (sheet.clear(), to?.nod(), then?.()), () => (sheet.clear(), then?.()))
  }
  return {
    go: (to, after) => ((then = after), drawn ? crumple(to) : void (asked = to)),
    drop: () => (sheet.clear(), lay())
  }
}
