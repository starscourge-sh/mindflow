import { flushSync } from 'react-dom'
import { byKeys, still } from './motion'

/**
 * Something clicked grows into what it opens, and shrinks back into its place
 * on the way back, as a phone app's card becomes its page: a book's cover
 * into the reader, a note's tile or row into the note, a face into its page,
 * a deck into studying, an event into its side form.
 *
 * It is the browser's view transition: a picture of the window as it was is
 * held, the page is opened under it, and once the new page is on show, the
 * real pictures of both move, the clicked thing growing into the new page
 * (or the page shrinking into the thing it came from) while the rest of the
 * window crossfades. Real pictures, in the theme worn: never a blank sheet,
 * and never the old page after the new one. The flight moves by transform and
 * opacity alone on the compositor, so it keeps every frame while the page
 * under it is still busy; and nothing on the page itself is moved or scaled,
 * so a page measuring itself as it opens (the PDF reader's fit) sees its real
 * size.
 *
 * Only for a pointer on a thing: opened by a key, ⌘K or a link in a note's
 * text it is simply there, and Back by a key, a swipe, a mouse's side button
 * or a history menu simply steps (those never come here, and a key press last
 * turns it off). With Motion off or Reduce motion, nothing moves. A page that
 * is not on show within `WAIT` opens with no flight. A key or a click
 * mid-flight ends it at once.
 */

/** The flight's length out and back, and its curve: strong out, so it answers at once and settles softly. */
const OPEN_MS = 260
const CLOSE_MS = 220
const CURVE = 'cubic-bezier(0.32, 0.72, 0, 1)'
/** The longest the window's picture is held while the new page reads in: past it, the page simply opens. */
const WAIT = 450
/** The flight's name in the view transition (main.css). */
const NAME = 'mf-hero'

/** Where a thing that opened can be found again, once its page is back: the first of these it carries. */
const KEYS = ['data-hero', 'data-book', 'data-drag-open', 'data-deck', 'data-deck-row', 'data-face', 'data-pile', 'data-cal-event-chip', 'data-cal-event', 'data-src']

type Click = { currentTarget: EventTarget | null; metaKey?: boolean; altKey?: boolean; shiftKey?: boolean; ctrlKey?: boolean }
/** What was clicked: the element, its click, or for a picture drawn on a canvas, its rect on the screen. */
export type HeroFrom = Element | DOMRect | Click | null | undefined

/** One flight, for the probe (qa/hero-open.mjs): its kind, rects, length, how long after the press it moved, and whether the page was on show. */
export type HeroFlight = { kind: 'open' | 'close'; from: Box; to: Box | null; ms: number; ease: string; moved?: number; /** The moment it moved (performance.now()). */ at?: number; /** When, after the press, the picture was taken, the page opened and was on show. */ steps?: number[]; shown?: boolean; skipped?: string }
type Box = { x: number; y: number; w: number; h: number }
const box = (r: DOMRect): Box => ({ x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) })
const flights = ((window as { __heroFlights?: HeroFlight[] }).__heroFlights ??= [])

/** The last thing that grew open, to shrink back into: how to find it again, and where it was. */
let opened: { key: [string, string] | null; rect: DOMRect } | null = null
/** The flight on now (its view transition): skipped, the page is simply there. */
let flying: { skip: () => void } | null = null

/** A flight is on: a page settling in by itself (home.tsx, day-side.tsx) stays put, so it does not move twice. */
export const heroing = (): boolean => flying !== null

const may = (): boolean => !still() && !byKeys() && !document.documentElement.hasAttribute('data-welcoming') && typeof document.startViewTransition === 'function'

/** The page card of the pane in front: where a note, a book or a deck's study opens. */
export const paneCard = (): Element | null =>
  document.querySelector('[data-pane-front] > [data-pane-card]') ?? document.querySelector('[data-pane] > [data-pane-card]')

/** What opened: the note itself when it sits beside a list (Writing, Gems), else the whole page. A flight that grew
 * the whole page and then turned out to be a list and a note said a page arrived when only the note did (10 Nov). */
