/**
 * Where it went, shown: a copy of the thing you acted on travels from where it
 * was to the place it now lives (the Kept tab, Tasks, the sidebar's Nuggets),
 * and that place nods as it lands: its words fade, it folds into a small
 * square, and the square flies. Skipped entirely when motion is off, and
 * done by a key it is only the nod: keyboard triage is done many times a day.
 *
 * Call `lift` before the change, while the source is still on screen; it
 * returns a `land` to call once the change is made, or nothing to call.
 */
export type Home = 'nugget' | 'task' | 'capture' | 'question'

import { byKeys, still } from './motion'

/** The app's curves (STANDARDS): out for what arrives or leaves, in-out for what travels on screen. */
const OUT = 'cubic-bezier(0.16, 1, 0.3, 1)'
const IN_OUT = 'cubic-bezier(0.77, 0, 0.175, 1)'

type Box = { left: number; top: number; width: number; height: number }

/** Whether a box scrolls or cuts what is inside it. */
const cuts = (el: Element): boolean => {
  const style = getComputedStyle(el)
  return style.overflowX !== 'visible' || style.overflowY !== 'visible'
}

/**
 * What of an element is on screen: cut by every box around it that scrolls
 * or clips, and by the window. Nothing when none of it shows.
 */
function seen(el: Element): Box | null {
  const r = el.getBoundingClientRect()
  let [left, top, right, bottom] = [r.left, r.top, r.right, r.bottom]
  for (let up = el.parentElement; up && up !== document.body; up = up.parentElement) {
    if (!cuts(up)) continue
    const b = up.getBoundingClientRect()
    ;[left, top, right, bottom] = [Math.max(left, b.left), Math.max(top, b.top), Math.min(right, b.right), Math.min(bottom, b.bottom)]
  }
  ;[left, top, right, bottom] = [Math.max(left, 0), Math.max(top, 0), Math.min(right, innerWidth), Math.min(bottom, innerHeight)]
  return right - left >= 1 && bottom - top >= 1 ? { left, top, width: right - left, height: bottom - top } : null
}

/** Not under something else (a dialog, a sheet): what is on top at its middle is it, or inside it. */
const onTop = (el: Element, box: Box): boolean => {
  const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2)
  return !!hit && (el.contains(hit) || hit.contains(el))
}

/**
 * The thing to show flying: a copy of the part of it on screen, so a row
 * half scrolled out of its list never flies over what is around the list.
 */
function snapshot(from: HTMLElement | null): { box: Box; picture: HTMLElement; x: number; y: number } | undefined {
  if (!from || still()) return undefined
  const box = seen(from)
  if (!box) return undefined
  const whole = from.getBoundingClientRect()
  const picture = from.cloneNode(true) as HTMLElement
  picture.removeAttribute('data-id')
  const [x, y] = [whole.left - box.left, whole.top - box.top]
  Object.assign(picture.style, { margin: '0', width: `${whole.width}px`, height: `${whole.height}px`, pointerEvents: 'none', transform: `translate(${x}px, ${y}px)` })
  return { box, picture, x, y }
}

/**
 * Each place has its colour, so where it went reads at a glance: a nugget
 * purple, a task green, back to the Inbox blue, a question in the accent.
 */
const colourOf = (home: Home): string => {
  const root = getComputedStyle(document.documentElement)
  const hue = { nugget: '--tt-color-text-purple', task: '--tt-color-text-green', capture: '--tt-color-text-blue', question: '--tt-brand-color-400' }[home]
  return root.getPropertyValue(hue).trim() || root.getPropertyValue('--tt-brand-color-400').trim() || 'var(--primary)'
}

/** Where a flight lands, and how that place answers. */
type Landing = { end: Box; nod: () => void }

const pulse = (el: HTMLElement): (() => void) => () =>
  void el.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.06)' }, { transform: 'scale(1)' }], { duration: 220, easing: OUT })

/**
 * The nearest place it lives that can be seen now, never one hidden or
 * covered: its row, or with the row scrolled out of its list, that list's
 * edge on the row's side (which lights up as it lands), or the heading of
 * the fold it is shut in, or with the sidebar away, the button that brings
 * the sidebar back. Nothing when none of these shows.
 */
