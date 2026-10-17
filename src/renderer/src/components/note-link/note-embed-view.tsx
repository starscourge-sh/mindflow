import { createContext, useContext, useEffect, useState } from "react"
import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react"
import type { JSONContent } from "@tiptap/core"

import { MindflowEditor, TAGS } from "@/components/mindflow"
import { findCaptures, findHeadings, follow } from "@/lib/capture-links"
import { useSameWords } from "@/lib/same-words"
import { toMarkdown } from "@/lib/export"
import { vigil } from "@/lib/vigil"
import { chime } from "@/lib/sound"
import { noteNamed } from "@/extensions/note-link"
import { ArrowUpRight, Link } from "@/components/ui/icons"

/**
 * The notes already open around this one, outermost first: a note shown in
 * itself, or two shown in each other, stops at a link instead of drawing
 * forever. Three deep at most, where it would be too narrow to write in.
 */
const Around = createContext<string[]>([])
const DEEPEST = 3

/** Where a link points: a capture's id alone, or `nugget:` / `article:` and an id. */
const partsOf = (link: string): { table: "captures" | "nuggets"; id: string } =>
  link.includes(":") ? { table: "nuggets", id: link.slice(link.indexOf(":") + 1) } : { table: "captures", id: link }

/** Open a note where the app opens notes: the main window, at that note. */
const openNote = (link: string): void =>
  follow(link, (type, id) => window.api.openInHome(type, id))

/**
 * A note shown whole, editable here and saved to the note itself: the same
 * words wherever it is shown. Used for an embed inside a note and for the
 * expanded view, which stacks a note and the notes it links to.
 */
export function EmbeddedNote({ link, label, header = true, onUnembed }: { link: string; label: string; header?: boolean; onUnembed?: () => void }): React.JSX.Element {
  const around = useContext(Around)
  const { table, id } = partsOf(link)
  const [note, setNote] = useState<{ body: unknown; title: string } | null | undefined>(undefined)
  useEffect(() => {
    let live = true
    const read = table === "captures"
      ? window.api.captures.get(id).then((found) => found && found.status !== "discarded" ? { body: found.body, title: found.label || found.title } : null)
      : vigil.item(id).then((found) => found ? { body: found.body, title: (found as { title?: string }).title || "" } : null)
    void read.then((found) => live && setNote(found), () => live && setNote(null))
    return () => void (live = false)
  }, [table, id])
  const words = useSameWords(table, note ? id : undefined, note?.body, (at, body, base, editor) =>
    table === "captures"
      ? window.api.captures.save(at, { body, base, ...(editor ? { markdown: toMarkdown(editor) } : {}) })
      : vigil.saveItem(at, { body, base }))
  const name = note?.title || label || "Untitled"
  const looped = around.includes(link) || around.length >= DEEPEST
  return (
    <div data-embedded-note={link} className="my-1 rounded-lg ring-1 ring-border">
      {header && (
        <div contentEditable={false} className="flex items-center gap-1 px-3 pt-2 text-control text-muted-foreground">
          <span className="min-w-0 flex-1 truncate font-medium text-foreground">{name}</span>
          <button type="button" className="flex items-center gap-1 rounded-md px-1.5 py-0.5 hover:bg-accent hover:text-foreground" onClick={() => (chime("open"), openNote(link))}>
            <ArrowUpRight className="size-3.5" /> Open
          </button>
          {onUnembed && (
            <button type="button" data-unembed className="flex items-center gap-1 rounded-md px-1.5 py-0.5 hover:bg-accent hover:text-foreground" onClick={onUnembed}>
              <Link className="size-3.5" /> Show as a link
            </button>
          )}
        </div>
      )}
      {note === undefined ? (
        <div className="px-3 py-2 text-control text-muted-foreground">Opening…</div>
      ) : note === null ? (
        <div className="px-3 py-2 text-control">This note is not here any more: it may be in the Bin.</div>
      ) : looped ? (
        <button type="button" className="px-3 py-2 text-left text-control underline" onClick={() => openNote(link)}>{name}: already shown above, open it to see it</button>
      ) : (
        <div className="note-embed-body [--mf-padding:0.25rem_0.75rem_0.75rem]">
          <Around.Provider value={[...around, link]}>
            <MindflowEditor
              host={window.api}
              tokens={TAGS}
              documentId={`embed-${link}-${around.length}`}
              defaultContent={(note.body as JSONContent | string | null) ?? ""}
              toolbar={false}
              handles={false}
              outline={false}
              search={false}
              autofocus={false}
              findNotes={findCaptures}
              findHeadings={findHeadings}
              onOpenNote={(to) => openNote(to)}
              onReady={words.ready}
              onChange={words.save}
            />
          </Around.Provider>
        </div>
      )}
    </div>
  )
}

/** The block in a note: the other note drawn in place, and found by name when typed as `![[Name]]`. */
export function NoteEmbedView({ node, updateAttributes, editor, getPos }: NodeViewProps): React.JSX.Element {
  const { id, label } = node.attrs as { id: string; label: string }
  useEffect(() => {
    if (id || !label) return
    void noteNamed(label, findCaptures).then((found) => found && updateAttributes({ id: found.id, label: found.label }))
  }, [id, label]) // eslint-disable-line react-hooks/exhaustive-deps
  // Back to a plain link, in one undoable step: the note itself is untouched.
  const unembed = (): void => {
    const pos = getPos()
    if (typeof pos !== "number") return
    chime("fold")
    editor.chain().focus().insertContentAt({ from: pos, to: pos + node.nodeSize }, { type: "paragraph", content: [{ type: "noteLink", attrs: { id, label } }] }).run()
  }
  return (
    <NodeViewWrapper data-note-embed={id} className="note-embed">
      {id ? <EmbeddedNote link={id} label={label} onUnembed={editor.isEditable ? unembed : undefined} /> : (
        <div className="my-1 rounded-lg px-3 py-2 text-control ring-1 ring-border">Finding “{label}”…</div>
      )}
    </NodeViewWrapper>
  )
}
