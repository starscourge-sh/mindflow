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
const part = async (name, run) => { try { await run() } catch (error) { check(`${name} could be driven`, false, String(error.message).split('\n')[0]); await shot(`broke-${name.replace(/\W+/g, '-')}`); await h.keyboard.press('Escape').catch(() => {}); await h.mouse.up().catch(() => {}); await wait(300) } }
const shot = (name) => (SHOTS ? h.screenshot({ path: `${SHOTS}/${name}.png` }) : null)
const film = async (name, n = 6) => { if (SHOTS) for (let i = 0; i < n; i++) { await h.screenshot({ path: `${SHOTS}/${name}-${i}.png` }); await wait(50) } }
const both = async (name) => { if (!SHOTS) return; for (const look of ['light', 'dark']) { await c.look(look); await wait(120); await h.screenshot({ path: `${SHOTS}/${name}-${look}.png` }) } await c.look('light'); await wait(120) }
const said = () => h.evaluate(() => document.querySelector('[data-drag-label]')?.textContent ?? '')
const kinds = () => electron.evaluate(() => globalThis.haligtreeTapKinds())
const tapsSince = async (before) => { await wait(180); const now = await kinds(); const fresh = now.slice(before.length); return { level: fresh.filter((k) => k === 'level').length, align: fresh.filter((k) => k === 'align').length } }
const CARD = '[data-carried-card], [data-ghost], [data-lifted], [data-folder-ghost], [data-split-card]'
const card = () => h.evaluate((sel) => {
  const all = [...document.querySelectorAll(sel)].filter((one) => one.getClientRects().length)
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
  await h.keyboard.press('Escape')
  await wait(400)
  return { over: most - Math.max(was, rest), outside, frames: frames.length }
}
const both2 = async (name) => shot(name)
const moving = await peak()
check('the panel overshoots a little as it accepts, and settles', moving.over >= 2 && moving.over <= 6, `${moving.over.toFixed(1)}px over ${moving.frames} frames`)
check('no frame with a row outside its box', moving.outside === 0, `${moving.outside} frames`)
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
// --- 5. Tasks and steps on the written page ---
await part('Tasks and steps on the written page', async () => {
for (const task of await v('tasks')) if (task.status === 'open' && (task.dueAt || task.deadline)) await v('task:save', task.id, { status: 'dropped' })
const addLine = async (title, steps) => { const made = await v('task:add', `${title} today`); if (steps) await v('task:save', made.id, { subtasks: steps.map((text) => ({ text, done: false })) }); return made.id }
lineIds = { paint: await addLine('Paint the fence', ['Buy paint', 'Sand it', 'First coat']), call: await addLine('Call the bank'), read: await addLine('Read the lease', ['Page one']), post: await addLine('Post the letter') }
await h.evaluate(() => localStorage.setItem('view:tasks:today', JSON.stringify({ sort: 'manual', group: 'page' })))
await h.reload(); await wait(1500)
await c.go('today'); await wait(900)
const rings0 = await ringsLeft()
let from = await liftAt(headOf(lineIds.call))
pads.line = await card()
await both('line-carried')
const rings1 = await ringsLeft()
check('no line moves sideways while one is carried', rings0.length > 2 && rings0.filter((x, at) => rings1[at] !== undefined && Math.abs(x - rings1[at]) > 1).length === 0, `${rings0.join()} then ${rings1.join()}`)
const faded = await h.evaluate(() => [...document.querySelectorAll('[data-day-line], [data-day-step], [data-sortable-id]')].filter((one) => !one.closest('[data-drop-room]') && one.getClientRects().length && Number(getComputedStyle(one).opacity) < 0.95 && Number(getComputedStyle(one).opacity) > 0.05).length)
check('nothing is left behind faded', faded === 0, `${faded} faded`)
await h.keyboard.press('Escape'); await wait(300); await h.mouse.up(); await wait(200)
from = await liftAt(headOf(lineIds.call))
const before2 = await kinds()
const postBox = await headOf(lineIds.post).boundingBox()
await h.mouse.move(from.x, postBox.y + postBox.height / 2, { steps: 8 })
await wait(800)
await shot('task-rested-on-task')
await film('task-rested-frames', 4)
check('rested on a task\'s middle it says it becomes a step', /step/i.test((await card())?.text ?? ''), (await card())?.text)
t = await tapsSince(before2)
check('accepted with a firm tap', t.level >= 1, JSON.stringify(t))
await h.mouse.up(); await wait(600)
let post = await task(lineIds.post)
check('dropped, the task is a step of the other', post.subtasks?.some((one) => one.text.startsWith('Call the bank')), JSON.stringify(post.subtasks))
check('the task itself is no longer a line', !(await line(lineIds.call).count()))
await h.keyboard.press('Meta+z'); await wait(600)
post = await task(lineIds.post)
check('⌘Z: the step is gone and the task is back', !post.subtasks?.length && (await line(lineIds.call).count()) === 1, JSON.stringify(post.subtasks))

// A task with its own steps is refused, in words.
from = await liftAt(headOf(lineIds.read))
const callBox = await headOf(lineIds.call).boundingBox()
await h.mouse.move(from.x, callBox.y + callBox.height / 2, { steps: 8 })
await wait(800)
check('a task with steps: the refusal is said while it rests', /steps of its own/.test((await card())?.text ?? ''), (await card())?.text)
await shot('task-refused')
await h.mouse.up(); await wait(500)
check('a task with steps stays a line', (await line(lineIds.read).count()) === 1 && !(await task(lineIds.call)).subtasks?.length)

// A step lifted alone.
from = await liftAt(stepRow(lineIds.paint, 1))
pads.step = await card()
check('a step is lifted alone', /Sand it/.test((await card())?.text ?? ''), (await card())?.text)
await both('step-carried')
await film('step-lifted', 3)
const lastStep = await stepRow(lineIds.paint, 2).boundingBox()
await h.mouse.move(from.x, lastStep.y + lastStep.height - 3, { steps: 6 }); await wait(300)
await h.mouse.up(); await wait(500)
check('steps reorder', (await task(lineIds.paint)).subtasks.map((one) => one.text).join() === 'Buy paint,First coat,Sand it', (await task(lineIds.paint)).subtasks.map((one) => one.text).join())
await h.keyboard.press('Meta+z'); await wait(500)
check('⌘Z puts the order back', (await task(lineIds.paint)).subtasks.map((one) => one.text).join() === 'Buy paint,Sand it,First coat')
// To another task's steps.
from = await liftAt(stepRow(lineIds.paint, 1))
const page1 = await stepRow(lineIds.read, 0).boundingBox()
await h.mouse.move(from.x, page1.y + page1.height - 3, { steps: 8 }); await wait(300)
await shot('step-to-other-task')
await h.mouse.up(); await wait(500)
check('a step moves to another task', (await task(lineIds.read)).subtasks.map((one) => one.text).join() === 'Page one,Sand it' && (await task(lineIds.paint)).subtasks.length === 2, (await task(lineIds.read)).subtasks.map((one) => one.text).join())
await h.keyboard.press('Meta+z'); await wait(500)
check('⌘Z takes it back', (await task(lineIds.paint)).subtasks.length === 3)
// Out past the edge: a task of its own.
from = await liftAt(stepRow(lineIds.paint, 2))
const paintBlock = await line(lineIds.paint).boundingBox()
before = await kinds()
await h.mouse.move(from.x, paintBlock.y + paintBlock.height + 8, { steps: 8 }); await wait(300)
await shot('step-past-edge')
t = await tapsSince(before)
check('a step past its task\'s edge: one firm tap', t.level === 1, JSON.stringify(t))
await h.mouse.up(); await wait(600)
const made = (await v('tasks')).find((one) => one.title === 'First coat' && one.status === 'open')
check('dropped past the edge, a step is a task', !!made && (await task(lineIds.paint)).subtasks.length === 2)
await h.keyboard.press('Meta+z'); await wait(600)
check('⌘Z makes it a step again', (await task(lineIds.paint)).subtasks.length === 3 && !(await v('tasks')).some((one) => one.title === 'First coat' && one.status === 'open'))
// Carried well to the left of where it sits: a task too, as ⇧⇥ makes one.
from = await liftAt(stepRow(lineIds.paint, 2))
await h.mouse.move(from.x + 60, from.y + 2, { steps: 3 })
await h.mouse.move(from.x - 60, from.y + 2, { steps: 6 }); await wait(250)
check('a step carried left says it becomes a task', /Make it a task/.test((await card())?.text ?? ''), (await card())?.text)
await h.keyboard.press('Escape'); await wait(300); await h.mouse.up(); await wait(300)
// Esc on a step.
from = await liftAt(stepRow(lineIds.paint, 0))
await h.mouse.move(from.x, from.y + 60, { steps: 5 }); await wait(200)
await h.keyboard.press('Escape'); await wait(300); await h.mouse.up(); await wait(300)
check('Esc puts a step back', (await task(lineIds.paint)).subtasks.map((one) => one.text).join() === 'Buy paint,Sand it,First coat')

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
  // Long: 500 pages in the last group; reading the edge keeps up, and the last row still leaves.
  const many = []
  for (let i = 0; i < 500; i++) many.push(await v('article:new'))
  await scene({ groups: { last: many } })
  await h.evaluate(() => { const list = document.querySelector('[data-group-block="last"]')?.closest('[data-pane]')?.querySelector('[data-scroll], .overflow-y-auto'); if (list) list.scrollTop = list.scrollHeight })
  await wait(500)
  const seen = await h.evaluate(() => document.querySelectorAll('[data-group-block="last"] [data-sortable-id]').length)
  check('500 in a group: only those near the screen are drawn', seen < 120, `${seen} rows drawn`)
  await h.screenshot({ path: `${SHOTS}/group-500.png` })
})
await c.close()
done()
