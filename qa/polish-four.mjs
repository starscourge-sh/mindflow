// Four small things: the "Thoughts on this note" heading folds by its words and
// says what the word means from a small i at its end; a sidebar row dragged
// across two places asks the trackpad for two taps; a Feed post's latest
// reply hangs off it plainly, dated at its end, with "Show all N replies"
// under it; and a Feed post carried to the window's right edge opens beside it.
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/polish-four.mjs
import { mkdirSync } from 'fs'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const SHOTS = process.env.SHOTS ?? '/private/tmp/claude-501/-Users-starscourge-Documents-forge-mindflow/703b99ba-c755-40e3-a385-896560d19061/scratchpad/briefs/shots/four'
mkdirSync(SHOTS, { recursive: true })
const { check, done } = checks()
const s = await sandbox({ width: 1400, height: 900 })
// Pages in the Feed are off to start (qa/feed-pages.mjs); these checks cover them too.
await s.v('settings:set', { feedPages: true })
const { h, v, go, send, errors, close, electron } = s
const wait = (ms = 600) => h.waitForTimeout(ms)
const paint = (name) => h.evaluate((n) => { localStorage.setItem('theme', n); window.dispatchEvent(new StorageEvent('storage', { key: 'theme' })); document.documentElement.classList.toggle('dark', n === 'dark') }, name)
const taps = () => electron.evaluate(() => globalThis.haligtreeTaps?.() ?? -1)
try {
  // 2. Taps while reordering the sidebar.
  const ids = await h.evaluate(() => [...document.querySelectorAll('aside nav [data-drop-block]')][0] && [...[...document.querySelectorAll('aside nav [data-drop-block]')][0].querySelectorAll('[data-sortable-id]')].map((one) => one.getAttribute('data-sortable-id')))
  const at = (id) => h.evaluate((id) => { const r = document.querySelector(`aside nav [data-sortable-id="${id}"]`).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, height: r.height } }, id)
  const from = await at(ids[0])
  const third = await at(ids[2])
  const before = await taps()
  await h.mouse.move(from.x, from.y)
  await h.mouse.down()
  await h.mouse.move(from.x, from.y + 8, { steps: 3 })
  await h.mouse.move(from.x, third.y + 2, { steps: 14 })
  await wait(300)
  const during = await taps()
  await h.mouse.up()
  await wait(900)
  check('dragging a sidebar row across two places asks for two taps', during - before === 2, `${before} -> ${during}`)

  // 1. The Thoughts heading.
  const feed = await v('feed')
  const replied = feed.posts.find((one) => one.type === 'nugget' && one.replies >= 2 && one.kind !== 'quote')
  await send('nugget', replied.id)
  await wait(1500)
  const group = h.locator('[data-details-group="Thoughts on this note"]')
  if (!(await group.count())) { await h.locator('button[aria-label="Details"]').first().click(); await wait(800) }
  const head = group.locator('button[aria-expanded]')
  const wasOpen = await head.getAttribute('aria-expanded')
  if (wasOpen === 'true') { await head.click(); await wait(400) }
  await group.locator('h2').click({ position: { x: 30, y: 6 } })
  await wait(500)
  check('clicking the Thoughts heading\'s words unfolds it', await head.getAttribute('aria-expanded') === 'true')
  check('and opens no definition', await h.locator('[data-word-note]').count() === 0)
  await h.mouse.move(5, 300)
  await wait(400)
  const info = group.locator('[data-term-info]')
  check('a small i sits at the heading\'s end', await info.count() === 1)
  await info.hover()
  await wait(900)
  const tip = await h.locator('[data-slot="tooltip-content"]').first().innerText().catch(() => '')
  check('pointing at the i says what the word means', tip.length > 10, tip)
  for (const name of ['light', 'dark']) {
    await paint(name)
    await wait(400)
    await info.hover()
    await wait(700)
    const box = await group.boundingBox()
    await h.screenshot({ path: `${SHOTS}/thoughts-${name}.png`, clip: { x: Math.max(0, box.x - 40), y: Math.max(0, box.y - 20), width: Math.min(560, box.width + 300), height: 220 } })
  }
  await paint('light')

  // 3. The Feed's hanging reply.
  await go('feed')
  await wait(1200)
  const post = h.locator(`[data-feed-id="${replied.id}"]`)
  await post.scrollIntoViewIfNeeded()
  const latest = await post.locator('[data-feed-latest]').innerText().catch(() => '')
  check('the latest reply shows without "Your note"', latest.length > 0 && !/Your note/.test(latest), latest)
  check('its date is at its end', /·\s*(AI, )?[^·]+ago$|·\s*(AI, )?(today|yesterday|just now)$/i.test(latest.trim()) || /· .+$/.test(latest.trim()), latest)
  const all = await post.locator('[data-feed-replies]').innerText().catch(() => '')
  check('"Show all N replies" sits under it', /^Show all \d+ replies/.test(all), all)
  check('the old line under the action row is gone', !/replies/.test(await post.locator('[data-feed-history]').innerText().catch(() => '')))
  const empty = feed.posts.find((one) => one.type === 'nugget' && !one.replies && one.kind !== 'quote')
  if (empty) check('a post with no replies shows nothing there', await h.locator(`[data-feed-id="${empty.id}"] [data-feed-hanging]`).count() === 0)
  for (const name of ['light', 'dark']) {
    await paint(name)
    await wait(500)
    await post.scrollIntoViewIfNeeded()
    await post.screenshot({ path: `${SHOTS}/feed-reply-${name}.png` })
  }
  await paint('light')
  await post.locator('[data-feed-replies]').click()
  await wait(900)
  check('"Show all" opens the thread', await h.locator('[data-feed-thread]').count() === 1)
  await h.keyboard.press('Escape')
  await wait(800)

  // 4. A Feed post carried to the right edge opens beside the Feed.
  const area = await h.evaluate(() => { const b = document.querySelector('[data-split-area]').getBoundingClientRect(); return { left: b.left, right: b.right, top: b.top, bottom: b.bottom } })
  await post.scrollIntoViewIfNeeded()
  const pb = await post.locator('[data-feed-title]').boundingBox()
  const y = (area.top + area.bottom) / 2
  await h.mouse.move(pb.x + 20, pb.y + pb.height / 2)
  await h.mouse.down()
  await h.mouse.move(pb.x + 30, pb.y + pb.height / 2 + 10, { steps: 4 })
  await h.mouse.move(area.right - 200, y, { steps: 10 })
  await h.mouse.move(area.right - 60, y, { steps: 8 })
  await wait(300)
  await h.mouse.up()
  await wait(1500)
  const panes = await h.evaluate(() => {
    const kept = JSON.parse(localStorage.getItem('split') ?? 'null')
    return [...document.querySelectorAll('[data-pane]')].map((el) => { const pane = kept?.panes.find((one) => one.key === el.getAttribute('data-pane')); return pane ? pane.trail.views[pane.trail.at] : null })
  })
  check('dragging a Feed post to the right edge opens a second pane with that note', panes.length === 2 && panes[0]?.id === 'feed' && panes[1]?.focus === replied.id, JSON.stringify(panes))

  // 5. Pages in Custom order: a row carried out past the list's edge to the right opens beside.
  await h.keyboard.press('Control+w').catch(() => {})
  await wait(600)
  await h.evaluate(() => localStorage.setItem('view:article', JSON.stringify({ sort: 'manual', group: 'none', filter: {}, density: 'list' })))
  await h.reload()
  await wait(1500)
  await go('articles')
  await wait(1200)
  const paneCount = () => h.evaluate(() => document.querySelectorAll('[data-pane]').length)
  if (await paneCount() > 1) { await h.keyboard.press('Control+w'); await wait(600) }
  const pageRow = h.locator('[data-pane] button[data-row][data-id]:not([data-lifted] *)').first()
  const pageId = await pageRow.getAttribute('data-id')
  const a = await pageRow.boundingBox()
  const box = await h.evaluate(() => { const b = document.querySelector('[data-split-area]').getBoundingClientRect(); return { left: b.left, right: b.right, top: b.top, bottom: b.bottom } })
  const mid = (box.top + box.bottom) / 2
  await h.mouse.move(a.x + 40, a.y + a.height / 2)
  await h.mouse.down()
  await h.mouse.move(a.x + 40, a.y + a.height / 2 + 10, { steps: 4 })
  // Just past the list's own column, short of the window's edge: the places come up already.
  await h.mouse.move(a.x + a.width + 60, mid, { steps: 10 })
  await wait(300)
  const early = await h.evaluate(() => document.querySelectorAll('[data-split-zone]').length)
  check('a Pages row carried just past its column brings up the split places', early === 2, `${early} at x ${Math.round(a.x + a.width + 60)} of ${Math.round(box.right)}`)
  await h.mouse.move(box.right - 40, mid, { steps: 6 })
  await wait(150)
  for (let i = 0; i <= 6; i++) { await h.mouse.move(box.right - 40 + ((box.right - 46 - (box.right - 40)) * i) / 6, mid, { steps: 3 }); await wait(70) }
  await wait(200)
  const placed = await h.evaluate(() => [...document.querySelectorAll('[data-split-zone]')].map((el) => el.textContent.trim()))
  check('a Pages row in Custom order carried to the right edge brings up the split places', placed.length === 2, JSON.stringify(placed))
  await h.screenshot({ path: `${SHOTS}/pages-drag-edge.png` })
  const strip = await h.evaluate(() => Math.round(document.querySelector('[data-split-zone="left"]').getBoundingClientRect().width))
  const room = Math.min(Math.max(180, Math.min(320, (box.right - box.left) * 0.24)), a.x - box.left - 56, box.right - (a.x + a.width) - 56)
  check('beside a list, the places are as wide as the room either side allows', Math.abs(strip - Math.max(72, room)) <= 2, `${strip}px, room ${Math.round(room)}px`)
  await h.mouse.up()
  await wait(1500)
  const after = await h.evaluate(() => {
    const kept = JSON.parse(localStorage.getItem('split') ?? 'null')
    return [...document.querySelectorAll('[data-pane]')].map((el) => { const pane = kept?.panes.find((one) => one.key === el.getAttribute('data-pane')); return pane ? pane.trail.views[pane.trail.at] : null })
  })
  check('and letting go opens a second pane with that page', after.length === 2 && after[1]?.focus === pageId, JSON.stringify(after))
  check('no page errors', errors.length === 0, errors.join(' | '))
} finally {
  await close()
}
done()
