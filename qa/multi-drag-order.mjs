// Three notes picked in list order, then the first one is carried.
// The floating stack reads the same way the list does (first title on top).
// Every source row fades the same, and the one under the pointer keeps no brighter selection.
//   npx electron-vite build --outDir out-fan
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=$PWD/out-fan/main/index.js HALIGTREE_QA_AWAY=1 SHOTS=<dir> node qa/multi-drag-order.mjs
import { mkdirSync } from 'fs'
import { sandbox } from './sandbox-lib.mjs'
import { checks } from './harness.mjs'
process.env.QA_ARGS ??= '--sandbox'

const SHOTS = process.env.SHOTS ?? ''
if (SHOTS) mkdirSync(SHOTS, { recursive: true })
const { check: raw, done } = checks()
const check = (name, ok, detail = '') => raw(name, ok, detail && typeof detail === 'object' ? JSON.stringify(detail) : detail)
const c = await sandbox({ width: 1280, height: 900, seeded: false })
const { h, v } = c
h.setDefaultTimeout(8000)
const wait = (ms) => h.waitForTimeout(ms)
const p = (text) => ({ type: 'paragraph', content: [{ type: 'text', text }] })
const ORDER = ['Vox Sound Design Formula', 'Phrase Patterns', 'Lines Bank']

const read = () => h.evaluate((order) => {
  const opacityOf = (el) => {
    let node = el
    let opacity = 1
    while (node && node instanceof Element) {
      opacity *= parseFloat(getComputedStyle(node).opacity || '1')
      node = node.parentElement
    }
    return opacity
  }
  const source = order.map((name) => {
    const title = [...document.querySelectorAll('[data-sortable-id] .private-text')].find((one) => (one.textContent ?? '').trim() === name && !one.closest('.mf-drag-picture'))
    const row = title?.closest('button[data-row]')
    const held = !!title?.closest('[data-held]')
    return {
      name,
      opacity: title ? opacityOf(title) : 0,
      bg: row ? getComputedStyle(row).backgroundColor : '',
      held
    }
  })
  const cards = [...document.querySelectorAll('.mf-drag-picture [data-fanned], .mf-drag-picture [data-carried-card]')].map((el) => {
    const box = el.getBoundingClientRect()
    const name = el.querySelector('.private-text')?.textContent?.trim() ?? ''
    return { name, top: box.top, height: box.height }
  }).filter((one) => one.height > 4 && one.name).sort((a, b) => a.top - b.top)
  const opacities = source.map((one) => one.opacity)
  const sameFade = opacities.every((one) => one >= 0.25 && one <= 0.4) && Math.max(...opacities) - Math.min(...opacities) < 0.08
  const bgs = source.map((one) => one.bg)
  const sameLook = bgs.every((one) => one && one === bgs[0])
  const tops = cards.map((one) => one.name)
  const inOrder = order.every((name, at) => tops[at] === name) && cards.length >= 3 && cards[1].top - cards[0].top > 20 && cards[2].top - cards[1].top > 20
  return { source, cards, sameFade, sameLook, inOrder, tops }
}, ORDER)

try {
  const made = []
  for (const title of ['Above note', ...ORDER, 'Below note']) {
    const id = await v('article:new')
    await v('item:save', id, { title, body: { type: 'doc', content: [p(title)] } })
    made.push(id)
  }
  const folder = 'fan-order'
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
  await h.keyboard.press('Escape')
  await wait(150)
  for (const title of ORDER) {
    await row(title).click({ modifiers: ['Meta'], position: { x: 90, y: 12 } })
    await wait(80)
  }
  const picked = await h.evaluate(() => document.querySelectorAll('button[data-row][data-picked]').length)
  check('three notes are picked', picked === 3, String(picked))

  const vox = await row(ORDER[0]).boundingBox()
  if (!vox) throw new Error('the first note was not on the page')
  const from = { x: vox.x + Math.min(200, vox.width / 2), y: vox.y + vox.height / 2 }
  await h.mouse.move(from.x, from.y)
  await h.mouse.down()
  await h.mouse.move(from.x, from.y + 16, { steps: 4 })
  await wait(160)
  await h.mouse.move(from.x, from.y + 90, { steps: 12 })
  await wait(280)
  const held = await read()
  if (SHOTS) await h.screenshot({ path: `${SHOTS}/fan.png` })
  console.log('FAN', JSON.stringify(held))
  check('the stack reads in list order, first title on top', held.inOrder, held.tops)
  check('every carried row fades the same', held.sameFade, held.source)
  check('the row in hand keeps no brighter selection', held.sameLook, held.source)
  await h.mouse.up()
} catch (error) {
  check('the run finished', false, error.stack?.split('\n').slice(0, 6).join(' | '))
} finally {
  await c.close?.()
}
done()
