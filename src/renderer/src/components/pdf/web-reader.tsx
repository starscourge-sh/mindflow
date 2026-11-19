import { BLANK } from '@/lib/blanks'
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useToolKeys } from '@/lib/tool-keys'
import {
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Highlighter,
  Minus,
  PanelLeft,
  Plus,
  RotateCw,
  Search,
  X
} from 'lucide-react'
import { PdfOutline, PdfRail, type OutlineRow } from './pdf-rail'
import { PageLabel } from './pdf-labels'
import { freeSiteOf } from '@/lib/free-sites'
import { grammarsIn, lowlight, useGrammars, wantGrammars } from '@/lib/lowlight'
import { canSplit } from '@/lib/split'
import { Button } from '@/components/tiptap-ui-primitive/button'
import { Roll } from '@/lib/roll'
import { host } from '@/lib/host'
import { keysHere, usePane } from '@/lib/split'
import { chime } from '@/lib/sound'
import { writing } from '@/lib/keys'
import { cue } from '@/lib/cues'
import { articleLink, isReadable, openArticle, takeArticleFlash } from './pdf-reader'
import { LookUpCard, type LookedUpIn } from './look-up'
import { MARK_COLORS, MarkMenu, PickedMenu, WhyAfter, blankOf, cited, lastColor, markCss, readKey, rememberColor, type MarkColor, type Picked, type ReadActions } from './read-bar'
import { offsetsIn, rangeOf, type PdfMark } from './pdf-pages'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger
} from '@/components/ui/context-menu'
import { call } from '@/lib/haligtree'
import { touch } from '@/lib/open-today'
import { keepWebPlace, webPlaces } from '@/lib/note-place'
import { said } from '@/lib/host'
import { Orb } from '@/components/haligtree/orb'
import { listEnd, stopJob } from '@/components/haligtree/ui'
import { markRoom } from '@/extensions/block-room'
import { minutesToRead } from '@/lib/note-size'
import { useReadTime } from '@/lib/read-time'
import './pdf.css'
// Picking words in the article, forgiving as in Apple's apps.
import './reader-select'
import { plural, num } from '../../../../main/dates'
import { createPortal } from 'react-dom'
import { Search as NotePicker } from '@/components/search'
import { keepInFiles, noteTitle, putInNote } from '@/lib/media-files'
import { pictureLines } from '@/lib/picture-actions'
import { openLook } from '@/components/image/image-look'
import { quoted } from '../../../../main/clip'

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
/** A page "Open in the reader" is offered for: a video's is not (pdf-reader.tsx, isReadable). */
export const isWebPage = (href: string | null | undefined): boolean => isReadable(href)

/** Titles of articles read in this window, by link: what a pane's tab calls it. */
const titles = new Map<string, string>()
export const articleName = (href: string): string =>
  titles.get(href) ?? (URL.parse(href)?.hostname.replace(/^www\./, '') || 'Article')

/**
 * A web page full size, in a pane of its own, as the PDF reader shows a PDF:
 * its title, the site, a size and find, set on the theme's own page in a
 * note's reading type and rhythm, but as a page of its own: a narrower column
 * between two margin lines, so it never reads as one of your notes.
 * A PDF's pages are printed sheets, so they keep "Paper pages"; an article
 * has no sheet of its own, so the theme decides its colours as it does a note's.
 * A page the reader cannot read says why, with the page's own link.
 */
