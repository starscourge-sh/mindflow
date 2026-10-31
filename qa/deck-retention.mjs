// A deck's own "How much to remember" (Anki's desired retention per deck): in the deck's menu and on its
// tag's page, kept, and used when its cards are graded: a deck at 97% brings a card back far sooner than
// one at 75% after the same answers.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox node qa/deck-retention.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'
const { check, done } = checks()
const c = await sandbox({ width: 1200, height: 800 })
const { h } = c
const waitFor = async (test, ms = 8000) => { for (const end = Date.now() + ms; Date.now() < end; await h.waitForTimeout(150)) if (await test()) return true; return false }
const call = (...args) => h.evaluate((args) => window.api.haligtree(...args), args)
const has = (selector) => h.evaluate((selector) => !!document.querySelector(selector), selector)
try {
  await call('cards:list', [{ term: 'Quokka keep high?', meaning: 'yes #keephigh' }, { term: 'Quokka keep low?', meaning: 'no #keeplow' }])
  await call('tag:set', 'keephigh', { deck: true, retention: 0.97 })
  await call('tag:set', 'keeplow', { deck: true, retention: 0.75 })
  const study = await call('tag:study')
  check('each deck keeps its own', study.retention?.keephigh === 0.97 && study.retention?.keeplow === 0.75, JSON.stringify(study.retention))
  const all = await call('cards:all')
  const high = all.find((one) => one.prompt === 'Quokka keep high?').id
  const low = all.find((one) => one.prompt === 'Quokka keep low?').id
  let highDue, lowDue
  for (let n = 0; n < 4; n++) { highDue = await call('review:grade', high, 3, 3000); lowDue = await call('review:grade', low, 3, 3000) }
  const days = (iso) => (Date.parse(iso) - Date.now()) / 86400000
  check('after the same four Goods, the 97% deck\'s card comes back much sooner', days(highDue) * 2 < days(lowDue), `${days(highDue).toFixed(1)} vs ${days(lowDue).toFixed(1)} days`)

  // In the deck's menu.
  await c.go('review')
  await waitFor(() => has('[data-review-tab="decks"]'))
  await h.evaluate(() => document.querySelector('[data-review-tab="decks"]').click())
  await waitFor(() => has('[data-own-deck="keephigh"]'))
  await h.locator('[data-own-deck="keephigh"] button[aria-label="Deck options"]').first().click()
  await h.waitForTimeout(400)
  const menu = await h.evaluate(() => { const m = document.querySelector('[role="menu"]'); return m ? m.textContent + ' ' + [...m.querySelectorAll('input')].map((one) => one.value).join(' ') : '' })
  check('the deck\'s menu has "How much to remember" with its 97%', /How much to remember/.test(menu) && /97/.test(menu), menu.slice(0, 300))
  await h.keyboard.press('Escape')
  await call('tag:set', 'keephigh', { retention: null })
  check('"As in Settings" takes it off', (await call('tag:study')).retention?.keephigh === undefined)
} catch (error) {
  check('the run finished', false, error.message.split('\n')[0])
} finally {
  await c.close()
}
done()
