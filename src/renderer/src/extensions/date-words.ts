import { Extension } from "@tiptap/core"
import type { Node as PMNode } from "@tiptap/pm/model"
import { Plugin, PluginKey, type Transaction } from "@tiptap/pm/state"
import { Decoration, DecorationSet, type EditorView } from "@tiptap/pm/view"

import { clock } from "@/lib/clock"
import { linesTouched } from "@/lib/text-edit"
import { dateWords } from "../../../main/date-words"

/**
 * Dates and times lit as you write, in every note, Journal day and gem: the
 * words stay as typed (a decoration, nothing written), and resting on one says
 * the day it means, read as on the day the note was written ("tomorrow" in a
 * note from March says which day in March). The same reader as quick capture
 * and every task field (task-words.ts), kept to what is surely a date in prose
 * (main/date-words.ts). Links are lit by the editor's own links. Settings,
 * Writing, "Dates and times lit" turns it off in every open note at once.
 */

const key = new PluginKey<DecorationSet>("dateWords")
const views = new Set<EditorView>()
let on = true

export function setDatesLit(enabled: boolean): void {
  if (on === enabled) return
  on = enabled
  for (const view of views) view.dispatch(view.state.tr.setMeta(key, "redraw"))
}

const inert = (doc: PMNode, from: number, to: number): boolean =>
  ["link", "code"].some((name) => doc.type.schema.marks[name] && doc.rangeHasMark(from, to, doc.type.schema.marks[name]))

function paint(doc: PMNode, at: Date, from = 0, to = doc.content.size): Decoration[] {
  const found: Decoration[] = []
  doc.nodesBetween(from, to, (node, pos) => {
    if (!node.isTextblock) return true
    // A heading is a name, not prose: a meeting's "Meeting, 6 Nov at 14:10" was lit whole across its title.
    if (node.type.spec.code || node.type.name === "heading") return false
    const text = node.textBetween(0, node.content.size, undefined, "￼")
    for (const one of dateWords(text, at, clock)) {
      const [start, end] = [pos + 1 + one.from, pos + 1 + one.to]
      if (!inert(doc, start, end)) found.push(Decoration.inline(start, end, { class: "mf-date-word", "data-date-word": "", title: one.said }))
    }
    return false
  })
  return found
}

export const DateWords = Extension.create<{ writtenOn: () => Date | null; box: () => boolean }>({
  name: "dateWords",

  addOptions() {
    return { writtenOn: () => null, box: () => false }
  },

  addProseMirrorPlugins() {
    const { writtenOn, box } = this.options
    // Quick capture lights its own words as commands (lib/box-tokens.ts): nothing twice.
    const lit = (): boolean => on && !box()
    const whole = (doc: PMNode): DecorationSet => (lit() ? DecorationSet.create(doc, paint(doc, writtenOn() ?? new Date())) : DecorationSet.empty)
    return [
      new Plugin<DecorationSet>({
        key,
        state: {
          init: (_, state) => whole(state.doc),
          apply: (tr: Transaction, was: DecorationSet): DecorationSet => {
            if (tr.getMeta(key) === "redraw") return whole(tr.doc)
            if (!tr.docChanged || !lit()) return was
            // Only the lines the edit touched are read again, and their marks put in at once: a long note costs nothing
            // a key, and a long paste coming in a stretch at a time no more than its stretch (taken out and put in a line
            // at a time, each line's marks were set among the whole note's).
            const set = was.map(tr.mapping, tr.doc)
            const at = writtenOn() ?? new Date()
            const drop: Decoration[] = []
            const add: Decoration[] = []
            for (const [from, to] of linesTouched(tr)) (drop.push(...set.find(from, to)), add.push(...paint(tr.doc, at, from, to)))
            return drop.length || add.length ? set.remove(drop).add(tr.doc, add) : set
          },
        },
        view: (view) => {
          views.add(view)
          return { destroy: () => void views.delete(view) }
        },
        props: { decorations: (state) => key.getState(state) },
      }),
    ]
  },
})
