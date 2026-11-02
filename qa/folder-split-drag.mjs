// Dragging in the folder list with the split view about: a note carried to the page's edge brings up the split places
// (and nothing in the list lights with them); with two panes open, a note carried onto a hand-made group's heading or a
// folder row in the list goes in, the split places never come up, only one place is lit in any frame, the heading never
// moves under the pointer, and the dropped note lands once.
//
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox node qa/folder-split-drag.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'

const { check, done } = checks()
const s = await sandbox({ width: 1400, height: 880 })
const { h, v, go, close, errors } = s
if (process.env.QA_THEME) await s.theme(process.env.QA_THEME)
const shots = process.env.QA_SHOTS
const M = '[role="main"]'
const wait = (ms) => h.waitForTimeout(ms)
const state = () => h.evaluate(() => ({
  zones: document.querySelectorAll('[data-split-zone]').length,
  hotZones: document.querySelectorAll('[data-split-zone][data-hot]').length,
  hand: document.querySelectorAll('[data-hand-hot]').length,
  queue: document.querySelectorAll('[data-queue-hot]').length,
  landing: document.querySelectorAll('[data-group-block][data-landing]').length,
  panes: document.querySelectorAll('[data-split-area] [data-pane]').length
}))
// Carry the row from (a) to (b), a frame read (and filmed) every step.
const carry = async (name, from, to, steps = 16, tag = (b) => b) => {
  const frames = []
  await h.mouse.move(from.x, from.y)
  await h.mouse.down()
  await h.mouse.move(from.x + 4, from.y + 8, { steps: 3 })
  for (let i = 1; i <= steps; i++) {
    await h.mouse.move(from.x + (to.x - from.x) * i / steps, from.y + (to.y - from.y) * i / steps)
    await wait(50)
    const one = await state()
    one.top = await tag()
    frames.push(one)
    if (shots) await h.screenshot({ path: `${shots}/${name}-${String(i).padStart(2, '0')}.png` })
  }
  await wait(250)
  frames.push({ ...(await state()), top: await tag() })
  await h.mouse.up()
  await wait(900)
  return frames
}
try {
  await v('settings:set', { hintRate: 0 })
  await h.evaluate(() => localStorage.setItem('view:article', JSON.stringify({ sort: 'newest', group: 'none', filter: {}, density: 'list' })))
  const groups = await v('groups', 'article')
  const inFolders = new Set(groups.flatMap((one) => one.members))
  const loose = (await v('items', 'article')).filter((one) => !inFolders.has(one.id) && !one.archivedAt)
  const section = await v('sections:make', 'article', null, 'To revise', [loose[0].id])
  await go('articles')
  await wait(800)
  // 1. A note carried to the right edge: the split places come up and light, nothing in the list lights with them.
  const area = await h.evaluate(() => { const b = document.querySelector('[data-split-area]').getBoundingClientRect(); return { left: b.left, right: b.right, top: b.top, bottom: b.bottom } })
  const row = await h.locator(`${M} [data-row][data-id="${loose[1].id}"]`).first().boundingBox()
  const edge = await carry('edge', { x: row.x + 80, y: row.y + row.height / 2 }, { x: area.right - 30, y: (area.top + area.bottom) / 2 }, 18)
  check('to the edge: the split place lights, and nothing in the list lights with it', edge.some((one) => one.hotZones === 1) && edge.every((one) => !(one.hotZones && (one.hand || one.queue || one.landing))), JSON.stringify(edge.map((one) => `${one.hotZones}${one.hand}${one.queue}${one.landing}`)))
  const panes = (await state()).panes
  check('let go there, a second pane opens', panes === 2, panes)
  await h.mouse.move(5, 300)
  await wait(500)
  // 2. With two panes: a loose note carried onto the hand-made heading in the list.
  const headSel = `${M} [data-hand-group="${section}"]`
  const head = await h.locator(headSel).first().boundingBox()
  const third = await h.locator(`${M} [data-row][data-id="${loose[2].id}"]`).first().boundingBox()
  const topOf = () => h.evaluate((sel) => Math.round(document.querySelector(sel)?.getBoundingClientRect().top ?? -1), headSel)
  const into = await carry('heading', { x: third.x + 80, y: third.y + third.height / 2 }, { x: head.x + 160, y: head.y + head.height / 2 + 4 }, 16, topOf)
  const overHead = into.filter((one) => one.hand)
  check('carried onto the heading in a split: it lights, the split places never come up', overHead.length > 0 && into.every((one) => one.zones === 0), JSON.stringify(into.map((one) => `z${one.zones}h${one.hand}l${one.landing}`)))
  check('only one place lit in any frame', into.every((one) => one.hand + one.queue + one.landing + one.hotZones <= 1))
  check('the heading never moves while it is aimed at', new Set(overHead.map((one) => one.top)).size === 1, JSON.stringify(overHead.map((one) => one.top)))
  const now = (await v('sections', 'article')).find((one) => one.id === section)
  check('let go, the note is in the group, once', now.members.includes(loose[2].id) && (await h.locator(`${M} [data-row][data-id="${loose[2].id}"]`).count()) === 1, JSON.stringify(now.members))
  // 3. A loose note carried onto a folder row's middle, in the split.
  const folder = groups.find((one) => !one.parent)
  const fbox = await h.locator(`${M} [data-group-row="${folder.id}"]`).first().boundingBox()
  const fourth = await h.locator(`${M} [data-row][data-id="${loose[1].id}"]`).first().boundingBox()
  const onto = await carry('folder', { x: fourth.x + 80, y: fourth.y + fourth.height / 2 }, { x: fbox.x + 200, y: fbox.y + fbox.height / 2 }, 16)
  check('carried onto a folder row in a split: it lights alone, the split places never come up', onto.some((one) => one.landing || one.queue) && onto.every((one) => one.zones === 0 && one.hand + one.queue + one.landing <= 1), JSON.stringify(onto.map((one) => `z${one.zones}h${one.hand}q${one.queue}l${one.landing}`)))
  check('let go, the note is in the folder', (await v('groups', 'article')).find((one) => one.id === folder.id).members.includes(loose[1].id))
  check('no page errors', errors.length === 0, errors.join(' | '))
} finally {
  await close()
}
done()
