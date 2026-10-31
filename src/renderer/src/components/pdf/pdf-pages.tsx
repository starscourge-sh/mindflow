import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { GlobalWorkerOptions, TextLayer, getDocument, type PDFDocumentProxy, type PDFPageProxy } from "pdfjs-dist"
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url"
import "./pdf.css"
import { markCss } from "./read-bar"
import { AHEAD as NEXT_TO, IN_VIEW, drawInTurn, keepPage, keptPage } from "./pdf-draw"

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
  /** Two pages side by side, as a book lies open. */
  spread?: boolean
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
        const next = new Map<number, number>()
        for (const page of seen) for (let at = page - AHEAD; at <= page + AHEAD; at++) if (at >= 1 && at <= doc.numPages) next.set(at, NEXT_TO)
        for (const page of seen) next.set(page, IN_VIEW)
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
  const scale = (fit === "height" && size && tall > 0 ? Math.min(wide, tall / size.h) : wide) * zoom

  // The page at the top of the view, and how far down it: kept as you scroll,
  // and put back when the pages change size (a pane gliding open, the rail
  // squeezing), so the place you read never drifts to pages not yet drawn.
  const place = useRef<{ page: number; f: number } | null>(null)
  useEffect(() => {
    const view = scroller?.current ?? box.current?.parentElement
    if (!view) return
    const note = (): void => {
      const top = view.getBoundingClientRect().top
      for (const sheet of box.current?.querySelectorAll<HTMLElement>(".pdf-page") ?? []) {
        const r = sheet.getBoundingClientRect()
        if (r.bottom > top) return void (place.current = { page: Number(sheet.dataset.page), f: (top - r.top) / r.height })
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

  if (failed) return <div className="pdf-pages is-failed">This PDF could not be read.</div>
  return (
    <div ref={box} className={`pdf-pages${spread ? " is-spread" : ""}`} data-fit={fit}>
      {doc && scale > 0 &&
        Array.from({ length: doc.numPages }, (_, index) => (
          <PdfPage key={index + 1} doc={doc} page={index + 1} scale={scale} guess={size!} rank={shown.get(index + 1)} marks={marks.filter((mark) => mark.page === index + 1)} flash={flash} />
        ))}
    </div>
  )
}

/** One sheet: its size always, its picture and words only while near the view. */
function PdfPage({ doc, page, scale, guess, rank, marks, flash }: { doc: PDFDocumentProxy; page: number; scale: number; guess: { w: number; h: number }; rank?: number; marks: PdfMark[]; flash?: string | null }): React.JSX.Element {
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

  const drawn = rank !== undefined
  useEffect(() => {
    const el = sheet.current
    if (!el) return
    // Far from the view: the sheet keeps its size and lets its picture go.
    if (!drawn) {
      el.replaceChildren()
      return
    }
    let live = true
    let stop = (): void => {}
    const ratio = window.devicePixelRatio || 1
    const key = `${doc.fingerprints[0]}:${page}:${scale}:${ratio}`
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
    const drop = drawInTurn(rank, async (stopped) => {
      const proxy = await doc.getPage(page)
      if (!live || stopped()) return
      sized(proxy)
      const viewport = proxy.getViewport({ scale })
      // A rough picture first, at half the view's size, so the page shows while the sharp one is drawn.
      // Skipped when a picture of it is already up (a zoom): the old one stays until the sharp one replaces it.
      if (!el.querySelector("canvas")) {
        const rough = canvasAt(viewport, 0.5)
        rough.dataset.pass = "rough"
        const quick = proxy.render({ canvas: rough, viewport, transform: [0.5, 0, 0, 0.5, 0, 0] })
        stop = () => quick.cancel()
        await quick.promise
        if (!live || stopped()) return
        el.replaceChildren(rough)
      }
      // Drawn at the screen's own density, so text is sharp on a Retina display.
      const sharp = canvasAt(viewport, ratio)
      const task = proxy.render({ canvas: sharp, viewport, transform: ratio === 1 ? undefined : [ratio, 0, 0, ratio, 0, 0] })
      stop = () => task.cancel()
      await task.promise
      if (!live) return
      el.replaceChildren(sharp)
      keepPage(key, sharp)
      return words(proxy)
    })
    return () => {
      // The old picture stays until the new one is ready: no blank flash on zoom.
      live = false
      drop()
      stop()
    }
  }, [doc, page, scale, drawn, rank])

  return (
    <div
      ref={sheet}
      className="pdf-page"
      data-page={page}
      style={{ width: size.w * scale, height: size.h * scale, "--total-scale-factor": scale } as React.CSSProperties}
    />
  )
}
