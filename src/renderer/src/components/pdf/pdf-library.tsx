import { useEffect, useMemo, useState } from "react"
import { BookOpen } from "lucide-react"
import { call, useLive } from "@/lib/haligtree"
import { chime } from "@/lib/sound"
import { openPdf } from "./pdf-reader"
import { pdfCover, usePdfCover } from "./pdf-cover"
import { PictureRow } from "@/components/haligtree/picture-row"
import { BookMap, InYourNotes, PageBar, inNotes, useCited } from "./book-links"
import { BookHead, BookInfo, readLibrary, type Book } from "./book-head"
import { BackToTop } from "@/components/haligtree/ui"
export type { Book } from "./book-head"

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

/**
 * Every PDF you have kept, as a shelf of real covers: each its first page,
 * its title and author, how far you have read and how many highlights it
 * holds. One click picks it and the inspector at the right says all about it;
 * a double click, or "Continue", opens it where you left off.
 */
export function PdfLibrary({ query, top }: { query: string; /** What sits over the shelf (the kinds), scrolling with it. */ top: React.ReactNode }): React.JSX.Element {
  const all = useLive(readLibrary, [] as Book[])
  const books = useMemo(() => {
    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
    return [...all]
      .sort((a, b) => (b.readAt ?? b.addedAt).localeCompare(a.readAt ?? a.addedAt))
      .filter((one) => words.every((word) => `${titleOf(one)} ${one.author} ${one.name}`.toLowerCase().includes(word)))
  }, [all, query])
  const going = useGoing(all)
  const [chosen, setChosen] = useState<string | null>(null)
  useEffect(() => {
    if (!chosen && books[0]) setChosen(books[0].src)
  }, [books, chosen])
  const book = books.find((one) => one.src === chosen) ?? null
  const open = (one: Book): void => {
    chime("open")
    openPdf(one.src, one.name, one.page ?? undefined)
  }
  const [scroller, setScroller] = useState<HTMLDivElement | null>(null)
  // The shelf scrolls on its own at the left; the picked book's panel is docked at the page's right edge, full height, as the reader's is.
  return (
    <div className="pdf-library" data-library>
      <div className="pdf-library-side">
        <div ref={setScroller} className="pdf-library-scroll" data-shelf-scroll>
          <div className="pdf-library-column">
            {top}
            {!query.trim() && going.length > 0 && (
              <section className="mb-4 flex flex-col gap-2" data-shelf-continue>
                <h3 className="text-body font-medium text-foreground">Continue reading</h3>
                <ReadingRow going={going} />
              </section>
            )}
            {books.length ? (
              <div className={`pdf-library-shelf${books.length <= 3 ? " is-few" : ""}`} role="listbox" aria-label="Your PDFs">
                {books.map((one) => (
                  <BookCard key={one.src} one={one} picked={one.src === chosen} onPick={() => (chime("tap"), setChosen(one.src))} onOpen={() => open(one)} />
                ))}
                {books.length <= 3 && !query.trim() && <p className="pdf-library-hint">Every PDF you keep in a note sits on this shelf. Drop one into any note to add it.</p>}
              </div>
            ) : (
              <p className="my-4 text-control text-muted-foreground">{query.trim() ? <>No book has “{query.trim()}” in its title or author.</> : <>No PDFs in your notes yet.</>}</p>
            )}
          </div>
        </div>
        <BackToTop target={scroller} />
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
      <span className="pdf-book-cover" data-pdf-peek={one.src} data-pdf-peek-name={one.name} data-pdf-peek-scrub="">
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
 * The picked book, as Finder's preview pane and iPad Books' book page have
 * it: docked at the page's right edge, its head held still (the cover large,
 * the title and author, a quiet way back in at your page and the book's
 * length with where your notes attach) and only what is under it scrolling:
 * the notes that link into it, their small map and the book's Information,
 * each heading held at the top while its rows pass under it.
 */
function Inspector({ one, onOpen }: { one: Book; onOpen: () => void }): React.JSX.Element {
  const cover = usePdfCover(one.src, one.name)
  const cited = useCited(one.src, one.highlights)
  const [marks, setMarks] = useState<{ page: number; color?: string | null }[]>([])
  const [box, setBox] = useState<HTMLElement | null>(null)
  useEffect(() => {
    let live = true
    void call<{ page: number; color?: string | null }[]>("pdf:highlights", one.src).then((rows) => live && setMarks(rows))
    return () => void (live = false)
  }, [one.src, one.highlights])
  const linked = inNotes(cited).length
  return (
    <aside className="book-panel pdf-inspector" aria-label="About this book" data-inspector>
      <div className="book-panel-head">
        <BookHead cover={cover} title={titleOf(one)} author={one.author} pages={one.pages} bytes={one.bytes} />
        <button type="button" className="pdf-inspector-open" onClick={onOpen}>
          {one.page && one.page > 1 ? `Continue at p. ${one.page}` : "Start reading"}
        </button>
        {one.pages ? <PageBar src={one.src} name={one.name} pages={one.pages} page={one.page} cited={cited} marks={marks} /> : null}
      </div>
      <div ref={setBox} className="book-panel-body" data-panel-scroll>
        <section className="read-details-section">
          <div className="read-details-heading">
            <h3>
              In your notes <span className="read-details-count">{linked.toLocaleString()}</span>
            </h3>
          </div>
          <InYourNotes cited={cited} empty="No note links here yet. Link a page from the reader with “Copy link to this page” and paste it in any note." />
          <BookMap src={one.src} title={titleOf(one)} cited={cited} />
        </section>
        <BookInfo one={one} linked={linked} />
      </div>
      <BackToTop target={box} />
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
  const going = useGoing(all)
  if (!going.length && !extra.length) return null
  return (
    <section className="flex flex-col gap-3 px-5 @[44rem]/page:px-8" data-continue-reading>
      {heading(going.length + extra.length)}
      {going.length > 0 && <ReadingRow going={going} />}
      {extra.length > 0 && <div className="continue-reading">{extra}</div>}
    </section>
  )
}

/** The books part way through, last read first. */
const useGoing = (all: Book[]): Book[] =>
  useMemo(() => all.filter((one) => one.readAt && one.page && one.pages && one.page < one.pages).sort((a, b) => b.readAt!.localeCompare(a.readAt!)), [all])

/** A book's cover as a page is shaped, before it is drawn. */
const COVER_SHAPE = 0.72

/**
 * The books part way through as a row of covers flowing through glass (Flex
 * Carousel), each with its title and "p. 134 of 336"; a click opens the book
 * at that page. Covers are drawn only as they near the view.
 */
export function ReadingRow({ going }: { going: Book[] }): React.JSX.Element {
  const items = useMemo(
    () => going.map((one) => ({ src: () => pdfCover(one.src, one.name).then((cover) => cover?.image), title: titleOf(one), note: `p. ${one.page!.toLocaleString()} of ${one.pages!.toLocaleString()}`, aspect: COVER_SHAPE })),
    [going]
  )
  return (
    <div data-reading-row className="-mx-2">
      <PictureRow key={going.map((one) => `${one.src}:${one.page}`).join()} items={items} height={300} cardHeight={0.62} direct label="Continue reading"
        onOpen={(at) => {
          const one = going[at]
          if (!one) return
          chime("open")
          openPdf(one.src, one.name, one.page ?? undefined)
        }}
      />
    </div>
  )
}
