// Each list offers only what can change something on it. Writing has no "Review" filter (no page is ever
// tested) and no "Forgotten often" or "Note to self"; Gems still filter by kind. A question's right-click menu
// says "Move to the Bin" once. Quick capture's Tasks tab offers no order on Today, where the day sets it.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox node qa/options-fit.mjs [shots folder]
import { mkdirSync } from 'fs'
import { join } from 'path'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'

const SHOTS = process.argv[2] ?? ''
if (SHOTS) mkdirSync(SHOTS, { recursive: true })
const { check, done } = checks()
const c = await sandbox({ width: 1500, height: 950 })
const { h, page, errors, close, go, v } = c
const lines = (at) => at.evaluate(() => [...document.querySelectorAll('[role="dialog"] *')].map((one) => (one.children.length ? '' : one.textContent.trim())).filter(Boolean))
const menu = () => h.evaluate(() => [...document.querySelectorAll('[role="menu"] [role^="menuitem"]')].map((one) => one.innerText.split('\n')[0].trim()))
try {
  await v('settings:set', { sounds: false, hintRate: 0 })
  await go('articles'); await h.waitForTimeout(1500)
  await h.keyboard.press('f'); await h.waitForTimeout(600)
  const writing = await lines(h)
  if (SHOTS) await h.screenshot({ path: join(SHOTS, 'writing-display.png') })
  check('Writing has no “Review” filter, no page is tested', !writing.includes('Review'), writing.join(', '))
  check('Writing has no “By Kanban-plugin” sort, the board switch is not a property', !writing.includes('By Kanban-plugin'), writing.join(', '))
  await h.keyboard.press('Escape'); await h.waitForTimeout(300)

  await go('inbox'); await h.waitForTimeout(1500)
  await h.keyboard.press('f'); await h.waitForTimeout(600)
  const inbox = await lines(h)
  if (SHOTS) await h.screenshot({ path: join(SHOTS, 'inbox-display.png') })
  // Before: By Ask, By Back, By Options weighed, By Reopen only if, By Takeaway, By The call, each held by one note.
  check('the Inbox offers no “By” sort that only one note can answer', inbox.filter((one) => /^By /.test(one)).length < 6, inbox.join(', '))
  await h.keyboard.press('Escape'); await h.waitForTimeout(300)

  await go('nuggets'); await h.waitForTimeout(1500)
  await h.keyboard.press('f'); await h.waitForTimeout(600)
  const gems = await lines(h)
  check('Gems still filter by kind and by review', gems.includes('Kind') && gems.includes('Review'), gems.join(', '))
  await h.keyboard.press('Escape'); await h.waitForTimeout(300)
  // A Word kept as a gem, as a word in the Inbox: nothing to read through or queue.
  await h.locator('[data-row]', { hasText: 'Petrichor' }).first().click({ button: 'right' }); await h.waitForTimeout(600)
  const word = await menu()
  if (SHOTS) await h.screenshot({ path: join(SHOTS, 'word-gem-menu.png') })
  check('a Word gem has no Read or Reading queue', word.length > 0 && !word.includes('Read') && !word.includes('Reading queue'), word.join(', '))
  await h.keyboard.press('Escape'); await h.waitForTimeout(300)
  await h.locator('[data-row]', { hasNotText: 'Petrichor' }).first().click({ button: 'right' }); await h.waitForTimeout(600)
  check('other gems still offer Read', (await menu()).includes('Read'))
  await h.keyboard.press('Escape'); await h.waitForTimeout(300)

  await go('questions'); await h.waitForTimeout(1500)
  await h.locator('[data-row]').first().click({ button: 'right' }); await h.waitForTimeout(600)
  const asked = await menu()
  if (SHOTS) await h.screenshot({ path: join(SHOTS, 'question-menu.png') })
  check('a question’s menu says “Move to the Bin” once', asked.filter((one) => one === 'Move to the Bin').length === 1, asked.join(', '))
  check('a question says “Make it private”, as a note and a gem do', asked.includes('Make it private'), asked.join(', '))
  await h.keyboard.press('Escape'); await h.waitForTimeout(300)

  await go('goals'); await h.waitForTimeout(1500)
  await h.locator('[data-row]').first().click({ button: 'right' }); await h.waitForTimeout(600)
  const goal = await menu()
  check('a goal says “Make it private”, as a note and a gem do', goal.includes('Make it private'), goal.join(', '))
  await h.keyboard.press('Escape'); await h.waitForTimeout(300)

  await page.evaluate(() => window.api.showPrompt()); await page.waitForTimeout(900)
  await page.locator('[data-box-tab-id="today"]').click(); await page.waitForTimeout(700)
  await page.locator('[data-display]').last().click(); await page.waitForTimeout(600)
  const box = await lines(page)
  if (SHOTS) await page.screenshot({ path: join(SHOTS, 'box-tasks-display.png') })
  check('quick capture’s Today offers no order the day overrides', !box.includes('Newest') && !box.includes('Oldest'), box.join(', '))
  await page.keyboard.press('Escape')
  check('no page errors', errors.length === 0, errors.join(' | '))
} finally {
  await close()
}
done()
