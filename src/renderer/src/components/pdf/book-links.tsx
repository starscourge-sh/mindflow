import { useEffect, useMemo, useState } from "react"
import { call } from "@/lib/haligtree"
import { chime } from "@/lib/sound"
import { notes, type MapEdge } from "@/lib/notes"
import { openApart } from "@/lib/apart"
import { asideItem, openAside } from "@/lib/split"
import { RowMenu, copyLinkItem, type RowItem } from "@/components/haligtree/row-menu"
import { Tip } from "@/components/haligtree/ui"
import { GraphCanvas, type Graph } from "@/components/haligtree/graph-canvas"
import { MARK_COLORS, markCss } from "./read-bar"
import { openPdf } from "./pdf-reader"

/** A note, gem or card that holds a book or links into it: the pages it links to, in order, and the line it does it in. */
export type Cited = { type: string; id: string; title: string; at: string; pages: number[]; line: string }

/** Every note, gem and card that holds or links into a book, in page order through it; read again when `again` changes. */
export function useCited(src: string, again?: unknown): Cited[] {
  const [cited, setCited] = useState<Cited[]>([])
  useEffect(() => {
    let live = true
    const load = (): void => void call<Cited[]>("pdf:cited", src).then((rows) => live && setCited(rows))
    load()
    const stop = window.api.captures.onChange(load)
    return () => {
      live = false
      stop()
    }
  }, [src, again])
  return cited
}

/** Notes and gems: what "In your notes" lists. Cards show on the page bar alone. */
export const inNotes = (cited: Cited[]): Cited[] => cited.filter((one) => one.type !== "card" && one.type !== "deck")

const kindOf = (type: string): string => (type === "capture" ? "Note" : type === "card" ? "Card" : type === "question" ? "Question" : "Gem")
const pagesOf = (pages: number[]): string => (!pages.length ? "Holds it" : pages.length === 1 ? `p. ${pages[0]}` : pages.length === 2 ? `pp. ${pages[0]}, ${pages[1]}` : `pp. ${pages[0]}, ${pages[1]} +${pages.length - 2}`)

const open = (one: Pick<Cited, "type" | "id">, aside: boolean): void => {
  chime("page")
  if (aside) openAside(one.type, one.id)
  else window.dispatchEvent(new CustomEvent("haligtree:open", { detail: { type: one.type, id: one.id } }))
}

/**
 * "In your notes": every note and gem that links into the book, in page order
 * through it, each with its kind, the page it links to and the line it does it
 * in. A click opens it, ⌥-click to the side; right-click for the row menu.
 */
export function InYourNotes({ cited, empty }: { cited: Cited[]; empty: string }): React.JSX.Element {
  const shown = inNotes(cited)
  if (!shown.length) return <p className="read-details-empty">{empty}</p>
  return (
    <div className="book-cited" data-book-cited>
      {shown.map((one) => {
        const items: RowItem[] = [
          { label: "Open", run: () => open(one, false) },
          asideItem(one.type, one.id),
          { label: "Open in a new window", run: () => openApart(one.type, one.id) },
          "separator",
          copyLinkItem(one.type === "capture" ? one.id : `${one.type}:${one.id}`, one.title),
        ]
        return (
          <RowMenu key={`${one.type}:${one.id}`} items={items}>
            <button type="button" data-cited={one.id} data-cited-page={one.pages[0] ?? 0} className="book-cited-row" onClick={(event) => open(one, event.altKey)}>
              <span className="book-cited-page">{pagesOf(one.pages)}</span>
              <span className="book-cited-what">
                <span className="book-cited-title">{one.title || "Untitled"}</span>
                <span className="book-cited-kind">{kindOf(one.type)}</span>
              </span>
              {one.line && <span className="book-cited-line">{one.line}</span>}
            </button>
          </RowMenu>
        )
      })}
    </div>
  )
}

type Mark = { page: number; color?: string | null }

/**
 * The book's length as a strip: a tick where each note, highlight and card
 * attaches, and a marker where you are. A tick opens the reader on its page.
 * Under it one line of plain words says what the marks are.
 */
