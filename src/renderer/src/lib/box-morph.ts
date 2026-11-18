import { flushSync } from 'react-dom'
import { cubicBezier } from 'motion/react'
import { EASE, still } from './motion'

/**
 * ⌘\ in quick capture: the one-line pill (or the box alone) becoming the box with its side panel, and back, as one
 * move. Main puts the card at its new place inside the window it already has (main's `within`), so nothing on screen
 * moves on main's clock, and the page draws the whole change on its own frames, one curve for every part of it:
 * - the card's shape (its fill, hairline, shadow and corners, drawn by a stand-in under the card for the move) from
 *   the old shape to the new, and what is in the card cut to that shape;
 * - the writing riding the card's left edge; the box's parts laid out at their own widths from the first frame, so
 *   no row of the panel re-wraps or lands out of line;
 * - the round controls from their place and size by the pill to theirs above the box, and back (FLIP);
 * - the old shape's own parts leaving first and fast, the new one's arriving once the shape is most of the way there.
 * The frost is drawn by main a frame or two behind the page (lib/glass.ts), so it is off for the move, every surface
 * opaque as with Reduce Transparency (data-morph, main.css), and back under the card once it has landed.
 * Motion off or Reduce motion: the new shape at once, no frame between.
 */
export type BoxRoom = { left: number; top: number; right: number; bottom: number; width: number; height: number }
type Rect = { left: number; top: number; width: number; height: number }
type Look = Rect & { radius: number }

const MS = 240
const curve = cubicBezier(...EASE)
/** The parts only the pill has; the box's own rows round the writing; the side panel and its handle. */
const BAR = '[data-pill-ends]'
const CHROME = '.app-container [data-chrome]'
const PANEL = '.app-container [data-slot=resizable-handle], .app-container [data-slot=resizable-panel] ~ [data-slot=resizable-panel]'
const PARTS = `${BAR}, ${CHROME}, ${PANEL}`
/** What is cut to the card's shape while it moves: what is drawn in the card (its round controls stand outside it; the pill's ends ride the shape's own ends). */
const CUT = '.app-container > [data-slot=resizable-panel-group]'

/** The round controls as drawn: beside the pill, or in a row above the box. */
export const roundControls = (): HTMLElement[] =>
  [...document.querySelectorAll<HTMLElement>('.mf-top [data-aside] > *, .mf-top .mf-pill button')].filter((one) => one.offsetWidth > 0)

/** The room round the card, as the page lays the card out from it (main.css, #root's padding). */
export function applyRoom(room: { left: number; top: number; right: number; bottom: number }): void {
  const style = document.documentElement.style
  style.setProperty('--mf-room-top', `${room.top}px`)
  style.setProperty('--mf-room', `${room.bottom}px`)
  style.setProperty('--mf-room-left', `${room.left}px`)
  style.setProperty('--mf-room-right', `${room.right}px`)
}

const rectOf = (el: Element): Rect => {
  const r = el.getBoundingClientRect()
  return { left: r.left, top: r.top, width: r.width, height: r.height }
}
const mix = (a: number, b: number, k: number): number => a + (b - a) * k
const mixRect = (a: Rect, b: Rect, k: number): Rect => ({ left: mix(a.left, b.left, k), top: mix(a.top, b.top, k), width: mix(a.width, b.width, k), height: mix(a.height, b.height, k) })
/** The curve run over part of the move only, `from` to `to` of it. */
const part = (t: number, from: number, to: number): number => curve(Math.min(1, Math.max(0, (t - from) / (to - from))))
const all = (selector: string): HTMLElement[] => [...document.querySelectorAll<HTMLElement>(selector)]
const card = (): HTMLElement | null => document.querySelector('.app-container')
const writing = (): HTMLElement | null => document.querySelector('.app-container > [data-slot=resizable-panel-group] > [data-slot=resizable-panel]')
const radiusOf = (el: Element): number => parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0
/** A part faded by the move: its own opacity (React's) is left alone, the move's laid over it (main.css, data-morph-o). */
const fade = (el: HTMLElement, opacity: number): void => {
  el.setAttribute('data-morph-o', '')
  el.style.setProperty('--mf-morph-o', String(opacity))
}
const faded = (el: HTMLElement): number => (el.hasAttribute('data-morph-o') ? Number(el.style.getPropertyValue('--mf-morph-o')) : Number(getComputedStyle(el).opacity))

/** Each shape's corners and where its round controls stand against its top right, kept from the last time it was drawn at rest. */
const kept: { pill?: { radius: number; controls: Rect[] }; box?: { radius: number; controls: Rect[] } } = {}
const keep = (el: HTMLElement, look: Rect, controls: Rect[]): void => {
  const right = look.left + look.width
  kept[el.hasAttribute('data-pill') ? 'pill' : 'box'] = { radius: radiusOf(el), controls: controls.map((one) => ({ ...one, left: one.left - right, top: one.top - look.top })) }
}

