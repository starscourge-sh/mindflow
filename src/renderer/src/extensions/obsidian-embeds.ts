import { Extension } from "@tiptap/core"
import { Fragment } from "@tiptap/pm/model"
import { Plugin, PluginKey } from "@tiptap/pm/state"
import type { Node as ProseMirrorNode, Schema } from "@tiptap/pm/model"
import type { EditorState, Transaction } from "@tiptap/pm/state"
import type { EditorView } from "@tiptap/pm/view"
import { host } from "@/lib/host"
import { cleanRef, embedsIn, nameOf, onlyEmbeds, type EmbedAt } from "../../../main/embeds"

/** What a reference became in the store. */
type Brought = { src: string; name: string; size: number; image: boolean }

// Found ones are kept for the page: a redo, or the same picture pasted again,
// needs no second look. One not found is asked again next time; it may be there by then.
const found = new Map<string, Brought>()
const asking = new Map<string, Promise<Brought | null>>()

/** Each reference as what it became, asking the main process only for the ones not already known. */
async function bring(refs: string[]): Promise<Map<string, Brought | null>> {
  const fresh = [...new Set(refs)].filter((ref) => !found.has(ref) && !asking.has(ref))
  if (fresh.length) {
    const call = host().bringEmbeds
    const all = call ? call(fresh).catch(() => []) : Promise.resolve([])
    fresh.forEach((ref, at) =>
      asking.set(ref, all.then((list) => {
        const one = list[at] ?? null
        if (one) found.set(ref, one)
        asking.delete(ref)
        return one
      })))
  }
  const answers = new Map<string, Brought | null>()
  for (const ref of new Set(refs)) answers.set(ref, found.get(ref) ?? (await asking.get(ref)) ?? null)
  return answers
}

/** A width as a picture keeps it: `300` is `300px`. */
const px = (width: string | undefined | null): string | null => (width ? (/^\d+$/.test(width) ? `${width}px` : width) : null)

/** The picture, or the file's card (a PDF, a video), a stored file becomes. */
const shown = (schema: Schema, one: Brought, width: string | null): ProseMirrorNode | null =>
  one.image
    ? schema.nodes.image.create({ src: one.src, width })
    : (schema.nodes.attachment?.create({ src: one.src, name: one.name, size: one.size, width }) ?? null)

const waiting = (schema: Schema, embed: EmbedAt): ProseMirrorNode =>
  schema.nodes.imagePlaceholder.create({ embed: embed.ref, width: px(embed.width) })

const isWaiting = (node: ProseMirrorNode): boolean =>
  node.type.name === "imagePlaceholder" && !!node.attrs.embed && !node.attrs.missing

/** Words a reader reads: text not in code. */
const plainText = (node: ProseMirrorNode): boolean =>
  node.isText && !node.marks.some((mark) => mark.type.spec.code)

/**
 * A paragraph with embeds in it, cut into its words and a waiting picture
 * for each embed, or null when it has none. A line that is only a path is
 * one waiting picture.
 */
function cut(paragraph: ProseMirrorNode, schema: Schema): ProseMirrorNode[] | null {
  const allText = paragraph.childCount > 0 && paragraph.content.content.every(plainText)
  const whole = allText ? onlyEmbeds(paragraph.textContent) : null
  if (whole) return whole.map((embed) => waiting(schema, embed))
  const blocks: ProseMirrorNode[] = []
  let line: ProseMirrorNode[] = []
  let any = false
  const flush = (): void => {
    // A line left with only spaces or breaks around the picture is no line.
    if (line.some((node) => (node.isText ? !!node.text?.trim() : node.type.name !== "hardBreak")))
      blocks.push(paragraph.type.create(paragraph.attrs, line))
    line = []
  }
  paragraph.forEach((child) => {
    const embeds = plainText(child) ? embedsIn(child.text ?? "") : []
    if (!embeds.length) return void line.push(child)
    any = true
    let from = 0
    const text = child.text ?? ""
    for (const embed of embeds) {
      if (embed.from > from) line.push(schema.text(text.slice(from, embed.from), child.marks))
      flush()
      blocks.push(waiting(schema, embed))
      from = embed.to
    }
    if (from < text.length) line.push(schema.text(text.slice(from), child.marks))
  })
  flush()
  return any ? blocks : null
}

