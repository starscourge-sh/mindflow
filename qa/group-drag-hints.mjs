// Every grouping drag says what it will do, and then does exactly that. For
// each case the probe reads the hint just before letting go (the words in the
// pill, which group's panel is lit and its edges, where the room and its line
// sit), lets go, and checks the result: the carried row is in the group the
// pill named, sits where the room was, and the lit panel's edges are the
// group's own edges after the drop. The panel's three parts never come apart
// while they glide. A group is never let go inside itself, Esc puts it all
// back, and in a list sorted some other way a move switches it to "Custom
// order" and keeps the order you saw.
//
//   npx electron-vite build --outDir out-x
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-x/main/index.js HALIGTREE_QA_AWAY=1 [SHOTS=<dir>] node qa/group-drag-hints.mjs
import { mkdirSync } from 'fs'
import { sandbox } from './sandbox-lib.mjs'
import { checks } from './harness.mjs'

const dir = process.env.SHOTS ?? ''
if (dir) mkdirSync(dir, { recursive: true })
const { check, done } = checks()
const TITLES = ['THE AGREEMENT', 'Notes', 'Accounts', 'Buy', 'Bed', 'Todos', 'Remove account check', 'Xenon', 'Yttrium', 'Loose one', 'Loose two']
const NAMES = { an: 'Apple Notes / Notes', g2: 'Group 2', g3: 'Group 3', ot: 'Other' }
const c = await sandbox({ width: 1200, height: 1150 })
const { h, v } = c
const wait = (ms) => h.waitForTimeout(ms)
const esc = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const row = (title) => h.locator('button[data-row]:not([data-lifted] *)', { hasText: new RegExp(`^${esc(title)}`) }).first()
const head = (id) => h.locator(`[data-group-row="${id}"]`).first()
const ids = {}
const view = (sort) => h.evaluate((s) => localStorage.setItem('view:article', JSON.stringify({ sort: s, group: 'none', filter: {}, density: 'list' })), sort)

/** The scene from the report: Apple Notes / Notes holding Group 2, Group 3 and a loose page; another group; two loose pages. */
async function scene({ folded = [] } = {}) {
  const layout = {
    top: ['g:an', 'g:ot', ids['Loose one'], ids['Loose two']],
    groups: { an: ['g:g2', 'g:g3', ids['Remove account check']], g2: [ids['THE AGREEMENT'], ids.Notes, ids.Accounts], g3: [ids.Buy, ids.Bed, ids.Todos], ot: [ids.Xenon, ids.Yttrium] },
    revive: Object.entries(NAMES).map(([id, name]) => ({ id, name, icon: null, color: null, folded: folded.includes(id) ? 1 : 0 }))
  }
  await v('groups:arrange', 'article', layout)
  for (const [id] of Object.entries(NAMES)) await v('groups:set', id, { folded: folded.includes(id) })
  await c.go('articles')
  await wait(900)
}

/** Which group each page and group sits in now, from what is saved. */
async function where() {
  const list = await v('groups', 'article')
  const out = {}
  for (const one of list) {
    out[`g:${one.id}`] = one.parent ?? null
    for (const id of one.members) out[id] = one.id
  }
  return out
}
const order = () => h.evaluate(() => [...document.querySelectorAll('[data-row]:not([data-lifted] *), [data-group-row]')].sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top).map((one) => (one.dataset.groupRow ? `g:${one.dataset.groupRow}` : one.textContent.replace(/(now|\d+(mo|[dwyhm])).*$/, '').trim())))

