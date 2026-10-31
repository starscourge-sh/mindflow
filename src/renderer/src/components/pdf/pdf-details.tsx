import { useMemo, useState } from "react"
import { Search } from "lucide-react"
import { BackToTop } from "@/components/haligtree/ui"
import { MARK_COLORS, markCss } from "./read-bar"
import type { PdfMark } from "./pdf-pages"
import { InYourNotes, PageBar, inNotes, useCited } from "./book-links"

/**
 * Beside a PDF or an article, as a note's Details sit beside it: what it is
 * (its cover, title, author, pages and how far you have read), every
 * highlight in it (found by its words, shown by colour, each a way back to
 * its place), and every note and gem that holds it or links into it.
 */
export function ReadDetails({ src, name, cover, title, author, pages, page, marks, lit, onMark, onGather, onPage }: {
  src: string
  /** The name it arrived under, for a page bar's tick to open it by. */
  name: string
  cover?: string | null
  title: string
  author?: string
  /** Its page count, and the page you are on: a PDF's; an article has neither. */
  pages?: number
  page?: number
  marks: PdfMark[]
  lit: string | null
  onMark: (mark: PdfMark) => void
  onGather: () => void
  /** A page bar tick pressed: go to its page. */
  onPage: (page: number) => void
}): React.JSX.Element {
  const cited = useCited(src, marks.length)
  const [words, setWords] = useState("")
  const [box, setBox] = useState<HTMLElement | null>(null)
  const [colour, setColour] = useState<string | null | undefined>(undefined)
  const shown = useMemo(() => {
    const look = words.trim().toLowerCase()
    return [...marks]
      .sort((a, b) => a.page - b.page || a.start - b.start)
      .filter((one) => (colour === undefined || (one.color ?? null) === colour) && (!look || one.quote.toLowerCase().includes(look)))
  }, [marks, words, colour])
  const used = MARK_COLORS.filter((one) => marks.some((mark) => (mark.color ?? null) === one.id))
  return (
    // A frame that does not scroll, for the way back up to sit on; the panel scrolls inside it, its edges fading where there is more.
    <div className="read-details-frame">
    <aside ref={setBox} className="read-details mf-more" aria-label="Details">
      <div className="read-details-head">
        {cover && <img src={cover} alt="" draggable={false} className="read-details-cover" />}
        <div className="read-details-what">
          <span className="read-details-title">{title}</span>
          {author && <span className="read-details-author">{author}</span>}
        </div>
      </div>
      {pages ? <PageBar src={src} name={name} pages={pages} page={page} cited={cited} marks={marks} onPage={onPage} /> : null}

      <section className="read-details-section">
        <h3 className="read-details-heading">
          Highlights <span className="read-details-count">{marks.length}</span>
        </h3>
        {marks.length ? (
          <>
            <label className="read-details-find">
              <Search aria-hidden className="size-3.5 shrink-0" />
              <input type="text" placeholder="Find in highlights" aria-label="Find in highlights" value={words} onChange={(event) => setWords(event.target.value)} onKeyDown={(event) => event.key === "Escape" && setWords("")} />
            </label>
            {used.length > 1 && (
              <div className="read-details-colours" role="group" aria-label="Show one colour">
                {used.map((one) => (
                  <button key={one.label} type="button" aria-label={one.label} aria-pressed={colour === one.id} className="read-details-colour" onClick={() => setColour(colour === one.id ? undefined : one.id)}>
                    <span aria-hidden className="pdf-swatch" style={{ background: one.css }} />
                  </button>
                ))}
              </div>
            )}
            <div className="read-details-marks">
              {shown.map((one) => (
                <button key={one.id} type="button" className={`read-details-mark${one.id === lit ? " is-here" : ""}`} style={{ "--mark": markCss(one.color) } as React.CSSProperties} onClick={() => onMark(one)}>
                  <span className="read-details-mark-words">{one.quote}</span>
                  {pages ? <span className="read-details-mark-page">p. {one.page}</span> : null}
                </button>
              ))}
              {!shown.length && <p className="read-details-empty">No highlight says that.</p>}
            </div>
            <button type="button" className="read-details-action" onClick={onGather}>
              Gather into a note
            </button>
          </>
        ) : (
          <p className="read-details-empty">Pick words and press H to highlight them. Every highlight gathers here.</p>
        )}
      </section>

      <section className="read-details-section">
        <h3 className="read-details-heading">
          In your notes <span className="read-details-count">{inNotes(cited).length}</span>
        </h3>
        <InYourNotes cited={cited} empty="No note holds it or links into it yet." />
      </section>
    </aside>
    <BackToTop target={box} />
    </div>
  )
}