function landing(home: Home): Landing | null {
  const all = (attribute: string): HTMLElement[] =>
    [...document.querySelectorAll<HTMLElement>(`[${attribute}~="${home}"]`)].filter((el) => el.offsetParent !== null)
  const rows = all('data-home')
  for (const to of rows) {
    const box = seen(to)
    // Most of it in view: a row cut by a hair at the list's edge is still a place to land.
    if (box && box.height >= to.getBoundingClientRect().height * 0.6 && onTop(to, box)) return { end: box, nod: pulse(to) }
  }
  for (const to of rows) {
    let list = to.parentElement
    while (list && !(cuts(list) && list.scrollHeight > list.clientHeight)) list = list.parentElement
    const view = list && seen(list)
    if (!list || !view || !onTop(list, view)) continue
    const row = to.getBoundingClientRect()
    const below = row.top >= view.top + view.height / 2
    const x = Math.min(Math.max(row.left + row.width / 2, view.left + 12), view.left + view.width - 12)
    // A small mark just inside the edge, pointing the way to the row.
    const end = { left: x - 6, top: below ? view.top + view.height - 14 : view.top + 2, width: 12, height: 12 }
    return {
      end,
      nod: () => {
        const accent = colourOf(home)
        const bar = document.createElement('div')
        Object.assign(bar.style, {
          position: 'fixed', left: `${view.left + 8}px`, width: `${view.width - 16}px`, height: '2px', borderRadius: '1px',
          top: below ? `${view.top + view.height - 3}px` : `${view.top + 1}px`, background: accent, zIndex: '60', pointerEvents: 'none',
          boxShadow: `0 0 8px ${accent}`
        })
        document.body.append(bar)
        bar.animate([{ opacity: 0, transform: 'scaleX(0.4)' }, { opacity: 1, transform: 'scaleX(1)', offset: 0.35 }, { opacity: 0, transform: 'scaleX(1)' }], { duration: 360, easing: OUT })
          .finished.then(() => bar.remove(), () => bar.remove())
      }
    }
  }
  for (const to of [...all('data-home-near'), ...[...document.querySelectorAll<HTMLElement>('[data-home-away]')].filter((el) => el.offsetParent !== null)]) {
    const box = seen(to)
    if (box && onTop(to, box)) return { end: box, nod: pulse(to) }
  }
  return null
}

export const lift = (id: string, home: Home): (() => void) | undefined =>
  liftFrom(document.querySelector<HTMLElement>(`[data-id="${CSS.escape(id)}"]`), home)

/** How big the square is that a card becomes before it flies. */
const SQUARE = 26

