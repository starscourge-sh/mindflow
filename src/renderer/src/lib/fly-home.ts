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
export type Home = 'nugget' | 'task' | 'capture' | 'question' | 'bin' | 'files'

import { crumple } from '@/lib/sound'
import { byKeys, still } from './motion'
import { EASING } from '@/lib/motion'

/** The app's curves (STANDARDS): out for what arrives or leaves, in-out for what travels on screen. */
const OUT = 'cubic-bezier(0.16, 1, 0.3, 1)'
const IN_OUT = 'cubic-bezier(0.77, 0, 0.175, 1)'

export type Box = { left: number; top: number; width: number; height: number }

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
  const hue = { bin: '--tt-color-text-red', nugget: '--tt-color-text-purple', task: '--tt-color-text-green', capture: '--tt-color-text-blue', question: '--tt-brand-color-400', files: '--tt-color-text-purple' }[home]
  return root.getPropertyValue(hue).trim() || root.getPropertyValue('--tt-brand-color-400').trim() || 'var(--primary)'
}

/** Where a flight lands, and how that place answers. */
export type Landing = { end: Box; nod: () => void }

const pulse = (el: HTMLElement): (() => void) => () =>
  void el.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.06)' }, { transform: 'scale(1)' }], { duration: 220, easing: OUT })

/**
 * The nearest place it lives that can be seen now, never one hidden or
 * covered: its row, or with the row scrolled out of its list, that list's
 * edge on the row's side (which lights up as it lands), or the heading of
 * the fold it is shut in, or with the sidebar away, the button that brings
 * the sidebar back. Nothing when none of these shows.
 */
export function landing(home: Home): Landing | null {
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

/**
 * Moved to the Bin, shown: the row's picture crumples into a ball of paper
 * where it was (React Bits' PaperCrumple, components/paper-crumple.ts) and
 * flies to the sidebar's Bin, which nods as it lands; with no Bin in sight it
 * crumples and fades where it was. The same for every list, every kind and
 * every way there but a key (`moveToBin`, `closeTask`, a capture let go).
 * Like `lift`, call it before the change; it returns a `land` for once the
 * change is made. Three.js loads with the first one, not with the app.
 */
export const binFlight = (id: string): (() => void) | undefined =>
  // The one on screen: the same id can also be on a row out of sight (a fold shut, a list behind).
  binFlightFrom([...document.querySelectorAll<HTMLElement>(`[data-id="${CSS.escape(id)}"]`)].find((one) => seen(one)) ?? null)

/** Quick capture's window: no view of its own in the address. */
const inBox = (): boolean => !/[?&](view|note|drawing)=/.test(location.search)

/** How long the paper crumples before it flies, and the flight: slow enough to see a sheet balled up and tossed. */
const CRUMPLE_MS = 650
const FLIGHT_MS = 450

/** `binFlight` for a card found another way: a practice's row, the hint card. */
export function binFlightFrom(from: HTMLElement | null, to: () => Landing | null = () => landing('bin'), crumpleMs = CRUMPLE_MS): Flight | undefined {
  // By a key, it simply goes: binning is done many times a day. Motion off or Reduce motion, nothing travels.
  if (!from || byKeys() || still()) return undefined
  // The menu it was binned from goes at once, so the row is seen whole and its picture is the row alone.
  for (const menu of document.querySelectorAll<HTMLElement>('[role="menu"]')) menu.style.visibility = 'hidden'
  // Only what is on screen of it, so nothing crumples from behind the list's edge.
  const shot = snapshot(from)
  if (!shot || !onTop(from, shot.box)) return undefined
  const { box } = shot
  // In this frame: a copy of the row laid where it was, the row itself held out of sight under it, so the
  // place never shows empty; the paper takes the copy's place once drawn.
  const cover = document.createElement('div')
  cover.setAttribute('data-crumple', '')
  Object.assign(cover.style, { position: 'fixed', left: `${box.left}px`, top: `${box.top}px`, width: `${box.width}px`, height: `${box.height}px`, zIndex: '60', pointerEvents: 'none', overflow: 'hidden' })
  cover.append(shot.picture)
  document.body.append(cover)
  const hidden = from.animate({ visibility: ['hidden', 'hidden'] }, { duration: 2500 })
  // Gone at once once the paper is drawn; faded where it was when the paper is busy with another row.
  const lay = (fade = false): void =>
    void (fade ? cover.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 200, easing: 'ease-out', fill: 'forwards' }).finished.then(() => cover.remove(), () => cover.remove()) : cover.remove())
  // Its picture: taken as its menu opened, or now; three.js and the fold paths were made ready while the app was idle (`warmBin`).
  const early = picked && picked.row === from && JSON.stringify(picked.box) === JSON.stringify(box) ? picked.png : null
  // The sound of it: paper crumpling, as long as the hands work at it (the Bin's tear stays quiet).
  crumple(crumpleMs / 1000)
  const sheet = Promise.all([early ?? window.api.pictureOfRect({ x: box.left, y: box.top, width: box.width, height: box.height }), import('@/components/paper-crumple-flight')])
    .then(([png, { sheetOver }]) => (png ? sheetOver(box, png, lay, crumpleMs, FLIGHT_MS) : (lay(), hidden.cancel(), null)), () => (lay(), hidden.cancel(), null))
  const land = (): void => void sheet.then((one) => one?.go(to))
  return Object.assign(land, { drop: (): void => void sheet.then((one) => (one?.drop(), lay(), hidden.cancel())) })
}

