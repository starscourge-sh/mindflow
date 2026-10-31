import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { ArrowUpRight, Gem } from "lucide-react"
import { call } from "@/lib/haligtree"
import { notes } from "@/lib/notes"
import { chime } from "@/lib/sound"
import { said } from "@/lib/host"
import { FLOAT } from "@/lib/float"
import { cn } from "@/lib/cn"
import type { Answer } from "../../../../main/define"

type Wiki = { title: string; description: string; extract: string; url: string; picture?: string | null } | { missing: true } | { offline: true } | null

/** Where the words were looked up: said on the Lookup kept, with a link back to the very place. */
export type LookedUpIn = { where: string; link: string; sentence?: string }

/** Lines of grey where words are coming: calm, the card's own size, nothing that says "loading". */
function Waiting({ lines }: { lines: number[] }): React.JSX.Element {
  return (
    <div className="look-up-waiting" aria-label="Looking it up">
      {lines.map((width, at) => (
        <span key={at} style={{ width: `${width}%` }} />
      ))}
    </div>
  )
}

/**
 * Picked words looked up where they sit, as a reader's Look Up is: the word
 * as a headword with its meaning, then Wikipedia's summary of the article it
 * names under a hairline. One "Keep" keeps both together as a Lookup, said
 * where it was looked up; then "Why keep this?" asks one line, in place.
 */
export function LookUpCard({ words, at, from, onClose }: { words: string; at: { x: number; y: number }; from: LookedUpIn; onClose: () => void }): React.JSX.Element {
  const one = /^\p{L}[\p{L}'-]{1,40}$/u.test(words)
  const [meaning, setMeaning] = useState<Answer | "looking">(one ? "looking" : null)
  const [wiki, setWiki] = useState<Wiki | "looking">("looking")
  // Kept: the Lookup made, and whether its "why" is still being asked.
  const [kept, setKept] = useState<{ id: string; asking: boolean } | null>(null)
  const [why, setWhy] = useState("")
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
      if (event.key === "Escape" && !event.defaultPrevented) (event.preventDefault(), onClose())
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

  const found = meaning !== "looking" && meaning && "found" in meaning ? meaning.found : null
  const page = wiki !== "looking" && wiki && "extract" in wiki ? wiki : null

  /** Kept as one Lookup: the word, its meaning and Wikipedia's summary together, where it was looked up (and the sentence round it). */
  const keep = async (): Promise<void> => {
    if (!found && !page) return
    const word = found ? words : page!.title
    const text = (value: string, link?: string): Record<string, unknown> => ({ type: "text", text: value, ...(link ? { marks: [{ type: "link", attrs: { href: link } }] } : {}) })
    const body = {
      type: "doc",
      content: [
        { type: "paragraph", content: [text(word)] },
        ...(from.sentence ? [{ type: "blockquote", content: [{ type: "paragraph", content: [text(from.sentence)] }] }] : []),
        ...(found && page ? [{ type: "paragraph", content: [text(page.extract)] }] : []),
        { type: "paragraph", content: [text("Looked up in "), text(from.where, from.link)] },
        ...(page ? [{ type: "paragraph", content: [text("From "), text("Wikipedia", page.url), text(", CC BY-SA")] }] : []),
      ],
    }
    const id = await window.api.captures.create({ kind: "word", title: word, body, medium: from.where })
    await notes.setField("captures", id, "definition", found ? found.definition : page!.extract)
    if (found?.example) await notes.setField("captures", id, "example", found.example)
    setKept({ id, asking: true })
    chime("saved")
    said(`“${word}” kept in Lookups`)
  }
  const done = (): void => setKept((now) => now && { ...now, asking: false })

  const left = Math.max(8, at.x - width / 2)
  return (
    <div
      ref={card}
      className={cn("look-up", FLOAT)}
      role="dialog"
      aria-label={`Look up “${words}”`}
      style={{ left, top: at.y + 8 }}
      onMouseDown={(event) => event.target instanceof HTMLInputElement || event.preventDefault()}
    >
      {/* The word itself, as a dictionary prints it. */}
      <h3 className="look-up-headword">{found || !page ? words : page.title}</h3>
      {one &&
        (meaning === "looking" ? (
          <Waiting lines={[30, 92, 70]} />
        ) : found ? (
          <div className="look-up-dictionary" data-look="dictionary">
            {found.part && <p className="look-up-part">{found.part}</p>}
            <p className="look-up-meaning">{found.definition}</p>
            {found.example && <p className="look-up-example">{found.example}</p>}
          </div>
        ) : (
          <p className="look-up-quiet" data-look="dictionary">
            {meaning && "offline" in meaning ? "Offline: the dictionary can't be asked now." : meaning && "miss" in meaning && meaning.fix ? `Not in the dictionary. Did you mean “${meaning.fix}”?` : "Not in the dictionary."}
          </p>
        ))}
      <hr className="look-up-rule" />
      {wiki === "looking" ? (
        <Waiting lines={[55, 100, 96, 80]} />
      ) : page ? (
        <div className="look-up-wiki" data-look="wikipedia">
          {page.picture && <img className="look-up-picture" src={page.picture} alt="" draggable={false} />}
          <p className="look-up-title">
            {page.title}
            {page.description && <span className="look-up-description"> {page.description}</span>}
          </p>
          <p className="look-up-extract">{page.extract}</p>
        </div>
      ) : (
        <p className="look-up-quiet" data-look="wikipedia">{wiki && "offline" in wiki ? "Offline: Wikipedia can't be asked now." : "No Wikipedia article by that name."}</p>
      )}
      <div className="look-up-foot">
        {kept?.asking ? (
          // Kept: why, in one line, as the reader asks it after "Keep" (Enter saves, Esc skips).
          <span className="look-up-kept">
            <Gem className="size-3.5" />
            <input
              autoFocus
              className="look-up-why"
              type="text"
              aria-label="Why keep this"
              placeholder="Why keep this?"
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
          <button type="button" className="look-up-keep" data-look-keep disabled={!!kept || (!found && !page)} onClick={() => void keep()}>
            {kept ? "Kept in Lookups" : "Keep"}
          </button>
        )}
        {page && (
          <a className="look-up-link" href={page.url} target="_blank" rel="noopener noreferrer" title="Text from Wikipedia, CC BY-SA">
            Wikipedia <ArrowUpRight className="size-3" />
          </a>
        )}
      </div>
    </div>
  )
}
