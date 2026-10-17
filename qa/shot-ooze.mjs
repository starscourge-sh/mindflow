// Quick capture's camera in the footer: closed, mid-ooze and open, light and
// dark (pictures into QA_SHOTS), Esc closing it, the arrows and Return
// picking, and Reduce motion fading only. With every kind and at the box's
// smallest (280 tall) and larger, the two choices open along the footer and
// never cover anything else drawn in the box. The made-up screen stands in.
import { mkdirSync, writeFileSync } from 'fs'
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
const box = (code, a) => c.electron.evaluate(({ BrowserWindow }, [code, a]) => new Function('win', 'a', code)(BrowserWindow.getAllWindows().find((w) => !w.webContents.getURL().includes('view=')), a), [code, a])
// The open choices against everything else drawn in the box: none may sit on another.
// `old`: where they used to open instead, up and to either side, to show what that covered.
const covered = (old = false) => page.evaluate((old) => {
  const camera = document.querySelector('[data-shot-button]')
  const own = camera.getBoundingClientRect()
  const choices = old ? [-30, 30].map((dx) => new DOMRect(own.x + dx, own.y - 34, 28, 28)) : [...camera.querySelectorAll('[data-shot]')].map((one) => one.getBoundingClientRect())
  const hit = []
  for (const one of document.body.querySelectorAll('input, textarea, button, label, a, [contenteditable], svg, p, span, h1, h2, h3, li, [data-placeholder]')) {
    if (camera.contains(one) || one.closest('[role=tooltip], [data-radix-popper-content-wrapper]')) continue
    if (!one.checkVisibility({ opacityProperty: true, visibilityProperty: true })) continue
    if ([...one.children].length && !['INPUT', 'TEXTAREA', 'BUTTON', 'LABEL', 'A', 'svg'].includes(one.tagName) && !one.isContentEditable) continue
    const r = one.getBoundingClientRect()
    if (r.width < 2 || r.height < 2) continue
    if (choices.some((c) => c.left < r.right - 1 && c.right > r.left + 1 && c.top < r.bottom - 1 && c.bottom > r.top + 1)) hit.push(`${one.tagName.toLowerCase()} ${(one.getAttribute('placeholder') ?? one.textContent ?? '').trim().slice(0, 24)}`)
  }
  const inside = choices.every((c) => c.left >= 0 && c.top >= 0 && c.right <= innerWidth && c.bottom <= innerHeight)
  const side = choices.every((c) => Math.abs(c.top - own.top) < 2 && c.left >= own.right)
  const aside = [...document.querySelectorAll('[data-shot-aside]')].map((one) => one.textContent.trim().slice(0, 20))
  return { side, hit, inside, aside }
}, old)
const KINDS = ['Note', 'Task', 'Quote', 'Word', 'Link', 'Decision', 'Experiment', 'Goal']
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
  // Every kind, at the smallest box and larger: the choices open into free space.
  await look('dark')
  for (const height of [280, 420, 640]) {
    await box('const b = win.getBounds(); win.setMinimumSize(200, a); win.setMaximumSize(b.width, a); win.setBounds({ ...b, height: a })', height)
    await page.waitForTimeout(400)
    for (const [index, name] of KINDS.entries()) {
      // Something written, so each kind's own fields (a Word's "Where you met it") are out.
      await page.focus(EDITOR)
      await page.keyboard.press('Meta+a')
      await page.keyboard.type('serendipity', { delay: 5 })
      await page.keyboard.press(`Meta+${index + 1}`)
      await page.waitForTimeout(500)
      await page.click(CAMERA)
      await page.waitForTimeout(450)
      if (name === 'Word') {
        const before = await covered(true)
        check(`Word, ${height} tall: (the old spot, up, would have covered its field)`, before.hit.length > 0, JSON.stringify(before.hit))
      }
      const got = await covered()
      check(`${name}, ${height} tall: they open along the footer and cover nothing`, got.side && !got.hit.length && got.inside, JSON.stringify(got))
      if (SHOTS && (name === 'Word' || name === 'Note')) {
        const png = await c.electron.evaluate(async ({ BrowserWindow }) => (await BrowserWindow.getAllWindows().find((w) => !w.webContents.getURL().includes('view=')).webContents.capturePage()).toPNG().toString('base64'))
        writeFileSync(`${SHOTS}/box-${name.toLowerCase()}-${height}.png`, Buffer.from(png, 'base64'))
      }
      await page.keyboard.press('Escape')
      await page.waitForTimeout(250)
    }
  }
  await box('win.setMaximumSize(0, 0); win.setMinimumSize(200, 200)')
  await page.focus(EDITOR)
  await page.keyboard.press('Meta+a')
  await page.keyboard.press('Backspace')
  await page.keyboard.press('Meta+1')
  await page.waitForTimeout(300)
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
