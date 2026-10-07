/**
 * How a note copied out of Obsidian points at its pictures and files, read
 * without touching the disk: `![[name.png]]`, `![[name.png|300]]`,
 * `![alt](sub/name%20with%20spaces.png)`, and a line that is only a path,
 * `../../extras/attachments/Screenshot.png`, which is what some copies hold.
 * Shared by the editor, which spots them on a paste, and the main process,
 * which finds the file in a vault.
 */

/** Files Vigil can show in a note: pictures, and PDFs and videos as cards. */
export const SHOWN = /\.(png|jpe?g|gif|webp|svg|avif|bmp|pdf|mp4|m4v|mov|webm)$/i
/** Of those, the ones that are pictures. */
export const PICTURE = /\.(png|jpe?g|gif|webp|svg|avif|bmp)$/i

/** One embed in a line of text: where it sits, what it names, and its width if it gave one. */
export interface EmbedAt {
  from: number
  to: number
  ref: string
  width?: string
}

/** `%20` and friends as the characters they stand for; left as it is if it is not encoded. */
const decoded = (text: string): string => {
  try {
    return decodeURIComponent(text)
  } catch {
    return text
  }
}

/** An address with a scheme (https:, mindflow:, data:) is not a file in a vault. */
const hasScheme = (text: string): boolean => /^[a-z][a-z0-9+.-]*:/i.test(text)

/** A width the way Obsidian writes one: `300` or `300x200`, as `300`. */
const widthOf = (text: string | undefined): string | undefined => /^\s*(\d+)(?:x\d+)?\s*$/.exec(text ?? '')?.[1]

/**
 * A reference as a file to look for, or null when it names something Vigil
 * does not show (a note, a heading, a Word file). `name.pdf#page=3` is the PDF.
 */
export function cleanRef(raw: string): string | null {
  const ref = decoded(raw.trim()).replace(/#.*$/, '').trim()
  if (!ref || hasScheme(ref) || !SHOWN.test(ref)) return null
  return ref
}

/** Every embed in a line of text, in order. */
export function embedsIn(text: string): EmbedAt[] {
  const found: EmbedAt[] = []
  // ![[target|width]]: up to the first ]] not followed by another, so a name holding a ] is whole.
  for (const match of text.matchAll(/!\[\[([^\n]+?)\]\](?!\])/g)) {
    const [target, width] = match[1].split(/\\?\|/)
    const ref = cleanRef(target)
    if (ref) found.push({ from: match.index!, to: match.index! + match[0].length, ref, width: widthOf(width) })
  }
  // ![alt](path) and ![alt|300](<path with spaces>), never an address.
  for (const match of text.matchAll(/!\[([^\]\n]*)\]\(\s*(<[^>\n]+>|[^)\s]+)(?:\s+"[^"\n]*")?\s*\)/g)) {
    const ref = cleanRef(match[2].replace(/^<|>$/g, ''))
    if (!ref) continue
    const from = match.index!
    // Inside an ![[...]] already taken: not a second embed.
    if (found.some((one) => from >= one.from && from < one.to)) continue
    found.push({ from, to: from + match[0].length, ref, width: widthOf(match[1].split('|')[1]) })
  }
  return found.sort((a, b) => a.from - b.from)
}

/**
 * A whole line that is only a path to a file Vigil shows, with at least one
 * folder in it: `../../extras/attachments/Screenshot 2026.png`. A bare name
 * ("cat.png") is too likely to be words, so it needs the folder.
 */
export function barePath(text: string): string | null {
  const line = text.trim()
  if (!line || line.length > 1024 || line.includes('\n') || hasScheme(line)) return null
  if (!/^(?:\.{1,2}\/|\/)?(?:[^/\n]+\/)+[^/\n]+$/.test(line)) return null
  return cleanRef(line)
}

/** A line of text that holds nothing but embeds (and spaces): its embeds, or null. */
export function onlyEmbeds(text: string): EmbedAt[] | null {
  const path = barePath(text)
  if (path) return [{ from: 0, to: text.length, ref: path }]
  const found = embedsIn(text)
  if (!found.length) return null
  let rest = ''
  let from = 0
  for (const one of found) {
    rest += text.slice(from, one.from)
    from = one.to
  }
  rest += text.slice(from)
  return rest.trim() ? null : found
}

/** The file's own name: what Obsidian finds it by, wherever it is. */
export const nameOf = (ref: string): string => ref.split(/[/\\]/).pop() ?? ref

/**
 * The path with its leading `./` and `../` steps taken off: relative to a note
 * whose folder is not known, this is the best guess at its place in the vault.
 */
export const tailOf = (ref: string): string => ref.replace(/\\/g, '/').replace(/^(?:\.{1,2}\/)+/, '').replace(/^\/+/, '')
