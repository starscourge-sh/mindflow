import { DARK_PAGE } from "./paper"
import { cleanTitle } from "@/lib/clean-title"
import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { GlobalWorkerOptions, OPS, TextLayer, Util, getDocument, type PDFDocumentProxy, type PDFPageProxy } from "pdfjs-dist"
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url"
import "./pdf.css"
import { markCss } from "./read-bar"
import { AHEAD as NEXT_TO, IN_VIEW, drawInTurn, keepPage, keptPage, calm, pagesAt, pagesScrolled, type Turn } from "./pdf-draw"

// A drag begun on a page's words selects across every page of that book: each page's end stretches to take the
// pointer wherever it goes, until the press ends (pdf.css .textLayer.selecting .endOfContent).
if (typeof document !== "undefined" && !(window as { __pdfSelecting?: boolean }).__pdfSelecting) {
  ;(window as { __pdfSelecting?: boolean }).__pdfSelecting = true
  let held: Element[] = []
  const letGo = (): void => void (held.forEach((one) => one.classList.remove("selecting")), (held = []))
  document.addEventListener("pointerdown", (event) => {
    const layer = (event.target as Element | null)?.closest?.(".textLayer")
    if (!layer || event.button !== 0) return
    const book = layer.closest(".pdf-reader, .tiptap-attachment, [data-pdf-pages]") ?? layer.parentElement
    held = [...(book?.querySelectorAll(".textLayer") ?? [layer])]
    held.forEach((one) => one.classList.add("selecting"))
  }, true)
  // Past the words altogether (below a page's last line, or off the page): the browser would stop at the letter
  // nearest the pointer, part way along the last line. Below the last line of the page the drag is on, the
  // selection goes to the end of that page's words, as Preview's does.
  document.addEventListener("pointermove", (event) => {
    if (!held.length || !(event.buttons & 1)) return
    const selection = window.getSelection()
    const focus = selection?.focusNode
    const layer = (focus instanceof Element ? focus : focus?.parentElement)?.closest(".textLayer")
    if (!selection || !layer) return
    const spans = [...layer.querySelectorAll("span")].filter((one) => one.textContent && !one.closest(".endOfContent"))
    const lastSpan = spans.at(-1)
    const text = lastSpan && [...lastSpan.childNodes].reverse().find((one) => one.nodeType === Node.TEXT_NODE)
    if (!lastSpan || !text) return
    const bottom = Math.max(...spans.slice(-3).map((one) => one.getBoundingClientRect().bottom))
    if (event.clientY > bottom + 4 && !(selection.focusNode === text && selection.focusOffset === text.textContent!.length)) selection.extend(text, text.textContent!.length)
  }, true)
  document.addEventListener("pointerup", letGo, true)
  document.addEventListener("pointercancel", letGo, true)
  window.addEventListener("blur", letGo)
}

// The worker ships beside the page as a file of the app's own, so the page's
// policy (script-src 'self') lets it run.
GlobalWorkerOptions.workerSrc = workerUrl

/** One open document per address, shared by every view of it in the window. */
const open = new Map<string, Promise<PDFDocumentProxy>>()
/** How many views show each document now (a reader, a note's PDF block). */
const holds = new Map<string, number>()

/**
 * A view showing a document: while it is held it stays open. Put down, it is
 * kept until another is put down; every document no view shows (a cover's,
 * a peek's, a book read before) is then closed and its memory freed, so
 * reading one book after another never piles up hundreds of megabytes.
 */
export function holdPdf(src: string): () => void {
  holds.set(src, (holds.get(src) ?? 0) + 1)
  let held = true
  return () => {
    if (!held) return
    held = false
    const left = (holds.get(src) ?? 1) - 1
    if (left > 0) return void holds.set(src, left)
    holds.delete(src)
    for (const [other, doc] of open) {
      if (other === src || holds.has(other)) continue
      open.delete(other)
      void doc.then((one) => one.loadingTask.destroy()).catch(() => {})
    }
  }
}

/** The document at a `haligtree://` address. Fetched here, so pdf.js never needs the scheme. */
export function loadPdf(src: string): Promise<PDFDocumentProxy> {
  let doc = open.get(src)
  if (!doc) {
    doc = fetch(src)
      .then((response) => response.arrayBuffer())
      .then((data) => getDocument({ data: new Uint8Array(data) }).promise)
    doc.catch(() => open.delete(src))
    open.set(src, doc)
  }
  return doc
}

/** A book opened afresh next time: its pages were read and it is served with its words now (pdf-scan.tsx). */
export const forgetPdf = (src: string): void => void open.delete(src)

/** The title it carries, else the file name without `.pdf`. */
export async function pdfTitle(doc: PDFDocumentProxy, name: string): Promise<string> {
  const meta = await doc.getMetadata().catch(() => null)
  const title = cleanTitle((meta?.info as { Title?: string } | undefined)?.Title ?? "")
  return title || cleanTitle(name.replace(/\.pdf$/i, "")) || name.replace(/\.pdf$/i, "")
}

/** Who wrote it, as the file says, or nothing. */
export async function pdfAuthor(doc: PDFDocumentProxy): Promise<string> {
  const meta = await doc.getMetadata().catch(() => null)
  return (meta?.info as { Author?: string } | undefined)?.Author?.trim() ?? ""
}

