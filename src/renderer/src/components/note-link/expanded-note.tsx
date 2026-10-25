import { useEffect, useRef, useState } from "react"
import { X } from "lucide-react"
import type { Editor } from "@tiptap/core"

import { EmbeddedNote } from "./note-embed-view"
import { Board, useBoard } from "@/components/haligtree/board-view"
import { TOOL } from "@/components/haligtree/note-extras"
import { Tip } from "@/components/haligtree/ui"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuShortcut, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import DotsHorizontalIcon from "@/components/ui/dots-horizontal-icon"
import { AliveIcon } from "@/components/ui/alive-icon"
import { Check } from "@/components/ui/icons"
import { haligtree } from "@/lib/haligtree"
import { chime } from "@/lib/sound"

/**
 * The expanded view: a note as the whole article, in one scroll. The note
 * itself, its embeds drawn in place (they already are), then every note it
 * links to, each whole and editable where it lives: nothing is copied, so a
 * word changed here is changed in that note. From any window: the main
 * window shows it; another asks it to (home.tsx, `expand`).
 */
export function openExpanded(link: string): void {
  if (new URLSearchParams(location.search).get("view") === "home") window.dispatchEvent(new CustomEvent("haligtree:expand", { detail: link }))
  else window.api.openInHome("expand", link)
}

type Doc = { type?: string; attrs?: Record<string, unknown>; content?: Doc[] }

/** The notes a body links to, in order, once each; embeds left out, since they show in place. */
function linkedIn(body: unknown, self: string): string[] {
  const links: string[] = []
  const embedded = new Set<string>()
  const walk = (node: Doc | undefined): void => {
    if (!node || typeof node !== "object") return
    const id = typeof node.attrs?.id === "string" ? node.attrs.id : ""
    if (node.type === "noteEmbed" && id) embedded.add(id)
    if (node.type === "noteLink" && id && !/^(person|tag|task|day|week|month|question|goal):/.test(id)) links.push(id)
    node.content?.forEach(walk)
  }
  walk(body as Doc)
  return [...new Set(links)].filter((id) => id !== self && !embedded.has(id))
}

export function ExpandedSheet(): React.JSX.Element | null {
  const [link, setLink] = useState<string | null>(null)
  useEffect(() => {
    const open = (event: Event): void => (chime("open"), setLink((event as CustomEvent<string>).detail))
    window.addEventListener("haligtree:expand", open)
    return () => window.removeEventListener("haligtree:expand", open)
  }, [])
  if (!link) return null
  return <Sheet key={link} link={link} onClose={() => (chime("fold"), setLink(null))} />
}

function Sheet({ link, onClose }: { link: string; onClose: () => void }): React.JSX.Element {
  const [read, setRead] = useState<{ title: string; linked: string[] } | null>(null)
  useEffect(() => {
    const capture = !link.includes(":")
    const id = capture ? link : link.slice(link.indexOf(":") + 1)
    void (capture ? window.api.captures.get(id).then((found) => found && { title: found.label || found.title, body: found.body }) : haligtree.item(id).then((found) => found && { title: (found as { title?: string }).title ?? "", body: found.body }))
      .then((found) => setRead(found ? { title: found.title || "Untitled", linked: linkedIn(found.body, link) } : { title: "Not here any more", linked: [] }))
  }, [link])
  // The page seen as a board, as it can be where it lives (board-view.tsx), filling the view.
  const [editor, setEditor] = useState<Editor | null>(null)
  const own = link.includes(":") ? { table: "nuggets" as const, id: link.slice(link.indexOf(":") + 1) } : { table: "captures" as const, id: link }
  const board = useBoard(own.table, own.id, editor)
  const boardShown = board.on && !!editor && !editor.isDestroyed
  const [tools, setTools] = useState<HTMLElement | null>(null)
  const toggle = useRef(board.toggle)
  toggle.current = board.toggle
  useEffect(() => {
    const key = (event: KeyboardEvent): void => {
      // ⌥⌘B is this page's board, not the one of the page under the view.
      if (event.metaKey && event.altKey && event.code === "KeyB") {
        event.preventDefault()
        event.stopPropagation()
        return toggle.current()
      }
      if (event.key !== "Escape") return
      event.preventDefault()
      event.stopPropagation()
      // Esc inside a note's editor (or the board's find) leaves it first; a second one closes.
      const inside = (document.activeElement as HTMLElement | null)?.closest?.(".ProseMirror, [data-board] input")
      if (inside) return void (inside as HTMLElement).blur()
      onClose()
    }
    // First, before the page under it takes Esc for itself.
    window.addEventListener("keydown", key, true)
    return () => window.removeEventListener("keydown", key, true)
  }, [onClose])
  return (
    <div data-expanded-note={link} role="dialog" aria-label="Expanded view" className="fixed inset-0 z-50 overflow-y-auto bg-background">
      {/* Somewhere to hold the window by, above the title, however far it is scrolled. */}
      <div data-drag-strip="" aria-hidden className="fixed inset-x-0 top-0 h-7 [-webkit-app-region:drag]" />
      {/* The page's column holds its name and Close in one place; only a board goes the full width, under them. */}
      <div className="flex min-h-full flex-col gap-3 pt-16 pb-8">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-3 px-6">
        <div className="flex items-center gap-2">
          <h1 className="min-w-0 flex-1 truncate text-2xl font-semibold">{read?.title ?? "Opening…"}</h1>
          {/* The board's own tools, then the page's menu: always there, so Close never moves. */}
          {boardShown && <span ref={setTools} className="contents" />}
          <DropdownMenu modal={false}>
            <Tip label="More">
              <DropdownMenuTrigger asChild>
                <button type="button" aria-label="More" className={TOOL}><AliveIcon icon={DotsHorizontalIcon} size={16} /></button>
              </DropdownMenuTrigger>
            </Tip>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem role="menuitemcheckbox" aria-checked={board.on} onSelect={board.toggle}>
                Board view
                <DropdownMenuShortcut>⌥⌘B</DropdownMenuShortcut>
                <span className="flex w-3.5 justify-center">{board.on && <Check />}</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <button type="button" aria-label="Close the expanded view" className="flex items-center gap-1 rounded-md px-2 py-1 text-control hover:bg-accent" onClick={onClose}>
            <X className="size-4" /> Close <kbd className="text-meta">Esc</kbd>
          </button>
        </div>
        <p className="text-control">{boardShown ? "The page as a board: each card is a line of it, saved where it lives." : "The whole page in one scroll: edit anything here and it is saved where it lives."}</p>
        {/* Kept, hidden, under the board: the board edits these words. */}
        <div className={boardShown ? "hidden" : "contents"}>
          <EmbeddedNote link={link} label={read?.title ?? ""} header={false} powers onLeave={onClose} onEditor={setEditor} />
          {read && read.linked.length > 0 && <h2 className="mt-4 text-lg font-semibold">Linked from here</h2>}
          {read?.linked.map((one) => <EmbeddedNote key={one} link={one} label="" powers onLeave={onClose} />)}
        </div>
      </div>
      {boardShown && <div className="flex min-h-0 flex-1 flex-col px-6"><Board editor={editor} id={own.id} tools={tools} /></div>}
      </div>
    </div>
  )
}
