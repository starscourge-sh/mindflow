/**
 * The room a row leaves in its list, kept and closed where it can be seen, the
 * one way for every list. A row moved to the Bin (or sent to Writing, Gems,
 * Tasks) is gone from its list at once; drawn at once, the next row jumped into
 * its place in a single frame, under the paper still crumpling there, and
 * nothing said the list had closed up.
 *
 * So: the room stays open while the paper is on it, and nothing below moves.
 * As the paper lifts off, everything below glides up together on the clock
 * rows already move on when a carried row makes room (carry.tsx, SLIDE). By a
 * key nothing travels, and the rows close up at once on the same short clock.
 * Undo runs it backwards: the rows part, then the row is in its place. With
 * Motion off or Reduce motion the row is simply gone and the rows simply there.
 *
 * How: nothing is asked of a list. `keepRoom` is told the row while it is
 * still on screen and notes where everything after it stands. The moment the
 * row leaves the page, what held it keeps its height (padding at its foot) and
 * each thing after it is set back where it stood by the CSS `translate`
 * property, which moves a row without touching its `transform` (a list's own:
 * carry.tsx slides its rows by theirs). To close, each `translate` runs to
 * nothing on the compositor, and the padding with it, so a box round the rows,
 * what comes after it and the end of the scroll all move as one. Web
 * Animations only: no style or node of the list's is written, so React, the
 * virtual list and the drag helper never see it.
 */
import { still } from './motion'
import { scrollerOf } from './note-place'

/** The rows' slide in carry.tsx (SLIDE): its length and curve. Kept the same by test/room-clock.test.ts. */
export const ROOM_MS = 220
export const ROOM_EASE = 'cubic-bezier(0.2, 0.9, 0.3, 1)'
/**
 * How long a room is held with no word from its paper, and how long rows told
 * of are waited for. Nothing here waits on the paper for ever: a flight that
 * never lifts (a write that failed with nobody told) must not leave a list
 * standing open, nor the page watched.
 */
const LATEST = 2500
const WATCHED = 15000
/**
 * A ball that lifts off starts slowly (its flight eases in and out), and rows on their own short clock were home
 * before it had visibly left: read in frames, the rows went first. They start this far into the flight instead (a
 * fifth of it: the ball is then a few pixels on its way and picking up speed), so the two go in one breath.
 */
const UNDER_WAY = 0.2
/** How many rows may join a list at once and still ease in among the rest; more is the list drawn again (note-list.tsx useArrivals too). */
export const FEW_BACK = 3

/** A row's room: `close` once its paper lifts off, told how long that flight is (or with no paper, at once); `drop` when the row stays after all. */
export type Room = { close: (flight?: number) => void; drop: () => void }

type Kind = 'translate' | 'pad'
/**
 * One thing set off its place or padded: how much is held on it, the run it is
 * on (from, to) and the animation doing it. `add`: laid on top of what it has
 * of its own (padding always; a `translate` only where the thing already has
 * one, as a plain one alone can run on the compositor).
 */
type Ride = { add: boolean; hold: number; from: number; to: number; anim: Animation | null }
const rides: Record<Kind, Map<HTMLElement, Ride>> = { translate: new Map(), pad: new Map() }

const frame = (kind: Kind, value: number): Keyframe => (kind === 'translate' ? { translate: `0 ${value}px` } : { paddingBottom: `${Math.max(0, value)}px` })
/** How far a thing is off its own place (or padded) just now, mid-glide too: worked out from its run, never read off the page. */
const offBy = (kind: Kind, el: HTMLElement): number => {
  const one = rides[kind].get(el)
  if (!one?.anim) return 0
  return one.from + (one.to - one.from) * (one.anim.effect?.getComputedTiming().progress ?? 1)
}

/**
 * Set a thing `jump` further off at once, and hold `more` on it from now on:
 * `(by, by)` holds it there, `(0, -by)` lets that much go on the clock,
 * `(-by, 0)` sets it back and lets it glide home. One animation a thing, begun
 * again from where it is now, so a second change mid-glide never jumps (the way
 * a CSS transition turns).
 */