export function PageBar({ src, name, pages, page, cited, marks, onPage }: { src: string; name: string; pages: number; page?: number | null; cited: Cited[]; marks: Mark[]; /** In the reader: go to the page there. */ onPage?: (page: number) => void }): React.JSX.Element {
  const ticks = useMemo(() => {
    const at = new Map<string, { kind: "note" | "card" | "mark"; page: number; says: string[]; color?: string | null }>()
    const add = (kind: "note" | "card" | "mark", page: number, says: string, color?: string | null): void => {
      if (page < 1 || page > pages) return
      const key = `${kind} ${page}`
      const one = at.get(key)
      if (one) one.says.push(says)
      else at.set(key, { kind, page, says: [says], color })
    }
    for (const one of cited) for (const p of one.pages) add(one.type === "card" ? "card" : "note", p, one.title || "Untitled")
    for (const mark of marks) add("mark", mark.page, MARK_COLORS.find((one) => one.id === (mark.color ?? null))?.label ?? "Highlight", mark.color)
    return [...at.values()]
  }, [cited, marks, pages])
  const count = (kind: string): number => new Set(ticks.filter((one) => one.kind === kind).map((one) => one.page)).size
  const left = (p: number): string => `${pages > 1 ? ((p - 1) / (pages - 1)) * 100 : 50}%`
  // One line of words, each with the mark it names: only the kinds there are.
  const words = (["note", "mark", "card"] as const)
    .filter((kind) => count(kind))
    .map((kind) => [kind, `${count(kind)} ${count(kind) === 1 ? "page" : "pages"} ${kind === "note" ? "with notes" : kind === "mark" ? "highlighted" : "with cards"}`] as const)
  return (
    <div className="book-bar" data-page-bar>
      <div className="book-bar-strip">
        {page ? <span className="book-bar-read" style={{ width: left(page) }} /> : null}
        {page ? <span className="book-bar-here" data-here={page} style={{ left: left(page) }} /> : null}
        {ticks.map((one) => (
          <Tip key={`${one.kind} ${one.page}`} label={`p. ${one.page}: ${one.says.slice(0, 3).join(", ")}${one.says.length > 3 ? ` +${one.says.length - 3}` : ""}`}>
            <button
              type="button"
              aria-label={`Open at p. ${one.page}`}
              data-tick={one.kind}
              data-tick-page={one.page}
              className={`book-bar-tick is-${one.kind}`}
              style={{ left: left(one.page), ...(one.kind === "mark" ? { "--mark": markCss(one.color) } : {}) } as React.CSSProperties}
              onClick={() => (chime("open"), onPage ? onPage(one.page) : openPdf(src, name, one.page))}
            />
          </Tip>
        ))}
      </div>
      <div className="book-bar-ends">
        <span>p. 1</span>
        {page ? <span className="book-bar-you">You are on p. {page}</span> : <span>Not started</span>}
        <span>p. {pages}</span>
      </div>
      <p className="book-bar-says">
        {words.length
          ? words.map(([kind, says], at) => (
              <span key={kind} className="book-bar-word">
                {at > 0 && " · "}
                <span className={`book-bar-key is-${kind}`} />
                {says}
              </span>
            ))
          : "No notes, highlights or cards in it yet"}
      </p>
    </div>
  )
}

/**
 * The book's own small map, as a note's Links map: the book in the middle, the
 * notes and gems that link into it around it, and the links between those, so
 * notes that belong together cluster. Pointed at, a dot names itself; clicked, it opens.
 */
export function BookMap({ src, title, cited }: { src: string; title: string; cited: Cited[] }): React.JSX.Element | null {
  const around = inNotes(cited)
  const [all, setAll] = useState<Awaited<ReturnType<typeof notes.map>> | null>(null)
  const ids = around.map((one) => one.id).join(" ")
  useEffect(() => {
    let live = true
    if (ids) void notes.map().then((map) => live && setAll(map))
    return () => void (live = false)
  }, [ids])
  const graph = useMemo<(Graph & { among: number }) | null>(() => {
    if (!around.length) return null
    const known = new Map(all?.nodes.map((node) => [node.id, node]) ?? [])
    const here = new Set(around.map((one) => one.id))
    const edges: MapEdge[] = around.map((one) => [src, one.id, Math.max(1, one.pages.length)])
    const among = (all?.edges ?? []).filter(([a, b]) => a !== src && b !== src && here.has(a) && here.has(b))
    return {
      nodes: [
        { type: "pdf", id: src, title, kind: "pdf", links: around.length },
        ...around.map((one) => ({ type: one.type, id: one.id, title: one.title || "Untitled", kind: known.get(one.id)?.kind ?? "note", links: known.get(one.id)?.links ?? 1, tag: known.get(one.id)?.tag, tint: known.get(one.id)?.tint })),
      ],
      edges: [...edges, ...among],
      alone: 0,
      among: among.length,
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [all, ids, src, title])
  if (!graph) return null
  const n = around.length
  return (
    <figure className="book-map" data-book-map data-nodes={graph.nodes.length} data-lines={graph.edges.length}>
      <GraphCanvas map={graph} centre={src} onOpen={(type, id) => open({ type, id }, false)} className="h-[180px]" />
      <figcaption className="book-map-says">
        {n} {n === 1 ? "note links" : "notes link"} to this book{graph.among ? `; ${graph.among} ${graph.among === 1 ? "link joins them" : "links join them"} to each other` : ""}.
      </figcaption>
    </figure>
  )
}
