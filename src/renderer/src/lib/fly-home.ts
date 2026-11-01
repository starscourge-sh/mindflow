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
import { EASING } from '@/lib/motion'

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
      { duration: 110, easing: EASING, fill: 'forwards' }
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

/** Quick capture's window: no view of its own in the address. */
const inBox = (): boolean => !/[?&](view|note|drawing)=/.test(location.search)

/**
 * The sidebar's Bin, when it can be seen: where a ball of paper is tossed.
 * With the sidebar away, the button that brings it back; otherwise nothing,
 * and the ball drops off the foot of the window instead.
 */
function binRow(): Landing | null {
  for (const to of [...document.querySelectorAll<HTMLElement>('[data-side-row][aria-label="Bin"], [data-home-away]')].filter((el) => el.offsetParent !== null)) {
    const box = seen(to)
    if (box && onTop(to, box)) return { end: box, nod: pulse(to) }
  }
  return null
}

/**
 * Moved to the Bin, shown: a copy of the row scrunches into a ball where it
 * was (about 300ms), then tumbles into the sidebar's Bin, which nods as it
 * lands; with no Bin in sight it drops off the window's foot. The same for
 * every list, every kind and every way there but a key (`moveToBin`,
 * `closeTask`, a capture let go). Like `lift`, call it before the change; it
 * returns a `land` for once the change is made.
 */
export const shred = (id: string): (() => void) | undefined =>
  // The one on screen: the same id can also be on a row out of sight (a fold shut, a list behind).
  shredFrom([...document.querySelectorAll<HTMLElement>(`[data-id="${CSS.escape(id)}"]`)].find((one) => seen(one)) ?? null)

/** `shred` for a card found another way: a practice's row, the hint card. */
export const shredFrom = (from: HTMLElement | null): (() => void) | undefined => crumpleFrom(from, 'bin')

/** How long the scrunch takes, and how long the ball takes to reach the Bin. */
const SCRUNCH_MS = 300
const TOSS_MS = 280

/** Ten points round the edge, pulled in by different amounts: the outline of a ball of paper. */
const FLAT = '0% 0%, 50% 0%, 100% 0%, 100% 50%, 100% 100%, 50% 100%, 0% 100%, 0% 50%, 25% 25%, 75% 75%'
export const ballOutline = (): string => {
  const pull = (): number => 18 + Math.random() * 22
  return `${pull()}% ${pull()}%, 50% ${pull() - 8}%, ${100 - pull()}% ${pull()}%, ${100 - pull() + 6}% 50%, ${100 - pull()}% ${100 - pull()}%, 50% ${100 - pull() + 8}%, ${pull()}% ${100 - pull()}%, ${pull() - 6}% 50%, 40% 40%, 60% 60%`
}

/**
 * Thrown away, shown: a copy of the sheet scrunches into a ball (its outline
 * crumpling inward, creases darkening, its words blurring as they fold under)
 * and is tossed: into the Bin (`to: 'bin'`, when the sidebar's Bin shows) or
 * off in a short arc (a draft cleared, which goes nowhere). Drawn flat, with
 * elements made for the motion and removed after it: nothing is left when idle.
 */
