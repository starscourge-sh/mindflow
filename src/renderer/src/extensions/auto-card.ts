import { Extension, type Editor } from "@tiptap/core"
import { Plugin, PluginKey, TextSelection, type Transaction } from "@tiptap/pm/state"
import type { Node as ProseMirrorNode } from "@tiptap/pm/model"
import { closeHistory } from "@tiptap/pm/history"

import { host } from "@/lib/host"

/**
 * A link on a line of its own becomes its card, by itself: pasted, or typed
 * and then left with Enter. The card goes in at once with its loading orb and
 * fills in from the page in the background; typing and sending never wait for
 * it. A page that does not answer leaves the plain link, without a word.
 *
 * The card is its own undo step, so ⌘Z straight after turns it back into the
 * plain link, and it is not made again: only a paste or an Enter makes one.
 */
const BARE = /^https?:\/\/\S+$/

type Pending = { pos: number }[]
const key = new PluginKey<Pending>("auto-card")

/** A paragraph that is a bare address and nothing else, where a card may stand. */
const bareAt = (doc: ProseMirrorNode, pos: number): string | null => {
  const node = doc.nodeAt(pos)
  if (!node || node.type.name !== "paragraph") return null
  const text = node.textContent.trim()
  if (!BARE.test(text) || node.childCount > 2) return null
  const $pos = doc.resolve(pos)
  // A card is a block: in the note itself, a quote or a column, not inside a list item or a table.
  if (!["doc", "blockquote", "column"].includes($pos.parent.type.name)) return null
  // Not where a card cannot stand (a one-line field).
  const card = doc.type.schema.nodes.bookmark
  if (!card || !$pos.parent.canReplaceWith($pos.index(), $pos.index() + 1, card)) return null
  try {
    new URL(text)
  } catch {
    return null
  }
  return text
}

/** The bare-address paragraphs between two places, by position. */
const bareBetween = (doc: ProseMirrorNode, from: number, to: number): number[] => {
  const found: number[] = []
  doc.nodesBetween(Math.max(0, from), Math.min(doc.content.size, to), (node, pos) => {
    if (node.type.name === "paragraph") {
      if (bareAt(doc, pos)) found.push(pos)
      return false
    }
    return !node.isTextblock
  })
  return found
}

/** Fill the card in from the page, or put the plain link back if it does not answer. */
async function fill(editor: Editor, id: string, href: string): Promise<void> {
  const look = host().fetchLinkMetadata
  const metadata = look ? await look(href).catch(() => null) : null
  if (editor.isDestroyed) return
  let at = -1
  editor.state.doc.descendants((node, pos) => {
    if (at >= 0) return false
    if (node.type.name === "bookmark" && node.attrs.id === id) at = pos
    return at < 0
  })
  if (at < 0) return
  const node = editor.state.doc.nodeAt(at)!
  const tr = editor.state.tr.setMeta("addToHistory", false)
  // The page said nothing of itself (no name, words or picture): as good as no answer.
  const said = !!metadata?.href && (metadata.title !== metadata.href || !!metadata.description || !!metadata.image)
  if (said && metadata) tr.setNodeMarkup(at, undefined, { ...node.attrs, ...metadata, id, loading: false })
  // Nothing came back: quietly the plain link again, where the card stood.
  else {
    const { schema } = editor.state
    const link = schema.marks.link?.create({ href })
    tr.replaceWith(at, at + node.nodeSize, schema.nodes.paragraph.create(null, schema.text(href, link ? [link] : [])))
  }
  editor.view.dispatch(tr)
}

export const AutoCard = Extension.create({
  name: "autoCard",

  addProseMirrorPlugins() {
    const editor = this.editor
    return [
      new Plugin<Pending>({
        key,
        state: {
          init: () => [],
          apply: (tr: Transaction, pending, old, state) => {
            // The step that makes the cards takes every line waiting.
            if (tr.getMeta(key)) return []
            const next = pending.map(({ pos }) => ({ pos: tr.mapping.map(pos) }))
            if (!tr.docChanged || !editor.isEditable || !state.schema.nodes.bookmark) return next
            // Pasted: every bare-address line that arrived.
            if (tr.getMeta("uiEvent") === "paste") {
              let from = state.doc.content.size
              let to = 0
              tr.mapping.maps.forEach((map, index) => {
                const after = tr.mapping.slice(index + 1)
                map.forEach((_a, _b, start, end) => {
                  from = Math.min(from, after.map(start, -1))
                  to = Math.max(to, after.map(end, 1))
                })
              })
              return from <= to ? [...next, ...bareBetween(state.doc, from - 1, to + 1).map((pos) => ({ pos }))] : next
            }
            // Typed, then Enter: the line just left was a bare address, and the caret was at its end.
            const was = old.selection.$from
            const now = state.selection.$from
            if (!old.selection.empty || was.parent.type.name !== "paragraph" || was.parentOffset !== was.parent.content.size) return next
            if (now.parentOffset !== 0 || now.depth !== was.depth || now.index(now.depth - 1) !== was.index(was.depth - 1) + 1) return next
            const pos = now.before() - (state.doc.resolve(now.before()).nodeBefore?.nodeSize ?? 0)
            return bareAt(state.doc, pos) ? [...next, { pos }] : next
          },
        },
        view: () => {
          let waiting = false
          return {
          update: (view) => {
            const pending = key.getState(view.state) ?? []
            if (!pending.length || waiting) return
            waiting = true
            // Its own step, after the paste or the Enter, so one ⌘Z takes only the card back.
            setTimeout(() => {
              waiting = false
              if (editor.isDestroyed) return
              const state = editor.state
              const still = (key.getState(state) ?? []).filter(({ pos }) => bareAt(state.doc, pos))
              // A step of its own in the history, never merged with the paste or the Enter.
              const tr = closeHistory(state.tr).setMeta(key, "made")
              const made: { id: string; href: string }[] = []
              let caretAt: number | null = null
              const seen = new Set<number>()
              for (const { pos } of [...still].sort((a, b) => b.pos - a.pos)) {
                if (seen.has(pos)) continue
                seen.add(pos)
                const node = state.doc.nodeAt(pos)!
                const end = pos + node.nodeSize
                const href = node.textContent.trim()
                const id = crypto.randomUUID()
                const card = state.schema.nodes.bookmark.create({ href, title: href, description: "", image: "", icon: "", site: "", id, loading: true })
                // A line to go on writing in, under the card, if there is none.
                const next = state.doc.resolve(end).nodeAfter
                const line = next?.isTextblock ? [] : [state.schema.nodes.paragraph.create()]
                tr.replaceWith(pos, end, [card, ...line])
                if (state.selection.from >= pos && state.selection.from <= end) caretAt = pos
                made.push({ id, href })
              }
              // The caret was in the address: it goes on in the line under the card.
              if (caretAt !== null) {
                const at = tr.mapping.map(caretAt, -1)
                const after = at + (tr.doc.nodeAt(at)?.nodeSize ?? 1)
                tr.setSelection(TextSelection.near(tr.doc.resolve(Math.min(after + 1, tr.doc.content.size))))
              }
              editor.view.dispatch(tr)
              // And closed after, so the words typed next are an undo of their own.
              if (made.length) editor.view.dispatch(closeHistory(editor.state.tr))
              for (const { id, href } of made) void fill(editor, id, href)
            })
          },
          }
        },
      }),
    ]
  },
})