/** Words kept from a page: where on its text they start and end, and the words themselves. */
export type PdfMark = { id: string; page: number; quote: string; start: number; end: number; prefix?: string; suffix?: string; gemId?: string | null; color?: string | null; note?: string | null }

/** Every run of words in a page's text layer, in reading order. */
const textNodes = (layer: Element): Text[] => {
  const walk = document.createTreeWalker(layer, NodeFilter.SHOW_TEXT)
  const nodes: Text[] = []
  for (let node = walk.nextNode(); node; node = walk.nextNode()) nodes.push(node as Text)
  return nodes
}

/** Where a selection starts and ends on its page's text, as counts of characters: the same at any zoom. */
export function offsetsIn(layer: Element, range: Range): { start: number; end: number } {
  const before = document.createRange()
  before.setStart(layer, 0)
  before.setEnd(range.startContainer, range.startOffset)
  const start = before.toString().length
  return { start, end: start + range.toString().length }
}

/**
 * A page's words between two offsets as the eye reads them. The page's text
 * runs one line into the next with no space (pdf.js ends a line with a `<br>`,
 * which holds no text), so each line end inside is read as a space: "the
 * nature", never "thenature". Every place that takes words off a page by
 * offsets reads them here.
 */
export function wordsIn(layer: Element, start: number, end: number): string {
  const walk = document.createTreeWalker(layer, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT)
  let words = ""
  let seen = 0
  for (let node = walk.nextNode(); node && seen < end; node = walk.nextNode()) {
    if (node.nodeType === Node.TEXT_NODE) {
      const data = (node as Text).data
      words += data.slice(Math.max(0, start - seen), Math.max(0, end - seen))
      seen += data.length
    } else if ((node as Element).tagName === "BR" && seen > start) words += " "
  }
  return words.replace(/\s+/g, " ").trim()
}

/** The range a mark covers on a drawn page; found again by its words if the offsets no longer match. */
export function rangeOf(layer: Element, mark: PdfMark): Range | null {
  const at = offsetsOf(layer, mark)
  if (!at) return null
  return rangeAt(textNodes(layer), at.start, at.end)
}

/** Where a mark's words sit on a drawn page's text, by its offsets, else found again by its words. */
function offsetsOf(layer: Element, mark: PdfMark): { start: number; end: number } | null {
  const text = textNodes(layer).map((node) => node.data).join("")
  let { start, end } = mark
  // The quote is kept as the selection reads, its spaces evened out and a line end read as a space, while
  // the page's own text runs lines together with no space between: compared without spaces, they agree.
  const bare = (words: string): string => words.replace(/\s+/g, "")
  if (bare(text.slice(start, end)) !== bare(mark.quote)) {
    // Where each letter of the page's text sits, spaces left out, so a match found without them maps back.
    const at: number[] = []
    let letters = ""
    for (let i = 0; i < text.length; i++) if (!/\s/.test(text[i])) (letters += text[i], at.push(i))
    const quote = bare(mark.quote)
    if (!quote) return null
    // The words with those around them first, so a phrase that comes twice finds the right one.
    const before = bare(mark.prefix ?? "")
    const whole = mark.prefix || mark.suffix ? letters.indexOf(`${before}${quote}${bare(mark.suffix ?? "")}`) : -1
    const from = whole >= 0 ? whole + before.length : letters.indexOf(quote)
    if (from < 0) return null
    ;[start, end] = [at[from], at[from + quote.length - 1] + 1]
  }
  return { start, end }
}

/** A range over a page's text from one offset to another. */
function rangeAt(nodes: Text[], start: number, end: number): Range | null {
  const range = document.createRange()
  let seen = 0
  let placed = false
  for (const node of nodes) {
    const next = seen + node.data.length
    if (!placed && start < next) {
      range.setStart(node, start - seen)
      placed = true
    }
    if (placed && end <= next) {
      range.setEnd(node, end - seen)
      return range
    }
    seen = next
  }
  return null
}

/**
 * Where a page's pictures sit, in the page's own units: each picture is drawn
 * into a unit square by the transform in force, so the square carried through
 * that transform is its box.
 */
const carry = (x: number, y: number, m: number[]): [number, number] => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]

async function picturesOn(proxy: PDFPageProxy): Promise<number[][]> {
  const list = await proxy.getOperatorList()
  const boxes: number[][] = []
  const kept: number[][] = []
  let now = [1, 0, 0, 1, 0, 0]
  list.fnArray.forEach((fn, at) => {
    if (fn === OPS.save) kept.push(now)
    else if (fn === OPS.restore) now = kept.pop() ?? now
    else if (fn === OPS.transform) now = Util.transform(now, list.argsArray[at] as number[])
    else if (fn === OPS.paintImageXObject || fn === OPS.paintInlineImageXObject || fn === OPS.paintImageXObjectRepeat) {
      const corners = [[0, 0], [1, 0], [0, 1], [1, 1]].map(([x, y]) => carry(x, y, now))
      boxes.push([Math.min(...corners.map((p) => p[0])), Math.min(...corners.map((p) => p[1])), Math.max(...corners.map((p) => p[0])), Math.max(...corners.map((p) => p[1]))])
    }
  })
  return boxes
}

