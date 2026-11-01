// One deck menu: a deck's ⋯ and a right click on it open the same lines, in the same order, on a pocket and
// on a List row, for a deck of your own and a sub-deck. Study first, Delete deck… last; every line has its
// drawing and none the stand-in dot; no tag page. "Deck settings…" opens the settings beside the deck, each
// choice's meaning said once. Light and dark, and 390 wide; frames every 50 ms as the settings open.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox QA_SHOTS=dir node qa/deck-menu.mjs
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
const tab = (id) => h.evaluate((id) => document.querySelector(`[data-review-tab="${id}"]`).click(), id)
const decks = async () => { await c.go('review'); await waitFor(() => has('[data-review-tab]')); await tab('decks'); await waitFor(() => has('[data-deck-shelf]')) }
const look = (to) => h.evaluate((to) => document.querySelector(`[data-deck-look-to="${to}"]`)?.click(), to)
// The open menu's lines, as read: its words, whether it has a drawing and whether that is the dot.
const lines = () => h.evaluate(() => {
  const menu = [...document.querySelectorAll('[role="menu"]')].at(-1)
  if (!menu) return null
  return [...menu.querySelectorAll('[role^="menuitem"]')].map((row) => {
    const icon = row.querySelector('svg')
    return { words: row.textContent.trim(), icon: !!icon && !icon.classList.contains('lucide-chevron-right'), dot: !!row.querySelector('svg.lucide-dot') }
  })
})
const shut = async () => { await h.keyboard.press('Escape'); await waitFor(async () => !(await has('[role="menu"]')), 2000); await h.waitForTimeout(200) }
const bothWays = async (where, name) => {
  await h.locator(where).first().click({ button: 'right' })
  await waitFor(() => has('[role="menu"]'))
  await h.waitForTimeout(150)
  const right = await lines()
  await shut()
  await h.locator(`${where} [data-deck-dots], ${where} button[aria-label="Deck options"]`).first().click()
  await waitFor(() => has('[role="menu"]'))
  await h.waitForTimeout(150)
  const dots = await lines()
  await shut()
  const words = (list) => (list ?? []).map((one) => one.words).join(' | ')
  check(`${name}: ⋯ and right-click open the same lines`, !!right?.length && words(right) === words(dots), `right: ${words(right)}\n    ⋯: ${words(dots)}`)
  return right ?? []
}
try {
  await call('cards:list', [
    { term: 'Quokka capital?', meaning: 'Rottnest #zoology' },
    { term: 'Quokka food?', meaning: 'Leaves #zoology' },
    { term: 'Owl call?', meaning: 'Hoot #zoology-birds' },
    { term: 'Pine needles?', meaning: 'Two to five #botany' }
  ])
  for (const tag of ['zoology', 'zoology-birds', 'botany']) await call('tag:set', tag, { deck: true })
  await h.evaluate(() => localStorage.setItem('haligtree:deck-look', 'pockets'))
  await decks()
  await waitFor(() => has('[data-own-deck="zoology"]'))

  const pocket = await bothWays('[data-own-deck="zoology"]', 'pocket')
  const said = pocket.map((one) => one.words)
  check('Study comes first', /^Study/.test(said[0] ?? ''), said.join(' | '))
  check('Delete deck… comes last', /^Delete deck…/.test(said.at(-1) ?? ''), said.join(' | '))
  check('every line has its drawing, none the stand-in dot', pocket.every((one) => one.icon && !one.dot), JSON.stringify(pocket.filter((one) => !one.icon || one.dot)))
  check('no tag page, no settings spelled out in the menu', !said.some((one) => /its page|tag’s page|As in Settings|seconds|How typed/.test(one)), said.join(' | '))
  check('one line for the settings, and the ways to make cards', ['Deck settings…', 'Make a card', 'Add many at once', 'Cards from a picture', 'Show its cards'].every((one) => said.some((line) => line.startsWith(one))), said.join(' | '))
  check('Move earlier and later only inside "Move"', !said.some((one) => /^Move (earlier|later)/.test(one)) && said.includes('Move'), said.join(' | '))

  // Deck settings…: beside the pocket, each choice's meaning once.
  await h.locator('[data-own-deck="zoology"] [data-deck-dots]').first().click()
  await waitFor(() => has('[role="menu"]'))
  const frames = []
  await h.locator('[role="menuitem"]', { hasText: 'Deck settings…' }).first().click()
  for (let n = 0; n < 12; n++) {
    if (shots) await h.screenshot({ path: join(shots, `settings-open-${String(n).padStart(2, '0')}.png`) })
    frames.push(await h.evaluate(() => { const box = document.querySelector('[data-deck-settings]')?.getBoundingClientRect(); return box ? [Math.round(box.left), Math.round(box.top), Math.round(box.width)] : null }))
    await h.waitForTimeout(50)
  }
  check('Deck settings… opens the deck\'s settings', await has('[data-deck-settings="zoology"]'), JSON.stringify(frames))
  await h.locator('[data-deck-setting="timer"] button[aria-label="20 s"]').click()
  check('a timer chosen is kept', await waitFor(async () => (await call('tag:study')).timer?.zoology === 20))
  const meanings = () => h.evaluate(() => [...document.querySelectorAll('[data-deck-settings] [data-deck-setting] > span:last-child')].map((one) => one.textContent).join(' / '))
  await waitFor(async () => /A clock counts down/.test(await meanings()), 3000)
  const sheet = await meanings()
  check('the timer\'s meaning is said once', (sheet.match(/A clock counts down/g) ?? []).length === 1, sheet)
  const sheetBox = await h.evaluate(() => { const r = document.querySelector('[data-deck-settings]').getBoundingClientRect(); return { top: r.top, bottom: r.bottom, h: innerHeight, scroll: document.querySelector('[data-deck-settings]').scrollHeight - document.querySelector('[data-deck-settings]').clientHeight } })
  check('the settings fit without scrolling at 1200 x 800', sheetBox.scroll <= 1 && sheetBox.bottom <= sheetBox.h, JSON.stringify(sheetBox))
  await h.keyboard.press('Escape')
  await waitFor(async () => !(await has('[data-deck-settings]')), 2000)
  check('Escape puts the settings away', !(await has('[data-deck-settings]')))
  // Each theme, then the settings opened in it (a theme change draws the page again).
  if (shots) for (const theme of ['paper', 'dark']) {
    await c.theme(theme); await h.waitForTimeout(400); await decks(); await waitFor(() => has('[data-own-deck="zoology"]'))
    await h.locator('[data-own-deck="zoology"] [data-deck-dots]').first().click(); await waitFor(() => has('[role="menu"]'))
    await h.locator('[role="menuitem"]', { hasText: 'Deck settings…' }).first().click(); await waitFor(() => has('[data-deck-settings]')); await h.waitForTimeout(300)
    await h.screenshot({ path: join(shots, `settings-${theme}.png`) })
    await h.keyboard.press('Escape'); await waitFor(async () => !(await has('[data-deck-settings]')), 2000)
  }

  // The List: the same menu on each row, a sub-deck's too.
  await look('list')
  await waitFor(() => has('[data-deck-row="zoology"]'))
  const row = await bothWays('[data-deck-row="zoology"]', 'List row')
  check('the List row\'s menu is the pocket\'s, Move aside (it steps up and down there)', row.map((one) => one.words).join('|') === said.join('|'), row.map((one) => one.words).join(' | '))
  await bothWays('[data-deck-row="zoology-birds"]', 'sub-deck row')
  if (shots) for (const theme of ['paper', 'dark']) {
    await c.theme(theme); await h.waitForTimeout(300)
    await h.locator('[data-deck-row="zoology"] [data-deck-dots]').click(); await waitFor(() => has('[role="menu"]')); await h.waitForTimeout(250)
    await h.screenshot({ path: join(shots, `menu-list-${theme}.png`) }); await shut()
    await look('pockets'); await waitFor(() => has('[data-own-deck="zoology"]'))
    await h.locator('[data-own-deck="zoology"] [data-deck-dots]').click(); await waitFor(() => has('[role="menu"]')); await h.waitForTimeout(250)
    await h.screenshot({ path: join(shots, `menu-pocket-${theme}.png`) }); await shut()
    await look('list'); await waitFor(() => has('[data-deck-row="zoology"]'))
  }

  // Show its cards: All cards, only the deck's (its sub-deck's too).
  await h.locator('[data-deck-row="zoology"] [data-deck-dots]').click()
  await waitFor(() => has('[role="menu"]'))
  await h.locator('[role="menuitem"]', { hasText: 'Show its cards' }).first().click()
  check('Show its cards opens All cards', await waitFor(() => has('[data-card-browser]')))

  // 390 wide: the menu and the settings stay on screen.
  await c.size(390, 844); await h.waitForTimeout(600)
  await decks(); await look('list'); await waitFor(() => has('[data-deck-row="zoology"]'))
  await h.locator('[data-deck-row="zoology"] [data-deck-dots]').click()
  await waitFor(() => has('[role="menu"]'))
  const phoneMenu = await h.evaluate(() => { const r = [...document.querySelectorAll('[role="menu"]')].at(-1).getBoundingClientRect(); return { left: r.left, right: r.right, vw: innerWidth, side: document.documentElement.scrollWidth - innerWidth } })
  check('390 wide: the menu stays on screen, nothing scrolls sideways', phoneMenu.left >= 0 && phoneMenu.right <= phoneMenu.vw && phoneMenu.side <= 0, JSON.stringify(phoneMenu))
  if (shots) await h.screenshot({ path: join(shots, 'menu-phone.png') })
  await h.locator('[role="menuitem"]', { hasText: 'Deck settings…' }).first().click()
  await waitFor(() => has('[data-deck-settings]'))
  await h.waitForTimeout(300)
  const phoneSheet = await h.evaluate(() => { const r = document.querySelector('[data-deck-settings]').getBoundingClientRect(); return { left: r.left, right: r.right, vw: innerWidth } })
  check('390 wide: the settings stay on screen', phoneSheet.left >= 0 && phoneSheet.right <= phoneSheet.vw, JSON.stringify(phoneSheet))
  if (shots) await h.screenshot({ path: join(shots, 'settings-phone.png') })
} catch (error) {
  check('the run finished', false, error.message.split('\n')[0])
} finally {
  await c.close()
}
done()
