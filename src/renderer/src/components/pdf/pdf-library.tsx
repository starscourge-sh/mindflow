import { useEffect, useMemo, useState } from "react"
import { BookOpen } from "lucide-react"
import { call, useLive } from "@/lib/haligtree"
import { chime } from "@/lib/sound"
import { openPdf } from "./pdf-reader"
import { usePdfCover } from "./pdf-cover"
import { BookMap, InYourNotes, PageBar, inNotes, useCited } from "./book-links"

export type Book = { src: string; name: string; title: string; author: string; pages: number | null; page: number | null; readAt: string | null; addedAt: string; highlights: number }

const readLibrary = (): Promise<Book[]> => call<Book[]>("pdf:library")

/**
 * A file's name as a person would say it: "(z-lib.org)" and other site tags,
 * a leading "18 - " and ".pdf" gone, underscores as spaces.
 */
export const cleanName = (name: string): string =>
  name
    .replace(/\.pdf$/i, "")
    .replace(/\s*[([][^)\]]*\.(org|com|net|io)[)\]]\s*/gi, " ")
    .replace(/^\s*\d{1,3}\s*[-–.]\s+/, "")
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim() || "PDF"

/** What a book is called on its card: the title it carries, else its file name made readable. */
const titleOf = (one: Book): string => (one.title === one.name.replace(/\.pdf$/i, "") ? cleanName(one.name) : one.title)
const percent = (one: Book): number | null => (one.page && one.pages ? Math.round((one.page / one.pages) * 100) : null)
const day = (iso: string | null): string => (iso ? new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "Not yet")

/**
 * Every PDF you have kept, as a shelf of real covers: each its first page,
 * its title and author, how far you have read and how many highlights it
 * holds. One click picks it and the inspector at the right says all about it;
 * a double click, or "Continue", opens it where you left off.
 */
export function PdfLibrary({ query }: { query: string }): React.JSX.Element {
  const all = useLive(readLibrary, [] as Book[])
  const books = useMemo(() => {
    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
    return [...all]
      .sort((a, b) => (b.readAt ?? b.addedAt).localeCompare(a.readAt ?? a.addedAt))
      .filter((one) => words.every((word) => `${titleOf(one)} ${one.author} ${one.name}`.toLowerCase().includes(word)))
  }, [all, query])
  const [chosen, setChosen] = useState<string | null>(null)
  useEffect(() => {
    if (!chosen && books[0]) setChosen(books[0].src)
  }, [books, chosen])
  const book = books.find((one) => one.src === chosen) ?? null
  const open = (one: Book): void => {
    chime("open")
    openPdf(one.src, one.name, one.page ?? undefined)
  }
  if (!books.length) return <p className="my-4 text-control text-muted-foreground">{query.trim() ? <>No book has “{query.trim()}” in its title or author.</> : <>No PDFs in your notes yet.</>}</p>
  return (
    <div className="pdf-library" data-library>
      <div className={`pdf-library-shelf${books.length <= 3 ? " is-few" : ""}`} role="listbox" aria-label="Your PDFs">
        {books.map((one) => (
          <BookCard key={one.src} one={one} picked={one.src === chosen} onPick={() => (chime("tap"), setChosen(one.src))} onOpen={() => open(one)} />
        ))}
        {books.length <= 3 && !query.trim() && <p className="pdf-library-hint">Every PDF you keep in a note sits on this shelf. Drop one into any note to add it.</p>}
      </div>
      {book && <Inspector one={book} onOpen={() => open(book)} />}
    </div>
  )
}

function BookCard({ one, picked, onPick, onOpen }: { one: Book; picked: boolean; onPick: () => void; onOpen: () => void }): React.JSX.Element {
  const cover = usePdfCover(one.src, one.name)
  const read = percent(one)
  return (
    <button type="button" role="option" aria-selected={picked} data-book={one.src} className={`pdf-book${picked ? " is-picked" : ""}`} onClick={onPick} onDoubleClick={onOpen} onKeyDown={(event) => event.key === "Enter" && onOpen()}>
      <span className="pdf-book-cover" data-pdf-peek={one.src} data-pdf-peek-name={one.name}>
        {cover?.image ? <img src={cover.image} alt="" draggable={false} /> : <span className="pdf-book-blank"><BookOpen className="size-6" /></span>}
        {read !== null && (
          <span className="pdf-book-progress" aria-label={`Read ${read}%`}>
            <span style={{ width: `${read}%` }} />
          </span>
        )}
      </span>
      <span className="pdf-book-title">{titleOf(one)}</span>
      <span className="pdf-book-meta">
        {one.author || (read !== null ? `${read}% read` : "Not started")}
        {one.highlights > 0 && <span className="pdf-book-marks"> · {one.highlights} highlight{one.highlights === 1 ? "" : "s"}</span>}
      </span>
    </button>
  )
}

