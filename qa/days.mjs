// The bubble's later stages, Today's ending, the Goals page's bars, the
// beacon's answers and Close the week. Runs with windows parked off screen:
// the pill is checked through its page, never by looking at the screen.
//
//   npx electron-vite build --outDir out-days
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-days/main/index.js MINDFLOW_QA_AWAY=1 SHOT=<dir> node qa/days.mjs
import { mkdirSync } from 'fs'
import { sandbox } from './sandbox-lib.mjs'

const SHOT = process.env.SHOT ?? `${process.env.QA_DATA}/days`
mkdirSync(SHOT, { recursive: true })
const results = []
const check = (name, ok, detail = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`) }
const wait = (ms) => new Promise((done) => setTimeout(done, ms))

const c = await sandbox({ width: 1100, height: 820 })
const { electron, h, v } = c
const windowOf = async (part) => {
  for (let i = 0; i < 60; i++) {
    const found = electron.windows().find((one) => one.url().includes(part))
    if (found) return found
    await wait(200)
  }
  return null
}
const pillVisible = () => electron.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((one) => one.webContents.getURL().includes('view=focus'))?.isVisible() ?? false)
const looks = [['light', ''], ['dark', ''], ['light', 'brutal']]
const lookAt = async (win, [theme, style]) => {
  await win.evaluate(([t, s]) => {
    localStorage.setItem('theme', t)
    if (s) localStorage.setItem('style', s)
    else localStorage.removeItem('style')
    window.dispatchEvent(new StorageEvent('storage', { key: 'theme' }))
    window.dispatchEvent(new StorageEvent('storage', { key: 'style' }))
  }, [theme, style])
}

try {
  await electron.evaluate(({ ipcMain }) => { ipcMain.removeHandler('idle:seconds'); ipcMain.handle('idle:seconds', () => 0) })
  await v('settings:set', { sounds: true, motion: true })
  const tasks = await v('tasks')
  const task = tasks.find((one) => one.status === 'open' && one.title) ?? tasks[0]
  const begin = async (goal, ms) => {
    const id = await v('session:start', task.id, goal, ms)
    await h.evaluate(() => window.api.showFocus(true))
    return id
  }

  // --- The bubble. A warm-up, so its window is made.
  let id = await begin('Warm up', 25 * 60000)
  const pill = await windowOf('view=focus')
  pill.on('pageerror', (error) => c.errors.push('PILL PAGEERROR ' + error.message))
  await pill.waitForLoadState('domcontentloaded')
  await pill.waitForTimeout(2500)
  await v('session:cancel', id)
  await pill.waitForTimeout(1500)

  // I2 and I3: under a minute, "of 20 sec"; past it, "20 sec, all of it".
  id = await begin('A short one', 20_000)
  await pill.waitForTimeout(2500)
  const said = await pill.$eval('[data-island-panel]', (one) => one.textContent).catch(() => '')
  check('a session under a minute says its length in seconds', said.includes('of 20 sec') && !said.includes('of 0 min'), said.slice(0, 60))
  await pill.hover('[data-island] button >> nth=0')
  await pill.waitForTimeout(19_000)
  const up = await pill.$eval('[data-island-panel]', (one) => one.textContent).catch(() => '')
  check("time's up says how long, all of it", up.includes("Time's up") && up.includes('20 sec, all of it'), up.slice(0, 60))
  for (const look of looks) {
    await lookAt(pill, look)
    await pill.waitForTimeout(500)
    await pill.screenshot({ path: `${SHOT}/pill-timeup-${look.join('') || 'light'}.png` })
  }
  await lookAt(pill, ['light', ''])

  // I1: Done, from the open island: one surface springs down to the band, no snap.
  const watchShell = () => pill.evaluate(() => {
    window.__shell = []
    const start = performance.now()
    const look = () => {
      const shell = document.querySelector('[data-after]')
      if (shell) {
        if (!shell.__mark) shell.__mark = Math.random()
        const box = shell.getBoundingClientRect()
        window.__shell.push({ t: Math.round(performance.now() - start), h: Math.round(box.height), w: Math.round(box.width), stage: shell.dataset.after, mark: shell.__mark })
      }
      if (performance.now() - start < 1400) requestAnimationFrame(look)
    }
    requestAnimationFrame(look)
  })
  await pill.hover('[data-island] button >> nth=0')
  await pill.waitForTimeout(700)
  const islandHeight = await pill.$eval('[data-island]', (one) => one.parentElement.getBoundingClientRect().height)
  await watchShell()
  await pill.click('[data-island-panel] button:has-text("Done")')
  await pill.waitForTimeout(1500)
  let frames = await pill.evaluate(() => window.__shell)
  const heights = frames.map((one) => one.h)
  check('How did it go starts from the island it was', frames.length > 0 && Math.abs(heights[0] - islandHeight) <= 24, `island ${Math.round(islandHeight)}, first ${heights[0]}`)
  check('and springs down through the sizes between, to the band', new Set(heights).size >= 5 && heights.at(-1) === 44, `${new Set(heights).size} sizes, ends ${heights.at(-1)}`)
  check('its stage is How did it go', frames.at(-1)?.stage === 'ask' && !!(await pill.$('input[aria-label="How did it go?"]')))
  for (const look of looks) {
    await lookAt(pill, look)
    await pill.waitForTimeout(400)
    await pill.screenshot({ path: `${SHOT}/pill-ask-${look.join('') || 'light'}.png` })
  }
  await lookAt(pill, ['light', ''])
  // Skipped: the same surface carries on into Pick up.
  const mark = await pill.$eval('[data-after]', (one) => (one.__mark = one.__mark ?? 42))
  await pill.keyboard.press('Escape')
  await pill.waitForTimeout(700)
  const same = await pill.$eval('[data-after]', (one) => ({ mark: one.__mark, stage: one.dataset.after }))
  check('Pick up comes on the same surface, crossfaded', same.mark === mark && same.stage === 'pickup' && !!(await pill.$('[data-pickup]')), JSON.stringify(same))
  for (const look of looks) {
    await lookAt(pill, look)
    await pill.waitForTimeout(400)
    await pill.screenshot({ path: `${SHOT}/pill-pickup-${look.join('') || 'light'}.png` })
  }
  await lookAt(pill, ['light', ''])
  // Skipped too: it folds back up, and only then does its window go.
  await pill.keyboard.press('Escape')
  await pill.waitForTimeout(120)
  const leaving = await pill.$eval('[data-after]', (one) => one.dataset.after).catch(() => null)
  const shownWhileLeaving = await pillVisible()
  await pill.waitForTimeout(900)
  check('it folds up before the window goes', leaving === 'leaving' && shownWhileLeaving && !(await pillVisible()), `${leaving}, shown ${shownWhileLeaving}`)

  // Abandoned: from the pill, the same morph; Undo; left alone it folds.
  id = await begin('To abandon', 25 * 60000)
  await pill.waitForTimeout(3500)
  await pill.hover('[data-island] button >> nth=0')
  await pill.waitForTimeout(700)
  await watchShell()
  await pill.click('[data-island-panel] button:has-text("Stop")', { modifiers: ['Alt'] })
  await pill.waitForTimeout(1500)
  frames = await pill.evaluate(() => window.__shell)
  check('Abandoned morphs on the same surface', frames.length > 0 && frames[0].h > 44 && frames.at(-1).h === 44 && frames.at(-1).stage === 'abandoned' && !!(await pill.$('[data-abandoned]')), `${frames[0]?.h} to ${frames.at(-1)?.h}`)
  await pill.screenshot({ path: `${SHOT}/pill-abandoned-light.png` })
  await pill.waitForTimeout(4500)
  check('and folds away after a few seconds', !(await pillVisible()))

  // A timer stopped: the island folds rather than vanishing.
  id = await v('timer:start', 'Tea', 5 * 60000)
  await h.evaluate(() => window.api.showFocus(true))
  await pill.waitForTimeout(3000)
  await v('session:cancel', id)
  let folded = null
  for (let i = 0; i < 20 && !folded; i++) {
    folded = await pill.$eval('[data-after]', (one) => one.dataset.after).catch(() => null)
    await pill.waitForTimeout(25)
  }
  await pill.waitForTimeout(800)
  check('a stopped timer folds up before it goes', folded === 'leaving' && !(await pillVisible()), String(folded))

  // Motion off: a fade, no spring.
  await v('settings:set', { motion: false })
  await pill.reload()
  await pill.waitForTimeout(800)
  id = await begin('Calm', 25 * 60000)
  await pill.waitForTimeout(1200)
  await pill.hover('[data-island] button >> nth=0')
  await pill.waitForTimeout(400)
  await watchShell()
  await pill.click('[data-island-panel] button:has-text("Stop")')
  await pill.waitForTimeout(1500)
  frames = await pill.evaluate(() => window.__shell)
  check('with Motion off the band is there at its size, no spring', frames.length > 0 && frames.every((one) => one.h === 44), [...new Set(frames.map((one) => one.h))].join(' '))
  await pill.keyboard.press('Escape')
  await pill.waitForTimeout(300)
  await pill.keyboard.press('Escape')
  await pill.waitForTimeout(600)
  await v('settings:set', { motion: true })

  // --- Today: the last task done is the end of the day's list.
  const today = (await v('tasks')).filter((one) => one.status === 'open' && !one.waitingOn && (() => { const at = [one.dueAt, one.deadline].filter(Boolean).map((d) => Date.parse(d)); return at.length && Math.min(...at) < new Date().setHours(24, 0, 0, 0) })())
  for (const one of today.slice(1)) await v('task:done', one.id)
  await c.go('today')
  await h.waitForTimeout(1200)
  const progress = await h.$eval('[data-day-progress]', (one) => one.dataset.said).catch(() => '')
  check('Today says how far through the day it is', /\d+ of \d+ done/.test(progress), progress)
  await h.screenshot({ path: `${SHOT}/today-progress-light.png` })
  await h.evaluate(() => { window.__toasts = []; addEventListener('vigil:toast', (event) => window.__toasts.push(event.detail.text)) })
  await h.click('[data-id] button[class*="group/tick"]')
  await h.waitForTimeout(2200)
  const toasts = await h.evaluate(() => window.__toasts)
  check('the last one says the day is done', toasts.some((one) => one.startsWith('That is everything for today')), toasts.join(' | '))
  const cleared = await h.$eval('[data-day-cleared]', (one) => one.textContent).catch(() => '')
  check('the page rises into its ending, with one next step', /done/.test(cleared) && cleared.includes('The rest of the day is yours') && /Close the day|coming up/.test(cleared), cleared.slice(0, 120))
  const full = await h.$eval('[data-day-progress] [role="progressbar"]', (one) => one.getAttribute('aria-valuenow')).catch(() => null)
  check('and its bar is full', full === '100', String(full))
  for (const look of looks) {
    await lookAt(h, look)
    await h.waitForTimeout(1200)
    await h.screenshot({ path: `${SHOT}/today-done-${look.join('') || 'light'}.png` })
  }
  await lookAt(h, ['light', ''])

  // Today's page: no bare "Nothing".
  await c.go('day')
  await h.waitForTimeout(1200)
  const bare = await h.$$eval('p', (all) => all.map((one) => one.textContent.trim()).filter((text) => text === 'Nothing'))
  check('the day page never says a bare Nothing', !bare.length)

  // --- Goals: a bar on each open goal's row.
  const day = (offset) => { const d = new Date(); d.setDate(d.getDate() + offset); return d.toISOString().slice(0, 10) }
  const goal = await v('goal:new', 'Run the 10k', day(40), day(-20), 'For the race')
  await v('goal:new', 'Finish the draft', day(5), day(-30), null)
  await c.go('goals')
  await h.waitForTimeout(1200)
  const rows = await h.$$eval('[role="progressbar"]', (all) => all.map((one) => one.getAttribute('aria-label')))
  check('the Goals page draws each open goal its bar', rows.filter((one) => /of the way/.test(one)).length >= 2, rows.join(' | '))
  for (const look of looks) {
    await lookAt(h, look)
    await h.waitForTimeout(1000)
    await h.screenshot({ path: `${SHOT}/goals-${look.join('') || 'light'}.png` })
  }
  await lookAt(h, ['light', ''])

  // --- The beacon: past its day, the question comes to you.
  const past = await v('goal:new', 'Ship the beta', day(-1), day(-30), null)
  await v('goal:beacon:set', past, 'always').catch(() => null)
  const stack = await windowOf('type=goal')
  if (stack) {
    // Shown again, the stack starts from the top: the goal past its day.
    await stack.waitForTimeout(1500)
    await stack.reload()
    await stack.waitForTimeout(2500)
    const asks = await stack.evaluate(() => document.body.textContent)
    check('the beacon asks Did you make it, with the answers on it', asks.includes('Did you make it?') && asks.includes('Made it') && asks.includes('Missed'), asks.slice(0, 80))
    await stack.screenshot({ path: `${SHOT}/beacon-ask-light.png` })
    await stack.click('button:has-text("Made it")')
    await stack.waitForTimeout(500)
    const thanks = await stack.$eval('[data-beacon-said]', (one) => one.textContent).catch(() => '')
    check('answered there, it says so with Undo', thanks.includes('Made it.') && thanks.includes('Undo'), thanks)
    await stack.screenshot({ path: `${SHOT}/beacon-said-light.png` })
    await stack.waitForTimeout(3000)
    const item = await v('item', past)
    check('then the goal is settled', !!item?.closedAt, item?.closedHow ?? 'open')
  } else check('the goal stack window is there', false)

  // --- Close the week.
  await c.go('home')
  await h.evaluate(() => window.dispatchEvent(new CustomEvent('vigil:close-week')))
  await h.waitForTimeout(800)
  check('Close the week opens', !!(await h.$('[data-close-week]')))
  await h.fill('[aria-label="What went well"]', 'Shipped the beta and slept well')
  await h.fill('[aria-label="The one thing for next week"]', 'Write the launch post')
  for (const look of looks) {
    await lookAt(h, look)
    await h.waitForTimeout(900)
    await h.screenshot({ path: `${SHOT}/close-week-${look.join('') || 'light'}.png` })
  }
  await lookAt(h, ['light', ''])
  await h.waitForTimeout(600)
  await h.keyboard.press('Meta+Enter')
  await h.waitForTimeout(300)
  const ring = await h.$eval('[data-week-ring]', (one) => one.dataset.weekRing).catch(() => null)
  check('closing it closes the week ring first', ring === 'closed', String(ring))
  await h.waitForTimeout(1200)
  const monday = await h.evaluate(() => { const d = new Date(); const back = (d.getDay() + 6) % 7; d.setDate(d.getDate() - back); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` })
  const next = await h.evaluate((m) => { const d = new Date(`${m}T12:00`); d.setDate(d.getDate() + 7); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }, monday)
  const week = await v('period', `week:${monday}`)
  const ahead = await v('period', `week:${next}`)
  check("what went well is the week's summary", week?.fields?.summary === 'Shipped the beta and slept well', JSON.stringify(week?.fields))
  check("the one thing heads next week's page", ahead?.fields?.theme === 'Write the launch post', JSON.stringify(ahead?.fields))
  check('and the sheet has gone', !(await h.$('[data-close-week]')))

  check('no page errors', !c.errors.some((one) => one.includes('PAGEERROR')), c.errors.filter((one) => one.includes('PAGEERROR')).join(' | '))
  void goal
} finally {
  await c.close()
}
const failed = results.filter((ok) => !ok).length
console.log(`\n${results.length - failed} of ${results.length} passed`)
process.exit(failed ? 1 : 0)
