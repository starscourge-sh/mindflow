/**
 * The pointer's look while something is carried (data-dragging, data-split-drag), stretched (data-stretching), scrubbed
 * (data-scrubbing) or refused (data-drag-refused), wherever it goes: grabbing, ew-resize or not-allowed, even over a
 * button or a link that has its own.
 *
 * It was "html[data-dragging] * { cursor: grabbing !important }": a rule under every element, so each flip of the mark
 * on <html> restyled every element in the window, at the start of the drag and again at its end (2.2 to 3.3 s each on a
 * 31,500-element page in the reader). Now the one element under the pointer carries it (data-carry-cursor, main.css),
 * moved as the pointer moves: one element restyled per move, never the page. (Not on the body, which the page inherits
 * its cursor from: a change there restyled every element too, 7.8 s.)
 *
 * Imported by each file that sets one of the marks, so every window that can carry has it.
 */
const MARKS = ['data-drag-refused', 'data-stretching', 'data-scrubbing', 'data-dragging', 'data-split-drag', 'data-resizing'] as const
const LOOK: Record<(typeof MARKS)[number], string> = {
  // A pane's edge dragged (ui.tsx, calendar-view.tsx): it was the body's cursor, which restyled every element too.
  'data-resizing': 'col-resize',
  'data-drag-refused': 'not-allowed',
  'data-stretching': 'ew-resize',
  'data-scrubbing': 'ew-resize',
  'data-dragging': 'grabbing',
  'data-split-drag': 'grabbing',
}

let at = { x: -1, y: -1 }
/** The element the pointer's events go to: the one under it, or the one holding it (pointer capture), which then has the hover. */
let held: Element | null = null
let marked: Element[] = []
let look = ''

/** The look the marks on <html> ask for, the first of MARKS that is set (refused wins over carried). */
const wanted = (): string => {
  const html = document.documentElement
  const mark = MARKS.find((one) => html.hasAttribute(one))
  return mark ? LOOK[mark] : ''
}

/** The element under the pointer, and the one holding it if another, carry the look; nothing else does. */
function mark(): void {
  // Inside a note, its editor's own element: ProseMirror reads any attribute changed on an element in its text as an
  // edit and draws the block again (a block carried in the note lost its place, its words and its drop), but it
  // leaves its own root alone. What is under the pointer in the note inherits the cursor from there.
  const own = (one: Element | null): Element | null => one?.closest('.ProseMirror') ?? one
  const next = look && at.x >= 0 ? [...new Set([own(document.elementFromPoint(at.x, at.y)), own(held)])].filter((one): one is Element => !!one) : []
  for (const one of marked) if (!next.includes(one)) one.removeAttribute('data-carry-cursor')
  for (const one of next) if (one.getAttribute('data-carry-cursor') !== look) one.setAttribute('data-carry-cursor', look)
  marked = next
}

const heard = (event: PointerEvent): void => {
  at = { x: event.clientX, y: event.clientY }
  held = event.target instanceof Element ? event.target : null
}
const onMove = (event: PointerEvent): void => (heard(event), look ? mark() : undefined)

if (typeof document !== 'undefined' && !(window as { __carryCursor?: boolean }).__carryCursor) {
  ;(window as { __carryCursor?: boolean }).__carryCursor = true
  // Where the pointer is, always: a carry starts on the move past its few pixels, and that move's own handler sets the
  // mark. Heard only from the press, the look went to what was under the press, not under the pointer, which kept its
  // own (the arrow) until the next move (a tab carried showed the arrow on its first step). Registered as this module
  // loads, before any carry's own capture listener, so the spot is the move's own when the mark comes. Two numbers kept
  // per move; nothing is restyled unless a mark is up.
  window.addEventListener('pointerdown', heard, { capture: true, passive: true })
  window.addEventListener('pointermove', onMove, { capture: true, passive: true })
  // While a look is up, the spot is read again each frame: what is under a still pointer changes as the carry draws
  // (the carried tab's place hidden, its neighbours sliding apart under it), and the newcomer kept its own look (the
  // arrow) until the pointer next moved; a tab carried showed the arrow from its first step until the second (20 Nov).
  // One elementFromPoint a frame, and an attribute set only when the element under it is another.
  let frame = 0
  const each = (): void => {
    frame = 0
    if (!look) return
    mark()
    frame = requestAnimationFrame(each)
  }
  new MutationObserver(() => {
    const next = wanted()
    if (next === look) return
    look = next
    mark()
    if (look && !frame) frame = requestAnimationFrame(each)
  }).observe(document.documentElement, { attributes: true, attributeFilter: [...MARKS] })
}

export {}
