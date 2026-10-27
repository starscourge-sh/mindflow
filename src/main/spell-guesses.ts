import { execFile } from 'child_process'
import { ipcMain } from 'electron'

/**
 * The Mac's own spelling guesses for a word, asked of NSSpellChecker (the checker that draws the underline in
 * every window) through osascript's JavaScript bridge: the page's own checker knows only the commonest slips, so
 * "everthing" came with nothing. Asked only about a word the Mac itself calls misspelt: it guesses even for
 * a good one ("feeding" for "feeling"). Kept per word; nothing leaves the computer. Other systems: none.
 */
const SCRIPT = `ObjC.import('AppKit')
function run(argv) {
  const word = argv[0]
  const checker = $.NSSpellChecker.sharedSpellChecker
  // Spelt right as far as the Mac is concerned (in its own language): no guesses, which it gives even for a good word.
  // (==: the bridge hands the range's length back wrapped, never strictly 0.)
  if (checker.checkSpellingOfStringStartingAtLanguageWrapInSpellDocumentWithTagWordCount($(word), 0, checker.language, false, 0, null).length == 0) return 'SPELT-RIGHT'
  const guesses = $.NSSpellChecker.sharedSpellChecker.guessesForWordRangeInStringLanguageInSpellDocumentWithTag($.NSMakeRange(0, word.length), $(word), $(), 0)
  const out = []
  for (let i = 0; i < Math.min(5, guesses.count); i++) out.push(ObjC.unwrap(guesses.objectAtIndex(i)))
  return out.join('\\n')
}`
const known = new Map<string, Promise<string[] | null>>()
export function registerSpellGuesses(): void {
  ipcMain.handle('spell:guesses', (_event, word: unknown) => {
    if (process.platform !== 'darwin' || typeof word !== 'string' || !/^[\p{L}\p{M}'’]{2,40}$/u.test(word)) return []
    let found = known.get(word)
    if (!found) {
      // null: spelt right, nothing to offer; a list (maybe empty): misspelt, and the Mac's guesses.
      found = new Promise((done) => execFile('osascript', ['-l', 'JavaScript', '-e', SCRIPT, word], { timeout: 2000 }, (error, out) => done(error ? [] : out.trim() === 'SPELT-RIGHT' ? null : out.split('\n').map((one) => one.trim()).filter(Boolean))))
      known.set(word, found)
    }
    return found
  })
}
