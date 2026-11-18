// Every list and grid of pictures draws each picture in the first frame its row, card or tile is seen: opened for the
// first time in a window that has decoded none of them, read at every frame the page draws (qa/picture-frames.mjs).
// Never an empty box first, a picture loading late or fading in. The journeys, one PART each (comma-separated):
//   lists    the Inbox and Writing, a row's own small copy (note-list.tsx), and what main sends for the largest WebP
//   board    a board's card covers (board-view.tsx)
//   tag      a tag's stream, a note's picture under its words (tag-read.tsx Entry)
//   deck     a deck's gallery, from its right-click "Pictures" (deck-shelf.tsx Gallery)
//   sources  "From a picture"'s "Or one you already have" (picture-cards.tsx)
//   scenery  Settings' Scenery folder strip (settings-looks.tsx Strip)
//   unused   the unused files sheet, from ⌘K's ask (unused-files.tsx)
//   cp -cR <seeded sandbox> <copy>; QA_ARGS=--sandbox QA_DATA=<copy> QA_ENTRY=out-x/main/index.js HALIGTREE_QA_AWAY=1 PART=lists,board node qa/grid-pictures.mjs
// The deck and unused parts change the copy before the app opens (a deck of six pictured cards; six pictures no note
// uses): always a fresh copy. THEME=dark for the dark look; QA_FILM=dir keeps the page's own frames.
import { execFileSync } from 'child_process'
import { copyFileSync, readdirSync, statSync, utimesSync } from 'fs'
import { createHash } from 'crypto'
import { join } from 'path'
import { CALM_HOUR, sandbox } from './sandbox-lib.mjs'
import { pictureVerdict, pictureWatch } from './picture-frames.mjs'
process.env.QA_ARGS ??= '--sandbox'

const parts = (process.env.PART ?? 'lists,board,tag,deck,sources,scenery,unused').split(',')
const film = process.env.QA_FILM
const theme = process.env.THEME ?? 'paper'
const results = []
const check = (name, ok, detail = '') => (results.push(!!ok), console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${String(detail).slice(0, 600)})` : ''}`), !!ok)

// Before the app opens: the sandbox's stored pictures, the largest last.
// On a copy of a real book (QA_ARGS= QA_DATA=<book copy>), its first book's folder; PART=lists there.
const book = process.env.QA_ARGS.includes('--sandbox') ? join(process.env.QA_DATA, 'sandbox') : join(process.env.QA_DATA, 'books', readdirSync(join(process.env.QA_DATA, 'books')).find((one) => one.startsWith('b-')))
const assets = readdirSync(join(book, 'assets')).filter((one) => /^[a-f0-9]{64}\.(png|jpe?g|webp)$/.test(one)).sort((a, b) => statSync(join(book, 'assets', a)).size - statSync(join(book, 'assets', b)).size)
if (parts.includes('deck')) {
  // A shared deck, as an Anki import makes one: cards with a picture each, under one deck name.
  // Pictures no note leads with, so none was drawn (decoded) by an earlier part.
  const own = assets.filter((name) => execFileSync('sqlite3', [join(book, 'haligtree.db'), `select count(*) from captures where body like '%${name}%'`]).toString().trim() === '0').slice(-6)
  const sql = own.map((name, at) => `update nuggets set deck = 'Pictured deck', prompt = '![](haligtree://assets/${name})' where id = (select id from nuggets where deck is null and tier in ('card', 'nugget') order by rowid limit 1 offset ${at});`).join('\n')
  execFileSync('sqlite3', [join(book, 'haligtree.db'), sql])
}
if (parts.includes('unused'))
  // Pictures no note uses: copies of the book's own under names of their own, a month old (one added in the last day is left alone).
  for (const [at, name] of assets.slice(0, 6).entries()) {
    const copy = join(book, 'assets', `${createHash('sha256').update(`unused ${at}`).digest('hex')}.${name.split('.').pop()}`)
    copyFileSync(join(book, 'assets', name), copy)
    utimesSync(copy, new Date(Date.now() - 30 * 864e5), new Date(Date.now() - 30 * 864e5))
  }

const c = await sandbox({ width: 1280, height: 900, at: process.env.QA_ARGS.includes('--sandbox') ? CALM_HOUR : undefined, seeded: process.env.QA_ARGS.includes('--sandbox') })
const { h, v, send, go } = c
if (theme !== 'paper') await c.theme(theme)
// The book's own pictures, as stored: what a person drops into a card or a note.
const pictures = [...new Set(Object.values(await v('notes:thumbs')).filter((src) => /^haligtree:\/\/assets\/[a-f0-9]{64}\.(png|jpe?g|webp)$/.test(src)))].slice(0, 9)
if (parts.some((one) => one !== 'lists')) check('the book has stored pictures to use', pictures.length >= 6, pictures.length)
const para = (text) => ({ type: 'paragraph', content: [{ type: 'text', text }] })
await h.waitForTimeout(1200)

const firstDraw = async (name, rows, act, least = 3, ms = 1800) => {
  await pictureWatch(h, rows, ms)
  if (film) await (await import('./cast-lib.mjs')).castFrames(h, film, `${theme}-${name.replace(/\W+/g, '-')}-first-draw`, act, 700)
  else await act()
  const { rows: seen, pictured, late, frames } = await pictureVerdict(h)
  check(`${theme}: ${name}'s first draw: each of its ${pictured} with a picture has it, whole, in the first frame it is seen (${seen} seen, ${frames} frames read)`,
    pictured >= least && late.length === 0, `${late.length} late: ${JSON.stringify(late.slice(0, 4))}`)
}

