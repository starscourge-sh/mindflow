import { flushSync } from 'react-dom'
import { byKeys, still } from './motion'

/**
 * Something clicked grows into what it opens, and shrinks back into its place
 * on the way back, as a phone app's card becomes its page: a book's cover
 * into the reader, a note's tile or row into the note, a face into its page,
 * a deck into studying, an event into its side form.
 *
 * A sheet the colour of the page it opens (`[data-hero-card]`, main.css)
 * grows from the clicked thing's rect to the page's, then melts into the
 * page. It moves by transform and opacity alone, so the compositor draws it:
 * it keeps moving while the new page is still being built (a slow page, or a
 * development build, once held the whole window still for half a second and
 * then jumped). The page is opened part way through the flight and the sheet
 * stays over it until it is on show, so the old page is never seen in its
 * place. Nothing in it is stretched: the sheet is plain, and the words are the
 * page's own, at their own size, as it melts away.
 *
 * Only for a pointer: opened by a key, ⌘K or a link in a note's text it is
 * simply there (those never come here, and a key press last turns it off).
 * With Motion off or Reduce motion, nothing moves. It never holds input: the
 * sheet takes no clicks, and a key, a click or a second open mid-flight opens
 * the page at once.
 */

/** The flight's length out and back, and its curve: on-screen movement, in and out. */
const OPEN_MS = 260
const CLOSE_MS = 220
const CURVE = 'cubic-bezier(0.4, 0, 0.2, 1)'
/** How far into the flight the page is opened: the old page stays round the sheet until it covers most of it. */
const OPEN_AT = 0.4
/** The longest the sheet waits over a page still reading in (page-swap.tsx), and for a place that comes later. */
const WAIT = 600
/** The sheet melting into the page under it. */
const MELT_MS = 140

/** Where a thing that opened can be found again, once its page is back: the first of these it carries. */
const KEYS = ['data-hero', 'data-book', 'data-drag-open', 'data-deck', 'data-deck-row', 'data-face', 'data-pile', 'data-cal-event-chip', 'data-cal-event', 'data-src']

type Click = { currentTarget: EventTarget | null; metaKey?: boolean; altKey?: boolean; shiftKey?: boolean; ctrlKey?: boolean }
/** What was clicked: the element, its click, or for a picture drawn on a canvas, its rect on the screen. */
export type HeroFrom = Element | DOMRect | Click | null | undefined

/** The last thing that grew open, to shrink back into: how to find it again, and where it was. */
let opened: { key: [string, string] | null; rect: DOMRect } | null = null
/** The flight on now: ending it opens its page at once (if not yet) and takes the sheet away. */
let flying: { end: () => void } | null = null

/** A flight is on: a page settling in by itself (home.tsx) stays put, so it does not move twice. */
export const heroing = (): boolean => flying !== null

const may = (): boolean => !still() && !byKeys() && !document.documentElement.hasAttribute('data-welcoming')

/** The page card of the pane in front: where a note, a book or a deck's study opens. */
export const paneCard = (): Element | null =>
  document.querySelector('[data-pane-front] > [data-pane-card]') ?? document.querySelector('[data-pane] > [data-pane-card]')

/** An event's form in the Calendar's right sidebar (day-side.tsx): there once it is open. */
export const sideForm = (): Element | null => document.querySelector('[data-day-side="event"]')

/**
 * A note opening beside a list (Writing's, Gems'): where it grows to (the note
 * open there now, or the whole page when none is, as the list makes room),
 * and when it is in (its own pane is there). Spread into `heroOpen`.
 */
export const besideNote = (id: string): [to: () => Element | null, ready: () => boolean] => [
  () => paneCard()?.querySelector('.note-pane[data-open]') ?? paneCard(),
  () => !!paneCard()?.querySelector(`.note-pane[data-open="${CSS.escape(id)}"]`)
]

/**
 * The click, with the thing that grows being the row or post around what was
 * clicked (a post's title, a deck row's name): the first ancestor matching
 * `around`.
 */
export const heroAround = (click: Click, around: string): Click => ({
  currentTarget: click.currentTarget instanceof Element ? (click.currentTarget.closest(around) ?? click.currentTarget) : null,
  metaKey: click.metaKey, altKey: click.altKey, shiftKey: click.shiftKey, ctrlKey: click.ctrlKey
})

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

