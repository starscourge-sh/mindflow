import { Extension, type Editor, type JSONContent } from "@tiptap/core"
import { NodeSelection, Plugin, PluginKey, TextSelection, type EditorState } from "@tiptap/pm/state"
import { Decoration, DecorationSet, type EditorView } from "@tiptap/pm/view"

import { onlyWordsChanged } from "@/lib/tiptap-utils"

/** What can carry a caption: a picture, a YouTube video, a stored video or recording. */
const MEDIA = new Set(["image", "youtube", "attachment"])

type State = { editing: number | null; set: DecorationSet }
const key = new PluginKey<State>("caption")

/** A paragraph that is only words in italics: how a caption is written in Markdown. */
const captionLine = (node?: JSONContent): string | null =>
  node?.type === "paragraph" && node.content?.length && node.content.every((part) => part.type === "text" && part.marks?.length === 1 && part.marks[0].type === "italic")
    ? node.content.map((part) => part.text).join("").trim() || null
    : null

/**
 * An italic line straight under a picture or a video becomes its caption, the
 * way Obsidian notes write one. One level: the reader recurses on its own.
 */
export function absorbCaptions(content: JSONContent[]): JSONContent[] {
  const out: JSONContent[] = []
  for (const node of content) {
    const before = out[out.length - 1]
    const text = before && MEDIA.has(before.type ?? "") && !before.attrs?.caption ? captionLine(node) : null
    if (text) out[out.length - 1] = { ...before, attrs: { ...before.attrs, caption: text } }
    else out.push(node)
  }
  return out.length === content.length ? content : out
}

/** The same, all the way down: for a note saved before captions were real. */
const absorbAll = (node: JSONContent): JSONContent => {
  if (!node.content || node.type === "paragraph" || node.type === "heading") return node
  const kids = node.content.map(absorbAll)
  const content = absorbCaptions(kids)
  // Against `kids`, which `map` always makes anew: against the old list every
  // note read as changed, and was rewritten whole each time it opened.
  return content === kids && kids.every((kid, at) => kid === node.content![at]) ? node : { ...node, content }
}

/** A captioned block's Markdown: itself, then its caption as the italic line under it. */
export const captioned = (markdown: string, node: JSONContent): string =>
  node.attrs?.caption ? `${markdown}\n\n*${String(node.attrs.caption).replace(/([*_])/g, "\\$1")}*` : markdown

/** Write a caption for the media at `pos`, or go back into the one it has. */
export function startCaption(editor: Editor, pos: number): void {
  editor.view.dispatch(editor.state.tr.setMeta(key, pos))
}

/** The media that ends where a caption sits. */
const mediaBefore = (state: EditorState, at: number): { pos: number; node: NonNullable<ReturnType<EditorState["doc"]["nodeAt"]>> } | null => {
  const node = state.doc.resolve(at).nodeBefore
  return node && MEDIA.has(node.type.name) ? { pos: at - node.nodeSize, node } : null
}

/**
 * Leave the caption: keep its words (an empty one goes), then go where asked.
 * "below" is Enter, a new line under the media; "media" selects the media.
 */
function leave(view: EditorView, at: number, text: string, then?: "below" | "media"): void {
  const media = mediaBefore(view.state, at)
  if (!media) return
  const value = text.replace(/\s+/g, " ").trim() || null
  const tr = view.state.tr.setMeta(key, null)
  if (value !== (media.node.attrs.caption ?? null)) tr.setNodeAttribute(media.pos, "caption", value)
  if (then === "below") {
    tr.insert(at, view.state.schema.nodes.paragraph.create())
    tr.setSelection(TextSelection.create(tr.doc, at + 1))
  } else if (then === "media") tr.setSelection(NodeSelection.create(tr.doc, media.pos))
  view.dispatch(tr.scrollIntoView())
  if (!then) return
  view.focus()
  // A new line is for writing on, in vim too.
  if (then === "below") (view.dom as HTMLElement & { editor?: Editor }).editor?.commands.enterInsertMode?.()
}

