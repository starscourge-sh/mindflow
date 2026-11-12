// A long note's Markdown copy (beside the backups) is only ever the one an editor writes: never a poorer one, however
// the app ends. A long note's copy follows its save after a rest (lib/same-words.ts), so the app can end with one
// still owed. In the sandbox, a note past 200,000 letters holding one of every kind of block the editor's own
// converter writes (a drawing, a graph, a contents block, an embedded note, a table, a picture, a task list, code,
// a callout, a quote, a link to a note, a card line) is edited and then:
//   the app is quit inside the rest: the copy on disk is, byte for byte, what an editor writes of the words saved;
//   the app is killed inside the rest (kill -9): the copy is still the last whole one, byte for byte, and after
//     the next launch the first editor on a page writes the owed one, byte for byte as the note's own would;
//   the window's page dies inside the rest and then the app quits: the same, never a poorer copy.
//
//   QA_ARGS=--sandbox QA_DATA=<a copy of the seeded sandbox> QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/copy-whole.mjs
import { existsSync, readdirSync, readFileSync } from 'fs'
import { join } from 'path'
import { DatabaseSync } from 'node:sqlite'
import { sandbox } from './sandbox-lib.mjs'
import { checks } from './harness.mjs'
process.env.QA_ARGS ??= '--sandbox'