/**
 * "Dark pages" keeps pictures true: pdf.js draws a page in the colours given
 * and turns its pictures to the same two tones, so each picture is put back
 * from the page drawn in its own colours. Not every picture is a photo: a
 * scanned page, or a magazine page laid as one white picture with words over
 * it, is mostly paper. Such a picture is read piece by piece (mixPaper): its
 * print takes the dark page's ground and ink, coloured parts kept (an orange
 * drawing stays orange), its photos kept true. Any other picture is put back whole.
 */
export async function truePictures(proxy: PDFPageProxy, viewport: ReturnType<PDFPageProxy["getViewport"]>, canvas: HTMLCanvasElement, density: number): Promise<void> {
  // Each picture's box on the canvas, in its pixels.
  const boxes = (await picturesOn(proxy)).flatMap((box) => {
    const [x1, y1] = carry(box[0], box[1], viewport.transform)
    const [x2, y2] = carry(box[2], box[3], viewport.transform)
    const x = Math.max(0, Math.floor(Math.min(x1, x2) * density)), y = Math.max(0, Math.floor(Math.min(y1, y2) * density))
    const w = Math.min(canvas.width - x, Math.ceil(Math.abs(x2 - x1) * density)), h = Math.min(canvas.height - y, Math.ceil(Math.abs(y2 - y1) * density))
    return w > 0 && h > 0 ? [{ x, y, w, h }] : []
  })
  if (!boxes.length) return
  // The page in its own colours, drawn only over the pictures (a small photo on a page of text costs a small canvas).
  const left = Math.min(...boxes.map((one) => one.x)), top = Math.min(...boxes.map((one) => one.y))
  const plain = document.createElement("canvas")
  plain.width = Math.max(...boxes.map((one) => one.x + one.w)) - left
  plain.height = Math.max(...boxes.map((one) => one.y + one.h)) - top
  await proxy.render({ canvas: plain, viewport, transform: [density, 0, 0, density, -left, -top] }).promise
  const ink = canvas.getContext("2d")
  const truth = plain.getContext("2d")
  if (!ink || !truth) return
  // Where the page's words are, read from its text: a scanned book's own letters, however big and black, are print.
  let words: number[][] | null = null
  for (const { x, y, w, h } of boxes) {
    const own = truth.getImageData(x - left, y - top, w, h)
    if (!isPaper(own.data)) {
      ink.drawImage(plain, x - left, y - top, w, h, x, y, w, h)
      continue
    }
    words ??= await wordBoxes(proxy, viewport, density)
    const dark = ink.getImageData(x, y, w, h)
    mixPaper(own.data, dark.data, w, h, tileFor(canvas.width), words.map(([a, b, c, d]) => [a - x, b - y, c - x, d - y]))
    ink.putImageData(dark, x, y)
  }
  plain.width = plain.height = 0
}

/**
 * Where each run of a page's words sits on its canvas, as [left, top, right,
 * bottom] in pixels: a scanned page's text (read from the scan, laid unseen over
 * it) says where its print is, the big display type of a chapter's opening too,
 * which by its tones alone reads as a photo and was drawn as hollow outlines.
 */
async function wordBoxes(proxy: PDFPageProxy, viewport: ReturnType<PDFPageProxy["getViewport"]>, density: number): Promise<number[][]> {
  const content = await proxy.getTextContent().catch(() => null)
  const boxes: number[][] = []
  for (const item of content?.items ?? []) {
    if (!("str" in item) || !item.str.trim() || !item.width) continue
    const at = Util.transform(viewport.transform, item.transform)
    const tall = Math.hypot(at[2], at[3])
    // Level lines only: a turned caption is rare, and its box would not be square to the page.
    if (Math.abs(at[1]) > 0.01 * tall || !tall) continue
    const x = at[4], base = at[5], wide = item.width * viewport.scale
    boxes.push([x * density, (base - tall) * density, (x + wide) * density, (base + tall * 0.25) * density])
  }
  return boxes
}

/** The side of a square read as one piece of a page-sized picture (print, or part of a photo), as a share of the
 * page's width: 24px on a page as read, a few on a thumbnail, where squares of 24 took a whole photo for print and
 * drew it as a negative (10 Nov). */
const tileFor = (pageWidth: number): number => Math.max(4, Math.min(24, Math.round(pageWidth / 36)))

/**
 * A page-sized picture holds print and photos side by side (a portrait on a
 * scanned page): each piece of it is read on its own. A piece of print is
 * paper and ink, its few in-between tones spread thin (the soft edges of
 * letters); a piece of a photo or a painting gathers many pixels on one
 * in-between tone (a cheek, a gradient). Print takes the dark page's ground
 * and ink, coloured pixels kept; photo pieces keep every pixel true. A piece
 * that is one flat dark (a black robe, a painting's dark ground) belongs to
 * the photo it touches, else to the print (inside a heavy letter). The
 * weights blend across each piece's middle, so no grid shows; bare white
 * paper always darkens and dark beside a photo stays the photo's, so no pale
 * rim is left round a photo.
 */
