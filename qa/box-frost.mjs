// Quick capture over a painting, out of sight: Focus (⇧⌘F) lays a scene
// behind the box's own page, so the box's frost, side panel and footer sit
// over a painting inside the page itself and a screenshot sees them. In a
// dark theme and a light one: one even frost, no solid band, words readable.
// The desktop blur behind the window itself is the Mac's own (vibrancy) and
// is never in a page screenshot; this shows everything Haligtree paints over it.
//   SHOT=dir QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/box-frost.mjs
import { sandbox } from './sandbox-lib.mjs'

const c = await sandbox({ width: 1100, height: 760 })
const { page, h, v } = c
const results = []
const check = (name, ok, detail = '') => (results.push(!!ok), console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`))
const shots = process.env.SHOT
try {
  await v('settings:set', { hintRate: 0, rotCount: 0, motion: false, scenery: true, sceneryFocus: true })
  for (const theme of ['dark', 'paper']) {
    await h.evaluate((n) => { localStorage.setItem('theme', n); window.dispatchEvent(new StorageEvent('storage', { key: 'theme' })) }, theme)
    await page.evaluate(() => window.api.showPrompt())
    await page.waitForTimeout(900)
    await page.evaluate(() => window.dispatchEvent(new StorageEvent('storage', { key: 'theme' })))
    await page.keyboard.press('Meta+a'); await page.keyboard.press('Backspace')
    await page.keyboard.type('Plan the garden shed: measure the corner by the fence, then price the timber.', { delay: 4 })
    if (!(await page.locator('[aria-label="Hide the side panel"]').count())) await page.locator('[aria-label="Show the side panel"]').click()
    await page.evaluate(() => { document.documentElement.dataset.focus = 'on' })
    // The scene decoded and faded in.
    await page.waitForFunction(() => [...document.querySelectorAll('img')].some((img) => img.complete && img.naturalWidth > 200 && img.getBoundingClientRect().width > 300), null, { timeout: 30000 }).catch(() => {})
    await page.waitForTimeout(1800)
    const scene = await page.evaluate(() => [...document.querySelectorAll('img')].some((img) => img.complete && img.naturalWidth > 200 && img.getBoundingClientRect().width > 300))
    check(`${theme}: a painting is behind the box`, scene)
    // Near-solid fills wider than a line over the painting: the slabs the frost must not have.
    const slabs = await page.evaluate(() => [...document.querySelectorAll('.app-container *')].filter((el) => {
      const m = /rgba?\(([^)]+)\)/.exec(getComputedStyle(el).backgroundColor)
      if (!m) return false
      const alpha = m[1].split(/[ ,/]+/).filter(Boolean)[3]
      const r = el.getBoundingClientRect()
      return (alpha === undefined || Number(alpha) > 0.3) && r.width > 200 && r.height > 24 && !el.closest('[role=dialog],[role=menu],[data-radix-popper-content-wrapper],.tiptap-find-bar')
    }).map((el) => String(el.className).slice(0, 60)))
    check(`${theme}: no solid band over the painting`, !slabs.length, JSON.stringify(slabs))
    if (shots) await page.screenshot({ path: `${shots}/box-frost-${theme}.png` })
    // The same with the scene's dimming lifted, so any band the box paints over it shows plainly.
    await page.evaluate(() => { const scene = document.querySelector('.app-container .fixed.inset-0.-z-10'); const dim = scene?.lastElementChild; if (dim) dim.style.background = 'transparent'; scene?.querySelectorAll('img').forEach((img) => (img.style.filter = 'none')) })
    await page.waitForTimeout(300)
    if (shots) await page.screenshot({ path: `${shots}/box-frost-${theme}-undimmed.png` })
    await page.evaluate(() => { document.documentElement.dataset.focus = 'off' })
    await page.keyboard.press('Meta+a'); await page.keyboard.press('Backspace')
    await page.keyboard.press('Escape')
    await page.waitForTimeout(500)
  }
} catch (error) {
  check('the probe ran to its end', false, String(error?.message ?? error).split('\n')[0])
} finally {
  const passed = results.filter(Boolean).length
  console.log(`${passed}/${results.length} passed`)
  console.log(c.errors.length ? 'errors: ' + c.errors.slice(0, 3).join(' | ') : 'no page errors')
  await c.close()
  process.exit(passed === results.length ? 0 : 1)
}
