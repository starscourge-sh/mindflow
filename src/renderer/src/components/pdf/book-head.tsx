import { useState } from "react"
import { labelFor } from "./pdf-labels"
import { call } from "@/lib/haligtree"
import type { PdfCover } from "./pdf-cover"
import { Grows } from "@/components/haligtree/ui"
import { plural } from '../../../../main/dates'

/** What the library knows of a book: the reader's Details and the shelf's panel both show it. */
export type Book = { src: string; name: string; title: string; author: string; pages: number | null; page: number | null; readAt: string | null; addedAt: string; highlights: number; gems: number; bytes: number | null; /** At your pace, the day you finish it (main/pace.ts); null until two days of reading say. */ finishBy?: string | null }

/** "At your pace, done by 21 Nov": said where a book's progress is. */
export const paceLine = (book: Pick<Book, "finishBy">): string => (book.finishBy ? `done by ${new Date(`${book.finishBy}T12:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short" })} at your pace` : "")

/** Every PDF kept, once each, with what its card and panel say. */
export const readLibrary = (): Promise<Book[]> => call<Book[]>("pdf:library")

/** A file's size as Finder says it: "42.1 MB". */
export const sizeOf = (bytes: number): string =>
  bytes < 1000 ? `${bytes} bytes` : bytes < 1e6 ? `${(bytes / 1e3).toFixed(0)} KB` : bytes < 1e9 ? `${(bytes / 1e6).toFixed(1)} MB` : `${(bytes / 1e9).toFixed(2)} GB`

const day = (iso: string | null): string => (iso ? new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "Not yet")

/**
 * The top of a book's panel, as Finder's preview pane has it: the cover at
 * the panel's width in its own shape, the title and author under it, then a
 * quiet line saying what it is. The cover's room is held from the first
 * frame (its height is fixed, its width follows its shape), so nothing under
 * it moves as it draws; a book with no cover gets a plain one in the theme's
 * own tone, its title on it, never a broken picture.
 */
export function BookHead({ cover, title, author, pages, bytes }: { cover: PdfCover | null | undefined; title: string; author?: string; pages?: number | null; bytes?: number | null }): React.JSX.Element {
  const what = ["PDF", pages ? plural(pages, "page") : null, bytes ? sizeOf(bytes) : null].filter(Boolean).join(" · ")
  return (
    <div className="book-head" data-book-head>
      <span className="book-head-cover" style={{ aspectRatio: cover?.aspect ?? 3 / 4 }} data-cover={cover?.image ? "image" : cover === null ? "drawn" : "waiting"}>
        {cover?.image ? <img src={cover.image} alt="" draggable={false} /> : cover === null ? <span className="book-head-drawn">{title}</span> : null}
      </span>
      <span className="book-head-title" title={title}>{title}</span>
      {/* No author in the file: no empty line held for one. */}
      {author ? <span className="book-head-author">{author}</span> : null}
      <span className="book-head-what">{what}</span>
    </div>
  )
}

/**
 * "Information", as Finder's pane has it: when it came, when it was last
 * opened and where, what you kept from it; "Show more" for the rest.
 */
export function BookInfo({ one, linked }: { one: Book; linked: number }): React.JSX.Element {
  const [more, setMore] = useState(false)
  const rows: [string, string][] = [
    ["Added", day(one.addedAt)],
    ["Last opened", day(one.readAt)],
    ["Last page read", one.page ? `p. ${labelFor(one.src, one.page)}${one.pages ? ` of ${labelFor(one.src, one.pages)}` : ""}` : "Not yet"],
    ...(one.finishBy ? [["Your pace", paceLine(one).replace(/^done/, "Done")] as [string, string]] : []),
    ["Highlights", one.highlights ? one.highlights.toLocaleString() : "None"],
    ["Gems from it", one.gems ? one.gems.toLocaleString() : "None"],
  ]
  const rest: [string, string][] = [
    ["Pages", one.pages ? one.pages.toLocaleString() : "Not counted yet"],
    ["In your notes", linked ? linked.toLocaleString() : "None"],
    ["Size", one.bytes ? sizeOf(one.bytes) : "Not found"],
  ]
  return (
    <section className="read-details-section" data-book-info>
      <div className="read-details-heading">
        <h3>Information</h3>
        <button type="button" className="read-details-action" aria-expanded={more} onClick={() => setMore(!more)}>
          {more ? "Show less" : "Show more"}
        </button>
      </div>
      {/* "Show more" grows the island to the rows it adds (Grows), and they fade in; nothing under it jumps. */}
      <Grows className="read-details-island mf-island">
        <dl className="pdf-inspector-rows">
          {[...rows, ...(more ? rest : [])].map(([label, value]) => (
            <div key={label} className={`pdf-inspector-row${rest.some((one) => one[0] === label) ? " animate-in fade-in-0 duration-200 motion-reduce:animate-none" : ""}`}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
          {more && (
            <div className="pdf-inspector-row is-file animate-in fade-in-0 duration-200 motion-reduce:animate-none">
              <dt>File</dt>
              <dd title={one.name}>{one.name}</dd>
            </div>
          )}
        </dl>
      </Grows>
    </section>
  )
}
