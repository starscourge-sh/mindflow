import { Extension, InputRule, Node, type Editor, type JSONContent } from "@tiptap/core"
import { still } from "@/lib/motion"
import { Fragment, type Node as PMNode } from "@tiptap/pm/model"
import { Plugin, PluginKey, TextSelection, type Selection, type Transaction } from "@tiptap/pm/state"
import { ReplaceStep } from "@tiptap/pm/transform"
import { CornerUpLeft } from "lucide-react"

import { copyOf, iconMarkup } from "@/lib/icon-markup"

/**
 * Footnotes as Obsidian has them: `words[^1]` in the text, `[^1]: the note`
 * at the foot. In the note a raised number, and the notes gathered under a
 * quiet line at the end, numbered in the order their marks come. The numbers,
 * the order and the notes themselves are kept by one rule after every change
 * (`settle`): a mark moved renumbers, a mark deleted takes its note with it,
 * and ⌘Z brings both back, since the rule's change is part of the same step.
 */

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    footnotes: {
      /** A mark at the caret, its note at the foot, the caret in the note's words. */
      insertFootnote: () => ReturnType
    }
  }
}

const REF = "footnoteReference"
const NOTES = "footnotes"
const NOTE = "footnote"

const newId = (): string => Math.random().toString(36).slice(2, 10)

/** Where a mark's note sits, or null. */
function findNote(doc: PMNode, id: string): number | null {
  let at: number | null = null
  doc.descendants((node, pos) => {
    if (at !== null) return false
    if (node.type.name === NOTE && node.attrs.id === id) at = pos
    return node.type.name === NOTES || node.isBlock
  })
  return at
}

/** Where a note's mark sits, or null. */
function markAt(doc: PMNode, id: string): number | null {
  let at: number | null = null
  doc.descendants((node, pos) => {
    if (at !== null) return false
    if (node.type.name === REF && node.attrs.id === id) at = pos
    return node.type.name !== NOTES
  })
  return at
}

/** A small glow on what a jump landed on, so the eye finds it. */
function glow(editor: Editor, pos: number): void {
  const el = editor.view.nodeDOM(pos)
  if (el instanceof HTMLElement && !still())
    el.animate([{ backgroundColor: "color-mix(in oklab, var(--tt-brand-color-400) 22%, transparent)" }, { backgroundColor: "transparent" }], { duration: 900, easing: "ease-out" })
}

/** From a mark to the end of its note's words. */
export function toNote(editor: Editor, id: string): boolean {
  const at = findNote(editor.state.doc, id)
  if (at === null) return false
  editor.chain().focus().setTextSelection(at + (editor.state.doc.nodeAt(at)?.nodeSize ?? 2) - 2).scrollIntoView().run()
  glow(editor, at)
  return true
}

/** From a note back to just after its mark. */
export function toMark(editor: Editor, id: string): boolean {
  const at = markAt(editor.state.doc, id)
  if (at === null) return false
  editor.chain().focus().setTextSelection(at + 1).scrollIntoView().run()
  glow(editor, at)
  return true
}

/** The note the caret is in, if any. */
function noteHere(selection: Selection): string | null {
  const { $head } = selection
  for (let depth = $head.depth; depth > 0; depth -= 1) if ($head.node(depth).type.name === NOTE) return String($head.node(depth).attrs.id)
  return null
}

/**
 * The notes as the marks say: one list at the very end, a note for each mark
 * in the order the marks come, each mark numbered, no note without a mark.
 * A mark copied (two with one name) gets a copy of the note.
 */
