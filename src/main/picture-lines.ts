/**
 * The words the Mac read in a picture, as search holds them: the half of
 * picture-words.ts with no Electron in it, so the reading thread (reader.ts)
 * and main read them the same way.
 */

/** Marks a line of search's words as one read in a picture (book-find.ts says so in a result, with the picture). */
export const IN_PICTURE = '\u001e'
export const PICTURE = /^[a-f0-9]{64}\.(png|jpe?g|webp|gif|heic|tiff?|bmp)$/i
export const STORED = /^(?:haligtree|mindflow):\/\/assets\/([a-f0-9]{64}\.[a-z0-9]+)$/i

/** The stored picture an address names, by its file name; undefined for anything else. */
export const pictureNamed = (src: unknown): string | undefined => {
  const name = typeof src === 'string' ? STORED.exec(src)?.[1] : undefined
  return name && PICTURE.test(name) ? name : undefined
}

/** A picture's words as search reads them: a line each, marked as the picture's. */
export const pictureLines = (kept: string): string => (kept.trim() ? `\n${kept.split('\n').map((line) => IN_PICTURE + line).join('\n')}\n` : '')

/** The stored picture whose words hold this line, for a search result to show. */
export function pictureHolding(words: Map<string, string>, line: string): string | undefined {
  const plain = line.replace(/^…/, '').replace(/…$/, '').trim().toLowerCase()
  for (const [name, text] of words) if (text.toLowerCase().includes(plain)) return `haligtree://assets/${name}`
  return undefined
}

/**
 * Whether what Vision read in a picture is words a person wrote, not the shapes of a painting's windows: Vision
 * reads "AR ARALL" in Bruegel's Tower of Babel at half confidence, where a page, a cover or a caption reads at
 * full. A picture has words when one line it is sure of (0.8 or more) holds a word of three letters or more, or
 * when lines it half believes hold three such words between them. A picture the Mac calls art needs two sure
 * words. Lines read before confidence was kept have none, and count as unsure.
 */
const WORD = /\p{L}{3,}/gu
export function hasWords(lines: { text: string; confidence?: number }[], art = false): boolean {
  const words = (min: number): number => lines.filter((line) => (line.confidence ?? 0) >= min).reduce((sum, line) => sum + (line.text.match(WORD)?.length ?? 0), 0)
  return art ? words(0.8) >= 2 : words(0.8) >= 1 || words(0.5) >= 3
}

/** What the reading of a book needs to know of its pictures: one's words for search, and every picture's words by file name. */
export type Pictures = { wordsOf: (src: unknown) => string; known: () => Map<string, string> }
