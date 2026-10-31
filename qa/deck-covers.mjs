// A deck or tag with no picture wears a cover drawn from Coolshapes, picked by its name: the same
// name gets the same cover on every render, two names get two covers, and it is drawn in the group's
// own colour on paper (light) and charcoal (dark). Checked in All cards' pockets and shelves, Review ›
// Decks (a deck with no pictures) and Your month's tag card, at 14 tags and at 300, light and dark.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox QA_SHOTS=dir node qa/deck-covers.mjs
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { DatabaseSync } from 'node:sqlite'
import { zipSync } from 'fflate'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'
const { check, done } = checks()
const shots = process.env.QA_SHOTS
const dir = mkdtempSync(join(tmpdir(), 'covers-'))

// An Anki deck with no pictures, so Review › Decks has no cover picture for it.
const sqlite = join(dir, 'collection.anki2')
const anki = new DatabaseSync(sqlite)
anki.exec(`create table col (id integer primary key, models text, decks text);
  create table notes (id integer primary key, guid text, mid integer, tags text, flds text);
  create table cards (id integer primary key, nid integer, did integer, ord integer, queue integer);
  create table revlog (id integer primary key, cid integer, ease integer, ivl integer, time integer, type integer);`)
anki.prepare('insert into col values (1, ?, ?)').run(JSON.stringify({ 10: { name: 'Basic', type: 0 } }), JSON.stringify({ 2: { name: 'Geography' } }))
for (const [at, front, back] of [[1, 'Capital of Peru?', 'Lima'], [2, 'Longest river?', 'The Nile'], [3, 'Highest mountain?', 'Everest']]) {
  anki.prepare('insert into notes values (?, ?, 10, ?, ?)').run(at, `g${at}`, '', `${front}\x1f${back}`)
  anki.prepare('insert into cards values (?, ?, 2, 0, 0)').run(100 + at, at)
}
anki.close()
const deckFile = join(dir, 'Geography.apkg')
writeFileSync(deckFile, zipSync({ 'collection.anki2': readFileSync(sqlite), media: Buffer.from('{}') }))