export function WebReader({ href }: { href: string }): React.JSX.Element {
  const scroller = useRef<HTMLDivElement>(null)
  const body = useRef<HTMLDivElement>(null)
  const [article, setArticle] = useState<Article | null>(null)
  const [failed, setFailed] = useState<string | null>(null)
  // Its code is coloured once the grammars are in (lib/lowlight.ts): a page with code is set again then, once a window,
  // and its highlights found again in it.
  const grammars = useGrammars()
  const coloured = grammars && !!article?.html.includes('<pre')
  const [size, setSize] = useState(1)
  const pane = usePane()
  // The article's headings, in reading order: its contents beside it, and the section a gem's citation names.
  const heads = useRef<HTMLElement[]>([])
  // The reader's own width: wide enough, the contents stand beside the article; a narrow pane beside a note keeps the column.
  const root = useRef<HTMLDivElement>(null)
  const [roomy, setRoomy] = useState(false)
  // Read before the first paint, so the contents never come in a frame after the article and push its column aside.
  useLayoutEffect(() => {
    const box = root.current
    if (!box) return
    setRoomy(box.getBoundingClientRect().width >= 880)
    const watch = new ResizeObserver(([one]) => setRoomy(one.contentRect.width >= 880))
    watch.observe(box)
    return () => watch.disconnect()
  }, [])
  // This reader's own highlight names: the browser keeps one list per name for
  // the whole window, so two articles side by side would otherwise draw over each other's.
  const names = `web${useId().replace(/[^a-zA-Z0-9]/g, '')}`

  // Opened: into Recent, in the sidebar and ⌘K, as a note or a PDF is when it opens.
  useEffect(() => {
    touch('web', href)
    void call('home:opened', 'web', href)
  }, [href])
  // Where you were: kept as you read (and leave), put back once the article is drawn tall enough to hold it.
  const placed = useRef(false)
  // Read again, it starts at its top: the place kept was in the old words, and put back as the new pictures came in
  // it landed somewhere different each time (the user, 19 Nov 2026: "rather take me back to the beginning").
  const fromTop = useRef(false)
  useEffect(() => {
    const box = scroller.current
    if (!box || !article) return
    const kept = fromTop.current ? undefined : webPlaces()[href]
    if (fromTop.current) box.scrollTop = 0
    fromTop.current = false
    placed.current = !kept || !!takenFlash.current
    // Where `put` itself sent the page: any other scroll is the person's (keys, Find, a heading in the contents, the
    // scrollbar), and from then the place is theirs. Only the wheel and a press stopped it before, so a late put (the
    // pictures making the page tall enough) yanked the page back from where Find or a link had just taken it.
    let ours = -1
    const put = (): void => {
      if (placed.current || !kept) return
      if (box.scrollHeight - box.clientHeight >= kept.top - 1) (ours = kept.top, (box.scrollTop = kept.top), (placed.current = true))
    }
    put()
    const grows = new ResizeObserver(put)
    if (body.current) grows.observe(body.current)
    const stop = (): void => void (placed.current = true)
    let top = box.scrollTop
    const onScroll = (): void => {
      top = box.scrollTop
      if (Math.abs(top - ours) > 1) placed.current = true
    }
    box.addEventListener('scroll', onScroll, { passive: true })
    box.addEventListener('wheel', stop, { passive: true })
    box.addEventListener('pointerdown', stop)
    const save = (): void => {
      const room = Math.max(1, box.scrollHeight - box.clientHeight)
      if (top > 0) keepWebPlace(href, { top, share: Math.min(1, top / room), at: Date.now(), title: article.title || articleName(href), picture: [...(body.current?.querySelectorAll('img') ?? [])].find((one) => one.naturalWidth >= 200)?.src ?? null })
    }
    window.addEventListener('pagehide', save)
    return () => {
      save()
      grows.disconnect()
      box.removeEventListener('scroll', onScroll)
      box.removeEventListener('wheel', stop)
      box.removeEventListener('pointerdown', stop)
      window.removeEventListener('pagehide', save)
    }
  }, [article, href])

  // Highlights, kept in the PDF reader's store under the page's link: each found
  // again by its offsets, else by its words and those around them.
  const [marks, setMarks] = useState<PdfMark[]>([])
  const [flash, setFlash] = useState<string | null>(() => takeArticleFlash())
  // Opened on a highlight (a gem's link back): that wins over where you were.
  const takenFlash = useRef(flash)
  const [hit, setHit] = useState<PdfMark | null>(null)
  // A link right-clicked in the article: its own rows in the menu.
  const [linkHit, setLinkHit] = useState<string | null>(null)
  // A picture right-clicked in the article (kept here, haligtree://): a picture's own lines, as Files gives one.
  const [pictureHit, setPictureHit] = useState<{ src: string; name: string; img: HTMLImageElement } | null>(null)
  // "Put in a note…": the notes' own search as the picker, as Files asks.
  const [putting, setPutting] = useState<{ src: string; name: string } | null>(null)
  const drawn = useRef<{ mark: PdfMark; range: Range }[]>([])
  const [moved, setMoved] = useState<Set<string>>(() => new Set())
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
    // A highlight whose words are no longer in the article (it was read again, rewritten): kept, and said to have moved.
    setMoved(new Set(marks.filter((mark) => !drawn.current.some((one) => one.mark === mark)).map((mark) => mark.id)))
    // One list per colour: the book's own, then each of the others.
    for (const one of MARK_COLORS)
      CSS.highlights.set(markName(names, one.id), new Highlight(...drawn.current.filter(({ mark }) => (mark.color ?? null) === one.id).map(({ range }) => range)))
    // A gem's link back: its words lit until the next click, and brought into view.
    const lit = drawn.current.find((one) => one.mark.id === flash)?.range
    CSS.highlights.set(`${names}-flash`, new Highlight(...(lit ? [lit] : [])))
    lit?.startContainer.parentElement?.scrollIntoView({ block: 'center' })
    return () => (MARK_COLORS.forEach((one) => CSS.highlights.delete(markName(names, one.id))), CSS.highlights.delete(`${names}-flash`), undefined)
  }, [marks, article, flash, names, coloured])

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
    bottom: number
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
        y: rect.top - frame.top + box.scrollTop,
        bottom: rect.bottom - frame.top + box.scrollTop
      })
    }
    document.addEventListener('selectionchange', onChange)
    return () => document.removeEventListener('selectionchange', onChange)
  }, [])

  /** "Article title, Site": where an article's words came from, as a gem and a citation name it. */
  const whereFrom = (): string => [article?.title, article?.site].filter(Boolean).join(', ')
  const byline = (): string => article?.byline?.replace(/^by\s+/i, '') ?? ''
  /** The section a place in the article is in: the last heading at or before it. */
  const sectionAt = (node: Node | null | undefined): string => {
    let found = ''
    for (const one of heads.current) {
      if (!node || !(one.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING)) break
      found = one.textContent?.replace(/\s+/g, ' ').trim() ?? ''
    }
    return found
  }
  /** Where a mark's words came from, as its gem cites them: the article and its section, the site, and the day its copy was read. */
  const citeOf = (section: string): string =>
    [[article?.title, section].filter(Boolean).join(': '), article?.site, article?.savedAt ? `read ${dayOf(article.savedAt)}` : ''].filter(Boolean).join(', ')
  /** A gem of a mark's words: the quote, "Article title: Section, Site, read 15 November 2026", and a link back that opens here with them lit. */
  const gemOf = (one: { id: string; quote: string }, section = ''): Promise<string> =>
    call<string>(
      'nugget:from',
      `${one.quote}\n\n[${citeOf(section).replace(/[[\]]/g, '\\$&')}](${articleLink(href, one.id)})`,
      // The article is the gem's source; its byline, when it has one, who said it.
      { attribution: byline() || null, medium: whereFrom(), kind: 'quote' }
    )
  // Just kept as a gem: "Why keep this?" where the words were, for its gem.
  const [whyFor, setWhyFor] = useState<{ id: string; x: number; y: number; bottom?: number } | null>(null)
  /** The picked words marked in a colour; kept as a gem too when asked. */
  const mark = async (color: MarkColor, gem: boolean): Promise<void> => {
    if (!picked || !article) return
    const id = crypto.randomUUID()
    const chosen = getSelection()
    const section = sectionAt(chosen?.rangeCount ? chosen.getRangeAt(0).startContainer : null)
    const gemId = gem ? await gemOf({ id, quote: picked.quote }, section) : null
    const made: PdfMark = {
      id,
      page: 0,
      quote: picked.raw,
      start: picked.start,
      end: picked.end,
      prefix: picked.prefix,
      suffix: picked.suffix,
      gemId,
      color
    }
    await call('pdf:highlight', href, made)
    setMarks((all) => [...all, made])
    if (gemId) setWhyFor({ id: gemId, x: picked.x, y: picked.y, bottom: picked.bottom })
    getSelection()?.removeAllRanges()
    setPicked(null)
    // Its notice has Undo and ⌘Z, as taking one away has; the first ever says once where highlights go, and only what is
    // true here: kept with the page, listed under the bar's highlighter, gathered into a note from there.
    const first = !gem && color !== 'later' && !localStorage.getItem(TOLD)
    if (first) localStorage.setItem(TOLD, '1')
    const words = gem ? 'Kept as a gem' : color === 'later' ? 'Marked for a card' : first ? 'Highlighted. Kept with this page: the highlighter in the bar lists them, and “Gather into a note” puts them in one' : 'Highlighted'
    said(words, true, gemId ? { type: 'nugget', id: gemId, title: picked.quote } : undefined, {
      cue: 'saved',
      undo: () => void call('pdf:unhighlight', id).then(() => (setMarks((all) => all.filter((one) => one.id !== id)), chime('undo')))
    })
  }
  const copyCited = async (quote: string): Promise<void> => {
    await navigator.clipboard.writeText(cited(quote.replace(/\s+/g, ' ').trim(), [byline(), whereFrom()].filter(Boolean).join(', ')))
    said('Copied with its citation')
  }
  // Words looked up: the card under them, until Esc or a click away.
  const [looking, setLooking] = useState<{ words: string; x: number; y: number; from: LookedUpIn } | null>(null)
  /** The sentence round the picked words, inside their own paragraph, so a heading above is never taken in. */
  const sentenceHere = (quote: string): string => {
    const chosen = getSelection()
    const node = chosen?.rangeCount ? chosen.getRangeAt(0).startContainer : null
    const block = (node instanceof Element ? node : node?.parentElement)?.closest('p, li, blockquote, h1, h2, h3, h4, h5, h6, td, dd, figcaption')
    const text = (block?.textContent ?? '').replace(/\s+/g, ' ')
    const words = quote.replace(/\s+/g, ' ').trim()
    const at = text.indexOf(words)
    if (at < 0) return words
    let from = 0
    for (const match of text.slice(0, at).matchAll(/[.!?]\s/g)) from = match.index! + 1
    const end = /[.!?](?=\s|$)/.exec(text.slice(at + words.length))
    return text.slice(from, end ? at + words.length + end.index + 1 : undefined).trim()
  }
  // Cards made from this article, all told: past 15 the count says most people keep 10 to 15 from an hour.
  const [cardsHere, setCardsHere] = useState(0)
  useEffect(() => {
    const where = whereFrom()
    if (where) void call<{ medium: string | null; prompt: string | null }[]>('items', 'nugget').then((all) => setCardsHere(all.filter((one) => one.medium === where && one.prompt).length))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [article?.title, article?.site])
  /** A card from this article: the answer with "Article title, Site" linked under it. */
  const cardOf = async (prompt: string, answer: string, gem = false, quiet = false): Promise<string> => {
    // A study card (Review only), unless ⌥ was held or Settings keeps reading cards as gems.
    const id = await call<string>('nugget:from', `${answer}\n\n[${whereFrom().replace(/[[\]]/g, '\\$&')}](${articleLink(href, '')})`, { attribution: byline() || null, medium: whereFrom(), kind: 'quote', card: { gem } })
    // Named by its question, as a card is in every list and in ⌘K; a fill-in-the-blank card by its whole sentence.
    const named = prompt.includes(BLANK) ? answer : prompt
    await call('item:save', id, { prompt, title: named })
    const count = cardsHere + 1
    setCardsHere(count)
    // One sound, and Undo takes the card back, as the PDF's does (pdf-reader.tsx cardOf).
    const undo = (): void => void call<boolean>('lifted:undo', 'nugget', id).then((gone) => gone && setCardsHere((now) => Math.max(0, now - 1)))
    if (quiet) chime('saved')
    else said(count > 15 ? `Card made: ${num(count)} from this source. Most people keep 10 to 15 from an hour; the best ones are enough` : `Card made: ${num(count)} from this source`, true, { type: "nugget", id, title: named }, { cue: 'saved', undo })
    return id
  }
  // C: the question asked where the words were; Return makes the card.
  const [carding, setCarding] = useState<{ quote: string; x: number; y: number; bottom?: number; gem?: boolean } | null>(null)
  /** The picked words as the right-click menu's previews and the blank card read them. */
  const pickedAbout = (quote: string): Picked => ({ words: quote.replace(/\s+/g, ' ').trim(), sentence: sentenceHere(quote), where: whereFrom(), by: byline() })
  const actions: ReadActions = {
    highlight: (color) => (rememberColor(color), void mark(color, false)),
    keep: () => void mark(lastColor(), true),
    copy: () => picked && void copyCited(picked.quote),
    card: (gem) => {
      if (!picked) return
      setCarding({ quote: picked.quote.replace(/\s+/g, ' ').trim(), x: picked.x, y: picked.y, bottom: picked.bottom, gem })
      setPicked(null)
      chime('open')
    },
    blank: (gem) => {
      if (!picked) return
      // The words blanked in their sentence, as the menu's preview showed them.
      const { asked, answer } = blankOf(pickedAbout(picked.quote))
      void cardOf(asked, answer, gem)
      getSelection()?.removeAllRanges()
      setPicked(null)
    },
    // Writing help's card and quote, with the article under them as its own cards have it.
    written: {
      where: whereFrom(),
      card: (question, answer) => cardOf(question, answer, false, true),
      gem: (line) => call<string>('nugget:from', `${line}\n\n[${whereFrom().replace(/[[\]]/g, '\\$&')}](${articleLink(href, '')})`, { attribution: byline() || null, medium: whereFrom(), kind: 'quote' })
    },
    lookUp: () => {
      if (!picked) return
      const text = body.current?.textContent ?? ''
      const from = Math.max(0, text.lastIndexOf('.', picked.start) + 1)
      const to = text.indexOf('.', picked.end)
      const sentence = text.slice(from, to < 0 ? undefined : to + 1).replace(/\s+/g, ' ').trim()
      setLooking({ words: picked.quote, x: picked.x, y: picked.y + 24, from: { where: whereFrom() || href, link: articleLink(href, ''), sentence } })
      chime('open')
    }
  }
  // The bar's keys, while words are picked here.
  useToolKeys(picked ? (event) => keysHere(pane) && readKey(event, actions) : null)
  /** A mark's colour changed, or the gem it became. */
  const change = async (one: PdfMark, to: Partial<PdfMark>): Promise<void> => {
    await call('pdf:mark', one.id, to)
    setMarks((all) => all.map((each) => (each.id === one.id ? { ...each, ...to } : each)))
  }
  const keepMark = async (one: PdfMark): Promise<void> => {
    const gemId = await gemOf({ id: one.id, quote: one.quote.replace(/\s+/g, ' ').trim() }, sectionAt(drawn.current.find((each) => each.mark.id === one.id)?.range.startContainer))
    await change(one, { gemId })
    // "Why keep this?" over the highlight itself.
    const band = drawn.current.find((each) => each.mark.id === one.id)?.range.getBoundingClientRect()
    const frame = scroller.current?.getBoundingClientRect()
    if (band && frame && scroller.current) setWhyFor({ id: gemId, x: band.left + band.width / 2 - frame.left, y: band.top - frame.top + scroller.current.scrollTop, bottom: band.bottom - frame.top + scroller.current.scrollTop })
    said('Kept as a gem', true, { type: 'nugget', id: gemId, title: one.quote }, { cue: 'saved' })
  }
  // Every highlight in the article, in reading order: a click brings it into view, lit.
  const [showMarks, setShowMarks] = useState(false)
  /** Every highlight gathered into one new note, in reading order, each with a link back to it. */
  const gather = async (): Promise<void> => {
    const sorted = [...marks].sort((a, b) => a.start - b.start)
    if (!sorted.length) return
    const body = {
      type: 'doc',
      content: sorted.flatMap((one) => [
        { type: 'blockquote', content: [{ type: 'paragraph', content: [{ type: 'text', text: one.quote.replace(/\s+/g, ' ').trim() }] }] },
        { type: 'paragraph', content: [{ type: 'text', text: whereFrom() || href, marks: [{ type: 'link', attrs: { href: articleLink(href, one.id) } }] }] }
      ])
    }
    const id = await window.api.captures.create({ kind: 'note', title: `Highlights from ${article?.title ?? whereFrom()}`, body })
    said(`${plural(sorted.length, 'highlight')} gathered into a note`, true, undefined, { cue: 'saved' })
    window.dispatchEvent(new CustomEvent('haligtree:open', { detail: { type: 'capture', id } }))
  }
  const remove = async (mark: PdfMark): Promise<void> => {
    await call('pdf:unhighlight', mark.id)
    setMarks((all) => all.filter((one) => one.id !== mark.id))
    said(mark.color === 'later' ? 'Card mark removed' : 'Highlight removed', true, undefined, {
      cue: 'away',
      undo: () => void call('pdf:highlight', href, mark).then(() => (setMarks((all) => [...all, mark]), chime('undo')))
    })
  }

  // Asked again (“Read it again” after a stop or a failure, the bar's “Read the page again”, ⌘R): the page is
  // fetched afresh from the site, with its loader.
  const [tries, setTries] = useState(0)
  // The pictures still coming after the words (main/web-articles.ts): this reading's name, and how many are settled.
  const reading = useRef<string | null>(null)
  const [coming, setComing] = useState<{ settled: number; total: number } | null>(null)
  /** What each reading has been told and not yet put in the page: its pictures' places, and its count. */
  const heard = useRef(new Map<string, { places: { at: number; html: string }[]; count?: { settled: number; total: number } }>())
  const hear = (name: string): { places: { at: number; html: string }[]; count?: { settled: number; total: number } } => {
    if (!heard.current.has(name)) heard.current.set(name, { places: [] })
    return heard.current.get(name)!
  }
  /** Each place told for the reading on show put in the page: a picture, its line, or nothing. */
  const settle = (): void => {
    const name = reading.current
    const page = body.current
    if (!name || !page) return
    const told = hear(name)
    for (const { at, html } of told.places.splice(0)) {
      const place = page.querySelector(`img[data-wait="${at}"]`)
      if (html) place?.insertAdjacentHTML('beforebegin', html)
      place?.remove()
    }
    if (told.count) setComing(told.count.settled < told.count.total ? told.count : null)
  }
  useEffect(() => {
    const onPlace = (event: Event): void => {
      const { reading: name, href: of, at, html } = (event as CustomEvent<{ reading: string; href: string; at: number; html: string }>).detail
      if (of !== href) return
      hear(name).places.push({ at, html })
      if (name === reading.current) settle()
    }
    const onCount = (event: Event): void => {
      const { reading: name, href: of, settled, total } = (event as CustomEvent<{ reading: string; href: string; settled: number; total: number }>).detail
      if (of !== href) return
      hear(name).count = { settled, total }
      if (name === reading.current) settle()
    }
    window.addEventListener('haligtree:article-picture', onPlace)
    window.addEventListener('haligtree:article-pictures', onCount)
    return () => (window.removeEventListener('haligtree:article-picture', onPlace), window.removeEventListener('haligtree:article-pictures', onCount))
  }, [href])
  const again = useRef(false)
  useEffect(() => {
    let live = true
    const fresh = again.current
    again.current = false
    void host()
      .fetchArticle?.(href, fresh)
      .then((got) => {
        if (!live) return
        if ('stopped' in got) return setFailed('Stopped: the page was not kept.')
        if (!('article' in got)) return setFailed(got.error)
        // Read again and the site would not give it: the copy kept shows, and why it is not new.
        if (got.error) said(`Not read again: ${got.error} This is the copy kept ${dayOf(got.article.savedAt)}.`)
        titles.set(href, got.article.title)
        window.dispatchEvent(new CustomEvent('haligtree:pdf-title'))
        reading.current = got.reading ?? null
        heard.current = new Map(got.reading && heard.current.has(got.reading) ? [[got.reading, heard.current.get(got.reading)!]] : [])
        setComing(null)
        setArticle(got.article)
      })
    return () => {
      live = false
    }
  }, [href, tries])
  /** The page read from the site again, as it is there now: the loader while it comes, then the new words. */
  const readAgain = (): void => {
    if (!article && !failed) return chime('nope')
    chime('tap')
    again.current = true
    fromTop.current = true
    reading.current = null
    setComing(null)
    setFailed(null)
    setArticle(null)
    setTries((n) => n + 1)
  }
  useEffect(() => {
    const onMenu = (): void => void (keysHere(pane) && readAgain())
    window.addEventListener('haligtree:read-again', onMenu)
    return () => window.removeEventListener('haligtree:read-again', onMenu)
  })

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
      if (!keysHere(pane)) return
      // "/" finds too, and n and N step through what it found, as in a note with Vim's keys (vim-mode.ts): a reader
      // takes no typing, so its plain keys are free.
      const plain = !event.metaKey && !event.ctrlKey && !event.altKey && !writing()
      const stepping = plain && finding && (event.key === 'n' || event.key === 'N')
      if (stepping || (plain && event.key === '/') || (event.metaKey && !event.altKey && !event.shiftKey && event.code === 'KeyF')) {
        event.preventDefault()
        event.stopPropagation()
        if (stepping) return stepFind(event.key === 'N')
        setFinding(true)
        return void requestAnimationFrame(() => findField.current?.select())
      }
      // G and g g go to the end and to the start, as in every list (ui.tsx listEnd): a reader takes no typing.
      const end = plain && !finding ? listEnd(event) : null
      if (end) {
        event.preventDefault()
        event.stopPropagation()
        const box = scroller.current
        return void box?.scrollTo({ top: end === 'first' ? 0 : box.scrollHeight })
      }
      if (!event.metaKey || event.altKey) return
      if (event.code === 'KeyR' && !event.shiftKey && !event.ctrlKey) {
        event.preventDefault()
        event.stopPropagation()
        return readAgain()
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
  const words = useMemo(() => ({ __html: unwrapped(article?.html ?? '', href) }), [article, href, coloured])
  const title = article?.title ?? articleName(href)
  const when = article?.published ? new Date(article.published) : null
  // Each date, and the licence, held on one line: the page's narrower column broke "kept 15 / November 2026" in two.
  const whole = (words: string): string => words.replace(/ /g, ' ')
  // Over the title: the site, and the minutes the article takes (its own words, see minutesOf, counted once a reading);
  // the site is said there, not again in the byline.
  const minutes = useMemo(() => (article ? minutesOf(article.html) : 0), [article])
  // The time it is really read, told to main for Stats and Wrapped (lib/read-time.ts): finished or left part way.
  useReadTime(href, scroller, useMemo(() => (article ? wordsOf(article.html) : 0), [article]))
  const kicker = article ? `${article.site || URL.parse(href)?.hostname || ''} · ${minutes} min read` : ''
  const meta = [
    article?.byline,
    when && !Number.isNaN(when.getTime()) ? whole(dayOf(article!.published)) : '',
    // A wiki's words are free to quote with their source, which a gem's citation names.
    /\.(wikipedia|wiktionary)\.org$/.test(URL.parse(href)?.hostname ?? '') ? whole('CC BY-SA 4.0') : '',
    // Every page read is kept with your notes (main/web-articles.ts): it opens again offline, as it read that day.
    article?.savedAt ? whole(`kept ${dayOf(article.savedAt)}`) : ''
  ]
    .filter(Boolean)
    .join(' · ')

  // The article's sections, from its headings: its contents beside it (as a PDF's outline), the one you are in lit.
  const [outline, setOutline] = useState<OutlineRow[]>([])
  // Before paint, as the width above: the article and its contents arrive in the same frame.
  useLayoutEffect(() => {
    const found = [...(body.current?.querySelectorAll<HTMLElement>('h2, h3, h4') ?? [])].filter((one) => one.textContent?.trim())
    heads.current = found
    setOutline(found.map((one, at) => ({ title: one.textContent!.replace(/\s+/g, ' ').trim(), depth: Number(one.tagName[1]) - 2, page: at + 1 })))
    // Pictures told before the words were in the page take their places now.
    settle()
  }, [words])
  const [sectionHere, setSectionHere] = useState(-1)
  useEffect(() => {
    const box = scroller.current
    if (!box || !outline.length) return
    let frame = 0
    // The last heading at or above the top of what shows, found by halves: a few reads a frame, however long the article.
    const read = (): void => {
      frame = 0
      const line = box.getBoundingClientRect().top + 96
      let low = 0
      let high = heads.current.length - 1
      let at = -1
      while (low <= high) {
        const mid = (low + high) >> 1
        if (heads.current[mid].getBoundingClientRect().top <= line) (at = mid), (low = mid + 1)
        else high = mid - 1
      }
      setSectionHere(at)
    }
    const onScroll = (): void => void (frame ||= requestAnimationFrame(read))
    read()
    box.addEventListener('scroll', onScroll, { passive: true })
    return () => (box.removeEventListener('scroll', onScroll), cancelAnimationFrame(frame))
  }, [outline])
  // Shown beside a long article where there is room; the bar's button shows or hides it here.
  const [rail, setRail] = useState<boolean | null>(null)
  const railShown = outline.length > 1 && (rail ?? (roomy && outline.length > 2))
  const railList = useRef<HTMLElement>(null)
  const goToSection = (page: number): void => {
    heads.current[page - 1]?.scrollIntoView({ block: 'start' })
    chime('tap')
  }

  // A link in the article. One to another page of the same free site (Wikipedia to Wikipedia) is followed here: a step
  // in this pane that Back undoes and Forward takes again. Any other opens in your browser, as a link in a note does.
  // ⌥-click opens either in the reader to the side, ⌘-click a page of the site in a new tab; right-click offers each.
  const follow = (event: React.MouseEvent): void => {
    const link = (event.target as Element).closest?.('a[href]') as HTMLAnchorElement | null
    if (!link || !body.current?.contains(link) || event.button !== 0 || event.shiftKey) return
    event.preventDefault()
    // A drag across a link picks its words: it is not followed.
    if (getSelection()?.isCollapsed === false) return
    const to = link.href
    const site = freeSiteOf(href)
    if (event.altKey && isReadable(to)) return openArticle(to, undefined, 'aside', pane)
    if (site && freeSiteOf(to) === site) return openArticle(to, undefined, event.metaKey ? 'tab' : undefined, pane)
    window.open(to, '_blank', 'noopener')
  }

  return (
    <div ref={root} className="pdf-reader web-reader">
      <style>{MARK_COLORS.map((one) => (one.id === "later" ? `::highlight(${markName(names, one.id)}) { text-decoration: underline dashed var(--tt-brand-color-500, #c08a2e) 2px; text-underline-offset: 3px }` : tint(markName(names, one.id), 28, one.css))).join('') + tint(`${names}-found`, 22, '#8b5cf6') + tint(`${names}-found-now`, 45, '#8b5cf6') + tint(`${names}-flash`, 55)}</style>
      <div className="pdf-reader-bar">
        {/* As the PDF reader's bar: the title takes the free room, so the tools never move as it changes, and the
            section you are in stands beside it as a PDF's chapter does. */}
        <span className="pdf-reader-heading" title={outline[sectionHere] ? `${title}: ${outline[sectionHere].title}` : title}>
          <span className="pdf-reader-title">{title}</span>
          {outline[sectionHere] && <span data-pdf-chapter className="pdf-reader-chapter">{outline[sectionHere].title}</span>}
        </span>
        <span className="pdf-reader-tools">
          {/* Always in its place, so nothing in the bar moves when the article comes; it says why when there is nothing to show. */}
          <Button
            data-style="ghost"
            aria-label="Contents"
            title={outline.length > 1 ? 'Contents' : article ? 'Contents: this page has no sections' : 'Contents: once the page is read'}
            disabled={outline.length < 2}
            data-active-state={railShown ? 'on' : 'off'}
            onClick={() => (chime(railShown ? 'fold' : 'slide'), setRail(!railShown))}
          >
            <PanelLeft className="tiptap-button-icon" />
          </Button>
          {/* In its place from the start too: the highlights come after the page, and a button arriving with them pushed the rest along. */}
          <Button
            data-style="ghost"
            aria-label="Highlights"
            title={marks.length ? `${plural(marks.length, 'highlight')} in this page: list them, to go to each` : 'Highlights: none in this page yet'}
            disabled={!marks.length}
            data-active-state={showMarks && marks.length ? 'on' : 'off'}
            onClick={() => setShowMarks(!showMarks)}
          >
            <Highlighter className="tiptap-button-icon" />
            {/* How many this page has, in a room kept from the start so nothing in the bar moves as the first is made. */}
            <span data-marks-count className="tiptap-button-text min-w-[2ch] text-left tabular-nums">{marks.length || ''}</span>
          </Button>
          <Button
            data-style="ghost"
            aria-label="Read the page again"
            title="Read the page again  ⌘R"
            disabled={!article && !failed}
            onClick={readAgain}
          >
            <RotateCw className="tiptap-button-icon" />
          </Button>
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
        </span>
      </div>
      {/* The words are in and read; the pictures fill their places as each comes, and “Stop” ends the asking. Under
          the bar as a scanned PDF's line is (pdf-scan.tsx), so it is there wherever you have read to. */}
      {coming && (
        <div data-web-coming className="pdf-scan-line">
          <Orb label={`Bringing the pictures, ${num(coming.settled)} of ${num(coming.total)}…`} stop={() => stopJob(`article:${href}`)} />
        </div>
      )}
      {showMarks && marks.length > 0 && (
        <nav className="pdf-outline pdf-marks-list" aria-label="Highlights">
          {[...marks]
            .sort((a, b) => a.start - b.start)
            .map((one) => (
              <button
                key={one.id}
                type="button"
                className={`pdf-outline-row${one.id === flash ? ' is-here' : ''}`}
                data-moved={moved.has(one.id) || undefined}
                onClick={() => (moved.has(one.id) ? said('Its place moved: the article was rewritten, and these words are not in it now. They stay kept here, and in their gem.') : setFlash(one.id))}
              >
                <span aria-hidden className="pdf-swatch" style={{ background: markCss(one.color) }} />
                <span className="pdf-outline-title">{one.quote.replace(/\s+/g, ' ').trim()}</span>
                {moved.has(one.id) && <span className="pdf-outline-page">place moved</span>}
              </button>
            ))}
          <button type="button" className="pdf-outline-row pdf-gather" onClick={() => void gather()}>
            Gather into a note
          </button>
        </nav>
      )}
      {/* The article and, beside it, its contents: the PDF reader's rail and outline, its sections for chapters. */}
      <div className="pdf-reader-body">
      {railShown && (
        <PageLabel.Provider value={NO_PAGE}>
          <PdfRail tab="outline" tabs={[{ id: 'outline', label: 'Contents' }]} onTab={() => undefined}>
            <PdfOutline outline={outline} hereAt={sectionHere} list={railList} onGo={goToSection} />
          </PdfRail>
        </PageLabel.Provider>
      )}
      <div className="pdf-reader-main">
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
              aria-label={`${num(found.length ? at + 1 : 0)} of ${num(found.length)}`}
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
            onClick={follow}
            // A picture kept here drags out as itself, to a note or to Finder, as a picture in a note does (drag-out in main).
            onDragStart={(event) => {
              const img = event.target instanceof HTMLImageElement && body.current?.contains(event.target) ? event.target : null
              const src = img?.getAttribute('src')
              if (!img || !src?.startsWith('haligtree://')) return
              event.preventDefault()
              window.api.dragOut(src, pictureName(img))
            }}
            // A highlight, picked words, a picture and a link have a menu: anywhere else the right click is the page's own.
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
              const link = (event.target as Element).closest?.('a[href]') as HTMLAnchorElement | null
              setLinkHit(link && body.current?.contains(link) ? link.href : null)
              const img = (event.target as Element).closest?.('img') as HTMLImageElement | null
              const kept = img && body.current?.contains(img) && img.getAttribute('src')?.startsWith('haligtree://') ? img : null
              setPictureHit(kept && { src: kept.getAttribute('src')!, name: pictureName(kept), img: kept })
              if (!on && !picked && !kept && !(link && body.current?.contains(link))) event.preventDefault()
            }}
          >
            {/* The page: the pane's width sets its margins and the article's own size its words (pdf.css); its two
                lines come with the article, so nothing on it moves when the contents arrive beside it. */}
            <div className="web-reader-page" style={{ fontSize: `calc(1rem * var(--mf-text-scale, 1) * ${size})` }}>
            <article className="web-reader-column" data-read={article && !failed ? '' : undefined}>
              {failed ? (
                <div className="web-reader-failed" role="status">
                  <p className="web-reader-failed-lead">{failed}</p>
                  <p>
                    The link stays in your note as it was.{' '}
                    <a href={href} target="_blank" rel="noopener noreferrer">
                      {href}
                    </a>
                  </p>
                  <Button data-style="ghost" data-read-again="" onClick={readAgain}>
                    Read it again
                  </Button>
                </div>
              ) : !article ? (
                <p className="web-reader-reading">
                  <Orb label="Reading the page…" stop={() => stopJob(`article:${href}`)} />
                </p>
              ) : (
                <>
                  <p className="web-reader-kicker">{kicker}</p>
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
            </div>
            {carding && (
              <WhyAfter
                at={carding}
                ask={{ kept: `Answer: ${carding.quote.length > 28 ? `${carding.quote.slice(0, 27)}…` : carding.quote}`, label: "The card's question", placeholder: 'The question these words answer', about: carding.quote }}
                onSave={(question) => void cardOf(question, carding.quote, carding.gem)}
                onDone={() => (getSelection()?.removeAllRanges(), setCarding(null))}
              />
            )}
            {whyFor && (
              <WhyAfter at={whyFor} onSave={(why) => void call('gloss', whyFor.id, why).then(() => said('Why kept with the gem'))} onDone={() => setWhyFor(null)} />
            )}
            {looking && (
              <LookUpCard words={looking.words} at={looking} from={looking.from} onClose={() => setLooking(null)} />
            )}
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent>
          {hit ? (
            <MarkMenu
              color={hit.color}
              gem={!!hit.gemId}
              onColor={(color) => void change(hit, { color })}
              onKeep={() => void keepMark(hit)}
              onOpenGem={() =>
                window.dispatchEvent(
                  new CustomEvent('haligtree:open', { detail: { type: 'nugget', id: hit.gemId } })
                )
              }
              onCopy={() => void copyCited(hit.quote)}
              onRemove={() => void remove(hit)}
              about={picked ? undefined : () => ({ words: hit.quote, sentence: hit.quote, where: whereFrom(), by: byline() })}
            />
          ) : null}
          {/* Words picked over a highlight: its own rows first, then what can be done with the words picked. */}
          {hit && picked && <ContextMenuSeparator />}
          {picked && <PickedMenu actions={actions} about={() => pickedAbout(picked.quote)} />}
          {/* A picture: Files' own lines for one (media-view.tsx mediaMenu): look at it, put it in a note, copy it, save a
              copy, keep it in Files, and its words when the Mac reads some. */}
          {pictureHit && !hit && !picked && (
            <>
              <ContextMenuItem data-reader-picture="look" onSelect={() => void openLook(pictureHit.src, pictureHit.img, pictureHit.name)}>Look at it</ContextMenuItem>
              <ContextMenuItem data-reader-picture="put" onSelect={() => setPutting({ src: pictureHit.src, name: pictureHit.name })}>Put in a note…</ContextMenuItem>
              <ContextMenuSeparator />
              <ContextMenuItem data-reader-picture="copy" onSelect={() => void window.api.copyImage(pictureHit.src).then((done) => (done ? (chime('copy'), said('Copied the picture')) : said('Could not copy the picture', false)))}>Copy image</ContextMenuItem>
              {host().saveFileAs && <ContextMenuItem data-reader-picture="save" onSelect={() => void host().saveFileAs?.(pictureHit.src, `${pictureHit.name}.${pictureHit.src.split('.').pop()}`)}>Save a copy</ContextMenuItem>}
              {pictureLines(pictureHit.src).map((one) => <ContextMenuItem key={one.label} onSelect={one.run}>{one.label}</ContextMenuItem>)}
              <ContextMenuSeparator />
              <ContextMenuItem data-reader-picture="keep" onSelect={() => void keepInFiles(pictureHit.src, true)}>Keep in Files</ContextMenuItem>
              {linkHit && <ContextMenuSeparator />}
            </>
          )}
          {/* A link: here, to the side, or the browser, as a link in a note offers them (turn-into/clicked.tsx). */}
          {linkHit && !hit && !picked && (
            <>
              {isReadable(linkHit) && <ContextMenuItem onSelect={() => openArticle(linkHit, undefined, undefined, pane)}>Open in the reader</ContextMenuItem>}
              {isReadable(linkHit) && canSplit() && <ContextMenuItem onSelect={() => openArticle(linkHit, undefined, 'aside', pane)}>Open in the reader to the side</ContextMenuItem>}
              <ContextMenuItem onSelect={() => window.open(linkHit, '_blank', 'noopener')}>Open in the browser</ContextMenuItem>
              <ContextMenuItem onSelect={() => void navigator.clipboard.writeText(linkHit).then(() => said('Link copied'), () => said('Could not copy the link', false))}>Copy link</ContextMenuItem>
            </>
          )}
        </ContextMenuContent>
      </ContextMenu>
      {putting && createPortal(
        <NotePicker menus={false} placeholder={`Put ${quoted(putting.name, 80)} in which note?`}
          onClose={() => setPutting(null)}
          onOpen={(type, id) => {
            const one = putting
            setPutting(null)
            void noteTitle(type, id).then((title) => putInNote([{ src: one.src, kind: 'picture', name: one.name, size: 0 }], type, id, title))
          }} />,
        document.body
      )}
      </div>
      </div>
    </div>
  )
}

/**
 * A highlight's colour: the theme's own brand colour, this much of it, as the
 * PDF reader's marks are on light pages. On a dark theme the same share is
 * lost against the background, so it is half as strong again.
 */
const tint = (name: string, percent: number, color = 'var(--tt-brand-color-500, #c08a2e)'): string =>
  `::highlight(${name}) { background-color: color-mix(in srgb, ${color} ${Math.round(percent * 1.6)}%, transparent) }` +
  `:root:is(.light, .paper, [data-light]) ::highlight(${name}) { background-color: color-mix(in srgb, ${color} ${percent}%, transparent) }`

/**
 * Minutes to read an article: its own words (each run between spaces with a letter or a digit in it, the HTML's tags
 * and marks left out), at the app's one pace (lib/note-size.ts), as a note's size and the Feed say it.
 */
const wordsOf = (html: string): number => html.replace(/<[^>]*>|&[#\w]+;/g, ' ').split(/\s+/).filter((one) => /[\p{L}\p{N}]/u.test(one)).length
const minutesOf = (html: string): number => Math.max(1, minutesToRead(wordsOf(html)))

/** A day as the reader says it: 15 November 2026. */
const dayOf = (iso: string): string => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })

/** The contents' rows carry no page numbers: an article's sections are places in one page. */
const NO_PAGE = (): string => ''

/** Said once, ever: where a highlight goes (mark). */
const TOLD = 'web-highlight-told'
/** A reader picture's name: its words (alt), or its caption, or "Picture". */
const pictureName = (img: HTMLImageElement): string =>
  (img.getAttribute('alt') || img.closest('figure')?.querySelector('figcaption')?.textContent || 'Picture').replace(/\s+/g, ' ').trim().slice(0, 80)

/** The highlight list a colour's marks are drawn by: the book's own is the plain `-mark`. */
const markName = (names: string, color: string | null): string => `${names}-mark${color ? `-${color}` : ''}`

/** What a site groups an article's blocks in: Wikipedia's sections, an article, a plain div. */
const WRAPPER = /^(SECTION|ARTICLE|MAIN|DIV|HEADER|FOOTER)$/
/** Blocks: what may stand on a line of its own in the column (a picture is drawn as one there, pdf.css). */
const BLOCK = /^(P|H[1-6]|UL|OL|DL|TABLE|FIGURE|BLOCKQUOTE|PRE|HR|IMG|SECTION|ARTICLE|MAIN|DIV|HEADER|FOOTER|ASIDE|DETAILS|ADDRESS)$/

/**
 * An article's blocks set straight in the column, as a note's are, so a note's
 * reading rhythm (main.css) reaches every paragraph and heading: a wrapper
 * comes away when it holds only blocks, never a word of its own or a link
 * left loose (two such lines would run together). Only elements go, so the
 * words, and every highlight's place in them, stay exactly as they were.
 */
function unwrapped(html: string, href = ''): string {
  if (!html) return html
  const page = document.createElement('template')
  page.innerHTML = html
  // A link to a place in this same page (Wikipedia's footnote marks): the page set in the column keeps no such
  // places, so its words stay as words, never a link that goes nowhere. The words, and so every highlight's place, are unchanged.
  const self = href.split('#')[0]
  for (const one of page.content.querySelectorAll('a[href*="#"]')) if (one.getAttribute('href')?.split('#')[0] === self) one.replaceWith(...one.childNodes)
  // A link to another page of the same free site (Wikipedia to Wikipedia) opens here, in the reader: it wears no arrow out (pdf.css).
  const site = freeSiteOf(href)
  if (site) for (const one of page.content.querySelectorAll('a[href]')) if (freeSiteOf(one.getAttribute('href')) === site) one.setAttribute('data-reads-here', '')
  // Nothing a reader sees: a space, a note left in the page's code, an empty marker (Wikipedia leaves many).
  const unseen = (node: Node): boolean =>
    node.nodeType === Node.COMMENT_NODE ||
    (!node.textContent?.trim() && !(node.nodeType === Node.ELEMENT_NODE && (node as Element).matches('img, table, hr, :has(img, table, hr)')))
  const plain = (one: Element): boolean =>
    WRAPPER.test(one.tagName) &&
    [...one.childNodes].every((node) => (node.nodeType === Node.ELEMENT_NODE && BLOCK.test((node as Element).tagName)) || unseen(node))
  const lay = (holder: Element | DocumentFragment): void => {
    for (const one of [...holder.children]) {
      if (!plain(one)) continue
      lay(one)
      one.replaceWith(...one.childNodes)
    }
  }
  lay(page.content)
  // A drop cap opens the article (pdf.css) when it opens on a paragraph's own letter: not on a picture, a heading, a
  // quote mark, a number or a link's words. Only a mark is added, so the words stay exactly as they were.
  // (Comments are passed over: a kept article starts with its cleaning's own, main/web-articles.ts CLEANING.)
  const opening = [...page.content.childNodes].find((node) => node.nodeType === Node.ELEMENT_NODE || (node.nodeType === Node.TEXT_NODE && node.textContent?.trim()))
  if (opening?.nodeName === 'P') {
    const walk = page.ownerDocument.createTreeWalker(opening, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT)
    let lead: Node | null = walk.nextNode()
    while (lead && !(lead.nodeType === Node.ELEMENT_NODE && (lead as Element).matches('img, picture, svg, video, iframe')) && !(lead.nodeType === Node.TEXT_NODE && lead.textContent?.trim())) lead = walk.nextNode()
    if (lead?.nodeType === Node.TEXT_NODE && /^\s*\p{L}/u.test(lead.textContent ?? '') && !lead.parentElement?.closest('a')) (opening as Element).setAttribute('data-drop', '')
  }
  // Code coloured as a note's code block is (the editor's hljs colours reach this body, haligtree-editor.scss), by the
  // language the page named or the one it looks like; its words stay exactly as they were, so every highlight's place too.
  const code = [...page.content.querySelectorAll('pre > code')]
  if (code.length && !grammarsIn()) wantGrammars()
  else for (const one of code) {
    const text = one.textContent ?? ''
    const language = one.getAttribute('data-language')
    const tree = (language && lowlight.registered(language) ? lowlight.highlight(language, text) : lowlight.highlightAuto(text)) as unknown as CodeTree
    one.replaceChildren(...painted(tree.children ?? []))
  }
  // The room over a paragraph after a paragraph or a heading (main.css, the reading rhythm), marked as a note's editor
  // marks its own: a page's paragraphs carry no "mf-p", so since the rhythm named it they sat with no room between them.
  markRoom(page.content)
  return page.innerHTML
}

/** What lowlight answers: spans naming their colours round the words. */
type CodeTree = { type: string; value?: string; children?: CodeTree[]; properties?: { className?: string[] } }
const painted = (parts: CodeTree[]): Node[] =>
  parts.map((part) => {
    if (!part.children) return document.createTextNode(part.value ?? '')
    const span = document.createElement('span')
    span.className = (part.properties?.className ?? []).join(' ')
    span.append(...painted(part.children))
    return span
  })

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