/** What the screen says just before letting go. */
const hint = () => h.evaluate(() => {
  const box = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return { top: Math.round(r.top), bottom: Math.round(r.bottom) } }
  const lit = [...document.querySelectorAll('[data-group-block][data-landing]')]
  const panel = (block) => {
    const parts = Object.fromEntries([...block.querySelectorAll(':scope > [data-panel] > [data-panel-part]')].map((one) => [one.dataset.panelPart, box(one)]))
    return parts.top && { top: parts.top.top, bottom: parts.bottom.bottom, seams: [Math.abs(parts.top.bottom - parts.middle.top), Math.abs(parts.middle.bottom - parts.bottom.top)] }
  }
  return {
    label: document.querySelector('[data-drag-label]')?.textContent ?? '',
    target: document.querySelector("[data-aim]") ? `${document.querySelector('[data-aim]').dataset.sortableId} ${document.querySelector('[data-aim]').dataset.aim}` : '',
    parts: [...document.querySelectorAll('[data-group-block]')].map((one) => `${one.dataset.groupBlock}:${[...one.querySelectorAll(':scope > [data-panel] > [data-panel-part]')].map((p) => { const r = p.getBoundingClientRect(); return `${Math.round(r.top)}-${Math.round(r.bottom)}` }).join(',')}`).join(' '),
    refused: !!document.querySelector('[data-drag-label][data-refused]'),
    lit: lit.map((one) => one.dataset.groupBlock),
    panel: lit[0] ? panel(lit[0]) : null,
    room: box(document.querySelector('[data-room]')),
    line: box(document.querySelector('[data-drop-line]')),
    // Every group's panel, to see none comes apart mid-glide.
    seams: Math.max(0, ...[...document.querySelectorAll('[data-group-block]')].map((one) => Math.max(...(panel(one)?.seams ?? [0]))))
  }
})
const blockBox = (id) => h.evaluate((g) => { const r = document.querySelector(`[data-group-block="${g}"]`)?.getBoundingClientRect(); return r && { top: Math.round(r.top), bottom: Math.round(r.bottom) } }, id)
const near = (a, b, by = 4) => a !== undefined && b !== undefined && Math.abs(a - b) <= by

/**
 * Every frame from the lift until the list has settled after the drop, the
 * rows as drawn are checked: no two overlap, each lies inside its group's box
 * (the panel as drawn, its three parts), and no hole taller than a row opens
 * without the drop line in it. What is carried (the room, and a carried
 * group's own rows riding with it) is a row like the rest, but it is in no box
 * while it travels.
 */
const watch = () => h.evaluate(() => {
  const out = { frames: 0, overlap: [], outside: [], hole: [] }
  window.__geo = out
  const say = (list, text) => list.length < 3 && list.push(`${text} [f${out.frames}${document.documentElement.hasAttribute('data-dragging') ? ' carrying' : ' after'}]`)
  const name = (n) => (n.dataset.sortableId.startsWith('g:') ? n.dataset.sortableId : (n.textContent || '').slice(0, 14))
  const frame = () => {
    if (out.stop) return
    out.frames++
    const nodes = [...document.querySelectorAll('[data-sortable-id]')].filter((n) => !n.closest('aside') && n.getClientRects().length)
    const lifted = nodes.find((n) => n.querySelector(':scope > [data-room]'))
    // What shows: a row, or the room once it has faded in; a carried group's own rows ride hidden in the hand.
    // (A row fading in after the drop is still in its place, so it counts.)
    const rows = nodes.flatMap((n) => {
      const room = n.querySelector(':scope > [data-room]')
      if (n === lifted && (!room || Number(getComputedStyle(room).opacity) < 0.5)) return []
      const box = (room ?? n).getBoundingClientRect()
      // As much of it as shows: a group opening or closing cuts off what is still folded.
      const clip = n.closest('.overflow-hidden')?.getBoundingClientRect()
      const top = clip ? Math.max(box.top, clip.top) : box.top
      const bottom = Math.min(room ? box.top + box.height + 2 : box.bottom, clip ? clip.bottom : Infinity)
      return [{ n, name: name(n), top, bottom, riding: n === lifted }]
    }).filter((one) => one.bottom - one.top > 4).sort((a, b) => a.top - b.top)
    for (let i = 1; i < rows.length; i++) {
      const a = rows[i - 1]
      const b = rows[i]
      if (a.bottom - b.top > 1.5) say(out.overlap, `${a.name} over ${b.name} by ${Math.round(a.bottom - b.top)}`)
      const gap = b.top - a.bottom
      const lines = [...document.querySelectorAll('[data-drop-line]')].map((one) => one.getBoundingClientRect())
      // Taller than a row (53px here) and the air at a group's edge (up to 20px), and no line in it.
      if (gap > 73 && !lines.some((one) => one.top >= a.bottom - 2 && one.bottom <= b.top + 2)) say(out.hole, `${Math.round(gap)}px between ${a.name} and ${b.name}`)
    }
    for (const row of rows) {
      if (row.riding) continue
      const block = row.n.parentElement?.closest('[data-group-block]')
      // A group's own row sits in its own block.
      const own = row.n.dataset.sortableId.startsWith('g:') ? row.n.closest('[data-group-block]') : block
      if (!own) continue
      const parts = [...own.querySelectorAll(':scope > [data-panel] > [data-panel-part]')].map((one) => one.getBoundingClientRect())
      if (parts.length !== 3 || getComputedStyle(own.querySelector(':scope > [data-panel]')).opacity === '0') continue
      const top = parts[0].top
      const bottom = parts[2].bottom
      if (row.top < top - 1.5 || row.bottom > bottom + 1.5) say(out.outside, `${row.name} ${Math.round(row.top)}-${Math.round(row.bottom)} out of ${own.dataset.groupBlock} ${Math.round(top)}-${Math.round(bottom)}`)
    }
    requestAnimationFrame(frame)
  }
  requestAnimationFrame(frame)
})
const watched = () => h.evaluate(() => (window.__geo.stop = true, window.__geo))

