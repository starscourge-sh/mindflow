// The session pill's ending, end to end: +10 min rolls the time up and is
// logged, Time's up asks with +10 min, Take a break and Done, nudges again a
// little more each time (capped), a break is its own material with its own
// sounds and morphs from the session, Go again starts the same session over,
// and a session left while away ends at the right time and says so.
//
//   npx electron-vite build --outDir out-pill
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-pill/main/index.js MINDFLOW_QA_AWAY=1 SHOT=<dir> node qa/pill-more.mjs
import { mkdirSync } from 'fs'
import { sandbox } from './sandbox-lib.mjs'

const SHOT = process.env.SHOT ?? 'scratchpad/pill-more'
mkdirSync(SHOT, { recursive: true })
const results = []
const check = (name, ok, detail = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`) }
const wait = (ms) => new Promise((done) => setTimeout(done, ms))

const c = await sandbox({ width: 1100, height: 900 })
const { electron, h, v } = c
const pillWindow = async () => {
  for (let i = 0; i < 50; i++) {
    const found = electron.windows().find((one) => one.url().includes('view=focus'))
    if (found) return found
    await wait(200)
  }
  throw new Error('no pill')
}
const idle = (seconds) => electron.evaluate(({ ipcMain }, s) => { ipcMain.removeHandler('idle:seconds'); ipcMain.handle('idle:seconds', () => s) }, seconds)
const heard = (pill) => pill.evaluate(() => [...(window.vigilHeard ?? [])])
const attr = (pill, name) => pill.$eval('[data-island]', (one, n) => one.getAttribute(n), name).catch(() => null)
const timeShown = (pill) => pill.$eval('[data-island] [role=img]', (one) => one.getAttribute('aria-label')).catch(() => null)
const secs = (text) => { if (!text) return null; const p = text.split(':').map(Number); return p.length === 3 ? p[0] * 3600 + p[1] * 60 + p[2] : p[0] * 60 + p[1] }

try {
  await idle(0)
  await v('settings:set', { sounds: true, motion: true, countIn: false, focusShows: 'bubble' })
  const tasks = await v('tasks')
  const task = tasks.find((one) => one.status === 'open' && one.title) ?? tasks[0]
  const begin = async (goal, ms = 25 * 60000) => {
    const id = await v('session:start', task.id, goal, ms)
    await h.evaluate(() => window.api.showFocus(true))
    return id
  }
  let id = await begin('Warm up')
  const pill = await pillWindow()
  pill.on('pageerror', (error) => c.errors.push('PILL PAGEERROR ' + error.message))
  pill.on('console', (message) => message.type() === 'error' && c.errors.push('PILL ' + message.text().slice(0, 300)))
  await pill.waitForLoadState('domcontentloaded')
  await pill.waitForTimeout(3500)

  // --- +10 min: logged, rolled, heard.
  const before = await v('focus:now')
  const shownBefore = secs(await timeShown(pill))
  await v('session:extend', id, 600000)
  const samples = []
  for (let i = 0; i < 12; i++) { samples.push(secs(await timeShown(pill))); await wait(60) }
  const after = await v('focus:now')
  check('+10 min adds ten minutes to the plan', after.plannedMs - before.plannedMs === 600000, `${before.plannedMs} -> ${after.plannedMs}`)
  check('and logs it as an extension', after.extendedMs === 600000, String(after.extendedMs))
  const between = samples.filter((one) => one !== null && one > shownBefore + 30 && one < shownBefore + 570)
  check('the time rolls up to it rather than jumping', between.length >= 2, samples.join(','))
  check('with a sound of its own', (await heard(pill)).includes('cue:more'))
  // From the pill itself: opened under the pointer, the button.
  await pill.hover('[data-island] button >> nth=0')
  await pill.waitForTimeout(700)
  await pill.click('[data-more]')
  await pill.waitForTimeout(900)
  check('the pill’s “+10 min” adds ten more', (await v('focus:now')).plannedMs === after.plannedMs + 600000)
  await pill.mouse.move(1, 1)
  await v('session:cancel', id)
  await pill.waitForTimeout(1200)

  // --- Time's up asks, then nudges, capped.
  await pill.evaluate(() => (window.vigilNudges = [0.04, 0.08, 0.12]))
  id = await begin('Draft the intro', 2500)
  await pill.waitForTimeout(5200)
  check('time up: the pill opens on its own to ask', (await attr(pill, 'data-island')) === 'open' && (await attr(pill, 'data-over')) !== null)
  const words = await pill.$$eval('[data-island-panel] button', (all) => all.map((one) => one.textContent.trim()).filter(Boolean))
  check('it asks “+10 min”, “Take a break”, “Done”', ['+10 min', 'Take a break', 'Done'].every((one) => words.some((w) => w.endsWith(one))), words.join(' | '))
  // Seen and passed by: it closes; then it asks again, a little more each time, three times at most.
  await pill.hover('[data-island] button >> nth=0')
  await pill.waitForTimeout(300)
  await pill.mouse.move(1, 1)
  await pill.waitForTimeout(600)
  check('seen and passed by, it closes until the next nudge', (await attr(pill, 'data-island')) === 'rest')
  await pill.waitForTimeout(9000)
  const nudges = (await heard(pill)).filter((one) => one === 'cue:nudge' || one === 'cue:nudgeMore')
  check('unanswered, it nudges again: a soft bell, then two', nudges[0] === 'cue:nudge' && nudges.includes('cue:nudgeMore'), nudges.join(','))
  check('three times at most', nudges.length === 3, String(nudges.length))
  check('and asks again, open', (await attr(pill, 'data-island')) === 'open')

  // --- Take a break: the session ends, kept, and the same pill turns into a break.
  const heardBefore = (await heard(pill)).length
  await pill.click('[data-take-break]')
  await pill.waitForTimeout(1500)
  const brk = await v('focus:now')
  check('“Take a break” starts a break', brk?.kind === 'break', JSON.stringify(brk && { kind: brk.kind, ms: brk.plannedMs }))
  check('the session it ended is kept', (await v('sessions', task.id)).some((one) => one.id === id && one.endedAt && !one.abandonedAt))
  check('the break is its own material', (await attr(pill, 'data-break')) !== null && !!(await pill.$('[data-break-surface]')))
  check('with its cup and its own words', !!(await pill.$('[data-break-ring]')) && !!(await pill.$('[data-break-line]')))
  check('and its own sound', (await heard(pill)).slice(heardBefore).includes('cue:breakIn'))
  const surface = await pill.$eval('[data-island]', (one) => { const all = [one, ...one.querySelectorAll('*')]; return all.some((el) => { const st = getComputedStyle(el); return (st.backdropFilter && st.backdropFilter !== 'none') }) })
  check('no backdrop blur anywhere in it', !surface)
  await v('session:cancel', brk.id)
  await pill.waitForTimeout(1200)

  // --- A break over: Go again starts the same session, same task and length.
  await v('break:start', null, 2500)
  await h.evaluate(() => window.api.showFocus(true))
  await pill.waitForTimeout(5000)
  check('a break over says so', (await pill.$eval('[data-timeup]', (one) => one.textContent).catch(() => '')) === "Break's over")
  check('with its own brighter sound', (await heard(pill)).includes('cue:breakOut'))
  await pill.click('[data-island-panel] [data-again]')
  await pill.waitForTimeout(1500)
  const again = await v('focus:now')
  check('Go again starts the same session over', again?.taskId === task.id && again.plannedMs === 2500 && again.kind !== 'break', JSON.stringify(again && { goal: again.goal, ms: again.plannedMs }))
  check('the pill morphs back from the break', (await attr(pill, 'data-break')) === null)

  // --- After a session: the band offers Go again too, and the pill grows from it.
  await pill.waitForTimeout(4000)
  await pill.click('[data-island-panel] button:has-text("Done")')
  await pill.waitForTimeout(1200)
  check('the band after a session offers Go again', !!(await pill.$('[data-after="ask"] [data-again]')))
  await pill.click('[data-after="ask"] [data-again]')
  await pill.waitForTimeout(250)
  const grown = await attr(pill, 'data-island')
  check('and the next pill grows out of the band, not dropped from above', grown === 'shown' || grown === 'rest' || grown === 'open', String(grown))
  await pill.waitForTimeout(1500)
  await v('session:cancel', (await v('focus:now')).id)
  await pill.waitForTimeout(1500)

  // --- Away: long idle in a session with no length ends it when you left, and says so.
  id = await v('session:start', task.id, 'Read the paper', null)
  await h.evaluate(() => window.api.showFocus(true))
  await pill.waitForTimeout(2000)
  await idle(50 * 60)
  await pill.waitForTimeout(33000)
  const away = (await v('sessions', task.id)).find((one) => one.id === id)
  // Idle since before it began, so it ends at its start: no minutes of nothing counted.
  const counted = away?.endedAt ? (new Date(away.endedAt).getTime() - new Date(away.startedAt).getTime()) / 1000 : null
  check('idle 50 min: ended when you left, not now (here, at its start)', counted !== null && counted < 1, `${counted}s counted`)
  check('the band says so on your return', !!(await pill.$('[data-away]')), await pill.$eval('[data-away]', (one) => one.textContent).catch(() => ''))
  await idle(0)
  await pill.click('[data-away] button:has-text("Keep going")')
  await pill.waitForTimeout(1200)
  check('“Keep going” puts it back running', (await v('focus:now'))?.id === id)
  await v('session:cancel', id)
  await pill.waitForTimeout(1500)

  // Asleep, past the end: ended at the planned end, not on waking.
  id = await v('session:start', task.id, 'Slept through', 60000)
  const started = Date.now()
  const ended = await v('session:away', id, started + 120000, 'asleep')
  const row = (await v('sessions', task.id)).find((one) => one.id === id)
  const length = (new Date(row.endedAt).getTime() - new Date(row.startedAt).getTime()) / 1000
  check('asleep: ended at the planned end', !!ended && Math.abs(length - 60) < 2, `${length}s`)
  // Idle within its time: reading is work, left alone.
  id = await v('session:start', task.id, 'Reading', 30 * 60000)
  check('idle within its time: left running', (await v('session:away', id, Date.now() - 20 * 60000, 'idle')) === null && (await v('focus:now'))?.id === id)
  await v('session:cancel', id)
  await pill.waitForTimeout(1500)

  // --- Sounds off: the same +10 min is silent.
  await v('settings:set', { sounds: false })
  id = await begin('Quiet one')
  await pill.waitForTimeout(3000)
  const quiet = (await heard(pill)).length
  await v('session:extend', id, 600000)
  await pill.waitForTimeout(1000)
  check('with Sounds off, no sound', (await heard(pill)).length === quiet)
  await v('session:cancel', id)
  await v('settings:set', { sounds: true })
  await pill.waitForTimeout(1500)

  // --- Screenshots: work, time's up, break and break over, in light, dark and Brutal.
  for (const [look, theme, style] of [['light', 'light', ''], ['dark', 'dark', ''], ['brutal', 'light', 'brutal'], ['brutal-dark', 'dark', 'brutal']]) {
    await h.evaluate(([t, s]) => { localStorage.setItem('theme', t); if (s) localStorage.setItem('style', s); else localStorage.removeItem('style') }, [theme, style])
    await pill.reload()
    await pill.waitForTimeout(1500)
    await pill.evaluate(() => (window.vigilNudges = [60, 60, 60]))
    id = await begin('Write the chapter on rivers')
    await pill.waitForTimeout(3200)
    await pill.hover('[data-island] button >> nth=0')
    await pill.waitForTimeout(900)
    await pill.screenshot({ path: `${SHOT}/work-open-${look}.png` })
    await pill.mouse.move(1, 1)
    await v('session:cancel', id)
    await pill.waitForTimeout(1500)
    id = await begin('Write the chapter on rivers', 2500)
    await pill.waitForTimeout(5500)
    await pill.screenshot({ path: `${SHOT}/timeup-${look}.png` })
    await pill.click('[data-take-break]')
    await pill.waitForTimeout(600)
    await pill.screenshot({ path: `${SHOT}/morph-${look}.png` })
    await pill.waitForTimeout(4000)
    await pill.screenshot({ path: `${SHOT}/break-rest-${look}.png` })
    await pill.hover('[data-island] button >> nth=0')
    await pill.waitForTimeout(900)
    await pill.screenshot({ path: `${SHOT}/break-open-${look}.png` })
    await pill.mouse.move(1, 1)
    await v('session:cancel', (await v('focus:now')).id)
    await pill.waitForTimeout(1500)
    await v('break:start', null, 2500)
    await h.evaluate(() => window.api.showFocus(true))
    await pill.waitForTimeout(5000)
    await pill.screenshot({ path: `${SHOT}/break-over-${look}.png` })
    await pill.hover('[data-island] button >> nth=0')
    await pill.waitForTimeout(300)
    await pill.mouse.move(1, 1)
    await pill.waitForTimeout(800)
    await pill.screenshot({ path: `${SHOT}/break-over-rest-${look}.png` })
    await v('session:cancel', (await v('focus:now')).id)
    await pill.waitForTimeout(1500)
  }
  check('no errors', c.errors.length === 0, c.errors.slice(0, 3).join(' / '))
} catch (error) {
  console.log('FAIL  the run stopped:', error.message)
  results.push(false)
} finally {
  console.log(`${results.filter(Boolean).length}/${results.length} passed`)
  await c.close()
  process.exit(results.every(Boolean) ? 0 : 1)
}
