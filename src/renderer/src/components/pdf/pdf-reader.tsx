import { BLANK } from "@/lib/blanks"
import { markOpened } from '@/lib/media-opened'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { useToolKeys } from "@/lib/tool-keys"
import type { PDFDocumentProxy } from "pdfjs-dist"
import { Sparkles } from "lucide-react"
import { BookOpen, Check, ChevronDown, ChevronUp, Copy, Gem, Minus, PanelLeft, PanelRight, Plus, Scissors, Search, SquareStack, X, ZoomIn } from "lucide-react"
import { Button } from "@/components/tiptap-ui-primitive/button"
import { Toolbar, ToolbarGroup } from "@/components/tiptap-ui-primitive/toolbar"
import { saveAttachment } from "@/extensions/image-drop"
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuLabel, ContextMenuSeparator, ContextMenuShortcut, ContextMenuTrigger } from "@/components/ui/context-menu"
import { Swatch } from "@/components/haligtree/row-menu"
import { hueName, type Hue } from "@/lib/books"
import { ChapterCards } from "./chapter-cards"
import { useStudyAi } from "@/lib/study-ai"
import { Roll } from "@/lib/roll"
import { call, haligtree, useLive, type Settings } from "@/lib/haligtree"
import { touch } from "@/lib/open-today"
import { host, said } from "@/lib/host"
import { canSplit, isSplit, keysHere, usePane } from "@/lib/split"
import { chime, pageTurn } from "@/lib/sound"
import { writing } from "@/lib/keys"
import { cue } from "@/lib/cues"
import { MarkMenu, PickedMenu, WhyAfter, blankOf, cited, lastColor, readKey, rememberColor, type MarkColor, type Picked, type ReadActions } from "./read-bar"
import { NARROW, PdfSide, chapterAt, railWidth, usePdfOutline, type RailTab } from "./pdf-rail"
import { ReadDetails } from "./pdf-details"
import { LookUpCard, type LookedUpIn } from "./look-up"
import { usePdfCover } from "./pdf-cover"
import { detailsOutHere, showDetails, useDetailsShown } from "@/lib/reading"
import { ScanDetail, ScanLine } from "./pdf-scan"
import { PdfPages, forgetPdf, loadPdf, offsetsIn, pdfAuthor, pdfTitle, sheetAt, showPage, wordsIn, type PdfMark } from "./pdf-pages"
import { pressAway } from "./reader-select"
import { FitActions, listEnd, quietly, toast } from "@/components/haligtree/ui"
import { RIBBON_HUES, ReadOnLine, Ribbon, RibbonMenuRows, keepRibbon, readRibbon, ribbonInk, type RibbonPlace } from "./ribbon"

import { LAYOUTS, LOOKS, useDarkPages, useOneInColour, usePageLayout, usePageLook, usePaperPages, type PageLayout, type PageLook } from "./paper"
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuShortcut, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { ScrubField } from "./scrub-field"
import { PageLabel, usePageLabels } from "./pdf-labels"
import { cleanTitle } from "@/lib/clean-title"
import { drawing } from "./pdf-draw"
import { motionNow, still } from "@/lib/motion"
import { plural, num } from '../../../../main/dates'
import { isYouTube } from '../../../../main/video-thumbs'

/** A page column this wide reads comfortably; below it the rail squeezes, below `TIGHT` it folds away. */
const COMFY = 520
const TIGHT = 420
/** A reader narrower than this shows its pages alone: Details beside them left the pages no room (482 wide in a 560 window); half of a wide split (about 650) keeps both. */
const DETAILS_ROOM = 600
/** How wide a window has to be for a PDF on its own to start with both sides open. */
const BOTH_SIDES = 1400
/** A rail narrower than this cuts the outline's titles to a word: it opens on the pages instead. */
const OUTLINE_ROOM = 180
/** The pages' padding either side (pdf.css, .pdf-reader-scroll). */
const PAD = 48

/** The zoom steps, as Preview's: fit width is 1. */
const ZOOMS = [0.5, 0.67, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3]

