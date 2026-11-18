/**
 * Picking words in the readers is forgiving, as in Apple's apps (the user, 15 and 18 Nov 2026: "make selection more
 * forgiving"). A press on the words themselves is the browser's own: a double-click picks a word, a triple-click a
 * paragraph, ⇧-click extends, and a drag past the pane's edge scrolls. What is added here:
 *   A press off the words (the margin beside a paragraph, the gap between lines or paragraphs, just past a line's
 *   end, the desk beside a page) starts at the nearest word, and the drag from there picks on as one from the words
 *   would: by letters, by words after a double-click, by paragraphs after a triple-click (a PDF's lines, as
 *   Preview's, on its words too); ⇧ extends to the nearest word; past the column's edge it keeps to the line's end,
 *   and past the pane's edge the page scrolls under it.
 *   A press that moves less than a hair is a click: nothing is picked, and a link so pressed opens.
 *   A drag begun on a PDF page's words selects across every page of that book: each page's end stretches to take
 *   the pointer wherever it goes, until the press ends (pdf.css .textLayer.selecting .endOfContent).
 */

type Spot = { node: Text; offset: number }
type Box = { left: number; right: number; top: number; bottom: number }
/** What a press picks by: letters, words (a double-click) or lines (a triple-click). */
type Unit = 1 | 2 | 3

/** Under this many pixels a press that moved is still a click, as a Mac's own text fields take it. */
const HAIR = 4

/** A run of words at its start or its end. */
const textIn = (span: Element, last: boolean): Text | undefined => {
  const all = [...span.childNodes].filter((one): one is Text => one.nodeType === Node.TEXT_NODE)
  return last ? all.at(-1) : all[0]
}
const edgeOf = (span: Element, last: boolean): Spot | null => {
  const node = textIn(span, last)
  return node ? { node, offset: last ? node.length : 0 } : null
}

// Each PDF page's words as drawn, read once a press: their boxes from the page's top left, and the lowest of them.
// The page's own order is not its look (a DK book keeps its "In context" box last, high on the page).
const pages = new Map<Element, { spans: HTMLElement[]; boxes: Box[]; lowest: number; highest: number }>()
const read = (layer: Element): { spans: HTMLElement[]; boxes: Box[]; lowest: number; highest: number } => {
  const known = pages.get(layer)
  if (known) return known
  const at = layer.getBoundingClientRect()
  // The words themselves: a tagged book wraps them in spans of its own, whose boxes are whole paragraphs.
  const spans = [...layer.querySelectorAll<HTMLElement>("span")].filter((one) => one.textContent && !one.closest(".endOfContent") && !one.querySelector("span"))
  const boxes = spans.map((one) => { const b = one.getBoundingClientRect(); return { left: b.left - at.left, right: b.right - at.left, top: b.top - at.top, bottom: b.bottom - at.top } })
  const page = { spans, boxes, lowest: Math.max(...boxes.map((one) => one.bottom)), highest: Math.min(...boxes.map((one) => one.top)) }
  pages.set(layer, page)
  return page
}

/** The run at `index` and the runs beside it on the same line: its band, and each word on from the last. */
const lineOf = (boxes: Box[], index: number): [number, number] => {
  const line = boxes[index]
  const onLine = (n: number, from: number): boolean => boxes[n].bottom > line.top && boxes[n].top < line.bottom && (n > from ? boxes[n].left >= boxes[from].left - 1 : boxes[n].right <= boxes[from].right + 1)
  let first = index
  let last = index
  while (first > 0 && onLine(first - 1, first)) first--
  while (last < boxes.length - 1 && onLine(last + 1, last)) last++
  return [first, last]
}

/**
 * The nearest place in a book's drawn pages to a point: the page under it or nearest it, then on that page the line
 * level with it (else the nearest line above or below), and along that line the nearest letter. Below a page's
 * lowest words it is their end, above its highest their start, as Preview's.
 */
