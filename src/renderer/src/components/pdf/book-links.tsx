import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { labelFor } from "./pdf-labels"
import { ChevronRight } from "lucide-react"
import { chime } from "@/lib/sound"
import { openApart } from "@/lib/apart"
import { openItems } from "@/lib/split"
import { RowMenu, copyLinkItem, type RowItem } from "@/components/haligtree/row-menu"
import { VirtualList } from "@/components/haligtree/ui"
import { hoverNote } from "@/components/haligtree/note-preview"
import { open, pagesOf, useBookGraph, type Cited } from "./same-book"
export { useCited, type Cited } from "./same-book"
import { GraphCanvas } from "@/components/haligtree/graph-canvas"
import { openPdf } from "./pdf-reader"
import { plural, num } from '../../../../main/dates'
import { GAP, LOW, STEP, STROKE_INK, StrokeAxis, StrokeRule, StrokeTip, Strokes, TALL, strokeAt } from "@/components/haligtree/time-strokes"
import { SWELL, useSwell, useYearZoom } from "@/components/haligtree/year-zoom"
import { useStill } from "@/lib/motion"
import { pdfCover } from "./pdf-cover"
import { drawnPage, pageImage } from "./pdf-peek"
import { useDarkPages, usePaperPages } from "./paper"

/** Notes and gems: what "In your notes" lists. Cards show on the page bar alone. */
export const inNotes = (cited: Cited[]): Cited[] => cited.filter((one) => one.type !== "card" && one.type !== "deck")

const kindOf = (type: string): string => ({ capture: "Note", article: "Writing", card: "Card", question: "Question" })[type] ?? "Gem"

/** A stretch of the book a long list folds by: a chapter from its outline, or a run of pages. */
export type Part = { key: string; title: string; from: number }

/**
 * The book cut into parts for a long list: its outline's chapters (the top
 * level), else runs of pages sized so a book makes a dozen or so.
 */
export function partsOf(pages: number, chapters: { title: string; page: number }[]): Part[] {
  const top = chapters.filter((one, at) => one.page >= 1 && (at === 0 || one.page > chapters[at - 1].page))
  if (top.length > 1) {
    const parts = top.map((one, at) => ({ key: `c${at}`, title: one.title, from: one.page }))
    return parts[0].from > 1 ? [{ key: "front", title: "Before the first chapter", from: 1 }, ...parts] : parts
  }
  const step = [10, 20, 25, 50, 100].find((size) => pages / size <= 14) ?? Math.ceil(pages / 12)
  return Array.from({ length: Math.ceil(Math.max(1, pages) / step) }, (_, at) => ({ key: `r${at}`, title: `Pages ${at * step + 1} to ${Math.min(pages, (at + 1) * step)}`, from: at * step + 1 }))
}

/** The part a page sits in. */
export const partAt = (parts: Part[], page: number): Part => parts.reduce((at, one) => (one.from <= page ? one : at), parts[0])

/** A long list's lines: a heading for each part with how many it holds, then its rows when it is open. */
export type Line<T> = { head: Part; count: number; open: boolean } | { row: T; first: boolean; part?: string }

/** Rows by part, each part's heading with its count, folded parts showing their heading alone. */
export function linesOf<T>(rows: T[], partOf: (row: T) => Part, folded: (part: Part) => boolean): Line<T>[] {
  const by = new Map<Part, T[]>()
  for (const row of rows) {
    const part = partOf(row)
    const held = by.get(part)
    if (held) held.push(row)
    else by.set(part, [row])
  }
  return [...by].flatMap(([head, held]): Line<T>[] => {
    const open = !folded(head)
    return [{ head, count: held.length, open }, ...(open ? held.map((row, at) => ({ row, first: at === 0, part: head.key })) : [])]
  })
}

/** The heading of one part of a long list: its name and count; a click folds or opens it. */
export function PartHead({ part, count, open, onFold }: { part: Part; count: number; open: boolean; onFold: () => void }): React.JSX.Element {
  return (
    <button type="button" data-mark-group={part.key} aria-expanded={open} className="read-details-part" onClick={onFold}>
      <ChevronRight aria-hidden className={`size-3 shrink-0 transition-[rotate] duration-80 ${open ? "rotate-90" : ""}`} />
      <span className="read-details-part-title">{part.title}</span>
      <span className="read-details-count">{count.toLocaleString()}</span>
    </button>
  )
}

