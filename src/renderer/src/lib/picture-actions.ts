import { host, said } from '@/lib/host'
import { chime } from '@/lib/sound'
import { capsNow, meets } from '@/lib/needs'
import { copyImageText, readable } from '@/lib/image-text'
import { canSplit } from '@/lib/split'
import { translateWords } from '@/lib/translate'
import { readToMe } from '@/lib/read-aloud'

/**
 * What a picture's words can do, wherever a picture is right-clicked (a note,
 * a gem, quick capture, Media, a card): the one list, read by the Mac itself
 * (Apple's Vision; main/picture-words.ts), so every surface says the same
 * lines in the same order. Translate shows only on a Mac that can (macOS 26). A picture's words can also be read aloud.
 */
export type PictureLine = { label: string; hint?: string; data: string; run: () => void }

const read = async (src: string): Promise<string | null> => {
  const look = host().imageText ?? window.api?.imageText
  return look ? look(src).catch(() => null) : null
}

/** The words, or why there are none, said once. */
async function wordsOf(src: string): Promise<string | null> {
  const text = await read(src)
  if (text === null) return said('Could not read the picture', false), null
  if (!text.trim()) return said('No words in this picture', false), null
  return text
}

/** A note of its own: the picture, then its words, typed out, to edit and keep. */
async function makeNote(src: string): Promise<void> {
  const text = await wordsOf(src)
  if (!text) return
  const lines = text.split('\n')
  const id = await window.api.captures.create({
    kind: 'note',
    body: { type: 'doc', content: [{ type: 'image', attrs: { src } }, ...lines.map((line) => ({ type: 'paragraph', content: line.trim() ? [{ type: 'text', text: line }] : [] }))] }
  })
  chime('noted')
  said(`Made a note of its ${lines.length === 1 ? 'line' : `${lines.length} lines`}`, true, { type: 'capture', id, title: lines[0] })
}

/** Every note that says what the picture says: the picture's longest line, searched for. */
async function findIt(src: string): Promise<void> {
  const text = await wordsOf(src)
  if (!text) return
  const line = text.split('\n').sort((a, b) => b.length - a.length)[0]
  const words = line.split(/\s+/).filter((word) => word.length > 2).slice(0, 4).join(' ')
  window.dispatchEvent(new CustomEvent('haligtree:search', { detail: { words } }))
}

/** Its words, put into your own language (lib/translate.ts). */
async function translateIt(src: string): Promise<void> {
  const text = await wordsOf(src)
  if (text) await translateWords(text)
}

export function pictureLines(src: string): PictureLine[] {
  if (!readable(src)) return []
  const lines: (PictureLine | false)[] = [
    { label: 'Copy text from image', hint: 'Read by your Mac', data: 'image-text', run: () => void copyImageText(src) },
    { label: 'Make it a note', hint: 'The picture and its words', data: 'image-note', run: () => void makeNote(src) },
    canSplit() && { label: 'Find this in my notes', data: 'image-find', run: () => void findIt(src) },
    { label: 'Read it to me', hint: 'Its words, aloud', data: 'image-read', run: () => void wordsOf(src).then((text) => void (text && readToMe(text))) },
    meets(capsNow(), 'macos26') && { label: 'Translate the text', hint: 'Into your language', data: 'image-translate', run: () => void translateIt(src) }
  ]
  return lines.filter((one): one is PictureLine => !!one)
}
