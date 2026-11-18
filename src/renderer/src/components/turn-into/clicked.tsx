import { getMarkRange, type Editor } from "@tiptap/core"
import { TextSelection } from "@tiptap/pm/state"

import { DropdownMenuItem, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger } from "@/components/tiptap-ui-primitive/dropdown-menu"
import { MenuGlyph } from "@/components/ui/menu-icon"
import { removeLink } from "@/components/haligtree/link-editor"
import { copyLink } from "@/components/haligtree/row-menu"
import { ask } from "@/components/haligtree/ui"
import { openPdf } from "@/components/pdf/pdf-reader"
import { isWebPage, openArticle } from "@/components/pdf/web-reader"
import { haligtree } from "@/lib/haligtree"
import { host, said } from "@/lib/host"
import { pictureLines } from "@/lib/picture-actions"
import { lookUp } from "@/components/pdf/look-up"
import { playAt } from "@/extensions/line-cards"
import { toNote } from "@/extensions/footnotes"
import { editPage } from "@/extensions/citation"
import { openSource } from "@/lib/sources"

/** Picked words looked up in the one Look Up card, under them, with the line they sit in kept beside the Lookup. */
export function lookUpIn(editor: Editor, from: number, to: number, words: string, origin?: string | null): void {
  const end = editor.view.coordsAtPos(to)
  const start = editor.view.coordsAtPos(from)
  const sentence = editor.state.doc.resolve(from).parent.textContent.trim()
  // The words' own place in the page, found again whenever the editor draws the line anew, so they stay marked while the card is open.
  const range = (): Range | null => {
    if (editor.isDestroyed) return null
    try {
      const at = document.createRange()
      const a = editor.view.domAtPos(from)
      const b = editor.view.domAtPos(to)
      at.setStart(a.node, a.offset)
      at.setEnd(b.node, b.offset)
      return at.collapsed ? null : at
    } catch {
      return null
    }
  }
  lookUp({ range,  words: words.replace(/\s+/g, " ").trim(), x: (start.left + end.right) / 2, y: end.bottom, from: { where: "", link: "", sentence: sentence && sentence !== words ? sentence : undefined, origin } })
}
import { canSplit, openAside, openNewTab } from "@/lib/split"
import { openApart, openSmall, smallHolds } from "@/lib/apart"
import { keptAs } from "@/lib/capture-links"
import { followGhost } from "@/extensions/note-link"
import { chime } from "@/lib/sound"
import { enqueue } from "@/lib/reading-queue"
import { quoted } from '../../../../main/clip'
import { makeQuestion, questionsFit } from "@/components/haligtree/note-questions"
import { helpLines } from "@/components/haligtree/writing-help"

/**
 * What a right-click landed on, read once at the click: its own lines go at
 * the top of the block menu, above "Turn into" and the block's lines, as a
 * right-click anywhere else in a Mac app puts the clicked thing first.
 */
export type Clicked =
  | { kind: "note"; pos: number; id: string; label: string; heading: string; text: string }
  | { kind: "web"; from: number; to: number; href: string }
  | { kind: "pdf"; from: number | null; to: number | null; href: string | null; src: string; name: string; page: number; block?: HTMLElement }
  | { kind: "words"; from: number; to: number; words: string }
  | { kind: "tag"; tag: string }
  | { kind: "formula"; pos: number; latex: string }
  | { kind: "footnote"; pos: number; id: string; n: number }
  | { kind: "citation"; pos: number; work: string; page: string }
  | { kind: "time"; seconds: number; text: string; audio?: string }
  | { kind: "picture"; src: string }
  | { kind: "video"; src: string }

