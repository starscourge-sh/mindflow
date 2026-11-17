// Four notes picked, then dragged onto a fifth in the same group.
// The card's count and its sentence must name the same number, and the rows
// that stay in the list must not land on each other.
//   npx electron-vite build --outDir out-drag
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=$PWD/out-drag/main/index.js HALIGTREE_QA_AWAY=1 SHOTS=<dir> node qa/multi-drag.mjs
import { mkdirSync } from 'fs'
import { sandbox } from './sandbox-lib.mjs'
import { checks } from './harness.mjs'
process.env.QA_ARGS ??= '--sandbox'

const SHOTS = process.env.SHOTS ?? ''
if (SHOTS) mkdirSync(SHOTS, { recursive: true })
const { check: raw, done } = checks()
const check = (name, ok, detail = '') => raw(name, ok, detail && typeof detail === 'object' ? JSON.stringify(detail) : detail)
const c = await sandbox({ width: 1280, height: 860 })
const { h, v } = c
const wait = (ms) => h.waitForTimeout(ms)
const p = (text) => ({ type: 'paragraph', content: [{ type: 'text', text }] })

const read = () => h.evaluate(() => {
  const label = document.querySelector('[data-drag-label]')?.textContent?.trim() ?? ''
  const badge = document.querySelector('[data-carried]')?.getAttribute('data-carried') ?? ''
  const said = label.match(/(\d+)\s*$/)
  const all = [...document.querySelectorAll('[data-sortable-id]')]
  const nodes = all.filter((el) => !el.hasAttribute('data-held') && !el.closest('.mf-drag-picture'))
  const rows = nodes.map((el) => {
    const box = el.getBoundingClientRect()
    const title = el.querySelector('.private-text')?.textContent?.trim().slice(0, 28) ?? el.getAttribute('data-sortable-id')
    return { title, top: box.top, bottom: box.bottom, left: box.left, right: box.right, width: box.width, height: box.height }
  }).filter((r) => r.height > 8 && r.width > 40 && r.bottom > 0 && r.top < innerHeight).sort((a, b) => a.top - b.top || a.left - b.left)
  const holds = (a, b) => a.top <= b.top + 2 && a.bottom >= b.bottom - 2 && a.left <= b.left + 2 && a.right >= b.right - 2
  const hits = []
  for (let i = 0; i < rows.length; i++) for (let j = i + 1; j < rows.length; j++) {
    if (rows[j].top >= rows[i].bottom - 4) break
    const over = Math.min(rows[i].bottom, rows[j].bottom) - Math.max(rows[i].top, rows[j].top)
    const across = Math.min(rows[i].right, rows[j].right) - Math.max(rows[i].left, rows[j].left)
    if (over > 4 && across > 8 && !holds(rows[i], rows[j]) && !holds(rows[j], rows[i])) hits.push(`${rows[i].title} over ${rows[j].title} ${Math.round(over)}px`)
  }
  const cards = [...document.querySelectorAll('[data-carried-card], [data-fanned]')].map((el) => el.getBoundingClientRect()).filter((r) => r.width > 8)
  const titles = [...document.querySelectorAll('button[data-row] .private-text')].filter((el) => (el.textContent ?? '').includes('Anchor page')).map((el) => el.getBoundingClientRect()).filter((r) => r.height > 4)
  let covered = 0
  for (const title of titles) {
    for (const card of cards) {
      const w = Math.min(title.right, card.right) - Math.max(title.left, card.left)
      const h = Math.min(title.bottom, card.bottom) - Math.max(title.top, card.top)
      if (w > 8 && h > 8) covered++
    }
  }
  const places = rows.filter((r) => /page|Observation|Pale|Kepler/.test(r.title)).slice(0, 10).map((r) => `${r.title.slice(0, 16)}@${Math.round(r.top)}`)
  return { label, badge, labelN: said ? said[1] : '', rows: rows.length, bad: hits.length, hits: hits.slice(0, 6), cards: cards.length, covered, places }
})

try {
  const made = []
  for (const title of ['Anchor page', 'North page', 'East page', 'South page', 'West page']) {
    const id = await v('article:new')
    await v('item:save', id, { title, body: { type: 'doc', content: [p(title)] } })
    made.push(id)
  }
  const pile = 'multi-drag-shelf'
  await v('groups:arrange', 'article', {
    top: [`g:${pile}`],
    groups: { [pile]: made },
    revive: [{ id: pile, name: 'Shelf', icon: null, color: null, folded: 0, folder: 0 }]
  })
  await h.evaluate(() => localStorage.setItem('view:article', JSON.stringify({ sort: 'manual', group: 'none', filter: {}, density: 'list' })))
  await c.go('articles')
  await wait(800)
  const row = (title) => h.locator('button[data-row]', { hasText: title }).first()
  const boxOf = async (title) => row(title).boundingBox()
  await h.keyboard.press('Escape')
  await wait(200)
  for (const title of ['North page', 'East page', 'South page', 'West page']) {
    await row(title).click({ modifiers: ['Meta'], position: { x: 90, y: 14 } })
    await wait(120)
  }
  const picked = await h.evaluate(() => document.querySelectorAll('button[data-row][data-picked]').length)
  const anchor = await boxOf('Anchor page')
  const west = await boxOf('West page')
  if (!anchor || !west) throw new Error('the rows were not on the page')
  const from = { x: west.x + Math.min(220, west.width / 2), y: west.y + west.height / 2 }
  const onto = { x: from.x, y: anchor.y + anchor.height * 0.5 }
  await h.keyboard.down('Shift')
  await h.mouse.move(from.x, from.y)
  await h.mouse.down()
  await h.mouse.move(from.x, from.y + 12, { steps: 4 })
  await wait(160)
  await h.mouse.move(onto.x, onto.y, { steps: 16 })
  await wait(1100)
  const seen = await read()
  if (SHOTS) await h.screenshot({ path: `${SHOTS}/multi-drag.png` })
  console.log('DRAG', JSON.stringify({ picked, ...seen }))
  check('four notes are picked', picked === 4, String(picked))
  check('the card says a new subgroup', /New subgroup of /.test(seen.label), seen.label)
  check('the sentence and the badge name the same count', seen.labelN !== '' && seen.labelN === seen.badge, seen)
  check('the rows left in the list do not land on each other', seen.bad === 0 && seen.rows > 3, seen)
  check('the carried cards do not cover the row they would join', seen.covered === 0 && seen.cards >= 2, seen)
  await h.keyboard.up('Shift')
  await h.mouse.up()
} catch (error) {
  check('the run finished', false, error.stack?.split('\n').slice(0, 6).join(' | '))
} finally {
  await c.close?.()
}
done()
