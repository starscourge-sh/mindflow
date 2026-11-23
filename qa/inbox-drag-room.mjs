// An everyday user puts a note in the Inbox where they want it: the second row, carried three rows down and let go.
// The user's screenshot (23 Nov): an empty filled box held the row's place, the carried card floated off to the right
// of the list, and a plain reorder brought up "Open on the left / right" at both edges while the window shrank.
// Read every 50 ms through the carry:
//   - no empty room: nothing in the list with a background fill, no words and a row's size
//   - the row itself under the pointer: its middle within 6 px of the pointer, its left edge with the list's rows
//   - no "Open on the left / right" while the pointer stays over the list, the window's main frame never scaled
// Then let go: the row stands after the three it passed, and the notice says so.
// Sandbox: QA_ARGS=--sandbox QA_DATA=<a copy of the seeded sandbox> QA_ENTRY=<build> HALIGTREE_QA_AWAY=1 node qa/inbox-drag-room.mjs
import { sandbox } from './sandbox-lib.mjs'
import { checks } from './harness.mjs'
process.env.QA_ARGS ??= '--sandbox'

const { check, done } = checks()
const c = await sandbox({ width: 1300, height: 860 })
const { h } = c
const wait = (ms) => h.waitForTimeout(ms)
try {
  await c.go('inbox'); await wait(900)
  // The rows in sight, top to bottom, as the list lays them out.
  const rows = () => h.evaluate(() => [...document.querySelectorAll('[data-pane] [data-sortable-id]')].map((one) => ({ id: one.dataset.sortableId, ...JSON.parse(JSON.stringify(one.getBoundingClientRect())) })).filter((one) => one.height > 0 && one.top > 100 && one.bottom < innerHeight - 60).sort((a, b) => a.top - b.top))
  const before = await rows()
  if (!check('the Inbox shows six rows to carry among', before.length >= 6, `${before.length} rows`)) throw new Error('too few rows')
  const order = () => h.evaluate(() => [...document.querySelectorAll('[data-pane] [data-sortable-id]')].map((one) => one.dataset.sortableId))
  const was = await order()
  const [, carried, , , last] = before
  const listLeft = Math.round(before[0].left)
  // Taken by its middle, as a person grabs a row, and carried to the lower part of the row three below it.
  const from = { x: carried.left + Math.min(200, carried.width / 2), y: carried.top + carried.height / 2 }
  const to = { x: from.x, y: last.top + last.height * 0.75 }
  const sample = (pointer) => h.evaluate(([px, py, row]) => {
    const seen = (one) => { if (!one.getClientRects().length) return false; for (let at = one; at; at = at.parentElement) if (+getComputedStyle(at).opacity < 0.05 || getComputedStyle(at).visibility === 'hidden') return false; return true }
    const list = document.querySelector('[data-pane] [data-sortable-id]')?.closest('[data-pane]')
    const filled = (one) => { const bg = getComputedStyle(one).backgroundColor; const m = bg.match(/[\d.]+/g); return !!m && (m.length < 4 || +m[3] > 0.02) }
    // A place held by nothing: a filled box about a row's size with no words and no picture in it.
    const rooms = [...(list?.querySelectorAll('*') ?? [])].filter((one) => {
      const r = one.getBoundingClientRect()
      return r.height >= row.height * 0.6 && r.height <= row.height * 1.6 && r.width >= row.width * 0.5 && filled(one) && !one.textContent.trim() && !one.querySelector('img, svg, canvas') && seen(one)
    }).map((one) => `${one.tagName.toLowerCase()}${[...one.attributes].filter((a) => a.name.startsWith('data-')).map((a) => `[${a.name}]`).join('')} ${Math.round(one.getBoundingClientRect().top)}`)
    // The row in hand as it is drawn: the row itself, or (before 23 Nov) the card carried for it.
    const self = document.querySelector('[data-sortable-id][data-held] > [data-carried-self]')
    const card = [...document.querySelectorAll('[data-carried-card]')].find(seen)
    const r = (self ?? card)?.getBoundingClientRect()
    const places = [...document.querySelectorAll('[data-split-zone], [data-split-half]')].filter(seen).map((one) => one.textContent.trim().slice(0, 30))
    const frame = document.querySelector('[data-split-area]')
    const scaled = frame ? new DOMMatrixReadOnly(getComputedStyle(frame).transform) : null
    return {
      rooms, places,
      what: self ? 'row' : card ? 'card' : 'none', mid: r ? Math.round((r.top + r.bottom) / 2 - py) : null, left: r ? Math.round(r.left) : null,
      scale: scaled ? Math.round(scaled.a * 1000) / 1000 : 1, inList: !!list
    }
  }, [pointer.x, pointer.y, { height: carried.height, width: carried.width }])
  await h.mouse.move(from.x, from.y); await h.mouse.down()
  const frames = []
  // About a second of carrying, read every 50 ms, then a few frames held still over the place.
  for (let i = 1; i <= 24; i++) {
    const t = Math.min(1, i / 18)
    const at = { x: from.x, y: from.y + (to.y - from.y) * t }
    await h.mouse.move(at.x, at.y)
    if (i > 2) frames.push({ i, at, ...(await sample(at)) })
    await wait(50)
  }
  const empty = frames.filter((one) => one.rooms.length)
  check('carried: no empty filled box holds a place in the list, in any frame', !empty.length, empty.slice(0, 3).map((one) => `frame ${one.i}: ${one.rooms.join(', ')}`).join(' | '))
  const off = frames.filter((one) => one.what !== 'row' || Math.abs(one.mid) > 6 || Math.abs(one.left - listLeft) > 2)
  check('carried: the row itself rides under the pointer (middle within 6 px, left edge with the list’s), in every frame', !off.length, off.slice(0, 3).map((one) => `frame ${one.i}: ${one.what}, middle ${one.mid} px off, left ${one.left} vs ${listLeft}`).join(' | '))
  const split = frames.filter((one) => one.places.length)
  check('carried inside the list: no “Open on the left / right” place comes up', !split.length, split.slice(0, 2).map((one) => `frame ${one.i}: ${one.places.join(', ')}`).join(' | '))
  const shrunk = frames.filter((one) => one.scale !== 1)
  check('carried inside the list: the window’s main frame is never scaled', !shrunk.length, shrunk.slice(0, 2).map((one) => `frame ${one.i}: scale ${one.scale}`).join(' | '))
  await h.mouse.up(); await wait(1200)
  const now = await order()
  const at = now.indexOf(carried.id)
  check('let go: the row stands just after the three it passed', at > 0 && now[at - 1] === last.id && was.join() !== now.join(), `${was.slice(0, 6).map((id) => id.slice(0, 6)).join(',')} -> ${now.slice(0, 6).map((id) => id.slice(0, 6)).join(',')}`)
  const said = await h.evaluate(() => [...document.querySelectorAll('[role=status]')].map((one) => one.textContent ?? '').filter((one) => /Undo/.test(one)))
  check('let go: a notice says it moved, with Undo', said.length === 1 && /^(Moved|Now in your own order)/.test(said[0]), said.join(' | ') || '(no notice)')
} catch (error) {
  check('the Inbox carry could be driven', false, String(error.message).split('\n')[0])
} finally {
  await h.mouse.up().catch(() => {})
  await c.close()
}
done()
