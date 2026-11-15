import { said } from '@/lib/host'
import { chime } from '@/lib/sound'
import { capsNow, meets } from '@/lib/needs'
import { toast } from '@/components/haligtree/ui'

/**
 * Words put into your own language by the Mac (Apple's Translation, macOS 26; main/understand.ts), shown in a
 * notice with “Copy”: the same for a picture's words and for words picked in a book. Offered only where it can
 * help: the Mac is sure the words are in another language than yours (two words or more; a name or a single
 * romanised word is for “Look up”). Asked as words are picked or a picture is pointed at, so a menu built the
 * moment after already knows. A language not yet on this Mac is fetched once through Apple's own prompt.
 */

const name = (code: string): string => new Intl.DisplayNames(['en'], { type: 'language' }).of(code) ?? code
const known = new Map<string, boolean>()

/** Whether these words are worth translating; false until asked (warm() asks). */
export const translatable = (text: string): boolean => meets(capsNow(), 'macos26') && known.get(text.trim()) === true

/** Ask the Mac about these words now, so a menu built a moment later can say. */
export function warm(text: string): void {
  const words = text.trim()
  if (!words || known.has(words) || !meets(capsNow(), 'macos26')) return
  known.set(words, false)
  void window.api.haligtree<{ offer: boolean }>('translatable', words).then((one) => known.set(words, one.offer), () => undefined)
}

// Words picked anywhere: asked once the pick rests.
if (typeof document !== 'undefined' && typeof window !== 'undefined' && window.api) {
  let timer = 0
  document.addEventListener('selectionchange', () => {
    window.clearTimeout(timer)
    // A caret is no pick: its words are not read (reading them had the page laid out at each move of the caret).
    const selection = getSelection()
    if (!selection?.rangeCount || selection.getRangeAt(0).collapsed) return
    timer = window.setTimeout(() => warm(getSelection()?.toString() ?? ''), 120)
  })
}

export async function translateWords(text: string): Promise<void> {
  if (!text.trim()) return toast('There are no words to translate', undefined, 'info')
  const done = await window.api.haligtree<{ text: string; from: string; to: string } | { error: string } | { needs: string; to: string }>('translate', text)
  if ('needs' in done) {
    // Not a failure: a language this Mac has not fetched yet. One button opens Apple's own prompt, then it translates.
    const language = name(done.needs)
    return toast(`Translating from ${language} needs Apple's ${language} language, downloaded once.`, undefined, 'info', {
      label: `Get ${language}`,
      key: 'g',
      run: () => void window.api.haligtree<{ prepared: boolean; why?: string }>('translate:prepare', done.needs).then((ready) => {
        if (ready.prepared) return void translateWords(text)
        if (ready.why === 'closed') return
        // Apple's prompt could not open here: the place languages are kept, one click away.
        toast(`${language} can be added in Language & Region, Translation Languages`, undefined, 'info', { label: 'Open it', key: 'o', run: () => void window.api.haligtree('translate:settings') })
      })
    })
  }
  // Only a translation that went wrong is a failure; "already in English" or a pair Apple cannot do is news.
  if ('error' in done) return /^It could not be translated/.test(done.error) ? said(done.error, false) : toast(done.error, undefined, 'info')
  chime('open')
  toast(`In ${name(done.to)}, from ${name(done.from)}: ${done.text}`, undefined, 'info', {
    label: 'Copy',
    key: 'c',
    run: () => void navigator.clipboard.writeText(done.text).then(() => said('Copied the translation'))
  })
}
