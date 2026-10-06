// The views that show dates, shot and read out as text, so a before and an after can be compared.
import { writeFileSync } from 'fs'
import { start, done, SHOT } from './qa-visual-lib.mjs'
const tag = process.env.TAG ?? 'before'
const c = await start()
const { page } = c
await c.v('settings:set', { safeMode: false, motion: false, hintRate: 0, rotCount: 0, scenery: false })
await c.theme('dark')
const seeds = ['dq call the accountant tomorrow 10am', 'dq water plants every 3 days', 'dq file taxes by friday', 'dq dentist in 4 days 15:00', 'dq trip on the 31st', 'dq review notes yesterday', 'dq pay rent next monday', 'dq plan party in 9 days']
const have = (await c.v('tasks')).map((t) => t.title)
for (const s of seeds) if (!have.some((t) => t.startsWith(s.slice(0, 12)))) await c.v('task:add', s)
const home = await c.showHome(1180, 900)
const out = {}
for (const view of ['inbox', 'today', 'upcoming', 'week', 'day', 'weekpage', 'monthpage', 'questions', 'stats']) {
  await c.send('view', view); await home.waitForTimeout(2200)
  await c.shot(home, `dates-${tag}-${view}`)
  out[view] = await home.evaluate(() => (document.querySelector('main') ?? document.body).innerText)
}
await c.send('recap', 'month'); await home.waitForTimeout(6000)
await c.shot(home, `dates-${tag}-recap`)
out.recap = await home.evaluate(() => (document.querySelector('main') ?? document.body).innerText)
writeFileSync(`${SHOT}/dates-${tag}.json`, JSON.stringify(out, null, 1))
done(c)
