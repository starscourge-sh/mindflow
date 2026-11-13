// Nothing moves under the hand: a reminder that comes due while a row is carried pins itself, but its row lands in the
// sidebar's Pinned only once the row is let go (lib/haligtree.ts useLive holds a change met mid-carry). Held across
// the app's own one-minute look at reminders (src/main/haligtree.ts), the carry never let go.
//   QA_DATA=<a copy of the seeded sandbox> QA_ARGS=--sandbox QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/carry-holds-lists.mjs
import { sandbox } from './sandbox-lib.mjs'
import { checks } from './harness.mjs'
process.env.QA_ARGS ??= '--sandbox'

const { check, done } = checks()
const c = await sandbox({ width: 1400, height: 900 })
const { h, go } = c
const wait = (ms) => h.waitForTimeout(ms)

/** Every row of the sidebar on show, top to bottom, with where it is. */
const side = () => h.evaluate(() => [...document.querySelectorAll('aside [data-side-row]')].filter((el) => el.getBoundingClientRect().height > 0)
  .map((el) => ({ key: (el.getAttribute('data-side-note') ?? el.textContent ?? '').trim().slice(0, 30), top: Math.round(el.getBoundingClientRect().top) })))
const moved = (a, b) => a.filter((row) => { const now = b.find((one) => one.key === row.key); return !now || now.top !== row.top })

try {
  await go('articles'); await wait(2500)
  // A note to be reminded of, a few seconds from now: the next look at reminders pins it.
  const note = await h.evaluate(async () => (await window.api.captures.list()).find((one) => !one.pinnedAt && !one.remindAt && one.status === 'open' && (one.label ?? '').length > 3))
  check('a note to be reminded of', !!note, '')
  const label = (note?.label ?? '').trim().slice(0, 24)
  await h.evaluate(([id, at]) => window.api.haligtree('remind', 'captures', id, at), [note.id, new Date(Date.now() + 2000).toISOString()])
  const before = await side()
  // Carried: a page of Writing lifted and held over its own list, never let go.
  const row = h.locator('[data-id]').filter({ visible: true }).filter({ hasNot: h.locator('[data-id]') }).nth(2)
  const a = await row.boundingBox()
  await h.mouse.move(a.x + 200, a.y + a.height / 2)
  await h.mouse.down()
  await h.mouse.move(a.x + 200, a.y + a.height / 2 + 8, { steps: 3 })
  await h.mouse.move(a.x + 240, a.y + a.height / 2 + 30, { steps: 6 })
  await wait(300)
  const lifted = await h.evaluate(() => document.documentElement.hasAttribute('data-dragging'))
  check('a page of Writing is carried', lifted, '')
  // Up to a minute and a bit: until main has pinned it, then two seconds more for the sidebar to hear of it.
  const t0 = Date.now()
  let pinnedAt = null
  let shifts = []
  while (Date.now() - t0 < 70000) {
    await h.mouse.move(a.x + 240 + ((Date.now() / 500) % 2), a.y + a.height / 2 + 30)
    const now = await side()
    const off = moved(before, now)
    if (off.length && !shifts.length) shifts = [`${Math.round((Date.now() - t0) / 1000)}s in: ${off.slice(0, 3).map((one) => `${one.key} ${one.top} -> ${now.find((x) => x.key === one.key)?.top ?? 'gone'}`).join('; ')}`]
    if (!pinnedAt) pinnedAt = (await h.evaluate((id) => window.api.captures.get(id), note.id))?.pinnedAt ?? null
    if (pinnedAt && !shifts.length) { await wait(2000); const late = moved(before, await side()); if (late.length) shifts = [`after the pin: ${late.slice(0, 3).map((one) => one.key).join('; ')}`]; break }
    await wait(1000)
  }
  const still = await h.evaluate(() => document.documentElement.hasAttribute('data-dragging'))
  check(`the reminder came due and pinned itself, the row still in hand (${Math.round((Date.now() - t0) / 1000)} s held)`, !!pinnedAt && still, `pinned ${pinnedAt}, carrying ${still}`)
  check('while it is carried, no row of the sidebar moves', !!pinnedAt && !shifts.length, shifts.join(' | '))
  const shownWhile = (await side()).some((one) => one.key.includes(label) || one.key === note.id)
  // Let go with Esc: nothing dropped; then the pin lands.
  await h.keyboard.press('Escape'); await h.mouse.up(); await wait(1500)
  const after = await side()
  const shownAfter = after.some((one) => one.key.includes(label) || one.key === note.id)
  check(`once let go, the pinned reminder (“${label}”) is in the sidebar`, shownAfter, JSON.stringify(after.slice(0, 8)))
  check('and not before', !shownWhile, '')
  check('no page errors', !c.errors.length, c.errors.slice(0, 3).join(' | '))
} finally { await c.close() }
done()