function nearestInPdf(layers: Element[], x: number, y: number): { spot: Spot; far: number; tall: number } | null {
  let layer: Element | null = null
  let away = Infinity
  for (const one of layers) {
    const r = one.getBoundingClientRect()
    const d = Math.hypot(Math.max(r.left - x, 0, x - r.right), Math.max(r.top - y, 0, y - r.bottom))
    // A page with no words under the pointer (a scan not read yet) picks nothing, rather than a page beside it.
    if (!d && !read(one).spans.length) return null
    if (d < away && read(one).spans.length) (layer = one), (away = d)
  }
  if (!layer) return null
  const { spans, boxes, lowest, highest } = read(layer)
  const at = layer.getBoundingClientRect()
  const px = x - at.left
  const py = y - at.top
  const tall = boxes[0].bottom - boxes[0].top
  if (py > lowest + 4) return { spot: edgeOf(spans.at(-1)!, true)!, far: py - lowest, tall }
  if (py < highest - 4) return { spot: edgeOf(spans[0], false)!, far: highest - py, tall }
  // The line level with the point first, then the nearest along it.
  let best = 0
  let bestDy = Infinity
  let bestDx = Infinity
  boxes.forEach((one, index) => {
    const dy = Math.max(one.top - py, 0, py - one.bottom)
    const dx = Math.max(one.left - px, 0, px - one.right)
    if (dy < bestDy - 0.5 || (dy < bestDy + 0.5 && dx < bestDx)) (best = index), (bestDy = Math.min(dy, bestDy)), (bestDx = dx)
  })
  const one = boxes[best]
  const span = spans[best]
  const far = Math.hypot(bestDx, bestDy)
  if (px <= one.left) return { spot: edgeOf(span, false)!, far, tall: one.bottom - one.top }
  if (px >= one.right) return { spot: edgeOf(span, true)!, far, tall: one.bottom - one.top }
  // Over the run: the letter the browser finds there, level with the run's middle.
  const caret = document.caretPositionFromPoint(x, at.top + (one.top + one.bottom) / 2)
  const node = textIn(span, false)!
  const offset = caret?.offsetNode === node ? caret.offset : Math.round((node.length * (px - one.left)) / Math.max(1, one.right - one.left))
  return { spot: { node, offset }, far, tall: one.bottom - one.top }
}

/**
 * The nearest place in an article's words to a point: the point brought inside the column's words (from the site
 * over the title to the last paragraph), then the letter the browser finds there; between two blocks, the first
 * words after it.
 */
function nearestInArticle(column: Element, x: number, y: number): Spot | null {
  const body = column.querySelector(".web-reader-body")
  const top = column.firstElementChild
  if (!body || !top) return null
  const across = body.getBoundingClientRect()
  const caret = document.caretPositionFromPoint(Math.min(Math.max(x, across.left + 1), across.right - 1), Math.min(Math.max(y, top.getBoundingClientRect().top + 1), across.bottom - 1))
  const node = caret?.offsetNode
  if (!node || !column.contains(node)) return null
  if (node instanceof Text) return { node, offset: caret!.offset }
  const here = document.createRange()
  here.setStart(node, caret!.offset)
  const walk = document.createTreeWalker(column, NodeFilter.SHOW_TEXT)
  let last: Text | null = null
  for (let one = walk.nextNode() as Text | null; one; one = walk.nextNode() as Text | null) {
    if (!one.data.trim()) continue
    if (here.comparePoint(one, 0) >= 0) return { node: one, offset: 0 }
    last = one
  }
  return last && { node: last, offset: last.length }
}

/** Whether a point is over a letter of the words, not beside them: the letter the browser finds there, or the one before it, holds it. */
function overLetter(x: number, y: number, within: Element): boolean {
  const caret = document.caretPositionFromPoint(x, y)
  const node = caret?.offsetNode
  if (!(node instanceof Text) || !within.contains(node) || !node.length) return false
  const one = document.createRange()
  for (const at of [caret!.offset, caret!.offset - 1]) {
    if (at < 0 || at >= node.length) continue
    one.setStart(node, at)
    one.setEnd(node, at + 1)
    if ([...one.getClientRects()].some((b) => x >= b.left - 1 && x <= b.right + 1 && y >= b.top - 1 && y <= b.bottom + 1)) return true
  }
  return false
}

/** The word round a place: the run of letters it is in or ends, else the nearest one before it, else after. */
function wordAt({ node, offset }: Spot): [Spot, Spot] {
  const parts = [...new Intl.Segmenter(undefined, { granularity: "word" }).segment(node.data)]
  const index = Math.max(0, parts.findIndex((one) => offset < one.index + one.segment.length || one === parts.at(-1)))
  const word = parts[index]?.isWordLike ? parts[index] : ([...parts.slice(0, index)].reverse().find((one) => one.isWordLike) ?? parts.slice(index).find((one) => one.isWordLike) ?? parts[index])
  return word ? [{ node, offset: word.index }, { node, offset: word.index + word.segment.length }] : [{ node, offset }, { node, offset }]
}

