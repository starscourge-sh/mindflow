// Run with: QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out/main/index.js HALIGTREE_QA_AWAY=1 node qa/filters.mjs
// A choice sits on the thing it is about, and only while that thing is on screen:
//   1. Everything: which tasks show (Open, Done, Both) rides on the Task chip,
//      a menu reached by click or keys; no bare "Tasks" label; gone with only Note picked.
//   2. Everything: the captures made into tasks are a box to tick, worded as such, not a kind chip.
//   3+. The same kind of problem, swept across the app (see each section).
// SHOTS=<dir> saves screenshots, light and dark.
import { mkdirSync } from 'fs'
import { sandbox } from './sandbox-lib.mjs'

const SHOTS = process.env.SHOTS
if (SHOTS) mkdirSync(SHOTS, { recursive: true })
const results = []
const check = (name, ok, detail = '') => (results.push(!!ok), console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`))
const c = await sandbox({ width: 1200, height: 860 })
const { h, go, v } = c
const wait = (ms) => h.waitForTimeout(ms)
const shoot = async (name) => SHOTS && (await h.screenshot({ path: `${SHOTS}/${name}.png` }))
const P = '[data-page="all"]'
const kind = (label) => h.locator(`${P} [data-everything-filter] button[aria-pressed]`, { hasText: new RegExp(`^${label}$`) }).first()
const pressed = (label) => kind(label).getAttribute('aria-pressed', { timeout: 1500 }).then((one) => one === 'true').catch(() => false)
const set = async (label, on) => { if ((await pressed(label)) !== on) { await kind(label).click(); await wait(500) } }
const state = () => h.locator(`${P} [data-task-state]`).first()
const menu = () => h.evaluate(() => [...document.querySelectorAll('[role=menu] [role=menuitemradio]')].map((one) => ({ text: one.textContent.trim(), on: one.getAttribute('aria-checked') === 'true' })))

try {
  await v('settings:set', { sounds: false, hintRate: 0, countIn: false })
  await v('onboarding:set', { pageHints: false })
  await h.evaluate(() => { localStorage.removeItem('view:everything:tasks'); localStorage.removeItem('view:everything:made') })
  // A capture made into a task, so the box for those shows.
  const made = await h.evaluate(() => window.api.captures.create({ kind: 'note', body: 'Sort the reading list by topic' }))
  await v('toTask', made)
  await h.reload(); await wait(2500)
  await go('all'); await wait(1000)

  // 1. Which tasks show, on the Task chip.
  const filter = () => h.evaluate((P) => {
    const box = document.querySelector(`${P} [data-everything-filter]`)
    if (!box) return null
    const split = box.querySelector('[data-chip-split]')
    return {
      text: box.innerText.replace(/\s+/g, ' '),
      bare: [...box.querySelectorAll('*')].some((one) => one.children.length === 0 && one.textContent.trim() === 'Tasks'),
      group: !!box.querySelector('[role=group][aria-label="Which tasks"]'),
      onTask: !!split && /Task/.test(split.querySelector('button[aria-pressed]')?.textContent ?? '') && !!split.querySelector('[data-task-state]'),
      states: box.querySelectorAll('[data-task-state]').length
    }
  }, P)
  let f = await filter()
  check('the Task chip carries which tasks show', f?.onTask && f.states === 1, f?.text)
  check('no bare “Tasks” label, no separate box', f && !f.bare && !f.group, f?.text)
  await shoot('everything-light')
  await state().click(); await wait(500)
  let m = await menu()
  check('its menu offers Open, Done and Both, the current one ticked', m.map((one) => one.text.split(/Tasks?\s/)[0].trim()).join(',').startsWith('Open') && m.length === 3 && m.filter((one) => one.on).length === 1 && m[0].on, JSON.stringify(m))
  await shoot('everything-menu')
  if (await h.locator('[role=menu]').count()) await h.keyboard.press('Escape'); await wait(400)

  // By keys alone: focus it, Enter (the first line is lit), down to Done, Enter.
  await state().focus(); await h.keyboard.press('Enter'); await wait(450)
  await h.keyboard.press('ArrowDown'); await wait(150)
  await h.keyboard.press('Enter'); await wait(700)
  check('by keys: Done chosen, and the chip says so', (await state().getAttribute('data-task-state').catch(() => null)) === 'done' && /Done/.test((await filter())?.text.replace(/ (?=\S)/g, '') ?? ''), (await filter())?.text)
  await state().click(); await wait(400)
  await h.locator('[role=menu] [data-task-state-pick="open"]').click(); await wait(600)
  check('back to Open by click', (await state().getAttribute('data-task-state').catch(() => null)) === 'open')

  await set('Note', true)
  f = await filter()
  check('only Note picked: no task choice shows', f && f.states === 0 && !/Open|Both/.test(f.text), f?.text)
  await set('Task', true)
  f = await filter()
  check('Note and Task picked: the Task chip carries it again', f?.onTask && f.states === 1, f?.text)
  await set('Note', false)
  f = await filter()
  check('only Task picked: still on the Task chip', f?.onTask && f.states === 1, f?.text)
  await set('Task', false)

  // 2. Captures made into tasks: a box to tick, said plainly.
  const box = h.locator(`${P} [data-made-chip] button`).first()
  const said = await box.innerText({ timeout: 2000 }).catch(() => '')
  check('the made-into-tasks choice says what it does to captures', /Also show captures already made into tasks/.test(said), said)
  check('it is not one more kind chip', !(await h.evaluate((P) => !!document.querySelector(`${P} [data-filter-chips] [data-made-chip]`), P)))
  await box.click(); await wait(700)
  check('ticked, the capture shows again', await h.evaluate(([P, id]) => !!document.querySelector(`${P} [data-row][data-id="${id}"]`), [P, made]))
  await box.click(); await wait(500)

  // 3. Today: Display offers only what reaches the page in each mode.
  await go('today'); await wait(1200)
  const mode = async (label) => { await h.evaluate((label) => [...document.querySelectorAll('header button[aria-pressed]')].find((one) => new RegExp(`^(${label})+$`).test(one.textContent.replace(/\s/g, '').replace(/(.)\1/g, '$1')))?.click(), label); await wait(900) }
  const displayText = async () => {
    const button = h.locator('[data-display]').first()
    if (!(await button.count())) return null
    await button.click(); await wait(500)
    const text = await h.evaluate(() => document.querySelector('[data-slot="popover-content"], [role=dialog]')?.innerText.replace(/\s+/g, ' ') ?? '')
    await h.keyboard.press('Escape'); await wait(300)
    return text
  }
  await mode('List')
  const listPanel = await displayText()
  check('Today, List: Display sorts, and Page and Matrix are no grouping there', /Sort by/.test(listPanel ?? '') && !/\bMatrix\b/.test(listPanel ?? ''), listPanel?.slice(0, 120))
  await mode('Page')
  check('Today, Page: no Display, since nothing in it reaches the page', (await h.locator('[data-display]').count()) === 0)
  await shoot('today-page')
  await mode('Matrix')
  const matrixPanel = await displayText()
  check('Today, Matrix: no sort offered or named, the Matrix places each task itself', matrixPanel !== null && !/Sort by/.test(matrixPanel) && !/Your order|Priority/.test(await h.locator('[data-display]').first().innerText()), matrixPanel?.slice(0, 120))
  await shoot('today-matrix')
  await mode('List')

  // 4. Review: the rounds' name is a lead-in, and only rounds with cards are offered.
  await go('review'); await wait(1200)
  if (await h.locator('[data-practise]').count()) { await h.locator('[data-practise]').first().click(); await wait(500) }
  const rounds = await h.evaluate(() => ({ lead: document.querySelector('[data-focus-lead]')?.textContent ?? '', chips: [...document.querySelectorAll('[data-focus-chips] button')].map((one) => one.getAttribute('aria-label') ?? one.textContent.trim()) }))
  check('Review: “Practise a round:” leads the rounds, never reads as a chip', rounds.lead === 'Practise a round:', rounds.lead)
  check('Review: no round offered with nothing in it', rounds.chips.length > 0 && rounds.chips.every((one) => !/\b0$/.test(one.replace(/(.)\1/g, '$1'))), rounds.chips.join(', '))
  await shoot('review-rounds')

  // 5. A tag: its task day stays with its switch, Review's choice is named; one note gets no sort or search.
  await h.evaluate(() => window.api.captures.create({ kind: 'note', body: 'A lone thought #solotag' }))
  await c.send('tag', 'solotag'); await wait(1400)
  check('a tag with one note: no sort and no search over it', (await h.locator('[data-display]').count()) === 0 && (await h.locator('input[placeholder="Filter #solotag"]').count()) === 0)
  await h.evaluate(() => [...document.querySelectorAll('[role="tab"]')].find((one) => one.textContent?.includes('Manage'))?.click()); await wait(700)
  const sw = h.locator('[data-tag-becomes] [role=switch]').first()
  if ((await sw.getAttribute('aria-checked')) !== 'true') { await sw.click(); await wait(700) }
  const tag = await h.evaluate(() => ({ lands: !!document.querySelector('[data-tag-becomes] [data-tag-lands]'), review: document.querySelector('[data-tag-priority]')?.innerText.split('\n')[0] ?? '' }))
  check('a tag: the day its tasks get sits with “Tagged notes become tasks”', tag.lands)
  check('a tag: Learning, Maintaining, Paused are named “In Review:”', /^In Review:/.test(tag.review), tag.review)
  await shoot('tag-manage')
  await sw.click(); await wait(500)

  // 6. Settings: a row that cannot work says why.
  const was = await v('settings')
  await v('settings:set', { hintRate: 0, celebrate: false, focusShows: 'note' })
  await go('settings'); await wait(1200)
  const offs = {}
  for (const [section, names] of [['What comes back to you', ['Memories', 'Questions come back']], ['Sound', ['Gleam on the bubble', 'Smoke in the bubble']], ['Scenery', ['Giphy search words', 'Giphy key', 'Celebrations folder', 'What plays for each']]]) {
    await h.locator(`[data-section="${section}"]`).first().click(); await wait(700)
    Object.assign(offs, await h.evaluate((names) => Object.fromEntries(names.map((name) => [name, !!document.querySelector(`[data-setting-title="${name}"] [data-setting-off]`)])), names))
  }
  await shoot('settings-celebrations-off')
  check('Settings: rows that rest under a switch that is off say why', Object.values(offs).every(Boolean), JSON.stringify(offs))
  await v('settings:set', { hintRate: was.hintRate, celebrate: was.celebrate, focusShows: was.focusShows ?? 'bubble' })

  await go('all'); await wait(900)
  await c.theme('dark'); await go('all'); await wait(1000); await shoot('everything-dark')
  await state().click(); await wait(500); await shoot('everything-menu-dark'); await h.keyboard.press('Escape'); await wait(300)
  await go('today'); await wait(1000); await mode('Matrix'); await shoot('today-matrix-dark'); await mode('List')
  await c.theme('light')

  if (c.errors.length) console.log(c.errors.slice(0, 5).join('\n'))
} finally {
  await c.close()
}
const passed = results.filter(Boolean).length
console.log(`\n${passed}/${results.length} passed`)
if (passed !== results.length) process.exitCode = 1
