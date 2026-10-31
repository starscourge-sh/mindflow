import { useEffect, useMemo, useRef, useState } from "react"
import { ChevronRight } from "lucide-react"
import { Branches } from "@/components/haligtree/branches"
import { Highlight, Unfold, useChosen, useFluidHover, Weighted } from "@/components/haligtree/glide"
import { spring } from "@/lib/motion"
import type { PDFDocumentProxy } from "pdfjs-dist"

/** Which list the rail shows: the pages small, or the PDF's own outline. Highlights are in Details. */
export type RailTab = "pages" | "outline"

/** The rail's width, as you last dragged it: between a narrow column of pages and a wide list. */
const NARROW = 152
const WIDE = 360
export const railWidth = (): number => Math.min(WIDE, Math.max(NARROW, Number(localStorage.getItem("pdf-rail-width")) || 200))

/**
 * Beside the pages, never over them: the left rail of Preview, Zotero and
 * Skim. Its tabs along the top, its list under them, and its right edge
 * dragged to make it wider or narrower, remembered for every PDF.
 */
export function PdfRail({ tab, tabs, onTab, children }: { tab: RailTab; tabs: { id: RailTab; label: string }[]; onTab: (tab: RailTab) => void; children: React.ReactNode }): React.JSX.Element {
  const [width, setWidth] = useState(railWidth)
  const drag = (event: React.PointerEvent<HTMLDivElement>): void => {
    event.preventDefault()
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
    <aside className="pdf-rail" style={{ width }} aria-label="Sidebar">
      <div className="pdf-rail-tabs" role="tablist">
        {tabs.map((one) => (
          <button key={one.id} type="button" role="tab" aria-selected={one.id === tab} className="pdf-rail-tab" onClick={() => onTab(one.id)}>
            {one.label}
          </button>
        ))}
      </div>
      <div className="pdf-rail-list" role="tabpanel">
        {children}
      </div>
      <div className="pdf-rail-edge" role="separator" aria-orientation="vertical" aria-label="Sidebar width" onPointerDown={drag} />
    </aside>
  )
}

/**
 * One page small, drawn only once it scrolls into the rail's view: a long
 * book never draws hundreds of pages it is not showing.
 */
export function PdfThumb({ doc, page, here, onGo }: { doc: PDFDocumentProxy; page: number; here: boolean; onGo: () => void }): React.JSX.Element {
  const box = useRef<HTMLButtonElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const [shape, setShape] = useState(1.3)
  const [seen, setSeen] = useState(false)
  useEffect(() => {
    const el = box.current
    if (!el) return
    const watch = new IntersectionObserver(([one]) => one.isIntersecting && setSeen(true), { rootMargin: "300px 0px" })
    watch.observe(el)
    return () => watch.disconnect()
  }, [])
  useEffect(() => {
    if (!seen) return
    let live = true
    let task: { cancel: () => void } | null = null
    void doc.getPage(page).then((one) => {
      const flat = one.getViewport({ scale: 1 })
      if (!live || !canvas.current) return
      setShape(flat.height / flat.width)
      // As wide as the rail at its widest: sharp on a Retina screen at the usual width.
      const viewport = one.getViewport({ scale: WIDE / flat.width })
      canvas.current.width = Math.round(viewport.width)
      canvas.current.height = Math.round(viewport.height)
      const ink = canvas.current.getContext("2d")
      if (!ink) return
      const render = one.render({ canvasContext: ink, viewport, canvas: canvas.current })
      task = render
      render.promise.catch(() => {})
    })
    return () => {
      live = false
      task?.cancel()
    }
  }, [seen, doc, page])
  useEffect(() => {
    if (here) box.current?.scrollIntoView({ block: "nearest" })
  }, [here])
  return (
    <button ref={box} type="button" className={`pdf-thumb${here ? " is-here" : ""}`} aria-label={`Page ${page}`} aria-current={here ? "page" : undefined} onClick={onGo}>
      <span className="pdf-thumb-sheet" style={{ aspectRatio: `1 / ${shape}` }}>
        <canvas ref={canvas} />
      </span>
      <span className="pdf-thumb-number">{page}</span>
    </button>
  )
}

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
export function PdfSide({ doc, page, outline, tab, onTab, onGo }: { doc: PDFDocumentProxy; page: number; outline: OutlineRow[]; tab: RailTab; onTab: (tab: RailTab) => void; onGo: (page: number) => void }): React.JSX.Element {
  const hereAt = chapterAt(outline, page)
  const shown = tab === "outline" && !outline.length ? "pages" : tab
  // The chapter lit comes into view in the rail, as Preview's does.
  const list = useRef<HTMLElement>(null)
  useEffect(() => {
    list.current?.querySelector<HTMLElement>("[data-outline-row][aria-current]")?.scrollIntoView({ block: "nearest" })
  }, [hereAt, shown])
  return (
    <PdfRail tab={shown} tabs={[{ id: "pages", label: "Pages" }, ...(outline.length ? [{ id: "outline" as const, label: "Outline" }] : [])]} onTab={onTab}>
      {shown === "pages" && Array.from({ length: doc.numPages }, (_, index) => <PdfThumb key={index} doc={doc} page={index + 1} here={index + 1 === page} onGo={() => onGo(index + 1)} />)}
      {shown === "outline" && <PdfOutline outline={outline} hereAt={hereAt} list={list} onGo={onGo} />}
    </PdfRail>
  )
}

