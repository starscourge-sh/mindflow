import type { JSONContent } from "@tiptap/core"
import { Mark, type ContentMatch, type NodeType, type Schema } from "@tiptap/pm/model"

/**
 * A block (a picture, a rule) stored inside a line of words, put on a line of its own.
 *
 * Notes imported from Obsidian kept `![[picture.png]]` inside the paragraph it was written in, and a `---` under
 * a line inside that line. The schema has no room for a block there. The editor loads it all the same (it does
 * not check), and the first edit that touches that line throws ("Called contentMatchAt on a node with invalid
 * content"): a picture could not be deleted, nor words typed beside it. So before a stored document reaches an
 * editor, each such line is split round its blocks: its words before, the block, its words after. A part that is
 * only spaces and line breaks goes, and so do the line breaks at each cut; words and marks stay exactly.
 *
 * Only where the line's holder can take what comes out: a list item still starts with a line (an empty one if a
 * picture came first), and a holder that can take no block is left as it was.
 *
 * Pure, and the same object comes back when nothing needed lifting, so a caller can tell that nothing changed.
 * `moved` is told of each block taken out of a line.
 */
export function liftBlocks(doc: JSONContent, schema: Schema, moved?: (block: JSONContent) => void): JSONContent {
  return lift(doc, schema, moved)
}

const typeOf = (schema: Schema, node: JSONContent): NodeType | undefined => (node.type ? schema.nodes[node.type] : undefined)

/** A line break, as a node or as the only thing a run of text holds. */
const isBreak = (node: JSONContent): boolean => node.type === "hardBreak" || (node.type === "text" && /^\n+$/.test(node.text ?? ""))
/** Nothing a reader would call words: spaces and line breaks. */
const isBlank = (node: JSONContent): boolean => node.type === "hardBreak" || (node.type === "text" && !(node.text ?? "").trim())

/** The line breaks that parted these words from a block: at the start of what follows one, at the end of what comes before. */
function trimBreaks(words: JSONContent[], start: boolean, end: boolean): JSONContent[] {
  const out = [...words]
  if (start) {
    while (out.length && isBreak(out[0])) out.shift()
    if (out[0]?.type === "text" && out[0].text?.startsWith("\n")) out[0] = { ...out[0], text: out[0].text.replace(/^\n+/, "") }
  }
  if (end) {
    while (out.length && isBreak(out[out.length - 1])) out.pop()
    const last = out[out.length - 1]
    if (last?.type === "text" && last.text?.endsWith("\n")) out[out.length - 1] = { ...last, text: last.text.replace(/\n+$/, "") }
  }
  return out
}

/** A line holding a block, as its parts: the words before, the block, the words after. Null when it holds none. */
function split(line: JSONContent, schema: Schema, moved?: (block: JSONContent) => void): JSONContent[] | null {
  const content = line.content ?? []
  if (!content.some((child) => typeOf(schema, child)?.isBlock)) return null
  const parts: JSONContent[] = []
  let named = false
  let run: JSONContent[] = []
  let afterBlock = false
  const close = (beforeBlock: boolean): void => {
    const words = trimBreaks(run, afterBlock, beforeBlock)
    run = []
    if (!words.some((one) => !isBlank(one))) return
    // A line's own name (what a link to it lands on) stays with its first part, as when a line is split by Enter.
    parts.push({ ...line, ...(named && line.attrs?.blockId ? { attrs: { ...line.attrs, blockId: null } } : {}), content: words })
    named = true
  }
  for (const child of content) {
    const type = typeOf(schema, child)
    if (!type?.isBlock) {
      run.push(child)
      continue
    }
    close(true)
    moved?.(child)
    // A line inside the line (a heading pasted into one) is split the same way.
    parts.push(...((type.isTextblock && split(child, schema, moved)) || [lift(child, schema, moved)]))
    afterBlock = true
  }
  close(false)
  return parts
}

/** Whether a holder of this type can hold these children, in this order. */
function fits(holder: NodeType, children: JSONContent[], schema: Schema): boolean {
  let match: ContentMatch | null = holder.contentMatch
  for (const child of children) {
    const type = typeOf(schema, child)
    match = type ? match.matchType(type) : null
    if (!match) return false
  }
  return match.validEnd
}

/**
 * Words whose marks the schema will not put together, as the schema would make them. Code takes no other mark (its
 * `excludes: "_"`), and Markdown read in (`**\`top_k\`**`, `*\`main\`*`: a paste, quick capture, an import) gave
 * words bold and code at once. The editor loads that unchecked too, and its first checked insert of them refused the
 * lot ("Invalid collection of marks for node text: bold,code": "Join them" on the largest note, 16 Nov, which had
 * 122 such runs). Kept as the code alone; anything the schema does not know is left to it as it was.
 */
function marksTogether(node: JSONContent, schema: Schema): JSONContent {
  const marks = node.marks
  if (node.type !== "text" || !marks || marks.length < 2) return node
  try {
    let set: readonly Mark[] = Mark.none
    for (const one of marks) {
      const type = one.type ? schema.marks[one.type] : undefined
      if (!type) return node
      set = type.create(one.attrs ?? null).addToSet(set)
    }
    return set.length === marks.length ? node : { ...node, marks: set.map((mark) => mark.toJSON() as NonNullable<JSONContent["marks"]>[number]) }
  } catch {
    return node
  }
}

function lift(node: JSONContent, schema: Schema, moved?: (block: JSONContent) => void): JSONContent {
  if (!node.content?.length) return node
  const holder = typeOf(schema, node)
  // A line's own children are lifted by its holder, where there is room for them; its words' marks are put right here.
  if (holder?.isTextblock) {
    const words = node.content.map((child) => marksTogether(child, schema))
    return words.every((child, at) => child === node.content![at]) ? node : { ...node, content: words }
  }
  const kept = node.content.map((child) => lift(child, schema, moved))
  const lifted = kept.flatMap((child) => (typeOf(schema, child)?.isTextblock && split(child, schema, moved)) || [child])
  const same = lifted.length === node.content.length && lifted.every((child, at) => child === node.content![at])
  if (same) return node
  if (!holder || fits(holder, lifted, schema)) return { ...node, content: lifted }
  // A list item starts with a line: an empty one before a picture that came first.
  const lead = holder.contentMatch.defaultType
  if (lead?.isTextblock && fits(holder, [{ type: lead.name }, ...lifted], schema)) return { ...node, content: [{ type: lead.name }, ...lifted] }
  return kept.every((child, at) => child === node.content![at]) ? node : { ...node, content: kept }
}
