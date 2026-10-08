/**
 * Where it went, shown: a copy of the thing you acted on travels from where it
 * was to the place it now lives (the Kept tab, Tasks, the sidebar's Nuggets),
 * and that place nods as it lands: its words fade, it folds into a small
 * square, and the square flies. Skipped entirely when motion is off.
 *
 * Call `lift` before the change, while the source is still on screen; it
 * returns a `land` to call once the change is made, or nothing to call.
 */
export type Home = 'nugget' | 'task' | 'capture' | 'question'

const still = (): boolean =>
  document.documentElement.dataset.motion === 'off' || matchMedia('(prefers-reduced-motion: reduce)').matches

export const lift = (id: string, home: Home): (() => void) | undefined =>
  liftFrom(document.querySelector<HTMLElement>(`[data-id="${CSS.escape(id)}"]`), home)

/** How big the square is that a card becomes before it flies. */
const SQUARE = 26

/** The same, from any element: a whole note sent off to the Inbox. */
export function liftFrom(from: HTMLElement | null, home: Home): (() => void) | undefined {
  if (!from || still()) return undefined
  const box = from.getBoundingClientRect()
  // A picture of it as it is now, inside a plain card: the real one is about
  // to change or go. The card is what flies; the picture only fades.
  const picture = from.cloneNode(true) as HTMLElement
  picture.removeAttribute('data-id')
  Object.assign(picture.style, { margin: '0', width: `${box.width}px`, height: `${box.height}px`, pointerEvents: 'none' })
  const card = document.createElement('div')
  Object.assign(card.style, {
    position: 'fixed', left: `${box.left}px`, top: `${box.top}px`, width: `${box.width}px`, height: `${box.height}px`,
    zIndex: '60', pointerEvents: 'none', overflow: 'hidden', borderRadius: '8px',
    // Solid in every theme, with a hairline edge, so the square reads as an object.
    backgroundImage: 'linear-gradient(var(--popover), var(--popover)), linear-gradient(var(--background), var(--background))',
    backgroundColor: 'Canvas', border: '1px solid var(--border)', boxShadow: '0 1px 2px rgb(0 0 0 / 0.12), 0 6px 16px -6px rgb(0 0 0 / 0.35)'
  })
  card.append(picture)
  return () => {
    // The nearest place it lives that is on screen now: the prompt's tab, or
    // the main window's sidebar.
    const to = [...document.querySelectorAll<HTMLElement>(`[data-home~="${home}"]`)].find((el) => el.offsetParent !== null)
    if (!to) return
    const end = to.getBoundingClientRect()
    document.body.append(card)
    // Three steps, one after the other, so it always looks the same whatever
    // was sent: the words go, the card folds into a small square where it
    // was, and the square flies home. A whole card flying looked thrown.
    const cx = box.left + box.width / 2
    const cy = box.top + box.height / 2
    const fade = picture.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 110, easing: 'linear', fill: 'forwards' })
    void fade.finished
      .then(() => {
        // As it folds, the square takes the accent colour: a plain card on a
        // dark page blended in, and the eye lost it on the way.
        // Each place has its colour, so where it went reads at a glance: a
        // nugget purple, a task green, back to the Inbox blue, a question in the accent.
        const root = getComputedStyle(document.documentElement)
        const hue = { nugget: '--tt-color-text-purple', task: '--tt-color-text-green', capture: '--tt-color-text-blue', question: '--tt-brand-color-400' }[home]
        const accent = root.getPropertyValue(hue).trim() || root.getPropertyValue('--tt-brand-color-400').trim() || 'var(--primary)'
        card.style.backgroundImage = 'none'
        card.style.backgroundColor = getComputedStyle(document.documentElement).getPropertyValue('--popover').trim() || 'Canvas'
        card.animate([{ backgroundColor: card.style.backgroundColor, borderColor: 'var(--border)' }, { backgroundColor: accent, borderColor: accent }], { duration: 200, easing: 'ease-out', fill: 'forwards' })
        return card.animate(
          [
            { left: `${box.left}px`, top: `${box.top}px`, width: `${box.width}px`, height: `${box.height}px`, borderRadius: '8px' },
            { left: `${cx - SQUARE / 2}px`, top: `${cy - SQUARE / 2}px`, width: `${SQUARE}px`, height: `${SQUARE}px`, borderRadius: '7px' }
          ],
          { duration: 200, easing: 'cubic-bezier(0.32, 0.72, 0, 1)', fill: 'forwards' }
        ).finished
      })
      .then(() => {
        const dx = end.left + end.width / 2 - cx
        const dy = end.top + end.height / 2 - cy
        const scale = Math.max(0.5, Math.min(1, end.height / SQUARE))
        // A slight arc: it lifts on its way rather than sliding in a straight line.
        return card.animate(
          [
            { transform: 'translate(0, 0) scale(1)', opacity: 1 },
            { transform: `translate(${dx * 0.5}px, ${dy * 0.5 - 18}px) scale(1.04)`, opacity: 1, offset: 0.5 },
            { transform: `translate(${dx}px, ${dy}px) scale(${scale})`, opacity: 0.4 }
          ],
          { duration: 320, easing: 'cubic-bezier(0.5, 0, 0.2, 1)', fill: 'forwards' }
        ).finished
      })
      .then(() => {
        card.remove()
        to.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.12)' }, { transform: 'scale(1)' }], { duration: 220, easing: 'ease-out' })
      })
      .catch(() => card.remove())
  }
}

