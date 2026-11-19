import { DARK_PAGE, useDarkPages, useOneInColour, type PageLayout } from "./paper"
import { truePictures } from "./pdf-pages"
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { ChevronRight } from "lucide-react"
import { Tree, treeOf, type TreeNode } from "@/components/haligtree/branches"
import { Highlight, useChosen, useFluidHover, Weighted } from "@/components/haligtree/glide"
import { spring } from "@/lib/motion"
import { BackToTop } from "@/components/haligtree/ui"
import { glideIntoView } from "@/lib/glide-into-view"
import type { PDFDocumentProxy } from "pdfjs-dist"
import { THUMB, drawInTurn, whenStill } from "./pdf-draw"
import { usePageLabel } from "./pdf-labels"

/** Which list the rail shows: the pages small, or the PDF's own outline. Highlights are in Details. */
export type RailTab = "pages" | "outline"

/** The rail's width, as you last dragged it: between a narrow column of pages and a wide list. */
export const NARROW = 152
const WIDE = 360
export const railWidth = (): number => Math.min(WIDE, Math.max(NARROW, Number(localStorage.getItem("pdf-rail-width")) || 200))

/**
 * Beside the pages, never over them: the left rail of Preview, Zotero and
 * Skim. Its tabs along the top, its list under them, and its right edge
 * dragged to make it wider or narrower, remembered for every PDF.
 */
export function PdfRail({ tab, tabs, onTab, narrow, onDrag, children }: { tab: RailTab; tabs: { id: RailTab; label: string }[]; onTab: (tab: RailTab) => void; narrow?: boolean; onDrag?: () => void; children: React.ReactNode }): React.JSX.Element {
  const [own, setWidth] = useState(railWidth)
  // A narrow pane squeezes it to its narrowest on its own (pdf-reader.tsx); a drag is a choice that wins.
  const width = narrow ? NARROW : own
  const [list, setList] = useState<HTMLDivElement | null>(null)
  useEffect(() => (list ? handOn(list) : undefined), [list])
  // "Only this page in colour" (the reader's View menu): the other thumbnails greyed by one rule in pdf.css, nothing drawn again.
  const [oneInColour] = useOneInColour()
  const drag = (event: React.PointerEvent<HTMLDivElement>): void => {
    event.preventDefault()
    onDrag?.()
    const from = event.clientX - width
    const handle = event.currentTarget
    handle.setPointerCapture(event.pointerId)
    let now = width
    const move = (moved: PointerEvent): void => setWidth((now = Math.min(WIDE, Math.max(NARROW, moved.clientX - from))))
    const up = (): void => {
      handle.removeEventListener("pointermove", move)
      localStorage.setItem("pdf-rail-width", String(Math.round(now)))
    }
    handle.addEventListener("pointermove", move)
    handle.addEventListener("pointerup", up, { once: true })
  }
  return (
    <aside className="pdf-rail" data-narrow={narrow ? "" : undefined} data-one-in-colour={oneInColour ? "" : undefined} style={{ width }} aria-label="Sidebar">
      {/* One list alone needs no tab: a lone full-width "Pages" tab only said what the list already shows. */}
      {tabs.length > 1 && <div className="pdf-rail-tabs" role="tablist">
        {tabs.map((one) => (
          <button key={one.id} type="button" role="tab" aria-selected={one.id === tab} className="pdf-rail-tab" onClick={() => onTab(one.id)}>
            {one.label}
          </button>
        ))}
      </div>}
      {/* A long list fades at the edge where there is more, and offers the way back up, as every list does. */}
      <div ref={setList} className="pdf-rail-list mf-more" role="tabpanel">
        {children}
      </div>
      <BackToTop target={list} />
      <div className="pdf-rail-edge" role="separator" aria-orientation="vertical" aria-label="Sidebar width" onPointerDown={drag} />
    </aside>
  )
}

/**
 * The person's hand on the rail: from a wheel that can move it, or a press on it, for as long as the
 * pointer stays on the rail, the press is held, or the scroll it set going (a trackpad's glide) has
 * not ended. While it is held, a page turned is owed rather than glided to, so the rail never pulls
 * against the hand. It is let go when the pointer leaves the rail and its scroll has ended, when the
 * press is let go, or when you act anywhere else (a key, a wheel or a press on the pages); then the
 * rail glides to the page you are on. A wheel or a press with no page turned owes nothing: the rail
 * stays where it was left. All from the person's own events, never a guess at how long they pause.
 */
