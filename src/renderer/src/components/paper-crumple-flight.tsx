import { createRoot } from 'react-dom/client'
import PaperCrumple from './paper-crumple'
import type { Box, Landing } from '@/lib/fly-home'

/** The app's curve for what travels on screen (STANDARDS), as in lib/fly-home.ts. */
const IN_OUT = 'cubic-bezier(0.77, 0, 0.175, 1)'
/** Room round the sheet: PaperCrumple keeps 24px clear on each side before it shrinks the paper. */
const ROOM = 24

/** A theme colour as the paper's back can take it: three.js reads rgb, not oklch. */
const colourOf = (token: string): string => {
  const pen = document.createElement('canvas').getContext('2d')
  if (!pen) return '#f4f0e8'
  pen.fillStyle = getComputedStyle(document.documentElement).getPropertyValue(token).trim() || '#f4f0e8'
  return pen.fillStyle
}

/**
 * A row's picture, crumpled where the row was and flown to `to` (the
 * sidebar's Bin), or with nowhere to go, faded where it was. Loaded only with
 * the first move to the Bin by a click, and three.js with it.
 */
export function crumpleOver(box: Box, png: Uint8Array, to: Landing | null, crumpleMs: number, flightMs: number): void {
  const url = URL.createObjectURL(new Blob([new Uint8Array(png)], { type: 'image/png' }))
  // Room above and below too: a long row crumples into a ribbon that swings well past its own height before it balls.
  const tall = Math.max(box.height + ROOM * 2, Math.min(box.width * 0.6, 520))
  const host = document.createElement('div')
  host.setAttribute('data-crumple', '')
  Object.assign(host.style, {
    position: 'fixed', left: `${box.left - ROOM}px`, top: `${box.top + box.height / 2 - tall / 2}px`, width: `${box.width + ROOM * 2}px`, height: `${tall}px`,
    zIndex: '60', pointerEvents: 'none'
  })
  document.body.append(host)
  const root = createRoot(host)
  const done = (): void => {
    root.unmount()
    host.remove()
    URL.revokeObjectURL(url)
  }
  const fly = (): void => {
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
  root.render(
    <PaperCrumple
      src={url}
      alt=""
      width={box.width}
      height={box.height}
      sceneHeight={tall}
      style={{ width: box.width + ROOM * 2, height: tall }}
      className="[&_*]:pointer-events-none"
      releaseBehavior="stay"
      crumpled
      crumpleAmount={0.85}
      crumpleDuration={0.55}
      releaseDuration={0.4}
      foldCount={6}
      foldSharpness={0.6}
      wrinkleDepth={0.65}
      creaseStrength={0.18}
      paperColor={colourOf('--popover')}
      paperTexture={0.08}
      draggable={false}
      returnToOrigin={false}
      onReady={() => void host.animate([{ opacity: 1 }, { opacity: 1 }], { duration: crumpleMs }).finished.then(fly, done)}
      onError={done}
    />
  )
}
