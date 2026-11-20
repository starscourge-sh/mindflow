import { Node, mergeAttributes } from "@tiptap/core"

/** "20 Nov": the day a join was made, as the note's own words would say it. */
const dayOf = (date: string): string => {
  const day = new Date(`${date}T12:00:00`)
  // Kept on one line: "20" and "Nov" never parted by the wrap.
  return (Number.isNaN(day.getTime()) ? date : day.toLocaleDateString("en-GB", { day: "numeric", month: "short" })).replace(" ", " ")
}

/** The divider's words: where the lines under it came from, when, and how many. */
export const joinedWords = (attrs: { title?: string; date?: string; lines?: number }): string =>
  `Joined from “${attrs.title || "another note"}”${attrs.date ? `, ${dayOf(attrs.date)}` : ""} · ${attrs.lines ?? 0} ${attrs.lines === 1 ? "line" : "lines"} it had that this didn't`

/**
 * Where two notes were made one (lib/join-notes.ts, haligtree.ts `notes:join`): a rule with its own words, put in
 * the note kept and stored with it, over the lines the other had that this note didn't. It was a bare rule, and
 * nothing said what had happened or where ("can't tell what happened? was it appended?", 20 Nov).
 */
export const JoinedFrom = Node.create({
  name: "joinedFrom",
  group: "block",
  atom: true,
  selectable: true,
  draggable: false,
  addAttributes() {
    return {
      title: { default: "" },
      date: { default: "" },
      lines: { default: 0 },
      // Its own name, so the window that made the join can find it as the note opens again.
      at: { default: null, renderHTML: (attrs) => (attrs.at ? { "data-joined-at": attrs.at } : {}) }
    }
  },
  parseHTML() {
    return [{ tag: "div[data-joined-from]", getAttrs: (el) => ({ title: el.getAttribute("data-title") ?? "", date: el.getAttribute("data-date") ?? "", lines: Number(el.getAttribute("data-lines") ?? 0), at: el.getAttribute("data-joined-at") }) }]
  },
  renderHTML({ node, HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-joined-from": "", "data-title": node.attrs.title, "data-date": node.attrs.date, "data-lines": String(node.attrs.lines), class: "mf-joined-from", contenteditable: "false" }),
      ["span", { class: "mf-joined-from-words" }, joinedWords(node.attrs)]]
  },
  renderText({ node }) {
    return joinedWords(node.attrs)
  }
})