const { check, done } = checks()
const ED = '.tiptap.ProseMirror.haligtree-editor:not(.is-line)'
const text = (words) => ({ type: 'text', text: words })
const para = (words) => ({ type: 'paragraph', content: [text(words)] })
const FIRST = 'Whole copy probe first line'
/** What each kind is called in the document, and what the editor's converter writes for it. */
const KINDS = {
  excalidraw: /\*\(drawing\)\*/, graph: /```graph/, tableOfContents: /\[TOC\]/, noteEmbed: /!\[\[/, table: /\| *Left/, image: /!\[A picture\]/,
  taskList: /- \[ \] Buy a kite/, codeBlock: /```js\nconst probe = 1/, callout: /> \[!/, blockquote: /> A quoted line/, noteLink: /\[\[/
}

let c, h, v, send, electron, folder
const wait = (ms) => h.waitForTimeout(ms)
async function launch() {
  c = await sandbox({ width: 1300, height: 900 })
  ;({ h, v, send, electron } = c)
  folder = await electron.evaluate(({ app }) => app.getPath('userData'))
  if (['haligtree', 'mindflow'].some((name) => folder.includes(`Application Support/${name}`))) throw new Error('never the real data folder')
}
/** The book as it is on disk now, read beside the running app or after it. */
const book = (sql, ...args) => {
  const db = new DatabaseSync(join(folder, 'haligtree.db'), { readOnly: true })
  try { return db.prepare(sql).all(...args) } finally { db.close() }
}
const kept = (id) => String(book('select body from captures where id = ?', id)[0]?.body ?? '')
const copyOf = (id) => {
  const dir = join(folder, 'backups', 'captures')
  const number = book('select number from captures where id = ?', id)[0].number
  const name = existsSync(dir) ? readdirSync(dir).find((one) => new RegExp(`^[A-Z]+-${number}\\.md$`).test(one)) : null
  return name ? readFileSync(join(dir, name), 'utf8') : ''
}
/** Where two copies part, for a failing line to say. */
const parts = (got, want) => {
  let at = 0
  while (at < got.length && at < want.length && got[at] === want[at]) at++
  return got === want ? 'the same' : `${got.length.toLocaleString()} letters against ${want.length.toLocaleString()}; they part at ${at}: got ${JSON.stringify(got.slice(Math.max(0, at - 30), at + 50))}, wanted ${JSON.stringify(want.slice(Math.max(0, at - 30), at + 50))}`
}
/** Open a note in the main window; with `at`, click the line holding those words and put the caret at its end. */
async function openNote(id, words, at) {
  await send('capture', id)
  await h.waitForFunction(([sel, words]) => [...document.querySelectorAll(sel)].some((one) => one.isConnected && one.editor && one.textContent.includes(words)), [ED, words], { timeout: 30000 })
  await wait(700)
  if (!at) return
  // A note opened again is put back where it was last left, a moment after its words show (it may scroll): so a
  // click on a line in view to take the keys, then ⌘↑ to the top of the note and ⌘→ to the end of its first line,
  // made again until the caret stands there.
  for (let tries = 0; tries < 6; tries++) {
    await wait(tries ? 900 : 1500)
    const spot = await h.evaluate(([sel, words]) => {
      const ed = [...document.querySelectorAll(sel)].find((one) => one.isConnected && one.editor && one.textContent.includes(words))
      const line = [...ed.querySelectorAll(':scope > p')].find((one) => { const box = one.getBoundingClientRect(); return one.textContent.trim().length > 3 && box.height && box.top >= 60 && box.bottom <= innerHeight - 10 })
      const box = line?.getBoundingClientRect()
      return box ? { x: box.left + 12, y: box.top + box.height / 2 } : null
    }, [ED, words])
    if (!spot) continue
    await h.mouse.click(spot.x, spot.y)
    await wait(250)
    if (await h.evaluate((sel) => document.querySelector(sel + '[data-vim-mode="normal"]') !== null, ED)) await h.keyboard.press('i')
    await h.keyboard.press('Meta+ArrowUp')
    await h.keyboard.press('Meta+ArrowRight')
    await wait(250)
    const placed = await h.evaluate(([sel, words]) => {
      const ed = [...document.querySelectorAll(sel)].find((one) => one.isConnected && one.editor && one.textContent.includes(words))
      const { $head, empty } = ed.editor.state.selection
      return empty && ed.editor.isFocused && $head.parent.textContent.startsWith(words) && $head.parentOffset === $head.parent.content.size
    }, [ED, words])
    if (placed) return
  }
  throw new Error(`the caret could not be put at the end of “${words}”`)
}
/** Type at the end of the long note's first line, and leave it time to save (well inside its 2 s rest). */
async function typeInFirst(words) {
  await h.keyboard.type(words, { delay: 30 })
  await wait(1000)
}
const gone = () => new Promise((ended) => electron.process().once('exit', ended))
const within = (ended, ms) => Promise.race([ended.then(() => 'exited'), new Promise((late) => setTimeout(() => late('still running'), ms))])

try {
  await launch()
  await v('settings:set', { sounds: false, hintRate: 0 })
  await v('onboarding:set', { pageHints: false })
  const target = await h.evaluate((body) => window.api.captures.create({ kind: 'note', body }), { type: 'doc', content: [para('Whole copy probe target note'), para('Its second line')] })
  const long = await h.evaluate((body) => window.api.captures.create({ kind: 'note', body }), {
    type: 'doc',
    content: [
      para(FIRST),
      { type: 'heading', attrs: { level: 2 }, content: [text('A heading for the contents')] },
      { type: 'tableOfContents' },
      { type: 'excalidraw', attrs: { scene: { elements: [], appState: {}, files: {} }, height: 300 } },
      { type: 'graph', attrs: { expressions: [{ id: 'one', text: 'y=x^2' }], sliders: {}, view: null, height: 320 } },
      { type: 'noteEmbed', attrs: { id: target, label: 'Whole copy probe target note' } },
      { type: 'table', content: [
        { type: 'tableRow', content: [{ type: 'tableHeader', content: [para('Left')] }, { type: 'tableHeader', content: [para('Right')] }] },
        { type: 'tableRow', content: [{ type: 'tableCell', content: [para('one')] }, { type: 'tableCell', content: [para('two')] }] }
      ] },
      { type: 'image', attrs: { src: 'haligtree://assets/whole-copy-probe.png', alt: 'A picture' } },
      { type: 'taskList', content: [{ type: 'taskItem', attrs: { checked: false }, content: [para('Buy a kite')] }] },
      { type: 'codeBlock', attrs: { language: 'js' }, content: [text('const probe = 1')] },
      { type: 'callout', attrs: { type: 'note', title: 'A callout' }, content: [para('Inside the callout')] },
      { type: 'blockquote', content: [para('A quoted line')] },
      { type: 'paragraph', content: [text('See '), { type: 'noteLink', attrs: { id: target, label: 'Whole copy probe target note' } }, text(' for more')] },
      para('Capital of Peru :: Lima'),
      ...Array.from({ length: 2600 }, (_, n) => para(`Filler line ${n} of the whole copy probe, with enough words on it to count as a line of a note.`))
    ]
  })
  console.log(`  (the long note: ${kept(long).length.toLocaleString()} letters as kept)`)

  // --- the copy an editor writes, after a rest: the one every later copy is held against
  await openNote(long, FIRST, true)
  const shown = await h.evaluate(([sel, first]) => {
    // The note's own editor: the embedded note in it has an editor of its own, with its own few lines.
    const ed = [...document.querySelectorAll(sel)].find((one) => one.isConnected && one.editor && one.textContent.includes(first))
    const kinds = new Set()
    ed.editor.state.doc.descendants((node) => void kinds.add(node.type.name))
    return [...kinds]
  }, [ED, FIRST])
  const missing = Object.keys(KINDS).filter((kind) => !shown.includes(kind))
  check('the note on the page holds one of every kind of block', missing.length === 0, `not there: ${missing.join(', ')}; there: ${shown.join(', ')}`)
  await typeInFirst(' marker-rest')
  check('typed: the words are in the book, their copy still to come', kept(long).includes(`${FIRST} marker-rest`) && !copyOf(long).includes('marker-rest'))
  await wait(2800)
  const rested = copyOf(long)
  const unwritten = Object.entries(KINDS).filter(([, written]) => !written.test(rested)).map(([kind]) => kind)
  check('after its rest the copy an editor writes holds every kind, and the card line', rested.includes(`${FIRST} marker-rest`) && unwritten.length === 0 && rested.includes('Capital of Peru :: Lima'), `not written: ${unwritten.join(', ') || 'none'}; ${rested.slice(0, 700).replace(/\n/g, '⏎')}`)

  // --- quit inside the rest
  await typeInFirst(' marker-quit')
  check('typed again: saved, its copy still to come', kept(long).includes('marker-rest marker-quit') && !copyOf(long).includes('marker-quit'))
  let ended = gone()
  let asked = Date.now()
  await electron.evaluate(({ app }) => setTimeout(() => app.quit(), 50))
  let how = await within(ended, 15_000)
  check('quit inside the rest: the app ends', how === 'exited', `${how} after ${Date.now() - asked} ms`)
  const afterQuit = rested.replace('marker-rest', 'marker-rest marker-quit')
  check('quit inside the rest: the copy on disk is, byte for byte, what an editor writes of the words saved', copyOf(long) === afterQuit, parts(copyOf(long), afterQuit))
  check('quit inside the rest: the words are in the book', kept(long).includes('marker-rest marker-quit'))
  await c.close()

  // --- killed inside the rest (kill -9), then the next launch
  await launch()
  check('launched again with nothing owed: the copy is as it was', copyOf(long) === afterQuit, parts(copyOf(long), afterQuit))
  await openNote(long, FIRST, true)
  await typeInFirst(' marker-kill')
  check('typed once more: saved, its copy still to come', kept(long).includes('marker-quit marker-kill') && !copyOf(long).includes('marker-kill'))
  ended = gone()
  electron.process().kill('SIGKILL')
  how = await within(ended, 10_000)
  check('killed inside the rest: the copy on disk is still the last whole one, byte for byte', how === 'exited' && copyOf(long) === afterQuit, parts(copyOf(long), afterQuit))
  await c.close()
  await launch()
  const afterKill = afterQuit.replace('marker-quit', 'marker-quit marker-kill')
  // Said, not checked: whether a window already holds an editor at launch (then the copy is written with no note opened).
  await wait(4000)
  console.log(`  (four seconds after the launch, no note opened: the owed copy is ${copyOf(long) === afterKill ? 'already written' : 'not written yet'})`)
  // A note that is not the long one: any editor on a page writes what is owed.
  await openNote(target, 'Whole copy probe target note')
  for (let waited = 0; waited < 8000 && copyOf(long) !== afterKill; waited += 250) await wait(250)
  check('the next launch: the first editor on a page writes the owed copy, byte for byte as the note’s own would', copyOf(long) === afterKill, parts(copyOf(long), afterKill))
  check('the words killed with the app are in the book', kept(long).includes('marker-quit marker-kill'))

  // --- the window's page dies inside the rest, then the app quits
  await openNote(long, FIRST, true)
  await typeInFirst(' marker-gone')
  check('typed a last time: saved, its copy still to come', kept(long).includes('marker-kill marker-gone') && !copyOf(long).includes('marker-gone'))
  await electron.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((win) => win.webContents.getURL().includes('view=home'))?.webContents.forcefullyCrashRenderer())
  await new Promise((later) => setTimeout(later, 400))
  ended = gone()
  asked = Date.now()
  await electron.evaluate(({ app }) => setTimeout(() => app.quit(), 50))
  how = await within(ended, 15_000)
  check('its page dead, the app still quits', how === 'exited', `${how} after ${Date.now() - asked} ms`)
  check('its page dead, then a quit: never a poorer copy, still the last whole one byte for byte', copyOf(long) === afterKill, parts(copyOf(long), afterKill))
  check('the words typed before its page died are in the book', kept(long).includes('marker-kill marker-gone'))
} catch (error) {
  check('the probe ran to its end', false, error?.stack ?? String(error))
} finally {
  await c?.close()
}
done()
