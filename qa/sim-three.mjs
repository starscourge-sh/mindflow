// The later half of the similar-issues sweep, checked in the built app:
// keys open pop-overs, sheets and Recent at once (a click still eases in);
// Motion off and Reduce motion stop the editor's glides and the toolbar's
// slide; Today's count is one number in the sidebar and Today's brief, and a
// tick there says nothing over itself but ⌘Z takes it back; a task in the Bin
// is named without its #tags; the sidebar's page previews say today's date,
// week and month; the Week's page and Close the day never flash "nothing"
// while they read; a resting mouse never takes Close the day's cursor.
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-x/main/index.js MINDFLOW_QA_AWAY=1 node qa/sim-three.mjs
// SHOTS=dir keeps pictures.
import { mkdirSync } from 'fs'
import { sandbox } from './sandbox-lib.mjs'

const SHOTS = process.env.SHOTS
if (SHOTS) mkdirSync(SHOTS, { recursive: true })
const results = []
const check = (name, ok, detail = '') => (results.push(!!ok), console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`))
const c = await sandbox({ width: 1300, height: 860 })
const { h, go, v } = c
const frame = (fn) => h.evaluate(`new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(() => done((${fn})()))))`)
const shot = async (name) => SHOTS && h.screenshot({ path: `${SHOTS}/${name}.png` })
const toasts = () => h.evaluate(() => [...document.querySelectorAll('[role=status][aria-live]')].map((one) => one.textContent.replace(/\s+/g, ' ').trim()).filter(Boolean).join(' | '))
const day = (offset) => { const d = new Date(); d.setDate(d.getDate() + offset); d.setHours(12, 0, 0, 0); return d.toISOString() }
// Sampled every frame for `ms`: whether `text` was ever on the page.
const flashed = (text, ms) => h.evaluate(([t, ms]) => new Promise((done) => {
  const end = performance.now() + ms
  let seen = false
  const look = () => {
    if (document.body.textContent.includes(t)) seen = true
    if (performance.now() > end) return done(seen)
    requestAnimationFrame(look)
  }
  look()
}), [text, ms])

try {
  await v('settings:set', { sounds: false, hintRate: 0, motion: true, closeDay: true })
  await v('onboarding:set', { pageHints: false })

  // Two late tasks and one waiting on someone today: late ones count, the waiting one does not.
  const late1 = await v('task:add', 'Probe late one')
  const late2 = await v('task:add', 'Probe late two')
  const waiting = await v('task:add', 'Probe waiting today')
  const id = (made) => made?.id ?? made
  await v('task:save', id(late1), { due: day(-1) })
  await v('task:save', id(late2), { due: day(-2) })
  await v('task:save', id(waiting), { due: day(0), waitingOn: 'Sam' })

  // ---- Today's count, the same in the sidebar and Today's brief.
  await go('day')
  await h.waitForTimeout(1500)
  const side = Number(await h.evaluate(() => document.querySelector('[data-side-count="today"]')?.innerText.replace(/\D/g, '') || '0'))
  // Rolling words are drawn in a shadow root: read each host's own words, and the page's.
  const brief = await h.evaluate(() => [...document.querySelectorAll('*')].map((one) => (one.shadowRoot?.textContent ?? one.getAttribute('aria-label') ?? '').replace(/\s+/g, '')).find((t) => /^\d+todo|^Alldone|^Nothingtodo/.test(t)) ?? '')
  const briefN = Number(brief.match(/^(\d+)todo/)?.[1] ?? 0)
  check("Today's brief counts what the sidebar counts", side > 0 && side === briefN, `sidebar ${side}, brief "${brief}"`)
  await shot('brief-count')

  // ---- A tick in the brief: no "Done" toast, ⌘Z takes it back.
  const tick = h.locator('[data-task-tick]').first()
  const ticked = await tick.count()
  if (ticked) {
    const title = await tick.getAttribute('aria-label')
    const tid = (await v('tasks')).find((one) => one.title === title && one.status === 'open')?.id
    await tick.click()
    await h.waitForTimeout(700)
    const said = await toasts()
    check('Ticking in the brief says nothing over the tick', !/Done/.test(said), said || 'no toast')
    await h.mouse.click(5, 400)
    await h.keyboard.press('Meta+z')
    await h.waitForTimeout(900)
    const tasks = await v('tasks')
    const back = tid ? tasks.find((one) => one.id === tid) : null
    check('…and ⌘Z takes the tick back', !tid || back?.status === 'open', tid ? back?.status : 'no id on the row')
  } else check('The brief shows a task to tick', false)

  // ---- A task in the Bin is named without its #tags.
  const tagged = await v('task:add', '#probe Tagged in the bin')
  await v('task:save', id(tagged), { status: 'dropped' })
  await go('discarded')
  await h.waitForTimeout(1000)
  const row = await h.evaluate(() => [...document.querySelectorAll('[data-bin-row]')].map((one) => one.textContent).find((t) => t.includes('Tagged in the bin')) ?? '')
  const name = await h.evaluate(() => [...document.querySelectorAll('[data-bin-row] .private-text')].map((one) => one.textContent).find((t) => t.includes('Tagged in the bin')) ?? '')
  check('A Bin row names the task without its #tag', name === 'Tagged in the bin', JSON.stringify(name))
  check('…and shows the tag as a chip after it', /probe/.test(row.split('Tagged in the bin')[1] ?? ''), JSON.stringify(row))

  // ---- The sidebar's page previews say today's date, week and month.
  const now = new Date()
  const want = {
    day: now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }).replace(/^(\w+) /, '$1, '),
    month: now.toLocaleDateString('en-GB', { month: 'long' })
  }
  const iso = (() => { const d = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())); const n = d.getUTCDay() || 7; d.setUTCDate(d.getUTCDate() + 4 - n); const y = new Date(Date.UTC(d.getUTCFullYear(), 0, 1)); return Math.ceil(((d - y) / 86400000 + 1) / 7) })()
  const peek = async (label) => {
    await h.mouse.move(5, 5)
    await h.waitForTimeout(300)
    const button = h.locator(`button[data-side-row][aria-label="${label}"]`).first()
    if (!(await button.count())) return ''
    const box = await button.boundingBox()
    for (let i = 0; i < 4; i++) { await h.mouse.move(box.x + 20 + i * 3, box.y + box.height / 2); await h.waitForTimeout(40) }
    await h.waitForTimeout(900)
    return h.evaluate(() => document.querySelector('[data-slot="tooltip-content"]')?.textContent ?? '')
  }
  // The Week's and Month's pages shown in the sidebar, as a person can choose.
  const shownWas = (await v('settings')).sidebarShown ?? []
  await v('settings:set', { sidebarShown: [...new Set([...shownWas, 'weekpage', 'monthpage'])] })
  await go('inbox')
  const dayPeek = await peek("Today's page")
  check("Today's page preview names today", dayPeek.includes(want.day), `${JSON.stringify(dayPeek.slice(0, 60))} wants ${want.day}`)
  await shot('peek-day')
  const weekPeek = await peek("Week's page")
  check("The Week's page preview names this week", weekPeek.includes(`Week ${iso}`), `${JSON.stringify(weekPeek.slice(0, 50))} wants Week ${iso}`)
  const monthPeek = await peek("Month's page")
  check("The Month's page preview names this month", monthPeek.includes(want.month), `${JSON.stringify(monthPeek.slice(0, 40))} wants ${want.month}`)
  await h.mouse.move(700, 400)

  // ---- The Week's page never says "Nothing written" on the way to its line.
  const monday = (() => { const d = new Date(); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d.toLocaleDateString('en-CA') })()
  await v('period:save', `week:${monday}`, { fields: { theme: 'Probe week' } })
  await go('inbox')
  await c.send('view', 'weekpage')
  check("The Week's page never flashes \"Nothing written\" while it reads", !(await flashed('Nothing written for this week', 1500)))

  // ---- Close the day: no "No tasks ticked off" while a done task loads, and a resting mouse never takes the cursor.
  const done = await v('task:add', 'Probe done today')
  await v('task:save', id(done), { due: day(0) })
  await v('task:done', id(done))
  await go('today')
  await h.waitForTimeout(600)
  const openClose = () => h.evaluate(() => window.dispatchEvent(new CustomEvent('vigil:close-day')))
  await openClose()
  check('Close the day never flashes "No tasks ticked off" while it reads', !(await flashed('No tasks ticked off today', 1200)))
  await h.waitForTimeout(400)
  const rows = h.locator('[data-close-task]')
  const n = await rows.count()
  const second = n > 1 ? await rows.nth(1).boundingBox() : null
  await shot('close-day')
  await h.keyboard.press('Escape')
  await h.waitForTimeout(600)
  if (second) {
    // The pointer comes to rest where the second row will be, then the pass opens under it.
    await h.mouse.move(second.x + 40, second.y + second.height / 2)
    await h.mouse.move(second.x + 44, second.y + second.height / 2)
    await h.waitForTimeout(300)
    await openClose()
    await h.waitForTimeout(900)
    const cursor = await h.evaluate(() => [...document.querySelectorAll('[data-close-task]')].findIndex((one) => one.hasAttribute('data-cursor')))
    check('A resting mouse leaves Close the day\'s cursor on the first row', cursor === 0, `cursor on row ${cursor}`)
    // A real move does pick the row.
    await h.mouse.move(second.x + 60, second.y + second.height / 2 + 1)
    await h.waitForTimeout(200)
    const moved = await h.evaluate(() => [...document.querySelectorAll('[data-close-task]')].findIndex((one) => one.hasAttribute('data-cursor')))
    check('…and a real move picks the row under it', moved === 1, `cursor on row ${moved}`)
    await h.keyboard.press('Escape')
    await h.waitForTimeout(600)
  } else check('Close the day lists two open tasks', false, `${n}`)

  // ---- Keys: F opens Display at once; a click still eases it in.
  await go('inbox')
  await h.mouse.click(700, 500)
  await h.waitForTimeout(300)
  await h.keyboard.press('f')
  const byKey = await frame(() => { const one = document.querySelector('[data-slot="popover-content"]'); return one && getComputedStyle(one).animationName })
  check('F opens Display with no entrance', byKey === 'none', String(byKey))
  await h.keyboard.press('Escape')
  const gone = await h.evaluate(() => new Promise((done) => setTimeout(() => done(!!document.querySelector('[data-slot="popover-content"]')), 40)))
  check('…and Esc puts it away at once', !gone)
  await h.waitForTimeout(300)
  await h.locator('[data-display]').first().click()
  const byClick = await frame(() => { const one = document.querySelector('[data-slot="popover-content"]'); return one && getComputedStyle(one).animationName })
  check('A click on Display still eases it in', byClick && byClick !== 'none', String(byClick))
  await h.waitForTimeout(400)
  await shot('display-click')
  await h.keyboard.press('Escape')
  await h.waitForTimeout(400)

  // ⇧⌘Y: Recent is simply there.
  await h.mouse.click(700, 500)
  await h.keyboard.press('Meta+Shift+y')
  const recent = await frame(() => { const one = document.querySelector('[data-recent-row]')?.closest('.rounded-xl'); return one && Number(getComputedStyle(one).opacity) })
  check('⇧⌘Y shows Recent at once', recent === 1, String(recent))
  await h.keyboard.press('Meta+Shift+y')
  await h.waitForTimeout(400)

  // ---- Motion off: the editor's own scrolls jump.
  await v('settings:set', { motion: false })
  await h.waitForTimeout(500)
  const scroll = await h.evaluate(() => {
    const probe = document.createElement('div')
    probe.className = 'mindflow-editor-content is-smooth'
    document.body.append(probe)
    const said = getComputedStyle(probe).scrollBehavior
    probe.remove()
    return said
  })
  check('With Motion off a note\'s jumps are instant', scroll === 'auto', scroll)
  await v('settings:set', { motion: true })
  await h.waitForTimeout(300)

  // ---- Reduce motion: the editor toolbar's menus only fade.
  await h.emulateMedia({ reducedMotion: 'reduce' })
  const menu = await h.evaluate(() => {
    const probe = document.createElement('div')
    probe.className = 'tiptap-dropdown-menu-content'
    probe.dataset.state = 'open'
    document.body.append(probe)
    const said = getComputedStyle(probe).animationName
    probe.remove()
    return said
  })
  check('With Reduce motion the toolbar menus only fade', menu === 'dropdown-fade-in', menu)
  await h.emulateMedia({ reducedMotion: 'no-preference' })

  check('No errors on the page', !c.errors.length, c.errors.slice(0, 3).join(' | '))
} catch (error) {
  check('Ran to the end', false, String(error).slice(0, 300))
} finally {
  const passed = results.filter(Boolean).length
  console.log(`\n${passed}/${results.length} passed`)
  await c.close()
  process.exit(passed === results.length ? 0 : 1)
}