/**
 * A picture taken out of a note: React Bits' paper crumples and is tossed to Files in the sidebar, where the picture
 * still is (it is not binned); with Files out of sight, it fades where it was.
 */
export const crumpleAway = (from: HTMLElement | null, crumpleMs = CRUMPLE_MS): Flight | undefined => binFlightFrom(from, () => landing('files'), crumpleMs)

/**
 * The picture of the row a menu was just opened on, taken as it opened: the
 * menu then never shows in it, and a move to the Bin from the menu has it waiting.
 */
let picked: { row: HTMLElement; box: Box; png: Promise<Uint8Array | null> } | null = null
if (typeof document !== 'undefined')
  document.addEventListener('contextmenu', (event) => {
    const row = (event.target as Element | null)?.closest?.<HTMLElement>('[data-id]')
    const box = row && !still() ? seen(row) : null
    picked = row && box ? { row, box, png: window.api.pictureOfRect({ x: box.left, y: box.top, width: box.width, height: box.height }) } : null
  }, true)

/** A move to the Bin, shown: call it once the move is made, or `drop` it when the move did not happen. */
export type Flight = (() => void) & { drop: () => void }

/** Once the app is idle: three.js loaded and the paper's folds worked out, so the first move to the Bin is as quick as the rest. */
export function warmBin(): void {
  if (still()) return
  requestIdleCallback(() => void import('@/components/paper-crumple-flight').then((paper) => paper.warmPaper(), () => undefined), { timeout: 8000 })
}

/** Ten points round the edge, pulled in by different amounts: the outline of a ball of paper. */
const FLAT = '0% 0%, 50% 0%, 100% 0%, 100% 50%, 100% 100%, 50% 100%, 0% 100%, 0% 50%, 25% 25%, 75% 75%'
const ballOutline = (): string => {
  const pull = (): number => 18 + Math.random() * 22
  return `${pull()}% ${pull()}%, 50% ${pull() - 8}%, ${100 - pull()}% ${pull()}%, ${100 - pull() + 6}% 50%, ${100 - pull()}% ${100 - pull()}%, 50% ${100 - pull() + 8}%, ${pull()}% ${100 - pull()}%, ${pull() - 6}% 50%, 40% 40%, 60% 60%`
}

/**
 * Thrown away, shown: a copy of the sheet scrunches into a ball (its outline
 * crumpling inward, creases darkening, its words blurring as they fold under)
 * and is tossed off in a short arc (after reactbits' Paper Crumple, drawn
 * flat). Only for a draft cleared from the box, which goes nowhere and so is
 * not shredded into the Bin: everything that goes to the Bin is shredded.
 * Like `lift`, before the change; returns a `land`.
 */
export function crumpleFrom(from: HTMLElement | null, ms = 300): (() => void) | undefined {
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
    sheet.setAttribute('data-crumple', 'away')
    sheet.append(picture)
    document.body.append(sheet)
    const ball = ballOutline()
    const size = Math.min(box.width, box.height)
    // Into a ball, whatever the sheet's shape: a long row squeezed only evenly stayed a ribbon.
    const across = Math.min(1, 48 / box.width)
    const down = Math.min(1, 48 / box.height)
    const turn = (Math.random() < 0.5 ? -1 : 1) * (18 + Math.random() * 14)
    const shade = `inset 0 0 ${size * 0.5}px rgb(0 0 0 / 0.32)`
    // Scrunched where it was, quickly; then tossed down and aside, falling faster as it goes.
    picture.animate([{ filter: 'blur(0px)', opacity: 1 }, { filter: 'blur(1.5px)', opacity: 0.55 }], { duration: ms * 0.4, easing: OUT, fill: 'forwards' })
    void sheet.animate(
      [
        { clipPath: `polygon(${FLAT})`, transform: 'rotate(0deg) scale(1, 1)', boxShadow: 'inset 0 0 0 rgb(0 0 0 / 0)', opacity: 1, easing: EASING },
        { clipPath: `polygon(${ball})`, transform: `rotate(${turn}deg) scale(${across}, ${down})`, boxShadow: shade, opacity: 1, offset: 0.4, easing: IN_OUT },
        { clipPath: `polygon(${ball})`, transform: `translate(${turn > 0 ? 70 : -70}px, ${Math.min(size, 48) * 0.6 + 120}px) rotate(${turn * 6}deg) scale(${across * 0.9}, ${down * 0.9})`, boxShadow: shade, opacity: 0 }
      ],
      { duration: ms * (inBox() ? 1.15 : 1), easing: 'linear', fill: 'forwards' }
    ).finished.then(() => sheet.remove(), () => sheet.remove())
  }
}