/** The page in `where` is on show, not the old one held while it reads (page-swap.tsx). */
const onShow = (where: Element | null): boolean => !!where && seen(where) && !where.querySelector('[data-page-held]')

/** Until `ready`, or `WAIT` has gone. */
function until(ready: () => boolean): Promise<void> {
  if (ready()) return Promise.resolve()
  return new Promise((done) => {
    const finish = (): void => (watch.disconnect(), clearTimeout(cap), done())
    const watch = new MutationObserver(() => ready() && finish())
    const cap = setTimeout(finish, WAIT)
    watch.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-page-held', 'data-day-side', 'data-open'] })
  })
}

/** The sheet, laid at `at` (its full size); grown or shrunk from there by transform alone. */
function sheet(kind: 'open' | 'close', at: DOMRect, like: Element | null): HTMLElement {
  const el = document.createElement('div')
  el.setAttribute('data-hero-card', kind)
  const look = like ? getComputedStyle(like) : null
  const fill = look && look.backgroundColor !== 'rgba(0, 0, 0, 0)' ? look.backgroundColor : ''
  Object.assign(el.style, {
    left: `${at.left}px`, top: `${at.top}px`, width: `${at.width}px`, height: `${at.height}px`,
    ...(fill ? { backgroundColor: fill } : {}), ...(look ? { borderRadius: look.borderTopLeftRadius } : {})
  })
  document.body.append(el)
  return el
}

/** The transform that lays a sheet of `full` over `small`, from its top left corner. */
const over = (small: DOMRect, full: DOMRect): string =>
  `translate(${small.left - full.left}px, ${small.top - full.top}px) scale(${Math.max(small.width, 1) / full.width}, ${Math.max(small.height, 1) / full.height})`

/** Shrinking from the page into `small`: over the page from the start (the page's own colour), gone as it lands. */
const shrink = (small: DOMRect, big: DOMRect): Keyframe[] =>
  [{ transform: 'none', opacity: 1 }, { opacity: 1, offset: 0.6 }, { transform: over(small, big), opacity: 0 }]

const say = (r: DOMRect): string => `${Math.round(r.left)},${Math.round(r.top)},${Math.round(r.width)},${Math.round(r.height)}`

/**
 * One flight: the sheet at `big` (the page's rect) grows out of `small`
 * (open) or shrinks into it (close); `run` makes the change part way in, and
 * the sheet melts once `ready` says the page is on show.
 */
function fly(kind: 'open' | 'close', small: DOMRect, big: DOMRect, like: Element | null, run: () => void, ready: () => boolean, landing?: () => Element | null): void {
  flying?.end()
  const card = sheet(kind, big, like)
  card.dataset.from = say(kind === 'open' ? small : big)
  card.dataset.to = say(kind === 'open' ? big : small)
  const ms = kind === 'open' ? OPEN_MS : CLOSE_MS
  const move = card.animate(
    kind === 'open'
      ? [{ transform: over(small, big), opacity: 0 }, { opacity: 1, offset: 0.25 }, { transform: 'none', opacity: 1 }]
      : shrink(small, big),
    { duration: ms, easing: CURVE, fill: 'both' }
  )
  document.documentElement.dataset.hero = kind
  let ran = false
  let done = false
  const go = (): void => {
    if (ran) return
    ran = true
    flushSync(run)
    // Shrinking back: the thing it lands on, where it really is now, followed every frame until it lands (the page
    // coming back reads in, lays out and scrolls back to where it was).
    // The sheet waits over the page until the thing has stayed put for three frames (or `WAIT`), then shrinks.
    let last = ''
    let steady = 0
    const since = performance.now()
    const follow = (): void => {
      if (done || !landing) return
      const now = landing()
      if (now && seen(now)) {
        const to = now.getBoundingClientRect()
        if (say(to) !== last) (last = card.dataset.to = say(to)), (steady = 0), (move.effect as KeyframeEffect).setKeyframes(shrink(to, big))
        else steady++
      }
      if (move.playState === 'paused' && (steady >= 3 || performance.now() - since > WAIT)) move.play()
      requestAnimationFrame(follow)
    }
    follow()
  }
  // Opened once the sheet is moving (the compositor has it by then), so a slow page never holds it still; read
  // from the flight's own clock, not a timer, so the page and the sheet keep in step.
  // Shrinking back, the sheet is held over the page while the page comes back, and the page goes after a frame.
  if (kind === 'close' && landing) move.pause()
  const from = kind === 'open' ? ms * OPEN_AT : 0
  let at = 0
  let frames = 0
  const watch = (): void => void (done || ran || ((kind === 'close' ? ++frames > 1 : Number(move.currentTime ?? 0) > from) ? go() : (at = requestAnimationFrame(watch))))
  at = requestAnimationFrame(watch)
  const end = (): void => {
    if (done) return
    done = true
    cancelAnimationFrame(at)
    removeEventListener('keydown', end, true)
    removeEventListener('pointerdown', end, true)
    go()
    move.cancel()
    card.remove()
    if (flying === self) flying = null
    if (!flying) delete document.documentElement.dataset.hero
  }
  const self = { end }
  flying = self
  // A key or a click mid-flight: the page is there for it at once.
  addEventListener('keydown', end, true)
  addEventListener('pointerdown', end, true)
  void move.finished.then(async () => {
    if (done) return
    if (kind === 'close') return end()
    await until(ready)
    if (done) return
    // The page is on show under it: the sheet melts into it.
    const melt = card.animate([{ opacity: 1 }, { opacity: 0 }], { duration: MELT_MS, easing: 'ease-out', fill: 'forwards' })
    void melt.finished.then(end, end)
  }, () => {})
}

