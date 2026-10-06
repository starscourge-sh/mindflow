import { InputRule, Node, mergeAttributes } from "@tiptap/core"
import { Plugin, PluginKey } from "@tiptap/pm/state"
import type { EditorView } from "@tiptap/pm/view"
import type { Editor } from "@tiptap/react"
import Suggestion, { type SuggestionOptions } from "@tiptap/suggestion"
import type { ReactNode } from "react"

import { goToHeading, headingsOf } from "@/components/toc/headings"

/** One note the `@` menu can offer. The app decides what is findable. */
export interface NoteSuggestion {
  id: string
  label: string
  /** A short handle shown before the label, like `MF-30`. */
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

/** The editors on this page, by the `documentId` their host gave them. */
const showing = new Map<string, Editor>()

/** Count an editor as showing this document until the returned function is called. */
export function showingDocument(documentId: string, editor: Editor): () => void {
  showing.set(documentId, editor)
  return () => void (showing.get(documentId) === editor && showing.delete(documentId))
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
    }
  },

  parseHTML() {
    return [{ tag: "a[data-note]", priority: 100 }]
  },

  // With a key it reads the way Linear's does, `MF-30 hey jude`. Without one it
  // is the plain `@title` it always was.
  //
  // Display text, when given, is all it shows. A heading follows the title,
  // and a link to a heading in this same note is the heading alone.
  renderHTML({ HTMLAttributes, node }) {
    const { id, key, label, heading, text } = node.attrs
    const attrs = mergeAttributes(HTMLAttributes, {
      "data-note": id,
      "data-key": key || null,
      "data-heading": heading || null,
      "data-text": text || null,
      // The label is no longer simply the words shown, so it travels as itself.
      "data-label": label || null,
      // Not found yet: a [[name]] with no note of that name, drawn quieter.
      class: id || !label ? "tiptap-note-link" : "tiptap-note-link is-unresolved",
    })
    const shown = text || [label, heading].filter(Boolean).join(" › ")
    if (!key || text) return ["a", attrs, ["span", { class: "tiptap-note-link-label" }, text || !id ? shown : `@${shown}`]]
    return [
      "a",
      attrs,
      ["span", { class: "tiptap-note-link-key" }, key],
      ["span", { class: "tiptap-note-link-label" }, shown],
    ]
  },

  /**
   * A wiki link, which is what another note is called everywhere else. The id
   * means nothing outside this app, so the label is the whole of it. Without
   * this the serializer has no renderer for the node and writes an empty
   * string: the link left a markdown export silently.
   */
  renderMarkdown(node): string {
    const { label, id, heading, text } = (node.attrs ?? {}) as Record<string, string | undefined>
    return `[[${label || (heading ? "" : id) || ""}${heading ? `#${heading}` : ""}${text ? `|${text}` : ""}]]`
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
  parseMarkdown: (token) => ({
    type: "noteLink",
    attrs: { id: String(token.id ?? ""), label: String(token.label ?? ""), key: "", heading: String(token.heading ?? ""), text: String(token.text ?? "") },
  }),

  // Typed out whole, the way Obsidian has it: `[[Note#Heading|shown]]` becomes
  // the link the moment the last bracket goes in.
  addInputRules() {
    return [
      new InputRule({
        find: new RegExp(`${WIKI.source}$`),
        handler: ({ state, range, match }) => {
          const [, label = "", heading = "", text = ""] = match
          if (!label.trim() && !heading.trim()) return null
          state.tr.replaceWith(range.from, range.to, this.type.create({ label: label.trim(), heading: heading.trim(), text: text.trim() }))
          return undefined
        },
      }),
    ]
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
      return [...new Set(headings)]
        .filter((heading) => heading.toLowerCase().includes(part))
        .slice(0, 12)
        .map((heading) => ({ ...note, heading, group: note.label ? `Headings in ${note.label}` : "Headings in this note" }))
    }
    const noteItems = ({ query }: { query: string }) => (query.includes("#") ? headingItems(query) : findNotes(query))
    const insertLink: SuggestionOptions<NoteSuggestion>["command"] = ({ editor, range, props }) => {
      editor
        .chain()
        .focus()
        .insertContentAt(range, [
          { type: "noteLink", attrs: { id: props.id, label: props.label, key: props.key ?? "", heading: props.heading ?? "" } },
          { type: "text", text: " " },
        ])
        .run()
    }

    // The tags are read once as the `#` menu opens, then narrowed as you type.
    let tags: Promise<TagSuggestion[]> = Promise.resolve([])

    return [
      Suggestion<NoteSuggestion>({
        editor: this.editor,
        char: "@",
        pluginKey: noteLinkPluginKey,
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
          return found.length || !name || name.includes("#") ? found : [{ id: "", label: name, group: "New link" }]
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
        },
        render: tagRender ?? render,
      }),

      // A link is for following, so a plain click follows it rather than
      // putting a caret inside a node with nothing to type in. A heading in
      // this same note is scrolled to here; anywhere else, the app opens the
      // note and its editor finds the heading.
      new Plugin({
        props: {
          handleClickOn: (_view, _pos, node) => {
            if (node.type.name !== "noteLink") return false
            const { id, heading, label } = node.attrs
            if (!id) {
              // Only a link to this note's own heading: an unresolved
              // [[Other#H]] is about another note, not a place in this one.
              if (heading && !label) goToHeading(editor, heading)
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
          const resolve = (view: EditorView): void => {
            view.state.doc.descendants((node) => {
              const { id, label } = node.attrs
              if (node.type.name !== "noteLink" || id || !label || tried.has(label)) return
              tried.add(label)
              void Promise.resolve(findNotes(label)).then((found) => {
                const note = found.find((one) => one.label.trim().toLowerCase() === label.toLowerCase())
                if (!note || view.isDestroyed) return
                const tr = view.state.tr
                view.state.doc.descendants((one, pos) => {
                  if (one.type.name === "noteLink" && !one.attrs.id && one.attrs.label === label) {
                    tr.setNodeMarkup(pos, undefined, { ...one.attrs, id: note.id, key: note.key ?? "", label: note.label })
                  }
                })
                if (tr.docChanged) view.dispatch(tr.setMeta("addToHistory", false))
              })
            })
          }
          resolve(first)
          return { update: resolve }
        },
      }),
    ]
  },
})
