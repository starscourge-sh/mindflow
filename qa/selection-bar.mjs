// The bar over selected words is always whole and in sight, however long the
// selection and wherever the editor is scrolled: in quick capture, a note in
// the main window, a note window, a gem, a piece of writing and Today's page,
// with a short note and a long one that scrolls. It never hides under the
// editor's own scroll, the box's frame or the fade at its foot; it stays with
// the words while they scroll, and goes when they scroll out of sight.
// ⌘A shows it too, once the whole note has stayed selected a moment, but
// ⌘A then ⌫ never flashes it.
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-x/main/index.js HALIGTREE_QA_AWAY=1 SHOTS=<dir> node qa/selection-bar.mjs
import { mkdirSync } from 'fs'
import { sandbox } from './sandbox-lib.mjs'

const SHOTS = process.env.SHOTS
if (SHOTS) mkdirSync(SHOTS, { recursive: true })
const c = await sandbox({ width: 1100, height: 760 })
const { page, electron, v, h, send, go } = c
const results = []
const check = (name, ok, detail = '') => (results.push(!!ok), console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`))
const shot = (p, name) => SHOTS && p.screenshot({ path: `${SHOTS}/${name}.png`, timeout: 8000 }).catch(() => {})
await v('settings:set', { hintRate: 0, rotCount: 0, motion: false })

const LONG = Array.from({ length: 40 }, (_, i) => `Line ${i + 1} of a long made-up list to scroll through`).join('\n')

// The editor being tested: the largest one on show, marked so the rest can find it.
const mark = (p) => p.evaluate(() => {
  document.querySelectorAll('[data-qa-ed]').forEach((one) => one.removeAttribute('data-qa-ed'))
  const all = [...document.querySelectorAll('.tiptap.ProseMirror')].filter((one) => one.isContentEditable && one.getBoundingClientRect().width > 150)
  all.sort((a, b) => b.getBoundingClientRect().width * Math.min(b.getBoundingClientRect().height, 400) - a.getBoundingClientRect().width * Math.min(a.getBoundingClientRect().height, 400))
  all[0]?.setAttribute('data-qa-ed', '')
  return !!all[0]
})
// Where the bar is, and whether every part of it can be seen: inside the
// window, inside the part of the editor in sight, on top where it is, and under
// no fade.
const bar = (p) => p.evaluate(() => {
  const ed = document.querySelector('[data-qa-ed]')
  const bars = [...document.querySelectorAll('.tiptap-toolbar[data-variant="floating"]')].filter((one) => {
    const holder = one.parentElement
    return holder && holder.isConnected && getComputedStyle(holder).visibility === 'visible' && one.getBoundingClientRect().width > 0
  })
  const one = bars[0]
  if (!one) return { shown: false }
  const r = one.getBoundingClientRect()
  // The part of the editor in sight: the window cut by every ancestor that scrolls.
  let view = { top: 0, left: 0, bottom: innerHeight, right: innerWidth }
  for (let el = ed?.parentElement; el && el !== document.documentElement; el = el.parentElement) {
    const s = getComputedStyle(el)
    if (!/(auto|scroll)/.test(s.overflowX + s.overflowY) || (el.scrollHeight <= el.clientHeight + 1 && el.scrollWidth <= el.clientWidth + 1)) continue
    const b = el.getBoundingClientRect()
    view = { top: Math.max(view.top, b.top), left: Math.max(view.left, b.left), bottom: Math.min(view.bottom, b.bottom), right: Math.min(view.right, b.right) }
  }
  const inside = r.top >= view.top - 1 && r.bottom <= view.bottom + 1 && r.left >= view.left - 1 && r.right <= view.right + 1
  const points = [[r.left + 6, r.top + 6], [r.right - 6, r.top + 6], [r.left + 6, r.bottom - 6], [r.right - 6, r.bottom - 6], [(r.left + r.right) / 2, (r.top + r.bottom) / 2]]
  const over = points.map(([x, y]) => document.elementFromPoint(x, y)).find((hit) => !one.contains(hit))
  const onTop = !over
  let faded = false
  for (let el = one; el; el = el.parentElement) { const s = getComputedStyle(el); if ((s.maskImage && s.maskImage !== 'none') || (s.webkitMaskImage && s.webkitMaskImage !== 'none') || Number(s.opacity) < 0.95) faded = true }
  return { shown: true, whole: inside && onTop && !faded, inside, onTop, faded, over: over ? `${over.tagName}.${String(over.className).slice(0, 50)}` : '', top: Math.round(r.top), bottom: Math.round(r.bottom), view: { top: Math.round(view.top), bottom: Math.round(view.bottom) } }
})
const say = (b) => (b.shown ? `top ${b.top}, bottom ${b.bottom}, in sight ${b.view.top} to ${b.view.bottom}${b.onTop ? '' : `, covered by ${b.over}`}${b.faded ? ', faded' : ''}` : 'not shown')
const scroller = (p) => p.evaluate(() => {
  for (let el = document.querySelector('[data-qa-ed]')?.parentElement; el; el = el.parentElement)
    if (el.scrollHeight > el.clientHeight + 4 && /(auto|scroll)/.test(getComputedStyle(el).overflowY)) return true
  return false
})
const scrollBy = (p, dy) => p.evaluate((d) => {
  for (let el = document.querySelector('[data-qa-ed]')?.parentElement; el; el = el.parentElement)
    if (el.scrollHeight > el.clientHeight + 4 && /(auto|scroll)/.test(getComputedStyle(el).overflowY)) { el.scrollTop += d; return el.scrollTop }
  return -1
}, dy)
// Watches every frame for a bar showing, from now until asked.
const watch = (p) => p.evaluate(() => {
  window.__barSeen = false
  window.__barWatch = true
  const tick = () => {
    if (!window.__barWatch) return
    if ([...document.querySelectorAll('.tiptap-toolbar[data-variant="floating"]')].some((one) => one.parentElement?.isConnected && getComputedStyle(one.parentElement).visibility === 'visible' && one.getBoundingClientRect().width > 0)) window.__barSeen = true
    requestAnimationFrame(tick)
  }
  tick()
})
const seen = (p) => p.evaluate(() => ((window.__barWatch = false), window.__barSeen))
const paste = async (text) => { await electron.evaluate(({ clipboard }, t) => clipboard.writeText(t), text); }

async function surface(p, name, { fill = true } = {}) {
  if (process.env.ONLY && !name.includes(process.env.ONLY)) return
  await p.bringToFront().catch(() => {})
  if (!(await mark(p))) return check(`${name}: an editor to test`, false)
  const ed = p.locator('[data-qa-ed]')
  // Short: one word picked by a double-click shows the bar, whole.
  if (fill) {
    await ed.click()
    await p.keyboard.press('Meta+a'); await p.keyboard.press('Backspace')
    await p.keyboard.type('A short made-up line to pick a word from', { delay: 4 })
  }
  await p.waitForTimeout(400)
  await ed.locator('p').first().dblclick()
  await p.waitForTimeout(700)
  const short = await bar(p)
  check(`${name}, short: a picked word shows the bar, whole`, short.whole, say(short))

  // Long, scrolling.
  await ed.click()
  await p.keyboard.press('Meta+a'); await p.keyboard.press('Backspace')
  await paste(LONG)
  await p.keyboard.press('Meta+v')
  await p.waitForTimeout(900)
  await mark(p)
  const scrolls = await scroller(p)
  check(`${name}, long: the words scroll`, scrolls)

  // ⌘A then ⌫ at once: never a flash of the bar.
  await watch(p)
  await p.keyboard.press('Meta+a'); await p.waitForTimeout(40); await p.keyboard.press('Backspace')
  await p.waitForTimeout(800)
  check(`${name}: ⌘A then ⌫ never flashes the bar`, !(await seen(p)))
  await p.keyboard.press('Meta+z')
  await p.waitForTimeout(600)
  await mark(p)

  // ⌘A, held a moment: the bar, whole.
  await p.keyboard.press('Meta+a')
  await p.waitForTimeout(900)
  const all = await bar(p)
  check(`${name}: ⌘A shows the bar once it has lasted a moment, whole`, all.whole, say(all))
  if (name === 'quick capture') await shot(p, 'box-select-all')

  // At the foot, the last three lines picked.
  await p.keyboard.press('Meta+ArrowDown')
  await p.waitForTimeout(300)
  await p.keyboard.down('Shift'); for (let i = 0; i < 3; i++) await p.keyboard.press('ArrowUp'); await p.keyboard.up('Shift')
  await p.waitForTimeout(800)
  const foot = await bar(p)
  check(`${name}: three lines at the foot of the scroll, whole`, foot.whole, say(foot))

  // Picked from the foot up past the top of what is in sight.
  await p.keyboard.down('Shift'); for (let i = 0; i < 30; i++) await p.keyboard.press('ArrowUp'); await p.keyboard.up('Shift')
  await p.waitForTimeout(800)
  const tall = await bar(p)
  check(`${name}: a pick taller than the editor, whole`, tall.whole, say(tall))
  if (name === 'quick capture') await shot(p, 'box-tall-pick')

  // Scrolled a little with the words still picked: still whole, and moved with them.
  await p.keyboard.press('Meta+ArrowUp')
  await p.waitForTimeout(200)
  await p.keyboard.down('Shift'); for (let i = 0; i < 2; i++) await p.keyboard.press('ArrowDown'); await p.keyboard.up('Shift')
  await p.waitForTimeout(800)
  const before = await bar(p)
  await scrollBy(p, 30)
  await p.waitForTimeout(400)
  const after = await bar(p)
  check(`${name}: scrolled a little, it stays with the words, whole`, before.shown && (!after.shown || after.whole) && (!after.shown || Math.abs((before.top - after.top) - 30) <= 4 || after.top !== before.top), `${say(before)} → ${say(after)}`)
  // Scrolled until the picked lines are out of sight: it goes with them.
  await scrollBy(p, 4000)
  await p.waitForTimeout(500)
  const gone = await bar(p)
  check(`${name}: scrolled out of sight, the bar goes with the words`, !gone.shown, say(gone))
  await scrollBy(p, -4000)
  await p.keyboard.press('Meta+a'); await p.keyboard.press('Backspace')
  await p.waitForTimeout(300)
}

try {
  // Quick capture.
  await page.evaluate(() => window.api.showPrompt())
  await page.waitForTimeout(800)
  await page.keyboard.press('Meta+1')
  await surface(page, 'quick capture')
  await page.keyboard.press('Escape')

  // A note in the main window.
  const note = await h.evaluate(() => window.api.captures.create({ kind: 'note', body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'A made-up note' }] }] } }))
  await send('capture', note)
  await h.waitForTimeout(1400)
  await surface(h, 'a note in the main window')
  await shot(h, 'main-note')

  // The same note in a window of its own.
  await send('capture', note)
  await h.waitForTimeout(900)
  await h.keyboard.press('Meta+o')
  let win
  for (let i = 0; i < 40 && !win; i++) { win = electron.windows().find((one) => one.url().includes('note=')); if (!win) await h.waitForTimeout(150) }
  if (win) { await win.waitForTimeout(1400); await surface(win, 'a note window'); await shot(win, 'note-window'); await electron.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((one) => one.webContents.getURL().includes('note='))?.close()) }
  else check('a note window opened', false)

  // A gem, and a piece of writing.
  const gem = await v('nugget:from', 'A made-up gem to pick words from', {})
  await send('nugget', gem)
  await h.waitForTimeout(1400)
  await surface(h, 'a gem')
  const piece = await v('article:new')
  await send('article', piece)
  await h.waitForTimeout(1400)
  await surface(h, 'a piece of writing')

  // Today's page.
  await go('day')
  await h.waitForTimeout(800)
  await surface(h, "Today's page")
  await shot(h, 'today')
} catch (error) {
  check('the probe ran to its end', false, String(error?.message ?? error).split('\n')[0])
} finally {
  const passed = results.filter(Boolean).length
  console.log(`${passed}/${results.length} passed`)
  console.log(c.errors.length ? 'errors: ' + c.errors.slice(0, 3).join(' | ') : 'no page errors')
  await c.close()
  process.exit(passed === results.length ? 0 : 1)
}