/** The same, from any element: a whole note sent off to the Inbox. */
export function liftFrom(from: HTMLElement | null, home: Home): (() => void) | undefined {
  // By a key, nothing flies: the place it went only nods as it lands.
  if (from && byKeys() && !still()) return () => landing(home)?.nod()
  // A picture of it as it is now, inside a plain card: the real one is about
  // to change or go. The card is what flies; the picture only fades.
  const shot = snapshot(from)
  if (!shot) return undefined
  const { box, picture } = shot
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
    // the main window's sidebar (see `landing`).
    const to = landing(home)
    if (!to) return
    const { end } = to
    document.body.append(card)
    // Three steps, one after the other, so it always looks the same whatever
    // was sent: the words go, the card folds into a small square where it
    // was, and the square flies home. A whole card flying looked thrown.
    const cx = box.left + box.width / 2
    const cy = box.top + box.height / 2
    // Under 300ms in all: the words fade as the card folds, then the square flies.
    void picture.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 60, easing: 'linear', fill: 'forwards' })
    // As it folds, the square takes its place's colour: a plain card on a
    // dark page blended in, and the eye lost it on the way.
    const accent = colourOf(home)
    card.style.backgroundImage = 'none'
    card.style.backgroundColor = getComputedStyle(document.documentElement).getPropertyValue('--popover').trim() || 'Canvas'
    card.animate([{ backgroundColor: card.style.backgroundColor, borderColor: 'var(--border)' }, { backgroundColor: accent, borderColor: accent }], { duration: 110, easing: OUT, fill: 'forwards' })
    // The fold is a transform from the card's corner (on the compositor), its
    // corners kept round by scaling their radius the other way.
    const [sx, sy] = [SQUARE / box.width, SQUARE / box.height]
    card.style.transformOrigin = '0 0'
    const fold = card.animate(
      [
        { transform: 'translate(0px, 0px) scale(1, 1)', borderRadius: '8px' },
        { transform: `translate(${cx - SQUARE / 2 - box.left}px, ${cy - SQUARE / 2 - box.top}px) scale(${sx}, ${sy})`, borderRadius: `${7 / sx}px / ${7 / sy}px` }
      ],
      { duration: 110, easing: 'cubic-bezier(0.32, 0.72, 0, 1)', fill: 'forwards' }
    )
    void fold.finished
      .then(() => {
        // Now a real square where the fold left it, so the flight scales about its middle.
        Object.assign(card.style, { left: `${cx - SQUARE / 2}px`, top: `${cy - SQUARE / 2}px`, width: `${SQUARE}px`, height: `${SQUARE}px`, borderRadius: '7px', transformOrigin: '50% 50%' })
        fold.cancel()
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
          { duration: 180, easing: IN_OUT, fill: 'forwards' }
        ).finished
      })
      .then(() => {
        card.remove()
        to.nod()
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
/** How long a strip takes to fall: about one and a half times the first cut, which went by too fast to see. */
export const SHRED_MS = 420
/** Quick capture's window: no view of its own in the address. */
const inBox = (): boolean => !/[?&](view|note|drawing)=/.test(location.search)

export const shred = (id: string): (() => void) | undefined =>
  shredFrom(document.querySelector<HTMLElement>(`[data-id="${CSS.escape(id)}"]`))

/** `shred` for a card found another way: a practice's row, the hint card. */
export function shredFrom(from: HTMLElement | null): (() => void) | undefined {
  // By a key, it simply goes: discarding is done many times a day.
  if (byKeys()) return undefined
  // Only what is on screen of it is shredded, so no strip falls from behind the list's edge.
  const shot = snapshot(from)
  if (!shot) return undefined
  const { box, picture, x, y } = shot
  return () => {
    // Narrow as a shredder cuts, whatever the width: a long row is many strips, not a few blocks.
    // At most a dozen, so a long row is not dozens of copies falling at once.
    const strips = Math.max(8, Math.min(12, Math.round(box.width / 14)))
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
      piece.style.transform = `translate(${x - n * width}px, ${y}px)`
      strip.append(piece)
      document.body.append(strip)
      const turn = (Math.random() * 2 - 1) * 14
      const fall = box.height * 1.6 + 40 + Math.random() * 60
      // Fed in together, a short drop as the blades take it; then each strip
      // comes apart, curling its own way and falling faster as it goes.
      void strip.animate(
        [
          { transform: 'translateY(0) rotate(0deg)', opacity: 1, easing: 'cubic-bezier(0.23, 1, 0.32, 1)' },
          { transform: `translateY(${Math.min(10, box.height * 0.15)}px) rotate(0deg)`, opacity: 1, offset: 0.2, easing: IN_OUT },
          { transform: `translateY(${fall * 0.45}px) rotate(${turn * 0.6}deg) skewY(${turn * 0.3}deg)`, opacity: 1, offset: 0.65, easing: 'linear' },
          { transform: `translateY(${fall}px) rotate(${turn}deg) skewY(${turn * 0.5}deg)`, opacity: 0 }
        ],
        // Each stage its own timing (above): a whole-run ease made them drop and vanish at once.
        // Slow enough to see the strips part; slower still in quick capture, whose short rows feed through in no time.
        { duration: SHRED_MS * (inBox() ? 1.25 : 1), delay: (n % 2) * 14 + Math.random() * 28, easing: 'linear', fill: 'forwards' }
      ).finished.then(() => strip.remove(), () => strip.remove())
    }
  }
}

/**
 * Thrown away, shown: a copy of the sheet scrunches into a ball (its outline
 * crumpling inward, creases darkening, its words blurring as they fold under)
 * and is tossed off in a short arc (after reactbits' Paper Crumple, drawn
 * flat rather than in 3D). For a draft cleared, which goes nowhere; what goes
 * to the Bin is shredded instead. Like `lift`, before the change; returns a `land`.
 */
export function crumpleFrom(from: HTMLElement | null): (() => void) | undefined {
  if (byKeys()) return undefined
  const shot = snapshot(from)
  if (!shot) return undefined
  const { box, picture } = shot
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
    picture.animate([{ filter: 'blur(0px)', opacity: 1 }, { filter: 'blur(1.5px)', opacity: 0.55 }], { duration: 120, easing: OUT, fill: 'forwards' })
    void sheet.animate(
      [
        { clipPath: `polygon(${flat})`, transform: 'rotate(0deg) scale(1, 1)', boxShadow: 'inset 0 0 0 rgb(0 0 0 / 0)', opacity: 1, easing: 'cubic-bezier(0.23, 1, 0.32, 1)' },
        { clipPath: `polygon(${ball})`, transform: `rotate(${turn}deg) scale(${across}, ${down})`, boxShadow: `inset 0 0 ${size * 0.5}px rgb(0 0 0 / 0.32)`, opacity: 1, offset: 0.4, easing: IN_OUT },
        { clipPath: `polygon(${ball})`, transform: `translate(${turn > 0 ? 70 : -70}px, ${Math.min(size, 48) * 0.6 + 120}px) rotate(${turn * 6}deg) scale(${across * 0.9}, ${down * 0.9})`, boxShadow: `inset 0 0 ${size * 0.5}px rgb(0 0 0 / 0.32)`, opacity: 0 }
      ],
      { duration: 300, easing: 'linear', fill: 'forwards' }
    ).finished.then(() => sheet.remove(), () => sheet.remove())
  }
}
