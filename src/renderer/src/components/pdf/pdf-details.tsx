import { useEffect, useMemo, useState } from "react"
import { Search } from "lucide-react"
import { call } from "@/lib/haligtree"
import { BackToTop } from "@/components/haligtree/ui"
import { MARK_COLORS, markCss } from "./read-bar"
import type { PdfMark } from "./pdf-pages"

type Cited = { type: string; id: string; title: string; at: string }

/**
 * Beside a PDF or an article, as a note's Details sit beside it: what it is
 * (its cover, title, author, pages and how far you have read), every
 * highlight in it (found by its words, shown by colour, each a way back to
 * its place), and every note and gem that holds it or links into it.
 */
export function ReadDetails({ src, cover, title, author, pages, page, marks, lit, onMark, onGather }: {
  src: string
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
}): React.JSX.Element {
  const [cited, setCited] = useState<Cited[]>([])
  useEffect(() => {
    let live = true
    void call<Cited[]>("pdf:cited", src).then((rows) => live && setCited(rows))
    return () => void (live = false)
  }, [src, marks.length])
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
  const read = pages && page ? Math.round((page / pages) * 100) : null
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
      {read !== null && (
        <div className="read-details-progress" aria-label={`Read ${read}%`}>
          <div className="read-details-progress-row">
            <span>Page {page} of {pages}</span>
            <span>{read}%</span>
          </div>
          <div className="read-details-progress-track">
            <div className="read-details-progress-fill" style={{ width: `${read}%` }} />
          </div>
        </div>
      )}

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
          In your notes <span className="read-details-count">{cited.length}</span>
        </h3>
        {cited.length ? (
          cited.map((one) => (
            <button key={`${one.type}:${one.id}`} type="button" className="read-details-cited" onClick={() => window.dispatchEvent(new CustomEvent("haligtree:open", { detail: { type: one.type, id: one.id } }))}>
              <span className="read-details-cited-kind">{one.type === "capture" ? "Note" : "Gem"}</span>
              <span className="read-details-cited-title">{one.title || "Untitled"}</span>
            </button>
          ))
        ) : (
          <p className="read-details-empty">No note holds it or links into it yet.</p>
        )}
      </section>
    </aside>
    <BackToTop target={box} />
    </div>
  )
}
