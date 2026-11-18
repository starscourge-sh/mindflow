import { toast } from '@/components/haligtree/ui'
import { host, said } from '@/lib/host'
import { capsNow, meets } from '@/lib/needs'
import { copyImageText, readable } from '@/lib/image-text'
import { canSplit } from '@/lib/split'
import { translatable, translateWords, warm } from '@/lib/translate'
import { readToMe } from '@/lib/read-aloud'

/**
 * What a picture's words can do, wherever a picture is right-clicked (a note,
 * a gem, quick capture, Media, a card): the one list, read by the Mac itself
 * (Apple's Vision; main/picture-words.ts), so every surface says the same
 * lines in the same order. Translate shows only on a Mac that can (macOS 26), and only for words the Mac is sure are in another language. A picture's words can also be read aloud.
 */
export type PictureLine = { label: string; hint?: string; data: string; run: () => void }

const read = async (src: string): Promise<string | null> => {
  const look = host().imageText ?? window.api?.imageText
  return look ? look(src).catch(() => null) : null
}

// A picture's words, read when it is pointed at, so its menu built a moment later knows whether Translate can help.
const wordsSeen = new Map<string, string>()
if (typeof document !== 'undefined' && typeof window !== 'undefined' && window.api) {
  document.addEventListener('pointerover', (event) => {
    const img = event.target instanceof HTMLImageElement ? event.target : null
    if (!img || !readable(img.src) || wordsSeen.has(img.src) || !meets(capsNow(), 'macos26')) return
    wordsSeen.set(img.src, '')
    void read(img.src).then((text) => text && (wordsSeen.set(img.src, text), warm(text)))
  })
}

/** The words, or why there are none, said once. */
async function wordsOf(src: string): Promise<string | null> {
  const text = await read(src)
  if (text === null) return said('Could not read the picture', false), null
  if (!text.trim()) return toast('No words in this picture', undefined, 'info'), null
  return text
}

/** A note of its own: the picture, then its words, typed out, to edit and keep. */
async function makeNote(src: string): Promise<void> {
  // A picture with no words still makes a note: the picture alone.
  const text = (await read(src)) ?? ''
  const lines = text.trim() ? text.split('\n') : []
  const id = await window.api.captures.create({
    kind: 'note',
    body: { type: 'doc', content: [{ type: 'image', attrs: { src } }, ...lines.map((line) => ({ type: 'paragraph', content: line.trim() ? [{ type: 'text', text: line }] : [] }))] }
  })
  said(lines.length ? `Made a note of its ${lines.length === 1 ? 'line' : `${lines.length} lines`}` : 'Made a note of it', true, { type: 'capture', id, title: lines[0] ?? 'Picture' }, { cue: 'noted' })
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

/** `place`: where the picture is shown; reading its words aloud stops once that is gone. */
export function pictureLines(src: string, place?: Element | null): PictureLine[] {
  if (!readable(src)) return []
  const lines: (PictureLine | false)[] = [
    { label: 'Copy text from image', hint: 'Read by your Mac', data: 'image-text', run: () => void copyImageText(src) },
    { label: 'Make it a note', hint: 'The picture and its words', data: 'image-note', run: () => void makeNote(src) },
    canSplit() && { label: 'Find this in my notes', data: 'image-find', run: () => void findIt(src) },
    { label: 'Read it to me', hint: 'Its words, aloud', data: 'image-read', run: () => void readToMe(wordsOf(src), place ?? document.querySelector(`[data-src="${src}"]`)?.parentElement) },
    translatable(wordsSeen.get(src) ?? '') && { label: 'Translate the text', hint: 'Into your language', data: 'image-translate', run: () => void translateIt(src) }
  ]
  return lines.filter((one): one is PictureLine => !!one)
}
