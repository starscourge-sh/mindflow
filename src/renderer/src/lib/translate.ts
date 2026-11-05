import { said } from '@/lib/host'
import { chime } from '@/lib/sound'
import { toast } from '@/components/haligtree/ui'

/**
 * Words put into your own language by the Mac (Apple's Translation, macOS 26;
 * main/understand.ts), shown in a notice with “Copy”: the same for a picture's
 * words and for words picked in a book. Offered only where needs.ts says the Mac can.
 */
export async function translateWords(text: string): Promise<void> {
  if (!text.trim()) return said('There are no words to translate', false)
  const done = await window.api.haligtree<{ text: string; from: string; to: string } | { error: string }>('translate', text)
  if ('error' in done) return said(done.error, false)
  const name = (code: string): string => new Intl.DisplayNames(['en'], { type: 'language' }).of(code) ?? code
  chime('open')
  toast(`In ${name(done.to)}, from ${name(done.from)}: ${done.text}`, undefined, 'info', {
    label: 'Copy',
    key: 'c',
    run: () => void navigator.clipboard.writeText(done.text).then(() => (chime('copy'), said('Copied the translation')))
  })
}
