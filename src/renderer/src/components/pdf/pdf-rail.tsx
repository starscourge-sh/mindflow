import { useEffect, useRef, useState } from "react"
import type { PDFDocumentProxy } from "pdfjs-dist"

/** Which list the rail shows: the pages small, or the PDF's own outline. Highlights are in Details. */
export type RailTab = "pages" | "outline"

/** The rail's width, as you last dragged it: between a narrow column of pages and a wide list. */
const NARROW = 152
const WIDE = 360
export const railWidth = (): number => Math.min(WIDE, Math.max(NARROW, Number(localStorage.getItem("pdf-rail-width")) || 200))

/**
 * Beside the pages, never over them: the left rail of Preview, Zotero and
 * Skim. Its tabs along the top, its list under them, and its right edge
 * dragged to make it wider or narrower, remembered for every PDF.
 */
export function PdfRail({ tab, tabs, onTab, children }: { tab: RailTab; tabs: { id: RailTab; label: string }[]; onTab: (tab: RailTab) => void; children: React.ReactNode }): React.JSX.Element {
  const [width, setWidth] = useState(railWidth)
  const drag = (event: React.PointerEvent<HTMLDivElement>): void => {
    event.preventDefault()
    const from = event.clientX - width
    const handle = event.currentTarget
    handle.setPointerCapture(event.pointerId)
    let now = width
    const move = (moved: PointerEvent): void => setWidth((now = Math.min(WIDE, Math.max(NARROW, moved.clientX - from))))
    const up = (): void => {
      handle.removeEventListener("pointermove", move)
      localStorage.setItem("pdf-rail-width", String(Math.round(now)))
    }
    handle.addEventListener("pointermove", move)
    handle.addEventListener("pointerup", up, { once: true })
  }
  return (
    <aside className="pdf-rail" style={{ width }} aria-label="Sidebar">
      <div className="pdf-rail-tabs" role="tablist">
        {tabs.map((one) => (
          <button key={one.id} type="button" role="tab" aria-selected={one.id === tab} className="pdf-rail-tab" onClick={() => onTab(one.id)}>
            {one.label}
          </button>
        ))}
      </div>
      <div className="pdf-rail-list" role="tabpanel">
        {children}
      </div>
      <div className="pdf-rail-edge" role="separator" aria-orientation="vertical" aria-label="Sidebar width" onPointerDown={drag} />
    </aside>
  )
}

/**
 * One page small, drawn only once it scrolls into the rail's view: a long
 * book never draws hundreds of pages it is not showing.
 */
export function PdfThumb({ doc, page, here, onGo }: { doc: PDFDocumentProxy; page: number; here: boolean; onGo: () => void }): React.JSX.Element {
  const box = useRef<HTMLButtonElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const [shape, setShape] = useState(1.3)
  const [seen, setSeen] = useState(false)
  useEffect(() => {
    const el = box.current
    if (!el) return
    const watch = new IntersectionObserver(([one]) => one.isIntersecting && setSeen(true), { rootMargin: "300px 0px" })
    watch.observe(el)
    return () => watch.disconnect()
  }, [])
  useEffect(() => {
    if (!seen) return
    let live = true
    let task: { cancel: () => void } | null = null
    void doc.getPage(page).then((one) => {
      const flat = one.getViewport({ scale: 1 })
      if (!live || !canvas.current) return
      setShape(flat.height / flat.width)
      // As wide as the rail at its widest: sharp on a Retina screen at the usual width.
      const viewport = one.getViewport({ scale: WIDE / flat.width })
      canvas.current.width = Math.round(viewport.width)
      canvas.current.height = Math.round(viewport.height)
      const ink = canvas.current.getContext("2d")
      if (!ink) return
      const render = one.render({ canvasContext: ink, viewport, canvas: canvas.current })
      task = render
      render.promise.catch(() => {})
    })
    return () => {
      live = false
      task?.cancel()
    }
  }, [seen, doc, page])
  useEffect(() => {
    if (here) box.current?.scrollIntoView({ block: "nearest" })
  }, [here])
  return (
    <button ref={box} type="button" className={`pdf-thumb${here ? " is-here" : ""}`} aria-label={`Page ${page}`} aria-current={here ? "page" : undefined} onClick={onGo}>
      <span className="pdf-thumb-sheet" style={{ aspectRatio: `1 / ${shape}` }}>
        <canvas ref={canvas} />
      </span>
      <span className="pdf-thumb-number">{page}</span>
    </button>
  )
}
