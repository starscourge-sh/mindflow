import { useEffect, useMemo, useRef, useState } from "react"
import { usePageLabel } from "./pdf-labels"
import type { PDFDocumentProxy } from "pdfjs-dist"
import { X } from "lucide-react"
import { chime } from "@/lib/sound"
import { Orb } from "@/components/haligtree/orb"
import { Button } from "@/components/ui/button"
import { DraftFoot, DraftList, type CardDraft } from "@/components/haligtree/card-drafts"
import { chapterRange, chapterText, cardsFrom, type MadeCard } from "@/lib/study-ai"
import type { OutlineRow } from "./pdf-rail"
import { plural } from "../../../../main/dates"
import { quoted } from '../../../../main/clip'

type Card = MadeCard & CardDraft

/**
 * Five cards from the chapter you are in, by Apple Intelligence on this Mac:
 * read from your own highlights and the chapter's headings first, then the
 * pages across. Each is shown to keep, change or drop; none is made until you
 * keep it, and each keeps its page, so Review's "From" line opens it there.
 */
export function ChapterCards({ doc, title, outline, page, marks, onKeep, onGo, onClose }: {
  doc: PDFDocumentProxy
  title: string
  outline: OutlineRow[]
  page: number
  /** Your highlights and passages marked for a card, with their pages. */
  marks: { page: number; quote: string }[]
  onKeep: (question: string, answer: string, page: number) => Promise<void>
  onGo: (page: number) => void
  onClose: () => void
}): React.JSX.Element {
  const label = usePageLabel()
  const pages = doc.numPages
  // The section being read now, and the one the cards are from: they part when you read on with the panel open, and
  // the panel offers the new one rather than reading it unasked (17 Nov: open since the contents page, it still read
  // "Table of Contents" on page 52).
  const here = useMemo(() => chapterRange(outline, page, pages, [page, Math.min(pages, page + 1)]), [outline, page, pages])
  const [range, setRange] = useState(here)
  const moved = here.from !== range.from || here.to !== range.to
  const nameOf = (one: typeof range): string => (one.title ? `${quoted(one.title, 80)}` : one.from === one.to ? `page ${label(one.from)}` : `pages ${label(one.from)} and ${label(one.to)}`)
  const named = nameOf(range)
  const span = range.to - range.from + 1
  const [cards, setCards] = useState<Card[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tries, setTries] = useState(0)
  const asked = useRef(0)

  useEffect(() => {
    const ask = ++asked.current
    setCards(null)
    setError(null)
    void (async () => {
      // The chapter's own words, a page at a time; past 120 pages, every few, across it.
      const step = Math.max(1, Math.ceil((range.to - range.from + 1) / 120))
      const texts: { page: number; text: string }[] = []
      for (let n = range.from; n <= range.to; n += step) {
        const content = await (await doc.getPage(n)).getTextContent()
        // Each line of the page on its own line, as pdf.js marks them, so a heading stays apart from its first sentence.
        texts.push({ page: n, text: content.items.map((item) => ("str" in item ? item.str + (item.hasEOL ? "\n" : " ") : "")).join("") })
        if (asked.current !== ask) return
      }
      const highlights = marks.filter((one) => one.page >= range.from && one.page <= range.to && one.quote.trim()).map((one) => ({ page: one.page, text: one.quote }))
      const text = chapterText({ pages: texts, highlights, headings: range.headings })
      if (!text.trim()) return setError(span === 1 ? "This page has no words to read: a scanned book needs its text read first, in Details." : "These pages have no words to read: a scanned book needs its text read first, in Details.")
      const got = await cardsFrom(range.title ? `${title}: ${range.title}` : title, text, 5)
      if (asked.current !== ask) return
      // The real reason, from main (understand.ts): what the model answered when it held no card, never a guess.
      if ("error" in got) return setError(got.error)
      chime("open")
      setCards(got.cards.map((one) => ({ ...one, page: one.page >= range.from && one.page <= range.to ? one.page : range.from, state: "open" })))
    })()
  }, [tries, range])

  const stop = (): void => {
    asked.current++
    chime("fold")
    onClose()
  }
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== "Escape") return
      event.preventDefault()
      event.stopPropagation()
      stop()
    }
    window.addEventListener("keydown", onKey, true)
    return () => window.removeEventListener("keydown", onKey, true)
  })

  const set = (n: number, patch: Partial<Card>): void => setCards((all) => all && all.map((one, at) => (at === n ? { ...one, ...patch } : one)))
  const keep = async (n: number): Promise<void> => {
    const one = cards?.[n]
    if (!one || one.state !== "open" || !one.question.trim() || !one.answer.trim()) return
    set(n, { state: "kept" })
    await onKeep(one.question.trim(), one.answer.trim(), one.page)
  }
  return (
    // Docked where Details opens, pushing the page aside, so the page a card comes from stays in sight beside it.
    <div className="read-details-frame">
    <aside className="book-panel chapter-cards" aria-label={`Cards from ${named}`} data-chapter-cards={cards ? cards.length : "reading"}>
      <div className="book-panel-head chapter-cards-top">
      <div className="chapter-cards-head">
        <h3 className="chapter-cards-title">{cards ? `${cards.length === 5 ? "Five cards" : plural(cards.length, "card")} from ${named}` : `Cards from ${named}`}</h3>
        <button type="button" aria-label="Close" className="chapter-cards-close" onClick={stop}><X className="size-4" /></button>
      </div>
      <p className="chapter-cards-note">
        {range.from === range.to ? `Page ${label(range.from)}` : `Pages ${label(range.from)} to ${label(range.to)}`}, read on this Mac by Apple Intelligence, your highlights and the headings first. <strong>Nothing is made until you keep it.</strong>
      </p>
      </div>
      <div className="book-panel-body chapter-cards-body" data-panel-scroll>
      {!cards && !error && (
        // The heading names the section already: the wait says only how much, so it fits the panel at any title.
        <p className="chapter-cards-wait"><Orb label={span === 1 ? "Reading this page…" : `Reading these ${span} pages…`} stop={stop} /></p>
      )}
      {/* Read on into another section: the cards here stay, and the one you are in is a press away. */}
      {moved && (
        <div className="chapter-cards-moved" data-chapter-cards-moved>
          <p>You are in {nameOf(here)} now.</p>
          <Button variant="outline" size="sm" onClick={() => (chime("tap"), setRange(here))}>Cards from here</Button>
        </div>
      )}
      {error && (
        // A notice, not small orange words: its own lead line, the reason in the page's ink, then the way on.
        <div className="chapter-cards-error" data-chapter-cards-error role="status">
          <p className="chapter-cards-error-lead">No cards this time</p>
          <p>{error}</p>
          {!moved && <Button variant="outline" size="sm" onClick={() => (chime("tap"), setTries((n) => n + 1))}>Try again</Button>}
        </div>
      )}
      {cards && (
        <DraftList cards={cards} onSet={set} onKeep={(n) => void keep(n)}
          link={(one) => ({ label: `p. ${label(one.page)}`, mark: { "data-chapter-card-page": one.page }, run: () => onGo(one.page) })} />
      )}
      </div>
      {cards && <DraftFoot cards={cards} onKeepAll={() => void (async () => { for (let n = 0; n < cards.length; n++) await keep(n) })()} onDone={stop} />}
    </aside>
    </div>
  )
}
