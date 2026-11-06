import { Notification } from 'electron'
import servicesFile from '../../resources/services.node?asset&asarUnpack'
import { captureSent, setting } from './captures'
import { plural } from './dates'

/**
 * "Send to Haligtree" in every app's Services menu (native/services.mm; the menu
 * line itself is declared in electron-builder.yml): words picked anywhere land in
 * the Inbox as a quote, saying the app and page they came from, with nothing
 * copied, and a notification says so (heard only with Sounds on). Every Mac; listed by macOS once the
 * app is in /Applications.
 */
type Sent = { text?: string; app?: string; url?: string; title?: string; files?: string }
let send: ((text: string, url?: string) => void) | null = null
/** What files picked in Finder become (index.ts: pictures, PDFs and audio into Media, Markdown a note): what it says of them. */
let takeFiles: (paths: string[]) => Promise<{ words: number; said: string }> = async () => ({ words: 0, said: '' })
export const whenFilesSent = (take: typeof takeFiles): void => void (takeFiles = take)

export function registerServices(): void {
  if (process.platform !== 'darwin') return
  try {
    const module = { exports: {} as { listen?: (told: (sent: Sent) => void) => void; send?: typeof send } }
    process.dlopen(module, servicesFile)
    module.exports.listen?.((sent) => {
      if (sent.files) {
        void takeFiles(sent.files.split('\n').filter(Boolean)).then(({ words, said }) => {
          if ((!words && !said) || process.env.HALIGTREE_QA_AWAY) return
          const sounds = setting('sounds', true)
          new Notification({ title: said ? 'From Finder' : 'In your Inbox', body: said || (words === 1 ? 'A file from Finder' : `${plural(words, 'file')} from Finder`), silent: !sounds }).show()
        })
        return
      }
      // Under test nothing shows on the screen.
      if (!sent.text || !captureSent(sent.text, sent) || process.env.HALIGTREE_QA_AWAY) return
      const words = sent.text.replace(/\s+/g, ' ').trim()
      const sounds = setting('sounds', true)
      new Notification({ title: 'In your Inbox', body: `${words.length > 90 ? `${words.slice(0, 89)}…` : words}${sent.app ? `\nFrom ${sent.app}` : ''}`, silent: !sounds }).show()
    })
    send = module.exports.send ?? null
    // A probe sends words through the same path, as macOS would.
    if (process.env.HALIGTREE_QA_AWAY) Object.assign(globalThis, { servicesSend: send, servicesSendFiles: (module.exports as { sendFiles?: (paths: string) => void }).sendFiles })
  } catch {
    // No Services line: the rest of the app is unchanged.
  }
}
