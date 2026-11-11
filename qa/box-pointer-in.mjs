// Quick capture hears the pointer itself: moved into the window its controls show (.pointer-in), moved out they go,
// with no message from main (which no longer reads the pointer on a timer). Its strip along the top is no native drag
// region any more, so the pointer is heard there too, and a press on the strip's empty part carries the box, as the
// grabber does (lib/carry.ts).
//
//   npx electron-vite build --outDir out-x
//   QA_ARGS=--sandbox QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/box-pointer-in.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'
process.env.HALIGTREE_QA_VIRTUAL ??= '1'
const { check, done } = checks()
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const c = await sandbox()
const { page, electron } = c
try {
  await page.evaluate(() => window.api.showPrompt())
  await wait(3000)
  const pointerIn = () => page.evaluate(() => document.querySelector('.app-container').classList.contains('pointer-in'))
  const strip = await page.evaluate(() => {
    const el = document.querySelector('[data-drag-strip]')
    if (!el) return null
    const r = el.getBoundingClientRect()
    const s = getComputedStyle(el)
    return { x: r.left + 8, y: r.top + r.height / 2, region: s.getPropertyValue('-webkit-app-region') || s.webkitAppRegion, drag: s.getPropertyValue('--mf-drag').trim() }
  })
  check('the strip is no native drag region, and is carried by Haligtree', !!strip && strip.region !== 'drag' && strip.drag === '1', JSON.stringify(strip))
  await page.mouse.move(400, 200)
  await wait(150)
  check('the pointer moved in: the controls show', await pointerIn())
  await page.evaluate(() => document.documentElement.dispatchEvent(new PointerEvent('pointerleave', { relatedTarget: null })))
  await wait(150)
  check('the pointer gone from the window: they go', !(await pointerIn()))
  if (strip) {
    await page.mouse.move(strip.x, strip.y)
    await wait(100)
    check('over the strip, the page hears the pointer', await pointerIn())
    const box = () => electron.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((w) => /\/index\.html(\?|$)/.test(w.webContents.getURL()) && !w.webContents.getURL().includes('view=')).getBounds())
    const from = await box()
    await page.mouse.down()
    await wait(80)
    await page.mouse.move(strip.x + 50, strip.y + 20)
    await wait(200)
    await page.mouse.up()
    await wait(150)
    const to = await box()
    check('pressed on the strip and moved, the box is carried by as much', to.x - from.x === 50 && to.y - from.y === 20, JSON.stringify({ dx: to.x - from.x, dy: to.y - from.y }))
  }
} catch (error) {
  check('the run finished', false, error.message.split('\n')[0])
} finally {
  await c.close?.()
}
done()
