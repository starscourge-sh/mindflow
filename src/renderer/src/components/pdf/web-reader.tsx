import { useEffect, useRef, useState } from "react"
import { ChevronDown, ChevronUp, ExternalLink, Minus, Plus, ScrollText, Search, X } from "lucide-react"
import { Button } from "@/components/tiptap-ui-primitive/button"
import { Roll } from "@/lib/roll"
import { host } from "@/lib/host"
import { canSplit, keysHere, usePane } from "@/lib/split"
import { chime } from "@/lib/sound"
import { cue } from "@/lib/cues"
import { isWebPdf, openWebPdf } from "./pdf-reader"
import "./pdf.css"

/** A web page kept as an article: its words and pictures, read offline. */
export type Article = { id: string; href: string; title: string; byline: string; site: string; published: string; html: string; savedAt: string }

/** The text sizes, as steps on the note's own reading size. */
const SIZES = [0.8, 0.9, 1, 1.1, 1.25, 1.4, 1.6]

/** A web page in the reader: a step in the pane in front, or beside it on ⌥-click. A PDF link opens the PDF reader instead. */
export const openArticle = (href: string): void => {
  if (isWebPdf(href)) return void openWebPdf(href)
  if (canSplit()) window.dispatchEvent(new CustomEvent("haligtree:web", { detail: { href } }))
  else window.api.openInHome("web", href)
}

/** A link to a web page: what "Open in the reader" is offered on. */
export const isWebPage = (href: string | null | undefined): boolean => !!href && /^https?:\/\//i.test(href)

/** Titles of articles read in this window, by link: what a pane's tab calls it. */
const titles = new Map<string, string>()
export const articleName = (href: string): string => titles.get(href) ?? (URL.parse(href)?.hostname.replace(/^www\./, "") || "Article")

/**
 * A web page full size, in a pane of its own, as the PDF reader shows a PDF:
 * its title, the site, the note's own reading type, a size, paper and find.
 * A page the reader cannot read says why, with the page's own link.
 */
