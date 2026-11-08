// ⌘K before typing is calm, as Raycast opens: a few actions (six at most), each its icon and its name alone, keys
// on the right; what the one in focus does is said in the preview beside the list, never under every row. Every
// action is still found by typing. And the deck list lights its whole row under the pointer, as Sources' island
// rows do, never a pill behind the name.
//   QA_ARGS=--sandbox QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/cmdk-actions.mjs
// SHOT=<folder> keeps the pictures, light and dark.
import { CALM_HOUR, sandbox } from './sandbox-lib.mjs'
import { checks } from './harness.mjs'
process.env.QA_ARGS ??= '--sandbox'

const { check, done } = checks()
const c = await sandbox({ width: 1100, height: 800, at: CALM_HOUR })
const { h, v } = c
const wait = (ms) => h.waitForTimeout(ms)
const shots = process.env.SHOT
await v('settings:set', { sounds: false, hintRate: 0, motion: false })

try {
  await c.go('home'); await wait(1200)
  await h.keyboard.press('Meta+k'); await wait(700)
  const rows = () => h.evaluate(() => [...document.querySelectorAll('[data-action-label]')].map((label) => {
    const row = label.closest('button')
    const icon = row.querySelector('svg')
    const hint = row.querySelector('[data-action-hint]')
    return { label: label.textContent, iconFirst: !!icon && icon.getBoundingClientRect().right <= label.getBoundingClientRect().left, dot: !!icon?.classList.contains('lucide-dot'), hint: hint?.textContent ?? '' }
  }))
  const before = await rows()
  console.log('  before typing:', before.map((one) => one.label).join(' | '))
  check('before typing: six actions at most', before.length > 0 && before.length <= 6, before.length)
  check('before typing: each row has its icon before its name, never the fallback dot', before.every((one) => one.iconFirst && !one.dot), before.filter((one) => !one.iconFirst).map((one) => one.label))
  check('before typing: no row carries a hint beside its name (the preview says it)', before.every((one) => !one.hint), before.filter((one) => one.hint).map((one) => one.hint))
  const said = () => h.evaluate(() => document.querySelector('[data-action-said]')?.textContent ?? '')
  // The first with a hint, reached by the arrows: its words in the preview.
  const voice = before.findIndex((one) => one.label === 'Record a voice note')
  check('before typing: "Record a voice note" is offered', voice >= 0)
  for (let i = 0; i < voice; i++) { await h.keyboard.press('ArrowDown'); await wait(80) }
  check('the preview says what the action in focus does', (await said()) === 'Kept as a new capture', await said())
  if (shots) await c.both(`${shots}/cmdk-before`)
  // Every action still found by typing: one far down the list, and a shortened hint read in the preview.
  for (const [words, label, hint] of [['tidy', 'Tidy captures', 'A few minutes tagging your latest captures'], ['apple notes', 'Import from Apple Notes…', null], ['stick today', 'Stick Today on the desktop', null]]) {
    await h.locator('[role=dialog][aria-label=Search] input').first().fill(''); await h.keyboard.type(words, { delay: 20 }); await wait(900)
    const found = await rows()
    check(`typed "${words}": every action row has a drawn icon, never the fallback dot`, found.every((one) => one.iconFirst && !one.dot), found.filter((one) => !one.iconFirst || one.dot).map((one) => one.label))
    check(`typed "${words}": "${label}" is found`, found.some((one) => one.label === label), found.map((one) => one.label))
    if (hint) check(`typed "${words}": the preview says "${hint}"`, (await said()) === hint, await said())
  }
  if (shots) await c.both(`${shots}/cmdk-typed`)
  for (let i = 0; i < 3 && await h.evaluate(() => !!document.querySelector('[role=dialog][aria-label=Search]')); i++) { await h.keyboard.press('Escape'); await wait(400) }

  // The deck list: the row pointed at is lit across, its name has no pill of its own.
  await c.go('review'); await wait(800)
  await h.evaluate(() => document.querySelector('[data-review-tab="decks"]')?.click()); await wait(900)
  const to = h.locator('[data-deck-look-to="list"]')
  if (await to.count()) { await to.click(); await wait(700) }
  const first = h.locator('[data-deck-row]').first()
  check('the deck list shows its decks', (await h.locator('[data-deck-row]').count()) > 0)
  await first.locator('[data-deck-row-study]').hover(); await wait(300)
  const lit = await h.evaluate(() => {
    const row = document.querySelector('[data-deck-row]')
    const name = row.querySelector('[data-deck-row-study]')
    const list = document.querySelector('[data-deck-list]').getBoundingClientRect()
    const r = row.getBoundingClientRect()
    return { row: getComputedStyle(row).backgroundColor, name: getComputedStyle(name).backgroundColor, cursor: getComputedStyle(row).cursor, inset: [Math.round(r.left - list.left), Math.round(list.right - r.right)] }
  })
  check('deck row pointed at: the whole row is lit', lit.row !== 'rgba(0, 0, 0, 0)', lit)
  check('deck row pointed at: no pill behind the name alone', lit.name === 'rgba(0, 0, 0, 0)', lit.name)
  check('deck row: the hand across it', lit.cursor === 'pointer', lit.cursor)
  if (shots) await c.both(`${shots}/deck-list-hover`)

  // Beside it, Sources' island, the look the deck list now matches.
  for (const words of ['Well done is better than well said', 'Fortune favours the bold']) await h.evaluate((text) => window.api.captures.create({ kind: 'quote', body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] } }), words)
  await c.go('sources'); await wait(1400)
  const island = h.locator('[data-missing-row]').first()
  if (await island.count()) {
    await island.hover(); await wait(300)
    const inset = await h.evaluate(() => { const r = document.querySelector('[data-missing-row]').getBoundingClientRect(); const s = document.querySelector('[data-missing-source]').getBoundingClientRect(); return [Math.round(r.left - s.left), Math.round(s.right - r.right)] })
    console.log('  Sources island row inset from its island:', inset.join(', '), ' deck row inset from its list:', lit.inset.join(', '))
    if (shots) await c.both(`${shots}/sources-island-hover`)
  }

  // The smallest window, 560 by 400: no room for the preview, so only the row in focus says what it does.
  await c.size(560, 400); await wait(800)
  await c.go('home'); await wait(600)
  await h.keyboard.press('Meta+k'); await wait(700)
  const narrow = await h.evaluate(() => [...document.querySelectorAll('[data-action-label]')].map((label) => ({ label: label.textContent, hint: label.closest('button').querySelector('[data-action-hint]')?.textContent ?? '', at: label.closest('button').hasAttribute('data-search-at') })))
  check('narrow ⌘K: no preview, and only the row in focus says more', !(await h.evaluate(() => !!document.querySelector('[data-action-line]'))) && narrow.every((one) => one.at || !one.hint), narrow.filter((one) => one.hint).map((one) => one.label))
  await h.keyboard.press('ArrowDown'); await wait(200)
  const second = await h.evaluate(() => document.querySelector('[data-search-at] [data-action-hint]')?.textContent ?? '')
  check('narrow ⌘K: "Record a voice note", in focus, says "Kept as a new capture" on its row', second === 'Kept as a new capture', second)
  if (shots) await c.both(`${shots}/cmdk-narrow`)
} finally {
  await c.close()
}
done()