function settle(tr: Transaction): boolean {
  const { schema } = tr.doc.type
  const refs: { pos: number; node: PMNode }[] = []
  const notes = new Map<string, PMNode>()
  const lists: { pos: number; node: PMNode }[] = []
  tr.doc.descendants((node, pos) => {
    if (node.type.name === NOTES) {
      lists.push({ pos, node })
      node.forEach((one) => void (notes.has(one.attrs.id) || notes.set(one.attrs.id, one)))
      return false
    }
    if (node.type.name === REF) refs.push({ pos, node })
    return true
  })
  const seen = new Set<string>()
  const items: PMNode[] = []
  let changed = false
  refs.forEach(({ pos, node }, at) => {
    let id = String(node.attrs.id || "")
    const old = notes.get(id)
    if (!id || seen.has(id)) id = newId()
    seen.add(id)
    if (node.attrs.id !== id || node.attrs.n !== at + 1) {
      tr.setNodeMarkup(pos, undefined, { ...node.attrs, id, n: at + 1 })
      changed = true
    }
    items.push(old && old.attrs.id === id ? old : schema.nodes[NOTE].create({ id }, old?.content ?? schema.nodes.paragraph.create()))
  })
  const list = lists.length === 1 ? lists[0] : null
  const placed = list && list.pos + list.node.nodeSize === tr.doc.content.size
  if (placed && items.length && list.node.content.eq(Fragment.from(items))) return changed
  if (!lists.length && !items.length) return changed
  for (const one of [...lists].reverse()) tr.delete(one.pos, one.pos + one.node.nodeSize)
  if (!tr.doc.childCount) tr.insert(0, schema.nodes.paragraph.create())
  if (items.length) tr.insert(tr.doc.content.size, schema.nodes[NOTES].create(null, items))
  return true
}

/** Whether a change touched a mark or a note, or left something after the notes. */
function touches(trs: readonly Transaction[], before: PMNode, after: PMNode): boolean {
  const ours = new Set([REF, NOTES, NOTE])
  if (before.lastChild?.type.name === NOTES && after.lastChild?.type.name !== NOTES) return true
  for (const tr of trs)
    for (let at = 0; at < tr.steps.length; at += 1) {
      const step = tr.steps[at]
      if (!(step instanceof ReplaceStep)) continue
      let hit = false
      const look = (node: PMNode): boolean => {
        if (ours.has(node.type.name)) hit = true
        return !hit
      }
      step.slice.content.descendants(look)
      const doc = tr.docs[at]
      if (!hit && step.from < step.to) doc.nodesBetween(step.from, Math.min(step.to, doc.content.size), look)
      if (hit) return true
    }
  return false
}

/** A new mark over `from`..`to`, its note made at once, and the caret in the note: one step, one ⌘Z. */
function placeMark(tr: Transaction, from: number, to: number): void {
  const id = newId()
  tr.replaceRangeWith(from, to, tr.doc.type.schema.nodes[REF].create({ id }))
  settle(tr)
  const at = findNote(tr.doc, id)
  if (at !== null) tr.setSelection(TextSelection.create(tr.doc, at + tr.doc.nodeAt(at)!.nodeSize - 2)).scrollIntoView()
}

