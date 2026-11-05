// Back and Forward in Review: every place you go inside Review is a step ⌘[ and ⌘] (and the header arrows)
// return to exactly. Each tab; studying a deck from a tile, the List, a sub-deck, a study set and from outside
// (Home, ⌘K); a deck's "+N sub-decks" opened; a shared deck's pictures and its links; and leaving each again
// (Esc, "Back to today's cards", the end of a round, a tab click).
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox node qa/review-history.mjs
import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { DatabaseSync } from 'node:sqlite'
import { zipSync } from 'fflate'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'
const { check, done } = checks()

// A shared Anki deck with a picture on each card, so it has a gallery and links.
const dir = process.env.QA_DATA
const sqlite = join(dir, 'collection.anki2')
const anki = new DatabaseSync(sqlite)
anki.exec(`create table col (id integer primary key, models text, decks text);
  create table notes (id integer primary key, guid text, mid integer, tags text, flds text);
  create table cards (id integer primary key, nid integer, did integer, ord integer, queue integer);
  create table revlog (id integer primary key, cid integer, ease integer, ivl integer, time integer, type integer);`)
anki.prepare('insert into col values (1, ?, ?)').run(JSON.stringify({ 10: { name: 'Basic', type: 0, flds: [{ name: 'Front' }, { name: 'Back' }, { name: 'Artist' }] } }), JSON.stringify({ 2: { name: 'Paintings' } }))
for (const [at, back] of [[1, 'The Night Watch'], [2, 'The Milkmaid']]) {
  anki.prepare('insert into notes values (?, ?, 10, ?, ?)').run(at, `g${at}`, '', `<img src="p${at}.png">\x1f${back}\x1fA painter`)
  anki.prepare('insert into cards values (?, ?, 2, 0, 0)').run(100 + at, at)
}
anki.close()
// A one-pixel picture for each card.
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')
const deckFile = join(dir, 'Paintings.apkg')
writeFileSync(deckFile, zipSync({ 'collection.anki2': readFileSync(sqlite), media: Buffer.from(JSON.stringify({ 0: 'p1.png', 1: 'p2.png' })), 0: png, 1: png }))

const c = await sandbox({ width: 1200, height: 800 })
const { h } = c
const waitFor = async (test, ms = 8000) => { for (const end = Date.now() + ms; Date.now() < end; await h.waitForTimeout(120)) if (await test()) return true; return false }
const call = (...args) => h.evaluate((args) => window.api.haligtree(...args), args)
const has = (selector) => h.evaluate((selector) => !!document.querySelector(selector), selector)
const click = async (selector) => { await h.locator(selector).first().click(); await h.waitForTimeout(700) }
const blur = () => h.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur())
const key = async (one) => { await blur(); await h.keyboard.press(one); await h.waitForTimeout(800) }
const back = () => key('Meta+BracketLeft')
const forward = () => key('Meta+BracketRight')

/** Where Review is, read off the screen: the tab, or the deck being studied, and what is open on the Decks tab. */
const where = () => h.evaluate(() => {
  const page = document.querySelector('[data-page]')?.getAttribute('data-page')
  if (page !== 'review') return `page:${page}`
  const studying = [...document.querySelectorAll('p strong')].map((one) => one.textContent ?? '').find((one) => one.startsWith('Studying '))
  if (studying) return `study:${studying.replace(/^Studying /, '').replace(/\.$/, '').toLowerCase()}`
  const tab = document.querySelector('[data-review-tabs] [aria-selected="true"]')?.getAttribute('data-review-tab')
  if (!tab) return document.querySelector('[data-review-top], [data-review-finished]') ? 'today' : 'review:?'
  const extra = [
    ...[...document.querySelectorAll('[data-deck-inside-of]')].map((one) => `inside:${one.getAttribute('data-deck-inside-of')}`),
    document.querySelector('[data-deck-pictures]') && 'pictures',
    document.querySelector('[data-deck-links-panel]') && 'links',
    document.querySelector('[data-deck-look="list"]') && 'list'
  ].filter(Boolean)
  return [tab, ...extra].join('+')
})
const at = async (want) => { await waitFor(async () => (await where()) === want, 4000); return where() }
/** Back lands on `was`, Forward on `now` again. */
const steps = async (name, was, now) => {
  await back()
  const b = await at(was)
  await forward()
  const f = await at(now)
  check(`${name}: ⌘[ goes back to ${was}, ⌘] forward to ${now}`, b === was && f === now, `⌘[ ${b}, ⌘] ${f}`)
}
const decks = async () => { await click('[data-review-tabs] [data-review-tab="decks"]'); await waitFor(() => has('[data-deck-shelf]')) }
const look = async (one) => { if (!(await has(`[data-deck-look-to="${one}"][aria-checked="true"]`))) await click(`[data-deck-look-to="${one}"]`) }