function mixPaper(o: Uint8ClampedArray, d: Uint8ClampedArray, w: number, h: number, TILE: number, words: number[][] = []): void {
  const cols = Math.ceil(w / TILE), rows = Math.ceil(h / TILE)
  // 0 print, 1 photo, 2 not yet known.
  const kind = new Uint8Array(cols * rows)
  const bins = new Uint32Array(32)
  // How much of each piece is dark ink: the inside of a big letter is, a word on a grey panel is not.
  const dim = new Float32Array(cols * rows)
  for (let ty = 0; ty < rows; ty++) for (let tx = 0; tx < cols; tx++) {
    bins.fill(0)
    let seen = 0, paper = 0, inked = 0, dimmed = 0
    // Every other pixel each way is enough to tell.
    for (let py = ty * TILE; py < Math.min(h, ty * TILE + TILE); py += 2) for (let px = tx * TILE; px < Math.min(w, tx * TILE + TILE); px += 2) {
      const i = (py * w + px) * 4
      const r = o[i], g = o[i + 1], b = o[i + 2]
      const lum = (r * 77 + g * 150 + b * 29) >> 8
      const chroma = (r > g ? (r > b ? r : b) : g > b ? g : b) - (r < g ? (r < b ? r : b) : g < b ? g : b)
      bins[lum >> 3]++
      seen++
      if (lum > 190 && chroma < 30) paper++
      else if (lum < 70) inked++
      if (lum < 110) dimmed++
    }
    // A photo's tones gather (a cheek, a gradient); the soft edges of print spread thin across many.
    let gathered = 0
    for (let bin = 9; bin < 30; bin++) if (bins[bin] > gathered) gathered = bins[bin]
    kind[ty * cols + tx] = gathered / seen >= 0.15 ? 1 : paper / seen >= 0.1 && inked / seen < 0.5 ? 0 : 2
    dim[ty * cols + tx] = dimmed / seen
  }
  // A piece mostly under the page's own words and mostly dark ink is print, whatever its tones: the inside of a big
  // black letter. Words on a grey panel are left to the tones (a light panel kept true, as before).
  for (const [x1, y1, x2, y2] of words) {
    for (let ty = Math.max(0, Math.floor(y1 / TILE)); ty < Math.min(rows, Math.ceil(y2 / TILE)); ty++) for (let tx = Math.max(0, Math.floor(x1 / TILE)); tx < Math.min(cols, Math.ceil(x2 / TILE)); tx++) {
      const cover = (Math.min(x2, tx * TILE + TILE) - Math.max(x1, tx * TILE)) * (Math.min(y2, ty * TILE + TILE) - Math.max(y1, ty * TILE))
      if (cover >= (TILE * TILE) / 2 && dim[ty * cols + tx] >= 0.5) kind[ty * cols + tx] = 0
    }
  }
  // Flat pieces join the photo they touch.
  const queue: number[] = []
  kind.forEach((one, at) => one === 1 && queue.push(at))
  while (queue.length) {
    const at = queue.pop()!
    const tx = at % cols, ty = (at - tx) / cols
    for (const next of [tx > 0 ? at - 1 : -1, tx < cols - 1 ? at + 1 : -1, ty > 0 ? at - cols : -1, ty < rows - 1 ? at + cols : -1]) {
      if (next >= 0 && kind[next] === 2) (kind[next] = 1, queue.push(next))
    }
  }
  // How much of the dark page's tones each piece takes: 1 for print, 0 for a photo.
  const weight = Float32Array.from(kind, (one) => (one === 1 ? 0 : 1))
  // Each column's piece and how far across it, worked out once; each row's weights blended once.
  const left = new Int32Array(w), across = new Float32Array(w)
  for (let px = 0; px < w; px++) {
    const fx = Math.min(cols - 1, Math.max(0, (px + 0.5) / TILE - 0.5))
    left[px] = Math.min(cols - 2, Math.floor(fx))
    across[px] = fx - left[px]
  }
  const line = new Float32Array(cols + 1), least = new Float32Array(cols + 1)
  for (let py = 0; py < h; py++) {
    const fy = Math.min(rows - 1, Math.max(0, (py + 0.5) / TILE - 0.5)), ty = Math.floor(fy), vy = fy - ty, below = Math.min(rows - 1, ty + 1)
    let print = true
    for (let tx = 0; tx < cols; tx++) {
      const up = weight[ty * cols + tx], down = weight[below * cols + tx]
      line[tx] = up * (1 - vy) + down * vy
      least[tx] = up < down ? up : down
      if (least[tx] < 1) print = false
    }
    line[cols] = line[cols - 1]
    least[cols] = least[cols - 1]
    // A row of print alone, as most rows of a page are: only its coloured pixels are kept.
    if (print) {
      for (let i = py * w * 4, end = i + w * 4; i < end; i += 4) {
        const r = o[i], g = o[i + 1], bl = o[i + 2]
        const chroma = (r > g ? (r > bl ? r : bl) : g > bl ? g : bl) - (r < g ? (r < bl ? r : bl) : g < bl ? g : bl)
        if (chroma <= 20) continue
        const keep = chroma >= 64 ? 1 : (chroma - 20) / 44
        d[i] += (r - d[i]) * keep
        d[i + 1] += (g - d[i + 1]) * keep
        d[i + 2] += (bl - d[i + 2]) * keep
      }
      continue
    }
    for (let px = 0; px < w; px++) {
      const i = (py * w + px) * 4
      const r = o[i], g = o[i + 1], bl = o[i + 2]
      const lum = (r * 77 + g * 150 + bl * 29) >> 8
      const tx = Math.max(0, left[px]), a = line[tx], b = line[tx + 1]
      // Bare paper always darkens, so no pale rim is left round a photo; dark next to a photo stays the photo's.
      const mix = lum > 235 && (r > g ? r - g : g - r) < 16 && (g > bl ? g - bl : bl - g) < 16 ? 1
        : lum < 90 ? (least[tx] < least[tx + 1] ? least[tx] : least[tx + 1])
        : a === b ? a : a + (b - a) * across[px]
      if (mix === 0) {
        d[i] = r, d[i + 1] = g, d[i + 2] = bl
        continue
      }
      // How coloured the true pixel is: grey, black and white take the dark page's tones, colour stays.
      const chroma = (r > g ? (r > bl ? r : bl) : g > bl ? g : bl) - (r < g ? (r < bl ? r : bl) : g < bl ? g : bl)
      const keep = 1 - mix * (chroma <= 20 ? 1 : chroma >= 64 ? 0 : (64 - chroma) / 44)
      if (keep === 0) continue
      d[i] += (r - d[i]) * keep
      d[i + 1] += (g - d[i + 1]) * keep
      d[i + 2] += (bl - d[i + 2]) * keep
    }
  }
}

