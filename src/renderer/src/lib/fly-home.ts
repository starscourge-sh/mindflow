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
import { keepRoom } from './room'
import { EASING } from '@/lib/motion'
import { warmLater } from './warm'

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
  // A list's row: its room stays open under the card and closes as the square flies (lib/room.ts).
  liftFrom(document.querySelector<HTMLElement>(`[data-id="${CSS.escape(id)}"]`), home, true)

/** How big the square is that a card becomes before it flies, and how long it flies. */
const SQUARE = 26
const SQUARE_MS = 180

/** The same, from any element: a whole note sent off to the Inbox. */
export function liftFrom(from: HTMLElement | null, home: Home, row = false): (() => void) | undefined {
  // `row`: it is a row of a list, and the rows after it close up as it goes. By a key, or with nothing to show, at once.
  const room = row ? keepRoom(from) : undefined
  // By a key, nothing flies: the place it went only nods as it lands.
  if (from && byKeys() && !still()) return (room?.close(), () => landing(home)?.nod())
  // A picture of it as it is now, inside a plain card: the real one is about
  // to change or go. The card is what flies; the picture only fades.
  const shot = snapshot(from)
  if (!shot) return (room?.close(), undefined)
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
    if (!to) return void room?.close()
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
        // The square lifts off: the room it left closes with its flight, in one breath.
        room?.close(SQUARE_MS)
        // A slight arc: it lifts on its way rather than sliding in a straight line.
        return card.animate(
          [
            { transform: 'translate(0, 0) scale(1)', opacity: 1 },
            { transform: `translate(${dx * 0.5}px, ${dy * 0.5 - 18}px) scale(1.04)`, opacity: 1, offset: 0.5 },
            { transform: `translate(${dx}px, ${dy}px) scale(${scale})`, opacity: 0.4 }
          ],
          { duration: SQUARE_MS, easing: IN_OUT, fill: 'forwards' }
        ).finished
      })
      .then(() => {
        card.remove()
        to.nod()
      })
      .catch(() => (room?.close(), card.remove()))
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
export const binFlight = (id: string): (() => void) | undefined => binFlightFrom(rowOf(id))
// The one on screen: the same id can also be on a row out of sight (a fold shut, a list behind).
const rowOf = (id: string): HTMLElement | null => [...document.querySelectorAll<HTMLElement>(`[data-id="${CSS.escape(id)}"]`)].find((one) => seen(one)) ?? null
/** A row that leaves with no paper of its own (the fifth of a pick and on): its room closes in the same move as the rest (lib/room.ts). */
export const leaveRoom = (id: string): void => void keepRoom(rowOf(id))?.close()

/** How long the paper crumples before it flies, and the flight: slow enough to see a sheet balled up and tossed. */
const CRUMPLE_MS = 650
const FLIGHT_MS = 450

/** `binFlight` for a card found another way: a practice's row, the hint card. */
export function binFlightFrom(from: HTMLElement | null, to: () => Landing | null = () => landing('bin'), crumpleMs = CRUMPLE_MS, row = true): Flight | undefined {
  // The room it leaves in its list stays open under the paper, and closes as the ball lifts off (lib/room.ts).
  // `row` off: not a list's row (a picture in a note, a draft), and nothing closes up after it.
  const room = row ? keepRoom(from) : undefined
  // By a key, it simply goes: binning is done many times a day. Motion off or Reduce motion, nothing travels.
  // The rows after it still close up on the short clock, where things move at all.
  if (!from || byKeys() || still()) return (room?.close(), undefined)
  // The menu it was binned from goes at once, so the row is seen whole and its picture is the row alone.
  // (Each of a pick's rows waits for that frame too: the menu may lie over any of them.)
  const menus = document.querySelectorAll<HTMLElement>('[role="menu"]')
  for (const menu of menus) menu.style.visibility = 'hidden'
  // Only what is on screen of it, so nothing crumples from behind the list's edge.
  const shot = snapshot(from)
  if (!shot || !onTop(from, shot.box)) return (room?.close(), undefined)
  const { box } = shot
  // In this frame: a copy of the row laid where it was, the row itself held out of sight under it, so the
  // place never shows empty; the paper takes the copy's place once drawn.
  const cover = document.createElement('div')
  cover.setAttribute('data-crumple', '')
  Object.assign(cover.style, { position: 'fixed', left: `${box.left}px`, top: `${box.top}px`, width: `${box.width}px`, height: `${box.height}px`, zIndex: '60', pointerEvents: 'none', overflow: 'hidden' })
  cover.append(shot.picture)
  document.body.append(cover)
  // Held out of sight until the paper has landed (`land`'s end) or the move is dropped, however long the crumple runs.
  const hidden = from.animate({ visibility: ['hidden', 'hidden'] }, { duration: 60000 })
  // Gone at once once the paper is drawn; faded where it was when the paper is busy with another row.
  const lay = (fade = false): void =>
    void (fade ? cover.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 200, easing: 'ease-out', fill: 'forwards' }).finished.then(() => cover.remove(), () => cover.remove()) : cover.remove())
  // Its picture: taken now, or once the frame without its menu is on screen (the window gives back what it last
  // showed: taken sooner, or as the menu opened, the paper wore the menu's words). Three.js and the fold paths were
  // made ready while the app was idle (`warmBin`).
  const picture = (): Promise<Uint8Array | null> => window.api.pictureOfRect({ x: box.left, y: box.top, width: box.width, height: box.height })
  // The sound of it: paper crumpling, as long as the hands work at it (the Bin's tear stays quiet).
  crumple(crumpleMs / 1000)
  const sheet = Promise.all([menus.length ? painted().then(picture) : picture(), import('@/components/paper-crumple-flight')])
    .then(([png, { sheetOver }]) => (png ? sheetOver(box, png, lay, crumpleMs, FLIGHT_MS) : (lay(), hidden.cancel(), null)), () => (lay(), hidden.cancel(), null))
  // `after`: once the paper has landed (or faded), for what should wait for it.
  const land = (after?: () => void): void => {
    const done = (): void => (room?.close(), after?.(), hidden.cancel())
    // Where it lands is asked the moment the ball lifts off: the room closes with the flight, not after it.
    void sheet.then((one) => (one ? one.go(() => (room?.close(FLIGHT_MS), to()), done) : done()))
  }
  return Object.assign(land, { drop: (): void => void (room?.drop(), sheet.then((one) => (one?.drop(), lay(), hidden.cancel()))) })
}

/** A picture taken out of a note: React Bits' paper crumples where it was, then fades (it is not binned: it stays in Files). */
export const crumpleAway = (from: HTMLElement | null, crumpleMs = CRUMPLE_MS): Flight | undefined => binFlightFrom(from, () => null, crumpleMs, false)

/** Once what was changed on screen has been drawn: two frames on, as note-picture.ts and reader-card.tsx wait; a hidden window draws none. */
const painted = (): Promise<void> => new Promise((done) => (document.hidden ? done() : requestAnimationFrame(() => requestAnimationFrame(() => done()))))

/** A move to the Bin, shown: call it once the move is made, or `drop` it when the move did not happen. */
export type Flight = ((after?: () => void) => void) & { drop: () => void }

/** Once the app is idle (never while the welcome plays: lib/warm.ts): three.js loaded and the paper's folds worked out, so the first move to the Bin is as quick as the rest. */
export function warmBin(): void {
  if (still()) return
  warmLater(() => void import('@/components/paper-crumple-flight').then((paper) => paper.warmPaper(), () => undefined), { timeout: 8000 })
}