/** A link into one of the book's PDFs: `haligtree://assets/….pdf#page=3&name=…`. */
const PDF_LINK = /^((?:haligtree|mindflow):\/\/assets\/[^#?]+\.pdf)(?:#(.*))?$/i

/** The link mark's whole run around `pos`, as one range. */
function linkRange(editor: Editor, pos: number): { from: number; to: number } | null {
  const type = editor.schema.marks.link
  if (!type) return null
  for (const at of [pos, pos + 1]) {
    if (at < 0 || at > editor.state.doc.content.size) continue
    const range = getMarkRange(editor.state.doc.resolve(at), type)
    if (range) return range
  }
  return null
}

/** Read what is under the pointer of a right-click: a link, a PDF, or the words picked. Null for a plain line. */
export function clickedAt(editor: Editor, event: MouseEvent): Clicked | null {
  const target = event.target instanceof Element ? event.target : null
  const view = editor.view
  const note = target?.closest<HTMLElement>("a[data-note]")
  if (note && view.dom.contains(note)) {
    const pos = view.posAtDOM(note, 0) - 1
    const found = [pos, pos + 1].find((at) => editor.state.doc.nodeAt(at)?.type.name === "noteLink")
    const node = found == null ? null : editor.state.doc.nodeAt(found)
    if (node && found != null) {
      const { id, label, heading, text } = node.attrs as Record<string, string>
      return { kind: "note", pos: found, id: id ?? "", label: label ?? "", heading: heading ?? "", text: text ?? "" }
    }
  }
  const anchor = target?.closest<HTMLAnchorElement>("a[href]")
  if (anchor && view.dom.contains(anchor)) {
    const href = anchor.getAttribute("href") ?? ""
    const range = linkRange(editor, view.posAtDOM(anchor, 0))
    const pdf = PDF_LINK.exec(href)
    if (pdf) {
      const hash = new URLSearchParams(pdf[2] ?? "")
      return { kind: "pdf", from: range?.from ?? null, to: range?.to ?? null, href, src: pdf[1], name: hash.get("name") ?? "", page: Number(hash.get("page")) || 1 }
    }
    if (range && href) return { kind: "web", ...range, href }
  }
  // A PDF shown in the note (its block, or a "(p. N)" drawn over the words): the same file lines.
  // A PDF block anywhere (its card, its bar, its pages): the page on show, and its view choices.
  const block = target?.closest<HTMLElement>(".tiptap-attachment.is-pdf")
  const named = block?.querySelector<HTMLElement>("[data-pdf-peek]")
  if (block && named?.dataset.pdfPeek && view.dom.contains(block))
    return { kind: "pdf", from: null, to: null, href: null, src: named.dataset.pdfPeek, name: named.dataset.pdfPeekName ?? "", page: Number(block.dataset.pdfPage) || 1, block }
  const tagged = target?.closest<HTMLElement>("[data-pdf-peek]")
  if (tagged?.dataset.pdfPeek && view.dom.contains(tagged))
    return { kind: "pdf", from: null, to: null, href: null, src: tagged.dataset.pdfPeek, name: tagged.dataset.pdfPeekName ?? "", page: Number(tagged.dataset.pdfPeekPage) || 1 }
  // A "[m:ss]" in a line: plays the note's video from there.
  const time = target?.closest<HTMLElement>(".mf-time-link[data-seconds]")
  if (time && view.dom.contains(time)) return { kind: "time", seconds: Number(time.dataset.seconds) || 0, text: (time.textContent ?? "").replace(/[[\]]/g, ""), audio: time.dataset.audio }
  const chip = target?.closest<HTMLElement>('.tiptap-token[data-token="tag"]')
  if (chip && view.dom.contains(chip)) return { kind: "tag", tag: (chip.textContent ?? "").replace(/^#/, "").trim() }
  // A citation, found from its chip: one that wraps onto a second line has no node under the pointer's coordinates.
  const cited = target?.closest<HTMLElement>(".mf-citation-holder")
  if (cited && view.dom.contains(cited)) {
    let pos: number | null = null
    editor.state.doc.descendants((one, at) => (pos === null && one.type.name === "citation" && !!view.nodeDOM(at)?.contains(cited) && (pos = at), pos === null))
    const node = pos == null ? null : editor.state.doc.nodeAt(pos)
    if (node?.attrs.work && pos != null) return { kind: "citation", pos, work: String(node.attrs.work), page: String(node.attrs.page ?? "") }
  }
  // A formula, a picture or a video: the node under the pointer.
  const atom = view.posAtCoords({ left: event.clientX, top: event.clientY })?.inside ?? -1
  const node = atom >= 0 ? editor.state.doc.nodeAt(atom) : null
  if (node && /^(inline|block)Math$/.test(node.type.name)) return { kind: "formula", pos: atom, latex: String(node.attrs.latex ?? "") }
  if (node?.type.name === "footnoteReference") return { kind: "footnote", pos: atom, id: String(node.attrs.id), n: Number(node.attrs.n) || 1 }
  if (node?.type.name === "image" && node.attrs.src && target?.closest("img")) return { kind: "picture", src: String(node.attrs.src) }
  if (node?.type.name === "youtube" && node.attrs.src) return { kind: "video", src: String(node.attrs.src) }
  // Words picked, and the click on them: what you do with words comes first.
  const { selection } = editor.state
  if (selection instanceof TextSelection && !selection.empty) {
    const at = view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos
    if (at != null && at >= selection.from && at <= selection.to) {
      const words = editor.state.doc.textBetween(selection.from, selection.to, " ").trim()
      if (words) return { kind: "words", from: selection.from, to: selection.to, words }
    }
  }
  return null
}

/** The heading over the clicked thing's lines: what it is, in a few words. */
export function clickedName(clicked: Clicked): string {
  // Named for what it leads to: a person's link is not a note's.
  if (clicked.kind === "note") return `Link to ${({ person: "a person", character: "a character", task: "a task", nugget: "a gem", goal: "a goal", question: "a question", pdf: "a PDF", web: "a web page" } as Record<string, string>)[split(clicked.id)[0]] ?? "a note"}`
  if (clicked.kind === "web") return "Link"
  if (clicked.kind === "pdf") return `PDF, page ${clicked.page}`
  if (clicked.kind === "tag") return `#${clicked.tag}`
  if (clicked.kind === "formula") return "Formula"
  if (clicked.kind === "footnote") return `Footnote ${clicked.n}`
  if (clicked.kind === "citation") return clicked.page ? `Citation, p. ${clicked.page}` : "Citation"
  if (clicked.kind === "time") return `Time ${clicked.text}`
  if (clicked.kind === "picture") return "Picture"
  if (clicked.kind === "video") return "Video"
  return "Picked words"
}

type Line = { label: string; run: () => void; hint?: string; data?: string; edits?: boolean; /** Lines of their own, opened to the side: a picture's "Text in it". */ sub?: Line[] }

/** A note link's id as the app keeps it: `tier:id` for most, a bare id for a capture. */
const split = (link: string): [string, string] =>
  link.includes(":") ? [link.slice(0, link.indexOf(":")), link.slice(link.indexOf(":") + 1)] : ["capture", link]

const cut = (words: string, most = 40): string => (words.length > most ? `${words.slice(0, most).trim()}…` : words)

/** Put words on the clipboard and say so. */
const copyText = (text: string, done: string): void =>
  void navigator.clipboard.writeText(text).then(() => said(done), () => said("Could not copy it", false))

/** A link's words picked, so the link box and "Remove link" act on it as on the caret's. */
const pick = (editor: Editor, from: number, to: number): void => void editor.chain().focus().setTextSelection({ from, to }).run()

/** A PDF block's view choices, the same as its bar's, each told to the block (attachment-view.tsx). */
function viewLines(block?: HTMLElement): Line[] {
  if (!block) return []
  const tell = (what: string) => (): void => void block.dispatchEvent(new CustomEvent("mf:pdf-view", { detail: what }))
  const height = block.dataset.pdfFit === "height"
  const two = block.dataset.pdfSpread === "two"
  const paper = block.classList.contains("is-paper")
  const rail = block.dataset.pdfRail
  return [
    { label: height ? "Fit width" : "Fit height", data: height ? "fit-width" : "fit-height", run: tell(height ? "fit-width" : "fit-height") },
    { label: two ? "One page" : "Two pages", data: two ? "one" : "two", run: tell(two ? "one" : "two") },
    { label: paper ? "White pages" : "Paper pages", data: "paper", run: tell("paper") },
    rail ? { label: "Hide the sidebar", data: "no-rail", run: tell("no-rail") } : { label: "Show pages in a sidebar", data: "pages", run: tell("pages") },
    ...(block.hasAttribute("data-pdf-outline") ? [{ label: "Show this page in contents", data: "outline", run: tell("outline") }] : []),
  ]
}

/**
 * A link to one line made the line itself, shown in place and live (a block
 * reference), in one undoable step. A link alone on its line takes the line's
 * place; one among words leaves them, the line shown under them.
 */
function showLineHere(editor: Editor, pos: number): void {
  const node = editor.state.doc.nodeAt(pos)
  if (node?.type.name !== "noteLink" || !node.attrs.block) return
  const $pos = editor.state.doc.resolve(pos)
  const line = $pos.parent
  const embed = { type: "noteEmbed", attrs: { id: node.attrs.id, label: node.attrs.label, block: node.attrs.block } }
  const alone = line.textContent.trim() === "" && line.childCount <= 2
  chime("open")
  if (alone && $pos.depth > 0) editor.chain().focus().insertContentAt({ from: $pos.before(), to: $pos.after() }, embed).run()
  else if ($pos.depth > 0) editor.chain().focus().deleteRange({ from: pos, to: pos + node.nodeSize }).insertContentAt($pos.after() - node.nodeSize, embed).run()
}

/** The lines for what was clicked, in the order a person reaches for them. */
export function clickedLines(editor: Editor, clicked: Clicked): Line[] {
  if (clicked.kind === "note") {
    const { id, label, heading, pos } = clicked
    const [type, key] = split(id)
    const own = !["task", "person", "character", "tag", "event", "day", "pdf", "web"].includes(type)
    const open = editor.extensionManager.extensions.find((one) => one.name === "noteLink")?.options.onOpenNote as ((id: string, heading?: string) => void) | undefined
    const shown = clicked.text || label
    // Where it lands, as a click on it lands (capture-links.tsx keptAs): a bare id may be a gem's or a page's own.
    const landed = (go: (type: string, key: string) => void) => (): void => void (type === "capture" ? keptAs(key).then((to) => go(to.type, to.id)) : go(type, key))
    // A link to a note not here yet opens as a click on it does: brought in from the vault, asked about, or made empty.
    // Then where its line opens it, as `landed` does for a note already here.
    const ghost = !id && !!label && !!open
    const opened = (go: (type: string, key: string) => void) => (link: string): void => {
      const [kind, at] = split(link)
      void (kind === "capture" ? keptAs(at).then((to) => go(to.type, to.id)) : go(kind, at))
    }
    // Asked at the link itself, if two vault notes have its name.
    const follow = (go?: (link: string) => void) => (): void => {
      const box = editor.view.coordsAtPos(pos)
      followGhost(editor, { label, heading }, { x: box.left, y: box.bottom }, go)
    }
    const lines: Array<Line | false> = [
      !!id && !!open && { label: "Open", data: "open", run: () => open(id, heading || undefined) },
      ghost && { label: "Open", data: "open", run: follow() },
      // The other ways in, together under "Open" and in the order every row's menu keeps them (row-menu.tsx WAYS_TO_OPEN).
      !!id && canSplit() && { label: "Open in a new tab", data: "tab", run: landed(openNewTab) },
      ghost && canSplit() && { label: "Open in a new tab", data: "tab", run: follow(opened(openNewTab)) },
      // Beside the pane the note is in, not the one in front: that may be the pane last opened beside it.
      !!id && canSplit() && { label: "Open to the side", data: "aside", run: landed((to, at) => openAside(to, at, editor.view.dom.closest("[data-pane]")?.getAttribute("data-pane"))) },
      ghost && canSplit() && { label: "Open to the side", data: "aside", run: follow(opened((to, at) => openAside(to, at, editor.view.dom.closest("[data-pane]")?.getAttribute("data-pane")))) },
      !!id && own && { label: "Open in a new window", data: "apart", run: landed(openApart) },
      !!id && own && smallHolds(type) && { label: "Open in a small window", hint: "Keeps writing there while quick capture stays free", data: "small", run: landed(openSmall) },
      // A link to one line: that line shown here instead, live (what its preview card once offered).
      !!id && !!editor.state.doc.nodeAt(pos)?.attrs.block && { label: "Show the line here", edits: true, data: "line-here", run: () => showLineHere(editor, pos) },
      // Spotify's two verbs, for the note it leads to.
      !!id && own && type !== "goal" && { label: "Add to queue", data: "queue", run: () => void enqueue([key]) },
      !!id && own && type !== "goal" && { label: "Read next", data: "read-next", run: () => void enqueue([key], true) },
      !!id && { label: "Copy link", data: "copy-link", run: () => copyLink(id, label) },
      !!id && type !== "capture" && own && {
        label: "Rename…", edits: true,
        data: "rename",
        run: () => void ask("A new name", label, { initial: label, action: "Rename" }).then((name) => {
          const next = name?.trim()
          if (!next || next === label) return
          void haligtree.saveItem(key, { title: next }).then(() => chime("noted"))
        }),
      },
      {
        label: "Edit link text…", edits: true,
        data: "edit-text",
        run: () => void ask("What the link says", label, { initial: shown, action: "Change the words" }).then((words) => {
          if (words === null) return
          const node = editor.state.doc.nodeAt(pos)
          if (node?.type.name !== "noteLink") return
          editor.chain().focus().command(({ tr }) => (tr.setNodeMarkup(pos, undefined, { ...node.attrs, text: words.trim() === label ? "" : words.trim() }), true)).run()
        }),
      },
      {
        label: "Remove link", edits: true,
        hint: "Keeps the words",
        data: "unlink",
        run: () => {
          const node = editor.state.doc.nodeAt(pos)
          if (node?.type.name !== "noteLink") return
          chime("fold")
          editor.chain().focus().insertContentAt({ from: pos, to: pos + node.nodeSize }, shown || "New note").run()
        },
      },
    ]
    return lines.filter((one): one is Line => !!one && (!one.edits || editor.isEditable))
  }
  if (clicked.kind === "web") {
    const { href, from, to } = clicked
    const lines: Array<Line | false> = [
      { label: "Open in the browser", data: "browser", run: () => void window.open(href) },
      isWebPage(href) && { label: "Open in the reader", data: "read", run: () => openArticle(href) },
      // Beside the note it was asked from, as "Open to the side" opens a note's link (⌥-click does the same).
      isWebPage(href) && canSplit() && { label: "Open in the reader to the side", data: "read-aside", run: () => openArticle(href, undefined, "aside", editor.view.dom.closest("[data-pane]")?.getAttribute("data-pane")) },
      { label: "Copy link", data: "copy-link", run: () => copyText(href, "Link copied") },
      {
        label: "Keep the link",
        hint: "In the Inbox, with its card",
        data: "keep-link",
        run: () => void window.api.captures.create({ kind: "link", body: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: href, marks: [{ type: "link", attrs: { href } }] }] }] }, markdown: href } as never)
          .then((id: string) => (said("Kept in the Inbox", true, { type: "capture", id, title: href }, { cue: "noted" }), void import("@/lib/link-card").then(({ cardUp }) => window.api.captures.get(id).then((one) => one && cardUp(one as never)))), () => said("Could not keep it", false)),
      },
      { label: "Edit link", edits: true, data: "edit-link", run: () => (pick(editor, from, to), editor.view.dom.dispatchEvent(new CustomEvent("mf:edit-link", { bubbles: true }))) },
      { label: "Remove link", edits: true, hint: "Keeps the words", data: "unlink", run: () => (pick(editor, from, to), removeLink(editor)) },
    ]
    return lines.filter((one): one is Line => !!one && (!one.edits || editor.isEditable))
  }
  if (clicked.kind === "pdf") {
    const { src, name, page, from, to, href } = clicked
    const linked = from != null && to != null
    const lines: Array<Line | false> = [
      { label: `Open at page ${page}`, data: "open-page", run: () => openPdf(src, name, page) },
      canSplit() && { label: "Open to the side", data: "aside", run: () => openPdf(src, name, page, undefined, true) },
      { label: "Copy link to this page", data: "copy-page", run: () => copyText(`${src}#page=${page}${name ? `&name=${encodeURIComponent(name)}` : ""}`, `Link to page ${page} copied: paste it in any note`) },
      linked && !!href && {
        label: "Change page…", edits: true,
        data: "change-page",
        run: () => void ask("Which page should it open at?", String(page), { initial: String(page), action: "Change the page" }).then((typed) => {
          const next = Math.round(Number(typed))
          if (!typed || !Number.isFinite(next) || next < 1 || next === page || from == null || to == null) return
          const hash = new URLSearchParams(PDF_LINK.exec(href)?.[2] ?? "")
          hash.set("page", String(next))
          editor.chain().focus().setTextSelection({ from, to }).extendMarkRange("link").updateAttributes("link", { href: `${src}#${hash.toString()}` }).setTextSelection(to).run()
          chime("noted")
        }),
      },
      !!host().openFile && { label: "Open in the default app", data: "default-app", run: () => void host().openFile?.(src) },
      !!host().showFile && { label: "Show in Finder", data: "finder", run: () => void host().showFile?.(src) },
      linked && { label: "Remove link", edits: true, hint: "Keeps the words", data: "unlink", run: () => (pick(editor, from!, to!), removeLink(editor)) },
      ...viewLines(clicked.block),
    ]
    return lines.filter((one): one is Line => !!one && (!one.edits || editor.isEditable))
  }
  if (clicked.kind === "tag") {
    const { tag } = clicked
    const lines: Array<Line | false> = [
      { label: `Open #${tag}`, data: "open-tag", run: () => void window.dispatchEvent(new CustomEvent("haligtree:open", { detail: { type: "tag", id: tag } })) },
      canSplit() && { label: "Open to the side", data: "aside", run: () => openAside("tag", tag) },
      canSplit() && { label: `Search for #${tag}`, data: "search", run: () => void window.dispatchEvent(new CustomEvent("haligtree:search", { detail: { words: `#${tag}` } })) },
      { label: "Copy tag", data: "copy-tag", run: () => copyText(`#${tag}`, `Copied #${tag}`) },
    ]
    return lines.filter((one): one is Line => !!one)
  }
  if (clicked.kind === "formula") {
    const { pos, latex } = clicked
    return [
      {
        label: "Edit formula…",
        edits: true,
        data: "edit-formula",
        run: () => void ask("The formula, in LaTeX", latex, { initial: latex, action: "Change the formula" }).then((typed) => {
          const next = typed?.trim()
          const node = editor.state.doc.nodeAt(pos)
          if (!next || next === latex || !node || !/Math$/.test(node.type.name)) return
          editor.chain().focus().command(({ tr }) => (tr.setNodeMarkup(pos, undefined, { ...node.attrs, latex: next }), true)).run()
          chime("noted")
        }),
      },
      { label: "Copy as LaTeX", data: "copy-latex", run: () => copyText(`$${latex}$`, "Formula copied as LaTeX") },
    ].filter((one) => !one.edits || editor.isEditable)
  }
  // A citation: its work's page, or its page number changed in place on the chip (⌘Z puts the old one back).
  if (clicked.kind === "citation") {
    const { pos, work, page } = clicked
    return [
      { label: "Open the work", data: "open-work", run: () => (chime("page"), openSource("medium", work)) },
      { label: page ? "Edit the page" : "Add a page", edits: true, hint: "The page the words are on, as p. 82", data: "edit-page", run: () => editPage(pos) },
    ].filter((one) => !one.edits || editor.isEditable)
  }
  // A footnote's mark: to its note, or away with both (⌘Z brings them back).
  if (clicked.kind === "footnote") {
    const { pos, id } = clicked
    return [
      { label: "Go to the footnote", data: "to-footnote", run: () => void toNote(editor, id) },
      { label: "Remove footnote", edits: true, hint: "Its note goes too", data: "remove-footnote", run: () => void editor.chain().focus().deleteRange({ from: pos, to: pos + 1 }).run() },
    ].filter((one) => !one.edits || editor.isEditable)
  }
  if (clicked.kind === "time") {
    const { seconds, text, audio } = clicked
    const video = editor.view.dom.querySelector<HTMLElement>("[data-youtube-video]")
    const lines: Array<Line | false> = [
      !!audio && { label: `Play from ${text}`, data: "play", run: () => void playAt(editor.view.dom, audio, seconds) },
      !audio && !!video && { label: `Play from ${text}`, data: "play", run: () => (window.dispatchEvent(new CustomEvent("haligtree:video-at", { detail: { seconds, video } })), video.scrollIntoView({ block: "center" })) },
      { label: "Copy the time", data: "copy-time", run: () => copyText(`[${text}]`, `Copied [${text}]`) },
    ]
    return lines.filter((one): one is Line => !!one)
  }
  if (clicked.kind === "picture" || clicked.kind === "video") {
    const { src } = clicked
    const own = /^(haligtree|mindflow):\/\/assets\//.test(src)
    const lines: Array<Line | false> = [
      own && !!host().openFile && { label: "Open in the default app", data: "default-app", run: () => void host().openFile?.(src) },
      own && !!host().showFile && { label: "Show in Finder", data: "finder", run: () => void host().showFile?.(src) },
      // Its words' lines together under one, so the picture's menu stays short enough to show whole.
      clicked.kind === "picture" && pictureLines(src, editor.view.dom).length > 0 && { label: "Text in it", hint: "Read by your Mac", data: "image-words", run: () => undefined, sub: pictureLines(src, editor.view.dom) },
      !own && { label: clicked.kind === "video" ? "Open in the browser" : "Open the picture's address", data: "browser", run: () => void window.open(src) },
      !own && { label: "Copy link", data: "copy-link", run: () => copyText(src, "Link copied") },
    ]
    return lines.filter((one): one is Line => !!one)
  }
  const { from, to, words } = clicked
  const lines: Array<Line | false> = [
    // The one Look Up card, under the words: the meaning and Wikipedia, kept with one press.
    { label: "Look up", hint: "Meaning and Wikipedia", data: "look-up", run: () => lookUpIn(editor, from, to, words) },
    canSplit() && { label: `Search for ${quoted(cut(words, 24), 80)}`, data: "search", run: () => void window.dispatchEvent(new CustomEvent("haligtree:search", { detail: { words } })) },
    {
      label: "Make a card from it", edits: true,
      hint: "A new line: these words, then ::",
      data: "card",
      run: () => {
        const $to = editor.state.doc.resolve(to)
        const after = $to.after($to.depth)
        const line = `${words.replace(/\s+/g, " ")} :: `
        editor.chain().focus().insertContentAt(after, { type: "paragraph", content: [{ type: "text", text: line }] }).setTextSelection(after + 1 + line.length).run()
        chime("noted")
      },
    },
    // One drafted question from these words, kept or dropped beside the note (note-questions.tsx); the note itself is not changed.
    questionsFit(editor.view.dom.closest<HTMLElement>("[data-pane]")?.dataset.pane ?? "") && { label: "Make a question", hint: "A draft from these words, to keep or drop", data: "question", run: () => makeQuestion(editor, from, to) },
    // Apple Intelligence on this Mac, the bar's Writing help (writing-help.tsx): not drawn on a Mac without it.
    helpLines(editor, from, to).length > 0 && { label: "Writing help", hint: "On this Mac", data: "writing-help", run: () => undefined, sub: helpLines(editor, from, to) },
    editor.isEditable && editor.extensionManager.extensions.some((one) => one.name === "highlight") && { label: "Highlight", data: "highlight", run: () => void editor.chain().focus().setTextSelection({ from, to }).toggleHighlight().run() },
    { label: "Copy", data: "copy-words", run: () => (editor.chain().focus().setTextSelection({ from, to }).run(), document.execCommand("copy")) },
    editor.isEditable && { label: "Cut", data: "cut-words", run: () => (editor.chain().focus().setTextSelection({ from, to }).run(), document.execCommand("cut")) },
  ]
  return lines.filter((one): one is Line => !!one && (!one.edits || editor.isEditable))
}