/**
 * Let go, shown: a copy of the card feeds down through a slit and comes out
 * the other side as strips, each curling its own way as it drops and fades,
 * as paper does from a shredder (after reactbits' Shredder, without the drag:
 * here a discard is a key or a click). Like `lift`, call it before the change;
 * it returns a `land` for once the change is made.
 */
export function shred(id: string): (() => void) | undefined {
  const from = document.querySelector<HTMLElement>(`[data-id="${CSS.escape(id)}"]`)
  if (!from || still()) return undefined
  const box = from.getBoundingClientRect()
  const picture = from.cloneNode(true) as HTMLElement
  picture.removeAttribute('data-id')
  Object.assign(picture.style, { margin: '0', width: `${box.width}px`, height: `${box.height}px`, pointerEvents: 'none' })
  return () => {
    // Narrow as a shredder cuts, whatever the width: a long row is many strips, not a few blocks.
    const strips = Math.max(8, Math.min(48, Math.round(box.width / 14)))
    const width = box.width / strips
    for (let n = 0; n < strips; n++) {
      const strip = document.createElement('div')
      Object.assign(strip.style, {
        position: 'fixed', left: `${box.left + n * width}px`, top: `${box.top}px`, width: `${width - 0.5}px`, height: `${box.height}px`,
        zIndex: '60', pointerEvents: 'none', overflow: 'hidden', borderRadius: '1px',
        // Paper: the card's own colour, a hairline shadow so each strip reads as a thing.
        backgroundImage: 'linear-gradient(var(--popover), var(--popover))', backgroundColor: 'Canvas',
        boxShadow: '0 1px 2px rgb(0 0 0 / 0.18)'
      })
      const piece = picture.cloneNode(true) as HTMLElement
      piece.style.transform = `translateX(${-n * width}px)`
      strip.append(piece)
      document.body.append(strip)
      const turn = (Math.random() * 2 - 1) * 14
      const fall = box.height * 1.6 + 40 + Math.random() * 60
      // Fed in together, a short drop as the blades take it; then each strip
      // comes apart, curling its own way and falling faster as it goes.
      void strip.animate(
        [
          { transform: 'translateY(0) rotate(0deg)', opacity: 1, easing: 'cubic-bezier(0.23, 1, 0.32, 1)' },
          { transform: `translateY(${Math.min(10, box.height * 0.15)}px) rotate(0deg)`, opacity: 1, offset: 0.2, easing: 'cubic-bezier(0.5, 0, 0.9, 0.5)' },
          { transform: `translateY(${fall * 0.45}px) rotate(${turn * 0.6}deg) skewY(${turn * 0.3}deg)`, opacity: 1, offset: 0.65, easing: 'cubic-bezier(0.3, 0, 0.7, 1)' },
          { transform: `translateY(${fall}px) rotate(${turn}deg) skewY(${turn * 0.5}deg)`, opacity: 0 }
        ],
        // Each stage its own timing (above): a whole-run ease made them drop and vanish at once.
        { duration: 820, delay: (n % 2) * 18 + Math.random() * 40, easing: 'linear', fill: 'forwards' }
      ).finished.then(() => strip.remove(), () => strip.remove())
    }
  }
}

