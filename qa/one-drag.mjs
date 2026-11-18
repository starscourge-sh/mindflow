// One way of dragging, driven with a real pointer: a group last in the list left
// by dragging below it; the panel's edge read for groups, subgroups and sidebar
// folders, with a dead band; firm taps on crossing an edge and light ones between
// rows, counted by kind; the panel's overshoot sampled per frame and absent with
// Reduce motion or Motion off; one carried card, its padding measured in every
// drag; no line moving sideways and nothing left faded; a step lifted alone; a
// task to a step and back, each with Undo; Esc cancels every drag; a term's row in
// Archived and in Lookups. Frames go to SHOTS.
// "One look" (12 Nov): on Tasks, the Queue, the sidebar's pins, pages and folders and in Writing, mid-carry, one card
// under the pointer with words on it; exactly one line (a dot at its start, through the middle of one band) or one lit
// target; the room as tall as the carried row folded; no row over another; Esc puts every box back; a drop said, with
// Undo and ⌘Z; the window at 560 x 400. PART="One look" runs those alone; LONG=1 adds a list of 500 with its frames timed.
// "Kept in order" (12 Nov): the lists a rule of their own keeps in order carry the same way: Goals (each tab), Writing
// sorted A to Z and Gems under headings. PART="kept in order" runs those alone, and SKIP="kept in order" everything but
// them (the two together are the whole probe, for a queue that stops a job after ten minutes).
// QA_PART=1, 2, 3 or 4 (16 Nov): the whole probe ran past the queue's ten minutes even so; these four runs together are
// all of it, each a few minutes, each on a fresh copy of the sandbox and passing on its own (QA_PARTS below names them).
//   npx electron-vite build --outDir out-onedrag
//   QA_ARGS=--sandbox QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-onedrag/main/index.js HALIGTREE_QA_AWAY=1 [SHOTS=<dir>] node qa/one-drag.mjs
import { mkdirSync } from 'fs'
import { sandbox } from './sandbox-lib.mjs'
import { checks } from './harness.mjs'
process.env.QA_ARGS ??= '--sandbox'

