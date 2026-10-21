import { useEffect, useState } from "react"
import { X } from "lucide-react"

import { EmbeddedNote } from "./note-embed-view"
import { vigil } from "@/lib/vigil"
import { chime } from "@/lib/sound"

/**
 * The expanded view: a note as the whole article, in one scroll. The note
 * itself, its embeds drawn in place (they already are), then every note it
 * links to, each whole and editable where it lives: nothing is copied, so a
 * word changed here is changed in that note. From any window: the main
 * window shows it; another asks it to (home.tsx, `expand`).
 */
export function openExpanded(link: string): void {
  if (new URLSearchParams(location.search).get("view") === "home") window.dispatchEvent(new CustomEvent("vigil:expand", { detail: link }))
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
    window.addEventListener("vigil:expand", open)
    return () => window.removeEventListener("vigil:expand", open)
  }, [])
  if (!link) return null
  return <Sheet key={link} link={link} onClose={() => (chime("fold"), setLink(null))} />
}

function Sheet({ link, onClose }: { link: string; onClose: () => void }): React.JSX.Element {
  const [read, setRead] = useState<{ title: string; linked: string[] } | null>(null)
  useEffect(() => {
    const capture = !link.includes(":")
    const id = capture ? link : link.slice(link.indexOf(":") + 1)
    void (capture ? window.api.captures.get(id).then((found) => found && { title: found.label || found.title, body: found.body }) : vigil.item(id).then((found) => found && { title: (found as { title?: string }).title ?? "", body: found.body }))
      .then((found) => setRead(found ? { title: found.title || "Untitled", linked: linkedIn(found.body, link) } : { title: "Not here any more", linked: [] }))
  }, [link])
  useEffect(() => {
    const key = (event: KeyboardEvent): void => {
      if (event.key !== "Escape") return
      event.preventDefault()
      event.stopPropagation()
      // Esc inside a note's editor leaves the editor first; a second one closes.
      const inside = (document.activeElement as HTMLElement | null)?.closest?.(".ProseMirror")
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
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-3 px-6 py-8">
        <div className="flex items-center gap-2">
          <h1 className="min-w-0 flex-1 truncate text-2xl font-semibold">{read?.title ?? "Opening…"}</h1>
          <button type="button" aria-label="Close the expanded view" className="flex items-center gap-1 rounded-md px-2 py-1 text-control hover:bg-accent" onClick={onClose}>
            <X className="size-4" /> Close <kbd className="text-meta">Esc</kbd>
          </button>
        </div>
        <p className="text-control">The whole article in one scroll: edit anything here and it is saved where it lives.</p>
        <EmbeddedNote link={link} label={read?.title ?? ""} header={false} />
        {read && read.linked.length > 0 && <h2 className="mt-4 text-lg font-semibold">Linked from here</h2>}
        {read?.linked.map((one) => <EmbeddedNote key={one} link={one} label="" />)}
      </div>
    </div>
  )
}
