// Cards both ways, as Anki's "Basic (and reversed card)": Make a card's "Both ways" makes two cards, the
// second asking the answer first, both in the deck; Paste cards' "Both ways" makes two a line. The two of a
// pair are siblings: one of them a day in Review (Anki's bury siblings), and an imported Anki note's
// cards the same. Light and dark screenshots of the New card box.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox QA_SHOTS=dir node qa/both-ways.mjs
import { join } from 'path'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'
const { check, done } = checks()
const c = await sandbox({ width: 1200, height: 800 })
const { h } = c
const shots = process.env.QA_SHOTS
const waitFor = async (test, ms = 8000) => { for (const end = Date.now() + ms; Date.now() < end; await h.waitForTimeout(150)) if (await test()) return true; return false }
const call = (...args) => h.evaluate((args) => window.api.haligtree(...args), args)
const has = (selector) => h.evaluate((selector) => !!document.querySelector(selector), selector)
const decks = async () => {
  await c.go('home'); await c.go('review'); await waitFor(() => has('[data-review-tab]'))
  await h.evaluate(() => document.querySelector('[data-review-tab="decks"]').click())
  await waitFor(() => has('[data-own-deck="zoo"]'))
}
const shot = async (name, again) => {
  if (!shots) return
  for (const [theme, said] of [['paper', 'light'], ['dark', 'dark']]) {
    await c.theme(theme)
    await again()
    await h.waitForTimeout(600)
    await h.screenshot({ path: join(shots, `${name}-${said}.png`) })
  }
  await c.theme('paper')
}
try {
  await call('tag:set', 'zoo', { deck: true })
  // 1. Make a card, Both ways: two cards, one each way, both in the deck.
  const openNew = async () => { await decks(); await h.evaluate(() => document.querySelector('[data-own-deck="zoo"] [data-deck-make]').click()); return waitFor(() => has('[data-new-card]')) }
  check('1. Make a card opens', await openNew())
  check('1. it has a "Both ways" switch', await has('[data-new-both]'))
  await h.locator('[data-new-question]').fill('perro')
  await h.locator('[data-new-answer]').fill('dog')
  await h.click('[data-new-both]')
  // ⌘↵ keeps it from anywhere in the box, the switch just pressed too.
  await h.keyboard.press('Meta+Enter')
  const pair = async () => (await call('cards:all')).filter((one) => ['perro', 'dog'].includes(one.prompt))
  check('1. two cards made, one each way', await waitFor(async () => (await pair()).length === 2), JSON.stringify((await pair()).map((one) => one.prompt)))
  const both = await pair()
  check('1. both are in the deck', both.every((one) => one.tags.includes('zoo')), JSON.stringify(both.map((one) => one.tags)))
  check('1. the box counts both', await waitFor(async () => /2 cards made/.test(await h.evaluate(() => document.querySelector('[data-new-made]')?.textContent ?? ''))), await h.evaluate(() => document.querySelector('[data-new-made]')?.textContent ?? 'no box'))
  await shot('both-ways-new-card', async () => { await openNew(); await h.locator('[data-new-question]').fill('gato'); await h.locator('[data-new-answer]').fill('cat'); await h.click('[data-new-both]') })

  // 2. Siblings: one of the pair a day (studying the deck, so the day's new-card limit is not what holds one back).
  const queued = async () => (await call('review:round', '#zoo')).filter((one) => ['perro', 'dog'].includes(one.prompt))
  const first = await queued()
  check('2. only one of the pair in a round of the deck', first.length === 1, JSON.stringify(first.map((one) => one.prompt)))
  if (first[0]) await call('review:grade', first[0].id, 3, 2000)
  check('2. once one is answered, the other waits for tomorrow', !(await call('review:queue')).some((one) => ['perro', 'dog'].includes(one.prompt)))

  // 3. Paste cards, Both ways: two cards a line, said on the button.
  await decks()
  await h.evaluate(() => document.querySelector('[data-own-deck="zoo"] [data-deck-paste]').click())
  check('3. Paste cards offers "Both ways"', await waitFor(() => has('[data-paste-ways]')))
  await h.locator('[data-paste-text]').fill('rojo | red\nazul | blue')
  await h.evaluate(() => document.querySelector('[data-paste-ways] button[aria-label="Both ways"]').click())
  check('3. the button says 4 cards', /Add 4 cards/.test(await h.evaluate(() => document.querySelector('[data-paste-add]')?.textContent ?? '')))
  await h.evaluate(() => document.querySelector('[data-paste-add]').click())
  const pasted = async () => (await call('cards:all')).filter((one) => ['rojo', 'red', 'azul', 'blue'].includes(one.prompt))
  check('3. four cards made, each line both ways', await waitFor(async () => (await pasted()).length === 4), JSON.stringify((await pasted()).map((one) => one.prompt)))
  const today = (await call('review:round', '#zoo')).filter((one) => ['rojo', 'red', 'azul', 'blue'].includes(one.prompt)).map((one) => one.prompt)
  check('3. one card of each line today', today.length === 2 && !(today.includes('rojo') && today.includes('red')), JSON.stringify(today))
} finally {
  await c.close()
}
done()
