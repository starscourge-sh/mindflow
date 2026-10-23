// Every row in a list of pages lines up: a loose page, a page in a group, an
// open group's heading and a folded group. At rest and pointed at, each kind's
// box (its panel, its hover light, its focus ring) starts and ends on the same
// two edges and its title starts on the same line. Pages share one tile and one
// height; a group's heading is a slim bar 36px tall, its icon and chevron inside
// the column a page's tile takes, with a hairline under it only while open.
//
//   npx electron-vite build --outDir out-x
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-x/main/index.js HALIGTREE_QA_AWAY=1 [SHOTS=dir] node qa/row-shape.mjs
import { mkdirSync } from 'fs'
import { sandbox } from './sandbox-lib.mjs'
import { checks } from './harness.mjs'

const SHOTS = process.env.SHOTS
if (SHOTS) mkdirSync(SHOTS, { recursive: true })
const { check, done } = checks()
const c = await sandbox({ width: 1200, height: 900 })
const { h, v } = c
const wait = (ms) => h.waitForTimeout(ms)

// One row's shape, from the list's left: its box, its focus ring, its icon's tile, its title's first letter, its height.
const shape = (kind, at, hovered) => h.evaluate(([kind, at, hovered]) => {
  const list = document.querySelector('[data-page]:not([hidden])')
  const x = (n) => Math.round(n * 2) / 2
  const textLeft = (el) => {
    const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
    for (let node = walk.nextNode(); node; node = walk.nextNode()) {
      if (!node.textContent.trim() || node.parentElement.closest('[aria-hidden], [data-count]')) continue
      const r = document.createRange()
      r.selectNodeContents(node)
      const one = r.getClientRects()[0]
      if (one) return one.left
    }
    return null
  }
  let button, box, tile, title
  if (kind === 'page') {
    button = [...list.querySelectorAll('button[data-row]')].find((one) => one.textContent.includes(at))
    tile = button?.querySelector(':scope > span')
    title = button?.querySelector('.private-text')
    const light = [...list.querySelectorAll('[data-highlight]')].find((one) => +getComputedStyle(one).opacity > 0.5)
    box = hovered && light && button && Math.abs(light.getBoundingClientRect().top - button.getBoundingClientRect().top) < 2 ? light.getBoundingClientRect() : button?.getBoundingClientRect()
  } else {
    const block = list.querySelector(`[data-group-block="${at}"]`)
    button = block?.querySelector(`[data-group-row="${at}"]`)
    tile = button?.querySelector('[data-group-tile]') ?? button?.querySelector('span')
    title = button
    const panel = block?.querySelector(':scope > [data-panel]')?.getBoundingClientRect()
    box = panel && kind === 'folded group' ? panel : panel && button ? { left: panel.left, right: panel.right, top: button.getBoundingClientRect().top, height: button.getBoundingClientRect().height } : null
  }
  if (!button || !box) return null
  const b = button.getBoundingClientRect()
  // The focus ring: the browser's outline, drawn at its offset, or a ring drawn as a shadow on the button's own edge.
  button.focus({ focusVisible: true })
  const s = getComputedStyle(button)
  const outline = s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0
  const off = outline ? parseFloat(s.outlineOffset) + parseFloat(s.outlineWidth) : s.boxShadow !== 'none' ? 0 : null
  const ring = outline ? `outline ${s.outlineWidth} ${s.outlineColor}` : s.boxShadow
  button.blur()
  const t = tile?.getBoundingClientRect()
  return {
    box: [x(box.left), x(box.right)],
    focus: off === null ? null : [x(b.left - off), x(b.right + off)],
    ring,
    // Its square, from the row's top-left; a page's tile is filled by its picture or cover, a group's by its colour.
    tile: t ? [x(t.left), x(t.top - b.top), x(t.width), x(t.height)] : null,
    title: x(textLeft(title)),
    height: x(kind === 'folded group' ? box.height ?? b.height : b.height),
    line: kind === 'page' ? undefined : !!button.querySelector('[data-head-line]')
  }
}, [kind, at, hovered])