/** Which comes first in the text. */
const before = (a: Spot, b: Spot): boolean => (a.node === b.node ? a.offset < b.offset : !!(a.node.compareDocumentPosition(b.node) & Node.DOCUMENT_POSITION_FOLLOWING))

/**
 * A reader's words, for the press in it: the nearest place to a point, the line or paragraph round a place, and the
 * PDF pages that stretch their ends while it lasts. Null for a press that is not on a reader's page or desk.
 */
function readerAt(event: MouseEvent): { scroller: HTMLElement; near: (x: number, y: number) => { spot: Spot; far: number; tall: number } | null; line: (spot: Spot) => [Spot, Spot]; onWords: boolean } | null {
  const target = event.target as HTMLElement | null
  const scroller = target?.closest?.<HTMLElement>(".pdf-reader-scroll")
  // On the page or the desk round it: never a card or a field floating over them, a picture (it is dragged out to
  // other apps), or a scrollbar (the pane's own, or a wide table's).
  if (!scroller || !(target === scroller || target!.closest(".pdf-pages, .web-reader-page")) || target!.closest("a[href]:not(.web-reader-body a), button, input, textarea, img, video, iframe, [data-pdf-snip]")) return null
  if ((target!.scrollWidth > target!.clientWidth || target!.scrollHeight > target!.clientHeight) && (event.offsetX > target!.clientWidth || event.offsetY > target!.clientHeight)) return null
  const column = scroller.querySelector(".web-reader-column")
  if (column) {
    if (!column.querySelector(".web-reader-body")) return null
    const near = (x: number, y: number): { spot: Spot; far: number; tall: number } | null => {
      const spot = nearestInArticle(column, x, y)
      return spot && { spot, far: 0, tall: 0 }
    }
    // The paragraph round a place: its block's words.
    const line = (spot: Spot): [Spot, Spot] => {
      const block = spot.node.parentElement?.closest("p, li, blockquote, h1, h2, h3, h4, h5, h6, td, dd, dt, figcaption, pre") ?? spot.node.parentElement!
      const walk = document.createTreeWalker(block, NodeFilter.SHOW_TEXT)
      const first = walk.nextNode() as Text | null
      let last = first
      for (let node = walk.nextNode(); node; node = walk.nextNode()) last = node as Text
      return first && last ? [{ node: first, offset: 0 }, { node: last, offset: last.length }] : [spot, spot]
    }
    // What the reader sets in the words is this file's too, as a link's arrow is: a footnote mark, and the paragraph
    // the drop cap opens (web-reader.tsx `data-drop`), where the browser picked nothing from a drag begun on its own
    // words (its first letter floats; 18 Nov 2026, qa/forgiving-select.mjs).
    return { scroller, near, line, onWords: overLetter(event.clientX, event.clientY, column) && !target!.closest("sup, sub, [data-drop]") }
  }
  if (!scroller.querySelector(".textLayer")) return null
  const line = (spot: Spot): [Spot, Spot] => {
    const layer = spot.node.parentElement?.closest(".textLayer")
    const { spans, boxes } = read(layer!)
    const index = spans.indexOf(spot.node.parentElement?.closest("span") as HTMLElement)
    if (index < 0) return [spot, spot]
    const [first, last] = lineOf(boxes, index)
    return [edgeOf(spans[first], false)!, edgeOf(spans[last], true)!]
  }
  // The pages drawn now, read again as the drag goes: a page drawn as the drag scrolls to it takes the pointer too.
  return { scroller, near: (x, y) => nearestInPdf([...scroller.querySelectorAll(".textLayer")], x, y), line, onWords: !!target!.closest(".textLayer span") && !target!.closest(".endOfContent") }
}

/**
 * Whether the last press was well away from a PDF's words: only then is its double-click the page's own (it zooms,
 * pdf-reader.tsx). On the words or near them it picked a word, and the drag after it words (the browser calls that
 * a double-click too, on whatever the drag ended over).
 */
let farPress = true
export const pressAway = (): boolean => farPress

