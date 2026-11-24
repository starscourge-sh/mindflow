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
// Each swipe starts with the fingers touching, as the Mac says (the glide after a lift never starts one).
const swipe = async (steps, dx = 12 * R, x = X, frames) => {
  await phase('began')
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

// Fingers landing on a trackpad lean: the first move goes as much down as across, then the swipe is sideways. Judged
// on that first move alone, the whole swipe was taken as a scroll and went nowhere (the user, 22 Nov).
await pause(300)
await phase('began')
await wheel(X, Y, 3 * R, 4 * DOWN); await pause(16)
for (let n = 0; n < 14; n++) (await wheel(X, Y, 12 * R, n < 2 ? 2 * DOWN : 0), await pause(16))
await pause(30)
check('a swipe whose first move leans down still arms, once it goes sideways', (await arrow()) === 'armed', JSON.stringify((await h.evaluate(() => window.__swipeLog ?? [])).slice(-6)))
await lift(); await pause(150); await h.keyboard.press('Escape'); await pause(200)
const stillHere = await title()
if (stillHere !== start) { await h.keyboard.press('Meta+BracketRight'); await pause(500) }

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
check('↓ Enter goes to that page', (await title()) === rows[1].split(' › ')[0] && !(await listRows()).length, await title())

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
check('two fingers down then let go picks the next one', (await title()) === rows2[1].split(' › ')[0], await title())

// The list never shows a place twice: Gems, Writing, Gems, Writing behind you is Gems and Writing once each.
await go('articles'); await go('nuggets'); await go('articles'); await go('nuggets'); await go('settings')
await pause(300); await swipe(14); await pause(1300)
const rows3 = await listRows()
check('never two identical rows', rows3.length && new Set(rows3).size === rows3.length && rows3[0] === 'Gems' && rows3[1] === 'Writing', rows3.join(' | '))
await h.keyboard.press('Escape'); await pause(400)

// Real trackpad rates (a step every 8ms). Fingers slowing short of the tap is not a let go: the arrow stays.
const at8 = async (list, touch = true) => { if (touch) await phase('began'); for (const d of list) (await wheel(X, Y, d * R), await pause(8)) }
const here = await title()
await pause(300)
await at8([3, 4, 6, 20, 16, 12, 9, 7])
check('fingers slowing short of the tap: the arrow stays', (await arrow()) === 'pulling', JSON.stringify((await ends()).slice(-1)))
await at8([10, 10, 10, 10, 10], false); await pause(16)
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
await phase('began')
for (let n = 0; n < 14; n++) (await h.evaluate(([x, y, dx, dy]) => document.elementFromPoint(x, y).dispatchEvent(new WheelEvent('wheel', { deltaX: dx, deltaY: dy, bubbles: true, cancelable: true })), [X, Y, 12 * R, 5 * DOWN]), await pause(8))
await lift(); await pause(700)
check('a diagonal swipe goes back', (await title()) !== here, JSON.stringify(await h.evaluate(() => window.__swipeLog.slice(-6))))
await h.keyboard.press('Meta+BracketRight'); await pause(700)

// A real flick, as the Mac sends it (the user, 8 Nov: "gets stuck and opens history even though I have let go"):
// the fingers' burst, their lift, then the trackpad's glide, steps shorter and shorter, then nothing.
const glide = async (from, n = 40) => { for (let k = 0; k < n; k++) (await wheel(X, Y, Math.max(1, Math.round(from * 0.9 ** k)) * R), await pause(8)) }
{
  const was = await title()
  await pause(300)
  await at8([6, 12, 18, 22, 24, 22, 18])
  await lift(); await glide(16); await pause(1000)
  check('a flick past the tap: back once, the arrow gone and no list 1s after the glide', (await title()) !== was && !(await arrow()) && !(await listRows()).length, `${was} -> ${await title()}, list ${(await listRows()).length}`)
  await h.keyboard.press('Meta+BracketRight'); await pause(700)
  // Lifted before the swipe got going (its first steps mostly up and down), the glide carries sideways past the tap.
  const here2 = await title()
  await pause(300)
  await phase('began'); await wheel(X, Y, 1 * R, 6 * DOWN); await pause(8); await wheel(X, Y, 2 * R, 3 * DOWN); await pause(8)
  await lift(); await glide(20, 50); await pause(1000)
  check('a glide after the fingers lifted never starts a swipe nor opens the list', (await title()) === here2 && !(await arrow()) && !(await listRows()).length, `${here2} -> ${await title()}, list ${(await listRows()).length}, ${JSON.stringify((await ends()).slice(-2))}`)
  // A flick short of the tap whose glide carries it on: put away, going nowhere, no list.
  await pause(300)
  await at8([4, 8, 10, 8])
  await lift(); await glide(14, 40); await pause(1000)
  check('a flick short of the tap with a long glide: the arrow springs away, no list', (await title()) === here2 && !(await arrow()) && !(await listRows()).length, `${await title()}, list ${(await listRows()).length}`)
  // Held on purpose past the tap, the fingers resting: the list still opens.
  await pause(300)
  await swipe(14); await pause(1000)
  check('resting past the tap with the fingers down still opens the list', (await listRows()).length >= 1)
  await h.keyboard.press('Escape'); await pause(400)
}
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
// The list a resting swipe opens comes out of the edge of the pane it belongs to, where the hand is, and that pane takes the keys.
await swipe(14, -12 * R, left.x); await pause(1300)
const hung = await h.evaluate(() => { const list = document.querySelector('[data-swipe-list]')?.getBoundingClientRect(); const pane = document.querySelector('[data-pane]').getBoundingClientRect(); return list && { way: document.querySelector('[data-swipe-list]').getAttribute('aria-label'), list: [list.left, list.right, list.top, list.bottom], pane: [pane.left, pane.right, pane.top + pane.height / 2], front: document.querySelector('[data-pane]').hasAttribute('data-pane-front') } })
// Back hangs from the pane's left edge, Forward from its right: the side the arrow came in from.
check('split: the list opens at its own pane\'s edge on the swipe\'s side, by the middle', hung && (hung.way === 'Back to' ? Math.abs(hung.list[0] - hung.pane[0] - 8) < 3 : Math.abs(hung.pane[1] - 8 - hung.list[1]) < 3) && hung.list[2] <= hung.pane[2] && hung.list[3] >= hung.pane[2] - 30 && hung.front, JSON.stringify(hung))
// Fingers up and down while it is up move its pick, and the page under it stays where it was. (The boxes under a
// swipe and its list are held still by taking their scrolling away for as long as it lasts, and marked
// data-swipe-held: they are still the boxes that scroll.)
{
  const scrollOf = () => h.evaluate(() => [...document.querySelectorAll('[data-pane] *')].filter((one) => one.scrollHeight > one.clientHeight + 20 && (one.hasAttribute('data-swipe-held') || /(auto|scroll)/.test(getComputedStyle(one).overflowY))).map((one) => Math.round(one.scrollTop)).join(','))
  await h.evaluate(() => { for (const one of document.querySelectorAll('[data-pane] *')) if (one.scrollHeight > one.clientHeight + 200 && (one.hasAttribute('data-swipe-held') || /(auto|scroll)/.test(getComputedStyle(one).overflowY))) one.scrollTop = 120 }); await pause(200)
  const before = await scrollOf()
  const list = await h.locator('[data-swipe-list]').boundingBox()
  if (list) { const pane = await h.locator('[data-pane]').first().boundingBox(); await h.mouse.move(pane.x + pane.width * 0.6, pane.y + pane.height * 0.4); for (let i = 0; i < 6; i++) { await h.mouse.wheel(0, 30); await pause(60) } for (let i = 0; i < 6; i++) { await h.screenshot(); await pause(40) } }
  check('scrolling through the open list leaves the page under it still', /[1-9]/.test(before) && (await scrollOf()) === before && (await h.locator('[data-swipe-list]').count()) === 1, `${before} then ${await scrollOf()}`)
}
await h.keyboard.press('Escape'); await pause(300)

console.log(`\n${results.filter(Boolean).length}/${results.length} passed`)
// A task open beside its list, reached with no page behind it: a swipe Back closes the task, never a dead swipe (24 Nov).
await h.keyboard.press('Escape'); await pause(300)
await h.locator('aside [data-side-row]', { hasText: /^Tasks/ }).first().click(); await pause(1500)
await h.locator('[data-page] [data-task-row] [data-row]').first().click(); await pause(1200)
const openBefore = await h.locator('[data-close-beside]').count()
await swipe(14); await lift(); await pause(900)
check('a swipe Back closes a task open beside its list', openBefore === 1 && (await h.locator('[data-close-beside]').count()) === 0, `open before ${openBefore}`)

await c.close()
process.exit(results.every(Boolean) ? 0 : 1)
