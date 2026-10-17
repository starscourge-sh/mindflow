// Quick capture's camera in the footer: closed, mid-ooze and open, light and
// dark (pictures into QA_SHOTS), Esc closing it, the arrows and Return
// picking, and Reduce motion fading only. The made-up screen stands in.
import { mkdirSync } from 'fs'
import { sandbox } from './sandbox-lib.mjs'

process.env.MINDFLOW_QA_FAKE_SCREEN = '1'
process.env.MINDFLOW_QA_FAKE_AREA_MS = '600'
const SHOTS = process.env.QA_SHOTS
if (SHOTS) mkdirSync(SHOTS, { recursive: true })
const results = []
const check = (name, ok, detail = '') => (results.push(!!ok), console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`))
const EDITOR = '.tiptap.ProseMirror.mindflow-editor:not(.is-line)'
const CAMERA = '[data-shot-button] button[aria-label="Take a screenshot"]'

const c = await sandbox({ width: 1200, height: 820 })
const { page, v } = c
const look = (name) => page.evaluate((n) => (localStorage.setItem('theme', n), window.dispatchEvent(new StorageEvent('storage', { key: 'theme' }))), name)
const snap = async (name) => {
  if (!SHOTS) return
  const at = await page.$eval('[data-shot-button]', (one) => { const r = one.getBoundingClientRect(); return { x: r.x, y: r.y } })
  await page.screenshot({ path: `${SHOTS}/${name}.png`, clip: { x: Math.max(0, at.x - 140), y: Math.max(0, at.y - 90), width: 320, height: 140 } })
}
try {
  await v('settings:set', { sounds: false, hintRate: 0, rotCount: 0 })
  await page.evaluate(() => window.api.showPrompt())
  await page.waitForTimeout(900)
  const row = await page.$eval('[data-shot-button]', (one) => !!one.closest('[data-zen-row]'))
  check('the camera sits in the footer row, beside the kind chip', row)
  for (const theme of ['light', 'dark']) {
    await look(theme)
    await page.reload()
    await page.waitForTimeout(1200)
    await page.evaluate(() => window.api.showPrompt())
    await page.waitForTimeout(600)
    await snap(`closed-${theme}`)
    await page.click(CAMERA)
    await page.waitForTimeout(45)
    await snap(`opening-${theme}`)
    await page.waitForTimeout(500)
    await snap(`open-${theme}`)
    const open = await page.$eval('[data-shot="area"]', (one) => getComputedStyle(one).opacity)
    check(`${theme}: clicking opens both choices`, open === '1', open)
    await page.keyboard.press('Escape')
    await page.waitForTimeout(400)
    const gone = await page.$eval('[data-shot="area"]', (one) => getComputedStyle(one).opacity)
    const box = await page.evaluate(() => document.visibilityState)
    check(`${theme}: Esc closes it and leaves the box open`, gone === '0' && box === 'visible' && !!(await page.$(EDITOR)), gone)
  }
  await page.click(EDITOR)
  const images = () => page.$$eval(`${EDITOR} img`, (all) => all.length)
  const had = await images()
  await page.click(CAMERA)
  await page.waitForTimeout(400)
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('Enter')
  await page.waitForTimeout(2200)
  check('the arrows and Return pick “Just an area”', (await images()) === had + 1, `${had} to ${await images()}`)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.click(CAMERA)
  await page.waitForTimeout(30)
  const calm = await page.$eval('[data-shot="area"]', (one) => getComputedStyle(one).transition)
  check('with Reduce motion it fades only', /opacity/.test(calm) && !/transform/.test(calm), calm)
  if (SHOTS) (await page.waitForTimeout(300), await snap('open-reduced-dark'))
  await page.keyboard.press('Escape')
} catch (error) {
  check('ran to the end', false, String(error).slice(0, 300))
} finally {
  await c.close?.()
}
console.log(`${results.filter(Boolean).length}/${results.length} passed`)
process.exit(results.every(Boolean) ? 0 : 1)