export const opensTo = (): Element | null => {
  const card = paneCard()
  // Only a note on show beside a list: a page that holds a note out of sight (a source's, the Feed's) is the page.
  const note = card && [...card.querySelectorAll('.note-pane[data-open]')].find((one) => one.checkVisibility() && one.getBoundingClientRect().width < card.getBoundingClientRect().width - 40)
  return note ?? card
}

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

/**
 * The page in `where` is on show, not the old one held while it reads
 * (page-swap.tsx). The page just left stays a moment unseen (display none, let
 * go a frame later): that one does not count.
 */
const onShow = (where: Element | null): boolean => !!where && seen(where) && ![...where.querySelectorAll('[data-page-held]')].some((held) => held.checkVisibility())

/**
 * Until `ready`, or `ms` has gone. Read on page changes and on a timer, never a
 * frame: while a view transition takes its picture the window draws no frames.
 */
function until(ready: () => boolean, ms: number): Promise<boolean> {
  if (ready()) return Promise.resolve(true)
  return new Promise((done) => {
    const finish = (): void => (watch.disconnect(), clearInterval(poll), clearTimeout(cap), done(ready()))
    const check = (): void => void (ready() && finish())
    const watch = new MutationObserver(check)
    const poll = setInterval(check, 16)
    const cap = setTimeout(finish, ms)
    watch.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-page-held', 'data-day-side', 'data-open'] })
  })
}

/** `el`'s rect once it has stayed put for three reads 16ms apart (a page coming back scrolls back to where it was), or `ms` has gone. */
async function steady(el: Element, ms: number): Promise<DOMRect> {
  const since = performance.now()
  let last = el.getBoundingClientRect()
  let same = 0
  while (same < 3 && performance.now() - since < ms) {
    await new Promise((done) => setTimeout(done, 16))
    const now = el.getBoundingClientRect()
    same = now.x === last.x && now.y === last.y && now.width === last.width && now.height === last.height ? same + 1 : 0
    last = now
  }
  return last
}

/** Names an element in the flight's pictures; the returned function takes the names it gave away again (its own only). */
const namer = (): [name: (el: Element | null) => void, unname: () => void] => {
  const named = new Set<HTMLElement | SVGElement>()
  return [
    (el) => void ((el instanceof HTMLElement || el instanceof SVGElement) && ((el.style.viewTransitionName = NAME), named.add(el))),
    () => (named.forEach((el) => (el.style.viewTransitionName = '')), named.clear())
  ]
}

/** The group's transform that lays a picture `base` wide at `at`, scaled alike both ways (nothing stretched), from its top left corner. */
const lay = (at: DOMRect, base: number): string => `translate(${at.left}px, ${at.top}px) scale(${Math.max(at.width, 1) / Math.max(base, 1)})`

/**
 * One flight. `old` is named in the window's picture as it is now (the thing
 * clicked, or the page going back); `run` makes the change; once `ready`
 * says the new page is on show, `next()` is the element named in the new
 * picture (the page, or the thing it lands on). The group moves from `small`
 * to the page (open) or from the page to the thing (close) by transform alone.
 */
