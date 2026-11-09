// Review keeps its place in Back and Forward: each card opened in All cards is a step, as a tab, a deck or a "Show its cards" list is; the ← button and its menu (each step named by its place) agree.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox node qa/review-steps.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'

const { check, done } = checks()
const s = await sandbox({ width: 1400, height: 900 })
const { h, v, go, close } = s
const wait = (ms) => h.waitForTimeout(ms)
const open = () => h.evaluate(() => [...document.querySelectorAll('[data-card-row]')].find((one) => one.querySelector('.ProseMirror'))?.getAttribute('data-card-row') ?? null)
const back = async () => { await h.keyboard.press('Meta+BracketLeft'); await wait(700) }
const forward = async () => { await h.keyboard.press('Meta+BracketRight'); await wait(700) }
try {
  await v('settings:set', { hintRate: 0 })
  await go('review'); await wait(1200)
  await h.locator('[data-review-tab="cards"]').click(); await wait(1200)
  const rows = await h.evaluate(() => [...document.querySelectorAll('[data-card-row]')].slice(0, 3).map((one) => one.getAttribute('data-card-row')))
  check('cards to open', rows.length >= 2, JSON.stringify(rows))
  await h.locator(`[data-card-row="${rows[0]}"] > *`).first().click({ position: { x: 30, y: 20 } }); await wait(800)
  check('a card clicked opens', await open() === rows[0], await open())
  await h.locator(`[data-card-row="${rows[1]}"] > *`).first().click({ position: { x: 30, y: 20 } }); await wait(800)
  check('another card clicked opens', await open() === rows[1], await open())
  if (process.env.QA_SHOTS) await h.screenshot({ path: process.env.QA_SHOTS + '/second-card.png' })
  await back()
  check('Back: the card before is open again', await open() === rows[0], await open())
  await back()
  check('Back again: All cards with none open', await open() === null && (await h.locator('[data-review-tab="cards"][aria-selected="true"]').count()) === 1, await open())
  await back()
  check('Back again: the Decks tab it came from', (await h.locator('[data-review-tab="decks"][aria-selected="true"]').count()) === 1)
  await forward(); await forward()
  check('Forward twice: that first card open again', await open() === rows[0], await open())

  // Back's menu (right-click, as held) names each of Review's steps by its place, never "Review" over and over.
  const menu = () => h.evaluate(() => [...document.querySelectorAll('[role="menu"] [role="menuitem"]')].map((one) => one.textContent.replace(/\s+/g, ' ').trim()))
  const esc = async () => { await h.keyboard.press('Escape'); await wait(400) }
  const backButton = h.locator('[data-pane] [data-tab-step="back"]').last()
  await backButton.click({ button: 'right' }); await wait(600)
  const atFirst = await menu()
  check('Right-click on ← leaves the card open', await open() === rows[0], await open())
  check('Back menu on a card: All cards, then Decks', atFirst[0] === 'Review › All cards' && atFirst[1] === 'Review › Decks', atFirst.join(' | '))
  await esc()
  await h.locator(`[data-card-row="${rows[1]}"] > *`).first().click({ position: { x: 30, y: 20 } }); await wait(800)
  await backButton.click({ button: 'right' }); await wait(600)
  const lines = await menu()
  await esc()
  const first = await h.evaluate((one) => document.querySelector(`[data-card-row="${one}"]`)?.textContent?.replace(/\s+/g, ' ') ?? '', rows[0])
  const named = lines[0]?.replace('Review › ', '') ?? ''
  check('Back menu names the card before by its front', lines[0]?.startsWith('Review › ') && named.length > 3 && first.includes(named.slice(0, 20)), `${lines[0]} (row: ${first.slice(0, 60)})`)
  check('Back menu then names All cards and Decks', lines[1] === 'Review › All cards' && lines[2] === 'Review › Decks', lines.join(' | '))
  // The ← button: one step back, onto the card before.
  await backButton.click(); await wait(800)
  check('The ← button: the card before is open again', await open() === rows[0], await open())

  // "Show its cards" on a deck: just its cards, as a step; Back is the Decks tab, Forward the same few cards.
  await h.locator('[data-review-tab="decks"]').click(); await wait(1200)
  const count = () => h.evaluate(() => document.querySelectorAll('[data-card-row]').length)
  const deck = h.locator('[data-own-deck]').first()
  await deck.click({ button: 'right' }); await wait(600)
  await h.locator('[role="menu"] [role="menuitem"]:has-text("Show its cards")').first().click(); await wait(1500)
  const just = await count()
  const shown = (await h.locator('[data-cards-all]').count()) === 1
  check('"Show its cards" shows just its cards', shown && just > 0, `${just} cards, "Show every card" ${shown}`)
  await back()
  check('Back from them: the Decks tab', (await h.locator('[data-review-tab="decks"][aria-selected="true"]').count()) === 1)
  await forward(); await wait(600)
  check('Forward: just those cards again', (await count()) === just && (await h.locator('[data-cards-all]').count()) === 1, `${await count()} of ${just}`)
  await h.locator('[data-cards-all]').click(); await wait(1200)
  const every = await count()
  check('"Show every card" is a step: Back returns to just those', every > just && (await back(), (await count()) === just), `${every} then ${await count()}`)
  await backButton.click({ button: 'right' }); await wait(600)
  const names = await menu()
  await esc()
  check('Back menu from just those: the Decks tab, by name', names[0] === 'Review › Decks', names.join(' | '))
  await forward()
  await backButton.click({ button: 'right' }); await wait(600)
  const after = await menu()
  await esc()
  check(`Back menu from every card: just those, by how many ("${just} cards")`, after[0] === `Review › ${just} cards`, after.join(' | '))

  // A card's edits are kept on every way out, not only the ← button: ⌘[ and leaving for another page. Opened
  // and left untouched, nothing is saved.
  const promptOf = (id) => v('cards:all').then((all) => all.find((one) => one.id === id)?.prompt)
  const kept = () => h.getByText(/^Card kept/).count()
  const edit = async (id, words) => {
    await h.locator(`[data-card-row="${id}"] > *`).first().click({ position: { x: 30, y: 20 } }); await wait(800)
    const field = h.locator('input[data-card-edit]').first()
    if (words) { await field.press('End'); await field.type(words) }
  }
  await go('review'); await wait(1000)
  await h.locator('[data-review-tab="cards"]').click(); await wait(1200)
  const ids = await h.evaluate(() => [...document.querySelectorAll('[data-card-row]')].slice(0, 2).map((one) => one.getAttribute('data-card-row')))
  await wait(4500)
  await edit(ids[0], '')
  await back(); await wait(500)
  check('a card opened and left by ⌘[ untouched: nothing saved', (await kept()) === 0, `${await kept()} "Card kept"`)
  await edit(ids[0], ' (by back)')
  await back(); await wait(800)
  check('⌘[ with a card edited: its edit is kept', (await promptOf(ids[0]))?.endsWith(' (by back)'), await promptOf(ids[0]))
  await wait(4500)
  await edit(ids[1], ' (by leaving)')
  await go('articles'); await wait(1000)
  check('another page with a card edited: its edit is kept', (await promptOf(ids[1]))?.endsWith(' (by leaving)'), await promptOf(ids[1]))
} catch (e) { check('ran', false, e.message.split('\n')[0]) }
await close()
done()
