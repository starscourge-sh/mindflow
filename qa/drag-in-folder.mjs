// Dragging inside an open folder, its note open beside the list, as the user does: rows make way under the pointer, a group
// grows to take what is carried and draws back as it leaves, and the card's words name what really happens.
//
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox QA_SHOTS=/abs/dir node qa/drag-in-folder.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'

const { check, done } = checks()
const s = await sandbox({ width: 1400, height: 880 })
const { h, v, go, close } = s
const shots = process.env.QA_SHOTS
const wait = (ms) => h.waitForTimeout(ms)
const shot = async (name) => { if (shots) await h.screenshot({ path: `${shots}/${name}.png` }) }
const pump = async (n = 10) => { for (let i = 0; i < n; i++) { await h.screenshot(); await wait(30) } }
const rowSel = (title) => h.locator('[data-pane] [data-sortable-id]', { hasText: title }).first()
const read = () => h.evaluate(() => {
  const box = (one) => { if (!one) return null; const b = one.getBoundingClientRect(); return { t: Math.round(b.top), b: Math.round(b.bottom), h: Math.round(b.height) } }
  const group = [...document.querySelectorAll('[data-group-block]')].find((one) => one.getClientRects().length)
  const panel = group?.parentElement?.querySelector('[data-panel], [data-group-panel]') ?? group
  const room = document.querySelector('[data-drop-room]')
  const feet = [...document.querySelectorAll('[data-panel-part="bottom"]')].find((one) => one.getClientRects().length)?.getBoundingClientRect().bottom ?? 0
  return { feet: Math.round(feet), group: box(panel), block: box(group), room: box(room), roomIn: !!room && !!group?.contains(room), label: document.querySelector('[data-drag-label]')?.textContent ?? null, rows: Object.fromEntries([...document.querySelectorAll('[data-pane] [data-sortable-id]')].filter((one) => one.getClientRects().length).map((one) => [one.textContent.slice(0, 12), Math.round(one.getBoundingClientRect().top)])) }
})
try {
  await v('settings:set', { hintRate: 0 })
  await h.evaluate(() => localStorage.setItem('view:article', JSON.stringify({ sort: 'manual', group: 'none', filter: {}, density: 'list' })))
  const groups = await v('groups', 'article')
  const films = groups.find((one) => one.name === 'Films and books')
  const fresh = []
  for (const title of ['Row one', 'Row two', 'Row three', 'Row four', 'Row five']) { const id = await v('article:new'); await v('item:save', id, { title }); fresh.push(id) }
  const inFolders = new Set(groups.flatMap((one) => one.members))
  const loose = (await v('items', 'article')).filter((one) => !inFolders.has(one.id) && !fresh.includes(one.id) && !one.archivedAt).map((one) => one.id)
  await v('groups:arrange', 'article', { top: [...groups.filter((one) => !one.parent).map((one) => `g:${one.id}`), ...loose], groups: { [films.id]: [...fresh, ...films.members] } })
  await go('articles')
  await wait(800)
  await h.locator('[data-pane] [data-group-row], [data-pane] [data-row]', { hasText: 'Films and books' }).first().click()
  await wait(900)
  await rowSel('Row five').click()
  await wait(900)
  await shot('0-folder-and-note')
  // Row two rested on Row one's middle: a group in the folder.
  const a = await rowSel('Row two').boundingBox()
  const b = await rowSel('Row one').boundingBox()
  await h.mouse.move(a.x + 80, a.y + a.height / 2); await h.mouse.down()
  await h.mouse.move(a.x + 80, a.y + 10, { steps: 4 })
  await h.mouse.move(b.x + 80, b.y + b.height / 2, { steps: 8 })
  for (let i = 0; i < 12; i++) { await h.mouse.move(b.x + 80 + (i % 2), b.y + b.height / 2); await wait(120) }
  await h.mouse.up()
  await wait(1200)
  await h.keyboard.press('Escape')
  await wait(300)
  await shot('1-group-made')
  const still = await read()
  check('a group was made in the folder', !!still.block, JSON.stringify(still.block))
  const carry = async (title, to, name) => {
    const r = await rowSel(title).boundingBox()
    await h.mouse.move(r.x + 80, r.y + r.height / 2); await h.mouse.down()
    await h.mouse.move(r.x + 80, r.y + r.height / 2 + 10, { steps: 4 })
    const y = await to()
    const frames = []
    // Every frame the page really draws: the panel's foot, as a person sees it.
    const sampling = h.evaluate(() => new Promise((resolve) => {
      const out = []
      const start = performance.now()
      const step = () => {
        const foot = [...document.querySelectorAll('[data-panel-part="bottom"]')].find((one) => one.getClientRects().length)?.getBoundingClientRect().bottom
        out.push(foot)
        if (performance.now() - start < 1600) requestAnimationFrame(step)
        else resolve(out)
      }
      step()
    }))
    for (let i = 1; i <= 10; i++) { await h.mouse.move(r.x + 80, r.y + (y - r.y) * i / 10); await wait(25) }
    for (let i = 0; i < 14; i++) { await h.screenshot(shots ? { path: `${shots}/${name}-${String(i).padStart(2, '0')}.png` } : {}); await wait(10) }
    frames.push(...(await sampling))
    await pump(); const at = await read(); await shot(name)
    at.pointer = y
    return { at, frames }
  }
  const before = await read()
  const panel = (one) => one.feet ?? 0
  const box = (one) => one.room && one.feet && one.room.b <= one.feet + 1
  // In: from a loose row, over the group's first row.
  const inTo = async () => { const f = await rowSel('Row one').boundingBox(); return f.y + f.height * 0.85 }
  let { at, frames } = await carry('Row four', inTo, '2-into-group')
  console.log('in', JSON.stringify(at))
  check('carried into the group: the words name it', /Group|to /.test(at.label ?? '') && !/the group/.test(at.label ?? ''), at.label)
  check('in: the room opens under the pointer, the row there moves off', at.room && at.pointer >= at.room.t && at.pointer <= at.room.b, JSON.stringify([at.room, at.pointer]))
  check('carried into the group: room opens inside it', box(at), JSON.stringify([at.room, at.feet]))
  check('carried into the group: it grows to hold the row', panel(at) >= panel(before) + 30, `${panel(before)} to ${panel(at)}`)
  check('going in, the panel can be seen to overshoot and settle, 6px or more', Math.max(...frames) - panel(at) >= 6, `${Math.round(Math.max(...frames))} past ${panel(at)}, ${frames.length} frames`)
  await h.keyboard.press('Escape'); await h.mouse.up(); await wait(700)
  // Out: from inside the group, well below its edge.
  const outTo = async () => { const f = await rowSel('Row four').boundingBox(); return f.y + f.height * 0.2 }
  ;({ at, frames } = await carry('Row one', outTo, '3-out-of-group'))
  console.log('out', JSON.stringify(at))
  check('carried past the edge: the words say out, never "the group"', !/the group/.test(at.label ?? '') && /Remove|out/i.test(at.label ?? ''), at.label)
  check('out: the room opens under the pointer, the row there moves off', at.room && at.pointer >= at.room.t && at.pointer <= at.room.b, JSON.stringify([at.room, at.pointer]))
  check('carried past the edge: room opens outside the group', !!at.room && at.room.t >= at.feet, JSON.stringify([at.room, at.feet]))
  check('leaving, the panel can be seen to draw back past its place and settle, 4px or more', panel(at) - Math.min(...frames) >= 4, `${Math.round(Math.min(...frames))} under ${panel(at)}, ${frames.length} frames`)
  await h.keyboard.press('Escape'); await h.mouse.up(); await wait(700)
  // Inside a group: three rows in it, then each way along them.
  const place = await rowSel('Row two').boundingBox()
  const third = await rowSel('Row three').boundingBox()
  await h.mouse.move(third.x + 80, third.y + third.height / 2); await h.mouse.down()
  await h.mouse.move(third.x + 80, third.y + 10, { steps: 4 })
  await h.mouse.move(place.x + 80, place.y + place.height * 0.5, { steps: 8 })
  await wait(300); await h.mouse.up(); await wait(1100)
  for (const [title, over, part] of [['Row one', 'Row three', 0.2], ['Row one', 'Row two', 0.8], ['Row three', 'Row one', 0.2], ['Row two', 'Row one', 0.8]]) {
    const r = await carry(title, async () => { const f = await rowSel(over).boundingBox(); return f.y + f.height * part }, `5-${title}-${over}-${part}`.replace(/ /g, '-'))
    check(`in the group, ${title} over ${over} at ${part}: the room is under the pointer`, r.at.room && r.at.pointer >= r.at.room.t && r.at.pointer <= r.at.room.b, JSON.stringify([r.at.room, r.at.pointer, r.at.label]))
    await h.keyboard.press('Escape'); await h.mouse.up(); await wait(700)
  }
  // Along the list, both ways: whatever row it is over moves off, at any height on that row.
  for (const [title, over, part] of [['Row four', 'Row five', 0.2], ['Row four', 'Row five', 0.8], ['Row five', 'Row four', 0.2], ['Row five', 'Row four', 0.8]]) {
    const r = await carry(title, async () => { const f = await rowSel(over).boundingBox(); return f.y + f.height * part }, `4-${title}-${over}-${part}`.replace(/ /g, '-'))
    check(`along the list, ${title} over ${over} at ${part}: the room is under the pointer`, r.at.room && r.at.pointer >= r.at.room.t && r.at.pointer <= r.at.room.b, JSON.stringify([r.at.room, r.at.pointer]))
    await h.keyboard.press('Escape'); await h.mouse.up(); await wait(700)
  }
} finally {
  await close()
}
done()
