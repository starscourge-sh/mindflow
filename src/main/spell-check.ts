import { BrowserWindow, ipcMain, session } from 'electron'
import { learn, spell, type Spelt } from './glass'
import { named } from './stalls'

/**
 * Whether a word is misspelt and what it might be, asked of the Mac's own
 * spellchecker (NSSpellChecker, in the app's native module: native/glass.mm)
 * the way the red underline in every window is asked: the word with the text
 * round it, so the Mac judges the language from the sentence and a Spanish
 * word in a Spanish sentence is not "wrong". About a millisecond for a word
 * spelt right, about five with guesses to fetch. A page asks with an `invoke`
 * and carries on: nothing about spelling waits on the main process.
 *
 * It first asked Chromium (`webFrame.isWordMisspelled`), a call that holds
 * the window still until the main process answers: on every caret move, so a
 * main process busy for ten seconds froze the window for ten seconds. Then a
 * script interpreter kept running beside the app (osascript), asked a word at
 * a time with no sentence. Now the checker is asked in the app itself; nothing
 * is kept here (the checker is the one that knows what has been learnt since),
 * and nothing leaves the computer. Other systems check in the page (preload).
 */
const WORD = /^[\p{L}\p{M}'’]{1,60}$/u

function check(text: unknown, start: unknown, length: unknown): Spelt | null {
  if (typeof text !== 'string' || typeof start !== 'number' || typeof length !== 'number') return null
  if (text.length > 4096 || !Number.isInteger(start) || !Number.isInteger(length) || start < 0 || length < 1 || start + length > text.length) return null
  if (!WORD.test(text.slice(start, start + length))) return null
  return spell(text, start, length)
}

/** Every window forgets what it was told: a word learnt or unlearnt is judged afresh wherever it shows. */
const changed = (): void => {
  for (const win of BrowserWindow.getAllWindows()) if (!win.isDestroyed()) win.webContents.send('spelling:changed')
}

/**
 * “Learn spelling” and its Undo. Through Chromium's own list, which puts the word in the Mac's dictionary (every
 * app then knows it, as with the Mac's own “Learn Spelling”) and takes the underline off it in every window at
 * once. A test run writes nothing to the Mac's dictionary: there the word is only let by until the run ends.
 */
function learnt(word: unknown, on: unknown): boolean {
  if (typeof word !== 'string' || !WORD.test(word)) return false
  const done = process.env.HALIGTREE_QA_AWAY
    ? learn(word, on === false ? 'unignore' : 'ignore')
    : on === false
      ? session.defaultSession.removeWordFromSpellCheckerDictionary(word)
      : session.defaultSession.addWordToSpellCheckerDictionary(word)
  if (done) changed()
  return done
}

export function registerSpelling(): void {
  ipcMain.handle('spell:check', (_event, text: unknown, start: unknown, length: unknown) => check(text, start, length))
  ipcMain.handle('spell:learn', (_event, word: unknown, on: unknown) => learnt(word, on))
}

/**
 * The checker's first answer is its slow one (it wakes the Mac's spelling service): had once the app has started and
 * nothing waits, so the first word the caret rests on is answered as fast as the rest.
 */
export const wakeSpelling = (): void => void named('spell:wake', () => spell())
