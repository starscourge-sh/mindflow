import { useEffect, useRef, useState } from "react"
import type { PDFDocumentProxy } from "pdfjs-dist"
import { Minus, Moon, Plus, Sun } from "lucide-react"
import { Button } from "@/components/tiptap-ui-primitive/button"
import { Roll } from "@/lib/roll"
import { PdfPages, pdfTitle } from "./pdf-pages"

/** The zoom steps, as Preview's: fit width is 1. */
const ZOOMS = [0.5, 0.67, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3]

/** Where a PDF opens full size: `haligtree:pdf`, read by the main window, which opens it in a pane. */
export const openPdf = (src: string, name: string, page?: number): void =>
  void window.dispatchEvent(new CustomEvent("haligtree:pdf", { detail: { src, name, page } }))

/** A pane's `focus` for a PDF: its address and the name it arrived under. */
export const pdfFocus = (src: string, name: string): string => `${src}|${name}`
export const fromPdfFocus = (focus: string): { src: string; name: string } => {
  const at = focus.indexOf("|")
  return at < 0 ? { src: focus, name: "" } : { src: focus.slice(0, at), name: focus.slice(at + 1) }
}

/**
 * A PDF full size, in a pane of its own: its title, the page you are on
 * (type one to go there), zoom from half to three times the pane's width, and
 * a dark page for reading at night.
 */
export function PdfReader({ src, name, page: start, onPage }: { src: string; name: string; page?: number; onPage?: (page: number) => void }): React.JSX.Element {
  const scroller = useRef<HTMLDivElement>(null)
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null)
  const [title, setTitle] = useState(name.replace(/\.pdf$/i, ""))
  const [zoom, setZoom] = useState(1)
  const [page, setPage] = useState(start ?? 1)
  const [typed, setTyped] = useState<string | null>(null)
  const [dark, setDark] = useState(() => localStorage.getItem("pdf-dark") === "1")

  const go = (to: number): void => {
    if (!doc) return
    const n = Math.min(Math.max(1, Math.round(to)), doc.numPages)
    scroller.current?.querySelector<HTMLElement>(`.pdf-page[data-page="${n}"]`)?.scrollIntoView({ block: "start" })
    setPage(n)
  }
  // Opened at a page (a gem's link back): there once the sheets are laid out.
  // Back and Forward bring a page back too; the page you scroll to is kept, so it never jumps.
  useEffect(() => {
    if (doc && start && start !== page) go(start)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc, start])

  const step = (by: number): void => {
    const at = ZOOMS.findIndex((one) => one >= zoom - 0.001)
    setZoom(ZOOMS[Math.min(Math.max(0, (at < 0 ? ZOOMS.length - 1 : at) + by), ZOOMS.length - 1)])
  }
  // ⌘+ ⌘− ⌘0 while the pointer or focus is in the reader: its own zoom, not the app's size.
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (!event.metaKey || event.altKey || !scroller.current) return
      const here = scroller.current.closest(".pdf-reader")
      if (!here || !(here.contains(document.activeElement) || here.matches(":hover"))) return
      const by = event.key === "=" || event.key === "+" ? 1 : event.key === "-" ? -1 : event.key === "0" ? 0 : null
      if (by === null) return
      event.preventDefault()
      event.stopPropagation()
      if (by === 0) setZoom(1)
      else step(by)
    }
    window.addEventListener("keydown", onKey, true)
    return () => window.removeEventListener("keydown", onKey, true)
  })

  // The page on show: the last sheet whose top has passed a third of the way down.
  const onScroll = (): void => {
    const box = scroller.current
    if (!box) return
    const line = box.getBoundingClientRect().top + box.clientHeight / 3
    let at = 1
    for (const sheet of box.querySelectorAll<HTMLElement>(".pdf-page")) {
      if (sheet.getBoundingClientRect().top > line) break
      at = Number(sheet.dataset.page)
    }
    if (at !== page) {
      setPage(at)
      onPage?.(at)
    }
  }

  return (
    <div className={`pdf-reader${dark ? " is-dark" : ""}`}>
      <div className="pdf-reader-bar">
        <span className="pdf-reader-title" title={title}>{title}</span>
        <span className="pdf-reader-page">
          <input
            aria-label="Page"
            className="pdf-reader-page-field"
            value={typed ?? String(page)}
            onFocus={(event) => (setTyped(String(page)), event.currentTarget.select())}
            onChange={(event) => setTyped(event.target.value.replace(/\D/g, ""))}
            onBlur={() => setTyped(null)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                go(Number(typed) || page)
                event.currentTarget.blur()
              } else if (event.key === "Escape") event.currentTarget.blur()
            }}
          />
          <span className="pdf-reader-of"> / {doc?.numPages ?? "…"}</span>
        </span>
        <span className="pdf-reader-tools">
          <Button data-style="ghost" aria-label="Smaller" title="Smaller  ⌘−" onClick={() => step(-1)}>
            <Minus className="tiptap-button-icon" />
          </Button>
          <Button data-style="ghost" aria-label="Fit width" title="Fit width  ⌘0" onClick={() => setZoom(1)}>
            <span className="tiptap-button-text"><Roll text={zoom === 1 ? "Fit" : `${Math.round(zoom * 100)}%`} /></span>
          </Button>
          <Button data-style="ghost" aria-label="Larger" title="Larger  ⌘+" onClick={() => step(1)}>
            <Plus className="tiptap-button-icon" />
          </Button>
          <Button
            data-style="ghost"
            aria-label={dark ? "Light pages" : "Dark pages"}
            title={dark ? "Light pages" : "Dark pages"}
            data-active-state={dark ? "on" : "off"}
            onClick={() => {
              localStorage.setItem("pdf-dark", dark ? "0" : "1")
              setDark(!dark)
            }}
          >
            {dark ? <Sun className="tiptap-button-icon" /> : <Moon className="tiptap-button-icon" />}
          </Button>
        </span>
      </div>
      <div ref={scroller} className="pdf-reader-scroll" onScroll={onScroll}>
        <PdfPages
          src={src}
          zoom={zoom}
          scroller={scroller}
          onLoad={(loaded) => {
            setDoc(loaded)
            void pdfTitle(loaded, name).then(setTitle)
          }}
        />
      </div>
    </div>
  )
}
