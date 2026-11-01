// An Anki deck package (.apkg) comes in whole through File's "Import files": a basic card, both sides of a
// "Basic (and reversed)" note, a cloze note as one card per blank, a picture kept in the book with its link
// fixed, a deck and a nested tag as #tags, past reviews replayed so the card keeps its schedule, and a
// notice that counts them, dropped on the window; importing it again from File adds nothing twice. Built here: sqlite + media + zip.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox node qa/anki-apkg.mjs
import { writeFileSync, readFileSync, mkdtempSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { zstdCompressSync } from 'zlib'
import { DatabaseSync } from 'node:sqlite'
import { zipSync } from 'fflate'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'
const { check, done } = checks()

// --- the fixture: Anki's older collection layout, which every Anki can export
const dir = mkdtempSync(join(tmpdir(), 'apkg-'))
const sqlite = join(dir, 'collection.anki2')
const tables = (anki) => anki.exec(`create table col (id integer primary key, models text, decks text);
  create table notes (id integer primary key, guid text, mid integer, tags text, flds text);
  create table cards (id integer primary key, nid integer, did integer, ord integer, queue integer);
  create table revlog (id integer primary key, cid integer, ease integer, ivl integer, time integer, type integer);`)
const anki = new DatabaseSync(sqlite)
tables(anki)
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
  [t0 + 4, 10, '', 'Name this part<div><img src="mito.png"></div>', 'Mitochondrion'],
  [t0 + 5, 10, '', 'Paused question', 'Suspended in Anki']
]
for (const [id, mid, tags, ...fields] of notes) anki.prepare("insert into notes values (?, ?, ?, ?, ?)").run(id, `g${id}`, mid, tags, fields.join("\x1f"))
const cards = [[100, t0, 2, 0], [101, t0 + 1, 1, 0], [102, t0 + 1, 1, 1], [103, t0 + 2, 1, 0], [104, t0 + 2, 1, 1], [105, t0 + 3, 1, 0], [106, t0 + 4, 1, 0], [107, t0 + 5, 1, 0, -1]]
for (const card of cards) anki.prepare('insert into cards values (?, ?, ?, ?, ?)').run(...card.concat(card.length < 5 ? [0] : []))
// Card 100 was learnt a month ago and remembered three times since.
for (const [at, ease] of [[t0, 3], [t0 + 1 * day, 3], [t0 + 5 * day, 3], [t0 + 20 * day, 4]]) anki.prepare('insert into revlog values (?, 100, ?, 1, 4000, 1)').run(at, ease)
// Card 106, the picture question, was missed once long ago: it is due now.
anki.prepare('insert into revlog values (?, 106, 1, 0, 3000, 0)').run(t0 + 4 + day)
anki.close()
// A 1x1 PNG and a few bytes of "sound".
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')
const file = join(dir, 'Biology.apkg')
writeFileSync(file, zipSync({ 'collection.anki2': readFileSync(sqlite), media: Buffer.from(JSON.stringify({ 0: 'mito.png', 1: 'bell.mp3' })), 0: png, 1: Buffer.from('ID3 not really a sound') }))
// --- and Anki 2.1.50's packed export: collection.anki21b, its media list (a protobuf) and its files zstd-packed.
const packedSqlite = join(dir, 'packed.sqlite')
const packed = new DatabaseSync(packedSqlite)
tables(packed)
packed.prepare('insert into col values (1, ?, ?)').run(JSON.stringify({ 10: { name: 'Basic', type: 0 } }), JSON.stringify({ 3: { name: 'Packed deck' } }))
packed.prepare("insert into notes values (?, ?, 10, ?, ?)").run(t0 + 9, "packed1", '', 'Packed question<img src="dot.png">\x1fPacked answer')
packed.prepare('insert into cards values (900, ?, 3, 0, 0)').run(t0 + 9)
packed.close()
const field = (number, bytes) => Buffer.concat([Buffer.from([(number << 3) | 2, bytes.length]), bytes])
const mediaList = field(1, field(1, Buffer.from('dot.png')))
const packedFile = join(dir, 'Packed.apkg')
writeFileSync(packedFile, zipSync({ 'collection.anki2': Buffer.from('an old stub Anki leaves for older versions'), 'collection.anki21b': zstdCompressSync(readFileSync(packedSqlite)), media: zstdCompressSync(mediaList), 0: zstdCompressSync(png) }))

