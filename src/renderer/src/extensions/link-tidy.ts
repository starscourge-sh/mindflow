import { Extension, combineTransactionSteps, getChangedRanges, type Editor } from "@tiptap/core"
import type { Mark, Node as ProseMirrorNode } from "@tiptap/pm/model"
import { Plugin, PluginKey, type EditorState } from "@tiptap/pm/state"
import { AddMarkStep } from "@tiptap/pm/transform"

/**
 * Web links that behave: only words that really are an address become one as
 * you type, ⌘Z straight after takes the link back and keeps the words, and a
 * link's words edited into something that is no longer an address stop being
 * a link. The toolbar's "Edit link" and "Remove link" (link-editor.tsx) and
 * ⌘K reach the rest.
 */

/**
 * Endings that mean an address when one is written bare, without `https://`
 * or `www.`. Short ones that are also words or typos ("the.re", "and.so",
 * "ok.it", "see.me") are left out: a stray full stop is not a link.
 */
const ENDINGS = new Set([
  "com", "org", "net", "edu", "gov", "mil", "int", "io", "ai", "app", "dev", "co", "uk", "us", "ca", "au", "nz", "za", "ie",
  "de", "fr", "nl", "es", "se", "ch", "dk", "fi", "pl", "pt", "cz", "jp", "kr", "cn", "tw", "hk", "sg", "br", "mx", "ar",
  "ru", "eu", "info", "biz", "xyz", "tv", "fm", "gg", "ly", "sh", "page", "site", "tech", "blog", "wiki", "news", "link",
  "live", "store", "shop", "cloud", "online", "design", "studio", "art", "social", "email", "zone", "space",
])

