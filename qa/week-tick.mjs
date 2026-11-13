// Ticking a task on the Journal's Week page ticks it as Tasks and Today's panel do (the user, 13 Nov: "how come ticking
// an item here just disappears it?"): the tick and the line through its name at once, then, a moment later, it is done
// and goes. Never gone at the press.
//   QA_ARGS=--sandbox QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/week-tick.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'
const { check, done } = checks()
const c = await sandbox({ width: 1200, height: 900 })
const { h, v, go } = c
const wait = (ms) => h.waitForTimeout(ms)
try {
  await v('settings:set', { hintRate: 0 })
  const id = (await v('task:add', 'Week tick check', undefined, true)).id
  await go('weekpage')
  await wait(1500)
  const sel = `[data-week-task="${id}"]`
  check('the task is on the Week page', !!(await h.$(sel)))
  // Pressed, then read every frame the page draws for 900 ms.
  const frames = await h.evaluate(async (sel) => {
    const row = document.querySelector(sel)
    const tick = row.querySelector('[data-task-tick]') ?? row.querySelector('button')
    const out = []
    const t0 = performance.now()
    tick.click()
    await new Promise((finish) => {
      const step = () => {
        const now = document.querySelector(sel)
        const name = now?.querySelector('[data-task-title]')
        out.push({ t: Math.round(performance.now() - t0), there: !!now, struck: !!name?.classList.contains('mf-strike') })
        if (performance.now() - t0 < 900) requestAnimationFrame(step)
        else finish()
      }
      requestAnimationFrame(step)
    })
    return out
  }, sel)
  const early = frames.filter((one) => one.t <= 150)
  check('pressed, it stays in its place a moment, ticked and struck through, as in Tasks', early.length > 0 && early.every((one) => one.there && one.struck), JSON.stringify(early.slice(0, 4)))
  check('then it is done and goes', frames.length > 0 && !frames.at(-1).there, JSON.stringify(frames.at(-1)))
  const task = await v('task', id)
  check('and it is done', task?.status === 'done', String(task?.status))
  check('no page errors', !c.errors.length, c.errors.slice(0, 3).join(' | '))
} catch (error) {
  check('the run finished', false, String(error?.message ?? error).split('\n')[0])
} finally {
  await c.close()
}
done()
