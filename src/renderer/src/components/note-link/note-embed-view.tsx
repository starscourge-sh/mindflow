import { createContext, useContext, useEffect, useRef, useState } from "react"
import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react"
import type { Editor, JSONContent } from "@tiptap/core"

import { MindflowEditor, TAGS } from "@/components/mindflow"
import { findCaptures, findHeadings, follow } from "@/lib/capture-links"
import { useSameWords } from "@/lib/same-words"
import { toMarkdown } from "@/lib/export"
import { vigil } from "@/lib/vigil"
import { chime } from "@/lib/sound"
import { noteNamed } from "@/extensions/note-link"
import { ArrowUpRight, Link } from "@/components/ui/icons"
import { blockIn } from "../../../../main/blocks"

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

/** A note's body as stored, and its name, or null when it is gone. */
async function readNote(link: string): Promise<{ body: unknown; title: string } | null> {
  const { table, id } = partsOf(link)
  return table === "captures"
    ? window.api.captures.get(id).then((found) => found && found.status !== "discarded" ? { body: found.body, title: found.label || found.title } : null)
    : vigil.item(id).then((found) => found ? { body: found.body, title: (found as { title?: string }).title || "" } : null)
}

/** The body with the line named `block` given these words; its kind and marks of its own kept. */
function withLine(body: unknown, block: string, content: JSONContent[] | undefined): unknown {
  const walk = (node: JSONContent): JSONContent =>
    node.attrs?.blockId === block ? { ...node, content: content?.length ? content : undefined } : node.content ? { ...node, content: node.content.map(walk) } : node
  return walk(body as JSONContent)
}

/**
 * One line of another note shown here, live (a block reference): the words
 * are that note's, so editing them here edits them there, and every other
 * place the line is shown. A gem shown in an article stays one gem, still in
 * Review. Changed elsewhere, it changes here, unless you are typing in it.
 */
export function EmbeddedLine({ link, block, label, onUnembed }: { link: string; block: string; label: string; onUnembed?: () => void }): React.JSX.Element {
  const { table, id } = partsOf(link)
  const [note, setNote] = useState<{ title: string; line: JSONContent | null } | null | undefined>(undefined)
  const editor = useRef<Editor | null>(null)
  const shown = useRef("")
  useEffect(() => {
    let live = true
    const read = (): void => void readNote(link).then((found) => {
      if (!live) return
      const line = found ? blockIn(found.body, block) as JSONContent | null : null
      setNote(found ? { title: found.title, line } : null)
      // Changed somewhere else, and you are not typing here: the words follow.
      const ed = editor.current
      const words = JSON.stringify(line?.content ?? [])
      if (ed && !ed.isDestroyed && line && words !== shown.current && !ed.isFocused) {
        shown.current = words
        ed.commands.setContent({ type: "doc", content: [{ type: "paragraph", content: line.content }] }, { emitUpdate: false })
      }
    }, () => live && setNote(null))
    read()
    const stop = window.api.captures.onChange((what) => {
      if (!what || what.some((one) => one.id === id)) read()
    }, [table === "captures" ? "capture" : "item"])
    return () => {
      live = false
      stop()
    }
  }, [link, block, table, id])
  // Your words, written into the line where it lives, from what is stored now.
  const save = (doc: JSONContent): void => {
    const content = doc.content?.[0]?.content
    shown.current = JSON.stringify(content ?? [])
    void readNote(link).then((found) => {
      if (!found || !blockIn(found.body, block)) return
      const body = withLine(found.body, block, content)
      return table === "captures" ? window.api.captures.save(id, { body, base: found.body }) : vigil.saveItem(id, { body, base: found.body })
    })
  }
  const name = note?.title || label || "Untitled"
  return (
    <div data-embedded-line={`${link}#${block}`} className="my-1 rounded-lg bg-foreground/[0.03] ring-1 ring-border">
      <div contentEditable={false} className="flex items-center gap-1 px-3 pt-1.5 text-control text-muted-foreground">
        <span className="min-w-0 flex-1 truncate">A line from <span className="font-medium text-foreground">{name}</span></span>
        <button type="button" className="flex items-center gap-1 rounded-md px-1.5 py-0.5 hover:bg-accent hover:text-foreground" onClick={() => (chime("open"), follow(link, (type, to) => window.api.openInHome(type, to), `^${block}`))}>
          <ArrowUpRight className="size-3.5" /> Open
        </button>
        {onUnembed && (
          <button type="button" data-unembed className="flex items-center gap-1 rounded-md px-1.5 py-0.5 hover:bg-accent hover:text-foreground" onClick={onUnembed}>
            <Link className="size-3.5" /> Show as a link
          </button>
        )}
      </div>
      {note === undefined ? (
        <div className="px-3 py-2 text-control text-muted-foreground">Opening…</div>
      ) : !note?.line ? (
        <div className="px-3 py-2 text-control text-foreground">{note ? "That line is not in the note any more." : "This note is not here any more: it may be in the Bin."}</div>
      ) : (
        <div className="note-embed-body px-3 pb-2 [--mf-padding:0.125rem_0]">
          <MindflowEditor
            host={window.api}
            tokens={TAGS}
            shape="line"
            documentId={`line-${link}-${block}`}
            defaultContent={{ type: "doc", content: [{ type: "paragraph", content: note.line.content }] }}
            toolbar={false}
            handles={false}
            outline={false}
            search={false}
            autofocus={false}
            findNotes={findCaptures}
            findHeadings={findHeadings}
            onOpenNote={(to) => openNote(to)}
            onReady={(ready) => void ((editor.current = ready), (shown.current = JSON.stringify(note.line?.content ?? [])))}
            onChange={save}
          />
        </div>
      )}
    </div>
  )
}