/**
 * The heading of the part being read through, held at the top of the panel
 * while its rows scroll under it, so a long list always says which chapter it
 * is in. It sits in no room of its own; it shows only once the part's own
 * heading has scrolled away.
 */
export function StuckHead<T>({ lines, onFold }: { lines: Line<T>[]; onFold: (part: Part) => void }): React.JSX.Element {
  const spot = useRef<HTMLDivElement>(null)
  const [stuck, setStuck] = useState<string | null>(null)
  useEffect(() => {
    const list = spot.current?.parentElement
    let scroller = list?.parentElement ?? null
    while (scroller && !/auto|scroll/.test(getComputedStyle(scroller).overflowY)) scroller = scroller.parentElement
    if (!list || !scroller) return
    let asked = 0
    const read = (): void => {
      asked = 0
      // Under the section's heading, held at the top of the panel too.
      const top = scroller.getBoundingClientRect().top + (list.closest("section")?.querySelector(".read-details-heading")?.getBoundingClientRect().height ?? 0)
      const rows = [...list.querySelectorAll<HTMLElement>("[data-part], [data-mark-group]:not(.read-details-stuck *)")].filter((one) => one.getBoundingClientRect().bottom > top + 1)
      const first = rows[0]
      setStuck(first && first.dataset.part && first.getBoundingClientRect().top < top + 30 ? first.dataset.part : null)
    }
    const check = (): void => void (asked ||= requestAnimationFrame(read))
    scroller.addEventListener("scroll", check, { passive: true })
    read()
    return () => (scroller.removeEventListener("scroll", check), cancelAnimationFrame(asked))
  }, [lines])
  const head = stuck ? lines.find((line): line is Extract<Line<T>, { head: Part }> => "head" in line && line.head.key === stuck) : undefined
  return (
    <div ref={spot} className="read-details-stuck">
      {head && <PartHead part={head.head} count={head.count} open={head.open} onFold={() => onFold(head.head)} />}
    </div>
  )
}

/** Which parts are folded: in a long list every one but the part you are reading; in a short one none. */
export function useFolded(long: boolean, here: string | undefined): [(part: Part) => boolean, (part: Part) => void, string] {
  const [flipped, setFlipped] = useState<Set<string>>(() => new Set())
  const folded = (part: Part): boolean => flipped.has(part.key) !== (long && part.key !== here)
  const flip = (part: Part): void =>
    setFlipped((was) => {
      const next = new Set(was)
      if (!next.delete(part.key)) next.add(part.key)
      return next
    })
  return [folded, flip, `${long}:${here}:${[...flipped].join(" ")}`]
}

const WHOLE: Part = { key: "whole", title: "Whole book", from: 0 }

/**
 * "In your notes": every note and gem that links into the book, in page order
 * through it, by chapter once there are many, each with the page it links to,
 * its title, its kind and the line it does it in. Notes that hold the whole
 * book come first, under "Whole book". Pointed at, the shared note card shows
 * it whole. A click opens it, ⌥-click to the side; right-click for the row menu.
 */
