// The piles at scale and at phone width: 5, 50, 500 and 5,000 cards in one deck, 300 decks, a long unbroken
// name, 12,345 due; every tile the same room, nothing past its tile or the window, no sideways scroll at 390px.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox [QA_SHOTS=dir] node qa/pile-scale.mjs
import { join } from 'path'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'
const { check, done } = checks()
const shots = process.env.QA_SHOTS
const c = await sandbox({ width: 1280, height: 860 })
const { h, electron } = c
const call = (...args) => h.evaluate((args) => window.api.haligtree(...args), args)
const waitFor = async (test, ms = 60000) => { for (const end = Date.now() + ms; Date.now() < end; await h.waitForTimeout(200)) if (await test()) return true; return false }
const has = (sel) => h.evaluate((sel) => !!document.querySelector(sel), sel)
const decks = async () => {
  await c.go('review')
  await waitFor(() => has('[data-review-tab]'))
  await h.evaluate(() => document.querySelector('[data-review-tab="decks"]').click())
  await waitFor(() => has('[data-deck-grid] [data-deck]'))
  await h.mouse.move(5, 5)
  await h.waitForTimeout(600)
}
// Every tile: its box, its face inside it, the tab inside the window.
const tiles = () => h.evaluate(() => [...document.querySelectorAll('[data-deck-grid] > [data-row-menu], [data-deck-grid] > [data-deck]')].map((one) => {
  const tile = one.matches('[data-deck]') ? one : one.querySelector('[data-deck]') ?? one
  const r = tile.getBoundingClientRect()
  const face = tile.querySelector(':scope > [data-pile-top]')
  const name = face?.querySelector('h3')
  return { w: Math.round(r.width), h: Math.round(r.height), spill: name ? name.scrollWidth > name.clientWidth + 1 : false, edges: tile.querySelectorAll(':scope > [data-pile-edge]').length, right: Math.round(r.right) }
}))
try {
  await waitFor(() => has('main'))
  const sized = { five: 5, fifty: 50, fivehundred: 500, fivethousand: 5000 }
  const made = Object.entries(sized).flatMap(([tag, n]) => Array.from({ length: n }, (_, at) => ({ term: `Scale ${tag} ${at}?`, meaning: `A ${at} #scale${tag}` })))
  await call('cards:list', made)
  for (const tag of Object.keys(sized)) await call('tag:set', `scale${tag}`, { deck: true })
  await call('cards:list', [{ term: 'Long?', meaning: 'x #supercalifragilisticexpialidociousantidisestablishment' }])
  await call('tag:set', 'supercalifragilisticexpialidociousantidisestablishment', { deck: true })
  await decks()
  const seen = await tiles()
  const edges = await h.evaluate(() => Object.fromEntries(['five', 'fifty', 'fivehundred', 'fivethousand'].map((tag) => [tag, document.querySelectorAll(`[data-own-deck="scale${tag}"] > [data-pile-edge]`).length])))
  check('5 cards: 3 behind; 50, 500 and 5,000: 5 behind', edges.five === 3 && edges.fifty === 5 && edges.fivehundred === 5 && edges.fivethousand === 5, JSON.stringify(edges))
  check('every tile the same room, the long name and 5,000 cards too', new Set(seen.map((one) => `${one.w}x${one.h}`)).size === 1, [...new Set(seen.map((one) => `${one.w}x${one.h}`))].join(' '))
  check('a long unbroken name stays inside its card', seen.every((one) => !one.spill), JSON.stringify(seen.filter((one) => one.spill)))
  if (shots) await h.screenshot({ path: join(shots, 'scale-decks-1280.png') })
  // 300 decks.
  const many = Array.from({ length: 300 }, (_, at) => ({ term: `Many ${at}?`, meaning: `A #heap${at}` }))
  await call('cards:list', many)
  for (let at = 0; at < 300; at++) await call('tag:set', `heap${at}`, { deck: true })
  await decks()
  const count = await h.evaluate(() => document.querySelectorAll('[data-deck-grid] [data-deck]').length)
  const room = await h.evaluate(() => new Set([...document.querySelectorAll('[data-deck-grid] [data-deck]')].map((one) => { const r = one.getBoundingClientRect(); return `${Math.round(r.width)}x${Math.round(r.height)}` })).size)
  check('300 decks: the grid shows them, folded behind "Show N more" or in full, every tile the same room', count > 0 && room === 1, `${count} tiles, ${room} sizes`)
  if (shots) await h.screenshot({ path: join(shots, 'scale-decks-300.png') })
  // Phone width.
  await electron.evaluate(({ BrowserWindow }) => { const w = BrowserWindow.getAllWindows().find((one) => one.webContents.getURL().includes('view=home')); w.setMinimumSize(320, 500); w.setSize(390, 844) })
  await h.waitForTimeout(1200)
  const phone = await h.evaluate(() => {
    const grid = document.querySelector('[data-deck-grid]')
    const page = document.querySelector('[data-deck-shelf]')?.closest('.overflow-auto, .overflow-y-auto') ?? document.scrollingElement
    const out = [...grid.querySelectorAll('[data-deck]')].filter((one) => one.getBoundingClientRect().right > innerWidth + 0.5).length
    return { out, sideways: grid.scrollWidth > grid.clientWidth + 1, page: page.scrollWidth > page.clientWidth + 1, tap: Math.min(...[...grid.querySelectorAll('[data-deck]')].slice(0, 10).map((one) => one.getBoundingClientRect().height)) }
  })
  check('390px: no tile past the window, the deck grid never scrolls sideways, tiles big enough to tap', phone.out === 0 && !phone.sideways && phone.tap >= 32, JSON.stringify(phone))
  if (shots) await h.screenshot({ path: join(shots, 'scale-decks-phone-light.png') })
  await c.look('dark')
  await h.waitForTimeout(400)
  if (shots) await h.screenshot({ path: join(shots, 'scale-decks-phone-dark.png') })
  await c.look('light')
  check('no errors on the page', c.errors.length === 0, c.errors.slice(0, 3).join(' | '))
} finally {
  await c.close()
}
done()
