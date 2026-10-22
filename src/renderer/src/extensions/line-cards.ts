import { Extension } from "@tiptap/core"
import { Plugin, PluginKey } from "@tiptap/pm/state"
import { Decoration, DecorationSet } from "@tiptap/pm/view"
import type { Node as ProseMirrorNode } from "@tiptap/pm/model"

import { lineCard, termLines } from "../../../main/study"
import { num } from "../../../main/dates"

/** A small card, drawn: what marks a line that Review asks you. */
const mark = (): HTMLElement => {
  const span = document.createElement("span")
  span.className = "mf-line-card"
  span.contentEditable = "false"
  span.setAttribute("aria-label", "A review card")
  span.title = "A review card: Review asks the words before ::"
  span.innerHTML = '<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true"><rect x="4.5" y="2.5" width="9" height="11" rx="2" fill="none" stroke="currentColor" stroke-width="1.4" opacity="0.55"/><rect x="2.5" y="4" width="9" height="10" rx="2" fill="var(--background, #fff)" stroke="currentColor" stroke-width="1.4"/><path d="M5 8h4M5 10.5h2.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>'
  return span
}

function marks(doc: ProseMirrorNode): DecorationSet {
  const found: Decoration[] = []
  doc.descendants((node, pos) => {
    if (node.type.name === "codeBlock") return false
    if (!node.isTextblock) return true
    if (lineCard(node.textContent)) found.push(Decoration.widget(pos + node.nodeSize - 1, mark, { side: 1, key: "line-card", ignoreSelection: true }))
    return false
  })
  return DecorationSet.create(doc, found)
}

/** The toast after a pasted list: Make 12 cards, then Undo. Said the way every toast is (components/haligtree/ui.tsx). */
function offerCards(pairs: { term: string; meaning: string }[]): void {
  const say = (text: string, undo?: () => void, action?: { label: string; key: string; run: () => void }): void =>
    void window.dispatchEvent(new CustomEvent("haligtree:toast", { detail: { text, undo, tone: "info", action } }))
  say(`That reads as a list of ${num(pairs.length)} terms`, undefined, {
    label: `Make ${num(pairs.length)} cards`,
    key: "M",
    run: () => void window.api.haligtree<string[]>("cards:list", pairs).then((ids) =>
      say(`${num(ids.length)} cards made: Review asks each term`, () => void window.api.haligtree("cards:list:undo", ids))),
  })
}

/**
 * A line written as "question :: answer" is a review card (the main process
 * makes it one on save, src/main/line-cards.ts): a small card at the line's
 * end says so, the moment the line reads as one.
 */
export const LineCards = Extension.create({
  name: "lineCards",

  addProseMirrorPlugins() {
    const key = new PluginKey<DecorationSet>("lineCards")
    return [
      new Plugin({
        key,
        state: {
          init: (_, state) => marks(state.doc),
          apply: (tr, set) => (tr.docChanged ? marks(tr.doc) : set),
        },
        props: {
          decorations: (state) => key.getState(state),
          // A pasted list of "term - meaning" lines goes in as it is, and a
          // toast offers to make each one a card.
          handlePaste: (_view, event) => {
            const pairs = termLines(event.clipboardData?.getData("text/plain") ?? "")
            if (pairs.length) setTimeout(() => offerCards(pairs), 300)
            return false
          },
        },
      }),
    ]
  },
})