export function WebReader({ href }: { href: string }): React.JSX.Element {
  const scroller = useRef<HTMLDivElement>(null)
  const body = useRef<HTMLDivElement>(null)
  const [article, setArticle] = useState<Article | null>(null)
  const [failed, setFailed] = useState<string | null>(null)
  const [size, setSize] = useState(1)
  const [paper, setPaper] = useState(() => localStorage.getItem("pdf-paper") === "1")
  const pane = usePane()

  useEffect(() => {
    let live = true
    void host()
      .fetchArticle?.(href)
      .then((got) => {
        if (!live) return
        if ("error" in got) return setFailed(got.error)
        titles.set(href, got.article.title)
        window.dispatchEvent(new CustomEvent("haligtree:pdf-title"))
        setArticle(got.article)
      })
    return () => {
      live = false
    }
  }, [href])

  // ⌘F: the words looked for, every place they are, and the one on show, drawn as the browser's own highlights.
  const [finding, setFinding] = useState(false)
  const [found, setFound] = useState<Range[]>([])
  const [at, setAt] = useState(0)
  const findField = useRef<HTMLInputElement>(null)
  const find = (words: string): void => {
    const root = body.current
    if (!root || !words.trim()) return setFound([])
    const look = words.toLowerCase()
    const nodes = textNodes(root)
    const text = nodes.map((node) => node.data).join("").toLowerCase()
    const hits: Range[] = []
    for (let from = text.indexOf(look); from >= 0; from = text.indexOf(look, from + look.length)) {
      const range = rangeAt(nodes, from, from + look.length)
      if (range) hits.push(range)
    }
    setFound(hits)
    setAt(0)
    hits[0]?.startContainer.parentElement?.scrollIntoView({ block: "center" })
  }
  useEffect(() => {
    if (!("highlights" in CSS)) return
    CSS.highlights.set("web-found", new Highlight(...found))
    CSS.highlights.set("web-found-now", new Highlight(...(found[at] ? [found[at]] : [])))
    return () => (CSS.highlights.delete("web-found"), CSS.highlights.delete("web-found-now"), undefined)
  }, [found, at])
  const stepFind = (back: boolean): void => {
    if (!found.length) return cue("find-miss")
    const next = (at + (back ? found.length - 1 : 1)) % found.length
    setAt(next)
    found[next].startContainer.parentElement?.scrollIntoView({ block: "center" })
    cue("find-step", next)
  }
  const closeFind = (): void => {
    setFinding(false)
    setFound([])
    cue("find-close")
  }
  useEffect(() => {
    if (finding) cue("find")
  }, [finding])

  const step = (by: number): void => {
    const now = SIZES.indexOf(size)
    const next = SIZES[Math.min(Math.max(0, now + by), SIZES.length - 1)]
    if (next === size) return chime("nope")
    setSize(next)
  }
  // ⌘F, ⌘+ ⌘− ⌘0 while this reader is in the pane in front: its own find and text size, not the app's.
  useEffect(() => {
    const sizeBy = (way: number): void => (way === 0 ? setSize(1) : step(way))
    const onMenu = (event: Event): void => {
      if (!keysHere(pane)) return
      event.preventDefault()
      sizeBy((event as CustomEvent<number>).detail)
    }
    const onKey = (event: KeyboardEvent): void => {
      if (!event.metaKey || event.altKey || !keysHere(pane)) return
      if (event.code === "KeyF" && !event.shiftKey) {
        event.preventDefault()
        event.stopPropagation()
        setFinding(true)
        return void requestAnimationFrame(() => findField.current?.select())
      }
      const way = event.code === "Equal" || event.code === "NumpadAdd" ? 1 : event.code === "Minus" || event.code === "NumpadSubtract" ? -1 : event.code === "Digit0" || event.code === "Numpad0" ? 0 : null
      if (way === null) return
      event.preventDefault()
      sizeBy(way)
    }
    window.addEventListener("haligtree:zoom-key", onMenu)
    window.addEventListener("keydown", onKey, true)
    return () => (window.removeEventListener("haligtree:zoom-key", onMenu), window.removeEventListener("keydown", onKey, true))
  })

  const title = article?.title ?? articleName(href)
  const when = article?.published ? new Date(article.published) : null
  const meta = [article?.byline, article?.site, when && !Number.isNaN(when.getTime()) ? when.toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" }) : ""].filter(Boolean).join(" · ")

  return (
    <div className={`pdf-reader web-reader${paper ? " is-paper" : ""}`}>
      <div className="pdf-reader-bar">
        <span className="pdf-reader-title" title={title}>{title}</span>
        <span className="pdf-reader-tools">
          <Button data-style="ghost" aria-label="Open the page in your browser" title="Open the page in your browser" onClick={() => window.open(href, "_blank", "noopener")}>
            <ExternalLink className="tiptap-button-icon" />
          </Button>
          <Button data-style="ghost" aria-label="Find" title="Find  ⌘F" data-active-state={finding ? "on" : "off"} disabled={!article} onClick={() => (finding ? closeFind() : (setFinding(true), requestAnimationFrame(() => findField.current?.focus())))}>
            <Search className="tiptap-button-icon" />
          </Button>
          <Button data-style="ghost" aria-label="Smaller" title="Smaller  ⌘−" onClick={() => step(-1)}>
            <Minus className="tiptap-button-icon" />
          </Button>
          <Button data-style="ghost" aria-label="Usual size" title="Usual size  ⌘0" onClick={() => setSize(1)}>
            <span className="tiptap-button-text"><Roll text={`${Math.round(size * 100)}%`} /></span>
          </Button>
          <Button data-style="ghost" aria-label="Larger" title="Larger  ⌘+" onClick={() => step(1)}>
            <Plus className="tiptap-button-icon" />
          </Button>
          <Button
            data-style="ghost"
            aria-label={paper ? "White pages" : "Paper pages"}
            title={paper ? "White pages" : "Paper pages: easier on the eyes, pictures kept true"}
            data-active-state={paper ? "on" : "off"}
            onClick={() => {
              localStorage.setItem("pdf-paper", paper ? "0" : "1")
              setPaper(!paper)
            }}
          >
            <ScrollText className="tiptap-button-icon" />
          </Button>
        </span>
      </div>
      {finding && (
        <div className="tiptap-find-bar pdf-find-bar">
          <div className="tiptap-find-bar-row">
            <input
              ref={findField}
              type="text"
              placeholder="Find"
              aria-label="Find in the article"
              autoFocus
              onChange={(event) => find(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault()
                  stepFind(event.shiftKey)
                } else if (event.key === "Escape") closeFind()
              }}
            />
            <span className="tiptap-find-bar-count" aria-label={`${found.length ? at + 1 : 0} of ${found.length}`}>
              <Roll text={found.length ? at + 1 : 0} />/<Roll text={found.length} />
            </span>
            <button type="button" onClick={() => stepFind(true)} aria-label="Previous match" title="Previous  ⇧↵">
              <ChevronUp className="size-3.5" />
            </button>
            <button type="button" onClick={() => stepFind(false)} aria-label="Next match" title="Next  ↵">
              <ChevronDown className="size-3.5" />
            </button>
            <button type="button" onClick={closeFind} aria-label="Close find" title="Close  Esc">
              <X className="size-3.5" />
            </button>
          </div>
        </div>
      )}
      <div ref={scroller} className="pdf-reader-scroll web-reader-scroll">
        <article className="web-reader-column" style={{ fontSize: `calc(1.1875rem * var(--mf-text-scale, 1) * ${size})` }}>
          {failed ? (
            <div className="web-reader-failed" role="status">
              <p className="web-reader-failed-lead">{failed}</p>
              <p>The link stays in your note as it was. <a href={href} target="_blank" rel="noopener noreferrer">{href}</a></p>
            </div>
          ) : !article ? (
            <p className="web-reader-reading" role="status">Reading the page…</p>
          ) : (
            <>
              <h1 className="web-reader-heading">{article.title}</h1>
              {meta && <p className="web-reader-meta">{meta}</p>}
              <div ref={body} className="tiptap ProseMirror web-reader-body" dangerouslySetInnerHTML={{ __html: article.html }} />
            </>
          )}
        </article>
      </div>
    </div>
  )
}

/** Every run of words under a node, in reading order. */
export const textNodes = (root: Node): Text[] => {
  const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  const nodes: Text[] = []
  for (let node = walk.nextNode(); node; node = walk.nextNode()) nodes.push(node as Text)
  return nodes
}

/** The range from one character count to another across those runs. */
export function rangeAt(nodes: Text[], start: number, end: number): Range | null {
  const range = document.createRange()
  let seen = 0
  let placed = false
  for (const node of nodes) {
    const next = seen + node.data.length
    if (!placed && start < next) {
      range.setStart(node, start - seen)
      placed = true
    }
    if (placed && end <= next) {
      range.setEnd(node, end - seen)
      return range
    }
    seen = next
  }
  return null
}
