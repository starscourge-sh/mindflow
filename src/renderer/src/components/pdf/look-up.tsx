import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { BookOpen, Gem } from "lucide-react"
import { openArticle } from "./pdf-reader"
import { call } from "@/lib/haligtree"
import { notes } from "@/lib/notes"
import { said } from "@/lib/host"
import { FLOAT } from "@/lib/float"
import { cn } from "@/lib/cn"
import { Orb } from "@/components/haligtree/orb"
import { canSplit, openAside } from "@/lib/split"
import type { Answer } from "../../../../main/define"
import { quoted } from '../../../../main/clip'

/** The word already in your library: its Lookup (since when), else a gem by that name. */
type Known = { type: "capture" | "nugget"; id: string; title: string; since: string } | null

/** "12 Oct", with the year when it is not this one. */
const dayOf = (at: string): string => {
  const day = new Date(at)
  return day.toLocaleDateString("en-GB", { day: "numeric", month: "short", ...(day.getFullYear() === new Date().getFullYear() ? {} : { year: "numeric" }) })
}

type Wiki = { title: string; description: string; extract: string; url: string; picture?: string | null } | { missing: true } | { offline: true } | { failed: true } | null

/** Where the words were looked up: said on the Lookup kept, with a link back to the very place. */
export type LookedUpIn = { where: string; link: string; sentence?: string; /** From a PDF: the book alone, and the page, kept apart so the book is one source. */ source?: string; page?: number; /** The note it was looked up in, when it was: the Lookup points back to it. */ origin?: string | null }

/**
 * Picked words looked up where they sit, as a reader's Look Up is: the word
 * as a headword with its meaning, then Wikipedia's summary of the article it
 * names under a hairline. One "Keep" keeps both together as a Lookup, said
 * where it was looked up; then "Why keep this?" asks one line, in place.
 */