/** Press on `from`, carry it to `at` of `to` as a hand would, watch the glide, and return the hint at rest. */
async function carry(from, to, at, rest = 0) {
  const a = await from.boundingBox()
  await h.mouse.move(a.x + 80, a.y + a.height / 2)
  await watch()
  await h.mouse.down()
  const b0 = await to.boundingBox()
  await h.mouse.move(a.x + 80, a.y + a.height / 2 + (b0.y + b0.height * at < a.y + a.height / 2 ? -8 : 8), { steps: 4 })
  await wait(120)
  // Aimed by where the row is while carrying (rows slide apart as it goes).
  const b = await to.boundingBox()
  await h.mouse.move(b.x + 80, b.y + b.height * at, { steps: 20 })
  let seams = 0
  let worst = ''
  for (let i = 0; i < 6; i++) {
    const one = await hint()
    if (one.seams > seams) (seams = one.seams, worst = one.parts)
    await wait(40)
  }
  // Settled, as a hand rests before letting go.
  await wait(300 + rest)
  const now = await hint()
  return { ...now, seams: Math.max(seams, now.seams), worst: worst || now.parts }
}

/**
 * One case: carry `from` to `at` of `to`, then check the hint against what
 * the drop did. `expect` is the words and the group it should name.
 */
async function drop(name, from, to, at, expect) {
  const carried = expect.key
  const before = await where()
  const seen = await carry(from, to, at, expect.rest)
  if (dir) await h.screenshot({ path: `${dir}/${name.replace(/\W+/g, '-')}.png` })
  check(`${name}: the pill says “${expect.label}”`, expect.label instanceof RegExp ? expect.label.test(seen.label) : seen.label === expect.label, `${seen.label} on ${seen.target}`)
  check(`${name}: the lit panel is ${expect.into ? NAMES[expect.into] : 'none'}`, JSON.stringify(seen.lit) === JSON.stringify(expect.lit ?? (expect.into ? [expect.into] : [])), JSON.stringify(seen.lit))
  check(`${name}: no panel comes apart while it glides`, seen.seams <= 1.5, `${seen.seams} ${seen.worst}`)
  if (!expect.refused && !expect.hidden) check(`${name}: the line is in the room`, seen.room && seen.line && seen.line.top >= seen.room.top && seen.line.bottom <= seen.room.bottom + 2, JSON.stringify([seen.room, seen.line]))
  await h.mouse.up()
  await wait(1300)
  const geo = await watched()
  check(`${name}: no two rows overlap, frame by frame`, geo.frames > 20 && !geo.overlap.length, `${geo.frames} frames ${geo.overlap.join('; ')}`)
  check(`${name}: every row stays inside its group's box`, !geo.outside.length, geo.outside.join('; '))
  check(`${name}: no hole opens without the drop line in it`, !geo.hole.length, geo.hole.join('; '))
  const after = await where()
  if (expect.refused) {
    check(`${name}: nothing changes`, JSON.stringify(after) === JSON.stringify(before))
    return
  }
  check(`${name}: it lands in ${expect.into ? NAMES[expect.into] : 'the top level'}`, (after[carried] ?? null) === expect.into, String(after[carried]))
  // Where the room was is where the row now is.
  if (expect.hidden) check(`${name}: nothing opens in the list for it`, !seen.room, JSON.stringify(seen.room))
  const land = expect.hidden ? null : await (carried.startsWith('g:') ? head(carried.slice(2)) : row(TITLES.find((t) => ids[t] === carried))).boundingBox()
  if (!expect.hidden) check(`${name}: it sits where the room was`, land && seen.room && near(Math.round(land.y), seen.room.top, 6), `${land && Math.round(land.y)} vs ${seen.room?.top}`)
  // A group carried is folded in the hand and opens again where it lands: its top edge is the hint's, its bottom grows.
  if (expect.into && seen.panel) {
    const real = await blockBox(expect.into)
    const group = carried.startsWith('g:')
    check(`${name}: the lit panel had the group's own edges`, real && near(seen.panel.top, real.top) && (group || near(seen.panel.bottom, real.bottom)), `${JSON.stringify(seen.panel)} vs ${JSON.stringify(real)}`)
  }
  if (expect.order) {
    const now = await order()
    const want = expect.order.map((t) => (t.startsWith('g:') ? t : t))
    const got = now.filter((t) => want.includes(t))
    check(`${name}: in the order the hint showed`, JSON.stringify(got) === JSON.stringify(want), got.join(' > '))
  }
}

