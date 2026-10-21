// Built for scale (item 52), tasks and the Calendar: with 2,000 open tasks,
// 1,500 of them with no day, the lists stay quick and short.
//   - Today's list draws only the rows on screen, never all of them;
//   - the Calendar opens and its Unscheduled list shows eight, then a hundred more a press;
//   - switching pages and scrolling stay under the limits below, or the probe fails.
//
//   npx electron-vite build --outDir out-cal
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-cal/main/index.js MINDFLOW_QA_AWAY=1 node qa/scale-tasks.mjs
import { sandbox } from './sandbox-lib.mjs'

const c = await sandbox({ width: 1600, height: 1000 })
const { h, v, go } = c
const results = []
const check = (name, ok, detail = '') => (results.push(!!ok), console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`))
const wait = (ms) => h.waitForTimeout(ms)
// Limits, in ms: a page shown, a scroll's frames.
const OPEN = 2500
const FRAME = 50
try {
  await v('settings:set', { hintRate: 0 })
  await v('onboarding:set', { pageHints: false })
  const made = Date.now()
  for (let i = 0; i < 2000; i += 50)
    await Promise.all(Array.from({ length: 50 }, (_, n) => v('task:add', `Scale probe task ${i + n + 1}${i + n < 500 ? ' today' : ''}`, undefined, i + n < 500)))
  console.log(`made 2,000 tasks in ${Math.round((Date.now() - made) / 1000)}s`)
  const open = async (view, ready) => {
    await go('home'); await wait(800)
    const start = Date.now()
    await c.send('view', view)
    await h.waitForSelector(ready, { timeout: 15000 })
    return Date.now() - start
  }
  const today = await open('today', '[data-row]')
  check(`Today opens with 500 tasks on it under ${OPEN} ms`, today < OPEN, `${today} ms`)
  await wait(800)
  const rows = await h.locator('[data-row]').count()
  check('Today\'s list draws only the rows on screen, not all 500', rows > 0 && rows < 120, `${rows} rows drawn`)
  const frames = await h.evaluate(async () => {
    const box = [...document.querySelectorAll('*')].find((el) => el.scrollHeight > el.clientHeight + 2000 && /auto|scroll/.test(getComputedStyle(el).overflowY))
    if (!box) return null
    // The window's own frame pace first, doing nothing: a busy or hidden window is slow for every page alike.
    const pace = async (step) => {
      const gaps = []
      let last = performance.now()
      for (let i = 0; i < 40; i++) {
        step()
        await new Promise((go) => requestAnimationFrame(go))
        const now = performance.now()
        gaps.push(now - last)
        last = now
      }
      gaps.sort((a, b) => a - b)
      return gaps
    }
    const idle = await pace(() => {})
    // About a fast trackpad flick: 120px a frame.
    const gaps = await pace(() => (box.scrollTop += 120))
    return { median: Math.round(gaps[20]), worst: Math.round(gaps.at(-1)), idle: Math.round(idle[20]) }
  })
  check(`scrolling Today adds under ${FRAME} ms a frame to the window's own pace (median)`, !!frames && frames.median - frames.idle < FRAME, JSON.stringify(frames))
  const cal = await open('calendar', '[data-cal-grid]')
  check(`the Calendar opens under ${OPEN} ms`, cal < OPEN, `${cal} ms`)
  await wait(800)
  const loose = await h.locator('[data-cal-loose]').count()
  const more = (await h.locator('[data-cal-loose-more]').innerText().catch(() => '')).trim()
  check('Unscheduled shows eight of 1,500, and a hundred more a press', loose === 8 && /^Show 100 more\s*of 1,[45]\d\d$/.test(more), `${loose} shown, "${more}"`)
  await h.locator('[data-cal-loose-more]').click()
  await wait(500)
  check('"Show 100 more" draws 108, not all 1,500', (await h.locator('[data-cal-loose]').count()) === 108, `${await h.locator('[data-cal-loose]').count()}`)
  const back = await open('today', '[data-row]')
  check(`back to Today under ${OPEN} ms`, back < OPEN, `${back} ms`)
  if (c.errors.length) console.log('errors:', c.errors.slice(0, 5))
} catch (error) {
  console.log('PROBE ERROR', error)
  results.push(false)
} finally {
  console.log(`\n${results.filter(Boolean).length}/${results.length} passed`)
  await c.close()
  process.exit(results.every(Boolean) ? 0 : 1)
}