export const FootnoteReference = Node.create({
  name: REF,
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return {
      id: { default: "", parseHTML: (el) => el.getAttribute("data-footnote-ref") ?? "", renderHTML: () => ({}) },
      n: { default: 0, parseHTML: (el) => Number(el.textContent) || 0, renderHTML: () => ({}) },
      // What the Markdown reader saw (`[^label]`, or `^[words]` inline); gone once the notes are gathered.
      label: { default: null, rendered: false },
      inline: { default: null, rendered: false },
    }
  },

  parseHTML() {
    return [{ tag: "sup[data-footnote-ref]" }]
  },

  // The card on a rest is the window's note preview (note-preview.tsx), as a link's is.
  renderHTML({ node }) {
    return ["sup", { class: "mf-footnote-ref", "data-footnote-ref": node.attrs.id, "data-note-hover": "", "data-note": `footnote:${node.attrs.id}` }, String(node.attrs.n || "")]
  },

  renderText: ({ node }) => `[${node.attrs.n}]`,

  renderMarkdown: (node) => `[^${node.attrs?.n || 1}]`,

  markdownTokenizer: {
    name: REF,
    level: "inline",
    start: (src: string) => src.search(/\[\^|\^\[/),
    tokenize: (src: string) => {
      const labelled = /^\[\^([^\]\s]+)\](?!:)/.exec(src)
      if (labelled) return { type: REF, raw: labelled[0], label: labelled[1] }
      const inline = /^\^\[([^\]]+)\]/.exec(src)
      if (inline) return { type: REF, raw: inline[0], inline: inline[1] }
      return undefined
    },
  },

  parseMarkdown: (token) => ({ type: REF, attrs: { label: token.label ?? null, inline: token.inline ?? null } }),

  addCommands() {
    return {
      insertFootnote:
        () =>
        ({ tr, dispatch }) => {
          // Not inside a note: a note's own mark would have nowhere to number from. Not in code.
          if (noteHere(tr.selection) || tr.selection.$from.parent.type.spec.code) return false
          if (dispatch) placeMark(tr, tr.selection.from, tr.selection.to)
          return true
        },
    }
  },

  // `[^]` or `[^1]` typed out, as in Obsidian: the mark, and the caret in its note.
  addInputRules() {
    return [
      new InputRule({
        find: /\[\^([^\]\s]*)\]$/,
        handler: ({ state, range }) => {
          // Not in code, where `[^1]` is code, nor inside a note.
          if (!state.selection.$from.parent.type.spec.code && !noteHere(state.selection)) placeMark(state.tr, range.from, range.to)
        },
      }),
    ]
  },

  addProseMirrorPlugins() {
    const editor = this.editor
    return [
      new Plugin({
        key: new PluginKey("footnotes"),
        appendTransaction: (trs, before, after) => {
          if (!trs.some((tr) => tr.docChanged) || !touches(trs, before.doc, after.doc)) return null
          const tr = after.tr
          return settle(tr) ? tr : null
        },
        props: {
          // A click on a mark goes to its note.
          handleClickOn: (_view, _pos, node, _at, event) => {
            if (node.type.name !== REF || event.button !== 0) return false
            event.preventDefault()
            return toNote(editor, String(node.attrs.id))
          },
        },
      }),
    ]
  },

  addKeyboardShortcuts() {
    return {
      // Esc in a note goes back to its mark.
      Escape: ({ editor }) => {
        const id = noteHere(editor.state.selection)
        return id ? toMark(editor, id) : false
      },
    }
  },
})

export const Footnotes = Node.create({
  name: NOTES,
  group: "block",
  content: `${NOTE}+`,
  isolating: true,
  selectable: false,
  draggable: false,

  parseHTML() {
    return [{ tag: "section[data-footnotes]", contentElement: "ol" }]
  },

  renderHTML() {
    return ["section", { class: "mf-footnotes", "data-footnotes": "" }, ["ol", 0]]
  },

  // `[^1]: words` a line each, the way Obsidian writes them; a second paragraph indented under its first.
  renderMarkdown(node, { renderChildren }): string {
    return (node.content ?? [])
      .map((note, at) => {
        const words = renderChildren(note, "\n\n").trim()
        return `[^${at + 1}]: ${words.split("\n").map((line, n) => (n && line ? `    ${line}` : line)).join("\n")}`
      })
      .join("\n")
  },
})

export const Footnote = Node.create({
  name: NOTE,
  content: "paragraph+",
  defining: true,
  isolating: true,

  addAttributes() {
    return { id: { default: "", parseHTML: (el) => el.getAttribute("data-footnote") ?? "", renderHTML: ({ id }) => ({ "data-footnote": id }) } }
  },

  parseHTML() {
    return [{ tag: "li[data-footnote]" }]
  },

  renderHTML({ HTMLAttributes }) {
    return ["li", HTMLAttributes, 0]
  },

  // Its words, then the way back to its mark.
  addNodeView() {
    return ({ node, editor }) => {
      let id = String(node.attrs.id)
      const dom = document.createElement("li")
      dom.dataset.footnote = id
      const words = document.createElement("div")
      words.className = "mf-footnote-words"
      const back = document.createElement("button")
      back.type = "button"
      back.contentEditable = "false"
      back.className = "mf-footnote-back"
      back.setAttribute("aria-label", "Back to the mark")
      back.title = "Back to the mark (Esc)"
      back.append(copyOf(iconMarkup(CornerUpLeft) ?? ""))
      back.addEventListener("mousedown", (event) => event.preventDefault())
      back.addEventListener("click", (event) => {
        event.preventDefault()
        toMark(editor, id)
      })
      dom.append(words, back)
      return {
        dom,
        contentDOM: words,
        stopEvent: (event) => back.contains(event.target as globalThis.Node),
        ignoreMutation: (mutation) => mutation.type !== "selection" && !words.contains(mutation.target),
        update: (next) => {
          if (next.type.name !== NOTE) return false
          id = String(next.attrs.id)
          dom.dataset.footnote = id
          return true
        },
      }
    }
  },
})