if (typeof document !== "undefined" && !(window as { __readerSelect?: boolean }).__readerSelect) {
  ;(window as { __readerSelect?: boolean }).__readerSelect = true
  // The PDF pages stretching their ends for a drag begun on their words.
  let held: Element[] = []
  // A press: where it began, whether it is a plain single click on the words (the browser's own), and, begun off the
  // words, the drag this file carries itself.
  let press: { x: number; y: number; moved: boolean; click: boolean } | null = null
  let drag: { scroller: HTMLElement; near: NonNullable<ReturnType<typeof readerAt>>["near"]; line: (spot: Spot) => [Spot, Spot]; unit: Unit; from: [Spot, Spot]; x: number; y: number } | null = null
  let frame = 0
  let then = 0

  const select = (anchor: Spot, focus: Spot): void => {
    const selection = getSelection()
    if (!selection || (selection.anchorNode === anchor.node && selection.anchorOffset === anchor.offset && selection.focusNode === focus.node && selection.focusOffset === focus.offset)) return
    selection.setBaseAndExtent(anchor.node, anchor.offset, focus.node, focus.offset)
  }
  /** The unit round a place: the place itself, its word, or its line. */
  const unitAt = (spot: Spot, unit: Unit, line: (spot: Spot) => [Spot, Spot]): [Spot, Spot] => (unit === 1 ? [spot, spot] : unit === 2 ? wordAt(spot) : line(spot))
  /** The drag's picked words grown to the pointer, by its unit, from the unit it began on. */
  const follow = (): void => {
    if (!drag) return
    const near = drag.near(drag.x, drag.y)
    if (!near) return
    const [start, end] = drag.from
    const [from, to] = unitAt(near.spot, drag.unit, drag.line)
    if (before(from, start)) select(end, from)
    else select(start, before(to, end) ? end : to)
  }
  // Past the pane's top or bottom edge the page scrolls, faster the further past: as fast as the browser's own does
  // for a drag begun on the words (its distance past the edge each frame at 60 a second), so the two feel the same.
  const roll = (now: number): void => {
    frame = 0
    if (!drag) return
    const r = drag.scroller.getBoundingClientRect()
    const past = drag.y < r.top ? drag.y - r.top : drag.y > r.bottom ? drag.y - r.bottom : 0
    if (!past) return void (then = 0)
    const step = then ? Math.min(50, now - then) : 16
    then = now
    drag.scroller.scrollTop += (past * 60 * step) / 1000
    follow()
    frame = requestAnimationFrame(roll)
  }

  document.addEventListener("mousedown", (event) => {
    press = null
    farPress = true
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.altKey) return
    const reader = readerAt(event)
    if (!reader) return
    press = { x: event.clientX, y: event.clientY, moved: false, click: reader.onWords && event.detail === 1 && !event.shiftKey }
    farPress = !reader.onWords
    // On the words the press is the browser's, but for a PDF's triple-click: the browser takes one run of a line
    // (pdf.js lays a line as several), Preview the whole line.
    if (reader.onWords && !(event.detail === 3 && !reader.scroller.querySelector(".web-reader-column"))) return
    const near = reader.near(event.clientX, event.clientY)
    if (!near) return
    farPress = near.far > near.tall * 1.5
    // A double-click well away from a PDF's words is the page's own (it zooms, pdf-reader.tsx): near them, it picks the nearest word.
    if (event.detail > 1 && farPress) return void (press = null)
    // The press is this file's from here: the browser would start it at the top of the page's words, or nowhere.
    event.preventDefault()
    if (document.activeElement instanceof HTMLElement && !reader.scroller.contains(document.activeElement)) document.activeElement.blur()
    const unit = Math.min(3, Math.max(1, event.detail)) as Unit
    const selection = getSelection()
    // ⇧: what is picked reaches to here, from where it began.
    if (event.shiftKey && selection?.rangeCount && !selection.isCollapsed && reader.scroller.contains(selection.anchorNode)) {
      const anchor = { node: selection.anchorNode as Text, offset: selection.anchorOffset }
      if (anchor.node.nodeType !== Node.TEXT_NODE) return
      drag = { ...reader, unit: 1, from: [anchor, anchor], x: event.clientX, y: event.clientY }
      press.moved = true
      return follow()
    }
    const from = unitAt(near.spot, unit, reader.line)
    drag = { ...reader, unit, from, x: event.clientX, y: event.clientY }
    // A word or a line is picked at once, as on the words; a single press waits to see if it is a drag.
    if (unit > 1) select(from[0], from[1])
    else selection?.removeAllRanges()
  }, true)

  document.addEventListener("pointerdown", (event) => {
    const layer = (event.target as Element | null)?.closest?.(".textLayer")
    if (!layer || event.button !== 0) return
    const book = layer.closest(".pdf-reader, .tiptap-attachment, [data-pdf-pages]") ?? layer.parentElement
    held = [...(book?.querySelectorAll(".textLayer") ?? [layer])]
    held.forEach((one) => one.classList.add("selecting"))
  }, true)

  // Past the words, the browser stops at the letter the last move reached, which a quick move leaves short.
  //   Below the page's lowest words (or off the page below them): to the end of the page's words, as Preview's does.
  //   The lowest on the page, never the last in its order: measured by the last few in order, a line low on a
  //   magazine's page counted as past the words, and picking it took everything to the end of the page (the user,
  //   13 Nov: "why all the selection, because i was just tryign to select this line first").
  //   Beside the line the selection ends on, over the page and not its words: to that line's end (its start, picking
  //   backwards). That line only, never a line of another column at the same height.
  document.addEventListener("pointermove", (event) => {
    if (press && !press.moved && Math.hypot(event.clientX - press.x, event.clientY - press.y) >= HAIR) press.moved = true
    if (drag) {
      if (!press?.moved || !(event.buttons & 1)) return
      // Held by the pane once it is a drag, so the pointer past the window's edge still moves it (a click on a
      // link's arrow that never moved stays the link's).
      if (!drag.scroller.hasPointerCapture(event.pointerId)) drag.scroller.setPointerCapture(event.pointerId)
      drag.x = event.clientX
      drag.y = event.clientY
      follow()
      if (!frame) frame = requestAnimationFrame(roll)
      return
    }
    if (!held.length || !(event.buttons & 1)) return
    const selection = window.getSelection()
    const focus = selection?.focusNode
    const layer = (focus instanceof Element ? focus : focus?.parentElement)?.closest(".textLayer")
    if (!selection || !focus || !layer) return
    const { spans, boxes, lowest } = read(layer)
    if (!spans.length) return
    const at = layer.getBoundingClientRect()
    const x = event.clientX - at.left
    const y = event.clientY - at.top
    const put = (node: Text | undefined, offset: number): void => { if (node && !(selection.focusNode === node && selection.focusOffset === offset)) selection.extend(node, offset) }
    if (y > lowest + 4) {
      const end = textIn(spans.at(-1)!, true)
      return put(end, end?.length ?? 0)
    }
    const index = spans.indexOf((focus instanceof Element ? focus : focus.parentElement)?.closest("span") as HTMLElement)
    if (index < 0) return
    const line = boxes[index]
    if (y < line.top - 2 || y > line.bottom + 2 || boxes.some((one) => x >= one.left && x <= one.right && y >= one.top && y <= one.bottom)) return
    const anchor = selection.anchorNode
    const forward = !anchor || (anchor === focus ? selection.focusOffset >= selection.anchorOffset : !!(anchor.compareDocumentPosition(focus) & Node.DOCUMENT_POSITION_FOLLOWING))
    const [first, last] = lineOf(boxes, index)
    if (forward && x > line.right) {
      let to = index
      for (let n = index + 1; n <= last; n++) if (boxes[n].right <= x) to = n
      const end = textIn(spans[to], true)
      put(end, end?.length ?? 0)
    } else if (!forward && x < line.left) {
      let to = index
      for (let n = index - 1; n >= first; n--) if (boxes[n].left >= x) to = n
      put(textIn(spans[to], false), 0)
    }
  }, true)

  const letGo = (): void => {
    // A single press that moved less than a hair is a click: the letter or two it caught are let go, so the click is
    // the click's (a link opens), never a selection of nothing much.
    if (press?.click && !press.moved) {
      const selection = getSelection()
      if (selection && !selection.isCollapsed && selection.anchorNode) selection.collapse(selection.anchorNode, selection.anchorOffset)
    }
    press = null
    drag = null
    cancelAnimationFrame(frame)
    frame = 0
    then = 0
    held.forEach((one) => one.classList.remove("selecting"))
    held = []
    pages.clear()
  }
  document.addEventListener("pointerup", letGo, true)
  document.addEventListener("pointercancel", letGo, true)
  window.addEventListener("blur", letGo)
}

export {}