/** Whether words written bare are a web or mail address, by what they start and end with. */
export function looksLikeAddress(text: string): boolean {
  const words = text.trim()
  if (!words || /\s/.test(words)) return false
  if (/^[a-z][a-z0-9+.-]*:\/\/\S/i.test(words) || /^mailto:\S+@\S+/i.test(words)) return true
  if (/^www\.[^.\s]+\.\S/i.test(words)) return true
  const host = (words.includes("@") ? words.split("@").pop()! : words).split(/[/?#:]/)[0]
  const parts = host.split(".")
  if (parts.length < 2 || parts.some((part) => !part || !/^[\p{L}\p{N}-]+$/u.test(part))) return false
  // An address names a place, not one letter: "a.io" maybe, "x.c" never.
  return ENDINGS.has(parts.at(-1)!.toLowerCase()) && parts.slice(0, -1).join("").length >= 2
}

/** An address as a link holds it: with its scheme. */
export const hrefFor = (text: string): string => {
  const words = text.trim()
  if (/^[a-z][a-z0-9+.-]*:/i.test(words)) return words
  return /^[^\s@/]+@[^\s@]+$/.test(words) ? `mailto:${words}` : `https://${words}`
}

/** A link's address as its words would read: no scheme, no last slash. */
const bare = (href: string): string => href.replace(/^(https?:\/\/|mailto:)/i, "").replace(/\/$/, "").toLowerCase()

/** The link the caret is in (or the picked words are), as a range and its mark. */
export function linkAround(state: EditorState): { from: number; to: number; mark: Mark } | null {
  const type = state.schema.marks.link
  if (!type) return null
  const { $from, from, to } = state.selection
  if (!$from.parent.isTextblock || !$from.sameParent(state.selection.$to)) return null
  const found = spans($from.parent, $from.start(), type).find((span) => span.from <= from && to <= span.to && (from < span.to || span.from < from))
  return found ? { from: found.from, to: found.to, mark: found.mark } : null
}

/** True while the caret sits in a web link in the note being written: ⌘K edits it there, rather than opening search. */
export function caretInLink(): boolean {
  const editor = (document.activeElement?.closest?.(".ProseMirror") as (Element & { editor?: Editor }) | null)?.editor
  return !!editor && !editor.isDestroyed && editor.isEditable && !!linkAround(editor.state)
}

/** Each run of words carrying one link, in a textblock. */
function spans(block: ProseMirrorNode, start: number, type: Mark["type"]): { from: number; to: number; mark: Mark; text: string }[] {
  const out: { from: number; to: number; mark: Mark; text: string }[] = []
  block.forEach((child, offset) => {
    const mark = child.isText ? child.marks.find((one) => one.type === type) : undefined
    const last = out.at(-1)
    if (!mark) return
    if (last && last.to === start + offset && last.mark.eq(mark)) {
      last.to += child.nodeSize
      last.text += child.text
    } else out.push({ from: start + offset, to: start + offset + child.nodeSize, mark, text: child.text ?? "" })
  })
  return out
}

/** The textblocks touched between two places. */
function blocksIn(doc: ProseMirrorNode, from: number, to: number): { node: ProseMirrorNode; start: number }[] {
  const out: { node: ProseMirrorNode; start: number }[] = []
  doc.nodesBetween(Math.max(0, from), Math.min(doc.content.size, to), (node, pos) => {
    if (node.isTextblock) out.push({ node, start: pos + 1 })
    return !node.isTextblock
  })
  return out
}

const justLinked = new PluginKey<{ from: number; to: number } | null>("justLinked")
/** Words whose link was taken off by hand: a space typed after them later does not link them again. */
export const refusedLinks = new PluginKey<{ from: number; to: number }[]>("refusedLinks")

export const LinkTidy = Extension.create({
  name: "linkTidy",
  // Before the history's own ⌘Z.
  priority: 1000,

  addKeyboardShortcuts() {
    return {
      // Straight after the words became a link by themselves: the link goes, the words stay.
      "Mod-z": () => {
        const range = justLinked.getState(this.editor.state)
        const type = this.editor.schema.marks.link
        if (!range || !type) return false
        this.editor.view.dispatch(
          this.editor.state.tr.removeMark(range.from, range.to, type).setMeta(justLinked, "taken").setMeta(refusedLinks, range).setMeta("addToHistory", false).setMeta("preventAutolink", true),
        )
        return true
      },
      // ⌘K on a link: edit it (link-editor.tsx draws the box).
      "Mod-k": () => {
        if (!linkAround(this.editor.state)) return false
        this.editor.view.dom.dispatchEvent(new CustomEvent("mf:edit-link", { bubbles: true }))
        return true
      },
    }
  },

  addProseMirrorPlugins() {
    return [
      new Plugin<{ from: number; to: number } | null>({
        key: justLinked,
        state: {
          init: () => null,
          apply: (tr, value) => {
            if (tr.getMeta(justLinked) === "taken") return null
            const linked = tr.getMeta("appendedTransaction")
              ? tr.steps.find((step): step is AddMarkStep => step instanceof AddMarkStep && step.mark.type.name === "link")
              : undefined
            if (linked) return { from: linked.from, to: linked.to }
            // Something else written since: ⌘Z is the plain undo again.
            if (tr.docChanged && !tr.getMeta("appendedTransaction")) return null
            return value && tr.docChanged ? { from: tr.mapping.map(value.from), to: tr.mapping.map(value.to) } : value
          },
        },
      }),
      new Plugin<{ from: number; to: number }[]>({
        key: refusedLinks,
        state: {
          init: () => [],
          apply: (tr, list) => {
            const added = tr.getMeta(refusedLinks) as { from: number; to: number } | undefined
            const moved = tr.docChanged ? list.map((one) => ({ from: tr.mapping.map(one.from, 1), to: tr.mapping.map(one.to, -1) })).filter((one) => one.to > one.from) : list
            return added ? [...moved, added].slice(-20) : moved
          },
        },
        // The automatic link come back over words refused: taken off again.
        appendTransaction: (transactions, _old, state) => {
          const type = state.schema.marks.link
          const list = refusedLinks.getState(state) ?? []
          if (!type || !list.length) return null
          const tr = state.tr
          for (const one of transactions) {
            if (!one.getMeta("appendedTransaction")) continue
            for (const step of one.steps)
              if (step instanceof AddMarkStep && step.mark.type === type && list.some((range) => range.from === step.from && range.to === step.to)) tr.removeMark(step.from, step.to, type)
          }
          return tr.docChanged ? tr.setMeta("addToHistory", false).setMeta("preventAutolink", true) : null
        },
      }),
      // A link whose words were its address, edited: still an address, the link follows the words;
      // no longer one ("the.re" corrected to "their"), the link goes.
      new Plugin({
        appendTransaction: (transactions, old, state) => {
          const type = state.schema.marks.link
          if (!type || !transactions.some((tr) => tr.docChanged) || transactions.some((tr) => tr.getMeta("preventAutolink"))) return null
          const changes = getChangedRanges(combineTransactionSteps(old.doc, [...transactions]))
          const tr = state.tr
          for (const { oldRange, newRange } of changes) {
            const before = blocksIn(old.doc, oldRange.from - 1, oldRange.to + 1).flatMap(({ node, start }) => spans(node, start, type))
            for (const { node, start } of blocksIn(state.doc, newRange.from - 1, newRange.to + 1)) {
              for (const span of spans(node, start, type)) {
                const href = String(span.mark.attrs.href ?? "")
                if (bare(span.text) === bare(href)) continue
                // Only a link that read as its own address a moment ago: words linked by hand keep theirs.
                const was = before.find((one) => one.mark.attrs.href === href && bare(one.text) === bare(href))
                if (!was) continue
                if (looksLikeAddress(span.text)) tr.addMark(span.from, span.to, type.create({ ...span.mark.attrs, href: hrefFor(span.text) }))
                else tr.removeMark(span.from, span.to, type)
              }
            }
          }
          return tr.docChanged ? tr.setMeta("preventAutolink", true) : null
        },
      }),
    ]
  },
})
