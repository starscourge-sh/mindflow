import { Extension } from "@tiptap/core"
import { Plugin, PluginKey, TextSelection, type Transaction } from "@tiptap/pm/state"
import { Decoration, DecorationSet, type EditorView } from "@tiptap/pm/view"
import { Fragment, Slice, type Node as ProseMirrorNode } from "@tiptap/pm/model"

import { lineCard, termLines } from "../../../main/study"
import { cardListOf } from "../../../main/card-lists"
import { openPdf } from "@/components/pdf/pdf-reader"
import { labelFor } from "@/components/pdf/pdf-labels"
import { isAudio } from "@/lib/transcribe"
import { glideWay } from "@/lib/motion"
import { changedSpan, linesTyped } from "@/lib/text-edit"
import { lineText } from "@/lib/note-size"
import { copyOf } from "@/lib/icon-markup"
import { canSplit, openAside, openNewTab, takeClick } from "@/lib/split"
import { chime } from "@/lib/sound"

/** A video file kept in the note, which its times play too. */
const isVideoFile = (node: ProseMirrorNode): boolean => node.type.name === "attachment" && /\.(mp4|mov|m4v|webm)$/i.test(String(node.attrs.name || node.attrs.src || ""))
import { num, plural } from "../../../main/dates"

/**
 * A small card, drawn: what marks a line that Review asks you, and the way to
 * that card. Its tip is a `data-title-tip`, never a `title` (see lineMarks).
 */
const mark = (): HTMLElement => {
  const span = document.createElement("span")
  span.className = "mf-line-card"
  span.contentEditable = "false"
  span.setAttribute("role", "button")
  span.setAttribute("aria-label", "Open its card")
  span.dataset.titleTip = "Open its card (⌘-click: new tab)"
  span.append(copyOf('<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true"><rect x="4.5" y="2.5" width="9" height="11" rx="2" fill="none" stroke="currentColor" stroke-width="1.4" opacity="0.55"/><rect x="2.5" y="4" width="9" height="10" rx="2" fill="var(--background, #fff)" stroke="currentColor" stroke-width="1.4"/><path d="M5 8h4M5 10.5h2.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>'))
  return span
}

/** The note a card's `line_of` names, from the editor's `documentId`: `capture:…`, `nugget:…` or `day:…`. */
export const cardSource = (documentId: string | number | null | undefined): string | null => {
  const found = /^(capture|item|day)-(.+)$/.exec(String(documentId ?? ""))
  return found ? `${found[1] === "item" ? "nugget" : found[1]}:${found[2]}` : null
}

/** The question of a block that is a card line (the block itself, or a list item's first line), or null. */
export const cardQuestion = (block: ProseMirrorNode | null | undefined): string | null => {
  const line = block?.isTextblock ? block : block?.firstChild?.isTextblock ? block.firstChild : null
  return (line && line.type.name !== "codeBlock" && lineCard(lineText(line))?.question) || null
}

/**
 * Open the card a line is: beside the note when the window can split (⌘-click: a new tab), in place in a note's own
 * window. A line typed but not saved yet has no card yet: said plainly, and nothing moves.
 */