type Hand = { held: boolean; down: boolean; moving: boolean; over: boolean; owed: boolean }
const hands = new WeakMap<Element, Hand>()
const ELSEWHERE = ["keydown", "wheel", "pointerdown"] as const
function handOn(list: HTMLElement): () => void {
  const hand: Hand = { held: false, down: false, moving: false, over: false, owed: false }
  hands.set(list, hand)
  const letGo = (): void => {
    if (!hand.held || hand.down || hand.moving || hand.over) return
    hand.held = false
    if (!hand.owed) return
    hand.owed = false
    // The page you are on, or in the Outline the chapter you are in: whichever the rail shows.
    const thumb = list.querySelector<HTMLElement>(".pdf-thumb.is-here")
    glideIntoView(thumb ?? list.querySelector<HTMLElement>("[data-outline-row][aria-current]"), { centre: !!thumb })
  }
  const wheel = (event: WheelEvent): void => {
    const room = list.scrollHeight - list.clientHeight
    // A wheel against an end moves nothing and so never ends a scroll: it holds nothing either.
    if (!event.deltaY || (event.deltaY < 0 ? list.scrollTop <= 0 : list.scrollTop >= room - 1)) return
    hand.held = hand.moving = hand.over = true
  }
  const down = (event: PointerEvent): void => void (event.button === 0 && (hand.held = hand.down = true))
  const up = (): void => {
    if (!hand.down) return
    hand.down = false
    // A press is a choice made (a page picked): the rail follows it at once, wherever the pointer rests.
    hand.over = false
    letGo()
  }
  const leave = (): void => {
    hand.over = false
    letGo()
  }
  const ended = (): void => {
    hand.moving = false
    letGo()
  }
  // Acting anywhere but the rail (reading on with a key, a wheel or a press on the pages) lets it go.
  const elsewhere = (event: Event): void => {
    if (!hand.held || hand.down || list.contains(event.target as Node)) return
    hand.over = hand.moving = false
    letGo()
  }
  list.addEventListener("wheel", wheel, { passive: true })
  list.addEventListener("pointerdown", down)
  list.addEventListener("pointerleave", leave)
  list.addEventListener("scrollend", ended)
  window.addEventListener("pointerup", up, true)
  window.addEventListener("pointercancel", up, true)
  for (const way of ELSEWHERE) window.addEventListener(way, elsewhere, { capture: true, passive: true })
  return () => {
    hands.delete(list)
    list.removeEventListener("wheel", wheel)
    list.removeEventListener("pointerdown", down)
    list.removeEventListener("pointerleave", leave)
    list.removeEventListener("scrollend", ended)
    window.removeEventListener("pointerup", up, true)
    window.removeEventListener("pointercancel", up, true)
    for (const way of ELSEWHERE) window.removeEventListener(way, elsewhere, { capture: true })
  }
}

/**
 * The page you are on kept in the rail's middle, except near the book's ends, where the rail's
 * own ends stop it: one glide per page turned, owed while your hand is on the rail.
 */
function centreHere(row: HTMLElement | null, jump: boolean, centre = true): void {
  const list = row?.closest(".pdf-rail-list")
  const hand = list ? hands.get(list) : undefined
  if (hand?.held) return void (hand.owed = true)
  glideIntoView(row, { jump, centre })
}

/**
 * Which thumbnails are near the rail's view (100px either side), worked out from the rail's own scroll: the thumbnails
 * lie in page order, so the first in view is found by halving, and only those in view are looked at. A watcher on each
 * thumbnail (1,011 for a 1,000-page book) made the window weigh every one of them on every frame anything on screen
 * moved, halving the frame rate of a sweep along the Details page strip (qa/page-strip.mjs).
 */
