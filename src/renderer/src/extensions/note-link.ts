import { InputRule, Node, mergeAttributes } from "@tiptap/core"
import { DOMSerializer, type DOMOutputSpec, type Node as PMNode } from "@tiptap/pm/model"
import { Plugin, PluginKey, TextSelection } from "@tiptap/pm/state"
import type { EditorView } from "@tiptap/pm/view"
import type { Editor } from "@tiptap/react"
import Suggestion, { type SuggestionOptions } from "@tiptap/suggestion"
import type { LucideIcon } from "lucide-react"
import type { ReactNode } from "react"

import { goToHeading, headingsOf } from "@/components/toc/headings"
import { linesIn, nameBlock, BLOCK_TYPES } from "@/extensions/block-ids"
import { typedOnly } from "@/lib/typed-suggestion"
import { iconMarkup } from "@/lib/icon-markup"

/** One note the `@` menu can offer. The app decides what is findable. */
export interface NoteSuggestion {
  id: string
  label: string
  /** A short handle shown before the label, like `V-30`. */
  key?: string
  /** Drawn at the start of the row in the menu, not in the link. */
  icon?: ReactNode
  /** The menu's heading for this row. */
  group?: string
  /** Quiet, at the end of the row: how often a tag is used. */
  hint?: string
  /** The label's own colour, as a tag has. */
  tint?: string
  /** A heading inside the note, for a link that lands on it. */
  heading?: string
  /** What it is: a quote, a task, a question. Its icon goes on the link. */
  kind?: string
  /** One line inside the note, for a link that lands on it: its lasting name, or where it is when it has none yet. */
  block?: string
  blockIndex?: number
  /** That line's words, as the link shows them. */
  blockText?: string
}

/** One kind of thing a link can point at: how it is named and drawn. */
export interface LinkKind {
  label: string
  /** A colour name from the editor's palette: gray, orange, purple. */
  color: string
  icon: LucideIcon
}

/**
 * What links point at, and how to tell: the app says once, for every editor
 * on the page, as it does for tags. `find` names the kinds of older links,
 * made before links kept theirs, all of a note's at once; `aside` opens one in a window of its
 * own, for a ⌘-click, and says whether it could.
 */
let linkKinds: {
  kinds: () => Record<string, LinkKind>
  find?: (ids: string[]) => Promise<Record<string, string>>
  aside?: (id: string) => boolean
  /** The lines of a note a link could land on, for `[[Note#`. */
  lines?: (id: string) => Promise<{ index: number; text: string; id: string | null; heading: boolean }[]>
  /** Give the line at `index` of a note its lasting name, and say it. */
  anchor?: (id: string, index: number, text: string) => Promise<string | null>
} = { kinds: () => ({}) }

export function setLinkKinds(given: typeof linkKinds): void {
  linkKinds = given
}

/** The kinds of older links already looked up, by id: shared by every editor on the page. */
const knownKinds = new Map<string, string>()
/** Ids being looked up now, so a second editor waits for the same answer rather than asking again. */
const asking = new Set<string>()
/** Links on screen waiting to learn their kind, by id. */
const waiting = new Map<string, Set<() => void>>()
/** Told when a lookup starts or ends: a page holding links waits for their kinds (lib/reads-in.tsx). */
const askTold = new Set<() => void>()
export const kindsAsked = (): boolean => asking.size > 0
export const onKindsAsked = (listen: () => void): (() => void) => (askTold.add(listen), () => void askTold.delete(listen))
const tellAsked = (): void => askTold.forEach((one) => one())

/**
 * Ask once for the kinds of every link given that is not known or being
 * asked about already: one question per note, however many links it holds.
 */
function lookUpKinds(ids: Iterable<string>): void {
  const wanted = [...new Set(ids)].filter((id) => !knownKinds.has(id) && !asking.has(id))
  if (!wanted.length || !linkKinds.find) return
  wanted.forEach((id) => asking.add(id))
  tellAsked()
  void linkKinds.find(wanted).then((found) => {
    for (const id of wanted) {
      asking.delete(id)
      // Not found is remembered too, so a link to a note since deleted is not asked about again.
      knownKinds.set(id, found[id] ?? "")
      if (found[id]) waiting.get(id)?.forEach((redraw) => redraw())
      waiting.delete(id)
    }
    tellAsked()
  }, () => (wanted.forEach((id) => asking.delete(id)), tellAsked()))
}

/**
 * The kinds of a note's older links asked for as soon as its words are read,
 * before its page is drawn (lib/early-read.ts): the page then waits on no
 * second question once it is up.
 */
