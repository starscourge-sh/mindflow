import { Node, type Editor } from "@tiptap/core"
import { NodeViewWrapper, ReactNodeViewRenderer, type ReactNodeViewProps } from "@tiptap/react"
import type { Node as PMNode } from "@tiptap/pm/model"
import { Plugin, PluginKey } from "@tiptap/pm/state"
import { Decoration, DecorationSet } from "@tiptap/pm/view"

import { useEffect, useState } from "react"

import { NameInPlace } from "@/components/haligtree/name-in-place"
import { Orb } from "@/components/haligtree/orb"
import { toast } from "@/components/haligtree/ui"
import { chipLabel, citeInto, citedLine, fillChip, looking, loneDoi, type CiteAttrs } from "@/lib/cite"
import { openSource } from "@/lib/sources"
import { chime } from "@/lib/sound"
import { changedSpan } from "@/lib/text-edit"
import { personKey } from "../../../main/names"
import { num } from "../../../main/dates"

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

/** "Edit the page" on a citation's menu: the chip at `pos` opens its page field in place. */
export const editPage = (pos: number): void => void window.dispatchEvent(new CustomEvent("mf:cite-page", { detail: pos }))

/** "82", "p. 82", "pp. 82-84" all as the page alone. */
const pageOf = (typed: string): string => typed.replace(/^(?:p|pp|page|pages)\.?\s*/i, "").replace(/\s*[-–]\s*/g, "–").trim()

function CitationView({ node, editor, getPos }: ReactNodeViewProps): React.JSX.Element {
  const attrs = node.attrs as CiteAttrs
  const waiting = !!attrs.pending && !attrs.work && looking.has(attrs.pending)
  const missing = !!attrs.pending && !attrs.work && !waiting
  const [editing, setEditing] = useState(false)
  useEffect(() => {
    const open = (event: Event): void => {
      if ((event as CustomEvent<number>).detail !== getPos()) return
      chime("tap")
      setEditing(true)
    }
    window.addEventListener("mf:cite-page", open)
    return () => window.removeEventListener("mf:cite-page", open)
  }, [getPos])
  /** Enter or a click away keeps the page (one step for ⌘Z); Esc leaves it as it was. The caret comes back after the chip. */
  const done = (typed: string | null): void => {
    setEditing(false)
    const pos = getPos()
    if (editor.isDestroyed || typeof pos !== "number") return
    const page = typed === null ? attrs.page : pageOf(typed)
    const chain = editor.chain().focus().setTextSelection(pos + 1)
    if (page === attrs.page) return void chain.run()
    chain.command(({ tr }) => (tr.setNodeMarkup(pos, undefined, { ...node.attrs, page }), true)).run()
    chime("noted")
  }
  const width = (words: string): string => `${Math.max(3, words.length + 1)}ch`
  return (
    <NodeViewWrapper as="span" className="mf-citation" data-citation={attrs.work || attrs.pending} data-citation-missing={missing ? "" : undefined} data-citation-editing={editing ? "" : undefined}
      title={waiting ? undefined : missing ? "Not found: click to fill it in by hand" : undefined}
      onMouseDown={(event: React.MouseEvent) => event.button === 0 && !editing && event.preventDefault()}
      onClick={() => {
        if (waiting || editing) return
        if (missing) return void fillChip(editor, attrs.pending)
        chime("page")
        openSource("medium", attrs.work)
      }}>
      {waiting ? <Orb label="Looking up…" /> : editing ? (
        // The chip's own words, its page a field where the number stands, as Finder names a file in place.
        <>
          {`${chipLabel({ ...attrs, page: "" }).slice(0, -1)}, p. `}
          <NameInPlace initial={attrs.page} label="Page" placeholder="82" onDone={done} data-cite-page=""
            style={{ width: width(attrs.page || "82") }}
            onInput={(event) => (event.currentTarget.style.width = width(event.currentTarget.value))}
            className="rounded-md bg-accent/60 px-1 text-foreground outline-none" />
          {")"}
        </>
      ) : chipLabel(attrs)}
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

/** Whether the stretch a change touched holds a citation, before it or after it. */
function citesTouched(before: PMNode, after: PMNode): boolean {
  const span = changedSpan(before, after)
  if (!span) return false
  let found = false
  const look = (doc: PMNode, from: number, to: number): void => doc.nodesBetween(from, to, (node) => !(found ||= node.type.name === "citation"))
  look(before, span.from, span.oldTo)
  if (!found) look(after, span.from, span.newTo)
  return found
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
  title.textContent = "Works cited · made from your citations"
  const copy = document.createElement("button")
  copy.type = "button"
  copy.className = "mf-works-cited-copy"
  copy.dataset.worksCitedCopy = ""
  copy.textContent = "Copy"
  copy.addEventListener("mousedown", (event) => event.preventDefault())
  copy.addEventListener("click", () => {
    void navigator.clipboard.writeText(list.map(citedLine).join("\n")).then(() => {
      chime("copy")
      toast(list.length === 1 ? "Copied the work cited" : `Copied ${num(list.length)} works cited`, undefined, "info")
    })
  })
  head.append(title, copy)
  const items = document.createElement("div")
  for (const one of list) {
    const row = document.createElement("p")
    row.dataset.workCited = ""
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
        // Read again only when a change touched a citation, before or after it (lib/text-edit.ts `changedSpan`); else
        // the list only moves. Read on every change, a long note pasted a stretch at a time read the whole note each time.
        state: { init: (_, state) => place(state.doc), apply: (tr, was) => (!tr.docChanged ? was : citesTouched(tr.before, tr.doc) ? place(tr.doc) : was.map(tr.mapping, tr.doc)) },
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
