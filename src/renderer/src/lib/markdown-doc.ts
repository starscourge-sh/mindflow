import type { Editor, JSONContent } from "@tiptap/core"

import { readCardLink } from "@/extensions/card-link"

/**
 * Long Markdown, cut where a new block has to start anyway: at a heading, or
 * at a line of text against the left edge after a blank one. Never inside a
 * code block, a maths block, a comment or a folded section. Each piece reads
 * the same alone as it did in the whole.
 *
 * Why: several of the parser's own block readers look at all the text that is
 * left at every block, so one long note cost the square of its length. A
 * megabyte took over ten seconds; in pieces it takes well under one.
 */
export function markdownPieces(markdown: string, size = 16000): string[] {
  // `[x][1]` needs its `[1]: address` in the same piece; rare enough to read whole.
  if (markdown.length <= size || /^ {0,3}\[[^\]^]+\]:\s/m.test(markdown)) return [markdown]
  const lines = markdown.split("\n")
  const pieces: string[] = []
  let start = 0
  let length = 0
  let fence: string | null = null
  let maths = false
  let comment = false
  let folded = 0
  for (let at = 0; at < lines.length; at += 1) {
    const line = lines[at]
    length += line.length + 1
    if (fence) {
      if (line.trim().startsWith(fence)) fence = null
      continue
    }
    const open = /^\s*(`{3,}|~{3,})/.exec(line)
    if (open) {
      fence = open[1]
      continue
    }
    if (line.trim() === "$$") maths = !maths
    if (line.includes("<!--") && !line.includes("-->")) comment = true
    else if (comment && line.includes("-->")) comment = false
    if (/^:::\w/.test(line)) folded += 1
    else if (line.trim() === ":::" && folded) folded -= 1
    const next = lines[at + 1]
    if (next === undefined || maths || comment || folded || length < size) continue
    const starts = /^#{1,6}\s/.test(next) || (!line.trim() && /^[^\s>|\-*+\d:<[!$`~=]/.test(next))
    if (!starts) continue
    pieces.push(lines.slice(start, at + 1).join("\n"))
    start = at + 1
    length = 0
  }
  pieces.push(lines.slice(start).join("\n"))
  return pieces
}

/** Text that is only pictures, `![](...)` and nothing else. */
const PICTURES = /^(\s*!\[[^\]]*\]\([^)\s]+\)\s*)+$/
/** `==marked==`, but not a row of equals signs. */
const MARKED = /==([^=\s](?:[^\n]*?[^=\s])?)==/g

const plainText = (node: JSONContent): node is JSONContent & { text: string } =>
  node.type === "text" && !!node.text && !node.marks?.some((mark) => mark.type === "code")
const pictures = (text: string): JSONContent[] =>
  [...text.matchAll(/!\[([^\]]*)\]\(([^)\s]+)\)/g)].map((match) => tidyDocument({ type: "image", attrs: { src: match[2], alt: match[1] } }))
const marked = (node: JSONContent & { text: string }): JSONContent[] =>
  node.text.split(MARKED).map((text, at) => ({ ...node, text, marks: at % 2 ? [...(node.marks ?? []), { type: "highlight" }] : node.marks })).filter((part) => part.text)

const FILE_LINK = /^mindflow:\/\/assets\/[a-f0-9]{64}\.(?!png|jpe?g|gif|webp|svg|avif|bmp)[a-z0-9]+$/

/**
 * What Obsidian writes that plain Markdown has no word for, put right once the
 * text is read: a `cardlink` block is the link card it describes, a picture's
 * `|300` is its width, and a paragraph that is only a link to a stored file is
 * that file's card.
 */
export function tidyDocument(node: JSONContent, inText = false): JSONContent {
  if (node.type === "codeBlock" && node.attrs?.language === "cardlink") {
    const card = readCardLink((node.content ?? []).map((child) => child.text ?? "").join(""))
    if (card) return { type: "bookmark", attrs: { ...card, loading: false } }
  }
  // A video by its address plays where it is; inside a line (a table cell),
  // where a player cannot go, it is a link to it.
  if (node.type === "image" && /^https?:\/\/(www\.|m\.)?(youtube\.com|youtu\.be)\//.test(String(node.attrs?.src ?? "")))
    return inText
      ? { type: "text", text: String(node.attrs?.alt || node.attrs?.src), marks: [{ type: "link", attrs: { href: node.attrs?.src } }] }
      : { type: "youtube", attrs: { src: node.attrs?.src } }
  if (node.type === "image") {
    const sized = /^(.*?)\|(\d+)(?:x\d+)?$/.exec(String(node.attrs?.alt ?? ""))
    if (sized) return { ...node, attrs: { ...node.attrs, alt: sized[1].trim(), width: `${sized[2]}px` } }
  }
  // A heading too: a line of them over a "---" reads as one.
  if ((node.type === "paragraph" || node.type === "heading") && node.content?.length) {
    // Links to stored files, one a line and nothing else: each its card.
    const fileOf = (part: JSONContent): JSONContent | null => {
      const link = part.marks?.find((mark) => mark.type === "link")
      const href = String(link?.attrs?.href ?? "")
      return part.type === "text" && FILE_LINK.test(href) ? { type: "attachment", attrs: { src: href, name: part.text ?? "", size: Number(link?.attrs?.title) || 0 } } : null
    }
    const parts = node.content.filter((part) => part.type !== "hardBreak" && !(part.type === "text" && !part.marks?.length && !part.text?.trim()))
    const files = parts.map(fileOf)
    if (files.every(Boolean)) return files.length === 1 ? files[0]! : { type: "files", content: files as JSONContent[] }
  }
  if (!node.content) return node
  // What the list reader leaves as words: a picture indented under an item,
  // and a highlight with an = inside it.
  const inline = node.type === "paragraph" || node.type === "heading"
  return {
    ...node,
    content: node.content.flatMap((child, at): JSONContent[] => {
      const only = child.type === "paragraph" && child.content?.length === 1 ? child.content[0] : null
      // A list item starts with a line of words, even an empty one.
      const lead = at === 0 && /^(listItem|taskItem)$/.test(node.type ?? "") ? [{ type: "paragraph" }] : []
      if (only && plainText(only) && PICTURES.test(only.text)) return [...lead, ...pictures(only.text)]
      if (!inline && plainText(child) && PICTURES.test(child.text)) return [...lead, ...pictures(child.text)]
      if (plainText(child) && child.text.includes("==")) return marked(child)
      const tidied = tidyDocument(child, inline)
      if (tidied.type === "files") return [...lead, ...(tidied.content ?? [])]
      return /^(paragraph|heading)$/.test(child.type ?? "") && tidied.type === "attachment" ? [...lead, tidied] : [tidied]
    }),
  }
}

/** Markdown as the editor's document, read in pieces and tidied. */
export function markdownToDocument(editor: Editor, markdown: string): JSONContent {
  const manager = editor.markdown
  const content = manager ? markdownPieces(markdown).flatMap((piece) => manager.parse(piece).content ?? []) : []
  return tidyDocument({ type: "doc", content: content.length ? content : [{ type: "paragraph" }] })
}
