import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { ExternalLink, X } from "lucide-react"
import { call } from "@/lib/haligtree"
import { notes } from "@/lib/notes"
import { chime } from "@/lib/sound"
import { said } from "@/lib/host"
import type { Answer } from "../../../../main/define"

type Wiki = { title: string; description: string; extract: string; url: string } | { missing: true } | { offline: true } | null

/** Where the words were looked up: said on the Lookup kept, with a link back to the very place. */
export type LookedUpIn = { where: string; link: string; sentence?: string }

/**
 * Picked words looked up where they sit: the dictionary's meaning (the Mac's
 * own first, for one word) and Wikipedia's summary of the article they name,
 * with its link and licence. Either can be kept as a Lookup, with a line on
 * why if you like, and always where it was looked up.
 */
export function LookUpCard({ words, at, from, onClose }: { words: string; at: { x: number; y: number }; from: LookedUpIn; onClose: () => void }): React.JSX.Element {
  const one = /^\p{L}[\p{L}'-]{1,40}$/u.test(words)
  const [meaning, setMeaning] = useState<Answer | "looking">(one ? "looking" : null)
  const [wiki, setWiki] = useState<Wiki | "looking">("looking")
  const [why, setWhy] = useState("")
  const [kept, setKept] = useState<string | null>(null)
  const card = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  useLayoutEffect(() => setWidth(card.current?.offsetWidth ?? 0), [])
  useEffect(() => {
    let live = true
    if (one) void call<Answer>("define", words).then((answer) => live && setMeaning(answer), () => live && setMeaning({ offline: true }))
    void call<Wiki>("wiki", words).then((answer) => live && setWiki(answer), () => live && setWiki({ offline: true }))
    return () => void (live = false)
  }, [words, one])
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === "Escape") (event.preventDefault(), onClose())
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

  /** Kept as a Lookup: the word, its meaning, where it was looked up (and the sentence round it), and why, if you said. */
  const save = async (what: "dictionary" | "wikipedia"): Promise<void> => {
    const found = what === "dictionary" && meaning !== "looking" && meaning && "found" in meaning ? meaning.found : null
    const page = what === "wikipedia" && wiki !== "looking" && wiki && "extract" in wiki ? wiki : null
    if (!found && !page) return
    const word = found ? words : page!.title
    const text = (value: string, link?: string): Record<string, unknown> => ({ type: "text", text: value, ...(link ? { marks: [{ type: "link", attrs: { href: link } }] } : {}) })
    const body = {
      type: "doc",
      content: [
        { type: "paragraph", content: [text(word)] },
        ...(why.trim() ? [{ type: "paragraph", content: [text(`Why: ${why.trim()}`)] }] : []),
        ...(from.sentence ? [{ type: "blockquote", content: [{ type: "paragraph", content: [text(from.sentence)] }] }] : []),
        { type: "paragraph", content: [text("Looked up in "), text(from.where, from.link)] },
        ...(page ? [{ type: "paragraph", content: [text("From "), text("Wikipedia", page.url), text(", CC BY-SA")] }] : []),
      ],
    }
    const id = await window.api.captures.create({ kind: "word", title: word, body, medium: from.where })
    await notes.setField("captures", id, "definition", found ? found.definition : page!.extract)
    if (found?.example) await notes.setField("captures", id, "example", found.example)
    setKept(what)
    chime("saved")
    said(`“${word}” kept in Lookups`)
  }

  const left = Math.max(8, at.x - width / 2)
  return (
    <div ref={card} className="look-up" role="dialog" aria-label={`Look up “${words}”`} style={{ left, top: at.y + 8 }} onMouseDown={(event) => event.target instanceof HTMLInputElement || event.preventDefault()}>
      <div className="look-up-head">
        <span className="look-up-words">{words}</span>
        <button type="button" className="look-up-close" aria-label="Close" title="Close  Esc" onClick={onClose}>
          <X className="size-3.5" />
        </button>
      </div>
      {one && (
        <section className="look-up-section" data-look="dictionary">
          <h4 className="look-up-label">Dictionary</h4>
          {meaning === "looking" ? (
            <p className="look-up-quiet">Looking it up…</p>
          ) : meaning && "found" in meaning ? (
            <>
              <p className="look-up-meaning">
                {meaning.found.part && <em className="look-up-part">{meaning.found.part} </em>}
                {meaning.found.definition}
              </p>
              {meaning.found.example && <p className="look-up-example">“{meaning.found.example}”</p>}
              <button type="button" className="look-up-save" disabled={kept === "dictionary"} onClick={() => void save("dictionary")}>
                {kept === "dictionary" ? "Kept in Lookups" : "Save"}
              </button>
            </>
          ) : meaning && "offline" in meaning ? (
            <p className="look-up-quiet">You are offline, so the dictionary could not be asked.</p>
          ) : (
            <p className="look-up-quiet">{meaning && "miss" in meaning && meaning.fix ? `Not found. Did you mean “${meaning.fix}”?` : "The dictionary does not know this word."}</p>
          )}
        </section>
      )}
      <section className="look-up-section" data-look="wikipedia">
        <h4 className="look-up-label">Wikipedia</h4>
        {wiki === "looking" ? (
          <p className="look-up-quiet">Looking it up…</p>
        ) : wiki && "extract" in wiki ? (
          <>
            <p className="look-up-title">
              {wiki.title}
              {wiki.description && <span className="look-up-description"> · {wiki.description}</span>}
            </p>
            <p className="look-up-extract">{wiki.extract}</p>
            <div className="look-up-row">
              <button type="button" className="look-up-save" disabled={kept === "wikipedia"} onClick={() => void save("wikipedia")}>
                {kept === "wikipedia" ? "Kept in Lookups" : "Save"}
              </button>
              <a className="look-up-link" href={wiki.url} target="_blank" rel="noopener noreferrer">
                Read on Wikipedia <ExternalLink className="size-3" />
              </a>
            </div>
            <p className="look-up-licence">Text from Wikipedia, CC BY-SA.</p>
          </>
        ) : wiki && "offline" in wiki ? (
          <p className="look-up-quiet">You are offline, so Wikipedia could not be asked.</p>
        ) : (
          <p className="look-up-quiet">Wikipedia has no article by that name.</p>
        )}
      </section>
      <input className="look-up-why" type="text" placeholder="Why? (optional, kept with what you save)" aria-label="Why" value={why} onChange={(event) => setWhy(event.target.value)} />
    </div>
  )
}