export function InYourNotes({ cited, empty, parts = [], here, src = "" }: { cited: Cited[]; empty: string; parts?: Part[]; here?: number; /** The book, so its pages are named as printed. */ src?: string }): React.JSX.Element {
  const shown = useMemo(() => inNotes(cited).sort((a, b) => (a.pages[0] ?? 0) - (b.pages[0] ?? 0)), [cited])
  const long = shown.length > 30
  const grouped = long && parts.length > 1
  const [folded, flip, foldKey] = useFolded(grouped, here && parts.length ? partAt(parts, here).key : undefined)
  const lines = useMemo(
    (): Line<Cited>[] => (grouped ? linesOf(shown, (one) => (one.pages.length ? partAt(parts, one.pages[0]) : WHOLE), (part) => part !== WHOLE && folded(part)) : shown.map((row, at) => ({ row, first: at === 0 }))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [shown, parts, grouped, foldKey],
  )
  if (!shown.length) return <p className="read-details-empty">{empty}</p>
  const row = (one: Cited, first: boolean, part?: string): React.JSX.Element => {
    const items: RowItem[] = [
      { label: "Open", run: () => open(one, false) },
      ...openItems(one.type, one.id),
      { label: "Open in a new window", run: () => openApart(one.type, one.id) },
      "separator",
      copyLinkItem(one.type === "capture" ? one.id : `${one.type}:${one.id}`, one.title),
    ]
    return (
      <RowMenu items={items}>
        <button type="button" data-cited={one.id} data-cited-page={one.pages[0] ?? 0} data-first={first ? "" : undefined} data-part={part} className="book-cited-row" {...hoverNote(one.type, one.id)} onClick={(event) => open(one, event.altKey)}>
          <span className="book-cited-page">{one.pages.length ? pagesOf(one.pages, (n) => labelFor(src, n)) : "Whole"}</span>
          <span className="book-cited-title">{one.title || "New note"}</span>
          <span className="book-cited-line">
            <span className="book-cited-kind">{kindOf(one.type)}</span>
            {one.line ? ` · ${one.line}` : ""}
          </span>
        </button>
      </RowMenu>
    )
  }
  return (
    <div className="book-cited" data-book-cited>
      {grouped && <StuckHead lines={lines} onFold={flip} />}
      <VirtualList items={lines} keyOf={(line) => ("head" in line ? `h:${line.head.key}` : `${line.row.type}:${line.row.id}`)} estimate={60} sizeOf={(line) => ("head" in line ? 30 : 60)} rowClass="">
        {(line) => ("head" in line ? <PartHead part={line.head} count={line.count} open={line.open} onFold={() => flip(line.head)} /> : row(line.row, line.first, line.part))}
      </VirtualList>
    </div>
  )
}

type Mark = { page: number; color?: string | null }

/** How wide a page's picture stands over the strip, in CSS px. */
const THUMB = 80
/** How long the pointer stays on a page not yet drawn before it is drawn. */
const REST = 90
/** At the closest a pinch goes, how far apart two pages stand: a stroke a page, with room to point at each. */
const PAGE_DEEP = 8
/** The strip's height: room for the swell over the low strokes, and for the tallest of the gathered ones. */
const STRIP_ROOM = Math.max(LOW + SWELL + 2, TALL + 6)

/**
 * The book's length drawn as the Journal's year is (time-strokes.tsx), and felt as it is (year-zoom.ts): a hairline for
 * each stretch of pages across the card, solid where read, faint ahead, the stroke you are on taller in the accent, and
 * a stroke standing taller where highlights, notes or cards gather, more there the taller. The strokes near the pointer
 * swell; a pinch spreads the book wider (to a stroke a page), page numbers coming in under it, Esc or a double-click
 * for the whole book. Pointed at, a stroke shows its page's picture over it and says what is in it under it; pressed,
 * it opens there. Over it the point ("You are on p. 83 of 336") and what the strokes are; under it, the first and last page.
 */
export function PageBar({ src, name, pages, page, cited, marks, onPage }: { src: string; name: string; pages: number; page?: number | null; cited: Cited[]; marks: Mark[]; /** In the reader: go to the page there. */ onPage?: (page: number) => void }): React.JSX.Element {
  const strip = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  useLayoutEffect(() => {
    const el = strip.current
    if (!el) return
    const measure = (): void => setWidth(Math.floor(el.clientWidth))
    measure()
    const watch = new ResizeObserver(measure)
    watch.observe(el)
    return () => watch.disconnect()
  }, [])
  // Pinched, the book spreads wider inside the card: each page `base` px apart at the whole book, `PAGE_DEEP` at the closest.
  const { view, whole } = useYearZoom(strip, [{ base: (width + GAP) / Math.max(1, pages), count: Math.max(1, pages), clip: width }], PAGE_DEEP)
  const z = view.z
  const zoomed = z > 1.001
  const pan = view.pans[0] ?? 0
  const spread = width * z
  // As many hairlines as fit a stroke and a gap each, never more than the pages; spread across the whole (pinched) width.
  const count = Math.max(1, Math.min(pages, Math.floor((spread + GAP) / STEP)))
  const step = count > 1 ? Math.max(STEP, (spread - 1) / (count - 1)) : STEP
  useSwell(strip, () => step / z)
  const calm = useStill()
  const strokeOf = (p: number): number => Math.min(count - 1, Math.floor(((p - 1) * count) / Math.max(1, pages)))
  const stretches = useMemo(() => {
    const all = Array.from({ length: count }, (_, at) => ({ from: Math.floor((at * pages) / count) + 1, to: Math.max(Math.floor((at * pages) / count) + 1, Math.floor(((at + 1) * pages) / count)), marks: 0, notes: 0, cards: 0, first: 0 }))
    const add = (p: number, kind: "marks" | "notes" | "cards"): void => {
      if (p < 1 || p > pages) return
      const one = all[Math.min(count - 1, Math.floor(((p - 1) * count) / pages))]
      one[kind]++
      one.first = one.first ? Math.min(one.first, p) : p
    }
    for (const one of cited) for (const p of one.pages) add(p, one.type === "card" ? "cards" : "notes")
    for (const mark of marks) add(mark.page, "marks")
    return all
  }, [cited, marks, pages, count])
  const most = Math.max(1, ...stretches.map((one) => one.marks + one.notes + one.cards))
  const here = page ? strokeOf(page) : -1
  const [hover, setHover] = useState<number | null>(null)
  const quick = useRef<Quick | null>(null)
  // A pinch changes how many strokes there are: one pointed at before it may be gone.
  const lit = hover !== null && hover < count ? hover : null
  const counted = (n: number, one: string, many: string): string => (n ? `${n.toLocaleString()} ${n === 1 ? one : many}` : "")
  const at = (clientX: number, el: Element): number | null => strokeAt(clientX + pan, el.getBoundingClientRect().left, count, step)
  const whereOf = (i: number): string => {
    const one = stretches[i]
    return one.from === one.to ? `p. ${labelFor(src, one.from)}` : `pp. ${labelFor(src, one.from)} to ${labelFor(src, one.to)}`
  }
  const whatOf = (i: number): string => {
    const one = stretches[i]
    return [counted(one.marks, "highlight", "highlights"), counted(one.notes, "note", "notes"), counted(one.cards, "card", "cards"), i === here ? "you are here" : ""].filter(Boolean).join(", ")
  }
  // The page a stroke opens at: the first one holding something, else its first page.
  const pageOf = (i: number): number => stretches[i].first || stretches[i].from
  const go = (i: number): void => {
    const to = pageOf(i)
    chime("open")
    if (onPage) onPage(to)
    else openPdf(src, name, to)
  }
  // Zoomed, the pages are numbered under the strokes at a round step that leaves room between the numbers.
  const every = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000].find((n) => (n * spread) / pages >= 44) ?? 10000
  const ticks = zoomed
    ? Array.from({ length: Math.floor(pages / every) + 1 }, (_, k) => Math.max(1, k * every)).flatMap((p) => {
        const x = strokeOf(p) * step
        return x >= pan - 90 && x <= pan + width + 10 ? [{ x, text: labelFor(src, p) }] : []
      })
    : []
  const x = lit === null ? 0 : lit * step - pan
  return (
    <div className="book-bar" data-page-bar>
      {/* The point first, in full ink; then what the strip shows; then the strip, the first and last page under it. */}
      <p className="book-bar-you">
        {page ? <>You are on p. {labelFor(src, page)} of {labelFor(src, pages)}</> : "Not started"}
        {zoomed && <span data-book-zoom-hint className="font-normal text-muted-foreground"> · Esc or a double-click for the whole book</span>}
      </p>
      <StrokeRule>Taller strokes hold highlights and notes; pinch to look closer</StrokeRule>
      <div ref={strip} className="book-bar-strip relative" data-swipe-own data-zoom-band={0} data-book-zoom={Math.round(z * 100) / 100} onDoubleClick={whole}>
        {width > 0 && (
          <>
            <div data-zoom-clip className="overflow-hidden pb-0.5 [contain:layout_paint]">
              <Strokes count={count} step={step} shift={pan} view={width} height={STRIP_ROOM} role="img" aria-label={page ? `p. ${labelFor(src, page)} of ${labelFor(src, pages)}` : `${pages} pages`} className="cursor-pointer"
                ink={(i) => (i === here ? STROKE_INK.here : stretches[i].marks + stretches[i].notes + stretches[i].cards ? "var(--foreground)" : i < here ? STROKE_INK.gone : STROKE_INK.ahead)}
                tall={(i) => { const all = stretches[i].marks + stretches[i].notes + stretches[i].cards; return all ? Math.round(Math.sqrt(all / most) * 6) : i === here || (calm && i === lit) }}
                attrs={(i) => { const one = stretches[i]; const all = one.marks + one.notes + one.cards; return { "data-here": i === here ? page ?? undefined : undefined, "data-gone": i < here ? "" : undefined, "data-tick": all ? (one.notes ? "note" : one.marks ? "mark" : "card") : undefined, "data-tick-page": all ? one.first : undefined } }}
                onPointerMove={(event) => {
                  const i = at(event.clientX, event.currentTarget)
                  // A page already drawn goes onto the picture now, from this event; React follows with the rest.
                  if (i !== null && i !== lit) quick.current?.(pageOf(i), i * step - pan)
                  setHover(i)
                }} onPointerLeave={() => setHover(null)}
                onClick={(event) => { const i = (event.target as Element).getAttribute("data-tick-page") ? stretches.findIndex((one) => String(one.first) === (event.target as Element).getAttribute("data-tick-page")) : at(event.clientX, event.currentTarget); if (i !== null && i >= 0) go(i) }} />
            </div>
            {lit !== null && (
              <>
                <PagePicture src={src} page={pageOf(lit)} x={x} width={width} quick={quick} />
                <StrokeTip x={x} width={width}>
                  <span className="font-medium">{whereOf(lit)}</span>
                  <span className="text-muted-foreground"> · {whatOf(lit) || "click for its page"}</span>
                </StrokeTip>
              </>
            )}
          </>
        )}
      </div>
      {zoomed ? (
        <div data-book-pages className="overflow-hidden" style={{ width }}>
          <div style={{ width: spread, transform: pan ? `translateX(${-pan}px)` : undefined }}>
            <StrokeAxis ticks={ticks} width={spread} from={pan - 90} to={pan + width + 10} />
          </div>
        </div>
      ) : (
        <div className="book-bar-ends">
          <span>p. {labelFor(src, 1)}</span>
          <span>p. {labelFor(src, pages)}</span>
        </div>
      )}
    </div>
  )
}

