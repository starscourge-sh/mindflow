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
