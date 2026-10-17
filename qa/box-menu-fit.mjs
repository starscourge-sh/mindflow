// A right-click menu for 2 tasks picked in quick capture's Tasks tab is whole
// and on top inside the box's own window, however short the box is (280, its
// smallest, and a few others), right-clicked near the top or the bottom.
// Each line can be reached: seen, or scrolled to inside the menu.
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-x/main/index.js MINDFLOW_QA_AWAY=1 [SHOT=<dir>] node qa/box-menu-fit.mjs
import { mkdirSync, writeFileSync } from 'fs'
import { sandbox } from './sandbox-lib.mjs'

const SHOT = process.env.SHOT ?? ''
if (SHOT) mkdirSync(SHOT, { recursive: true })
const c = await sandbox({ width: 1200, height: 800 })
const { page, electron } = c
const results = []
const check = (name, ok, detail = '') => (results.push(!!ok), console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`))
const wait = (ms) => page.waitForTimeout(ms)
const box = (fn, arg) => electron.evaluate(({ BrowserWindow }, [code, a]) => new Function('win', 'a', code)(BrowserWindow.getAllWindows().find((w) => !w.webContents.getURL().includes('view=')), a), [fn, arg])
const shot = async (name) => {
  const png = await electron.evaluate(async ({ BrowserWindow }) => (await BrowserWindow.getAllWindows().find((w) => !w.webContents.getURL().includes('view=')).webContents.capturePage()).toPNG().toString('base64'))
  writeFileSync(`${SHOT}/${name}.png`, Buffer.from(png, 'base64'))
}
// The menu against the window, and each line: inside the window and the thing drawn there, once scrolled to inside the menu.
const fit = () => page.evaluate(() => {
  const menu = document.querySelector('[role=menu]')
  if (!menu) return null
  const r = menu.getBoundingClientRect()
  const items = [...menu.querySelectorAll('[role=menuitem]')]
  const lost = items.filter((one) => {
    one.scrollIntoView({ block: 'nearest' })
    const at = one.getBoundingClientRect()
    const x = at.left + Math.min(20, at.width / 2), y = at.top + at.height / 2
    if (at.top < 0 || at.bottom > innerHeight || at.left < 0 || at.right > innerWidth) return true
    const top = document.elementFromPoint(x, y)
    return !top || !(one === top || one.contains(top))
  }).map((one) => one.textContent.trim())
  return { top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), right: Math.round(r.right), h: innerHeight, n: items.length, lost }
})
try {
  await c.v('settings:set', { hintRate: 0, motion: false })
  for (let i = 0; i < 4; i++) await c.v('task:add', `Box menu probe task ${i + 1} today`, undefined, true)
  await page.evaluate(() => window.api.showPrompt())
  await wait(900)
  await page.locator('[data-home="task"]').first().click()
  await wait(700)
  for (const height of [280, 300, 360]) {
    for (const where of ['top', 'bottom']) {
      // As short as the box can be: the window held there (as by a screen with no room below it).
      await box('const b = win.getBounds(); win.setBounds({ ...b, height: a }); win.setMaximumSize(b.width, a); win.setMinimumSize(200, a)', height)
      await wait(400)
      const rows = page.locator('[data-row][data-id]')
      const n = await rows.count()
      const pair = where === 'top' ? [0, 1] : [n - 2, n - 1]
      await page.evaluate(() => document.querySelectorAll('[data-picked]').length && window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })))
      for (const i of pair) { await rows.nth(i).scrollIntoViewIfNeeded(); await rows.nth(i).click({ modifiers: ['Shift'] }); await wait(150) }
      await rows.nth(pair[1]).click({ button: 'right' }); await wait(600)
      const f = await fit()
      if (SHOT) await shot(`box-${height}-${where}`)
      check(`${height} tall, right-clicked near the ${where}: the menu for 2 has every line in reach`, f && f.n >= 5 && f.top >= 0 && f.bottom <= f.h && !f.lost.length, JSON.stringify(f))
      await page.keyboard.press('Escape'); await wait(300)
    }
  }
} catch (error) {
  check('ran without error', false, String(error).slice(0, 300))
} finally {
  await c.close()
}
const failed = results.filter((one) => !one).length
console.log(`\n${results.length - failed}/${results.length} passed`)
process.exit(failed ? 1 : 0)
