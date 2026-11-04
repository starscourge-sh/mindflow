import { host, said } from '@/lib/host'
import { chime } from '@/lib/sound'

/** A stored picture, the kind the Mac can read the words in. */
export const readable = (src: string | null | undefined): boolean => !!src && /^(haligtree|mindflow):\/\/assets\/[a-f0-9]{64}\.(png|jpe?g|webp|gif|heic|tiff?|bmp)$/i.test(src) && !!(host().imageText ?? window.api?.imageText)

/** "Copy text from image": the words in the picture, read by the Mac (Apple's Vision), on the clipboard as plain lines. */
export async function copyImageText(src: string): Promise<void> {
  const read = host().imageText ?? window.api?.imageText
  const text = read ? await read(src).catch(() => null) : null
  if (text === null) return void said('Could not read the picture', false)
  if (!text.trim()) return void said('No words in this picture', false)
  await navigator.clipboard.writeText(text).then(
    () => {
      const lines = text.split('\n').length
      chime('copy')
      said(lines === 1 ? 'Copied the words in the picture' : `Copied ${lines} lines from the picture`)
    },
    () => said('Could not copy it', false)
  )
}