export function lookUpKindsIn(doc: unknown): void {
  const unknown = new Set<string>()
  const walk = (node: unknown): void => {
    if (!node || typeof node !== "object") return
    const { type, attrs, content } = node as { type?: string; attrs?: { id?: string; kind?: string | null }; content?: unknown[] }
    if (type === "noteLink" && attrs?.id && !kindOfLink(attrs.id, attrs.kind) && !knownKinds.has(attrs.id)) unknown.add(attrs.id)
    if (Array.isArray(content)) content.forEach(walk)
  }
  walk(doc)
  lookUpKinds(unknown)
}

/** The kind a link was given, the one its id says (`question:…`, `task:…`), or one looked up. */
export const kindOfLink = (id: string, kind?: string | null): string => {
  if (kind) return kind
  const prefix = id.includes(":") ? id.slice(0, id.indexOf(":")) : ""
  return prefix === "nugget" ? "idea" : prefix || knownKinds.get(id) || ""
}

export const linkKind = (kind?: string | null): LinkKind | undefined => (kind ? linkKinds.kinds()[kind] : undefined)

/**
 * A kind's icon as the link can carry it: the link is plain HTML, not a React
 * tree, so each icon is drawn once to markup and copied from then on.
 */
const drawn = new Map<LucideIcon, Element | null>()
function iconFor(icon: LucideIcon, color: string): Element | null {
  if (!drawn.has(icon)) {
    let made: Element | null = null
    try {
      const box = document.createElement("span")
      box.innerHTML = iconMarkup(icon) ?? ""
      made = box.querySelector("svg")
      made?.removeAttribute("width")
      made?.removeAttribute("height")
    } catch {
      made = null
    }
    drawn.set(icon, made)
  }
  const svg = drawn.get(icon)?.cloneNode(true) as Element | undefined
  if (!svg) return null
  svg.setAttribute("class", "tiptap-note-link-icon")
  svg.setAttribute("style", `color: var(--tt-color-text-${color})`)
  return svg
}

/**
 * A heading link waiting for the note it points into to open. The editor only
 * reports which note; whichever editor mounts next, a moment later, is that
 * note, and it scrolls to the heading itself - so no host has to pass it on.
 */
let pending: { heading: string; at: number } | null = null

/** The heading a link just asked for, if one did in the last couple of seconds. */
export function takePendingHeading(): string | null {
  const wanted = pending && Date.now() - pending.at < 2000 ? pending.heading : null
  pending = null
  return wanted
}

/** A tag already in use, for the `#` menu: how often, and its colour if it has one. */
export interface TagSuggestion {
  tag: string
  count: number
  color?: string | null
}

/**
 * Where the `#` menu's tags come from. The editor keeps no list of tags; the
 * app says once, for every editor on the page, the way it gives the sounds.
 * Left unset, `#` offers nothing.
 */
let tagSource: () => Promise<TagSuggestion[]> = async () => []

/** Say where the tags come from, for every editor on the page. */
export function setTagSource(source: () => Promise<TagSuggestion[]>): void {
  tagSource = source
}

/** The tags in use, from wherever the app said they come from. */
export const readTags = (): Promise<TagSuggestion[]> => tagSource()

/** The editors on this page, by the `documentId` their host gave them. */
const showing = new Map<string, Editor>()

/** The editor showing this document on this page now, if any (a note promoted from the box lands its caret in it). */
export const shownEditor = (documentId: string): Editor | undefined => showing.get(documentId)

/** Count an editor as showing this document until the returned function is called. */
export function showingDocument(documentId: string, editor: Editor): () => void {
  showing.set(documentId, editor)
  return () => {
    if (showing.get(documentId) !== editor) return
    showing.delete(documentId)
    leftGhost(documentId, editor)
  }
}

/**
 * Land on a heading in a document the host has just been asked to open. One
 * already on screen goes there now, since no fresh editor will mount to do it;
 * otherwise the editor that mounts next for it does.
 */
export function showHeading(documentId: string, heading: string): void {
  const open = showing.get(documentId)
  if (open && !open.isDestroyed) {
    pending = null
    goToHeading(open, heading)
  } else pending = { heading, at: Date.now() }
}

