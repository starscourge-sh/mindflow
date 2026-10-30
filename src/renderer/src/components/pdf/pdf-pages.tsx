import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { GlobalWorkerOptions, TextLayer, getDocument, type PDFDocumentProxy } from "pdfjs-dist"
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url"
import "./pdf.css"

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
}: {
  src: string
  zoom?: number
  /** What scrolls the pages; their own box when not given. */
  scroller?: React.RefObject<HTMLElement | null>
  onLoad?: (doc: PDFDocumentProxy) => void
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
    return () => watch.disconnect()
  }, [doc, scroller, laidOut])

  if (failed) return <div className="pdf-pages is-failed">This PDF could not be read.</div>
  const scale = size && width ? (width / size.w) * zoom : 0
  return (
    <div ref={box} className="pdf-pages">
      {doc && scale > 0 &&
        Array.from({ length: doc.numPages }, (_, index) => (
          <PdfPage key={index + 1} doc={doc} page={index + 1} scale={scale} guess={size!} drawn={shown.has(index + 1)} />
        ))}
    </div>
  )
}

/** One sheet: its size always, its picture and words only while near the view. */
function PdfPage({ doc, page, scale, guess, drawn }: { doc: PDFDocumentProxy; page: number; scale: number; guess: { w: number; h: number }; drawn: boolean }): React.JSX.Element {
  const sheet = useRef<HTMLDivElement>(null)
  const [own, setOwn] = useState<{ w: number; h: number } | null>(null)
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
          return text.render()
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