/** The clicked thing's lines, drawn as the block menu draws its own. */
export function ClickedRows({ editor, clicked, matches, onDone, within = false }: { editor: Editor; clicked: Clicked; matches: (label: string) => boolean; onDone: () => void; /** Among the block's own lines (a picture is its block): no heading of its own, nothing the block's lines say already. */ within?: boolean }): React.JSX.Element {
  return (
    <>
      {within ? null : <div className="tiptap-slash-menu-group" data-clicked-group={clicked.kind}>{clickedName(clicked)}</div>}
      {clickedLines(editor, clicked)
        // Filtered, a folded line's own lines show flat where they match.
        .flatMap((line) => (line.sub && !matches(line.label) ? line.sub : [line]))
        .filter((line) => matches(line.label))
        .map((line) => line.sub ? (
          <DropdownMenuSub key={line.label}>
            <DropdownMenuSubTrigger asChild>
              <button type="button" data-clicked={line.data}>
                <MenuGlyph label={line.label} />
                <span className="tiptap-slash-menu-title">{line.label}</span>
                <span className="tiptap-slash-menu-hint">&rsaquo;</span>
              </button>
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="tiptap-block-menu tiptap-block-menu-sub">
              <div className="tiptap-block-menu-list">
                {line.sub.map((one) => (
                  <DropdownMenuItem key={one.label} asChild>
                    <button type="button" data-clicked={one.data} onClick={() => (onDone(), one.run())}>
                      <MenuGlyph label={one.label} />
                      <span className="tiptap-slash-menu-title">{one.label}</span>
                      {one.hint ? <span className="tiptap-slash-menu-hint">{one.hint}</span> : null}
                    </button>
                  </DropdownMenuItem>
                ))}
              </div>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        ) : (
          <DropdownMenuItem key={line.label} asChild>
            <button type="button" data-clicked={line.data} onClick={() => (onDone(), line.run())}>
              <MenuGlyph label={line.label} />
              <span className="tiptap-slash-menu-title">{line.label}</span>
              {line.hint ? <span className="tiptap-slash-menu-hint">{line.hint}</span> : null}
            </button>
          </DropdownMenuItem>
        ))}
    </>
  )
}
