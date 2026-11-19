import { Extension } from "@tiptap/core"
import { Plugin, PluginKey, type EditorState, type Transaction } from "@tiptap/pm/state"
import { closeHistory } from "@tiptap/pm/history"
import { TAG } from "../../../main/tag-words"

/**
 * A #tag typed into a note's name (its first line) moves to the note's line of tags at the end once the caret leaves
 * the name: never while it is being typed. The same move a sent or saved note gets (main/tags-off-name.ts), done here
 * in steps, so the page keeps its place and one ⌘Z puts the tag back. A name that is only tags keeps them.
 */
const key = new PluginKey("tagsOffName")
const FOUND = new RegExp(String.raw`(^|\s)#(${TAG})`, "gu")
const tagsOf = (text: string): string[] => [...text.matchAll(FOUND)].map((hit) => hit[2].toLowerCase())
const onlyTags = (text: string): boolean => !!text.trim() && !text.replace(FOUND, "").trim()

function moved(state: EditorState): Transaction | null {
  const name = state.doc.firstChild
  if (!name?.isTextblock || !name.textContent.includes("#")) return null
  // Each tag's place in the name, code left alone: from its space (or the line's start) to its end.
  const cuts: { from: number; to: number; tag: string }[] = []
  name.forEach((child, offset) => {
    if (!child.isText || child.marks.some((mark) => mark.type.name === "code")) return
    for (const hit of child.text!.matchAll(FOUND)) cuts.push({ from: 1 + offset + hit.index!, to: 1 + offset + hit.index! + hit[0].length, tag: hit[2].toLowerCase() })
  })
  if (!cuts.length || !name.textContent.replace(FOUND, "").trim()) return null
  const rest = tagsOf(state.doc.textBetween(name.nodeSize, state.doc.content.size, "\n"))
  const moving = [...new Set(cuts.map((one) => one.tag))].filter((tag) => !rest.includes(tag)).map((tag) => `#${tag}`).join(" ")
  // A step of its own, so ⌘Z puts the tag back in the name and leaves what was typed there.
  const tr = closeHistory(state.tr)
  // The tags first, at the end, so the name's places still hold as it is cut.
  if (moving) {
    const last = state.doc.lastChild!
    const end = state.doc.content.size
    if (state.doc.childCount > 1 && last.type.name === "paragraph" && onlyTags(last.textContent)) tr.insertText(` ${moving}`, end - 1)
    else tr.insert(end, state.schema.nodes.paragraph.create(null, state.schema.text(moving)))
  }
  for (const cut of cuts.reverse()) tr.delete(cut.from, cut.to)
  // The name's own ends, as it was typed without them.
  const now = tr.doc.firstChild!
  const lead = /^\s+/.exec(now.textContent)?.[0].length ?? 0
  const trail = /\s+$/.exec(now.textContent)?.[0].length ?? 0
  if (trail) tr.delete(1 + now.content.size - trail, 1 + now.content.size)
  if (lead) tr.delete(1, 1 + lead)
  return tr.setMeta(key, true)
}

export const TagsOffName = Extension.create<{ on: () => boolean }>({
  name: "tagsOffName",
  addOptions: () => ({ on: () => false }),
  addProseMirrorPlugins() {
    const on = this.options.on
    return [new Plugin({
      key,
      appendTransaction: (transactions, before, after) => {
        if (!on() || transactions.some((one) => one.getMeta(key)) || !after.doc.firstChild) return null
        // The caret was in the name and is not now: the name was left.
        const inName = (state: EditorState): boolean => state.selection.$head.depth > 0 && state.selection.$head.index(0) === 0
        return inName(before) && !inName(after) ? moved(after) : null
      },
      // Leaving the note itself (another pane, ↓ into its properties, another app) leaves the name too.
      props: {
        handleDOMEvents: {
          blur: (view) => {
            const tr = on() && view.state.selection.$head.depth > 0 && view.state.selection.$head.index(0) === 0 ? moved(view.state) : null
            if (tr) view.dispatch(tr)
            return false
          },
        },
      },
    })]
  },
})
