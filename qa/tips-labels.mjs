// Tips that never get cut, and two details islands said plainly.
// 68: a tile's name shows whole on the tile, and a tile's tip (the rail of
// pictures, a grid tile cut short) stays inside the window, at 900x700 and
// 1600x1000; a name already shown whole gets no tip. 69: a note's question
// routes say what they do: "Start an open question from this" and "Add as a
// clue to a question…", each with its own icon and tip. 70: "Hide until",
// four even choices, and "Hidden until …" with "Show now" only while hidden.
//
//   npx electron-vite build --outDir out-x
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-x/main/index.js HALIGTREE_QA_AWAY=1 SHOTS=<dir> node qa/tips-labels.mjs
import { mkdirSync } from 'fs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const dir = process.env.SHOTS ?? `${process.env.QA_DATA}/shots`
mkdirSync(dir, { recursive: true })
const results = []
const check = (name, ok, detail = '') => { results.push(!!ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`) }

const c = await sandbox({ width: 1600, height: 1000 })
const { h, v, send } = c
const wait = (ms) => h.waitForTimeout(ms)
const tip = () => h.evaluate(() => { const one = [...document.querySelectorAll('[data-slot="tooltip-content"]:not([data-state="closed"])')].pop(); if (!one) return null; const r = one.getBoundingClientRect(); return { text: one.textContent, left: r.left, right: r.right, top: r.top, bottom: r.bottom, w: innerWidth, h: innerHeight } })
// Pointed at as a hand would, then a rest long enough for any tip to open.
const point = async (locator) => {
  // In from the window's right edge, level with it, so the way there crosses no other control's tip.
  const box = await locator.boundingBox()
  const width = await h.evaluate(() => innerWidth)
  await h.mouse.move(width - 3, box.y + box.height / 2)
  await h.waitForTimeout(400)
  await h.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 6 })
  await h.waitForTimeout(1400)
  // A hand that rests still and sees nothing moves a hair: a tip waits for the pointer to settle on its control.
  if (!(await h.locator('[data-slot="tooltip-content"]:not([data-state="closed"])').count())) {
    await h.mouse.move(box.x + box.width / 2 + 2, box.y + box.height / 2, { steps: 2 })
    await h.waitForTimeout(1200)
  }
}
const tips = () => h.evaluate(() => [...document.querySelectorAll('[data-slot="tooltip-content"]:not([data-state="closed"])')].map((one) => one.textContent).join(' | '))
const inside = (t) => !!t && t.left >= 0 && t.right <= t.w && t.top >= 0 && t.bottom <= t.h
try {
  const long = await v('article:new')
  await v('item:save', long, { title: 'Post using graphics from pictures of the old harbour, the lighthouse and the long walk back at dusk' })
  for (const [w, hh] of [[1600, 1000], [900, 700]]) {
    await c.size(w, hh)
    // Small tiles: the name on the tile, whole.
    await h.evaluate(() => localStorage.setItem('view:article', JSON.stringify({ sort: 'newest', group: 'none', filter: {}, density: 'small' })))
    await h.reload()
    await wait(1500)
    await c.go('articles')
    await wait(900)
    const tile = h.locator(`button[data-row][data-id="${long}"]`)
    await tile.hover()
    await wait(500)
    const name = await tile.locator('[data-tile-name]').evaluate((one) => ({ cut: one.scrollWidth > one.clientWidth + 1, lines: Math.round(one.getBoundingClientRect().height) }))
    check(`${w}: a small tile's name is never cut at its edge`, !name.cut, JSON.stringify(name))
    await h.screenshot({ path: `${dir}/68-small-${w}.png` })
    // Grid tiles: a title cut short gets its whole name in a tip, inside the window; one shown whole, none.
    await h.evaluate(() => localStorage.setItem('view:article', JSON.stringify({ sort: 'newest', group: 'none', filter: {}, density: 'grid' })))
    await h.reload()
    await wait(1500)
    await c.go('articles')
    await wait(900)
    await point(h.locator(`button[data-row][data-id="${long}"] [data-tile-title]`))
    const cutTip = await tip()
    check(`${w}: a grid title cut short shows its whole name in a tip`, cutTip?.text?.startsWith('Post using graphics'), JSON.stringify(cutTip))
    check(`${w}: and the tip is inside the window`, inside(cutTip), JSON.stringify(cutTip))
    await h.mouse.move(2, 2)
    await wait(400)
    const whole = await h.evaluate(() => [...document.querySelectorAll('[data-tile-title]')].find((one) => one.scrollWidth <= one.clientWidth)?.closest('button[data-row]')?.dataset.id)
    if (whole) {
      await point(h.locator(`button[data-row][data-id="${whole}"] [data-tile-title]`))
      check(`${w}: a title shown whole gets no tip`, !(await tip()), JSON.stringify(await tip()))
      await h.mouse.move(2, 2)
      await wait(300)
    }
    // The rail of pictures beside an open note: every tile's tip inside the window.
    await h.evaluate(() => localStorage.setItem('view:article', JSON.stringify({ sort: 'newest', group: 'none', filter: {}, density: 'list', pane: 'rail' })))
    await h.reload()
    await wait(1500)
    await send('article', long)
    await wait(1500)
    const rail = h.locator('button[data-row]')
    const n = Math.min(6, await rail.count())
    let out = 0
    for (let at = 0; at < n; at++) {
      await rail.nth(at).hover()
      await wait(700)
      const one = await tip()
      if (one && !inside(one)) out++
      await h.mouse.move(w - 5, hh - 5)
      await wait(200)
    }
    // Narrow, the window has no room for the rail beside the note: nothing to point at.
    if (!n) console.log(`INFO  ${w}: no rail beside the note at this width`)
    else {
      check(`${w}: every tip on the rail of pictures stays inside the window`, out === 0, `${out} of ${n} outside`)
      await rail.first().hover()
      await wait(700)
      await h.screenshot({ path: `${dir}/68-rail-${w}.png` })
    }
  }
  await c.size(1400, 900)
  await h.evaluate(() => localStorage.setItem('view:article', JSON.stringify({ sort: 'newest', group: 'none', filter: {}, density: 'list' })))

  // --- 69: a note's question routes
  const note = await h.evaluate(() => window.api.captures.create({ kind: 'note', body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Why do harbours silt up?' }] }] } }))
  await send('capture', note)
  await wait(1500)
  const details = h.locator('button[aria-label="Details"][aria-pressed="false"]').first()
  if (await details.count()) { await details.click(); await wait(900) }
  const status = h.locator('[data-details-group="Status"] button[aria-expanded="false"]')
  if (await status.count()) { await status.click(); await wait(400) }
  // The "100 captures kept" card the new note earned, put away so it is not what is pointed at.
  await h.locator('[data-celebration] button[aria-label="Dismiss"]').click({ force: true }).catch(() => {})
  await wait(600)
  const start = h.getByRole('button', { name: /Start an open question from this/ }).first()
  const add = h.getByRole('button', { name: /Add as a clue to a question…/ }).first()
  check('"Start an open question from this" is offered, whole', await start.count() === 1 && await start.evaluate((one) => ![...one.querySelectorAll('span')].some((two) => two.scrollHeight > two.clientHeight + 2 || two.scrollWidth > two.clientWidth + 1)))
  check('"Add as a clue to a question…" is offered', await add.count() === 1)
  const icons = await h.evaluate(() => [...document.querySelectorAll('button')].filter((one) => /Start an open question|Add as a clue to a question/.test(one.textContent)).map((one) => one.querySelector('svg')?.innerHTML))
  check('each with its own icon', icons.length === 2 && icons[0] !== icons[1])
  await point(start)
  check('the first says what a question is', (await tips()).includes('collects clues, and is never tested'), await tips())
  await point(add)
  check('the second says where the note goes', (await tips()).includes('Files this note under a question you already have'), await tips())
  await h.screenshot({ path: `${dir}/69-status.png` })
  await h.mouse.move(2, 2)
  await c.go('inbox')
  await wait(900)
  await h.locator(`button[data-row][data-id="${note}"]`).first().click({ button: 'right' })
  await wait(400)
  const items = await h.evaluate(() => [...document.querySelectorAll('[role=menuitem]')].map((one) => one.textContent.trim()))
  check('the Inbox row\'s menu says it the same way', items.some((one) => one.startsWith('Add as a clue to a question…')) && !items.some((one) => one.startsWith('Add to a question…')), items.join(' | '))
  await h.keyboard.press('Escape')

  // --- 70: Hide until
  await v('task:add', 'Probe a hidden task')
  const task = (await v('tasks')).find((one) => one.title === 'Probe a hidden task')
  for (const theme of ['light', 'dark']) {
    await c.theme(theme)
    await send('task', task.id)
    await wait(1500)
    const island = h.locator('section', { has: h.locator('[data-show-again]') }).first()
    check(`${theme}: the island is called "Hide until"`, (await island.innerText()).startsWith('Hide until'))
    const labels = await island.locator('[data-show-again] > *').allInnerTexts()
    check(`${theme}: with Tomorrow, Next week, Next month and Pick a day…`, labels.join('|') === 'Tomorrow|Next week|Next month|Pick a day…', labels.join('|'))
    const sizes = await island.locator('[data-show-again] > *').evaluateAll((all) => all.map((one) => `${Math.round(one.getBoundingClientRect().width)}x${Math.round(one.getBoundingClientRect().height)}`))
    check(`${theme}: the four even`, new Set(sizes).size === 1, sizes.join(','))
    const cut = await island.locator('[data-show-again] > *').evaluateAll((all) => all.filter((one) => one.scrollWidth > one.clientWidth + 1 || [...one.querySelectorAll('*')].some((two) => two.scrollWidth > two.clientWidth + 1)).length)
    check(`${theme}: and none cut short`, cut === 0, String(cut))
    check(`${theme}: shown, it says nothing more`, await island.locator('[data-hidden-until]').count() === 0)
    await island.getByRole('button', { name: 'Tomorrow' }).click()
    await wait(800)
    const said = await island.locator('[data-hidden-until]').innerText().catch(() => '')
    check(`${theme}: hidden, one plain line says until when, with "Show now"`, /^Hidden until \w{3} \d{1,2} \w{3}/.test(said) && said.includes('Show now'), said)
    const cutLine = await island.locator('[data-hidden-until] *').evaluateAll((all) => all.filter((one) => one.scrollWidth > one.clientWidth + 1).length)
    check(`${theme}: and the line is never cut`, cutLine === 0, String(cutLine))
    await h.screenshot({ path: `${dir}/70-hide-until-${theme}.png` })
    await island.getByRole('button', { name: 'Show now' }).click()
    await wait(800)
    check(`${theme}: "Show now" brings it back, and the line goes`, await island.locator('[data-hidden-until]').count() === 0)
  }
  check('no errors on the page', c.errors.length === 0, c.errors.slice(0, 3).join(' | '))
} finally { await c.close() }
const passed = results.filter(Boolean).length
console.log(`\n${passed}/${results.length} passed`)
process.exit(passed === results.length ? 0 : 1)
