import { useEffect, useMemo, useRef, useState } from "react"
import { labelFor } from "./pdf-labels"
import { ProgressBar } from "@/components/haligtree/progress-bar"
import { BookOpen } from "lucide-react"
import { call, useLive } from "@/lib/haligtree"
import { chime } from "@/lib/sound"
import { openPdf } from "./pdf-reader"
import { coverOnPaper, pdfCover, usePdfCover } from "./pdf-cover"
import { scrubbedPage } from "./pdf-peek"
import { PictureRow } from "@/components/haligtree/picture-row"
import { BookMap, InYourNotes, PageBar, inNotes, useCitedRead } from "./book-links"
import { BookHead, BookInfo, readLibrary, type Book } from "./book-head"
import { BackToTop, Grows, MoreBelow } from "@/components/haligtree/ui"
import { RowMenu, type RowItem } from "@/components/haligtree/row-menu"
import { canSplit, useHere } from "@/lib/split"
import { binFiles } from "@/lib/media-files"
import { useSelectAll } from "@/lib/select-all"
import { usePicking } from "@/lib/pick-range"
import { menuOpen } from "@/lib/menu-keys"
import { typing } from "@/components/haligtree/ui"
import type { Media } from "../../../../main/media"
import { num, plural } from "../../../../main/dates"
import { quoted } from '../../../../main/clip'
import { cleanTitle } from '@/lib/clean-title'
import { heroOpen } from "@/lib/hero"
export type { Book } from "./book-head"

/** A file's name as a person would say it (clean-title.ts). */
export const cleanName = (name: string): string => cleanTitle(name) || "PDF"

/** What a book is called on its card: the title it carries, else its file name made readable. */
export const titleOf = (one: Book): string => (one.title === one.name.replace(/\.pdf$/i, "") ? cleanName(one.name) : one.title)
const percent = (one: Book): number | null => (one.page && one.pages ? Math.round((one.page / one.pages) * 100) : null)

/**
 * Every PDF you have kept, as a shelf of real covers: each its first page,
 * its title and author, how far you have read and how many highlights it
 * holds. One click opens it where you left off (page 1 if never opened; the
 * page on show while its cover is scrubbed). The panel at the right says all
 * about the book the pointer rests on (REST), or the one the arrows move to;
 * it starts on the last book read. ⌘-click or ⇧-click picks without opening.
 */
/** How long the pointer rests on a book before the panel shows it: a sweep across the shelf changes nothing. */
export const REST = 150
/** Books few enough that the shelf shows them all at a glance. */
const FEW = 4

