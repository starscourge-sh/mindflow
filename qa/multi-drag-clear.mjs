// Four notes picked inside a folder, then carried.
// Reorder ("Move 4 here") and a new subgroup must each leave every row at its
// own height, titles not painted on each other, and the cards in the hand
// fanned so each title can be read.
//   npx electron-vite build --outDir out-clear
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=$PWD/out-clear/main/index.js HALIGTREE_QA_AWAY=1 SHOTS=<dir> node qa/multi-drag-clear.mjs
import { mkdirSync } from 'fs'
import { sandbox } from './sandbox-lib.mjs'
import { checks } from './harness.mjs'
process.env.QA_ARGS ??= '--sandbox'

const SHOTS = process.env.SHOTS ?? ''
if (SHOTS) mkdirSync(SHOTS, { recursive: true })
const { check: raw, done } = checks()
const check = (name, ok, detail = '') => raw(name, ok, detail && typeof detail === 'object' ? JSON.stringify(detail) : detail)
const c = await sandbox({ width: 1280, height: 900 })
const { h, v } = c
const wait = (ms) => h.waitForTimeout(ms)
const p = (text) => ({ type: 'paragraph', content: [{ type: 'text', text }] })
const NAMES = ['Above note', 'North note', 'East note', 'South note', 'West note', 'Below note', 'Extra note', 'Tail note']
const PICKED = ['North note', 'East note', 'South note', 'West note']

const read = () => h.evaluate(({ names, picked }) => {
  const label = document.querySelector('[data-drag-label]')?.textContent?.trim() ?? ''
  const badge = document.querySelector('[data-carried]')?.getAttribute('data-carried') ?? ''
  const said = label.match(/(\d+)\s*$/)
  const opacityOf = (el) => {
    let node = el
    let opacity = 1
    while (node && node instanceof Element) {
      opacity *= parseFloat(getComputedStyle(node).opacity || '1')
      node = node.parentElement
    }
    return opacity
  }
  const titleBox = (name) => {
    const el = [...document.querySelectorAll('[data-sortable-id] .private-text')].find((one) => (one.textContent ?? '').trim() === name && !one.closest('.mf-drag-picture'))
    if (!el) return null
    const box = el.getBoundingClientRect()
    const row = el.closest('[data-sortable-id]')?.getBoundingClientRect()
    return { name, top: box.top, bottom: box.bottom, left: box.left, right: box.right, height: box.height, rowH: row?.height ?? 0, opacity: opacityOf(el) }
  }
  const rows = names.map(titleBox).filter(Boolean)
  const hits = []
  for (let i = 0; i < rows.length; i++) for (let j = i + 1; j < rows.length; j++) {
    const over = Math.min(rows[i].bottom, rows[j].bottom) - Math.max(rows[i].top, rows[j].top)
    const across = Math.min(rows[i].right, rows[j].right) - Math.max(rows[i].left, rows[j].left)
    if (over > 3 && across > 8) hits.push(`${rows[i].name} over ${rows[j].name} ${Math.round(over)}px`)
  }
  const chosen = picked.map(titleBox)
  const blank = chosen.filter((one) => !one || one.height < 8 || one.opacity < 0.25 || one.rowH < 28).map((one) => one?.name ?? 'missing')
  const cards = [...document.querySelectorAll('.mf-drag-picture [data-fanned], .mf-drag-picture [data-carried-card]')].map((el) => {
    const box = el.getBoundingClientRect()
    const name = el.querySelector('.private-text')?.textContent?.trim().slice(0, 24) ?? ''
    return { name, top: box.top, bottom: box.bottom, left: box.left, right: box.right, height: box.height }
  }).filter((one) => one.height > 4 && one.right > 0)
  const piled = []
  for (let i = 0; i < cards.length; i++) for (let j = i + 1; j < cards.length; j++) {
    const over = Math.min(cards[i].bottom, cards[j].bottom) - Math.max(cards[i].top, cards[j].top)
    const across = Math.min(cards[i].right, cards[j].right) - Math.max(cards[i].left, cards[j].left)
    if (over > 3 && across > 8) piled.push(`${cards[i].name} over ${cards[j].name} ${Math.round(over)}px`)
  }
  return {
    label, badge, labelN: said ? said[1] : '',
    hits, blank, piled, cards: cards.length,
    places: rows.map((one) => `${one.name.split(' ')[0]}@${Math.round(one.top)} h${Math.round(one.rowH)}`)
  }
}, { names: NAMES, picked: PICKED })