/** The rail's drawing of a page, if this book's reader has drawn it there in the pages' present look (pdf-rail.tsx). */
const railDrawn = (near: Element | null, page: number): HTMLCanvasElement | null => {
  const canvas = near?.closest(".pdf-reader")?.querySelector<HTMLCanvasElement>(`.pdf-thumb[data-thumb-page="${page}"] canvas[data-drawn]`)
  return canvas && canvas.dataset.drawn === (localStorage.getItem("pdf-dark") === "1" ? "dark" : "light") ? canvas : null
}

/** Shows a page on the picture at once, from the pointer's own event: the page, and where its stroke is along the strip. */
type Quick = (page: number, x: number) => void

/** The picture's left edge for a stroke at `x`: the card stays inside the strip; the arrow stays on the stroke. */
const cardLeft = (x: number, width: number): number => {
  const half = THUMB / 2 + 4
  return Math.max(half, Math.min(Math.max(width, 2 * half) - half, x))
}

/**
 * The page pointed at on the strip, small over its stroke, as a macOS popover is over what it is about: opaque, ringed
 * and shadowed as every popover is, its picture and its number, the pointer arrow on the stroke. Nothing is drawn that
 * is already drawn: page 1 is the cover, a page the rail has drawn is copied from it, a page drawn for a cover's scrub
 * or the hover card is taken from their cache (pdf-peek.tsx), and only a page none of those have is drawn, once the
 * pointer rests on it, one at a time, the newest asked for first. A page already drawn is shown from the pointer's own
 * event (`quick`), before React draws again; its number shows at once either way, and a page drawn late fades in.
 */
