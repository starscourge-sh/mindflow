// Folding a group is instant and clean, big or small: in the first frame after
// the click the group's box is its header's height and the next row sits right
// under it, and it stays so; unfolding is whole in the first frame too.
// A 605-row group (drawn a screenful at a time) and a 3-row one, on Gems.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 [SHOT=<dir>] node qa/fold-instant.mjs
import { DatabaseSync } from 'node:sqlite'
import { randomUUID } from 'crypto'
import { join } from 'path'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const SHOT = process.env.SHOT ?? ''
const { check, done } = checks()
const first = await sandbox({ width: 1300, height: 900, seeded: true })
await first.v('onboarding:set', { welcomed: new Date().toISOString(), newsSeen: true, pageHints: false })
await first.close()
const db = new DatabaseSync(join(process.env.QA_DATA, 'sandbox', 'haligtree.db'))
db.exec('begin')
const add = db.prepare("insert into nuggets (id, tier, kind, title, body, created_at, updated_at) values (?, 'nugget', 'note', '', ?, ?, ?)")
const big = [], small = [], loose = []
for (let i = 0; i < 620; i++) {
  const id = randomUUID(); const at = new Date(Date.now() - i * 60000).toISOString()
  add.run(id, JSON.stringify({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: `Gem ${i + 1}` }] }] }), at, at)
  ;(i < 3 ? small : i < 608 ? big : loose).push(id)
}
db.exec('commit')
db.close()

const c = await sandbox({ width: 1300, height: 900, seeded: false })
const { h } = c
try {
  await c.v('onboarding:set', { welcomed: new Date().toISOString(), newsSeen: true, pageHints: false })
  await c.v('settings:set', { sounds: false, hintRate: 0 })
  const every = ((await c.v('items', 'nugget')).items ?? (await c.v('items', 'nugget'))).map((one) => one.id).filter((id) => !big.includes(id) && !small.includes(id))
  await c.v('groups:arrange', 'nugget', { top: ['g:big', ...every], groups: { big }, make: { id: 'big', name: 'Obsidian' } })
  await c.v('groups:arrange', 'nugget', { top: ['g:small', 'g:big', ...every], groups: { small, big }, make: { id: 'small', name: 'Three' } })
  await h.evaluate(() => localStorage.setItem('view:nugget', JSON.stringify({ sort: 'manual', group: 'none', filter: {}, density: 'list' })))
  await h.reload(); await h.waitForTimeout(2000)
  await c.go('nuggets'); await h.waitForTimeout(2000)
  const groups = await c.v('groups', 'nugget')
  for (const name of ['Three', 'Obsidian']) {
    const g = groups.find((one) => one.name === name)
    if (!g) { check(`${name}: the group is there`, false, groups.map((one) => one.name).join(', ')); continue }
    const row = `[data-group-row="${g.id}"]`
    if ((await h.locator(row).getAttribute('aria-expanded')) !== 'true') { await h.locator(`${row} [data-group-fold]`).click(); await h.waitForTimeout(800) }
    await h.locator(row).scrollIntoViewIfNeeded(); await h.waitForTimeout(400)
    // Click, then read the box and the row after it on each of the next 20 frames.
    const sample = () => h.evaluate((id) => new Promise((resolve) => {
      const block = () => document.querySelector(`[data-group-block="${id}"]`)
      const header = () => document.querySelector(`[data-group-row="${id}"]`)
      const next = () => { let at = block()?.closest('[data-index]'); return at?.nextElementSibling?.firstElementChild ?? null }
      const out = []
      document.querySelector(`[data-group-row="${id}"] [data-group-fold]`).click()
      const read = () => {
        const b = block()?.getBoundingClientRect(), hd = header()?.getBoundingClientRect(), n = next()?.getBoundingClientRect()
        const panel = block()?.querySelector('[data-panel]')?.getBoundingClientRect()
        out.push({ box: Math.round(b?.height ?? -1), head: Math.round(hd?.height ?? -1), gap: n && b ? Math.round(n.top - b.bottom) : null, panel: Math.round(panel?.height ?? -1), rows: block()?.querySelectorAll('[data-row]').length ?? 0 })
        if (out.length < 20) requestAnimationFrame(read); else resolve(out)
      }
      requestAnimationFrame(read)
    }), g.id)
    const shut = await sample()
    const firstShut = shut[0]
    const flat = shut.every((one) => one.box === firstShut.box && one.gap === firstShut.gap && one.panel === firstShut.panel)
    check(`${name}: folded, the box is its header's height in the first frame`, firstShut.box - firstShut.head <= 12 && firstShut.rows === 0, JSON.stringify(firstShut))
    check(`${name}: folded, the next row sits right under it in the first frame and nothing moves after`, firstShut.gap !== null && firstShut.gap <= 12 && firstShut.gap >= -1 && flat, shut.slice(0, 6).map((one) => `${one.box}/${one.gap}/${one.panel}`).join(' '))
    if (SHOT) await h.screenshot({ path: `${SHOT}/fold-${name}-shut.png` })
    await h.waitForTimeout(400)
    const open = await sample()
    const o = open[0]
    // Within 3px: a big group's rows far below the screen are measured a frame after they are drawn.
    const still = open.every((one) => Math.abs(one.box - o.box) <= 3 && one.panel === one.box)
    check(`${name}: unfolded, whole in the first frame and nothing moves after`, o.rows > 0 && o.box > o.head + 40 && still, open.slice(0, 6).map((one) => `${one.box}/${one.panel}/${one.rows}`).join(' '))
    if (SHOT) await h.screenshot({ path: `${SHOT}/fold-${name}-open.png` })
    await h.waitForTimeout(400)
  }
  // The sidebar's folders under Gems: the rows under them (Feed) move in the first frame and stay.
  for (const way of ['fold', 'unfold']) {
    const ys = await h.evaluate(() => new Promise((resolve) => {
      const feed = () => document.querySelector('[data-side-row][data-home="feed"], [data-side-row][href*="feed"]') ?? [...document.querySelectorAll('[data-side-row]')].find((one) => one.textContent.trim().startsWith('Feed'))
      const before = Math.round(feed().getBoundingClientRect().top)
      document.querySelector('[data-folders-fold="nugget"]').click()
      const out = [before]
      const read = () => { out.push(Math.round(feed().getBoundingClientRect().top)); if (out.length < 16) requestAnimationFrame(read); else resolve(out) }
      requestAnimationFrame(read)
    }))
    check(`sidebar: ${way}ing Gems' folders moves the rows under them in the first frame, no slide`, ys[1] !== ys[0] && ys.slice(1).every((y) => y === ys[1]), ys.join(' '))
    await h.waitForTimeout(400)
  }
} catch (error) {
  check('the run finished', false, error.message.split('\n')[0])
} finally {
  await c.close?.()
}
done()
