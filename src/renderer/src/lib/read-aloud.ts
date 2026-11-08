import { tagsIn } from '../../../main/tag-words'

/** The languages a tag's answers can be read in, by the Mac's own voices (free, offline, nothing to download). */
export const LANGUAGES = [
  { id: '', label: 'Off' },
  { id: 'es', label: 'Spanish' },
  { id: 'fr', label: 'French' },
  { id: 'de', label: 'German' },
  { id: 'it', label: 'Italian' },
  { id: 'pt', label: 'Portuguese' },
  { id: 'ja', label: 'Japanese' },
  { id: 'zh', label: 'Chinese' },
  { id: 'ko', label: 'Korean' },
  { id: 'ru', label: 'Russian' },
  { id: 'en', label: 'English' }
] as const

/** A sentence to hear each voice say, so choosing one previews it. */
const SAMPLE: Record<string, string> = { es: 'Hola, ¿qué tal?', fr: 'Bonjour, ça va ?', de: 'Hallo, wie geht es dir?', it: 'Ciao, come stai?', pt: 'Olá, tudo bem?', ja: 'こんにちは', zh: '你好', ko: '안녕하세요', ru: 'Привет, как дела?', en: 'Hello, how are you?' }

/** The best of the Mac's voices for a language: an enhanced or premium one if it is installed. */
function voiceFor(language: string): SpeechSynthesisVoice | undefined {
  const all = speechSynthesis.getVoices().filter((one) => one.lang.toLowerCase().startsWith(language))
  return all.find((one) => /premium|enhanced/i.test(one.name)) ?? all.find((one) => one.localService) ?? all[0]
}

/** The words to say: no #tags, no links' addresses, no markdown marks. */
const sayable = (text: string): string =>
  text.replace(/(^|\s)#[\p{L}\p{N}_-]+/gu, ' ').replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/[*_`=~]+/g, '').replace(/\s+/g, ' ').trim()

/** The last thing said, for the key that says it again. */
let last: { text: string; language: string } | null = null
/** Under test (HALIGTREE_QA_AWAY) nothing is heard; what would have been said is kept here instead. */
export const said: { text: string; language: string }[] = []
;(window as unknown as { __readAloud?: typeof said }).__readAloud = said

/** Say some words in a language, stopping whatever was being said. */
export function speak(text: string, language: string): void {
  const words = sayable(text)
  if (!words || !language) return
  last = { text: words, language }
  said.push(last)
  speechSynthesis.cancel()
  if (window.api.quiet) return
  const utterance = new SpeechSynthesisUtterance(words)
  utterance.lang = language
  const voice = voiceFor(language)
  if (voice) utterance.voice = voice
  speechSynthesis.speak(utterance)
}
/** The last answer again. */
export const sayAgain = (): void => void (last && speak(last.text, last.language))
/** A short sentence in the language, when it is chosen: what it will sound like. */
export const preview = (language: string): void => speak(SAMPLE[language] ?? '', language)

/** The language a card is read in: the first of its tags that has one. */
export function languageOf(text: string, byTag: Record<string, string>): string | null {
  for (const tag of tagsIn(text)) if (byTag[tag]) return byTag[tag]
  // A tag under one that reads aloud reads aloud too: #spanish-verbs under #spanish.
  for (const tag of tagsIn(text)) for (const [parent, language] of Object.entries(byTag)) if (tag.startsWith(`${parent}-`)) return language
  return null
}

/**
 * "Read it to me": a note, a Journal day or words picked in a book, read aloud by
 * the Mac's own voice (every Mac, offline), in the language the words are in
 * (Natural Language finds it), each word lit as it is said when the words are on
 * the page (`within`). Esc, or the line again, stops it; so does reading something else.
 * Under test nothing is heard: the words are lit one by one as if said.
 */
let stopping: (() => void) | null = null
export const readingNow = (): boolean => !!stopping

export function stopReading(): void {
  stopping?.()
}

/** The words of `within`, a text node at a time, so a word said can be lit where it is. */
function textOf(within: HTMLElement): { text: string; at: { node: Text; from: number }[] } {
  const walker = document.createTreeWalker(within, NodeFilter.SHOW_TEXT, { acceptNode: (node) => (node.parentElement?.closest('[contenteditable="false"], .tiptap-token-hint') && !node.parentElement.closest('p, h1, h2, h3, li') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT) })
  const at: { node: Text; from: number }[] = []
  let text = ''
  for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
    if (!node.data.trim()) continue
    at.push({ node, from: text.length })
    text += `${node.data} `
  }
  return { text, at }
}