/** A block's replacement where its parent can hold it, with an empty line first where one has to lead (a list item). */
function fits(parent: ProseMirrorNode, index: number, nodes: ProseMirrorNode[], schema: Schema): Fragment | null {
  const content = Fragment.fromArray(nodes)
  if (parent.canReplace(index, index + 1, content)) return content
  const led = Fragment.from(schema.nodes.paragraph.create()).append(content)
  return parent.canReplace(index, index + 1, led) ? led : null
}

/** What changed in these transactions, as a range of the newest document. */
function touched(trs: readonly Transaction[]): { from: number; to: number } | null {
  let from = Infinity
  let to = -Infinity
  for (const tr of trs) {
    if (!tr.docChanged) continue
    if (from <= to) {
      from = tr.mapping.map(from, -1)
      to = tr.mapping.map(to, 1)
    }
    tr.steps.forEach((step, at) => {
      const after = tr.mapping.slice(at + 1)
      step.getMap().forEach((_oldFrom, _oldTo, newFrom, newTo) => {
        from = Math.min(from, after.map(newFrom, -1))
        to = Math.max(to, after.map(newTo, 1))
      })
    })
  }
  return from <= to ? { from, to } : null
}

/** Pasted embeds as waiting pictures, in one transaction: a paragraph's, and a picture's whose address is a path. */
function holdPasted(state: EditorState, from: number, to: number): Transaction | null {
  const { schema, doc } = state
  const changes: { pos: number; size: number; content: Fragment }[] = []
  doc.nodesBetween(Math.max(0, from), Math.min(doc.content.size, to), (node, pos, parent, index) => {
    if (node.type.spec.code) return false
    if (node.type.name === "image") {
      const ref = cleanRef(String(node.attrs.src ?? ""))
      if (ref) changes.push({ pos, size: node.nodeSize, content: Fragment.from(schema.nodes.imagePlaceholder.create({ embed: ref, width: node.attrs.width ?? null })) })
      return false
    }
    if (node.type.name !== "paragraph") return true
    const blocks = parent && cut(node, schema)
    const content = blocks && fits(parent, index, blocks, schema)
    if (content) changes.push({ pos, size: node.nodeSize, content })
    return false
  })
  if (!changes.length) return null
  const tr = state.tr
  for (const change of changes.reverse()) tr.replaceWith(change.pos, change.pos + change.size, change.content)
  return tr
}

/** Fill every waiting picture from what was found: the picture, or a quiet "not found" to click. */
async function settle(view: EditorView): Promise<void> {
  const refs: string[] = []
  view.state.doc.descendants((node) => {
    if (isWaiting(node)) refs.push(String(node.attrs.embed))
    return !node.isTextblock
  })
  if (!refs.length) return
  const answers = await bring(refs)
  if (view.isDestroyed) return
  const { schema } = view.state
  const tr = view.state.tr
  const spots: { pos: number; node: ProseMirrorNode }[] = []
  view.state.doc.descendants((node, pos) => {
    if (isWaiting(node) && answers.has(String(node.attrs.embed))) spots.push({ pos, node })
    return !node.isTextblock
  })
  for (const { pos, node } of spots.reverse()) {
    const ref = String(node.attrs.embed)
    const one = answers.get(ref)
    const into = one && shown(schema, one, node.attrs.width ?? null)
    if (into) tr.replaceWith(pos, pos + node.nodeSize, into)
    else tr.setNodeMarkup(pos, undefined, { ...node.attrs, missing: nameOf(ref) })
  }
  // Not its own undo step: ⌘Z takes back the paste, not the picture arriving in it.
  if (tr.docChanged) view.dispatch(tr.setMeta("addToHistory", false))
}

/**
 * A note already here with a line that is only an Obsidian picture's path,
 * or a picture whose address is one: the picture, if a vault has it. One
 * edit, so ⌘Z puts the path back; one not found is left exactly as it was.
 */
