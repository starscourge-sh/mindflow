// “One line to start” (Settings): quick capture opens as one line, a pill,
// with only the kind icon and ⌘↵ around the caret; a second line grows it
// into the box in one glide that only ever moves toward where it is going;
// the kind icon grows it too and Esc folds that back; ⌘↵ saves and closes.
// Off, the box is as it was (its own probes check the rest).
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-i/main/index.js HALIGTREE_QA_AWAY=1 node qa/box-one-line.mjs
// QA_SHOTS=dir saves light and dark pictures of each stage.
import { CALM_HOUR, sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const c = await sandbox({ width: 1100, height: 760, at: CALM_HOUR })
const { page, v, electron } = c
const results = []
const check = (name, ok, detail = '') => (results.push(!!ok), console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`))
const EDITOR = '.tiptap.ProseMirror.haligtree-editor:not(.is-line)'
const shots = process.env.QA_SHOTS
const height = () => electron.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((w) => !/view=/.test(w.webContents.getURL()))?.getBounds().height)
const visible = () => page.evaluate(() => ({
  // The strip takes room in the card: in the pill it stays in the page at no height, holding only the round controls
  // beside the pill (main.css), so it counts as a header only with a height of its own.
  header: (document.querySelector('[data-drag-strip]')?.getBoundingClientRect().height ?? 0) > 0,
  footer: [...document.querySelectorAll('[data-zen-row]')].some((one) => one.offsetParent),
  ends: getComputedStyle(document.querySelector('[data-pill-ends]') ?? document.body).opacity === '1' && !!document.querySelector('[data-pill-kind]'),
  pill: !!document.querySelector('[data-pill]')
}))
// Every frame's height of the page (the window's inside), from now until read.
const record = () => page.evaluate(() => { window.__heights = []; const tick = () => { window.__heights.push(innerHeight); window.__rec = requestAnimationFrame(tick) }; tick() })
const recorded = () => page.evaluate(() => (cancelAnimationFrame(window.__rec), window.__heights))
// Heights only ever move one way, toward the last.
const oneWay = (list) => {
  const up = list.at(-1) >= list[0]
  return list.every((h, i) => i === 0 || (up ? h >= list[i - 1] : h <= list[i - 1]))
}
const shoot = async (name) => {
  if (!shots) return
  const look = (n) => page.evaluate((t) => (localStorage.setItem('theme', t), window.dispatchEvent(new StorageEvent('storage', { key: 'theme' }))), n)
  for (const theme of ['paper', 'dark']) {
    await look(theme)
    await page.waitForTimeout(1600)
    await page.screenshot({ path: `${shots}/one-line-${name}-${theme}.png` }).catch(() => {})
  }
  await look('paper')
}
let frames = []
const fresh = async () => {
  await page.evaluate(() => window.api.showPrompt())
  await page.waitForTimeout(600)
  await page.click(EDITOR)
  await page.keyboard.press('Meta+a')
  await page.keyboard.press('Backspace')
  await page.waitForTimeout(700)
}

await v('settings:set', { hintRate: 0, rotCount: 0, boxHideButtons: false, boxOneLine: false })
await fresh()
const normal = await height()
check('off: the box as it was (its header and row with Create)', (await visible()).header && (await visible()).footer && normal >= 280, `height ${normal}`)
await shoot('off')

await v('settings:set', { boxOneLine: true })
await page.waitForTimeout(900)
await fresh()
let now = await visible()
let h = await height()
check('on: opens as the pill, one line tall', now.pill && h === 56, `height ${h}`)
check('the pill shows the kind icon and ⌘↵, no header and no row', now.ends && !now.header && !now.footer, JSON.stringify(now))
await shoot('pill')

await page.keyboard.type('Call Mu')
await page.waitForTimeout(500)
check('typing a line keeps the pill', (await visible()).pill && (await height()) === 56)
// One clean line: the kind icon alone at the left (no block handle beside it, no disc behind it), the ends drag the window.
await page.hover(EDITOR); await page.mouse.move(300, 28); await page.waitForTimeout(300)
const looks = await page.evaluate(() => ({
  handles: [...document.querySelectorAll('.tiptap-drag-handle')].filter((one) => one.getClientRects().length && getComputedStyle(one).display !== 'none').length,
  disc: getComputedStyle(document.querySelector('[data-pill-kind]')).backgroundColor,
  drag: [...document.querySelectorAll('[data-pill-drag]')].map((one) => getComputedStyle(one).getPropertyValue('-webkit-app-region') || one.style.webkitAppRegion)
}))
check('the pill shows no block handle beside the kind icon', looks.handles === 0, JSON.stringify(looks))
await page.hover('[data-pill-kind]'); await page.waitForTimeout(300)
const hovered = await page.evaluate(() => getComputedStyle(document.querySelector('[data-pill-kind]')).backgroundColor)
check('the kind icon sits in no grey disc, even under the pointer', /rgba\(0, 0, 0, 0\)|transparent/.test(hovered), hovered)
check('both ends of the pill drag the window', looks.drag.length === 2 && looks.drag.every((one) => one === 'drag'), JSON.stringify(looks.drag))
// A word spelt wrong on the one line: its fix sits beside it, inside the window, not cut off under the line.
await page.keyboard.press('End'); await page.keyboard.type(' teh'); await page.waitForTimeout(2200)
const hint = await page.evaluate(() => { const el = document.querySelector('[data-spell-hint]'); if (!el) return null; const r = el.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, h: innerHeight } })
check('a spelling fix on the pill sits inside the window', !hint || (hint.top >= 0 && hint.bottom <= hint.h), JSON.stringify(hint))
await shoot('spelling')
for (let i = 0; i < 4; i++) await page.keyboard.press('Backspace')
await shoot('typed')

// The / menu from the pill: shown only once there is room for it, all of it inside the window; Esc closes it and the pill comes back.
await record()
await page.keyboard.type(' /')
await page.waitForTimeout(900)
const menu = await page.evaluate(() => {
  const pop = document.querySelector('.tiptap-suggestion-popup')
  const r = pop?.getBoundingClientRect()
  return r ? { shown: getComputedStyle(pop).visibility !== 'hidden' && !('growing' in document.documentElement.dataset), inside: r.top >= 0 && r.bottom <= innerHeight, h: innerHeight } : null
})
frames = await recorded()
check('/ from the pill opens its menu whole, inside the window', menu?.shown && menu.inside, JSON.stringify(menu))
await shoot('slash')
await record()
await page.keyboard.press('Escape')
await page.waitForTimeout(1600)
frames = [...frames, ...(await recorded())]
await page.keyboard.press('Backspace')
await page.keyboard.press('Backspace')
await page.waitForTimeout(400)
check('Esc closes the menu, the box stays up as the pill', (await visible()).pill && (await height()) === 56, `height ${await height()}, frames ${[...new Set(frames)].join(' ')}`)

await record()
await page.keyboard.press('Enter')
await page.keyboard.type('about the trip')
await page.waitForTimeout(900)
frames = await recorded()
h = await height()
check('a second line grows it into the box', !(await visible()).pill && h >= 280, `height ${h}`)
check('the grow only moves down toward its height, never back', oneWay(frames) && frames.length > 3, `${frames.length} frames: ${[...new Set(frames)].join(' ')}`)
check('the row with Create is there once grown', (await visible()).footer)
await shoot('grown')

await record()
await page.keyboard.press('Backspace')
for (let i = 0; i < 'about the trip'.length; i++) await page.keyboard.press('Backspace')
await page.waitForTimeout(1600)
frames = await recorded()
check('back to one line: the pill again', (await visible()).pill && (await height()) === 56, `height ${await height()}`)
check('the fold only moves up toward the pill', oneWay(frames), [...new Set(frames)].join(' '))

await page.click('[data-pill-kind]')
await page.waitForTimeout(800)
check('the kind icon grows it to show the kind picker', !(await visible()).pill && (await visible()).footer && (await height()) >= 280, `height ${await height()}`)
await shoot('kinds')
await page.keyboard.press('Escape')
await page.waitForTimeout(800)
const up = await electron.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((w) => !/view=/.test(w.webContents.getURL()))?.isVisible())
check('Esc folds it back to the pill first, the box still up', (await visible()).pill && up && (await height()) === 56, `height ${await height()}`)

await page.keyboard.press('Meta+Enter')
await page.waitForTimeout(1200)
const gone = await electron.evaluate(({ BrowserWindow }) => !BrowserWindow.getAllWindows().find((w) => !/view=/.test(w.webContents.getURL()))?.isVisible())
const kept = await c.h.evaluate(() => window.api.captures.list()).then((all) => all.some((one) => /Call M/.test(JSON.stringify(one)))).catch(() => null)
check('⌘↵ saves it and closes', gone && kept !== false, `closed ${gone}, kept ${kept}`)

await v('settings:set', { boxOneLine: false })
await page.waitForTimeout(900)
await fresh()
h = await height()
check('off again: the whole box back', !(await visible()).pill && (await visible()).header && h === normal, `height ${h}`)

console.log(c.errors.length ? c.errors.join('\n') : 'no page errors')
console.log(`${results.filter(Boolean).length}/${results.length}`)
await c.close()
process.exit(results.every(Boolean) ? 0 : 1)
