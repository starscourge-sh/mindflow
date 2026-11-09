// One way of dragging, driven with a real pointer: a group last in the list left
// by dragging below it; the panel's edge read for groups, subgroups and sidebar
// folders, with a dead band; firm taps on crossing an edge and light ones between
// rows, counted by kind; the panel's overshoot sampled per frame and absent with
// Reduce motion or Motion off; one carried card, its padding measured in every
// drag; no line moving sideways and nothing left faded; a step lifted alone; a
// task to a step and back, each with Undo; Esc cancels every drag; a term's row in
// Archived and in Lookups. Frames go to SHOTS.
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
for (const list of ['article', 'nugget']) for (const group of await v('groups', list)) await v('groups:delete', group.id)
const wait = (ms) => h.waitForTimeout(ms)
h.setDefaultTimeout(4000)
/** A part of the probe: a part that cannot even run on old code is a fail, and the rest still runs. */
const part = async (name, run) => { if (process.env.PART && !name.includes(process.env.PART)) return; try { await run() } catch (error) { check(`${name} could be driven`, false, String(error.message).split('\n')[0]); await shot(`broke-${name.replace(/\W+/g, '-')}`); await h.keyboard.press('Escape').catch(() => {}); await h.mouse.up().catch(() => {}); await wait(300) } }
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
for (const title of TITLES) { const id = await v('article:new'); await v('item:save', id, { title }); ids[title] = id }
const others = (await v('items', 'article')).map((one) => one.id).filter((id) => !Object.values(ids).includes(id))
for (const id of others) await v('bin:put', id)
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
    const lifted = await h.evaluate((id) => ({ place: !!document.querySelector(`[data-sortable-id="${id}"].mf-carried-place`), cards: document.querySelectorAll('[data-dnd-overlay], [data-carried]').length }), last)
    check(`${look}: a carried task keeps its place faintly where it was`, lifted.place, JSON.stringify(lifted))
    await wait(150); await h.mouse.up(); await wait(1200)
    if (FILM) await h.screenshot({ path: `${FILM}/today-drag-${look}-dropped.png` })
    const after = await order()
    check(`${look}: dropped at the top, it is first, in your own order`, after[0] === last && after.length === before.length, `${before.join(',')} -> ${after.join(',')}`)
    // Esc mid-drag puts it back where it was.
    const was = await order()
    await carry(was[2], { x: top.x + 220, y: top.y + 4 }, { hold: true })
    await h.keyboard.press('Escape'); await wait(300); await h.mouse.up(); await wait(900)
    check(`${look}: Esc mid-drag puts it back, nothing left faded`, (await order()).join() === was.join() && !(await h.locator('.mf-carried-place').count()), (await order()).join(','))
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

// --- 6. One card ---
await part('One card', async () => {
const names = Object.keys(pads)
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
await c.close()
done()
