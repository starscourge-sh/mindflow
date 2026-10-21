// Dia's touches, Haligtree's way: drag a row to either side of the page to split
// (with frames of the magnet pull), no pop-up on resting over a row or a
// folded group, Open to the side from the row's menu, an icon on every menu line, the split
// pair's row and menu in the sidebar, and the L/M/R marks on rows open in
// panes. Light and dark screenshots go to SHOTS (default scratchpad/dia).
//
//   npx electron-vite build --outDir out-dia
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-dia/main/index.js MINDFLOW_QA_AWAY=1 node qa/dia.mjs
import { mkdirSync, mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

process.env.QA_DATA ??= mkdtempSync(join(tmpdir(), 'vigil-dia-'))
process.env.QA_ARGS ??= '--sandbox'
const dir = process.env.SHOTS ?? 'scratchpad/dia'
mkdirSync(dir, { recursive: true })
const { sandbox } = await import('./sandbox-lib.mjs')

const results = []
const check = (name, ok, detail = '') => { results.push(!!ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`) }
const TITLES = ['Spaced repetition, a primer', 'How memory palaces work', 'Reading list for October', 'Notes on Zettelkasten', 'The forgetting curve', 'Interleaving beats blocking']

const c = await sandbox({ width: 1400, height: 880 })
const { h, v } = c
const wait = (ms = 600) => h.waitForTimeout(ms)
const row = (title) => h.locator('[data-pane] button[data-row]', { hasText: title }).first()
/** Each pane, left to right, and the note it has open, as the app keeps its trail. */
const panes = () => h.evaluate(() => {
  const keys = [...document.querySelectorAll('[data-pane]')].map((el) => el.getAttribute('data-pane'))
  const kept = JSON.parse(localStorage.getItem('split') ?? 'null')
  return keys.map((key) => { const pane = kept?.panes.find((one) => one.key === key); return { key, open: pane ? pane.trail.views[pane.trail.at].focus ?? null : null } })
})
const area = () => h.evaluate(() => { const b = document.querySelector('[data-split-area]').getBoundingClientRect(); return { left: b.left, right: b.right, top: b.top, bottom: b.bottom } })
const zones = () => h.evaluate(() => [...document.querySelectorAll('[data-split-zone]')].map((el) => ({ side: el.dataset.splitZone, hot: el.hasAttribute('data-hot'), label: el.textContent.trim() })))
const idOf = (locator) => locator.getAttribute('data-id')
/** Closes every open menu and card. */
const settle = async () => { await h.keyboard.press('Escape'); await wait(200); await h.mouse.move(5, 300); await wait(300) }

/** Press on `from`, leave its column, and carry it into a side's place; `frames` names the pictures taken on the way in. */
async function toSide(from, side, { frames, drop = true } = {}) {
  const a = await from.boundingBox()
  const box = await area()
  await h.mouse.move(a.x + 40, a.y + a.height / 2)
  await h.mouse.down()
  await h.mouse.move(a.x + 40, a.y + a.height / 2 + 10, { steps: 4 })
  // Out to the page's very edge: a list row's places come up only there, as narrow strips (split-drop.tsx).
  const edge = side === 'left' ? box.left + 40 : box.right - 40
  const middle = side === 'left' ? box.left + 10 + 36 : box.right - 10 - 36
  const y = (box.top + box.bottom) / 2
  const start = side === 'left' ? box.left + 320 : box.right - 320
  await h.mouse.move(start, y, { steps: 10 })
  await h.mouse.move(edge, y, { steps: 6 })
  await wait(150)
  // Then into the strip slowly, frame by frame.
  for (let i = 0; i <= 6; i++) {
    const x = edge + ((middle - edge) * i) / 6
    await h.mouse.move(x, y, { steps: 3 })
    await wait(70)
    if (frames) await h.screenshot({ path: `${dir}/${frames}-${i}.png` })
  }
  await wait(200)
  const seen = await zones()
  if (drop) {
    await h.mouse.up()
    await wait(1000)
  }
  return seen
}

try {
  await c.theme('light')
  await c.size(1400, 880)
  await h.evaluate(() => localStorage.setItem('view:article', JSON.stringify({ sort: 'manual', group: 'none', filter: {}, density: 'list' })))
  for (const title of TITLES) {
    const id = await v('article:new')
    await v('item:save', id, { title, attribution: title.includes('primer') ? 'https://gwern.net/spaced-repetition' : null })
  }
  await c.go('articles')
  await wait()

  // --- 3. No hover card: Open to the side is on the row's right-click menu ---------------
  const target = row('The forgetting curve')
  const tb = await target.boundingBox()
  await h.mouse.move(tb.x + 80, tb.y + tb.height / 2, { steps: 4 })
  await h.mouse.move(tb.x + 90, tb.y + tb.height / 2, { steps: 2 })
  await wait(1500)
  check('resting on a row brings up no card over the list', await h.locator('[data-row-card]').count() === 0)
  const forgetting = await idOf(target)
  await target.click({ button: 'right' })
  await wait(400)
  await h.locator('[role=menu] [role=menuitem]', { hasText: /^Open in/ }).first().hover()
  await wait(400)
  await h.locator('[role=menu] [role=menuitem]', { hasText: /^Open to the side/ }).first().click()
  await wait(1200)
  let list = await panes()
  check('Open to the side on the row menu opens a second pane', list.length === 2 && list[1].open === forgetting, JSON.stringify(list))
  // Back to one pane for the drags.
  await h.keyboard.press('Control+w'); await wait(800)
  check('⌃W closes it again', (await panes()).length === 1)

  // --- 1. Drag to split ------------------------------------------------------------
  await settle()
  const palace = row('How memory palaces work')
  const palaceId = await idOf(palace)
  // A short drag inside the list's column is a reorder, with no places.
  {
    const a = await palace.boundingBox()
    await h.mouse.move(a.x + 40, a.y + a.height / 2)
    await h.mouse.down()
    await h.mouse.move(a.x + 40, a.y + a.height * 2, { steps: 8 })
    await wait(200)
    check('carried up and down its list, no places come up', (await zones()).length === 0)
    await h.keyboard.press('Escape')
    await h.mouse.up()
    await wait(500)
  }
  const order = () => h.evaluate(() => [...document.querySelectorAll('[data-pane]')[0].querySelectorAll('button[data-row][data-id]')].map((one) => one.dataset.id).join(','))
  const before = await order()
  let seen = await toSide(palace, 'right', { frames: 'magnet-right' })
  check('out at the page edge, both places show', seen.length === 2, JSON.stringify(seen))
  check('the right place is lit under the pointer', seen.find((one) => one.side === 'right')?.hot, JSON.stringify(seen))
  check('the places say Open on the left / right', seen.some((one) => one.label === 'Open on the right') && seen.some((one) => one.label === 'Open on the left'))
  list = await panes()
  check('dropped on the right: a new pane on the right, with that note', list.length === 2 && list[1].open === palaceId, JSON.stringify(list))
  check('the list kept its order (no reorder from the drop)', (await order()) === before)

  // The magnet: frames should show the card drawn toward the place before it is inside.
  const zettel = row('Notes on Zettelkasten')
  const zettelId = await idOf(zettel)
  seen = await toSide(zettel, 'left', { frames: 'magnet-left' })
  list = await panes()
  check('dropped on the left: a new pane on the left, with that note', list.length === 3 && list[0].open === zettelId, JSON.stringify(list))

  // Four panes, the most there can be (lib/split.ts MAX_PANES): the places say Replace.
  await toSide(row('How memory palaces work'), 'right')
  check('a fourth pane can still be opened', (await panes()).length === 4)
  seen = await toSide(row('Interleaving beats blocking'), 'right', { drop: false })
  check('with four panes, the places say Replace left / right', seen.some((one) => one.label === 'Replace right') && seen.some((one) => one.label === 'Replace left'), JSON.stringify(seen))
  await h.screenshot({ path: `${dir}/replace-light.png` })
  // Esc puts it all down.
  await h.keyboard.press('Escape')
  await wait(300)
  check('Esc takes the places away', (await zones()).length === 0)
  await h.mouse.up()
  await wait(600)
  check('and nothing opened', (await panes()).length === 4)

  // --- 5. Pane marks and the pair row ------------------------------------------------
  const marks = await h.locator('[data-pane-mark]').evaluateAll((all) => all.map((one) => one.dataset.paneMark))
  check('rows open in panes carry an L / M / R mark', marks.length >= 2 && marks.some((one) => one === 'L' || one === 'R'), marks.join(','))
  check('the split shows as one row, under Side by side, not among Pinned', await h.locator('[data-pair-row="live"]').count() === 1 && await h.locator('[data-side-heading="split"]').count() === 1)
  // Report of 10 Oct: the mark sat over the row's picture.
  const covered = await h.evaluate(() => [...document.querySelectorAll('[data-pane-mark]')].map((mark) => {
    const m = mark.getBoundingClientRect()
    const row = mark.closest('[data-row]')
    const r = row.getBoundingClientRect()
    const hits = [...row.querySelectorAll('img, svg, canvas, [class*="rounded"]')].filter((one) => one !== mark && !one.contains(mark) && !mark.contains(one)).filter((one) => {
      const b = one.getBoundingClientRect()
      return b.width > 0 && b.left < m.right - 1 && b.right > m.left + 1 && b.top < m.bottom - 1 && b.bottom > m.top + 1
    })
    return { inRow: m.left >= r.left && m.right <= r.right, hits: hits.length }
  }))
  check('the L / M / R mark sits in its own room in the row, over nothing', covered.length > 0 && covered.every((one) => one.inRow && one.hits === 0), JSON.stringify(covered))
  await h.screenshot({ path: `${dir}/pair-row-light.png` })
  await h.locator('[data-pair-row="live"]').click({ button: 'right' })
  await wait(400)
  const pairMenu = await h.locator('[role="menu"]').last().innerText()
  for (const words of ['Pin the layout', 'Separate', 'Duplicate the layout', 'Copy to book', 'Open in new window', 'Notes', 'Close pane', 'Close other panes']) {
    check(`the pair's menu has ${words}`, pairMenu.includes(words))
  }
  const pairIcons = await h.locator('[role="menu"]').last().locator('[role^="menuitem"]').evaluateAll((all) => all.filter((one) => !one.querySelector('svg')).map((one) => one.textContent))
  check('every line of the pair\'s menu has an icon', pairIcons.length === 0, pairIcons.join(' | '))
  // A note's own actions, one level in.
  await h.locator('[role="menu"]').last().locator('[role="menuitem"][aria-haspopup]', { hasText: 'How memory palaces work' }).hover()
  await wait(500)
  check('each note in the pair opens its own actions', await h.locator('[role="menu"]').count() >= 2)
  await h.screenshot({ path: `${dir}/pair-menu-light.png` })
  await h.keyboard.press('Escape'); await h.keyboard.press('Escape'); await wait(300)
  await h.locator('[data-pair-row="live"]').click({ button: 'right' })
  await wait(300)
  await h.locator('[role="menuitem"]', { hasText: 'Pin the layout' }).click()
  await wait(500)
  check('Pin the layout keeps it in Pinned', (await h.evaluate(() => JSON.parse(localStorage.getItem('split-pins') ?? '[]').length)) === 1 && await h.locator('[data-pair-row][data-pinned]').count() === 1)

  // --- 4. Menu icons: a row's, a group's, the ⋯ ----------------------------------------
  await settle()
  const missing = async (what) => {
    const lines = await h.locator('[role="menu"]').last().locator('[role="menuitem"], [role="menuitemcheckbox"]').evaluateAll((all) =>
      all.filter((one) => !one.matches('[data-color-dot]')).map((one) => ({ words: one.textContent.trim(), icon: !!one.querySelector('svg, img, [data-menu-icon]'), dot: !!one.querySelector('.lucide-dot') })))
    const without = lines.filter((one) => !one.icon).map((one) => one.words)
    const plain = lines.filter((one) => one.dot).map((one) => one.words)
    check(`${what}: every line has an icon (${lines.length} lines)`, lines.length > 0 && without.length === 0, without.join(' | '))
    check(`${what}: no line falls back to the plain dot`, plain.length === 0, plain.join(' | '))
    return lines
  }
  await row('The forgetting curve').click({ button: 'right' })
  await wait(400)
  await missing('row menu')
  await h.screenshot({ path: `${dir}/row-menu-light.png` })
  await settle()
  await h.locator('button[aria-label="Haligtree menu"]').click()
  await wait(400)
  await missing('Haligtree ⋯ menu')
  await settle()

  // --- 2. A folded group's notes on hover ---------------------------------------------
  await h.keyboard.press('Control+w'); await wait(500)
  await h.keyboard.press('Control+w'); await wait(500)
  const one = row('Spaced repetition, a primer')
  const two = row('Reading list for October')
  {
    const a = await two.boundingBox()
    const b = await one.boundingBox()
    await h.mouse.move(a.x + 60, a.y + a.height / 2)
    await h.mouse.down()
    await h.mouse.move(a.x + 60, a.y + a.height / 2 + 8, { steps: 4 })
    await h.mouse.move(b.x + 60, b.y + b.height / 2, { steps: 24 })
    await wait(300)
    await h.mouse.up()
    await wait(700)
    await h.keyboard.type('Memory')
    await h.keyboard.press('Enter')
    await wait(500)
  }
  const head = h.locator('[data-group-row]').first()
  check('a group of two formed by dragging (group drags still work)', await head.count() === 1 && (await v('groups', 'article')).length === 1)
  await head.click()
  await wait(600)
  check('folded', (await head.getAttribute('aria-expanded')) === 'false')
  await h.locator('[data-group-row]').first().click({ button: 'right' })
  await wait(400)
  await missing('group menu')
  await h.screenshot({ path: `${dir}/group-menu-light.png` })
  await settle()
  const hb = await head.boundingBox()
  await h.mouse.move(hb.x + 30, hb.y + hb.height / 2, { steps: 3 })
  await h.mouse.move(hb.x + 50, hb.y + hb.height / 2, { steps: 3 })
  await wait(1200)
  check('hovering a folded group brings up nothing over the list', await h.locator('[data-group-peek]').count() === 0)
  await settle()

  // --- A Home tile to the left ---------------------------------------------------------
  // From one pane, so the tile has a place of its own to open in.
  for (let i = 0; i < 4 && (await panes()).length > 1; i++) { await h.keyboard.press('Control+w'); await wait(500) }
  await c.go('home')
  await wait(800)
  const tile = h.locator('[data-pane] [data-drag-open]').first()
  if (await tile.count()) {
    const had = (await panes()).length
    await tile.scrollIntoViewIfNeeded(); await wait(300)
    const what = `${await tile.getAttribute('data-drag-open')} ${JSON.stringify(await tile.boundingBox())}`
    const zonesSeen = await toSide(tile, 'left')
    check('a Home tile dropped on the left opens there', (await panes()).length === Math.min(had + 1, 4), `${had} panes before, ${(await panes()).length} after; ${what}; places ${JSON.stringify(zonesSeen)}`)
    await h.keyboard.press('Control+w'); await wait(600)
  } else check('a Home tile to carry', false)

  // --- Dark --------------------------------------------------------------------------
  await c.theme('dark')
  await c.size(1400, 880)
  await c.go('articles')
  await wait(800)
  await toSide(row('The forgetting curve'), 'right', { frames: 'magnet-dark' })
  await wait(400)
  await h.locator('[data-pair-row]').first().click({ button: 'right' })
  await wait(400)
  await h.screenshot({ path: `${dir}/pair-menu-dark.png` })
  await settle()
  await settle()
  await row('Interleaving beats blocking').click({ button: 'right' })
  await wait(400)
  await h.screenshot({ path: `${dir}/row-menu-dark.png` })
  await settle()
  check('no page errors', c.errors.length === 0, c.errors.slice(0, 3).join(' | '))
} catch (error) {
  console.error(error)
  results.push(false)
} finally {
  await c.close()
}
const failed = results.filter((ok) => !ok).length
console.log(`\n${results.length - failed}/${results.length} passed`)
process.exit(failed ? 1 : 0)
