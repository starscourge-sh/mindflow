// Dragging tasks on the Tasks page, as a person would: rows carried a little
// (nothing comes up), out to the page's sides (the places come up only then,
// beside the list and never over it or the open task), let go on a side (the
// task carried is the one that opens), over the sidebar (Pinned and the Queue
// do not light for a task), outside the window, quickly, and put down with
// Esc. Also: an open task's ✕ and Esc close it, and the sidebar's "Side by
// side" menu has an icon on every line.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-t/main/index.js HALIGTREE_QA_AWAY=1 node qa/tasks-drag.mjs
import { open, checks } from './harness.mjs'

const { check, done } = checks()
const qa = await open()
const { electron, page } = qa
const SHOT = process.env.SHOT ?? process.env.QA_DATA
for (const text of ['analyse claims today', 'admin forms today', 'call the bank today', 'write the report today', 'tidy the desk next week', 'learn piano someday'])
  await page.evaluate((t) => window.api.haligtree('task:add', t), text)
await page.evaluate(() => window.api.haligtree('onboarding:set', { welcomed: new Date().toISOString(), newsSeen: true, welcoming: false, pageHints: false }))
await page.waitForTimeout(1500)
// show() under HALIGTREE_QA_AWAY parks the window past the screen's edge, unseen and unclickable (src/main/index.ts), as sandbox-lib's does.
await electron.evaluate(({ BrowserWindow }) => { const w = BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().includes('view=home')); w?.setBounds({ width: 1400, height: 860 }); w?.show() })
const h = electron.windows().find((w) => w.url().includes('view=home'))
await h.reload()
await h.waitForTimeout(2500)
await h.keyboard.press('Escape')
// EDGE_TRACE=1: what the page and main heard through each carry (focus, a cancelled press, the browser's own drag, the
// split drag's mark, what lay under the pointer at the edge, and every window that came up or took the keys), printed
// with a right-edge line that fails, so the run that fails names its cause beside one that passes.
const EDGE_TRACE = !!process.env.EDGE_TRACE
const edgeTrace = () => {
  if (window.__edge) return
  const T = (window.__edge = [])
  const at = () => Math.round(performance.now())
  const say = (el) => (el instanceof Element ? `${el.tagName.toLowerCase()}${[...el.attributes].filter((a) => a.name.startsWith('data-')).slice(0, 4).map((a) => `[${a.name}]`).join('')}` : String(el?.constructor?.name ?? el))
  for (const type of ['blur', 'focus']) window.addEventListener(type, (e) => e.target === window && T.push(`${at()} window ${type} (hasFocus ${document.hasFocus()})`), true)
  document.addEventListener('visibilitychange', () => T.push(`${at()} visibility ${document.visibilityState}`), true)
  for (const type of ['pointercancel', 'dragstart', 'pointerdown', 'pointerup', 'lostpointercapture'])
    window.addEventListener(type, (e) => T.push(`${at()} ${type} b${e.buttons} ${Math.round(e.clientX)},${Math.round(e.clientY)} on ${say(e.target)}${type === 'pointerdown' ? ` row:${!!e.target.closest?.('[data-pane] [data-row][data-id]')} own:${!!e.target.closest?.('[data-drag-open]')} focus:${document.hasFocus()}` : ''}`), true)
  let moves = 0
  window.addEventListener('pointermove', (e) => { if (e.buttons & 1) moves++ }, true)
  new MutationObserver(() => T.push(`${at()} split-drag ${document.documentElement.hasAttribute('data-split-drag')} dragging ${document.documentElement.hasAttribute('data-dragging')} after ${moves} held moves`)).observe(document.documentElement, { attributes: true, attributeFilter: ['data-split-drag', 'data-dragging'] })
  window.__edgeLook = (x, y) => {
    const box = document.querySelector('[data-split-area]')?.parentElement?.getBoundingClientRect()
    const under = document.elementsFromPoint(x, y).slice(0, 6).map(say).join(' < ')
    return `area ${box ? `${Math.round(box.left)}..${Math.round(box.right)}` : 'none'}, pointer ${x},${y}, ${moves} held moves, hasFocus ${document.hasFocus()}, seen ${document.visibilityState}, inner ${innerWidth}x${innerHeight}, under: ${under}`
  }
}
if (EDGE_TRACE) {
  await h.evaluate(edgeTrace)
  await electron.evaluate(({ app, BrowserWindow }) => {
    const T = (globalThis.__edgeMain = [])
    const name = (w) => (w?.webContents?.getURL?.() ?? '').split('?')[1]?.slice(0, 24) ?? 'a window'
    for (const one of ['browser-window-blur', 'browser-window-focus', 'did-become-active', 'did-resign-active']) app.on(one, (_e, w) => T.push(`${Date.now()} ${one} ${w ? name(w) : ''}`))
    app.on('browser-window-created', (_e, w) => { T.push(`${Date.now()} window made ${name(w)}`); for (const ev of ['show', 'hide', 'focus', 'blur']) w.on(ev, () => T.push(`${Date.now()} ${name(w)} ${ev} at ${JSON.stringify(w.getBounds())}`)) })
    for (const w of BrowserWindow.getAllWindows()) for (const ev of ['show', 'hide', 'focus', 'blur']) w.on(ev, () => T.push(`${Date.now()} ${name(w)} ${ev} at ${JSON.stringify(w.getBounds())}`))
  })
}
const edgeSaid = async (x, y) => {
  if (!EDGE_TRACE) return ''
  const page = await h.evaluate(([x, y]) => [window.__edgeLook?.(x, y), ...(window.__edge ?? []).splice(0).slice(-14)].join('\n    '), [x, y])
  const main = await electron.evaluate(({ BrowserWindow }) => [...(globalThis.__edgeMain ?? []).splice(0).slice(-10), `windows: ${BrowserWindow.getAllWindows().filter((w) => !w.isDestroyed()).map((w) => `${(w.webContents.getURL().split('?')[1] ?? '').slice(0, 20)} ${w.isVisible() ? 'shown' : 'hidden'}${w.isFocused() ? ' focused' : ''} ${JSON.stringify(w.getBounds())}`).join(' | ')}`])
  return `\n  EDGE TRACE page:\n    ${page}\n  EDGE TRACE main:\n    ${main.join('\n    ')}`
}
const send = (type, id) => electron.evaluate(({ BrowserWindow }, [t, i]) => BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().includes('view=home'))?.webContents.send('home:open', t, i), [type, id])
const go = async (view) => (await send('view', view), await h.waitForTimeout(900))

