import { Extension } from "@tiptap/core"
import { Fragment, Slice } from "@tiptap/pm/model"
import { Plugin, PluginKey } from "@tiptap/pm/state"
import type { Node as ProseMirrorNode, Schema } from "@tiptap/pm/model"
import type { Transaction } from "@tiptap/pm/state"
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
// `keep`: the attributes of a picture already in the note, found again in the vault: its words (alt, title, caption)
// stay with it, and only its address moves into the book (made afresh, "Amazon ECR" under a picture went blank).
const shown = (schema: Schema, one: Brought, width: string | null, keep?: Record<string, unknown>): ProseMirrorNode | null =>
  one.image
    ? schema.nodes.image.create({ ...keep, src: one.src, width })
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

/**
 * Pasted embeds as waiting pictures, in what is pasted, before it lands: a paragraph's, and a picture's whose
 * address is a path. `parent` holds `content` (null for what is pasted itself, which lands wherever it fits). Done
 * after the paste had landed, it was a change to the note for every picture (296 for the largest note pasted back
 * whole), and every pass that looks at what a change touched went over each of them one by one for each.
 */
function holdIn(content: Fragment, parent: ProseMirrorNode | null, schema: Schema): Fragment {
  let changed = false
  const out: ProseMirrorNode[] = []
  content.forEach((node, _offset, index) => {
    if (node.type.spec.code || node.isText) return void out.push(node)
    if (node.type.name === "image") {
      const ref = cleanRef(String(node.attrs.src ?? ""))
      const held = ref ? schema.nodes.imagePlaceholder.create({ embed: ref, width: node.attrs.width ?? null }) : null
      if (held && (!parent || parent.canReplace(index, index + 1, Fragment.from(held)))) return void ((changed = true), out.push(held))
      return void out.push(node)
    }
    if (node.type.name === "paragraph") {
      const blocks = cut(node, schema)
      const into = blocks && (parent ? fits(parent, index, blocks, schema) : Fragment.fromArray(blocks))
      if (into) return void ((changed = true), into.forEach((one) => void out.push(one)))
      return void out.push(node)
    }
    const inner = node.isLeaf ? node.content : holdIn(node.content, node, schema)
    if (inner !== node.content) changed = true
    out.push(inner === node.content ? node : node.copy(inner))
  })
  return changed ? Fragment.fromArray(out) : content
}

/** A picture a vault did not have when it was last looked for: looked for again each time its note opens. */
const isMissing = (node: ProseMirrorNode): boolean =>
  node.type.name === "imagePlaceholder" && !!node.attrs.embed && !!node.attrs.missing

/**
 * Fill every waiting picture from what was found: the picture, or a quiet "not found" to click. `again`, as a note
 * opens: the ones marked not found are looked for again, and stay as they are if they are still not there (15 Nov 2026:
 * a picture not found as its note came in, there in the vault since, was never looked for again).
 */
async function settle(view: EditorView, again = false): Promise<void> {
  const refs: string[] = []
  const asked = (node: ProseMirrorNode): boolean => isWaiting(node) || (again && isMissing(node))
  view.state.doc.descendants((node) => {
    if (asked(node)) refs.push(String(node.attrs.embed))
    return !node.isTextblock
  })
  if (!refs.length) return
  const answers = await bring(refs)
  if (view.isDestroyed) return
  const { schema } = view.state
  const tr = view.state.tr
  const spots: { pos: number; node: ProseMirrorNode }[] = []
  view.state.doc.descendants((node, pos) => {
    if (asked(node) && answers.has(String(node.attrs.embed))) spots.push({ pos, node })
    return !node.isTextblock
  })
  for (const { pos, node } of spots.reverse()) {
    const ref = String(node.attrs.embed)
    const one = answers.get(ref)
    const into = one && shown(schema, one, node.attrs.width ?? null)
    if (into) tr.replaceWith(pos, pos + node.nodeSize, into)
    // Its mark alone (a picture asked again and still not there keeps the mark it has): no place in the note moves,
    // so a pass that looks at what changed has nothing to go over.
    else if (!node.attrs.missing) tr.setNodeAttribute(pos, "missing", nameOf(ref))
  }
  // Not its own undo step: ⌘Z takes back the paste, not the picture arriving in it. As a note opens (`again`) the
  // pictures found are shown, not saved: the note is written only once the person changes it, and they are found
  // again (each kept once, by its bytes) every time it opens until then.
  if (tr.docChanged) view.dispatch(tr.setMeta("addToHistory", false).setMeta("preventUpdate", again))
}

/**
 * Pictures a note was stored with inside a line of words, put on a line of their own as it was read
 * (lib/lift-blocks.ts), by address. Not looked for in a vault on opening: a note is saved in its mended shape only
 * when the person edits it. Once it is, they are found as it next opens.
 */
export const readInLine = new WeakMap<object, Set<string>>()

/**
 * A note already here with a line that is only an Obsidian picture's path,
 * or a picture whose address is one: the picture, if a vault has it. One
 * edit, so ⌘Z puts the path back; one not found is left exactly as it was.
 * Shown as it opens, saved with the person's next change (settle).
 */
async function mend(view: EditorView, held?: Set<string>): Promise<void> {
  if (!view.editable || !host().bringEmbeds) return
  const lines = (doc: ProseMirrorNode): { pos: number; node: ProseMirrorNode; embeds: EmbedAt[]; parent: ProseMirrorNode; index: number }[] => {
    const out: { pos: number; node: ProseMirrorNode; embeds: EmbedAt[]; parent: ProseMirrorNode; index: number }[] = []
    doc.descendants((node, pos, parent, index) => {
      if (out.length >= 50 || node.type.spec.code) return false
      if (node.type.name === "image") {
        const ref = held?.has(String(node.attrs.src ?? "")) ? null : cleanRef(String(node.attrs.src ?? ""))
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
      return one ? (node.type.name === "image" ? shown(schema, one, node.attrs.width ?? null, node.attrs) : shown(schema, one, px(embed.width))) : null
    })
    if (!nodes.length || nodes.some((one) => !one)) continue
    const content = fits(parent, index, nodes as ProseMirrorNode[], schema)
    if (content) tr.replaceWith(pos, pos + node.nodeSize, content)
  }
  if (tr.docChanged) view.dispatch(tr.setMeta("preventUpdate", true))
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
    const { editor } = this
    const { schema } = editor
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
          transformPasted: (slice) => {
            if (!pasting) return slice
            const content = holdIn(slice.content, null, schema)
            if (content === slice.content) return slice
            // A line cut to a waiting picture at either edge: open only as deep as there are blocks to open.
            const open = (depth: number, first: boolean): number => {
              let reached = 0
              for (let node = first ? content.firstChild : content.lastChild; node && reached < depth && !node.isLeaf; node = first ? node.firstChild : node.lastChild) reached++
              return reached
            }
            return new Slice(content, open(slice.openStart, true), open(slice.openEnd, false))
          },
        },
        view: (view) => {
          let seen = key.getState(view.state)
          // Once the note is laid out (a Markdown one is read in just after): pictures left waiting, and old paths.
          const opened = setTimeout(() => void settle(view, true).then(() => mend(view, readInLine.get(editor))), 300)
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
