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

const titles = () => h.evaluate(() => [...document.querySelectorAll('[data-pane]')].map((pane) => pane.querySelector('[data-tab-on]')?.getAttribute('data-drag-title') || document.querySelector('[data-pane-title]')?.textContent?.trim() || '?'))
const title = async () => (await titles())[0]
// One wheel step at a point, as the trackpad sends it.
const wheel = (x, y, dx, dy = 0) => h.evaluate(([x, y, dx, dy]) => document.elementFromPoint(x, y).dispatchEvent(new WheelEvent('wheel', { deltaX: dx, deltaY: dy, bubbles: true, cancelable: true })), [x, y, dx, dy])
// The Mac's word that the fingers touched or lifted, as main passes it on from native/glass.mm.
const phase = (kind) => h.evaluate((kind) => window.dispatchEvent(new CustomEvent('haligtree:swipe-phase', { detail: kind })), kind)
const lift = () => phase('ended')
const arrow = () => h.evaluate(() => document.querySelector('[data-swipe-arrow]')?.dataset.swipeArrow ?? null)
const listRows = () => h.evaluate(() => [...document.querySelectorAll('[data-swipe-list] [role=option]')].map((one) => one.textContent.trim()))
const X = 700, Y = 450
// The fingers' way: with natural scrolling (the Mac's default) the wheel's deltas run against them.
const natural = await h.evaluate(() => window.api.naturalScrolling())
const R = natural ? -1 : 1 // deltaX for each px the fingers move right
const DOWN = natural ? -1 : 1 // deltaY for each px the fingers move down
console.log('natural scrolling', natural)
const ends = () => h.evaluate(() => (window.__swipeLog ?? []).filter((one) => one.end).map((one) => one.end))
const swipe = async (steps, dx = 12 * R, x = X, frames) => {
  for (let n = 0; n < steps; n++) {
    await wheel(x, Y, dx)
    await h.waitForTimeout(16)
    if (frames) await h.screenshot({ path: `${frames}-${String(n).padStart(2, '0')}.png` })
  }
}
const pause = (ms) => h.waitForTimeout(ms)

await phase('began')
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
for (const d of [10, 8, 6, 4, 3, 2, 2, 1, 1, 1]) (await wheel(X, Y, d * R), await pause(16))
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
await wheel(X, Y, 0, 24 * DOWN); await pause(50)
await lift(); await pause(800)
check('two fingers down then let go picks the next one', (await title()) === rows2[1], await title())

// The list never shows a place twice: Gems, Writing, Gems, Writing behind you is Gems and Writing once each.
await go('articles'); await go('nuggets'); await go('articles'); await go('nuggets'); await go('settings')
await pause(300); await swipe(14); await pause(1300)
const rows3 = await listRows()
check('never two identical rows', rows3.length && new Set(rows3).size === rows3.length && rows3[0] === 'Gems' && rows3[1] === 'Writing', rows3.join(' | '))
await h.keyboard.press('Escape'); await pause(400)

// Real trackpad rates (a step every 8ms). Fingers slowing short of the tap is not a let go: the arrow stays.
const at8 = async (list) => { for (const d of list) (await wheel(X, Y, d * R), await pause(8)) }
const here = await title()
await pause(300)
await at8([3, 4, 6, 20, 16, 12, 9, 7])
check('fingers slowing short of the tap: the arrow stays', (await arrow()) === 'pulling', JSON.stringify((await ends()).slice(-1)))
await at8([10, 10, 10, 10, 10]); await pause(16)
check('...and carries on past it', (await arrow()) === 'armed')
await lift(); await pause(600)
check('...then goes back on let go', (await title()) !== here, `${here} -> ${await title()}`)

// Held still short of the tap, the arrow stays as long as the fingers rest; lifting puts it away.
await h.keyboard.press('Meta+BracketRight'); await pause(700)
await pause(300)
await phase('began'); await at8([8, 8, 8, 8, 8, 8]); await pause(2500)
check('held short of the tap for 2.5s, the arrow stays', (await arrow()) === 'pulling', JSON.stringify((await ends()).slice(-1)))
await lift(); await pause(400)
check('...and lifting there puts it away, going nowhere', !(await arrow()) && (await title()) === here)

