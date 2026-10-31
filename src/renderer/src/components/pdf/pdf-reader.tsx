import { useEffect, useRef, useState } from "react"
import type { PDFDocumentProxy } from "pdfjs-dist"
import { ChevronDown, ChevronUp, Minus, PanelLeft, PanelRight, Plus, ScrollText, Search, X } from "lucide-react"
import { Button } from "@/components/tiptap-ui-primitive/button"
import { ContextMenu, ContextMenuContent, ContextMenuTrigger } from "@/components/ui/context-menu"
import { Roll } from "@/lib/roll"
import { call } from "@/lib/haligtree"
import { host, said } from "@/lib/host"
import { canSplit, keysHere, usePane } from "@/lib/split"
import { chime } from "@/lib/sound"
import { cue } from "@/lib/cues"
import { MarkMenu, PickedMenu, ReadBar, WhyAfter, cited, lastColor, readKey, rememberColor, type MarkColor, type ReadActions } from "./read-bar"
import { PdfRail, PdfThumb, type RailTab } from "./pdf-rail"
import { ReadDetails } from "./pdf-details"
import { LookUpCard, type LookedUpIn } from "./look-up"
import { usePdfCover } from "./pdf-cover"
import { showDetails, useDetailsShown } from "@/lib/reading"
import { PdfPages, offsetsIn, pdfAuthor, pdfTitle, type PdfMark } from "./pdf-pages"

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
  // A link back into a kept article: it opens in the reader with its mark flashed.
  const article = /^(?:haligtree|mindflow):\/\/article\?(.*)$/i.exec(href)
  if (article) {
    const hash = new URLSearchParams(article[1])
    const page = hash.get("href")
    if (page) openArticle(page, hash.get("mark") ?? undefined)
    return !!page
  }
  const found = /^((?:haligtree|mindflow):\/\/assets\/[^#?]+\.pdf)(?:#(.*))?$/i.exec(href)
  if (!found) return false
  const hash = new URLSearchParams(found[2] ?? "")
  openPdf(found[1], hash.get("name") ?? "", Number(hash.get("page")) || undefined, hash.get("mark") ?? undefined)
  return true
}

/** A web page in the reader: a step in the pane in front, or beside it on ⌥-click. A PDF link opens the PDF reader instead. */
export const openArticle = (href: string, mark?: string): void => {
  if (isWebPdf(href)) return void openWebPdf(href)
  articleFlash = mark ?? null
  if (canSplit()) window.dispatchEvent(new CustomEvent("haligtree:web", { detail: { href } }))
  else window.api.openInHome("web", href)
}
/** The mark an article's link came back to: taken (once) by the reader that opens next. */
let articleFlash: string | null = null
export const takeArticleFlash = (): string | null => {
  const mark = articleFlash
  articleFlash = null
  return mark
}
/** A link back into an article, as a gem keeps it: the page's link and the mark. */
export const articleLink = (href: string, mark: string): string => `haligtree://article?href=${encodeURIComponent(href)}&mark=${mark}`

/** A link to a PDF on the web: its path ends in `.pdf`. */
export const isWebPdf = (href: string | null | undefined): boolean => !!href && /^https?:\/\/[^?#]+\.pdf(?:[?#]|$)/i.test(href)

/**
 * A PDF on the web in the reader: fetched once into the book's own files (as
 * a card's picture is kept), then opened in the main window like any PDF.
 */
export async function openWebPdf(href: string): Promise<void> {
  const kept = await host().fetchPdf?.(href)
  if (!kept) return void (chime("nope"), said("That PDF could not be fetched", false))
  if (canSplit()) openPdf(kept.src, kept.name)
  else window.api.openInHome("pdf", pdfFocus(kept.src, kept.name))
}

/** Titles read out of PDFs, by address: what the window's top bar and a pane's tab call it. */
const titles = new Map<string, string>()
/** A PDF's title once read, else the name it arrived under without `.pdf`. */
export const pdfName = (src: string, name: string): string => titles.get(src) ?? (name.replace(/\.pdf$/i, "") || "PDF")
export const learnTitle = (src: string, title: string): void => {
  if (titles.get(src) === title) return
  titles.set(src, title)
  // Kept, so ⌘K finds the PDF by its title too.
  void call("pdf:title", src, title)
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

  // Every highlight in the book, in page order, beside the pages: a click goes to it and lights it.
  // Details at the right, shown and hidden with a note's (the same button, and ⇧⌘B).
  const detailsOut = useDetailsShown()
  const cover = usePdfCover(src, name)
  const [author, setAuthor] = useState("")
  useEffect(() => {
    if (doc) void pdfAuthor(doc).then(setAuthor)
  }, [doc])
  // The left rail, open or shut and on which tab, as you last left it for every PDF.
  const [rail, setRail] = useState<RailTab | null>(() => (["pages", "outline"].includes(localStorage.getItem("pdf-rail") ?? "") ? (localStorage.getItem("pdf-rail") as RailTab) : null))
  const showRail = (tab: RailTab | null): void => {
    localStorage.setItem("pdf-rail", tab ?? "")
    setRail(tab)
  }
  const [lit, setLit] = useState<string | null>(null)
  const goToMark = (one: PdfMark): void => {
    go(one.page)
    setLit(one.id)
  }
  /** Every highlight gathered into one new note, in page order, each with a link back to its page and mark. */
  const gather = async (): Promise<void> => {
    const sorted = [...marks].sort((a, b) => a.page - b.page || a.start - b.start)
    if (!sorted.length) return
    const body = {
      type: "doc",
      content: sorted.flatMap((one) => [
        { type: "blockquote", content: [{ type: "paragraph", content: [{ type: "text", text: one.quote }] }] },
        { type: "paragraph", content: [{ type: "text", text: `${title}, p. ${one.page}`, marks: [{ type: "link", attrs: { href: pdfLink(src, name, one.page, one.id) } }] }] },
      ]),
    }
    const id = await window.api.captures.create({ kind: "note", title: `Highlights from ${title}`, body })
    chime("saved")
    said(`${sorted.length} highlight${sorted.length === 1 ? "" : "s"} gathered into a note`)
    window.dispatchEvent(new CustomEvent("haligtree:open", { detail: { type: "capture", id } }))
  }

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
      // The selection's own words, not the range's: across a line end pdf.js puts a line break, which only the selection reads as a space ("the nature", never "thenature").
      const quote = chosen.toString().replace(/\s+/g, " ").trim()
      if (!layer || !sheet || !box.contains(sheet) || !layer.contains(range.endContainer) || !quote) return setPicked(null)
      const { start, end } = offsetsIn(layer, range)
      const rect = range.getBoundingClientRect()
      const frame = box.getBoundingClientRect()
      setPicked({ page: Number(sheet.dataset.page), quote, start, end, x: rect.left + rect.width / 2 - frame.left, y: rect.top - frame.top + box.scrollTop })
    }
    document.addEventListener("selectionchange", onChange)
    return () => document.removeEventListener("selectionchange", onChange)
  }, [])

  /** "Author, Title, p. 3": where words on a page came from, as a gem and a citation name it. */
  const whereFrom = async (page: number): Promise<{ author: string; where: string }> => {
    const author = doc ? await pdfAuthor(doc) : ""
    return { author, where: `${title}, p. ${page}` }
  }
  /** A gem of a mark's words: the quote, the book and page it came from, and a link back to the mark. */
  const gemOf = async (mark: { id: string; page: number; quote: string }): Promise<string> => {
    const { author, where } = await whereFrom(mark.page)
    // The book is the gem's source and the page its place; its author, when the file names one, who said it.
    return call<string>("nugget:from", `${mark.quote}\n\n[${where}](${pdfLink(src, name, mark.page, mark.id)})`, { attribution: author || null, medium: title, passage: `p. ${mark.page}`, kind: "quote" })
  }
  // Just kept as a gem: "Why keep this?" where the words were, for its gem.
  const [whyFor, setWhyFor] = useState<{ id: string; x: number; y: number } | null>(null)
  /** The picked words marked in a colour; kept as a gem too when asked. */
  const mark = async (color: MarkColor, gem: boolean): Promise<void> => {
    if (!picked) return
    const id = crypto.randomUUID()
    const gemId = gem ? await gemOf({ id, page: picked.page, quote: picked.quote }) : null
    await call("pdf:highlight", src, { id, page: picked.page, quote: picked.quote, start: picked.start, end: picked.end, gemId, color })
    setMarks((all) => [...all, { id, page: picked.page, quote: picked.quote, start: picked.start, end: picked.end, gemId, color }])
    if (gemId) setWhyFor({ id: gemId, x: picked.x, y: picked.y })
    getSelection()?.removeAllRanges()
    setPicked(null)
    chime("saved")
    said(gem ? "Kept as a gem" : "Highlighted")
  }
  const copyCited = async (quote: string, page: number): Promise<void> => {
    const { author, where } = await whereFrom(page)
    await navigator.clipboard.writeText(cited(quote, author ? `${author}, ${where}` : where))
    chime("saved")
    said("Copied with its citation")
  }
  // Words looked up: the card under them, until Esc or a click away.
  const [looking, setLooking] = useState<{ words: string; x: number; y: number; from: LookedUpIn } | null>(null)
  const actions: ReadActions = {
    highlight: (color) => (rememberColor(color), void mark(color, false)),
    keep: () => void mark(lastColor(), true),
    copy: () => picked && void copyCited(picked.quote, picked.page),
    lookUp: () => {
      if (!picked) return
      // The sentence round the words, kept with what is saved so it says why at a glance.
      const text = pageTexts.current.get(picked.page) ?? document.querySelector(`.pdf-page[data-page="${picked.page}"] .textLayer`)?.textContent ?? ""
      const from = Math.max(0, text.lastIndexOf(".", picked.start) + 1)
      const to = text.indexOf(".", picked.end)
      const sentence = text.slice(from, to < 0 ? undefined : to + 1).replace(/\s+/g, " ").trim()
      setLooking({ words: picked.quote, x: picked.x, y: picked.y + 24, from: { where: `${title}, p. ${picked.page}`, link: pdfLink(src, name, picked.page, ""), sentence } })
      chime("open")
    },
  }
  // The bar's keys, while words are picked here.
  useEffect(() => {
    if (!picked) return
    const onKey = (event: KeyboardEvent): void => {
      if (keysHere(pane) && readKey(event, actions)) event.preventDefault()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  })

  /** A mark's colour changed, or the gem it became. */
  const change = async (one: PdfMark, to: Partial<PdfMark>): Promise<void> => {
    await call("pdf:mark", one.id, to)
    setMarks((all) => all.map((each) => (each.id === one.id ? { ...each, ...to } : each)))
  }
  const keepMark = async (one: PdfMark): Promise<void> => {
    const gemId = await gemOf(one)
    await change(one, { gemId })
    // "Why keep this?" over the highlight itself.
    const band = scroller.current?.querySelector<HTMLElement>(`.pdf-mark[data-mark="${one.id}"]`)?.getBoundingClientRect()
    const frame = scroller.current?.getBoundingClientRect()
    if (band && frame && scroller.current) setWhyFor({ id: gemId, x: band.left + band.width / 2 - frame.left, y: band.top - frame.top + scroller.current.scrollTop })
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
    // Kept as the pane's page, so Back from anywhere comes back to it.
    if (n !== start) onPage?.(n)
  }
  // Opened at a page (a gem's link back, or Back to it): the sheets land there as they are laid out.
  // Back and Forward bring a page back too; the page you scroll to is kept, so it never jumps.
  useEffect(() => {
    if (doc && start && start !== page) go(start)
    // Opened with no page of its own: where you last left it.
    if (doc && !start) void call<{ page: number } | null>("pdf:place", src).then((place) => place && place.page > 1 && go(place.page))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc, start])
  // The page you are on, kept as you read: the next time it opens there.
  useEffect(() => {
    if (doc) void call("pdf:read", src, page, doc.numPages)
  }, [doc, src, page])

  const step = (by: number): void => {
    const at = ZOOMS.findIndex((one) => one >= zoom - 0.001)
    const next = ZOOMS[Math.min(Math.max(0, (at < 0 ? ZOOMS.length - 1 : at) + by), ZOOMS.length - 1)]
    // At its smallest or largest: the "nope" a note's text size gives at its ends.
    if (next === zoom) return chime("nope")
    setZoom(next)
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

  // The chapter you are in: the outline's latest entry that starts on or
  // before this page, so every page of a chapter lights it, not only its first.
  const hereAt = outline.reduce((at, row, index) => (row.page <= page && (at < 0 || row.page >= outline[at].page) ? index : at), -1)
  const chapter = hereAt >= 0 ? outline[hereAt].title : ""

  return (
    <div className={`pdf-reader${paper ? " is-paper" : ""}`}>
      <div className="pdf-reader-bar">
        <span className="pdf-reader-title" title={chapter ? `${title}: ${chapter}` : title}>
          {title}
          {chapter && <span data-pdf-chapter className="pdf-reader-chapter">{chapter}</span>}
        </span>
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
          <Button data-style="ghost" aria-label="Sidebar" title="Pages and outline" data-active-state={rail ? "on" : "off"} onClick={() => showRail(rail ? null : "pages")}>
            <PanelLeft className="tiptap-button-icon" />
          </Button>
          <Button data-style="ghost" aria-label="Details" title={detailsOut ? "Hide details" : "Details"} data-active-state={detailsOut ? "on" : "off"} onClick={() => (chime(detailsOut ? "fold" : "slide"), showDetails(!detailsOut, pane))}>
            <PanelRight className="tiptap-button-icon" />
          </Button>
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
      <div className="pdf-reader-body">
      {rail && doc && (
        <PdfRail
          tab={rail === "outline" && !outline.length ? "pages" : rail}
          tabs={[{ id: "pages", label: "Pages" }, ...(outline.length ? [{ id: "outline" as const, label: "Outline" }] : [])]}
          onTab={showRail}
        >
          {(rail === "pages" || (rail === "outline" && !outline.length)) &&
            Array.from({ length: doc.numPages }, (_, index) => <PdfThumb key={index} doc={doc} page={index + 1} here={index + 1 === page} onGo={() => go(index + 1)} />)}
          {rail === "outline" && outline.length > 0 && (
            <nav className="pdf-outline" aria-label="Outline">
              {outline.map((row, index) => (
                <button key={index} type="button" className={`pdf-outline-row${index === hereAt ? " is-here" : ""}`} style={{ paddingInlineStart: `${0.5 + row.depth * 0.75}rem` }} onClick={() => go(row.page)}>
                  <span className="pdf-outline-title">{row.title}</span>
                  <span className="pdf-outline-page">{row.page}</span>
                </button>
              ))}
            </nav>
          )}
        </PdfRail>
      )}
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div
            ref={scroller}
            className="pdf-reader-scroll"
            onScroll={onScroll}
            // A mark has its menu, picked words theirs: anywhere else a right click does nothing here.
            onContextMenu={(event) => {
              const band = [...(scroller.current?.querySelectorAll<HTMLElement>(".pdf-mark") ?? [])].find((one) => {
                const r = one.getBoundingClientRect()
                return event.clientX >= r.left && event.clientX <= r.right && event.clientY >= r.top && event.clientY <= r.bottom
              })
              const mark = band ? marks.find((one) => one.id === band.dataset.mark) ?? null : null
              setHit(mark)
              if (!mark && !picked) event.preventDefault()
            }}
          >
            <PdfPages
              src={src}
              zoom={zoom}
              scroller={scroller}
              marks={found.length ? [...marks, ...found] : marks}
              flash={found.length ? found[at]?.id : lit ?? flash}
              land={start}
              onLoad={(loaded) => {
                setDoc(loaded)
                void pdfTitle(loaded, name).then((read) => {
                  setTitle(read)
                  learnTitle(src, read)
                })
              }}
            />
            {picked && !looking && !whyFor && <ReadBar at={picked} actions={actions} />}
            {whyFor && <WhyAfter at={whyFor} onSave={(why) => void call("gloss", whyFor.id, why).then(() => said("Why kept with the gem"))} onDone={() => setWhyFor(null)} />}
            {looking && <LookUpCard words={looking.words} at={looking} from={looking.from} onClose={() => setLooking(null)} />}
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent>
          {hit ? (
            <MarkMenu
              color={hit.color}
              gem={!!hit.gemId}
              onColor={(color) => void change(hit, { color })}
              onKeep={() => void keepMark(hit)}
              onOpenGem={() => window.dispatchEvent(new CustomEvent("haligtree:open", { detail: { type: "nugget", id: hit.gemId } }))}
              onCopy={() => void copyCited(hit.quote, hit.page)}
              onRemove={() => void remove(hit)}
            />
          ) : (
            picked && <PickedMenu actions={actions} />
          )}
        </ContextMenuContent>
      </ContextMenu>
      {detailsOut && <ReadDetails src={src} cover={cover?.image} title={title} author={author} pages={doc?.numPages} page={page} marks={marks} lit={lit} onMark={goToMark} onGather={() => void gather()} />}
      </div>
    </div>
  )
}
