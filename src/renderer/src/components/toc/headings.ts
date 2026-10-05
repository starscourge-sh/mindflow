import { Extension, type JSONContent } from "@tiptap/core"
import { TextSelection } from "@tiptap/pm/state"
import type { Editor } from "@tiptap/react"

import { headingRank } from "@/extensions/toggle-heading"
import { cue } from "@/lib/cues"

export interface Heading {
  pos: number
  level: number
  text: string
}

/**
 * Every heading in the document, in order.
 *
 * A folded heading is a `details` whose summary carries the rank, so it counts
 * as a heading too - otherwise folding one drops it from the outline while its
 * own sub-headings stay, and the list reads as orphans.
 */
export function headingsOf(editor: Editor): Heading[] {
  const headings: Heading[] = []
  editor.state.doc.descendants((node, pos) => {
    const rank = headingRank(node)
    if (rank === null) return !node.isTextblock

    const folded = node.type.name === "details"
    const text = (folded ? node.child(0) : node).textContent.trim()
    if (text) headings.push({ pos, level: rank, text })
    // Keep descending into a folded section: its sub-headings still count.
    return folded
  })
  return headings
}

/**
 * The headings in a stored note, JSON or Markdown, without opening it: what a
 * host hands back for `@Note#`.
 */
export function headingsIn(doc: JSONContent | string | null | undefined): string[] {
  // Emphasis marks come off, so `## The *plan*` is found as "The plan", the
  // words the editor shows; a snake_case word keeps its underscore.
  if (typeof doc === "string") return [...doc.matchAll(/^#{1,6}\s+(.+)$/gm)].map((match) => match[1].replace(/(^|[^\w*])(\*{1,3}|_{1,3})(?!\s)(.+?)(?<!\s)\2(?![\w*])/g, "$1$3").trim())
  const found: string[] = []
  const text = (node: JSONContent): string => node.text ?? (node.content ?? []).map(text).join("")
  const walk = (node: JSONContent): void => {
    if (node.type === "heading") found.push(text(node).trim())
    // A folded heading: its rank is on the section's content, its words in the summary.
    else if (node.type === "details" && node.content?.[1]?.attrs?.level) found.push(text(node.content[0]).trim())
    node.content?.forEach(walk)
  }
  if (doc) walk(doc)
  return found.filter(Boolean)
}

/** Put the caret on a heading and bring it into view. */
export function land(editor: Editor, heading: Heading): void {
  // Near, not at: a folded heading's first position is the section itself,
  // not text, and a bare position there would leave the caret nowhere.
  editor.chain().focus().command(({ tr }) => {
    tr.setSelection(TextSelection.near(tr.doc.resolve(heading.pos + 1)))
    return true
  }).scrollIntoView().run()
  cue("heading")
}

/**
 * Go to the heading with these words, ignoring case: where a link to a heading
 * lands. False when the note has no such heading any more.
 */
export function goToHeading(editor: Editor, text: string): boolean {
  const wanted = text.trim().toLowerCase()
  const found = headingsOf(editor).find((one) => one.text.toLowerCase() === wanted)
  if (found) land(editor, found)
  return !!found
}

/** Asks the outline beside this editor to take the keys. */
export const OPEN = "mindflow-outline"

/**
 * The outline's keys, bound to the editor so they only act on the one being
 * typed in: ⌥⌘↓ and ⌥⌘↑ go to the next and previous heading, ⇧⌘O opens the
 * outline to move through by arrows and Return.
 */
export const OutlineKeys = Extension.create({
  name: "outlineKeys",

  addKeyboardShortcuts() {
    const jump = (forward: boolean) => (): boolean => {
      const { from } = this.editor.state.selection
      const headings = headingsOf(this.editor)
      const next = forward
        ? headings.find((one) => one.pos + 1 > from)
        : headings.findLast((one) => one.pos + 1 < from)
      if (next) land(this.editor, next)
      // Taken either way: at the last heading the key should not fall through
      // to moving the caret a line.
      return true
    }
    return {
      "Mod-Alt-ArrowDown": jump(true),
      "Mod-Alt-ArrowUp": jump(false),
      "Mod-Shift-o": () => {
        this.editor.view.dom.dispatchEvent(new CustomEvent(OPEN))
        return true
      },
    }
  },
})
