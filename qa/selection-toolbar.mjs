// The bar over selected words can always be used. In quick capture, with the
// first line picked, it stays off the strip at the top that drags the window
// (going below the words when there is no room above), says no-drag, and a
// click on it applies; the window does not move. In quick capture and a note
// in the main window, every menu on the bar ("Aa", x², the highlighter,
// alignment) opens next to its own button, inside the window, and what you
// pick in it applies.
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-tb/main/index.js HALIGTREE_QA_AWAY=1 node qa/selection-toolbar.mjs
import { sandbox } from './sandbox-lib.mjs'

const c = await sandbox({ width: 1100, height: 760 })
const { page, electron, v, h, send } = c
const results = []
const check = (name, ok, detail = '') => (results.push(!!ok), console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`))
await v('settings:set', { hintRate: 0, rotCount: 0, motion: false })

const BAR = '.tiptap-toolbar[data-variant="floating"]'

// The editor being tested: the largest one on show.
const mark = (p) => p.evaluate(() => {
  document.querySelectorAll('[data-qa-ed]').forEach((one) => one.removeAttribute('data-qa-ed'))
  const all = [...document.querySelectorAll('.tiptap.ProseMirror')].filter((one) => one.isContentEditable && one.getBoundingClientRect().width > 150)
  all.sort((a, b) => b.getBoundingClientRect().width * Math.min(b.getBoundingClientRect().height, 400) - a.getBoundingClientRect().width * Math.min(a.getBoundingClientRect().height, 400))
  all[0]?.setAttribute('data-qa-ed', '')
  return !!all[0]
})
const html = (p) => p.evaluate(() => document.querySelector('[data-qa-ed]')?.innerHTML ?? '')

// Fresh words, and the first line picked.
async function pickFirst(p) {
  const ed = p.locator('[data-qa-ed]')
  await ed.click()
  await p.keyboard.press('Meta+a'); await p.keyboard.press('Backspace')
  await p.keyboard.type('Special demo', { delay: 4 })
  await p.keyboard.press('Enter')
  await p.keyboard.type('A second made-up line', { delay: 4 })
  await p.keyboard.press('Meta+ArrowUp')
  await p.keyboard.press('Home')
  await p.keyboard.press('Shift+Meta+ArrowRight')
  await p.waitForTimeout(700)
}

// The bar on show, where it is against the drag strips, and whether it says no-drag.
const barState = (p) => p.evaluate((sel) => {
  const one = [...document.querySelectorAll(sel)].find((el) => el.isConnected && el.getBoundingClientRect().width > 0 && getComputedStyle(el.parentElement).visibility === 'visible')
  if (!one) return { shown: false }
  const r = one.getBoundingClientRect()
  let foot = 0
  for (const el of document.querySelectorAll('*')) {
    if (getComputedStyle(el).webkitAppRegion !== 'drag') continue
    const b = el.getBoundingClientRect()
    if (b.height > 0 && b.left < r.right && b.right > r.left && b.top < r.bottom && b.bottom > r.top && b.height < 120) foot = Math.max(foot, b.bottom)
  }
  let noDrag = false
  for (let el = one; el; el = el.parentElement) if (getComputedStyle(el).webkitAppRegion === 'no-drag') { noDrag = true; break }
  // How far down the window's drag strip reaches, wherever it is, and where the first line is.
  let strip = 0
  for (const el of document.querySelectorAll('*')) {
    const b = el.getBoundingClientRect()
    if (getComputedStyle(el).webkitAppRegion === 'drag' && b.top <= 1 && b.height > 0 && b.height < 120) strip = Math.max(strip, b.bottom)
  }
  const line = document.querySelector('[data-qa-ed] p')?.getBoundingClientRect()
  return { shown: true, top: Math.round(r.top), bottom: Math.round(r.bottom), overStrip: foot > r.top + 1, strip: Math.round(strip), lineTop: Math.round(line?.top ?? -1), lineBottom: Math.round(line?.bottom ?? -1), noDrag }
}, BAR)

const bounds = () => electron.evaluate(({ BrowserWindow }, url) => BrowserWindow.getAllWindows().find((one) => one.webContents.getURL() === url)?.getBounds(), page.url())

// A button on the bar, clicked as a pointer would.
async function clickIn(p, selector) {
  const box = await p.locator(selector).first().boundingBox()
  if (!box) return null
  await p.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
  return box
}

// Each menu: its button, what to pick in it, and how to tell it applied.
const MENUS = [
  { name: '"Aa"', button: '[aria-label="Format text"]', item: '[role=menu] [aria-label="Bold"]', applied: (s) => /<strong>Special demo<\/strong>/.test(s) },
  { name: 'x²', button: '[aria-label="Superscript and subscript"]', item: '[role=menu] [aria-label="Superscript"]', applied: (s) => /<sup>Special demo<\/sup>/.test(s) },
  { name: 'the highlighter', button: '[aria-expanded]:has(svg):not([aria-label="Format text"]):not([aria-label="Superscript and subscript"]):not([aria-label="Alignment"])', item: '[role=menu] [aria-label$="highlight color"]', applied: (s) => /<mark[^>]*>Special demo<\/mark>/.test(s) },
  { name: 'alignment', button: '[aria-label="Alignment"]', item: '[role=menu] [aria-label="Align centre"]', applied: (s) => /text-align: ?center/.test(s) },
]

async function menus(p, where) {
  for (const menu of MENUS) {
    await pickFirst(p)
    const button = await clickIn(p, `${BAR} ${menu.button}`)
    if (!button) { check(`${where}: ${menu.name} on the bar`, false); continue }
    await p.waitForTimeout(400)
    const panel = await p.evaluate(() => {
      const one = [...document.querySelectorAll('[role=menu]')].find((el) => el.getBoundingClientRect().width > 0)
      if (!one) return null
      const r = one.getBoundingClientRect()
      return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, w: innerWidth, h: innerHeight }
    })
    if (!panel) { check(`${where}: ${menu.name} opens a menu`, false); continue }
    const bx = { left: button.x, top: button.y, right: button.x + button.width, bottom: button.y + button.height }
    const dy = Math.max(0, panel.top - bx.bottom, bx.top - panel.bottom)
    const dx = Math.max(0, panel.left - bx.right, bx.left - panel.right)
    const inside = panel.left >= 0 && panel.top >= 0 && panel.right <= panel.w && panel.bottom <= panel.h
    check(`${where}: ${menu.name} opens next to its button, inside the window`, dy <= 40 && dx <= 40 && inside, `${Math.round(dx)}px across, ${Math.round(dy)}px down; menu at ${Math.round(panel.left)},${Math.round(panel.top)}`)
    await clickIn(p, menu.item)
    await p.waitForTimeout(300)
    check(`${where}: picking in ${menu.name} applies`, menu.applied(await html(p)), (await html(p)).slice(0, 120))
  }
  // Code has no menu: one click.
  await pickFirst(p)
  await clickIn(p, `${BAR} [aria-label="Code"]`)
  await p.waitForTimeout(300)
  check(`${where}: code applies from the bar`, /<code>Special demo<\/code>/.test(await html(p)))
}

try {
  // Quick capture.
  await page.evaluate(() => window.api.showPrompt())
  await page.waitForTimeout(800)
  await page.keyboard.press('Meta+1')
  await page.bringToFront().catch(() => {})
  if (!(await mark(page))) throw new Error('no editor in quick capture')
  await pickFirst(page)
  const state = await barState(page)
  check('quick capture: the first line picked shows the bar', state.shown)
  check('quick capture: the bar stays off the drag strip', state.shown && !state.overStrip, `bar ${state.top} to ${state.bottom}, drag strip down to ${state.strip}, first line ${state.lineTop} to ${state.lineBottom}`)
  check('quick capture: with no room above the first line, the bar opens below it', state.shown && (state.lineTop - state.strip > state.bottom - state.top + 8 || state.top >= state.lineBottom), `${state.lineTop - state.strip}px of room above`)
  check('quick capture: the bar says no-drag', state.noDrag)
  const before = await bounds()
  await clickIn(page, `${BAR} [aria-label="Format text"]`)
  await page.waitForTimeout(300)
  await clickIn(page, '[role=menu] [aria-label="Bold"]')
  await page.waitForTimeout(300)
  const after = await bounds()
  check('quick capture: bold from the bar goes on', /<strong>Special demo<\/strong>/.test(await html(page)))
  check('quick capture: the window did not move', before && after && before.x === after.x && before.y === after.y, `${before?.x},${before?.y} → ${after?.x},${after?.y}`)
  await menus(page, 'quick capture')
  await page.keyboard.press('Meta+a'); await page.keyboard.press('Backspace')
  await page.keyboard.press('Escape')

  // A note in the main window.
  const note = await h.evaluate(() => window.api.captures.create({ kind: 'note', body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'A made-up note' }] }] } }))
  await send('capture', note)
  await h.waitForTimeout(1400)
  await h.bringToFront().catch(() => {})
  if (!(await mark(h))) throw new Error('no editor in the main window')
  await menus(h, 'main window')
} catch (error) {
  check('the probe ran to its end', false, String(error?.message ?? error).split('\n')[0])
} finally {
  const passed = results.filter(Boolean).length
  console.log(`${passed}/${results.length} passed`)
  console.log(c.errors.length ? 'errors: ' + c.errors.slice(0, 3).join(' | ') : 'no page errors')
  await c.close()
  process.exit(passed === results.length ? 0 : 1)
}
