// Review answers to Anki's own keys as well as its own: * stars (Anki marks), - and = put the card off to
// tomorrow (Anki buries), @ and ! pause it (Anki suspends), and the shortcut sheet lists them.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox node qa/anki-keys.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'
const { check, done } = checks()
const c = await sandbox({ width: 1200, height: 900 })
const { h } = c
const waitFor = async (test, ms = 8000) => { for (const end = Date.now() + ms; Date.now() < end; await h.waitForTimeout(150)) if (await test()) return true; return false }
const call = (...args) => h.evaluate((args) => window.api.haligtree(...args), args)
const asked = () => h.evaluate(() => document.querySelector('h2')?.textContent ?? '')
const mine = ['Kiwi key one?', 'Kiwi key two?', 'Kiwi key three?', 'Kiwi key four?']
try {
  await call('cards:list', mine.map((term, n) => ({ term, meaning: `Answer ${n} #kiwi` })))
  // Studying the deck, so the keys land on these cards.
  await c.go('review')
  await waitFor(() => h.evaluate(() => !!document.querySelector('[data-review-tab="decks"]')))
  await h.evaluate(() => document.querySelector('[data-review-tab="decks"]').click())
  await waitFor(() => h.evaluate(() => !!document.querySelector('[data-own-deck="kiwi"] [data-deck-study]')))
  await h.evaluate(() => document.querySelector('[data-own-deck="kiwi"] [data-deck-study]').click())
  await waitFor(async () => mine.includes(await asked()))
  check('a card of ours is in front', mine.includes(await asked()), await asked())
  await h.evaluate(() => document.activeElement?.blur())
  await h.keyboard.press('*')
  check('* stars the card', await waitFor(() => h.evaluate(() => document.querySelector('[data-star]')?.getAttribute('aria-pressed') === 'true')))
  const starred = await asked()
  await h.keyboard.press('-')
  check('- puts it off to tomorrow: the next card comes', await waitFor(async () => (await asked()) !== starred))
  const second = await asked()
  await h.evaluate(() => document.activeElement?.blur())
  await h.keyboard.press('@')
  check('@ pauses the card in front', await waitFor(async () => (await call('cards:all')).find((one) => one.prompt === second)?.paused === true), second)
  check('and the next card comes', await waitFor(async () => (await asked()) !== second))
} catch (error) {
  check('the run finished', false, error.message.split('\n')[0])
} finally {
  await c.close()
}
done()