/** The line under the media: its own small text field, outside the document's text. */
function captionView(view: EditorView, getPos: () => number | undefined, caption: string, focus: boolean): HTMLElement {
  const media = mediaBefore(view.state, getPos() ?? 0)?.node
  const wrap = document.createElement("div")
  wrap.className = "mf-caption"
  wrap.dataset.of = media?.type.name ?? ""
  const align = media?.attrs.align
  if (align) wrap.dataset.align = align
  if (media?.attrs.width) wrap.style.width = media.attrs.width
  const field = document.createElement("div")
  field.className = "mf-caption-text"
  field.textContent = caption
  field.dataset.placeholder = "Write a caption"
  field.spellcheck = true
  field.setAttribute("role", "textbox")
  field.setAttribute("aria-placeholder", "Write a caption")
  if (view.editable) field.contentEditable = "plaintext-only"
  wrap.append(field)
  let done = false
  const finish = (then?: "below" | "media"): void => {
    if (done) return
    done = true
    const at = getPos()
    if (at != null) leave(view, at, field.textContent ?? "", then)
  }
  field.addEventListener("keydown", (event) => {
    if (event.isComposing) return
    const meta = event.metaKey || event.ctrlKey
    const then = event.key === "Enter" && !event.shiftKey ? "below" : event.key === "Escape" || (event.key === "Backspace" && !field.textContent) ? "media" : null
    // The browser's own select all reaches for the whole note around it.
    if (!then && !(meta && event.key === "a")) return
    event.preventDefault()
    if (then) finish(then)
    else getSelection()?.selectAllChildren(field)
  })
  // The same line is kept when nothing about it changed, so each visit starts afresh.
  field.addEventListener("focus", () => (done = false))
  // Not when the whole window goes to the back: you come back to the same line.
  field.addEventListener("blur", () => document.hasFocus() && finish())
  if (focus)
    requestAnimationFrame(() => {
      field.focus()
      // At the end of what is there, ready to add to it.
      getSelection()?.selectAllChildren(field)
      getSelection()?.collapseToEnd()
    })
  return wrap
}

/** Every caption, and the empty one being written, as a line under its media. */
function decorate(state: EditorState, editing: number | null): DecorationSet {
  const found: Decoration[] = []
  state.doc.descendants((node, pos) => {
    if (node.isTextblock) return false
    if (!MEDIA.has(node.type.name)) return true
    const caption = String(node.attrs.caption ?? "")
    // A video's frame swallows clicks, so a YouTube one always has its line,
    // shown when the pointer is near: the way to start a caption there.
    if (caption || pos === editing || node.type.name === "youtube") {
      const end = pos + node.nodeSize
      found.push(
        Decoration.widget(end, (view, getPos) => captionView(view, getPos, caption, pos === editing), {
          side: -1,
          key: `caption:${pos}:${caption}:${pos === editing}:${node.attrs.align ?? ""}:${node.attrs.width ?? ""}`,
          stopEvent: () => true,
          ignoreSelection: true,
        }),
      )
    }
    return false
  })
  return DecorationSet.create(state.doc, found)
}

/**
 * Captions under pictures and videos. The words live on the media's own node,
 * so they move, copy and delete with it; in Markdown they are the italic line
 * under it, which is how they were written before and still read anywhere.
 */
export const Caption = Extension.create({
  name: "caption",

  addGlobalAttributes() {
    // On the copied HTML as `data-caption`, so a picture pasted into another
    // note keeps its words. Nothing draws it: the line under is a decoration.
    return [
      {
        types: [...MEDIA],
        attributes: {
          caption: {
            default: null,
            // A web page's <figure> writes it as the <figcaption> beside the picture.
            parseHTML: (element) =>
              element.getAttribute("data-caption") || element.closest("figure")?.querySelector("figcaption")?.textContent?.replace(/\s+/g, " ").trim() || null,
            renderHTML: ({ caption }) => (caption ? { "data-caption": caption } : {}),
          },
        },
      },
    ]
  },

  // A note saved with the italic line opens with a real caption. Not an edit:
  // nothing to undo, nothing to save until you change something.
  onCreate() {
    const { editor } = this
    const json = editor.getJSON()
    const fixed = absorbAll(json)
    if (fixed === json) return
    const doc = editor.schema.nodeFromJSON(fixed)
    editor.view.dispatch(editor.state.tr.replaceWith(0, editor.state.doc.content.size, doc.content).setMeta("addToHistory", false).setMeta("preventUpdate", true))
  },

  addProseMirrorPlugins() {
    return [
      new Plugin<State>({
        key,
        state: {
          init: (_, state) => ({ editing: null, set: decorate(state, null) }),
          apply(tr, old, _, state) {
            const meta = tr.getMeta(key) as number | null | undefined
            if (meta === undefined && !tr.docChanged) return old
            // Words typed in a line: every caption only moves with the text.
            if (meta === undefined && old.editing == null && onlyWordsChanged(tr)) return { editing: null, set: old.set.map(tr.mapping, tr.doc) }
            const editing = meta !== undefined ? meta : old.editing == null ? null : tr.mapping.map(old.editing)
            return { editing, set: decorate(state, editing) }
          },
        },
        props: { decorations: (state) => key.getState(state)?.set },
      }),
    ]
  },
})
