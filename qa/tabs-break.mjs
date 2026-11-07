// Trying to break tabs and splits the way a person in a hurry would: three and four panes, tabs carried between panes
// that are not neighbours, quick drags one after another, drops while a pane is still closing, list rows carried into
// other panes, and drops let go of over the sidebar or outside the window. After every drop no tab is lost or doubled,
// and a drop that should land and did not is reported with what was under the pointer.
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_SHOTS=/abs/dir node qa/tabs-break.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'

const { check, done } = checks()
const c = await sandbox({ width: Number(process.env.QA_WIDTH ?? 1500), height: 900 })
const { h, v, go } = c
const shots = process.env.QA_SHOTS
const wait = (ms = 500) => h.waitForTimeout(ms)
const errors = []
h.on('pageerror', (e) => errors.push(e.message))
h.on('console', (m) => m.type() === 'error' && !/favicon|net::/.test(m.text()) && errors.push(m.text()))
const state = () => h.evaluate(() => [...document.querySelectorAll('[data-split-area] [data-pane]')].map((el) => ({
  key: el.getAttribute('data-pane'),
  tabs: [...el.querySelectorAll('[data-tabs] [data-tab]')].map((one) => one.getAttribute('data-drag-title')),
  on: el.querySelector('[data-tab-on]')?.getAttribute('data-drag-title') ?? null
})))
const tabsOf = (s) => s.flatMap((one) => one.tabs)
const sideRow = (name) => h.locator('aside [data-side-row]', { hasText: name }).first()
const tab = (pane, title) => h.locator(`[data-pane="${pane}"] [data-tab][data-drag-title="${title}"]`).first()
const mid = async (loc) => { const b = await loc.boundingBox(); return b && { x: b.x + b.width / 2, y: b.y + b.height / 2 } }
const under = (p) => h.evaluate(({ x, y }) => { const el = document.elementFromPoint(x, y); return el ? `${el.tagName.toLowerCase()}${[...el.attributes].filter((a) => a.name.startsWith('data-')).map((a) => `[${a.name}]`).join('')}` : 'nothing' }, p)
const toasts = () => h.evaluate(() => [...document.querySelectorAll('[data-sonner-toast]')].map((one) => one.textContent.replace(/\s+/g, ' ').trim()).filter(Boolean).join(' | '))
let n = 0
const drag = async (from, to, { steps = 10, pause = 30, frames = false, name = '' } = {}) => {
  await h.mouse.move(from.x, from.y); await h.mouse.down()
  for (let i = 1; i <= steps; i++) {
    await h.mouse.move(from.x + ((to.x - from.x) * i) / steps, from.y + ((to.y - from.y) * i) / steps)
    if (frames && shots) await h.screenshot({ path: `${shots}/${String(++n).padStart(3, '0')}-${name}-${i}.png` })
    else await wait(pause)
  }
  const at = await under(to)
  await h.mouse.up()
  return at
}
// After any drop: every tab there was is there once, unless the journey says otherwise.
const kept = (name, before, after, { gained = 0 } = {}) => {
  const a = tabsOf(before).length, b = tabsOf(after).length
  const doubled = after.some((one) => new Set(one.tabs).size !== one.tabs.length)
  check(`${name}: no tab lost or doubled`, b === a + gained && !doubled, `${a} then ${b}${doubled ? ', a doubled tab' : ''}`)
}
const split = async () => { await h.keyboard.press('Meta+Backslash'); await wait(700) }
const reset = async () => {
  await h.keyboard.press('Escape')
  for (let i = 0; i < 60; i++) { const s = await state(); if (s.length === 1 && s[0].tabs.length === 1) break; await h.keyboard.press('Control+w'); await wait(120) }
  await go('day'); await wait(400)
}
// Three panes, each with two or three tabs, every name different.
const three = async () => {
  await reset()
  await sideRow('Inbox').click(); await wait(300); await sideRow('Tasks').click({ modifiers: ['Meta'] }); await wait(400)
  await split(); await sideRow('Calendar').click(); await wait(300); await sideRow('Review').click({ modifiers: ['Meta'] }); await wait(400)
  await split(); await sideRow('Questions').click(); await wait(300); await sideRow('Feed').click({ modifiers: ['Meta'] }); await wait(300); await sideRow('Journal').click({ modifiers: ['Meta'] }); await wait(500)
  return state()
}
const rowOf = (key) => h.locator(`[data-tab-row="${key}"]`)