type Watched = { el: Element; tell: (seen: boolean) => void }
type Rail = { all: Set<Watched>; order: Watched[] | null; shown: Set<Watched>; frame: number; stop: () => void }
const rails = new Map<Element, Rail>()
const MARGIN = 100
function look(rail: Rail, list: Element): void {
  rail.frame = 0
  rail.order ??= [...rail.all].sort((a, b) => (a.el.compareDocumentPosition(b.el) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1))
  const order = rail.order
  const box = list.getBoundingClientRect()
  const top = box.top - MARGIN
  const bottom = box.bottom + MARGIN
  let lo = 0
  let hi = order.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (order[mid].el.getBoundingClientRect().bottom < top) lo = mid + 1
    else hi = mid
  }
  const now = new Set<Watched>()
  // A rail with no height (hidden) shows none.
  if (box.height > 0) for (let i = lo; i < order.length && order[i].el.getBoundingClientRect().top <= bottom; i++) now.add(order[i])
  for (const one of rail.shown) if (!now.has(one)) one.tell(false)
  for (const one of now) if (!rail.shown.has(one)) one.tell(true)
  rail.shown = now
}
function nearView(el: Element, tell: (seen: boolean) => void): () => void {
  const list = el.closest(".pdf-rail-list")
  if (!list) return () => {}
  let rail = rails.get(list)
  if (!rail) {
    const made: Rail = { all: new Set(), order: null, shown: new Set(), frame: 0, stop: () => {} }
    const soon = (): void => void (made.frame ||= requestAnimationFrame(() => look(made, list)))
    const size = new ResizeObserver(soon)
    size.observe(list)
    list.addEventListener("scroll", soon, { passive: true })
    made.stop = () => (size.disconnect(), list.removeEventListener("scroll", soon), cancelAnimationFrame(made.frame))
    rails.set(list, made)
    rail = made
  }
  const one: Watched = { el, tell }
  const it = rail
  it.all.add(one)
  it.order = null
  it.frame ||= requestAnimationFrame(() => look(it, list))
  return () => {
    it.all.delete(one)
    it.shown.delete(one)
    it.order = null
    if (!it.all.size) (it.stop(), rails.delete(list))
  }
}

/**
 * One page small, drawn only once it scrolls into the rail's view: a long
 * book never draws hundreds of pages it is not showing. Drawn again only when
 * its own props change: a page turned redraws the two thumbnails whose "here"
 * changed, never all of a 1,011-page book's on every page passed.
 */
export const PdfThumb = memo(function PdfThumb({ doc, page, here, onGo }: { doc: PDFDocumentProxy; page: number; here: boolean; onGo: (page: number) => void }): React.JSX.Element {
  const box = useRef<HTMLButtonElement>(null)
  const label = usePageLabel()
  const canvas = useRef<HTMLCanvasElement>(null)
  const [shape, setShape] = useState(1.3)
  // Near the rail's view now: a thumbnail scrolled past stops waiting for its turn.
  const [seen, setSeen] = useState(false)
  // The width it was last drawn at, in pixels: drawn again only when the rail grows past it.
  const drawnAt = useRef(0)
  // Dark pages reach the strip too: a thumbnail is the page it stands for.
  const [dark] = useDarkPages()
  const drawnDark = useRef(false)
  useEffect(() => {
    const el = box.current
    if (!el) return
    return nearView(el, setSeen)
  }, [])
  useEffect(() => {
    if (!seen) return
    // At the rail's own width times the screen's density: sharp, and no more pixels than are shown.
    const wide = Math.round((canvas.current?.parentElement?.clientWidth || NARROW) * (window.devicePixelRatio || 1))
    if (drawnAt.current >= wide && drawnDark.current === dark) return
    let live = true
    let stop = (): void => {}
    let drop = (): void => {}
    // After every page in view: the thumbnails wait their turn behind them, and for the pages to rest from a scroll.
    const unwait = whenStill(() => void (drop = drawInTurn(THUMB, async (stopped) => {
      const one = await doc.getPage(page)
      const flat = one.getViewport({ scale: 1 })
      if (!live || stopped() || !canvas.current) return
      setShape(flat.height / flat.width)
      const viewport = one.getViewport({ scale: wide / flat.width })
      // Drawn off to the side, so a cancelled one never leaves half a picture.
      const off = document.createElement("canvas")
      off.width = Math.round(viewport.width)
      off.height = Math.round(viewport.height)
      const render = one.render({ canvas: off, viewport, ...(dark ? { pageColors: DARK_PAGE } : {}) })
      stop = () => render.cancel()
      await render.promise
      if (dark) await truePictures(one, viewport, off, 1)
      const shown = canvas.current
      if (!live || !shown) return
      shown.width = off.width
      shown.height = off.height
      shown.getContext("2d")?.drawImage(off, 0, 0)
      // Drawn: the page strip's picture (book-links.tsx) copies it rather than drawing the page again.
      shown.dataset.drawn = dark ? "dark" : "light"
      drawnAt.current = wide
      drawnDark.current = dark
    })))
    return () => {
      live = false
      unwait()
      drop()
      stop()
    }
  }, [seen, doc, page, dark])
  // The rail follows the page you are on with a calm glide, keeping it in the middle; opened on a page, it is simply there.
  const shownOnce = useRef(false)
  useEffect(() => {
    // Always a glide once the rail has shown, the pages flung too: a new page while gliding bends the same glide toward
    // it (glide-into-view.ts), where a jump per page passed snapped the rail and its ring (the user, 18 Nov: "too abrupt").
    if (here) centreHere(box.current, !shownOnce.current)
    shownOnce.current = true
  }, [here])
  return (
    <button ref={box} type="button" className={`pdf-thumb${here ? " is-here" : ""}`} data-thumb-page={page} aria-label={`Page ${label(page)}`} aria-current={here ? "page" : undefined} onClick={() => onGo(page)}>
      <span className="pdf-thumb-sheet" style={{ aspectRatio: `1 / ${shape}` }}>
        <canvas ref={canvas} />
      </span>
      <span className="pdf-thumb-number">{label(page)}</span>
    </button>
  )
})