export async function readToMe(asked: string | HTMLElement | Promise<string | null>, place?: Element | null): Promise<boolean> {
  stopReading()
  // Until it starts (a picture's words still being read, then the language found, in main), Esc or reading something
  // else already stops it: no word is said.
  let called = false
  const callOff = (): void => {
    called = true
    if (stopping === callOff) stopping = null
    document.removeEventListener('keydown', escOff, true)
  }
  const escOff = (event: KeyboardEvent): void => {
    if (event.key !== 'Escape') return
    event.preventDefault()
    event.stopPropagation()
    callOff()
  }
  stopping = callOff
  document.addEventListener('keydown', escOff, true)
  const words = await asked
  const page = !words || typeof words === 'string' ? null : textOf(words)
  // Where the words are read from: once it is gone (another page opened, the reader closed), so is the voice.
  const from = !words || typeof words === 'string' ? (place ?? null) : words
  const text: string = page ? page.text : typeof words === 'string' ? words : ''
  const language = called || !text.trim() ? '' : await window.api.haligtree<string>('language', text.slice(0, 2000)).catch(() => 'en')
  const go = !called && !!text.trim()
  callOff()
  if (!go) return false
  const light = (index: number, length: number): void => {
    if (!page || typeof CSS === 'undefined' || !CSS.highlights) return
    const part = [...page.at].reverse().find((one) => one.from <= index)
    if (!part) return
    const start = index - part.from
    const end = Math.min(part.node.data.length, start + Math.max(1, length))
    if (start < 0 || start >= part.node.data.length) return
    const range = document.createRange()
    range.setStart(part.node, start)
    range.setEnd(part.node, end)
    CSS.highlights.set('read-aloud', new Highlight(range))
  }
  let timer: ReturnType<typeof setInterval> | undefined
  let watch: ReturnType<typeof setInterval> | undefined
  const end = (): void => {
    if (!stopping) return
    stopping = null
    clearInterval(timer)
    clearInterval(watch)
    window.removeEventListener('pagehide', end)
    document.removeEventListener('keydown', onKey, true)
    if (typeof CSS !== 'undefined' && CSS.highlights) CSS.highlights.delete('read-aloud')
    speechSynthesis.cancel()
    window.dispatchEvent(new CustomEvent('haligtree:reading', { detail: false }))
  }
  // Esc stops the voice first, before it does anything else.
  const onKey = (event: KeyboardEvent): void => {
    if (event.key !== 'Escape') return
    event.preventDefault()
    event.stopPropagation()
    end()
  }
  stopping = end
  document.addEventListener('keydown', onKey, true)
  window.dispatchEvent(new CustomEvent('haligtree:reading', { detail: true }))
  // No notice: the word being said is lit as it goes, which says it is reading; Esc stops it, and
  // every menu that offered "Read it to me" offers "Stop reading" while it reads.
  window.addEventListener('pagehide', end)
  if (from) watch = setInterval(() => !from.isConnected && end(), 300)
  said.push({ text, language })
  if (window.api.quiet) {
    // Nothing heard under test: each word lit in turn, as the voice's own marks would.
    const marks = [...text.matchAll(/\S+/g)]
    let i = 0
    timer = setInterval(() => (i < marks.length ? light(marks[i].index!, marks[i++][0].length) : end()), 120)
    return true
  }
  const utterance = new SpeechSynthesisUtterance(text)
  utterance.lang = language
  const voice = voiceFor(language.split('-')[0])
  if (voice) utterance.voice = voice
  utterance.onboundary = (event) => event.name === 'word' && light(event.charIndex, event.charLength || (text.slice(event.charIndex).match(/^\S+/)?.[0].length ?? 1))
  utterance.onend = end
  utterance.onerror = end
  speechSynthesis.speak(utterance)
  return true
}