export function LookUpCard({ words, at, from, range, onClose }: { words: string; at: { x: number; y: number }; from: LookedUpIn; /** Where the words sit on the page; else the words picked as the card opens. */ range?: Spot; onClose: () => void }): React.JSX.Element {
  const one = /^\p{L}[\p{L}'-]{1,40}$/u.test(words)
  const [meaning, setMeaning] = useState<Answer | "looking">(one ? "looking" : null)
  const [wiki, setWiki] = useState<Wiki | "looking">("looking")
  // Kept: the Lookup made, and whether its "why" is still being asked.
  const [kept, setKept] = useState<{ id: string; asking: boolean } | null>(null)
  const [why, setWhy] = useState("")
  const card = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  useLayoutEffect(() => setWidth(card.current?.offsetWidth ?? 0), [])
  useLooked(range)
  useEffect(() => {
    let live = true
    if (one) void call<Answer>("define", words).then((answer) => live && setMeaning(answer), () => live && setMeaning({ failed: true }))
    void call<Wiki>("wiki", words).then((answer) => live && setWiki(answer), () => live && setWiki({ failed: true }))
    return () => void (live = false)
  }, [words, one])
  useEffect(() => {
    // Esc puts the card away before the page under it hears the key (a note would take it as its own);
    // in "Why keep this?" it only ends the asking, as the field says.
    // Not skipped when the page saw the key first: the PDF reader takes Esc for its own selection, and the card stayed up
    // (10 Nov). A press anywhere off the card puts it away too, wherever it is drawn (the readers draw their own).
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== "Escape" || (event.target instanceof Element && event.target.closest(".look-up input, .look-up [role=menu]"))) return
      event.preventDefault()
      event.stopPropagation()
      onClose()
    }
    const away = (event: Event): void => void (!(event.target as Element | null)?.closest?.(".look-up") && onClose())
    // Scrolling the page puts it away too: the words it points at have moved (10 Nov). Its own list scrolling keeps it.
    window.addEventListener("keydown", onKey, true)
    window.addEventListener("pointerdown", away, true)
    window.addEventListener("wheel", away, { capture: true, passive: true })
    return () => (window.removeEventListener("keydown", onKey, true), window.removeEventListener("pointerdown", away, true), window.removeEventListener("wheel", away, true))
  }, [onClose])

  const found = meaning !== "looking" && meaning && "found" in meaning ? meaning.found : null
  const page = wiki !== "looking" && wiki && "extract" in wiki ? wiki : null
  // Already in your library: said under the headword, and Keep adds this place to it rather than a second Lookup.
  const [known, setKnown] = useState<Known>(null)
  const pageTitle = page?.title
  useEffect(() => {
    let live = true
    void call<Known>("word:known", [words, ...(pageTitle ? [pageTitle] : [])]).then((one) => live && setKnown(one))
    return () => void (live = false)
  }, [words, pageTitle])
  const lookup = known?.type === "capture" ? known : null

  /** Seen again somewhere new: where, and the sentence round it, added to the same Lookup (the commonplace book's moment). */
  const addPlace = async (id: string): Promise<void> => {
    const had = await window.api.captures.get(id)
    const body = (had?.body ?? { type: "doc", content: [] }) as { type: string; content?: unknown[] }
    const text = (value: string, link?: string): Record<string, unknown> => ({ type: "text", text: value, ...(link ? { marks: [{ type: "link", attrs: { href: link } }] } : {}) })
    const place = [
      { type: "paragraph", content: [text(`Met again ${dayOf(new Date().toISOString())}`), ...(from.where ? [text(" in "), text(from.where, from.link || undefined)] : [])] },
      ...(from.sentence ? [{ type: "blockquote", content: [{ type: "paragraph", content: [text(from.sentence)] }] }] : []),
    ]
    await window.api.captures.save(id, { body: { ...body, content: [...(body.content ?? []), ...place] } })
    setKept({ id, asking: true })
    said(`This place added to ${quoted(known!.title, 80)}`, true, { type: "capture", id, title: known!.title }, { cue: "saved" })
  }

  /** Kept as one Lookup: the word, its meaning and Wikipedia's summary together, where it was looked up (and the sentence round it). */
  const keep = async (): Promise<void> => {
    if (lookup) return addPlace(lookup.id)
    // Neither knows it (a question, a name): kept as asked, to answer when you find it.
    if (!found && !page) {
      const id = await window.api.captures.create({ kind: "word", body: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: words }] }] }, markdown: words, ...(from.origin ? { origin: from.origin } : {}) })
      setKept({ id, asking: true })
      return said("Kept in Lookups, asked: write the answer when you find it", true, { type: "capture", id, title: words }, { cue: "saved" })
    }
    const word = found ? words : page!.title
    const text = (value: string, link?: string): Record<string, unknown> => ({ type: "text", text: value, ...(link ? { marks: [{ type: "link", attrs: { href: link } }] } : {}) })
    const body = {
      type: "doc",
      content: [
        { type: "paragraph", content: [text(word)] },
        ...(from.sentence ? [{ type: "blockquote", content: [{ type: "paragraph", content: [text(from.sentence)] }] }] : []),
        ...(found && page ? [{ type: "paragraph", content: [text(page.extract)] }] : []),
        ...(from.where ? [{ type: "paragraph", content: [text("Looked up in "), text(from.where, from.link || undefined)] }] : []),
        ...(page ? [{ type: "paragraph", content: [text("From "), text("Wikipedia", page.url), text(", CC BY-SA")] }] : []),
      ],
    }
    // From a PDF the book is its source and the page its place, never one source per page.
    const id = await window.api.captures.create({ kind: "word", title: word, body, medium: from.source || from.where || undefined, ...(from.origin ? { origin: from.origin } : {}) })
    if (from.page) await notes.setField("captures", id, "location", String(from.page))
    await notes.setField("captures", id, "definition", found ? found.definition : page!.extract)
    if (found?.example) await notes.setField("captures", id, "example", found.example)
    setKept({ id, asking: true })
    said(`Kept in Lookups: ${quoted(word, 80)}`, true, { type: "capture", id, title: word }, { cue: "saved" })
  }
  const done = (): void => setKept((now) => now && { ...now, asking: false })

  const left = Math.max(8, at.x - width / 2)
  return (
    <div
      ref={card}
      className={cn("look-up", FLOAT)}
      role="dialog"
      aria-label={`Look up ${quoted(words, 80)}`}
      style={{ left, top: at.y + 8 }}
      onMouseDown={(event) => event.target instanceof HTMLInputElement || event.preventDefault()}
    >
      {/* The word itself, as a dictionary prints it. */}
      <h3 className="look-up-headword">{found || !page ? words : page.title}</h3>
      {known && !kept && (
        // A link to it, as rows open: click in the page, ⌥-click to the side.
        <button
          type="button"
          className="look-up-known"
          data-look-known={known.type}
          // No tip: one over the headword would hide the word it is about.
          aria-label={canSplit() ? "Open it. ⌥-click opens it to the side" : "Open it"}
          onClick={(event) => (event.altKey && canSplit() ? openAside(known.type, known.id) : window.api.openInHome(known.type, known.id), onClose())}
        >
          {known.type === "capture" ? `In your Lookups since ${dayOf(known.since)}` : "Kept as a gem"}
        </button>
      )}
      {one &&
        (meaning === "looking" ? (
          <p className="look-up-waiting"><Orb label="Opening the dictionary…" /></p>
        ) : found ? (
          <div className="look-up-dictionary" data-look="dictionary">
            {found.part && <p className="look-up-part">{found.part}</p>}
            <p className="look-up-meaning">{found.definition}</p>
            {found.example && <p className="look-up-example">{found.example}</p>}
          </div>
        ) : (
          <p className="look-up-quiet" data-look="dictionary">
            {meaning && "offline" in meaning ? "This Mac is offline, so the dictionary could not be asked." : meaning && "failed" in meaning ? "The dictionary did not answer just now." : meaning && "miss" in meaning && meaning.fix ? `Not in the dictionary. Did you mean ${quoted(meaning.fix, 80)}?` : "Not in the dictionary."}
          </p>
        ))}
      <hr className="look-up-rule" />
      {wiki === "looking" ? (
        <p className="look-up-waiting"><Orb label="Asking Wikipedia…" /></p>
      ) : page ? (
        <div className="look-up-wiki" data-look="wikipedia">
          {/* Offline, a picture that cannot load is left out, never shown broken. */}
          {page.picture && <img className="look-up-picture" src={page.picture} alt="" draggable={false} onError={(event) => (event.currentTarget.hidden = true)} />}
          <p className="look-up-title">
            {page.title}
            {page.description && <span className="look-up-description"> {page.description}</span>}
          </p>
          <p className="look-up-extract">{page.extract}</p>
        </div>
      ) : (
        <p className="look-up-quiet" data-look="wikipedia">{wiki && "offline" in wiki ? "This Mac is offline, so Wikipedia could not be asked." : wiki && "failed" in wiki ? "Wikipedia did not answer just now." : "No Wikipedia article by that name."}</p>
      )}
      <div className="look-up-foot">
        {kept?.asking ? (
          // Kept: why, in one line, as the reader asks it after "Keep" (Enter saves, Esc skips).
          <span className="look-up-kept">
            <Gem className="size-3.5" />
            Kept
            <input
              autoFocus
              className="look-up-why"
              type="text"
              aria-label="Why keep this"
              placeholder="Why? (optional)"
              value={why}
              onChange={(event) => setWhy(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault()
                  if (why.trim()) void call("gloss", kept.id, why.trim()).then(() => said("Why kept with the Lookup"))
                  done()
                } else if (event.key === "Escape") {
                  event.preventDefault()
                  event.stopPropagation()
                  done()
                }
              }}
            />
          </span>
        ) : (
          <button type="button" className="look-up-keep" data-look-keep disabled={!!kept || meaning === "looking" || wiki === "looking"} onClick={() => void keep()}>
            {kept ? (lookup && lookup.id === kept.id ? "Place added" : "Kept in Lookups") : lookup ? "Add this place" : known ? "Keep again" : !found && !page ? "Keep to answer later" : "Keep"}
          </button>
        )}
        {/* The whole article, read here in the reader as ⌘K's Wikipedia answers are (⌥-click: to the side). */}
        {page && (
          <a className="look-up-link" href={page.url} title={`Read the whole article in the reader: text from Wikipedia, CC BY-SA${canSplit() ? ". ⌥-click opens it to the side" : ""}`}
            onClick={(event) => (event.preventDefault(), openArticle(page.url))}>
            Wikipedia <BookOpen className="size-3" />
          </a>
        )}
      </div>
    </div>
  )
}

