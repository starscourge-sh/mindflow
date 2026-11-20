// A carried tab is the tab itself (20 Nov): picked up, it rides along its row at its own height, the others slide apart
// to open the gap where it would land (each keeping its size, the row its height, nothing else in the window moving);
// down over the page the half of the pane it would open in is outlined ("Open on the right"); let go there, it opens
// there; Esc, or let go where nothing takes it, and it glides back to its own place. A pinned tab stays among pinned.
// Journeys: an everyday user reorders along the row; a power user splits by drag and cancels with Esc; a first-timer
// lets go over the sidebar by mistake. Frames every 50 ms, light and dark, to QA_SHOTS/tab-lift.
//   QA_DATA=<copy of the seeded sandbox> QA_ARGS=--sandbox QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/tab-lift.mjs
//   TAB_LIFT_FRAMES=only: the frames alone, no checks.
import { mkdirSync } from 'fs'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'

const shots = `${process.env.QA_SHOTS ?? process.env.QA_DATA}/tab-lift`
mkdirSync(shots, { recursive: true })
const { check, done } = checks()
const c = await sandbox({ width: 1400, height: 880 })
const { h, go, look } = c
const wait = (ms = 400) => h.waitForTimeout(ms)
const tabs = () => h.evaluate(() => [...document.querySelectorAll('[data-tab-row]')].map((row) => [...row.querySelectorAll('[data-tab]')].map((one) => ({ key: one.dataset.tab, title: one.dataset.dragTitle, pinned: one.hasAttribute('data-tab-pinned') }))))
const boxOf = (key) => h.locator(`[data-tab="${key}"]`).first().boundingBox()
const mid = (b) => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 })
// What the window shows mid-carry: the lifted tab, the card, the gap, each tab's place and size, and what must hold still.
const seen = () => h.evaluate(() => {
  const lifted = document.querySelector('[data-tab-lifted]')
  const card = document.querySelector('[data-split-card]')
  const gap = document.querySelector('[data-tab-gap]')
  const rect = (one) => one && (({ left, top, width, height }) => ({ left: Math.round(left), top: Math.round(top), width: Math.round(width), height: Math.round(height) }))(one.getBoundingClientRect())
  return {
    lifted: lifted && getComputedStyle(lifted).opacity === '1' ? rect(lifted) : null,
    card: card && Number(getComputedStyle(card.parentElement).opacity) > 0.5 ? rect(card) : null,
    gap: gap ? { at: Number(gap.getAttribute('data-tab-gap')), ...rect(gap) } : null,
    half: document.querySelector('[data-split-half]')?.getAttribute('data-split-half') ?? null,
    halfWords: document.querySelector('[data-split-half]')?.textContent ?? '',
    halfBox: rect(document.querySelector('[data-split-half]')),
    widths: [...document.querySelectorAll('[data-tab]')].map((one) => Math.round(one.offsetWidth)),
    row: rect(document.querySelector('[data-tabs]')),
    page: rect(document.querySelector('[data-pane-card]')),
    side: rect(document.querySelector('aside')),
    grabbing: getComputedStyle(document.elementFromPoint(window.__px ?? 0, window.__py ?? 0) ?? document.body).cursor
  }
})
// The pointer moved in small steps, a frame every 50 ms written as it goes (one per step).
let frame = 0
const carry = async (to, { steps = 14, film = '', each } = {}) => {
  const from = await h.evaluate(() => [window.__px ?? 0, window.__py ?? 0])
  for (let i = 1; i <= steps; i++) {
    const x = from[0] + ((to.x - from[0]) * i) / steps, y = from[1] + ((to.y - from[1]) * i) / steps
    await h.mouse.move(x, y); await h.evaluate(([x, y]) => ((window.__px = x), (window.__py = y)), [x, y])
    if (film) await h.screenshot({ path: `${shots}/${film}-${String(frame++).padStart(3, '0')}.png` })
    else await wait(50)
    if (each) await each(i)
  }
}
const press = async (at) => { await h.mouse.move(at.x, at.y); await h.evaluate(([x, y]) => ((window.__px = x), (window.__py = y)), [at.x, at.y]); await h.mouse.down() }
// Frames through a glide or a landing: one every 50 ms.
const film = async (name, ms = 400) => { for (let t = 0; t < ms; t += 50) { await h.screenshot({ path: `${shots}/${name}-${String(frame++).padStart(3, '0')}.png` }); await wait(20) } }
const only = process.env.TAB_LIFT_FRAMES === 'only'

