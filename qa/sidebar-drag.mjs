// Any sidebar row goes anywhere: dragged into another block, it joins that block.
// A line shows where it will land; letting go puts it there, on screen and saved
// (sidebarOrder plus sidebarGroups), and it holds after a restart. Over Pinned
// there is no line, the pointer and the lifted row say no, and it goes back.
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/sidebar-drag.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const { check, done } = checks()
const NATURAL = { inbox: 'Write', home: 'Write', day: 'Write', articles: 'Write', nuggets: 'Write', review: 'Write', today: 'Write', calendar: 'Write' }
const ID = { Inbox: 'inbox', Home: 'home', Journal: 'day', Pages: 'articles', Gems: 'nuggets', Review: 'review', Tasks: 'today', Calendar: 'calendar', Bin: 'discarded', Lookups: 'lookups', Tags: 'tags' }

/** Each block as drawn: its key and the rows' names, top to bottom. */
const blocks = (h) => h.evaluate(() => [...document.querySelectorAll('aside nav [data-drop-block]')].map((one) => ({
  key: one.getAttribute('data-drop-block'),
  rows: [...one.querySelectorAll('[data-sortable-id]')].map((row) => row.getAttribute('data-sortable-id'))
})))
const flat = (all) => all.map((one) => `${one.key}: ${one.rows.join(' ')}`).join(' | ')
const box = (h, id) => h.evaluate((id) => {
  const r = document.querySelector(`aside nav [data-sortable-id="${id}"]`)?.getBoundingClientRect()
  return r && { x: r.left + r.width / 2, y: r.top + r.height / 2, top: r.top, bottom: r.bottom }
}, id)

/** Carries `id` to height `y`, reads what the sidebar shows just before letting go, then lets go. */
async function carry(h, id, y) {
  const from = await box(h, id)
  await h.mouse.move(from.x, from.y)
  await h.mouse.down()
  await h.mouse.move(from.x, from.y + (y > from.y ? 8 : -8), { steps: 3 })
  await h.mouse.move(from.x, y, { steps: 14 })
  await h.waitForTimeout(250)
  const shown = await h.evaluate(() => ({
    line: document.querySelector('[data-drop-line]')?.getAttribute('data-drop-line') ?? null,
    refused: document.documentElement.hasAttribute('data-drag-refused'),
    said: document.querySelector('[data-drop-refused]')?.textContent ?? '',
    cursor: getComputedStyle(document.body).cursor
  }))
  await h.mouse.up()
  await h.waitForTimeout(900)
  return shown
}

/** The drop the line promised, checked on screen and in what was saved. */
async function lands(c, name, id, y) {
  const before = await blocks(c.h)
  const shown = await carry(c.h, id, y)
  check(`${name}: a line shows where it goes`, !!shown.line && !shown.refused, JSON.stringify(shown))
  if (!shown.line) return
  const [block, next] = shown.line.split(':')
  const after = await blocks(c.h)
  const into = after.find((one) => one.key === block)
  const at = into?.rows.indexOf(id) ?? -1
  const right = at >= 0 && (next ? into.rows[at + 1] === next : at === into.rows.length - 1)
  check(`${name}: it lands where the line was (${shown.line})`, right, `${flat(before)}  ->  ${flat(after)}`)
  const s = await c.v('settings')
  const savedBlock = s.sidebarGroups?.[id] ?? NATURAL[id] ?? 'rest'
  const order = s.sidebarOrder ?? []
  const savedOrder = after.flatMap((one) => one.rows).filter((one) => order.includes(one))
  check(`${name}: saved in that block and that order`, savedBlock === block && JSON.stringify(savedOrder) === JSON.stringify(order.filter((one) => savedOrder.includes(one))), `${savedBlock}; ${order.join(' ')}`)
}

