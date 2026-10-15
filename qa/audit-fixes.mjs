// The design audit's findings, kept fixed: task circles readable on every list,
// every Settings switch and slider named, one top heading and a main area,
// readable hints, Matrix rows sized to their tasks, filter chips never cut in
// half (Everything, quick capture), no preview cards on Tab through the
// sidebar, quiet squares in dark lists, Create more reachable by Tab, ⇧⇥ out
// of Today's page, a wider target on the tick circle, one light that never
// goes dark between rows, an App icon picker that never nudges, and the
// wording the glossary settles.
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-x/main/index.js MINDFLOW_QA_AWAY=1 node qa/audit-fixes.mjs
// SHOTS=dir keeps pictures.
import { mkdirSync } from 'fs'
import { sandbox } from './sandbox-lib.mjs'

const SHOTS = process.env.SHOTS
if (SHOTS) mkdirSync(SHOTS, { recursive: true })
const results = []
const check = (name, ok, detail = '') => (results.push(!!ok), console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`))
const c = await sandbox({ width: 1300, height: 860 })
const { h, go, v, page, theme } = c
const shot = async (name, on = h) => SHOTS && on.screenshot({ path: `${SHOTS}/${name}.png` })

// Contrast of an element's colour (or border colour) against what is really behind it.
const CONTRAST = `(() => {
  const parse = (s) => { const m = s.match(/[\\d.]+/g)?.map(Number) ?? [0, 0, 0, 1]; return { r: m[0], g: m[1], b: m[2], a: m.length > 3 ? m[3] : 1 } }
  const behind = (el) => { for (let one = el; one; one = one.parentElement) { const bg = parse(getComputedStyle(one).backgroundColor); if (bg.a > 0.9) return bg } return parse(getComputedStyle(document.body).backgroundColor) }
  const lum = ({ r, g, b }) => { const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4 }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b) }
  const mix = (fg, bg) => ({ r: fg.r * fg.a + bg.r * (1 - fg.a), g: fg.g * fg.a + bg.g * (1 - fg.a), b: fg.b * fg.a + bg.b * (1 - fg.a) })
  return (el, colour) => { const bg = behind(el.parentElement ?? el); const fg = mix(parse(colour), bg); const [hi, lo] = [lum(fg), lum(bg)].sort((x, y) => y - x); return Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100 }
})()`

try {
  await v('settings:set', { sounds: false, hintRate: 0, motion: true })
  await v('onboarding:set', { pageHints: false })
  await theme('paper')

  // 1. The tick circle on Upcoming reads as a control (3:1), as on Everything.
  await go('upcoming')
  const ring = await h.evaluate(`(() => { const c = ${CONTRAST}; const all = [...document.querySelectorAll('[data-task-tick]')]; return all.length ? Math.min(...all.map((one) => c(one, getComputedStyle(one).borderTopColor))) : null })()`)
  check('Upcoming: every tick circle reaches 3:1', ring !== null && ring >= 3, `lowest ${ring}:1`)
  const hit = await h.evaluate(() => { const one = document.querySelector('[data-task-tick]'); if (!one) return null; const r = one.getBoundingClientRect(); const after = getComputedStyle(one, '::after'); return { w: r.width - 2 * parseFloat(after.left), h: r.height - 2 * parseFloat(after.top) } })
  check('the tick circle takes a click over at least 24px', hit && hit.w >= 24 && hit.h >= 24, JSON.stringify(hit))
  await shot('paper-upcoming')

  // 2. Settings: every switch and slider has a name; one top heading; a main area.
  await go('settings')
  const unnamed = await h.evaluate(() => [...document.querySelectorAll('[role="switch"], [role="slider"]')].filter((one) => one.getBoundingClientRect().width > 0 && !(one.getAttribute('aria-label') || one.getAttribute('aria-labelledby'))).length)
  const named = await h.evaluate(() => document.querySelectorAll('[role="switch"][aria-label], [role="slider"][aria-label]').length)
  check('Settings: no switch or slider without a name', unnamed === 0 && named > 5, `${unnamed} unnamed, ${named} named`)
  const motionName = await h.evaluate(() => [...document.querySelectorAll('[role="switch"]')].map((one) => one.getAttribute('aria-label')).includes('Motion'))
  check('a switch is named by its setting (“Motion”)', motionName)
  const heads = await h.evaluate(() => [...document.querySelectorAll('h1')].filter((one) => one.getBoundingClientRect().width > 0).map((one) => one.textContent.trim()))
  check('Settings: one top heading', heads.length === 1, heads.join(' | '))
  check('the main window has a main area', await h.evaluate(() => document.querySelectorAll('main, [role="main"]').length === 1))
  // The App icon picker: choosing one never moves its neighbours.
  const icons = () => h.evaluate(() => [...document.querySelectorAll('[role="radiogroup"][aria-label="App icon"] > button')].map((one) => { const r = one.getBoundingClientRect(); return [Math.round(r.x * 10) / 10, Math.round(r.width * 10) / 10] }))
  const before = await icons()
  await h.locator('[role="radiogroup"][aria-label="App icon"] > button[aria-label="Gold leaves"]').click()
  await h.waitForTimeout(400)
  const after = await icons()
  check('App icon: choosing one moves nothing beside it', before.length === 3 && JSON.stringify(before) === JSON.stringify(after), `${JSON.stringify(before)} → ${JSON.stringify(after)}`)
  await h.locator('[role="radiogroup"][aria-label="App icon"] > button[aria-label="Lights"]').click()
  await h.locator('[data-section="Help"]').first().click()
  await h.waitForTimeout(500)
  check('Settings says “What pages are for”', await h.evaluate(() => !!document.querySelector('[data-setting-title="What pages are for"]')))

  // 3. Everything: the kind chips wrap rather than cut a word, and the tasks' choice says Open.
  await go('all')
  const clipped = await h.evaluate(() => { const row = document.querySelector('[data-everything-filter]'); if (!row) return null; const edge = row.getBoundingClientRect().right; return [...row.querySelectorAll('button')].filter((one) => one.getBoundingClientRect().right > edge + 1 || one.scrollWidth > one.clientWidth + 1).map((one) => one.textContent.trim()) })
  check('Everything: no filter chip is cut off', clipped && clipped.length === 0, JSON.stringify(clipped))
  check('Everything: the tasks’ choice reads Open, Done, Both', await h.evaluate(() => [...document.querySelectorAll('[data-task-state] button')].map((one) => one.getAttribute('aria-label') ?? one.textContent).join(',') === 'Open,Done,Both'))
  // The light: in the gap between two rows, one row stays lit.
  const gap = await h.evaluate(() => { const rows = [...document.querySelectorAll('[data-row]')].slice(0, 2).map((one) => one.getBoundingClientRect()); return rows.length === 2 ? { x: rows[0].left + 40, y: (rows[0].bottom + rows[1].top) / 2 } : null })
  if (gap) { await h.mouse.move(gap.x, gap.y - 12); await h.mouse.move(gap.x, gap.y, { steps: 3 }); await h.waitForTimeout(250) }
  check('Everything: between two rows the light stays on one', gap && await h.evaluate(() => document.querySelectorAll('[data-row][data-fluid-hover-active]').length === 1))
  await shot('paper-all')
  await c.size(720, 560)
  const narrowClip = await h.evaluate(() => { const row = document.querySelector('[data-everything-filter]'); if (!row) return null; const edge = row.getBoundingClientRect().right; return [...row.querySelectorAll('button')].filter((one) => one.getBoundingClientRect().right > edge + 1).length })
  check('Everything at 720 wide: every chip in sight', narrowClip === 0, `${narrowClip} past the edge`)
  await shot('narrow-all')
  // The icon strip ends on a fade, so no icon reads as cut in two.
  await go('home')
  const strip = await h.evaluate(() => { const el = document.querySelector('.mf-fade-end.mf-fade-tall'); return el ? getComputedStyle(el).maskImage : null })
  check('narrow sidebar: the icon strip fades over more at its foot', !!strip && strip !== 'none', String(strip).slice(0, 80))
  await shot('narrow-home')
  await c.size(1300, 860)

  // 4. Today: the light between tasks, and ⇧⇥ leaves the Page.
  await go('today')
  const tgap = await h.evaluate(() => { const rows = [...document.querySelectorAll('[data-task-row]')].slice(0, 2).map((one) => one.getBoundingClientRect()); return rows.length === 2 ? { x: rows[0].left + 60, y: (rows[0].bottom + rows[1].top) / 2 } : null })
  if (tgap) { await h.mouse.move(tgap.x, tgap.y - 10); await h.mouse.move(tgap.x, tgap.y, { steps: 3 }); await h.waitForTimeout(250) }
  check('Today: between two tasks the light stays on one', tgap && await h.evaluate(() => document.querySelectorAll('[data-task-row][data-fluid-hover-active]').length === 1))
  await h.mouse.move(5, 5)

  // 5. The Matrix: a box with one task does not hold half the page.
  await go('matrix')
  await h.waitForTimeout(500)
  const boxes = await h.evaluate(() => [...document.querySelectorAll('[data-quadrant]')].map((one) => ({ q: one.dataset.quadrant, h: Math.round(one.getBoundingClientRect().height), n: one.querySelectorAll('[data-row]').length, hidden: (() => { const list = one.querySelector('[data-matrix-list]'); return list ? list.scrollHeight - list.clientHeight : 0 })() })))
  const rows = [[boxes[0], boxes[1]], [boxes[2], boxes[3]]].map((pair) => ({ n: Math.max(pair[0].n, pair[1].n), h: pair[0].h }))
  const lighter = rows[0].n < rows[1].n ? rows[0] : rows[1].n < rows[0].n ? rows[1] : null
  const heavier = lighter === rows[0] ? rows[1] : rows[0]
  check('Matrix: the row with fewer tasks is shorter than the busier one', !lighter || lighter.h < heavier.h, JSON.stringify(boxes))
  check('Matrix: no box cuts off its tasks (the page scrolls instead)', boxes.every((one) => one.hidden <= 1), JSON.stringify(boxes.map((one) => one.hidden)))
  await shot('paper-matrix')

  // 6. Tab through the sidebar opens no large preview card.
  await go('inbox')
  await h.mouse.move(700, 500)
  await h.evaluate(() => document.querySelector('[data-side-row]')?.focus())
  let peeked = 0
  for (let i = 0; i < 8; i++) { await h.keyboard.press('Tab'); await h.waitForTimeout(650); peeked += await h.evaluate(() => document.querySelectorAll('[data-slot="tooltip-content"] [data-peek], [data-slot="tooltip-content"].max-w-none').length) }
  check('Tab through the sidebar opens no preview card', peeked === 0, `${peeked} seen`)
  await shot('paper-inbox-tab')

  // 7. Quick capture: the hint reads, the kind chips are whole, Create more takes Tab.
  await page.evaluate(() => window.api.showPrompt())
  await page.waitForTimeout(600)
  // The box's window is see-through, so the hint is measured over the theme's own page colour.
  const hint = await page.evaluate(`(() => { const c = ${CONTRAST}; const p = document.querySelector('.tiptap.ProseMirror .is-empty, .tiptap.ProseMirror p.is-editor-empty'); if (!p) return null
    const pad = document.createElement('div'); pad.style.background = 'var(--background)'; const dot = document.createElement('span'); pad.append(dot); document.body.append(pad)
    const ratio = c(dot, getComputedStyle(p, '::before').color); pad.remove(); return ratio })()`)
  check('quick capture: the “Write a thought…” hint is readable (near 3:1)', hint !== null && hint >= 2.7, `${hint}:1`)
  const panel = page.locator('button[aria-label="Show the side panel"]')
  if (await panel.count()) await panel.first().click()
  await page.waitForTimeout(700)
  const boxClip = await page.evaluate(() => { const row = document.querySelector('[data-filter-chips]'); if (!row) return null; const edge = Math.min(row.getBoundingClientRect().right, document.documentElement.clientWidth); return [...row.querySelectorAll('button')].filter((one) => one.getBoundingClientRect().right > edge + 1).length })
  check('quick capture: the Inbox kind chips are all in sight', boxClip === 0, `${boxClip} past the edge`)
  check('quick capture: “Create more” can be reached with Tab', await page.evaluate(() => { const s = [...document.querySelectorAll('[role="switch"]')].find((one) => one.closest('label')?.textContent?.includes('Create more')); return !!s && s.tabIndex >= 0 }))
  await shot('paper-box', page)
  await page.keyboard.press('Escape')

  // 8. Dark: rows without a picture lead with a quiet square, not a bright tile.
  await theme('dark')
  await go('nuggets')
  const leads = await h.evaluate(() => [...document.querySelectorAll('[data-lead-paper]')].slice(0, 6).map((one) => { const m = getComputedStyle(one).backgroundColor.match(/[\d.]+/g).map(Number); return Math.round((0.2126 * m[0] + 0.7152 * m[1] + 0.0722 * m[2])) }))
  check('dark Gems: picture-less rows lead with a dark square', leads.length > 0 && leads.every((one) => one < 90), JSON.stringify(leads))
  await shot('dark-nuggets')
  await go('matrix')
  await shot('dark-matrix')

  // 9. Wording: a capture taken into a question says where it went, not “Saved as a gem”.
  const open = (await h.evaluate(() => window.api.captures.list())).filter((one) => one.status === 'open' && !one.archivedAt && one.kind !== 'todo')
  const [held, clued] = open
  const question = await v('question:new', '', held.id)
  await v('clue', question, '', clued.id)
  await h.waitForTimeout(400)
  const said = await h.evaluate(([a, b]) => window.api.captures.list().then((all) => [a, b].map((id) => all.find((one) => one.id === id)?.keptIn)), [held.id, clued.id])
  check('a capture made into a question is known as one', String(said[0]).startsWith('question:'), String(said[0]))
  check('a capture given as a clue knows its question', String(said[1]).startsWith('clue:'), String(said[1]))
  // Their rows in Everything, found by scrolling the list (it draws only the rows near the screen).
  await theme('paper')
  await go('all')
  const rowText = (id) => h.evaluate(async (id) => {
    const scroller = [...document.querySelectorAll('[data-row]')][0]?.closest('.overflow-y-auto')
    for (let i = 0; i < 80; i++) {
      const row = document.querySelector(`[data-row][data-id="${id}"]`)
      if (row) return row.textContent
      if (!scroller) return ''
      scroller.scrollTop += 400
      await new Promise((done) => setTimeout(done, 60))
    }
    return ''
  }, id)
  const subs = [await rowText(held.id)]
  await go('home'); await go('all')
  subs.push(await rowText(clued.id))
  check('Everything says “Made into a question” and “A clue in …”, never “Saved as a gem”', subs[0].includes('Made into a question') && subs[1].includes('A clue in') && !subs.join().includes('Saved as a gem'), subs.map((one) => one.slice(0, 80)).join(' | '))
} finally {
  if (c.errors.length) console.log('errors', c.errors.slice(0, 5))
  await c.close()
}
const passed = results.filter(Boolean).length
console.log(`\n${passed}/${results.length} passed`)
process.exit(passed === results.length ? 0 : 1)