export function PdfLibrary({ query, top, files, onPut, keys, only }: { /** Off while something over the page has the keys. */ keys: boolean; query: string; /** Only these books ("Unlinked"), when given. */ only?: string[]; /** What sits over the shelf (the kinds), scrolling with it. */ top: React.ReactNode; /** Media's own record of each file, for what notes hold it. */ files: Media[]; /** "Put in a note…", for these books. */ onPut: (srcs: string[]) => void }): React.JSX.Element {
  const all = useLive(readLibrary, [] as Book[])
  const books = useMemo(() => {
    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
    return [...all]
      .sort((a, b) => (b.readAt ?? b.addedAt).localeCompare(a.readAt ?? a.addedAt))
      .filter((one) => (!only || only.includes(one.src)) && words.every((word) => `${titleOf(one)} ${one.author} ${one.name}`.toLowerCase().includes(word)))
  }, [all, query, only?.join('\n')]) // eslint-disable-line react-hooks/exhaustive-deps
  const going = useGoing(all)
  // The book in the panel: the one rested on or moved to, else the last read, else the first. Worked out as the shelf is
  // drawn, so the panel is there in the shelf's first frame: set a frame later, it narrowed the shelf under you and
  // "Continue reading" re-centred.
  const [clicked, setChosen] = useState<string | null>(null)
  const lastRead = useMemo(() => books.reduce<Book | null>((best, one) => (one.readAt && (!best?.readAt || one.readAt > best.readAt) ? one : best), null), [books])
  const chosen = clicked && books.some((one) => one.src === clicked) ? clicked : lastRead?.src ?? books[0]?.src ?? null
  // Rested on for REST: the panel moves to it. One timer for the shelf, so a sweep only ever restarts it.
  const resting = useRef(0)
  useEffect(() => () => clearTimeout(resting.current), [])
  const restOn = (src: string): void => (clearTimeout(resting.current), void (resting.current = window.setTimeout(() => setChosen(src), REST)))
  const restOff = (): void => clearTimeout(resting.current)
  const book = books.find((one) => one.src === chosen) ?? null
  // Picking on the shelf, as on every list: ⌘-click and ⇧-click add, ⌘A takes them all, ⌫ bins (the book in the panel, with nothing picked), Esc lets go.
  const here = useHere()
  const order = useMemo(() => books.map((one) => one.src), [books])
  const [pickedAll, setPicked] = useState<string[]>([])
  const picked = useMemo(() => pickedAll.filter((src) => order.includes(src)), [pickedAll, order])
  const toBin = (srcs: string[]): void => void binFiles(srcs, () => setPicked([]))
  const picking = usePicking(order, picked, setPicked)
  useSelectAll(() => order, picked, setPicked, { enabled: keys, here, onDelete: toBin, current: () => chosen, titleOf: (src) => books.find((one) => one.src === src)?.title })
  const now = useRef(picked.length)
  now.current = picked.length
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== "Escape" || !now.current || !here() || typing() || menuOpen() || event.defaultPrevented) return
      event.preventDefault()
      event.stopPropagation()
      chime("off")
      setPicked([])
    }
    window.addEventListener("keydown", onKey, true)
    return () => window.removeEventListener("keydown", onKey, true)
  }, [here])
  const free = (src: string): boolean => !files.find((one) => one.src === src)?.uses.length
  const menuOf = (one: Book): RowItem[] => {
    if (picked.includes(one.src) && picked.length > 1) {
      const going = picked.filter(free).length
      return [
        { label: `Put ${num(picked.length)} in a note…`, run: () => onPut(picked) },
        "separator",
        going > 0 && { label: `Move ${num(going)} to the Bin`, keys: "⌫", danger: true, run: () => toBin(picked) },
        "separator",
        { label: "Clear the selection", about: "list", keys: "esc", run: () => setPicked([]) }
      ]
    }
    return [...bookMenu(one), { label: "Put in a note…", run: () => onPut([one.src]) }, "separator", free(one.src) && { label: "Move to the Bin", keys: "⌫", danger: true, run: () => toBin([one.src]) }]
  }
  // At its ribbon, else where you left off, else the first (the reader decides); a click on a scrubbed cover gives its page.
  const open = (one: Book, page?: number | null): void => {
    chime("open")
    openPdf(one.src, one.name, page ?? undefined)
  }
  // The arrows move the panel's book across the shelf, a line at a time up and down; Enter opens it.
  const order2 = useRef({ books, chosen, open })
  order2.current = { books, chosen, open }
  const shelf = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!keys) return
    const onKey = (event: KeyboardEvent): void => {
      if (!here() || typing() || menuOpen() || event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return
      const { books: list, chosen: now, open: openIt } = order2.current
      const at = list.findIndex((one) => one.src === now)
      if (event.key === "Enter") {
        // A focused control (a book's own button, "Continue") does its own Enter.
        if ((document.activeElement as HTMLElement | null)?.closest("button, a, input, textarea, [contenteditable='true']") || at < 0) return
        event.preventDefault()
        return void heroOpen(shelf.current?.querySelector(`[data-book="${CSS.escape(list[at].src)}"]`) ?? null, () => openIt(list[at]))
      }
      const across = shelf.current ? getComputedStyle(shelf.current).gridTemplateColumns.split(" ").length : 1
      const by = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -across, ArrowDown: across }[event.key]
      if (!by || event.shiftKey) return
      event.preventDefault()
      const next = list[Math.min(list.length - 1, Math.max(0, (at < 0 ? 0 : at + by)))]
      if (!next || next.src === now) return
      chime("tap")
      setChosen(next.src)
      shelf.current?.querySelector<HTMLElement>(`[data-book="${CSS.escape(next.src)}"]`)?.scrollIntoView({ block: "nearest" })
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [keys, here])
  const [scroller, setScroller] = useState<HTMLDivElement | null>(null)
  // The shelf scrolls on its own at the left; the picked book's panel is docked at the page's right edge, full height, as the reader's is.
  return (
    // The room is what the narrow rule measures: a container can't query its own width, so the shelf and the
    // panel stayed side by side at any width and the page scrolled sideways.
    <div className="pdf-library-room">
    <div className="pdf-library" data-library>
      <div className="pdf-library-side">
        <div ref={setScroller} className="pdf-library-scroll" data-shelf-scroll>
          <div className="pdf-library-column">
            {top}
            {/* With a handful of books every one is in sight on the shelf just under: the row would only show them twice. */}
            {!query.trim() && going.length > 0 && books.length > FEW && (
              <section className="mb-4 flex flex-col gap-2" data-shelf-continue>
                <h3 className="text-body font-medium text-foreground">Continue reading</h3>
                <ReadingRow going={going} />
              </section>
            )}
            {books.length ? (
              <div ref={shelf} className={`pdf-library-shelf${books.length <= 3 ? " is-few" : ""}`} role="group" aria-label="Your books" onPointerLeave={restOff}>
                {books.map((one) => (
                  <BookCard key={one.src} one={one} lit={one.src === chosen} picked={picked.includes(one.src)} menu={menuOf(one)} onRest={() => restOn(one.src)} onLeave={restOff}
                    onPick={(event) => {
                      // ⌘ or ⇧: picked, not opened, and the panel shows it; a plain click opens it.
                      if (picking.click(event, one.src)) return void (restOff(), setChosen(one.src))
                      restOff()
                      // The scrubbed page read as the click lands: the book growing out of its cover ends the scrub.
                      const page = scrubbedPage(one.src)
                      heroOpen(event, () => open(one, page))
                    }} />
                ))}
              </div>
            ) : (
              <p className="my-4 text-control text-muted-foreground">{query.trim() ? <>No book has {quoted(query.trim(), 80)} in its title or author.</> : only ? <>{all.length === 1 ? "The one book here is in a note." : `All ${num(all.length)} books are in a note.`}</> : <>No books here yet. Every PDF you keep sits on this shelf: drop one on this page, or press “Add”.</>}</p>
            )}
          </div>
        </div>
        <BackToTop target={scroller} />
      </div>
      {/* A quick crossfade as the panel's book changes: keyed by the book, it comes in fresh. */}
      {book && <Inspector key={book.src} one={book} onOpen={() => heroOpen(document.querySelector(`[data-book="${CSS.escape(book.src)}"]`), () => open(book))} />}
    </div>
    </div>
  )
}

