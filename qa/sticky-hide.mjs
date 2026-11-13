// A sticky's "–" folds it into its pill at the screen's edge: it stays on the desk, so nothing is hidden and no card
// says so (hiding one sticky, its "Sticky hidden" card and "Bring it back" were retired with the tabs, K2a). And a
// page shows one guide at a time: with an example on it, its first-visit line steps aside.
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-x/main/index.js HALIGTREE_QA_AWAY=1 [SHOT=<dir>] node qa/sticky-hide.mjs
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const results = []
const check = (name, ok, detail = '') => (results.push(!!ok), console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`))
const c = await sandbox({ width: 1200, height: 820 })
const { electron, h, v } = c
const wait = (ms) => h.waitForTimeout(ms)
const windowOf = async (part) => {
  for (let i = 0; i < 50; i++) {
    const found = electron.windows().find((one) => one.url().includes(part))
    if (found) return found
    await wait(200)
  }
  return null
}
const visible = (part) => electron.evaluate(({ BrowserWindow }, p) => BrowserWindow.getAllWindows().find((one) => one.webContents.getURL().includes(p))?.isVisible() ?? null, part)
try {
  await v('settings:set', { sounds: true, hintRate: 0 })
  await h.evaluate(() => window.api.stick('today', 'today', true))
  const sticky = await windowOf('id=today')
  check('the Today sticky is up', !!sticky)
  await wait(1800)
  // Its controls slide in on hover; a click on the button is what a person makes.
  await sticky.locator('button[aria-label="Fold it into its pill"]').dispatchEvent('click')
  await wait(1200)
  check('its “–” folds it into its pill: still on the desk', (await visible('id=today')) === true && (await sticky.evaluate(() => document.querySelector('[data-desk-pill]')?.getAttribute('data-desk-pill'))) === 'folded')
  const nudge = c.electron.windows().find((one) => one.url().includes('view=nudge'))
  check('and no card says it was hidden', !nudge || !(await nudge.$('[data-nudge="sticky"]')))

  // One guide at a time: an example on the page, so no first-visit line saying the same.
  await h.evaluate(() => window.api.haligtree('settings:set', { hintRate: 0 }))
  await h.evaluate(async () => { for (const task of await window.api.haligtree('tasks')) if (task.recurrence) await window.api.haligtree('task:save', task.id, { status: 'dropped' }) })
  await c.go('routines'); await wait(1200)
  const notes = await h.evaluate(() => ({ example: !!document.querySelector('[data-example-frame]'), hint: [...document.querySelectorAll('[role=note]')].some((one) => one.textContent.includes('again and again')) }))
  check('a page with an example shows no first-visit line beside it', notes.example && !notes.hint, JSON.stringify(notes))
} catch (error) {
  check('ran to the end', false, error.message.split('\n')[0])
} finally {
  const passed = results.filter(Boolean).length
  console.log(`${passed}/${results.length} passed`)
  console.log(c.errors.length ? 'errors: ' + c.errors.slice(0, 3).join(' | ') : 'no page errors')
  await c.close()
  process.exit(passed === results.length ? 0 : 1)
}
