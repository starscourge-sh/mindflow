// A walk through focus, practices and settings, as a person meets them, on
// the sandbox: a session started from a task's panel, the bubble folded and
// open in each of its shapes (circle, runner, runner as progress, under the
// notch), paused and resumed, ended early and counted, time's up and a break,
// Go again; a practice made, its timer at 0, 5 minutes and its target; habits
// and stats; a sticky; and every Settings section at two sizes and in two
// themes. Each step is shot, so the screens can be looked at by eye.
//
//   npx electron-vite build --outDir out-walk4
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-walk4/main/index.js MINDFLOW_QA_AWAY=1 SHOT=<dir> node qa/walk-focus.mjs
import { mkdirSync } from 'fs'
import { sandbox, shiftClock } from './sandbox-lib.mjs'
import { checks } from './harness.mjs'

// A notch stood in, so "Under the notch" can be walked on any Mac.
process.env.MINDFLOW_QA_NOTCH = '1'
const SHOT = process.env.SHOT ?? 'scratchpad/walk-focus'
mkdirSync(SHOT, { recursive: true })
const { check, done } = checks()
const wait = (ms) => new Promise((go) => setTimeout(go, ms))
const MIN = 60_000

const c = await sandbox({ width: 1280, height: 860 })
const { electron, h, v, go } = c
const windowOf = async (part) => {
  for (let i = 0; i < 60; i++) {
    const found = electron.windows().find((one) => one.url().includes(part))
    if (found) return found
    await wait(200)
  }
  throw new Error(`no window ${part}`)
}
const pointer = (inside) => electron.evaluate((_, on) => void (globalThis.pillPointer = on), inside)
const island = (pill) => pill.$eval('[data-island]', (one) => one.getAttribute('data-island')).catch(() => null)
const shoot = async (page, name, selector) => {
  try {
    if (selector) await (await page.$(selector))?.screenshot({ path: `${SHOT}/${name}.png` })
    else await page.screenshot({ path: `${SHOT}/${name}.png` })
  } catch (error) { console.log(`(no shot ${name}: ${String(error.message).split('\n')[0]})`) }
}
/** Text that runs past its own box, anywhere in the page: the words a person cannot read. */
const cutOff = (page, root = 'body') => page.evaluate((sel) => [...document.querySelectorAll(`${sel} *`)].filter((el) => {
  if (!el.childNodes.length || ![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) return false
  const st = getComputedStyle(el)
  if (st.visibility === 'hidden' || st.display === 'none' || el.closest('[aria-hidden="true"], [inert]')) return false
  const r = el.getBoundingClientRect()
  if (!r.width || !r.height) return false
  const clipped = (st.overflow === 'hidden' || st.textOverflow === 'ellipsis') && el.scrollWidth > el.clientWidth + 1
  return clipped
}).map((el) => el.textContent.trim().slice(0, 40)), root)

try {
  await v('onboarding:set', { newsSeen: true, pageHints: false })
  await electron.evaluate(({ ipcMain }) => { ipcMain.removeHandler('idle:seconds'); ipcMain.handle('idle:seconds', () => 0) })
  await v('settings:set', { sounds: true, motion: true, countIn: false, focusShows: 'bubble', pillSits: 'free', focusBubble: 'circle', siteBlock: false })

  // --- 1. A session from a task's panel, as a person starts one.
  const task = (await v('tasks')).find((one) => one.status === 'open' && one.title && !one.recurrence)
  await c.send('task', task.id)
  await h.waitForTimeout(1500)
  await h.click('text=Start a focus session').catch(() => h.click('text=Start a new focus session'))
  await h.waitForTimeout(600)
  await shoot(h, '01-start-form', '[data-start-focus]')
  check('the start form offers a goal, a length and Start', !!(await h.$('[data-start-focus] input[aria-label="Goal"]')) && !!(await h.$('[data-start-focus] button[type=submit]')))
  await h.fill('[data-start-focus] input[aria-label="Goal"]', 'Outline the essay')
  await h.click('[data-start-focus] button:has-text("25 min")').catch(() => {})
  await h.keyboard.press('Enter')
  await h.waitForTimeout(1500)
  let now = await v('focus:now')
  check('Start begins a session on the task', now?.taskId === task.id && now.goal === 'Outline the essay', JSON.stringify(now && { task: now.taskId, goal: now.goal, ms: now.plannedMs }))
  const pill = await windowOf('view=focus')
  pill.on('pageerror', (error) => c.errors.push('PILL PAGEERROR ' + error.message))
  await pill.waitForLoadState('domcontentloaded')
  await pill.waitForTimeout(2500)
  await shoot(h, '02-main-while-running')

  // --- 2. The bubble in each shape, folded and open.
  for (const shape of ['circle', 'runner', 'progress']) {
    await v('settings:set', { focusBubble: shape })
    await pointer(false)
    await pill.mouse.move(1, 1)
    await pill.waitForTimeout(2500)
    check(`${shape}: folded when the pointer is away`, (await island(pill)) === 'rest', await island(pill))
    await shoot(pill, `03-bubble-${shape}-rest`, '[data-island-frame]')
    await pointer(true)
    await pill.hover('[data-island]')
    await pill.waitForTimeout(900)
    check(`${shape}: opens under the pointer`, (await island(pill)) === 'open', await island(pill))
    await shoot(pill, `03-bubble-${shape}-open`, '[data-island-frame]')
    const cut = await cutOff(pill, '[data-island]')
    check(`${shape}: nothing cut off in the open bubble`, !cut.length, cut.join(' | '))
  }
  await v('settings:set', { focusBubble: 'circle' })

  // --- 3. Pause and resume from the bubble.
  await pill.hover('[data-island]')
  await pill.waitForTimeout(600)
  await pill.click('[data-island-panel] button:has-text("Pause")')
  await pill.waitForTimeout(900)
  now = await v('focus:now')
  check('Pause pauses it', !!now?.pausedAt, String(now?.pausedAt))
  await shoot(pill, '04-paused-open', '[data-island-frame]')
  const pausedSaid = await pill.$eval('[data-island]', (one) => one.textContent).catch(() => '')
  check('the bubble says Paused', pausedSaid.includes('Paused'), pausedSaid.slice(0, 120))
  await pill.click('[data-island-panel] button:has-text("Resume")')
  await pill.waitForTimeout(900)
  check('Resume runs it again', !(await v('focus:now'))?.pausedAt)

  // --- 4. Ended early: asked, counted, the band after.
  await pill.click('[data-island-panel] button:has-text("Stop")')
  await pill.waitForTimeout(600)
  await shoot(pill, '05-end-early-ask', '[data-island-frame]')
  check('Stop asks “End early?”', !!(await pill.$('[data-stop-ask]')))
  await pill.keyboard.press('Escape')
  await pill.waitForTimeout(500)
  check('Esc on the ask goes back and keeps it running', !(await pill.$('[data-stop-ask]')) && !!(await v('focus:now')), String(!!(await pill.$('[data-stop-ask]'))))
  await pill.click('[data-island-panel] button:has-text("Stop")').catch(() => {})
  await pill.waitForTimeout(500)
  await pill.click('[data-end-early]').catch(() => {})
  await pill.waitForTimeout(1200)
  await shoot(pill, '06-after-ended-early', '[data-island-frame]')
  const kept = (await v('sessions', task.id)).find((one) => one.id === now.id)
  check('Count it keeps the session', !!kept?.endedAt && !kept.abandonedAt)
  await pointer(false)
  await pill.mouse.move(1, 1)
  await pill.waitForTimeout(9000)
  await pointer(true)

  // --- 5. Time's up, a break, the break over, Go again.
  const id = await v('session:start', task.id, 'Draft the intro', 2500)
  await h.evaluate(() => window.api.showFocus(true))
  await pill.waitForTimeout(5000)
  await shoot(pill, '07-times-up', '[data-island-frame]')
  check("time's up asks what next", !!(await pill.$('[data-take-break]')))
  await pill.click('[data-take-break]').catch(() => {})
  await pill.waitForTimeout(1500)
  const brk = await v('focus:now')
  check('Take a break starts a break', brk?.kind === 'break', brk?.kind)
  await shoot(pill, '08-break-open', '[data-island-frame]')
  await pointer(false)
  await pill.mouse.move(1, 1)
  await pill.waitForTimeout(2500)
  await shoot(pill, '08-break-rest', '[data-island-frame]')
  await pointer(true)
  if (brk) await v('session:cancel', brk.id)
  await pill.waitForTimeout(1200)
  await v('break:start', null, 2500)
  await h.evaluate(() => window.api.showFocus(true))
  await pill.waitForTimeout(5000)
  await shoot(pill, '09-break-over', '[data-island-frame]')
  await pill.click('[data-island-panel] [data-again]').catch(() => {})
  await pill.waitForTimeout(1500)
  const again = await v('focus:now')
  check('Go again starts the same session over', again?.taskId === task.id && again.kind !== 'break', JSON.stringify(again && { goal: again.goal }))
  if (again) await v('session:cancel', again.id)
  void id
  await pill.waitForTimeout(1200)

  // --- 6. Rounds: the dots.
  const rounds = await v('rounds:start', 'Read chapter 3', { rounds: 4, workMs: 25 * MIN, breakMs: 5 * MIN, longMs: 15 * MIN }).catch((error) => String(error))
  await h.evaluate(() => window.api.showFocus(true))
  await pill.waitForTimeout(2500)
  await pill.hover('[data-island]')
  await pill.waitForTimeout(800)
  await shoot(pill, '10-rounds-open', '[data-island-frame]')
  check('rounds show their dots', !!(await pill.$('[data-round-dots]')), JSON.stringify(rounds))
  const running = await v('focus:now')
  if (running) await v('session:cancel', running.id)
  await pill.waitForTimeout(1200)

  // --- 7. Under the notch: folded and open.
  await v('settings:set', { pillSits: 'notch' })
  await v('session:start', task.id, 'Under the notch', 25 * MIN)
  await h.evaluate(() => window.api.showFocus(true))
  await pointer(false)
  await pill.waitForTimeout(3000)
  await shoot(pill, '11-notch-rest')
  await pointer(true)
  await pill.hover('[data-island]').catch(() => {})
  await pill.waitForTimeout(900)
  await shoot(pill, '11-notch-open')
  const notched = await v('focus:now')
  if (notched) await v('session:cancel', notched.id)
  await v('settings:set', { pillSits: 'free' })
  await pill.waitForTimeout(1200)

  // --- 8. Practices: the page, a new one made, its timer.
  await go('practices')
  await h.waitForTimeout(1200)
  await shoot(h, '12-practices')
  const cutPractices = await cutOff(h, '.\\@container\\/page')
  check('Practices: nothing cut off', !cutPractices.length, cutPractices.join(' | '))
  await h.click('[data-new-practice]')
  await h.waitForTimeout(700)
  await shoot(h, '12-practice-form')
  await h.fill('[data-practice-name]', 'Scales on the piano')
  await h.waitForTimeout(200)
  await h.click('[data-practice-save]')
  await h.waitForTimeout(1200)
  const made = (await v('practices:list')).find((one) => one.name === 'Scales on the piano')
  check('Make practice makes it, and it is listed', !!made && !!(await h.$(`[data-practice-row="${made?.id}"]`)), JSON.stringify(made && { id: made.id, target: made.targetMin }))
  await shoot(h, '12-practice-made')
  await h.click(`[data-practice-row="${made?.id}"]`).catch(() => {})
  await h.waitForTimeout(600)
  await shoot(h, '12-practice-open')
  await h.click('[data-practice-start-now]').catch(() => {})
  await h.waitForTimeout(2500)
  const practising = await v('focus:now')
  check('Start runs the practice in the bubble', !!practising, JSON.stringify(practising && { goal: practising.goal, kind: practising.kind }))
  await pointer(false)
  await pill.waitForTimeout(2200)
  await shoot(pill, '12-practice-bubble-0', '[data-island-frame]')
  // Five minutes in, and at its target, by the bubble's own clock.
  for (const [name, by] of [['5min', 5 * MIN + 2000], ['target', (made?.targetMin ?? 30) * MIN + 2000]]) {
    await pill.evaluate(([code, offset]) => new Function(`(${code})(${offset})`)(), [shiftClock.toString(), by])
    await pill.waitForTimeout(2500)
    await shoot(pill, `12-practice-bubble-${name}`, '[data-island-frame]')
    const said = await pill.$eval('[data-island]', (one) => [...one.querySelectorAll('span, p, button')].filter((el) => !el.children.length).map((el) => el.textContent.trim()).filter(Boolean).join(' · ')).catch(() => '')
    console.log(`  practice at ${name}: ${said.slice(0, 120)}`)
  }
  await pointer(true)
  if (practising) await v('session:cancel', practising.id)
  await pill.waitForTimeout(1200)
  await pill.reload()
  await pill.waitForTimeout(1500)

  // --- 8a. The practice list's Mac gestures: ↓, ↵, Esc, ⌫, ⌘Z.
  await go('practices')
  await h.waitForTimeout(1000)
  await h.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur())
  await h.keyboard.press('ArrowDown')
  await h.waitForTimeout(300)
  check('↓ picks the first practice', await h.evaluate((id) => document.activeElement?.getAttribute('data-practice-row') === id, made?.id))
  await h.keyboard.press('Enter')
  await h.waitForTimeout(600)
  check('↵ opens it to change', !!(await h.$('[data-practice-form]')) && (await h.inputValue('[data-practice-name]').catch(() => '')) === 'Scales on the piano')
  await h.keyboard.press('Escape')
  await h.waitForTimeout(500)
  check('Esc closes the form', !(await h.$('[data-practice-form]')))
  await h.focus(`[data-practice-row="${made?.id}"]`)
  await h.keyboard.press('Backspace')
  await h.waitForTimeout(1200)
  check('⌫ moves it to the Bin', !(await v('practices:list')).some((one) => one.id === made?.id))
  await h.keyboard.press('Meta+z')
  await h.waitForTimeout(1200)
  check('⌘Z brings it back', (await v('practices:list')).some((one) => one.id === made?.id))

  // --- 8b. Stickies: the sandbox's own, and edge cases stuck up, in paper and glass.
  const make = (title, body) => h.evaluate(([t, b]) => window.api.captures.create({ title: t, body: b }), [title, body])
  const para = (text) => ({ type: 'paragraph', content: [{ type: 'text', text }] })
  const long = await make('A very long title for a sticky note that keeps going well past the width of any card', { type: 'doc', content: [para('A very long title for a sticky note that keeps going well past the width of any card'), para('Supercalifragilisticexpialidociousandthensomemorewithoutanyspace')] })
  const emoji = await make('🌿', { type: 'doc', content: [para('🌿')] })
  const empty = await make('', { type: 'doc', content: [] })
  for (const one of [long, emoji, empty]) await h.evaluate((id) => window.api.stick('capture', id, true), one)
  for (const glass of [false, true]) {
    await v('settings:set', { stickiesGlass: glass })
    await wait(3000)
    const stickies = electron.windows().filter((one) => one.url().includes('view=sticky'))
    check(`stickies are up (${glass ? 'glass' : 'paper'})`, stickies.length >= 3, String(stickies.length))
    let n = 0
    for (const one of stickies) {
      await one.waitForLoadState('domcontentloaded').catch(() => {})
      await shoot(one, `14-sticky-${glass ? 'glass' : 'paper'}-${n++}`)
      const over = await one.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1 || [...document.querySelectorAll('.sticky-text')].some((el) => el.scrollWidth > el.clientWidth + 1)).catch(() => false)
      check(`sticky ${n} (${glass ? 'glass' : 'paper'}) has no words past its edge`, !over)
    }
  }
  await v('settings:set', { stickiesGlass: false })
  for (const one of [long, emoji, empty]) await h.evaluate((id) => window.api.stick('capture', id, false), one)

  // --- 9. Stats and habits.
  await go('stats')
  await h.waitForTimeout(1800)
  await shoot(h, '13-stats-top')
  for (let i = 1; i <= 4; i++) {
    await h.evaluate((n) => { const el = [...document.querySelectorAll('*')].filter((one) => one.scrollHeight > one.clientHeight + 20 && /(auto|scroll)/.test(getComputedStyle(one).overflowY)).sort((a, b) => b.clientHeight * b.clientWidth - a.clientHeight * a.clientWidth)[0]; el?.scrollTo(0, n * (el.clientHeight - 80)) }, i)
    await h.waitForTimeout(600)
    await shoot(h, `13-stats-${i}`)
  }
  const cutStats = await cutOff(h, '.\\@container\\/page')
  check('Stats: nothing cut off', !cutStats.length, cutStats.join(' | '))

  // --- 10. Settings, every section, two sizes, two themes.
  const sections = ['Appearance', 'Writing', 'What comes back to you', 'Review', 'Tasks', 'Calendar', 'Scenery', 'Sound', 'Import and backups', 'Keys', 'Help']
  for (const [w, hh, theme] of [[1600, 1000, 'paper'], [900, 700, 'github']]) {
    await c.size(w, hh)
    await c.theme(theme)
    await go('settings')
    for (const name of sections) {
      await h.click(`[data-section="${name}"]`)
      await h.waitForTimeout(700)
      await shoot(h, `20-settings-${w}-${theme}-${name.replace(/\W+/g, '-')}`)
      const cut = await cutOff(h, '[data-setting]')
      check(`Settings ${name} at ${w} in ${theme}: nothing cut off`, !cut.length, cut.join(' | '))
    }
    // Sliders line up down a section: their left edges match.
    await h.click('[data-section="What comes back to you"]')
    await h.waitForTimeout(600)
    // A slider with only its value beside it (a row with a preview too sits further left by the preview's width).
    const lefts = await h.$$eval('[data-setting-slider]', (all) => [...new Set(all.filter((one) => one.parentElement.children.length === 2).map((one) => Math.round(one.getBoundingClientRect().left)))])
    check(`sliders line up at ${w}`, lefts.length === 1, lefts.join(','))
  }
  await c.size(1280, 860)
  await c.theme('paper')

  // Look settings that had no picture of what they change now show one, and it answers the switch.
  await go('settings')
  for (const [section, title, preview] of [['Calendar', 'Show the month on Home', 'home-month'], ['Calendar', 'Show the time gone on Home', 'home-time-gone'], ['Writing', 'Fold headings', 'fold'], ['Writing', 'Title at the top', 'title-top']]) {
    await h.click(`[data-section="${section}"]`)
    await h.waitForTimeout(500)
    const row = `[data-setting-title="${title}"]`
    const look = () => h.$eval(`${row} [data-preview="${preview}"]`, (one) => one.outerHTML.replace(/\s+/g, ' ')).catch(() => null)
    const before = await look()
    await h.click(`${row} [role=switch]`)
    await h.waitForTimeout(500)
    const after = await look()
    await h.click(`${row} [role=switch]`)
    await h.waitForTimeout(400)
    check(`“${title}” shows what it changes, and the picture follows the switch`, !!before && !!after && before !== after)
    await shoot(h, `21-preview-${preview}`, row)
  }

  const errors = c.errors.filter((one) => one.includes('PAGEERROR'))
  check('no page errors', !errors.length, errors.join(' | ').slice(0, 300))
} finally {
  await c.close()
}
done()
void shiftClock