try {
  await view('manual')
  await h.evaluate(() => localStorage.setItem('hint:own-order', '1'))
  // The sandbox's own pages out of sight, so the scene is the whole list.
  for (const tier of ['article', 'question']) await v('notes:archive', 'nuggets', (await v('items', tier)).map((one) => one.id), true)
  for (const title of TITLES) {
    ids[title] = await v('article:new')
    await v('item:save', ids[title], { title })
  }
  const K = (t) => ids[t]

  await scene()
  await drop('page into a subgroup', row('Loose one'), row('Notes'), 0.5, { key: K('Loose one'), label: 'Add to Group 2', into: 'g2', order: ['Notes', 'Loose one', 'Accounts'] })
  await scene()
  // The report's case: the loose page in Apple Notes carried up to the end of Group 2 lights Group 2 alone.
  await drop('loose page in a group up to the end of its subgroup', row('Remove account check'), row('Accounts'), 0.85, { key: K('Remove account check'), label: 'Move to Group 2', into: 'g2', order: ['Accounts', 'Remove account check'] })
  await scene()
  await drop('page out of a group to loose', row('Bed'), row('Loose one'), 0.85, { key: K('Bed'), label: 'Remove from Group 3', into: null, order: ['Loose one', 'Bed', 'Loose two'] })
  await scene()
  await drop('page between groups', row('Buy'), row('Yttrium'), 0.15, { key: K('Buy'), label: 'Move to Other', into: 'ot', order: ['Xenon', 'Buy', 'Yttrium'] })
  await scene()
  // The report's second case: reordering inside a group.
  await drop('reorder in a group', row('THE AGREEMENT'), row('Notes'), 0.85, { key: K('THE AGREEMENT'), label: 'Move here', into: 'g2', order: ['Notes', 'THE AGREEMENT', 'Accounts'] })
  await scene()
  await drop('reorder loose pages', row('Loose two'), row('Loose one'), 0.15, { key: K('Loose two'), label: 'Move here', into: null, order: ['Loose two', 'Loose one'] })
  await scene()
  // The report's first case: groups go one level deep, so Group 3 over Group 2's rows goes beside Group 2, and the hint shows that.
  await drop('subgroup over another subgroup', head('g3'), row('THE AGREEMENT'), 0.15, { key: 'g:g3', label: 'Move here', into: 'an', lit: ['an'], order: ['g:g3', 'g:g2'] })
  await scene()
  await drop('group into a group', head('ot'), row('Notes'), 0.5, { key: 'g:ot', label: 'Put inside Apple Notes / Notes', into: 'an' })
  await scene()
  await drop('group out to the top level', head('g3'), row('Loose two'), 0.85, { key: 'g:g3', label: 'Move out of Apple Notes / Notes', into: null, order: ['Loose two', 'g:g3'] })
  await scene()
  await drop('group reorder', head('ot'), head('an'), 0.15, { key: 'g:ot', label: 'Move here', into: null, order: ['g:ot', 'g:an'] })
  await scene()
  // Lifted, a group folds into one card: nothing of its own is left to let go on, and over its own row nothing happens.
  await drop('group back on its own row', head('g3'), head('g3'), 0.5, { key: 'g:g3', label: '', refused: true })
  await scene()
  await carry(head('g3'), head('g3'), 0.5)
  check('a group lifted folds into one card', await h.locator('[data-group-block="g3"] button[data-row]').count() === 0)
  await h.mouse.up()
  await wait(900)
  check('and opens again where it is let go', await h.locator('[data-group-block="g3"] button[data-row]').count() === 3)
  await scene({ folded: ['ot'] })
  await drop('page onto a folded group', row('Loose one'), head('ot'), 0.5, { key: K('Loose one'), label: 'Add to Other', into: 'ot', rest: 900 })
  await scene()
  await drop('to the very top of the list', row('Loose two'), head('an'), 0.1, { key: K('Loose two'), label: 'Move here', into: null, order: ['Loose two', 'g:an'] })
  await scene()
  await drop('to the very bottom of the list', row('Accounts'), row('Loose two'), 0.9, { key: K('Accounts'), label: 'Remove from Group 2', into: null, order: ['Loose two', 'Accounts'] })

  // Esc mid-drag: everything goes back, nothing saved, still on the list.
  await scene()
  const was = await where()
  const wasOrder = await order()
  await carry(row('Loose one'), row('Notes'), 0.5)
  await h.keyboard.press('Escape')
  await wait(500)
  await h.mouse.up()
  await wait(900)
  if (dir) await h.screenshot({ path: `${dir}/esc.png` })
  check('Esc mid-drag: nothing is saved', JSON.stringify(await where()) === JSON.stringify(was))
  check('and every row is back where it was', JSON.stringify(await order()) === JSON.stringify(wasOrder))
  check('and no room, line or lit panel is left', await h.locator('[data-room], [data-drop-line], [data-landing]').count() === 0)
  check('and the list is still on show', await head('an').count() === 1)

  // Sorted by Newest, as in the report: a move keeps the order you saw and switches to "Custom order".
  await view('newest')
  await h.reload()
  await wait(1800)
  await scene()
  const seenFirst = await order()
  const g2 = seenFirst.filter((t) => ['THE AGREEMENT', 'Notes', 'Accounts'].includes(t))
  const mover = g2[0]
  const target = g2[1]
  await drop('reorder in a group while sorted by Newest', row(mover), row(target), 0.85, { key: K(mover), label: 'Move here · Custom order', into: 'g2', order: [target, mover, g2[2]] })
  const sort = await h.evaluate(() => JSON.parse(localStorage.getItem('view:article') ?? '{}').sort)
  check('and the list now keeps your own order', sort === 'manual', sort)
  check('no errors on the page', c.errors.length === 0, c.errors.slice(0, 3).join(' | '))
} finally { await c.close() }
done()
