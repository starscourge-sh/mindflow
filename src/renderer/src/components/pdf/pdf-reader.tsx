import { useEffect, useRef, useState } from "react"
import type { PDFDocumentProxy } from "pdfjs-dist"
import { ChevronDown, ChevronUp, Gem, Minus, PanelLeft, PanelRight, Plus, Scissors, ScrollText, Search, SquareStack, X } from "lucide-react"
import { Button } from "@/components/tiptap-ui-primitive/button"
import { Toolbar, ToolbarGroup } from "@/components/tiptap-ui-primitive/toolbar"
import { saveAttachment } from "@/extensions/image-drop"
import { ContextMenu, ContextMenuContent, ContextMenuTrigger } from "@/components/ui/context-menu"
import { Roll } from "@/lib/roll"
import { call } from "@/lib/haligtree"
import { host, said } from "@/lib/host"
import { canSplit, keysHere, usePane } from "@/lib/split"
import { chime } from "@/lib/sound"
import { cue } from "@/lib/cues"
import { MarkMenu, PickedMenu, ReadBar, WhyAfter, cited, lastColor, readKey, rememberColor, type MarkColor, type ReadActions } from "./read-bar"
import { PdfSide, chapterAt, usePdfOutline, type RailTab } from "./pdf-rail"
import { ReadDetails } from "./pdf-details"
import { LookUpCard, type LookedUpIn } from "./look-up"
import { usePdfCover } from "./pdf-cover"
import { showDetails, useDetailsShown } from "@/lib/reading"
import { PdfPages, offsetsIn, pdfAuthor, pdfTitle, type PdfMark } from "./pdf-pages"
import { FitActions } from "@/components/haligtree/ui"
import { usePaperPages } from "./paper"

/** The zoom steps, as Preview's: fit width is 1. */
const ZOOMS = [0.5, 0.67, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3]