let c = await sandbox({ width: 1100, height: 900 })
let held = null
try {
  await c.v('settings:set', { sidebarOrder: [], sidebarGroups: {}, sidebarShown: null })
  await c.h.reload(); await c.h.waitForTimeout(2200)
  console.log('at start:', flat(await blocks(c.h)))

  // 1. Bin above Home: from the last block into the first.
  await lands(c, 'Bin above Home', 'discarded', (await box(c.h, 'home')).top + 2)
  // 1b. And back into the block it emptied.
  const rest = await c.h.evaluate(() => document.querySelector('aside nav [data-drop-block="rest"]')?.getBoundingClientRect().top ?? null)
  if (rest !== null) await lands(c, 'Bin back into its emptied block', 'discarded', rest)
  // 2. Calendar above Inbox: from Do to the very top.
  await lands(c, 'Calendar above Inbox', 'calendar', (await box(c.h, 'inbox')).top + 2)
  // 3. Back to the usual, then Inbox below Calendar: from the top to Do's end.
  await c.v('settings:set', { sidebarOrder: [], sidebarGroups: {} }); await c.h.waitForTimeout(900)
  await lands(c, 'Inbox below Calendar', 'inbox', (await box(c.h, 'calendar')).bottom - 2)
  // 4. Lookups, shown, into the top block.
  const shownNow = (await c.v('settings')).sidebarShown ?? ['inbox', 'home', 'day', 'articles', 'nuggets', 'review', 'today', 'calendar', 'tags', 'discarded']
  await c.v('settings:set', { sidebarShown: [...new Set([...shownNow, 'lookups'])] }); await c.h.waitForTimeout(1200)
  await lands(c, 'Lookups into the top block', 'lookups', (await box(c.h, 'articles')).top + 2)

  // 5. Onto Pinned: refused, shown, and back where it was.
  const pinned = await c.h.evaluate(() => { const r = document.querySelector('aside nav [data-side-drop="pinned"]')?.getBoundingClientRect(); return r && r.height > 0 ? r.top + r.height / 2 : null })
  check('there is a Pinned part to try', pinned !== null)
  if (pinned !== null) {
    const was = await blocks(c.h)
    const wasSaved = await c.v('settings')
    const shown = await carry(c.h, 'home', pinned)
    check('over Pinned: no line, the page is marked refused', !shown.line && shown.refused, JSON.stringify(shown))
    check('over Pinned: the pointer says no', shown.cursor === 'not-allowed', shown.cursor)
    check('over Pinned: the lifted row says why', /can’t go in Pinned/.test(shown.said), shown.said)
    const now = await c.v('settings')
    check('let go over Pinned: nothing moved, on screen or saved', flat(await blocks(c.h)) === flat(was) && JSON.stringify(now.sidebarOrder) === JSON.stringify(wasSaved.sidebarOrder) && JSON.stringify(now.sidebarGroups) === JSON.stringify(wasSaved.sidebarGroups), flat(await blocks(c.h)))
  }

  // 6. Customize lists the same order.
  held = await blocks(c.h)
  await c.h.locator('aside nav [data-sortable-id="home"] button[data-side-row]').first().click({ button: 'right' }); await c.h.waitForTimeout(500)
  await c.h.locator('[role=menu] [role=menuitem]', { hasText: 'Customize the sidebar…' }).first().click(); await c.h.waitForTimeout(1000)
  const listed = await c.h.evaluate(() => [...document.querySelectorAll('[data-show-part]')].map((part) => ({ key: part.getAttribute('data-show-part'), rows: [...part.querySelectorAll('[data-show-row]')].map((one) => one.getAttribute('data-show-row')) })))
  const drawn = held.map((one) => `${one.key}: ${one.rows.join(' ')}`)
  const onScreen = (id) => held.some((b) => b.rows.includes(id))
  const same = held.filter((one) => one.rows.length).every((one) => listed.find((p) => p.key === one.key)?.rows.filter(onScreen).join(" ") === one.rows.join(" "))
  check('Customize lists the same blocks and order', same, `${drawn.join(' | ')}  vs  ${listed.map((one) => `${one.key}: ${one.rows.join(' ')}`).join(' | ')}`)
  await c.h.keyboard.press('Escape'); await c.h.waitForTimeout(400)
  check('no page errors', !c.errors.some((one) => one.includes('PAGEERROR')), c.errors.join(' | '))
} finally {
  await c.close()
}

// 7. After a restart the order holds.
c = await sandbox({ width: 1100, height: 900 })
try {
  await c.h.waitForTimeout(2200)
  const now = await blocks(c.h)
  check('after a restart, the same blocks and order', held && flat(now) === flat(held), `${flat(now)}  vs  ${held && flat(held)}`)
} finally {
  await c.close()
}
done()