export function crumpleFrom(from: HTMLElement | null, to: 'bin' | 'away' = 'away'): (() => void) | undefined {
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
    sheet.setAttribute('data-crumple', to)
    sheet.append(picture)
    document.body.append(sheet)
    const ball = ballOutline()
    const size = Math.min(box.width, box.height)
    // Into a ball, whatever the sheet's shape: a long row squeezed only evenly stayed a ribbon.
    const across = Math.min(1, 44 / box.width)
    const down = Math.min(1, 44 / box.height)
    const turn = (Math.random() < 0.5 ? -1 : 1) * (18 + Math.random() * 14)
    const shade = `inset 0 0 ${size * 0.5}px rgb(0 0 0 / 0.32)`
    const bin = to === 'bin' ? binRow() : null
    // Where the ball goes: the Bin's middle, or down and aside off the foot.
    const [dx, dy] = bin
      ? [bin.end.left + bin.end.width / 2 - (box.left + box.width / 2), bin.end.top + bin.end.height / 2 - (box.top + box.height / 2)]
      : [turn > 0 ? 70 : -70, Math.max(Math.min(size, 48) * 0.6 + 120, innerHeight - box.top + 40)]
    const toss = bin ? TOSS_MS : TOSS_MS * 1.2
    const all = (inBox() ? 1.15 : 1) * (SCRUNCH_MS + toss)
    const at = SCRUNCH_MS / (SCRUNCH_MS + toss)
    picture.animate([{ filter: 'blur(0px)', opacity: 1 }, { filter: 'blur(1.5px)', opacity: 0.55 }], { duration: SCRUNCH_MS * 0.5, easing: OUT, fill: 'forwards' })
    void sheet.animate(
      [
        { clipPath: `polygon(${FLAT})`, transform: 'translate(0px, 0px) rotate(0deg) scale(1, 1)', boxShadow: 'inset 0 0 0 rgb(0 0 0 / 0)', opacity: 1, easing: EASING },
        { clipPath: `polygon(${ball})`, transform: `translate(0px, 0px) rotate(${turn}deg) scale(${across}, ${down})`, boxShadow: shade, opacity: 1, offset: at, easing: IN_OUT },
        // Tossed: a little up first when it flies to the Bin, so it reads as thrown, not slid.
        ...(bin ? [{ clipPath: `polygon(${ball})`, transform: `translate(${dx * 0.5}px, ${dy * 0.5 - 24}px) rotate(${turn * 3}deg) scale(${across * 0.8}, ${down * 0.8})`, boxShadow: shade, opacity: 1, offset: at + (1 - at) * 0.5 }] : []),
        { clipPath: `polygon(${ball})`, transform: `translate(${dx}px, ${dy}px) rotate(${turn * 6}deg) scale(${across * (bin ? 0.45 : 0.9)}, ${down * (bin ? 0.45 : 0.9)})`, boxShadow: shade, opacity: bin ? 0.85 : 0 }
      ],
      { duration: all, easing: 'linear', fill: 'forwards' }
    ).finished.then(() => (sheet.remove(), bin?.nod()), () => sheet.remove())
  }
}

/**
 * Taken back out of the Bin, shown: a copy of the row starts as a ball of
 * paper and smooths flat where it was, then fades as the row leaves the Bin.
 * By a key, or with motion off, it simply goes.
 */
export function uncrumpleFrom(from: HTMLElement | null): void {
  if (byKeys()) return
  const shot = snapshot(from)
  if (!shot) return
  const { box, picture } = shot
  const sheet = document.createElement('div')
  Object.assign(sheet.style, {
    position: 'fixed', left: `${box.left}px`, top: `${box.top}px`, width: `${box.width}px`, height: `${box.height}px`,
    zIndex: '60', pointerEvents: 'none', overflow: 'hidden', borderRadius: '6px',
    backgroundImage: 'linear-gradient(color-mix(in oklab, var(--foreground) 6%, var(--popover)), color-mix(in oklab, var(--foreground) 6%, var(--popover)))', backgroundColor: 'Canvas'
  })
  sheet.setAttribute('data-crumple', 'back')
  sheet.append(picture)
  document.body.append(sheet)
  const across = Math.min(1, 44 / box.width)
  const down = Math.min(1, 44 / box.height)
  const shade = `inset 0 0 ${Math.min(box.width, box.height) * 0.5}px rgb(0 0 0 / 0.28)`
  picture.animate([{ filter: 'blur(1.5px)', opacity: 0.5 }, { filter: 'blur(0px)', opacity: 1 }], { duration: 260, easing: OUT, fill: 'forwards' })
  void sheet.animate(
    [
      { clipPath: `polygon(${ballOutline()})`, transform: `rotate(-20deg) scale(${across}, ${down})`, boxShadow: shade, opacity: 1, easing: OUT },
      { clipPath: `polygon(${FLAT})`, transform: 'rotate(0deg) scale(1, 1)', boxShadow: 'inset 0 0 0 rgb(0 0 0 / 0)', opacity: 1, offset: 0.7 },
      { clipPath: `polygon(${FLAT})`, transform: 'rotate(0deg) scale(1, 1)', boxShadow: 'inset 0 0 0 rgb(0 0 0 / 0)', opacity: 0 }
    ],
    { duration: 380, easing: 'linear', fill: 'forwards' }
  ).finished.then(() => sheet.remove(), () => sheet.remove())
}