try {
  await call('cards:list', [
    { term: 'Zebra stripes?', meaning: 'Black on white #zoo' }, { term: 'Yak home?', meaning: 'Tibet #zoo' },
    { term: 'Cat whiskers?', meaning: 'Twenty-four #zoo-cats' },
    { term: 'Owl call?', meaning: 'Hoot #birds' }, { term: 'Wren size?', meaning: 'Tiny #birds' }
  ])
  await call('sets:save', 'Animals', 'zoo')
  // The Anki deck, imported as a person would: opened, then "Import".
  await h.evaluate((url) => { location.href = url }, `file://${deckFile}`)
  await waitFor(() => has('[data-apkg-go], [data-import-done]'), 30000)
  await h.evaluate(() => document.querySelector('[data-apkg-go]')?.click())
  await waitFor(async () => (await call('decks:list')).some((one) => one.name === 'Paintings' && one.pictures > 0), 30000)
  // The file was opened by navigating to it, which the app took in: a fresh page, so no click waits on that navigation.
  await h.reload()
  await h.waitForLoadState('domcontentloaded')
  await h.waitForTimeout(1500)
  await c.go('home')

  // 1. The tabs.
  await c.go('review')
  await look('pockets')
  check('1. Review opens on the decks', (await at('decks')) === 'decks', await where())
  await click('[data-review-tabs] [data-review-tab="cards"]')
  await click('[data-review-tabs] [data-review-tab="stats"]')
  await steps('1. tabs', 'cards', 'stats')
  await decks()

  // 2. A deck studied from its tile, then left by a tab click.
  await click('[data-own-deck="zoo"]')
  check('2. a tile studies its deck', (await at('study:zoo')) === 'study:zoo', await where())
  await steps('2. studying from a tile', 'decks', 'study:zoo')
  await decks()
  await steps('2. leaving a study by the Decks tab', 'study:zoo', 'decks')

  // 3. Left by "Back to today's cards" and by Esc.
  await click('[data-own-deck="zoo"]')
  await at('study:zoo')
  await h.locator('button', { hasText: 'Back to today’s cards' }).first().click()
  await h.waitForTimeout(800)
  check('3. "Back to today’s cards" leaves the deck', (await at('today')) === 'today', await where())
  await steps('3. leaving by “Back to today’s cards”', 'study:zoo', 'today')
  await decks()
  await click('[data-own-deck="birds"]')
  await at('study:birds')
  await key('Escape')
  check('3. Esc leaves a deck’s study for the Decks tab', (await at('decks')) === 'decks', await where())
  await steps('3. leaving by Esc', 'study:birds', 'decks')

  // 4. The end of a round: every card graded, then the way on.
  await click('[data-own-deck="birds"]')
  await at('study:birds')
  for (let i = 0; i < 4 && !(await has('[data-empty], [data-review-finished]')); i++) { await key('Space'); await key('3') }
  const ended = await waitFor(() => h.evaluate(() => /Round done/.test(document.body.textContent ?? '')))
  check('4. the round ends', ended)
  await h.locator('button', { hasText: 'Back to today’s cards' }).first().click()
  await h.waitForTimeout(800)
  check('4. its way on leaves the deck', (await at('today')) === 'today', await where())
  await back()
  check('4. ⌘[ goes back to the deck', (await at('study:birds')) === 'study:birds', await where())
  await decks()

  // 5. "+1 sub-deck" opened, then a sub-deck studied from it.
  await click('[data-own-deck="zoo"] [data-deck-kids="zoo"]')
  check('5. "+N sub-decks" opens the decks inside', (await at('decks+inside:zoo')) === 'decks+inside:zoo', await where())
  await steps('5. sub-decks opened', 'decks', 'decks+inside:zoo')
  await click('[data-deck-inside-of="zoo"] [data-deck-row-study="zoo-cats"]')
  await waitFor(async () => /^study:.*cats/.test(await where()), 4000)
  check('5. a sub-deck studies from there', /^study:.*cats/.test(await where()), await where())
  const sub = await where()
  await steps('5. studying a sub-deck', 'decks+inside:zoo', sub)
  await back()
  await click('[data-own-deck="zoo"] [data-deck-kids="zoo"]')
  check('5. folding them again is a step too', (await at('decks')) === 'decks', await where())
  await steps('5. sub-decks folded', 'decks+inside:zoo', 'decks')

  // 6. A shared deck's pictures and its links, from its menu.
  const menu = async (words) => {
    await h.locator('[data-deck="Paintings"]').first().click({ button: 'right' })
    await h.waitForTimeout(400)
    await h.locator('[role="menuitem"]', { hasText: words }).first().click()
    await h.waitForTimeout(800)
  }
  await menu('Pictures')
  check('6. "Pictures" opens the gallery', (await at('decks+pictures')) === 'decks+pictures', await where())
  await steps('6. pictures', 'decks', 'decks+pictures')
  await menu('Hide pictures')
  await menu('Links…')
  check('6. "Links…" opens the links', (await at('decks+links')) === 'decks+links', await where())
  await steps('6. links', 'decks', 'decks+links')
  await back()

  // 7. From the List and from a study set.
  await look('list')
  await at('decks+list')
  await click('[data-deck-row-study="zoo"]')
  await steps('7. studying from the List', 'decks+list', 'study:zoo')
  await decks()
  await click('[data-study-set="Animals"]')
  await steps('7. studying a study set', 'decks+list', 'study:zoo')
  await decks()
  await look('pockets')

  // 8. From outside Review: Home's way in and ⌘K both open a deck's study.
  await c.go('home')
  // As ⌘K's "Study #birds" and every other way in from outside: a study step (home.tsx stepOf 'study').
  await c.send('study', 'birds')
  await h.waitForTimeout(900)
  check('8. a deck opened from outside studies it', (await at('study:birds')) === 'study:birds', await where())
  await decks()
  await steps('8. a tab after a deck opened from outside', 'study:birds', 'decks')
  await back()
  await back()
  check('8. ⌘[ again goes back out of Review', (await at('page:home')) === 'page:home', await where())
  await forward()
  check('8. ⌘] comes back into the deck', (await at('study:birds')) === 'study:birds', await where())
} catch (error) {
  check('ran to the end', false, String(error?.stack ?? error).slice(0, 400))
}
await c.close()
done()
