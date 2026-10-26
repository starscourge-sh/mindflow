import { execFile } from 'child_process'
import { ipcMain } from 'electron'

/**
 * The Mac's own spelling guesses for a word, asked of NSSpellChecker (the checker that draws the underline in
 * every window) through osascript's JavaScript bridge: the page's own checker knows only the commonest slips, so
 * "everthing" or "pursonally" came with nothing. Kept per word; nothing leaves the computer. Other systems: none.
 */
const SCRIPT = `ObjC.import('AppKit')
function run(argv) {
  const word = argv[0]
  const guesses = $.NSSpellChecker.sharedSpellChecker.guessesForWordRangeInStringLanguageInSpellDocumentWithTag($.NSMakeRange(0, word.length), $(word), $(), 0)
  const out = []
  for (let i = 0; i < Math.min(5, guesses.count); i++) out.push(ObjC.unwrap(guesses.objectAtIndex(i)))
  return out.join('\\n')
}`
const known = new Map<string, Promise<string[]>>()
export function registerSpellGuesses(): void {
  ipcMain.handle('spell:guesses', (_event, word: unknown) => {
    if (process.platform !== 'darwin' || typeof word !== 'string' || !/^[\p{L}\p{M}'’]{2,40}$/u.test(word)) return []
    let found = known.get(word)
    if (!found) {
      found = new Promise((done) => execFile('osascript', ['-l', 'JavaScript', '-e', SCRIPT, word], { timeout: 2000 }, (error, out) => done(error ? [] : out.split('\n').map((one) => one.trim()).filter(Boolean))))
      known.set(word, found)
    }
    return found
  })
}
