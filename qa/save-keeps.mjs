// What a save still guarantees, with an editor's real typing. Since 12 Nov an editor hands main its words as they
// are kept (bytes), and what is worked out of them comes after the save has answered (src/main/captures.ts
// `saveOne`, kept-words.ts). So, in the sandbox:
//   two editors on one note: words written elsewhere while yours wait to be saved are never written over, and
//     yours are folded in (both end in the note, and in the editor);
//   a "question :: answer" line typed makes its review card, and taking the line out takes the card out;
//   #bit typed in makes the note private, once: taken off by hand, it stays off;
//   a page of Writing keeps the same through its own save (item:save);
//   the Markdown copy beside the backups: an ordinary note's is there with its save; a long note's follows once
//     the note has rested, at once when the note is left, and a quit writes it too.
//
//   QA_ARGS=--sandbox QA_DATA=<a copy of the seeded sandbox> QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/save-keeps.mjs
import { existsSync, readdirSync, readFileSync } from 'fs'
import { join } from 'path'
import { DatabaseSync } from 'node:sqlite'
import { sandbox } from './sandbox-lib.mjs'
import { checks } from './harness.mjs'
process.env.QA_ARGS ??= '--sandbox'

const { check, done } = checks()
const ED = '.tiptap.ProseMirror.haligtree-editor:not(.is-line):not(.is-plain)'
const c = await sandbox({ width: 1300, height: 900 })
const { h, v, send, electron } = c
const wait = (ms) => h.waitForTimeout(ms)
const doc = (...lines) => ({ type: 'doc', content: lines.map((text) => ({ type: 'paragraph', content: [{ type: 'text', text }] })) })
const folder = await electron.evaluate(({ app }) => app.getPath('userData'))
if (['haligtree', 'mindflow'].some((name) => folder.includes(`Application Support/${name}`))) throw new Error('never the real data folder')
/** The book as it is on disk now, read beside the running app. */
const book = (sql, ...args) => {
  const db = new DatabaseSync(join(folder, 'haligtree.db'), { readOnly: true })
  try { return db.prepare(sql).all(...args) } finally { db.close() }
}
const kept = (id, table = 'captures') => String(book(`select body from ${table} where id = ?`, id)[0]?.body ?? '')
const cards = (id, from = 'capture') => book("select prompt, body from nuggets where tier = 'card' and line_of = ? and archived_at is null", `${from}:${id}`)
/**
 * Open a note (or, with `type` 'article', a page of Writing) in the main window and put the caret in it as a
 * person would: a click on its last line, then ⌘↓ (the end of the note); or, with `first`, a click on its first
 * line, then ⌘→ (the end of that line).
 */
async function openAtEnd(id, words, first = false, type = 'capture') {
  await send(type, id)
  await h.waitForFunction(([sel, words]) => [...document.querySelectorAll(sel)].some((one) => one.isConnected && one.editor && one.textContent.includes(words)), [ED, words], { timeout: 20000 })
  await wait(600)
  const spot = await h.evaluate(([sel, words, first]) => {
    const ed = [...document.querySelectorAll(sel)].find((one) => one.isConnected && one.editor && one.textContent.includes(words))
    const lines = [...ed.querySelectorAll('p')]
    const box = (first ? lines.find((one) => one.textContent.includes(words)) : lines.at(-1)).getBoundingClientRect()
    return { x: box.left + 12, y: box.top + box.height / 2 }
  }, [ED, words, first])
  await h.mouse.click(spot.x, spot.y)
  await wait(250)
  if (await h.evaluate((sel) => document.querySelector(sel + '[data-vim-mode="normal"]') !== null, ED)) await h.keyboard.press('i')
  await h.keyboard.press(first ? 'Meta+ArrowRight' : 'Meta+ArrowDown')
}
const shown = (words) => h.evaluate(([sel, words]) => [...document.querySelectorAll(sel)].some((one) => one.isConnected && one.editor && one.textContent.includes(words)), [ED, words])