/** A picture that is at least a third white paper (light and without colour): a scan, or a page laid as one picture. */
function isPaper(data: Uint8ClampedArray): boolean {
  let paper = 0, seen = 0
  // Every 7th pixel is enough to tell.
  for (let i = 0; i < data.length; i += 28) {
    const hi = Math.max(data[i], data[i + 1], data[i + 2]), lo = Math.min(data[i], data[i + 1], data[i + 2])
    seen++
    if (lo > 215 && hi - lo < 25) paper++
  }
  return seen > 0 && paper / seen >= 1 / 3
}

/** The page's marks, drawn as soft bands under its words, measured fresh at the zoom it is drawn at. */
function paintMarks(sheet: HTMLElement, marks: PdfMark[], flash: string | null | undefined, onWords?: (mark: PdfMark, quote: string) => void): void {
  sheet.querySelector(".pdf-marks")?.remove()
  const layer = sheet.querySelector(".textLayer")
  if (!layer || !marks.length) return
  const box = sheet.getBoundingClientRect()
  const paint = document.createElement("div")
  paint.className = "pdf-marks"
  const nodes = textNodes(layer)
  const spots = marks.map((mark) => offsetsOf(layer, mark))
  // Two colours over the same words never blend into a third: where marks overlap, the one listed later is drawn alone.
  const colour = (mark: PdfMark): boolean => !mark.id.startsWith("find:") && mark.color !== "later"
  const bare = (index: number): { start: number; end: number }[] => {
    let parts = spots[index] ? [spots[index]!] : []
    if (!colour(marks[index])) return parts
    marks.forEach((other, later) => {
      const over = spots[later]
      if (later <= index || !over || !colour(other)) return
      parts = parts.flatMap((one) => (over.end <= one.start || over.start >= one.end ? [one] : [{ start: one.start, end: over.start }, { start: over.end, end: one.end }].filter((left) => left.end > left.start)))
    })
    return parts
  }
  marks.forEach((mark, index) => {
    const at = spots[index]
    if (!at || !rangeAt(nodes, at.start, at.end)) return
    // Kept before line ends were read as spaces ("thenature"): its words as the page has them, put right in the store.
    if (onWords && !mark.id.startsWith("find:")) {
      const words = wordsIn(layer, at.start, at.end)
      if (words !== mark.quote && words.replace(/\s+/g, "") === mark.quote.replace(/\s+/g, "")) onWords(mark, words)
    }
    const rects = bare(index).flatMap((part) => [...(rangeAt(nodes, part.start, part.end)?.getClientRects() ?? [])])
    for (const rect of rects) {
      if (!rect.width || !rect.height) continue
      const band = document.createElement("div")
      // A find match is drawn as the note's find draws one; the one stepped to stands out.
      const find = mark.id.startsWith("find:")
      band.className = `pdf-mark${find ? " is-find" : ""}${mark.id === flash ? (find ? " is-current" : " is-flash") : ""}`
      band.dataset.mark = mark.id
      if (mark.color) band.style.setProperty("--mark", markCss(mark.color))
      Object.assign(band.style, { left: `${rect.left - box.left}px`, top: `${rect.top - box.top}px`, width: `${rect.width}px`, height: `${rect.height}px` })
      paint.append(band)
      // "Mark for a card" is an underline and a tick in the margin by its first line, never a band of colour.
      if (mark.color === "later") {
        band.classList.add("is-later")
        if (!paint.querySelector(`.pdf-later-tick[data-mark="${mark.id}"]`)) {
          const tick = document.createElement("div")
          tick.className = "pdf-later-tick"
          tick.dataset.mark = mark.id
          Object.assign(tick.style, { top: `${rect.top - box.top}px`, height: `${rect.height}px` })
          paint.append(tick)
        }
      }
    }
  })
  sheet.insertBefore(paint, layer)
}