async function measure(label, rows) {
  const all = {}
  for (const state of ['at rest', 'pointed at']) {
    for (const [kind, at] of rows) {
      if (state === 'pointed at') {
        const target = kind === 'page' ? h.locator('button[data-row]', { hasText: at }).first() : h.locator(`[data-group-row="${at}"]`)
        await target.hover()
        await wait(450)
      } else (await h.mouse.move(5, 5), await wait(450))
      all[`${state}: ${kind}`] = await shape(kind, at, state === 'pointed at')
    }
  }
  for (const [name, got] of Object.entries(all)) console.log(`      ${label} ${name}: ${JSON.stringify(got)}`)
  const vals = Object.values(all).filter(Boolean)
  check(`${label}: every kind of row is drawn`, vals.length === Object.keys(all).length, Object.entries(all).filter(([, one]) => !one).map(([k]) => k).join(', '))
  const same = (name, pick) => {
    const seen = [...new Set(vals.map((one) => JSON.stringify(pick(one))))]
    check(`${label}: ${name}`, seen.length === 1, seen.join(' / '))
  }
  same('every box starts and ends on the same two edges', (one) => one.box)
  same('every focus ring sits on that same box edge', (one) => one.focus)
  check(`${label}: and the focus ring is the box`, vals.every((one) => JSON.stringify(one.focus) === JSON.stringify(one.box)), vals.map((one) => `${one.box}|${one.focus}`).join(' / '))
  same('every focus ring is drawn the same way', (one) => one.ring)
  same('every title starts on the same line', (one) => one.title)
  const pages = Object.entries(all).filter(([k, one]) => one && k.endsWith(': page')).map(([, one]) => one)
  const heads = Object.entries(all).filter(([k, one]) => one && !k.endsWith(': page'))
  const pv = (pick) => [...new Set(pages.map((one) => JSON.stringify(pick(one))))]
  check(`${label}: every page's icon sits in the same tile`, pv((one) => one.tile).length === 1, pv((one) => one.tile).join(' / '))
  check(`${label}: every page is as tall as a page's row`, pv((one) => one.height).length === 1, pv((one) => one.height).join(' / '))
  const pageTile = pages[0]?.tile
  // 36px at the app's base text size: one page tile high (the tile and the bar both scale with the text size).
  check(`${label}: a group's heading is a slim bar, one page tile (36px) tall`, heads.every(([, one]) => one.height === pageTile[3]), heads.map(([k, one]) => `${k} ${one.height}`).join(' / ') + ` vs tile ${pageTile[3]}`)
  check(`${label}: its icon and chevron sit in a page's tile column`, heads.every(([, one]) => one.tile && one.tile[0] === pageTile[0] && one.tile[2] === pageTile[2]), heads.map(([k, one]) => `${k} ${one.tile}`).join(' / ') + ` vs ${pageTile}`)
  check(`${label}: a hairline under an open group's heading, none under a folded one`, heads.every(([k, one]) => one.line === k.endsWith('open group')), heads.map(([k, one]) => `${k} ${one.line}`).join(' / '))
  if (SHOTS) await h.screenshot({ path: `${SHOTS}/${label}.png` })
}

try {
  for (const [tier, page, make] of [['article', 'articles', 'article:new']]) {
    await h.evaluate((tier) => localStorage.setItem(`view:${tier}`, JSON.stringify({ sort: 'manual', group: 'none', filter: {}, density: 'list' })), tier)
    const ids = []
    for (const title of ['Observer', 'Strategy', 'Facade', 'Composite', 'A loose one']) {
      const id = make ? await v(make) : await v('nugget:from', title, {})
      if (make) await v('item:save', id, { title })
      ids.push(id)
    }
    await v('groups:arrange', tier, { top: [`g:${tier}a`, `g:${tier}b`, ids[4]], groups: { [`${tier}a`]: ids.slice(0, 2), [`${tier}b`]: ids.slice(2, 4) }, make: { id: `${tier}a`, name: 'Design patterns' }, revive: [{ id: `${tier}b`, name: 'Structural', icon: null, color: 'blue', folded: 1 }] })
    await c.go(page)
    await wait(1200)
    await measure(page, [['page', 'A loose one'], ['page', 'Observer'], ['open group', `${tier}a`], ['folded group', `${tier}b`]])
  }
  check('no errors on the page', c.errors.length === 0, c.errors.slice(0, 3).join(' | '))
} finally { await c.close() }
done()