// Past the tap, lifted with no glide at all: it goes back, never the list.
await pause(300)
await phase('began'); await swipe(14); await pause(300); await lift(); await pause(1200)
check('past the tap, a still lift goes back, never the list', (await title()) !== here && !(await listRows()).length, await title())
await h.keyboard.press('Meta+BracketRight'); await pause(700)

// Far, fast and jerky, a long way past the tap: still back, once.
await h.keyboard.press('Meta+BracketRight'); await pause(700)
await pause(300)
const far = Array.from({ length: 80 }, (_, n) => 14 + ((n * 7) % 9) - 4 - (n % 5 === 0 ? 8 : 0))
await at8([...far, 12, 10, 8, 6, 4, 3, 2, 1, 1])
await lift(); await pause(700)
check('a far jerky swipe still goes back', (await title()) !== here, `${here} -> ${await title()}`)
// Diagonal: the fingers drift down as they go right.
await h.keyboard.press('Meta+BracketRight'); await pause(700)
await pause(300)
for (let n = 0; n < 14; n++) (await h.evaluate(([x, y, dx, dy]) => document.elementFromPoint(x, y).dispatchEvent(new WheelEvent('wheel', { deltaX: dx, deltaY: dy, bubbles: true, cancelable: true })), [X, Y, 12 * R, 5 * DOWN]), await pause(8))
await lift(); await pause(700)
check('a diagonal swipe goes back', (await title()) !== here, JSON.stringify(await h.evaluate(() => window.__swipeLog.slice(-6))))
const reasons = await ends()
check('every ending has a stated reason', reasons.every(Boolean), [...new Set(reasons)].join(' | '))
await h.keyboard.press('Meta+BracketRight'); await pause(700)

// Forward from near the window's right edge: the list opens leftwards and stays inside the window.
await h.keyboard.press('Meta+BracketLeft'); await pause(700)
const W = await h.evaluate(() => innerWidth)
await pause(300)
await swipe(14, -12 * R, W - 30); await pause(1300)
const box = await h.evaluate(() => { const r = document.querySelector('[data-swipe-list]')?.getBoundingClientRect(); return r && { left: r.left, right: r.right } })
check('a Forward list near the right edge stays inside the window', box && box.right <= W && box.left >= 0, JSON.stringify(box) + ' in ' + W)
await h.keyboard.press('Escape'); await pause(400)
await h.keyboard.press('Meta+BracketRight'); await pause(700)

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
const beside = await title()
await pause(300)
await swipe(14); await pause(100)
check('a sideways scroller under the pointer wins', !(await arrow()))
await lift(); await pause(400)
await h.evaluate(() => document.getElementById('qa-scroller').remove())
check('...and nothing went back', (await title()) === beside)

if (FRAMES) {
  for (const name of ['light', 'dark']) {
    await look(name); await pause(300)
    await swipe(16, 10 * R, X, `${FRAMES}/swipe-${name}`)
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
await swipe(14, 12 * R, left.x); await lift(); await pause(800)
const after = await titles()
check('split: the left pane goes back in itself, the right stays', after.length === 2 && after[0] !== before[0] && after[1] === before[1], `${before.join(' / ')} -> ${after.join(' / ')}`)
// The list a resting swipe opens hangs from the arrows of the pane it belongs to, and that pane takes the keys.
await swipe(14, -12 * R, left.x); await pause(1300)
const hung = await h.evaluate(() => { const list = document.querySelector('[data-swipe-list]')?.getBoundingClientRect(); const arrows = document.querySelector('[data-pane] [data-tab-arrows]').getBoundingClientRect(); return list && { list: [list.left, list.top], arrows: [arrows.left, arrows.bottom], front: document.querySelector('[data-pane]').hasAttribute('data-pane-front') } })
check('split: the back list hangs from its own pane\'s arrows', hung && Math.abs(hung.list[0] - hung.arrows[0]) < 2 && hung.list[1] >= hung.arrows[1], JSON.stringify(hung))
await h.keyboard.press('Escape'); await pause(300)

console.log(`\n${results.filter(Boolean).length}/${results.length} passed`)
await c.close()
process.exit(results.every(Boolean) ? 0 : 1)