/** One entry of a PDF's own outline: its title, how deep it sits, and the page it starts on. */
export type OutlineRow = { title: string; depth: number; page: number }

/** A PDF's own outline, read once its document is loaded: none when it has none. */
export function usePdfOutline(doc: PDFDocumentProxy | null): OutlineRow[] {
  const [outline, setOutline] = useState<OutlineRow[]>([])
  useEffect(() => {
    if (!doc) return
    let live = true
    const pageOf = async (dest: unknown): Promise<number | null> => {
      const explicit = typeof dest === "string" ? await doc.getDestination(dest) : dest
      const ref = Array.isArray(explicit) ? explicit[0] : null
      if (!ref) return null
      return typeof ref === "number" ? ref + 1 : (await doc.getPageIndex(ref)) + 1
    }
    type Item = { title: string; dest: unknown; items: Item[] }
    const flat = async (items: Item[], depth: number): Promise<OutlineRow[]> => {
      const rows: OutlineRow[] = []
      for (const item of items) {
        const page = await pageOf(item.dest).catch(() => null)
        if (page) rows.push({ title: item.title, depth, page })
        rows.push(...(await flat(item.items ?? [], depth + 1)))
      }
      return rows
    }
    void doc.getOutline().then(async (items) => {
      const rows = items ? await flat(items as Item[], 0) : []
      if (live) setOutline(rows)
    })
    return () => {
      live = false
    }
  }, [doc])
  return outline
}

/**
 * The chapter a page is in: the outline's latest entry that starts on or
 * before it, so every page of a chapter lights it, not only its first.
 */
export const chapterAt = (outline: OutlineRow[], page: number): number =>
  outline.reduce((at, row, index) => (row.page <= page && (at < 0 || row.page >= outline[at].page) ? index : at), -1)

/**
 * The rail with its lists: the pages small, or the outline with the chapter
 * you are in lit. One for the reader and for a PDF shown in a note.
 */
/** A book's spreads as it opens: the cover alone, then two pages a spread. */
const spreadsOf = (count: number): number[][] => [[1], ...Array.from({ length: Math.ceil((count - 1) / 2) }, (_, at) => [2 + at * 2, 3 + at * 2].filter((one) => one <= count))]

export function PdfSide({ doc, page, outline, tab, onTab, onGo, narrow, onDrag, layout }: { doc: PDFDocumentProxy; page: number; outline: OutlineRow[]; tab: RailTab; onTab: (tab: RailTab) => void; onGo: (page: number) => void; narrow?: boolean; onDrag?: () => void; /** How the pages lie: the thumbnails follow it (it is chosen in the bar's "View" menu, its one home). */ layout?: PageLayout }): React.JSX.Element {
  const hereAt = chapterAt(outline, page)
  const shown = tab === "outline" && !outline.length ? "pages" : tab
  // One handler for every thumbnail that never changes, so a page turned leaves the others as they were.
  const goNow = useRef(onGo)
  goNow.current = onGo
  const goTo = useCallback((to: number) => goNow.current(to), [])
  // The chapter lit comes into view in the rail, as Preview's does.
  const list = useRef<HTMLElement>(null)
  const shownWas = useRef<RailTab | null>(null)
  useEffect(() => {
    // Held off while the person's hand is on the rail, as the pages' glide is, and owed till it lets go.
    centreHere(list.current?.querySelector<HTMLElement>("[data-outline-row][aria-current]") ?? null, shownWas.current !== shown, false)
    shownWas.current = shown
  }, [hereAt, shown])
  return (
    <PdfRail tab={shown} tabs={[{ id: "pages", label: "Pages" }, ...(outline.length ? [{ id: "outline" as const, label: "Outline" }] : [])]} onTab={onTab} narrow={narrow} onDrag={onDrag}>
      {/* In "Two pages" the thumbnails lie as the spread does: the cover alone on the right, then pairs. */}
      {shown === "pages" && layout === "spread"
        ? spreadsOf(doc.numPages).map((pair) => (
            <div key={pair.join("-")} className="pdf-thumb-pair" data-thumb-pair={pair.join("-")}>
              {pair[0] === 1 && <span aria-hidden className="pdf-thumb-gap" />}
              {pair.map((one) => <PdfThumb key={one} doc={doc} page={one} here={one === page} onGo={goTo} />)}
            </div>
          ))
        : shown === "pages" && Array.from({ length: doc.numPages }, (_, index) => <PdfThumb key={index} doc={doc} page={index + 1} here={index + 1 === page} onGo={goTo} />)}
      {shown === "outline" && <PdfOutline outline={outline} hereAt={hereAt} list={list} onGo={goTo} />}
    </PdfRail>
  )
}