/**
 * The picked book, as iPad Books' book page and Preview's inspector have it:
 * its cover large, its title and author, a quiet way back in at your page, the
 * book's length with where your notes, highlights and cards attach, the notes
 * that link into it (as a list in page order and as a small map), and last
 * the few facts about the file.
 */
function Inspector({ one, onOpen }: { one: Book; onOpen: () => void }): React.JSX.Element {
  const cover = usePdfCover(one.src, one.name)
  const cited = useCited(one.src, one.highlights)
  const [marks, setMarks] = useState<{ page: number; color?: string | null }[]>([])
  useEffect(() => {
    let live = true
    void call<{ page: number; color?: string | null }[]>("pdf:highlights", one.src).then((rows) => live && setMarks(rows))
    return () => void (live = false)
  }, [one.src, one.highlights])
  const linked = inNotes(cited).length
  const rows: [string, string][] = [
    ["Pages", one.pages ? String(one.pages) : "Not counted yet"],
    ["Highlights", one.highlights ? String(one.highlights) : "None"],
    ["In your notes", linked ? String(linked) : "None"],
    ["Added", day(one.addedAt)],
    ["Last opened", day(one.readAt)],
  ]
  return (
    <aside className="pdf-inspector mf-more" aria-label="About this book" data-inspector>
      {cover?.image ? <img className="pdf-inspector-cover" src={cover.image} alt="" draggable={false} /> : <span className="pdf-inspector-cover pdf-book-blank" />}
      <div className="pdf-inspector-what">
        <h2 className="pdf-inspector-title">{titleOf(one)}</h2>
        {one.author && <p className="pdf-inspector-author">{one.author}</p>}
      </div>
      <button type="button" className="pdf-inspector-open" onClick={onOpen}>
        {one.page && one.page > 1 ? `Continue at p. ${one.page}` : "Start reading"}
      </button>
      {one.pages ? <PageBar src={one.src} name={one.name} pages={one.pages} page={one.page} cited={cited} marks={marks} /> : null}
      <section className="pdf-inspector-section">
        <h3 className="read-details-heading">
          In your notes <span className="read-details-count">{linked}</span>
        </h3>
        <InYourNotes cited={cited} empty="No note links here yet. Link a page from the reader with “Copy link to this page” and paste it in any note." />
        <BookMap src={one.src} title={titleOf(one)} cited={cited} />
      </section>
      <dl className="pdf-inspector-rows">
        {rows.map(([label, value]) => (
          <div key={label} className="pdf-inspector-row">
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
        <div className="pdf-inspector-row is-file">
          <dt>File</dt>
          <dd title={one.name}>{one.name}</dd>
        </div>
      </dl>
    </aside>
  )
}

/**
 * Home's "Continue reading": the books you are part way through, last read
 * first, each its cover, title and how far you are, opening at your page.
 * Nothing at all when there is no book on the go.
 */
export function ContinueReading({ heading, extra = [] }: { heading: (count: number) => React.ReactNode; /** Other things left part way (an article, a Review sitting, a draft), after the books. */ extra?: React.ReactNode[] }): React.JSX.Element | null {
  const all = useLive(readLibrary, [] as Book[])
  const going = all
    .filter((one) => one.readAt && one.page && one.pages && one.page < one.pages)
    .sort((a, b) => b.readAt!.localeCompare(a.readAt!))
    .slice(0, 4)
  if (!going.length && !extra.length) return null
  return (
    <section className="flex flex-col gap-3 px-5 @[44rem]/page:px-8" data-continue-reading>
      {heading(going.length + extra.length)}
      <div className="continue-reading">
        {going.map((one) => (
          <ReadingCard key={one.src} one={one} />
        ))}
        {extra}
      </div>
    </section>
  )
}

function ReadingCard({ one }: { one: Book }): React.JSX.Element {
  const cover = usePdfCover(one.src, one.name)
  const read = percent(one) ?? 0
  return (
    <button type="button" className="continue-book" data-book={one.src} onClick={() => (chime("open"), openPdf(one.src, one.name, one.page ?? undefined))}>
      <span className="continue-book-cover" data-pdf-peek={one.src} data-pdf-peek-name={one.name} data-pdf-peek-page={one.page ?? undefined}>{cover?.image ? <img src={cover.image} alt="" draggable={false} /> : <span className="pdf-book-blank" />}</span>
      <span className="continue-book-words">
        <span className="continue-book-title">{titleOf(one)}</span>
        <span className="continue-book-where">
          Page {one.page} of {one.pages} · {read}%
        </span>
        <span className="continue-book-track">
          <span style={{ width: `${read}%` }} />
        </span>
      </span>
    </button>
  )
}