/**
 * Opens what `run` opens, growing it out of what was clicked into `to` (the
 * pane in front, unless said). Given the click, a ⌘-, ⌥- or ⇧-click (a new
 * tab, the side, picking) is left as it was. Where `to` comes only once the
 * page is open (a note beside a list for the first time), the page opens
 * first and the sheet grows into it as it appears.
 */
export function heroOpen(from: HeroFrom, run: () => void, to: () => Element | null = paneCard, ready = (): boolean => onShow(to())): void {
  const click = from && !(from instanceof Element) && !(from instanceof DOMRect) ? from : null
  const el = from instanceof Element ? from : click?.currentTarget instanceof Element ? click.currentTarget : null
  const rect = from instanceof DOMRect ? from : null
  const plain = !may() || (click && (click.metaKey || click.altKey || click.shiftKey || click.ctrlKey)) || (!rect && !(el?.isConnected && seen(el)))
  if (plain) return void ((opened = null), flying?.end(), run())
  const small = rect ?? el!.getBoundingClientRect()
  opened = { key: el ? keyOf(el) : null, rect: small }
  const there = to()
  if (there && seen(there)) return fly('open', small, there.getBoundingClientRect(), there, run, ready)
  // Not there yet: opened now, and grown into once it is (or simply there, if it never comes).
  flying?.end()
  // Already a flight, so what opens does not slide in on its own as well (day-side.tsx).
  const wait = { end: (): void => void (flying === wait && (flying = null)) }
  flying = wait
  flushSync(run)
  void until(ready).then(() => {
    if (flying !== wait) return
    flying = null
    const now = to()
    if (now && seen(now) && may()) fly('open', small, now.getBoundingClientRect(), now, () => {}, () => true)
  })
}

/**
 * Closes what grew open (`run` takes it away), shrinking `from` (the pane in
 * front, unless said) back into the thing it came from: where it was when it
 * was clicked, or where it is on the page that comes back when that is
 * already known. Nothing grew: closed at once.
 */
export function heroBack(run: () => void, from: () => Element | null = paneCard): void {
  const was = opened
  opened = null
  const el = from()
  if (!was || !el || !seen(el) || !may()) return void (flying?.end(), run())
  const find = (): Element | null => {
    if (!was.key) return null
    const [name, value] = was.key
    // On the page come back first: the sidebar's Recent rows carry the same mark.
    const all = [...document.querySelectorAll(`[${name}="${CSS.escape(value)}"]`)].filter(seen)
    return all.find((one) => paneCard()?.contains(one)) ?? all[0] ?? null
  }
  fly('close', was.rect, el.getBoundingClientRect(), el, run, () => true, was.key ? find : undefined)
}
