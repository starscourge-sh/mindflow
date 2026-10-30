import { useEffect, useLayoutEffect, useRef, useState } from "react"
import type { PDFDocumentProxy } from "pdfjs-dist"
import { ChevronDown, ChevronUp, ListTree, Minus, Plus, ScrollText, Search, X } from "lucide-react"
import { Button } from "@/components/tiptap-ui-primitive/button"
import { Toolbar, ToolbarGroup } from "@/components/tiptap-ui-primitive/toolbar"
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from "@/components/ui/context-menu"
import { Roll } from "@/lib/roll"
import { call } from "@/lib/haligtree"
import { said } from "@/lib/host"
import { keysHere, usePane } from "@/lib/split"
import { chime } from "@/lib/sound"
import { cue } from "@/lib/cues"
import { PdfPages, offsetsIn, pdfTitle, type PdfMark } from "./pdf-pages"

/** The zoom steps, as Preview's: fit width is 1. */
const ZOOMS = [0.5, 0.67, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3]

/** Where a PDF opens full size: `haligtree:pdf`, read by the main window, which opens it in a pane. */
export const openPdf = (src: string, name: string, page?: number, mark?: string): void => {
  flashNext = mark ?? null
  window.dispatchEvent(new CustomEvent("haligtree:pdf", { detail: { src, name, page } }))
}
/** The mark a gem's link came back to: flashed by the reader that opens next. */
let flashNext: string | null = null

/** A link back into a PDF, as a gem keeps it: the stored file, the page, the mark and the file's name. */
export const pdfLink = (src: string, name: string, page: number, mark: string): string =>
  `${src}#page=${page}&mark=${mark}&name=${encodeURIComponent(name)}`

/**
 * A link followed anywhere in the app: a PDF's opens in the reader, at its
 * page with its mark flashed. Says whether it was one.
 */
