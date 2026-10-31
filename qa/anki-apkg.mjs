// An Anki deck package (.apkg) comes in whole through File's "Import files": a basic card, both sides of a
// "Basic (and reversed)" note, a cloze note as one card per blank, a picture kept in the book with its link
// fixed, a deck and a nested tag as #tags, past reviews replayed so the card keeps its schedule, and a
// notice that counts them, dropped on the window; importing it again from File adds nothing twice. Built here: sqlite + media + zip.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox node qa/anki-apkg.mjs
import { writeFileSync, readFileSync, mkdtempSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { DatabaseSync } from 'node:sqlite'
import { zipSync } from 'fflate'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'
const { check, done } = checks()

// --- the fixture: Anki's older collection layout, which every Anki can export
const dir = mkdtempSync(join(tmpdir(), 'apkg-'))
const sqlite = join(dir, 'collection.anki2')
const anki = new DatabaseSync(sqlite)
anki.exec(`create table col (id integer primary key, models text, decks text);
  create table notes (id integer primary key, mid integer, tags text, flds text);
  create table cards (id integer primary key, nid integer, did integer, ord integer);
  create table revlog (id integer primary key, cid integer, ease integer, ivl integer, time integer, type integer);`)
anki.prepare('insert into col values (1, ?, ?)').run(
  JSON.stringify({ 10: { name: 'Basic', type: 0 }, 11: { name: 'Basic (and reversed card)', type: 0 }, 12: { name: 'Cloze', type: 1 } }),
  JSON.stringify({ 1: { name: 'Default' }, 2: { name: 'Biology::Cells' } }))
const day = 86400000
const t0 = Date.now() - 30 * day
const notes = [
  [t0, 10, ' science::biology::cells ', 'What powers the cell?<br><img src="mito.png">', 'The mitochondrion'],
  [t0 + 1, 11, ' vocab ', 'chat', 'cat'],
  [t0 + 2, 12, '', 'The {{c1::nucleus}} holds the {{c2::DNA}}', 'Extra words'],
  [t0 + 3, 10, '', 'Hear it [sound:bell.mp3]', 'A bell'],
  [t0 + 4, 10, '', 'Name this part<div><img src="mito.png"></div>', 'Mitochondrion']
]
for (const [id, mid, tags, ...fields] of notes) anki.prepare('insert into notes values (?, ?, ?, ?)').run(id, mid, tags, fields.join('\x1f'))
const cards = [[100, t0, 2, 0], [101, t0 + 1, 1, 0], [102, t0 + 1, 1, 1], [103, t0 + 2, 1, 0], [104, t0 + 2, 1, 1], [105, t0 + 3, 1, 0], [106, t0 + 4, 1, 0]]
for (const card of cards) anki.prepare('insert into cards values (?, ?, ?, ?)').run(...card)
// Card 100 was learnt a month ago and remembered three times since.
for (const [at, ease] of [[t0, 3], [t0 + 1 * day, 3], [t0 + 5 * day, 3], [t0 + 20 * day, 4]]) anki.prepare('insert into revlog values (?, 100, ?, 1, 4000, 1)').run(at, ease)
anki.close()
// A 1x1 PNG and a few bytes of "sound".
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')
const file = join(dir, 'Biology.apkg')
writeFileSync(file, zipSync({ 'collection.anki2': readFileSync(sqlite), media: Buffer.from(JSON.stringify({ 0: 'mito.png', 1: 'bell.mp3' })), 0: png, 1: Buffer.from('ID3 not really a sound') }))

const c = await sandbox({ width: 1200, height: 800 })
const { h, electron } = c
const importOnce = () => electron.evaluate(async ({ dialog, Menu }, path) => {
  dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] })
  const find = (menu, label = '') => { for (const one of menu?.items ?? []) { if (one.label === 'Files…' && /import/i.test(label)) return one; const deep = find(one.submenu, one.label); if (deep) return deep } return null }
  find(Menu.getApplicationMenu())?.click()
}, file)
// The sandbox's own sample cards are left out: only what came from the deck.
const gems = () => h.evaluate(async () => Promise.all((await window.api.haligtree('items', 'nugget')).filter((one) => /^(What powers|chat$|cat$|The .*_____|Hear it|Name this)/.test(one.prompt ?? '')).map(async (one) => ({ id: one.id, prompt: one.prompt, body: JSON.stringify((await window.api.haligtree('item', one.id))?.body ?? '') }))))
const waitFor = async (test, ms = 8000) => { for (const end = Date.now() + ms; Date.now() < end; await h.waitForTimeout(150)) if (await test()) return true; return false }
try {
  // Dropped on the window outside a note: the window would open the file, and imports it instead.
  await h.evaluate((url) => { location.href = url }, `file://${file}`)
  await waitFor(async () => (await gems()).length >= 7)
  const all = await gems()
  console.log(all.map((one) => `${one.prompt} | ${one.body.slice(0, 120)}`).join('\n'))
  check('dropped on the window, seven cards came in from five notes', all.length === 7, `${all.length}`)
  const basic = all.find((one) => one.prompt.startsWith('What powers the cell?'))
  check('a picture is kept in the book and shown by its link', !!basic && /haligtree:\/\/assets\/[a-f0-9]{64}\.png/.test(basic.prompt), basic?.prompt)
  check('its deck and nested tag become #tags', !!basic && basic.body.includes('#biology-cells') && basic.body.includes('#science-biology-cells'), basic?.body)
  check('a reversed note asks both ways', all.some((one) => one.prompt === 'chat' && one.body.includes('cat')) && all.some((one) => one.prompt === 'cat' && one.body.includes('chat')))
  check('a cloze note is one card per blank, each asking its own', all.some((one) => one.prompt === 'The _____ holds the DNA') && all.some((one) => one.prompt === 'The nucleus holds the _____'))
  check('the cloze answer shows the whole sentence', all.filter((one) => one.prompt.includes('_____')).every((one) => one.body.includes('The nucleus holds the DNA')))
  const sound = all.find((one) => one.prompt.startsWith('Hear it'))
  check('a sound is kept and linked, on the answer side', !!sound && sound.prompt === 'Hear it' && /\[bell\.mp3\]\(haligtree:\/\/assets\/[a-f0-9]{64}\.mp3\)/.test(sound.body), sound?.body)
  const history = basic && await h.evaluate((id) => window.api.haligtree('review:history', id), basic.id)
  check('its four past reviews came with it', history?.reviews.length === 4, JSON.stringify(history?.reviews))
  check('and it keeps its schedule: due in the future, not new', !!history?.dueAt && Date.parse(history.dueAt) > Date.now() + day, history?.dueAt)
  const notice = await h.evaluate(() => document.querySelector('[data-import-done]')?.textContent ?? '')
  check('the notice counts what came in', /^7 cards are in/.test(notice) && /7 cards from 2 decks/.test(notice) && /1 picture/.test(notice) && /1 sound/.test(notice), notice)
  await h.screenshot({ path: join(process.env.QA_SHOTS ?? dir, 'anki-apkg-notice.png') })
  // In Review, a question's picture is drawn, not its link: put off cards till it comes up.
  await h.keyboard.press('Escape')
  await waitFor(() => h.evaluate(() => !document.querySelector('[data-import-done]')))
  await c.go('review')
  // New cards wait behind "Learn N new".
  await waitFor(() => h.evaluate(() => !!document.querySelector('[data-learn-new]')))
  await h.evaluate(() => document.querySelector('[data-learn-new]')?.click())
  let drawn = false
  for (let i = 0; i < 30 && !drawn; i += 1) {
    await h.waitForTimeout(400)
    drawn = await h.evaluate(() => !!document.querySelector('h2 img[src^="haligtree://assets/"]'))
    // Any answer moves on: Continue, else the first choice, else a written guess.
    if (drawn) break
    const moved = await h.evaluate(() => {
      const go = [...document.querySelectorAll('button')].find((one) => /^Continue/.test(one.textContent.trim())) ?? document.querySelector('[data-choices] button')
      go?.click()
      return !!go
    })
    if (!moved) await h.locator('input').last().fill('x').then(() => h.keyboard.press('Enter')).catch(() => {})
  }
  check('in Review, a question with a picture shows the picture', drawn && !(await h.evaluate(() => document.querySelector('h2')?.textContent?.includes('haligtree://'))))
  await h.screenshot({ path: join(process.env.QA_SHOTS ?? dir, 'anki-apkg-review.png') })
  await importOnce()
  await h.waitForTimeout(2500)
  check('importing the same deck again from File adds nothing twice', (await gems()).length === 7, `${(await gems()).length}`)
} catch (error) {
  check('the run finished', false, error.message.split('\n')[0])
} finally {
  await c.close()
  rmSync(dir, { recursive: true, force: true })
}
done()