/** One entry of the outline with the entries under it. */
type OutlineNode = { at: number; row: OutlineRow; kids: OutlineNode[] }

/** The flat rows, each depth a step down, back into a tree: an entry holds every deeper one after it. */
function treeOf(outline: OutlineRow[]): OutlineNode[] {
  const top: OutlineNode[] = []
  const path: OutlineNode[] = []
  outline.forEach((row, at) => {
    const node: OutlineNode = { at, row, kids: [] }
    while (path.length && path[path.length - 1].row.depth >= row.depth) path.pop()
    ;(path.length ? path[path.length - 1].kids : top).push(node)
    path.push(node)
  })
  return top
}

const holds = (node: OutlineNode, at: number): boolean => node.at === at || node.kids.some((one) => holds(one, at))

/**
 * The PDF's outline as the sidebar draws a nest: each level hung off a thin
 * trunk with a curved branch to each entry, the way down to the chapter you
 * are in lit, a chapter's sections folded under its chevron, and the same
 * rows, light and hover as the sidebar's.
 */
function PdfOutline({ outline, hereAt, list, onGo }: { outline: OutlineRow[]; hereAt: number; list: React.RefObject<HTMLElement | null>; onGo: (page: number) => void }): React.JSX.Element {
  const tree = useMemo(() => treeOf(outline), [outline])
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
  const level = (nodes: OutlineNode[]): React.JSX.Element => (
    <Branches current={nodes.findIndex((one) => holds(one, hereAt))} className="ml-5 flex flex-col gap-px">
      {nodes.flatMap((node) => {
        const open = !folded.has(node.at)
        const here = node.at === hereAt
        return [
          <button key={node.at} type="button" data-outline-row aria-current={here ? "location" : undefined} title={node.row.title}
            onClick={() => onGo(node.row.page)}
            className={`flex min-w-0 items-center gap-2.5 rounded-md px-2 py-1.5 text-left ${here ? "text-foreground" : "text-foreground/80"}`}>
            <Weighted on={here} className="min-w-0">{node.row.title}</Weighted>
            {node.kids.length > 0 && (
              <span data-outline-fold role="button" aria-label={open ? "Fold" : "Unfold"} aria-expanded={open}
                className="-m-0.5 grid shrink-0 cursor-pointer place-items-center rounded-sm p-0.5 text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground"
                onClick={(event) => (event.stopPropagation(), fold(node.at, open))}>
                <ChevronRight aria-hidden className={`size-3 transition-[rotate] duration-80 ${open ? "rotate-90" : ""}`} />
              </span>
            )}
            <span className="ml-auto shrink-0 pl-1 text-xs tabular-nums text-muted-foreground">{node.row.page}</span>
          </button>,
          node.kids.length > 0 && (
            <Unfold key={`${node.at}:in`} open={open}>
              <div data-no-twig="">{level(node.kids)}</div>
            </Unfold>
          )
        ]
      })}
    </Branches>
  )
  return (
    <nav ref={list} {...hover.handlers} className="pdf-outline relative isolate" aria-label="Outline">
      <Highlight spot={chosen.spot} snap={chosen.snap} travel={spring.moderate} className="bg-accent" />
      <Highlight spot={hover.spot} session={hover.session} snap={hover.snap} from={chosen.spot} />
      <div className="-ml-3">{level(tree)}</div>
    </nav>
  )
}
