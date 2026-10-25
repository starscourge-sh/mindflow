// Hiding a sticky is never only gone: Haligtree's nudge card says "Sticky hidden"
// with "Bring it back", which puts it on the desktop again. And a page shows
// one guide at a time: with an example on it, its first-visit line steps aside.
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
  await sticky.locator('button[aria-label="Hide this one"]').dispatchEvent('click')
  await wait(900)
  check('hiding it puts it away', (await visible('id=today')) === false)
  const card = await windowOf('view=nudge')
  await wait(900)
  const said = await card?.$eval('[data-nudge="sticky"]', (one) => one.textContent).catch(() => '')
  check('the nudge card says “Sticky hidden”', said?.includes('Sticky hidden') && said.includes('Today'), said)
  if (process.env.SHOT) await card.screenshot({ path: `${process.env.SHOT}/sticky-hidden.png` })
  const heard = await card.evaluate(() => [...(window.haligtreeHeard ?? [])])
  check('the card makes no second sound', !heard.includes('cue:hint'), heard.join(','))
  await card.click('[data-nudge-unhide]')
  await wait(1500)
  check('“Bring it back” puts it on the desktop again', (await visible('id=today')) === true)
  check('and the card goes', !(await card.$('[data-nudge="sticky"]')))

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
