// Today's "Now" across midnight, with the app left open: a line ticked at 23:59
// is yesterday's, so once the clock passes midnight it is gone from Now, the
// lines left open move to "from before", and the count counts the new day only
// ("1 done today, 5 to go (2 from before)" once one of those is ticked).
// The sandbox's `at` clock starts at 23:58; the probe waits out the real minute.
//
//   npx electron-vite build --outDir out-r
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-r/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox node qa/now-midnight.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const { check, done } = checks()
const c = await sandbox({ width: 1100, height: 900, at: '23:58' })
const { h, v, go, now } = c
const wait = (ms) => h.waitForTimeout(ms)
const shots = process.env.QA_SHOTS
const LINES = ['Write the report', 'Call the bank', 'Fix the gate latch', 'Read chapter 4']
const nowLines = () => h.evaluate(() => [...document.querySelectorAll('[data-day-line][data-section=now]')].map((row) => row.querySelector('textarea,button[role=checkbox]')?.getAttribute('aria-label')))
const count = () => h.evaluate(() => document.querySelector('[data-now-count]')?.innerText.replace(/\s+/g, ' ').trim() ?? '')
const flat = (text) => text.replace(/\s+/g, '')

try {
  // Only the lines written here on today: the sandbox's own moved off it.
  const tonight = new Date(new Date(now()).setHours(24, 0, 0, 0))
  const later = new Date(now().getTime() + 3 * 864e5).toISOString()
  for (const task of await v('tasks')) {
    if (task.status !== 'open') continue
    if (task.dueAt && new Date(task.dueAt) < tonight) await v('task:save', task.id, { due: later })
    if (task.deadline && new Date(task.deadline) < tonight) await v('task:save', task.id, { deadline: later })
  }
  await h.evaluate(() => localStorage.setItem('view:tasks:today', JSON.stringify({ sort: 'manual', group: 'page' })))
  await go('today'); await wait(2000)
  // The sandbox's own lines planned for today moved off it too, then four of ours planned for today.
  const theirs = await nowLines()
  for (const task of await v('tasks')) if (task.status === 'open' && theirs.includes(task.title)) await v('task:save', task.id, { plan: null, due: later })
  for (const line of LINES) await v('task:add', line, undefined, true)
  await wait(1500)
  console.log('before tick', now().toTimeString().slice(0, 8), (await nowLines()).join(' | '))
  await h.click(`[data-day-line][data-section=now] button[role=checkbox][aria-label="${LINES[0]}"]`)
  await wait(1200)
  const before = await count()
  const doneBefore = await h.evaluate(() => [...document.querySelectorAll('[data-day-line][data-section=now][data-done]')].map((row) => row.querySelector('button[role=checkbox]')?.getAttribute('aria-label')))
  check('before midnight: the ticked line is in Now, counted', (await nowLines()).includes(LINES[0]) && /done today/.test(before), `${(await nowLines()).join(' | ')} / ${before}`)
  if (shots) await h.screenshot({ path: `${shots}/now-midnight-before.png` })

  // The real minute passes: the app's clock is past midnight.
  while (now().getHours() === 23) await wait(1000)
  await wait(2500)
  const lines = await nowLines()
  check('past midnight: the line ticked yesterday is gone from Now, and so are the lines done yesterday', doneBefore.includes(LINES[0]) && doneBefore.every((one) => !lines.includes(one)), `${doneBefore.join(' | ')} -> ${lines.join(' | ')}`)
  check('past midnight: nothing counted as done today', !/done today/.test(await count()) || flat(await count()).startsWith('0done'), await count())
  // One of yesterday's open lines ticked now: the count is the new day's.
  const late = h.locator(`button[role=checkbox][aria-label="Done: ${LINES[1]}"], [data-day-line] button[role=checkbox][aria-label="${LINES[1]}"]`).first()
  await late.click()
  await wait(1500)
  const after = await count()
  check('one ticked after midnight: "1 done today, N to go (2 from before)", the new day\'s own lines in N', /^1donetoday,\d+togo\(2frombefore\)$/.test(flat(after)), after)
  for (const theme of ['light', 'dark']) {
    await h.evaluate((d) => document.documentElement.classList.toggle('dark', d), theme === 'dark')
    await wait(300)
    if (shots) await h.screenshot({ path: `${shots}/now-midnight-${theme}.png` })
  }
} catch (error) {
  check('ran', false, error.stack)
} finally {
  await c.close()
}
done()
