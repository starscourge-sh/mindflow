import { useEffect, useId, useMemo, useRef, useState } from 'react'
import {
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Minus,
  Plus,
  ScrollText,
  Search,
  X
} from 'lucide-react'
import { Button } from '@/components/tiptap-ui-primitive/button'
import { Roll } from '@/lib/roll'
import { host } from '@/lib/host'
import { keysHere, usePane } from '@/lib/split'
import { chime } from '@/lib/sound'
import { cue } from '@/lib/cues'
import { KeepBar, articleLink, openArticle, takeArticleFlash } from './pdf-reader'
import { offsetsIn, rangeOf, type PdfMark } from './pdf-pages'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger
} from '@/components/ui/context-menu'
import { call } from '@/lib/haligtree'
import { said } from '@/lib/host'
import './pdf.css'

/** A web page kept as an article: its words and pictures, read offline. */
export type Article = {
  id: string
  href: string
  title: string
  byline: string
  site: string
  published: string
  html: string
  savedAt: string
}

/** The text sizes, as steps on the note's own reading size. */
const SIZES = [0.8, 0.9, 1, 1.1, 1.25, 1.4, 1.6]

export { openArticle }

/** A link to a web page: what "Open in the reader" is offered on. */
export const isWebPage = (href: string | null | undefined): boolean =>
  !!href && /^https?:\/\//i.test(href)