const SHOTS = process.env.SHOTS ?? ''
if (SHOTS) mkdirSync(SHOTS, { recursive: true })
const { check, done } = checks()
const c = await sandbox({ width: 1200, height: 900 })
const { h, v, electron } = c
// CONSOLE=1: every error the page reports as it comes (in a dev-mode build, React's own words and where it broke).
if (process.env.CONSOLE) {
  h.on('console', (m) => void (m.type() === 'error' && console.log(`PAGE ERROR ${m.text().slice(0, 2000)}`)))
  h.on('pageerror', (e) => void console.log(`PAGE EXCEPTION ${String(e.stack ?? e).slice(0, 2000)}`))
}
// BIN_TRACE=<n> (13 Nov): once, in one run of the Goals part, a goal was found in the Bin with no key of the probe's
// pressed. With the switch on, every call that bins anything is recorded in main (when, what, which window had the
// keys), and in the page every key, press, release and click it gets and who asked for a row by its id (the first
// thing a move to the Bin does): `binsSince()` gives back what went to the Bin, with what the page got just before.
// It also runs "The Bin, traced": that first carry and Esc, n times over, a fresh pair of goals each time.
const BIN_TRACE = Number(process.env.BIN_TRACE) || 0
const pageTrace = () => {
  if (window.__trace) return
  const T = (window.__trace = { events: [], stacks: [] })
  const at = () => Math.round(performance.timeOrigin + performance.now())
  const push = (list, one) => { list.push(one); if (list.length > 600) list.shift() }
  const say = (el) => (el instanceof Element ? `${el.tagName.toLowerCase()}${el.dataset?.id ? `[id ${el.dataset.id.slice(0, 8)}]` : ''}${el.getAttribute('aria-label') ? `[${el.getAttribute('aria-label').slice(0, 24)}]` : ''}` : String(el?.constructor?.name))
  for (const type of ['keydown', 'keyup', 'pointerdown', 'pointerup', 'click', 'contextmenu', 'auxclick', 'drop', 'focus', 'blur'])
    window.addEventListener(type, (e) => push(T.events, { at: at(), type, key: e.key, code: e.code, trusted: e.isTrusted, button: e.button, x: Math.round(e.clientX ?? -1), y: Math.round(e.clientY ?? -1), on: say(e.target), focus: document.hasFocus(), seen: document.visibilityState, hover: document.querySelector('[data-id]:hover')?.dataset.id?.slice(0, 8) }), true)
  const all = Document.prototype.querySelectorAll
  Document.prototype.querySelectorAll = function (sel) {
    if (typeof sel === 'string' && /^\[data-id="[^"]+"\]$/.test(sel)) push(T.stacks, { at: at(), sel: sel.slice(0, 22), stack: String(new Error().stack).split('\n').slice(2, 16).map((line) => line.trim().replace(/^at /, '').replace(/\(?file:\/\/\/.*\/(assets\/[^)]*)\)?/, '$1')).join(' < ') })
    return all.apply(this, arguments)
  }
}
if (BIN_TRACE) {
  await h.addInitScript(pageTrace)
  await h.evaluate(pageTrace)
  console.log('TRACE main:', await electron.evaluate(({ ipcMain, BrowserWindow, app }) => {
    if (globalThis.__binTrace) return 'recording already'
    const seen = (globalThis.__binTrace = { calls: [], front: [] })
    // Whether the app under test ever comes to the front, or a window of its takes the keys: only then can a key
    // pressed on the real keyboard reach it.
    for (const name of ['did-become-active', 'did-resign-active', 'browser-window-focus', 'browser-window-blur']) app.on(name, () => seen.front.push({ at: Date.now(), name }))
    seen.start = { keysIn: BrowserWindow.getAllWindows().filter((w) => !w.isDestroyed() && w.isFocused()).length, shown: BrowserWindow.getAllWindows().filter((w) => !w.isDestroyed() && w.isVisible()).length, windows: BrowserWindow.getAllWindows().length }
    const map = ipcMain._invokeHandlers
    if (!map?.get) return 'no map of handlers to wrap: bins are read off the book instead'
    for (const channel of ['haligtree:bin:put', 'haligtree:bin:put-many']) {
      const was = map.get(channel)
      if (!was) continue
      map.set(channel, (event, ...args) => {
        seen.calls.push({ at: Date.now(), channel, args: JSON.stringify(args).slice(0, 120), from: event.sender.getURL().split('?')[1]?.slice(0, 40), keysIn: BrowserWindow.getAllWindows().filter((w) => !w.isDestroyed() && w.isFocused()).map((w) => w.webContents.getURL().split('?')[1]?.slice(0, 30)), shown: BrowserWindow.getAllWindows().filter((w) => !w.isDestroyed() && w.isVisible()).length })
        return was(event, ...args)
      })
    }
    return 'recording bin:put and bin:put-many'
  }))
}
/** What went to the Bin since last asked (BIN_TRACE), each with the keys, presses and clicks the page got in the three seconds before, and who asked for that row. */
const binsSince = async () => {
  if (!BIN_TRACE) return []
  const calls = await electron.evaluate(() => (globalThis.__binTrace?.calls ?? []).splice(0))
  if (!calls.length) return []
  const page = await h.evaluate(() => ({ events: window.__trace?.events ?? [], stacks: window.__trace?.stacks ?? [] }))
  return calls.map((call) => ({ ...call, events: page.events.filter((one) => one.at > call.at - 3000 && one.at <= call.at + 50).map((one) => `${one.at - call.at}ms ${one.type}${one.key ? ` ${one.key}` : ''}${one.type.startsWith('pointer') || one.type === 'click' ? ` b${one.button} ${one.x},${one.y}` : ''} on ${one.on}${one.focus ? '' : ' (page not in focus)'}${one.hover ? ` hover ${one.hover}` : ''}`), stacks: page.stacks.filter((one) => one.at > call.at - 400 && one.at <= call.at + 50).map((one) => `${one.at - call.at}ms ${one.sel}: ${one.stack}`) }))
}
// BOOK=1: a copy of a real book, where nothing is seeded, binned or taken apart: only the part that carries what is there runs.
const BOOK = !!process.env.BOOK
if (!BOOK) for (const list of ['article', 'nugget']) for (const group of await v('groups', list)) await v('groups:delete', group.id)
const wait = (ms) => h.waitForTimeout(ms)
h.setDefaultTimeout(4000)
// QA_TRACE: every call that scrolls a box of the sidebar, with where it came from, each scroll the sidebar hears, Esc,
// and whether the click a release makes got through to the page: so a row standing "one row lower" names its cause.
const TRACE = () => {
  if (window.qaSide) return
  window.qaSide = []
  const t = () => Math.round(performance.now())
  const inSide = (one) => one instanceof Element && !!one.closest('aside')
  const from = () => new Error().stack.split('\n').slice(3, 8).map((line) => line.trim().replace(/^at /, '').replace(/\(?file:\/\/[^)]*\/assets\//, '(')).join(' < ')
  for (const how of ['scrollIntoView', 'scrollTo', 'scrollBy', 'scroll']) {
    const was = Element.prototype[how]
    Element.prototype[how] = function (...args) {
      const box = how === 'scrollIntoView' ? this.closest?.('aside') : inSide(this) ? this : null
      const before = box ? [...document.querySelectorAll('aside, aside *')].filter((one) => one.scrollTop).map((one) => one.scrollTop).join('/') : ''
      const out = was.apply(this, args)
      if (box) window.qaSide.push(`${t()}ms ${how}(${JSON.stringify(args[0] ?? '')}) on <${this.tagName.toLowerCase()} ${[...this.attributes].filter((a) => a.name.startsWith('data-')).map((a) => a.name).join(' ')}> scrolled before ${before || 0}, after ${[...document.querySelectorAll('aside, aside *')].filter((one) => one.scrollTop).map((one) => one.scrollTop).join('/') || 0}; from ${from()}`)
      return out
    }
  }
  const top = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollTop')
  Object.defineProperty(Element.prototype, 'scrollTop', { ...top, set(value) { if (inSide(this) && this.scrollTop !== value) window.qaSide.push(`${t()}ms scrollTop = ${value} (was ${this.scrollTop}); from ${from()}`); top.set.call(this, value) } })
  const focus = HTMLElement.prototype.focus
  HTMLElement.prototype.focus = function (...args) { if (inSide(this)) window.qaSide.push(`${t()}ms focus(${JSON.stringify(args[0] ?? '')}) on a sidebar <${this.tagName.toLowerCase()}>; from ${from()}`); return focus.apply(this, args) }
  document.addEventListener('scroll', (event) => void (inSide(event.target) && window.qaSide.push(`${t()}ms the sidebar heard a scroll: now ${event.target.scrollTop} of ${event.target.scrollHeight}`)), true)
  addEventListener('keydown', (event) => void (event.key === 'Escape' && window.qaSide.push(`${t()}ms Esc pressed`)), true)
  addEventListener('pointerup', () => void window.qaSide.push(`${t()}ms pointer up`), true)
  addEventListener('click', (event) => void window.qaSide.push(`${t()}ms a click reached the page's top on <${event.target.tagName?.toLowerCase()} ${[...(event.target.attributes ?? [])].filter((a) => a.name.startsWith('data-')).map((a) => a.name).join(' ')}>`), true)
  addEventListener('click', (event) => void window.qaSide.push(`${t()}ms THE CLICK GOT THROUGH to <${event.target.tagName?.toLowerCase()}> (not swallowed)`))
}
if (process.env.QA_TRACE) {
  await electron.context().addInitScript(`(${TRACE.toString()})()`)
  await h.evaluate(`(${TRACE.toString()})()`)
  // Every call that writes, kept in main with its time (reads left out): what pinned, moved or saved, and from which window.
  await electron.evaluate(({ ipcMain }) => {
    globalThis.qaWrites = []
    for (const [name, was] of [...ipcMain._invokeHandlers]) {
      if (!/pin|save|put|move|order|drop|nest|folder|group|restore|set|make|add|delete|create|open|recent|seen/i.test(name)) continue
      ipcMain._invokeHandlers.set(name, (event, ...args) => {
        let said = ''
        try { said = JSON.stringify(args).slice(0, 160) } catch { said = '' }
        globalThis.qaWrites.push({ at: Date.now(), name, args: said })
        if (globalThis.qaWrites.length > 400) globalThis.qaWrites.splice(0, 200)
        return was(event, ...args)
      })
    }
  })
}
/** A part of the probe: a part that cannot even run on old code is a fail, and the rest still runs. */
/** The probe in four runs (QA_PART): each part's name starts with one of its run's. */
const QA_PARTS = {
  1: ['Groups', "The panel's overshoot", 'Sidebar folders', 'A plain list, a tab', "Today's list", 'A task onto a task makes a step', 'Esc ends the whole press'],
  2: ['One look: Tasks', 'One look: the Queue', 'One look: the Inbox', 'One look: the sidebar', 'One look: the board', 'A drop is said'],
  3: ['One look: the Matrix', 'One look: quick capture', 'One look: the main book', 'One look: 560 x 400', 'One look: Writing, the reference', `One look: ${Number(process.env.LONG) > 1 ? Number(process.env.LONG) : 500} rows`],
  4: ['The Bin, traced', 'One look, kept in order', 'One card', "A term's row", 'Frames'],
  5: ['Several notes'],
}
const inRun = (name) => !process.env.QA_PART || (QA_PARTS[process.env.QA_PART] ?? []).some((start) => name.startsWith(start))
const part = async (name, run) => { if (!inRun(name) || (process.env.PART && !name.includes(process.env.PART)) || (process.env.SKIP && name.includes(process.env.SKIP))) return; try { await run() } catch (error) { check(`${name} could be driven`, false, String(error.message).split('\n')[0]); for (const one of await binsSince().catch(() => [])) console.log(`BINNED in ${name}: ${JSON.stringify(one)}`); await shot(`broke-${name.replace(/\W+/g, '-')}`); await h.keyboard.press('Escape').catch(() => {}); await h.mouse.up().catch(() => {}); await wait(300) } }
const shot = (name) => (SHOTS ? h.screenshot({ path: `${SHOTS}/${name}.png` }) : null)
const film = async (name, n = 6) => { if (SHOTS) for (let i = 0; i < n; i++) { await h.screenshot({ path: `${SHOTS}/${name}-${i}.png` }); await wait(50) } }
const both = async (name) => { if (!SHOTS) return; for (const look of ['light', 'dark']) { await c.look(look); await wait(120); await h.screenshot({ path: `${SHOTS}/${name}-${look}.png` }) } await c.look('light'); await wait(120) }
const said = () => h.evaluate(() => document.querySelector('[data-drag-label]')?.textContent ?? '')
const kinds = () => electron.evaluate(() => globalThis.haligtreeTapKinds())
const tapsSince = async (before) => { await wait(180); const now = await kinds(); const fresh = now.slice(before.length); return { level: fresh.filter((k) => k === 'level').length, align: fresh.filter((k) => k === 'align').length } }
const CARD = '[data-carried-card], [data-ghost], [data-lifted], [data-folder-ghost], [data-split-card]'
const card = () => h.evaluate((sel) => {
  // Seen, not merely in the page: a card at opacity 0, itself or above, is no card.
  const seen = (one) => { for (let at = one; at; at = at.parentElement) if (+getComputedStyle(at).opacity < 0.05) return false; return true }
  const all = [...document.querySelectorAll(sel)].filter((one) => one.getClientRects().length && seen(one))
  const el = all[0]
  if (!el) return null
  const s = getComputedStyle(el)
  return { count: all.length, pad: `${s.paddingTop} ${s.paddingRight} ${s.paddingBottom} ${s.paddingLeft}`, radius: s.borderTopLeftRadius, bg: s.backgroundColor, shadow: s.boxShadow !== 'none', text: el.textContent.slice(0, 60), same: el.hasAttribute('data-carried-card') }
}, CARD)
const padOf = (one) => one?.pad ?? 'none'
const pads = {}

const TITLES = ['Ash', 'Birch', 'Cedar', 'Elm', 'Fir', 'Hazel', 'Oak', 'Pine', 'Yew']
const ids = {}
if (!BOOK) {
  for (const title of TITLES) { const id = await v('article:new'); await v('item:save', id, { title }); ids[title] = id }
  const others = (await v('items', 'article')).map((one) => one.id).filter((id) => !Object.values(ids).includes(id))
  for (const id of others) await v('bin:put', id)
  if (BIN_TRACE) await electron.evaluate(() => void (globalThis.__binTrace?.calls ?? []).splice(0))
}
let box, a, before, t
const row = (title) => h.locator('button[data-row]:not([data-lifted] *)', { hasText: new RegExp(`^${title}`) }).first()
const blockBox = (id) => h.evaluate((g) => { const r = document.querySelector(`[data-group-block="${g}"]`)?.getBoundingClientRect(); return r && { top: r.top, bottom: r.bottom, left: r.left, right: r.right } }, id)
const inGroup = async (id) => (await v('groups', 'article')).find((one) => one.members.includes(id))?.id ?? null
/** Loose rows, then a group last in the list holding three rows and a subgroup of two. */
const scene = async (layout) => {
  // Loose rows stand after groups in a list, so a group is last only when every other page is in a group before it.
  const held = layout?.groups ?? { last: [ids.Cedar, ids.Elm, ids.Fir] }
  const named = new Set([...(layout?.top ?? []), ...Object.values(held).flat()])
  const groups = layout?.loose ? held : { first: Object.values(ids).filter((id) => !named.has(id)), ...held }
  const top = layout?.loose ? layout.top : ['g:first', 'g:last']
  await v('groups:arrange', 'article', { top, groups, revive: Object.keys(groups).map((id) => ({ id, name: id === 'last' ? 'Last' : id === 'sub' ? 'Sub' : id === 'first' ? 'First' : 'Other', icon: null, color: null, folded: 0, folder: 0 })) })
  for (const id of Object.keys(groups)) await v('groups:set', id, { folded: false })
  await h.evaluate(() => localStorage.setItem('view:article', JSON.stringify({ sort: 'manual', group: 'none', filter: {}, density: 'list' })))
  await c.go('articles')
  await wait(700)
}
const lift = async (locator) => {
  const a = await locator.boundingBox()
  await h.mouse.move(a.x + 200, a.y + a.height / 2)
  await h.mouse.down()
  await h.mouse.move(a.x + 200, a.y + a.height / 2 + 8, { steps: 3 })
  await wait(120)
  return a
}
const glideTo = async (x, y) => { await h.mouse.move(x, y, { steps: 10 }); await wait(160) }


const addLine = async (title, steps) => { const made = await v('task:add', `${title} today`); if (steps) await v('task:save', made.id, { subtasks: steps.map((text) => ({ text, done: false })) }); return made.id }
let lineIds = {}
const task = async (id) => (await v('tasks')).find((one) => one.id === id)
const line = (id) => h.locator(`[data-day-line="${id}"]`)
const stepRow = (id, n) => h.locator(`[data-day-step="${id}:${n}"]`)
const ringsLeft = () => h.evaluate(() => [...document.querySelectorAll('[data-day-line] [role=checkbox]')].map((one) => Math.round(one.getBoundingClientRect().left)))
const liftAt = async (locator) => {
  const r = await locator.boundingBox()
  // The tick column's left: never the words, which are for writing.
  const x = r.x + 6, y = Math.min(r.y + 12, r.y + r.height / 2)
  await h.mouse.move(x, y)
  await h.mouse.down()
  await h.mouse.move(x, y + 8, { steps: 3 })
  await wait(160)
  return { x, y, r }
}
const headOf = (id) => h.locator(`[data-day-head="${id}"], [data-day-line="${id}"]`).first()

// --- 1. Groups ---
await part('Groups', async () => {
await scene()
box = await blockBox('last')
a = await lift(row('Fir'))
pads.row = await card()
await both('list-row-carried')
await glideTo(a.x + 200, box.bottom + 14)
check('a group last in the list: the last row dragged below it says it leaves', /Remove from/.test(await said()), await said())
await shot('group-left-below')
await h.mouse.up(); await wait(500)
check('let go below, the last row is out of the group', (await inGroup(ids.Fir)) === null, String(await inGroup(ids.Fir)))
await h.keyboard.press('Meta+z'); await wait(500)
check('⌘Z puts it back in', (await inGroup(ids.Fir)) === 'last')

await scene(); box = await blockBox('last')
a = await lift(row('Cedar'))
await glideTo(a.x + 200, box.bottom + 14)
check('a middle row dragged below the last group leaves too', /Remove from/.test(await said()), await said())
await h.mouse.up(); await wait(500)
check('and it is out', (await inGroup(ids.Cedar)) === null)

// The dead band: small moves round the edge never flip it.
await scene(); box = await blockBox('last')
a = await lift(row('Elm'))
await glideTo(a.x + 200, box.bottom + 14)
const heard = new Set([await said()])
for (const off of [12, 11, 10, 9, 10, 12]) { await h.mouse.move(a.x + 200, box.bottom + off); await wait(40); heard.add(await said()) }
check('past the edge, small moves keep one reading', heard.size === 1, [...heard].join(' | '))
await glideTo(a.x + 200, box.bottom - 16)
const inside = await said()
const heardIn = new Set([inside])
for (const off of [-14, -12, -10, -12, -14]) { await h.mouse.move(a.x + 200, box.bottom + off); await wait(40); heardIn.add(await said()) }
check('back inside, it reads in the group again and holds', !/Remove from/.test(inside) && heardIn.size === 1, [...heardIn].join(' | '))

// Taps on crossing, by kind. Still carrying Elm, inside.
before = await kinds()
await glideTo(a.x + 200, box.bottom + 14)
t = await tapsSince(before)
check('crossing the edge out: one firm tap', t.level === 1, JSON.stringify(t))
before = await kinds()
await glideTo(a.x + 200, box.bottom - 16)
t = await tapsSince(before)
check('crossing the edge in: one firm tap', t.level === 1, JSON.stringify(t))
before = await kinds()
const cedar = await row('Cedar').boundingBox()
await glideTo(a.x + 200, cedar.y + 4)
t = await tapsSince(before)
check('between rows inside: light taps only', t.level === 0 && t.align >= 1, JSON.stringify(t))
await h.keyboard.press('Escape'); await wait(400)
check('Esc: the row is where it was, nothing carried', (await inGroup(ids.Elm)) === 'last' && !(await card()))

// Subgroup edges: the group holds a row and a subgroup last in it; the group is last in the list.
const SUB = () => ({ groups: { last: [ids.Cedar, 'g:sub'], sub: [ids.Elm, ids.Fir] } })
await scene(SUB())
box = await blockBox('sub')
const outer = await blockBox('last')
a = await lift(row('Fir'))
await glideTo(a.x + 200, outer.bottom + 14)
check('past the subgroup and its group: out of both', /Remove from/.test(await said()), await said())
await h.mouse.up(); await wait(500)
check('let go there, it stands at the top level', (await inGroup(ids.Fir)) === null, String(await inGroup(ids.Fir)))
await scene(SUB())
const roomy = () => ({ loose: true, top: ['g:last', ids.Ash, ids.Birch, ...['Hazel', 'Oak', 'Pine', 'Yew'].map((one) => ids[one])], groups: { last: ['g:sub', ids.Cedar], sub: [ids.Elm, ids.Fir] } })
await scene(roomy())
box = await blockBox('sub')
a = await lift(row('Fir'))
const cedarNow = await row('Cedar').boundingBox()
await glideTo(a.x + 200, cedarNow.y + 3)
check('past the subgroup only: into its group', /Move to Last|Remove from Sub/.test(await said()), await said())
await h.mouse.up(); await wait(500)
check('let go, it is in the group, out of the subgroup', (await inGroup(ids.Fir)) === 'last', String(await inGroup(ids.Fir)))

// A group carried out of a group last in the list.
await scene(SUB())
const outerBox = await blockBox('last')
a = await lift(h.locator('[data-group-row="sub"]'))
pads.group = await card()
await glideTo(a.x + 200, outerBox.bottom + 40)
check('a subgroup dragged below its group moves out', /Move out of Last/.test(await said()), await said())
await h.mouse.up(); await wait(500)
check('let go, it stands at the top level', !(await v('groups', 'article')).find((one) => one.id === 'sub')?.parent)

})
// --- 2. The panel's overshoot ---
await part("The panel's overshoot", async () => {
const sample = (ms) => h.evaluate((ms) => new Promise((resolve) => {
  const out = []
  const start = performance.now()
  const read = () => {
    const block = document.querySelector('[data-group-block="last"]')
    const bottom = block?.querySelector(':scope > [data-panel] > [data-panel-part="bottom"]')?.getBoundingClientRect().bottom
    const rows = [...(block?.querySelectorAll('[data-sortable-id]') ?? [])].filter((one) => one.getClientRects().length && !one.querySelector(':scope > [data-drop-room]'))
    const last = Math.max(...rows.map((one) => one.getBoundingClientRect().bottom))
    out.push({ t: Math.round(performance.now() - start), bottom, last })
    if (performance.now() - start < ms) requestAnimationFrame(read)
    else resolve(out)
  }
  read()
}), ms)
const peak = async (setup) => {
  await scene({ loose: true, top: ['g:last', ids.Ash, ids.Birch, ids.Fir, ...['Hazel', 'Oak', 'Pine', 'Yew'].map((one) => ids[one])], groups: { last: [ids.Cedar, ids.Elm] } })
  await setup?.()
  const start = await lift(row('Ash'))
  const elm = await row('Elm').boundingBox()
  // Into the group, by its last row's upper half, the frames read from before it crosses.
  const gone = sample(800)
  await h.mouse.move(start.x + 200, elm.y + elm.height * 0.2, { steps: 8 })
  const frames = await gone
  const rest = frames.at(-1).bottom
  const most = Math.max(...frames.map((one) => one.bottom))
  const was = frames[0].bottom
  const outside = frames.filter((one) => one.last > one.bottom + 0.5).length
  await both2('panel-accept')
  const cards = (await card())?.count
  await h.keyboard.press('Escape')
  await wait(200)
  await h.mouse.up()
  await wait(300)
  counts.push(cards)
  return { over: most - Math.max(was, rest), outside, frames: frames.length }
}
const both2 = async (name) => shot(name)
const counts = []
const moving = await peak()
check('the panel overshoots a little as it accepts, and settles', moving.over >= 6 && moving.over <= 16, `${moving.over.toFixed(1)}px over ${moving.frames} frames`)
check('no frame with a row outside its box', moving.outside === 0, `${moving.outside} frames`)
check('after the glide, one card on screen', counts[0] === 1, String(counts[0]))
await h.emulateMedia({ reducedMotion: 'reduce' })
const reduced = await peak()
check('Reduce motion: no overshoot', reduced.over < 1.5, `${reduced.over.toFixed(1)}px`)
await h.emulateMedia({ reducedMotion: 'no-preference' })
await h.evaluate(() => (document.documentElement.dataset.motion = 'off'))
const off = await peak(() => h.evaluate(() => (document.documentElement.dataset.motion = 'off')))
check('Motion off: no overshoot', off.over < 1.5, `${off.over.toFixed(1)}px`)
await h.evaluate(() => delete document.documentElement.dataset.motion)

})
// --- 3. Sidebar folders ---
await part('Sidebar folders', async () => {
const money = 'f-money', sub1 = 'f-one', sub2 = 'f-two'
await v('groups:arrange', 'article', { top: [`g:${money}`, ids.Ash], groups: { [money]: [ids.Birch, `g:${sub1}`, `g:${sub2}`], [sub1]: [ids.Cedar], [sub2]: [ids.Elm] }, revive: [{ id: money, name: 'Money', icon: null, color: null, folded: 0, folder: 1 }, { id: sub1, name: 'One', icon: null, color: null, folded: 0, folder: 1 }, { id: sub2, name: 'Two', icon: null, color: null, folded: 0, folder: 1 }] })
await c.go('articles'); await wait(800)
const side = (id) => h.locator(`[data-side-folder="${id}"]`)
const liftSide = async (id) => {
  const r = await side(id).boundingBox()
  await h.mouse.move(r.x + 50, r.y + r.height / 2)
  await h.mouse.down()
  await h.mouse.move(r.x + 50, r.y + r.height / 2 + 8, { steps: 3 })
  await wait(120)
  return r
}
const parentOf = async (id) => (await v('groups', 'article')).find((one) => one.id === id)?.parent ?? null
let two = await side(sub2).boundingBox()
before = await kinds()
const sr = await liftSide(sub2)
pads.folder = await card()
await both('folder-carried')
await glideTo(sr.x + 50, two.y + two.height + 12)
await shot('folder-past-edge')
check('sidebar: past its edge, one card and no split places', (await card())?.count === 1 && !(await h.locator('[data-split-zone]').count()) && !(await h.evaluate(() => 'splitDrag' in document.documentElement.dataset)), JSON.stringify(await card()))
t = await tapsSince(before)
check('sidebar: past its folder\'s edge, one firm tap', t.level === 1, JSON.stringify(t))
await h.mouse.up(); await wait(600)
check('sidebar: the last subfolder dragged below its folder leaves it', (await parentOf(sub2)) === null, String(await parentOf(sub2)))
await h.keyboard.press('Meta+z'); await wait(600)
check('sidebar: ⌘Z puts it back', (await parentOf(sub2)) === money, String(await parentOf(sub2)))
await c.go('articles'); await wait(500)
const sr2 = await liftSide(sub2)
await h.keyboard.press('Escape'); await wait(300)
await h.mouse.move(sr2.x + 50, sr2.y + 60, { steps: 4 })
await h.mouse.up(); await wait(400)
check('sidebar: Esc cancels it', (await parentOf(sub2)) === money && !(await card()))
await v('groups:delete', money); await v('groups:delete', sub1); await v('groups:delete', sub2)

})
// --- 4. A plain list, a tab ---
await part('A plain list, a tab', async () => {
await v('groups:delete', 'last').catch(() => {}); await v('groups:delete', 'sub').catch(() => {})
await c.go('articles'); await wait(700)
await c.go('queue'); await wait(700)
a = await lift(h.locator('main [data-sortable-id], [data-pane] [data-sortable-id]').first())
pads.plain = await card()
await shot('plain-row-carried')
await h.keyboard.press('Escape'); await wait(300)
await h.mouse.up()
const tab = h.locator('[data-tab]').first()
const tb = await tab.boundingBox()
await h.mouse.move(tb.x + 20, tb.y + 10); await h.mouse.down(); await h.mouse.move(tb.x + 60, tb.y + 16, { steps: 6 }); await wait(160)
pads.tab = await card()
await shot('tab-carried')
await h.keyboard.press('Escape'); await wait(200); await h.mouse.up(); await wait(300)

})
// --- 5. Today's list: a row carried into your own order, onto the Later and Upcoming tabs, and put back with Esc ---
// (Today's written page is retired: its lines are the list's rows, which are dragged here.)
const FILM = process.env.QA_SHOTS
const rowOf = (id) => h.locator(`[data-task-row][data-id="${id}"]`).first()
const order = () => h.evaluate(() => [...document.querySelectorAll('[data-task-row]')].map((one) => one.getAttribute('data-id')))
const grab = async (id) => { const r = await rowOf(id).boundingBox(); return { x: r.x + 220, y: r.y + 14 } }
/** Carried from a row to a point in steps of 50ms, filmed at each step when FILM is set; let go unless `hold`. */
const carry = async (id, to, { name, hold = false } = {}) => {
  const from = await grab(id)
  await h.mouse.move(from.x, from.y); await h.mouse.down()
  for (let i = 1; i <= 14; i++) {
    await h.mouse.move(from.x + ((to.x - from.x) * i) / 14, from.y + ((to.y - from.y) * i) / 14)
    await wait(50)
    if (FILM && name) await h.screenshot({ path: `${FILM}/${name}-${String(i).padStart(2, '0')}.png` })
  }
  if (hold) return
  await wait(150); await h.mouse.up(); await wait(1200)
}
await part("Today's list", async () => {
  for (const task of await v('tasks')) if (task.status === 'open' && (task.dueAt || task.deadline)) await v('task:save', task.id, { status: 'dropped' })
  lineIds = { paint: await addLine('Paint the fence'), call: await addLine('Call the bank'), read: await addLine('Read the lease'), post: await addLine('Post the parcel') }
  await h.reload(); await wait(1500)
  await c.go('today'); await wait(1200)
  for (const look of ['light', 'dark']) {
    await c.look(look); await wait(200)
    const before = await order()
    const last = before.at(-1)
    const top = await rowOf(before[0]).boundingBox()
    // Its own place, while carried: the gap stays faintly where it was, one lifted card follows the pointer.
    await carry(last, { x: top.x + 220, y: top.y + 4 }, { name: `today-drag-${look}`, hold: true })
    const lifted = await h.evaluate((id) => ({ place: !!document.querySelector(`[data-sortable-id="${id}"] > [data-drop-room]`) && document.querySelectorAll('[data-drop-line]').length === 1, cards: document.querySelectorAll('[data-dnd-overlay], [data-carried]').length }), last)
    check(`${look}: a carried task's room opens where it will land, one line through it`, lifted.place, JSON.stringify(lifted))
    await wait(150); await h.mouse.up(); await wait(1200)
    if (FILM) await h.screenshot({ path: `${FILM}/today-drag-${look}-dropped.png` })
    const after = await order()
    check(`${look}: dropped at the top, it is first, in your own order`, after[0] === last && after.length === before.length, `${before.join(',')} -> ${after.join(',')}`)
    // Esc mid-drag puts it back where it was.
    const was = await order()
    await carry(was[2], { x: top.x + 220, y: top.y + 4 }, { hold: true })
    await h.keyboard.press('Escape'); await wait(300); await h.mouse.up(); await wait(900)
    check(`${look}: Esc mid-drag puts it back, nothing left faded`, (await order()).join() === was.join() && !(await h.locator('.mf-carried-place, [data-held], [data-drop-room], [data-drop-line]').count()), (await order()).join(','))
  }
  await c.look('light'); await wait(200)
  // Onto the Later tab: someday; onto the Upcoming tab: tomorrow.
  const tab = async (label) => { const r = await h.locator(`[data-page] header button[aria-label="${label}"]`).first().boundingBox(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 } }
  await carry(lineIds.read, await tab('Later'))
  const read = await task(lineIds.read)
  check('dropped on the Later tab: off Today, in Later, someday', !(await order()).includes(lineIds.read) && read?.planFor === 'someday', JSON.stringify({ plan: read?.planFor, due: read?.dueAt }))
  await carry(lineIds.post, await tab('Upcoming'))
  const post = await task(lineIds.post)
  const tomorrow = new Date(c.now()); tomorrow.setDate(tomorrow.getDate() + 1)
  check('dropped on the Upcoming tab: off Today, due tomorrow', !(await order()).includes(lineIds.post) && !!post?.dueAt && new Date(post.dueAt).toDateString() === tomorrow.toDateString(), JSON.stringify({ due: post?.dueAt }))
})
// --- 5b. A task rested on another's middle becomes its step, on Today and on Later: lit while it waits, edges still
// reorder, Esc cancels, the notice and ⌘Z undo it, the steps unfold under their task on a tree line. Filmed every 50ms.
const sortBox = (id) => h.evaluate((one) => { const r = document.querySelector(`[data-sortable-id="${one}"]`)?.getBoundingClientRect(); return r && { x: r.x, y: r.y, h: r.height } }, id)
/** Carried from one row until the pointer sits on another's middle (or `at` of its height), as Writing reads a row rested on, filmed. */
const onto = async (id, target, { name, at = 0.5, rest = 900 } = {}) => {
  const [a, b] = [await sortBox(id), await sortBox(target)]
  const from = { x: a.x + 220, y: a.y + 14 }
  const to = { x: from.x, y: b.y + b.h * at }
  await h.mouse.move(from.x, from.y); await h.mouse.down()
  let n = 0
  const frame = async () => { if (FILM && name) await h.screenshot({ path: `${FILM}/${name}-${String(n++).padStart(2, '0')}.png` }) }
  for (let i = 1; i <= 12; i++) { await h.mouse.move(from.x, from.y + ((to.y - from.y) * i) / 12); await wait(50); await frame() }
  for (let t = 0; t < rest; t += 50) { await h.mouse.move(to.x + (t % 100 ? 1 : 0), to.y); await wait(50); await frame() }
}
const lit = () => h.evaluate(() => document.querySelector('[data-nest-hot]')?.getAttribute('data-sortable-id') ?? null)
const toastSaid = () => h.evaluate(() => [...document.querySelectorAll('[role=status]')].map((one) => one.textContent).join(' | '))
const stepsOf = async (id) => (await task(id))?.subtasks?.map((one) => one.text) ?? []
await part('A task onto a task makes a step', async () => {
  for (const look of ['light', 'dark']) {
    await c.look(look); await wait(150)
    for (const old of await v('tasks')) if (old.status === 'open') await v('task:save', old.id, { status: 'dropped' })
    const ids = { water: await addLine('Water the plants'), pots: await addLine('Buy pots'), soil: await addLine('Get soil'), seeds: await addLine('Sow seeds', ['Pick a tray']) }
    await h.reload(); await wait(1500); await c.go('today'); await wait(1200)
    // Esc while lit: nothing changes.
    await onto(ids.pots, ids.water, { name: `nest-esc-${look}` })
    check(`${look}: rested on a task's middle, that task is lit`, (await lit()) === ids.water, String(await lit()))
    check(`${look}: the card says whose step it would be`, (await said()) === 'Make it a step of “Water the plants”', await said())
    await h.keyboard.press('Escape'); await wait(300); await h.mouse.up(); await wait(900)
    check(`${look}: Esc puts it back: still a task, no step, nothing lit`, (await task(ids.pots))?.status === 'open' && !(await stepsOf(ids.water)).length && !(await lit()), JSON.stringify(await stepsOf(ids.water)))
    // Let go while lit: a step.
    await onto(ids.pots, ids.water, { name: `nest-drop-${look}` })
    await wait(100); await h.mouse.up(); await wait(1200)
    if (FILM) for (let i = 0; i < 8; i++) { await h.screenshot({ path: `${FILM}/nest-after-${look}-${i}.png` }); await wait(50) }
    const pots = await task(ids.pots)
    check(`${look}: let go, it is a step of that task and gone from the list`, (await stepsOf(ids.water)).join() === 'Buy pots' && pots?.status === 'dropped' && !(await order()).includes(ids.pots), JSON.stringify({ steps: await stepsOf(ids.water), status: pots?.status }))
    check(`${look}: the notice says so, with Undo`, (await toastSaid()).includes('Now a step of Water the plants') && (await toastSaid()).includes('Undo'), await toastSaid())
    const tree = await h.evaluate((id) => { const ul = document.querySelector(`[data-steps-of="${id}"]`); return { steps: ul ? [...ul.querySelectorAll('li')].map((li) => li.textContent) : [], lines: ul?.parentElement?.querySelectorAll('svg path').length ?? 0, fold: document.querySelector(`[data-steps-fold="${id}"]`)?.getAttribute('aria-expanded') } }, ids.water)
    check(`${look}: its steps unfold under it on a tree line, the fold open`, tree.steps.join() === 'Buy pots' && tree.lines >= 2 && tree.fold === 'true', JSON.stringify(tree))
    await h.locator(`[data-steps-fold="${ids.water}"]`).click(); await wait(400)
    check(`${look}: the fold folds the steps away`, !(await h.locator(`[data-steps-of="${ids.water}"]`).count()), '')
    await h.locator(`[data-steps-fold="${ids.water}"]`).click(); await wait(400)
    // ⌘Z: a task again, its step gone.
    await h.mouse.click(5, 450); await h.keyboard.press('Meta+z'); await wait(1200)
    check(`${look}: ⌘Z makes it a task again`, (await task(ids.pots))?.status === 'open' && !(await stepsOf(ids.water)).length && (await order()).includes(ids.pots), JSON.stringify({ steps: await stepsOf(ids.water), status: (await task(ids.pots))?.status }))
    // An edge still reorders: to just above another's top edge it goes before it, no step made.
    const before = await order()
    await onto(ids.soil, ids.water, { at: 0.05, rest: 700 })
    check(`${look}: on a task's edge nothing is lit`, !(await lit()), String(await lit()))
    await h.mouse.up(); await wait(1200)
    const after = await order()
    check(`${look}: let go on the edge, it is moved, not a step`, after.indexOf(ids.soil) < after.indexOf(ids.water) && !(await stepsOf(ids.water)).length, `${before.join(',')} -> ${after.join(',')}`)
    // A task with steps of its own stays a task, said in words.
    await onto(ids.seeds, ids.water, { name: `nest-refused-${look}` })
    check(`${look}: a task with steps of its own is refused, in words`, (await said()).includes('steps of its own') && !(await lit()), await said())
    await h.mouse.up(); await wait(1000)
    check(`${look}: refused, nothing changed`, (await task(ids.seeds))?.status === 'open' && !(await stepsOf(ids.water)).length, '')
  }
  await c.look('light'); await wait(150)
  // On Later as well (a list not in your own order: rows never slide, a middle still takes a step).
  const later = { box: (await v('task:add', 'Fix the shed')).id, nails: (await v('task:add', 'Buy nails')).id }
  for (const id of Object.values(later)) await v('task:save', id, { due: null, plan: 'someday' })
  await h.reload(); await wait(1500); await c.go('later'); await wait(1200)
  await onto(later.nails, later.box, { name: 'nest-later' })
  check('Later: rested on a task\'s middle, it is lit', (await lit()) === later.box, String(await lit()))
  await h.mouse.up(); await wait(1200)
  check('Later: let go, a step of it', (await stepsOf(later.box)).join() === 'Buy nails' && (await task(later.nails))?.status === 'dropped', JSON.stringify(await stepsOf(later.box)))
  await h.mouse.click(5, 450); await h.keyboard.press('Meta+z'); await wait(1200)
  check('Later: ⌘Z makes it a task again', (await task(later.nails))?.status === 'open' && !(await stepsOf(later.box)).length, '')
})
await part('Esc ends the whole press', async () => {
  if (!lineIds.call) {
    for (const old of await v('tasks')) if (old.status === 'open' && (old.dueAt || old.deadline)) await v('task:save', old.id, { status: 'dropped' })
    lineIds = { paint: await addLine('Paint the fence'), call: await addLine('Call the bank') }
  }
  await h.reload(); await wait(1500); await c.go('today'); await wait(900)
  // Esc while held, moving on: one Esc ends the whole press, for every drag that has Esc.
  const clean = () => h.evaluate(() => ({ cards: [...document.querySelectorAll('[data-carried-card], [data-ghost], [data-lifted], [data-folder-ghost], [data-split-card], [data-cal-carried]')].filter((one) => one.getClientRects().length).length, strips: document.querySelectorAll('[data-split-zone]').length, split: 'splitDrag' in document.documentElement.dataset, dragging: 'dragging' in document.documentElement.dataset }))
  const pageEdges = () => h.evaluate(() => { const r = document.querySelector('[data-split-area]').getBoundingClientRect(); return { left: r.left + 16, right: r.right - 16, mid: r.top + r.height / 2 } })
  const esc = async (name, spot, { lifts = true, far = 14 } = {}) => {
    const at = await spot()
    if (!at) return console.log(`SKIP  Esc: ${name} (not on this page)`)
    await h.mouse.move(at.x, at.y); await h.mouse.down()
    await h.mouse.move(at.x + 4, at.y + far, { steps: 4 }); await wait(160)
    const held = await clean()
    await h.keyboard.press('Escape'); await wait(450)
    const first = await clean()
    const edges = await pageEdges()
    // Read at every stop: back over its own column, a second drag's places go away again.
    const moved = { cards: 0, strips: 0, split: false, dragging: false }
    for (const [x, y] of [[at.x + 40, at.y + 70], [edges.left, edges.mid], [edges.right, edges.mid], [at.x + 20, at.y + 30]]) {
      await h.mouse.move(x, y, { steps: 6 }); await wait(140)
      const now = await clean()
      for (const key of Object.keys(moved)) moved[key] = moved[key] || now[key]
    }
    if (SHOTS) await h.screenshot({ path: `${SHOTS}/esc-${name.replace(/\W+/g, '-')}.png` })
    await h.mouse.up(); await wait(250)
    if (lifts) check(`Esc: ${name}: while it was held, one card`, held.cards === 1, JSON.stringify(held))
    check(`Esc: ${name}: nothing carried, and moving on while held starts nothing`, !first.cards && !first.dragging && !moved.cards && !moved.strips && !moved.split && !moved.dragging, JSON.stringify({ first, moved }))
  }
  const centreOf = (loc, dx = 200) => async () => { const r = (await loc.count()) ? await loc.first().boundingBox() : null; return r && { x: r.x + Math.min(dx, r.width / 2), y: r.y + r.height / 2 } }
  await esc('a row on Today', centreOf(rowOf(lineIds.call), 220))
  await c.go('articles'); await wait(700)
  await scene()
  await esc('a row in a group', centreOf(row('Cedar')))
  await esc('a group', centreOf(h.locator('[data-group-row="last"]')))
  await v('groups:arrange', 'article', { top: ['f-side', ids.Ash], groups: { 'f-side': [ids.Birch] }, revive: [{ id: 'f-side', name: 'Side', icon: null, color: null, folded: 0, folder: 1 }] })
  await c.go('articles'); await wait(700)
  await esc('a sidebar folder', centreOf(h.locator('[data-side-folder="f-side"]'), 50))
  await esc('a tab', centreOf(h.locator('[data-tab] [role=tab]'), 30))
  await c.go('queue'); await wait(700)
  await esc('a queue row', centreOf(h.locator('[data-pane] [data-sortable-id]')))
  await c.go('articles'); await wait(500)
  await esc('a pin in the sidebar', centreOf(h.locator('[data-sortable-id]', { hasText: 'Start here' }), 40))
  await h.evaluate(() => localStorage.setItem('view:tasks:today', JSON.stringify({ sort: 'manual', group: 'matrix' })))
  await h.reload(); await wait(1500); await c.go('today'); await wait(900)
  await esc('a task in the Matrix', centreOf(h.locator('[data-pane] [data-sortable-id]')))
  await h.evaluate(() => localStorage.setItem('view:tasks:today', JSON.stringify({ sort: 'manual', group: 'when' })))
  await h.reload(); await wait(1500); await c.go('today'); await wait(900)
  // It carries nothing until the page's edge: Esc before that, and the edge then brings up nothing.
  await esc('a task row on Tasks', centreOf(h.locator('[data-pane] [data-task-row] [data-row]')), { lifts: false })
  await c.go('calendar'); await wait(900)
  await esc('a task on the Calendar', centreOf(h.locator('[data-cal-loose]'), 40), { far: 40, lifts: false })
  await c.go('monthpage'); await wait(900)
  await esc('a line in the Month plan', centreOf(h.locator('[data-plan-task]'), 20))
  await h.reload(); await wait(1500); await c.go('today'); await wait(900)
})

// --- 5c. One look for every drag (playbook interaction.md): on every list, mid-carry, one card under the pointer with
// words on it; exactly one line (its dot at the start, through the middle of one band) or one lit target; the room as
// tall as the carried row folded; no row over another; Esc puts every box back; a drop is said, with Undo and ⌘Z.
/** What a carry draws just now, read off the page. The rows are the carried row's own list. */
const drawn = () => h.evaluate(() => {
  const seen = (one) => { if (!one.getClientRects().length) return false; for (let at = one; at; at = at.parentElement) if (+getComputedStyle(at).opacity < 0.05) return false; return true }
  const box = (one) => { const r = one.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, height: r.height } }
  const cards = [...document.querySelectorAll('[data-carried-card]')].filter(seen)
  const lines = [...document.querySelectorAll('[data-drop-line]')].filter(seen)
  const rooms = [...document.querySelectorAll('[data-drop-room]')].filter(seen)
  const [line, room] = [lines[0] && box(lines[0]), rooms[0] && box(rooms[0])]
  const dot = lines[0] ? getComputedStyle(lines[0], '::before') : null
  // The row in hand: marked so, or (before 12 Nov, in Writing) the one that holds the room.
  // (Pieces the page lays out itself, not a list's rows: the sidebar's folders and sections, marked carry-held and carry-piece.)
  const held = document.querySelector('[data-sortable-id][data-held], [data-carry-held], .mf-carried-place') ?? rooms[0]?.closest('[data-sortable-id]')
  const pieces = held?.hasAttribute('data-carry-held')
  const ROWS = pieces ? '[data-carry-piece]' : '[data-sortable-id]'
  let within = held?.parentElement
  while (within && within !== document.body && within.querySelectorAll(ROWS).length < 3) within = within.parentElement
  // Only rows in the carried row's own column can be over it or over its room (a board's lists stand side by side).
  const column = held && box(held)
  const list = [...(within?.querySelectorAll(ROWS) ?? [])].filter((one) => one !== held && seen(one) && (pieces || !one.querySelector('[data-sortable-id]'))).map(box).filter((one) => !column || (one.right > column.left + 1 && one.left < column.right - 1)).sort((a, b) => a.top - b.top)
  let overlap = 0
  for (let i = 1; i < list.length; i++) overlap = Math.max(overlap, list[i - 1].bottom - list[i].top)
  // How much of the line the card leaves in sight, and whether its dot is: the card never covers the line it is about.
  const card = cards[0] && box(cards[0])
  const level = !!card && !!line && Math.min(card.bottom, line.bottom + 3) - Math.max(card.top, line.top - 3) > 0
  const hidden = level ? Math.max(0, Math.min(card.right, line.right) - Math.max(card.left, line.left)) : 0
  return {
    lineSeen: line ? Math.round((1 - hidden / (line.right - line.left)) * 100) / 100 : 0, dotSeen: !!line && !(level && card.left < line.left && card.right > line.left - 8),
    cards: cards.length, words: cards[0]?.querySelector('[data-drag-label]')?.textContent ?? '', refused: !!cards[0]?.querySelector('[data-refused]'), card: cards[0] && box(cards[0]),
    lines: lines.length, rooms: rooms.length, dot: !!dot && parseFloat(dot.width) >= 6 && parseFloat(dot.borderTopWidth) >= 1,
    lineIn: !!line && !!room && line.top >= room.top - 1 && line.bottom <= room.bottom + 1 && Math.abs((line.top + line.bottom) / 2 - (room.top + room.bottom) / 2) <= 2,
    room: room?.height ?? 0, held: held ? box(held).height : 0, overlap: Math.round(overlap * 10) / 10,
    onRoom: room ? list.filter((one) => Math.min(one.bottom, room.bottom) - Math.max(one.top, room.top) > 1.5).length : 0,
    lit: [...document.querySelectorAll('[data-drop-hot], [data-nest-hot]')].filter(seen).length, pointer: getComputedStyle(document.body).cursor
  }
})
/**
 * Every row's box on the page, for Esc putting each back. With it, out of the way of the rows (`side`): the sidebar's
 * own scroll boxes (how far each is scrolled, how tall what it holds is) and its rows by name, so a line that fails
 * with the sidebar's rows "one row lower" says whether the box was scrolled or something in it grew, and what.
 */
const boxes = async () => {
  const read = await h.evaluate(() => {
    // Where it stands in its own scroller, so a list that scrolled by itself while carrying is not read as rows moved.
    const scrolled = (one) => { for (let at = one.parentElement; at; at = at.parentElement) if (/auto|scroll/.test(getComputedStyle(at).overflowY) && at.scrollHeight > at.clientHeight) return at.scrollTop; return 0 }
    const rows = Object.fromEntries([...document.querySelectorAll('[data-sortable-id]')].filter((one) => one.getClientRects().length).map((one) => { const r = one.getBoundingClientRect(); return [one.dataset.sortableId, `${Math.round(r.top + scrolled(one))}:${Math.round(r.height)}`] }))
    const named = (one) => one.closest('[data-sortable-id]')?.dataset.sortableId ?? [...one.attributes].filter((a) => a.name.startsWith('data-side-') && a.name !== 'data-side-row').map((a) => `${a.name.slice(10)}=${a.value}`).join(',') ?? ''
    const side = {
      scrollers: [...document.querySelectorAll('aside, aside *')].filter((one) => one.scrollTop || one.hasAttribute('data-scroll-held') || (/auto|scroll/.test(getComputedStyle(one).overflowY) && one.clientHeight > 0))
        .map((one) => ({ top: Math.round(one.scrollTop), tall: one.scrollHeight, view: one.clientHeight, over: getComputedStyle(one).overflowY, held: one.hasAttribute('data-scroll-held') })),
      rows: [...document.querySelectorAll('aside [data-side-row]')].filter((one) => one.getClientRects().length).map((one) => `${named(one) || (one.innerText ?? '').trim().slice(0, 18)}@${Math.round(one.getBoundingClientRect().top)}`),
      said: Object.fromEntries([...document.querySelectorAll('aside [data-side-row]')].filter((one) => one.getClientRects().length).map((one) => [named(one) || (one.innerText ?? '').trim().slice(0, 18), `“${(one.innerText ?? '').trim().split('\n')[0].slice(0, 30)}” in ${one.closest('[data-side-section]')?.getAttribute('data-side-section') ?? one.closest('[data-side-drop]')?.getAttribute('data-side-drop') ?? 'no section'}`])),
      open: document.querySelector('[data-pane] [data-open]')?.getAttribute('data-id') ?? null,
      focus: (document.activeElement?.tagName ?? '') + (document.activeElement?.closest?.('aside') ? ' in the sidebar' : '')
    }
    return { rows, side }
  })
  return Object.defineProperty(read.rows, 'side', { value: read.side, enumerable: false })
}
/** What changed in the sidebar between two readings, said in a line. */
const sideSaid = (was, atEsc, now) => {
  const tell = (one) => one ? one.scrollers.map((box) => `scrolled ${box.top} of ${box.tall} in ${box.view} (${box.over}${box.held ? ', held' : ''})`).join(' | ') : 'not read'
  const names = (one) => new Set((one?.rows ?? []).map((row) => row.split('@')[0]))
  const [before, after] = [names(was), names(now)]
  const came = [...after].filter((name) => !before.has(name))
  const went = [...before].filter((name) => !after.has(name))
  const first = (now?.rows ?? []).find((row) => { const old = (was?.rows ?? []).find((one) => one.split('@')[0] === row.split('@')[0]); return old && old !== row })
  return `  side before: ${tell(was)}\n  side at Esc: ${tell(atEsc)}\n  side after:  ${tell(now)}\n  side rows: ${was?.rows.length} before, ${now?.rows.length} after; came: ${came.map((name) => `${name} ${now?.said?.[name] ?? ''}`).join(', ') || 'none'}; went: ${went.join(', ') || 'none'}; first row moved: ${first ?? 'none'}; open before ${was?.open}, after ${now?.open}; focus after: ${now?.focus}`
}
/** The sidebar back at its top: carrying near its foot scrolls it, as any list does. */
const sideTop = () => h.evaluate(() => { for (const one of document.querySelectorAll('aside, aside *')) if (one.scrollTop) one.scrollTop = 0 })
/** The seven points, checked where the pointer is `at`. `want`: the card's words, and `lit` (a target lights), `refused`, `bare` (a line with no band: rows that stay put) or a room with its line. */
const oneLook = async (name, at, want) => {
  await wait(450)
  const d = await drawn()
  const told = JSON.stringify(d)
  // (Carried onto a tab, the card rides just under the tab, so the tab's own name stays in sight.)
  check(`${name}: one card, under the pointer`, d.cards === 1 && !!d.card && at.y >= d.card.top - (want.lit ? 36 : 10) && at.y <= d.card.bottom + 10 && at.x >= d.card.left - 60 && at.x <= d.card.right, JSON.stringify({ cards: d.cards, card: d.card, at }))
  check(`${name}: the card says ${want.words}`, want.words instanceof RegExp ? want.words.test(d.words) : d.words === want.words, d.words || '(no words)')
  if (want.lit) check(`${name}: one lit target, no line, no room`, d.lit === 1 && !d.lines && !d.rooms, told)
  else if (want.refused) check(`${name}: refused on the card, the pointer says no, nothing opens`, d.refused && d.pointer === 'not-allowed' && !d.lines && !d.rooms && !d.lit, told)
  else if (want.bare) check(`${name}: exactly one line, with its dot`, d.lines === 1 && d.dot && !d.lit, told)
  else {
    check(`${name}: exactly one line, with its dot, through the middle of one band`, d.lines === 1 && d.rooms === 1 && d.dot && d.lineIn && !d.lit, told)
    check(`${name}: the room is as tall as the carried row, folded (within 2px)`, d.held > 0 && Math.abs(d.room + 2 - d.held) <= 2 && (!want.tall || d.held <= want.tall + 2), `room ${d.room}, row in hand ${d.held}${want.tall ? `, a plain row ${want.tall}` : ''}`)
    check(`${name}: no row is over another, or over the room`, d.overlap <= 1 && !d.onRoom, `overlap ${d.overlap}px, ${d.onRoom} on the room`)
  }
  if (!want.lit && !want.refused) check(`${name}: with the card up, the dot and at least two thirds of the line are in sight`, d.dotSeen && d.lineSeen >= 0.667, `dot ${d.dotSeen ? 'in sight' : 'covered'}, ${Math.round(d.lineSeen * 100)}% of the line in sight`)
  if (SHOTS) for (const look of ['light', 'dark']) { await c.look(look); await wait(150); await h.screenshot({ path: `${SHOTS}/look-${name.replace(/\W+/g, '-')}-${look}.png` }) }
  if (SHOTS) { await c.look('light'); await wait(150) }
  return d
}
/** A held carry put back with Esc: every box where it was. */
const putBack = async (name, was) => {
  await h.keyboard.press('Escape'); await wait(350)
  const atEsc = (await boxes()).side
  await h.mouse.up(); await wait(450)
  const now = await boxes()
  // (Only the rows it was given: a part that reads the page's rows alone gives those.)
  const moved = Object.keys(was).filter((id) => was[id] !== now[id])
  const ok = check(`${name}: Esc puts every box back, nothing carried`, !moved.length && !(await card()), moved.slice(0, 4).map((id) => `${id} ${was[id]} -> ${now[id]}`).join('; '))
  // A line that fails says what the sidebar did: scrolled, or grew, and by what; with QA_TRACE, every call that scrolled it or clicked through.
  if (!ok) {
    console.log(sideSaid(was.side, atEsc, now.side))
    if (process.env.QA_TRACE) console.log((await h.evaluate(() => (window.qaSide ?? []).slice(-40))).map((one) => `  scroll trace ${one}`).join('\n'))
    // What was written in the app's last fifteen seconds, and when: a row that came by itself has a write behind it.
    if (process.env.QA_TRACE) console.log((await electron.evaluate(() => { const now = Date.now(); return (globalThis.qaWrites ?? []).filter((one) => now - one.at < 15000).map((one) => `${one.at - now} ms: ${one.name} ${one.args}`) })).map((one) => `  side write ${one}`).join('\n'))
  }
  if (process.env.QA_TRACE) await h.evaluate(() => void (window.qaSide = []))
}
/** From a point to a point with a real pointer, in steps, and held there. */
const hold = async (from, to) => {
  await h.mouse.move(from.x, from.y); await h.mouse.down()
  for (let i = 1; i <= 12; i++) { await h.mouse.move(from.x + ((to.x - from.x) * i) / 12, from.y + ((to.y - from.y) * i) / 12); await wait(30) }
  return to
}
const sortRow = (id) => h.evaluate((one) => { const r = document.querySelector(`[data-pane] [data-sortable-id="${CSS.escape(one)}"], aside [data-sortable-id="${CSS.escape(one)}"]`)?.getBoundingClientRect(); return r && { x: r.x, y: r.y, w: r.width, h: r.height } }, id)
/** The rows of a list as they stand, by a selector. */
const standing = (rows) => h.evaluate((sel) => [...document.querySelectorAll(sel)].filter((one) => one.getClientRects().length).map((one) => one.dataset.sortableId ?? one.dataset.id), rows)
const notices = () => h.evaluate(() => [...document.querySelectorAll('[role=status]')].map((one) => one.textContent ?? '').filter((one) => /Undo/.test(one)))
/** A row lifted, then carried to just under another as the list lies once it is in the hand (a tall row folds, and the rows under it come up). */
const carryUnder = async (aId, bId, x = 200, rows) => {
  // Read in its own list where one is named: the sidebar, Settings' sidebar list and its tab lists hold the same names.
  const boxIn = (id) => (rows ? h.evaluate(([sel, one]) => { const r = [...document.querySelectorAll(sel)].find((el) => (el.dataset.sortableId ?? el.dataset.id) === one)?.getBoundingClientRect(); return r && { x: r.x, y: r.y, w: r.width, h: r.height } }, [rows, id]) : sortRow(id))
  const a = await boxIn(aId)
  const from = { x: a.x + Math.min(x, a.w / 2), y: a.y + Math.min(a.h / 2, 16) }
  await h.mouse.move(from.x, from.y); await h.mouse.down(); await h.mouse.move(from.x, from.y + 8, { steps: 3 }); await wait(250)
  const b = await boxIn(bId)
  const to = { x: from.x, y: b.y + b.h * 0.86 }
  await h.mouse.move(to.x, to.y, { steps: 10 })
  return to
}
/**
 * A drop always says where it went (point 6): the first row let go under the second stands after it, said once in a notice
 * with Undo; Undo puts it back; dropped again, ⌘Z puts it back.
 */
const dropSaid = async (name, rows, { x = 200, words = /^Moved/ } = {}) => {
  // In sight first: the sidebar's tags stand under its fold.
  await h.locator(rows).nth(2).scrollIntoViewIfNeeded().catch(() => {})
  await h.locator(rows).nth(0).scrollIntoViewIfNeeded().catch(() => {})
  await wait(300)
  const before = await standing(rows)
  if (before.length < 2) return console.log(`SKIP  ${name}: ${before.length} rows to carry between`)
  const [a, b] = before
  // Any notice still up from before has gone first, so the one this drop says is counted alone.
  for (let i = 0; i < 40 && (await notices()).length; i++) await wait(250)
  await carryUnder(a, b, x, rows); await wait(450)
  // The rows that stand over the room (or the line) as it is let go: a list that scrolled itself under the pointer
  // (the sidebar's foot) shows its room further down than the row first aimed at, and that is where it must land.
  const over = await h.evaluate(([sel, carried]) => {
    const place = (document.querySelector('[data-drop-room]') ?? document.querySelector('[data-drop-line]'))?.getBoundingClientRect()
    return place ? [...document.querySelectorAll(sel)].filter((one) => one.getClientRects().length && (one.dataset.sortableId ?? one.dataset.id) !== carried && one.getBoundingClientRect().top < place.top).map((one) => one.dataset.sortableId ?? one.dataset.id) : null
  }, [rows, a])
  await h.mouse.up(); await wait(1200)
  const after = await standing(rows)
  check(`${name}: let go, it stands at once where the room was, under another row`, !!over && after.indexOf(a) > 0 && after.slice(0, after.indexOf(a)).join() === over.join(), `${before.slice(0, 4).join()} -> ${after.slice(0, 4).join()}; over the room: ${over?.slice(-2).join()}`)
  const now = await notices()
  check(`${name}: said once where it went, with Undo`, now.length === 1 && words.test(now[0]), now.join(' | ') || '(no notice)')
  await shot(`said-${name.replace(/\W+/g, '-')}`)
  await h.locator('[role=status] button', { hasText: 'Undo' }).last().click().catch(() => {}); await wait(1200)
  check(`${name}: “Undo” puts it back`, (await standing(rows)).join() === before.join(), (await standing(rows)).slice(0, 4).join())
  await carryUnder(a, b, x, rows); await wait(450); await h.mouse.up(); await wait(1200)
  await h.mouse.click(5, 450); await h.keyboard.press('Meta+z'); await wait(1200)
  check(`${name}: dropped again, ⌘Z puts it back`, (await standing(rows)).join() === before.join(), (await standing(rows)).slice(0, 4).join())
}
await part('One look: Tasks', async () => {
  await c.look('light')
  for (const old of await v('tasks')) if (old.status === 'open') await v('task:save', old.id, { status: 'dropped' })
  const t = { late: await addLine('Renew the passport'), plumber: await addLine('Pay the plumber'), wash: await addLine('Wash the car'), bake: await addLine('Bake bread', ['Feed the starter', 'Shape the loaf', 'Heat the oven']), mend: await addLine('Mend the gate'), weed: await addLine('Weed the beds') }
  const yesterday = new Date(c.now()); yesterday.setDate(yesterday.getDate() - 1); yesterday.setHours(9, 0, 0, 0)
  for (const id of [t.late, t.plumber]) await v('task:save', id, { due: yesterday.toISOString() })
  // Carried over many times: this one shows its “Carried over … What now?” question under its row, as in the user's picture.
  await v('task:save', t.plumber, { rollovers: 9 }).catch(() => {})
  await h.evaluate(() => localStorage.setItem('view:tasks:today', JSON.stringify({ sort: 'manual', group: 'when' })))
  await h.reload(); await wait(1500); await c.go('today'); await wait(1200)
  // A task with its steps open is a tall row: in the hand it is its one row, and the room is that row's.
  await h.locator(`[data-steps-fold="${t.bake}"]`).click(); await wait(500)
  const plain = (await sortRow(t.mend)).h
  const tall = (await sortRow(t.bake)).h
  check('Tasks: a task with its steps open is taller than a plain one (the case the pictures showed)', tall > plain + 30, `${tall} against ${plain}`)
  const today = (await order()).filter((id) => [t.wash, t.bake, t.mend, t.weed].includes(id))
  const next = today[today.indexOf(t.bake) + 1] ?? today[today.indexOf(t.bake) - 1]
  const down = today.indexOf(next) > today.indexOf(t.bake)
  const grip = async (id) => { const r = await sortRow(id); return { x: r.x + 220, y: r.y + 14 } }
  const edge = async (id, low) => { const r = await sortRow(id); return { x: r.x + 220, y: r.y + r.h * (low ? 0.86 : 0.14) } }
  // Folded in the hand, the rows under it come up by what it folded away: the row aimed at is that much higher by then.
  const aimed = async () => { const to = await edge(next, down); return down ? { x: to.x, y: to.y - (tall - plain) } : to }
  let was = await boxes()
  let at = await hold(await grip(t.bake), await aimed())
  await oneLook('Tasks, a task with steps open carried among Today', at, { words: 'Move here', tall: plain })
  await putBack('Tasks, among Today', was)
  const before = await order()
  await hold(await grip(t.bake), await aimed()); await wait(350); await h.mouse.up(); await wait(1200)
  const after = await order()
  check('Tasks: let go, it stands where the room was', down ? after.indexOf(t.bake) === after.indexOf(next) + 1 : after.indexOf(t.bake) === after.indexOf(next) - 1, `${before.join()} -> ${after.join()}`)
  await h.mouse.click(5, 450); await h.keyboard.press('Meta+z'); await wait(1200)
  check('Tasks: ⌘Z puts the order back', (await order()).join() === before.join(), (await order()).join())
  // The task with its “Carried over” question: in the hand it is its one row, and the room is that row's.
  const ask = await h.evaluate((id) => { const one = document.querySelector(`[data-pane] [data-sortable-id="${id}"]`); const q = one?.querySelector('[data-task-ask]'); return q ? { tall: Math.round(one.getBoundingClientRect().height), question: Math.round(q.getBoundingClientRect().height) } : null }, t.plumber)
  check('Tasks: a task carried over many times shows its question under its row', !!ask && ask.tall > plain + 30, JSON.stringify(ask))
  if (ask) {
    was = await boxes()
    at = await hold(await grip(t.plumber), await edge(t.late, false))
    await oneLook('Tasks, a task with its “Carried over” question carried', at, { words: 'Move here', tall: plain })
    await putBack('Tasks, a task with its question', was)
  }
  // Out of Overdue over Today's rows: Today's heading lights, the card says where it goes, and the drop is said with Undo.
  was = await boxes()
  at = await hold(await grip(t.late), await edge(t.wash, true))
  await oneLook('Tasks, Overdue carried over Today', at, { words: 'Move to Today', lit: true })
  await putBack('Tasks, Overdue over Today', was)
  await hold(await grip(t.late), await edge(t.wash, true)); await wait(350); await h.mouse.up(); await wait(1300)
  const moved = await task(t.late)
  check('Tasks: let go, it is due today, said with Undo', new Date(moved.dueAt).toDateString() === c.now().toDateString() && /Moved to/.test(await toastSaid()) && (await toastSaid()).includes('Undo'), `${moved.dueAt} | ${await toastSaid()}`)
  await h.mouse.click(5, 450); await h.keyboard.press('Meta+z'); await wait(1300)
  check('Tasks: ⌘Z makes it late again', new Date((await task(t.late)).dueAt).toDateString() === yesterday.toDateString(), String((await task(t.late)).dueAt))
  // Today's over Overdue's rows: refused in words, the pointer says no, nothing moves.
  was = await boxes()
  at = await hold(await grip(t.wash), await edge(t.plumber, false))
  await oneLook('Tasks, Today carried over Overdue', at, { words: /date puts a task in “Overdue”/, refused: true })
  await h.mouse.up(); await wait(900)
  check('Tasks: refused, let go: nothing moved', JSON.stringify(await boxes()) === JSON.stringify(was) && new Date((await task(t.wash)).dueAt).toDateString() === c.now().toDateString(), '')
  // Rested on a task's middle: that task lights and the card names it.
  const mid = await sortRow(t.wash)
  at = await hold(await grip(t.weed), { x: mid.x + 220, y: mid.y + mid.h / 2 }); await wait(750)
  await h.mouse.move(at.x + 1, at.y); await wait(100)
  await oneLook('Tasks, a task rested on a task', at, { words: 'Make it a step of “Wash the car”', lit: true })
  await putBack('Tasks, rested on a task', was)
  // Onto a tab: the tab lights, the card says where it goes.
  const tab = await h.locator('[data-page] header button[aria-label="Later"]').first().boundingBox()
  at = await hold(await grip(t.mend), { x: tab.x + tab.width / 2, y: tab.y + tab.height / 2 })
  await h.mouse.move(at.x + 1, at.y); await wait(350)
  const onTab = await drawn()
  check('Tasks, carried onto the “Later” tab: one card that says where it goes, the tab lit, no line', onTab.cards === 1 && onTab.words === 'Move to Later, someday' && onTab.lit === 1 && !onTab.lines && !onTab.rooms, JSON.stringify(onTab))
  await shot('look-tasks-onto-a-tab')
  await putBack('Tasks, onto a tab', was)
  // The Paper and Brutal styles: the same room, line and card.
  for (const style of ['paper', 'brutal']) {
    await h.evaluate((one) => { localStorage.setItem('style', one); window.dispatchEvent(new StorageEvent('storage', { key: 'style' })) }, style)
    // The style's own faces and edges take a moment to settle: the rows are read once they have.
    await wait(1500)
    was = await boxes()
    at = await hold(await grip(t.mend), await edge(t.weed, true))
    await oneLook(`Tasks in the ${style} style`, at, { words: 'Move here' })
    await putBack(`Tasks in the ${style} style`, was)
  }
  await h.evaluate(() => { localStorage.setItem('style', 'soft'); window.dispatchEvent(new StorageEvent('storage', { key: 'style' })) })
  await wait(300)
})
await part('One look: the Queue', async () => {
  let was, at
  await c.look('light')
  await h.reload(); await wait(1500)
  await c.go('queue'); await wait(900)
  const queue = await h.evaluate(() => [...document.querySelectorAll('[data-pane] [data-sortable-id]')].map((one) => one.dataset.sortableId))
  if (queue.length >= 3) {
    was = await boxes()
    const [a, b] = [await sortRow(queue[0]), await sortRow(queue[1])]
    at = await hold({ x: a.x + 200, y: a.y + a.h / 2 }, { x: a.x + 200, y: b.y + b.h * 0.86 })
    await oneLook('The Queue, a row carried down', at, { words: 'Move here' })
    await putBack('The Queue', was)
  } else console.log(`SKIP  One look: the Queue has ${queue.length} rows`)
})
await part('One look: the Inbox', async () => {
  await c.go('inbox'); await wait(900)
  const rows = await h.evaluate(() => [...document.querySelectorAll('[data-pane] [data-sortable-id]')].filter((one) => { const r = one.getBoundingClientRect(); return r.height > 0 && r.top > 120 && r.bottom < innerHeight - 80 }).map((one) => one.dataset.sortableId))
  if (rows.length < 3) return console.log(`SKIP  One look: the Inbox shows ${rows.length} rows that can be carried`)
  const was = await boxes()
  const [a, b] = [await sortRow(rows[0]), await sortRow(rows[1])]
  const at = await hold({ x: a.x + 200, y: a.y + Math.min(20, a.h / 2) }, { x: a.x + 200, y: b.y + b.h * 0.86 })
  await oneLook('The Inbox, a note carried down', at, { words: 'Move here' })
  await putBack('The Inbox', was)
})
await part('One look: the sidebar', async () => {
  let was, at
  // A pin among the pins, a page among the pages (rows that stay put: a bare line), a folder among folders.
  for (const id of [ids.Oak, ids.Pine]) await v('pin', 'nuggets', id, true).catch(() => {})
  await h.reload(); await wait(1500)
  await c.go('articles'); await wait(900)
  const pins = await h.evaluate(() => [...document.querySelectorAll('aside nav [data-side-drop="pinned"] [data-sortable-id]')].filter((one) => one.getClientRects().length).map((one) => one.dataset.sortableId))
  if (pins.length >= 2) {
    was = await boxes()
    const [a, b] = [await sortRow(pins[0]), await sortRow(pins[1])]
    at = await hold({ x: a.x + 40, y: a.y + a.h / 2 }, { x: a.x + 40, y: b.y + b.h * 0.86 })
    await oneLook('The sidebar, a pin carried down', at, { words: 'Move here' })
    await putBack('The sidebar, a pin', was)
  } else console.log(`SKIP  One look: ${pins.length} pins in the sidebar`)
  await sideTop(); await wait(300)
  const pages =await h.evaluate(() => [...document.querySelectorAll('aside nav [data-drop-list] [data-sortable-id]')].filter((one) => one.getClientRects().length).map((one) => one.dataset.sortableId))
  if (pages.length >= 3) {
    was = await boxes()
    const [a, b] = [await sortRow(pages[0]), await sortRow(pages[2])]
    at = await hold({ x: a.x + 40, y: a.y + a.h / 2 }, { x: a.x + 40, y: b.y + b.h * 0.9 })
    // (Since 13 Nov the sidebar's pages make way as a list's rows do: the room with its line, never a bare line.)
    await oneLook('The sidebar, a page carried down', at, { words: 'Move here' })
    await putBack('The sidebar, a page', was)
    // Over Pinned, which takes no page: said on the card, the pointer says no, no line, and letting go moves nothing.
    const pinned = await h.evaluate(() => { const r = document.querySelector('aside nav [data-side-drop="pinned"]')?.getBoundingClientRect(); return r && r.height > 0 ? r.top + r.height / 2 : null })
    if (pinned !== null) {
      at = await hold({ x: a.x + 40, y: a.y + a.h / 2 }, { x: a.x + 40, y: pinned })
      await oneLook('The sidebar, a page carried over Pinned', at, { words: /can’t go in Pinned/, refused: true })
      await h.mouse.up(); await wait(700)
      const now = await boxes()
      if (!check('The sidebar, a page let go over Pinned: nothing moved', Object.keys(was).every((id) => was[id] === now[id]), '')) console.log(sideSaid(was.side, null, now.side))
      await sideTop(); await wait(200)
    }
  } else console.log(`SKIP  One look: ${pages.length} pages in the sidebar`)
  await v('groups:arrange', 'article', { top: ['g:f-a', 'g:f-b', 'g:f-c', ids.Ash], groups: { 'f-a': [ids.Birch], 'f-b': [ids.Cedar], 'f-c': [ids.Elm] }, revive: ['f-a', 'f-b', 'f-c'].map((id, n) => ({ id, name: ['Alder', 'Beech', 'Chestnut'][n], icon: null, color: null, folded: 0, folder: 1 })) })
  await c.go('articles'); await wait(900)
  await sideTop(); await wait(300)
  const fa = await h.locator('[data-side-folder="f-a"]').boundingBox(), fc = await h.locator('[data-side-folder="f-c"]').boundingBox()
  was = await boxes()
  at = await hold({ x: fa.x + 50, y: fa.y + fa.height / 2 }, { x: fa.x + 50, y: fc.y + fc.height * 0.9 })
  await oneLook('The sidebar, a folder carried below another', at, { words: 'Move here' })
  await h.mouse.move(at.x, fc.y + fc.height / 2, { steps: 4 }); await wait(350)
  const into = await drawn()
  // Into a folder, whose own order decides the place: no room opens, the folder lights as every target does, the card names it.
  check('The sidebar, a folder over a folder’s middle: the card says “Move into” it, that folder lit as every target is, no line, no room', into.cards === 1 && into.words === 'Move into Chestnut' && !into.lines && !into.rooms && into.lit === 1, JSON.stringify(into))
  if (SHOTS) for (const look of ['light', 'dark']) { await c.look(look); await wait(150); await h.screenshot({ path: `${SHOTS}/look-sidebar-folder-into-${look}.png` }) }
  if (SHOTS) { await c.look('light'); await wait(150) }
  await putBack('The sidebar, a folder', was)
  // Let go below another: it stands there at once, said once with Undo; ⌘Z puts it back.
  // The three this case seeded, in the order they stand: the folder the Esc case brought back (f-side) still stands first, and is not this case's.
  const folderOrder = () => h.evaluate(() => [...document.querySelectorAll('[data-side-folders="article"] [data-side-folder]')].filter((one) => ['f-a', 'f-b', 'f-c'].includes(one.dataset.sideFolder)).map((one) => ({ id: one.dataset.sideFolder, top: one.getBoundingClientRect().top })).sort((x, y) => x.top - y.top).map((one) => one.id).join())
  const firstFolders = await folderOrder()
  for (let i = 0; i < 40 && (await notices()).length; i++) await wait(250)
  at = await hold({ x: fa.x + 50, y: fa.y + fa.height / 2 }, { x: fa.x + 50, y: fc.y + fc.height * 0.9 }); await wait(400)
  await h.mouse.up(); await wait(1200)
  const movedFolders = await folderOrder()
  const folderSaid = await notices()
  check('The sidebar, a folder let go below another: it stands there, said once with Undo', movedFolders === 'f-b,f-c,f-a' && folderSaid.length === 1 && /Moved Alder/.test(folderSaid[0]), `${firstFolders} -> ${movedFolders} | ${folderSaid.join(' | ')}`)
  await h.mouse.click(5, 450); await h.keyboard.press('Meta+z'); await wait(1300)
  check('The sidebar, a folder: ⌘Z puts it back', (await folderOrder()) === firstFolders, await folderOrder())
  // A section carried by its heading (Library below Pinned): the same card with its words, the same room and line, Esc, Undo.
  await sideTop(); await wait(300)
  const sections = () => h.evaluate(() => [...document.querySelectorAll('aside nav [data-side-section]')].filter((one) => one.offsetHeight > 0).map((one) => ({ id: one.dataset.sideSection, top: one.getBoundingClientRect().top, bottom: one.getBoundingClientRect().bottom })).sort((x, y) => x.top - y.top))
  const before = await sections()
  // Below Pinned, a gap in sight (the last section can run on past the window's foot).
  const lib = before.find((one) => one.id === 'library'), last = before.find((one) => one.id === 'pinned') ?? before.at(-1)
  const handle = await h.locator('aside nav [data-side-section-handle="library"]').first().boundingBox().catch(() => null)
  if (lib && last && handle && last.id !== 'library') {
    was = await boxes()
    const grab = { x: handle.x + 30, y: handle.y + handle.height / 2 }
    at = await hold(grab, { x: grab.x, y: last.bottom - 4 })
    await oneLook('The sidebar, a section carried by its heading below Pinned', at, { words: 'Move here' })
    check('The sidebar, a section carried: no faded copy of it, no second line', !(await h.locator('[data-side-section-line]').count()) && (await h.evaluate(() => [...document.querySelectorAll('aside nav [data-side-section]')].every((one) => +getComputedStyle(one).opacity > 0.95))), '')
    await putBack('The sidebar, a section', was)
    for (let i = 0; i < 40 && (await notices()).length; i++) await wait(250)
    at = await hold(grab, { x: grab.x, y: last.bottom - 4 }); await wait(400)
    await h.mouse.up(); await wait(1300)
    const after = (await sections()).map((one) => one.id)
    const said = await notices()
    check(`The sidebar, a section let go below ${last.id}: it stands there, said once with Undo`, after.indexOf('library') === after.indexOf(last.id) + 1 && said.length === 1 && /Moved Library/.test(said[0]), `${before.map((one) => one.id).join()} -> ${after.join()} | ${said.join(' | ')}`)
    await h.mouse.click(5, 450); await h.keyboard.press('Meta+z'); await wait(1300)
    check('The sidebar, a section: ⌘Z puts it back', (await sections()).map((one) => one.id).join() === before.map((one) => one.id).join(), (await sections()).map((one) => one.id).join())
  } else check('The sidebar: Library and a section after it to carry it below', false, JSON.stringify(before))
  for (const id of ['f-a', 'f-b', 'f-c']) await v('groups:delete', id)
  for (const id of [ids.Oak, ids.Pine]) await v('pin', 'nuggets', id, false).catch(() => {})
})
// The board (13 Nov): a board places a card by the point under the hand (which list, then where among its cards), so what
// of the one look applies is all of it but the rows' one clock across lists: one card under the pointer saying what letting
// go does (“Move here” in its list, “Move to “Doing”” in another), the room as tall as the card with the one line through
// its band where it would land, Esc, the drop said once with Undo and ⌘Z; a list carried sideways leaves the quiet band, never a faded copy.
await part('One look: the board', async () => {
  const id = await v('article:new')
  await v('item:save', id, { title: 'Board to carry on', body: '## Todo\n\n- [ ] Alpha card\n- [ ] Beta card\n- [ ] Gamma card\n\n## Doing\n\n- [ ] Delta card\n' })
  await v('notes:fields:set', 'nuggets', id, 'kanban-plugin', 'board')
  await c.go('articles'); await wait(800)
  await c.send('article', id); await wait(1800)
  const cardAt = (text) => h.evaluate((t) => { const one = [...document.querySelectorAll('[data-board] [data-board-card]')].find((el) => el.textContent.includes(t)); const r = one?.getBoundingClientRect(); return r && { x: r.x, y: r.y, w: r.width, h: r.height } }, text)
  const laneCards = () => h.evaluate(() => [...document.querySelectorAll('[data-board] [data-lane]')].map((lane) => `${lane.querySelector('[data-lane-name]')?.textContent}:${[...lane.querySelectorAll('[data-board-card]')].map((one) => one.textContent.trim().split(' ')[0]).join('/')}`).join(' | '))
  const a = await cardAt('Alpha card'), b = await cardAt('Beta card'), d = await cardAt('Delta card')
  if (!a || !b || !d) return check('The board: the note opens as a board with its cards', false, await laneCards())
  const grab = { x: a.x + 40, y: a.y + a.h / 2 }
  let was = await boxes()
  let at = await hold(grab, { x: grab.x, y: b.y + b.h * 0.8 })
  await oneLook('The board, a card carried below another in its list', at, { words: 'Move here' })
  await putBack('The board, a card in its list', was)
  was = await boxes()
  at = await hold(grab, { x: d.x + 40, y: d.y + d.h + 12 })
  await oneLook('The board, a card carried into another list', at, { words: 'Move to “Doing”' })
  await putBack('The board, a card into another list', was)
  // Let go in Doing: it stands there, said once with Undo; Undo puts it back; dropped again, ⌘Z puts it back.
  const first = await laneCards()
  for (let i = 0; i < 40 && (await notices()).length; i++) await wait(250)
  await hold(grab, { x: d.x + 40, y: d.y + d.h + 12 }); await wait(400); await h.mouse.up(); await wait(1300)
  const moved = await laneCards()
  const said = await notices()
  check('The board, a card let go in another list: it stands there, said once with Undo', /Doing:Delta\/Alpha/.test(moved) && said.length === 1 && /Moved “Alpha card” to “Doing”/.test(said[0]), `${first} -> ${moved} | ${said.join(' | ')}`)
  await h.locator('[role=status] button', { hasText: 'Undo' }).last().click().catch(() => {}); await wait(1300)
  check('The board: “Undo” puts it back', (await laneCards()) === first, await laneCards())
  await hold(grab, { x: d.x + 40, y: d.y + d.h + 12 }); await wait(400); await h.mouse.up(); await wait(1300)
  await h.keyboard.press('Meta+z'); await wait(1300)
  check('The board: dropped again, ⌘Z puts it back', (await laneCards()) === first, await laneCards())
  // A list carried by its heading to the front: the same card with its words, its own place the quiet band, never a faded copy.
  const head = await h.locator('[data-board] [data-lane] h3', { hasText: 'Doing' }).boundingBox()
  const front = await h.locator('[data-board] [data-lane]').first().boundingBox()
  if (head && front) {
    await hold({ x: head.x + 10, y: head.y + head.height / 2 }, { x: front.x + 20, y: head.y + head.height / 2 }); await wait(450)
    const lane = await h.evaluate(() => ({ cards: [...document.querySelectorAll('[data-carried-card]')].filter((one) => one.getClientRects().length).length, words: document.querySelector('[data-carried-card] [data-drag-label]')?.textContent ?? '', band: document.querySelectorAll('[data-board] [data-lane] [data-own-room]').length, faded: [...document.querySelectorAll('[data-board] [data-lane]')].some((one) => +getComputedStyle(one).opacity < 0.95) }))
    check('The board, a list carried to the front: one card that says “Move here”, its own place the quiet band, no faded copy', lane.cards === 1 && lane.words === 'Move here' && lane.band === 1 && !lane.faded, JSON.stringify(lane))
    if (SHOTS) for (const look of ['light', 'dark']) { await c.look(look); await wait(150); await h.screenshot({ path: `${SHOTS}/look-The-board-a-list-carried-${look}.png` }) }
    if (SHOTS) { await c.look('light'); await wait(150) }
    await h.keyboard.press('Escape'); await wait(300); await h.mouse.up(); await wait(500)
    check('The board, a list: Esc puts it back, nothing carried', !(await h.locator('[data-carried-card]').count()) && (await laneCards()) === first, await laneCards())
  } else check('The board: its lists have headings to carry', false, '')
  await h.keyboard.press('Escape'); await wait(300)
})
// A drop always says where it went (point 6 of “One look for every drag”): on each list, the notice once with Undo, Undo, and ⌘Z.
await part('A drop is said: Tasks', async () => {
  await h.reload(); await wait(1500); await c.go('today'); await wait(1000)
  await dropSaid('Tasks', '[data-pane] [data-task-row]')
})
await part('A drop is said: the Queue', async () => {
  await c.go('queue'); await wait(900)
  await dropSaid('The Queue', '[data-pane] [data-sortable-id]')
})
await part('A drop is said: the Inbox', async () => {
  await c.go('inbox'); await wait(900)
  await dropSaid('The Inbox', '[data-pane] [data-sortable-id]', { words: /^(Moved|Now in your own order)/ })
})
await part('A drop is said: the sidebar', async () => {
  for (const id of [ids.Oak, ids.Pine]) await v('pin', 'nuggets', id, true).catch(() => {})
  await h.reload(); await wait(1500); await c.go('articles'); await wait(900)
  await dropSaid('The sidebar, a pin', 'aside nav [data-side-drop="pinned"] [data-sortable-id]', { x: 40, words: /^Moved “/ })
  await sideTop(); await wait(300)
  await dropSaid('The sidebar, a tag', 'aside nav [data-side-drop="tags"] [data-sortable-id]', { x: 40, words: /^Moved “#/ })
  await sideTop(); await wait(300)
  await dropSaid('The sidebar, a page', 'aside nav [data-drop-list] [data-sortable-id]', { x: 40, words: /^Moved “/ })
  for (const id of [ids.Oak, ids.Pine]) await v('pin', 'nuggets', id, false).catch(() => {})
})
await part('A drop is said: Settings', async () => {
  await c.go('settings'); await wait(900)
  const TABS = '[data-show-part] [data-sortable-id]:not([data-drop-list] *)'
  let found = false
  for (const name of await h.evaluate(() => [...document.querySelectorAll('[data-section]')].map((one) => one.getAttribute('data-section')))) {
    await h.click(`[data-section="${name}"]`); await wait(500)
    if ((await h.locator(TABS).count()) >= 2) { found = true; break }
  }
  if (!found) return console.log('SKIP  A drop is said: no list of tabs found in Settings')
  await h.locator(TABS).first().scrollIntoViewIfNeeded(); await wait(400)
  await dropSaid('Settings, the quick capture tabs', TABS, { x: 60, words: /^Moved “/ })
})
// The Matrix: a card beside another in its box (the one line, the card clear of it), over another box (the box lit, the
// card naming it), its own place the one quiet band; a drop said with Undo, and ⌘Z.
await part('One look: the Matrix', async () => {
  for (const old of await v('tasks')) if (old.status === 'open') await v('task:save', old.id, { status: 'dropped' })
  const m = [await addLine('Chase the invoice'), await addLine('Book the dentist'), await addLine('Tidy the desk')]
  await h.evaluate(() => localStorage.setItem('view:tasks:today', JSON.stringify({ sort: 'manual', group: 'matrix' })))
  await h.reload(); await wait(1500); await c.go('today'); await wait(1200)
  const boxOf = (id) => h.evaluate((one) => document.querySelector(`[data-pane] [data-sortable-id="${one}"]`)?.closest('[data-quadrant]')?.getAttribute('data-quadrant') ?? null, id)
  const home = await boxOf(m[0])
  const cards = await h.evaluate((q) => [...document.querySelectorAll(`[data-quadrant="${q}"] [data-sortable-id]`)].map((one) => one.dataset.sortableId), home)
  check('The Matrix: the tasks stand together in one box', cards.length >= 2, `${home}: ${cards.length} cards`)
  let was = await boxes()
  const [a, b] = [await sortRow(cards[0]), await sortRow(cards[1])]
  // Taken by its name's line, clear of its date and tick, which are pressed on their own.
  const grab = { x: a.x + a.w / 2, y: a.y + 14 }
  let at = await hold(grab, { x: grab.x, y: b.y + b.h * 0.8 })
  await wait(450)
  let d = await drawn()
  check('The Matrix, a card carried beside another in its box: one card that says “Move here”, one line with its dot in sight', d.cards === 1 && d.words === 'Move here' && d.lines === 1 && d.dot && d.dotSeen && d.lineSeen >= 0.667, JSON.stringify(d))
  check('The Matrix: the carried card’s own place is the one quiet band', (await h.locator('[data-own-room]').count()) === 1 && !(await h.locator('.mf-carried-place').count()), '')
  await both('look-The-Matrix-a-card-carried-beside-another')
  await putBack('The Matrix, beside another card', was)
  const to = home === 'do' ? 'handoff' : 'do'
  const other = await h.evaluate((q) => { const one = document.querySelector(`[data-quadrant="${q}"]`); const r = one.getBoundingClientRect(); return { title: one.querySelector('h2 span')?.textContent ?? '', x: r.x + r.width / 2, y: r.y + r.height * 0.7 } }, to)
  at = await hold(grab, other)
  await wait(450)
  d = await drawn()
  const lit = await h.evaluate((q) => /ring-1/.test(document.querySelector(`[data-quadrant="${q}"]`)?.className ?? ''), to)
  check('The Matrix, a card carried over another box: the card names the box, the box lit, no line', d.cards === 1 && d.words === `Move to “${other.title}”` && lit && !d.lines, JSON.stringify({ words: d.words, lit, lines: d.lines }))
  await both('look-The-Matrix-a-card-carried-over-another-box')
  await putBack('The Matrix, over another box', was)
  for (let i = 0; i < 40 && (await notices()).length; i++) await wait(250)
  await hold(grab, other); await wait(400); await h.mouse.up(); await wait(1300)
  const said = await notices()
  check('The Matrix: let go there, it is in that box, said once with Undo', (await boxOf(cards[0])) === to && said.length === 1 && said[0].includes(other.title), `${await boxOf(cards[0])} | ${said.join(' | ')}`)
  await h.locator('[role=status] button', { hasText: 'Undo' }).last().click().catch(() => {}); await wait(1300)
  check('The Matrix: “Undo” puts it back in its box', (await boxOf(cards[0])) === home, String(await boxOf(cards[0])))
  await h.evaluate(() => localStorage.setItem('view:tasks:today', JSON.stringify({ sort: 'manual', group: 'when' })))
})
// Quick capture's tabs, carried sideways: the same card with its words, and the same quiet band where the tab will land.
await part('One look: quick capture’s tabs', async () => {
  const box = c.page
  // The box draws its side panel, and so its row of tabs, once its window is up (parked off screen, as every probe's is).
  await electron.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((w) => !/[?&](view|note)=/.test(w.webContents.getURL()))?.show())
  // Its side panel opens on a tab's own key where it is not open already.
  if (!(await box.waitForSelector('[data-box-panel] [data-sortable-id]', { timeout: 3000 }).catch(() => null))) {
    await box.keyboard.press('Control+1')
    await box.waitForSelector('[data-box-panel] [data-sortable-id]', { timeout: 4000 }).catch(() => null)
  }
  await wait(600)
  const tabs = await box.evaluate(() => [...document.querySelectorAll('[data-box-panel] [data-sortable-id]')].filter((one) => one.getClientRects().length).map((one) => { const r = one.getBoundingClientRect(); return { id: one.dataset.sortableId, x: r.x + r.width / 2, y: r.y + r.height / 2 } }))
  if (tabs.length < 2) return check('Quick capture: two tabs on show to carry between', false, `${tabs.length} tabs`)
  await box.mouse.move(tabs[0].x, tabs[0].y); await box.mouse.down()
  for (let i = 1; i <= 8; i++) { await box.mouse.move(tabs[0].x + ((tabs[1].x - tabs[0].x) * i) / 8, tabs[0].y + 1); await wait(30) }
  await wait(450)
  const d = await box.evaluate(() => ({ cards: [...document.querySelectorAll('[data-carried-card]')].filter((one) => one.getClientRects().length).length, words: document.querySelector('[data-carried-card] [data-drag-label]')?.textContent ?? '', band: document.querySelectorAll('[data-own-room]').length, old: document.querySelectorAll('.mf-carried-place').length }))
  check('Quick capture’s tabs, a tab carried over the next: one card that says “Move here”, its place the one quiet band', d.cards === 1 && d.words === 'Move here' && d.band === 1 && !d.old, JSON.stringify(d))
  if (SHOTS) await box.screenshot({ path: `${SHOTS}/look-quick-capture-a-tab-carried.png` })
  await box.keyboard.press('Escape'); await wait(300); await box.mouse.up(); await wait(400)
  check('Quick capture’s tabs: Esc puts it back, nothing carried', !(await box.locator('[data-carried-card]').count()) && !(await box.locator('[data-own-room]').count()), '')
  // Let go over the next tab: it stands after it, said once with Undo; ⌘Z puts it back.
  const tabOrder = () => box.evaluate(() => [...document.querySelectorAll('[data-box-panel] [data-sortable-id]')].filter((one) => one.getClientRects().length).map((one) => one.dataset.sortableId))
  const tabSaid = () => box.evaluate(() => [...document.querySelectorAll('[role=status]')].map((one) => one.textContent ?? '').filter((one) => /Undo/.test(one)))
  const was = await tabOrder()
  for (let i = 0; i < 40 && (await tabSaid()).length; i++) await wait(250)
  await box.mouse.move(tabs[0].x, tabs[0].y); await box.mouse.down()
  for (let i = 1; i <= 8; i++) { await box.mouse.move(tabs[0].x + ((tabs[1].x - tabs[0].x) * i) / 8, tabs[0].y + 1); await wait(30) }
  await wait(400); await box.mouse.up(); await wait(1200)
  const now = await tabOrder()
  const heard = await tabSaid()
  check('Quick capture’s tabs: let go over the next tab, it stands after it, said once with Undo', now.indexOf(was[0]) === now.indexOf(was[1]) + 1 && heard.length === 1 && /^Moved “/.test(heard[0]), `${was.join()} -> ${now.join()} | ${heard.join(' | ') || '(no notice)'}`)
  await box.keyboard.press('Meta+z'); await wait(1200)
  check('Quick capture’s tabs: ⌘Z puts it back', (await tabOrder()).join() === was.join(), (await tabOrder()).join())
})
// The main book (BOOK=1, QA_ARGS empty, QA_DATA a copy of it): what is there is carried and dropped; nothing is seeded.
if (BOOK) await part('One look: the main book', async () => {
  await c.look('light')
  await h.evaluate(() => localStorage.setItem('view:tasks:today', JSON.stringify({ sort: 'manual', group: 'when' })))
  await h.reload(); await wait(4000); await c.go('today'); await wait(2500)
  const rows = await standing('[data-pane] [data-task-row]')
  check('The main book, Tasks: rows on show to carry', rows.length >= 2, `${rows.length} rows`)
  // A task with its “Carried over” question, as in the user's picture: in the hand it is its one row.
  const asked = await h.evaluate(() => { const one = document.querySelector('[data-pane] [data-sortable-id] [data-task-ask]')?.closest('[data-sortable-id]'); return one ? { id: one.dataset.sortableId, tall: Math.round(one.getBoundingClientRect().height), question: Math.round(one.querySelector('[data-task-ask]').getBoundingClientRect().height) } : null })
  if (asked) {
    const next = rows[rows.indexOf(asked.id) + 1] ?? rows[rows.indexOf(asked.id) - 1]
    const was = await boxes()
    const at = await carryUnder(asked.id, next)
    const d = await oneLook('The main book, a task with its “Carried over” question', at, { words: 'Move here' })
    check('The main book: in the hand the task is its one row, its question folded away', d.held > 0 && d.held <= asked.tall - asked.question + 2, `${asked.tall} with its question (${asked.question}), ${Math.round(d.held)} in the hand, room ${Math.round(d.room)}`)
    await putBack('The main book, Tasks', was)
  } else console.log('SKIP  The main book: no task on show has the “Carried over” question')
  await dropSaid('The main book, Tasks', '[data-pane] [data-task-row]')
  await c.go('queue'); await wait(1800)
  await dropSaid('The main book, the Queue', '[data-pane] [data-sortable-id]')
  await c.go('inbox'); await wait(2200)
  await dropSaid('The main book, the Inbox', '[data-pane] [data-sortable-id]', { words: /^(Moved|Now in your own order)/ })
  await sideTop(); await wait(300)
  await dropSaid('The main book, a pin', 'aside nav [data-side-drop="pinned"] [data-sortable-id]', { x: 40, words: /^Moved “/ })
})
// The window at its smallest, 560 x 400: the card inside the window, the room and its line still one each, nothing scrolling sideways.
await part('One look: 560 x 400', async () => {
  await h.reload(); await wait(1500); await c.go('today'); await wait(900)
  await c.size(560, 400); await wait(600)
  // Its own tasks, on Today alone: two short rows fit in the little room a 400px window leaves.
  for (const old of await v('tasks')) if (old.status === 'open') await v('task:save', old.id, { status: 'dropped' })
  for (const title of ['Sweep the yard', 'Oil the hinges', 'Sort the post']) await addLine(title)
  await h.reload(); await wait(1500); await c.go('today'); await wait(900)
  const rows = await h.evaluate(() => [...document.querySelectorAll('[data-pane] [data-sortable-id]')].filter((one) => { const r = one.getBoundingClientRect(); return r.top > 60 && r.bottom < innerHeight }).map((one) => one.dataset.sortableId))
  if (rows.length >= 2) {
    const [a, b] = [await sortRow(rows[0]), await sortRow(rows[1])]
    const at = await hold({ x: a.x + 120, y: a.y + 14 }, { x: a.x + 120, y: b.y + b.h * 0.86 })
    await wait(450)
    const d = await drawn()
    const fits = await h.evaluate(() => ({ width: innerWidth, sideways: document.documentElement.scrollWidth > innerWidth }))
    check('560 x 400: one card inside the window, one line in one band, nothing scrolls sideways', d.cards === 1 && d.card.left >= 0 && d.card.right <= fits.width && d.lines === 1 && d.rooms === 1 && d.lineIn && !fits.sideways, JSON.stringify({ card: d.card, lines: d.lines, rooms: d.rooms, fits, at }))
    await shot('look-560x400-task-carried')
    await h.keyboard.press('Escape'); await wait(300); await h.mouse.up(); await wait(300)
  } else check('560 x 400: two task rows on show to carry between', false, `${rows.length} rows`)
  await c.size(1200, 900); await wait(400)
})
// A list of 500 (LONG=1, timed with `solo --quiet`): only the rows near the screen are drawn, the carry draws the one
// look, the list scrolls by itself at its edge, and every frame while carrying is timed.
const MANY = Number(process.env.LONG) > 1 ? Number(process.env.LONG) : 500
if (process.env.LONG) await part(`One look: ${MANY} rows`, async () => {
  for (const old of await v('tasks')) if (old.status === 'open') await v('task:save', old.id, { status: 'dropped' })
  for (let i = 0; i < MANY; i++) await v('task:add', `Long list task ${i + 1} today`)
  await h.evaluate(() => localStorage.setItem('view:tasks:today', JSON.stringify({ sort: 'manual', group: 'when' })))
  await h.reload(); await wait(2500); await c.go('today'); await wait(1800)
  const count = await h.locator('[data-pane] [data-sortable-id]').count()
  check(`${MANY} tasks: only the rows near the screen are drawn`, count > 5 && count < 120, `${count} rows drawn`)
  const first = await h.locator('[data-pane] [data-task-row]').nth(2).boundingBox()
  const pane = await h.evaluate(() => { let el = document.querySelector('[data-pane] [data-vlist]'); while (el && !/auto|scroll/.test(getComputedStyle(el).overflowY)) el = el.parentElement; el.dataset.qaScroller = ''; const r = el.getBoundingClientRect(); return { top: r.top, bottom: r.bottom } })
  await h.evaluate(() => { window.__frames = []; let last = performance.now(); const tick = (now) => { window.__frames.push(now - last); last = now; window.__raf = requestAnimationFrame(tick) }; window.__raf = requestAnimationFrame(tick) })
  await h.mouse.move(first.x + 220, first.y + 14); await h.mouse.down()
  for (let i = 1; i <= 40; i++) { await h.mouse.move(first.x + 220, first.y + 14 + i * 8); await wait(16) }
  await wait(450)
  const d = await drawn()
  check(`${MANY} tasks: one card, one line through one band, no row over another`, d.cards === 1 && d.lines === 1 && d.rooms === 1 && d.lineIn && d.overlap <= 1 && !d.onRoom, JSON.stringify(d))
  const top0 = await h.evaluate(() => document.querySelector('[data-qa-scroller]').scrollTop)
  await h.mouse.move(first.x + 220, pane.bottom - 10, { steps: 12 })
  const began = Date.now()
  // Held at the list's foot for four seconds: it scrolls by itself, and the carried row goes down the list with it.
  for (let i = 0; i < 80; i++) { await h.mouse.move(first.x + 220 + (i % 2), pane.bottom - 10); await wait(50) }
  const top1 = await h.evaluate(() => document.querySelector('[data-qa-scroller]').scrollTop)
  const speed = Math.round((top1 - top0) / ((Date.now() - began) / 1000))
  const frames = (await h.evaluate(() => { cancelAnimationFrame(window.__raf); return window.__frames })).slice(3)
  const sorted = [...frames].sort((a, b) => a - b)
  const [worst, p95, over] = [sorted.at(-1), sorted[Math.floor(sorted.length * 0.95)], frames.filter((one) => one > 16).length]
  // Where in the carry the slow frames fall, as a share of the way through it (the lift is at the very start).
  const slow = frames.map((one, at) => (one > 16 ? `${Math.round((at / frames.length) * 100)}%: ${one.toFixed(0)} ms` : null)).filter(Boolean).join(', ')
  console.log(`TIMING ${MANY} rows carried: ${frames.length} frames, worst ${worst.toFixed(1)} ms, 95th ${p95.toFixed(1)} ms, median ${sorted[Math.floor(sorted.length / 2)].toFixed(1)} ms, ${over} over 16 ms (${((over / frames.length) * 100).toFixed(1)}%), the list scrolled by itself ${Math.round(top1 - top0)} px at ${speed} px/s; slow frames at ${slow || 'none'}`)
  check(`${MANY} tasks: at its bottom edge the list scrolls by itself, no faster than about 1000 px a second`, speed > 60 && speed < 1300, `${speed} px/s`)
  await shot(`look-${MANY}-tasks-carried`)
  await h.keyboard.press('Escape'); await wait(300); await h.mouse.up(); await wait(400)
})
await part('One look: Writing, the reference', async () => {
  // A row carried among a group's rows.
  await scene()
  const was = await boxes()
  let at
  const [ash, birch] = [await row('Ash').boundingBox(), await row('Birch').boundingBox()]
  at = await hold({ x: ash.x + 200, y: ash.y + ash.height / 2 }, { x: ash.x + 200, y: birch.y + birch.height * 0.86 })
  await oneLook('Writing, a note carried down', at, { words: /^Move here/ })
  await putBack('Writing, a note', was)
  await h.reload(); await wait(1500); await c.go('today'); await wait(900)
})

// --- 5d. The lists a rule of their own keeps in order (Goals by day; Writing and Gems sorted, or under headings): the
// same card, room and line where a row can stand, a lit target or a refusal in words where it cannot, never a quiet
// band that says nothing; a group only after a rest; what a drag does said over the list.
const ROWS = '[data-sortable-id]:not(aside[data-chrome] *)'
const paneBoxes = () => h.evaluate(() => {
  const scrolled = (one) => { for (let at = one.parentElement; at; at = at.parentElement) if (/auto|scroll/.test(getComputedStyle(at).overflowY) && at.scrollHeight > at.clientHeight) return at.scrollTop; return 0 }
  return Object.fromEntries([...document.querySelectorAll('[data-sortable-id]')].filter((one) => one.getClientRects().length && !one.closest('aside[data-chrome]')).map((one) => { const r = one.getBoundingClientRect(); return [one.dataset.sortableId, `${Math.round(r.top + scrolled(one))}:${Math.round(r.height)}`] }))
})
const paneRow = (id) => h.evaluate((one) => { const r = [...document.querySelectorAll(`[data-sortable-id="${CSS.escape(one)}"]`)].find((el) => !el.closest('aside[data-chrome]'))?.getBoundingClientRect(); return r && { x: r.x, y: r.y, w: r.width, h: r.height } }, id)
/** A row lifted by its name's line and carried, in steps, to a place down another row (0.86: just under its middle, past it). */
const carryTo = async (aId, bId, at = 0.86) => {
  const a = await paneRow(aId)
  const from = { x: a.x + 200, y: a.y + 16 }
  await h.mouse.move(from.x, from.y); await h.mouse.down(); await h.mouse.move(from.x, from.y + 8, { steps: 3 }); await wait(250)
  const b = await paneRow(bId)
  const to = { x: from.x, y: b.y + b.h * at }
  for (let i = 1; i <= 12; i++) { await h.mouse.move(from.x, from.y + 8 + ((to.y - from.y - 8) * i) / 12); await wait(30) }
  return to
}
/** Whether a group is forming under the carried row, watched on every frame the page draws until `stop()`. */
const watchForming = () => h.evaluate(() => {
  const seen = (window.__forming = { frames: 0, forming: 0, words: [], stall: 0, last: performance.now() })
  const tick = (now) => {
    seen.frames++
    seen.stall = Math.max(seen.stall, now - seen.last)
    seen.last = now
    const words = document.querySelector('[data-carried-card] [data-drag-label]')?.textContent ?? ''
    if (document.querySelector('[data-preview]') || /New (sub)?group/.test(words)) seen.forming++
    if (seen.words.at(-1) !== words) seen.words.push(words)
    seen.raf = requestAnimationFrame(tick)
  }
  seen.raf = requestAnimationFrame(tick)
})
const stopForming = () => h.evaluate(() => { const seen = window.__forming; cancelAnimationFrame(seen.raf); return { frames: seen.frames, forming: seen.forming, words: seen.words, stall: Math.round(seen.stall) } })
/** A pass at a steady, slow pace (about 40px a second) from one row down across the rows under it: no group forms on the way. */
const steadyPass = async (name, ids) => {
  // A pass counts only while the pointer truly kept moving: on a loaded machine the pointer (or the page) can stand still
  // for half a second, which is a rest, and a rest rightly forms a group. Such a pass is made again, three times at most.
  let pass
  for (let go = 0; go < 3; go++) {
    const [first, last] = [await paneRow(ids[0]), await paneRow(ids.at(-1))]
    const from = { x: first.x + 200, y: first.y + 16 }
    await h.mouse.move(from.x, from.y); await h.mouse.down(); await h.mouse.move(from.x, from.y + 8, { steps: 3 }); await wait(250)
    await watchForming()
    let [gap, then] = [0, Date.now()]
    for (let y = from.y + 8; y <= last.y + last.h * 0.6; y += 2) { await h.mouse.move(from.x, y); await wait(50); gap = Math.max(gap, Date.now() - then); then = Date.now() }
    pass = { ...(await stopForming()), gap }
    await h.keyboard.press('Escape'); await wait(350); await h.mouse.up(); await wait(450)
    if (pass.gap < 350 && pass.stall < 350) break
    console.log(`NOTE  ${name}: the pass stood still ${Math.max(pass.gap, pass.stall)} ms (a loaded machine), so it is made again`)
  }
  const steady = pass.gap < 350 && pass.stall < 350
  check(`${name}: carried at a steady pace across ${ids.length - 1} rows, no “New group” look on any frame`, steady && pass.frames > 40 && pass.forming === 0, `${pass.forming} of ${pass.frames} frames${steady ? '' : `; never steady: the pointer stood still ${Math.max(pass.gap, pass.stall)} ms`}; the card said: ${pass.words.filter(Boolean).join(' | ')}`)
}
/** Held still on another row's middle: after the rest, the group forms there and the card says so. */
const restMakes = async (name, aId, bId) => {
  const was = await paneBoxes()
  await carryTo(aId, bId, 0.5); await wait(1100)
  const d = await h.evaluate(() => ({ forming: document.querySelectorAll('[data-preview]').length, words: document.querySelector('[data-carried-card] [data-drag-label]')?.textContent ?? '' }))
  check(`${name}: held still on another row, a group forms there and the card says “New group”`, d.forming === 1 && d.words === 'New group', JSON.stringify(d))
  await shot(`look-${name.replace(/\W+/g, '-')}-rest`)
  await putBack(`${name}, a rest`, was)
}
const hintSaid = () => h.evaluate(() => document.querySelector('[data-drag-hint]')?.textContent ?? '')
const day = (n) => { const d = new Date(Date.now() + n * 86_400_000); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
const goalTab = async (id) => { await h.locator(`[data-chips="goals"] [data-chip="${id}"]`).click(); await wait(700) }
const goalNow = async (id) => (await v('items', 'goal')).find((one) => one.id === id)
if (!BOOK && BIN_TRACE) await part('The Bin, traced: a goal carried among the goals of its day and put back with Esc', async () => {
  for (const old of await v('items', 'goal')) await v('goal:drop', old.id)
  const stay = []
  for (const [title, when] of [['Alder goal', 90], ['Elder goal', 500], ['Fig goal', 520]]) { stay.push(await v('goal:new', title, day(when))); await wait(15) }
  await h.reload(); await wait(1500); await c.go('goals'); await wait(1200); await goalTab('open')
  await binsSince()
  let [hit, ran] = [0, 0]
  const keys = { sent: 0 }
  const back = async () => { await h.keyboard.press('Escape'); keys.sent++; await wait(350); await h.mouse.up(); await wait(450) }
  for (let i = 0; i < BIN_TRACE; i++) {
    // A fresh pair on one day each time, as the part itself starts: two that share a day over the one alone and the two far off.
    const a = await v('goal:new', `Beech ${i + 1}`, day(60)); await wait(15)
    const b = await v('goal:new', `Cypress ${i + 1}`, day(60))
    let rows = []
    for (let tries = 0; tries < 20 && rows.filter((id) => id === a || id === b).length < 2; tries++) { await wait(150); rows = await standing(ROWS) }
    const pair = rows.filter((id) => id === a || id === b)
    if (pair.length === 2 && rows.length === 5) {
      ran++
      // Exactly the part's first steps: the first of the pair carried under the second and put back with Esc, the
      // button let go after; then one of the far pair carried under the other and put back the same way.
      await carryTo(pair[0], pair[1]); await wait(450); await back()
      await carryTo(stay[1], stay[2]); await wait(450); await back()
      await wait(500)
    } else console.log(`NOTE  The Bin, traced, run ${i + 1}: the pair was not on the page (${rows.length} rows), not counted`)
    const open = new Set((await v('items', 'goal')).map((one) => one.id))
    const bins = await binsSince()
    const gone = [a, b, ...stay].filter((id) => !open.has(id))
    if (bins.length || gone.length) {
      hit++
      console.log(`BINNED run ${i + 1}: gone from the open goals ${gone.length} (${gone.map((id) => (id === a ? 'the second of the pair' : id === b ? 'the first of the pair' : 'one that stays')).join(', ')}); ${JSON.stringify(bins)}`)
      await shot(`bin-trace-run-${i + 1}`)
      for (const id of gone) await v('bin:restore', 'goal', id).catch(() => {})
    }
    await v('goal:drop', a); await v('goal:drop', b); await wait(120)
  }
  const front = await electron.evaluate(() => ({ start: globalThis.__binTrace?.start, events: (globalThis.__binTrace?.front ?? []).map((one) => one.name) }))
  const tally = front.events.reduce((all, name) => ({ ...all, [name]: (all[name] ?? 0) + 1 }), {})
  console.log(`TRACE front: at the start ${JSON.stringify(front.start)}; since then ${JSON.stringify(tally)}; the page says it has the keys: ${await h.evaluate(() => document.hasFocus())}`)
  const got = await h.evaluate(() => (window.__trace?.events ?? []).filter((one) => one.type === 'keydown').map((one) => one.key))
  const other = got.filter((key) => key !== 'Escape')
  console.log(`TRACE keys: the probe pressed Esc ${keys.sent} times; the page's last ${got.length} keydowns hold ${other.length} that are not Esc${other.length ? `: ${[...new Set(other)].join(', ')}` : ''}`)
  check(`The first carry of the Goals part, put back with Esc, then the next: nothing goes to the Bin in ${ran} runs`, hit === 0 && ran >= Math.min(BIN_TRACE, 3), `${hit} of ${ran} runs sent a goal to the Bin (${BIN_TRACE - ran} not counted)`)
  for (const id of stay) await v('goal:drop', id)
  await h.reload(); await wait(1500); await c.go('today'); await wait(900)
})
if (!BOOK) await part('One look, kept in order: Goals', async () => {
  // Its own goals: two that share a day, one alone on a later day, two more than a year off; three for someday; two on ice; two ended.
  for (const old of await v('items', 'goal')) await v('goal:drop', old.id)
  const g = {}
  for (const [title, when] of [['Beech goal', 60], ['Cypress goal', 60], ['Alder goal', 90], ['Elder goal', 500], ['Fig goal', 520], ['Gum goal', null], ['Holly goal', null], ['Ivy goal', null], ['Juniper goal', 70], ['Kauri goal', 75], ['Larch goal', 80], ['Maple goal', 85]]) {
    g[title.split(' ')[0]] = await v('goal:new', title, when === null ? null : day(when)); await wait(15)
  }
  await v('goal:close', g.Juniper, 'on ice'); await v('goal:close', g.Kauri, 'on ice'); await v('goal:close', g.Larch, 'let go'); await v('goal:close', g.Maple, 'missed')
  await v('goal:beacon:set', g.Alder, 'always')
  await h.evaluate(() => { for (const key of Object.keys(localStorage)) if (key.startsWith('hint:')) localStorage.removeItem(key) })
  await h.reload(); await wait(1500); await c.go('goals'); await wait(1200)
  await goalTab('open')
  let rows = await standing(ROWS)
  const shared = rows.filter((id) => id === g.Beech || id === g.Cypress)
  const far = rows.filter((id) => id === g.Elder || id === g.Fig)
  check('Goals: its rows stand by day: the two that share a day, the one alone, the two more than a year off', rows.length === 5 && rows.slice(0, 2).join() === shared.join() && rows[2] === g.Alder && rows.slice(3).join() === far.join(), rows.map((id) => Object.keys(g).find((name) => g[name] === id)).join())
  check('Goals: a line over the list says what dragging a goal does there', /order it among the goals of its day/.test(await hintSaid()), (await hintSaid()) || '(no line)')
  // Among the goals of its day: the room, its one line, “Move here”.
  let was = await paneBoxes()
  let at = await carryTo(shared[0], shared[1])
  await oneLook('Goals, a goal carried among the goals of its day', at, { words: 'Move here' })
  await putBack('Goals, among its day', was)
  // More than a year off: one part, in your own order too.
  was = await paneBoxes()
  at = await carryTo(far[0], far[1])
  await oneLook('Goals, a goal carried among those more than a year off', at, { words: 'Move here' })
  await putBack('Goals, more than a year off', was)
  // Over another day's goals: that day's heading lights, the card names the day, nothing opens.
  was = await paneBoxes()
  at = await carryTo(g.Alder, shared[1], 0.84)
  let d = await oneLook('Goals, a goal carried over another day', at, { words: /^Move to \d{1,2} \w{3} \d{4}$/, lit: true })
  const lit = await h.evaluate(() => { const one = document.querySelector('[data-drop-hot]'); return one ? { part: one.dataset.rowPart ?? null, head: one.dataset.groupHead ?? null } : null })
  check('Goals, over another day: what lights is that day’s heading', !!lit?.part && lit.part === lit.head && d.words === `Move to ${lit.part}`, JSON.stringify(lit))
  await putBack('Goals, over another day', was)
  // On a heading itself its own part is meant, whichever row is nearer (its top edge is nearer the part before it).
  const heads = await h.evaluate(() => [...document.querySelectorAll('[data-row-part]')].filter((one) => !one.closest('aside[data-chrome]') && one.getClientRects().length).map((one) => { const r = one.getBoundingClientRect(); return { part: one.dataset.rowPart, y: r.y, h: r.height } }))
  check('Goals: each day and the far ones stand under a heading', heads.length === 3, heads.map((one) => one.part).join(' | '))
  if (heads.length === 3) {
    was = await paneBoxes()
    let a0 = await paneRow(shared[0])
    at = await hold({ x: a0.x + 200, y: a0.y + 16 }, { x: a0.x + 200, y: heads[1].y + heads[1].h * 0.2 })
    d = await oneLook('Goals, a goal carried onto the top edge of another day’s heading', at, { words: `Move to ${heads[1].part}`, lit: true })
    check('Goals, on another day’s heading: that heading lights, not the one before it', (await h.evaluate(() => document.querySelector('[data-drop-hot]')?.dataset.rowPart ?? null)) === heads[1].part, heads[1].part)
    await putBack('Goals, on another day’s heading', was)
    was = await paneBoxes()
    a0 = await paneRow(far[1])
    at = await hold({ x: a0.x + 200, y: a0.y + 16 }, { x: a0.x + 200, y: heads[2].y + heads[2].h * 0.2 })
    await oneLook('Goals, a goal carried onto its own part’s heading: first under it', at, { words: 'Move here' })
    await putBack('Goals, on its own heading', was)
  }
  // Over the stretch of time at the foot: refused in words, with what would move it.
  was = await paneBoxes()
  at = await carryTo(shared[0], far[0], 0.16)
  await oneLook('Goals, a goal carried over “More than a year away”', at, { words: /^Its day puts a goal under “More than a year away”: change its day on its page to move it$/, refused: true })
  await putBack('Goals, over the far ones', was)
  // A pass at a steady pace across the rows under it: no group begins to form; a rest makes one.
  await steadyPass('Goals', rows.slice(0, 4))
  await restMakes('Goals', shared[0], g.Alder)
  // The tabs: lit where the goal’s own menu has that move, under its words; unlit where it has none.
  was = await paneBoxes()
  await carryTo(shared[0], shared[1]); await wait(200)
  const chip = async (id) => { const r = await h.locator(`[data-chips="goals"] [data-chip="${id}"]`).boundingBox(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 } }
  const overTab = async (id) => { const to = await chip(id); await h.mouse.move(to.x - 6, to.y, { steps: 8 }); await h.mouse.move(to.x, to.y, { steps: 3 }); await wait(450); const now = await drawn(); return { words: now.words, lit: now.lit, lines: now.lines, ...(await h.evaluate(() => { const hot = document.querySelector('[data-drop-hot]'); const [a, b] = [hot?.getBoundingClientRect(), document.querySelector('[data-carried-card]')?.getBoundingClientRect()]; return { hot: hot?.dataset.chip ?? null, covered: !!a && !!b && Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1 } })) } }
  let tab = await overTab('iced')
  check('Goals, a goal carried onto “On ice”: the tab lights and the card says “Put on ice”', tab.words === 'Put on ice' && tab.lit === 1 && tab.hot === 'iced' && !tab.lines, JSON.stringify(tab))
  check('Goals, a goal carried onto “On ice”: the card stands clear of the tab it names', !tab.covered, JSON.stringify(tab))
  await both('look-Goals-a-goal-over-the-On-ice-tab')
  tab = await overTab('settled')
  check('Goals, a goal carried onto “Ended” (its menu has three ways to end it): the tab stays unlit', tab.hot === null, JSON.stringify(tab))
  tab = await overTab('someday')
  check('Goals, a goal carried onto “Someday” (its menu has no such move): the tab stays unlit', tab.hot === null, JSON.stringify(tab))
  await putBack('Goals, over the tabs', was)
  // Let go among the goals of its day: it stands there at once, said once with Undo, and Undo and ⌘Z put it back.
  await dropSaid('Goals, a goal among the goals of its day', ROWS)
  // Moved, the order is kept in the book, and the page reads it again the same.
  await carryUnder(shared[0], shared[1], 200, ROWS); await wait(450); await h.mouse.up(); await wait(1200)
  const moved = await standing(ROWS)
  const saved = (await v('notes:order', 'goal')).filter((id) => shared.includes(id))
  await h.reload(); await wait(1500); await c.go('goals'); await wait(1200); await goalTab('open')
  rows = await standing(ROWS)
  check('Goals: a goal moved within its day keeps its place in the book, and the page read again shows it', moved.slice(0, 2).join() === [shared[1], shared[0]].join() && saved.join() === [shared[1], shared[0]].join() && rows.slice(0, 2).join() === [shared[1], shared[0]].join(), `on the page ${moved.slice(0, 2).map((id) => (id === g.Beech ? 'Beech' : 'Cypress')).join()}, in the book ${saved.map((id) => (id === g.Beech ? 'Beech' : 'Cypress')).join()}, read again ${rows.slice(0, 2).map((id) => (id === g.Beech ? 'Beech' : 'Cypress')).join()}`)
  // Let go on another day: the goal's day becomes that day, on its page, its card on the desktop and in the menu bar; Undo puts all three back.
  const cardOf = async (id) => { const win = electron.windows().find((one) => !one.isClosed() && one.url().includes('view=sticky') && one.url().includes('type=goal&') && one.url().includes(id)); return win ? await win.evaluate(() => document.querySelector('[data-goal-left-said]')?.getAttribute('title') ?? '(no day on the card)').catch(() => '(card not read)') : '(no card)' }
  const menuOf = (title) => electron.evaluate((_electron, name) => (globalThis.trayMenu ?? []).find((one) => one.label === name)?.sublabel ?? '(not in the menu)', title)
  const pageOf = async () => { await h.locator(`${ROWS}[data-sortable-id="${g.Alder}"] button[data-row]`).first().click(); await wait(900); const left = await h.evaluate(() => document.querySelector('[data-goal-left]')?.textContent ?? '(no page)'); await h.keyboard.press('Meta+BracketLeft'); await wait(900); return left }
  const three = async () => ({ day: (await goalNow(g.Alder)).goalAt, page: await pageOf(), card: await cardOf(g.Alder), menu: await menuOf('Alder goal') })
  await wait(1500)
  const before = await three()
  for (let i = 0; i < 40 && (await notices()).length; i++) await wait(250)
  await carryTo(g.Alder, rows[1], 0.84); await wait(450); await h.mouse.up(); await wait(1800)
  const after = await three()
  const told = await notices()
  check('Goals, let go on another day: said once where it went, with Undo', told.length === 1 && /^Moved to \d{1,2} \w{3} \d{4}/.test(told[0]), told.join(' | ') || '(no notice)')
  check('Goals, let go on another day: its day is that day, on its page, its card on the desktop and in the menu bar', after.day === day(60) && before.day === day(90) && /\b(59|60)\b/.test(after.page) && after.card !== before.card && after.card.includes((told[0] ?? '(none)').replace(/^Moved to (\d{1,2} \w{3}).*$/, '$1')) && /\b(59|60) days left/.test(after.menu), JSON.stringify({ before, after }))
  await shot('look-Goals-a-day-changed-by-a-drop')
  await h.locator('[role=status] button', { hasText: 'Undo' }).last().click().catch(() => {}); await wait(1800)
  const undone = await three()
  check('Goals, a day changed by a drop: “Undo” puts its day back on all three', undone.day === before.day && undone.page === before.page && undone.card === before.card && undone.menu === before.menu, JSON.stringify({ before, undone }))
  // Someday: the life list in your own order.
  await goalTab('someday')
  rows = await standing(ROWS)
  check('Goals, Someday: a line over the list says what dragging a goal does there', /your own order/.test(await hintSaid()), (await hintSaid()) || '(no line)')
  was = await paneBoxes()
  at = await carryTo(rows[0], rows[1])
  await oneLook('Goals, Someday: a goal carried among the others', at, { words: 'Move here' })
  await putBack('Goals, Someday', was)
  await steadyPass('Goals, Someday', rows.slice(0, 3))
  await dropSaid('Goals, Someday: a goal among the others', ROWS)
  // On ice, the latest first: refused in words among the rows; the tab it came from takes it off ice.
  await goalTab('iced')
  rows = await standing(ROWS)
  was = await paneBoxes()
  at = await carryTo(rows[0], rows[1], 0.16)
  await oneLook('Goals, On ice: a goal carried over another', at, { words: 'Goals on ice stand the latest first: they are not arranged by hand', refused: true })
  tab = await overTab('open')
  check('Goals, On ice: carried onto “Goals”, the tab lights, the card stands clear of it and says “Take off ice”', tab.words === 'Take off ice' && tab.lit === 1 && tab.hot === 'open' && !tab.covered, JSON.stringify(tab))
  await putBack('Goals, On ice', was)
  // Ended, the latest first: the same, and “Open it again” on the tab it came from.
  await goalTab('settled')
  rows = await standing(ROWS)
  was = await paneBoxes()
  at = await carryTo(rows[0], rows[1], 0.16)
  await oneLook('Goals, Ended: a goal carried over another', at, { words: 'Ended goals stand the latest first: they are not arranged by hand', refused: true })
  tab = await overTab('open')
  check('Goals, Ended: carried onto “Goals”, the tab lights, the card stands clear of it and says “Open it again”', tab.words === 'Open it again' && tab.lit === 1 && tab.hot === 'open' && !tab.covered, JSON.stringify(tab))
  await putBack('Goals, Ended', was)
  // Let go on the tab: done as the menu does it, said with Undo.
  await goalTab('iced')
  rows = await standing(ROWS)
  for (let i = 0; i < 40 && (await notices()).length; i++) await wait(250)
  await carryTo(rows[0], rows[1], 0.16); await overTab('open'); await h.mouse.up(); await wait(1500)
  const thawed = await notices()
  check('Goals, On ice: let go on “Goals”, it is off ice, said once with Undo', thawed.length === 1 && /^Off ice/.test(thawed[0]) && (await standing(ROWS)).length === rows.length - 1, thawed.join(' | ') || '(no notice)')
  await h.locator('[role=status] button', { hasText: 'Undo' }).last().click().catch(() => {}); await wait(1500)
  check('Goals, On ice: “Undo” puts it back on ice', (await standing(ROWS)).length === rows.length, String((await standing(ROWS)).length))
  // The window at its smallest.
  await goalTab('open')
  await c.size(560, 400); await wait(700)
  rows = (await standing(ROWS)).filter((id) => shared.includes(id))
  const [a560, b560] = [await paneRow(rows[0]), await paneRow(rows[1])]
  if (a560 && b560 && b560.y + b560.h < 400) {
    at = await carryTo(rows[0], rows[1])
    await wait(450)
    d = await drawn()
    const fits = await h.evaluate(() => ({ width: innerWidth, sideways: document.documentElement.scrollWidth > innerWidth }))
    check('Goals at 560 x 400: one card inside the window that says “Move here”, one line in one band, nothing scrolls sideways', d.cards === 1 && d.card.left >= 0 && d.card.right <= fits.width && d.words === 'Move here' && d.lines === 1 && d.rooms === 1 && d.lineIn && !fits.sideways, JSON.stringify({ card: d.card, words: d.words, lines: d.lines, rooms: d.rooms, fits }))
    await shot('look-560x400-goal-carried')
    await h.keyboard.press('Escape'); await wait(300); await h.mouse.up(); await wait(300)
  } else check('Goals at 560 x 400: two goals of one day on show to carry between', false, JSON.stringify({ a560, b560 }))
  await c.size(1200, 900); await wait(500)
  await h.reload(); await wait(1500); await c.go('today'); await wait(900)
})
// Writing and Gems sorted some other way: a row carried between rows says the list goes to “Custom order”; under
// headings (by kind), over another heading's rows it is refused in words. What a drag does there is said over the list.
if (!BOOK) await part('One look, kept in order: Writing and Gems', async () => {
  await h.evaluate(() => { for (const key of Object.keys(localStorage)) if (key.startsWith('hint:')) localStorage.removeItem(key) })
  await scene({ loose: true, top: Object.values(ids), groups: {} })
  await h.evaluate(() => localStorage.setItem('view:article', JSON.stringify({ sort: 'name', group: 'none', filter: {}, density: 'list' })))
  await h.reload(); await wait(1500); await c.go('articles'); await wait(1200)
  let rows = await standing(ROWS)
  check('Writing, A to Z: a line over the list says what dragging a row does there', /puts this list in “Custom order”/.test(await hintSaid()), (await hintSaid()) || '(no line)')
  let was = await paneBoxes()
  let at = await carryTo(rows[0], rows[1])
  await oneLook('Writing, A to Z: a page carried between two others', at, { words: 'Move here · Custom order' })
  await putBack('Writing, A to Z', was)
  await steadyPass('Writing, A to Z', rows.slice(0, 4))
  await restMakes('Writing, A to Z', rows[0], rows[2])
  // Gems under headings, by kind: among the rows of its own heading it moves; over another heading's rows it is refused in words.
  for (const words of ['The obstacle is the way: a quote for the probe', 'Festina lente: a second quote for the probe']) await v('nugget:from', words, { kind: 'quote' })
  await h.evaluate(() => localStorage.setItem('view:nugget', JSON.stringify({ sort: 'newest', group: 'kind', filter: {}, density: 'list' })))
  await c.go('nuggets'); await wait(1500)
  // To the foot of the list, where the last heading stands with a row of another kind just over it.
  await h.evaluate(() => { let el = [...document.querySelectorAll('[data-sortable-id]')].find((one) => !one.closest('aside[data-chrome]')); while (el && !(/auto|scroll/.test(getComputedStyle(el).overflowY) && el.scrollHeight > el.clientHeight + 1)) el = el.parentElement; if (el) el.scrollTop = el.scrollHeight })
  await wait(900)
  const foot = await h.evaluate(() => {
    let before = null
    let out = null
    for (const one of document.querySelectorAll('[data-group-head], [data-sortable-id]')) {
      const box = one.getBoundingClientRect()
      if (one.closest('aside[data-chrome]') || one.closest('[data-group-block]') || !box.height || box.top < 90 || box.bottom > innerHeight - 4) continue
      if (one.dataset.groupHead !== undefined) out = { head: one.dataset.groupHead, before, rows: [] }
      else if (out) out.rows.push(one.dataset.sortableId)
      else before = one.dataset.sortableId
      if (one.dataset.groupHead === undefined) before = one.dataset.sortableId
    }
    return out
  })
  check('Gems, by kind: at the foot of the list a heading stands with a gem of another kind over it', !!foot?.before && foot.rows.length >= 1, JSON.stringify(foot && { head: foot.head, rows: foot.rows.length, before: !!foot.before }))
  if (foot?.before && foot.rows.length >= 1) {
    if (foot.rows.length >= 2) {
      was = await paneBoxes()
      at = await carryTo(foot.rows[0], foot.rows[1])
      await oneLook('Gems, by kind: a gem carried among the rows of its own heading', at, { words: 'Move here · Custom order' })
      await putBack('Gems, by kind, its own heading', was)
    }
    was = await paneBoxes()
    at = await carryTo(foot.before, foot.rows[0], 0.16)
    await oneLook('Gems, by kind: a gem carried over another heading’s rows', at, { words: `Grouped by kind: that puts a gem under “${foot.head}”, not where it is dropped`, refused: true })
    await putBack('Gems, by kind, another heading', was)
  }
  await h.evaluate(() => { localStorage.removeItem('view:nugget'); localStorage.setItem('view:article', JSON.stringify({ sort: 'manual', group: 'none', filter: {}, density: 'list' })) })
  await h.reload(); await wait(1500); await c.go('today'); await wait(900)
})

// --- 5e. Several notes (16 Nov, the user's 22 and 27): picked notes carried across a folder's groups, its folded group,
// a folder in it and the list's foot, rested on a loose row, and three out of a subgroup to the top of its group. One
// look, as one note's: one room, as tall as the row in hand, its line by the pointer, the others faded in their places,
// no row over another, words naming what the drop does where the pointer is, and the pile in hand off what it aims at.
await part('Several notes', async () => {
  for (const one of await v('groups', 'article')) await v('groups:delete', one.id)
  const more = {}
  for (const title of ['Larch', 'Maple', 'Rowan', 'Spruce', 'Willow', 'Alder', 'Beech', 'Cherry']) { const id = await v('article:new'); await v('item:save', id, { title }); more[title] = id }
  const all = { ...ids, ...more }
  // Five's name is long: the card's words end in an ellipsis inside the card, never past its edge over the title.
  const NAMES = { desk: 'Desk', first: 'First', deep: 'Deep', five: 'Five, a group whose name runs on for a long while', inner: 'Inner', dives: 'Dives', sub: 'Sub', shelf: 'Shelf' }
  const FOLDERS = new Set(['desk', 'inner'])
  const lay = async (top, groups, folded = []) => {
    await v('groups:arrange', 'article', { top, groups, revive: Object.keys(groups).map((id) => ({ id, name: NAMES[id], icon: null, color: null, folded: 0, folder: FOLDERS.has(id) ? 1 : 0 })) })
    for (const id of Object.keys(groups)) if (!FOLDERS.has(id)) await v('groups:set', id, { folded: folded.includes(id) })
    await h.evaluate(() => localStorage.setItem('view:article', JSON.stringify({ sort: 'manual', group: 'none', filter: {}, density: 'list' })))
    await c.go('articles'); await wait(700)
  }
  const into = async (name) => { await h.locator('[data-pane] [data-group-row]', { hasText: name }).first().click(); await wait(900) }
  const pick = async (titles) => { await h.keyboard.press('Escape'); await wait(150); for (const title of titles) { await row(title).click({ modifiers: ['Meta'], position: { x: 90, y: 14 } }); await wait(120) } }
  const many = () => h.evaluate(() => {
    const op = (el) => { let o = 1; for (let at = el; at; at = at.parentElement) o *= +getComputedStyle(at).opacity; return o }
    const line = document.querySelector('[data-drop-line]')?.getBoundingClientRect()
    const cards = [...document.querySelectorAll('[data-carried-card], [data-fanned]')].map((el) => el.getBoundingClientRect()).filter((r) => r.width > 8)
    return {
      badge: document.querySelector('[data-carried]')?.getAttribute('data-carried') ?? '',
      faded: [...document.querySelectorAll('[data-list-space] button[data-row][data-picked]')].filter((el) => el.getClientRects().length).map((el) => Math.round(op(el) * 100) / 100),
      lineY: line ? (line.top + line.bottom) / 2 : null,
      landing: [...document.querySelectorAll('[data-group-block][data-landing]')].map((el) => el.dataset.groupBlock),
      forming: document.querySelectorAll('[data-preview]').length,
      stack: cards.length ? { top: Math.min(...cards.map((r) => r.top)), bottom: Math.max(...cards.map((r) => r.bottom)), left: Math.min(...cards.map((r) => r.left)), right: Math.max(...cards.map((r) => r.right)) } : null,
      // The card's words inside its edge, and room left for its title.
      fits: (() => { const card = document.querySelector('[data-carried-card]')?.getBoundingClientRect(); const words = document.querySelector('[data-carried-card] [data-drag-label]')?.getBoundingClientRect(); const title = document.querySelector('[data-carried-card] .private-text')?.getBoundingClientRect(); return !card || !words || !title ? null : { out: Math.round(words.right - card.right), title: Math.round(title.width), card: Math.round(card.width) } })()
    }
  })
  /** The stack in hand over a row's title, in px of overlap (0: the title is in sight). */
  const coversTitle = (title) => h.evaluate((title) => {
    const words = [...document.querySelectorAll('[data-list-space] button[data-row] .private-text')].find((el) => el.textContent.trim() === title && !el.closest('[data-held]'))?.getBoundingClientRect()
    const cards = [...document.querySelectorAll('[data-carried-card], [data-fanned]')].map((el) => el.getBoundingClientRect()).filter((r) => r.width > 8)
    if (!words) return -1
    return Math.round(Math.max(0, ...cards.map((r) => Math.max(0, Math.min(r.right, words.right) - Math.max(r.left, words.left)) > 4 ? Math.max(0, Math.min(r.bottom, words.bottom) - Math.max(r.top, words.top)) : 0)))
  }, title)
  // Where a row rests, its slide left out: the list aims at the rows as they lie before anything made way (carry.tsx's
  // rowAt), so a person reaching a row with the room open elsewhere finds the room coming to the pointer.
  const restOf = (el) => { const r = el.getBoundingClientRect(); const lift = el.closest('[data-sortable-id]'); const m = lift ? new DOMMatrixReadOnly(getComputedStyle(lift).transform).m42 : 0; return { x: r.x, y: r.y - m, height: r.height } }
  const at = async (title, y = 0.86) => { const r = await row(title).evaluate(restOf); return { x: r.x + 200, y: r.y + r.height * y } }
  const headAt = async (name, y = 0.5) => { const r = await h.locator('[data-pane] [data-group-row]', { hasText: name }).first().evaluate(restOf); return { x: r.x + 200, y: r.y + r.height * y } }
  /** The list scrolled at once, to its top or its foot (a wheel glides there, and a box read on the way was stale). */
  const scrollList = (to) => h.evaluate((to) => { let box = document.querySelector('[data-list-space]'); while (box && !(box.scrollHeight > box.clientHeight && /auto|scroll/.test(getComputedStyle(box).overflowY))) box = box.parentElement; if (box) box.scrollTop = to === 'top' ? 0 : to === 'foot' ? box.scrollHeight : to }, to)
  const glide = async (to) => { await h.mouse.move(to.x, to.y, { steps: 8 }); return to }
  /** Where a room opens: the one look, the count, the others faded in their places, the line by the pointer. */
  const roomHere = async (name, to, words, n, carried) => {
    const d = await oneLook(`Several notes, ${name}`, to, { words })
    const s = await many()
    check(`Several notes, ${name}: the badge says ${n}`, s.badge === String(n), s.badge)
    // (Those drawn: a long list draws only the rows near the screen. The row in hand's own words went with the card.)
    const others = s.faded.filter((o) => o > 0.05)
    check(`Several notes, ${name}: the others carried wait, faded, in their places`, others.length >= Math.min(3, carried - 1) && others.every((o) => Math.abs(o - 0.3) <= 0.05) && s.faded.length - others.length === 1, s.faded.join())
    check(`Several notes, ${name}: the line is by the pointer (within three quarters of the row in hand)`, s.lineY !== null && Math.abs(s.lineY - to.y) <= d.held * 0.75 + 8, `line at ${s.lineY === null ? 'none' : Math.round(s.lineY)}, pointer at ${Math.round(to.y)}, row ${d.held}px`)
    // The group the card names is the one drawn round the room under the pointer (22-7: “Add 6 to Group 5” over Deep Dive's rows).
    const named = /to (.+)$/.exec(d.words)?.[1]
    if (named) {
      const holds = await h.evaluate(([group, y]) => {
        const row = [...document.querySelectorAll('[data-pane] [data-group-row]')].find((one) => one.textContent.trim().startsWith(group))
        // The panel as drawn: it grows to take in a room at its foot, past the block's own box.
        const block = row?.closest('[data-group-block]')
        const box = block?.getBoundingClientRect()
        const foot = block?.querySelector(':scope > [data-panel] [data-panel-part="bottom"]')?.getBoundingClientRect().bottom ?? box?.bottom ?? 0
        return !!box && y >= box.top && y <= Math.max(box.bottom, foot)
      }, [named, s.lineY ?? -1])
      check(`Several notes, ${name}: the room it names is drawn inside ${named.slice(0, 12)}`, holds)
    }
    await film(`several-${name.replace(/\W+/g, '-')}`, 4)
  }
  /** Where a group or folder lights and nothing opens (read soon: a folded group held on opens after 600 ms). */
  const litHere = async (name, to, words, group, soon = 450) => {
    await wait(soon)
    const d = await drawn()
    const s = await many()
    check(`Several notes, ${name}: the card says ${words}`, words instanceof RegExp ? words.test(d.words) : d.words === words, d.words || '(no words)')
    check(`Several notes, ${name}: ${group} lights, no room, no line, no row over another`, s.landing.length === 1 && s.landing[0] === group && !d.lines && !d.rooms && d.overlap <= 1, JSON.stringify({ landing: s.landing, lines: d.lines, rooms: d.rooms, overlap: d.overlap }))
    if (SHOTS) for (const look of ['light', 'dark']) { await c.look(look); await wait(150); await h.screenshot({ path: `${SHOTS}/several-${name.replace(/\W+/g, '-')}-${look}.png` }) }
    if (SHOTS) { await c.look('light'); await wait(150) }
  }
  await c.size(1280, 1100)
  // A folder (Desk) open as the page, as the user's Obsidian folder was: a folder in it, a folded group, two open
  // groups and loose notes, six of those picked with others between them.
  const desk = () => lay(['g:desk'], { desk: ['g:inner', 'g:first', 'g:deep', 'g:five', all.Larch, all.Yew, all.Rowan, all.Spruce, all.Willow, all.Alder, all.Beech, all.Cherry], inner: [all.Pine], first: [all.Fir, all.Hazel], deep: [all.Ash, all.Birch, all.Cedar], five: [all.Elm, all.Oak] }, ['first'])
  // Six picked with others between them, the list's last row (Cherry) not among them: over a row being carried nothing opens.
  const SIX = ['Larch', 'Rowan', 'Spruce', 'Willow', 'Alder', 'Beech']
  /** The list back at its top, the pointer over it (picking the last rows scrolled it down). */
  const toTop = async () => { await scrollList('top'); await wait(350) }
  const liftSix = async () => { await desk(); await into('Desk'); await pick(SIX); await toTop(); const was = await boxes(); await lift(row('Larch')); return was }
  let was = await liftSix()
  await roomHere('over another group’s rows', await glide(await at('Birch')), 'Add 6 to Deep', 6, 6)
  await roomHere('over the first row of a group', await glide(await at('Ash', 0.2)), 'Add 6 to Deep', 6, 6)
  await roomHere('over another group’s last row', await glide(await at('Oak')), /^Add 6 to Five, a group/, 6, 6)
  const long = await many()
  check('Several notes, a long group name: the words end inside the card and leave its title a quarter of it', !!long.fits && long.fits.out <= 0 && long.fits.title >= long.fits.card / 4, JSON.stringify(long.fits))
  await litHere('over a folded group', await glide(await headAt('First')), 'Add 6 to First', 'first', 250)
  // Held on, the folded group opens as a folder does in Finder, and the room opens in it, first, just under its head.
  await wait(900)
  check('Several notes, held on a folded group: it opens', (await h.locator('[data-group-row="first"][aria-expanded="true"]').count()) === 1)
  await roomHere('held on a folded group till it opens', await glide(await headAt('First', 0.8)), 'Add 6 to First', 6, 6)
  // Its middle too: the room opens just under its head, never at the group's foot, rows from the pointer.
  await roomHere('over an open group’s own row', await glide(await headAt('Deep', 0.66)), 'Add 6 to Deep', 6, 6)
  await litHere('over a folder in it', await glide(await headAt('Inner')), 'Move 6 into Inner', 'inner')
  // The list's foot, the list scrolled to its end under the carry (it is taller than the window).
  await scrollList('foot'); await wait(500)
  const last = await row('Cherry').evaluate(restOf)
  await roomHere('at the list’s foot', await glide({ x: last.x + 200, y: last.y + last.height + 8 }), /^Move 6 here/, 6, 6)
  // Out of the window, the button still down: nothing is aimed at; back in, the list answers again.
  await h.mouse.move(-40, last.y, { steps: 6 }); await wait(450)
  const out = await drawn()
  check('Several notes, carried out of the window: the card says nothing, no room, no line, nothing lit', !out.words && !out.rooms && !out.lines && !(await many()).landing.length, JSON.stringify({ words: out.words, rooms: out.rooms, lines: out.lines }))
  await toTop()
  await roomHere('back into the window', await glide(await at('Birch')), 'Add 6 to Deep', 6, 6)
  // Rested on the middle of the loose row just under the one in hand: a new group of seven there, in a folder simply a
  // group, its name in sight, and the place the row in hand was lifted from closed, never an empty band (22-2).
  // (Scrolled to bring it up from the list's foot: held in the last tenth of the list, the list scrolls by itself.)
  await scrollList(300); await wait(350)
  await glide(await at('Yew', 0.5)); await wait(1100)
  const rest = await many()
  const restWords = await said()
  check('Several notes, rested on a loose row in a folder: “New group of 7”, the badge 7, its dashed place under it', restWords === 'New group of 7' && rest.badge === '7' && rest.forming === 1, JSON.stringify({ restWords, ...rest }))
  // The list scrolled since the lift: the card still rests on the new group's dashed place, not as far off as the scroll.
  const rests = await h.evaluate(() => { const place = document.querySelector('[data-preview] > span')?.getBoundingClientRect(); const card = document.querySelector('[data-carried-card]')?.getBoundingClientRect(); return place && card ? { place: [Math.round(place.top), Math.round(place.bottom)], card: Math.round((card.top + card.bottom) / 2) } : null })
  check('Several notes, rested after the list scrolled: the card rests on the new group’s place', !!rests && rests.card >= rests.place[0] && rests.card <= rests.place[1], JSON.stringify(rests))
  const restLook = await drawn()
  check('Several notes, rested on a loose row: no row over another, and no band left where the row in hand was', restLook.overlap <= 1 && !(await h.evaluate(() => [...document.querySelectorAll('[data-own-room], [data-drop-room]')].filter((one) => one.getClientRects().length && +getComputedStyle(one).opacity > 0.05).length)), `overlap ${restLook.overlap}px`)
  check('Several notes, rested on a loose row: the pile in hand leaves that row’s name in sight', (await coversTitle('Yew')) === 0, `${await coversTitle('Yew')}px of “Yew” covered`)
  if (SHOTS) await both('several-rested')
  // Put back with Esc, the folded group it opened on the way is folded again.
  await putBack('Several notes, carried across the folder', was)
  check('Several notes, put back: the group it opened on the way is folded again', (await h.locator('[data-group-row="first"][aria-expanded="false"]').count()) === 1)
  // Let go out of the window: everything back where it was, and nothing said.
  was = await liftSix()
  await glide(await at('Birch')); await wait(300)
  await h.mouse.move(-40, (await row('Yew').boundingBox()).y, { steps: 6 }); await wait(300)
  await h.mouse.up(); await wait(900)
  const outBoxes = await boxes()
  const outMoved = Object.keys(was).filter((id) => was[id] !== outBoxes[id])
  check('Several notes, let go out of the window: nothing moves, nothing is said', !outMoved.length && !(await notices()).length && ((await v('groups', 'article')).find((one) => one.id === 'deep')?.members ?? []).length === 3, outMoved.slice(0, 4).join('; '))
  // Let go over another group's rows: all six land there, in list order, said once with Undo.
  was = await liftSix()
  await glide(await at('Birch')); await wait(450)
  await h.mouse.up(); await wait(1200)
  const landed = (await v('groups', 'article')).find((one) => one.id === 'deep')?.members ?? []
  // Carried up onto Birch, the room opened in Birch's place (Birch made way downward): there they land.
  check('Several notes, let go in another group: all six are in it, where the room was, in list order', landed.join() === [all.Ash, ...SIX.map((one) => all[one]), all.Birch, all.Cedar].join(), landed.map((id) => Object.keys(all).find((k) => all[k] === id)).join())
  const told = await notices()
  check('Several notes, let go: said once, with Undo', told.length === 1 && /^Added 6 to Deep/.test(told[0]), told.join(' | ') || '(no notice)')
  await h.locator('[role=status] button', { hasText: 'Undo' }).last().click().catch(() => {}); await wait(1200)
  const back = await v('groups', 'article')
  check('Several notes, “Undo” puts all six back', (back.find((one) => one.id === 'deep')?.members ?? []).join() === [all.Ash, all.Birch, all.Cedar].join() && SIX.every((one) => back.find((g) => g.id === 'desk')?.members.includes(all[one])), (back.find((one) => one.id === 'deep')?.members ?? []).map((id) => Object.keys(all).find((k) => all[k] === id)).join())
  // Let go on the folder in the list: all six move into it, said as its menu's “Move to” says it, with Undo.
  for (let i = 0; i < 40 && (await notices()).length; i++) await wait(250)
  was = await liftSix()
  await glide(await headAt('Inner')); await wait(450)
  await h.mouse.up(); await wait(1200)
  const inner = (await v('groups', 'article')).find((one) => one.id === 'inner')?.members ?? []
  const toldInner = await notices()
  check('Several notes, let go on a folder in the list: all six are in it, said “Moved 6 notes to Inner” once, with Undo', SIX.every((one) => inner.includes(all[one])) && toldInner.length === 1 && /^Moved 6 notes to Inner/.test(toldInner[0]), `${inner.length} in Inner; ${toldInner.join(' | ') || '(no notice)'}`)
  await h.locator('[role=status] button', { hasText: 'Undo' }).last().click().catch(() => {}); await wait(1200)
  check('Several notes, “Undo” takes all six out of the folder again', ((await v('groups', 'article')).find((one) => one.id === 'inner')?.members ?? []).join() === all.Pine)
  // Three out of a subgroup to the top of the group round it (27): the faded ones stay in the subgroup, never over its head.
  await lay(['g:desk'], { desk: ['g:dives', all.Yew, all.Larch], dives: [all.Ash, 'g:sub', all.Birch, all.Oak], sub: [all.Cedar, all.Elm, all.Fir] })
  await into('Desk'); await pick(['Cedar', 'Elm', 'Fir'])
  was = await boxes()
  await lift(row('Fir'))
  await roomHere('three out of a subgroup to the top of its group', await glide(await at('Ash')), 'Move 3 to Dives', 3, 3)
  await putBack('Several notes, three out of a subgroup', was)
  // Four onto a fifth in a group at the list's top level: a subgroup of five (HW1's case, from qa/multi-drag.mjs).
  await lay(['g:shelf', all.Yew], { shelf: [all.Ash, all.Birch, all.Cedar, all.Elm, all.Fir] })
  await pick(['Birch', 'Cedar', 'Elm', 'Fir'])
  was = await boxes()
  await lift(row('Fir'))
  await glide(await at('Ash', 0.5)); await wait(1100)
  const sub = await many()
  check('Several notes, four rested on a fifth in a group: “New subgroup of 5”, the badge 5', (await said()) === 'New subgroup of 5' && sub.badge === '5' && sub.forming === 1, JSON.stringify({ said: await said(), ...sub }))
  check('Several notes, four on a fifth: no row over another', (await drawn()).overlap <= 1)
  check('Several notes, four on a fifth: the pile in hand leaves that row’s name in sight', (await coversTitle('Ash')) === 0, `${await coversTitle('Ash')}px of “Ash” covered`)
  if (SHOTS) await both('several-subgroup')
  await putBack('Several notes, four on a fifth', was)
  await c.size(1200, 900)
})

// --- 6. One card ---
await part('One card', async () => {
const names = Object.keys(pads)
// The cards are gathered by the other parts' drags: a QA_PART run with none of them has none to compare.
if (!names.length && process.env.QA_PART) return console.log('SKIP  One card: no drags gathered in this part (run the whole probe, or a part with drags, to compare them)')
console.log('cards:', JSON.stringify(pads))
check('every drag carries a card', names.every((one) => pads[one]), names.filter((one) => !pads[one]).join())
check('the carried card has real padding', names.every((one) => pads[one] && parseFloat(padOf(pads[one]).split(' ')[0]) >= 8 && parseFloat(padOf(pads[one]).split(' ')[1]) >= 12), names.map((one) => `${one} ${padOf(pads[one])}`).join('; '))
check('the same card in every drag', new Set(names.map((one) => `${padOf(pads[one])}|${pads[one]?.radius}|${pads[one]?.bg}|${pads[one]?.same}`)).size === 1 && names.every((one) => pads[one]?.same), names.map((one) => `${one} ${pads[one]?.radius} ${pads[one]?.bg}`).join('; '))

})
// --- 7. A term's row ---
await part("A term's row", async () => {
const term = await h.evaluate(async () => {
  const id = await window.api.captures.create({ kind: 'word', title: 'collector\'s fallacy', body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'collector\'s fallacy' }] }] } })
  await window.api.haligtree('notes:fields:set', 'captures', id, 'definition', 'Keeping a thing feels like knowing it.')
  return id
})
await c.go('lookups'); await wait(900)
const heads = () => h.locator('[data-head-word]').count()
check('Lookups, all terms: the dictionary look', (await heads()) >= 1, `${await heads()} word rows`)
await both('lookups-terms')
const plain = await h.evaluate(async () => window.api.captures.create({ kind: 'note', title: 'A plain kept note', body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'A plain kept note' }] }] } }))
await v('notes:archive', 'captures', [term, plain], true)
await c.go('archived'); await wait(900)
const rowOf = (title) => h.evaluate((title) => {
  const one = [...document.querySelectorAll('[data-row]')].find((el) => el.textContent.includes(title))
  if (!one) return null
  const words = [...one.querySelectorAll('.private-text')].find((el) => el.textContent.includes(title))
  return { head: !!one.querySelector('[data-head-word]'), size: words && getComputedStyle(words).fontSize, weight: words && getComputedStyle(words).fontWeight, height: Math.round(one.getBoundingClientRect().height) }
}, title)
const t1 = await rowOf('collector')
const t2 = await rowOf('A plain kept note')
check('Archived, mixed: the term is a normal row like its neighbours', t1 && t2 && !t1.head && t1.size === t2.size && t1.weight === t2.weight && t1.height === t2.height, JSON.stringify({ t1, t2 }))
await both('archived-mixed')
})
// --- 8. Frames, the sibling pages, a phone's width, and a long list (with SHOTS: the rest of the look) ---
if (SHOTS) await part('Frames', async () => {
  const frames = async (name, from, to, n = 10) => { for (let i = 0; i <= n; i++) { await h.mouse.move(from.x, from.y + ((to - from.y) * i) / n); await h.screenshot({ path: `${SHOTS}/${name}-${String(i).padStart(2, '0')}.png` }) } }
  for (const look of ['light', 'dark']) {
    await c.look(look)
    await scene()
    box = await blockBox('last')
    a = await lift(row('Ash'))
    const start = { x: a.x + 200, y: a.y + a.height / 2 + 8 }
    const elm = await row('Elm').boundingBox()
    await frames(`accept-${look}`, start, elm.y + 8)
    await frames(`leave-${look}`, { x: start.x, y: elm.y + 8 }, box.bottom + 16)
    await h.keyboard.press('Escape'); await wait(200); await h.mouse.up(); await wait(200)
    await c.go('goals'); await wait(700); await h.screenshot({ path: `${SHOTS}/sibling-goals-${look}.png` })
    await c.go('sources'); await wait(700); await h.screenshot({ path: `${SHOTS}/sibling-sources-${look}.png` })
  }
  await c.look('light')
  // The Paper and Brutal shape styles.
  for (const style of ['paper', 'brutal']) {
    await h.evaluate((one) => { localStorage.setItem('style', one); window.dispatchEvent(new StorageEvent('storage', { key: 'style' })) }, style)
    await wait(300)
    await scene()
    a = await lift(row('Ash'))
    const elm = await row('Elm').boundingBox()
    await h.mouse.move(a.x + 200, elm.y + 8, { steps: 6 }); await wait(350)
    await h.screenshot({ path: `${SHOTS}/style-${style}-row.png` })
    await h.keyboard.press('Escape'); await wait(200); await h.mouse.up(); await wait(200)
    await c.go('today'); await wait(700)
    const f = await liftAt(stepRow(lineIds.paint, 1))
    await h.mouse.move(f.x, f.y + 40, { steps: 5 }); await wait(300)
    await h.screenshot({ path: `${SHOTS}/style-${style}-step.png` })
    await h.keyboard.press('Escape'); await wait(200); await h.mouse.up(); await wait(200)
  }
  await h.evaluate(() => { localStorage.setItem('style', 'soft'); window.dispatchEvent(new StorageEvent('storage', { key: 'style' })) })
  // A phone's width: the written page, a step carried; nothing cut off, no sideways scroll.
  await c.go('today'); await wait(700)
  await c.size(390, 844); await wait(500)
  await h.locator(`[data-day-step="${lineIds.paint}:1"]`).scrollIntoViewIfNeeded()
  const fromNarrow = await liftAt(stepRow(lineIds.paint, 1))
  await h.mouse.move(fromNarrow.x, fromNarrow.y + 40, { steps: 5 }); await wait(250)
  await h.screenshot({ path: `${SHOTS}/phone-step-carried.png` })
  const narrow = await h.evaluate(() => {
    const el = document.querySelector('[data-carried-card]')?.getBoundingClientRect()
    return { card: el && { left: el.left, right: el.right }, width: innerWidth, sideways: document.documentElement.scrollWidth > innerWidth }
  })
  check('a phone\'s width: the card fits the window and nothing scrolls sideways', narrow.card && narrow.card.right <= narrow.width && narrow.card.left >= 0 && !narrow.sideways, JSON.stringify(narrow))
  await h.keyboard.press('Escape'); await wait(200); await h.mouse.up(); await wait(200)
  await c.size(1200, 900)
  // Long: 500, then 5,000 pages in the last group; reading the edge keeps up, and the last row still leaves.
  const many = []
  for (const size of [500, 5000]) {
    while (many.length < size) many.push(await v('article:new'))
    await scene({ groups: { last: many } })
    await wait(size > 1000 ? 2500 : 600)
    const seen = await h.evaluate(() => document.querySelectorAll('[data-group-block="last"] [data-sortable-id]').length)
    check(`${size} in a group: only those near the screen are drawn`, seen < 120, `${seen} rows drawn`)
    const r = await h.locator('[data-group-block="last"] button[data-row]').first().boundingBox()
    await h.mouse.move(r.x + 200, r.y + 20); await h.mouse.down()
    const t0 = Date.now()
    await h.mouse.move(r.x + 200, r.y + 30, { steps: 3 })
    await wait(50)
    const lifted = Date.now() - t0
    const t1 = Date.now()
    await h.mouse.move(r.x + 200, r.y + 150, { steps: 10 })
    await h.evaluate(() => new Promise((go) => requestAnimationFrame(() => requestAnimationFrame(go))))
    const moved = Date.now() - t1
    await h.screenshot({ path: `${SHOTS}/group-${size}.png` })
    await h.keyboard.press('Escape'); await wait(300); await h.mouse.up(); await wait(300)
    check(`${size} in a group: a lift and a carry keep up`, lifted < 1500 && moved < 1500, `lift ${lifted}ms, carry over 10 moves ${moved}ms`)
  }
  // 50 task lines on the written page.
  for (let i = 0; i < 50; i++) await v('task:add', `Long day line ${i + 1} today`)
  await h.reload(); await wait(1800); await c.go('today'); await wait(1200)
  const count50 = await h.locator('[data-day-line]').count()
  const fifty = await h.locator('[data-day-head]').nth(30).boundingBox()
  await h.mouse.move(fifty.x + 6, fifty.y + 12); await h.mouse.down(); await h.mouse.move(fifty.x + 6, fifty.y + 22, { steps: 3 }); await wait(120)
  const t2 = Date.now()
  await h.mouse.move(fifty.x + 6, fifty.y - 200, { steps: 10 })
  await h.evaluate(() => new Promise((go) => requestAnimationFrame(() => requestAnimationFrame(go))))
  const moved50 = Date.now() - t2
  await h.screenshot({ path: `${SHOTS}/lines-50.png` })
  await h.keyboard.press('Escape'); await wait(300); await h.mouse.up(); await wait(300)
  check('50 task lines: a carry keeps up', count50 >= 50 && moved50 < 1500, `${count50} lines, carry over 10 moves ${moved50}ms`)
})
// BIN_TRACE: what went to the Bin in the parts that ran and was not said by a part of its own. A run of PART=look
// only carries and puts back, so the count is nothing; anything else is named, with what the page got just before.
if (BIN_TRACE) { const bins = await binsSince(); console.log(`BIN calls in this run, not said by a part: ${bins.length}${bins.map((one) => `\n  BIN ${JSON.stringify(one).slice(0, 500)}`).join('')}`) }
await c.close()
done()