const rect = (sel) => h.evaluate((sel) => {
  const r = document.querySelector(sel)?.getBoundingClientRect()
  return r && { left: r.left, right: r.right, top: r.top, bottom: r.bottom, x: r.left + r.width / 2, y: r.top + r.height / 2 }
}, sel)
// Brought into view first, as a person would see it before pressing it: how long the sandbox's Today list is depends
// on the time of day (its practices fall due in the evening), and late at night the row sat under the window's bottom
// edge, so the press landed on the frame and no carry began ("dragging":false on every right-edge line; the trace,
// 13 Nov 22:22: "pointerdown b1 478,853 on div row:false" in an 860px window).
const row = (title) => h.evaluate((title) => {
  const el = [...document.querySelectorAll('[data-pane] [data-task-row] [data-row]')].find((one) => one.textContent.includes(title))
  el?.scrollIntoView({ block: 'center' })
  const r = el?.getBoundingClientRect()
  return r && { x: r.left + Math.min(60, r.width / 2), y: r.top + r.height / 2, left: r.left, right: r.right }
}, title)
const pickRow = async (title) => { const one = await row(title); await h.mouse.click(one.x, one.y) }
const state = () => h.evaluate(() => ({
  zones: [...document.querySelectorAll('[data-split-zone]')].map((z) => { const r = z.getBoundingClientRect(); return { side: z.dataset.splitZone, left: r.left, right: r.right, hot: z.hasAttribute('data-hot') } }),
  card: document.querySelector('[data-split-card]')?.textContent ?? null,
  lit: [...document.querySelectorAll('[data-queue-hot]')].map((one) => one.getAttribute('data-side-drop') ?? one.getAttribute('data-queue-drop') ?? 'queue'),
  dragging: document.documentElement.hasAttribute('data-split-drag'),
  dropToPin: [...document.querySelectorAll('[data-side-drop="pinned"]')].some((one) => one.offsetParent && one.textContent.includes('Drop here to add to Favorites')),
  panes: [...document.querySelectorAll('[data-pane]')].length,
  heads: [...document.querySelectorAll('[data-tab-on]')].map((one) => one.getAttribute('data-drag-title')),
  open: [...document.querySelectorAll('[data-pane] [data-open][data-task-row] [data-task-title]')].map((one) => one.textContent)
}))
const single = async () => { for (let n = 0; n < 6 && (await state()).panes > 1; n++) (await h.locator('[data-tab-on] [data-tab-close]').last().click(), await h.waitForTimeout(600)) }
const clean = () => h.evaluate(() => !document.querySelector('[data-split-drop]') && !document.documentElement.hasAttribute('data-split-drag') && !document.querySelector('[data-queue-hot]'))
const overlaps = (zone, box) => box && zone.left < box.right - 1 && zone.right > box.left + 1