function PagePicture({ src, page, x, width, quick }: { src: string; page: number; x: number; width: number; quick: React.MutableRefObject<Quick | null> }): React.JSX.Element {
  const box = useRef<HTMLSpanElement>(null)
  const img = useRef<HTMLImageElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const number = useRef<HTMLSpanElement>(null)
  const arrow = useRef<HTMLSpanElement>(null)
  const [paperKept] = usePaperPages()
  const [dark] = useDarkPages()
  // A page drawn after it was asked for: kept here once it comes.
  const [late, setLate] = useState<{ page: number; image: string | null } | null>(null)
  // Its shape, kept from the last picture: a sheet that changed shape on every page would jump under the eye.
  const [shape, setShape] = useState(1.3)
  // Looked up as it is drawn: a page already drawn is on the first frame, never a frame later.
  const ready = railDrawn(box.current, page) ?? drawnPage(src, page) ?? null
  useEffect(() => {
    if (ready) return
    let live = true
    // Drawn only once the pointer rests on the page: a page takes some 35ms to draw (up to 100ms, qa/page-strip.mjs), so
    // drawing the pages a fast sweep passes dropped frames; swept past, a page shows its number alone.
    const rest = window.setTimeout(() => {
      void (page === 1 ? pdfCover(src).then((cover) => cover?.image ?? null) : pageImage(src, page)).then((image) => {
        if (live) setLate({ page, image })
      })
    }, REST)
    return () => {
      live = false
      clearTimeout(rest)
    }
  }, [src, page, ready])
  const image = ready ?? (late?.page === page ? late.image : null)
  const fading = !ready && !!image
  useLayoutEffect(() => {
    if (!(image instanceof HTMLCanvasElement) || !canvas.current) return
    canvas.current.width = image.width
    canvas.current.height = image.height
    canvas.current.getContext("2d")?.drawImage(image, 0, 0)
    setShape(image.height / image.width || 1.3)
  }, [image])
  // The pointer's fast way in: a page already drawn as a picture goes straight onto the card, with its number and place.
  // React then draws the same, so the two never disagree.
  useLayoutEffect(() => {
    quick.current = (to, at) => {
      const now = drawnPage(src, to)
      const node = box.current
      if (!node || !img.current || typeof now !== "string" || railDrawn(node, to)) return
      const left = cardLeft(at, width)
      node.style.left = `${left}px`
      if (arrow.current) arrow.current.style.left = `calc(50% + ${Math.round(at - left)}px)`
      const words = number.current?.firstChild
      if (words) words.nodeValue = labelFor(src, to)
      img.current.src = now
      img.current.hidden = false
    }
    return () => void (quick.current = null)
  })
  const paper = paperKept && !dark
  const left = cardLeft(x, width)
  return (
    <span ref={box} data-page-picture={page} aria-hidden className="book-thumb" style={{ left, bottom: "100%" }}>
      <span className={`book-thumb-sheet${paper ? " is-paper" : ""}`} style={{ width: THUMB, height: Math.round(THUMB * shape) }}>
        {image instanceof HTMLCanvasElement ? <canvas ref={canvas} className={fading ? "is-late" : undefined} /> : null}
        {/* Always there, so the pointer's fast way in has a picture to put a page on. */}
        <img key={fading ? `late${page}` : "img"} ref={img} src={typeof image === "string" ? image : undefined} hidden={typeof image !== "string"} alt="" draggable={false} decoding="sync"
          className={fading ? "is-late" : undefined} onLoad={(event) => setShape(event.currentTarget.naturalHeight / event.currentTarget.naturalWidth || 1.3)} />
      </span>
      <span ref={number} data-page-picture-number className="book-thumb-number">{labelFor(src, page)}</span>
      <span ref={arrow} aria-hidden className="book-thumb-arrow" style={{ left: `calc(50% + ${Math.round(x - left)}px)` }} />
    </span>
  )
}

/**
 * The book's own small map, as a note's Links map: the book in the middle, the
 * notes and gems that link into it around it, and the links between those, so
 * notes that belong together cluster. Pointed at, a dot names itself; clicked, it opens.
 */
export function BookMap({ src, title, cited }: { src: string; title: string; cited: Cited[] }): React.JSX.Element | null {
  const around = inNotes(cited)
  const graph = useBookGraph(src, title, around)
  if (!graph) return null
  const n = around.length
  return (
    <figure className="book-map" data-book-map data-nodes={graph.nodes.length} data-lines={graph.edges.length}>
      <GraphCanvas map={graph} centre={src} onOpen={(type, id, aside) => open({ type, id }, !!aside)} className="h-[180px]" />
      <figcaption className="book-map-says">
        {num(n)} {n === 1 ? "note links" : "notes link"} to this book{graph.among ? `; ${plural(graph.among, 'link joins them', 'links join them')} to each other` : ""}.
      </figcaption>
    </figure>
  )
}

