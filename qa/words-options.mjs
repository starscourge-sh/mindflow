// The Words page (Lookups) offers only what can change something for words: no Kind or Rating sort,
// no "Who said it" or "Came from" with one answer, a small grid to start with; each row says "No meaning yet"; a word's
// menu has no Read or Reading queue. The Inbox, with every kind, still offers them.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox node qa/words-options.mjs [shots folder]
import { mkdirSync } from 'fs'
import { join } from 'path'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'

const SHOTS = process.argv[2] ?? ''
if (SHOTS) mkdirSync(SHOTS, { recursive: true })
const { check, done } = checks()
const c = await sandbox({ width: 1500, height: 950 })
const { h, errors, close, go, v } = c
const lines = () => h.evaluate(() => [...document.querySelectorAll('[role="menu"] [role^="menuitem"], [role="dialog"] button, [role="dialog"] [role="radio"], [role="dialog"] *')].map((one) => (one.children.length ? '' : one.textContent.trim())).filter(Boolean))
try {
  await v('settings:set', { sounds: false, hintRate: 0 })
  await go('lookups'); await h.waitForTimeout(1500)
  await h.keyboard.press('f'); await h.waitForTimeout(600)
  const display = await lines()
  if (SHOTS) await h.screenshot({ path: join(SHOTS, 'words-display.png') })
  check('no Kind or Rating sort', !display.includes('Kind') && !display.includes('Rating'), display.join(', '))
  const pressed = await h.evaluate(() => document.querySelector('[role="dialog"] button[aria-pressed="true"]')?.textContent?.trim() ?? '')
  check('Words start as a small grid', pressed === 'Small grid', pressed)
  check('no “Who said it”', !display.includes('Who said it'))
  // Every word here still waits for its meaning, so a Meaning filter with one answer is left out too.
  check('no “Lookup” filter that every word shares', !display.includes('Lookup'))
  // In List, each word says whether its meaning is written.
  await h.locator('[role="dialog"] button:has-text("List")').last().click(); await h.waitForTimeout(500)
  await h.keyboard.press('Escape'); await h.waitForTimeout(300)
  const rows = await h.evaluate(() => [...document.querySelectorAll('[data-row]')].map((one) => one.innerText))
  check('in List, a word with no meaning says “No meaning yet”', rows.some((one) => /No meaning yet/.test(one)), rows.join(' | '))
  await h.locator('[data-row]').first().click({ button: 'right' }); await h.waitForTimeout(600)
  const menu = await h.evaluate(() => [...document.querySelectorAll('[role="menu"] [role^="menuitem"]')].map((one) => one.innerText.split('\n')[0].trim()))
  if (SHOTS) await h.screenshot({ path: join(SHOTS, 'words-menu.png') })
  check('a word has no Read or Reading queue', !menu.includes('Read') && !menu.includes('Reading queue'), menu.join(', '))
  await h.keyboard.press('Escape'); await h.waitForTimeout(300)
  await go('inbox'); await h.waitForTimeout(1500)
  await h.keyboard.press('f'); await h.waitForTimeout(600)
  const inbox = await lines()
  check('the Inbox, with every kind, still sorts by Kind and shows grids', inbox.includes('Kind') && inbox.includes('Grid'), inbox.join(', '))
  check('no page errors', errors.length === 0, errors.join(' | '))
} finally {
  await close()
}
done()
