import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { GlobalWorkerOptions, TextLayer, getDocument, type PDFDocumentProxy } from "pdfjs-dist"
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url"
import "./pdf.css"
import { markCss } from "./read-bar"

// The worker ships beside the page as a file of the app's own, so the page's
// policy (script-src 'self') lets it run.
GlobalWorkerOptions.workerSrc = workerUrl

/** One open document per address, shared by every view of it in the window. */
const open = new Map<string, Promise<PDFDocumentProxy>>()

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

/** The title it carries, else the file name without `.pdf`. */
export async function pdfTitle(doc: PDFDocumentProxy, name: string): Promise<string> {
  const meta = await doc.getMetadata().catch(() => null)
  const title = (meta?.info as { Title?: string } | undefined)?.Title?.trim()
  return title || name.replace(/\.pdf$/i, "")
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

/** The range a mark covers on a drawn page; found again by its words if the offsets no longer match. */
export function rangeOf(layer: Element, mark: PdfMark): Range | null {
  const nodes = textNodes(layer)
  const text = nodes.map((node) => node.data).join("")
  let { start, end } = mark
  if (text.slice(start, end) !== mark.quote) {
    // The words with those around them first, so a phrase that comes twice finds the right one.
    const near = `${mark.prefix ?? ""}${mark.quote}${mark.suffix ?? ""}`
    const whole = mark.prefix || mark.suffix ? text.indexOf(near) : -1
    const at = whole >= 0 ? whole + (mark.prefix ?? "").length : text.indexOf(mark.quote)
    if (at < 0) return null
    ;[start, end] = [at, at + mark.quote.length]
  }
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

/** The page's marks, drawn as soft bands under its words, measured fresh at the zoom it is drawn at. */
function paintMarks(sheet: HTMLElement, marks: PdfMark[], flash: string | null | undefined): void {
  sheet.querySelector(".pdf-marks")?.remove()
  const layer = sheet.querySelector(".textLayer")
  if (!layer || !marks.length) return
  const box = sheet.getBoundingClientRect()
  const paint = document.createElement("div")
  paint.className = "pdf-marks"
  for (const mark of marks) {
    const range = rangeOf(layer, mark)
    if (!range) continue
    for (const rect of range.getClientRects()) {
      if (!rect.width || !rect.height) continue
      const band = document.createElement("div")
      // A find match is drawn as the note's find draws one; the one stepped to stands out.
      const find = mark.id.startsWith("find:")
      band.className = `pdf-mark${find ? " is-find" : ""}${mark.id === flash ? (find ? " is-current" : " is-flash") : ""}`
      band.dataset.mark = mark.id
      if (mark.color) band.style.setProperty("--mark", markCss(mark.color))
      Object.assign(band.style, { left: `${rect.left - box.left}px`, top: `${rect.top - box.top}px`, width: `${rect.width}px`, height: `${rect.height}px` })
      paint.append(band)
      // "Card later" is an underline and a tick in the margin by its first line, never a band of colour.
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
  }
  sheet.insertBefore(paint, layer)
}

/** How many pages either side of the ones on show are drawn ahead. */
const AHEAD = 1

/**
 * A document's pages, one under another, at the width of their box times
 * `zoom`. Only the pages on show and one either side are drawn; the rest
 * keep their place as empty sheets, so the scrollbar is true from the start.
 * Each drawn page has its words laid over it, so text can be selected.
 */
export function PdfPages({
  src,
  zoom = 1,
  scroller,
  onLoad,
  marks = [],
  flash,
  land,
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
}): React.JSX.Element {
  const box = useRef<HTMLDivElement>(null)
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null)
  const [failed, setFailed] = useState(false)
  // Width and height of page 1 at scale 1: every sheet's size until its own is known.
  const [size, setSize] = useState<{ w: number; h: number } | null>(null)
  const [width, setWidth] = useState(0)
  const [shown, setShown] = useState<Set<number>>(new Set([1]))

  useEffect(() => {
    let live = true
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
    }
    // onLoad is read once per document on purpose.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src])

  useLayoutEffect(() => {
    const el = box.current
    if (!el) return
    const watch = new ResizeObserver(() => setWidth(el.clientWidth))
    watch.observe(el)
    return () => watch.disconnect()
  }, [])

  // Which sheets are on show: drawn, with one either side. Watched once the
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
        const next = new Set<number>()
        for (const page of seen) for (let at = page - AHEAD; at <= page + AHEAD; at++) if (at >= 1 && at <= doc.numPages) next.add(at)
        setShown(next)
      },
      { root: scroller?.current ?? null },
    )
    el.querySelectorAll<HTMLElement>(".pdf-page").forEach((sheet) => watch.observe(sheet))
    if (land && land > 1) el.querySelector<HTMLElement>(`.pdf-page[data-page="${land}"]`)?.scrollIntoView({ block: "start" })
    return () => watch.disconnect()
  }, [doc, scroller, laidOut])

  if (failed) return <div className="pdf-pages is-failed">This PDF could not be read.</div>
  const scale = size && width ? (width / size.w) * zoom : 0
  return (
    <div ref={box} className="pdf-pages">
      {doc && scale > 0 &&
        Array.from({ length: doc.numPages }, (_, index) => (
          <PdfPage key={index + 1} doc={doc} page={index + 1} scale={scale} guess={size!} drawn={shown.has(index + 1)} marks={marks.filter((mark) => mark.page === index + 1)} flash={flash} />
        ))}
    </div>
  )
}

