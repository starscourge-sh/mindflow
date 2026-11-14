// Back and Forward through the calendar (the user, 14 Nov, with Month, then Week, then Day: "it only makes sense to
// also be updating history here"): each change of Day, Week or Month and each move to other days is a step, so ⌘[
// walks back through them and ⌘] forward again; going back never makes a step of its own (Forward still works).
//   QA_DATA=<copy of the seeded sandbox> QA_ARGS=--sandbox QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/cal-back.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'
const { check, done } = checks()
const c = await sandbox({ width: 1440, height: 900 })
const { h, v } = c
const wait = (ms = 900) => h.waitForTimeout(ms)
/** What the calendar shows, read off the page: its view and what is on show (the day, the week's first day, the month). */
const shown = () => h.evaluate(() => {
  const page = document.querySelector('section[data-cal-mode]')
  if (!page) return 'not the calendar'
  const mode = page.getAttribute('data-cal-mode')
  const here = page.querySelector('[data-cal-level][data-cal-role="here"]')
  const at = here?.getAttribute('data-cal-at') ?? '?'
  const first = mode === 'week' ? here?.querySelector('[data-cal-head]')?.getAttribute('data-cal-head') : null
  return `${mode} ${mode === 'month' ? at.slice(0, 7) : first ?? at}`
})
const press = (sel) => h.evaluate((sel) => document.querySelector(sel)?.click(), sel)
const key = async (keys) => (await h.keyboard.press(keys), await wait())
try {
  await v('settings:set', { sounds: false, hintRate: 0 })
  await c.send('view', 'today'); await wait()
  await c.send('view', 'calendar'); await wait(1500)
  await press('[data-cal-view="month"]'); await wait()
  const month = await shown()
  await press('[data-cal-view="week"]'); await wait()
  const week = await shown()
  await press('[data-cal-view="day"]'); await wait()
  const day = await shown()
  check('Month, Week and Day each shown', /^month /.test(month) && /^week /.test(week) && /^day /.test(day), [month, week, day].join(' | '))
  await key('Meta+BracketLeft')
  const back1 = await shown()
  await key('Meta+BracketLeft')
  const back2 = await shown()
  check('Back from Day is the Week it came from, and Back again the Month', back1 === week && back2 === month, `${back1} | ${back2}`)
  await key('Meta+BracketRight')
  const forward = await shown()
  check('Forward is that Week again (Back made no step of its own)', forward === week, forward)
  await press('[data-cal-next]'); await wait()
  const next1 = await shown()
  await press('[data-cal-next]'); await wait()
  const next2 = await shown()
  await key('Meta+BracketLeft')
  const back3 = await shown()
  await key('Meta+BracketLeft')
  const back4 = await shown()
  check('each move to other days is a step: Back walks the weeks back one at a time', next1 !== week && next2 !== next1 && back3 === next1 && back4 === week, [next1, next2, back3, back4].join(' | '))
  await press('[data-cal-next]'); await wait()
  const ahead = await shown()
  await press('[data-cal-today]'); await wait()
  const today = await shown()
  await key('Meta+BracketLeft')
  const back5 = await shown()
  check('"Today" is a step too: Back goes to the week shown before it', ahead !== week && today === week && back5 === ahead, [ahead, today, back5].join(' | '))
  check('no page errors', !c.errors.some((one) => one.includes('PAGEERROR')), c.errors.slice(0, 3).join(' | '))
} catch (error) {
  check('the run finished', false, String(error?.message ?? error).split('\n')[0])
} finally {
  await c.close()
}
done()
