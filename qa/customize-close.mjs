// Customize sidebar closes: Esc, its × and a click away, opened from the book menu or ⌘K.
//
//   npx electron-vite build --outDir out-x
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/customize-close.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'

const { check, done } = checks()
const s = await sandbox({ width: 1400, height: 560 })
const { h, close } = s
const shown = () => h.evaluate(() => !!document.querySelector('[data-customize-close]'))
const open = async () => {
  await h.locator('aside [data-slot=dropdown-menu-trigger]').last().click()
  await h.waitForTimeout(300)
  await h.locator('[data-peek=customize]').click()
  await h.waitForTimeout(600)
}
try {
  await h.waitForTimeout(1500)
  await open()
  check('opens from the book menu', await shown())
  await h.keyboard.press('Escape')
  await h.waitForTimeout(500)
  check('Esc closes it', !(await shown()))
  await open()
  await h.locator('[data-customize-close]').click()
  await h.waitForTimeout(500)
  check('its × closes it', !(await shown()))
  await open()
  await h.mouse.click(1200, 500)
  await h.waitForTimeout(500)
  check('a click away closes it', !(await shown()))
  // From a row's right-click menu.
  await h.locator('aside').getByText('Inbox', { exact: true }).first().click({ button: 'right' })
  await h.waitForTimeout(400)
  await h.getByText('Customize the sidebar…').last().click()
  await h.waitForTimeout(800)
  check('opens from a row\'s menu', await shown())
  await h.keyboard.press('Escape')
  await h.waitForTimeout(500)
  check('Esc closes it, opened from a row', !(await shown()))
  await h.locator('aside').getByText('Inbox', { exact: true }).first().click({ button: 'right' })
  await h.waitForTimeout(400)
  await h.getByText('Customize the sidebar…').last().click()
  await h.waitForTimeout(800)
  await h.locator('[data-customize-close]').click()
  await h.waitForTimeout(500)
  check('its × closes it, opened from a row', !(await shown()))
  // A page switched on in it (the sidebar redraws), then closed: the × and Esc still close it.
  for (const how of ['×', 'Esc', 'a click away']) {
    await open()
    // Feed switched on or off: the list grows long enough to scroll, which is what kept it open.
    const feed = h.locator('[data-radix-popper-content-wrapper] div').filter({ hasText: /^Feed/ }).last().locator('[role=switch]').first()
    await feed.click()
    await h.waitForTimeout(700)
    if (how === '×') check('its list is long enough to scroll here', await h.evaluate(() => { const c = document.querySelector('[data-customize-close]').closest('[data-slot=popover-content]'); return c.scrollHeight > c.clientHeight + 4 }))
    if (how === '×') await h.locator('[data-customize-close]').click().catch((e) => console.log('click failed', String(e).slice(0, 200)))
    else if (how === 'Esc') await h.keyboard.press('Escape')
    else await h.mouse.click(1200, 500)
    await h.waitForTimeout(600)
    check(`after switching a page on, ${how} closes it`, !(await shown()))
    if (await shown()) await h.keyboard.press('Escape').then(() => h.waitForTimeout(400))
  }
} finally {
  await close()
}
done()
