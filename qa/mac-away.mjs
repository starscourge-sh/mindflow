// Lock and away (every Mac): the screen locked for five hours (the clock moved on while locked), then
// unlocked: the main window says once what came due ("Welcome back after 5 hours: ..."); locked for ten
// minutes, nothing is said; Settings' "Welcome back" off, nothing is said. A day away never breaking a
// streak is proved in test/focus-numbers.test.ts and test/study.test.ts.
//   QA_ARGS=--sandbox QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/mac-away.mjs
import { sandbox, shiftClock } from './sandbox-lib.mjs'
import { checks } from './harness.mjs'

const { check, done } = checks()
const c = await sandbox({ width: 1200, height: 860 })
const { h, v, electron } = c
const wait = (ms) => h.waitForTimeout(ms)
const clock = (offset) => electron.evaluate((_, [code, by]) => new Function(`(${code})(${by})`)(), [shiftClock.toString(), offset])
const power = (name) => electron.evaluate(({ powerMonitor }, name) => powerMonitor.emit(name), name)
const said = async () => {
  for (let t = 0; t < 4000; t += 200) {
    const one = await h.evaluate(() => document.body.innerText.match(/Welcome back after[^\n]*/)?.[0] ?? null)
    if (one) return one
    await wait(200)
  }
  return null
}
try {
  await h.evaluate(() => window.api.haligtree('task:add', { title: 'Hand in the essay', dueAt: new Date(Date.now() + 3 * 3600_000).toISOString(), allDay: 0 }).catch(() => null))
  // Ten minutes locked: nothing.
  await power('lock-screen')
  await clock(10 * 60_000)
  await power('unlock-screen')
  check('back after ten minutes: nothing is said', (await said()) === null)
  // Five hours locked.
  await power('lock-screen')
  await clock(5 * 3600_000)
  await power('unlock-screen')
  const line = await said()
  check('back after five hours: one line says what came due', /^Welcome back after 5 hours: .*(tasks? (is|are) due|cards? (is|are) ready)/.test(line ?? ''), line)
  if (process.env.SHOT) await c.both(`${process.env.SHOT}/away-back`)
  // Off.
  await v('settings:set', { backLine: false })
  await h.reload()
  await wait(2000)
  await power('suspend')
  await clock(11 * 3600_000)
  await power('resume')
  check('with “Welcome back” off, nothing is said', (await said()) === null)
  await clock(0)
  check('no page errors', !c.errors.length, c.errors.slice(0, 3).join(' | '))
} finally {
  await c.close()
}
done()
