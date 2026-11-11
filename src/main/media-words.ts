/**
 * What Media takes, read from a file's first bytes rather than its name, and
 * the one sentence every way in says about a batch (Media's button, a drop on
 * Media, Finder's right-click). No Electron here: the window says the same
 * words as the main process.
 */

/** A video plays in Files and in a note; a document is any other file (Word, Pages, a spreadsheet, a ZIP, anything), kept as it came. */
export type MediaKind = 'picture' | 'gif' | 'pdf' | 'audio' | 'video' | 'document'

export const PICTURE_ENDS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'bmp', 'svg', 'heic', 'heif', 'tif', 'tiff']
export const AUDIO_ENDS = ['mp3', 'm4a', 'weba', 'wav', 'ogg', 'aac', 'flac']
export const VIDEO_ENDS = ['mp4', 'mov', 'm4v', 'webm']
/** The ending a stored file keeps: its own when it is a plain one, else `bin` (the name it came under is kept beside it). */
export const endOf = (name: string): string => ((end) => (/^[a-z0-9]{1,12}$/.test(end) && name.includes('.') ? end : 'bin'))((name.split('.').pop() ?? '').toLowerCase())
/** Pictures the window cannot draw as they come: the Mac turns them into a PNG as they go in. */
export const TURNED = /\.(heic|heif|tiff?)$/i

const has = (head: Uint8Array, at: number, text: string): boolean => [...text].every((letter, i) => head[at + i] === letter.charCodeAt(0))
const WANTS_PDF = 1024

/**
 * The ending a stored file gets and the kind it is. Pictures, PDFs, recordings and videos are known by their first
 * bytes; anything else (a Word or Pages file, a spreadsheet, a ZIP, a file Haligtree has never heard of) is kept as a
 * document, as it came, so nothing a person drops in is turned away.
 */
export function sniff(head: Uint8Array, name: string): { end: string; kind: MediaKind } {
  const end = (name.split('.').pop() ?? '').toLowerCase()
  if (head[0] === 0x89 && has(head, 1, 'PNG')) return { end: 'png', kind: 'picture' }
  if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return { end: 'jpg', kind: 'picture' }
  if (has(head, 0, 'GIF8')) return { end: 'gif', kind: 'gif' }
  if (has(head, 0, 'RIFF') && has(head, 8, 'WEBP')) return { end: 'webp', kind: 'picture' }
  if (has(head, 0, 'BM') && end === 'bmp') return { end: 'bmp', kind: 'picture' }
  // A PDF may start after a few stray bytes; pdf.js reads those too.
  if (Buffer.from(head.subarray(0, WANTS_PDF)).includes('%PDF-')) return { end: 'pdf', kind: 'pdf' }
  const box = has(head, 4, 'ftyp')
  if (box && end === 'avif') return { end: 'avif', kind: 'picture' }
  if (box && end === 'm4a') return { end: 'm4a', kind: 'audio' }
  // A QuickTime film may open on any of its boxes, not only "ftyp".
  if (VIDEO_ENDS.includes(end) && end !== 'webm' && (box || ['moov', 'mdat', 'wide', 'free', 'skip', 'pnot'].some((one) => has(head, 4, one)))) return { end, kind: 'video' }
  const ebml = head[0] === 0x1a && head[1] === 0x45 && head[2] === 0xdf && head[3] === 0xa3
  if (ebml && end === 'webm') return { end: 'webm', kind: 'video' }
  if (end === 'svg' && Buffer.from(head).toString('utf8').includes('<svg')) return { end: 'svg', kind: 'picture' }
  if (AUDIO_ENDS.includes(end)) {
    const sound = has(head, 0, 'ID3') || (head[0] === 0xff && (head[1] & 0xe0) === 0xe0) || (has(head, 0, 'RIFF') && has(head, 8, 'WAVE')) || has(head, 0, 'OggS') || has(head, 0, 'fLaC') || ebml
    if (sound) return { end, kind: 'audio' }
  }
  // Named as a picture, a PDF, a recording or a film but not one inside: kept as a plain file, so it is never shown as one.
  const claims = [...PICTURE_ENDS, 'pdf', ...AUDIO_ENDS, ...VIDEO_ENDS].includes(end)
  return { end: claims ? 'bin' : endOf(name), kind: 'document' }
}

export type Taken = { src: string; name: string; size: number; kind: MediaKind }
export type AddResult = {
  /** New to the book. */
  added: Taken[]
  /** In the Bin until now: back out of it. */
  revived: Taken[]
  /** The same bytes were here already. */
  met: Taken[]
  refused: { name: string; why: string }[]
}

const bare = (name: string): string => name.replace(/\.[^.]+$/, '') || name
const num = (n: number): string => n.toLocaleString('en-GB')

/** The one notice for a batch: what came in, what was here already, and each refused file by name. */
export function addSaid({ added, revived, met, refused }: AddResult): string {
  const taken = [...added, ...revived]
  const first = taken.length === 1 ? `Added “${bare(taken[0].name)}” to Files.` : taken.length ? `Added ${num(taken.length)} files.` : ''
  const here = !met.length ? ''
    : met.length === 1 ? `“${bare(met[0].name)}” is already in Files.`
      : taken.length ? `${num(met.length)} were already there.` : `All ${num(met.length)} are already in Files.`
  const names = refused.slice(0, 3).map((one) => `${one.name}: ${one.why}.`).join(' ')
  const rest = refused.length > 3 ? ` And ${num(refused.length - 3)} more not added.` : ''
  return [first, here, names + rest].filter(Boolean).join(' ')
}