export async function openLineCard(source: string | null, question: string, how: "aside" | "tab" | null = canSplit() ? (takeClick() === "tab" ? "tab" : "aside") : null): Promise<void> {
  const say = (text: string): void => void window.dispatchEvent(new CustomEvent("haligtree:toast", { detail: { text, tone: "info" } }))
  const id = source ? await window.api.haligtree<string | null>("cards:of-line", source, question).catch(() => null) : null
  if (!id) return say(source ? "This line's card is made when the note saves: try again in a moment" : "Only a saved note's lines are cards")
  chime("open")
  if (how === "tab") openNewTab("nugget", id)
  else if (how === "aside") openAside("nugget", id)
  else window.api.openInHome("nugget", id)
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

/** What the marks of one line depend on beyond the line: the note's video, its PDF, and whether it holds a recording. */
type Facts = { video: boolean; pdf: { src: string; name: string } | null; audio: boolean }
type Marked = { set: DecorationSet; facts: Facts }

function marks(doc: ProseMirrorNode): Marked {
  const found: Decoration[] = []
  // Times and pages are links only when the note has the video or PDF they open.
  let video = false
  doc.descendants((node) => (video ||= node.type.name === "youtube" || isVideoFile(node), !video))
  const pdf = pdfIn(doc)
  // The last recording above a line: a time under it plays that recording, as a transcript's times do (lib/transcribe.ts).
  let audio: string | null = null
  let heard = false
  doc.descendants((node, pos) => {
    if (node.type.name === "codeBlock") return false
    if (isAudio(node)) return void ((audio = String(node.attrs.src)), (heard = true))
    if (!node.isTextblock) return true
    lineMarks(node, pos, audio, video, pdf, found)
    return false
  })
  return { set: DecorationSet.create(doc, found), facts: { video, pdf, audio: heard } }
}

/**
 * Words typed into lines, and nothing else: only those lines are marked
 * again. Words alone never add or take away a video, a PDF or a recording, so
 * what the rest of the note says is unchanged. A note with a recording is
 * marked whole, as a line's recording is the last one above it.
 */
function remark(tr: Transaction, was: Marked): Marked {
  const lines = was.facts.audio ? null : linesTyped(tr)
  if (!lines) return was.facts.audio ? marks(tr.doc) : remarkStretch(tr, was)
  let set = was.set.map(tr.mapping, tr.doc)
  for (const { after } of lines) {
    const node = tr.doc.nodeAt(after)
    if (!node?.isTextblock) return marks(tr.doc)
    // A code block is never marked.
    if (node.type.name === "codeBlock") continue
    set = set.remove(set.find(after, after + node.nodeSize))
    const found: Decoration[] = []
    lineMarks(node, after, null, was.facts.video, was.facts.pdf, found)
    set = set.add(tr.doc, found)
  }
  return { set, facts: was.facts }
}

/** A video, a PDF or a recording in a stretch of a note: what the times and pages of every line open by. */
const bringsFacts = (doc: ProseMirrorNode, from: number, to: number): boolean => {
  let found = false
  doc.nodesBetween(from, to, (node) => !(found ||= node.type.name === "youtube" || isVideoFile(node) || isAudio(node) || (node.type.name === "attachment" && /\.pdf$/i.test(String(node.attrs.name ?? "")))))
  return found
}

/**
 * Blocks added, taken away or changed in kind (a paste, a block carried, Enter): only the lines in the stretch where
 * the note changed (lib/text-edit.ts `changedSpan`) are marked again, when neither what went nor what came holds a
 * video, a PDF or a recording. Marked whole on every such change, a long note pasted in a stretch at a time was
 * marked whole once a stretch (606 ms on the largest).
 */
function remarkStretch(tr: Transaction, was: Marked): Marked {
  const span = changedSpan(tr.before, tr.doc)
  if (!span) return { set: was.set.map(tr.mapping, tr.doc), facts: was.facts }
  if (bringsFacts(tr.before, span.from, span.oldTo) || bringsFacts(tr.doc, span.from, span.newTo)) return marks(tr.doc)
  const found: Decoration[] = []
  let start = span.from
  let end = span.newTo
  tr.doc.nodesBetween(span.from, span.newTo, (node, pos) => {
    if (node.type.name === "codeBlock") return false
    if (!node.isTextblock) return true
    start = Math.min(start, pos)
    end = Math.max(end, pos + node.nodeSize)
    lineMarks(node, pos, null, was.facts.video, was.facts.pdf, found)
    return false
  })
  const set = was.set.map(tr.mapping, tr.doc)
  return { set: set.remove(set.find(start, end)).add(tr.doc, found), facts: was.facts }
}

/** The marks of one line: a transcript's time, a card's "::", a time or page that opens, a PDF link's page. */
function lineMarks(node: ProseMirrorNode, pos: number, audio: string | null, video: boolean, pdf: { src: string; name: string } | null, found: Decoration[]): void {
  {
    // A transcript's line, starting with its time: quiet, under its recording.
    if (audio && /^\[(?:\d{1,2}:)?\d{1,2}:[0-5]\d\]/.test(node.textContent)) found.push(Decoration.node(pos, pos + node.nodeSize, { class: "mf-transcript-line", "data-words-of": audio }))
    if (lineCard(lineText(node))) found.push(Decoration.widget(pos + node.nodeSize - 1, mark, { side: 1, key: "line-card", ignoreSelection: true }))
    // A time in a line, "[13:03]", plays the note's video from there; "(p. 14)" opens its PDF at that page.
    // Their tip is given as `data-title-tip`, never `title`: the app's tips
    // (components/ui/title-tips.tsx) move a `title` there on hover, and that
    // change inside the editor made ProseMirror redraw the line, so the
    // span under the pointer was gone before the click reached it.
    node.forEach((child, offset) => {
      if (!child.isText || child.marks.some((one) => one.type.name === "code")) return
      if (audio || video)
        for (const match of child.text!.matchAll(TIME)) {
          const from = pos + 1 + offset + match.index!
          found.push(Decoration.inline(from, from + match[0].length, audio
            ? { class: "mf-time-link", "data-seconds": String(secondsOf(match[1])), "data-audio": audio, "data-title-tip": "Play the recording from here" }
            : { class: "mf-time-link", "data-seconds": String(secondsOf(match[1])), "data-title-tip": "Play the note's video from here" }))
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
      // The page as the book prints it ("48", the file's 50th); said once, whether the words end "p. 48", "page 48" or the file's own number.
      const printed = labelFor(at[1], Number(at[2]))
      if (!new RegExp(`(?:p\\.?|pages?)\\s*(?:${printed.replace(/\W/g, "\\$&")}|${at[2]})\\W*$`, "i").test(words.trim())) found.push(Decoration.widget(pos + 1 + offset + child.nodeSize, pageAfter(printed), { side: 1, marks: [], key: `pdf-page-${printed}`, ignoreSelection: true }))
      words = ""
    })
  }
}

/** Play a recording in the note from a time: its block comes into view. False when it is not there. */
export function playAt(root: HTMLElement, src: string, seconds: number): boolean {
  const audio = [...root.querySelectorAll<HTMLAudioElement>(".tiptap-attachment.is-audio audio")].find((one) => one.getAttribute("src") === src)
  if (!audio) return false
  audio.currentTime = seconds
  void audio.play()
  audio.closest(".tiptap-attachment")?.scrollIntoView({ block: "nearest", behavior: glideWay() })
  return true
}

/** A link into a page of one of the book's PDFs: `haligtree://assets/….pdf#page=12…`. */
const PDF_PAGE = /^((?:haligtree|mindflow):\/\/assets\/[^#?]+\.pdf)#(?:.*&)?page=(\d+)/i

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
  const said = lines.length ? `${plural(lines.length, 'card')}, one a line: Review asks the words before ::` : "Every card in that list is already in this note"
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
export const LineCards = Extension.create<{ source: () => string | null }>({
  name: "lineCards",

  addOptions() {
    return { source: () => null }
  },

  addProseMirrorPlugins() {
    const key = new PluginKey<Marked>("lineCards")
    const { source } = this.options
    return [
      new Plugin({
        key,
        state: {
          init: (_, state) => marks(state.doc),
          apply: (tr, was) => (tr.docChanged ? remark(tr, was) : was),
        },
        props: {
          decorations: (state) => key.getState(state)?.set,
          // The card mark opens its card: pressed, the caret stays where it was; clicked, the card opens.
          handleDOMEvents: {
            mousedown: (_view, event) => {
              if (event.button !== 0 || !(event.target as HTMLElement | null)?.closest?.(".mf-line-card")) return false
              event.preventDefault()
              return true
            },
            click: (view, event) => {
              const at = (event.target as HTMLElement | null)?.closest?.<HTMLElement>(".mf-line-card")
              if (!at || event.button !== 0) return false
              event.preventDefault()
              const question = cardQuestion(view.state.doc.resolve(Math.min(view.posAtDOM(at, 0), view.state.doc.content.size)).parent)
              if (question) void openLineCard(source(), question)
              return true
            },
          },
          // A click on a time plays the note's own video from it: the first
          // video in the note is told, and comes into view.
          handleClick: (view, _pos, event) => {
            const time = (event.target as HTMLElement | null)?.closest?.<HTMLElement>(".mf-time-link")
            // A right-click is for the time's menu (turn-into/clicked.tsx): it never plays or opens.
            if (!time || event.button !== 0) return false
            if (time.dataset.page) {
              const pdf = pdfIn(view.state.doc)
              if (!pdf) return false
              openPdf(pdf.src, pdf.name, Number(time.dataset.page))
              return true
            }
            if (time.dataset.audio) return playAt(view.dom, time.dataset.audio, Number(time.dataset.seconds))
            // A video file in the note plays from the time itself.
            const file = view.dom.querySelector<HTMLVideoElement>("video.tiptap-attachment-video")
            if (file && !view.dom.querySelector("[data-youtube-video]")) {
              file.currentTime = Number(time.dataset.seconds)
              void file.play()
              file.scrollIntoView({ block: "center", behavior: glideWay() })
              return true
            }
            const video = view.dom.querySelector<HTMLElement>("[data-youtube-video]")
            if (!video) return false
            window.dispatchEvent(new CustomEvent("haligtree:video-at", { detail: { seconds: Number(time.dataset.seconds), video } }))
            video.scrollIntoView({ block: "center", behavior: glideWay() })
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
