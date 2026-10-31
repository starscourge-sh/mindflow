import { Extension } from "@tiptap/core"
import { Plugin, PluginKey, TextSelection } from "@tiptap/pm/state"
import { Decoration, DecorationSet, type EditorView } from "@tiptap/pm/view"
import { Fragment, Slice, type Node as ProseMirrorNode } from "@tiptap/pm/model"

import { lineCard, termLines } from "../../../main/study"
import { cardListOf } from "../../../main/card-lists"
import { openPdf } from "@/components/pdf/pdf-reader"
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

/** A video time written in a line: [13:03] or [1:02:45]. */
export const TIME = /\[((?:\d{1,2}:)?\d{1,2}:[0-5]\d)\]/g
/** "1:02:45" as seconds. */
export const secondsOf = (time: string): number => time.split(":").reduce((all, part) => all * 60 + Number(part), 0)

/** A page cited in a line: (p. 14) or (p 14). */
const PAGE = /\(p\.? ?(\d{1,4})\)/g

/** The note's first PDF, which "(p. 14)" in its lines opens. */
const pdfIn = (doc: ProseMirrorNode): { src: string; name: string } | null => {
  let found: { src: string; name: string } | null = null
  doc.descendants((node) => {
    if (found) return false
    if (node.type.name === "attachment" && /\.pdf$/i.test(String(node.attrs.name ?? ""))) found = { src: String(node.attrs.src), name: String(node.attrs.name) }
    return !found
  })
  return found
}

function marks(doc: ProseMirrorNode): DecorationSet {
  const found: Decoration[] = []
  // Times and pages are links only when the note has the video or PDF they open.
  let video = false
  doc.descendants((node) => (video ||= node.type.name === "youtube", !video))
  const pdf = pdfIn(doc)
  doc.descendants((node, pos) => {
    if (node.type.name === "codeBlock") return false
    if (!node.isTextblock) return true
    if (lineCard(lineText(node))) found.push(Decoration.widget(pos + node.nodeSize - 1, mark, { side: 1, key: "line-card", ignoreSelection: true }))
    // A time in a line, "[13:03]", plays the note's video from there; "(p. 14)" opens its PDF at that page.
    // Their tip is given as `data-title-tip`, never `title`: the app's tips
    // (components/ui/title-tips.tsx) move a `title` there on hover, and that
    // change inside the editor made ProseMirror redraw the line, so the
    // span under the pointer was gone before the click reached it.
    node.forEach((child, offset) => {
      if (!child.isText || child.marks.some((one) => one.type.name === "code")) return
      if (video)
        for (const match of child.text!.matchAll(TIME)) {
          const from = pos + 1 + offset + match.index!
          found.push(Decoration.inline(from, from + match[0].length, { class: "mf-time-link", "data-seconds": String(secondsOf(match[1])), "data-title-tip": "Play the note's video from here" }))
        }
      if (pdf)
        for (const match of child.text!.matchAll(PAGE)) {
          const from = pos + 1 + offset + match.index!
          found.push(Decoration.inline(from, from + match[0].length, { class: "mf-time-link mf-page-link", "data-page": match[1], "data-pdf-peek": pdf.src, "data-pdf-peek-name": pdf.name, "data-pdf-peek-page": match[1] }))
        }
    })
    // A link into a PDF page says the page after its words ("The Law Book · p. 12"),
    // drawn beside the link, never written into it; a link already ending in its page says it once.
    let words = ""
    node.forEach((child, offset) => {
      const href = child.marks.find((one) => one.type.name === "link")?.attrs.href
      const at = typeof href === "string" ? PDF_PAGE.exec(href) : null
      const next = node.childCount > 0 && offset + child.nodeSize < node.content.size ? node.childAfter(offset + child.nodeSize).node : null
      if (!at || !child.isText) return void (words = "")
      words += child.text
      if (next?.marks.some((one) => one.type.name === "link" && one.attrs.href === href)) return
      if (!new RegExp(`p\\.?\\s*${at[1]}\\W*$`).test(words.trim())) found.push(Decoration.widget(pos + 1 + offset + child.nodeSize, pageAfter(at[1]), { side: 1, marks: [], key: `pdf-page-${at[1]}`, ignoreSelection: true }))
      words = ""
    })
    return false
  })
  return DecorationSet.create(doc, found)
}

/** A link into a page of one of the book's PDFs: `haligtree://assets/….pdf#page=12…`. */
const PDF_PAGE = /^(?:haligtree|mindflow):\/\/assets\/[^#?]+\.pdf#(?:.*&)?page=(\d+)/i

/** " · p. 12", quiet, after a PDF link's words. */
const pageAfter = (page: string) => (): HTMLElement => {
  const span = document.createElement("span")
  span.className = "mf-pdf-link-page"
  span.contentEditable = "false"
  span.textContent = ` · p. ${page}`
  return span
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
          // A click on a time plays the note's own video from it: the first
          // video in the note is told, and comes into view.
          handleClick: (view, _pos, event) => {
            const time = (event.target as HTMLElement | null)?.closest?.<HTMLElement>(".mf-time-link")
            if (!time) return false
            if (time.dataset.page) {
              const pdf = pdfIn(view.state.doc)
              if (!pdf) return false
              openPdf(pdf.src, pdf.name, Number(time.dataset.page))
              return true
            }
            const video = view.dom.querySelector<HTMLElement>("[data-youtube-video]")
            if (!video) return false
            window.dispatchEvent(new CustomEvent("haligtree:video-at", { detail: { seconds: Number(time.dataset.seconds), video } }))
            video.scrollIntoView({ block: "center", behavior: "smooth" })
            return true
          },
          // A pasted list of "term - meaning" lines goes in as it is, and a
          // toast offers to make each one a card.
          handlePaste: (view, event) => {
            const plain = event.clipboardData?.getData("text/plain") ?? ""
            const list = cardListOf(plain)
            // Lines copied from a note already read as cards: they paste as they are.
            if (list && !(list.separator === " :: " && event.clipboardData?.getData("text/html"))) return pasteCards(view, list), true
            const pairs = termLines(plain)
            if (pairs.length) offerCards(pairs)
            return false
          },
          // A .csv or .tsv dropped on a note is read as a card list, as if pasted
          // where it was dropped; one that is not two columns says so.
          handleDrop: (view, event) => {
            const file = [...(event.dataTransfer?.files ?? [])].find((one) => /\.(csv|tsv)$/i.test(one.name))
            if (!file) return false
            const at = view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos
            void file.text().then((text) => {
              const list = cardListOf(text)
              if (!list) return void window.dispatchEvent(new CustomEvent("haligtree:toast", { detail: { text: `${file.name} does not read as cards: one card a row, the question then the answer`, tone: "info" } }))
              if (at !== undefined) view.dispatch(view.state.tr.setSelection(TextSelection.near(view.state.doc.resolve(Math.min(at, view.state.doc.content.size)))))
              pasteCards(view, list)
            })
            return true
          },
        },
      }),
    ]
  },
})
