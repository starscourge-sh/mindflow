import { Extension } from "@tiptap/core"
import { Plugin, PluginKey, TextSelection } from "@tiptap/pm/state"
import { Decoration, DecorationSet, type EditorView } from "@tiptap/pm/view"
import { Fragment, Slice, type Node as ProseMirrorNode } from "@tiptap/pm/model"

import { lineCard, termLines } from "../../../main/study"
import { cardListOf } from "../../../main/card-lists"
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

/** A line's words as the main process reads them (study.ts lineCardsIn): a formula as `$...$`, code in backticks. */
const lineText = (block: ProseMirrorNode): string => {
  let text = ""
  block.forEach((node) => {
    if (node.type.name === "inlineMath") text += `$${node.attrs.latex ?? ""}$`
    else if (node.isText) text += node.marks.some((one) => one.type.name === "code") ? `\`${node.text}\`` : node.text
    else text += node.textContent
  })
  return text
}

function marks(doc: ProseMirrorNode): DecorationSet {
  const found: Decoration[] = []
  doc.descendants((node, pos) => {
    if (node.type.name === "codeBlock") return false
    if (!node.isTextblock) return true
    if (lineCard(lineText(node))) found.push(Decoration.widget(pos + node.nodeSize - 1, mark, { side: 1, key: "line-card", ignoreSelection: true }))
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
 * A pasted list of cards (a spreadsheet's two columns, an AI's "front | back"
 * list, Anki's text export) lands as "question :: answer" lines where the
 * cursor is, so each is a card of this note like any line written by hand.
 * A first row naming the columns is left out, a line already in the note is
 * not added twice, and the toast says all of it, with "Show them".
 */
function pasteCards(view: EditorView, list: NonNullable<ReturnType<typeof cardListOf>>): void {
  const had = new Set<string>()
  view.state.doc.descendants((node) => {
    if (!node.isTextblock) return true
    const card = lineCard(lineText(node))
    if (card) had.add(card.question.toLowerCase())
    return false
  })
  const fresh = list.cards.filter((card) => !had.has(card.term.toLowerCase()) && (had.add(card.term.toLowerCase()), true))
  const twice = list.cards.length - fresh.length
  const { schema } = view.state
  const lines = fresh.map((card) => schema.nodes.paragraph.create(null, schema.text(`${card.term} :: ${card.meaning.replace(/\s*\n+\s*/g, " / ")}`)))
  const from = view.state.selection.from
  if (lines.length) view.dispatch(view.state.tr.replaceSelection(new Slice(Fragment.fromArray(lines), 0, 0)).scrollIntoView())
  const to = view.state.selection.from
  const threes = fresh.filter((card) => card.three).length
  const notes = [
    list.headings ? `the first line named the columns (${list.headings.slice(0, 2).join(", ")}), so it is not a card` : "",
    twice ? `${num(twice)} already in this note, left out` : "",
    threes ? `${num(threes)} split in three: split at the first` : "",
  ].filter(Boolean)
  const said = lines.length ? `${num(lines.length)} ${lines.length === 1 ? "card" : "cards"}, one a line: Review asks the words before ::` : "Every card in that list is already in this note"
  window.dispatchEvent(new CustomEvent("haligtree:toast", {
    detail: {
      text: notes.length ? `${said}. ${notes.join("; ").replace(/^./, (first) => first.toUpperCase())}` : said,
      tone: "info",
      action: lines.length ? { label: "Show them", key: "S", run: () => (view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, Math.min(from, view.state.doc.content.size), Math.min(to, view.state.doc.content.size))).scrollIntoView()), view.focus()) } : undefined,
    },
  }))
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
          handlePaste: (view, event) => {
            const plain = event.clipboardData?.getData("text/plain") ?? ""
            const list = cardListOf(plain)
            // Lines copied from a note already read as cards: they paste as they are.
            if (list && !(list.separator === " :: " && event.clipboardData?.getData("text/html"))) return pasteCards(view, list), true
            const pairs = termLines(plain)
            if (pairs.length) setTimeout(() => offerCards(pairs), 300)
            return false
          },
        },
      }),
    ]
  },
})