/** A book's right-click menu, on the shelf and in Continue reading. */
export function bookMenu(one: Book): RowItem[] {
  return [
    { label: one.ribbon ? `Continue at your ribbon, p. ${labelFor(one.src, one.ribbon)}` : one.page ? `Continue at p. ${labelFor(one.src, one.page)}` : "Open", keys: "↵", run: () => (chime("open"), openPdf(one.src, one.name)) },
    canSplit() && { label: "Open to the side", run: () => (chime("open"), openPdf(one.src, one.name, undefined, undefined, true)) }
  ]
}

function BookCard({ one, lit, picked, menu, onPick, onRest, onLeave }: { one: Book; lit: boolean; picked: boolean; menu: RowItem[]; onPick: (event: React.MouseEvent) => void; onRest: () => void; onLeave: () => void }): React.JSX.Element {
  const cover = usePdfCover(one.src, one.name)
  const read = percent(one)
  return (
    <RowMenu items={menu}>
    <button type="button" aria-pressed={lit} data-book={one.src} data-id={one.src} data-picked={picked || undefined} className={`pdf-book${lit ? " is-picked" : ""}${picked ? " is-chosen" : ""}`} onClick={onPick} onPointerEnter={(event) => event.pointerType === "mouse" && onRest()} onPointerLeave={onLeave}>
      <span className="pdf-book-cover" data-pdf-peek={one.src} data-pdf-peek-name={one.name} data-pdf-peek-scrub="">
        {cover?.image ? <img src={cover.image} alt="" draggable={false} /> : <span className="pdf-book-blank"><BookOpen className="size-6" /></span>}
        {read !== null && (
          <ProgressBar edge square value={read / 100} label={`Read ${read}%`} thick={3} silent fill="var(--tt-brand-color-500)" className="pdf-book-progress" />
        )}
      </span>
      <span className="pdf-book-title">{titleOf(one)}</span>
      <span className="pdf-book-meta">
        {one.author || (read !== null ? `${read}% read` : "Not started")}
        {one.highlights > 0 && <span className="pdf-book-marks"> · {plural(one.highlights, "highlight")}</span>}
      </span>
    </button>
    </RowMenu>
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
  const read = useCitedRead(one.src, one.highlights)
  const cited = read ?? []
  const [marks, setMarks] = useState<{ page: number; color?: string | null }[]>([])
  const [box, setBox] = useState<HTMLElement | null>(null)
  useEffect(() => {
    let live = true
    void call<{ page: number; color?: string | null }[]>("pdf:highlights", one.src).then((rows) => live && setMarks(rows))
    return () => void (live = false)
  }, [one.src, one.highlights])
  const linked = inNotes(cited).length
  return (
    <aside className="book-panel pdf-inspector animate-in fade-in-0 duration-150 motion-reduce:animate-none" aria-label="About this book" data-inspector data-inspector-book={one.src}>
      <div className="book-panel-head">
        <BookHead cover={cover} title={titleOf(one)} author={one.author} pages={one.pages} bytes={one.bytes} />
        <button type="button" className="pdf-inspector-open" onClick={onOpen}>
          {one.page && one.page > 1 ? `Continue at p. ${labelFor(one.src, one.page)}` : "Start reading"}
        </button>
        {one.pages ? <PageBar src={one.src} name={one.name} pages={one.pages} page={one.page} cited={cited} marks={marks} /> : null}
      </div>
      <div ref={setBox} className="book-panel-body" data-panel-scroll>
        {/* Each part as Display draws its sections: its title row on the panel, the island under it holding only the rows. */}
        <section className="read-details-section" data-in-notes>
          <div className="read-details-heading">
            <h3>
              In your notes {read && <span className="read-details-count animate-in fade-in-0 duration-200 motion-reduce:animate-none">{linked.toLocaleString()}</span>}
            </h3>
          </div>
          <Grows className="read-details-island mf-island">
            <InYourNotes src={one.src} cited={read} empty="No note links here yet. Link a page from the reader with “Copy link to this page” and paste it in any note." />
            <BookMap src={one.src} title={titleOf(one)} cited={cited} />
          </Grows>
        </section>
        <BookInfo one={one} linked={linked} />
      </div>
      <BackToTop target={box} />
      <MoreBelow target={box} />
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
    () => going.map((one) => ({ id: one.src, pdf: { src: one.src, name: one.name }, src: () => pdfCover(one.src, one.name).then((cover) => cover && coverOnPaper(cover.image)), title: titleOf(one), note: `p. ${labelFor(one.src, one.page!)} of ${labelFor(one.src, one.pages!)}${one.finishBy ? `\nDone by ${new Date(`${one.finishBy}T12:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}` : ""}`, aspect: COVER_SHAPE })),
    [going]
  )
  return (
    <div data-reading-row className="-mx-2 has-[[data-picture-row=still]]:mx-0">
      <PictureRow items={items} height={250} cardHeight={0.72} direct label="Continue reading" menuFor={(at) => bookMenu(going[at])}
        onOpen={(at, from) => {
          const one = going[at]
          if (!one) return
          chime("open")
          heroOpen(from, () => openPdf(one.src, one.name))
        }}
      />
    </div>
  )
}