try {
  await v('settings:set', { sounds: false, hintRate: 0 })
  await v('onboarding:set', { pageHints: false })

  // --- two editors on one note
  const id = await h.evaluate((body) => window.api.captures.create({ kind: 'note', body }), doc('Keeps probe first line', 'Keeps probe last line'))
  await openAtEnd(id, 'Keeps probe last line')
  await h.keyboard.type(' typed-once', { delay: 30 })
  await wait(1600)
  check('typed words are in the book once the note has rested', kept(id).includes('Keeps probe last line typed-once'), kept(id).slice(-160))
  // Typed, and before that is saved, the first line is rewritten elsewhere (another window, a merge).
  const theirs = JSON.parse(kept(id))
  theirs.content[0].content[0].text = 'Keeps probe first line written-elsewhere'
  await h.keyboard.type(' mine-words', { delay: 30 })
  const answer = await h.evaluate(([id, body]) => window.api.captures.save(id, { body }), [id, theirs])
  check('the write from elsewhere landed while the typing waited', !answer?.conflict && kept(id).includes('written-elsewhere') && !kept(id).includes('mine-words'))
  await wait(2200)
  const both = kept(id)
  check('two editors on one note: the words written elsewhere are still there', both.includes('Keeps probe first line written-elsewhere'), both.slice(0, 200))
  check('two editors on one note: the words typed here were folded in, not lost', both.includes('typed-once mine-words'), both.slice(-200))
  check('the editor shows both', (await shown('written-elsewhere')) && (await shown('mine-words')))
  const versions = book('select count(*) as n from versions where item_id = ?', id)[0].n
  console.log(`  (versions kept of it: ${versions})`)
  // The words each of those saves gained are counted (the word log is handed them as they are kept, as bytes).
  const counted = await v('words:note', id)
  check('the words those saves gained are counted for the note: three, one for each', counted.words === 3, JSON.stringify(counted))

  // --- a card written on a line, then taken out
  await h.keyboard.press('Meta+ArrowDown')
  await h.keyboard.press('Enter')
  await h.keyboard.type('What carries oxygen :: Haemoglobin', { delay: 20 })
  await wait(2000)
  check('a "question :: answer" line typed makes its card', cards(id).length === 1 && cards(id)[0].prompt === 'What carries oxygen' && cards(id)[0].body === '"Haemoglobin"', JSON.stringify(cards(id)))
  await h.keyboard.type(' in red cells', { delay: 20 })
  await wait(2000)
  check('the line edited keeps one card, with the new answer', cards(id).length === 1 && cards(id)[0].body === '"Haemoglobin in red cells"', JSON.stringify(cards(id)))
  // The line is picked to its start and taken out, with the empty line it leaves.
  await h.keyboard.press('Shift+Meta+ArrowLeft')
  await h.keyboard.press('Backspace')
  await h.keyboard.press('Backspace')
  await wait(2000)
  check('the line taken out takes its card out', cards(id).length === 0 && !kept(id).includes('Haemoglobin'), JSON.stringify(cards(id)))

  // --- #bit makes it private, once
  const secret = () => book('select private from captures where id = ?', id)[0].private
  check('before #bit the note is not private', secret() === 0)
  await h.keyboard.press('Meta+ArrowDown')
  await h.keyboard.type(' #bit', { delay: 30 })
  await wait(1600)
  check('#bit typed in makes the note private', secret() === 1 && kept(id).includes('#bit'), String(secret()))
  await v('private', 'captures', id, false)
  await h.keyboard.type(' and more', { delay: 30 })
  await wait(1600)
  check('taken off by hand, it stays off through the next save', secret() === 0 && kept(id).includes('#bit and more'), String(secret()))

  // --- a page of Writing keeps the same, through its own save (item:save)
  const page = await v('article:new')
  await v('item:save', page, { title: 'Keeps probe page', body: doc('Page probe first line', 'Page probe last line') })
  await openAtEnd(page, 'Page probe last line', false, 'article')
  await h.keyboard.type(' page-typed', { delay: 30 })
  await wait(1600)
  check("a page: typed words are in the book once it has rested", kept(page, 'nuggets').includes('Page probe last line page-typed'), kept(page, 'nuggets').slice(-140))
  const pageTheirs = JSON.parse(kept(page, 'nuggets'))
  pageTheirs.content[0].content[0].text = 'Page probe first line page-elsewhere'
  await h.keyboard.type(' page-mine', { delay: 30 })
  const pageAnswer = await v('item:save', page, { body: pageTheirs })
  check('a page: the write from elsewhere landed while the typing waited', pageAnswer === true && kept(page, 'nuggets').includes('page-elsewhere') && !kept(page, 'nuggets').includes('page-mine'), JSON.stringify(pageAnswer))
  await wait(2200)
  check('a page, two editors: the words written elsewhere and the words typed here are both there', kept(page, 'nuggets').includes('first line page-elsewhere') && kept(page, 'nuggets').includes('page-typed page-mine'), kept(page, 'nuggets').slice(-200))
  await h.keyboard.press('Meta+ArrowDown')
  await h.keyboard.press('Enter')
  await h.keyboard.type('Largest planet :: Jupiter', { delay: 20 })
  await wait(2000)
  check('a page: a "question :: answer" line typed makes its card', cards(page, 'nugget').length === 1 && cards(page, 'nugget')[0].prompt === 'Largest planet', JSON.stringify(cards(page, 'nugget')))
  await h.keyboard.press('Shift+Meta+ArrowLeft')
  await h.keyboard.press('Backspace')
  await h.keyboard.press('Backspace')
  await wait(2000)
  check('a page: the line taken out takes its card out', cards(page, 'nugget').length === 0, JSON.stringify(cards(page, 'nugget')))
  const pageSecret = () => book('select private from nuggets where id = ?', page)[0].private
  await h.keyboard.press('Meta+ArrowDown')
  await h.keyboard.type(' #bit', { delay: 30 })
  await wait(1600)
  check('a page: #bit typed in makes it private', pageSecret() === 1 && kept(page, 'nuggets').includes('#bit'), String(pageSecret()))
  await v('item:save', page, { prompt: 'What does the probe keep?' })
  check('a page: a save of its question alone keeps the question and the words', (await v('item', page)).prompt === 'What does the probe keep?' && kept(page, 'nuggets').includes('page-typed page-mine'))

  // --- the notes related by tag follow a save: a saved note's tags are read after it, by the reading thread
  const tagged = await h.evaluate((body) => window.api.captures.create({ kind: 'note', body }), doc('Related probe first note #relprobe'))
  const plainOne = await h.evaluate((body) => window.api.captures.create({ kind: 'note', body }), doc('Related probe second note', 'Related probe last line'))
  const relatedTo = async (one) => (await v('related', one)).map((row) => row.id)
  check('before its tag is typed, a note is not related to the one that carries it', !(await relatedTo(tagged)).includes(plainOne))
  await openAtEnd(plainOne, 'Related probe last line')
  await h.keyboard.type(' #relprobe', { delay: 30 })
  await wait(1600)
  check('a tag typed into a note makes it related to the note that carries it, both ways, once saved', kept(plainOne).includes('#relprobe') && (await relatedTo(tagged)).includes(plainOne) && (await relatedTo(plainOne)).includes(tagged), kept(plainOne).slice(-120))
  await h.evaluate(([id, body]) => window.api.captures.save(id, { body }), [plainOne, doc('Related probe second note', 'Related probe last line, its tag taken out')])
  check('the tag taken out again, it no longer is', !(await relatedTo(tagged)).includes(plainOne) && !(await relatedTo(plainOne)).includes(tagged))

  // --- the Markdown copy: after a rest, and at a quit
  const copies = join(folder, 'backups', 'captures')
  const copyOf = (id) => {
    const number = book('select number from captures where id = ?', id)[0].number
    const name = existsSync(copies) ? readdirSync(copies).find((one) => new RegExp(`^[A-Z]+-${number}\\.md$`).test(one)) : null
    return name ? readFileSync(join(copies, name), 'utf8') : ''
  }
  // An ordinary note: its copy is there with its save.
  const other = await h.evaluate((body) => window.api.captures.create({ kind: 'note', body }), doc('Copy probe first line', 'Copy probe last line'))
  await openAtEnd(other, 'Copy probe last line')
  await h.keyboard.type(' marker-small', { delay: 30 })
  await wait(1100)
  check("an ordinary note's Markdown copy is there with its save", kept(other).includes('marker-small') && copyOf(other).includes('Copy probe last line marker-small'), JSON.stringify(copyOf(other).slice(0, 160)))
  // A long note (past 200,000 letters as kept): its copy is made apart from its saves.
  const long = await h.evaluate((body) => window.api.captures.create({ kind: 'note', body }),
    doc('Long copy probe first line', ...Array.from({ length: 2600 }, (_, n) => `Filler line ${n} of the long copy probe, with enough words on it to count as a line of a note.`)))
  console.log(`  (the long note: ${kept(long).length.toLocaleString()} letters as kept)`)
  await openAtEnd(long, 'Long copy probe first line', true)
  await h.keyboard.type(' marker-one', { delay: 30 })
  await wait(1100)
  check("a long note's words are in the book before their Markdown copy is", kept(long).includes('first line marker-one') && !copyOf(long).includes('marker-one'), JSON.stringify(copyOf(long).slice(0, 120)))
  await wait(2600)
  check('its Markdown copy follows once the note has rested', copyOf(long).includes('Long copy probe first line marker-one'), JSON.stringify(copyOf(long).slice(0, 160)))
  // Typed, then left before it has rested: the copy is made as the note is left.
  await h.keyboard.type(' marker-two', { delay: 30 })
  await wait(1100)
  check('typed again: saved, its copy still to come', kept(long).includes('marker-two') && !copyOf(long).includes('marker-two'))
  await openAtEnd(other, 'Copy probe last line')
  await wait(600)
  check('left before it rested: its copy is made as the note is left', copyOf(long).includes('marker-one marker-two'), JSON.stringify(copyOf(long).slice(0, 160)))
  // Typed, then the app quit before it has rested: the copy is written on the way out.
  await openAtEnd(long, 'Long copy probe first line', true)
  await h.keyboard.type(' marker-three', { delay: 30 })
  await wait(1100)
  check('typed once more: saved, its copy still to come', kept(long).includes('marker-three') && !copyOf(long).includes('marker-three'))
  const gone = new Promise((ended) => electron.process().once('exit', ended))
  await electron.evaluate(({ app }) => setTimeout(() => app.quit(), 50))
  const how = await Promise.race([gone.then(() => 'exited'), new Promise((ended) => setTimeout(() => ended('still running'), 10_000))])
  check('quit: the app ends', how === 'exited', how)
  check('quit: the Markdown copy holds the last words saved', copyOf(long).includes('marker-three'), JSON.stringify(copyOf(long).slice(0, 200)))
  // Wherever on the line the caret was put back to as the note reopened: every word typed is there.
  check('quit: the last words are in the book, with all typed before them', ['marker-one', 'marker-two', 'marker-three'].every((one) => kept(long).includes(one)), JSON.stringify(kept(long).slice(160, 330)))
} catch (error) {
  check('the probe ran to its end', false, error?.stack ?? String(error))
} finally {
  await c.close()
}
done()
