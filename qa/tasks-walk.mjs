// The tasks area walked on sandbox data, light and dark, small and large:
// Home, Today (list, page, matrix), Tomorrow, Upcoming, Later, Routines, the
// Calendar's day, week and month, the day side panel, a task opened, the week
// board and the focus pill. Worst-case data first: a very long name with an
// unbreakable word, and thirty tasks today. Screenshots go to SHOTS/TAG-*.png.
//
//   npx electron-vite build --outDir out-tasks
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-tasks/main/index.js HALIGTREE_QA_AWAY=1 SHOTS=dir TAG=before node qa/tasks-walk.mjs
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const c = await sandbox({ width: 900, height: 640 })
const { h, v, go, size, theme } = c
const shots = process.env.SHOTS
const tag = process.env.TAG ?? 'shot'
const results = []
const check = (name, ok, detail = '') => (results.push(!!ok), console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`))
const shot = async (name) => shots && h.screenshot({ path: `${shots}/${tag}-${name}.png` })
// Anything wider than its box: the page itself, or a row whose text runs past its edge unclipped.
const wide = () => h.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
try {
  await v('settings:set', { hintRate: 0 })
  const long = (await v('task:add', 'walk ' + 'a very long task name that keeps going and going without stopping '.repeat(3) + 'Supercalifragilisticexpialidociousunbreakableword')).id
  await v('task:save', long, { due: new Date().toISOString(), estimate: 90 })
  for (let n = 1; n <= 30; n++) await v('task:add', `walk many ${n} today`)
  const views = ['home', 'today', 'matrix', 'day', 'tomorrow', 'upcoming', 'later', 'routines', 'weekpage', 'week']
  let sideways = []
  for (const look of ['light', 'dark']) {
    await theme(look)
    for (const [w, hh] of [[900, 640], [1600, 1000]]) {
      await size(w, hh)
      for (const id of views) {
        await go(id)
        const over = await wide()
        if (over > 0) sideways.push(`${id} ${w} ${look} ${over}px`)
        await shot(`${look}-${w}-${id}`)
      }
      await go('calendar')
      for (const k of ['d', 'm', 'w']) {
        await h.keyboard.press(k); await h.waitForTimeout(400)
        const over = await wide()
        if (over > 0) sideways.push(`calendar ${k} ${w} ${look} ${over}px`)
        await shot(`${look}-${w}-calendar-${k}`)
      }
      await h.locator('[data-cal-col]').first().click({ position: { x: 10, y: 20 } }); await h.waitForTimeout(600)
      await shot(`${look}-${w}-day-side`)
      check(`the day side panel opens at ${w} ${look}`, await h.locator('[data-day-side]').count() === 1)
      await h.keyboard.press('Escape'); await h.waitForTimeout(400)
      await c.send('task', long); await h.waitForTimeout(1200)
      await shot(`${look}-${w}-task-detail`)
    }
  }
  // A new task that matches one already there leaves that one on its day and says so.
  const twin = (await v('tasks')).find((one) => one.title === 'walk many 1')
  await go('calendar'); await h.keyboard.press('w'); await h.waitForTimeout(400)
  await h.locator('[data-cal-col]').last().click({ position: { x: 10, y: 20 } }); await h.waitForTimeout(600)
  await h.keyboard.type('walk many 1'); await h.keyboard.press('Enter'); await h.waitForTimeout(1200)
  const after = (await v('tasks')).find((one) => one.id === twin.id)
  check('a matching new task leaves the old one on its day, and says so', after.dueAt === twin.dueAt && /Already a task/.test(await h.textContent('body')), `${twin.dueAt} -> ${after.dueAt}`)
  await h.keyboard.press('Escape'); await h.waitForTimeout(300)
  check('no sideways page scroll anywhere', !sideways.length, sideways.join(', '))
  await v('session:start', long, 'walk focus', 25 * 60000); await h.evaluate(() => window.api.showFocus(true)); await h.waitForTimeout(2500)
  const pill = c.electron.windows().find((one) => one.url().includes('view=focus'))
  if (pill && shots) await pill.screenshot({ path: `${shots}/${tag}-pill.png` })
  check('the focus pill is open', !!pill)
  check('no page errors', !c.errors.length, c.errors.join(' | '))
} finally {
  console.log(`${results.filter(Boolean).length}/${results.length} passed`)
  await c.close()
}