try {
  await v('settings:set', { hintRate: 0 })
  let s = await three()
  check('three panes to start from', s.length === 3 && s.every((one) => one.tabs.length >= 2), JSON.stringify(s.map((one) => one.tabs)))
  if (shots) await h.screenshot({ path: `${shots}/three.png` })

  // 1. Across a pane: right to left, and left to right, fast.
  let before = await state()
  let moving = before[2].tabs[0]
  let at = await drag(await mid(tab(before[2].key, moving)), await mid(rowOf(before[0].key)), { frames: true, name: 'across' })
  await wait(600); s = await state()
  check('a tab carried from the third pane to the first lands there', s[0].tabs.includes(moving), `under the pointer: ${at}; ${JSON.stringify(s.map((one) => one.tabs))}`)
  kept('across', before, s)
  before = s; moving = before[0].tabs[0]
  at = await drag(await mid(tab(before[0].key, moving)), await mid(rowOf(before[before.length - 1].key)), { steps: 3, pause: 16 })
  await wait(600); s = await state()
  check('flicked fast the other way, it lands too', s[s.length - 1].tabs.includes(moving), `under the pointer: ${at}; ${JSON.stringify(s.map((one) => one.tabs))}`)
  kept('flicked', before, s)

  // 2. Five quick moves back and forth, barely a pause between.
  for (let i = 0; i < 5; i++) {
    before = await state()
    const from = before[i % 2 ? 1 : 0], to = before[i % 2 ? 0 : 1]
    const one = from.tabs[from.tabs.length - 1]
    if (from.tabs.length < 2) continue
    at = await drag(await mid(tab(from.key, one)), await mid(rowOf(to.key)), { steps: 5, pause: 16 })
    await wait(150); s = await state()
    check(`quick move ${i + 1}: lands in the other pane`, s.find((p) => p.key === to.key)?.tabs.includes(one), `under the pointer: ${at}; ${JSON.stringify(s.map((p) => p.tabs))}`)
    kept(`quick move ${i + 1}`, before, s)
  }

  // 3. Dropped where it already is, and a tiny wobble: nothing moves, nothing said.
  before = await state(); moving = before[1].tabs[0]
  const spot = await mid(tab(before[1].key, moving))
  await drag(spot, { x: spot.x + 6, y: spot.y + 1 }, { steps: 3 }); await wait(400); s = await state()
  check('a 6px wobble on a tab: no move', JSON.stringify(s.map((p) => p.tabs)) === JSON.stringify(before.map((p) => p.tabs)), JSON.stringify(s.map((p) => p.tabs)))

  // 4. Let go over the sidebar, and outside the window: the tab stays where it was.
  before = await state(); moving = before[0].tabs[before[0].tabs.length - 1]
  const side = await mid(h.locator('aside nav').first())
  at = await drag(await mid(tab(before[0].key, moving)), side ?? { x: 100, y: 400 }, { steps: 10 }); await wait(500); s = await state()
  check('let go over the sidebar: the tab stays put', s[0].tabs.includes(moving), `under the pointer: ${at}; toasts: ${await toasts()}`)
  kept('over the sidebar', before, s)
  before = s
  await drag(await mid(tab(before[0].key, moving)), { x: -40, y: 300 }, { steps: 10 }); await wait(500); s = await state()
  check('let go outside the window: the tab stays put', s[0].tabs.includes(moving), JSON.stringify(s.map((p) => p.tabs)))
  kept('outside the window', before, s)

  // 5. A fourth pane, from a tab dropped at the left edge.
  before = await state(); moving = before[2].tabs[before[2].tabs.length - 1]
  const area = await h.locator('[data-split-area]').boundingBox()
  at = await drag(await mid(tab(before[2].key, moving)), { x: area.x + 30, y: area.y + area.height / 2 }, { steps: 14, frames: true, name: 'left-edge' })
  await wait(800); s = await state()
  check('dropped at the left edge with three panes: a fourth pane, on the left, holding it', s.length === 4 && s[0].tabs[0] === moving, `under the pointer: ${at}; ${JSON.stringify(s.map((p) => p.tabs))}; toasts: ${await toasts()}`)
  kept('left edge', before, s)
  if (shots) await h.screenshot({ path: `${shots}/four.png` })

  // 6. A pane's only tab carried off, and while that pane is still closing, another drag at once.
  before = await state()
  const lone = before.find((p) => p.tabs.length === 1)
  if (lone) {
    const other = before.find((p) => p.key !== lone.key && p.tabs.length > 1)
    await drag(await mid(tab(lone.key, lone.tabs[0])), await mid(rowOf(other.key)), { steps: 6, pause: 16 })
    await wait(40)
    const now = await state()
    const next = now.find((p) => p.tabs.length > 1 && p.key !== other.key) ?? now.find((p) => p.tabs.length > 1)
    const target = now.find((p) => p.key !== next.key)
    const one = next.tabs[next.tabs.length - 1]
    at = await drag(await mid(tab(next.key, one)), await mid(rowOf(target.key)), { steps: 6, pause: 16 })
    await wait(800); s = await state()
    check('a drag started while a pane is still closing lands', s.find((p) => p.key === target.key)?.tabs.includes(one), `under the pointer: ${at}; ${JSON.stringify(s.map((p) => p.tabs))}`)
    check('the emptied pane went', !s.some((p) => p.key === lone.key))
    kept('during a close', before, s)
  } else check('a pane with one tab to carry off', false, JSON.stringify(before.map((p) => p.tabs)))

  // 7. A list row from one pane, carried into another pane's page and onto another pane's row of tabs.
  await reset()
  await go('articles'); await wait(800)
  await split(); await sideRow('Calendar').click(); await wait(800)
  before = await state()
  const listed = h.locator(`[data-pane="${before[0].key}"] [data-row][data-id]`).first()
  if (await listed.count()) {
    const title = (await listed.textContent())?.trim().slice(0, 12)
    at = await drag(await mid(listed), await mid(rowOf(before[1].key)), { steps: 12, frames: true, name: 'row-to-tabs' })
    await wait(900); s = await state()
    check('a list row dropped on another pane\'s row of tabs: a new tab, open', s[1].tabs.length === before[1].tabs.length + 1, `under the pointer: ${at}; ${JSON.stringify(s.map((p) => p.tabs))}; toasts: ${await toasts()}`)
    kept('row onto tabs', before, s, { gained: 1 })
    before = s
    const body = await h.locator(`[data-pane="${before[1].key}"] [data-pane-card]`).boundingBox()
    const second = h.locator(`[data-pane="${before[0].key}"] [data-row][data-id]`).nth(1)
    const secondTitle = (await second.getAttribute('data-drag-title')) ?? ''
    const from = await mid(second), to = { x: body.x + body.width / 2, y: body.y + body.height / 2 }
    await h.mouse.move(from.x, from.y); await h.mouse.down()
    for (let i = 1; i <= 12; i++) { await h.mouse.move(from.x + ((to.x - from.x) * i) / 12, from.y + ((to.y - from.y) * i) / 12); await wait(30) }
    await wait(200)
    check('over the middle of another pane: "Open here" lights that pane', (await h.locator('[data-pane-take-box]').count()) === 1 && (await h.locator(`[data-pane="${before[1].key}"] [data-pane-card][data-pane-take]`).count()) === 1)
    if (shots) await h.screenshot({ path: `${shots}/open-here.png` })
    await h.mouse.up(); await wait(900); s = await state()
    check('let go there: it opens in that pane as a new tab, in front', s[1].tabs.length === before[1].tabs.length + 1 && s[1].on === s[1].tabs[s[1].tabs.length - 1], `${JSON.stringify(s.map((p) => p.tabs))} (${secondTitle})`)
    check('"Open here" goes when the drop is done', (await h.locator('[data-pane-take-box], [data-pane-take]').count()) === 0)
    // Over its own pane: no "Open here".
    before = s
    const own = h.locator(`[data-pane="${before[0].key}"] [data-row][data-id]`).first()
    const o = await mid(own)
    const ownBody = await h.locator(`[data-pane="${before[0].key}"] [data-pane-card]`).boundingBox()
    await h.mouse.move(o.x, o.y); await h.mouse.down()
    for (let i = 1; i <= 10; i++) { await h.mouse.move(o.x + 4 * i, o.y + 30 * i); await wait(30) }
    check('over its own pane: no "Open here"', (await h.locator('[data-pane-take-box]').count()) === 0, JSON.stringify(ownBody))
    await h.keyboard.press('Escape'); await h.mouse.up(); await wait(400)
    // A tab carried into the middle of another pane moves there too.
    before = await state()
    const t = before[1].tabs[0]
    const leftBody = await h.locator(`[data-pane="${before[0].key}"] [data-pane-card]`).boundingBox()
    at = await drag(await mid(tab(before[1].key, t)), { x: leftBody.x + leftBody.width / 2, y: leftBody.y + leftBody.height / 2 }, { steps: 12 })
    await wait(800); s = await state()
    check('a tab let go in the middle of another pane moves there', s[0].tabs.includes(t), `under the pointer: ${at}; ${JSON.stringify(s.map((p) => p.tabs))}`)
    kept('tab into a page', before, s)
    const spoken = await h.evaluate(() => [...document.querySelectorAll('[role=status][aria-live]')].map((one) => one.textContent).join(' | '))
    check('what VoiceOver hears of a drag names things, never ids', !/[0-9a-f]{8}-[0-9a-f]{4}-/.test(spoken), spoken.slice(0, 300))
  } else check('a list row to carry', false)

  check('no errors in the page through all of it', errors.length === 0, errors.slice(0, 4).join(' || '))
} catch (e) { check('ran', false, e.message.split('\n').slice(0, 4).join(' | ')); if (shots) await h.screenshot({ path: `${shots}/failed.png` }) }
await c.close()
done()
