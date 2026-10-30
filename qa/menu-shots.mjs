// Light and dark pictures of the menus on a capture, a goal, a task and a folder, to look at by eye.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-l/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox SHOTS=/tmp node qa/menu-shots.mjs
import { sandbox } from './sandbox-lib.mjs'
const c = await sandbox({ width: 1200, height: 900 })
const { h } = c
h.setDefaultTimeout(4000)
const out = process.env.SHOTS ?? '/tmp'
const spots = [['inbox', '[data-row]', 'capture'], ['goals', '[data-row]', 'goal'], ['today', '[data-task-row]', 'task'], ['articles', '[data-group-row]', 'folder']]
try {
  for (const theme of ['light', 'dark']) {
    // Switched in place: a reload would leave the sandbox.
    await h.waitForTimeout(1500)
    await h.evaluate((dark) => document.documentElement.classList.toggle('dark', dark), theme === 'dark')
    for (const [page, selector, name] of spots) {
      await c.go(page)
      const row = h.locator('main, [data-page]').first().locator(`${selector}:visible`).first()
      if (!(await row.count())) { console.log(`  no ${name} row`); continue }
      await row.click({ button: 'right' }); await h.waitForTimeout(500)
      await h.screenshot({ path: `${out}/menu-${name}-${theme}.png` })
      await h.keyboard.press('Escape'); await h.waitForTimeout(200)
    }
  }
} finally {
  await c.close()
}
