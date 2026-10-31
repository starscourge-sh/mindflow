/**
 * A picture put under a card's answer: a map, a slide, a diagram pasted while
 * the answer shows, so the card is learnt as the idea and not as its wording
 * ("do not paint by pixels", Ali Abdaal). The answer is a note's words: a
 * TipTap document gets an image block at its end; words kept as text (Markdown)
 * get the picture written as Markdown on a line of its own.
 */
export function withPicture(body: unknown, src: string): unknown {
  const image = { type: 'image', attrs: { src } }
  if (body && typeof body === 'object' && (body as { type?: string }).type === 'doc') {
    const doc = body as { type: 'doc'; content?: unknown[] }
    return { ...doc, content: [...(doc.content ?? []), image] }
  }
  const text = typeof body === 'string' ? body.trimEnd() : ''
  return text ? `${text}\n\n![](${src})` : `![](${src})`
}

/** The first picture on a paste or a drop, if it holds one. */
export function pictureIn(data: DataTransfer | null): File | null {
  return [...(data?.files ?? [])].find((file) => file.type.startsWith('image/')) ?? null
}

/** A picture written into a line of text (a card's Context), where the caret is, on a line of its own. */
export function pictureInText(text: string, at: number, src: string): { text: string; caret: number } {
  const before = text.slice(0, at).replace(/[ \t]+$/, '')
  const after = text.slice(at).replace(/^[ \t]+/, '')
  const mark = `${before && !before.endsWith('\n') ? '\n' : ''}![](${src})${after && !after.startsWith('\n') ? '\n' : ''}`
  return { text: before + mark + after, caret: before.length + mark.length }
}
