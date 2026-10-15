// Run with: QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out/main/index.js MINDFLOW_QA_AWAY=1 node qa/polish.mjs
// Small things that looked one way and acted another:
//  1. Recent's “Show all” sits on its heading's row, at the right, quiet until
//     the heading is pointed at or reached by Tab; no row of its own below.
//  2. A task row's repeat mark and its tag words are pressable: the repeat
//     mark opens how often it repeats, a tag opens its page, and neither opens
//     the task. In every list that shows task rows.
//  3. The Matrix keeps the priority mark's room in all four boxes, so titles
//     start in one place with or without a mark.
//  4. A note shown as a board has no scroll bar when nothing more is there.
// SHOTS=<dir> saves pictures, light and dark.
import { mkdirSync } from 'fs'
import { sandbox } from './sandbox-lib.mjs'

const SHOTS = process.env.SHOTS
if (SHOTS) mkdirSync(SHOTS, { recursive: true })
const results = []
const check = (name, ok, detail = '') => (results.push(!!ok), console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`))
const c = await sandbox({ width: 1200, height: 860 })
const { h, v, go } = c
const wait = (ms) => h.waitForTimeout(ms)
const shoot = async (name) => SHOTS && (await h.screenshot({ path: `${SHOTS}/${name}.png` }))
const menu = () => h.$$eval('[role="menuitem"]', (all) => all.map((one) => one.textContent?.trim()))
const esc = async () => { for (let i = 0; i < 2; i++) await h.keyboard.press('Escape'); await wait(300) }

try {
  await v('settings:set', { sounds: false, hintRate: 0, countIn: false, sidebarRecent: true })
  await v('onboarding:set', { pageHints: false })

  // --- 1. Recent's Show all on its heading
  const ids = []
  for (let i = 1; i <= 8; i++) ids.push(await h.evaluate((n) => window.api.captures.create({ kind: 'note', body: `Reading note number ${n}` }), i))
  await h.evaluate((ids) => {
    const now = Date.now()
    localStorage.setItem('sidebar:open-today', JSON.stringify(ids.map((id, at) => ({ type: 'capture', id, since: new Date(now - (8 - at) * 60000).toISOString(), at: new Date(now - (8 - at) * 60000).toISOString() }))))
    localStorage.setItem('sidebar:open-ever', '1')
  }, ids)
  await h.reload(); await wait(2500)
  const place = await h.evaluate(() => {
    const all = document.querySelector('[data-recent-all]')
    const head = document.querySelector('[data-open-heading]')
    if (!all || !head) return null
    const a = all.getBoundingClientRect(), b = head.getBoundingClientRect(), side = document.querySelector('[data-open-today]').getBoundingClientRect()
    return { sameRow: Math.abs((a.top + a.bottom) / 2 - (b.top + b.bottom) / 2) < 3, right: side.right - a.right < 12, opacity: getComputedStyle(all).opacity, rows: document.querySelectorAll('[data-open-today] > [data-recent-all], [data-open-today] > span > [data-recent-all]').length }
  })
  check('“Show all” is on the Recent heading row', place?.sameRow, JSON.stringify(place))
  check('…at its right end', place?.right)
  check('…quiet at rest', place && Number(place.opacity) < 0.1, place?.opacity)
  check('no “Show all” row of its own under the notes', place && place.rows === 0)
  await h.hover('[data-open-heading]'); await wait(300)
  const lit = await h.$eval('[data-recent-all]', (one) => getComputedStyle(one).opacity)
  check('pointing at the heading shows it', Number(lit) > 0.9, lit)
  await shoot('1-recent-hover-light')
  await h.mouse.move(600, 500); await wait(300)
  await h.focus('[data-recent-all]'); await wait(300)
  const focused = await h.$eval('[data-recent-all]', (one) => getComputedStyle(one).opacity)
  check('reached by Tab it shows', Number(focused) > 0.9, focused)
  await h.keyboard.press('Enter'); await wait(900)
  check('Enter on it opens the Recent panel', await h.evaluate(() => !!document.querySelector('aside[aria-label="Recent"]')))
  await h.keyboard.press('Meta+Shift+y'); await wait(500)

  // --- 2. Repeat mark and tags pressable on task rows
  const routine = (await v('task:add', 'Water the ferns every day #garden', undefined, true)).id
  const plain = (await v('task:add', 'Sketch the old bridge today #drawing', undefined, true)).id
  await v('task:save', routine, { due: new Date().toISOString() })
  await v('task:add', 'Return the library books tomorrow #reading', undefined, true)
  const opened = (id) => h.evaluate((id) => !!document.querySelector(`[data-open="${id}"]`), id)
  await go('upcoming'); await wait(400)
  await go('today'); await wait(900)
  const mark = h.locator(`[data-id="${routine}"] [data-chip-choices]:has([data-repeat-mark])`).first()
  check('Today: the repeat mark is a control', (await mark.count()) === 1)
  if (await mark.count()) {
    check('…with a pointer', (await mark.evaluate((one) => getComputedStyle(one).cursor)) === 'pointer')
    check('…reachable by Tab', (await mark.getAttribute('tabindex')) === '0')
    let tip = ''
    for (let i = 0; i < 3 && !/Click to change/.test(tip); i++) {
      await h.mouse.move(5, 5); await wait(300)
      await mark.hover(); await wait(1000)
      tip = await h.evaluate(() => [...document.querySelectorAll('[data-slot="tooltip-content"], [role="tooltip"]')].map((one) => one.textContent).join(' '))
    }
    check('…its tip says what a click does', /Click to change how often it repeats/.test(tip), tip.slice(0, 90))
    await mark.click(); await wait(500)
    const lines = await menu()
    check('click: how often it repeats', lines.some((one) => one.startsWith('Every week')) && lines.some((one) => one.startsWith('Stop repeating')), lines.join(' / '))
    check('…and the task is not opened', !(await opened(routine)))
    await h.locator('[role="menuitem"]', { hasText: /^Every week$/ }).first().click(); await wait(900)
    check('choosing “Every week” saves it', (await v('task', routine))?.recurrence === 'every week')
    await shoot('2-today-repeat-light')
    await h.keyboard.press('Meta+z'); await wait(800)
  }
  // The task's own menu has the same choices.
  await h.locator(`[data-row][data-id="${routine}"]`).first().click({ button: 'right' }); await wait(500)
  const own = await menu()
  check('its right-click menu has “Repeats: …” too', own.some((one) => /^Repeats: every/.test(one)), own.join(' / ').slice(0, 200))
  await esc()

  const tag = h.locator(`[data-id="${plain}"] [data-tag-go][data-tag="drawing"]`).first()
  check('Today: a tag word is a control', (await tag.count()) === 1)
  if (await tag.count()) {
    check('…with a pointer', (await tag.evaluate((one) => getComputedStyle(one).cursor)) === 'pointer')
    check('…reachable by Tab', (await tag.getAttribute('tabindex')) === '0')
    await tag.click(); await wait(1200)
    const page = await h.evaluate(() => document.querySelector('[data-side-tag="drawing"][aria-current="page"]') ? 'drawing' : [...document.querySelectorAll('h1, h2')].map((one) => one.textContent).join(' / '))
    check('click: the tag\'s page opens', /drawing/i.test(page), page.slice(0, 80))
    check('…and the task is not opened', !(await opened(plain)))
    await shoot('2-tag-page-light')
  }

  // Everywhere task rows show.
  for (const [view, needRepeat] of [['home', false], ['today', true], ['upcoming', false], ['week', true], ['matrix', true], ['routines', true]]) {
    await go(view); await wait(900)
    const tags = await h.locator('[data-tag-go]').count()
    const repeats = await h.locator('[data-chip-choices]:has([data-repeat-mark])').count()
    // A tag word or a repeat sign drawn but not pressable, anywhere on the page.
    const dead = await h.evaluate(() => document.querySelectorAll('[data-tag]:not([data-tag-go]), svg.lucide-repeat, svg.lucide-repeat-2').length)
    check(`${view}: tags and repeat marks pressable`, tags + repeats > 0 && (!needRepeat || repeats > 0) && dead === 0, `${tags} tags, ${repeats} repeat marks, ${dead} not pressable`)
  }

  // --- 3. Matrix titles line up
  const t1 = (await v('task:add', 'Charge the lantern today', undefined, true)).id
  await v('task:add', 'Buy matches today', undefined, true)
  await v('task:save', t1, { priority: 2 })
  await go('matrix'); await wait(900)
  const card = (title) => h.evaluate((t) => { const b = [...document.querySelectorAll('button')].find((one) => one.textContent.includes(t)); const r = b?.querySelector('.line-clamp-2')?.getBoundingClientRect(); const o = b?.getBoundingClientRect(); return r && o ? Math.round((r.left - o.left) * 10) / 10 : null }, title)
  const [m1, m2] = [await card('Charge the lantern'), await card('Buy matches')]
  check('Matrix: titles line up with and without a mark', m1 !== null && m1 === m2, `${m1} / ${m2}`)
  await shoot('3-matrix-light')

  // --- 4. A board with nothing more to see does not scroll
  const board = await h.evaluate((body) => window.api.captures.create({ body }), '## Trip\n\n- Book flights\n- Pack\n\n## Doing\n\n- Pick a route\n\n## Done\n\n- Ask for time off')
  await go('inbox'); await c.send('capture', board); await wait(1200)
  await h.keyboard.press('Alt+Meta+b'); await wait(1200)
  check('board: shown', await h.evaluate(() => !!document.querySelector('[data-board]')))
  // Up and down, inside the page (the sidebar scrolls on its own): a box that
  // scrolls must have something past its fold, and the board is never cut off.
  const bars = () => h.evaluate(() => {
    const page = document.querySelector('[data-board]')?.closest('[class*="@container/page"]')
    if (!page) return ['no page']
    const found = []
    for (const el of [page, ...page.querySelectorAll('*')]) {
      if (!el.checkVisibility?.()) continue
      if (!/auto|scroll/.test(getComputedStyle(el).overflowY)) continue
      const down = el.scrollHeight - el.clientHeight
      if (down > 2) found.push(`${el.tagName.toLowerCase()}.${String(el.className).split(/\s+/).slice(0, 4).join('.')} ↓${down}`)
    }
    const b = document.querySelector('[data-board]').getBoundingClientRect(), p = page.getBoundingClientRect()
    if (b.bottom > p.bottom + 1) found.push(`board cut off by ${Math.round(b.bottom - p.bottom)}px`)
    return found
  })
  const wide = await bars()
  check('board: no scroll bar up and down when everything fits', wide.length === 0, wide.join(' | ').slice(0, 300))
  await shoot('4-board-light')
  await c.size(760, 560)
  const small = await bars()
  check('…nor in a small window', small.length === 0, small.join(' | ').slice(0, 300))
  await shoot('4-board-small-light')
  await c.size(1200, 860)
  await h.keyboard.press('Alt+Meta+b'); await wait(600)

  // The same, dark.
  if (SHOTS) {
    await c.theme('dark')
    await go('today'); await wait(900)
    await h.hover('[data-open-heading]'); await wait(400)
    await shoot('5-today-recent-dark')
    await go('matrix'); await wait(900)
    await shoot('5-matrix-dark')
  }
  check('no errors', !c.errors.length, c.errors.slice(0, 2).join(' | '))
} catch (error) {
  check('ran to the end', false, error.message.split('\n')[0])
} finally {
  await c.close()
}
const passed = results.filter(Boolean).length
console.log(`\n${passed}/${results.length} passed`)
process.exit(passed === results.length ? 0 : 1)