const c = await sandbox({ width: 1200, height: 800 })
const { h, electron } = c
const importOnce = (path = file) => electron.evaluate(async ({ dialog, Menu }, path) => {
  dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] })
  const find = (menu, label = '') => { for (const one of menu?.items ?? []) { if (/^Files/.test(one.label) && /import/i.test(label)) return one; const deep = find(one.submenu, one.label); if (deep) return deep } return null }
  find(Menu.getApplicationMenu())?.click()
}, path)
// The sandbox's own sample cards are left out: only what came from the deck.
const gems = () => h.evaluate(async () => Promise.all((await window.api.haligtree('items', 'deck')).filter((one) => /^(What powers|chat$|cat$|The .*_____|Hear it|Name this|Paused question)/.test(one.prompt ?? '')).map(async (one) => ({ id: one.id, prompt: one.prompt, body: JSON.stringify((await window.api.haligtree('item', one.id))?.body ?? '') }))))
const waitFor = async (test, ms = 8000) => { for (const end = Date.now() + ms; Date.now() < end; await h.waitForTimeout(150)) if (await test()) return true; return false }
try {
  // Dropped on the window outside a note: the window would open the file, and imports it instead.
  await h.evaluate((url) => { location.href = url }, `file://${file}`)
  // A deck with past reviews asks first, in the app's own sheet: "Start these fresh" is picked; this is the person's own export, so the reviews are kept.
  await waitFor(() => h.evaluate(() => !!document.querySelector('[data-apkg-ask]')))
  const sheet = await h.evaluate(() => ({ text: document.querySelector('[data-apkg-ask]')?.textContent ?? '', picked: document.querySelector('[data-apkg-option][aria-checked="true"]')?.textContent }))
  await h.screenshot({ path: join(process.env.QA_SHOTS ?? dir, 'anki-apkg-ask.png') })
  await h.evaluate(() => document.querySelector('[data-apkg-option="keep"]')?.click())
  await h.evaluate(() => document.querySelector('[data-apkg-go]')?.click())
  await waitFor(async () => (await gems()).length >= 8)
  const all = await gems()
  console.log(all.map((one) => `${one.prompt} | ${one.body.slice(0, 120)}`).join('\n'))
  check('dropped on the window, eight cards came in from six notes', all.length === 8, `${all.length}`)
  const basic = all.find((one) => one.prompt.startsWith('What powers the cell?'))
  check('a picture is kept in the book and shown by its link', !!basic && /haligtree:\/\/assets\/[a-f0-9]{64}\.png/.test(basic.prompt), basic?.prompt)
  check('its deck and nested tag become #tags', !!basic && basic.body.includes('#biology-cells') && basic.body.includes('#science-biology-cells'), basic?.body)
  check('a reversed note asks both ways', all.some((one) => one.prompt === 'chat' && one.body.includes('cat')) && all.some((one) => one.prompt === 'cat' && one.body.includes('chat')))
  check('a cloze note is one card per blank, each asking its own', all.some((one) => one.prompt === 'The _____ holds the DNA') && all.some((one) => one.prompt === 'The nucleus holds the _____'))
  check('the cloze answer shows the whole sentence', all.filter((one) => one.prompt.includes('_____')).every((one) => one.body.includes('The nucleus holds the DNA')))
  const paused = await h.evaluate(async () => (await window.api.haligtree('items', 'deck')).filter((one) => /^(What powers|chat$|cat$|The .*_____|Hear it|Name this|Paused question)/.test(one.prompt ?? '') && one.suspended).map((one) => one.prompt))
  check('a card suspended in Anki comes in paused, and only that one', paused.length === 1 && paused[0] === 'Paused question', JSON.stringify(paused))
  const sound = all.find((one) => one.prompt.startsWith('Hear it'))
  check('a sound is kept and linked, on the answer side', !!sound && sound.prompt === 'Hear it' && /\[bell\.mp3\]\(haligtree:\/\/assets\/[a-f0-9]{64}\.mp3\)/.test(sound.body), sound?.body)
  const history = basic && await h.evaluate((id) => window.api.haligtree('review:history', id), basic.id)
  check('a downloaded deck with reviews asks in the app\'s own sheet, "Start these fresh" picked', /past reviews for 2 cards/.test(sheet.text) && sheet.picked === 'Start these fresh', JSON.stringify(sheet))
  check('its four past reviews came with it', history?.reviews.length === 4, JSON.stringify(history?.reviews))
  check('and it keeps its schedule: due in the future, not new', !!history?.dueAt && Date.parse(history.dueAt) > Date.now() + day, history?.dueAt)
  const notice = await h.evaluate(() => document.querySelector('[data-import-done]')?.textContent ?? '')
  check('the notice counts what came in', /^8 cards are in/.test(notice) && /From Biology: Cells/.test(notice) && /8 cards, 1 picture/.test(notice) && /A card as Review asks it/.test(notice) && !/Biology\.apkg/.test(notice) && /1 picture/.test(notice) && /1 sound/.test(notice), notice)
  check('the notice says what Anki\'s words are here, and where shared decks are', /Coming from Anki\? A deck sits on Review › Decks/.test(notice) && /Review › All cards/.test(notice) && /ankiweb\.net\/shared\/decks/.test(notice), notice)
  await h.screenshot({ path: join(process.env.QA_SHOTS ?? dir, 'anki-apkg-notice.png') })
  // One click from the notice shows just the cards this import made.
  check('the notice offers "Show the new cards"', await h.evaluate(() => !!document.querySelector('[data-show-new]')))
  await h.evaluate(() => document.querySelector('[data-show-new]')?.click())
  check('"Show the new cards" shows just the 8 that came in', await waitFor(() => h.evaluate(() => document.querySelector('[data-cards-only]')?.getAttribute('data-cards-only') === '8'), 5000), await h.evaluate(() => document.querySelector('[data-cards-only]')?.textContent ?? 'none'))
  await h.keyboard.press('Escape')
  await waitFor(() => h.evaluate(() => !document.querySelector('[data-import-done]')))
  // A shared deck lives on its own shelf: out of Gems and Media's grid until the person says otherwise.
  const inGems = () => h.evaluate(async () => (await window.api.haligtree('items', 'nugget')).filter((one) => /^(What powers|Hear it)/.test(one.prompt ?? '')).length)
  check('the deck\'s cards stay out of Gems', (await inGems()) === 0)
  await c.go('media')
  await waitFor(() => h.evaluate(() => !!document.querySelector('[data-media-decks]')))
  const mediaGrid = await h.evaluate(() => document.querySelectorAll('[data-media-grid] img').length)
  await h.evaluate(() => document.querySelector('[data-media-decks] button, [data-media-decks] [role]')?.click())
  await h.waitForTimeout(400)
  const deckPictures = await h.evaluate(() => document.querySelectorAll('[data-media-grid] img').length)
  check('Media keeps the deck\'s pictures under a "Deck pictures" chip, out of its grid', deckPictures >= 1 && deckPictures !== mediaGrid, `grid ${mediaGrid}, deck pictures ${deckPictures}`)
  await c.go('review')
  await h.evaluate(() => document.querySelector('[data-review-tab="decks"]')?.click())
  await waitFor(() => h.evaluate(() => !!document.querySelector('[data-deck-shelf]')))
  const shelf = await h.evaluate(() => document.querySelector('[data-deck-shelf]')?.innerText ?? '')
  check('Review › Decks shows the deck, its cover and its counts', /Biology\n\d+ due · \d+ new/.test(shelf) && await h.evaluate(() => !!document.querySelector('[data-deck] img')), shelf.replace(/\n/g, ' | ').slice(0, 400))
  await c.both(join(process.env.QA_SHOTS ?? dir, 'anki-apkg-decks'))
  // Your own decks and the shared one in one picture: the last of yours over the shared shelf, light and dark.
  for (const [theme, said] of [['paper', 'light'], ['dark', 'dark']]) {
    await c.theme(theme)
    await c.go('review')
    await h.evaluate(() => document.querySelector('[data-review-tab="decks"]')?.click())
    await waitFor(() => h.evaluate(() => !!document.querySelector('[data-deck]:not([data-own-deck])')))
    await h.evaluate(() => document.querySelector('[data-deck]:not([data-own-deck])')?.scrollIntoView({ block: 'center' }))
    await h.waitForTimeout(900)
    await h.screenshot({ path: join(process.env.QA_SHOTS ?? dir, `decks-own-and-shared-${said}.png`) })
  }
  await c.theme('paper')
  await c.go('review')
  await h.evaluate(() => document.querySelector('[data-review-tab="decks"]')?.click())
  // "Show in Gems" and back, from the deck's ⋯ menu: a pocket's actions live there.
  const fromMenu = async (words) => {
    await waitFor(() => h.evaluate(() => !!document.querySelector('[data-deck]:not([data-own-deck]) button[aria-label="Deck options"]')))
    await h.click('[data-deck]:not([data-own-deck]) button[aria-label="Deck options"]')
    await h.locator('[role="menuitem"]', { hasText: words }).first().click()
  }
  await fromMenu('Show in Gems')
  check('"Show in Gems" brings them into Gems', await waitFor(async () => (await inGems()) === 2))
  await h.waitForTimeout(600)
  await fromMenu('Keep out of Gems')
  check('"Keep out of Gems" puts them back on the shelf', await waitFor(async () => (await inGems()) === 0))
  await h.evaluate(() => document.querySelector('[data-review-tab="today"]')?.click())
  // Learn mode: a dozen steps, answered anyhow; what it offers to pick is read at each.
  await waitFor(() => h.evaluate(() => !!document.querySelector('[data-learn-new]')))
  await h.evaluate(() => document.querySelector('[data-learn-new]')?.click())
  const choicesSeen = []
  const asked = new Set()
  for (let i = 0; i < 12; i += 1) {
    await h.waitForTimeout(400)
    asked.add(await h.evaluate(() => document.querySelector('h2')?.textContent ?? ''))
    choicesSeen.push(...await h.evaluate(() => [...document.querySelectorAll('[data-choices] button span')].map((one) => one.textContent)))
    // Any answer moves on: Continue, else the first choice, else a written guess.
    const moved = await h.evaluate(() => {
      const go = [...document.querySelectorAll('button')].find((one) => /^Continue/.test(one.textContent.trim())) ?? document.querySelector('[data-choices] button')
      go?.click()
      return !!go
    })
    if (!moved) await h.locator('input').last().fill('x').then(() => h.keyboard.press('Enter')).catch(() => {})
  }
  check('Learn mode never offers a file name as an answer, and the round moves on', asked.size > 2 && !choicesSeen.some((one) => /\.(mp3|png)\b/.test(one)), `${asked.size} questions: ${[...new Set(choicesSeen)].join(' | ')}`)
  await h.evaluate(() => [...document.querySelectorAll('button')].find((one) => one.textContent.trim() === 'Leave')?.click())
  // In Review, a question's picture is drawn, not its link: the picture card (missed once, so due) comes up as others are put off.
  let drawn = false
  for (let i = 0; i < 30 && !drawn; i += 1) {
    await h.waitForTimeout(400)
    drawn = await h.evaluate(() => !!document.querySelector('h2 img[src^="haligtree://assets/"]'))
    if (!drawn) await h.evaluate(() => [...document.querySelectorAll('button')].find((one) => /^Not today/.test(one.textContent.trim()))?.click())
  }
  check('in Review, a question with a picture shows the picture', drawn && !(await h.evaluate(() => document.querySelector('h2')?.textContent?.includes('haligtree://'))))
  await h.screenshot({ path: join(process.env.QA_SHOTS ?? dir, 'anki-apkg-review.png') })
  await importOnce()
  await h.waitForTimeout(2500)
  // Anki 2.1.50's packed export comes in too, its picture unpacked.
  await importOnce(packedFile)
  const packedCard = await waitFor(async () => (await h.evaluate(async () => (await window.api.haligtree('items', 'deck')).some((one) => (one.prompt ?? '').startsWith('Packed question'))))) &&
    await h.evaluate(async () => (await window.api.haligtree('items', 'deck')).find((one) => (one.prompt ?? '').startsWith('Packed question')).prompt)
  check('a packed (.anki21b) export comes in, its picture unpacked and kept', /haligtree:\/\/assets\/[a-f0-9]{64}\.png/.test(packedCard || ''), packedCard)
  check('importing the same deck again from File adds nothing twice', (await gems()).length === 8, `${(await gems()).length}`)

  // The shared shelf matches your own decks: its topics on the app's tree, a ⋯ menu, and a right-click with Delete deck.
  await c.go('review')
  await h.evaluate(() => document.querySelector('[data-review-tab="decks"]')?.click())
  await waitFor(() => h.evaluate(() => !!document.querySelector('[data-deck="Biology"]')))
  await h.evaluate(() => document.querySelector('[data-deck-kids="Biology"]')?.click())
  check('the shared deck\'s topics hang off the tree', await waitFor(() => h.evaluate(() => !!document.querySelector('[data-deck-inside-of="Biology"] svg path')), 2000))
  check('the shared deck has a ⋯ menu', await h.evaluate(() => !!document.querySelector('[data-deck="Biology"] button[aria-label="Deck options"]')))
  // Right-clicked where it is, even with a notice over it: the menu opens at the heading.
  await h.evaluate(() => { const at = document.querySelector('[data-deck="Biology"] h3'); at.scrollIntoView({ block: 'center' }); const box = at.getBoundingClientRect(); at.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: box.left + 10, clientY: box.top + 5, button: 2 })) })
  await h.waitForTimeout(400)
  const right = await h.evaluate(() => [...document.querySelectorAll('[role="menuitem"]')].map((one) => one.textContent ?? '').join(' | '))
  check('right-click has its settings and Delete deck', ['New cards a day', 'Show in Gems', 'Delete deck…'].every((one) => right.includes(one)) || ['New cards a day', 'Keep out of Gems', 'Delete deck…'].every((one) => right.includes(one)), right)
  await h.evaluate(() => [...document.querySelectorAll('[role="menuitem"]')].find((one) => one.textContent?.includes('Delete deck…'))?.click())
  check('Delete asks first, saying it removes the imported deck', await waitFor(() => h.evaluate(() => /removes the imported deck/.test(document.querySelector('[data-sure]')?.textContent ?? ''))))
  await h.evaluate(() => document.querySelector('[data-sure-yes]').click())
  const left = () => h.evaluate(async () => (await window.api.haligtree('decks:list')).some((one) => one.name === 'Biology'))
  check('Delete takes the imported deck away', await waitFor(async () => !(await left())))
  // The notice's own Undo.
  await waitFor(() => h.evaluate(() => [...document.querySelectorAll('button')].some((one) => /^Undo/.test(one.textContent?.trim() ?? ''))))
  await h.evaluate(() => [...document.querySelectorAll('button')].find((one) => /^Undo/.test(one.textContent?.trim() ?? ''))?.click())
  check('Undo brings it back', await waitFor(left, 10000))
} catch (error) {
  check('the run finished', false, error.message.split('\n')[0])
} finally {
  await c.close()
  rmSync(dir, { recursive: true, force: true })
}
done()
