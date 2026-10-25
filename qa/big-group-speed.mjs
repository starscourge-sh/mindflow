// A big group stays quick: 2,500 gems in one group, as a list, draws only the
// rows near the screen, and ⌘A, folding, unfolding, "Remove from group" on all
// of them and scrolling to the end each leave no long task over 100 ms and
// draw their next frame within 200 ms.
//
//   npx electron-vite build --outDir out-v
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-v/main/index.js HALIGTREE_QA_AWAY=1 node qa/big-group-speed.mjs
//
// On a copy of a real book: QA_ARGS= QA_DATA=<folder with haligtree.db>; its biggest gems group is used.
import { DatabaseSync } from 'node:sqlite'
import { randomUUID } from 'crypto'
import { join } from 'path'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'
const SANDBOX = process.env.QA_ARGS.includes('--sandbox')
const N = 2500

const results = []
const check = (name, ok, detail = '') => { results.push(!!ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`) }

if (SANDBOX) {
  // The sandbox's book made once, then 2,500 gems written into it while the app is shut (qa/big-book.mjs does the same).
  const first = await sandbox({ width: 1300, height: 900, seeded: true })
  await first.v('onboarding:set', { welcomed: new Date().toISOString(), newsSeen: true, pageHints: false })
  await first.close()
  const db = new DatabaseSync(join(process.env.QA_DATA, 'sandbox', 'haligtree.db'))
  db.exec('begin')
  const add = db.prepare("insert into nuggets (id, tier, kind, title, body, created_at, updated_at) values (?, 'nugget', 'note', '', ?, ?, ?)")
  for (let i = 0; i < N; i++) {
    const at = new Date(Date.now() - i * 60000).toISOString()
    add.run(randomUUID(), JSON.stringify({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: `Big gem ${i + 1}` }] }] }), at, at)
  }
  db.exec('commit')
  db.close()
}

const c = await sandbox({ width: 1300, height: 900, seeded: false })
const { h } = c
try {
  await c.v('onboarding:set', { welcomed: new Date().toISOString(), newsSeen: true, pageHints: false })
  if (SANDBOX) {
    // Grouped through the app, as a drag or ⌃⌘N does it.
    const items = await c.v('items', 'nugget')
    const ids = (items.items ?? items).map((one) => one.id)
    await c.v('groups:arrange', 'nugget', { top: ["g:big"], groups: { big: ids }, make: { id: 'big', name: 'Obsidian' } })
  }
  const groups = await c.v('groups', 'nugget')
  const big = groups.sort((a, b) => b.members.length - a.members.length)[0]
  console.log('group', big?.name, big?.members.length)
  await h.evaluate(() => localStorage.setItem('view:nugget', JSON.stringify({ sort: 'manual', group: 'none', filter: {}, density: 'list' })))
  await h.reload()
  await h.waitForTimeout(2500)
  await c.go('nuggets')
  await h.waitForTimeout(2500)
  // The group open, to start.
  if ((await h.locator(`[data-group-row="${big.id}"]`).getAttribute('aria-expanded')) !== 'true') { await h.locator(`[data-group-row="${big.id}"]`).click(); await h.waitForTimeout(800) }
  await h.evaluate(() => {
    window.__lt = []
    new PerformanceObserver((list) => list.getEntries().forEach((one) => window.__lt.push(Math.round(one.duration)))).observe({ type: 'longtask', buffered: false })
  })
  const rows = () => h.locator('[data-page="nuggets"] [data-row]').count()
  const shown = await rows()
  check('only rows near the screen are drawn', shown > 0 && shown < 150, `${shown} rows of ${big.members.length}`)
  // From the action (a key, a click, or now) to its next frame drawn, and the longest task in the second after.
  const arm = () => h.evaluate(() => {
    window.__lt.length = 0
    window.__t = null
    window.__settle = null
    const start = () => {
      if (window.__t !== null) return
      window.__t = performance.now()
      requestAnimationFrame(() => setTimeout(() => (window.__settle = Math.round(performance.now() - window.__t)), 0))
    }
    for (const type of ['keydown', 'click']) document.addEventListener(type, start, { capture: true, once: true })
    window.__start = start
  })
  const measure = async (name) => {
    await h.waitForTimeout(1200)
    const { settle, tasks } = await h.evaluate(() => ({ settle: window.__settle, tasks: window.__lt.splice(0) }))
    const worst = Math.max(0, ...tasks)
    check(`${name}: no long task over 100 ms, next frame under 200 ms`, settle !== null && settle < 200 && worst <= 100, `next frame ${settle} ms, long tasks [${tasks.join(', ')}]`)
    return { settle, tasks }
  }
  const scroller = () => h.evaluate(() => {
    let box = document.querySelector('[data-page="nuggets"] [data-row]')
    while (box && !/auto|scroll/.test(getComputedStyle(box).overflowY)) box = box.parentElement
    return box ? box.scrollHeight : 0
  })
  const scrollTo = (where) => h.evaluate((where) => {
    window.__start()
    let box = document.querySelector('[data-page="nuggets"] [data-row]')
    while (box && !/auto|scroll/.test(getComputedStyle(box).overflowY)) box = box.parentElement
    box.scrollTop = where === 'end' ? box.scrollHeight : 0
  }, where)

  await arm(); await scrollTo('end'); await measure('scrolling to the end')
  const last = await h.evaluate(() => [...document.querySelectorAll('[data-page="nuggets"] [data-row]')].pop()?.getBoundingClientRect().bottom ?? 0)
  check('at the end, the last rows are drawn on screen', last > 0 && last < 900, `${Math.round(last)}px, list ${await scroller()}px tall, ${await rows()} rows drawn`)
  await scrollTo('top'); await h.waitForTimeout(500)

  await h.locator('[data-page="nuggets"] [data-row]').first().click()
  await h.waitForTimeout(400)
  // The list's keys, not the note's editor, take ⌘A.
  await h.evaluate(() => document.activeElement?.blur())
  await arm(); await h.keyboard.press('Meta+a'); await measure('⌘A, select all')
  const all = (await c.v('items', 'nugget')).length
  const said = await h.evaluate(() => /([\d,]+)\s*selected/.exec(document.querySelector('[data-page="nuggets"]')?.textContent ?? '')?.[1] ?? 'none')
  // The count rolls: mid-roll each figure can show twice, old and new.
  const n = all.toLocaleString('en-US')
  check('⌘A picked every gem', said === n || said === n.replace(/./g, '$&$&'), `${said} selected of ${all}`)
  await h.keyboard.press('Escape'); await h.waitForTimeout(400)

  const fold = h.locator(`[data-group-row="${big.id}"]`)
  await arm(); await fold.click(); await measure('fold')
  const inGroup = () => h.locator(`[data-group-block="${big.id}"] [data-row]`).count()
  check('folded, its rows leave', (await inGroup()) === 0, `${await inGroup()} rows`)
  await arm(); await fold.click(); await measure('unfold')
  check('unfolded, rows near the screen come back', (await inGroup()) > 5 && (await rows()) < 150, `${await inGroup()} rows`)

  // The keys reach rows not drawn yet: G to the last, gg back to the first, ↓ a step at a time.
  const cursorRow = () => h.evaluate(() => {
    const row = document.querySelector('[data-page="nuggets"] [data-cursor]')
    const box = row?.getBoundingClientRect()
    return row ? { text: row.textContent.slice(0, 40), top: Math.round(box.top), bottom: Math.round(box.bottom) } : null
  })
  const inView = (one) => !!one && one.top >= 0 && one.bottom <= 900
  await h.locator('[data-page="nuggets"] [data-row]').first().click()
  await h.keyboard.press('Escape'); await h.waitForTimeout(300)
  await h.evaluate(() => document.activeElement?.blur())
  await h.keyboard.press('Shift+G'); await h.waitForTimeout(700)
  const atEnd = await cursorRow()
  check('G goes to the last row and shows it', inView(atEnd) && (await h.evaluate(() => { let box = document.querySelector('[data-page="nuggets"] [data-row]'); while (box && !/auto|scroll/.test(getComputedStyle(box).overflowY)) box = box.parentElement; return box.scrollTop + box.clientHeight >= box.scrollHeight - 2 })), JSON.stringify(atEnd))
  // (gg is the app's own G then G, which goes to another page: home.tsx takes it first.) ↑ a hundred times climbs past the loose rows into the group.
  for (let i = 0; i < 100; i++) await h.keyboard.press('ArrowUp')
  await h.waitForTimeout(700)
  const atTop = await cursorRow()
  const inGroupRow = await h.evaluate((id) => !!document.querySelector(`[data-group-block="${id}"] [data-cursor]`), big.id)
  check('↑ a hundred times climbs into the group and shows the row', inView(atTop) && (!SANDBOX || inGroupRow), JSON.stringify(atTop))
  for (let i = 0; i < 40; i++) await h.keyboard.press('ArrowDown')
  await h.waitForTimeout(600)
  const stepped = await cursorRow()
  check('↓ forty times into the group keeps the row on screen', inView(stepped) && stepped.text !== atTop?.text, JSON.stringify(stepped))
  await h.evaluate(() => { let box = document.querySelector('[data-page="nuggets"] [data-row]'); while (box && !/auto|scroll/.test(getComputedStyle(box).overflowY)) box = box.parentElement; box.scrollTop = 0 })
  await h.waitForTimeout(500)

  // Renaming the group from its row.
  await fold.dblclick(); await h.waitForTimeout(400)
  const field = h.locator('input[aria-label="Group name"]')
  check('a double click opens the name for writing', await field.count())
  await field.fill('Obsidian vault'); await field.press('Enter'); await h.waitForTimeout(800)
  check('renamed, the name is kept', (await c.v('groups', 'nugget')).find((one) => one.id === big.id)?.name === 'Obsidian vault')

  // "New note in group" from the group's menu.
  const before = (await c.v('groups', 'nugget')).find((one) => one.id === big.id).members.length
  await h.locator(`[data-group-row="${big.id}"]`).click({ button: 'right' }); await h.waitForTimeout(400)
  await h.getByRole('menuitem', { name: 'New note in group' }).click(); await h.waitForTimeout(1200)
  const grown = (await c.v('groups', 'nugget')).find((one) => one.id === big.id).members.length
  check('"New note in group" adds a note to it', grown === before + 1, `${before} → ${grown}`)
  await h.keyboard.press('Escape'); await h.waitForTimeout(300)
  await h.evaluate(() => document.activeElement?.blur())
  await h.keyboard.press('Escape'); await h.waitForTimeout(500)

  // Carried to the list's bottom edge, the list scrolls itself and rows further down are drawn to aim at.
  await h.evaluate(() => { let box = document.querySelector('[data-page="nuggets"] [data-row]'); while (box && !/auto|scroll/.test(getComputedStyle(box).overflowY)) box = box.parentElement; box.scrollTop = 0 })
  await h.waitForTimeout(800)
  const handle = h.locator(`[data-group-block="${big.id}"] [data-sortable-id]:not([data-sortable-id^="g:"])`).nth(2)
  const from = await handle.boundingBox()
  const seen = () => h.evaluate(() => [...document.querySelectorAll('[data-sortable-id]')].map((one) => one.dataset.sortableId).join())
  const was = await seen()
  const top0 = await h.evaluate(() => { let box = document.querySelector('[data-page="nuggets"] [data-row]'); while (box && !/auto|scroll/.test(getComputedStyle(box).overflowY)) box = box.parentElement; return box.scrollTop })
  await h.mouse.move(from.x + 80, from.y + from.height / 2); await h.mouse.down()
  await h.mouse.move(from.x + 80, from.y + 30, { steps: 4 })
  const edge = await h.evaluate(() => { let box = document.querySelector('[data-page="nuggets"] [data-row]'); while (box && !/auto|scroll/.test(getComputedStyle(box).overflowY)) box = box.parentElement; return box.getBoundingClientRect().bottom - 8 })
  await h.mouse.move(from.x + 80, edge, { steps: 10 })
  await h.waitForTimeout(1500)
  const top1 = await h.evaluate(() => { let box = document.querySelector('[data-page="nuggets"] [data-row]'); while (box && !/auto|scroll/.test(getComputedStyle(box).overflowY)) box = box.parentElement; return box.scrollTop })
  const now = await seen()
  const label = await h.evaluate(() => document.querySelector('[data-drag-label]')?.textContent ?? '')
  check('carried to the edge, the list scrolls and draws rows further down to aim at', top1 > top0 + 200 && now !== was && !!label, `scrolled ${top0} → ${top1}, says "${label}"`)
  await h.keyboard.press('Escape'); await h.mouse.up(); await h.waitForTimeout(800)
  await h.evaluate(() => { let box = document.querySelector('[data-page="nuggets"] [data-row]'); while (box && !/auto|scroll/.test(getComputedStyle(box).overflowY)) box = box.parentElement; box.scrollTop = 0 })
  await h.waitForTimeout(500)

  await h.locator('[data-page="nuggets"] [data-row]').first().click()
  await h.evaluate(() => document.activeElement?.blur())
  await h.keyboard.press('Meta+a'); await h.waitForTimeout(800)
  await h.locator('[data-page="nuggets"] [data-row]').nth(2).click({ button: 'right' })
  await h.waitForTimeout(500)
  const remove = h.getByRole('menuitem', { name: 'Remove from group' })
  // A line picked with the pointer blinks twice (about 150 ms, as the Finder's menus do: menu-blink.ts) and is then
  // clicked again for real. Settled once the group's row has gone from the page, timed from that real click.
  await arm()
  await h.evaluate(() => {
    let clicks = 0
    window.__real = null
    // The group stays, a folder emptied: settled once it says so.
    const look = () => (!document.querySelector('[data-group-empty]') ? requestAnimationFrame(look) : (window.__gone = Math.round(performance.now() - window.__real)))
    document.addEventListener('click', () => ++clicks === 2 && ((window.__real = performance.now()), requestAnimationFrame(look)), { capture: true })
  })
  await remove.click()
  await measure('"Remove from group" on all, its next frame')
  const blink = await h.evaluate(() => Math.round(window.__real - window.__t))
  check('"Remove from group" on all: the list redrawn with the group empty under 200 ms after the blink', (await h.evaluate(() => window.__gone ?? -1)) < 200, `${await h.evaluate(() => window.__gone ?? 'never')} ms after a ${blink} ms blink`)
  await h.waitForTimeout(800)
  const after = (await c.v('groups', 'nugget')).find((one) => one.id === big.id)
  check('the group stays, empty, every note out of it', after?.members.length === 0, after ? `${after.members.length} left` : 'gone')
} catch (error) {
  check('ran to the end', false, error.message.split('\n')[0])
} finally {
  await c.close()
}
console.log(`${results.filter(Boolean).length}/${results.length} passed`)
process.exit(results.every(Boolean) ? 0 : 1)