try {
  await c.v('settings:set', { hintRate: 0 })
  await go('day')
  for (const page of ['calendar', 'tasks', 'captures']) { await h.locator('[data-tab-add]').first().click(); await wait(300); await go(page) }
  let row = (await tabs())[0]
  if (!only) check('four tabs in one pane to start', row.length === 4, JSON.stringify(row))

  for (const theme of only ? ['light', 'dark'] : ['light']) {
    await look(theme)
    frame = 0
    // --- 1. Everyday: the first tab carried along the row, slot by slot. The gap follows within one frame of each slot.
    row = (await tabs())[0]
    const first = row[0]
    const boxes = await Promise.all(row.map((one) => boxOf(one.key)))
    const before = await seen()
    await press(mid(boxes[0]))
    const late = []
    const shapes = []
    await carry({ x: boxes[3].x + boxes[3].width * 0.8, y: boxes[0].y + boxes[0].height / 2 }, {
      steps: 16, film: `row-${theme}`,
      each: async () => {
        // Where the gap should be, read off the row as laid out, then the gap read one frame later.
        const got = await h.evaluate(() => new Promise((done) => requestAnimationFrame(() => {
          const row = document.querySelector('[data-tab-row]')
          const all = [...row.querySelectorAll('[data-tab]')]
          const own = all.findIndex((one) => one.classList.contains('opacity-0'))
          const hole = all[own].offsetWidth + 4
          const origin = row.getBoundingClientRect().left - row.scrollLeft
          const mids = all.flatMap((one, at) => (at === own ? [] : [origin + one.offsetLeft - (at > own ? hole : 0) + one.offsetWidth / 2]))
          const want = mids.filter((m) => m < window.__px).length
          done({ want, gap: Number(document.querySelector('[data-tab-gap]')?.getAttribute('data-tab-gap') ?? -1) })
        })))
        if (got.want !== got.gap) late.push(got)
        shapes.push(await seen())
      }
    })
    if (!only) {
      check('along the row the gap is where it lands, one frame after the pointer reaches each slot', late.length === 0, JSON.stringify(late))
      check('the tab itself rides along the row, at the row, and the card is put away', shapes.every((one) => one.lifted && !one.card && Math.abs(one.lifted.top - before.row.top) < 30), JSON.stringify(shapes.map((one) => [one.lifted?.left, one.lifted?.top, !!one.card])))
      check('every tab keeps its size and the row its height', shapes.every((one) => JSON.stringify(one.widths) === JSON.stringify(before.widths) && one.row.height === before.row.height), JSON.stringify([before.widths, shapes.at(-1).widths, before.row, shapes.at(-1).row]))
      check('nothing else in the window moves', shapes.every((one) => JSON.stringify(one.page) === JSON.stringify(before.page) && JSON.stringify(one.side) === JSON.stringify(before.side)), JSON.stringify([before.page, shapes.at(-1).page]))
      check('the pointer is a grabbing hand all the way', shapes.every((one) => one.grabbing === 'grabbing'), shapes.map((one) => one.grabbing).join())
    }
    await h.mouse.up(); await film(`row-land-${theme}`, 300)
    row = (await tabs())[0]
    if (!only) check('let go at the far end: it lands there, the others in their order', row.at(-1).key === first.key && row.length === 4, JSON.stringify(row.map((one) => one.title)))

    // --- 2. Power user: down over the page's right half, the split preview; let go, a new pane on the right with it.
    const area = await h.locator('[data-split-area]').boundingBox()
    const moving = row[1]
    await press(mid(await boxOf(moving.key)))
    await carry({ x: area.x + area.width * 0.7, y: area.y + area.height * 0.5 }, { steps: 14, film: `split-${theme}` })
    const over = await seen()
    if (!only) check('over the page\'s right half: "Open on the right" outlines that half, the card under the pointer', over.half === 'right' && /Open on the right/.test(over.halfWords) && over.halfBox && over.halfBox.left >= area.x + area.width / 2 - 4 && !!over.card && !over.lifted, JSON.stringify(over))
    await carry({ x: area.x + area.width * 0.3, y: area.y + area.height * 0.5 }, { steps: 8, film: `split-left-${theme}` })
    if (!only) check('over the left half: "Open on the left"', (await seen()).half === 'left')
    if (only) {
      await h.keyboard.press('Escape'); await film(`esc-${theme}`, 350); await h.mouse.up(); await wait(300)
      continue
    }
    await carry({ x: area.x + area.width * 0.75, y: area.y + area.height * 0.5 }, { steps: 8 })
    await h.mouse.up(); await film(`split-land-${theme}`, 400)
    const panes = await tabs()
    check('let go over the right half: a new pane on the right with that tab', panes.length === 2 && panes[1].length === 1 && panes[1][0].key === moving.key, JSON.stringify(panes))

    // --- 3. Carried, then Esc: it glides back where it was, nothing moved.
    row = (await tabs())[0]
    const order = row.map((one) => one.key).join()
    const home = await boxOf(row[2].key)
    await press(mid(home))
    await carry({ x: home.x - 160, y: home.y + 6 }, { steps: 8 })
    await carry({ x: area.x + area.width * 0.6, y: area.y + 200 }, { steps: 6 })
    await h.keyboard.press('Escape'); await film(`esc-${theme}`, 350)
    const back = await seen()
    await h.mouse.up(); await wait(300)
    check('Esc: it glides back to its own place, the row as it was', (await tabs())[0].map((one) => one.key).join() === order && !back.lifted && !back.gap && !back.half, JSON.stringify([back, (await tabs())[0]]))

    // --- 4. First-timer: let go over the sidebar, where nothing takes it: it glides back.
    const side = await h.locator('aside').boundingBox()
    await press(mid(await boxOf(row[1].key)))
    await carry({ x: side.x + side.width / 2, y: side.y + side.height - 60 }, { steps: 12 })
    await h.mouse.up(); await film(`glide-${theme}`, 350)
    check('let go where nothing takes it: back where it was, nothing changed', (await tabs())[0].map((one) => one.key).join() === order && !(await seen()).lifted)
  }
  await look('light')
} catch (error) {
  check('ran to the end', false, String(error?.stack ?? error))
} finally {
  await c.close()
  if (!only) done()
}