/** Carry the row named `title` along `path` ([x, y] stops), look, then let go (or not). */
async function carry(title, path, { look, release = true, steps = 12 } = {}) {
  const from = await row(title)
  await h.mouse.move(from.x, from.y)
  await h.mouse.down()
  // FORCE_BLUR=1: the window loses the keys once the row is carried (as when another app takes focus mid-carry), and the carry goes on.
  if (process.env.FORCE_BLUR) (await h.mouse.move(from.x + 14, from.y + 4, { steps: 3 }), await h.evaluate(() => void window.dispatchEvent(new FocusEvent('blur'))), await h.waitForTimeout(60))
  for (const [x, y] of path) await h.mouse.move(x, y, { steps })
  await h.waitForTimeout(260)
  const seen = await state()
  const [lx, ly] = path.at(-1)
  if (EDGE_TRACE) Object.defineProperty(seen, 'trace', { value: await edgeSaid(lx, ly), enumerable: false })
  if (look) await h.screenshot({ path: `${SHOT}/${look}.png` })
  if (release) await h.mouse.up()
  await h.waitForTimeout(700)
  return seen
}

await go('today')
const theme = async (dark) => h.evaluate((d) => document.documentElement.classList.toggle('dark', d), dark)

// 1. A short carry inside the list: nothing comes up, and the click that ends it does not open a pane.
let r = await row('call the bank')
let seen = await carry('call the bank', [[r.x + 4, r.y + 30], [r.x + 10, r.y + 60], [r.x - 40, r.y + 20]])
check('carried a little inside the list: no places come up', seen.zones.length === 0 && !seen.card, JSON.stringify(seen))
check('…and nothing is left on screen, still one pane, nothing opened', (await clean()) && (await state()).panes === 1 && !(await h.$('[data-close-beside]')), JSON.stringify(await state()))

