import { Extension } from "@tiptap/core"
import { Plugin } from "@tiptap/pm/state"
import type { Node as ProseMirrorNode } from "@tiptap/pm/model"

/** Obsidian's field names, and what they are called on the card. */
const FIELDS: Record<string, string> = {
  url: "href",
  title: "title",
  description: "description",
  host: "site",
  favicon: "icon",
  image: "image",
}

/**
 * Read the `key: value` lines out of a cardlink block.
 *
 * Everything after the first colon is the value, because a description holds
 * colons of its own, and the quotes Obsidian wraps some values in come off.
 * Without a url there is no card to make.
 */
export function readCardLink(source: string): Record<string, string> | null {
  const card: Record<string, string> = {}
  for (const line of source.split("\n")) {
    const match = line.match(/^\s*([a-z]+)\s*:\s*(.+)$/i)
    const field = match && FIELDS[match[1].toLowerCase()]
    if (!field) continue
    card[field] = match[2].trim().replace(/^(["'])([^]*)\1$/, "$2")
  }
  if (!card.href) return null
  // A card with no title would render as a blank strip. The address says at
  // least something, and it is what the slash menu shows while fetching.
  return { ...card, title: card.title || card.href }
}

/**
 * A pasted Obsidian cardlink becomes the card it describes.
 *
 * Obsidian writes these as a fenced block tagged `cardlink`, so a paste lands
 * here as a code block holding six lines of YAML. It already carries every
 * field the card needs, which is why nothing is fetched: the block is the
 * metadata, and asking the site again would only be slower and less reliable.
 */
export const CardLink = Extension.create({
  name: "cardLink",

  addProseMirrorPlugins() {
    return [
      new Plugin({
        appendTransaction: (transactions, _oldState, state) => {
          if (!transactions.some((transaction) => transaction.docChanged)) return null

          const bookmark = state.schema.nodes.bookmark
          if (!bookmark) return null

          const blocks: { pos: number; node: ProseMirrorNode }[] = []
          state.doc.descendants((node, pos) => {
            if (node.type.name !== "codeBlock" || node.attrs.language !== "cardlink") return
            blocks.push({ pos, node })
          })
          if (!blocks.length) return null

          const tr = state.tr
          for (const { pos, node } of blocks.reverse()) {
            const card = readCardLink(node.textContent)
            if (!card) continue
            tr.replaceWith(pos, pos + node.nodeSize, bookmark.create({ ...card, loading: false }))
          }
          return tr.docChanged ? tr : null
        },
      }),
    ]
  },
})
