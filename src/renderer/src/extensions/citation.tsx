import { Node, type Editor } from "@tiptap/core"
import { NodeViewWrapper, ReactNodeViewRenderer, type ReactNodeViewProps } from "@tiptap/react"
import type { Node as PMNode } from "@tiptap/pm/model"
import { Plugin, PluginKey } from "@tiptap/pm/state"
import { Decoration, DecorationSet } from "@tiptap/pm/view"

import { Orb } from "@/components/haligtree/orb"
import { toast } from "@/components/haligtree/ui"
import { chipLabel, citeInto, citedLine, fillChip, looking, loneDoi, type CiteAttrs } from "@/lib/cite"
import { openSource } from "@/lib/sources"
import { chime } from "@/lib/sound"
import { personKey } from "../../../main/names"

/**
 * A citation in a note: "(Shelley 1831, p. 82)" as a chip that opens its
 * work's page, keeping a copy of the work's details so it reads offline. The
 * works a note cites gather at its foot under "Works cited", one plain line
 * each, copyable as text; never part of the saved words, always as the chips say.
 */

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    citation: {
      /** "Cite a source" at the caret: asks for a DOI, an ISBN or a work. */
      citeSource: () => ReturnType
    }
  }
}

const FIELDS = ["work", "authors", "year", "publisher", "doi", "isbn", "url", "what", "page", "pending", "failed"] as const

function CitationView({ node, editor }: ReactNodeViewProps): React.JSX.Element {
  const attrs = node.attrs as CiteAttrs
  const waiting = !!attrs.pending && !attrs.work && looking.has(attrs.pending)
  const missing = !!attrs.pending && !attrs.work && !waiting
  return (
    <NodeViewWrapper as="span" className="mf-citation" data-citation={attrs.work || attrs.pending} data-citation-missing={missing ? "" : undefined}
      title={waiting ? undefined : missing ? "Not found: click to fill it in by hand" : undefined}
      onMouseDown={(event: React.MouseEvent) => event.button === 0 && event.preventDefault()}
      onClick={() => {
        if (waiting) return
        if (missing) return void fillChip(editor, attrs.pending)
        chime("page")
        openSource("medium", attrs.work)
      }}>
      {waiting ? <Orb label="Looking up…" /> : chipLabel(attrs)}
    </NodeViewWrapper>
  )
}

/** The works cited, once each, in the order of their authors' surnames. */
export function worksCited(doc: PMNode): CiteAttrs[] {
  const seen = new Map<string, CiteAttrs>()
  doc.descendants((node) => {
    if (node.type.name !== "citation" || !node.attrs.work) return true
    const key = personKey(String(node.attrs.work))
    if (!seen.has(key)) seen.set(key, node.attrs as CiteAttrs)
    return false
  })
  return [...seen.values()].sort((a, b) => citedLine(a).localeCompare(citedLine(b)))
}

/** The "Works cited" list at a note's foot: a fresh element each time it is placed. */
function drawCited(list: CiteAttrs[]): HTMLElement {
  const box = document.createElement("section")
  box.className = "mf-works-cited"
  box.contentEditable = "false"
  box.dataset.worksCited = ""
  const head = document.createElement("div")
  head.className = "mf-works-cited-head"
  const title = document.createElement("h3")
  title.textContent = "Works cited"
  const copy = document.createElement("button")
  copy.type = "button"
  copy.className = "mf-works-cited-copy"
  copy.dataset.worksCitedCopy = ""
  copy.textContent = "Copy"
  copy.addEventListener("mousedown", (event) => event.preventDefault())
  copy.addEventListener("click", () => {
    void navigator.clipboard.writeText(list.map(citedLine).join("\n")).then(() => {
      chime("copy")
      toast(list.length === 1 ? "Copied the work cited" : `Copied ${list.length} works cited`, undefined, "info")
    })
  })
  head.append(title, copy)
  const items = document.createElement("ul")
  for (const one of list) {
    const row = document.createElement("li")
    const line = citedLine(one)
    const link = one.doi ? `https://doi.org/${one.doi}` : ""
    const words = document.createElement("button")
    words.type = "button"
    words.className = "mf-works-cited-work"
    words.textContent = link ? line.slice(0, line.length - link.length).trimEnd() : line
    words.addEventListener("click", () => (chime("page"), openSource("medium", one.work)))
    row.append(words)
    if (link) {
      const anchor = document.createElement("a")
      anchor.href = link
      anchor.target = "_blank"
      anchor.rel = "noreferrer"
      anchor.textContent = link
      row.append(" ", anchor)
    }
    items.append(row)
  }
  box.append(head, items)
  return box
}

export const Citation = Node.create({
  name: "citation",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return Object.fromEntries(FIELDS.map((key) => [key, { default: "", parseHTML: (el: HTMLElement) => el.getAttribute(`data-${key}`) ?? "", renderHTML: (attrs: Record<string, string>) => (attrs[key] ? { [`data-${key}`]: attrs[key] } : {}) }]))
  },

  parseHTML() {
    return [{ tag: "span[data-cite]" }]
  },

  renderHTML({ node, HTMLAttributes }) {
    return ["span", { ...HTMLAttributes, "data-cite": "" }, chipLabel(node.attrs as CiteAttrs)]
  },

  renderText: ({ node }) => chipLabel(node.attrs as CiteAttrs),

  renderMarkdown: (node) => chipLabel((node.attrs ?? {}) as CiteAttrs),

  addNodeView() {
    return ReactNodeViewRenderer(CitationView, { as: "span", className: "mf-citation-holder" })
  },

  addCommands() {
    return {
      citeSource:
        () =>
        ({ editor }) => {
          void citeInto(editor as Editor)
          return true
        },
    }
  },

  addProseMirrorPlugins() {
    const editor = this.editor
    const key = new PluginKey<DecorationSet>("worksCited")
    const place = (doc: PMNode): DecorationSet => {
      const list = worksCited(doc)
      if (!list.length) return DecorationSet.empty
      const sign = list.map(citedLine).join("\n")
      return DecorationSet.create(doc, [Decoration.widget(doc.content.size, () => drawCited(list), { side: 1, key: `works-cited:${sign}`, ignoreSelection: true, stopEvent: () => true })])
    }
    return [
      new Plugin<DecorationSet>({
        key,
        state: { init: (_, state) => place(state.doc), apply: (tr, was) => (tr.docChanged ? place(tr.doc) : was) },
        props: {
          decorations: (state) => key.getState(state),
          // A DOI pasted alone on a line goes in as its words (a doi.org link, not a link card), and "Make it a citation?" is offered.
          handlePaste: (view, event) => {
            const text = event.clipboardData?.getData("text/plain") ?? ""
            const doi = loneDoi(text)
            const { $from, empty } = view.state.selection
            if (!doi || !empty || $from.parent.textContent.trim() || $from.parent.type.spec.code) return false
            const from = $from.pos
            const words = text.trim()
            toast("That is a DOI. Make it a citation?", undefined, "info", {
              label: "Make it a citation",
              key: "C",
              run: () => {
                const to = from + words.length
                if (editor.isDestroyed || editor.state.doc.textBetween(from, Math.min(to, editor.state.doc.content.size)) !== words) return
                void citeInto(editor, doi, { from, to })
              },
            })
            view.dispatch(view.state.tr.insertText(words))
            return true
          },
        },
      }),
    ]
  },
})