function ride(kind: Kind, el: HTMLElement, jump: number, more: number, wait = 0): Promise<unknown> {
  const map = rides[kind]
  let one = map.get(el)
  if (!one) map.set(el, (one = { add: kind === 'pad' || getComputedStyle(el).translate !== 'none', hold: 0, from: 0, to: 0, anim: null }))
  const from = offBy(kind, el) + jump
  one.hold += more
  const to = one.hold
  const settled = Math.abs(from - to) < 0.5
  const was = one.anim
  // Held where it is, or on its way to what is still held on it.
  // Held where it is through any wait, then on its way.
  const anim = el.animate([frame(kind, settled ? to : from), frame(kind, to)], { duration: settled ? 1 : ROOM_MS, delay: settled ? 0 : wait, easing: settled ? 'linear' : ROOM_EASE, fill: 'both', composite: one.add ? 'add' : 'replace' })
  ;[one.anim, one.from, one.to] = [anim, settled ? to : from, to]
  was?.cancel()
  // Home, with nothing held on it: it is the list's own again.
  const home = (): void => void (map.get(el)?.anim === anim && Math.abs(to) < 0.5 && (anim.cancel(), map.delete(el)))
  if (settled) home()
  return settled ? Promise.resolve() : anim.finished.then(home, () => undefined)
}

/** Where a thing after the rows stood, and the row it is or holds, by name: a list that draws its rows afresh is asked for it again by that. */
type Stood = { top: number; scroller: HTMLElement | null; name?: string }
/** Not a list's own rows: the sidebar's, a menu's, the paper's copy of a row. */
const OUTSIDE = '[data-side-row], [role="menu"], [data-crumple]'
const nameOf = (el: Element): string | undefined => (el as HTMLElement).dataset?.id ?? el.querySelector<HTMLElement>('[data-id]')?.dataset.id
/** The row drawn now under a name, in the list it was in. */
const rowNamed = (name: string, within?: HTMLElement | null): HTMLElement | null =>
  [...document.querySelectorAll<HTMLElement>(`[data-id="${CSS.escape(name)}"]`)].find((one) => !one.closest(OUTSIDE) && (!within?.isConnected || within.contains(one))) ?? null
type Batch = {
  /** The rows told of, those whose paper has not lifted yet, and how many have left the page. */
  rows: Set<HTMLElement>
  waiting: Set<HTMLElement>
  gone: number
  /** Everything after them, at every level up to what scrolls: where each stood. */
  after: Map<HTMLElement, Stood>
  /** What holds each row, innermost first, and how tall each stood. */
  paths: HTMLElement[][]
  tall: Map<HTMLElement, number>
  /** What is held for it now: how far each thing is set back, how much each holder is padded. */
  moved: Map<HTMLElement, number>
  padded: Map<HTMLElement, number>
  /** Rows the list drew anew among them (it fills up again from below): out of sight until the rooms have closed. */
  fresh: Map<HTMLElement, Animation>
  /** Where each scroller was last, so a list at its end is not thrown as it shortens. */
  scrolled: Map<HTMLElement, { top: number; heard: () => void }>
  holding: boolean
  over: boolean
  /** How long after the lift-off the rows start: nothing with no ball. */
  wait: number
  watch: MutationObserver
  latest?: ReturnType<typeof setTimeout>
  giveUp?: ReturnType<typeof setTimeout>
}
/** The rooms kept in this one run of code (the four that fly and the rest of what was picked): they close as one move. */
let gathering: Batch | null = null

/**
 * A row told of, the place it had, and the row after it as the list was drawn: the one that takes its place.
 * Kept while its list closes up, and after that until the pointer next moves.
 */
type Left = { row: HTMLElement; place: DOMRect; heir: HTMLElement | null; batch: Batch; settled: boolean }
let lefts: Left[] = []
if (typeof window !== 'undefined') {
  // Moved, with the list at rest, the pointer is on what it shows again; scrolled, the places are no longer where they were.
  window.addEventListener('pointermove', (event) => void ((event.movementX || event.movementY) && lefts.length && (lefts = lefts.filter((one) => !one.settled))), { capture: true, passive: true })
  window.addEventListener('wheel', () => void (lefts.length && (lefts = [])), { capture: true, passive: true })
}
/** These stayed after all (the move did not happen): each is pointed at as itself again. */
export const stays = (ids: string[]): void => void (lefts = lefts.filter((one) => !ids.includes(one.row.dataset.id ?? '')))
/** The row after this one in its list, as drawn: the next thing down the page with a name of its own, not inside it. */
function heirOf(row: HTMLElement): HTMLElement | null {
  const all = [...document.querySelectorAll<HTMLElement>('[data-id]')].filter((one) => !one.closest(OUTSIDE))
  const at = all.indexOf(row)
  if (at < 0) return null
  for (const next of all.slice(at + 1)) if (!row.contains(next) && next.dataset.id !== row.dataset.id) return next
  return null
}
/**
 * What a key pressed here means while a list closes up. The pointer in the place a row just left (or still on that
 * row, its list not yet told): the row that takes the place, and if that one has left too, the one after it. Null
 * where nothing takes it; undefined where no row has left, and the page's own idea of what is pointed at stands.
 */
