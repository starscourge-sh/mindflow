import { useEffect, useMemo, useState } from "react"
import { labelFor } from "./pdf-labels"
import { call } from "@/lib/haligtree"
import { chime } from "@/lib/sound"
import { notes, type MapEdge } from "@/lib/notes"
import { openAside } from "@/lib/split"
import { Island } from "@/components/haligtree/ui"
import { GraphCanvas, type Graph } from "@/components/haligtree/graph-canvas"
import { plural } from '../../../../main/dates'
export { pdfIn } from "@/lib/pdf-in"

/** A note, gem or card that holds a book or links into it: the pages it links to, in order, and the line it does it in. */
export type Cited = { type: string; id: string; title: string; at: string; pages: number[]; line: string }

/** Every note, gem and card that holds or links into a book, in page order through it; read again when `again` changes. */
export function useCited(src: string, again?: unknown): Cited[] {
  return useCitedRead(src, again) ?? NONE
}
const NONE: Cited[] = []

/** The same, null until the book's are first read: a panel says "none yet" only once it knows (it said so, then showed rows). */
export function useCitedRead(src: string, again?: unknown): Cited[] | null {
  const [cited, setCited] = useState<{ src: string; rows: Cited[] } | null>(null)
  useEffect(() => {
    let live = true
    const load = (): void => void call<Cited[]>("pdf:cited", src).then((rows) => live && setCited({ src, rows }))
    load()
    const stop = window.api.captures.onChange(load)
    return () => {
      live = false
      stop()
    }
  }, [src, again])
  return cited?.src === src ? cited.rows : null
}

export const pagesOf = (pages: number[], label: (n: number) => string = String): string => (!pages.length ? "Holds it" : pages.length === 1 ? `p. ${label(pages[0])}` : pages.length === 2 ? `pp. ${label(pages[0])}, ${label(pages[1])}` : `pp. ${label(pages[0])}, ${label(pages[1])} +${pages.length - 2}`)

export const open = (one: Pick<Cited, "type" | "id">, aside: boolean): void => {
  chime("page")
  if (aside) openAside(one.type, one.id)
  else window.dispatchEvent(new CustomEvent("haligtree:open", { detail: { type: one.type, id: one.id } }))
}

export /** The book in the middle, what links into it around it, and the links among those: one map for the book's details and a note's. */
function useBookGraph(src: string, title: string, around: Cited[]): (Graph & { among: number }) | null {
  const [all, setAll] = useState<Awaited<ReturnType<typeof notes.map>> | null>(null)
  const ids = around.map((one) => one.id).join(" ")
  useEffect(() => {
    let live = true
    if (ids) void notes.map().then((map) => live && setAll(map))
    return () => void (live = false)
  }, [ids])
  return useMemo<(Graph & { among: number }) | null>(() => {
    if (!around.length) return null
    const known = new Map(all?.nodes.map((node) => [node.id, node]) ?? [])
    const here = new Set(around.map((one) => one.id))
    const edges: MapEdge[] = around.map((one) => [src, one.id, Math.max(1, one.pages.length)])
    const among = (all?.edges ?? []).filter(([a, b]) => a !== src && b !== src && here.has(a) && here.has(b))
    return {
      nodes: [
        { type: "pdf", id: src, title, kind: "pdf", links: around.length },
        ...around.map((one) => ({ type: one.type, id: one.id, title: one.title || "New note", kind: one.type === "capture" ? (known.get(one.id)?.kind ?? "note") : one.type, links: known.get(one.id)?.links ?? 1, tag: known.get(one.id)?.tag, tint: known.get(one.id)?.tint })),
      ],
      edges: [...edges, ...among],
      alone: 0,
      among: among.length,
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [all, ids, src, title])
}

/** The pages a set of notes link to, in words: "p. 12", "pages 12 to 210". */
const spanOf = (cited: Cited[], src: string): string => {
  const pages = cited.flatMap((one) => one.pages)
  if (!pages.length) return ""
  const low = Math.min(...pages), high = Math.max(...pages)
  return low === high ? `, p. ${labelFor(src, low)}` : `, pages ${labelFor(src, low)} to ${labelFor(src, high)}`
}

/**
 * Beside a note or gem that came from a PDF: the book in the middle, this one
 * lit, and every other note, gem and card that links into the same book
 * around it, joined where they link to each other. A dot pointed at says its
 * title and page; a click opens it, ⌥-click beside. One line under it says how
 * many and which pages.
 */
export function SameBookMap({ src, title, here }: { src: string; title: string; here: string }): React.JSX.Element | null {
  const cited = useCited(src)
  const around = cited.filter((one) => one.type !== "deck")
  const graph = useBookGraph(src, title, around)
  const about = useMemo(() => Object.fromEntries(around.filter((one) => one.pages.length).map((one) => [one.id, pagesOf(one.pages, (n) => labelFor(src, n))])), [around])
  if (!graph || !around.some((one) => one.id === here)) return null
  const others = around.filter((one) => one.id !== here)
  return (
    <div data-same-book data-others={others.length}>
      <GraphCanvas map={graph} centre={src} you={here} about={about} onOpen={(type, id, aside) => open({ type, id }, !!aside)} className="h-[220px]" />
      <p data-same-book-says className="border-t border-border/60 px-2 py-1.5 text-xs text-muted-foreground">
        {others.length ? `${plural(others.length, 'other')} from ${title}${spanOf(others, src)}` : `Nothing else from ${title} yet`}
      </p>
    </div>
  )
}

/**
 * "From the same book", in a note's or gem's details when it links into a
 * PDF: the book's map with this one lit. Folded at first, as a map is a
 * second look; opening or folding it is remembered.
 */
export function SameBook({ pdf, here, title }: { pdf: { src: string; name: string }; here: string; title?: string }): React.JSX.Element {
  const [named, setNamed] = useState("")
  useEffect(() => {
    let live = true
    if (!title) void call<{ title: string | null } | null>("pdf:cover", pdf.src).then((cover) => live && setNamed(cover?.title ?? ""))
    return () => void (live = false)
  }, [pdf.src, title])
  return (
    <Island compact title="From the same book">
      <SameBookMap src={pdf.src} here={here} title={title || named || pdf.name.replace(/\.pdf$/i, "") || "This book"} />
    </Island>
  )
}