/** `[[Note]]`, `[[Note#Heading]]`, `[[Note|shown]]`, `[[#Heading]]` and the rest. */
const WIKI = /\[\[([^[\]|#]*)(?:#([^[\]|]+))?(?:\|([^[\]]+))?\]\]/

export interface NoteLinkOptions {
  /** Which notes match what has been typed after `@`. */
  findNotes: (query: string) => NoteSuggestion[] | Promise<NoteSuggestion[]>
  /**
   * Clicking a link. The editor never navigates; it only reports. A link to a
   * heading says which, and the editor that opens next scrolls to it itself.
   */
  onOpenNote?: (id: string, heading?: string) => void
  /** The headings in a note, for `@Note#` to offer. Without it, only this note's own. */
  findHeadings?: (id: string) => string[] | Promise<string[]>
  /** Supplied by the app, which owns the popup rendering. */
  render: NonNullable<SuggestionOptions<NoteSuggestion>["render"]>
  /** The same for the `#` menu, which needs its own, or Escape closes the wrong one. */
  tagRender?: SuggestionOptions<NoteSuggestion>["render"]
  /** The same for the `[[` menu, for the same reason. */
  wikiRender?: SuggestionOptions<NoteSuggestion>["render"]
}

/**
 * A `[[name]]` with no note of that name gets one, empty, made where you are:
 * the link points at it at once and you never leave the note you are in. A
 * note of that name already there is linked instead. Not part of undo: ⌘Z
 * takes the link back, the empty page stays, as one made by hand would.
 */
export async function noteNamed(label: string, findNotes: NoteLinkOptions["findNotes"], { make: making = true } = {}): Promise<(Pick<NoteSuggestion, "id" | "label" | "key" | "kind"> & { made?: boolean }) | null> {
  const name = label.trim()
  const make = typeof window !== "undefined" ? window.api?.captures?.create : undefined
  if (!name || !make) return null
  const found = (await Promise.resolve(findNotes(name)).catch(() => [] as NoteSuggestion[])).find((one) => one.label.trim().toLowerCase() === name.toLowerCase() && !/^(person|tag|task):/.test(one.id))
  if (found || !making) return found ?? null
  try {
    // Its name as its first line, so words written under it never rename it.
    const body = { type: "doc", content: [{ type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: name }] }, { type: "paragraph" }] }
    return { id: await make({ kind: "note", title: name, body }), label: name, kind: "note", made: true }
  } catch {
    return null
  }
}

/**
 * Pages made by following a link to nothing, Obsidian's way: a `[[name]]`
 * costs nothing until it is opened, and a page opened and left with nothing
 * but its name is not kept. By the editor id its page is shown under.
 */
const ghosts = new Map<string, { id: string; name: string }>()
/** A page made by a link that may yet go: no other link is pointed at it meanwhile. */
const unsure = (id: string): boolean => [...ghosts.values()].some((ghost) => ghost.id === id)

/** A link to nothing followed: its page made (or found, made since), and opened. */
async function openGhost(editor: Editor, label: string, heading: string, findNotes: NoteLinkOptions["findNotes"], open: NoteLinkOptions["onOpenNote"]): Promise<void> {
  const note = await noteNamed(label, findNotes)
  if (!note || !open || editor.isDestroyed) return
  if (note.made) ghosts.set(`capture-${note.id}`, { id: note.id, name: note.label })
  pending = heading ? { heading, at: Date.now() } : null
  open(note.id, heading || undefined)
}

/** A page made by a link, left: gone again if it holds no more than its name. */
function leftGhost(documentId: string, editor: Editor): void {
  const ghost = ghosts.get(documentId)
  if (!ghost) return
  const words = editor.state.doc.textContent.trim()
  if (words && words !== ghost.name) return void ghosts.delete(documentId)
  // A moment, so a page only drawn again (or shown beside) is not taken for one left.
  setTimeout(() => {
    if (showing.has(documentId)) return
    ghosts.delete(documentId)
    void window.api?.haligtree?.("ghost:drop", ghost.id, ghost.name).catch(() => undefined)
  }, 1500)
}

/** A `[[name]]` with a note of that name already: pointed at it. One with none stays a link to nothing, drawn faintly. */
async function pointOrMake(editor: Editor, label: string, findNotes: NoteLinkOptions["findNotes"]): Promise<void> {
  const note = await noteNamed(label, findNotes, { make: false })
  if (!note || unsure(note.id)) return
  if (editor.isDestroyed) return
  const tr = editor.state.tr
  editor.state.doc.descendants((one, pos) => {
    if (one.type.name === "noteLink" && !one.attrs.id && one.attrs.label === label && !one.attrs.heading) {
      tr.setNodeMarkup(pos, undefined, { ...one.attrs, id: note!.id, key: note!.key ?? "", label: note!.label, kind: note!.kind ?? "" })
    }
  })
  if (tr.docChanged) editor.view.dispatch(tr.setMeta("addToHistory", false))
}

/** The `index`th line of this note (as linesIn counts them), given its lasting name. */
function blockAtIndex(editor: Editor, index: number): string | null {
  let at = -1
  let count = 0
  editor.state.doc.descendants((node, pos) => {
    if (at >= 0) return false
    if (BLOCK_TYPES.includes(node.type.name)) {
      if (count++ === index) at = pos
      return false
    }
    return true
  })
  return at >= 0 ? nameBlock(editor, at) : null
}

export const noteLinkPluginKey = new PluginKey("noteLink")
export const tagPluginKey = new PluginKey("tagSuggest")
export const wikiPluginKey = new PluginKey("wikiSuggest")

/**
 * A link to another note, typed with `@`.
 *
 * It behaves like a link because that is what it is: click it and you are
 * taken there. The editor does not know what a note is or how to open one, so
 * it holds an id and hands it back. Resolving that id to a title is the app's
 * job too, which is why the label is stored alongside it: a link has to read
 * as something while the note it points at is nowhere in reach.
 */
export const NoteLink = Node.create<NoteLinkOptions>({
  name: "noteLink",
  group: "inline",
  inline: true,
  atom: true,
  selectable: false,

  addOptions() {
    return { findNotes: () => [], onOpenNote: undefined, findHeadings: undefined, render: () => ({}) }
  },

  addAttributes() {
    return {
      // `rendered: false` on both: the tag below writes them itself, and the
      // default renderer would otherwise emit each one again under its bare
      // name, so the link carried `id=` beside `data-note=`.
      id: {
        default: "",
        rendered: false,
        parseHTML: (el) => el.getAttribute("data-note") ?? "",
      },
      // The title as it was when the link was made. Stale by design: it keeps
      // a note readable when the note it points at has been renamed or lost.
      label: {
        default: "",
        rendered: false,
        parseHTML: (el) =>
          el.getAttribute("data-label") ??
          el.querySelector(".tiptap-note-link-label")?.textContent ??
          (el.textContent ?? "").replace(/^@/, ""),
      },
      key: {
        default: "",
        rendered: false,
        parseHTML: (el) => el.getAttribute("data-key") ?? "",
      },
      // Where in the note it lands, and what it says instead of the title.
      heading: {
        default: "",
        rendered: false,
        parseHTML: (el) => el.getAttribute("data-heading") ?? "",
      },
      text: {
        default: "",
        rendered: false,
        parseHTML: (el) => el.getAttribute("data-text") ?? "",
      },
      // One line inside the note it lands on (block-ids.ts), and that line's
      // words as they were, shown after the title.
      block: {
        default: "",
        rendered: false,
        parseHTML: (el) => el.getAttribute("data-block") ?? "",
      },
      blockText: {
        default: "",
        rendered: false,
        parseHTML: (el) => el.getAttribute("data-block-text") ?? "",
      },
      // What it points at, for the icon: a quote, a task, a question.
      kind: {
        default: "",
        rendered: false,
        parseHTML: (el) => el.getAttribute("data-kind") ?? "",
      },
    }
  },

  parseHTML() {
    return [{ tag: "a[data-note]", priority: 100 }]
  },

  // With a key it reads the way Linear's does, `V-30 hey jude`. Without one it
  // is the plain `@title` it always was.
  //
  // Display text, when given, is all it shows. A heading follows the title,
  // and a link to a heading in this same note is the heading alone.
  //
  // Its kind's icon, in its kind's colour, comes first: a question reads as
  // one before a word of it is read.
  renderHTML({ HTMLAttributes, node }) {
    const { id, key, label, heading, text, block, blockText } = node.attrs
    const kind = id ? kindOfLink(id, node.attrs.kind) : ""
    const look = linkKind(kind)
    const icon = look ? iconFor(look.icon, look.color) : null
    const attrs = mergeAttributes(HTMLAttributes, {
      "data-note": id,
      "data-kind": kind || null,
      "data-key": key || null,
      "data-heading": heading || null,
      "data-text": text || null,
      "data-block": block || null,
      "data-block-text": blockText || null,
      // The label is no longer simply the words shown, so it travels as itself.
      "data-label": label || null,
      // Not found yet: a [[name]] with no note of that name, drawn quieter.
      class: id || !label ? "tiptap-note-link" : "tiptap-note-link is-unresolved",
    })
    const words = String(blockText || "a line").trim()
    const line = block ? `“${words.length > 48 ? `${words.slice(0, 48).trim()}…` : words}”` : ""
    const shown = text || [label, heading || line].filter(Boolean).join(" › ")
    const lead = icon ? [icon] : []
    // The icon says it is a link; the `@` only says so where there is none.
    if (!key || text) return ["a", attrs, ...lead, ["span", { class: "tiptap-note-link-label" }, text || !id || icon ? shown : `@${shown}`]] as never
    return [
      "a",
      attrs,
      ...lead,
      // A link made before the handles were V- still says MF- in the note: shown as it is now.
      ["span", { class: "tiptap-note-link-key" }, key.replace(/^MF-/, "V-")],
      ["span", { class: "tiptap-note-link-label" }, shown],
    ] as never
  },

  /**
   * A wiki link, which is what another note is called everywhere else. The id
   * means nothing outside this app, so the label is the whole of it. Without
   * this the serializer has no renderer for the node and writes an empty
   * string: the link left a markdown export silently.
   */
  renderMarkdown(node): string {
    const { label, id, heading, text, block } = (node.attrs ?? {}) as Record<string, string | undefined>
    // A line is `#^id`, as Obsidian writes it, and the line ends in `^id` (block-ids.ts).
    const at = block ? `#^${block}` : heading ? `#${heading}` : ""
    return `[[${label || (heading || block ? "" : id) || ""}${at}${text ? `|${text}` : ""}]]`
  },

  /**
   * Read back the form that carries an id, `[[@id|name]]` or `[[@id#Heading|name]]`, which an imported
   * vault's [[links]] are turned into once the page they point at is here.
   *
   * A plain `[[Note#Heading|shown]]` comes back as a link too, with no id yet:
   * the note is looked up by name once the editor is open (see the resolver
   * below), so what was exported reads back as what it was.
   */
  markdownTokenizer: {
    name: "noteLink",
    level: "inline",
    // Not after `!`: `![[x.png|300]]` is an embed, not a link.
    start: (src: string) => src.search(/(?<!!)\[\[/),
    tokenize: (src: string, tokens: { raw?: string }[]) => {
      if (tokens.at(-1)?.raw?.endsWith("!")) return undefined
      const withId = /^\[\[@([^|#\]]+)(?:#([^|\]]+))?\|([^\]]+)\]\]/.exec(src)
      if (withId) return { type: "noteLink", raw: withId[0], id: withId[1], label: withId[3], heading: withId[2]?.trim() ?? "" }
      const wiki = new RegExp(`^${WIKI.source}`).exec(src)
      if (!wiki || !(wiki[1].trim() || wiki[2])) return undefined
      return { type: "noteLink", raw: wiki[0], id: "", label: wiki[1].trim(), heading: wiki[2]?.trim() ?? "", text: wiki[3]?.trim() ?? "" }
    },
  },
  parseMarkdown: (token) => {
    const heading = String(token.heading ?? "")
    // `#^id` is a line, not a heading.
    const block = heading.startsWith("^") ? heading.slice(1) : ""
    return {
      type: "noteLink",
      attrs: { id: String(token.id ?? ""), label: String(token.label ?? ""), key: "", heading: block ? "" : heading, block, text: String(token.text ?? "") },
    }
  },

  // Typed out whole, the way Obsidian has it: `[[Note#Heading|shown]]` becomes
  // the link the moment the last bracket goes in.
  addInputRules() {
    return [
      new InputRule({
        find: new RegExp(`${WIKI.source}$`),
        handler: ({ state, range, match }) => {
          const [, label = "", heading = "", text = ""] = match
          if (!label.trim() && !heading.trim()) return null
          // `![[Name]]` shows the note itself (note-embed.ts), not a link to it.
          if (range.from > 0 && state.doc.textBetween(range.from - 1, range.from, "", "") === "!") return null
          const block = heading.trim().startsWith("^") ? heading.trim().slice(1) : ""
          state.tr.replaceWith(range.from, range.to, this.type.create({ label: label.trim(), heading: block ? "" : heading.trim(), block, text: text.trim() }))
          // Pointed at the page by that name, if there is one; none is made until it is opened.
          if (label.trim() && !heading.trim()) setTimeout(() => void pointOrMake(this.editor, label.trim(), this.options.findNotes))
          return undefined
        },
      }),
    ]
  },

  /**
   * Drawn as renderHTML draws it. A link made before links kept their kind
   * draws again, in place, once its kind is known: the note itself is not
   * touched, so opening one never changes or saves it.
   */
  addNodeView() {
    return ({ node }) => {
      const draw = (one: PMNode): HTMLElement => DOMSerializer.renderSpec(document, one.type.spec.toDOM!(one) as DOMOutputSpec).dom as HTMLElement
      const dom = draw(node)
      const { id } = node.attrs
      let stop = (): void => undefined
      if (id && !kindOfLink(id, node.attrs.kind) && !knownKinds.has(id)) {
        const redraw = (): void => {
          const next = draw(node)
          for (const name of next.getAttributeNames()) dom.setAttribute(name, next.getAttribute(name)!)
          dom.replaceChildren(...next.childNodes)
        }
        if (!waiting.has(id)) waiting.set(id, new Set())
        waiting.get(id)!.add(redraw)
        stop = () => void waiting.get(id)?.delete(redraw)
      }
      return {
        dom,
        // Any change to the link itself draws it anew.
        update: (next: PMNode) => next === node,
        ignoreMutation: () => true,
        destroy: stop,
      }
    }
  },

  addProseMirrorPlugins() {
    const { findNotes, onOpenNote, findHeadings, render, tagRender, wikiRender } = this.options
    const editor = this.editor

    /**
     * `@Note#chor` offers the headings in Note; `@#chor`, this note's own. The
     * note is the first the menu would have offered for the name.
     */
    const headingItems = async (query: string): Promise<NoteSuggestion[]> => {
      const [name, part] = [query.slice(0, query.indexOf("#")), query.slice(query.indexOf("#") + 1).toLowerCase()]
      const note: NoteSuggestion | undefined = name ? (await findNotes(name))[0] : { id: "", label: "" }
      if (!note) return []
      const headings = note.id ? ((await findHeadings?.(note.id)) ?? []) : headingsOf(editor).map((one) => one.text)
      const found = [...new Set(headings)]
        .filter((heading) => heading.toLowerCase().includes(part))
        .slice(0, 12)
        .map((heading) => ({ ...note, heading, group: note.label ? `Headings in ${note.label}` : "Headings in this note" }))
      // Then its lines, any one of which a link can land on (block-ids.ts).
      // `#^words` asks for lines only, as Obsidian has it.
      const wanted = part.replace(/^\^/, "")
      const lines = note.id ? ((await linkKinds.lines?.(note.id).catch(() => [])) ?? []) : linesIn(editor.getJSON())
      const rows = lines
        .filter((line) => !line.heading && line.text.toLowerCase().includes(wanted))
        .slice(0, 12)
        .map((line) => ({ ...note, heading: undefined, block: line.id ?? undefined, blockIndex: line.index, blockText: line.text.slice(0, 80), group: note.label ? `Lines in ${note.label}` : "Lines in this note" }))
      return part.startsWith("^") ? rows : [...found, ...rows]
    }
    const noteItems = ({ query }: { query: string }) => (query.includes("#") ? headingItems(query) : findNotes(query))
    // A space follows what a menu wrote, so the next word can start; the
    // space you then type out of habit is taken as that one, not a second.
    let spaced: number | null = null
    const space = (editor: Editor): void => {
      spaced = editor.state.selection.from
    }
    const insertLink: SuggestionOptions<NoteSuggestion>["command"] = ({ editor, range, props }) => {
      // A link to nothing yet: pointed at a page by that name if one turns up; none is made until it is opened.
      if (!props.id && props.label && !props.heading && props.blockIndex === undefined) setTimeout(() => void pointOrMake(editor, props.label, findNotes))
      const attrs = { id: props.id, label: props.label, key: props.key ?? "", heading: props.heading ?? "", kind: props.kind ?? "", block: props.block ?? "", blockText: props.blockText ?? "" }
      editor
        .chain()
        .focus()
        .insertContentAt(range, [{ type: "noteLink", attrs }, { type: "text", text: " " }])
        .run()
      space(editor)
      // A line with no lasting name yet is given one where it lives, and the link learns it.
      if (props.blockIndex === undefined || props.block) return
      const named = props.id
        ? (linkKinds.anchor?.(props.id, props.blockIndex, props.blockText ?? "") ?? Promise.resolve(null))
        : Promise.resolve(blockAtIndex(editor, props.blockIndex))
      void named.then((block) => {
        if (!block || editor.isDestroyed) return
        const tr = editor.state.tr
        editor.state.doc.descendants((one, pos) => {
          if (one.type.name === "noteLink" && one.attrs.id === props.id && !one.attrs.block && one.attrs.blockText === attrs.blockText) tr.setNodeMarkup(pos, undefined, { ...one.attrs, block })
        })
        if (tr.docChanged) editor.view.dispatch(tr.setMeta("addToHistory", false))
      })
    }

    // The tags are read once as the `#` menu opens, then narrowed as you type.
    let tags: Promise<TagSuggestion[]> = Promise.resolve([])

    return [
      Suggestion<NoteSuggestion>({
        editor: this.editor,
        char: "@",
        pluginKey: noteLinkPluginKey,
        // "@1y", "@6m", "@2w" is a letter to future you (lib/box-tokens.ts), not a link being looked up.
        shouldShow: typedOnly(({ query }) => !/^\d{1,3}[dwmy]$/i.test(query)),
        items: noteItems,
        command: insertLink,
        render,
      }),

      // `[[`, the way Obsidian starts a link: the same menu as `@`, with
      // spaces in the name, since titles have them. `]]` typed out instead
      // still makes the link through the input rule above.
      Suggestion<NoteSuggestion>({
        editor: this.editor,
        char: "[[",
        pluginKey: wikiPluginKey,
        // Spaces inside a name, but a space straight after `[[` is writing, not a link: it closes.
        shouldShow: typedOnly(({ query }) => !/^\s/.test(query)),
        allowSpaces: true,
        allowedPrefixes: null,
        // Not an embed, `![[picture.png]]`, nor a link already closed.
        allow: ({ state, range }) =>
          state.doc.textBetween(Math.max(0, range.from - 1), range.from, "", "") !== "!" && !state.doc.textBetween(range.from, range.to, "", "").includes("]]"),
        // Nothing by that name yet: a link to it all the same, which finds its
        // note once there is one, as a typed `[[name]]` does.
        items: async ({ query }) => {
          const found = await noteItems({ query })
          const name = query.trim()
          return found.length || !name || name.includes("#") ? found : [{ id: "", label: name, group: "Not a page yet: made when you open it" }]
        },
        command: insertLink,
        render: wikiRender ?? render,
      }),

      // `#` offers the tags already in use, most used first, so one is reused
      // rather than spelt a new way. It writes plain text: a tag is a word.
      Suggestion<NoteSuggestion>({
        editor: this.editor,
        char: "#",
        pluginKey: tagPluginKey,
        shouldShow: typedOnly(),
        // Only at the end of a tag being typed: with the caret inside one
        // already written, offering to replace half of it splits it in two.
        allow: ({ state, range }) => !/[\w-]/.test(state.doc.textBetween(range.to, Math.min(range.to + 1, state.doc.content.size), "", "")),
        items: async ({ query }) => {
          if (!query) tags = tagSource()
          return (await tags)
            .filter(({ tag }) => tag.startsWith(query.toLowerCase()))
            .slice(0, 8)
            .map(({ tag, count, color }) => ({ id: tag, label: `#${tag}`, hint: String(count), tint: color ? `var(--tt-color-text-${color})` : undefined, group: "Tags" }))
        },
        command: ({ editor, range, props }) => {
          editor.chain().focus().insertContentAt(range, `#${props.id} `).run()
          space(editor)
        },
        render: tagRender ?? render,
      }),

      // A link is for following, so a plain click follows it rather than
      // putting a caret inside a node with nothing to type in. A heading in
      // this same note is scrolled to here; anywhere else, the app opens the
      // note and its editor finds the heading.
      new Plugin({
        props: {
          handleTextInput: (view, from, to, text) => {
            const at = spaced
            spaced = null
            // Words picked and `[` typed: wrapped, not replaced, as Obsidian does.
            // A second `[` makes `[[words]]`, the link, and its page if there is none.
            if (text === "[" && from < to && editor.isEditable) {
              const $from = view.state.doc.resolve(from)
              if (!$from.sameParent(view.state.doc.resolve(to)) || !$from.parent.isTextblock) return false
              const words = view.state.doc.textBetween(from, to, "", "")
              if (!words.trim() || /[[\]\n]/.test(words)) return false
              const before = view.state.doc.textBetween(Math.max($from.start(), from - 1), from, "", "")
              const after = view.state.doc.textBetween(to, Math.min($from.end(), to + 1), "", "")
              const tr = view.state.tr
              if (before === "[" && after === "]") {
                const label = words.trim()
                tr.replaceWith(from - 1, to + 1, this.type.create({ label }))
                view.dispatch(tr)
                setTimeout(() => void pointOrMake(editor, label, findNotes))
                return true
              }
              tr.insertText("]", to).insertText("[", from)
              tr.setSelection(TextSelection.create(tr.doc, from + 1, to + 1))
              view.dispatch(tr)
              return true
            }
            return text === " " && from === to && from === at
          },
          // A link to one line, copied with "Copy link to this line", pasted
          // where nothing is picked: the link itself, not its text.
          handlePaste: (view, event) => {
            const text = event.clipboardData?.getData("text/plain")?.trim() ?? ""
            const found = /^\[\[@([^#|\]]+)#\^([A-Za-z0-9-]+)\|([^\]]+)\]\]$/.exec(text)
            if (!found || !view.state.selection.empty) return false
            const link = this.type.create({ id: found[1], block: found[2], label: found[3] })
            view.dispatch(view.state.tr.replaceSelectionWith(link, false).insertText(" ").scrollIntoView())
            return true
          },
          handleClickOn: (_view, _pos, node, _at, event) => {
            // A right click is for its menu: it never follows the link.
            if (node.type.name !== "noteLink" || event.button !== 0) return false
            const { id, label, block } = node.attrs
            // A line is landed on as a heading is, by its lasting name.
            const heading = block ? `^${block}` : node.attrs.heading
            // ⌘-click: in a window of its own, beside this one, where it can have one.
            if (id && event.metaKey && linkKinds.aside?.(id)) return true
            if (!id) {
              // A link to this note's own heading or line: here. A link to a
              // page that is not there yet makes it now, and opens it.
              if (heading && !label) goToHeading(editor, heading)
              else if (label) void openGhost(editor, label, heading, findNotes, onOpenNote)
              return true
            }
            if (!onOpenNote) return false
            pending = heading ? { heading, at: Date.now() } : null
            onOpenNote(id, heading || undefined)
            return true
          },
        },
      }),

      // A [[name]] with no id yet - typed, or read back from Markdown - is
      // looked up by name: the note whose title is exactly that, ignoring
      // case. Not part of undo history: it is the same link, now pointed.
      new Plugin({
        view: (first) => {
          const tried = new Set<string>()
          // A link to one line that does not yet say the line's words: read once, from the note.
          const worded = new Set<string>()
          const word = (view: EditorView, id: string, block: string): void => {
            if (worded.has(`${id}#${block}`) || !linkKinds.lines) return
            worded.add(`${id}#${block}`)
            void linkKinds.lines(id).then((lines) => {
              const line = lines.find((one) => one.id === block)
              if (!line || view.isDestroyed) return
              const tr = view.state.tr
              view.state.doc.descendants((one, pos) => {
                if (one.type.name === "noteLink" && one.attrs.id === id && one.attrs.block === block && !one.attrs.blockText) tr.setNodeMarkup(pos, undefined, { ...one.attrs, blockText: line.text.slice(0, 80) })
              })
              if (tr.docChanged) view.dispatch(tr.setMeta("addToHistory", false))
            }, () => undefined)
          }
          // Links made before links kept their kind (and an import's [[@id|name]]):
          // every one in the note asked about in one go, and remembered for the page.
          const unknown = new Set<string>()
          const lookUp = (): void => {
            lookUpKinds(unknown)
            unknown.clear()
          }
          const resolve = (view: EditorView, from = 0, to = view.state.doc.content.size): void => {
            view.state.doc.nodesBetween(from, to, (node) => {
              const { id, label } = node.attrs
              if (node.type.name === "noteLink" && id && !kindOfLink(id, node.attrs.kind) && !knownKinds.has(id)) unknown.add(id)
              if (node.type.name === "noteLink" && id && node.attrs.block && !node.attrs.blockText) word(view, id, node.attrs.block)
              if (node.type.name !== "noteLink" || id || !label || tried.has(label)) return
              tried.add(label)
              void Promise.resolve(findNotes(label)).then((found) => {
                const note = found.find((one) => one.label.trim().toLowerCase() === label.toLowerCase() && !unsure(one.id))
                if (!note || view.isDestroyed) return
                const tr = view.state.tr
                view.state.doc.descendants((one, pos) => {
                  if (one.type.name === "noteLink" && !one.attrs.id && one.attrs.label === label) {
                    tr.setNodeMarkup(pos, undefined, { ...one.attrs, id: note.id, key: note.key ?? "", label: note.label, kind: note.kind ?? "" })
                  }
                })
                if (tr.docChanged) view.dispatch(tr.setMeta("addToHistory", false))
              })
            })
          }
          resolve(first)
          lookUp()
          // Only what changed is looked through: walking a long note on every key was slow.
          return {
            update: (view, previous) => {
              const before = previous.doc.content
              const now = view.state.doc.content
              const start = before.findDiffStart(now)
              if (start == null) return
              const end = before.findDiffEnd(now)?.b ?? now.size
              resolve(view, start, Math.min(now.size, Math.max(start + 1, end)))
              lookUp()
            },
          }
        },
      }),
    ]
  },
})
