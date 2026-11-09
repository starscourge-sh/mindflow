// Landing on Writing from another page (Journal's Week), open on a folder in your own order: a group's notes are drawn
// in their saved order from the first frame, never in date order for a frame and then put right.
// Every animation frame for 1.5s, the visible rows' order is read; it must never change after the first frame drawn.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-wo/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox node qa/writing-landing-order.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'

const { check, done } = checks()
const s = await sandbox({ width: 1300, height: 900 })
const { h, v, go, close } = s
const wait = (ms) => h.waitForTimeout(ms)
const ROWS = '[role="main"] [data-sortable-id]'

try {
  await v('settings:set', { hintRate: 0 })
  await h.evaluate(() => localStorage.setItem('view:article', JSON.stringify({ sort: 'manual', group: 'none', filter: {}, density: 'list' })))
  const before = await v('groups', 'article')
  const films = before.find((one) => one.name === 'Films and books')
  // Four notes made A, B, C, D (so newest first reads D, C, B, A), kept in a group as A, B, C, D.
  const ids = []
  for (const title of ['Landing A', 'Landing B', 'Landing C', 'Landing D']) { const id = await v('article:new'); await v('item:save', id, { title }); ids.push(id); await wait(30) }
  const inGroups = new Set(before.flatMap((one) => one.members))
  const loose = (await v('items', 'article')).filter((one) => !inGroups.has(one.id) && !ids.includes(one.id) && !one.archivedAt).map((one) => one.id)
  const groups = Object.fromEntries(before.map((one) => [one.id, one.members]))
  const gid = 'qa-landing-group'
  await v('groups:arrange', 'article', { top: [...before.filter((one) => !one.parent).map((one) => `g:${one.id}`), ...loose], groups: { ...groups, [films.id]: [`g:${gid}`, ...films.members], [gid]: ids }, make: { id: gid, name: 'Group 1' } })
  const saved = (await v('notes:order', 'article')).filter((id) => ids.includes(id))
  check('the group is saved as A, B, C, D', saved.join() === ids.join(), saved.join())

  // Writing, the folder opened, then away to the Week, as the user does.
  await go('articles'); await wait(600)
  await h.locator('[role="main"] [data-group-row], [role="main"] [data-row]', { hasText: 'Films and books' }).first().click()
  await wait(1200)
  const title = (id) => ['A', 'B', 'C', 'D'][ids.indexOf(id)] ?? null
  const rowsNow = () => h.evaluate((sel) => [...document.querySelectorAll(sel)].filter((one) => one.getClientRects().length).map((one) => one.getAttribute('data-sortable-id')), ROWS)
  const settled = (await rowsNow()).map(title).filter(Boolean).join('')
  check('in the folder, the group reads A, B, C, D', settled === 'ABCD', settled)

  // Twice warm, then once after a reload (nothing read yet in this window).
  for (const round of [1, 2, 3]) {
    if (round === 3) { await h.reload(); await wait(2000) }
    await go('week'); await wait(1200)
    // Every frame from the moment Writing is asked for.
    await h.evaluate(([sel, want]) => {
      const frames = (window.__landing = [])
      const t0 = performance.now()
      const tick = () => {
        const order = [...document.querySelectorAll(sel)].filter((one) => one.getClientRects().length).map((one) => one.getAttribute('data-sortable-id')).filter((id) => want.includes(id)).map((id) => 'ABCD'[want.indexOf(id)]).join('')
        if (order && frames.at(-1) !== order) frames.push(order)
        if (performance.now() - t0 < 1500) requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)
    }, [ROWS, ids])
    // Back by the folder in the sidebar, Writing's Obsidian as the user has it.
    await h.locator(`aside [data-side-folder="${films.id}"]`).first().click()
    await wait(1800)
    const frames = await h.evaluate(() => window.__landing)
    check(`round ${round}: the group's notes were drawn`, frames.length > 0, JSON.stringify(frames))
    check(`round ${round}: drawn as A, B, C, D from the first frame, never another order`, frames.length === 1 && frames[0] === 'ABCD', JSON.stringify(frames))
  }
} catch (e) {
  check('ran without throwing', false, e.stack)
} finally {
  await close()
  done()
}