export function heirAt(x: number, y: number, on?: HTMLElement): HTMLElement | null | undefined {
  const left = (on && lefts.find((one) => one.row === on || (one.row.contains(on) && one.row.dataset.id === on.dataset.id)))
    || lefts.find((one) => !one.row.isConnected && x >= one.place.left && x <= one.place.right && y >= one.place.top && y <= one.place.bottom)
  if (!left) return undefined
  for (let heir = left.heir; heir; ) {
    const also = lefts.find((one) => one.row === heir)
    // Still on the page, or drawn afresh under the same name.
    if (!also) return heir.isConnected ? heir : heir.dataset.id ? rowNamed(heir.dataset.id) : null
    heir = also.heir
  }
  return null
}

/** Where a thing stands in what scrolls it, its own slide left out: the same however far the list is scrolled. */
const topOf = (el: HTMLElement, scroller: HTMLElement | null): number =>
  el.getBoundingClientRect().top - offBy('translate', el) - (scroller ? scroller.getBoundingClientRect().top - scroller.scrollTop : 0)
const tallOf = (el: HTMLElement): number => el.getBoundingClientRect().height - offBy('pad', el)

/**
 * Told of a row about to leave its list, while it is still on screen. Nothing
 * is held until it has left; then its room stays open until `close`.
 */
export function keepRoom(row: HTMLElement | null): Room | undefined {
  if (!row?.isConnected || still()) return undefined
  const batch = (gathering ??= begin())
  if (!batch.rows.has(row)) {
    batch.rows.add(row)
    batch.waiting.add(row)
    note(batch, row)
    lefts = [...lefts.slice(-40), { row, place: row.getBoundingClientRect(), heir: heirOf(row), batch, settled: false }]
  }
  return { close: (flight = 0) => lifted(batch, row, flight * UNDER_WAY), drop: () => (batch.rows.delete(row), (lefts = lefts.filter((one) => one.row !== row)), lifted(batch, row)) }
}

function begin(): Batch {
  const batch: Batch = {
    rows: new Set(), waiting: new Set(), gone: 0, after: new Map(), paths: [], tall: new Map(), moved: new Map(), padded: new Map(), fresh: new Map(), scrolled: new Map(),
    holding: false, over: false, wait: 0, watch: new MutationObserver((changes) => look(batch, changes))
  }
  // Heard as the page changes, before that change is painted: the frame a row leaves in is the frame its room is held in.
  batch.watch.observe(document.body, { childList: true, subtree: true })
  queueMicrotask(() => void (gathering === batch && (gathering = null)))
  // Not a wait for anything: only so the page is never watched for ever for rows that stayed (see WATCHED).
  batch.giveUp = setTimeout(() => end(batch), WATCHED)
  return batch
}

/** Where everything after the row stands, and how tall each thing that holds it is. */
function note(batch: Batch, row: HTMLElement): void {
  const scroller = scrollerOf(row)
  if (scroller && !batch.scrolled.has(scroller)) {
    const kept = { top: scroller.scrollTop, heard: (): void => void (kept.top = scroller.scrollTop) }
    scroller.addEventListener('scroll', kept.heard, { passive: true })
    batch.scrolled.set(scroller, kept)
  }
  const path: HTMLElement[] = []
  for (let at: HTMLElement = row; at.parentElement && at !== scroller && at !== document.body; at = at.parentElement) {
    for (let next = at.nextElementSibling; next; next = next.nextElementSibling)
      if (next instanceof HTMLElement && !batch.after.has(next)) batch.after.set(next, { top: topOf(next, scroller), scroller, name: nameOf(next) })
    const box = at.parentElement
    if (box === scroller || box === document.body) break
    path.push(box)
    if (!batch.tall.has(box)) batch.tall.set(box, tallOf(box))
  }
  batch.paths.push(path)
}