/**
 * How many pages past the ones on show are drawn ahead: two the way you are
 * reading, one behind, so a page is drawn before it is reached and going back
 * a little never waits. The nearest go first, the way of reading before behind.
 * No more: pdf.js draws a page on the main thread (its worker only reads the
 * file and decodes pictures), and three ahead and two behind measured slower
 * scrolling on scanned pages in "Dark pages" (qa/pdf-scroll-speed.mjs).
 */
const AHEAD = 2
const BEHIND = 1
const rankAt = (away: number, onward: boolean): number => NEXT_TO + 2 * (away - 1) + (onward ? 0 : 1)

/**
 * A document's pages, one under another, at the width of their box times
 * `zoom`. Only the pages on show and a few either side are drawn; the rest
 * keep their place as empty sheets, so the scrollbar is true from the start.
 * Each drawn page has its words laid over it, so text can be selected.
 */
/** The room between two pages side by side: the gap between pages one under another (pdf.css). */
const GAP = 12

export function PdfPages({
  src,
  zoom = 1,
  scroller,
  onLoad,
  marks = [],
  flash,
  land,
  fit = "width",
  spread = false,
  dark = false,
  onWords,
}: {
  src: string
  zoom?: number
  /** What scrolls the pages; their own box when not given. */
  scroller?: React.RefObject<HTMLElement | null>
  onLoad?: (doc: PDFDocumentProxy) => void
  /** Kept words to draw, on whichever pages they are on. */
  marks?: PdfMark[]
  /** A mark to flash once as its page is drawn: the one a gem's link came back to. */
  flash?: string | null
  /** The page to open at, scrolled to once the sheets are laid out. */
  land?: number
  /** A page as wide as the box, or as tall as what scrolls it (a whole page in view). */
  fit?: "width" | "height"
  /** Two pages side by side, as a book lies open: the cover alone on the right, as a printed book opens. */
  spread?: boolean
  /** "Dark pages": text and lines drawn light on the theme's dark, pictures kept true. */
  dark?: boolean
  /** A kept mark whose words the drawn page reads with spaces its quote lacks: put it right. */
  onWords?: (mark: PdfMark, quote: string) => void
}): React.JSX.Element {
  const box = useRef<HTMLDivElement>(null)
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null)
  const [failed, setFailed] = useState(false)
  // Width and height of page 1 at scale 1: every sheet's size until its own is known.
  const [size, setSize] = useState<{ w: number; h: number } | null>(null)
  const [width, setWidth] = useState(0)
  const [tall, setTall] = useState(0)
  // The pages drawn, each with how wanted it is: in view, or one either side of those.
  const [shown, setShown] = useState<Map<number, number>>(() => new Map([[1, IN_VIEW]]))

  useEffect(() => {
    let live = true
    const putDown = holdPdf(src)
    loadPdf(src)
      .then(async (loaded) => {
        const first = (await loaded.getPage(1)).getViewport({ scale: 1 })
        if (!live) return
        setSize({ w: first.width, h: first.height })
        setDoc(loaded)
        onLoad?.(loaded)
      })
      .catch(() => live && setFailed(true))
    return () => {
      live = false
      putDown()
    }
    // onLoad is read once per document on purpose.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src])

  useLayoutEffect(() => {
    const el = box.current
    if (!el) return
    // The height that matters for fitting a page is what scrolls it, less its padding. Its ref is not set yet
    // while this runs (a parent's refs come after a child's layout effects), so it is found as the box around these pages.
    const view = scroller?.current ?? el.parentElement ?? el
    const measure = (): void => {
      setWidth(el.clientWidth)
      const pad = getComputedStyle(view)
      setTall(view.clientHeight - parseFloat(pad.paddingTop || "0") - parseFloat(pad.paddingBottom || "0"))
    }
    const watch = new ResizeObserver(measure)
    watch.observe(el)
    if (view !== el) watch.observe(view)
    return () => watch.disconnect()
  }, [scroller])

  // Which way you are reading: down (1) or up (-1), from the last scroll.
  const heading = useRef(1)
  // Which sheets are on show: drawn, with a few either side. Watched once the
  // sheets exist, which needs both the document and the box's width.
  const laidOut = !!size && width > 0
  useEffect(() => {
    const el = box.current
    if (!el || !doc || !laidOut) return
    const seen = new Set<number>()
    const watch = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const page = Number((entry.target as HTMLElement).dataset.page)
          if (entry.isIntersecting) seen.add(page)
          else seen.delete(page)
        }
        const next = new Map<number, number>()
        const want = (at: number, rank: number): void => {
          if (at >= 1 && at <= doc.numPages && !((next.get(at) ?? Infinity) <= rank)) next.set(at, rank)
        }
        for (const page of seen) {
          want(page, IN_VIEW)
          for (let away = 1; away <= AHEAD; away++) want(page + heading.current * away, rankAt(away, true))
          for (let away = 1; away <= BEHIND; away++) want(page - heading.current * away, rankAt(away, false))
        }
        setShown(next)
      },
      { root: scroller?.current ?? null },
    )
    el.querySelectorAll<HTMLElement>(".pdf-page").forEach((sheet) => watch.observe(sheet))
    if (land && land > 1) el.querySelector<HTMLElement>(`.pdf-page[data-page="${land}"]`)?.scrollIntoView({ block: "start" })
    return () => watch.disconnect()
  }, [doc, scroller, laidOut])

  // Two a row share the width, less the gap between them; fit height never lets a page outgrow the width either.
  const across = spread ? (width - GAP) / 2 - 1 : width
  const wide = size && width ? across / size.w : 0
  // A spread at Fit fits its whole height too, as Preview's Two Pages does: two pages never run off the bottom.
  const scale = ((fit === "height" || spread) && size && tall > 0 ? Math.min(wide, tall / size.h) : wide) * zoom

  // The page at the top of the view, and how far down it: kept as you scroll,
  // and put back when the pages change size (a pane gliding open, the rail
  // squeezing), so the place you read never drifts to pages not yet drawn.
  const place = useRef<{ page: number; f: number } | null>(null)
  useEffect(() => {
    const view = scroller?.current ?? box.current?.parentElement
    if (!view) return
    let last = view.scrollTop
    const note = (): void => {
      pagesScrolled()
      pagesAt(view.scrollTop)
      const now = view.scrollTop
      if (now !== last) heading.current = now > last ? 1 : -1
      last = now
      const top = view.getBoundingClientRect().top
      // The first sheet whose bottom is past the view's top, found by halves: a few reads, not one per page.
      const sheet = sheetAt(box.current, (r) => r.bottom > top)
      if (sheet) {
        const r = sheet.getBoundingClientRect()
        place.current = { page: Number(sheet.dataset.page), f: (top - r.top) / r.height }
      }
    }
    view.addEventListener("scroll", note, { passive: true })
    return () => view.removeEventListener("scroll", note)
  }, [scroller, laidOut])
  useLayoutEffect(() => {
    const view = scroller?.current ?? box.current?.parentElement
    const kept = place.current
    const sheet = kept && box.current?.querySelector<HTMLElement>(`.pdf-page[data-page="${kept.page}"]`)
    if (!view || !kept || !sheet) return
    const r = sheet.getBoundingClientRect()
    view.scrollTop += r.top + kept.f * r.height - view.getBoundingClientRect().top
  }, [scale, scroller])

  // Each page's marks, gathered once: a page whose marks did not change is handed the same list, and is not drawn again.
  const byPage = useMemo(() => {
    const all = new Map<number, PdfMark[]>()
    for (const mark of marks) all.set(mark.page, [...(all.get(mark.page) ?? []), mark])
    return all
  }, [marks])
  // The latest "put right" handler, behind one that never changes, so a new one from the reader redraws no page.
  const wordsNow = useRef(onWords)
  wordsNow.current = onWords
  const fixWords = useMemo(() => (mark: PdfMark, quote: string) => wordsNow.current?.(mark, quote), [])

  if (failed) return <div className="pdf-pages is-failed">This PDF could not be read.</div>
  return (
    <div ref={box} className={`pdf-pages${spread ? " is-spread" : ""}`} data-fit={fit}>
      {doc && scale > 0 && spread && <div aria-hidden className="pdf-page-gap" style={{ width: size!.w * scale, height: size!.h * scale }} />}
      {doc && scale > 0 &&
        Array.from({ length: doc.numPages }, (_, index) => (
          <PdfPage key={index + 1} doc={doc} page={index + 1} scale={scale} guess={size!} rank={shown.get(index + 1)} marks={byPage.get(index + 1) ?? NO_MARKS} flash={flash} onWords={onWords ? fixWords : undefined} dark={dark} />
        ))}
    </div>
  )
}