/**
 * Thrown away, shown: a copy of the sheet scrunches into a ball (its outline
 * crumpling inward, creases darkening, its words blurring as they fold under)
 * and is tossed off in a short arc (after reactbits' Paper Crumple, drawn
 * flat rather than in 3D). For what is let go rather than filed: a task closed
 * without doing, a draft cleared. Like `lift`, before the change; returns a `land`.
 */
export const crumple = (id: string): (() => void) | undefined =>
  crumpleFrom(document.querySelector<HTMLElement>(`[data-id="${CSS.escape(id)}"]`))

export function crumpleFrom(from: HTMLElement | null): (() => void) | undefined {
  if (!from || still()) return undefined
  const box = from.getBoundingClientRect()
  const picture = from.cloneNode(true) as HTMLElement
  picture.removeAttribute('data-id')
  Object.assign(picture.style, { margin: '0', width: `${box.width}px`, height: `${box.height}px`, pointerEvents: 'none' })
  return () => {
    const sheet = document.createElement('div')
    Object.assign(sheet.style, {
      position: 'fixed', left: `${box.left}px`, top: `${box.top}px`, width: `${box.width}px`, height: `${box.height}px`,
      zIndex: '60', pointerEvents: 'none', overflow: 'hidden', borderRadius: '6px',
      // A shade lighter than the page, so a ball of it reads as paper, not a hole.
      backgroundImage: 'linear-gradient(color-mix(in oklab, var(--foreground) 12%, var(--popover)), color-mix(in oklab, var(--foreground) 12%, var(--popover)))', backgroundColor: 'Canvas'
    })
    sheet.append(picture)
    document.body.append(sheet)
    // Ten points round the edge, pulled in by different amounts: the outline of a ball of paper.
    const flat = '0% 0%, 50% 0%, 100% 0%, 100% 50%, 100% 100%, 50% 100%, 0% 100%, 0% 50%, 25% 25%, 75% 75%'
    const pull = (): number => 18 + Math.random() * 22
    const ball = `${pull()}% ${pull()}%, 50% ${pull() - 8}%, ${100 - pull()}% ${pull()}%, ${100 - pull() + 6}% 50%, ${100 - pull()}% ${100 - pull()}%, 50% ${100 - pull() + 8}%, ${pull()}% ${100 - pull()}%, ${pull() - 6}% 50%, 40% 40%, 60% 60%`
    const size = Math.min(box.width, box.height)
    // Into a ball, whatever the sheet's shape: a long row squeezed only evenly stayed a ribbon.
    const across = Math.min(1, 48 / box.width)
    const down = Math.min(1, 48 / box.height)
    const turn = (Math.random() < 0.5 ? -1 : 1) * (18 + Math.random() * 14)
    // Scrunched where it was, quickly; then tossed down and aside, falling faster as it goes.
    picture.animate([{ filter: 'blur(0px)', opacity: 1 }, { filter: 'blur(1.5px)', opacity: 0.55 }], { duration: 240, easing: 'ease-out', fill: 'forwards' })
    void sheet.animate(
      [
        { clipPath: `polygon(${flat})`, transform: 'rotate(0deg) scale(1, 1)', boxShadow: 'inset 0 0 0 rgb(0 0 0 / 0)', opacity: 1, easing: 'cubic-bezier(0.23, 1, 0.32, 1)' },
        { clipPath: `polygon(${ball})`, transform: `rotate(${turn}deg) scale(${across}, ${down})`, boxShadow: `inset 0 0 ${size * 0.5}px rgb(0 0 0 / 0.32)`, opacity: 1, offset: 0.4, easing: 'cubic-bezier(0.5, 0, 0.9, 0.6)' },
        { clipPath: `polygon(${ball})`, transform: `translate(${turn > 0 ? 70 : -70}px, ${Math.min(size, 48) * 0.6 + 120}px) rotate(${turn * 6}deg) scale(${across * 0.9}, ${down * 0.9})`, boxShadow: `inset 0 0 ${size * 0.5}px rgb(0 0 0 / 0.32)`, opacity: 0 }
      ],
      { duration: 640, easing: 'linear', fill: 'forwards' }
    ).finished.then(() => sheet.remove(), () => sheet.remove())
  }
}