/** A row's paper has lifted off (or it has none, or it stays): with every paper up, the rooms close. */
function lifted(batch: Batch, row: HTMLElement, wait = 0): void {
  batch.waiting.delete(row)
  batch.wait = Math.max(batch.wait, wait)
  if (batch.waiting.size || batch.over) return
  if (batch.holding) return shut(batch)
  if (!batch.rows.size) return end(batch)
  // Not left yet (the write is still on its way): its room closes the moment it does. Waited for a little, no longer.
  clearTimeout(batch.giveUp)
  batch.giveUp = setTimeout(() => end(batch), LATEST)
}

/** The page changed: a row gone from it has its room held in the same frame, and a row drawn anew under it stands off with the rest. */
function look(batch: Batch, changes: MutationRecord[]): void {
  if (batch.over) return
  let gone = 0
  for (const row of batch.rows) if (!row.isConnected) gone += 1
  if (gone > batch.gone) {
    batch.gone = gone
    hold(batch)
  // The list drew its rows afresh under the hold (Tasks, as the pick clears, a moment after the rows left; a long
  // list made anew is empty for one draw, then has its rows): held again, on the new ones, as they come.
  } else if (batch.holding && changes.some((one) => one.addedNodes.length) && [...batch.after.keys()].some((el) => !el.isConnected && !batch.rows.has(el))) hold(batch)
  else if (batch.holding && changes.some((one) => one.addedNodes.length && one.target instanceof HTMLElement && [...one.target.children].some((child) => batch.moved.has(child as HTMLElement)))) drawnAnew(batch)
  else return
  if (!batch.waiting.size) return shut(batch)
  // The paper's own word is what closes it; this is only the latest it is waited for.
  batch.latest ??= setTimeout(() => shut(batch), LATEST)
}

/**
 * Everything drawn where it stood before the rows left. Read whole, then
 * written whole, twice: once for what holds the rows (so nothing outside it
 * moves at all), once for what is inside.
 */
function hold(batch: Batch): void {
  batch.holding = true
  // What holds the rows keeps its height: the room is padding at its foot, on the innermost box that shortened.
  // Worked out afresh each time from how tall each stood, so it is right again after a list has drawn itself anew
  // (for a moment it is empty, and the box round it is held whole; then its rows are back, and only their room is).
  const boxes = [...batch.tall].filter(([box]) => box.isConnected).map(([box, tall]) => [box, tall, tallOf(box), depthOf(box)] as const).sort((a, b) => b[3] - a[3])
  const turned = new Map<HTMLElement, number>()
  for (const [box, tall, now] of boxes) {
    // Less what was just made up (or given back) inside it: a group's room, inside a list's.
    let inside = 0
    for (const [other, by] of turned) if (box.contains(other)) inside += by
    const want = Math.max(0, tall - now - inside)
    const had = batch.padded.get(box) ?? 0
    if (Math.abs(want - had) > 0.5) turned.set(box, want - had)
  }
  for (const [box, by] of turned) {
    ride('pad', box, by, by)
    batch.padded.set(box, (batch.padded.get(box) ?? 0) + by)
  }
  // A list scrolled to its end was pulled down as it shortened: with its height back, it is put back where it was.
  for (const [scroller, kept] of batch.scrolled) if (scroller.isConnected && scroller.scrollTop < kept.top - 0.5) scroller.scrollTop = kept.top
  // Then each thing after them, back where it stood: found again first, where the list drew its rows afresh.
  refind(batch)
  const off: [HTMLElement, number][] = []
  for (const [el, stood] of batch.after) {
    if (!el.isConnected) continue
    // What scrolled it may have been drawn afresh too: the one that scrolls it now stands in the same place.
    if (stood.scroller && !stood.scroller.isConnected) stood.scroller = scrollerOf(el)
    const by = stood.top - topOf(el, stood.scroller)
    if (Math.abs(by) > 0.5) off.push([el, by])
  }
  for (const [el, by] of off) {
    ride('translate', el, by, by)
    batch.moved.set(el, (batch.moved.get(el) ?? 0) + by)
    // Where it stands now is where it stood: read the same from here on.
    batch.after.get(el)!.top -= by
  }
  drawnAnew(batch)
}