let run = 0
let stand: HTMLDivElement | null = null
/** The shape drawn this frame while a move is under way: a press that turns the move round picks up from here. */
let shown: Look | null = null

/** Every inline style a move set, taken off: each part is where and as its own layout and state put it. */
function clear(): void {
  for (const el of all(CUT)) el.style.clipPath = ''
  for (const el of all(BAR)) Object.assign(el.style, { left: '', width: '', right: '' })
  for (const el of all('[data-morph-o]')) (el.removeAttribute('data-morph-o'), el.style.removeProperty('--mf-morph-o'))
  const words = writing()
  if (words) words.style.translate = ''
  for (const el of roundControls()) (el.style.translate = ''), (el.style.scale = ''), (el.style.transformOrigin = '')
}

/** A frame drawn and handed on: what it changed is on its way to the screen before main is told anything. */
const drawn = (): Promise<void> => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(() => done())))

/**
 * The move over: the stand-in gone and the card's own look back, still opaque; the frost asked back under the new
 * shapes (lib/glass.ts), and only once that has been drawn does the card clear to its glass (main.css), so no frame
 * shows the desktop sharp through it, nor frost where it no longer is.
 */
async function rest(mine: number, seen: boolean): Promise<void> {
  const root = document.documentElement
  shown = null
  stand?.remove()
  root.removeAttribute('data-morph-shape')
  root.removeAttribute('data-frost-off')
  if (seen) await drawn()
  if (mine === run) root.removeAttribute('data-morph')
}

/**
 * The panel shown (`open`) or shut, as one move. `ask` tells main and gives back the room round the card's new place.
 * `begin` changes the page's state as the move starts (growing, the box is laid out; shrinking, only the panel's wish
 * changes and the box stays laid out), `end` as it lands (the panel no longer drawn: the pill again, or the box
 * alone). `toPill`: shrinking, whether it lands as the one-line pill. Resolves false when a newer press took over.
 */