/** The three, as one extension for an editor's list. */
export const FootnoteKit = Extension.create({
  name: "footnoteKit",
  addExtensions: () => [FootnoteReference, Footnotes, Footnote],
})

/**
 * `[^label]: words` lines out of Markdown before it is read, with the lines
 * indented under each, outside code. The reader has no rule for them, and a
 * long note is read in pieces that would part a mark from its note.
 */
export function pullFootnotes(markdown: string): { rest: string; notes: Map<string, string> } {
  const notes = new Map<string, string>()
  if (!/^\[\^[^\]\s]+\]:/m.test(markdown)) return { rest: markdown, notes }
  const lines = markdown.split("\n")
  const rest: string[] = []
  let fence: string | null = null
  for (let at = 0; at < lines.length; at += 1) {
    const line = lines[at]
    const open = /^\s*(`{3,}|~{3,})/.exec(line)
    if (fence) {
      if (line.trim().startsWith(fence)) fence = null
      rest.push(line)
      continue
    }
    if (open) {
      fence = open[1]
      rest.push(line)
      continue
    }
    const def = /^\[\^([^\]\s]+)\]:[ \t]?(.*)$/.exec(line)
    if (!def) {
      rest.push(line)
      continue
    }
    const words = [def[2]]
    while (at + 1 < lines.length && (/^( {2,}|\t)\S/.test(lines[at + 1]) || (!lines[at + 1].trim() && /^( {2,}|\t)\S/.test(lines[at + 2] ?? "")))) {
      at += 1
      words.push(lines[at].replace(/^( {1,4}|\t)/, ""))
    }
    if (!notes.has(def[1])) notes.set(def[1], words.join("\n").trim())
  }
  return { rest: rest.join("\n"), notes }
}

const wordsIn = (node: JSONContent): string => node.text ?? (node.content ?? []).map(wordsIn).join(" ")

/**
 * The marks the reader found, each given its note from `notes` (or its own
 * `^[words]`), and the notes put at the foot. A mark with no note is left as
 * the words it was, as Obsidian shows it.
 */
export function placeFootnotes(doc: JSONContent, notes: Map<string, string>, read: (markdown: string) => JSONContent[]): JSONContent {
  const foot: JSONContent[] = []
  const walk = (node: JSONContent): JSONContent => {
    if (node.type === REF) {
      const label = node.attrs?.label as string | null
      const words = label != null ? notes.get(label) : (node.attrs?.inline as string | null)
      if (words == null) return { type: "text", text: label != null ? `[^${label}]` : "" }
      const id = newId()
      const blocks = read(words).map((block) => (block.type === "paragraph" ? block : { type: "paragraph", content: [{ type: "text", text: wordsIn(block) }] }))
      foot.push({ type: NOTE, attrs: { id }, content: blocks.length ? blocks : [{ type: "paragraph" }] })
      return { type: REF, attrs: { id, n: foot.length } }
    }
    return node.content ? { ...node, content: node.content.map(walk).filter((one) => one.type !== "text" || one.text) } : node
  }
  const placed = walk(doc)
  if (!foot.length) return placed
  return { ...placed, content: [...(placed.content ?? []).filter((one) => one.type !== NOTES), { type: NOTES, content: foot }] }
}