/** One sheet: its size always, its picture and words only while near the view. */
function PdfPage({ doc, page, scale, guess, drawn, marks, flash }: { doc: PDFDocumentProxy; page: number; scale: number; guess: { w: number; h: number }; drawn: boolean; marks: PdfMark[]; flash?: string | null }): React.JSX.Element {
  const sheet = useRef<HTMLDivElement>(null)
  const [own, setOwn] = useState<{ w: number; h: number } | null>(null)
  // The words on this page are laid out: marks can be measured against them.
  const [worded, setWorded] = useState(0)
  const key = marks.map((mark) => `${mark.id}:${mark.color ?? ""}`).join(" ")
  useEffect(() => {
    if (sheet.current && worded) paintMarks(sheet.current, marks, flash)
    // Marks are compared by their ids and colours: a new array with the same ones is no change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [worded, key, flash])
  const size = own ?? guess

  useEffect(() => {
    const el = sheet.current
    if (!el) return
    // Far from the view: the sheet keeps its size and lets its picture go.
    if (!drawn) {
      el.replaceChildren()
      return
    }
    let stop = (): void => {}
    let live = true
    void doc.getPage(page).then((proxy) => {
      if (!live) return
      const base = proxy.getViewport({ scale: 1 })
      setOwn({ w: base.width, h: base.height })
      const viewport = proxy.getViewport({ scale })
      // Drawn at the screen's own density, so text is sharp on a Retina display.
      const ratio = window.devicePixelRatio || 1
      const canvas = document.createElement("canvas")
      canvas.width = Math.floor(viewport.width * ratio)
      canvas.height = Math.floor(viewport.height * ratio)
      canvas.className = "pdf-canvas"
      const words = document.createElement("div")
      words.className = "textLayer"
      const task = proxy.render({ canvas, viewport, transform: ratio === 1 ? undefined : [ratio, 0, 0, ratio, 0, 0] })
      const text = new TextLayer({ textContentSource: proxy.streamTextContent(), container: words, viewport })
      stop = () => {
        task.cancel()
        text.cancel()
      }
      void task.promise
        .then(() => {
          if (!live) return
          el.replaceChildren(canvas, words)
          return text.render().then(() => {
            if (live) setWorded((count) => count + 1)
          })
        })
        .catch(() => {})
    })
    return () => {
      // The old picture stays until the new one is ready: no blank flash on zoom.
      live = false
      stop()
    }
  }, [doc, page, scale, drawn])

  return (
    <div
      ref={sheet}
      className="pdf-page"
      data-page={page}
      style={{ width: size.w * scale, height: size.h * scale, "--total-scale-factor": scale } as React.CSSProperties}
    />
  )
}