/**
 * A list that draws its rows afresh as these leave (Tasks, when the pick clears: its rows change kind) has thrown
 * away every thing that was noted. Each is found again: a row by its name, in the box that takes the old one's
 * place; what stood between rows (a heading) by its place beside the same row. What was held on the old one is
 * asked of the new one from the start, so it is drawn where the old one was.
 */
function refind(batch: Batch): void {
  const gone: [HTMLElement, Stood][] = []
  for (const [el, stood] of batch.after) {
    if (el.isConnected) continue
    // One of the rows that left is not looked for again.
    if (batch.rows.has(el)) batch.after.delete(el)
    else gone.push([el, stood])
  }
  if (!gone.length) return
  const twin = new Map<Element, HTMLElement>()
  for (const [old, stood] of gone) {
    const row = stood.name ? rowNamed(stood.name, stood.scroller) : null
    if (row) twin.set(old, unitLike(row, old))
  }
  // None drawn yet (a long list made anew draws its rows a moment later): asked again as they come (look).
  if (!twin.size) return
  // What has no name: the thing drawn just before the same row now, or just after it, counting the other nameless things between.
  const beside = (old: HTMLElement, way: 'nextElementSibling' | 'previousElementSibling', back: 'nextElementSibling' | 'previousElementSibling'): Element | null => {
    let between = 0
    for (let at = old[way]; at; at = at[way]) {
      let now: Element | null | undefined = twin.get(at)
      if (now) {
        for (let i = 0; i <= between && now; i++) now = now[back]
        return now ?? null
      }
      if (!nameOf(at)) between += 1
    }
    return null
  }
  for (const [old, stood] of gone) {
    let now: Element | null = twin.get(old) ?? null
    if (!now && !stood.name) {
      now = beside(old, 'nextElementSibling', 'previousElementSibling') ?? beside(old, 'previousElementSibling', 'nextElementSibling')
      if (now && (nameOf(now) || !(now instanceof HTMLElement))) now = null
    }
    const held = batch.moved.get(old) ?? 0
    batch.after.delete(old)
    batch.moved.delete(old)
    lost('translate', old)
    if (now instanceof HTMLElement && !batch.after.has(now) && !batch.rows.has(now)) batch.after.set(now, { ...stood, top: stood.top + held })
  }
}

/** The box that takes an old one's place round a row drawn afresh: the same kind of box (a long list's own, known by its marks), else the outermost one that holds this row alone. */
function unitLike(row: HTMLElement, old: HTMLElement): HTMLElement {
  const marks = [...old.attributes].map((one) => one.name).filter((name) => name.startsWith('data-'))
  if (marks.length) for (let at: HTMLElement | null = row; at && at !== document.body; at = at.parentElement) if (at.tagName === old.tagName && marks.every((name) => at!.hasAttribute(name))) return at
  return unitOf(row)
}
/** The outermost box that holds a row alone (a long list wraps each row in one, with a sliver of room under it; a carried row's own box holds its grip too). */
function unitOf(row: HTMLElement): HTMLElement {
  const alone = (box: HTMLElement): boolean => {
    let rows = 0
    for (const child of box.children) if (nameOf(child) && ++rows > 1) return false
    return true
  }
  let unit = row
  while (unit.parentElement && unit.parentElement !== document.body && alone(unit.parentElement)) unit = unit.parentElement
  return unit
}

/**
 * A row the list drew anew after the ones set back (a list that shows so many fills up again from below, a long one
 * draws what came into view): it has no place to be held in, and where the list puts it is where a held row is still
 * drawn. So it waits out of sight, and is in its place once the rooms have closed.
 */
function drawnAnew(batch: Batch): void {
  const boxes = new Set<HTMLElement>()
  for (const el of batch.moved.keys()) if (el.parentElement) boxes.add(el.parentElement)
  for (const box of boxes) {
    let off = false
    for (const child of box.children) {
      if (!(child instanceof HTMLElement)) continue
      if (batch.after.has(child)) off ||= !!batch.moved.get(child)
      else if (off && !batch.fresh.has(child)) batch.fresh.set(child, child.animate({ visibility: ['hidden', 'hidden'] }, { duration: WATCHED }))
    }
  }
}

