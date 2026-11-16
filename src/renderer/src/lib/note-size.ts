import type { Node as ProseMirrorNode, Schema } from "@tiptap/pm/model"
import { changedSpan } from "./text-edit.ts"
import { lineCard } from "../../../main/study.ts"
import { READING_PACE } from "../../../main/word-count.ts"

/**
 * How big a note is: its lines as the margin numbers them, its words and characters, and its headings, pictures,
 * links and the lines Review asks as cards. Each block's size is kept by the block itself, and a note's by the
 * document it was counted from, so a change counts only the blocks it touched, from the note before it: a key typed
 * in the largest note (7,017 blocks) counts its one line, never the note.
 */
export type Size = { lines: number; words: number; characters: number; headings: number; pictures: number; links: number; cards: number }

const NONE: Size = { lines: 0, words: 0, characters: 0, headings: 0, pictures: 0, links: 0, cards: 0 }
const KEYS = Object.keys(NONE) as (keyof Size)[]

export const LISTS = new Set(["bulletList", "orderedList", "taskList"])
export const QUOTE = "blockquote"

/**
 * How many lines a block holds, as the margin numbers them (line-numbers.ts) and as Obsidian does: one per paragraph
 * however it wraps, one per heading, picture, table, code block, divider, callout and column layout, one per item of a
 * list (nested ones too) and per paragraph of a quote. Kept by the block: an unchanged block is never counted again.
 */
const lineCounts = new WeakMap<ProseMirrorNode, number>()
export function linesIn(node: ProseMirrorNode): number {
  let lines = lineCounts.get(node)
  if (lines !== undefined) return lines
  const name = node.type.name
  if (LISTS.has(name)) {
    lines = 0
    node.forEach((item) => void (lines! += itemLines(item)))
  } else if (name === QUOTE) {
    lines = 0
    node.forEach((child) => void (lines! += linesIn(child)))
    lines = Math.max(1, lines)
  } else lines = 1
  lineCounts.set(node, lines)
  return lines
}
/** A list's item: its own line, and the items of the lists inside it. */
const itemCounts = new WeakMap<ProseMirrorNode, number>()
export function itemLines(item: ProseMirrorNode): number {
  let lines = itemCounts.get(item)
  if (lines !== undefined) return lines
  lines = 1
  item.forEach((child) => void (LISTS.has(child.type.name) && (lines! += linesIn(child))))
  itemCounts.set(item, lines)
  return lines
}

/** A line's words as the main process reads them (study.ts lineCardsIn): a formula as `$...$`, code in backticks. */
export const lineText = (block: ProseMirrorNode): string => {
  let text = ""
  block.forEach((node) => {
    if (node.type.name === "inlineMath") text += `$${node.attrs.latex ?? ""}$`
    else if (node.isText) text += node.marks.some((one) => one.type.name === "code") ? `\`${node.text}\`` : node.text
    else text += node.textContent
  })
  return text
}

/** How something not words counts: a link to a note as the words it shows, anything else (a picture, a break) as a gap. */
export const shown = (node: ProseMirrorNode): string => (node.type.name === "noteLink" ? String(node.attrs.text || node.attrs.label || " ") : " ")
/** The words in some text: whatever stands between spaces, a `/` on its own (the block menu being opened) not one. */
export const wordsIn = (text: string): number => text.split(/\s+/).filter((word) => word && word !== "/").length

const PICTURES = new Set(["image", "excalidraw"])

/** One block's size, kept by the block. */
const blocks = new WeakMap<ProseMirrorNode, Size>()
export function blockSize(block: ProseMirrorNode): Size {
  const kept = blocks.get(block)
  if (kept) return kept
  const leaf = block.isLeaf
  const size: Size = {
    ...NONE,
    lines: linesIn(block),
    words: wordsIn(leaf ? shown(block) : block.textBetween(0, block.content.size, " ", (node) => ` ${shown(node)} `)),
    characters: (leaf ? shown(block) : block.textBetween(0, block.content.size, undefined, shown)).length,
  }
  const look = (node: ProseMirrorNode): void => {
    const name = node.type.name
    if (name === "heading") size.headings += 1
    if (PICTURES.has(name)) size.pictures += 1
    if (name === "noteLink" || name === "bookmark") size.links += 1
    if (!node.isTextblock) return void node.forEach(look)
    // A card's mark is drawn on any line but code (line-cards.ts): counted where it is drawn.
    if (name !== "codeBlock" && lineCard(lineText(node))) size.cards += 1
    // A web link is its run of words, however many styles it is cut into.
    let href: unknown = null
    node.forEach((child) => {
      const link = child.isText ? (child.marks.find((mark) => mark.type.name === "link")?.attrs.href ?? null) : null
      if (link && link !== href) size.links += 1
      href = link
      if (!child.isText) look(child)
    })
  }
  look(block)
  blocks.set(block, size)
  return size
}

const add = (to: Size, size: Size, sign: 1 | -1): void => {
  for (const key of KEYS) to[key] += sign * size[key]
}

/** The blocks of a note a stretch of it touches, from the first to past the last: none for a place between two. */
const touched = (doc: ProseMirrorNode, from: number, to: number): [number, number] => {
  const $to = doc.resolve(to)
  return [doc.resolve(from).index(0), $to.depth ? $to.index(0) + 1 : $to.index(0)]
}

/** Each note's size, by the document it was counted from. */
const sizes = new WeakMap<ProseMirrorNode, Size>()

/**
 * A note's size. With `before`, the note as it stood before the change that made this one, counted already, only the
 * blocks the change touched are counted again (lib/text-edit.ts's one comparison a change, shared with every plugin);
 * without it, each block gives its own size, kept by the block, so a note opened again reads nothing new.
 */
export function sizeOf(doc: ProseMirrorNode, before?: ProseMirrorNode | null): Size {
  const kept = sizes.get(doc)
  if (kept) return kept
  const was = before ? sizes.get(before) : undefined
  let size: Size
  if (before && was) {
    const span = changedSpan(before, doc)
    size = { ...was }
    if (span) {
      const [from, gone] = touched(before, span.from, span.oldTo)
      const [, come] = touched(doc, span.from, span.newTo)
      for (let i = from; i < gone; i++) add(size, blockSize(before.child(i)), -1)
      for (let i = from; i < come; i++) add(size, blockSize(doc.child(i)), 1)
    }
    // The same counts (a word made bold): the same size, so nothing that shows it draws again.
    if (KEYS.every((key) => size[key] === was[key])) size = was
  } else {
    size = { ...NONE }
    doc.forEach((block) => add(size, blockSize(block), 1))
  }
  sizes.set(doc, size)
  return size
}

/** Minutes to read so many words, at the app's one pace (the Feed's “min read” too): a minute at least for any. */
export const minutesToRead = (words: number): number => (words ? Math.max(1, Math.round(words / READING_PACE)) : 0)

/**
 * The size of a note not in an editor yet (a long paste kept from quick capture), counted as an open note counts
 * it, block by block, with a breath between stretches so the box answers every key meanwhile.
 */
export async function sizeOfStored(schema: Schema, doc: { content?: unknown[] }, rest: () => Promise<void>): Promise<Size> {
  const size = { ...NONE }
  let since = performance.now()
  for (const block of doc.content ?? []) {
    add(size, blockSize(schema.nodeFromJSON(block)), 1)
    if (performance.now() - since > 8) (await rest(), (since = performance.now()))
  }
  return size
}
