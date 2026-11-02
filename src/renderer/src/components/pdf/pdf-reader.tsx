import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { useToolKeys } from "@/lib/tool-keys"
import type { PDFDocumentProxy } from "pdfjs-dist"
import { BookOpen, ChevronDown, ChevronUp, Gem, Minus, PanelLeft, PanelRight, Plus, Scissors, ScrollText, Search, SquareStack, X } from "lucide-react"
import { Button } from "@/components/tiptap-ui-primitive/button"
import { Toolbar, ToolbarGroup } from "@/components/tiptap-ui-primitive/toolbar"
import { saveAttachment } from "@/extensions/image-drop"
import { ContextMenu, ContextMenuContent, ContextMenuSeparator, ContextMenuTrigger } from "@/components/ui/context-menu"
import { Roll } from "@/lib/roll"
import { call } from "@/lib/haligtree"
import { touch } from "@/lib/open-today"
import { host, said } from "@/lib/host"
import { canSplit, keysHere, usePane } from "@/lib/split"
import { chime } from "@/lib/sound"
import { cue } from "@/lib/cues"
import { MarkMenu, PickedMenu, WhyAfter, blankOf, cited, lastColor, readKey, rememberColor, type MarkColor, type Picked, type ReadActions } from "./read-bar"
import { NARROW, PdfSide, chapterAt, railWidth, usePdfOutline, type RailTab } from "./pdf-rail"
import { ReadDetails } from "./pdf-details"
import { LookUpCard, type LookedUpIn } from "./look-up"
import { usePdfCover } from "./pdf-cover"
import { showDetails, useDetailsShown } from "@/lib/reading"
import { PdfPages, offsetsIn, pdfAuthor, pdfTitle, wordsIn, type PdfMark } from "./pdf-pages"
import { FitActions } from "@/components/haligtree/ui"
import { LAYOUTS, LOOKS, useDarkPages, usePageLayout, usePageLook, usePaperPages, type PageLayout, type PageLook } from "./paper"
import { DropdownMenu, DropdownMenuContent, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { ScrubField } from "./scrub-field"
import { still } from "@/lib/motion"
import { plural, num } from '../../../../main/dates'

/** A page column this wide reads comfortably; below it the rail squeezes, below `TIGHT` it folds away. */
const COMFY = 520
const TIGHT = 420
/** A rail narrower than this cuts the outline's titles to a word: it opens on the pages instead. */
const OUTLINE_ROOM = 180
/** The pages' padding either side (pdf.css, .pdf-reader-scroll). */
const PAD = 48

/** The zoom steps, as Preview's: fit width is 1. */
const ZOOMS = [0.5, 0.67, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3]

/** Where a PDF opens full size: `haligtree:pdf`, read by the main window, which opens it in a pane. */
export const openPdf = (src: string, name: string, page?: number, mark?: string, aside = false): void => {
  // Only the main window has the reader: the box and a note's own window send it there, at the page.
  if (!canSplit()) return window.api.openInHome("pdf", pdfFocus(src, name), page ? String(page) : undefined)
  flashNext = mark ?? null
  window.dispatchEvent(new CustomEvent("haligtree:pdf", { detail: { src, name, page, aside } }))
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

/** A link to a PDF anywhere: one kept in the book (with its page and mark) or one on the web. */
export const isPdfHref = (href: string | null | undefined): boolean => (!!href && /^(?:haligtree|mindflow):\/\/assets\/[^#?]+\.pdf(?:[#?]|$)/i.test(href)) || isWebPdf(href)

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
  /** The pages last moved by a hand (two fingers, a wheel, the scroll bar, a key), not by opening, a restore, a jump or a zoom. */
  const byHandScroll = useRef(false)
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null)
  const [title, setTitle] = useState(() => pdfName(src, name))
  const [zoom, setZoom] = useState(1)
  const [page, setPage] = useState(start ?? 1)
  const [paper, setPaper] = usePaperPages()
  const [dark, setDark] = useDarkPages()
  const [look, setLook] = usePageLook()
  const [layout, setLayout] = usePageLayout(src)
  // The View menu's "Continuous Scroll", "Single Page" and "Two Pages" (app-menu.ts).
  const layoutNow = useRef(setLayout)
  layoutNow.current = setLayout
  useEffect(() => {
    const onMenu = (event: Event): void => {
      const to = (event as CustomEvent<string>).detail
      if (to === "continuous" || to === "single" || to === "spread") (chime("tap"), layoutNow.current(to))
    }
    window.addEventListener("haligtree:pdf-layout", onMenu)
    return () => window.removeEventListener("haligtree:pdf-layout", onMenu)
  }, [])
  const [marks, setMarks] = useState<PdfMark[]>([])
  const [flash] = useState(() => {
    const mark = flashNext
    flashNext = null
    return mark
  })
  // The words picked on one page, and where to show "Keep" over them.
  const [picked, setPicked] = useState<{ page: number; quote: string; start: number; end: number; x: number; y: number; bottom: number } | null>(null)
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
  // Once a book is open, every highlight in it kept before line ends were read as spaces ("thenature",
  // "shapedpolitical") is put right from its page's own text, the pages never drawn too, and its gem with it (main).
  const mended = useRef<string | null>(null)
  const kept = useRef(marks)
  kept.current = marks
  const anyMarks = marks.length > 0
  useEffect(() => {
    if (!doc || !anyMarks || mended.current === src) return
    mended.current = src
    let live = true
    const marks = kept.current
    void (async () => {
      const bare = (words: string): string => words.replace(/\s+/g, "")
      for (const n of [...new Set(marks.map((one) => one.page))]) {
        if (!live || n < 1 || n > doc.numPages) continue
        const content = await (await doc.getPage(n)).getTextContent()
        // The text layer's characters, a line end marked where pdf.js draws its <br>.
        let text = ""
        const ends = new Set<number>()
        for (const item of content.items) if ("str" in item) ((text += item.str), item.hasEOL && ends.add(text.length))
        for (const one of marks.filter((each) => each.page === n)) {
          const slice = text.slice(one.start, one.end)
          if (bare(slice) !== bare(one.quote)) continue
          let words = ""
          for (let at = one.start; at < one.end; at++) words += (at > one.start && ends.has(at) ? " " : "") + text[at]
          words = words.replace(/\s+/g, " ").trim()
          if (words === one.quote) continue
          await call("pdf:mark", one.id, { quote: words, start: one.start, end: one.end })
          if (live) setMarks((all) => all.map((each) => (each.id === one.id ? { ...each, quote: words } : each)))
        }
      }
    })()
    return () => void ((live = false), (mended.current = null))
  }, [doc, anyMarks, src])
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

  // The PDF's own outline, if it has one: each entry's title, depth and page (pdf-rail.tsx).
  const outline = usePdfOutline(doc)
  /** The pages a chapter starts on: felt firmly as you scroll or scrub onto one. */
  const chapters = useMemo(() => new Set(outline.map((one) => one.page)), [outline])

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
  // A narrow pane (half of a split) gives the pages the room: past a
  // comfortable reading width the rail squeezes to its narrowest, and past a
  // tight one it folds away, coming back as the pane widens. Opened, closed
  // or dragged by hand, the rail stays as it was left, in this reader.
  const body = useRef<HTMLDivElement>(null)
  const [room, setRoom] = useState(Infinity)
  const [byHand, setByHand] = useState(false)
  useLayoutEffect(() => {
    const el = body.current
    if (!el) return
    // The room the rail and the pages share: the body less Details, so the rail's own width never feeds back.
    const measure = (): void => setRoom(el.clientWidth - (el.querySelector<HTMLElement>(":scope > .read-details")?.offsetWidth ?? 0))
    const watch = new ResizeObserver(measure)
    watch.observe(el)
    if (scroller.current) watch.observe(scroller.current)
    return () => watch.disconnect()
  }, [])
  const squeeze: "full" | "narrow" | "folded" = byHand ? "full" : room - railWidth() - PAD < COMFY ? (room - NARROW - PAD < TIGHT ? "folded" : "narrow") : "full"
  // Squeezed, the outline's titles cut to "The…": the rail opens on the pages
  // instead, which read at any width. Outline picked by hand in this reader stays.
  const [tabByHand, setTabByHand] = useState(false)
  const cramped = (squeeze === "narrow" ? NARROW : railWidth()) < OUTLINE_ROOM
  const railShown = squeeze === "folded" ? null : rail === "outline" && cramped && !tabByHand ? "pages" : rail
  const toggleRail = (): void => (setByHand(true), showRail(railShown ? null : rail ?? "pages"))
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
    said(`${plural(sorted.length, 'highlight')} gathered into a note`)
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
      setPicked({ page: Number(sheet.dataset.page), quote, start, end, x: rect.left + rect.width / 2 - frame.left, y: rect.top - frame.top + box.scrollTop, bottom: rect.bottom - frame.top + box.scrollTop })
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
  const [whyFor, setWhyFor] = useState<{ id: string; x: number; y: number; bottom?: number } | null>(null)
  /** The picked words marked in a colour; kept as a gem too when asked. */
  const mark = async (color: MarkColor, gem: boolean): Promise<void> => {
    if (!picked) return
    // Over words already highlighted: that highlight takes the new colour, reaching to the new words too, never a second one stacked on it.
    const under = color === "later" ? [] : marks.filter((one) => one.page === picked.page && one.color !== "later" && one.start < picked.end && picked.start < one.end)
    if (under.length) {
      const into = under.find((one) => one.gemId) ?? under[0]
      const start = Math.min(picked.start, ...under.map((one) => one.start))
      const end = Math.max(picked.end, ...under.map((one) => one.end))
      const layer = document.querySelector(`.pdf-reader .pdf-page[data-page="${picked.page}"] .textLayer`)
      const quote = start === picked.start && end === picked.end ? picked.quote : layer ? wordsIn(layer, start, end) : into.quote
      await mergeMarks(into, under, { color, start, end, quote })
      if (gem && !into.gemId) await keepMark({ ...into, color, start, end, quote })
      getSelection()?.removeAllRanges()
      setPicked(null)
      chime("saved")
      if (!gem) said(under.length > 1 ? "Highlights joined into one" : start < into.start || end > into.end ? "Highlight extended" : "Highlight colour changed")
      return
    }
    const id = crypto.randomUUID()
    const gemId = gem ? await gemOf({ id, page: picked.page, quote: picked.quote }) : null
    await call("pdf:highlight", src, { id, page: picked.page, quote: picked.quote, start: picked.start, end: picked.end, gemId, color })
    setMarks((all) => [...all, { id, page: picked.page, quote: picked.quote, start: picked.start, end: picked.end, gemId, color }])
    if (gemId) setWhyFor({ id: gemId, x: picked.x, y: picked.y, bottom: picked.bottom })
    getSelection()?.removeAllRanges()
    setPicked(null)
    chime("saved")
    said(gem ? "Kept as a gem" : color === "later" ? "Marked for a card" : "Highlighted", true, gemId ? { type: "nugget", id: gemId, title: picked.quote } : undefined)
  }
  const copyCited = async (quote: string, page: number): Promise<void> => {
    const { author, where } = await whereFrom(page)
    await navigator.clipboard.writeText(cited(quote, author ? `${author}, ${where}` : where))
    chime("saved")
    said("Copied with its citation")
  }
  // Words looked up: the card under them, until Esc or a click away.
  const [looking, setLooking] = useState<{ words: string; x: number; y: number; from: LookedUpIn } | null>(null)
  /** The sentence round picked words, from the page's own text. */
  const sentenceOf = (at: { page: number; start: number; end: number }): string => {
    const layer = document.querySelector(`.pdf-page[data-page="${at.page}"] .textLayer`)
    const text = pageTexts.current.get(at.page) ?? layer?.textContent ?? ""
    // The words' own run of text: the page's pieces in the same type size,
    // so a heading or a caption above (no full stop after it) is never taken
    // in, and a paragraph's line ends are not walls.
    let low = 0
    let high = text.length
    let spans: { from: number; to: number; size: string; top: number }[] = []
    if (layer) {
      const pieces = [...layer.querySelectorAll<HTMLElement>(":scope > span, :scope > .markedContent > span")].filter((one) => !one.querySelector("span"))
      let offset = 0
      spans = pieces.map((one) => ({ from: offset, to: (offset += one.textContent?.length ?? 0), size: one.style.fontSize || getComputedStyle(one).fontSize, top: Math.round(one.getBoundingClientRect().top) }))
      if (offset !== text.length) spans = []
      const here = spans.findIndex((one) => at.start >= one.from && at.start < one.to)
      if (here >= 0) {
        let first = here
        let last = here
        while (first > 0 && spans[first - 1].size === spans[here].size) first--
        while (last < spans.length - 1 && spans[last + 1].size === spans[here].size) last++
        low = spans[first].from
        high = spans[last].to
      }
    }
    const ends = /[.!?]/g
    let from = low
    for (const match of text.slice(low, at.start).matchAll(ends)) from = low + match.index! + 1
    ends.lastIndex = 0
    const after = ends.exec(text.slice(at.end, high))
    const to = after ? at.end + after.index + 1 : high
    // The page's text runs its lines together ("limit is" + "about" read
    // "isabout"): a line that starts lower than the one before gets its space back.
    let words = ""
    let line = Number.NaN
    for (const one of spans.length ? spans : [{ from: 0, to: text.length, size: "", top: 0 }]) {
      if (one.to <= from || one.from >= to) continue
      const part = text.slice(Math.max(from, one.from), Math.min(to, one.to))
      if (words && one.top !== line && !/\s$/.test(words) && !/^\s/.test(part)) words += " "
      words += part
      line = one.top
    }
    return words.replace(/\s+/g, " ").trim()
  }
  // Cards made from this PDF, all told: most people keep 10 to 15 from an
  // hour of reading, so past 15 the count says so, gently.
  const [cardsHere, setCardsHere] = useState(0)
  useEffect(() => {
    void call<{ medium: string | null; prompt: string | null }[]>("items", "nugget").then((all) => setCardsHere(all.filter((one) => one.medium === title && one.prompt).length))
  }, [title])
  /** A card from this page: the answer with the book and page under it, so Review's "From" line opens the page. */
  const cardOf = async (prompt: string, answer: string, page: number, quiet = false, gem = false): Promise<void> => {
    const { author, where } = await whereFrom(page)
    // A study card (Review only), unless ⌥ was held or Settings keeps reading cards as gems.
    const id = await call<string>("nugget:from", `${answer}\n\n[${where}](${pdfLink(src, name, page, "")})`, { attribution: author || null, medium: title, passage: `p. ${page}`, kind: "quote", card: { gem } })
    // Named by its question, as a card is in every list and in ⌘K: a snip's first line is its picture, never a name.
    await call("item:save", id, { prompt, title: prompt })
    const count = cardsHere + 1
    setCardsHere(count)
    chime("saved")
    if (!quiet) said(count > 15 ? `Card made: ${num(count)} from this source. Most people keep 10 to 15 from an hour; the best ones are enough` : `Card made: ${num(count)} from this source`, true, { type: "nugget", id, title: prompt })
  }
  // Snip: a rectangle dragged over a page (a figure, a typeset equation, a
  // table) cut out as a picture, then made a card's answer or kept as a gem.
  const [snipping, setSnipping] = useState(false)
  const [snip, setSnip] = useState<{ x: number; y: number; w: number; h: number; from?: { x: number; y: number } } | null>(null)
  const [snipped, setSnipped] = useState<{ src: string; page: number; x: number; y: number } | null>(null)
  /** A pointer's place in the pages' own scrolling space, where the floating bars are placed. */
  const within = (event: { clientX: number; clientY: number }): { x: number; y: number } => {
    const frame = scroller.current!.getBoundingClientRect()
    return { x: event.clientX - frame.left + scroller.current!.scrollLeft, y: event.clientY - frame.top + scroller.current!.scrollTop }
  }
  /** The rectangle cut from the page it sits on, at the page's full drawn sharpness, saved with the book's other pictures. */
  const cut = async (box: { x: number; y: number; w: number; h: number }): Promise<void> => {
    const frame = scroller.current!.getBoundingClientRect()
    const left = box.x + frame.left - scroller.current!.scrollLeft
    const top = box.y + frame.top - scroller.current!.scrollTop
    const sheet = [...scroller.current!.querySelectorAll<HTMLElement>(".pdf-page[data-page]")].find((one) => {
      const r = one.getBoundingClientRect()
      return left + box.w / 2 >= r.left && left + box.w / 2 <= r.right && top + box.h / 2 >= r.top && top + box.h / 2 <= r.bottom
    })
    const canvas = sheet?.querySelector<HTMLCanvasElement>("canvas")
    setSnip(null)
    if (!sheet || !canvas) return said("Snip on a page: drag over a figure or an equation")
    const drawn = canvas.getBoundingClientRect()
    const scale = canvas.width / drawn.width
    const out = document.createElement("canvas")
    out.width = Math.max(1, Math.round(box.w * scale))
    out.height = Math.max(1, Math.round(box.h * scale))
    out.getContext("2d")!.drawImage(canvas, (left - drawn.left) * scale, (top - drawn.top) * scale, out.width, out.height, 0, 0, out.width, out.height)
    const blob = await new Promise<Blob | null>((done) => out.toBlob(done, "image/png"))
    if (!blob) return
    const page = Number(sheet.dataset.page)
    const { src: saved } = await saveAttachment(new File([blob], `${title} p${page} snip.png`, { type: "image/png" }))
    setSnipping(false)
    setSnipped({ src: saved, page, x: box.x + box.w / 2 - 70, y: box.y })
    chime("saved")
  }
  /** The snip kept as a gem: the picture, the book and page under it, linked back. */
  const keepSnip = async (one: { src: string; page: number }): Promise<void> => {
    const { author, where } = await whereFrom(one.page)
    const gem = await call<string>("nugget:from", `![](${one.src})\n\n[${where}](${pdfLink(src, name, one.page, "")})`, { attribution: author || null, medium: title, passage: `p. ${one.page}`, kind: "quote" })
    // Named for what it is, a figure from this page: its first line is the picture, which no list can show as a name.
    await call("item:save", gem, { title: `Snip from ${where}` })
    setSnipped(null)
    chime("saved")
    said("Kept as a gem", true, { type: "nugget", id: gem, title: `Snip from ${where}` })
  }
  // Esc leaves snipping, and drops a snip not yet used.
  useEffect(() => {
    if (!snipping && !snipped) return
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === "Escape" && keysHere(pane)) (setSnipping(false), setSnip(null), setSnipped(null))
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  })
  // C: the question asked where the words were; Return makes the card.
  const [carding, setCarding] = useState<{ page: number; quote: string; x: number; y: number; bottom?: number; markId?: string; gem?: boolean } | null>(null)
  // The snip's bar keys, as its tips say: C a card of it (⌥C kept as a gem too), K keeps it as a gem.
  useToolKeys(snipped && !carding ? (event) => {
    if (!keysHere(pane) || event.metaKey || event.ctrlKey || event.shiftKey) return false
    if (event.target instanceof HTMLElement && event.target.closest("input, textarea, [contenteditable=true]")) return false
    if (event.code === "KeyC") return (setCarding({ page: snipped.page, quote: `![](${snipped.src})`, x: snipped.x, y: snipped.y, gem: event.altKey }), setSnipped(null), chime("open"), true)
    if (event.code === "KeyK" && !event.altKey) return (void keepSnip(snipped), true)
    return false
  } : null)
  // "Make your marked cards": every passage marked for a card, one after another,
  // each asking for its card's question where it is; Return makes the card and
  // the passage becomes a plain highlight, Esc ends the walk.
  const [walking, setWalking] = useState(0)
  const madeOne = useRef(false)
  const walkTo = (next: PdfMark | undefined, made: number): void => {
    if (!next) {
      setWalking(0)
      setCarding(null)
      return void said(made ? `Marked cards made: ${plural(made, 'card')}` : "Stopped making marked cards")
    }
    go(next.page)
    madeOne.current = false
    const box = scroller.current
    setCarding({ page: next.page, quote: next.quote, markId: next.id, x: Math.max(8, (box?.clientWidth ?? 600) / 2 - 160), y: (box?.scrollTop ?? 0) + 72 })
  }
  /** The picked words as the right-click menu's previews and the blank card read them. */
  const pickedAbout = (at: { page: number; start: number; end: number; quote: string }): Picked => ({ words: at.quote, sentence: sentenceOf(at), where: `${title}, p. ${at.page}`, by: author })
  const actions: ReadActions = {
    highlight: (color) => (rememberColor(color), void mark(color, false)),
    keep: () => void mark(lastColor(), true),
    copy: () => picked && void copyCited(picked.quote, picked.page),
    lookUp: () => {
      if (!picked) return
      // The sentence round the words, kept with what is saved so it says why at a glance.
      setLooking({ words: picked.quote, x: picked.x, y: picked.y + 24, from: { where: `${title}, p. ${picked.page}`, source: title, page: picked.page, link: pdfLink(src, name, picked.page, ""), sentence: sentenceOf(picked) } })
      chime("open")
    },
    card: (gem) => {
      if (!picked) return
      setCarding({ page: picked.page, quote: picked.quote, x: picked.x, y: picked.y, bottom: picked.bottom, gem })
      setPicked(null)
      chime("open")
    },
    blank: (gem) => {
      if (!picked) return
      // The words blanked in their sentence, as the menu's preview showed them.
      const { asked, answer } = blankOf(pickedAbout(picked))
      void cardOf(asked, answer, picked.page, false, gem)
      getSelection()?.removeAllRanges()
      setPicked(null)
    },
  }
  // The bar's keys, while words are picked here.
  useToolKeys(picked ? (event) => keysHere(pane) && readKey(event, actions) : null)

  /** A mark's colour changed, or the gem it became. */
  const change = async (one: PdfMark, to: Partial<PdfMark>): Promise<void> => {
    await call("pdf:mark", one.id, to)
    setMarks((all) => all.map((each) => (each.id === one.id ? { ...each, ...to } : each)))
  }
  /** Marks over the same words made one: `into` takes the words and colour given, the rest go (their gems stay). */
  const mergeMarks = async (into: PdfMark, all: PdfMark[], to: { color?: string | null; start: number; end: number; quote: string }): Promise<void> => {
    const gone = all.filter((one) => one.id !== into.id)
    await call("pdf:mark", into.id, { color: to.color ?? null, start: to.start, end: to.end, quote: to.quote })
    for (const one of gone) await call("pdf:unhighlight", one.id)
    setMarks((list) => list.filter((one) => !gone.some((left) => left.id === one.id)).map((one) => (one.id === into.id ? { ...one, ...to, prefix: "", suffix: "" } : one)))
  }
  /** Highlights kept stacked over the same words before they joined: one, in the colour drawn on top, with the fullest words of them. */
  const joinStacked = async (group: PdfMark[]): Promise<void> => {
    const into = group.at(-1)!
    const fullest = group.reduce((most, one) => (one.quote.length > most.quote.length ? one : most))
    // Where they all sit over one another, the words of them all; the same words kept twice in two places, the fullest's place.
    const over = group.every((one) => one.start < fullest.end && fullest.start < one.end)
    const start = over ? Math.min(...group.map((one) => one.start)) : fullest.start
    const end = over ? Math.max(...group.map((one) => one.end)) : fullest.end
    const layer = document.querySelector(`.pdf-reader .pdf-page[data-page="${fullest.page}"] .textLayer`)
    const quote = over && layer && (start < fullest.start || end > fullest.end) ? wordsIn(layer, start, end) : fullest.quote
    await mergeMarks(into, group, { color: into.color ?? null, start, end, quote })
    chime("saved")
    said("Highlights joined into one")
  }
  const keepMark = async (one: PdfMark): Promise<void> => {
    const gemId = await gemOf(one)
    await change(one, { gemId })
    // "Why keep this?" over the highlight itself.
    const band = scroller.current?.querySelector<HTMLElement>(`.pdf-mark[data-mark="${one.id}"]`)?.getBoundingClientRect()
    const frame = scroller.current?.getBoundingClientRect()
    if (band && frame && scroller.current) setWhyFor({ id: gemId, x: band.left + band.width / 2 - frame.left, y: band.top - frame.top + scroller.current.scrollTop, bottom: band.bottom - frame.top + scroller.current.scrollTop })
    chime("saved")
    said("Kept as a gem", true, { type: "nugget", id: gemId, title: one.quote })
  }

  /**
   * Words picked over part of a highlight on its page: "Extend the highlight" when they reach past it,
   * "Keep just these words" when they sit inside it. The highlight keeps its id, colour and gem.
   */
  const reshape = (one: PdfMark): { onExtend?: () => void; onTrim?: () => void } => {
    if (!picked || picked.page !== one.page || picked.end <= one.start || picked.start >= one.end) return {}
    if (picked.start === one.start && picked.end === one.end) return {}
    const layer = document.querySelector(`.pdf-reader .pdf-page[data-page="${one.page}"] .textLayer`)
    const to = async (start: number, end: number, words: string): Promise<void> => {
      const quote = words.replace(/\s+/g, " ").trim()
      await call("pdf:mark", one.id, { start, end, quote })
      setMarks((all) => all.map((each) => (each.id === one.id ? { ...each, start, end, quote, prefix: "", suffix: "" } : each)))
      getSelection()?.removeAllRanges()
      setPicked(null)
      chime("saved")
      said(end - start > one.end - one.start ? "Highlight extended" : "Highlight cut to the words picked")
    }
    const text = layer?.textContent ?? ""
    const inside = picked.start >= one.start && picked.end <= one.end
    return inside
      ? { onTrim: () => void to(picked.start, picked.end, picked.quote) }
      : { onExtend: () => { const start = Math.min(one.start, picked.start); const end = Math.max(one.end, picked.end); void to(start, end, layer ? wordsIn(layer, start, end) : text.slice(start, end)) } }
  }

  const remove = async (mark: PdfMark): Promise<void> => {
    await call("pdf:unhighlight", mark.id)
    setMarks((all) => all.filter((one) => one.id !== mark.id))
    chime("away")
    said(mark.color === "later" ? "Card mark removed" : "Highlight removed")
  }

  const go = (to: number): void => {
    if (!doc) return
    const n = Math.min(Math.max(1, Math.round(to)), doc.numPages)
    scroller.current?.querySelector<HTMLElement>(`.pdf-page[data-page="${n}"]`)?.scrollIntoView({ block: "start" })
    setPage(n)
    // A jump is not reading: no taps until a hand scrolls again.
    byHandScroll.current = false
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
  // Opened: into Recent, in the sidebar and ⌘K, as a note is when it opens.
  useEffect(() => {
    touch("pdf", pdfFocus(src, name))
    void call("home:opened", "pdf", pdfFocus(src, name))
  }, [src, name])
  // The page you are on, kept as you read: the next time it opens there.
  useEffect(() => {
    if (doc) void call("pdf:read", src, page, doc.numPages)
  }, [doc, src, page])

  const step = (by: number): void => {
    // From a pinched zoom (1.37) the next step up is 1.5, down 1.25.
    const next = by > 0 ? ZOOMS.find((one) => one > zoom + 0.001) : [...ZOOMS].reverse().find((one) => one < zoom - 0.001)
    // At its smallest or largest: the "nope" a note's text size gives at its ends.
    if (next === undefined) return chime("nope")
    zoomTo(next)
  }

  // Zoom kept where you look: the point under the pointer (or the middle of
  // the pages, from the keys and buttons) stays put as the pages grow.
  const chip = useRef<HTMLDivElement>(null)
  const chipOff = useRef(0)
  const showChip = (value: number): void => {
    const el = chip.current
    if (!el) return
    el.textContent = Math.abs(value - 1) < 0.005 ? "Fit" : `${Math.round(value * 100)}%`
    el.dataset.shown = ""
    window.clearTimeout(chipOff.current)
    // A chip has no end of its own: it says the zoom while it changes, and goes once it rests.
    chipOff.current = window.setTimeout(() => delete el.dataset.shown, 900)
  }
  const anchor = useRef<{ page: number; fx: number; fy: number; x: number; y: number; from: number } | null>(null)
  const [zoomed, setZoomed] = useState(0)
  const zoomTo = (next: number, at?: { x: number; y: number }, from = next): void => {
    // The pages kept round a point as they grow are no reading: no taps.
    byHandScroll.current = false
    const box = scroller.current
    if (!box) return setZoom(next)
    const frame = box.getBoundingClientRect()
    const x = at?.x ?? frame.left + box.clientWidth / 2
    const y = at?.y ?? frame.top + box.clientHeight / 2
    // The sheet nearest the point and where on it the point is, read as drawn now (a pinch's stretch included).
    let best: { page: number; fx: number; fy: number; d: number } | null = null
    for (const sheet of box.querySelectorAll<HTMLElement>(".pdf-page")) {
      const r = sheet.getBoundingClientRect()
      if (r.bottom < frame.top || r.top > frame.bottom) continue
      const d = Math.max(0, r.top - y, y - r.bottom)
      if (!best || d < best.d) best = { page: Number(sheet.dataset.page), fx: (x - r.left) / r.width, fy: (y - r.top) / r.height, d }
    }
    anchor.current = best && { page: best.page, fx: best.fx, fy: best.fy, x, y, from: from / next }
    setZoom(next)
    setZoomed((n) => n + 1)
    showChip(next)
  }
  useLayoutEffect(() => {
    const box = scroller.current
    const one = anchor.current
    anchor.current = null
    const pages = box?.querySelector<HTMLElement>(".pdf-pages")
    if (!box || !pages) return
    pages.style.transform = ""
    const sheet = one && box.querySelector<HTMLElement>(`.pdf-page[data-page="${one.page}"]`)
    if (!one || !sheet) return
    const r = sheet.getBoundingClientRect()
    box.scrollLeft += r.left + one.fx * r.width - one.x
    box.scrollTop += r.top + one.fy * r.height - one.y
    // Past the end of the zoom: the stretch springs back to it, round the same point.
    if (Math.abs(one.from - 1) > 0.002 && !still()) {
      const p = pages.getBoundingClientRect()
      pages.style.transformOrigin = `${one.x - p.left}px ${one.y - p.top}px`
      pages.animate([{ transform: `scale(${one.from})` }, { transform: "scale(1)" }], { duration: 380, easing: "cubic-bezier(0.34, 1.4, 0.64, 1)" })
    }
  }, [zoomed])
  const zoomNow = useRef(zoom)
  zoomNow.current = zoom
  const zoomToNow = useRef(zoomTo)
  zoomToNow.current = zoomTo
  // Pinch on a trackpad (a wheel with ctrl, as Chromium tells it) and ⌘ or ctrl
  // with a mouse wheel: the pages stretch as one picture under the fingers,
  // then are drawn again, sharp, at the zoom they came to rest at. Past the
  // smallest or largest they give a little, and spring back on letting go.
  useEffect(() => {
    const box = scroller.current
    if (!box) return
    let pinch: { base: number; raw: number; x: number; y: number; rest: number } | null = null
    const MIN = ZOOMS[0]
    const MAX = ZOOMS[ZOOMS.length - 1]
    const clamp = (n: number): number => Math.min(MAX, Math.max(MIN, n))
    const give = (n: number): number => (still() ? clamp(n) : n > MAX ? MAX * (n / MAX) ** 0.25 : n < MIN ? MIN * (n / MIN) ** 0.25 : n)
    const settle = (): void => {
      const one = pinch
      pinch = null
      if (one) zoomToNow.current(clamp(one.raw), { x: one.x, y: one.y }, give(one.raw))
    }
    const onWheel = (event: WheelEvent): void => {
      if (!event.ctrlKey && !event.metaKey) return
      event.preventDefault()
      const pages = box.querySelector<HTMLElement>(".pdf-pages")
      if (!pages) return
      if (!pinch) {
        const r = pages.getBoundingClientRect()
        pinch = { base: zoomNow.current, raw: zoomNow.current, x: event.clientX, y: event.clientY, rest: 0 }
        pages.style.transformOrigin = `${event.clientX - r.left}px ${event.clientY - r.top}px`
      }
      const dy = event.deltaMode === 1 ? event.deltaY * 33 : event.deltaY
      // A mouse wheel's notch (about 100) a fifth larger or smaller; a pinch's small steps in proportion.
      pinch.raw = Math.min(MAX * 3, Math.max(MIN / 3, pinch.raw * Math.exp(-dy * (Math.abs(dy) >= 40 ? 0.002 : 0.01))))
      const shown = give(pinch.raw)
      pages.style.transform = `scale(${shown / pinch.base})`
      showChip(shown)
      // A wheel never says it has ended: a pause is the end of the gesture.
      window.clearTimeout(pinch.rest)
      pinch.rest = window.setTimeout(settle, 160)
    }
    box.addEventListener("wheel", onWheel, { passive: false })
    return () => box.removeEventListener("wheel", onWheel)
    // showChip reads only a ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  /** Double-click a page: from Fit to its actual size (twice Fit when that is about the same), else back to Fit, round the click. */
  const toggleZoom = (event: React.MouseEvent): void => {
    const target = event.target as HTMLElement
    const sheet = target.closest<HTMLElement>(".pdf-page")
    // A double-click on words picks a word, as everywhere.
    if (!sheet || snipping || target.closest(".textLayer span")) return
    const scale = parseFloat(sheet.style.getPropertyValue("--total-scale-factor")) || zoom
    const actual = 96 / 72 / (scale / zoom)
    const next = Math.abs(zoom - 1) > 0.01 ? 1 : Math.min(ZOOMS[ZOOMS.length - 1], Math.abs(actual - 1) < 0.1 ? 2 : actual)
    getSelection()?.removeAllRanges()
    zoomTo(next, { x: event.clientX, y: event.clientY })
  }
  // ⌘+ ⌘− ⌘0 while this reader is in the pane in front: its own zoom, not the
  // app's size. The menu's keys are offered here first (preload), and the
  // page's own key handler steps aside once this one has taken them.
  const pane = usePane()
  useEffect(() => {
    const zoomBy = (way: number): void => (way === 0 ? zoomTo(1) : step(way))
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
      // Each page coming into place taps the trackpad (a fling's in-between pages fold into one); its ends and chapters, firmly.
    }
  }

  // The chapter you are in: the outline's latest entry that starts on or
  // before this page, so every page of a chapter lights it, not only its first.
  const hereAt = chapterAt(outline, page)
  const chapter = hereAt >= 0 ? outline[hereAt].title : ""

  return (
    <div className={`pdf-reader${paper && !dark ? " is-paper" : ""}${dark ? " is-dark" : ""}`} data-zoom={zoom} data-layout={layout}>
      <div className="pdf-reader-bar">
        <span className="pdf-reader-heading" title={chapter ? `${title}: ${chapter}` : title}>
          <span className="pdf-reader-title">{title}</span>
          {chapter && <span data-pdf-chapter className="pdf-reader-chapter">{chapter}</span>}
        </span>
        <span className="pdf-reader-page">
          <ScrubField value={page} max={doc?.numPages ?? 1} onChange={go} marks={chapters} />
          <span className="pdf-reader-of"> / {doc?.numPages ?? "…"}</span>
        </span>
        {/* The title wins the room: in a narrow pane the tools wait behind "More", in the same order. */}
        <FitActions room={doc?.numPages}>
          <Button data-style="ghost" aria-label="Sidebar" title="Pages and outline" data-active-state={railShown ? "on" : "off"} onClick={toggleRail}>
            <PanelLeft className="tiptap-button-icon" />
          </Button>
          <Button data-style="ghost" aria-label="Details" title={detailsOut ? "Hide details" : "Details"} data-active-state={detailsOut ? "on" : "off"} onClick={() => (chime(detailsOut ? "fold" : "slide"), showDetails(!detailsOut, pane))}>
            <PanelRight className="tiptap-button-icon" />
          </Button>
          {marks.some((one) => one.color === "later") && (
            <Button data-style="ghost" aria-label="Make your marked cards" title="Make your marked cards: a card from each passage you marked, one after another" data-active-state={walking ? "on" : "off"} onClick={() => (setWalking(1), walkTo(marks.find((one) => one.color === "later"), 0))}>
              <SquareStack className="tiptap-button-icon" />
              <span className="tiptap-button-text" data-card-later-count>{marks.filter((one) => one.color === "later").length}</span>
            </Button>
          )}
          <Button data-style="ghost" aria-label="Snip" title="Snip a figure or an equation onto a card: drag over it" data-active-state={snipping ? "on" : "off"} onClick={() => (setSnipping(!snipping), setSnip(null), setSnipped(null))}>
            <Scissors className="tiptap-button-icon" />
          </Button>
          <Button data-style="ghost" aria-label="Find" title="Find  ⌘F" data-active-state={finding ? "on" : "off"} onClick={() => (finding ? closeFind() : (setFinding(true), requestAnimationFrame(() => findField.current?.focus())))}>
            <Search className="tiptap-button-icon" />
          </Button>
          <Button data-style="ghost" aria-label="Smaller" title="Smaller  ⌘−" onClick={() => step(-1)}>
            <Minus className="tiptap-button-icon" />
          </Button>
          <Button data-style="ghost" aria-label="Fit width" title="Fit width  ⌘0" onClick={() => zoomTo(1)}>
            <span className="tiptap-button-text"><Roll text={zoom === 1 ? "Fit" : `${Math.round(zoom * 100)}%`} /></span>
          </Button>
          <Button data-style="ghost" aria-label="Larger" title="Larger  ⌘+" onClick={() => step(1)}>
            <Plus className="tiptap-button-icon" />
          </Button>
          <Button
            data-style="ghost"
            aria-label={paper && !dark ? "White pages" : "Paper pages"}
            title={paper && !dark ? "White pages" : "Paper pages: easier on the eyes, pictures kept true"}
            data-active-state={paper && !dark ? "on" : "off"}
            onClick={() => {
              // With dark pages on it says "Paper pages" and gives paper; otherwise it switches paper and white.
              setPaper(dark ? true : !paper)
              setDark(false)
            }}
          >
            <ScrollText className="tiptap-button-icon" />
          </Button>
          {/* How the pages lie and how they look, as Preview's View menu has it: kept per book, and "Dark pages" for every book. */}
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <Button data-style="ghost" aria-label="Page layout" title="Page layout and dark pages">
                <BookOpen className="tiptap-button-icon" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56" data-page-layout-menu>
              <DropdownMenuLabel>Pages</DropdownMenuLabel>
              <DropdownMenuRadioGroup value={layout} onValueChange={(to) => (chime("tap"), setLayout(to as PageLayout))}>
                {LAYOUTS.map((one) => (
                  <DropdownMenuRadioItem key={one.id} value={one.id} data-layout-choice={one.id}>
                    {one.label}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
              <DropdownMenuSeparator />
              <DropdownMenuRadioGroup value={look} onValueChange={(to) => (chime("tap"), setLook(to as PageLook))}>
                {LOOKS.map((one) => (
                  <DropdownMenuRadioItem key={one.id} value={one.id} data-look-choice={one.id} data-dark-pages={one.id === "dark" ? "" : undefined}>
                    {one.label}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </FitActions>
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
            <span className="tiptap-find-bar-count" aria-label={`${num(found.length ? at + 1 : 0)} of ${num(found.length)}`}>
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
      <div ref={chip} className="pdf-zoom-chip" aria-hidden />
      <div ref={body} className="pdf-reader-body" data-rail-squeeze={squeeze}>
      {railShown && doc && (
        <PdfSide doc={doc} page={page} outline={outline} tab={railShown} onTab={(tab) => (setTabByHand(true), showRail(tab))} onGo={go} narrow={squeeze === "narrow"} onDrag={() => setByHand(true)} layout={layout} onLayout={(to) => (chime("tap"), setLayout(to))} />
      )}
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div
            ref={scroller}
            className="pdf-reader-scroll"
            onScroll={onScroll}
            onWheel={(event) => void (byHandScroll.current = !event.ctrlKey && !event.metaKey)}
            onPointerDown={() => void (byHandScroll.current = true)}
            onKeyDown={() => void (byHandScroll.current = true)}
            onDoubleClick={toggleZoom}
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
              spread={layout === "spread"}
              fit={layout === "single" ? "height" : "width"}
              dark={dark}
              onWords={(one, quote) => void call("pdf:mark", one.id, { quote, start: one.start, end: one.end }).then(() => setMarks((all) => all.map((each) => (each.id === one.id ? { ...each, quote } : each))))}
              onLoad={(loaded) => {
                setDoc(loaded)
                void pdfTitle(loaded, name).then((read) => {
                  setTitle(read)
                  learnTitle(src, read)
                })
              }}
            />
            {snipping && (
              <div
                data-pdf-snip
                className="pdf-snip-layer"
                style={{ height: scroller.current?.scrollHeight }}
                onPointerDown={(event) => {
                  if (event.button !== 0) return
                  event.currentTarget.setPointerCapture(event.pointerId)
                  const at = within(event)
                  setSnip({ x: at.x, y: at.y, w: 0, h: 0, from: at })
                  setSnipped(null)
                }}
                onPointerMove={(event) => {
                  if (!snip?.from || !event.buttons) return
                  const at = within(event)
                  setSnip({ ...snip, x: Math.min(at.x, snip.from.x), y: Math.min(at.y, snip.from.y), w: Math.abs(at.x - snip.from.x), h: Math.abs(at.y - snip.from.y) })
                }}
                onPointerUp={() => snip && snip.w > 6 && snip.h > 6 ? void cut(snip) : setSnip(null)}
              >
                {snip && <div className="pdf-snip-box" style={{ left: snip.x, top: snip.y, width: snip.w, height: snip.h }} />}
              </div>
            )}
            {snipped && !carding && (
              <div className="pdf-keep-bar" style={{ left: snipped.x, top: Math.max(8, snipped.y - 48) }} onMouseDown={(event) => event.preventDefault()}>
                <Toolbar variant="floating">
                  <ToolbarGroup>
                    <Button data-style="ghost" aria-label="Card" title={"Make a card of this snip  C\nIn Review only; ⌥C keeps it as a gem too"} onClick={(event) => (setCarding({ page: snipped.page, quote: `![](${snipped.src})`, x: snipped.x, y: snipped.y, gem: event.altKey }), setSnipped(null))}>
                      <SquareStack className="tiptap-button-icon" />
                      <span className="tiptap-button-text">Card</span>
                    </Button>
                    <Button data-style="ghost" aria-label="Keep" title="Keep the snip as a gem  K" onClick={() => void keepSnip(snipped)}>
                      <Gem className="tiptap-button-icon" />
                      <span className="tiptap-button-text">Keep</span>
                    </Button>
                  </ToolbarGroup>
                </Toolbar>
              </div>
            )}
            {carding && (
              <WhyAfter
                at={carding}
                ask={{ kept: carding.quote.startsWith("![](") ? "Answer: the snip" : `Answer: ${carding.quote.length > 28 ? `${carding.quote.slice(0, 27)}…` : carding.quote}`, label: "The card's question", placeholder: carding.quote.startsWith("![](") ? "The question this snip answers" : "The question these words answer" }}
                onSave={(question) => {
                  void cardOf(question, carding.quote, carding.page, !!walking, carding.gem)
                  const one = marks.find((each) => each.id === carding.markId)
                  if (one) (madeOne.current = true, void change(one, { color: null }))
                }}
                onDone={() => {
                  getSelection()?.removeAllRanges()
                  if (!walking || !carding.markId) return setCarding(null)
                  // Made: on to the next passage. Esc or a click away: the walk ends here.
                  if (!madeOne.current) return walkTo(undefined, walking - 1)
                  setWalking(walking + 1)
                  walkTo(marks.find((each) => each.color === "later" && each.id !== carding.markId), walking)
                }}
              />
            )}
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
              about={picked ? undefined : () => ({ words: hit.quote, sentence: hit.quote, where: `${title}, p. ${hit.page}`, by: author })}
              {...reshape(hit)}
            />
          ) : null}
          {/* Words picked over a highlight: its own rows first, then what can be done with the words picked. */}
          {hit && picked && <ContextMenuSeparator />}
          {picked && <PickedMenu actions={actions} about={() => pickedAbout(picked)} />}
        </ContextMenuContent>
      </ContextMenu>
      {detailsOut && <ReadDetails src={src} name={name} onPage={go} chapters={outline} cover={cover} title={title} author={author} pages={doc?.numPages} page={page} marks={marks} lit={lit} onMark={goToMark} onGather={() => void gather()} onJoin={(group) => void joinStacked(group)} />}
      </div>
    </div>
  )
}
