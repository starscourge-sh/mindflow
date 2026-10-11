// The app-wide feel: pages travel the way you went down or up the sidebar and
// the title rolls with them; ⌘K, menus, tooltips and peeks share one floating
// material; a restored Bin row lifts out; the theme dial turns in Settings and
// keeps what it lands on; a theme tried under the pointer glides; offline is
// said once, and a word asked about is looked up again when back.
//
//   QA_ENTRY=out-x/main/index.js MINDFLOW_QA_AWAY=1 node qa/found-motion.mjs [shots]
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { sandbox } from './sandbox-lib.mjs'

const root = mkdtempSync(join(tmpdir(), 'vigil-fm-'))
process.env.QA_DATA = root
process.env.QA_ARGS ??= '--sandbox'
const shots = process.argv[2]
const results = []
const check = (name, ok, detail = '') => { results.push(!!ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`) }
const c = await sandbox({ width: 1100, height: 760 })
const { h, page, electron } = c
const shot = async (name) => shots && (await h.screenshot({ path: join(shots, `${name}.png`) }))
try {
  // --- Page travel ---------------------------------------------------------------------------
  await c.go('home')
  const travel = (label) => h.evaluate(async (l) => {
    const link = document.querySelector(`button[data-side-row][aria-label="${l}"]`)
    if (!link) return null
    link.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    link.click()
    await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)))
    const title = document.querySelector('[data-pane-title] > span')
    const y = (el) => (el ? new DOMMatrix(getComputedStyle(el).transform).m42 : NaN)
    return { title: y(title), text: title?.textContent }
  }, label)
  const down = await travel('Review')
  check('down the sidebar, the new title comes up from below', down && down.title > 0, JSON.stringify(down))
  await h.waitForTimeout(500)
  const up = await travel('Inbox')
  check('up the sidebar, it comes down from above', up && up.title < 0, JSON.stringify(up))
  await h.waitForTimeout(500)
  const overlap = await h.evaluate(async () => {
    const link = document.querySelector('button[data-side-row][aria-label="Home"]')
    link?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    link?.click()
    await new Promise((done) => requestAnimationFrame(done))
    // The page left behind is still there, fading, while the new one comes in: no empty frame.
    return [...document.querySelectorAll('[data-page]')].map((one) => one.dataset.page).join(',')
  })
  check('the old page fades out under the new one', overlap.split(',').length >= 2, overlap)
  await h.waitForTimeout(800)
  const settled = await h.evaluate(() => [...document.querySelectorAll('[data-page]')].map((one) => one.dataset.page).join(','))
  check('then only the new page is left', settled === 'home', settled)

  // --- One floating material -----------------------------------------------------------------
  await h.waitForTimeout(500)
  await h.keyboard.press('Meta+k')
  await h.waitForTimeout(500)
  const panel = await h.evaluate(() => document.querySelector('[aria-label="Search"] .ring-1')?.className ?? '')
  check('⌘K is the floating material', panel.includes('bg-popover') && panel.includes('shadow-(--mf-panel-shadow)'), panel.slice(0, 80))
  await shot('cmdk-float')
  await h.keyboard.press('Escape')
  await h.waitForTimeout(400)

  // --- The Bin ---------------------------------------------------------------------------------
  const id = await h.evaluate(() => window.api.captures.create({ body: 'A thought to let go' }))
  await c.v('capture:discard', id).catch(() => null)
  await h.evaluate((one) => window.api.captures.save(one, { status: 'discarded' }), id)
  await c.go('discarded')
  await h.waitForTimeout(600)
  const lifted = await h.evaluate(async (one) => {
    const row = document.querySelector(`[data-bin-row][data-id="${one}"]`)
    const button = [...(row?.querySelectorAll('button') ?? [])].find((b) => b.textContent?.includes('Restore'))
    if (!button) return 'no row'
    button.click()
    for (let i = 0; i < 40; i++) {
      await new Promise((done) => setTimeout(done, 25))
      const now = document.querySelector(`[data-bin-row][data-id="${one}"]`)
      if (!now) return 'gone at once'
      const o = Number(getComputedStyle(now).opacity)
      if (o < 0.95 && o > 0) return `fading ${o.toFixed(2)}`
    }
    return 'never faded'
  }, id)
  check('a restored row lifts out as it fades', lifted.startsWith('fading'), lifted)

  // --- Theme dial and hover glide ----------------------------------------------------------------
  await c.go('settings')
  await h.waitForTimeout(600)
  const before = await h.evaluate(() => localStorage.getItem('theme'))
  await h.evaluate(() => document.querySelector('[data-theme-dial] [role=slider]')?.scrollIntoView({ block: 'center' }))
  await h.focus('[data-theme-dial] [role=slider]')
  await h.keyboard.press('ArrowRight')
  await h.waitForTimeout(1200)
  const after = await h.evaluate(() => localStorage.getItem('theme'))
  check('the dial in Appearance turns and keeps the theme it rests on', after && after !== before, `${before} → ${after}`)
  await shot('theme-dial')
  await h.evaluate(() => { window.__glided = false; new MutationObserver(() => { if (document.documentElement.hasAttribute('data-theme-glide')) window.__glided = true }).observe(document.documentElement, { attributes: true }) })
  await h.click('[aria-label="Change theme"]')
  await h.waitForTimeout(500)
  await h.hover('[cmdk-item]:nth-child(4)')
  await h.mouse.move(5, 5, { steps: 1 })
  await h.hover('[cmdk-item]:nth-child(6)')
  const glide = await h.evaluate(() => window.__glided)
  check('a theme tried under the pointer glides its colours', glide)
  await h.keyboard.press('Escape')
  await h.waitForTimeout(400)

  // --- Offline, said once ------------------------------------------------------------------------
  await electron.evaluate(({ ipcMain }) => {
    globalThis.__defines = 0
    ipcMain.removeHandler('vigil:define')
    ipcMain.handle('vigil:define', () => (globalThis.__defines++, null))
  })
  await page.evaluate(() => Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false }))
  await page.evaluate(() => window.api.showPrompt())
  await page.waitForTimeout(600)
  await page.locator('.tiptap.ProseMirror').first().click()
  await page.keyboard.type('serendipity', { delay: 15 })
  await page.waitForTimeout(1600)
  const said = await page.evaluate(() => [...document.querySelectorAll('[role=status]')].map((one) => one.textContent).join(' | '))
  check('offline is said, once, in one line', /Offline: definitions and link previews will fill in when you're back/.test(said), said.slice(0, 120))
  const asked = await electron.evaluate(() => globalThis.__defines)
  await page.evaluate(() => { Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => true }); window.dispatchEvent(new Event('online')) })
  await page.waitForTimeout(1200)
  check('back online, the word is looked up again', (await electron.evaluate(() => globalThis.__defines)) > asked, `${asked} → ${await electron.evaluate(() => globalThis.__defines)}`)
  check('no page errors', !c.errors.some((one) => one.includes('PAGEERROR')), c.errors.slice(0, 2).join(' | '))
} finally {
  await c.close()
  rmSync(root, { recursive: true, force: true })
}
console.log(`\n${results.filter(Boolean).length}/${results.length} passed`)
process.exit(results.every(Boolean) ? 0 : 1)
