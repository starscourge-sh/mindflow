import { spawn, type ChildProcessWithoutNullStreams } from 'child_process'
import { ipcMain } from 'electron'

/**
 * Whether a word is misspelt and what it might be, asked of the Mac's own
 * NSSpellChecker (the checker that draws the underline in every window)
 * through osascript's JavaScript bridge. One helper, started at the first
 * question and kept: a word a line in, an answer a line out, in order, a
 * millisecond or so each. A page asks with an `invoke` and carries on.
 *
 * It used to ask Chromium (`webFrame.isWordMisspelled`), a call that holds
 * the window still until the main process answers: on every caret move, so
 * a main process busy for ten seconds froze the window for ten seconds (an
 * 18.5 s freeze in the logs stood in exactly that call). Nothing a page asks
 * about spelling waits on anything now. Kept per word; nothing leaves the
 * computer. Other systems check in the page itself (preload `spelling`).
 */
const SCRIPT = `ObjC.import('AppKit')
function run() {
  const checker = $.NSSpellChecker.sharedSpellChecker
  const input = $.NSFileHandle.fileHandleWithStandardInput
  const output = $.NSFileHandle.fileHandleWithStandardOutput
  let rest = ''
  for (;;) {
    // Waits here for the next words; nothing more to read means the app has gone.
    const data = input.availableData
    if (data.length == 0) return
    rest += $.NSString.alloc.initWithDataEncoding(data, $.NSUTF8StringEncoding).js
    let at
    while ((at = rest.indexOf('\\n')) >= 0) {
      const word = rest.slice(0, at)
      rest = rest.slice(at + 1)
      // Spelt right as far as the Mac is concerned (in its own language): null, never its guesses, which it gives
      // even for a good word ("feeding" for "feeling"). (!=: the bridge hands the range's length back wrapped.)
      let guesses = null
      if (checker.checkSpellingOfStringStartingAtLanguageWrapInSpellDocumentWithTagWordCount($(word), 0, checker.language, false, 0, null).length != 0) {
        const found = checker.guessesForWordRangeInStringLanguageInSpellDocumentWithTag($.NSMakeRange(0, word.length), $(word), $(), 0)
        guesses = []
        for (let i = 0; i < Math.min(5, found.count); i++) guesses.push(ObjC.unwrap(found.objectAtIndex(i)))
      }
      output.writeData($(JSON.stringify({ guesses }) + '\\n').dataUsingEncoding($.NSUTF8StringEncoding))
    }
  }
}`

/** null: spelt right, nothing to offer; a list (maybe empty): misspelt, and the Mac's guesses. */
type Guesses = string[] | null
const known = new Map<string, Promise<Guesses>>()
/** Asked and not yet answered, in the order asked. */
const waiting: { word: string; answer: (guesses: Guesses) => void }[] = []
let helper: ChildProcessWithoutNullStreams | null = null
/** A helper that has not answered in this long is stopped (the next question starts another), as the one-off ask was before. */
const PATIENCE = 2000
let patience: ReturnType<typeof setTimeout> | undefined
const watch = (): void => {
  clearTimeout(patience)
  if (waiting.length) patience = setTimeout(() => helper?.kill(), PATIENCE)
}

function start(): ChildProcessWithoutNullStreams {
  const one = spawn('osascript', ['-l', 'JavaScript', '-e', SCRIPT], { stdio: ['pipe', 'pipe', 'pipe'] })
  let rest = ''
  one.stdout.setEncoding('utf8')
  one.stdout.on('data', (chunk: string) => {
    rest += chunk
    let at: number
    while ((at = rest.indexOf('\n')) >= 0) {
      const line = rest.slice(0, at)
      rest = rest.slice(at + 1)
      let guesses: Guesses = null
      try {
        guesses = (JSON.parse(line) as { guesses: Guesses }).guesses
      } catch {
        // A line that is not an answer: nothing to offer for this word.
      }
      waiting.shift()?.answer(guesses)
    }
    watch()
  })
  one.stderr.resume()
  // Stopped with words still asked: each is answered "nothing to offer" and forgotten, so it is asked again another time.
  const gone = (): void => {
    if (helper === one) helper = null
    for (const { word, answer } of waiting.splice(0)) (known.delete(word), answer(null))
    watch()
  }
  one.on('exit', gone)
  one.on('error', gone)
  one.stdin.on('error', () => undefined)
  return one
}

export function registerSpellGuesses(): void {
  ipcMain.handle('spell:guesses', (_event, word: unknown) => {
    if (process.platform !== 'darwin' || typeof word !== 'string' || !/^[\p{L}\p{M}'’]{2,40}$/u.test(word)) return null
    let found = known.get(word)
    if (!found) {
      found = new Promise((answer) => {
        waiting.push({ word, answer })
        ;(helper ??= start()).stdin.write(`${word}\n`)
        if (waiting.length === 1) watch()
      })
      known.set(word, found)
    }
    return found
  })
}
