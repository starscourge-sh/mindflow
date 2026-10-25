// The [[ menu in the Journal's writing box (the user's report): scrolling its
// own list, or the page while its line is still in view, keeps it open; only
// its line leaving sight closes it.
//
//   npx electron-vite build --outDir out-lm
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=$PWD/out-lm/main/index.js HALIGTREE_QA_AWAY=1 node qa/link-menu-scroll.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'

const { check, done } = checks()
const c = await sandbox({ width: 1280, height: 860 })
const { h, go, v } = c
const wait = (ms) => h.waitForTimeout(ms)
const popup = h.locator('.tiptap-suggestion-popup')

try {
  await v('settings:set', { sounds: false, hintRate: 0 })
  await go('inbox')
  await h.locator('nav [data-side-row][aria-label="Journal"]').first().click()
  await wait(1500)
  await h.keyboard.type('[[')
  await wait(900)
  check('the [[ menu opens', (await popup.count()) === 1)
  // Its own list, scrolled with the wheel over it.
  const list = await popup.first().boundingBox()
  await h.mouse.move(list.x + list.width / 2, list.y + list.height / 2)
  await h.mouse.wheel(0, 300)
  await wait(500)
  check('scrolling the menu\'s list keeps it open', (await popup.count()) === 1)
  // The page, a little, with the line still in view.
  await h.mouse.move(list.x + list.width + 200, list.y + 40)
  await h.mouse.wheel(0, 120)
  await wait(500)
  const inView = await h.evaluate(() => { const r = window.getSelection()?.getRangeAt(0).getBoundingClientRect(); return !!r && r.top > 0 && r.bottom < innerHeight })
  check('scrolling the page a little keeps it open', !inView || (await popup.count()) === 1, `line in view ${inView}`)
  // The page, far, until the line is gone.
  for (let i = 0; i < 6; i++) await h.mouse.wheel(0, 600)
  await wait(600)
  const gone = await h.evaluate(() => { const r = window.getSelection()?.getRangeAt(0).getBoundingClientRect(); return !r || r.bottom < 0 })
  check('its line scrolled out of sight closes it', !gone || (await popup.count()) === 0, `line gone ${gone}`)
  check('no page errors', !c.errors.some((one) => one.includes('PAGEERROR')), c.errors.join(' | '))
} catch (error) {
  check('ran', false, error.stack)
} finally {
  await c.close()
}
done()