/** How long a sticky is held before it is a ball, and how long before a press starts to crumple at all (a click never does). */
export const HOLD_MS = 900
const HOLD_WAIT_MS = 160

/**
 * Press and hold to throw away (a sticky): after a moment the sheet starts to
 * crumple, more the longer it is held, so the hold is the confirmation. Let go
 * early and it smooths flat again from wherever it got to; held to the end it
 * is a ball, drops off the window's foot, and `done` is called, after which
 * it smooths back out in its place. With motion off or Reduce motion it only
 * fades as it is held. Gives back `release`, for the pointer let go or gone,
 * and `held`, whether the press became a hold (so its click is not also a click).
 */
export function holdToCrumple(el: HTMLElement, done: () => void): { release: () => void; held: () => boolean } {
  const flat = still()
  let crumple: Animation | null = null
  let finished = false
  const wait = setTimeout(() => {
    const box = el.getBoundingClientRect()
    const across = Math.min(1, 52 / box.width)
    const down = Math.min(1, 52 / box.height)
    const turn = (Math.random() < 0.5 ? -1 : 1) * (14 + Math.random() * 10)
    crumple = el.animate(flat
      ? [{ opacity: 1 }, { opacity: 0.35 }]
      : [
          { clipPath: `polygon(${FLAT})`, transform: 'rotate(0deg) scale(1, 1)', boxShadow: 'inset 0 0 0 rgb(0 0 0 / 0)', filter: 'brightness(1)' },
          { clipPath: `polygon(${ballOutline()})`, transform: `rotate(${turn}deg) scale(${across}, ${down})`, boxShadow: `inset 0 0 ${Math.min(box.width, box.height) * 0.4}px rgb(0 0 0 / 0.35)`, filter: 'brightness(0.94)' }
        ],
      // Slow at first and gathering, as a hand closing on paper: the start is still easy to take back.
      { duration: HOLD_MS - HOLD_WAIT_MS, easing: 'cubic-bezier(0.5, 0, 0.75, 0.6)', fill: 'forwards' })
    el.setAttribute('data-crumpling', '')
    crumple.finished.then(() => {
      finished = true
      // A ball now: it drops off the foot of the window, and only then is it thrown away.
      const fall = innerHeight - el.getBoundingClientRect().top + 40
      const drop = flat
        ? el.animate([{ opacity: 0.35 }, { opacity: 0 }], { duration: 120, fill: 'forwards' })
        : el.animate([{ translate: '0 0' }, { translate: `0 ${fall}px` }], { duration: 260, easing: 'cubic-bezier(0.55, 0, 1, 0.45)', fill: 'forwards' })
      drop.finished.then(() => {
        done()
        // Back in its place, smoothing out of the ball: the card now says where it went, with the way back.
        drop.cancel()
        crumple?.reverse()
        crumple?.finished.then(() => (crumple?.cancel(), el.removeAttribute('data-crumpling')), () => undefined)
      }, () => undefined)
    }, () => undefined)
  }, HOLD_WAIT_MS)
  return {
    held: () => crumple !== null,
    release: () => {
      clearTimeout(wait)
      if (!crumple || finished) return
      // Let go early: it smooths flat again from where it got to, quicker than it went.
      crumple.playbackRate = -3
      crumple.finished.then(() => (crumple?.cancel(), el.removeAttribute('data-crumpling')), () => undefined)
    }
  }
}