export async function morphBox(open: boolean, toPill: boolean, ask: (open: boolean) => Promise<BoxRoom | null>, begin: () => void, end: () => void): Promise<boolean> {
  const mine = ++run
  const root = document.documentElement
  const el = card()
  // Seen: the frost's change is ordered. Moving: drawn as a move (Motion off or Reduce motion: at once, no frame between).
  const seen = !!el && !!window.api.room.left && !document.hidden
  const moving = seen && !still()
  if (seen && !shown) {
    // Every surface opaque first, and drawn so, and only then the frost taken away and main told (in that order: main
    // hears the page's messages in turn): the frost changes only under a card that hides it.
    root.setAttribute('data-morph', '')
    await drawn()
    if (mine !== run) return false
    root.setAttribute('data-frost-off', '')
  }
  const room = await ask(open)
  if (mine !== run) return false
  if (!room || !el || !moving) {
    flushSync(() => {
      if (room) applyRoom(room)
      begin()
      end()
    })
    clear()
    await rest(mine, seen)
    return mine === run
  }
  // The window grown for it (the box carried near a screen's edge since it opened): laid out once the page has that size.
  // The size main says the window has now, so the resize waited for is one that is coming (main/index.ts within).
  if (Math.abs(room.width - innerWidth) > 1 || Math.abs(room.height - innerHeight) > 1) await new Promise((done) => addEventListener('resize', done, { once: true }))
  if (mine !== run) return false
  // Where everything is drawn now: at rest, or mid-move if this press turned a move round.
  const from: Look = shown ?? { ...rectOf(el), radius: radiusOf(el) }
  const fromWords = writing() && rectOf(writing()!)
  const fromControls = roundControls().map(rectOf)
  // How much of each part is drawn now: nothing of what is not laid out (the box's rows in the pill).
  const fromParts = new Map(all(PARTS).map((one) => [one, one.getClientRects().length ? faded(one) : 0]))
  if (!shown) keep(el, from, fromControls)
  clear()
  // Growing, the box is laid out now, at its place and its widths: the panel's rows are set once. Shrinking, it stays
  // laid out as it is until the shape has landed.
  flushSync(() => {
    if (open) applyRoom(room)
    begin()
  })
  const target: Rect = { left: room.left, top: room.top, width: room.width - room.left - room.right, height: room.height - room.top - room.bottom }
  const layout = rectOf(el)
  const landing = open ? null : kept[toPill ? 'pill' : 'box']
  const toRadius = open ? radiusOf(el) : landing?.radius ?? from.radius
  const words = writing()
  const wordsAt = words && rectOf(words)
  // The writing keeps its place in the card: shrinking, it goes where the card's new corner takes it.
  const wordsTo = wordsAt && (open ? wordsAt : { ...wordsAt, left: wordsAt.left + target.left - layout.left, top: wordsAt.top + target.top - layout.top })
  const controls = roundControls()
  const controlsAt = controls.map(rectOf)
  if (open) keep(el, target, controlsAt)
  // Grown, each control ends where the box lays it out; shrinking, where the pill (or the box alone) keeps it.
  const controlsTo = open ? controlsAt : landing?.controls.length === controls.length ? landing.controls.map((one) => ({ ...one, left: target.left + target.width + one.left, top: target.top + one.top })) : null
  const cut = all(CUT).map((one) => ({ el: one, at: rectOf(one) }))
  // Each part from what is drawn of it now to what the new shape has: the pill's ends never in the box; the panel only
  // in it; the rows round the writing in any box, never in the pill.
  const parts = all(PARTS).map((one) => ({ el: one, from: fromParts.get(one) ?? 0, to: one.matches(BAR) ? (open || !toPill ? 0 : 1) : one.matches(PANEL) ? (open ? 1 : 0) : open || !toPill ? 1 : 0 }))
  // The pill's two ends (its kind and ⌘↵) ride the shape's own ends, wherever the card is laid out.
  const ends = all(BAR)
  stand ??= Object.assign(document.createElement('div'), { className: 'mf-morph-shape' })
  // Under the card (first in the page), and the card's own look handed to it in the same frame (main.css).
  if (!stand.isConnected) document.body.prepend(stand)
  root.setAttribute('data-morph-shape', '')

  const frame = (t: number): void => {
    const k = curve(t)
    const look: Look = { ...mixRect(from, target, k), radius: mix(from.radius, toRadius, k) }
    shown = look
    Object.assign(stand!.style, { left: `${look.left}px`, top: `${look.top}px`, width: `${look.width}px`, height: `${look.height}px`, borderRadius: `${look.radius}px` })
    for (const { el: one, at } of cut) {
      one.style.clipPath = `inset(${look.top - at.top}px ${at.left + at.width - look.left - look.width}px ${at.top + at.height - look.top - look.height}px ${look.left - at.left}px round ${look.radius}px)`
    }
    if (words && fromWords && wordsAt && wordsTo) words.style.translate = `${mix(fromWords.left, wordsTo.left, k) - wordsAt.left}px ${mix(fromWords.top, wordsTo.top, k) - wordsAt.top}px`
    controls.forEach((one, i) => {
      const at = controlsAt[i]
      const to = controlsTo?.[i]
      if (!at?.width || !at.height) return
      // Nowhere kept to go (the box opened grown, never yet the pill): it fades, and is simply there as it lands.
      if (!to || !fromControls[i]) return fade(one, 1 - part(t, 0, 0.35))
      // Around the card's corner, never across it: its edge sweeps under the straight way between beside the pill and
      // above the box (the user's frames: "2 pinned" on the card's corner). Growing, they rise above its top edge (and
      // take the box's size) first; shrinking, they come down beside the pill last, once its edge has passed. Each
      // still goes one way, along the card's curve.
      const a = fromControls[i]
      const up = open ? part(t, 0, 0.15) : part(t, 0.65, 1)
      const now = { left: mix(a.left, to.left, k), top: mix(a.top, to.top, up), width: mix(a.width, to.width, up), height: mix(a.height, to.height, up) }
      one.style.transformOrigin = '0 0'
      one.style.translate = `${now.left - at.left}px ${now.top - at.top}px`
      one.style.scale = `${now.width / at.width} ${now.height / at.height}`
    })
    for (const one of ends) Object.assign(one.style, { left: `${look.left - layout.left}px`, width: `${look.width}px`, right: 'auto' })
    // The old shape's parts go in the first third; the new one's come once the shape is most of the way there.
    for (const one of parts) fade(one.el, one.to ? mix(one.from, 1, part(t, 0.35, 0.85)) : one.from * (1 - part(t, 0, 0.33)))
  }

  // Drawn at the start shape before anything else is: the stand-in never shows unplaced.
  frame(0)
  return new Promise((resolve) => {
    // The clock starts once the frame that lays out the new box has been drawn: its first paint (the panel and its
    // lists) can take a long frame, and a clock started before it spent most of the move unseen, then jumped.
    let start = 0
    const step = (now: number): void => {
      if (mine !== run) return resolve(false)
      start ||= now
      const t = Math.min(1, (now - start) / MS)
      frame(t)
      if (t < 1) return void requestAnimationFrame(step)
      // Landed: shrinking, the page becomes the pill (or the box alone) at the shape it has reached, in this frame.
      flushSync(() => {
        if (!open) applyRoom(room)
        end()
      })
      clear()
      void rest(mine, true).then(() => resolve(mine === run))
    }
    requestAnimationFrame(() => requestAnimationFrame(step))
  })
}
