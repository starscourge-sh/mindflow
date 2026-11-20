import { useMemo, useState } from "react"
import { Kbd } from "@/components/ui/kbd"
import { labelFor } from "./pdf-labels"
import { Search } from "lucide-react"
import { BackToTop, MoreBelow, VirtualList } from "@/components/haligtree/ui"
import { useLive } from "@/lib/haligtree"
import { BookHead, BookInfo, readLibrary, type Book } from "./book-head"
import type { PdfCover } from "./pdf-cover"
import { MARK_COLORS, markCss } from "./read-bar"
import { pdfBytes, type PdfMark } from "./pdf-pages"
import { InYourNotes, PageBar, PartHead, StuckHead, inNotes, linesOf, partAt, partsOf, useCited, useFolded, type Line } from "./book-links"

/** More highlights than this and the list folds by chapter, the one you are reading open. */
const LONG = 30

/**
 * Beside a PDF or an article, as a note's Details sit beside it: what it is
 * (its cover, title, author, pages and how far you have read), every
 * highlight in it (found by its words, shown by colour, by chapter once there
 * are many, each a way back to its place), and every note and gem that holds
 * it or links into it. Long lists draw only the rows in view.
 */
export function ReadDetails({ src, name, cover, title, author, pages, page, chapters = [], marks, lit, onMark, onGather, onPage, onJoin, scan }: {
  src: string
  /** The name it arrived under, for a page bar's tick to open it by. */
  name: string
  cover?: PdfCover | null
  title: string
  author?: string
  /** Its page count, and the page you are on: a PDF's; an article has neither. */
  pages?: number
  page?: number
  /** The outline's entries, for folding long lists by chapter: page runs when there are none. */
  chapters?: { title: string; page: number; depth: number }[]
  marks: PdfMark[]
  lit: string | null
  onMark: (mark: PdfMark) => void
  onGather: () => void
  /** A page bar tick pressed: go to its page. */
  onPage: (page: number) => void
  /** Highlights stacked over the same words, made one. */
  onJoin?: (group: PdfMark[]) => void
  /** A scanned book's line: read its pages, or forget what was read (pdf-scan.tsx). */
  scan?: React.ReactNode
}): React.JSX.Element {
  const cited = useCited(src, marks.length)
  const [words, setWords] = useState("")
  const [box, setBox] = useState<HTMLElement | null>(null)
  const [colour, setColour] = useState<string | null | undefined>(undefined)
  const parts = useMemo(() => (pages ? partsOf(pages, chapters.filter((one) => one.depth === 0)) : []), [pages, chapters])
  const look = words.trim().toLowerCase()
  const shown = useMemo(
    () =>
      [...marks]
        .sort((a, b) => a.page - b.page || a.start - b.start)
        .filter((one) => (colour === undefined || (one.color ?? null) === colour) && (!look || one.quote.toLowerCase().includes(look))),
    [marks, look, colour],
  )
  // Searching or showing one colour opens every chapter: what matches is never folded away.
  const grouped = !!pages && parts.length > 1 && marks.length > LONG
  const [folded, flip, foldKey] = useFolded(grouped && !look && colour === undefined, page && parts.length ? partAt(parts, page).key : undefined)
  const lines = useMemo(
    (): Line<PdfMark>[] => (grouped ? linesOf(shown, (one) => partAt(parts, one.page), folded) : shown.map((row, at) => ({ row, first: at === 0 }))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [shown, parts, grouped, foldKey],
  )
  const used = MARK_COLORS.map((one) => ({ ...one, count: marks.filter((mark) => (mark.color ?? null) === one.id).length })).filter((one) => one.count)
  const filtering = !!look || colour !== undefined
  const stacked = useMemo(() => stackedOf(marks), [marks])
  const book = useLive(readLibrary, [] as Book[]).find((one) => one.src === src)
  return (
    // A frame that does not scroll, for the way back up to sit on. The book's head (cover, title, the page bar) holds still;
    // only the lists under it scroll, each heading held at the top as its rows pass, the edges shaded where there is more.
    <div className="read-details-frame">
    <aside className="read-details book-panel" aria-label="Details">
      <div className="book-panel-head">
        <BookHead cover={cover} title={title} author={author} pages={pages} bytes={book?.bytes ?? pdfBytes(src)} />
        {pages ? <PageBar src={src} name={name} pages={pages} page={page} cited={cited} marks={marks} onPage={onPage} /> : null}
        {scan}
      </div>
      <div ref={setBox} className="book-panel-body" data-panel-scroll>

      {/* First: the way from the book to the notes that hold it or link into it (the tracker: "no way to go from a pdf
          to the note its linked from"). Under a long run of highlights it was out of sight. */}
      <section className="read-details-section" data-in-notes>
        <div className="read-details-heading">
          <h3>
            In your notes <span className="read-details-count">{inNotes(cited).length.toLocaleString()}</span>
          </h3>
        </div>
        <InYourNotes src={src} cited={cited} parts={parts} here={page} empty="No note holds it or links into it yet." />
      </section>

      <section className="read-details-section">
        <div className="read-details-heading">
          <h3>
            Highlights <span className="read-details-count">{marks.length.toLocaleString()}</span>
          </h3>
          {marks.length > 0 && (
            <button type="button" className="read-details-action" onClick={onGather}>
              Gather into a note
            </button>
          )}
        </div>
        {marks.length ? (
          <>
            <label className="read-details-find">
              <Search aria-hidden className="size-3.5 shrink-0" />
              <input type="text" placeholder="Find in highlights" aria-label="Find in highlights" value={words} onChange={(event) => setWords(event.target.value)} onKeyDown={(event) => event.key === "Escape" && setWords("")} />
              {filtering && <span className="read-details-found">{shown.length.toLocaleString()} of {marks.length.toLocaleString()}</span>}
            </label>
            {used.length > 1 && (
              <div className="read-details-colours" role="group" aria-label="Show one colour">
                {used.map((one) => (
                  <button key={one.label} type="button" aria-label={one.label} aria-pressed={colour === one.id} className="read-details-colour" onClick={() => setColour(colour === one.id ? undefined : one.id)}>
                    <span aria-hidden className={`pdf-swatch${one.id === "later" ? " is-later" : ""}`} style={{ background: one.css }} />
                    <span className="read-details-colour-count">{one.count.toLocaleString()}</span>
                  </button>
                ))}
              </div>
            )}
            {onJoin && stacked.length > 0 && (
              <div className="read-details-stacked" data-stacked={stacked.length}>
                <span>
                  {stacked.length === 1 ? `Two highlights cover the same words on p. ${labelFor(src, stacked[0][0].page)}.` : `${stacked.length.toLocaleString()} places have two highlights over the same words.`}
                </span>
                <button type="button" className="read-details-action" onClick={() => stacked.forEach((group) => onJoin(group))}>
                  {stacked.length === 1 ? "Join them" : "Join each"}
                </button>
              </div>
            )}
            <div className="read-details-marks">
              {grouped && <StuckHead lines={lines} onFold={flip} />}
              <VirtualList items={lines} keyOf={(line) => ("head" in line ? `h:${line.head.key}` : line.row.id)} estimate={64} sizeOf={(line) => ("head" in line ? 30 : 64)} rowClass="">
                {(line) =>
                  "head" in line ? (
                    <PartHead part={line.head} count={line.count} open={line.open} onFold={() => flip(line.head)} />
                  ) : (
                    // The words as they look on the page, the marker's colour behind them alone; the whole of them once picked.
                    <button type="button" data-first={line.first ? "" : undefined} data-part={line.part} className={`read-details-mark${line.row.id === lit ? " is-here" : ""}`} style={{ "--mark": markCss(line.row.color) } as React.CSSProperties} onClick={() => onMark(line.row)}>
                      <span className="read-details-mark-page">{pages ? `p. ${labelFor(src, line.row.page)}` : ""}</span>
                      <span className="read-details-mark-words">
                        <span className={line.row.color === "later" ? "is-later" : undefined}>{line.row.quote}</span>
                      </span>
                    </button>
                  )
                }
              </VirtualList>
              {!shown.length && <p className="read-details-empty">No highlight says that.</p>}
            </div>
          </>
        ) : (
          <p className="read-details-empty">Pick words and press <Kbd>H</Kbd> to highlight them. Every highlight gathers here.</p>
        )}
      </section>
      {book && <BookInfo one={book} linked={inNotes(cited).length} />}
      </div>
    </aside>
    <BackToTop target={box} />
    <MoreBelow target={box} />
    </div>
  )
}

/** Highlights over the same words on one page (two colours stacked, kept before a highlight over another changed it): each run of them. */
export function stackedOf(marks: PdfMark[]): PdfMark[][] {
  const bare = (words: string): string => words.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "")
  const sorted = marks.filter((one) => one.color !== "later").sort((a, b) => a.page - b.page || a.start - b.start)
  const groups: PdfMark[][] = []
  for (const one of sorted) {
    const last = groups.at(-1)
    // Over the same words by where they sit, or the same words kept twice (one with its full stop, one without).
    const same = (other: PdfMark): boolean => {
      const x = bare(one.quote), y = bare(other.quote)
      return x.length > 12 && y.length > 12 && (x.includes(y) || y.includes(x))
    }
    if (last && last[0].page === one.page && (one.start < Math.max(...last.map((each) => each.end)) || last.some(same))) last.push(one)
    else groups.push([one])
  }
  return groups.filter((group) => group.length > 1)
}
