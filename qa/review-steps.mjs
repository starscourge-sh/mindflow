// Review keeps its place in Back and Forward: each card opened in All cards is a step, as a tab or a deck is.
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
} catch (e) { check('ran', false, e.message.split('\n')[0]) }
await close()
done()