/** Where a PDF opens full size: `haligtree:pdf`, read by the main window, which opens it in a pane. */
export const openPdf = (src: string, name: string, page?: number, mark?: string, aside = false): void => {
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
  const [paper, setPaper] = usePaperPages()
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
    const id = crypto.randomUUID()
    const gemId = gem ? await gemOf({ id, page: picked.page, quote: picked.quote }) : null
    await call("pdf:highlight", src, { id, page: picked.page, quote: picked.quote, start: picked.start, end: picked.end, gemId, color })
    setMarks((all) => [...all, { id, page: picked.page, quote: picked.quote, start: picked.start, end: picked.end, gemId, color }])
    if (gemId) setWhyFor({ id: gemId, x: picked.x, y: picked.y, bottom: picked.bottom })
    getSelection()?.removeAllRanges()
    setPicked(null)
    chime("saved")
    said(gem ? "Kept as a gem" : "Highlighted", true, gemId ? { type: "nugget", id: gemId, title: picked.quote } : undefined)
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
    if (!quiet) said(count > 15 ? `Card made: ${count} from this source. Most people keep 10 to 15 from an hour; the best ones are enough` : `Card made: ${count} from this source`, true, { type: "nugget", id, title: prompt })
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
  // The second read: every passage marked "Card later", one after another,
  // each asking for its card's question where it is; Return makes the card and
  // the passage becomes a plain highlight, Esc ends the walk.
  const [walking, setWalking] = useState(0)
  const madeOne = useRef(false)
  const walkTo = (next: PdfMark | undefined, made: number): void => {
    if (!next) {
      setWalking(0)
      setCarding(null)
      return void said(made ? `Second read done: ${made} ${made === 1 ? "card" : "cards"} made` : "Second read ended")
    }
    go(next.page)
    madeOne.current = false
    const box = scroller.current
    setCarding({ page: next.page, quote: next.quote, markId: next.id, x: Math.max(8, (box?.clientWidth ?? 600) / 2 - 160), y: (box?.scrollTop ?? 0) + 72 })
  }
  const actions: ReadActions = {
    highlight: (color) => (rememberColor(color), void mark(color, false)),
    keep: () => void mark(lastColor(), true),
    copy: () => picked && void copyCited(picked.quote, picked.page),
    lookUp: () => {
      if (!picked) return
      // The sentence round the words, kept with what is saved so it says why at a glance.
      setLooking({ words: picked.quote, x: picked.x, y: picked.y + 24, from: { where: `${title}, p. ${picked.page}`, link: pdfLink(src, name, picked.page, ""), sentence: sentenceOf(picked) } })
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
      const sentence = sentenceOf(picked)
      // The words blanked in their sentence; a sentence the words are not in (picked across two) asks them plainly.
      const asked = sentence.includes(picked.quote) && sentence !== picked.quote ? sentence.replace(picked.quote, "_____") : `_____ (${title}, p. ${picked.page})`
      void cardOf(asked, sentence.includes(picked.quote) ? sentence : picked.quote, picked.page, false, gem)
      getSelection()?.removeAllRanges()
      setPicked(null)
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
    if (band && frame && scroller.current) setWhyFor({ id: gemId, x: band.left + band.width / 2 - frame.left, y: band.top - frame.top + scroller.current.scrollTop, bottom: band.bottom - frame.top + scroller.current.scrollTop })
    chime("saved")
    said("Kept as a gem", true, { type: "nugget", id: gemId, title: one.quote })
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
  const hereAt = chapterAt(outline, page)
  const chapter = hereAt >= 0 ? outline[hereAt].title : ""

  return (
    <div className={`pdf-reader${paper ? " is-paper" : ""}`}>
      <div className="pdf-reader-bar">
        <span className="pdf-reader-heading" title={chapter ? `${title}: ${chapter}` : title}>
          <span className="pdf-reader-title">{title}</span>
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
        {/* The title wins the room: in a narrow pane the tools wait behind "More", in the same order. */}
        <FitActions room={doc?.numPages}>
          <Button data-style="ghost" aria-label="Sidebar" title="Pages and outline" data-active-state={rail ? "on" : "off"} onClick={() => showRail(rail ? null : "pages")}>
            <PanelLeft className="tiptap-button-icon" />
          </Button>
          <Button data-style="ghost" aria-label="Details" title={detailsOut ? "Hide details" : "Details"} data-active-state={detailsOut ? "on" : "off"} onClick={() => (chime(detailsOut ? "fold" : "slide"), showDetails(!detailsOut, pane))}>
            <PanelRight className="tiptap-button-icon" />
          </Button>
          {marks.some((one) => one.color === "later") && (
            <Button data-style="ghost" aria-label="Card later" title="Second read: make a card of each passage marked Card later" data-active-state={walking ? "on" : "off"} onClick={() => (setWalking(1), walkTo(marks.find((one) => one.color === "later"), 0))}>
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
              setPaper(!paper)
            }}
          >
            <ScrollText className="tiptap-button-icon" />
          </Button>
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
        <PdfSide doc={doc} page={page} outline={outline} tab={rail} onTab={showRail} onGo={go} />
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
                    <Button data-style="ghost" aria-label="Card" title="A card that shows this snip as its answer  C  (in Review only; ⌥-click keeps it as a gem too)" onClick={(event) => (setCarding({ page: snipped.page, quote: `![](${snipped.src})`, x: snipped.x, y: snipped.y, gem: event.altKey }), setSnipped(null))}>
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
            {picked && !looking && !whyFor && !carding && <ReadBar at={picked} actions={actions} />}
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
            />
          ) : (
            picked && <PickedMenu actions={actions} />
          )}
        </ContextMenuContent>
      </ContextMenu>
      {detailsOut && <ReadDetails src={src} name={name} onPage={go} cover={cover?.image} title={title} author={author} pages={doc?.numPages} page={page} marks={marks} lit={lit} onMark={goToMark} onGather={() => void gather()} />}
      </div>
    </div>
  )
}