try {
  const made = []
  for (const title of NAMES) {
    const id = await v('article:new')
    await v('item:save', id, { title, body: { type: 'doc', content: [p(title)] } })
    made.push(id)
  }
  const folder = 'clear-youtube'
  await v('groups:arrange', 'article', {
    top: [`g:${folder}`],
    groups: { [folder]: made },
    revive: [{ id: folder, name: 'YouTube', icon: null, color: null, folded: 0, folder: 1 }]
  })
  await h.evaluate(() => localStorage.setItem('view:article', JSON.stringify({ sort: 'manual', group: 'none', filter: {}, density: 'list' })))
  await c.go('articles')
  await wait(700)
  await h.locator(`[data-group-row="${folder}"]`).click()
  await wait(700)
  const row = (title) => h.locator('button[data-row]', { hasText: title }).first()
  const boxOf = async (title) => row(title).boundingBox()
  await h.keyboard.press('Escape')
  await wait(150)
  for (const title of PICKED) {
    await row(title).click({ modifiers: ['Meta'], position: { x: 90, y: 12 } })
    await wait(80)
  }
  const picked = await h.evaluate(() => document.querySelectorAll('button[data-row][data-picked]').length)
  check('four notes in the folder are picked', picked === 4, String(picked))

  const west = await boxOf('West note')
  const above = await boxOf('Above note')
  if (!west || !above) throw new Error('the folder rows were not on the page')
  const from = { x: west.x + Math.min(200, west.width / 2), y: west.y + west.height / 2 }
  const onto = { x: from.x, y: above.y + above.height * 0.72 }
  const outside = Math.max(8, Math.round(west.x - 40))
  await h.mouse.move(from.x, from.y)
  await h.mouse.down()
  await h.mouse.move(from.x, from.y + 14, { steps: 4 })
  await wait(120)
  await h.mouse.move(onto.x, onto.y, { steps: 18 })
  await wait(160)
  await h.mouse.move(outside, onto.y, { steps: 10 })
  await wait(220)
  const zones = await h.evaluate(() => document.querySelectorAll('[data-split-zone]').length)
  check('a multi-drag does not offer to open on the left or right', zones === 0, String(zones))
  await h.mouse.move(onto.x, onto.y, { steps: 8 })
  await wait(180)
  const moved = await read()
  if (SHOTS) await h.screenshot({ path: `${SHOTS}/reorder.png` })
  console.log('REORDER', JSON.stringify(moved))
  check('reordering says move, and the count matches', /Move 4 here/.test(moved.label) && moved.badge === '4', moved)
  check('reordering does not stack list titles', moved.hits.length === 0, moved)
  check('reordering keeps every picked title', moved.blank.length === 0, moved)
  check('the cards in the hand do not pile', moved.piled.length === 0 && moved.cards >= 4, moved)

  await h.mouse.up()
  await wait(400)
  for (const title of PICKED) {
    const on = await row(title).getAttribute('data-picked').catch(() => null)
    if (on === null) await row(title).click({ modifiers: ['Meta'], position: { x: 90, y: 12 } })
    await wait(60)
  }

  const south = await boxOf('South note')
  const tail = await boxOf('Tail note')
  if (!south || !tail) throw new Error('the rows left after the move')
  const start = { x: south.x + Math.min(200, south.width / 2), y: south.y + south.height / 2 }
  const join = { x: start.x, y: tail.y + tail.height * 0.5 }
  await h.mouse.move(start.x, start.y)
  await h.mouse.down()
  await h.mouse.move(start.x, start.y + 14, { steps: 4 })
  await wait(120)
  await h.mouse.move(join.x, join.y, { steps: 18 })
  await wait(1100)
  const formed = await read()
  if (SHOTS) await h.screenshot({ path: `${SHOTS}/subgroup.png` })
  console.log('SUBGROUP', JSON.stringify(formed))
  check('a subgroup names the same count on the card and the badge', /New subgroup of /.test(formed.label) && formed.labelN !== '' && formed.labelN === formed.badge, formed)
  check('a subgroup does not stack list titles', formed.hits.length === 0, formed)
  check('a subgroup keeps every picked title', formed.blank.length === 0, formed)
  check('a subgroup fans the cards so each title is readable', formed.piled.length === 0 && formed.cards >= 4, formed)
  await h.mouse.up()
} catch (error) {
  check('the run finished', false, error.stack?.split('\n').slice(0, 6).join(' | '))
} finally {
  await c.close?.()
}
done()
