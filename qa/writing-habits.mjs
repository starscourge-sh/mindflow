// Words written and habits, end to end. Words: a note's words gained count
// for today, words taken out never count against you, and Stats shows today,
// the week, today's notes and a year of writing days. Habits: this season's
// habits get a tick on Close the day (a press, or its number key), and Stats
// draws each as a grid with its runs, its longest gap and the trend, a gap
// pointed at showing that night's own words. No reminders, no streak shame.
//
//   npx electron-vite build --outDir out-x
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-x/main/index.js MINDFLOW_QA_AWAY=1 SHOTS=<dir> node qa/writing-habits.mjs
import { mkdirSync } from 'fs'
import { sandbox } from './sandbox-lib.mjs'

const dir = process.env.SHOTS ?? `${process.env.QA_DATA}/shots`
mkdirSync(dir, { recursive: true })
const results = []
const check = (name, ok, detail = '') => { results.push(!!ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`) }

// In the evening, whatever the real clock says: past midnight, Close the day closes the day before.
const c = await sandbox({ width: 1400, height: 1000, at: '21:00' })
const { h, v } = c
const wait = (ms) => h.waitForTimeout(ms)
const day = (ago) => { const d = new Date(Date.now() - ago * 86400000); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
const doc = (text) => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] })
try {
  // --- 47: words written
  const before = await v('words:stats')
  const id = await h.evaluate(() => window.api.captures.create({ kind: 'note', body: { type: 'doc', content: [{ type: 'paragraph' }] } }))
  const save = (text) => h.evaluate(([id, body]) => window.api.captures.save(id, { body }), [id, doc(text)])
  await save('one two three four five')
  await save('one two three four five six seven eight nine ten eleven twelve')
  let after = await v('words:stats')
  check('words gained count for today', after.today - before.today === 12, `${before.today} → ${after.today}`)
  await save('one two three')
  after = await v('words:stats')
  check('words taken out never count against you', after.today - before.today === 12, String(after.today - before.today))
  check('the note is listed with its words today', after.notes.some((one) => one.id === id && one.words === 12), JSON.stringify(after.notes.slice(0, 3)))
  check('and this week counts them too', after.week >= after.today)
  for (const theme of ['light', 'dark']) {
    await c.theme(theme)
    for (const [w, hh] of [[1600, 1000], [900, 700]]) {
      await c.size(w, hh)
      await c.go('stats')
      await wait(900)
      const cell = await h.evaluate((today) => document.querySelector(`[data-days-heatmap] [data-day="${today}"]`)?.dataset.amount, day(0))
      check(`${theme} ${w}: Stats' writing heatmap has today's words`, Number(cell) === after.today, String(cell))
      check(`${theme} ${w}: and says the week in words`, await h.locator('[data-words-week]').count() === 1)
      const spill = await h.evaluate((today) => { const box = document.querySelector('[data-words-year]')?.getBoundingClientRect(); const cell = document.querySelector(`[data-words-year] [data-day="${today}"]`)?.getBoundingClientRect(); return box && cell ? Math.round(box.right - cell.right) : null }, day(0))
      check(`${theme} ${w}: today's day is in view, inside its island`, spill !== null && spill >= 0, String(spill))
      await h.locator('[data-words-week]').scrollIntoViewIfNeeded()
      await h.screenshot({ path: `${dir}/47-writing-${theme}-${w}.png` })
    }
  }
  await c.theme('light')
  await c.size(1400, 1000)

  // --- 48: habits on Close the day
  await v('settings:set', { habits: ['Read twenty pages', 'Walk outside'] })
  // A few nights before: read on most, missed one, with a line written that night.
  for (const ago of [1, 2, 4, 5, 6]) await v('habits:tick', day(ago), 'Read twenty pages', true)
  await v('journal:save', day(3), 'well', 'Dad was in the hospital')
  await h.evaluate(() => window.dispatchEvent(new CustomEvent('vigil:close-day')))
  await wait(1200)
  const boxes = await h.locator('[data-close-habits] [role=checkbox]').count()
  check('Close the day has a tick for each of the season\'s habits', boxes === 2, String(boxes))
  await h.locator('[data-close-day]').click({ position: { x: 5, y: 5 } })
  await h.keyboard.press('1')
  await wait(400)
  check('its number key ticks it', (await h.getAttribute('[data-habit="Read twenty pages"]', 'aria-checked')) === 'true')
  await h.locator('[data-habit="Walk outside"]').click()
  await wait(400)
  check('a press ticks one too', (await v('habits:day', day(0))).length === 2)
  await h.locator('[data-close-habits]').scrollIntoViewIfNeeded()
  await h.screenshot({ path: `${dir}/48-close-day.png` })
  await h.locator('[data-habit="Walk outside"]').click()
  await wait(300)
  check('and a second press takes it back', !(await v('habits:day', day(0))).includes('Walk outside'))
  await h.keyboard.press('Escape')
  await wait(500)
  for (const theme of ['light', 'dark']) {
    await c.theme(theme)
    await c.go('stats')
    await wait(1000)
    const grid = h.locator('[data-habit-grid="Read twenty pages"]')
    check(`${theme}: Stats draws a grid for each habit`, await grid.count() === 1 && await h.locator('[data-habit-grid="Walk outside"]').count() === 1)
    const said = await grid.locator('[data-habit-numbers]').evaluate((one) => ({ ...one.dataset }))
    check(`${theme}: with its run, longest run and longest gap`, said.run === '3' && said.best === '3' && said.gap === '1', JSON.stringify(said))
    check(`${theme}: and never a word of shame`, !/broke|broken|lost|failed|missed/i.test(await h.locator('[data-habit-grid]').first().locator('..').innerText()))
    await grid.scrollIntoViewIfNeeded()
    await grid.locator(`[data-habit-day="${day(3)}"]`).hover()
    await wait(900)
    const tip = await h.evaluate(() => [...document.querySelectorAll('[data-slot="tooltip-content"]')].map((one) => one.textContent).join(' | '))
    check(`${theme}: a gap pointed at shows that night's own words`, tip.includes('Dad was in the hospital'), tip)
    await h.screenshot({ path: `${dir}/48-stats-${theme}.png` })
    await h.mouse.move(5, 5)
  }
  check('no errors on the page', c.errors.length === 0, c.errors.slice(0, 3).join(' | '))
} finally { await c.close() }
const passed = results.filter(Boolean).length
console.log(`\n${passed}/${results.length} passed`)
process.exit(passed === results.length ? 0 : 1)