function fly(kind: 'open' | 'close', old: Element | null, small: DOMRect, run: () => void, next: () => Element | null, ready: () => boolean): void {
  flying?.skip()
  const root = document.documentElement
  const ms = kind === 'open' ? OPEN_MS : CLOSE_MS
  const pressed = performance.now()
  const flight: HeroFlight = { kind, from: box(kind === 'open' ? small : (old?.getBoundingClientRect() ?? small)), to: null, ms, ease: CURVE }
  flights.push(flight)
  if (flights.length > 50) flights.shift()
  const bigOld = old?.getBoundingClientRect() ?? null
  const [name, unname] = namer()
  // Opening, the thing clicked stays in the window's old picture and fades with it: named, its own picture would be
  // drawn as wide as the page and stand over it, a big light block in a dark theme (a book's paper cover).
  if (kind === 'close') name(old)
  root.dataset.hero = kind
  let skip = ''
  let to: Element | null = null
  let toRect: DOMRect | null = null
  const style = document.createElement('style')
  const turn = document.startViewTransition(async () => {
    const t = (): number => Math.round(performance.now() - pressed)
    flight.steps = [t()]
    unname()
    flushSync(run)
    flight.steps.push(t())
    const shown = await until(ready, WAIT)
    flight.steps.push(t())
    if (!shown) return void (skip = 'the page was not on show in time')
    to = next()
    if (to && seen(to)) {
      toRect = kind === 'close' ? await steady(to, 300) : to.getBoundingClientRect()
      name(to)
    } else if (kind === 'open') return void (skip = 'nothing to grow into')
    // The group is the size of the new picture when there is one, else the old. Its move is written as a CSS
    // animation before the new picture is taken, so it starts with the crossfades in the same frame, on the
    // compositor: started from script once the transition is ready, a busy first frame showed the page whole first.
    const base = (toRect ?? bigOld ?? small).width
    const page = kind === 'open' ? toRect! : bigOld!
    const thing = kind === 'open' ? small : (toRect ?? small)
    flight.to = box(kind === 'open' ? page : thing)
    const [a, b] = kind === 'open' ? [lay(thing, base), lay(page, base)] : [lay(page, base), lay(thing, base)]
    style.textContent = `@keyframes mf-hero-fly { from { transform: ${a}; } to { transform: ${b}; } }
:root[data-hero]::view-transition-group(${NAME}) { animation: mf-hero-fly ${ms}ms ${CURVE} both; }`
    document.head.append(style)
  })
  const self = { skip: (): void => turn.skipTransition() }
  flying = self
  const end = (): void => {
    removeEventListener('keydown', self.skip, true)
    removeEventListener('pointerdown', self.skip, true)
    unname()
    style.remove()
    if (flying !== self) return
    flying = null
    delete root.dataset.hero
  }
  // A key or a click mid-flight: the page is there for it at once.
  addEventListener('keydown', self.skip, true)
  addEventListener('pointerdown', self.skip, true)
  void turn.finished.then(end, end)
  void turn.ready.then(() => {
    if (skip) return void ((flight.skipped = skip), turn.skipTransition())
    flight.moved = Math.round(performance.now() - pressed)
    flight.at = performance.now()
    flight.shown = onShow(paneCard()) || kind === 'close'
  }, () => void (flight.skipped ||= skip || 'skipped'))
}

/**
 * Opens what `run` opens, growing it out of what was clicked into `to` (the
 * pane in front, unless said). Given the click, a ⌘-, ⌥- or ⇧-click (a new
 * tab, the side, picking) is left as it was.
 */
export function heroOpen(from: HeroFrom, run: () => void, to: () => Element | null = opensTo, ready = (): boolean => onShow(to())): void {
  const click = from && !(from instanceof Element) && !(from instanceof DOMRect) ? from : null
  const el = from instanceof Element ? from : click?.currentTarget instanceof Element ? click.currentTarget : null
  const rect = from instanceof DOMRect ? from : null
  const plain = !may() || (click && (click.metaKey || click.altKey || click.shiftKey || click.ctrlKey)) || (!rect && !(el?.isConnected && seen(el)))
  if (plain) return void ((opened = null), flying?.skip(), run())
  const small = rect ?? el!.getBoundingClientRect()
  opened = { key: el ? keyOf(el) : null, rect: small }
  fly('open', rect ? null : el, small, run, to, ready)
}

/**
 * Closes what grew open (`run` takes it away), shrinking `from` (the pane in
 * front, unless said) back into the thing it came from, where it is on the
 * page that comes back (or where it was when it was clicked). Nothing grew:
 * closed at once. Only for a click on Back or a close button: a key, a swipe
 * or a menu steps back with no flight.
 */
export function heroBack(run: () => void, from: () => Element | null = opensTo): void {
  const was = opened
  opened = null
  const el = from()
  if (!was || !el || !seen(el) || !may()) return void (flying?.skip(), run())
  const find = (): Element | null => {
    if (!was.key) return null
    const [name, value] = was.key
    // On the page come back first: the sidebar's Recent rows carry the same mark.
    const all = [...document.querySelectorAll(`[${name}="${CSS.escape(value)}"]`)].filter(seen)
    return all.find((one) => paneCard()?.contains(one)) ?? all[0] ?? null
  }
  fly('close', el, was.rect, run, find, () => onShow(paneCard()))
}