// 2. Out to the right edge, nothing open: places come up beside the list, never over it.
const page0 = await rect('[data-split-area]')
await pickRow('call the bank')
await h.waitForTimeout(300)
await h.keyboard.press('Escape')
await h.waitForTimeout(500)
const list0 = await row('call the bank')
for (const dark of [false, true]) {
  await theme(dark)
  seen = await carry('call the bank', [[page0.right - 20, r.y]], { look: `tasks-drag-right-${dark ? 'dark' : 'light'}`, release: false })
  check(`${dark ? 'dark' : 'light'}: at the right edge the places come up`, seen.zones.length === 1 && seen.zones[0].side === 'right' && seen.zones[0].hot, JSON.stringify(seen)) || console.log(seen.trace ?? '')
  check(`${dark ? 'dark' : 'light'}: no place covers the list`, seen.zones.every((z) => !overlaps(z, list0)), JSON.stringify({ zones: seen.zones, list0 }))
  await h.keyboard.press('Escape')
  await h.waitForTimeout(500)
  await h.mouse.up()
  await h.waitForTimeout(500)
  check(`${dark ? 'dark' : 'light'}: Esc mid-drag puts it all down`, await clean() && (await state()).panes === 1)
}
await theme(false)

// 3. Dropped on the right: the task carried is the one that opens there.
seen = await carry('call the bank', [[page0.right - 20, r.y]])
await h.waitForTimeout(800)
let after = await state()
check('let go on the right: a second pane opens', after.panes === 2 && after.heads.filter(Boolean).at(-1)?.includes('call the bank'), JSON.stringify(after)) || console.log(seen.trace ?? '')
check('…and nothing is left on screen', await clean())
await h.screenshot({ path: `${SHOT}/tasks-drag-dropped.png` })
await single()

// 4. With a task open beside the list: the places stay off the open task until the pointer is at the very edge, and never cover the list.
await go('today')
await pickRow('analyse claims')
await h.waitForTimeout(900)
r = await row('admin forms')
const list1 = await row('admin forms')
seen = await carry('admin forms', [[list1.right + 120, r.y]], { release: false })
check('task open: carried just past the list, over the open task, no places yet', seen.zones.length === 0, JSON.stringify(seen))
await h.mouse.move(page0.right - 16, r.y, { steps: 8 })
await h.waitForTimeout(250)
seen = await state()
for (const dark of [false, true]) (await theme(dark), await h.waitForTimeout(150), await h.screenshot({ path: `${SHOT}/tasks-drag-open-${dark ? 'dark' : 'light'}.png` }))
await theme(false)
check('task open: at the edge that edge\'s place comes up', seen.zones.length === 1 && seen.zones[0].hot, JSON.stringify(seen))
check('task open: no place covers the list', seen.zones.every((z) => !overlaps(z, list1)), JSON.stringify({ zones: seen.zones, list1 }))
await h.mouse.up()
await h.waitForTimeout(900)
after = await state()
check('task open: let go on the right opens the task carried, not the open one', after.panes === 2 && after.heads.filter(Boolean).join('|') === 'analyse claims|admin forms', JSON.stringify(after))
await single()

// 5. Over the sidebar's Favorites: a task is not taken there, so it does not light.
await go('today')
const pinned = await rect('[data-side-drop="pinned"]')
r = await row('write the report')
if (pinned) {
  seen = await carry('write the report', [[pinned.x, pinned.y]])
  check('over Pinned: it does not light for a task', !seen.lit.includes('pinned'), JSON.stringify(seen))
} else check('Favorites shows in the sidebar (skipped: none)', true)
const nav = await rect('aside nav')
seen = await carry('write the report', [[nav.x, nav.bottom - 40]])
check('over the sidebar (nothing there takes a task): nothing lights, no “Drop here to add to Favorites”, nothing left', seen.lit.length === 0 && !seen.dropToPin && (await clean()), JSON.stringify(seen))

// 6. Let go outside the window, and a quick throw.
seen = await carry('write the report', [[page0.right + 200, r.y]])
check('let go outside the window: nothing opens, nothing left', (await state()).panes === 1 && (await clean()), JSON.stringify(await state()))
seen = await carry('write the report', [[page0.right - 14, r.y]], { steps: 2 })
await h.waitForTimeout(600)
check('a quick throw to the right still opens it', (await state()).panes === 2 && (await clean())) || console.log(seen.trace ?? '')
await single()

