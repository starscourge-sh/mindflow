import { useEffect, useMemo, useRef, useState } from "react"
import { ChevronRight } from "lucide-react"
import { chime } from "@/lib/sound"
import { openApart } from "@/lib/apart"
import { openItems } from "@/lib/split"
import { RowMenu, copyLinkItem, type RowItem } from "@/components/haligtree/row-menu"
import { Tip, VirtualList } from "@/components/haligtree/ui"
import { hoverNote } from "@/components/haligtree/note-preview"
import { open, pagesOf, useBookGraph, type Cited } from "./same-book"
export { useCited, type Cited } from "./same-book"
import { GraphCanvas } from "@/components/haligtree/graph-canvas"
import { openPdf } from "./pdf-reader"
import { plural, num } from '../../../../main/dates'

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
export function InYourNotes({ cited, empty, parts = [], here }: { cited: Cited[]; empty: string; parts?: Part[]; here?: number }): React.JSX.Element {
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
          <span className="book-cited-page">{one.pages.length ? pagesOf(one.pages) : "Whole"}</span>
          <span className="book-cited-title">{one.title || "Untitled"}</span>
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

/** How many stretches the page bar adds its marks up in: few enough that each still reads at any count. */
const BINS = 56

/**
 * The book's length as a strip: where you are, how far you have read, and
 * where your highlights, notes and cards gather, added up into stretches of
 * pages so the strip reads at 5 marks or 5,000 (a taller tick, more there).
 * Pointed at, a stretch says what is in it; pressed, it opens there. Under it,
 * "You are on p. 83 of 336" between the book's first and last page.
 */
export function PageBar({ src, name, pages, page, cited, marks, onPage }: { src: string; name: string; pages: number; page?: number | null; cited: Cited[]; marks: Mark[]; /** In the reader: go to the page there. */ onPage?: (page: number) => void }): React.JSX.Element {
  const bins = Math.min(BINS, pages)
  const stretches = useMemo(() => {
    const all = Array.from({ length: bins }, (_, at) => ({ from: Math.floor((at * pages) / bins) + 1, to: Math.floor(((at + 1) * pages) / bins), marks: 0, notes: 0, cards: 0, first: 0 }))
    const add = (p: number, kind: "marks" | "notes" | "cards"): void => {
      if (p < 1 || p > pages) return
      const one = all[Math.min(bins - 1, Math.floor(((p - 1) * bins) / pages))]
      one[kind]++
      one.first = one.first ? Math.min(one.first, p) : p
    }
    for (const one of cited) for (const p of one.pages) add(p, one.type === "card" ? "cards" : "notes")
    for (const mark of marks) add(mark.page, "marks")
    return all
  }, [cited, marks, pages, bins])
  const most = Math.max(1, ...stretches.map((one) => one.marks + one.notes + one.cards))
  const left = (p: number): string => `${pages > 1 ? ((p - 1) / (pages - 1)) * 100 : 50}%`
  const counted = (n: number, one: string, many: string): string => (n ? `${n.toLocaleString()} ${n === 1 ? one : many}` : "")
  return (
    <div className="book-bar" data-page-bar>
      <div className="book-bar-strip">
        {page ? <span className="book-bar-read" style={{ width: left(page) }} /> : null}
        {stretches.map((one, at) => {
          const all = one.marks + one.notes + one.cards
          if (!all) return null
          const says = [counted(one.marks, "highlight", "highlights"), counted(one.notes, "note", "notes"), counted(one.cards, "card", "cards")].filter(Boolean).join(", ")
          return (
            <Tip key={at} label={`${one.from === one.to ? `p. ${one.from}` : `pp. ${one.from} to ${one.to}`}: ${says}`}>
              <button
                type="button"
                aria-label={`Open at p. ${one.first}`}
                data-tick={one.notes ? "note" : one.marks ? "mark" : "card"}
                data-tick-page={one.first}
                className="book-bar-tick"
                style={{ left: `${(at / bins) * 100}%`, width: `${100 / bins}%`, "--fill": Math.sqrt(all / most).toFixed(2) } as React.CSSProperties}
                onClick={() => (chime("open"), onPage ? onPage(one.first) : openPdf(src, name, one.first))}
              >
                <span className={`book-bar-heat${one.marks ? "" : " is-note"}`} />
              </button>
            </Tip>
          )
        })}
        {page ? <span className="book-bar-here" data-here={page} style={{ left: left(page) }} /> : null}
      </div>
      <div className="book-bar-ends">
        <span>p. 1</span>
        {page ? <span className="book-bar-you">You are on p. {page.toLocaleString()} of {pages.toLocaleString()}</span> : <span>Not started</span>}
        <span>p. {pages.toLocaleString()}</span>
      </div>
    </div>
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