const NO_MARKS: PdfMark[] = []

/**
 * The sheet of `pages` (a `.pdf-pages` box) that is first to pass `test`, found
 * by halves: the sheets run top to bottom, so a scroll reads a few of them, not
 * every page of a long book.
 */
export function sheetAt(pages: Element | null | undefined, test: (box: DOMRect) => boolean): HTMLElement | null {
  const sheets = pages?.children
  if (!sheets) return null
  let low = 0, high = sheets.length - 1, found: HTMLElement | null = null
  while (low <= high) {
    const mid = (low + high) >> 1
    const one = sheets[mid] as HTMLElement
    // The empty sheet before a spread's cover is no page: it is taken with the first.
    if (test(one.getBoundingClientRect())) (found = one.dataset.page ? one : (sheets[mid + 1] as HTMLElement) ?? null, (high = mid - 1))
    else low = mid + 1
  }
  return found
}

/** One sheet: its size always, its picture and words only while near the view. Drawn again only when its own props change. */
const PdfPage = memo(function PdfPage({ doc, page, scale, guess, rank, marks, flash, onWords, dark = false }: { doc: PDFDocumentProxy; page: number; scale: number; guess: { w: number; h: number }; rank?: number; marks: PdfMark[]; flash?: string | null; onWords?: (mark: PdfMark, quote: string) => void; dark?: boolean }): React.JSX.Element {
  const sheet = useRef<HTMLDivElement>(null)
  const [own, setOwn] = useState<{ w: number; h: number } | null>(null)
  // The words on this page are laid out: marks can be measured against them.
  const [worded, setWorded] = useState(0)
  const key = marks.map((mark) => `${mark.id}:${mark.color ?? ""}`).join(" ")
  useEffect(() => {
    if (sheet.current && worded) paintMarks(sheet.current, marks, flash, onWords)
    // Marks are compared by their ids and colours: a new array with the same ones is no change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [worded, key, flash])
  const size = own ?? guess

  const drawn = rank !== undefined
  // How wanted it is now: a page drawn ahead that comes into view moves up the queue, its drawing kept going.
  const wanted = useRef(rank)
  wanted.current = rank
  const turn = useRef<Turn | null>(null)
  // Drawn since it last left the view: its pdf.js page holds memory to let go.
  const opened = useRef(false)
  useEffect(() => void (rank !== undefined && turn.current?.rerank(rank)), [rank])
  useEffect(() => {
    const el = sheet.current
    if (!el) return
    // Far from the view: the sheet keeps its size and lets its picture go, and pdf.js the page's fonts and pictures.
    if (!drawn) {
      el.replaceChildren()
      if (opened.current) {
        opened.current = false
        void doc.getPage(page).then((proxy) => proxy.cleanup()).catch(() => {})
      }
      return
    }
    opened.current = true
    let live = true
    let stop = (): void => {}
    const ratio = window.devicePixelRatio || 1
    const key = `${doc.fingerprints[0]}:${page}:${scale}:${ratio}:${dark ? "dark" : "light"}`
    const colours = dark ? { pageColors: DARK_PAGE } : {}
    /** A canvas for this page at `density` pixels to a point of the view; CSS lays it over the sheet's whole box. */
    const canvasAt = (viewport: { width: number; height: number }, density: number): HTMLCanvasElement => {
      const canvas = document.createElement("canvas")
      canvas.width = Math.floor(viewport.width * density)
      canvas.height = Math.floor(viewport.height * density)
      canvas.className = "pdf-canvas"
      return canvas
    }
    /** The words laid over the picture, once it shows: never ahead of it in the worker. */
    const words = (proxy: PDFPageProxy): Promise<void> => {
      if (!live) return Promise.resolve()
      const layer = document.createElement("div")
      layer.className = "textLayer"
      const text = new TextLayer({ textContentSource: proxy.streamTextContent(), container: layer, viewport: proxy.getViewport({ scale }) })
      stop = () => text.cancel()
      return text.render().then(() => {
        if (!live) return
        // What a drag past the last line lands on: stretched over the page while selecting, so overshooting the
        // words, down or off at an angle, still takes them to the end (PDF.js's own viewer does the same).
        const end = document.createElement("div")
        end.className = "endOfContent"
        layer.append(end)
        el.querySelector(".textLayer")?.remove()
        el.append(layer)
        setWorded((count) => count + 1)
      })
    }
    const sized = (proxy: PDFPageProxy): void => {
      const base = proxy.getViewport({ scale: 1 })
      setOwn({ w: base.width, h: base.height })
    }
    // Drawn sharp a moment ago: shown at once, without waiting a turn; only its words are laid again.
    const cached = keptPage(key)
    if (cached) {
      void doc.getPage(page).then((proxy) => {
        if (!live) return
        sized(proxy)
        el.replaceChildren(cached)
        return words(proxy)
      }).catch(() => {})
      return () => {
        live = false
        stop()
      }
    }
    const drop = (turn.current = drawInTurn(wanted.current ?? IN_VIEW, async (stopped) => {
      // Flung past at speed: drawn only once the pages slow to reading, if it is still wanted then.
      await calm()
      if (!live || stopped()) return
      const proxy = await doc.getPage(page)
      if (!live || stopped()) return
      sized(proxy)
      const viewport = proxy.getViewport({ scale })
      // A rough picture first, at half the view's size, so the page shows while the sharp one is drawn.
      // Skipped when a picture of it is already up (a zoom): the old one stays until the sharp one replaces it;
      // and for a page drawn ahead, out of sight, which nobody sees until its sharp picture is long up.
      if (!el.querySelector("canvas") && (wanted.current ?? IN_VIEW) === IN_VIEW) {
        const rough = canvasAt(viewport, 0.5)
        rough.dataset.pass = "rough"
        const quick = proxy.render({ canvas: rough, viewport, transform: [0.5, 0, 0, 0.5, 0, 0], ...colours })
        stop = () => quick.cancel()
        await quick.promise
        if (!live || stopped()) return
        el.replaceChildren(rough)
      }
      // Drawn at the screen's own density, so text is sharp on a Retina display.
      const sharp = canvasAt(viewport, ratio)
      const task = proxy.render({ canvas: sharp, viewport, transform: ratio === 1 ? undefined : [ratio, 0, 0, ratio, 0, 0], ...colours })
      stop = () => task.cancel()
      await task.promise
      if (dark) await truePictures(proxy, viewport, sharp, ratio)
      if (!live) return
      el.replaceChildren(sharp)
      keepPage(key, sharp)
      return words(proxy)
    }))
    return () => {
      // The old picture stays until the new one is ready: no blank flash on zoom.
      live = false
      drop()
      stop()
    }
  }, [doc, page, scale, drawn, dark])

  return (
    <div
      ref={sheet}
      className="pdf-page"
      data-page={page}
      style={{ width: size.w * scale, height: size.h * scale, "--total-scale-factor": scale } as React.CSSProperties}
    />
  )
})
