// Quick capture's camera in the footer: closed, mid-ooze and open, light and
// dark (pictures into QA_SHOTS), Esc closing it, the arrows and Return
// picking, and Reduce motion fading only. With every kind and at the box's
// smallest (280 tall) and larger, the two choices open up in an arc around
// the × and whatever they sit on steps back until they close. The made-up screen stands in.
import { mkdirSync, writeFileSync } from 'fs'
import { sandbox } from './sandbox-lib.mjs'

process.env.HALIGTREE_QA_FAKE_SCREEN = '1'
process.env.HALIGTREE_QA_FAKE_AREA_MS = '600'
const SHOTS = process.env.QA_SHOTS
if (SHOTS) mkdirSync(SHOTS, { recursive: true })
const results = []
const check = (name, ok, detail = '') => (results.push(!!ok), console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`))
const EDITOR = '.tiptap.ProseMirror.haligtree-editor:not(.is-line)'
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
// The open choices against everything else drawn in the box: whatever they sit on has stepped back.
const covered = () => page.evaluate(() => {
  const camera = document.querySelector('[data-shot-button]')
  const own = camera.getBoundingClientRect()
  const choices = [...camera.querySelectorAll('[data-shot]')].map((one) => one.getBoundingClientRect())
  const hit = []
  const under = []
  for (const one of document.body.querySelectorAll('input, textarea, button, label, a, [contenteditable], svg, p, span, h1, h2, h3, li, [data-placeholder]')) {
    if (camera.contains(one) || one.closest('[role=tooltip], [data-radix-popper-content-wrapper]')) continue
    if (!one.checkVisibility({ opacityProperty: true, visibilityProperty: true })) continue
    if ([...one.children].length && !['INPUT', 'TEXTAREA', 'BUTTON', 'LABEL', 'A', 'svg'].includes(one.tagName) && !one.isContentEditable) continue
    const r = one.getBoundingClientRect()
    if (r.width < 2 || r.height < 2) continue
    if (!choices.some((c) => c.left < r.right - 1 && c.right > r.left + 1 && c.top < r.bottom - 1 && c.bottom > r.top + 1)) continue
    const name = `${one.tagName.toLowerCase()} ${(one.getAttribute('placeholder') ?? one.textContent ?? '').trim().slice(0, 24)}`
    const back = one.closest('[data-shot-aside]')
    if (back && Number(getComputedStyle(back).opacity) <= 0.2 && getComputedStyle(one).pointerEvents === 'none') under.push(name)
    else hit.push(name)
  }
  const inside = choices.every((c) => c.left >= 0 && c.top >= 0 && c.right <= innerWidth && c.bottom <= innerHeight)
  // The arc: both above the ×, one up-left (or straight up) and one up-right, clear of it and of each other.
  const [screen, area] = choices
  const arc = choices.every((c) => c.bottom <= own.top + 1) && screen.left <= own.left + 1 && area.left >= own.right - 1 && area.left - screen.right >= 4
  return { arc, hit, under, inside }
})
const asideNow = () => page.$$eval('[data-shot-aside]', (all) => all.length)
const fieldLook = () => page.evaluate(() => {
  const field = document.querySelector('[placeholder="Where you met it"]')
  return field ? getComputedStyle(field).pointerEvents + ' ' + [...(function* () { for (let n = field; n; n = n.parentElement) yield Number(getComputedStyle(n).opacity) })()].reduce((a, b) => a * b, 1).toFixed(2) : 'none'
})
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
    await snap(`note-closed-${theme}`)
    await page.click(CAMERA)
    await page.waitForTimeout(45)
    await snap(`note-opening-${theme}`)
    await page.waitForTimeout(500)
    await snap(`note-open-${theme}`)
    const open = await page.$eval('[data-shot="area"]', (one) => getComputedStyle(one).opacity)
    check(`${theme}: clicking opens both choices`, open === '1', open)
    await page.keyboard.press('Escape')
    await page.waitForTimeout(400)
    const gone = await page.$eval('[data-shot="area"]', (one) => getComputedStyle(one).opacity)
    const box = await page.evaluate(() => document.visibilityState)
    check(`${theme}: Esc closes it and leaves the box open`, gone === '0' && box === 'visible' && !!(await page.$(EDITOR)), gone)
    // A Word, with its "Where you met it" field out, mid-ooze and open.
    await page.focus(EDITOR)
    await page.keyboard.type('serendipity', { delay: 5 })
    await page.keyboard.press('Meta+4')
    await page.waitForTimeout(600)
    await page.click(CAMERA)
    await page.waitForTimeout(45)
    await snap(`word-opening-${theme}`)
    await page.waitForTimeout(500)
    await snap(`word-open-${theme}`)
    await page.keyboard.press('Escape')
    await page.waitForTimeout(300)
    await page.focus(EDITOR)
    await page.keyboard.press('Meta+a')
    await page.keyboard.press('Backspace')
    await page.keyboard.press('Meta+1')
    await page.waitForTimeout(300)
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
      const got = await covered()
      check(`${name}, ${height} tall: they open up in an arc, inside the window, and what they sit on has stepped back`, got.arc && !got.hit.length && got.inside, JSON.stringify(got))
      if (name === 'Word') check(`Word, ${height} tall: "Where you met it" sits under them and has stepped back`, got.under.some((one) => one.includes('Where you met it')) || /^none 0\.1/.test(await fieldLook()), `${JSON.stringify(got.under)} ${await fieldLook()}`)
      if (SHOTS && (name === 'Word' || name === 'Note')) {
        const png = await c.electron.evaluate(async ({ BrowserWindow }) => (await BrowserWindow.getAllWindows().find((w) => !w.webContents.getURL().includes('view=')).webContents.capturePage()).toPNG().toString('base64'))
        writeFileSync(`${SHOTS}/box-${name.toLowerCase()}-${height}.png`, Buffer.from(png, 'base64'))
      }
      await page.keyboard.press('Escape')
      await page.waitForTimeout(250)
      if (name === 'Word') check(`Word, ${height} tall: closing brings it back`, (await asideNow()) === 0 && /^auto 1\.00/.test(await fieldLook()), await fieldLook())
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
  if (SHOTS) (await page.waitForTimeout(300), await snap('note-open-reduced-dark'))
  await page.keyboard.press('Escape')
} catch (error) {
  check('ran to the end', false, String(error).slice(0, 300))
} finally {
  await c.close?.()
}
console.log(`${results.filter(Boolean).length}/${results.length} passed`)
process.exit(results.every(Boolean) ? 0 : 1)