const c = await sandbox({ width: 1280, height: 860 })
const { h } = c
const waitFor = async (test, ms = 30000) => { for (const end = Date.now() + ms; Date.now() < end; await h.waitForTimeout(150)) if (await test()) return true; return false }
const call = (...args) => h.evaluate((args) => window.api.haligtree(...args), args)
const SUBJECTS = ['law', 'psychology', 'physics', 'history', 'art', 'maths', 'biology', 'spanish', 'film', 'philosophy', 'chemistry', 'music', 'economics', 'astronomy']
const make = (count, tags, from = 0) => Array.from({ length: count }, (_, at) => ({ term: `Question ${at + from} about ${tags[(at + from) % tags.length]}?`, meaning: `An answer (${at + from}) #${tags[(at + from) % tags.length]}` }))
const setView = (patch) => h.evaluate((patch) => {
  const was = JSON.parse(localStorage.getItem('view:cards') ?? '{"sort":"due","group":"none","filter":{}}')
  localStorage.setItem('view:cards', JSON.stringify({ ...was, ...patch }))
}, patch)
const openCards = async (patch) => {
  await setView(patch)
  await h.reload()
  await h.waitForLoadState('domcontentloaded')
  await c.go('review')
  await h.evaluate(() => document.querySelector('[data-review-tab="cards"]')?.click())
  await waitFor(() => h.evaluate(() => !!document.querySelector('[data-card-list] :is([data-pick], [data-pocket], [data-shelf])')))
  await h.mouse.move(5, 5)
  await h.waitForTimeout(500)
}
// Every cover on the page: its group, what was drawn, the colour asked for, and the colours it came out in.
const covers = (within) => h.evaluate((within) => [...document.querySelectorAll(`${within} [data-group-cover]`)].map((one) => {
  const probe = document.createElement('i')
  probe.style.color = one.getAttribute('data-cover-tint')
  document.body.append(probe)
  const tint = getComputedStyle(probe).color
  probe.remove()
  const stop = one.querySelector('svg:last-of-type stop')
  return { name: one.getAttribute('data-group-cover'), drawn: one.getAttribute('data-cover'), tint, stop: stop ? getComputedStyle(stop).stopColor : null, page: getComputedStyle(one).backgroundColor, shapes: one.querySelectorAll('svg[data-shape] mask > *').length }
}), within)
// Shown once, then each theme painted in place (no reload), so the run stays short on a busy machine.
const both = async (name, again) => {
  const seen = {}
  await again()
  for (const [theme, said] of [['light', 'light'], ['dark', 'dark']]) {
    await c.look(theme)
    await h.waitForTimeout(600)
    if (shots) await h.screenshot({ path: join(shots, `${name}-${said}.png`) })
    seen[said] = await covers('body')
  }
  await c.look('light')
  return seen
}
const tinted = (list) => list.length > 0 && list.every((one) => one.stop === one.tint && one.shapes > 0)
try {
  await waitFor(() => h.evaluate(() => !!document.querySelector('main')))
  await call('cards:list', make(135, SUBJECTS))
  // Pockets, rendered twice: the same name draws the same cover.
  await openCards({ density: 'small', group: 'none', filter: {} })
  const first = await covers('[data-pocket]')
  await openCards({ density: 'small', group: 'none', filter: {} })
  const second = await covers('[data-pocket]')
  const pockets = await h.evaluate(() => document.querySelectorAll('[data-pocket]').length)
  const fronts = await h.evaluate(() => [...document.querySelectorAll('[data-pocket]')].filter((one) => { const glass = one.querySelector('.mf-glass')?.getBoundingClientRect(); const shape = one.querySelector('.mf-glass [data-group-cover] svg[data-shape]')?.getBoundingClientRect(); return !!glass && !!shape && shape.width > 20 && shape.right > glass.left && shape.left < glass.right }).length)
  check('14: every pocket wears a drawn cover', new Set(first.map((one) => one.name)).size === pockets, `${new Set(first.map((one) => one.name)).size} named covers, ${pockets} pockets`)
  check('14: every pocket\'s glass front shows its cover\'s shapes', fronts === pockets, `${fronts} of ${pockets}`)
  check('a pocket\'s back and front are the same cover', first.every((one) => first.filter((other) => other.name === one.name).every((other) => other.drawn === one.drawn)))
  check('the same name draws the same cover on a second render', first.length > 0 && first.every((one) => second.find((again) => again.name === one.name)?.drawn === one.drawn), JSON.stringify(first.slice(0, 3)))
  const named = [...new Map(first.map((one) => [one.name, one])).values()]
  check('14: no two names share a cover', new Set(named.map((one) => one.drawn)).size === named.length, first.map((one) => `${one.name} ${one.drawn}`).join(', '))
  const pocketsSeen = await both('covers-14-pockets', () => openCards({ density: 'small', group: 'none', filter: {} }))
  check('light: each cover is drawn in its group\'s own colour', tinted(pocketsSeen.light), JSON.stringify(pocketsSeen.light.slice(0, 2)))
  check('dark: each cover is drawn in its group\'s own colour', tinted(pocketsSeen.dark), JSON.stringify(pocketsSeen.dark.slice(0, 2)))
  check('light and dark lay it on their own page (paper, then charcoal)', pocketsSeen.light[0]?.page !== pocketsSeen.dark[0]?.page, `${pocketsSeen.light[0]?.page} / ${pocketsSeen.dark[0]?.page}`)
  // Shelves.
  await openCards({ density: 'grid', group: 'deck' })
  const shelves = await h.evaluate(() => [...document.querySelectorAll('[data-shelf]')].map((one) => { const tile = one.querySelector('header [data-group-cover]')?.getBoundingClientRect(); return !!tile && tile.width >= 44 && tile.width <= 52 }))
  check('14: every shelf wears its cover as a tile about 48px', shelves.length > 3 && shelves.every(Boolean), `${shelves.filter(Boolean).length} of ${shelves.length}`)
  await both('covers-14-shelves', () => openCards({ density: 'grid', group: 'deck' }))
  // A deck with no pictures on Review › Decks.
  await h.evaluate((url) => { location.href = url }, `file://${deckFile}`)
  await waitFor(() => h.evaluate(() => !!document.querySelector('[data-apkg-go], [data-import-done]')))
  await h.evaluate(() => document.querySelector('[data-apkg-go]')?.click())
  await waitFor(() => h.evaluate(() => !!document.querySelector('[data-import-done]')))
  await h.keyboard.press('Escape')
  const openDecks = async () => {
    await c.go('review')
    await h.evaluate(() => document.querySelector('[data-review-tab="decks"]')?.click())
    await waitFor(() => h.evaluate(() => !!document.querySelector('[data-deck="Geography"]')))
  }
  await call('tag:set', 'zymurgy', { deck: true })
  await openDecks()
  await waitFor(() => h.evaluate(() => !!document.querySelector('[data-own-deck="zymurgy"]')))
  const deck = await covers('[data-deck="Geography"]')
  const own = await covers('[data-own-deck="zymurgy"]')
  check('Decks: a deck made by hand wears its drawn cover, the one its pocket wears', own.length === 1 && tinted(own) && own[0].name === '#zymurgy', JSON.stringify(own))
  check('Decks: a deck with no pictures wears its drawn cover, in its colour', deck.length === 1 && tinted(deck), JSON.stringify(deck))
  await both('covers-decks', openDecks)
  // Your month's tag card.
  const openMonth = async () => {
    await c.send('recap', 'yourmonth')
    await waitFor(() => h.evaluate(() => !!document.querySelector('[data-your-month]')))
    for (let step = 0; step < 14 && await h.evaluate(() => !['tag', 'end'].includes(document.querySelector('[data-your-month]')?.getAttribute('data-card') ?? 'end')); step++) {
      await h.keyboard.press('ArrowRight')
      await h.waitForTimeout(250)
    }
  }
  await openMonth()
  const month = await covers('[data-month-card="tag"]')
  const monthShown = await h.evaluate(() => document.querySelector('[data-your-month]')?.getAttribute('data-card'))
  check('Your month: the tag card wears the tag\'s drawn cover, its name in the corner', month.length === 1 && tinted(month) && await h.evaluate(() => !!document.querySelector('[data-month-card="tag"] [data-cover-label]')), `${monthShown} ${JSON.stringify(month)}`)
  if (month.length) await both('covers-month', openMonth)
  await h.keyboard.press('Escape')
  // 300 tags: every cover different, scrolled through.
  const tags = Array.from({ length: 300 }, (_, at) => `${SUBJECTS[at % SUBJECTS.length]}${at >= SUBJECTS.length ? `${Math.floor(at / SUBJECTS.length)}` : ''}`)
  for (let from = 0; from < 1200; from += 600) await call('cards:list', make(600, tags, from))
  await openCards({ density: 'small', group: 'none', filter: {} })
  const drawn = new Map()
  for (let step = 0; step < 200; step++) {
    for (const one of await covers('[data-pocket]')) drawn.set(one.name, one.drawn)
    const moved = await h.evaluate(() => {
      const box = [...document.querySelectorAll('*')].find((one) => one.contains(document.querySelector('[data-pocket]')) && one.scrollHeight > one.clientHeight + 4 && /(auto|scroll)/.test(getComputedStyle(one).overflowY))
      if (!box) return false
      const was = box.scrollTop
      box.scrollTop += box.clientHeight * 0.8
      return box.scrollTop !== was
    })
    if (!moved) break
    await h.waitForTimeout(120)
  }
  check('300: a cover read from at least 300 pockets', drawn.size >= 300, `${drawn.size}`)
  check('300: no two names share a cover', new Set(drawn.values()).size === drawn.size, `${new Set(drawn.values()).size} different of ${drawn.size}`)
  await both('covers-300-pockets', () => openCards({ density: 'small', group: 'none', filter: {} }))
  await both('covers-300-shelves', () => openCards({ density: 'grid', group: 'deck' }))
  check('no errors on the page', c.errors.length === 0, c.errors.slice(0, 3).join(' | '))
} finally {
  await c.close()
  rmSync(dir, { recursive: true, force: true })
}
done()