/** The rooms close: every thing glides home on the one clock, and the padding goes with it. */
function shut(batch: Batch): void {
  if (batch.over) return
  const runs: Promise<unknown>[] = []
  for (const [el, by] of batch.moved) el.isConnected ? runs.push(ride('translate', el, 0, -by, batch.wait)) : lost('translate', el)
  for (const [box, by] of batch.padded) box.isConnected ? runs.push(ride('pad', box, 0, -by, batch.wait)) : lost('pad', box)
  // What the list drew anew shows as the glide ends.
  for (const [el, hidden] of batch.fresh) (el.animate({ visibility: ['hidden', 'hidden'] }, { duration: ROOM_MS + batch.wait }), hidden.cancel())
  end(batch, Promise.allSettled(runs))
}

/** A thing the list took off the page while it was held: nothing is kept on it. */
const lost = (kind: Kind, el: HTMLElement): void => void (rides[kind].get(el)?.anim?.cancel(), rides[kind].delete(el))
const depthOf = (el: HTMLElement): number => {
  let depth = 0
  for (let up = el.parentElement; up; up = up.parentElement) depth += 1
  return depth
}

function end(batch: Batch, closed?: Promise<unknown>): void {
  if (batch.over) return
  batch.over = true
  // A row that stayed after all is pointed at as itself again; the rest, once the list has closed up (and then until the pointer moves).
  lefts = lefts.filter((one) => one.batch !== batch || !one.row.isConnected)
  const settle = (): void => lefts.forEach((one) => one.batch === batch && (one.settled = true))
  closed ? void closed.then(settle) : settle()
  batch.watch.disconnect()
  clearTimeout(batch.latest)
  clearTimeout(batch.giveUp)
  for (const [scroller, kept] of batch.scrolled) scroller.removeEventListener('scroll', kept.heard)
  if (gathering === batch) gathering = null
}

/**
 * Undo, the same backwards: told of rows about to come back (by their
 * `data-id`), before the write. As each is drawn again, everything after it
 * starts from where it stood and parts on the same clock; the row is in its
 * place once they have.
 */
export function expectBack(ids: string[]): void {
  // Many back at once (a whole pick, ⌘A then ⌫) is the list drawn again, in one step: parted row by row, every row
  // came back stacked at the first one's top, its words out of sight, and slid apart. Only a few part the rows.
  if (still() || !ids.length || ids.length > FEW_BACK) return
  const due = new Set(ids)
  const watch = new MutationObserver((changes) => {
    const back: HTMLElement[] = []
    for (const change of changes) for (const node of change.addedNodes) {
      if (!(node instanceof HTMLElement)) continue
      for (const row of node.matches('[data-id]') ? [node] : node.querySelectorAll<HTMLElement>('[data-id]'))
        if (due.has(row.dataset.id ?? '') && row.isConnected) (due.delete(row.dataset.id!), back.push(row))
    }
    // Read first, every row, then written: the page is laid out once.
    const rooms = back.map((row) => [row, roomOf(row)] as const)
    for (const [row, by] of rooms) part(row, by)
    if (!due.size) stop()
  })
  // Not a wait for anything: the page is not watched for ever for a row that came back somewhere out of sight.
  const giveUp = setTimeout(() => stop(), LATEST)
  const stop = (): void => (watch.disconnect(), clearTimeout(giveUp))
  watch.observe(document.body, { childList: true, subtree: true })
}

/**
 * How much room a row drawn again takes: from its top to the top of what comes next, its air included, read off
 * the outermost box that holds it alone.
 */
function roomOf(row: HTMLElement): number {
  const unit = unitOf(row)
  const next = unit.nextElementSibling
  const to = next instanceof HTMLElement ? next.getBoundingClientRect().top - offBy('translate', next) - unit.getBoundingClientRect().top : 0
  // Never more than the row and a little air: a row alone in its list is held by the whole list, which is no measure of it.
  const own = row.getBoundingClientRect().height
  return to >= own - 0.5 && to < own * 2 ? to : own
}

function part(row: HTMLElement, by: number): void {
  if (by < 0.5) return
  const scroller = scrollerOf(row)
  // Out of sight while the rows part, in its place once they have.
  row.animate({ visibility: ['hidden', 'hidden'] }, { duration: ROOM_MS })
  for (let at: HTMLElement = row; at.parentElement && at !== scroller && at !== document.body; at = at.parentElement)
    for (let next = at.nextElementSibling; next; next = next.nextElementSibling) if (next instanceof HTMLElement) ride('translate', next, -by, 0)
}