/** The block in a note: the other note drawn in place, and found by name when typed as `![[Name]]`. */
export function NoteEmbedView({ node, updateAttributes, editor, getPos }: NodeViewProps): React.JSX.Element {
  const { id, label, block } = node.attrs as { id: string; label: string; block: string }
  // A note named but not found: as a link to nothing, it is made only when asked for.
  const [missing, setMissing] = useState(false)
  useEffect(() => {
    if (id || !label) return
    void noteNamed(label, findCaptures, { make: false }).then((found) => (found ? updateAttributes({ id: found.id, label: found.label }) : setMissing(true)))
  }, [id, label]) // eslint-disable-line react-hooks/exhaustive-deps
  // Back to a plain link, in one undoable step: the note itself is untouched.
  const unembed = (): void => {
    const pos = getPos()
    if (typeof pos !== "number") return
    chime("fold")
    editor.chain().focus().insertContentAt({ from: pos, to: pos + node.nodeSize }, { type: "paragraph", content: [{ type: "noteLink", attrs: { id, label, block: block || "" } }] }).run()
  }
  const make = (): void =>
    void noteNamed(label, findCaptures).then((found) => found ? (chime("settled"), updateAttributes({ id: found.id, label: found.label })) : chime("nope"))
  return (
    <NodeViewWrapper data-note-embed={id} className="note-embed">
      {id && block ? <EmbeddedLine link={id} block={block} label={label} onUnembed={editor.isEditable ? unembed : undefined} />
        : id ? <EmbeddedNote link={id} label={label} onUnembed={editor.isEditable ? unembed : undefined} />
        : missing ? (
          <div contentEditable={false} className="my-1 flex items-center gap-2 rounded-lg px-3 py-2 text-control ring-1 ring-border">
            <span className="min-w-0 flex-1 text-foreground">“{label}” is not a page yet.</span>
            {editor.isEditable && <button type="button" data-make-page className="shrink-0 rounded-md px-2 py-0.5 font-medium hover:bg-accent" onClick={make}>Make it</button>}
          </div>
        ) : (
        <div className="my-1 rounded-lg px-3 py-2 text-control ring-1 ring-border">Finding “{label}”…</div>
      )}
    </NodeViewWrapper>
  )
}