// 7. Upcoming and Later: the same.
for (const [view, title] of [['upcoming', 'tidy the desk'], ['later', 'learn piano']]) {
  await go(view)
  const one = await row(title)
  if (!one) { check(`${view}: the task shows`, false); continue }
  seen = await carry(title, [[one.x + 6, one.y + 40]])
  check(`${view}: a short carry brings nothing up`, seen.zones.length === 0)
  seen = await carry(title, [[page0.right - 16, one.y]])
  await h.waitForTimeout(600)
  check(`${view}: dropped on the right, it opens there`, (await state()).heads.some((t) => t.includes(title)), JSON.stringify(await state())) || console.log(seen.trace ?? '')
  await single()
}

// 8. The open task's ✕ and Esc.
await go('today')
await pickRow('analyse claims')
await h.waitForTimeout(900)
const x = await rect('[data-close-beside]')
const head = await rect('[data-open] [data-grow]')
check('an open task has a ✕ at the right of its top row', !!x && Math.abs(x.right - head.right) < 80, JSON.stringify({ x, head }))
await h.locator('[data-close-beside]').first().hover()
await h.waitForTimeout(700)
const tip = await h.evaluate(() => document.querySelector('[role="tooltip"], [data-slot="tooltip-content"]')?.textContent ?? '')
check('…its tooltip names Esc', /Close\s*Esc/.test(tip), tip)
for (const dark of [false, true]) (await theme(dark), await h.waitForTimeout(150), await h.screenshot({ path: `${SHOT}/tasks-close-${dark ? 'dark' : 'light'}.png` }))
await theme(false)
await h.locator('[data-close-beside]').first().click()
await h.waitForTimeout(700)
check('the ✕ closes it', !(await h.$('[data-pane] [data-open][data-task-row]')) && !(await h.$('[data-close-beside]')))
await pickRow('analyse claims')
await h.waitForTimeout(900)
await h.keyboard.press('Escape')
await h.waitForTimeout(700)
check('Esc in the list closes it', !(await h.$('[data-close-beside]')))
// Esc in the task's words only leaves the editor.
await pickRow('analyse claims')
await h.waitForTimeout(900)
const ed = h.locator('[data-open] .ProseMirror').first()
if (await ed.count()) {
  await ed.click()
  await h.keyboard.type('a line')
  await h.keyboard.press('Escape')
  await h.waitForTimeout(400)
  check('Esc in the editor leaves the editor and keeps the task open', !!(await h.$('[data-close-beside]')) && !(await h.evaluate(() => document.activeElement?.closest('.ProseMirror'))))
  await h.keyboard.press('Escape')
  await h.waitForTimeout(600)
  check('…a second Esc, now in the list, closes it', !(await h.$('[data-close-beside]')))
}

// 9. A tab's menu: an icon on every line, "Close" a ✕.
await pickRow('analyse claims')
await h.waitForTimeout(600)
r = await row('admin forms')
await carry('admin forms', [[page0.right - 16, r.y]])
await h.waitForTimeout(900)
const pair = h.locator('[data-tab-on]').last()
if (await pair.count()) {
  await pair.click({ button: 'right' })
  await h.waitForTimeout(500)
  const lines = await h.evaluate(() => [...document.querySelectorAll('[role="menu"] [role="menuitem"]')].map((one) => ({ text: one.textContent.trim(), dot: !!one.querySelector('svg.lucide-dot') })))
  await h.screenshot({ path: `${SHOT}/tasks-pair-menu.png` })
  check('a tab\'s menu: no line falls back to a dot', lines.length > 0 && lines.every((one) => !one.dot), JSON.stringify(lines))
  await h.keyboard.press('Escape')
} else check('a tab shows', false)
await qa.app?.close?.().catch(() => {})
done()
