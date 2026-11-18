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
import { copyFileSync, readdirSync, statSync } from 'fs'
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
const book = join(process.env.QA_DATA, 'sandbox')
const assets = readdirSync(join(book, 'assets')).filter((one) => /^[a-f0-9]{64}\.(png|jpe?g|webp)$/.test(one)).sort((a, b) => statSync(join(book, 'assets', a)).size - statSync(join(book, 'assets', b)).size)
if (parts.includes('deck')) {
  // A shared deck, as an Anki import makes one: cards with a picture each, under one deck name.
  const sql = assets.slice(-6).map((name, at) => `update nuggets set deck = 'Pictured deck', prompt = '![](haligtree://assets/${name})' where id = (select id from nuggets where deck is null and tier in ('card', 'nugget') order by rowid limit 1 offset ${at});`).join('\n')
  execFileSync('sqlite3', [join(book, 'haligtree.db'), sql])
}
if (parts.includes('unused'))
  // Pictures no note uses: copies of the book's own under names of their own.
  for (const [at, name] of assets.slice(0, 6).entries())
    copyFileSync(join(book, 'assets', name), join(book, 'assets', `${createHash('sha256').update(`unused ${at}`).digest('hex')}.${name.split('.').pop()}`))

const c = await sandbox({ width: 1280, height: 900, at: CALM_HOUR })
const { h, v, send, go } = c
if (theme !== 'paper') await c.theme(theme)
// The book's own pictures, as stored: what a person drops into a card or a note.
const pictures = [...new Set(Object.values(await v('notes:thumbs')).filter((src) => /^haligtree:\/\/assets\/[a-f0-9]{64}\.(png|jpe?g|webp)$/.test(src)))].slice(0, 9)
check('the sandbox has stored pictures to use', pictures.length >= 6, pictures.length)
const para = (text) => ({ type: 'paragraph', content: [{ type: 'text', text }] })
await h.waitForTimeout(1200)

const firstDraw = async (name, rows, act, least = 3) => {
  await pictureWatch(h, rows, 1800)
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
  await firstDraw('the tag stream', '[data-tag-stream] article', () => send('tag', 'pictured-stream'))
}

if (parts.includes('deck')) {
  // Review's decks, the deck's right-click menu, "Pictures": its gallery opens under it.
  await go('review')
  await h.click('[data-review-tab="decks"]').catch(() => {})
  await h.waitForSelector('[data-deck="Pictured deck"]', { timeout: 8000 })
  await h.click('[data-deck="Pictured deck"]', { button: 'right' })
  const item = h.getByRole('menuitem', { name: 'Pictures', exact: true })
  await item.waitFor({ timeout: 5000 })
  await firstDraw('a deck\'s gallery', '[data-deck-pictures]', () => item.click(), 1)
}

if (parts.includes('sources')) {
  // "From a picture" on the Decks page: the pictures you already have, as squares.
  await go('review')
  await h.click('[data-review-tab="decks"]').catch(() => {})
  await h.waitForSelector('[data-deck-picture]', { timeout: 8000 })
  await firstDraw('"Or one you already have"', '[data-picture-source]', () => h.click('[data-deck-picture]'))
}

if (parts.includes('scenery')) {
  // Settings' Scenery: Haligtree's paintings, a strip of six.
  await v('settings:set', { scenery: true })
  await go('settings')
  await firstDraw('Scenery\'s folder strip', '[data-scenery-folder]', () => h.click('[data-section="Scenery"]'), 1)
}

if (parts.includes('unused')) {
  // Asked for from ⌘K or Settings by name: the sheet looks through the book, then shows what no note uses.
  await firstDraw('the unused files sheet', '[data-unused-grid]', () => h.evaluate(() => window.dispatchEvent(new Event('haligtree:unused'))), 1)
}

if (c.errors.length) console.log(`page errors: ${c.errors.slice(0, 3).join(' | ')}`)
console.log(`${results.filter(Boolean).length}/${results.length}`)
await c.close()
process.exit(results.every(Boolean) ? 0 : 1)