async function mend(view: EditorView): Promise<void> {
  if (!view.editable || !host().bringEmbeds) return
  const lines = (doc: ProseMirrorNode): { pos: number; node: ProseMirrorNode; embeds: EmbedAt[]; parent: ProseMirrorNode; index: number }[] => {
    const out: { pos: number; node: ProseMirrorNode; embeds: EmbedAt[]; parent: ProseMirrorNode; index: number }[] = []
    doc.descendants((node, pos, parent, index) => {
      if (out.length >= 50 || node.type.spec.code) return false
      if (node.type.name === "image") {
        const ref = cleanRef(String(node.attrs.src ?? ""))
        if (ref && parent) out.push({ pos, node, embeds: [{ from: 0, to: 0, ref }], parent, index })
        return false
      }
      if (node.type.name !== "paragraph") return true
      const embeds = node.childCount && node.content.content.every(plainText) ? onlyEmbeds(node.textContent) : null
      if (embeds && parent) out.push({ pos, node, embeds, parent, index })
      return false
    })
    return out
  }
  const before = lines(view.state.doc)
  if (!before.length) return
  const answers = await bring(before.flatMap((one) => one.embeds.map((embed) => embed.ref)))
  if (view.isDestroyed || !view.editable) return
  const { schema } = view.state
  const tr = view.state.tr
  for (const { pos, node, embeds, parent, index } of lines(view.state.doc).reverse()) {
    const nodes = embeds.map((embed) => {
      const one = answers.get(embed.ref)
      return one ? shown(schema, one, node.type.name === "image" ? (node.attrs.width ?? null) : px(embed.width)) : null
    })
    if (!nodes.length || nodes.some((one) => !one)) continue
    const content = fits(parent, index, nodes as ProseMirrorNode[], schema)
    if (content) tr.replaceWith(pos, pos + node.nodeSize, content)
  }
  if (tr.docChanged) view.dispatch(tr)
}

const key = new PluginKey<number>("obsidianEmbeds")

/** Does this step bring a waiting picture with it: a paste, a redo, a note reopened mid-look. */
const bringsWaiting = (tr: Transaction): boolean =>
  tr.steps.some((step) => {
    const content = (step as unknown as { slice?: { content: Fragment } }).slice?.content
    let any = false
    content?.descendants((node) => {
      if (isWaiting(node)) any = true
      return !any && !node.isTextblock
    })
    return any
  })

/**
 * Pictures pasted from Obsidian come with the note, not as their path.
 *
 * Obsidian copies a note as Markdown, its pictures as `![[name.png]]`, a
 * relative `![](path)`, or a bare path on a line. On a paste each becomes a
 * waiting picture block, the main process finds the file in a vault Obsidian
 * knows and stores it, and the block becomes the picture; one not found says
 * so, and a click on it chooses the file. The words land at once either way.
 * A note already here gets its pictures when it opens, if they can be found.
 */
export const ObsidianEmbeds = Extension.create({
  name: "obsidianEmbeds",

  addProseMirrorPlugins() {
    const { schema } = this.editor
    if (!schema.nodes.imagePlaceholder || !schema.nodes.image) return []
    let pasting = false

    return [
      new Plugin<number>({
        key,
        state: {
          init: () => 0,
          apply: (tr, count) => (tr.docChanged && bringsWaiting(tr) ? count + 1 : count),
        },
        props: {
          handleDOMEvents: {
            paste: (view) => {
              // Shift pastes anything as it is, paths too.
              pasting = !(view as unknown as { input?: { shiftKey?: boolean } }).input?.shiftKey
              setTimeout(() => (pasting = false))
              return false
            },
          },
        },
        appendTransaction: (trs, _old, state) => {
          if (!pasting) return null
          const range = touched(trs)
          return range ? holdPasted(state, range.from, range.to) : null
        },
        view: (view) => {
          let seen = key.getState(view.state)
          // Once the note is laid out (a Markdown one is read in just after): pictures left waiting, and old paths.
          const opened = setTimeout(() => void settle(view).then(() => mend(view)), 300)
          return {
            update: (next) => {
              const now = key.getState(next.state)
              if (now === seen) return
              seen = now
              setTimeout(() => void settle(next))
            },
            destroy: () => clearTimeout(opened),
          }
        },
      }),
    ]
  },
})