/**
 * The PDF's outline as the sidebar draws a nest: each level hung off a thin
 * trunk with a curved branch to each entry, the way down to the chapter you
 * are in lit, a chapter's sections folded under its chevron, and the same
 * rows, light and hover as the sidebar's. An article's sections in the web
 * reader are drawn by it too, with no page numbers (PageLabel gives none).
 */
export const PdfOutline = memo(function PdfOutline({ outline, hereAt, list, onGo }: { outline: OutlineRow[]; hereAt: number; list: React.RefObject<HTMLElement | null>; onGo: (page: number) => void }): React.JSX.Element {
  const tree = useMemo(() => treeOf(outline, (row) => row.depth), [outline])
  const label = usePageLabel()
  // Folded by you; a chapter you read your way into opens again, so the lit way down is never hidden.
  const [folded, setFolded] = useState<Set<number>>(() => new Set())
  useEffect(() => {
    setFolded((was) => {
      const opened = [...was].filter((at) => at < hereAt && outline.slice(at + 1, hereAt + 1).every((row) => row.depth > outline[at].depth))
      if (!opened.length) return was
      const next = new Set(was)
      for (const at of opened) next.delete(at)
      return next
    })
  }, [hereAt, outline])
  const hover = useFluidHover(list, { items: "[data-outline-row]:not([inert] *)" })
  const chosen = useChosen(list, "[data-outline-row][aria-current]", `${hereAt}:${folded.size}`)
  const fold = (at: number, open: boolean): void =>
    setFolded((was) => {
      const next = new Set(was)
      if (open) next.add(at)
      else next.delete(at)
      return next
    })
  // A row of two lines takes its branch at its first line, as a row of one does: half a line under its top padding.
  const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16
  const row = ({ at, item, kids }: TreeNode<OutlineRow>): React.JSX.Element => {
    const open = !folded.has(at)
    const here = at === hereAt
    return (
      <button key={at} type="button" data-outline-row data-outline-title={item.title} data-twig-top={rem * 0.875} aria-current={here ? "location" : undefined}
        // The whole title as a tip only when the row cuts it short (a squeezed rail): never words already on show.
        onPointerEnter={(event) => { const row = event.currentTarget; row.title = [row, ...row.querySelectorAll("*")].some((one) => one.scrollWidth > one.clientWidth + 1 || one.scrollHeight > one.clientHeight + 2) ? item.title : "" }}
        onClick={() => onGo(item.page)}
        // A step under the tabs over it (13px, 500): the outline in meta size, the page you are in only in ink and weight,
        // the others in the stronger quiet ink and their page numbers in the quiet one, each 4.5:1 or more.
        className={`flex min-w-0 items-start gap-2.5 rounded-md px-2 py-1.5 text-left text-xs leading-4 ${here ? "text-foreground" : "text-(--mf-muted-strong)"}`}>
        <Weighted on={here} className="min-w-0 *:line-clamp-2 *:whitespace-normal *:break-words">{item.title}</Weighted>
        {kids.length > 0 && (
          <span data-outline-fold role="button" aria-label={open ? "Fold" : "Unfold"} aria-expanded={open}
            className="-mx-0.5 grid h-4 shrink-0 cursor-pointer place-items-center rounded-md p-0.5 text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground"
            onClick={(event) => (event.stopPropagation(), fold(at, open))}>
            <ChevronRight aria-hidden className={`size-3 transition-[rotate] duration-80 ${open ? "rotate-90" : ""}`} />
          </span>
        )}
        <span className="ml-auto shrink-0 pl-1 text-[0.6875rem] leading-4 tabular-nums text-muted-foreground">{label(item.page)}</span>
      </button>
    )
  }
  return (
    <nav ref={list} {...hover.handlers} className="pdf-outline relative isolate" aria-label="Outline">
      <Highlight chosen={chosen} travel={spring.moderate} className="bg-accent" />
      <Highlight light={hover.light} />
      <div className="-ml-3"><Tree nodes={tree} here={hereAt} row={row} open={(node) => !folded.has(node.at)} className="ml-5 flex flex-col gap-px" /></div>
    </nav>
  )
})
