// Two fingers sideways go Back and Forward, Dia's way (swipe-back.tsx):
// short of the line cancels, past it goes back once (never twice), resting
// there opens the list, ↓ Enter goes to that page, Esc closes it, two fingers
// down then let go picks, a sideways scroller under the pointer keeps the
// wheel, and split panes go back in their own pane. FRAMES=dir writes a frame
// a wheel step through one swipe, light and dark.
//   QA_ARGS=--sandbox QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/swipe-back.mjs
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'
const results = []
const check = (name, ok, detail = '') => (results.push(!!ok), console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`))
const c = await sandbox({ width: 1300, height: 900 })
const { h, go, look } = c
const FRAMES = process.env.FRAMES

const titles = () => h.evaluate(() => [...document.querySelectorAll('[data-pane]')].map((pane) => pane.querySelector('[data-pane-head] span')?.textContent?.trim() || document.querySelector('[data-pane-title]')?.textContent?.trim() || '?'))
const title = async () => (await titles())[0]
// One wheel step at a point, as the trackpad sends it.
const wheel = (x, y, dx, dy = 0) => h.evaluate(([x, y, dx, dy]) => document.elementFromPoint(x, y).dispatchEvent(new WheelEvent('wheel', { deltaX: dx, deltaY: dy, bubbles: true, cancelable: true })), [x, y, dx, dy])
const lift = () => h.evaluate(() => window.dispatchEvent(new Event('haligtree:swipe-lifted')))
const arrow = () => h.evaluate(() => document.querySelector('[data-swipe-arrow]')?.dataset.swipeArrow ?? null)
const listRows = () => h.evaluate(() => [...document.querySelectorAll('[data-swipe-list] [role=option]')].map((one) => one.textContent.trim()))
const X = 700, Y = 450
const swipe = async (steps, dx = -12, x = X, frames) => {
  for (let n = 0; n < steps; n++) {
    await wheel(x, Y, dx)
    await h.waitForTimeout(16)
    if (frames) await h.screenshot({ path: `${frames}-${String(n).padStart(2, '0')}.png` })
  }
}
const pause = (ms) => h.waitForTimeout(ms)

await go('questions'); await go('settings'); await go('articles'); await go('nuggets')
const start = await title()
console.log('trail ends on', start)

await swipe(5); await pause(60)
check('the arrow follows the fingers in', (await arrow()) === 'pulling')
await lift(); await pause(400)
check('let go short of the line: nothing happens', (await title()) === start && !(await arrow()), await title())

await pause(300)
await swipe(14); await pause(30)
check('past the line it is armed', (await arrow()) === 'armed')
// Let go: the trackpad's glide (each step shorter), the rest of it, then main's word that the scroll ended.
for (const d of [-10, -8, -6, -4, -3, -2, -2, -1, -1, -1]) (await wheel(X, Y, d), await pause(16))
await lift(); await pause(600)
const back1 = await title()
check('let go past the line goes back', back1 !== start, back1)
check('...once, never twice', back1 === 'Writing' && !(await arrow()), back1)

await h.keyboard.press('Meta+BracketRight'); await pause(700)
check('⌘] comes forward again', (await title()) === start)

await pause(300)
await swipe(14); await pause(1300)
const rows = await listRows()
check('resting past the line opens the pages behind, nearest first', rows.length >= 2, rows.join(' | '))
if (FRAMES) await c.both(`${FRAMES}/list`)
await h.keyboard.press('ArrowDown'); await h.keyboard.press('Enter'); await pause(800)
check('↓ Enter goes to that page', (await title()) === rows[1] && !(await listRows()).length, await title())

await h.keyboard.press('Meta+BracketRight'); await pause(400); await h.keyboard.press('Meta+BracketRight'); await pause(700)
await pause(300)
await swipe(14); await pause(1300)
await h.keyboard.press('Escape'); await pause(400)
check('Esc closes the list and stays', (await title()) === start && !(await listRows()).length, await title())

await pause(300)
await swipe(14); await pause(1300)
const rows2 = await listRows()
await pause(300)
await wheel(X, Y, 0, 40); await pause(50)
await lift(); await pause(800)
check('two fingers down then let go picks the next one', (await title()) === rows2[1], await title())

// A sideways scroller under the pointer that can still go keeps the wheel.
await h.keyboard.press('Meta+BracketRight'); await pause(400); await h.keyboard.press('Meta+BracketRight'); await pause(700)
await h.evaluate(([x, y]) => {
  const box = document.createElement('div')
  box.id = 'qa-scroller'
  Object.assign(box.style, { position: 'fixed', left: `${x - 150}px`, top: `${y - 50}px`, width: '300px', height: '100px', overflowX: 'auto', zIndex: 40 })
  box.innerHTML = '<div style="width:1200px;height:80px"></div>'
  document.body.append(box)
  box.scrollLeft = 200
}, [X, Y])
await pause(300)
await swipe(14); await pause(100)
check('a sideways scroller under the pointer wins', !(await arrow()))
await lift(); await pause(400)
await h.evaluate(() => document.getElementById('qa-scroller').remove())
check('...and nothing went back', (await title()) === start)

if (FRAMES) {
  for (const name of ['light', 'dark']) {
    await look(name); await pause(300)
    await swipe(16, -10, X, `${FRAMES}/swipe-${name}`)
    await pause(1300)
    await h.screenshot({ path: `${FRAMES}/swipe-${name}-held.png` })
    await h.keyboard.press('Escape'); await pause(500)
  }
  await look('light')
}

// Split: the pane under the pointer goes back in itself.
await h.keyboard.press('Meta+Alt+Backslash'); await pause(1200)
await go('settings'); await pause(300)
const before = await titles()
const left = await h.evaluate(() => { const r = document.querySelector('[data-pane]').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 } })
await pause(300)
await swipe(14, -12, left.x); await lift(); await pause(800)
const after = await titles()
check('split: the left pane goes back in itself, the right stays', after.length === 2 && after[0] !== before[0] && after[1] === before[1], `${before.join(' / ')} -> ${after.join(' / ')}`)

console.log(`\n${results.filter(Boolean).length}/${results.length} passed`)
await c.close()
process.exit(results.every(Boolean) ? 0 : 1)
