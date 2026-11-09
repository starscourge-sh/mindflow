import { flushSync } from 'react-dom'
import { byKeys, still } from './motion'

/**
 * Something clicked grows into what it opens, and shrinks back into its place
 * on the way back, as a phone app's card becomes its page: a book's cover
 * into the reader, a note's tile into the note, a deck into studying, an
 * event into its side form. One view transition (the browser's own): the
 * clicked thing and what it opens are named `mf-hero`, their frame morphs from
 * one rect to the other while the words inside cross-fade at their own size
 * (main.css), and the rest of the window cross-fades softly under it.
 *
 * Only for a pointer: opened by a key, ⌘K or a link in a note's text it is
 * simply there (those never come here, and a key press last turns it off).
 * With Motion off or Reduce motion, nothing moves. It never holds input:
 * clicks go through the transition to the page already there, and a second
 * click mid-flight ends the first at once.
 */

const NAME = 'mf-hero'
/** Where a thing that opened can be found again, once its page is back: the first of these it carries. */
const KEYS = ['data-hero', 'data-book', 'data-drag-open', 'data-deck', 'data-cal-event-chip', 'data-cal-event', 'data-src']
/** The longest the old picture is held while the page opened reads in (page-swap.tsx); longer, it opens without the flight. */
const WAIT = 300

type Click = { currentTarget: EventTarget | null; metaKey?: boolean; altKey?: boolean; shiftKey?: boolean; ctrlKey?: boolean }
/** What was clicked: the element, its click, or for a picture drawn on a canvas, its rect on the screen. */
export type HeroFrom = Element | DOMRect | Click | null | undefined

/** The last thing that grew open, to shrink back into: how to find it again, and where it was. */
let opened: { key: [string, string] | null; rect: DOMRect } | null = null
let flying: ViewTransition | null = null

/** A flight is on: a page settling in by itself (home.tsx) stays put, so it does not move twice. */
export const heroing = (): boolean => flying !== null

const may = (): boolean =>
  typeof document.startViewTransition === 'function' && document.readyState === 'complete' && !still() && !byKeys() && !document.documentElement.hasAttribute('data-welcoming')

/** The page card of the pane in front: where a note, a book or a deck's study opens. */
export const paneCard = (): Element | null =>
  document.querySelector('[data-pane-front] > [data-pane-card]') ?? document.querySelector('[data-pane] > [data-pane-card]')

/** The Calendar's side form, open on an event (day-side.tsx). */
export const sideForm = (): Element | null => document.querySelector('[data-day-side="event"]')

const seen = (el: Element): boolean => {
  const at = el.getBoundingClientRect()
  return at.width > 0 && at.height > 0 && at.bottom > 0 && at.right > 0 && at.top < innerHeight && at.left < innerWidth
}

const keyOf = (el: Element): [string, string] | null => {
  for (const one of [el, ...el.querySelectorAll('[data-hero]')]) for (const name of KEYS) {
    const value = one.getAttribute(name)
    if (value) return [name, value]
  }
  const up = el.parentElement?.closest(KEYS.map((name) => `[${name}]`).join(','))
  return up ? keyOf(up) : null
}

/** A stand-in at a rect, for a thing drawn on a canvas (the covers of "Continue reading"). Gone once the flight is. */
function standIn(rect: DOMRect): HTMLElement {
  const el = document.createElement('div')
  el.setAttribute('data-hero-stand-in', '')
  Object.assign(el.style, { position: 'fixed', left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px`, borderRadius: '8px', pointerEvents: 'none', zIndex: '1' })
  document.body.append(el)
  return el
}

/** The page in `where` is on show, not the old one held while it reads (page-swap.tsx). */
const onShow = (where: Element | null): boolean => !!where && !where.querySelector('[data-page-held]')

/** Until `ready`, or `WAIT` has gone. */
function until(ready: () => boolean): Promise<void> {
  if (ready()) return Promise.resolve()
  return new Promise((done) => {
    const finish = (): void => (watch.disconnect(), clearTimeout(cap), done())
    const watch = new MutationObserver(() => ready() && finish())
    const cap = setTimeout(finish, WAIT)
    watch.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-page-held', 'data-day-side'] })
  })
}

const named = (el: Element | null, on: boolean): void => void (el instanceof HTMLElement && (el.style.viewTransitionName = on ? NAME : ''))

/** One flight: `from` named in the old picture, `run` makes the change, `to` is named in the new one. */
function fly(kind: 'open' | 'close', from: Element, run: () => void, to: () => Element | null, ready: () => boolean, after?: () => void): void {
  const root = document.documentElement
  flying?.skipTransition()
  named(from, true)
  root.dataset.hero = kind
  let target: Element | null = null
  const flight: ViewTransition = document.startViewTransition(async () => {
    named(from, false)
    flushSync(run)
    await until(ready)
    target = to()
    if (target && seen(target)) named(target, true)
    // Nowhere to grow into or shrink back to: simply there, as before.
    else flight.skipTransition()
  })
  flying = flight
  flight.ready.catch(() => {})
  void flight.finished.catch(() => {}).finally(() => {
    named(from, false)
    named(target, false)
    after?.()
    if (flying !== flight) return
    flying = null
    delete root.dataset.hero
  })
}

/**
 * Opens what `run` opens, growing it out of what was clicked into `to` (the
 * pane in front, unless said). Given the click, a ⌘-, ⌥- or ⇧-click (a new
 * tab, the side, picking) is left as it was.
 */
export function heroOpen(from: HeroFrom, run: () => void, to: () => Element | null = paneCard): void {
  const click = from && !(from instanceof Element) && !(from instanceof DOMRect) ? from : null
  const el = from instanceof Element ? from : click?.currentTarget instanceof Element ? click.currentTarget : null
  const rect = from instanceof DOMRect ? from : null
  const plain = !may() || (click && (click.metaKey || click.altKey || click.shiftKey || click.ctrlKey)) || (!rect && !(el?.isConnected && seen(el)))
  if (plain) return void ((opened = null), run())
  const stand = rect ? standIn(rect) : null
  const source = (stand ?? el)!
  opened = { key: el ? keyOf(el) : null, rect: source.getBoundingClientRect() }
  fly('open', source, run, to, () => onShow(to()), () => stand?.remove())
}

/**
 * Closes what grew open (`run` takes it away), shrinking `from` (the pane in
 * front, unless said) back into the thing it came from, found again on the
 * page that comes back; at the same place on the screen when it was a
 * canvas's. Nothing grew, or it cannot be found: closed at once.
 */
export function heroBack(run: () => void, from: () => Element | null = paneCard): void {
  const was = opened
  opened = null
  const el = from()
  if (!was || !el || !may()) return run()
  let stand: HTMLElement | null = null
  const find = (): Element | null => {
    if (!was.key) return (stand = standIn(was.rect))
    const [name, value] = was.key
    return [...document.querySelectorAll(`[${name}="${CSS.escape(value)}"]`)].find(seen) ?? null
  }
  fly('close', el, run, find, () => onShow(paneCard()), () => stand?.remove())
}
