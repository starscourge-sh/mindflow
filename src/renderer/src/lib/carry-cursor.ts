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
const MARKS = ['data-drag-refused', 'data-stretching', 'data-scrubbing', 'data-dragging', 'data-split-drag'] as const
const LOOK: Record<(typeof MARKS)[number], string> = {
  'data-drag-refused': 'not-allowed',
  'data-stretching': 'ew-resize',
  'data-scrubbing': 'ew-resize',
  'data-dragging': 'grabbing',
  'data-split-drag': 'grabbing',
}

let at = { x: -1, y: -1 }
let marked: Element | null = null
let look = ''

/** The look the marks on <html> ask for, the first of MARKS that is set (refused wins over carried). */
const wanted = (): string => {
  const html = document.documentElement
  const mark = MARKS.find((one) => html.hasAttribute(one))
  return mark ? LOOK[mark] : ''
}

function mark(target: Element | null): void {
  if (marked && marked !== target) marked.removeAttribute('data-carry-cursor')
  marked = look ? target : null
  if (marked && marked.getAttribute('data-carry-cursor') !== look) marked.setAttribute('data-carry-cursor', look)
}

function onMove(event: PointerEvent): void {
  at = { x: event.clientX, y: event.clientY }
  mark(document.elementFromPoint(at.x, at.y))
}

if (typeof document !== 'undefined' && !(window as { __carryCursor?: boolean }).__carryCursor) {
  ;(window as { __carryCursor?: boolean }).__carryCursor = true
  // Where the pointer is when a carry starts (it starts on a press or the move after one).
  window.addEventListener('pointerdown', (event) => void (at = { x: event.clientX, y: event.clientY }), { capture: true, passive: true })
  new MutationObserver(() => {
    const next = wanted()
    if (next === look) return
    if (!look) window.addEventListener('pointermove', onMove, { capture: true, passive: true })
    if (!next) window.removeEventListener('pointermove', onMove, { capture: true })
    look = next
    mark(look && at.x >= 0 ? document.elementFromPoint(at.x, at.y) : null)
  }).observe(document.documentElement, { attributes: true, attributeFilter: [...MARKS] })
}

export {}