/**
 * The looked-up words stay marked where they sit while the card is open, in
 * the selection's colour, drawn over the page by the browser (a custom
 * highlight), so the note, the PDF and the article are never changed. Picking
 * "Why keep this?" moves the selection away; the mark stays. It goes with the card.
 */
function useLooked(range?: Spot): void {
  useLayoutEffect(() => {
    const picked = window.getSelection()
    const find = typeof range === "function" ? range : null
    const at = find ? find() : ((range as Range | null | undefined) ?? (picked && picked.rangeCount && !picked.isCollapsed ? picked.getRangeAt(0).cloneRange() : null))
    if (!at) return
    // A band per line of the words, drawn from their boxes a little wider each side: the browser's
    // own highlight stops at each letter's box, and a letter that reaches past it (the hook of a
    // serif "j", a italic's lean) was left half out of the mark.
    const layer = document.createElement("div")
    layer.className = "mf-look-up-marks"
    document.body.append(layer)
    let shown: Range = at
    const draw = (): void => {
      layer.replaceChildren(...[...shown.getClientRects()].filter((box) => box.width > 0.5).map((box) => {
        const band = document.createElement("span")
        Object.assign(band.style, { left: `${box.left - 2}px`, top: `${box.top}px`, width: `${box.width + 4}px`, height: `${box.height}px` })
        return band
      }))
    }
    // Kept in the page's highlight list too (no colour of its own), which says which words are marked.
    const paint = (one: Range): void => {
      shown = one
      if (typeof Highlight !== "undefined") CSS.highlights.set("look-up", new Highlight(one))
      draw()
    }
    paint(at)
    // The page scrolls or the window resizes under it: drawn again where the words now are.
    const again = (): void => void requestAnimationFrame(draw)
    window.addEventListener("scroll", again, true)
    window.addEventListener("resize", again)
    // A note's editor may draw the line again (a menu closing, a save): the words are found again in what it drew.
    const root = find ? (at.commonAncestorContainer instanceof Element ? at.commonAncestorContainer : at.commonAncestorContainer.parentElement)?.closest(".ProseMirror") : null
    const redrawn = root ? new MutationObserver(() => { const now = find!(); if (now) paint(now) }) : null
    if (root) redrawn!.observe(root, { childList: true, subtree: true, characterData: true })
    return () => {
      redrawn?.disconnect()
      window.removeEventListener("scroll", again, true)
      window.removeEventListener("resize", again)
      layer.remove()
      if (typeof Highlight !== "undefined") CSS.highlights.delete("look-up")
    }
    // Taken once, as the card opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}

/** Look Up opened anywhere: the words, where on screen, and where they were read. Shown by the one card (LookUpHost). */
/** Where looked-up words sit: a range, or (in a note's editor, which may draw the line again) a way to find it each time. */
export type Spot = Range | (() => Range | null) | null

type LookUpAsk = { words: string; x: number; y: number; from: LookedUpIn; range?: Spot }

/** Look the words up in the one Look Up card, from a note, Review or anywhere words can be picked. */
export const lookUp = (ask: LookUpAsk): void => void window.dispatchEvent(new CustomEvent<LookUpAsk>("haligtree:look-up", { detail: ask }))

/**
 * The Look Up card for every place that is not a reader (which shows its own
 * in its pages): a note's right-click and selection bar, Review. Mounted once;
 * over everything, where it was asked; Esc or a press away puts it away.
 */
export function LookUpHost(): React.JSX.Element | null {
  const [ask, setAsk] = useState<LookUpAsk | null>(null)
  useEffect(() => {
    const open = (event: Event): void => setAsk((event as CustomEvent<LookUpAsk>).detail)
    const away = (event: PointerEvent): void => {
      if (!(event.target as Element | null)?.closest?.(".look-up")) setAsk(null)
    }
    window.addEventListener("haligtree:look-up", open)
    window.addEventListener("pointerdown", away, true)
    return () => (window.removeEventListener("haligtree:look-up", open), window.removeEventListener("pointerdown", away, true))
  }, [])
  if (!ask) return null
  return (
    <div className="look-up-layer" data-look-up-host>
      <LookUpCard key={`${ask.words}|${ask.x}|${ask.y}`} words={ask.words} at={{ x: Math.min(ask.x, innerWidth - 180), y: Math.max(8, Math.min(ask.y, innerHeight - 470)) }} from={ask.from} range={ask.range} onClose={() => setAsk(null)} />
    </div>
  )
}