export function followPdfLink(href: string): boolean {
  const found = /^((?:haligtree|mindflow):\/\/assets\/[^#?]+\.pdf)(?:#(.*))?$/i.exec(href)
  if (!found) return false
  const hash = new URLSearchParams(found[2] ?? "")
  openPdf(found[1], hash.get("name") ?? "", Number(hash.get("page")) || undefined, hash.get("mark") ?? undefined)
  return true
}

/** Titles read out of PDFs, by address: what the window's top bar and a pane's tab call it. */
const titles = new Map<string, string>()
/** A PDF's title once read, else the name it arrived under without `.pdf`. */
export const pdfName = (src: string, name: string): string => titles.get(src) ?? (name.replace(/\.pdf$/i, "") || "PDF")
const learnTitle = (src: string, title: string): void => {
  if (titles.get(src) === title) return
  titles.set(src, title)
  window.dispatchEvent(new CustomEvent("haligtree:pdf-title"))
}

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
  const [title, setTitle] = useState(() => pdfName(src, name))
  const [zoom, setZoom] = useState(1)
  const [page, setPage] = useState(start ?? 1)
  const [typed, setTyped] = useState<string | null>(null)
  const [paper, setPaper] = useState(() => localStorage.getItem("pdf-paper") === "1")
  const [marks, setMarks] = useState<PdfMark[]>([])
  const [flash] = useState(() => {
    const mark = flashNext
    flashNext = null
    return mark
  })
  // The words picked on one page, and where to show "Keep" over them.
  const [picked, setPicked] = useState<{ page: number; quote: string; start: number; end: number; x: number; y: number } | null>(null)
  // ⌘F: the words looked for, every place they are, and the one on show.
  const [finding, setFinding] = useState(false)
  const [found, setFound] = useState<PdfMark[]>([])
  const [at, setAt] = useState(0)
  const pageTexts = useRef<Map<number, string>>(new Map())
  const findField = useRef<HTMLInputElement>(null)
  const find = async (words: string): Promise<void> => {
    if (!doc || !words.trim()) return setFound([])
    const look = words.toLowerCase()
    const hits: PdfMark[] = []
    for (let n = 1; n <= doc.numPages; n++) {
      let text = pageTexts.current.get(n)
      if (text === undefined) {
        const content = await (await doc.getPage(n)).getTextContent()
        // The same characters the page's text layer holds, in the same order, so offsets agree.
        text = content.items.map((item) => ("str" in item ? item.str : "")).join("")
        pageTexts.current.set(n, text)
      }
      const lower = text.toLowerCase()
      for (let from = lower.indexOf(look); from >= 0; from = lower.indexOf(look, from + look.length))
        hits.push({ id: `find:${hits.length}`, page: n, quote: text.slice(from, from + look.length), start: from, end: from + look.length })
    }
    setFound(hits)
    setAt(0)
    if (hits[0]) go(hits[0].page)
  }
  // Heard as the note's own find bar is: opening, each step, a miss, closing.
  const stepFind = (back: boolean): void => {
    if (!found.length) return cue("find-miss")
    const next = (at + (back ? found.length - 1 : 1)) % found.length
    setAt(next)
    go(found[next].page)
    cue("find-step", next)
  }
  const closeFind = (): void => {
    setFinding(false)
    setFound([])
    cue("find-close")
  }
  useEffect(() => {
    if (finding) cue("find")
  }, [finding])
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (!event.metaKey || event.altKey || event.shiftKey || event.code !== "KeyF" || !keysHere(pane)) return
      event.preventDefault()
      event.stopPropagation()
      setFinding(true)
      requestAnimationFrame(() => findField.current?.select())
    }
    window.addEventListener("keydown", onKey, true)
    return () => window.removeEventListener("keydown", onKey, true)
  })

  // The PDF's own outline, if it has one: each entry's title, depth and page.
  const [outline, setOutline] = useState<{ title: string; depth: number; page: number }[]>([])
  const [showOutline, setShowOutline] = useState(false)
  useEffect(() => {
    if (!doc) return
    let live = true
    const pageOf = async (dest: unknown): Promise<number | null> => {
      const explicit = typeof dest === "string" ? await doc.getDestination(dest) : dest
      const ref = Array.isArray(explicit) ? explicit[0] : null
      if (!ref) return null
      return typeof ref === "number" ? ref + 1 : (await doc.getPageIndex(ref)) + 1
    }
    type Item = { title: string; dest: unknown; items: Item[] }
    const flat = async (items: Item[], depth: number): Promise<{ title: string; depth: number; page: number }[]> => {
      const rows: { title: string; depth: number; page: number }[] = []
      for (const item of items) {
        const page = await pageOf(item.dest).catch(() => null)
        if (page) rows.push({ title: item.title, depth, page })
        rows.push(...(await flat(item.items ?? [], depth + 1)))
      }
      return rows
    }
    void doc.getOutline().then(async (items) => {
      const rows = items ? await flat(items as Item[], 0) : []
      if (live) setOutline(rows)
    })
    return () => {
      live = false
    }
  }, [doc])

  // The mark under a right click.
  const [hit, setHit] = useState<PdfMark | null>(null)

  useEffect(() => {
    void call<PdfMark[]>("pdf:highlights", src).then(setMarks)
  }, [src])

  // A selection inside one page's words offers "Keep"; anything else hides it.
  useEffect(() => {
    const onChange = (): void => {
      const chosen = getSelection()
      const box = scroller.current
      if (!chosen || chosen.isCollapsed || !chosen.rangeCount || !box) return setPicked(null)
      const range = chosen.getRangeAt(0)
      const layer = (range.startContainer.parentElement ?? null)?.closest(".textLayer")
      const sheet = layer?.closest<HTMLElement>(".pdf-page")
      const quote = range.toString().replace(/\s+/g, " ").trim()
      if (!layer || !sheet || !box.contains(sheet) || !layer.contains(range.endContainer) || !quote) return setPicked(null)
      const { start, end } = offsetsIn(layer, range)
      const rect = range.getBoundingClientRect()
      const frame = box.getBoundingClientRect()
      setPicked({ page: Number(sheet.dataset.page), quote, start, end, x: rect.left + rect.width / 2 - frame.left, y: rect.top - frame.top + box.scrollTop })
    }
    document.addEventListener("selectionchange", onChange)
    return () => document.removeEventListener("selectionchange", onChange)
  }, [])

  /** The picked words as a gem: the quote, the book and page it came from, and a link back here. */
  const keep = async (): Promise<void> => {
    if (!picked) return
    const id = crypto.randomUUID()
    const where = `${title}, p. ${picked.page}`
    const gemId = await call<string>("nugget:from", `${picked.quote}\n\n[${where}](${pdfLink(src, name, picked.page, id)})`, { attribution: where })
    await call("pdf:highlight", src, { id, page: picked.page, quote: picked.quote, start: picked.start, end: picked.end, gemId })
    setMarks((all) => [...all, { id, page: picked.page, quote: picked.quote, start: picked.start, end: picked.end, gemId }])
    getSelection()?.removeAllRanges()
    setPicked(null)
    chime("saved")
    said("Kept as a gem")
  }

  const remove = async (mark: PdfMark): Promise<void> => {
    await call("pdf:unhighlight", mark.id)
    setMarks((all) => all.filter((one) => one.id !== mark.id))
    chime("away")
    said("Highlight removed")
  }

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
  // ⌘+ ⌘− ⌘0 while this reader is in the pane in front: its own zoom, not the
  // app's size. The menu's keys are offered here first (preload), and the
  // page's own key handler steps aside once this one has taken them.
  const pane = usePane()
  useEffect(() => {
    const zoomBy = (way: number): void => (way === 0 ? setZoom(1) : step(way))
    const onMenu = (event: Event): void => {
      if (!keysHere(pane)) return
      event.preventDefault()
      zoomBy((event as CustomEvent<number>).detail)
    }
    const onKey = (event: KeyboardEvent): void => {
      if (!event.metaKey || event.altKey || !keysHere(pane)) return
      const way = event.code === "Equal" || event.code === "NumpadAdd" ? 1 : event.code === "Minus" || event.code === "NumpadSubtract" ? -1 : event.code === "Digit0" || event.code === "Numpad0" ? 0 : null
      if (way === null) return
      event.preventDefault()
      zoomBy(way)
    }
    window.addEventListener("haligtree:zoom-key", onMenu)
    window.addEventListener("keydown", onKey, true)
    return () => (window.removeEventListener("haligtree:zoom-key", onMenu), window.removeEventListener("keydown", onKey, true))
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
    <div className={`pdf-reader${paper ? " is-paper" : ""}`}>
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
          {outline.length > 0 && (
            <Button data-style="ghost" aria-label="Outline" title="Outline" data-active-state={showOutline ? "on" : "off"} onClick={() => setShowOutline(!showOutline)}>
              <ListTree className="tiptap-button-icon" />
            </Button>
          )}
          <Button data-style="ghost" aria-label="Find" title="Find  ⌘F" data-active-state={finding ? "on" : "off"} onClick={() => (finding ? closeFind() : (setFinding(true), requestAnimationFrame(() => findField.current?.focus())))}>
            <Search className="tiptap-button-icon" />
          </Button>
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
            aria-label={paper ? "White pages" : "Paper pages"}
            title={paper ? "White pages" : "Paper pages: easier on the eyes, pictures kept true"}
            data-active-state={paper ? "on" : "off"}
            onClick={() => {
              localStorage.setItem("pdf-paper", paper ? "0" : "1")
              setPaper(!paper)
            }}
          >
            <ScrollText className="tiptap-button-icon" />
          </Button>
        </span>
      </div>
      {showOutline && outline.length > 0 && (
        <nav className="pdf-outline" aria-label="Outline">
          {outline.map((row, index) => (
            <button key={index} type="button" className={`pdf-outline-row${row.page === page ? " is-here" : ""}`} style={{ paddingInlineStart: `${0.75 + row.depth * 0.875}rem` }} onClick={() => go(row.page)}>
              <span className="pdf-outline-title">{row.title}</span>
              <span className="pdf-outline-page">{row.page}</span>
            </button>
          ))}
        </nav>
      )}
      {finding && (
        <div className="tiptap-find-bar pdf-find-bar">
          <div className="tiptap-find-bar-row">
            <input
              ref={findField}
              type="text"
              placeholder="Find"
              aria-label="Find in PDF"
              autoFocus
              onChange={(event) => void find(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault()
                  stepFind(event.shiftKey)
                } else if (event.key === "Escape") closeFind()
              }}
            />
            <span className="tiptap-find-bar-count" aria-label={`${found.length ? at + 1 : 0} of ${found.length}`}>
              <Roll text={found.length ? at + 1 : 0} />/<Roll text={found.length} />
            </span>
            <button type="button" onClick={() => stepFind(true)} aria-label="Previous match" title="Previous  ⇧↵">
              <ChevronUp className="size-3.5" />
            </button>
            <button type="button" onClick={() => stepFind(false)} aria-label="Next match" title="Next  ↵">
              <ChevronDown className="size-3.5" />
            </button>
            <button type="button" onClick={closeFind} aria-label="Close find" title="Close  Esc">
              <X className="size-3.5" />
            </button>
          </div>
        </div>
      )}
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div
            ref={scroller}
            className="pdf-reader-scroll"
            onScroll={onScroll}
            // Only a mark has a menu: anywhere else a right click does nothing here.
            onContextMenu={(event) => {
              const band = [...(scroller.current?.querySelectorAll<HTMLElement>(".pdf-mark") ?? [])].find((one) => {
                const r = one.getBoundingClientRect()
                return event.clientX >= r.left && event.clientX <= r.right && event.clientY >= r.top && event.clientY <= r.bottom
              })
              const mark = band ? marks.find((one) => one.id === band.dataset.mark) ?? null : null
              setHit(mark)
              if (!mark) event.preventDefault()
            }}
          >
            <PdfPages
              src={src}
              zoom={zoom}
              scroller={scroller}
              marks={found.length ? [...marks, ...found] : marks}
              flash={found.length ? found[at]?.id : flash}
              land={start}
              onLoad={(loaded) => {
                setDoc(loaded)
                void pdfTitle(loaded, name).then((read) => {
                  setTitle(read)
                  learnTitle(src, read)
                })
              }}
            />
            {picked && <KeepBar at={picked} onKeep={() => void keep()} />}
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent>
          {hit?.gemId && <ContextMenuItem onSelect={() => window.dispatchEvent(new CustomEvent("haligtree:open", { detail: { type: "nugget", id: hit.gemId } }))}>Open its gem</ContextMenuItem>}
          {hit && <ContextMenuItem onSelect={() => void remove(hit)}>Remove highlight</ContextMenuItem>}
        </ContextMenuContent>
      </ContextMenu>
    </div>
  )
}

/** "Keep", floating over the picked words as the editor's own selection bar does. */
function KeepBar({ at, onKeep }: { at: { x: number; y: number }; onKeep: () => void }): React.JSX.Element {
  const bar = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  useLayoutEffect(() => setWidth(bar.current?.offsetWidth ?? 0), [])
  return (
    <div
      ref={bar}
      className="pdf-keep-bar"
      style={{ left: Math.max(8, at.x - width / 2), top: Math.max(8, at.y - 48) }}
      // The words stay picked while the bar is pressed.
      onMouseDown={(event) => event.preventDefault()}
    >
      <Toolbar variant="floating">
        <ToolbarGroup>
          <Button data-style="ghost" aria-label="Keep" title="Keep as a gem" onClick={onKeep}>
            <span className="tiptap-button-text">Keep</span>
          </Button>
        </ToolbarGroup>
      </Toolbar>
    </div>
  )
}
