// A page opened cold draws its list once, as it will stay: never a plain
// list that then sorts into groups, or a list that then gains a box above it.
// Each frame from the moment the page is asked for, the list's shape is
// written down (its rows in order, its group and kind heads, the boxes over
// it); the first shape with rows in it must be the one it settles on.
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-x/main/index.js MINDFLOW_QA_AWAY=1 node qa/no-flash.mjs
import { sandbox } from './sandbox-lib.mjs'
import { checks } from './harness.mjs'

const { check, done } = checks()
const c = await sandbox({ width: 1300, height: 900 })
const { h, send, v, electron } = c
const wait = (ms) => h.waitForTimeout(ms)
const PAGES = (process.env.PAGES ?? 'articles,nuggets,all,inbox,archived,bin,home,questions,goals,today,upcoming').split(',')

try {
  // Writing with a group of its own, as an imported book has: the case that flashed as a plain list first.
  const notes = []
  for (const title of ['Flash one', 'Flash two', 'Flash three']) { const id = await v('article:new'); await v('item:save', id, { title }); notes.push(id) }
  await v('groups:arrange', 'article', { top: ['g:nf', notes[2]], groups: { nf: notes.slice(0, 2) }, make: { id: 'nf', name: 'Drawn once' } })
  // A big book answers its second reads (groups, which captures became tasks) a beat after its notes: slowed here, as there.
  await electron.evaluate(({ ipcMain }, uneven) => {
    // UNEVEN=1: every read answers at its own speed, up to 300ms, the way a big book does.
    const names = uneven ? [...ipcMain._invokeHandlers.keys()].filter((one) => one.startsWith('vigil:')) : ['vigil:groups', 'vigil:tasks:sources']
    for (const name of names) {
      const was = ipcMain._invokeHandlers?.get(name)
      if (!was) continue
      ipcMain.removeHandler(name)
      ipcMain.handle(name, async (...args) => { await new Promise((ok) => setTimeout(ok, uneven ? Math.random() * 300 : 250)); return was(...args) })
    }
  }, !!process.env.UNEVEN)
  for (const page of PAGES) {
    // A cold open: nothing any page read before is remembered.
    await h.reload(); await wait(1800)
    await h.evaluate(() => {
      const shapes = []
      window.__shapes = shapes
      const shape = () => {
        const main = document.querySelector('main') ?? document.body
        const rows = [...main.querySelectorAll('[data-id]')].filter((one) => one.getBoundingClientRect().height > 0).slice(0, 12).map((one) => one.getAttribute('data-id'))
        const heads = [...main.querySelectorAll('[data-island-head], [data-group-row], [data-group-block]')].map((one) => one.getAttribute('data-island-head') ?? one.textContent.trim().slice(0, 30))
        const boxes = [...main.querySelectorAll('[data-made-chip], [data-snoozed-chip], [data-groups-note]')].map((one) => [...one.attributes].find((a) => a.name.startsWith('data-'))?.name)
        return JSON.stringify({ rows, heads, boxes })
      }
      const t0 = performance.now()
      const tick = () => {
        const now = shape()
        if (shapes.at(-1)?.s !== now) shapes.push({ s: now, at: Math.round(performance.now() - t0) })
        if (performance.now() - t0 < 3000) requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)
    })
    await send('view', page)
    await wait(3400)
    const shapes = await h.evaluate(() => window.__shapes)
    const drawn = shapes.filter((one) => JSON.parse(one.s).rows.length)
    const first = drawn[0]
    const last = shapes.at(-1)
    // Rows can grow as more are drawn (a long list fills in), but what was drawn first never changes place or loses its heads.
    const same = !first || (() => {
      const a = JSON.parse(first.s), b = JSON.parse(last.s)
      return JSON.stringify(a.heads) === JSON.stringify(b.heads) && JSON.stringify(a.boxes) === JSON.stringify(b.boxes) && a.rows.every((id, i) => b.rows[i] === id)
    })()
    check(`${page}: drawn once as it stays`, same, same ? `${drawn.length} shape(s)` : `first at ${first.at}ms ${first.s.slice(0, 160)} → at ${last.at}ms ${last.s.slice(0, 160)}`)
  }
  check('no page errors', !c.errors.length, c.errors.slice(0, 3).join(' | '))
} finally { await c.close() }
done()