if (parts.includes('lists')) {
  for (const [view, name] of [['inbox', 'the Inbox'], ['articles', 'Writing']]) await firstDraw(name, '[data-row]', () => send('view', view), 1)
  // The largest WebP a note holds: what main sends a row for it (not a check, a measure for the report).
  const big = assets.filter((one) => one.endsWith('.webp')).at(-1)
  if (big) {
    const made = await v('notes:thumb', `haligtree://assets/${big}`, 320)
    console.log(`(the largest WebP, ${Math.round(statSync(join(book, 'assets', big)).size / 1024)} KB: a row gets ${made.slice(0, 15)}… of ${Math.round(made.length / 1024)} KB)`)
  }
}

if (parts.includes('board')) {
  // A board of three lists, each card with a picture of its own (board-view.tsx, a card's cover).
  const id = await v('article:new')
  const lane = (name, from) => `## ${name}\n\n${pictures.slice(from, from + 3).map((src, at) => `- ${name} card ${at + 1}\n\n  ![](${src})`).join('\n')}\n`
  await v('item:save', id, { title: 'Pictured board', body: `${lane('Ideas', 0)}\n${lane('Doing', 3)}\n${lane('Done', 6)}` })
  await v('notes:fields:set', 'nuggets', id, 'kanban-plugin', 'board')
  await firstDraw('the board', '[data-board-card]', () => send('article', id))
}

if (parts.includes('tag')) {
  // A tag's stream of notes, each with a picture under its words (tag-read.tsx, Entry).
  for (const [at, src] of pictures.slice(0, 6).entries())
    await h.evaluate((p) => window.api.captures.create(p), { kind: 'note', body: { type: 'doc', content: [para(`A pictured note ${at + 1} #pictured-stream`), { type: 'image', attrs: { src } }] } })
  await h.evaluate(() => localStorage.setItem('tag:look', 'stream'))
  await h.waitForTimeout(800)
  await firstDraw('the tag stream', '[data-tag-stream] article', () => send('tag', 'pictured-stream'), 2)
}

if (parts.includes('deck')) {
  // Review's decks, the deck's right-click menu, "Pictures": its gallery opens under it.
  await go('review')
  await h.click('[data-review-tab="decks"]').catch(() => {})
  await h.waitForSelector('[data-deck="Pictured deck"]', { timeout: 8000 })
  await h.click('[data-deck="Pictured deck"]', { button: 'right' })
  const item = h.getByRole('menuitem', { name: 'Pictures', exact: true })
  await item.waitFor({ timeout: 5000 })
  // It opens under the shelf, below the window's edge: seen as a person scrolls to it.
  await firstDraw('a deck\'s gallery', '[data-deck-pictures]', async () => { await item.click(); await (await h.waitForSelector('[data-deck-pictures]')).scrollIntoViewIfNeeded() }, 1)
}

if (parts.includes('sources')) {
  // "From a picture" on the Decks page: the pictures you already have, as squares.
  // At the top of the Decks page: "From a picture" in the row, or under "More" when the row is too narrow for it.
  await go('review')
  await h.click('[data-review-tab="decks"]').catch(() => {})
  await h.waitForSelector('[data-review-page]', { timeout: 8000 })
  await h.evaluate(() => document.querySelector('[data-review-page]').scrollIntoView())
  await h.waitForTimeout(400)
  if (!(await h.isVisible('[data-deck-picture]'))) await h.click('[data-toolbar-more]')
  const picture = (await h.isVisible('[data-deck-picture]')) ? h.locator('[data-deck-picture]') : h.getByRole('menuitem', { name: 'From a picture' })
  await firstDraw('"Or one you already have"', '[data-picture-source]', () => picture.click())
}

if (parts.includes('scenery')) {
  // Settings' Scenery: Haligtree's paintings, a strip of six.
  // Its small copies made first, as a folder's first look does behind its orb: the strip is read once they are.
  // The copy's own paintings folder (the seed names the folder it was made in).
  const folders = [join(book, 'Sandbox scenery')]
  await v('settings:set', { scenery: true, sceneryFolders: folders })
  for (const end = Date.now() + 30_000; Date.now() < end && (await v('scenery', folders, 'scenery')).scanning; ) await h.waitForTimeout(500)
  await go('settings')
  await firstDraw('Scenery\'s folder strip', '[data-scenery-folder]', () => h.click('[data-section="Scenery"]'), 1)
}

if (parts.includes('unused')) {
  // Asked for from ⌘K or Settings by name: the sheet looks through the book, then shows what no note uses.
  await firstDraw('the unused files sheet', '[data-unused-grid]', () => h.evaluate(() => window.dispatchEvent(new Event('haligtree:unused'))), 1, 6000)
}

if (c.errors.length) console.log(`page errors: ${c.errors.slice(0, 3).join(' | ')}`)
console.log(`${results.filter(Boolean).length}/${results.length}`)
await c.close()
process.exit(results.every(Boolean) ? 0 : 1)