/** Titles of articles read in this window, by link: what a pane's tab calls it. */
const titles = new Map<string, string>()
export const articleName = (href: string): string =>
  titles.get(href) ?? (URL.parse(href)?.hostname.replace(/^www\./, '') || 'Article')

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
  const [paper, setPaper] = useState(() => localStorage.getItem('pdf-paper') === '1')
  const pane = usePane()
  // This reader's own highlight names: the browser keeps one list per name for
  // the whole window, so two articles side by side would otherwise draw over each other's.
  const names = `web${useId().replace(/[^a-zA-Z0-9]/g, '')}`

  // Highlights, kept in the PDF reader's store under the page's link: each found
  // again by its offsets, else by its words and those around them.
  const [marks, setMarks] = useState<PdfMark[]>([])
  const [flash, setFlash] = useState<string | null>(() => takeArticleFlash())
  const [hit, setHit] = useState<PdfMark | null>(null)
  const drawn = useRef<{ mark: PdfMark; range: Range }[]>([])
  useEffect(() => {
    void call<PdfMark[]>('pdf:highlights', href).then(setMarks)
  }, [href])
  useEffect(() => {
    const root = body.current
    if (!root || !('highlights' in CSS)) return
    drawn.current = marks.flatMap((mark) => {
      const range = rangeOf(root, mark)
      return range ? [{ mark, range }] : []
    })
    CSS.highlights.set(`${names}-mark`, new Highlight(...drawn.current.map((one) => one.range)))
    // A gem's link back: its words lit until the next click, and brought into view.
    const lit = drawn.current.find((one) => one.mark.id === flash)?.range
    CSS.highlights.set(`${names}-flash`, new Highlight(...(lit ? [lit] : [])))
    lit?.startContainer.parentElement?.scrollIntoView({ block: 'center' })
    return () => (CSS.highlights.delete(`${names}-mark`), CSS.highlights.delete(`${names}-flash`), undefined)
  }, [marks, article, flash, names])

  // A selection inside the article's words offers "Keep"; anything else hides it.
  const [picked, setPicked] = useState<{
    quote: string
    raw: string
    start: number
    end: number
    prefix: string
    suffix: string
    x: number
    y: number
  } | null>(null)
  useEffect(() => {
    const onChange = (): void => {
      const chosen = getSelection()
      const root = body.current
      const box = scroller.current
      if (!chosen || chosen.isCollapsed || !chosen.rangeCount || !root || !box)
        return setPicked(null)
      const range = chosen.getRangeAt(0)
      const quote = range.toString().replace(/\s+/g, ' ').trim()
      if (!root.contains(range.startContainer) || !root.contains(range.endContainer) || !quote)
        return setPicked(null)
      const { start, end } = offsetsIn(root, range)
      const text = root.textContent ?? ''
      const rect = range.getBoundingClientRect()
      const frame = box.getBoundingClientRect()
      setPicked({
        quote,
        raw: text.slice(start, end),
        start,
        end,
        prefix: text.slice(Math.max(0, start - 32), start),
        suffix: text.slice(end, end + 32),
        x: rect.left + rect.width / 2 - frame.left,
        y: rect.top - frame.top + box.scrollTop
      })
    }
    document.addEventListener('selectionchange', onChange)
    return () => document.removeEventListener('selectionchange', onChange)
  }, [])

  /** The picked words as a gem: the quote, "Article title, Site", and a link back that opens here with them lit. */
  const keep = async (): Promise<void> => {
    if (!picked || !article) return
    const id = crypto.randomUUID()
    const where = [article.title, article.site].filter(Boolean).join(', ')
    const gemId = await call<string>(
      'nugget:from',
      `${picked.quote}\n\n[${where.replace(/[[\]]/g, '\\$&')}](${articleLink(href, id)})`,
      // The article is the gem's source; its byline, when it has one, who said it.
      { attribution: article.byline?.replace(/^by\s+/i, '') || null, medium: where, kind: 'quote' }
    )
    const mark: PdfMark = {
      id,
      page: 0,
      quote: picked.raw,
      start: picked.start,
      end: picked.end,
      prefix: picked.prefix,
      suffix: picked.suffix,
      gemId
    }
    await call('pdf:highlight', href, mark)
    setMarks((all) => [...all, mark])
    getSelection()?.removeAllRanges()
    setPicked(null)
    chime('saved')
    said('Kept as a gem')
  }
  const remove = async (mark: PdfMark): Promise<void> => {
    await call('pdf:unhighlight', mark.id)
    setMarks((all) => all.filter((one) => one.id !== mark.id))
    chime('away')
    said('Highlight removed')
  }

  useEffect(() => {
    let live = true
    void host()
      .fetchArticle?.(href)
      .then((got) => {
        if (!live) return
        if ('error' in got) return setFailed(got.error)
        titles.set(href, got.article.title)
        window.dispatchEvent(new CustomEvent('haligtree:pdf-title'))
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
    const text = nodes
      .map((node) => node.data)
      .join('')
      .toLowerCase()
    const hits: Range[] = []
    for (let from = text.indexOf(look); from >= 0; from = text.indexOf(look, from + look.length)) {
      const range = rangeAt(nodes, from, from + look.length)
      if (range) hits.push(range)
    }
    setFound(hits)
    setAt(0)
    hits[0]?.startContainer.parentElement?.scrollIntoView({ block: 'center' })
  }
  useEffect(() => {
    if (!('highlights' in CSS)) return
    CSS.highlights.set(`${names}-found`, new Highlight(...found))
    CSS.highlights.set(`${names}-found-now`, new Highlight(...(found[at] ? [found[at]] : [])))
    return () => (
      CSS.highlights.delete(`${names}-found`),
      CSS.highlights.delete(`${names}-found-now`),
      undefined
    )
  }, [found, at, names])
  const stepFind = (back: boolean): void => {
    if (!found.length) return cue('find-miss')
    const next = (at + (back ? found.length - 1 : 1)) % found.length
    setAt(next)
    found[next].startContainer.parentElement?.scrollIntoView({ block: 'center' })
    cue('find-step', next)
  }
  const closeFind = (): void => {
    setFinding(false)
    setFound([])
    cue('find-close')
  }
  useEffect(() => {
    if (finding) cue('find')
  }, [finding])

  const step = (by: number): void => {
    const now = SIZES.indexOf(size)
    const next = SIZES[Math.min(Math.max(0, now + by), SIZES.length - 1)]
    if (next === size) return chime('nope')
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
      if (event.code === 'KeyF' && !event.shiftKey) {
        event.preventDefault()
        event.stopPropagation()
        setFinding(true)
        return void requestAnimationFrame(() => findField.current?.select())
      }
      const way =
        event.code === 'Equal' || event.code === 'NumpadAdd'
          ? 1
          : event.code === 'Minus' || event.code === 'NumpadSubtract'
            ? -1
            : event.code === 'Digit0' || event.code === 'Numpad0'
              ? 0
              : null
      if (way === null) return
      event.preventDefault()
      sizeBy(way)
    }
    window.addEventListener('haligtree:zoom-key', onMenu)
    window.addEventListener('keydown', onKey, true)
    return () => (
      window.removeEventListener('haligtree:zoom-key', onMenu),
      window.removeEventListener('keydown', onKey, true)
    )
  })

  // One object for the article's HTML, kept while the article is: React 19 sets
  // innerHTML again whenever this prop is a new object, which rebuilds every
  // word and empties the highlights and the picked words.
  const words = useMemo(() => ({ __html: article?.html ?? '' }), [article])
  const title = article?.title ?? articleName(href)
  const when = article?.published ? new Date(article.published) : null
  const meta = [
    article?.byline,
    article?.site,
    when && !Number.isNaN(when.getTime())
      ? when.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })
      : ''
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <div className={`pdf-reader web-reader${paper ? ' is-paper' : ''}`}>
      <style>{tint(`${names}-mark`, 28) + tint(`${names}-found`, 25) + tint(`${names}-found-now`, 55) + tint(`${names}-flash`, 55)}</style>
      <div className="pdf-reader-bar">
        <span className="pdf-reader-title" title={title}>
          {title}
        </span>
        <span className="pdf-reader-tools">
          <Button
            data-style="ghost"
            aria-label="Open the page in your browser"
            title="Open the page in your browser"
            onClick={() => window.open(href, '_blank', 'noopener')}
          >
            <ExternalLink className="tiptap-button-icon" />
          </Button>
          <Button
            data-style="ghost"
            aria-label="Find"
            title="Find  ⌘F"
            data-active-state={finding ? 'on' : 'off'}
            disabled={!article}
            onClick={() =>
              finding
                ? closeFind()
                : (setFinding(true), requestAnimationFrame(() => findField.current?.focus()))
            }
          >
            <Search className="tiptap-button-icon" />
          </Button>
          <Button
            data-style="ghost"
            aria-label="Smaller"
            title="Smaller  ⌘−"
            onClick={() => step(-1)}
          >
            <Minus className="tiptap-button-icon" />
          </Button>
          <Button
            data-style="ghost"
            aria-label="Usual size"
            title="Usual size  ⌘0"
            onClick={() => setSize(1)}
          >
            <span className="tiptap-button-text">
              <Roll text={`${Math.round(size * 100)}%`} />
            </span>
          </Button>
          <Button data-style="ghost" aria-label="Larger" title="Larger  ⌘+" onClick={() => step(1)}>
            <Plus className="tiptap-button-icon" />
          </Button>
          <Button
            data-style="ghost"
            aria-label={paper ? 'White pages' : 'Paper pages'}
            title={paper ? 'White pages' : 'Paper pages: easier on the eyes, pictures kept true'}
            data-active-state={paper ? 'on' : 'off'}
            onClick={() => {
              localStorage.setItem('pdf-paper', paper ? '0' : '1')
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
                if (event.key === 'Enter') {
                  event.preventDefault()
                  stepFind(event.shiftKey)
                } else if (event.key === 'Escape') closeFind()
              }}
            />
            <span
              className="tiptap-find-bar-count"
              aria-label={`${found.length ? at + 1 : 0} of ${found.length}`}
            >
              <Roll text={found.length ? at + 1 : 0} />/<Roll text={found.length} />
            </span>
            <button
              type="button"
              onClick={() => stepFind(true)}
              aria-label="Previous match"
              title="Previous  ⇧↵"
            >
              <ChevronUp className="size-3.5" />
            </button>
            <button
              type="button"
              onClick={() => stepFind(false)}
              aria-label="Next match"
              title="Next  ↵"
            >
              <ChevronDown className="size-3.5" />
            </button>
            <button type="button" onClick={closeFind} aria-label="Close find" title="Close  Esc">
              <X className="size-3.5" />
            </button>
          </div>
        </div>
      )}
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div
            ref={scroller}
            className="pdf-reader-scroll web-reader-scroll"
            onPointerDown={() => flash && setFlash(null)}
            // Only a highlight has a menu: anywhere else the right click is the page's own.
            onContextMenu={(event) => {
              const on = drawn.current.find(({ range }) =>
                [...range.getClientRects()].some(
                  (r) =>
                    event.clientX >= r.left &&
                    event.clientX <= r.right &&
                    event.clientY >= r.top &&
                    event.clientY <= r.bottom
                )
              )
              setHit(on?.mark ?? null)
              if (!on) event.preventDefault()
            }}
          >
            <article
              className="web-reader-column"
              style={{ fontSize: `calc(1rem * var(--mf-text-scale, 1) * ${size})` }}
            >
              {failed ? (
                <div className="web-reader-failed" role="status">
                  <p className="web-reader-failed-lead">{failed}</p>
                  <p>
                    The link stays in your note as it was.{' '}
                    <a href={href} target="_blank" rel="noopener noreferrer">
                      {href}
                    </a>
                  </p>
                </div>
              ) : !article ? (
                <p className="web-reader-reading" role="status">
                  Reading the page…
                </p>
              ) : (
                <>
                  <h1 className="web-reader-heading">{article.title}</h1>
                  {meta && <p className="web-reader-meta">{meta}</p>}
                  <div
                    ref={body}
                    className="tiptap ProseMirror haligtree-editor web-reader-body"
                    dangerouslySetInnerHTML={words}
                  />
                </>
              )}
            </article>
            {picked && <KeepBar at={picked} onKeep={() => void keep()} />}
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent>
          {hit?.gemId && (
            <ContextMenuItem
              onSelect={() =>
                window.dispatchEvent(
                  new CustomEvent('haligtree:open', { detail: { type: 'nugget', id: hit.gemId } })
                )
              }
            >
              Open its gem
            </ContextMenuItem>
          )}
          {hit && (
            <ContextMenuItem onSelect={() => void remove(hit)}>Remove highlight</ContextMenuItem>
          )}
        </ContextMenuContent>
      </ContextMenu>
    </div>
  )
}

/**
 * A highlight's colour: the theme's own brand colour, this much of it, as the
 * PDF reader's marks are on light pages. On a dark theme the same share is
 * lost against the background, so it is half as strong again.
 */
const tint = (name: string, percent: number): string =>
  `::highlight(${name}) { background-color: color-mix(in srgb, var(--tt-brand-color-500, #c08a2e) ${Math.round(percent * 1.6)}%, transparent) }` +
  `:root:is(.light, .paper, [data-light]) ::highlight(${name}) { background-color: color-mix(in srgb, var(--tt-brand-color-500, #c08a2e) ${percent}%, transparent) }`

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