/** Where a PDF opens full size: `haligtree:pdf`, read by the main window, which opens it in a pane. */
export const openPdf = (src: string, name: string, page?: number, mark?: string, aside = false): void => {
  markOpened(src)
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

/**
 * A link in a note followed on a click, as its hover says, wherever the note's words are drawn (its page, quick
 * capture, a board's cards, a link card): a PDF's in the reader at its page (beside, on ⌥-click), a web page in the
 * browser, or in the reader to the side of `from` (the pane it was clicked in) on ⌥-click. ⌘-click on a web page is
 * the browser's too (setWindowOpenHandler in main).
 */
export function followLink(href: string, event: { altKey: boolean; metaKey: boolean }, from?: string | null): void {
  if (followPdfLink(href)) return
  if (event.altKey && !event.metaKey && isReadable(href)) return openArticle(href, undefined, "aside", from)
  window.open(href, "_blank", "noopener")
}

/**
 * A web page in the reader: a step in the pane in front (or in `from`, the
 * pane it was asked from, as a link followed in the reader is), or as `how`
 * asks: to the side ("Open in the reader to the side", ⌥-click, ⌥↵) or in a
 * new tab. A PDF link opens the PDF reader instead.
 */
export const openArticle = (href: string, mark?: string, how?: "aside" | "tab", from?: string | null): void => {
  if (isWebPdf(href)) return void openWebPdf(href, how === "aside")
  // A video has no article to read: the reader could only say the page could
  // not be reached. Played where it lives instead, as clicking its card does.
  if (!isReadable(href)) return void window.open(href, "_blank", "noopener")
  articleFlash = mark ?? null
  if (canSplit()) window.dispatchEvent(new CustomEvent("haligtree:web", { detail: { href, how, from } }))
  else window.api.openInHome("web", href)
}
/**
 * Whether the reader can make an article of the page: any web page but a
 * video's (YouTube's watch pages hold a player, not words). What every
 * "Open in the reader" asks before it is offered.
 */
export const isReadable = (href: string | null | undefined): boolean => !!href && /^https?:\/\//i.test(href) && !isYouTube(href)
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
export async function openWebPdf(href: string, aside = false): Promise<void> {
  const kept = await host().fetchPdf?.(href)
  if (!kept) return void said("That PDF could not be fetched", false)
  if (canSplit()) openPdf(kept.src, kept.name, undefined, undefined, aside)
  else window.api.openInHome("pdf", pdfFocus(kept.src, kept.name))
}

/** Titles read out of PDFs, by address: what the window's top bar and a pane's tab call it. */
const titles = new Map<string, string>()
/** A PDF's title once read, else the name it arrived under without `.pdf`. */
export const pdfName = (src: string, name: string): string => titles.get(src) ?? (cleanTitle(name.replace(/\.pdf$/i, "")) || name.replace(/\.pdf$/i, "") || "PDF")
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
  // Its pages read (pdf-scan.tsx): opened again, now with its words, at the page it was on.
  const [opened, setOpened] = useState(0)
  // The new copy is loaded before the pages are swapped, so they never stand empty while it comes.
  const readAgain = useCallback(() => {
    forgetPdf(src)
    void loadPdf(src).catch(() => null).then(() => setOpened((n) => n + 1))
  }, [src])
  const [title, setTitle] = useState(() => pdfName(src, name))
  const [zoom, setZoom] = useState(1)
  const [page, setPage] = useState(start ?? 1)
  const [paper] = usePaperPages()
  const [dark] = useDarkPages()
  const [look, setLook] = usePageLook()
  const [oneInColour, setOneInColour] = useOneInColour()
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
  const [current, setCurrent] = useState<string | null>(null)
  // The match on show, by its place in the book: matches found later, on earlier pages, never move it.
  const at = Math.max(0, found.findIndex((one) => one.id === current))
  const pageTexts = useRef<Map<number, string>>(new Map())
  const findField = useRef<HTMLInputElement>(null)
  /** A page's words, as its text layer holds them (the same characters in the same order, so offsets agree): read once. */
  const textOf = async (loaded: PDFDocumentProxy, n: number): Promise<string> => {
    let text = pageTexts.current.get(n)
    if (text === undefined) {
      const content = await (await loaded.getPage(n)).getTextContent()
      text = content.items.map((item) => ("str" in item ? item.str : "")).join("")
      pageTexts.current.set(n, text)
    }
    return text
  }
  // Each search is counted: a newer one (a key typed since) drops what an older one finds.
  const findRun = useRef(0)
  const findWait = useRef(0)
  const [seeking, setSeeking] = useState(false)
  /** Looks for the words a moment after the last key, from the page you are on onward, all pages read a few at once. */
  const find = (words: string): void => {
    window.clearTimeout(findWait.current)
    const run = ++findRun.current
    if (!doc || !words.trim()) return void (setFound([]), setSeeking(false))
    setSeeking(true)
    findWait.current = window.setTimeout(() => void seek(doc, words.toLowerCase(), run), 150)
  }
  const seek = async (loaded: PDFDocumentProxy, look: string, run: number): Promise<void> => {
    const total = loaded.numPages
    const order = Array.from({ length: total }, (_, i) => ((page - 1 + i) % total) + 1)
    const hits = new Map<number, PdfMark[]>()
    let shown = false
    // 24 pages at a time: the worker reads them back to back, and the count grows as each batch is in.
    for (let i = 0; i < order.length; i += 24) {
      const batch = order.slice(i, i + 24)
      const texts = await Promise.all(batch.map((n) => textOf(loaded, n).catch(() => "")))
      if (run !== findRun.current) return
      batch.forEach((n, k) => {
        const text = texts[k]
        const lower = text.toLowerCase()
        const here: PdfMark[] = []
        for (let from = lower.indexOf(look); from >= 0; from = lower.indexOf(look, from + look.length))
          here.push({ id: `find:${n}:${from}`, page: n, quote: text.slice(from, from + look.length), start: from, end: from + look.length })
        if (here.length) hits.set(n, here)
      })
      const all = [...hits.keys()].sort((a, b) => a - b).flatMap((n) => hits.get(n)!)
      // The first match on or after the page you are on, shown as soon as it is found.
      const first = shown ? null : batch.map((n) => hits.get(n)?.[0]).find(Boolean)
      setFound(all)
      if (first) {
        shown = true
        setCurrent(first.id)
        go(first.page)
      }
    }
    if (run === findRun.current) setSeeking(false)
  }
  // The words of every page read while nothing else is asked, once the book is open: a find then answers at once.
  // One page at a time, and only while no page is being drawn or waits to be: pdf.js reads both in one worker, and
  // reading ahead in batches held up the page a jump was waiting for (2.1s to reach p. 300).
  useEffect(() => {
    if (!doc) return
    // Read afresh for a new copy of the book (its pages read since, with their words).
    pageTexts.current = new Map()
    let next = 1
    let ask = 0
    let live = true
    const warm = (): void => {
      if (!live || next > doc.numPages) return
      if (drawing()) return void (ask = requestIdleCallback(warm, { timeout: 1000 }))
      void textOf(doc, next++).catch(() => "").then(() => live && void (ask = requestIdleCallback(warm)))
    }
    ask = requestIdleCallback(warm, { timeout: 1000 })
    return () => ((live = false), cancelIdleCallback(ask))
    // textOf reads only refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc])
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
    setCurrent(found[next].id)
    go(found[next].page)
    cue("find-step", next)
  }
  const closeFind = (): void => {
    setFinding(false)
    setFound([])
    // A search still reading pages stops here.
    findRun.current++
    window.clearTimeout(findWait.current)
    setSeeking(false)
    cue("find-close")
  }
  useEffect(() => {
    if (finding) cue("find")
  }, [finding])
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (!keysHere(pane)) return
      // "/" finds too, and n and N step through what it found, as the web reader's do (web-reader.tsx).
      const plain = !event.metaKey && !event.ctrlKey && !event.altKey && !writing()
      const stepping = plain && finding && (event.key === "n" || event.key === "N")
      // G and g g go to the end and to the start, as in every list (ui.tsx listEnd), and as the web reader's do.
      const end = plain && !finding ? listEnd(event) : null
      if (end) {
        event.preventDefault()
        event.stopPropagation()
        const box = scroller.current
        return void box?.scrollTo({ top: end === "first" ? 0 : box.scrollHeight })
      }
      // ⌘D: the ribbon laid on the page you are on, as a browser's ⌘D keeps your place.
      if (event.metaKey && !event.altKey && !event.shiftKey && !event.ctrlKey && event.code === "KeyD" && !writing() && doc) {
        event.preventDefault()
        event.stopPropagation()
        return ribbonHere()
      }
      // ⇧⌘D: back to the ribbon.
      if (event.metaKey && event.shiftKey && !event.altKey && !event.ctrlKey && event.code === "KeyD" && !writing() && doc) {
        event.preventDefault()
        event.stopPropagation()
        return ribbon ? goRibbon() : said("No ribbon is laid in this book yet: right-click a page, or press ⌘D", true, undefined, { cue: "nope" })
      }
      if (!stepping && !(plain && event.key === "/") && !(event.metaKey && !event.altKey && !event.shiftKey && event.code === "KeyF")) return
      event.preventDefault()
      event.stopPropagation()
      if (stepping) return stepFind(event.key === "N")
      setFinding(true)
      requestAnimationFrame(() => findField.current?.select())
    }
    window.addEventListener("keydown", onKey, true)
    return () => window.removeEventListener("keydown", onKey, true)
  })

  // The PDF's own outline, if it has one: each entry's title, depth and page (pdf-rail.tsx).
  const outline = usePdfOutline(doc)
  // The book's printed page numbers ("48" for the file's 50th page), named everywhere a page is (pdf-labels.ts).
  const { labels, label, find: findLabel } = usePageLabels(src, doc)
  /** The pages a chapter starts on: felt firmly as you scroll or scrub onto one. */
  const chapters = useMemo(() => new Set(outline.map((one) => one.page)), [outline])

  // Every highlight in the book, in page order, beside the pages: a click goes to it and lights it.
  // Details at the right, shown and hidden with a note's (the same button, and ⇧⌘B).
  const detailsOut = useDetailsShown()
  const ownPane = usePane()
  // Opened on its own in a window with room, both sides start open: the pages at the left, Details at the right.
  const roomy = (): boolean => !isSplit() && innerWidth >= BOTH_SIDES
  useLayoutEffect(() => (ownPane && roomy() ? detailsOutHere(ownPane) : undefined), []) // eslint-disable-line react-hooks/exhaustive-deps
  const cover = usePdfCover(src, name)
  const [author, setAuthor] = useState("")
  useEffect(() => {
    if (doc) void pdfAuthor(doc).then(setAuthor)
  }, [doc])
  // The left rail, on the tab you last left it on for every PDF; shut as you left it only in a split or a small window.
  const [rail, setRail] = useState<RailTab | null>(() => {
    const kept = localStorage.getItem("pdf-rail") ?? ""
    return ["pages", "outline"].includes(kept) ? (kept as RailTab) : roomy() ? "pages" : null
  })
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
  // The reader's whole width: under `DETAILS_ROOM` the pages keep it all, and Details waits for a wider window.
  const [wide, setWide] = useState(Infinity)
  const detailsFit = wide >= DETAILS_ROOM
  const [byHand, setByHand] = useState(false)
  useLayoutEffect(() => {
    const el = body.current
    if (!el) return
    // The room the rail and the pages share: the body less Details, so the rail's own width never feeds back.
    const measure = (): void => (setRoom(el.clientWidth - (el.querySelector<HTMLElement>(":scope > .read-details")?.offsetWidth ?? 0)), setWide(el.clientWidth))
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
  const toggleRail = (): void => (chime("tap"), setByHand(true), showRail(railShown ? null : rail ?? "pages"))
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
        { type: "paragraph", content: [{ type: "text", text: `${title}, p. ${label(one.page)}`, marks: [{ type: "link", attrs: { href: pdfLink(src, name, one.page, one.id) } }] }] },
      ]),
    }
    const id = await window.api.captures.create({ kind: "note", title: `Highlights from ${title}`, body })
    said(`${plural(sorted.length, 'highlight')} gathered into a note`, true, undefined, { cue: "saved" })
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
    return { author, where: `${title}, p. ${label(page)}` }
  }
  /** A gem of a mark's words: the quote, the book and page it came from, and a link back to the mark. */
  const gemOf = async (mark: { id: string; page: number; quote: string }): Promise<string> => {
    const { author, where } = await whereFrom(mark.page)
    // The book is the gem's source and the page its place; its author, when the file names one, who said it.
    return call<string>("nugget:from", `${mark.quote}\n\n[${where}](${pdfLink(src, name, mark.page, mark.id)})`, { attribution: author || null, medium: title, passage: `p. ${label(mark.page)}`, kind: "quote" })
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
      // One sound: kept as a gem just now, keepMark said so with its own.
      if (!gem) said(under.length > 1 ? "Highlights joined into one" : start < into.start || end > into.end ? "Highlight extended" : "Highlight colour changed", true, undefined, { cue: "saved" })
      else if (into.gemId) chime("saved")
      return
    }
    const id = crypto.randomUUID()
    const gemId = gem ? await gemOf({ id, page: picked.page, quote: picked.quote }) : null
    await call("pdf:highlight", src, { id, page: picked.page, quote: picked.quote, start: picked.start, end: picked.end, gemId, color })
    setMarks((all) => [...all, { id, page: picked.page, quote: picked.quote, start: picked.start, end: picked.end, gemId, color }])
    if (gemId) setWhyFor({ id: gemId, x: picked.x, y: picked.y, bottom: picked.bottom })
    getSelection()?.removeAllRanges()
    setPicked(null)
    said(gem ? "Kept as a gem" : color === "later" ? "Marked for a card" : "Highlighted", true, gemId ? { type: "nugget", id: gemId, title: picked.quote } : undefined, { cue: "saved" })
  }
  const copyCited = async (quote: string, page: number): Promise<void> => {
    const { author, where } = await whereFrom(page)
    await navigator.clipboard.writeText(cited(quote, author ? `${author}, ${where}` : where))
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
  const cardOf = async (prompt: string, answer: string, page: number, quiet = false, gem = false): Promise<string> => {
    const { author, where } = await whereFrom(page)
    // A study card (Review only), unless ⌥ was held or Settings keeps reading cards as gems.
    const id = await call<string>("nugget:from", `${answer}\n\n[${where}](${pdfLink(src, name, page, "")})`, { attribution: author || null, medium: title, passage: `p. ${label(page)}`, kind: "quote", card: { gem } })
    // Named by its question, as a card is in every list and in ⌘K: a snip's first line is its picture, never a name.
    // A fill-in-the-blank card by its whole sentence: the gap is Review's alone.
    const named = prompt.includes(BLANK) ? answer : prompt
    await call("item:save", id, { prompt, title: named })
    const count = cardsHere + 1
    setCardsHere(count)
    // One sound, and Undo takes the card back, as every other card notice does (note-questions.tsx): a cue played
    // beside `said` made two, with no Undo. Made in a walk through the marked passages, it is said once at the walk's end.
    const undo = (): void => void haligtree.unlift("nugget", id).then((gone) => gone && setCardsHere((now) => Math.max(0, now - 1)))
    if (quiet) chime("saved")
    else said(count > 15 ? `Card made: ${num(count)} from this source. Most people keep 10 to 15 from an hour; the best ones are enough` : `Card made: ${num(count)} from this source`, true, { type: "nugget", id, title: named }, { cue: "saved", undo })
    return id
  }
  /** A line kept as a gem with the book and page under it, linked back, as a snip is kept (keepSnip). */
  const gemOfLine = async (line: string, page: number): Promise<string> => {
    const { author, where } = await whereFrom(page)
    return call<string>("nugget:from", `${line}\n\n[${where}](${pdfLink(src, name, page, "")})`, { attribution: author || null, medium: title, passage: `p. ${label(page)}`, kind: "quote" })
  }
  // Five cards from the chapter you are in, by Apple Intelligence, each kept or dropped by you (chapter-cards.tsx).
  const ai = useStudyAi(useLive(haligtree.settings, null as Settings | null))
  const [chaptering, setChaptering] = useState(false)
  // One side panel at a time: it opens where Details does, in its place while it is open; Details' button brings Details back.
  const chapterCards = (): void => (chime(chaptering ? "fold" : "slide"), setChaptering(!chaptering))
  // Snip: a rectangle dragged over a page (a figure, a typeset equation, a
  // table) cut out as a picture, then made a card's answer or kept as a gem.
  const [snipping, setSnipping] = useState(false)
  const [snip, setSnip] = useState<{ x: number; y: number; w: number; h: number; from?: { x: number; y: number } } | null>(null)
  // Its picture is saved as the bar shows: `src` settles once the PNG is written, and Card, Keep and Copy wait for it.
  const [snipped, setSnipped] = useState<{ src: Promise<string | null>; page: number; x: number; y: number; bottom: number } | null>(null)
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
    if (!sheet || !canvas) return said("Drag over a figure or an equation on a page")
    const drawn = canvas.getBoundingClientRect()
    const scale = canvas.width / drawn.width
    const out = document.createElement("canvas")
    out.width = Math.max(1, Math.round(box.w * scale))
    out.height = Math.max(1, Math.round(box.h * scale))
    out.getContext("2d")!.drawImage(canvas, (left - drawn.left) * scale, (top - drawn.top) * scale, out.width, out.height, 0, 0, out.width, out.height)
    const page = Number(sheet.dataset.page)
    // The bar comes at once; encoding the PNG and writing it to the book (hundreds of ms on a large figure) go on after.
    const saved = new Promise<Blob | null>((done) => out.toBlob(done, "image/png"))
      .then((blob) => (blob ? saveAttachment(new File([blob], `${title} p${page} snip.png`, { type: "image/png" })).then((one) => one.src) : null))
    setSnipping(false)
    setSnipped({ src: saved, page, x: box.x + box.w / 2 - 105, y: box.y, bottom: box.y + box.h })
    chime("saved")
  }
  /** The snip's picture, once saved; a snip that could not be saved says so and goes. */
  const snipSrc = async (one: { src: Promise<string | null> }): Promise<string | null> => {
    const saved = await one.src.catch(() => null)
    if (!saved) (setSnipped(null), said("Could not save the snip", false))
    return saved
  }
  /** A card of the snip: its question asked where the snip was. */
  const cardSnip = async (one: NonNullable<typeof snipped>, gem: boolean): Promise<void> => {
    setSnipped(null)
    const saved = await snipSrc(one)
    if (saved) setCarding({ page: one.page, quote: `![](${saved})`, x: one.x, y: one.y, gem })
  }
  /** The snipped picture to the clipboard, as "Copy image" does in the web reader (web-reader.tsx). */
  const copySnip = async (one: NonNullable<typeof snipped>): Promise<void> => {
    const saved = await snipSrc(one)
    if (!saved) return
    if (!(await window.api.copyImage(saved))) return said("Could not copy the snip", false)
    chime("copy")
    said("Copied the snip")
  }
  /** The snip kept as a gem: the picture, the book and page under it, linked back. */
  const keepSnip = async (one: { src: Promise<string | null>; page: number }): Promise<void> => {
    const saved = await snipSrc(one)
    if (!saved) return
    const { author, where } = await whereFrom(one.page)
    const gem = await call<string>("nugget:from", `![](${saved})\n\n[${where}](${pdfLink(src, name, one.page, "")})`, { attribution: author || null, medium: title, passage: `p. ${label(one.page)}`, kind: "quote" })
    // Named for what it is, a figure from this page: its first line is the picture, which no list can show as a name.
    await call("item:save", gem, { title: `Figure from ${where}` })
    setSnipped(null)
    said("Kept as a gem", true, { type: "nugget", id: gem, title: `Figure from ${where}` }, { cue: "saved" })
  }
  // Esc leaves snipping, and drops a snip not yet used.
  useEffect(() => {
    if (!snipping && !snipped) return
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === "Escape" && keysHere(pane)) (setSnipping(false), setSnip(null), setSnipped(null))
    }
    // ⌘C (the Edit menu's Copy) with a snip shown and no words picked: the snip's picture.
    const onCopy = (event: ClipboardEvent): void => {
      if (!snipped || !keysHere(pane) || !document.getSelection()?.isCollapsed) return
      event.preventDefault()
      void copySnip(snipped)
    }
    window.addEventListener("keydown", onKey)
    document.addEventListener("copy", onCopy)
    return () => (window.removeEventListener("keydown", onKey), document.removeEventListener("copy", onCopy))
  })
  // C: the question asked where the words were; Return makes the card.
  const [carding, setCarding] = useState<{ page: number; quote: string; x: number; y: number; bottom?: number; markId?: string; gem?: boolean } | null>(null)
  // The snip's bar keys, as its tips say: C a card of it (⌥C kept as a gem too), K keeps it as a gem.
  useToolKeys(snipped && !carding ? (event) => {
    if (!keysHere(pane) || event.metaKey || event.ctrlKey || event.shiftKey) return false
    if (event.target instanceof HTMLElement && event.target.closest("input, textarea, [contenteditable=true]")) return false
    if (event.code === "KeyC") return (void cardSnip(snipped, event.altKey), chime("open"), true)
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
  const pickedAbout = (at: { page: number; start: number; end: number; quote: string }): Picked => ({ words: at.quote, sentence: sentenceOf(at), where: `${title}, p. ${label(at.page)}`, by: author })
  const actions: ReadActions = {
    highlight: (color) => (rememberColor(color), void mark(color, false)),
    keep: () => void mark(lastColor(), true),
    copy: () => picked && void copyCited(picked.quote, picked.page),
    lookUp: () => {
      if (!picked) return
      // The sentence round the words, kept with what is saved so it says why at a glance.
      setLooking({ words: picked.quote, x: picked.x, y: picked.y + 24, from: { where: `${title}, p. ${label(picked.page)}`, source: title, page: picked.page, link: pdfLink(src, name, picked.page, ""), sentence: sentenceOf(picked) } })
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
    // Writing help's card and quote, from the page the words were picked on.
    written: picked ? ((page) => ({ where: `${title}, p. ${label(page)}`, card: (question, answer) => cardOf(question, answer, page, true), gem: (line) => gemOfLine(line, page) }))(picked.page) : undefined,
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
    said("Highlights joined into one", true, undefined, { cue: "saved" })
  }
  const keepMark = async (one: PdfMark): Promise<void> => {
    const gemId = await gemOf(one)
    await change(one, { gemId })
    // "Why keep this?" over the highlight itself.
    const band = scroller.current?.querySelector<HTMLElement>(`.pdf-mark[data-mark="${one.id}"]`)?.getBoundingClientRect()
    const frame = scroller.current?.getBoundingClientRect()
    if (band && frame && scroller.current) setWhyFor({ id: gemId, x: band.left + band.width / 2 - frame.left, y: band.top - frame.top + scroller.current.scrollTop, bottom: band.bottom - frame.top + scroller.current.scrollTop })
    said("Kept as a gem", true, { type: "nugget", id: gemId, title: one.quote }, { cue: "saved" })
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
      said(end - start > one.end - one.start ? "Highlight extended" : "Highlight cut to the words picked", true, undefined, { cue: "saved" })
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
    said(mark.color === "later" ? "Card mark removed" : "Highlight removed", true, undefined, { cue: "away" })
  }

  // The page this reader last handed up to the pane, and whether the opening has gone to its place yet.
  const main = useRef<HTMLDivElement>(null)
  const [menuPage, setMenuPage] = useState(1)
  const told = useRef(start)
  const placed = useRef(false)
  /** Opened at the ribbon: the page kept as you read stays as it was until a hand moves the pages. */
  const holdPlace = useRef(false)
  const go = (to: number): void => {
    if (!doc) return
    const n = Math.min(Math.max(1, Math.round(to)), doc.numPages)
    showPage(scroller.current, n)
    setPage(n)
    // A jump is not reading: no taps until a hand scrolls again.
    byHandScroll.current = false
    // Kept as the pane's page, so Back from anywhere comes back to it.
    if (n !== start) onPage?.(n)
    told.current = n
  }
  // Opened at a page (a gem's link back, or Back to it): the sheets land there as they are laid out. Back and Forward
  // bring a page back too. A page this reader handed up itself is where it already is: going there again would undo
  // the reading done since the hand-up, so only a page from elsewhere is gone to.
  useEffect(() => {
    if (!doc) return
    if (start) {
      // Opened at its ribbon's page (Continue reading, the library): the page read on to beyond it is offered as from a
      // plain open, and kept until you read on by hand. Held until the ribbon is read, so the landing never overwrites it.
      holdPlace.current = true
      if (start !== told.current) go(start)
      placed.current = true
      const total = doc.numPages
      void Promise.all([call<{ page: number } | null>("pdf:place", src), readRibbon(src)]).then(([place, laid]) => {
        if (laid?.page === start) return void (place && place.page > start && setReadOn(place.page))
        // Not the ribbon's page: the page opened at is kept, as before.
        if (holdPlace.current) (holdPlace.current = false), void call("pdf:read", src, start, total)
      })
      return
    }
    // Opened with no page of its own: at the ribbon, when one is laid; else where you last left it. The page kept as you
    // read, further on than the ribbon, is offered in one line, and kept as it was until you read on by hand.
    void Promise.all([call<{ page: number } | null>("pdf:place", src), readRibbon(src)]).then(([place, laid]) => {
      if (laid?.page) {
        holdPlace.current = true
        go(laid.page)
        if (place && place.page > laid.page) setReadOn(place.page)
      } else if (place && place.page > 1) go(place.page)
      placed.current = true
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc, start])
  // Opened: into Recent, in the sidebar and ⌘K, as a note is when it opens.
  useEffect(() => {
    touch("pdf", pdfFocus(src, name))
    void call("home:opened", "pdf", pdfFocus(src, name))
  }, [src, name])
  // The page you are on, kept as you read: the next time it opens there. Opened at the ribbon, the page you had read on
  // to is kept until you read on by hand, so the line offering it is still true next time.
  useEffect(() => {
    // Not before the opening has gone to its place: the first page drawn is no reading, and kept it would overwrite it.
    if (!doc || !placed.current || (holdPlace.current && !byHandScroll.current)) return
    holdPlace.current = false
    void call("pdf:read", src, page, doc.numPages)
  }, [doc, src, page])

  // The ribbon (ribbon.tsx): laid by hand, it wins over the page kept as you read.
  const [ribbon, setRibbon] = useState<RibbonPlace | null>(null)
  const [ribbonRead, setRibbonRead] = useState(false)
  useEffect(() => {
    setRibbonRead(false)
    void readRibbon(src).then((laid) => (setRibbon(laid), setRibbonRead(true)))
  }, [src])
  /** Laid on a page, moved, or taken out (null): kept at once, with ⌘Z and a notice to take it back where it moved. */
  const layRibbon = (to: number | null): void => {
    const was = ribbon
    if ((was?.page ?? null) === to) return
    // Laid on another page, it keeps where along the top it was slid to.
    const next = to ? { page: to, block: null, words: null, across: was?.across ?? null, hue: was?.hue ?? null } : null
    setRibbon(next)
    setReadOn(null)
    const saved = keepRibbon(src, next)
    const back = (): void => void saved.then(() => keepRibbon(src, was)).then(() => (setRibbon(was), chime("undo")))
    if (!next) return void (chime("away"), toast("Ribbon taken out", back))
    pageTurn(true)
    if (was) toast(`Ribbon moved to p. ${label(next.page)}`, back)
    else quietly(back)
  }
  /** Carried by hand onto a page (or along its own top edge), or the hanging tab carried onto one: kept there, as a
   *  share of the page's width, with ⌘Z to take it back; onto another page, said, as laying it there is. */
  const slideRibbon = (across: number, key: string): void => {
    const was = ribbon
    const page = Number(key)
    if (!page) return
    const next = was ? { ...was, page, across } : { page, block: null, words: null, across, hue: null }
    setRibbon(next)
    if (!was) setReadOn(null)
    const saved = keepRibbon(src, next)
    const back = (): void => void saved.then(() => keepRibbon(src, was)).then(() => (setRibbon(was), chime("undo")))
    pageTurn(true)
    if (was && next.page !== was.page) toast(`Ribbon moved to p. ${label(next.page)}`, back)
    else quietly(back)
  }
  /** Its colour, one of a book's (the same nine less the theme's own: its own deep red is the first). Pointed at in the
   *  menu, it shows in place; picked, it is kept. */
  const [ribbonPeek, setRibbonPeek] = useState<Hue | null | undefined>(undefined)
  const colourRibbon = (hue: Hue | null): void => {
    const was = ribbon
    setRibbonPeek(undefined)
    if (!was || (was.hue ?? null) === hue) return
    const next = { ...was, hue }
    setRibbon(next)
    chime("tap")
    const saved = keepRibbon(src, next)
    quietly(() => void saved.then(() => keepRibbon(src, was)).then(() => (setRibbon(was), chime("undo"))))
  }
  /** Back to the ribbon: the pages glide to its page, its top edge and the ribbon a little below the top. */
  const [ribbonBounce, setRibbonBounce] = useState(0)
  const goRibbon = (): void => {
    if (!ribbon) return
    // Arrived, it bounces a little (ribbon.tsx, once the pages come to rest), so the eye finds it.
    setRibbonBounce((n) => n + 1)
    const box = scroller.current
    const sheet = box?.querySelector<HTMLElement>(`.pdf-page[data-page="${ribbon.page}"]`)
    if (!box || !sheet || motionNow() !== "all") return go(ribbon.page)
    byHandScroll.current = false
    box.scrollBy({ top: sheet.getBoundingClientRect().top - box.getBoundingClientRect().top - 24, behavior: "smooth" })
  }
  /** A sheet's place in the pages' own box (unscaled, so a pinch's stretch does not count): where a laid ribbon is drawn. */
  const sheetEdge = (one: HTMLElement): { key: string; left: number; right: number; top: number } => ({ key: one.dataset.page!, left: one.offsetLeft, right: one.offsetLeft + one.offsetWidth, top: one.offsetTop })
  const ribbonHere = (at = page): void => (ribbon?.page === at ? said(`The ribbon already lies on p. ${label(at)}`, true, undefined, { cue: "tap" }) : layRibbon(at))
  const [readOn, setReadOn] = useState<number | null>(null)

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
      pages.animate([{ transform: `scale(${one.from})` }, { transform: "scale(1)" }], { duration: 320, easing: "cubic-bezier(0.22, 1, 0.36, 1)" })
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
    // A double-click on words, or near them, picks a word, as everywhere (reader-select.ts).
    if (!sheet || snipping || !pressAway()) return
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
  // ← → turn a page, as in Preview and Books; Space and Page Down a whole page on, ⇧Space and Page Up back, while the
  // page fits the width (zoomed in, they scroll a screen, as the browser does). g g and G go to the book's first page
  // and its last, as they go to a list's first and last row and a note's first and last line (asked for 12 Nov: "gg and
  // G should navigate here too"). Never while typing or with a floating bar up.
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      // Asked before anything turns the key away, so the first g of a pair is heard (ui.tsx listEnd).
      const end = listEnd(event)
      if (event.metaKey || event.ctrlKey || event.altKey || event.defaultPrevented || !keysHere(pane)) return
      if (event.target instanceof HTMLElement && event.target.closest("input, textarea, select, [contenteditable=true], [role=menu], [role=dialog]")) return
      if (picked || carding || looking || whyFor || snipping) return
      if (end) {
        event.preventDefault()
        const last = doc?.numPages ?? 1
        if ((end === "first" ? 1 : last) === page) return chime("nope")
        return go(end === "first" ? 1 : last)
      }
      const by = layout === "spread" ? 2 : 1
      const whole = zoom <= 1
      const way = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1
        : whole && (event.key === "PageDown" || (event.key === " " && !event.shiftKey)) ? 1
        : whole && (event.key === "PageUp" || (event.key === " " && event.shiftKey)) ? -1 : 0
      if (!way) return
      event.preventDefault()
      const to = Math.min(Math.max(1, page + way * by), doc?.numPages ?? 1)
      if (to === page) return chime("nope")
      go(to)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  })

  // The page on show: the last sheet whose top has passed a third of the way down, or 120px when that is less: in a
  // narrow pane short pages fit three to a view, and the page at the top, not the one under it, is the one being read.
  const pageInView = (): number | null => {
    const box = scroller.current
    if (!box) return null
    const line = box.getBoundingClientRect().top + Math.min(box.clientHeight / 3, 120)
    // The first sheet below the line, found by halves (a few reads, not one per page): the page before it is on show.
    const pages = box.querySelector(".pdf-pages")
    if (!pages?.querySelector(".pdf-page")) return null
    const below = sheetAt(pages, (r) => r.top > line)
    return Math.max(1, below ? Number(below.dataset.page) - 1 : doc?.numPages ?? 1)
  }
  const onScroll = (): void => {
    const at = pageInView()
    if (at !== null && at !== page) setPage(at)
  }
  // The pane keeps the page you are on (Back from anywhere comes back to it) once the pages come to rest, never on
  // every page passed: each keep draws the whole window again and saves it, which made a scroll drop a frame in five.
  // The page is read from the pages as they rest, never from the reader's last drawing: a jump's scroll ends before
  // the reader is drawn again, and the page it was drawn at before the jump was kept (⌘K opened at page 1).
  const resting = useRef({ pageInView, onPage })
  resting.current = { pageInView, onPage }
  useEffect(() => {
    const box = scroller.current
    if (!box) return
    const rest = (): void => {
      const now = resting.current.pageInView()
      if (!placed.current || now === null || now === told.current) return
      told.current = now
      resting.current.onPage?.(now)
    }
    box.addEventListener("scrollend", rest)
    return () => box.removeEventListener("scrollend", rest)
  }, [])

  // The chapter you are in: the outline's latest entry that starts on or
  // before this page, so every page of a chapter lights it, not only its first.
  const hereAt = chapterAt(outline, page)
  const chapter = hereAt >= 0 ? outline[hereAt].title : ""

  // How the pages lie and how they look: one set of rows, in the bar's View menu and under "View" in its "…" menu.
  const viewItems = (
    <>
      <DropdownMenuLabel>Layout</DropdownMenuLabel>
      <DropdownMenuRadioGroup value={layout} onValueChange={(to) => (chime("tap"), setLayout(to as PageLayout))}>
        {LAYOUTS.map((one) => (
          <DropdownMenuRadioItem key={one.id} value={one.id} data-layout-choice={one.id}>
            {one.label}
          </DropdownMenuRadioItem>
        ))}
      </DropdownMenuRadioGroup>
      <DropdownMenuSeparator />
      <DropdownMenuLabel>Page colour</DropdownMenuLabel>
      <DropdownMenuRadioGroup value={look} onValueChange={(to) => (chime("tap"), setLook(to as PageLook))}>
        {LOOKS.map((one) => (
          <DropdownMenuRadioItem key={one.id} value={one.id} data-look-choice={one.id} data-dark-pages={one.id === "dark" ? "" : undefined}>
            {one.label}
          </DropdownMenuRadioItem>
        ))}
      </DropdownMenuRadioGroup>
      <DropdownMenuSeparator />
      {/* The rail's other pages in grey, the one you are on in colour: a switch, kept for every book (paper.ts). */}
      <DropdownMenuLabel>Thumbnails</DropdownMenuLabel>
      <DropdownMenuCheckboxItem checked={oneInColour} data-one-in-colour-choice onSelect={(event) => event.preventDefault()} onCheckedChange={(on) => (chime("tap"), setOneInColour(on))}>
        Only this page in colour
      </DropdownMenuCheckboxItem>
      <DropdownMenuSeparator />
      <DropdownMenuLabel>Ribbon</DropdownMenuLabel>
      <DropdownMenuItem data-ribbon-lay disabled={!doc} onSelect={() => ribbonHere()}>Lay the ribbon here<DropdownMenuShortcut>⌘D</DropdownMenuShortcut></DropdownMenuItem>
      {ribbon && <DropdownMenuItem data-ribbon-go onSelect={goRibbon}>Go to the ribbon, p. {label(ribbon.page)}<DropdownMenuShortcut>⇧⌘D</DropdownMenuShortcut></DropdownMenuItem>}
      {ribbon && <DropdownMenuItem data-ribbon-out onSelect={() => layRibbon(null)}>Take the ribbon out</DropdownMenuItem>}
    </>
  )
  const zoomWords = zoom === 1 ? "Fit" : `${Math.round(zoom * 100)}%`
  // The bar's tools as a menu's rows (icon, words, keys), grouped as the bar is, for a pane too narrow for the bar:
  // the note's "…" menu is the reference (note-extras.tsx). Zoom is one row, − its size + inline, as the bar has it.
  const moreMenu = (
    <>
      <DropdownMenuItem data-tool="Sidebar" onSelect={toggleRail}><PanelLeft />Pages and outline{railShown && <MenuCheck />}</DropdownMenuItem>
      <DropdownMenuItem data-tool="Details" disabled={!detailsFit} onSelect={() => (chaptering && detailsOut ? (chime("slide"), setChaptering(false)) : (setChaptering(false), showDetails(!detailsOut, pane)))}>
        <PanelRight />Details{detailsOut && detailsFit && !chaptering && <MenuCheck />}
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      {marks.some((one) => one.color === "later") && (
        <DropdownMenuItem data-tool="Make your marked cards" onSelect={() => (setWalking(1), walkTo(marks.find((one) => one.color === "later"), 0))}>
          <SquareStack />Make your marked cards<DropdownMenuShortcut>{marks.filter((one) => one.color === "later").length}</DropdownMenuShortcut>
        </DropdownMenuItem>
      )}
      {ai && <DropdownMenuItem data-tool="Five cards from this chapter" data-mac-needs="ai" onSelect={chapterCards}><Sparkles />{outline.length ? "Five cards from this chapter" : "Five cards from these pages"}{chaptering && <MenuCheck />}</DropdownMenuItem>}
      <DropdownMenuItem data-tool="Keep a figure" onSelect={() => (setSnipping(!snipping), setSnip(null), setSnipped(null))}><Scissors />Keep a figure{snipping && <MenuCheck />}</DropdownMenuItem>
      <DropdownMenuItem data-tool="Find" onSelect={() => (finding ? closeFind() : (setFinding(true), requestAnimationFrame(() => findField.current?.focus())))}><Search />Find<DropdownMenuShortcut>⌘F</DropdownMenuShortcut></DropdownMenuItem>
      <DropdownMenuSeparator />
      {/* Not a line that closes the menu: each press steps the size, the menu staying open to step again. */}
      <div data-more-row role="group" aria-label="Zoom" className="flex min-h-7 items-center gap-2 px-2 py-1 text-control">
        <ZoomIn aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="flex-1">Zoom</span>
        <button type="button" aria-label="Smaller" title="Smaller  ⌘−" className="flex size-5 cursor-pointer items-center justify-center rounded-sm text-muted-foreground hover:bg-accent hover:text-foreground" onClick={() => step(-1)}><Minus className="size-3.5" /></button>
        <button type="button" aria-label="Fit width" title="Fit width  ⌘0" className="min-w-11 cursor-pointer rounded-sm px-1 text-center tabular-nums hover:bg-accent" onClick={() => zoomTo(1)}><Roll text={zoomWords} /></button>
        <button type="button" aria-label="Larger" title="Larger  ⌘+" className="flex size-5 cursor-pointer items-center justify-center rounded-sm text-muted-foreground hover:bg-accent hover:text-foreground" onClick={() => step(1)}><Plus className="size-3.5" /></button>
      </div>
      <DropdownMenuSub>
        <DropdownMenuSubTrigger data-tool="View"><BookOpen />View</DropdownMenuSubTrigger>
        <DropdownMenuSubContent className="w-56" data-page-layout-menu>{viewItems}</DropdownMenuSubContent>
      </DropdownMenuSub>
    </>
  )

  return (
    <div className={`pdf-reader${paper && !dark ? " is-paper" : ""}${dark ? " is-dark" : ""}`} data-zoom={zoom} data-layout={layout}>
      <div className="pdf-reader-bar">
        <span className="pdf-reader-heading" title={chapter ? `${title}: ${chapter}` : title}>
          <span className="pdf-reader-title">{title}</span>
          {chapter && <span data-pdf-chapter className="pdf-reader-chapter">{chapter}</span>}
        </span>
        <span className="pdf-reader-page">
          {/* The page as the book prints it; where the file counts differently, its own page and count beside, quietly. */}
          <ScrubField value={page} max={doc?.numPages ?? 1} onChange={go} marks={chapters} show={label} read={labels ? findLabel : undefined} />
          {labels ? (
            <span className="pdf-reader-of" data-pdf-file-page title={`Page ${num(page)} of ${num(doc?.numPages ?? 0)} in the file`}> {num(page)} of {num(doc?.numPages ?? 0)}</span>
          ) : (
            <span className="pdf-reader-of"> / {doc?.numPages ?? "…"}</span>
          )}
        </span>
        {/* The title wins the room: in a narrow pane the tools wait behind "More", in the same order. */}
        <FitActions room={doc?.numPages} menu={moreMenu}>
          <Button data-style="ghost" aria-label="Sidebar" title="Pages and outline" data-active-state={railShown ? "on" : "off"} onClick={toggleRail}>
            <PanelLeft className="tiptap-button-icon" />
          </Button>
          <Button data-style="ghost" aria-label="Details" disabled={!detailsFit} title={!detailsFit ? "Details: widen the window to show them beside the pages" : detailsOut ? "Hide details" : "Details"} data-active-state={detailsOut && detailsFit && !chaptering ? "on" : "off"} onClick={() => (chaptering && detailsOut ? (chime("slide"), setChaptering(false)) : (setChaptering(false), showDetails(!detailsOut, pane)))}>
            <PanelRight className="tiptap-button-icon" />
          </Button>
          {marks.some((one) => one.color === "later") && (
            <Button data-style="ghost" aria-label="Make your marked cards" title="Make your marked cards: a card from each passage you marked, one after another" data-active-state={walking ? "on" : "off"} onClick={() => (setWalking(1), walkTo(marks.find((one) => one.color === "later"), 0))}>
              <SquareStack className="tiptap-button-icon" />
              <span className="tiptap-button-text" data-card-later-count>{marks.filter((one) => one.color === "later").length}</span>
            </Button>
          )}
          {ai && (
            <Button data-style="ghost" aria-label="Five cards from this chapter" title={outline.length ? "Five cards from this chapter, to keep or drop: by Apple Intelligence, on this Mac" : "Five cards from the pages on screen, to keep or drop: by Apple Intelligence, on this Mac"} data-chapter-cards-ask data-mac-needs="ai" data-active-state={chaptering ? "on" : "off"} onClick={chapterCards}>
              <Sparkles className="tiptap-button-icon" />
            </Button>
          )}
          <Button data-style="ghost" aria-label="Keep a figure" title="Keep a figure or an equation as a picture: drag over it" data-active-state={snipping ? "on" : "off"} onClick={() => (setSnipping(!snipping), setSnip(null), setSnipped(null))}>
            <Scissors className="tiptap-button-icon" />
          </Button>
          <Button data-style="ghost" aria-label="Find" title={finding ? undefined : "Find  ⌘F"} data-active-state={finding ? "on" : "off"} onClick={() => (finding ? closeFind() : (setFinding(true), requestAnimationFrame(() => findField.current?.focus())))}>
            <Search className="tiptap-button-icon" />
          </Button>
          <Button data-style="ghost" aria-label="Smaller" title="Smaller  ⌘−" onClick={() => step(-1)}>
            <Minus className="tiptap-button-icon" />
          </Button>
          <Button data-style="ghost" aria-label="Fit width" title="Fit width  ⌘0" onClick={() => zoomTo(1)}>
            <span className="tiptap-button-text"><Roll text={zoomWords} /></span>
          </Button>
          <Button data-style="ghost" aria-label="Larger" title="Larger  ⌘+" onClick={() => step(1)}>
            <Plus className="tiptap-button-icon" />
          </Button>
          {/* How the pages lie and how they look, as Preview's View menu has it: kept per book, and "Dark pages" for every book. */}
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <Button data-style="ghost" aria-label="View" title="View: how the pages lie, and their colour">
                <BookOpen className="tiptap-button-icon" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56" data-page-layout-menu>
              {viewItems}
            </DropdownMenuContent>
          </DropdownMenu>
        </FitActions>
      </div>
      <ScanLine src={src} doc={doc} onRead={readAgain} />
      <div ref={chip} className="pdf-zoom-chip" aria-hidden />
      <PageLabel.Provider value={label}>
      <div ref={body} className="pdf-reader-body" data-rail-squeeze={squeeze}>
      {railShown && doc && (
        <PdfSide doc={doc} page={page} outline={outline} tab={railShown} onTab={(tab) => (setTabByHand(true), showRail(tab))} onGo={go} narrow={squeeze === "narrow"} onDrag={() => setByHand(true)} layout={layout} />
      )}
      {/* The pages' own column: find floats over its top right, over the pages and never over Details. */}
      <div ref={main} className="pdf-reader-main">
      {doc && (
        <Ribbon
          frame={main}
          scroller={scroller}
          at={ribbon ? String(ribbon.page) : null}
          ready={ribbonRead}
          across={ribbon?.across ?? null}
          hue={ribbonPeek !== undefined ? ribbonPeek : (ribbon?.hue ?? null)}
          host={() => scroller.current?.querySelector<HTMLElement>(".pdf-pages") ?? null}
          spotAt={(x, y) => {
            // The page under a point of the pages' own box, by x and y alike (in two pages, the left or the right one);
            // between pages, the nearest. Both pages of a row share one top, so y alone picks the wrong one.
            let best: HTMLElement | null = null
            let far = Infinity
            for (const one of scroller.current?.querySelectorAll<HTMLElement>(".pdf-pages .pdf-page[data-page]") ?? []) {
              const dx = Math.max(one.offsetLeft - x, x - one.offsetLeft - one.offsetWidth, 0)
              const dy = Math.max(one.offsetTop - y, y - one.offsetTop - one.offsetHeight, 0)
              const d = dx * dx + dy * dy
              if (d < far) (best = one), (far = d)
              if (!d) break
            }
            return best ? sheetEdge(best) : null
          }}
          nameOf={(key) => `p. ${label(Number(key))}`}
          desk={() => {
            // The row you are reading: its page and the one beside it in two pages, on screen.
            const sheet = scroller.current?.querySelector<HTMLElement>(`.pdf-page[data-page="${page}"]`)
            if (!sheet) return null
            const row = [sheet.previousElementSibling, sheet, sheet.nextElementSibling].filter((one): one is HTMLElement => one instanceof HTMLElement && !!one.dataset.page && one.offsetTop === sheet.offsetTop).map((one) => one.getBoundingClientRect())
            return { left: Math.min(...row.map((one) => one.left)), right: Math.max(...row.map((one) => one.right)) }
          }}
          bounce={ribbonBounce}
          away={ribbon ? { label: `p. ${label(ribbon.page)}`, go: goRibbon } : undefined}
          edgeOf={(key) => {
            // Its own page's top edge, found by its number (the left or the right page of a spread alike).
            const sheet = scroller.current?.querySelector<HTMLElement>(`.pdf-page[data-page="${key}"]`)
            return sheet ? sheetEdge(sheet) : null
          }}
          menu={ribbon && <RibbonMenuRows hue={ribbon.hue ?? null} onPeek={setRibbonPeek} onPick={colourRibbon} onOut={() => layRibbon(null)} />}
          onMenuOpen={(open) => void (!open && setRibbonPeek(undefined))}
          onSlide={slideRibbon}
          homeX={() => {
            const frame = main.current?.getBoundingClientRect()
            const r = scroller.current?.querySelector<HTMLElement>(`.pdf-page[data-page="${page}"]`)?.getBoundingClientRect()
            return frame ? Math.min(r?.right ?? frame.right, frame.right - 16) : null
          }}
          onLayHere={() => ribbonHere()}
        />
      )}
      <ReadOnLine
        words={readOn ? `You read on to p. ${label(readOn)}, past your ribbon` : null}
        onGo={() => void (readOn && ((holdPlace.current = false), go(readOn), setReadOn(null)))}
        onClose={() => setReadOn(null)}
      />
      {finding && (
        <div className="tiptap-find-bar pdf-find-bar" data-seeking={seeking ? "" : undefined} aria-busy={seeking}>
          <div className="tiptap-find-bar-row">
            <input
              ref={findField}
              type="text"
              placeholder="Find"
              aria-label="Find in PDF"
              autoFocus
              onChange={(event) => find(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault()
                  stepFind(event.shiftKey)
                } else if (event.key === "Escape") closeFind()
              }}
            />
            <span role="img" className="tiptap-find-bar-count" aria-label={`${num(found.length ? at + 1 : 0)} of ${num(found.length)}`}>
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
      <ContextMenu onOpenChange={(open) => !open && setRibbonPeek(undefined)}>
        <ContextMenuTrigger asChild>
          <div
            ref={scroller}
            className="pdf-reader-scroll"
            onScroll={onScroll}
            onWheel={(event) => void (byHandScroll.current = !event.ctrlKey && !event.metaKey)}
            onPointerDown={() => void (byHandScroll.current = true)}
            onKeyDown={() => void (byHandScroll.current = true)}
            onDoubleClick={toggleZoom}
            // A mark has its menu, picked words theirs; elsewhere on a page, its ribbon rows. The chapter's cards live on the sparkles button alone.
            onContextMenu={(event) => {
              const band = [...(scroller.current?.querySelectorAll<HTMLElement>(".pdf-mark") ?? [])].find((one) => {
                const r = one.getBoundingClientRect()
                return event.clientX >= r.left && event.clientX <= r.right && event.clientY >= r.top && event.clientY <= r.bottom
              })
              const mark = band ? marks.find((one) => one.id === band.dataset.mark) ?? null : null
              setHit(mark)
              // The page right-clicked: where "Lay the ribbon here" lays it.
              setMenuPage(Number((event.target as Element).closest?.<HTMLElement>(".pdf-page")?.dataset.page) || page)
              if (!mark && !picked && !doc) event.preventDefault()
            }}
          >
            <PdfPages
              key={opened}
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
            {/* The snip's bar under it, never over it or the lines just above: what was cut stays in sight while you choose. */}
            {snipped && !carding && (
              <div className="pdf-keep-bar" style={{ left: snipped.x, top: snipped.bottom + 8 }} onMouseDown={(event) => event.preventDefault()}>
                <Toolbar variant="floating">
                  <ToolbarGroup>
                    <Button data-style="ghost" aria-label="Card" title={"Make a card of this snip  C\nIn Review only; ⌥C keeps it as a gem too"} onClick={(event) => void cardSnip(snipped, event.altKey)}>
                      <SquareStack className="tiptap-button-icon" />
                      <span className="tiptap-button-text">Card</span>
                    </Button>
                    <Button data-style="ghost" aria-label="Keep" title="Keep the snip as a gem  K" onClick={() => void keepSnip(snipped)}>
                      <Gem className="tiptap-button-icon" />
                      <span className="tiptap-button-text">Keep</span>
                    </Button>
                    <Button data-style="ghost" aria-label="Copy" title="Copy the snip as a picture  ⌘C" onClick={() => void copySnip(snipped)}>
                      <Copy className="tiptap-button-icon" />
                      <span className="tiptap-button-text">Copy</span>
                    </Button>
                  </ToolbarGroup>
                </Toolbar>
              </div>
            )}
            {carding && (
              <WhyAfter
                at={carding}
                ask={{ kept: carding.quote.startsWith("![](") ? "Answer: the figure" : `Answer: ${carding.quote.length > 28 ? `${carding.quote.slice(0, 27)}…` : carding.quote}`, label: "The card's question", placeholder: carding.quote.startsWith("![](") ? "The question this figure answers" : "The question these words answer", about: carding.quote.startsWith("![](") ? undefined : carding.quote }}
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
              about={picked ? undefined : () => ({ words: hit.quote, sentence: hit.quote, where: `${title}, p. ${label(hit.page)}`, by: author })}
              {...reshape(hit)}
            />
          ) : null}
          {/* Words picked over a highlight: its own rows first, then what can be done with the words picked. */}
          {hit && picked && <ContextMenuSeparator />}
          {picked && <PickedMenu actions={actions} about={() => pickedAbout(picked)} />}
          {!hit && !picked && doc && (
            <>
              <ContextMenuItem data-ribbon-lay-menu onSelect={() => ribbonHere(menuPage)}>Lay the ribbon here<ContextMenuShortcut>⌘D</ContextMenuShortcut></ContextMenuItem>
              {ribbon && <ContextMenuItem data-ribbon-go-menu onSelect={goRibbon}>Go to the ribbon, p. {label(ribbon.page)}<ContextMenuShortcut>⇧⌘D</ContextMenuShortcut></ContextMenuItem>}
              {ribbon && <ContextMenuItem data-ribbon-out-menu onSelect={() => layRibbon(null)}>Take the ribbon out</ContextMenuItem>}
              {ribbon && (
                <>
                  <ContextMenuLabel>Ribbon colour</ContextMenuLabel>
                  {/* Pointed at, a colour shows on the ribbon at once; the menu closed without a pick, it goes back. */}
                  <div role="group" aria-label="Ribbon colour" className="flex items-center gap-1 px-1.5 py-1" data-ribbon-colours onPointerLeave={() => setRibbonPeek(undefined)}>
                    {RIBBON_HUES.map((hue) => (
                      <ContextMenuItem key={hue ?? "own"} aria-label={hue ? hueName(hue) : "Ribbon red"} aria-checked={(ribbon.hue ?? null) === hue} role="menuitemradio" data-ribbon-hue-pick={hue ?? "own"}
                        onPointerEnter={() => setRibbonPeek(hue)} onFocus={() => setRibbonPeek(hue)} onSelect={() => colourRibbon(hue)}
                        className="flex size-6 cursor-pointer items-center justify-center rounded-md p-0 focus:bg-accent">
                        <span data-ribbon-hue={hue ?? undefined} style={ribbonInk(hue)} className="contents"><Swatch color="var(--mf-ribbon)" on={(ribbon.hue ?? null) === hue} /></span>
                      </ContextMenuItem>
                    ))}
                  </div>
                </>
              )}
            </>
          )}
        </ContextMenuContent>
      </ContextMenu>
      </div>
      {chaptering && doc ? <ChapterCards doc={doc} title={title} outline={outline} page={page} marks={marks.filter((one) => !one.id.startsWith("find:"))} onGo={go} onClose={() => setChaptering(false)} onKeep={async (question, answer, at) => void (await cardOf(question, answer, at, true))} /> : detailsOut && detailsFit && <ReadDetails src={src} name={name} onPage={go} chapters={outline} cover={cover} title={title} author={author} pages={doc?.numPages} page={page} ribbon={ribbon ? { page: ribbon.page, hue: ribbon.hue ?? null, go: goRibbon } : null} marks={marks} lit={lit} onMark={goToMark} onGather={() => void gather()} onJoin={(group) => void joinStacked(group)} scan={<ScanDetail src={src} doc={doc} onRead={readAgain} />} />}
      </div>
      </PageLabel.Provider>
    </div>
  )
}

/** A menu row's mark that it is on, at the row's end. */
const MenuCheck = (): React.JSX.Element => <Check aria-hidden className="ml-auto size-3.5" />
