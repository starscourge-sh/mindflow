// Focus numbers from nothing: a fresh install's Stats shows its made-up
// example; with a capture of your own and no sessions, one plain line saying
// how to start; after the first session, the task and Stats say it is the first.
//   QA_ENTRY=out-stats/main/index.js MINDFLOW_QA_AWAY=1 SHOTS=<dir> node qa/focus-stats-first.mjs
import { mkdirSync, mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

const data = mkdtempSync(join(tmpdir(), 'vigil-focus-first-'))
process.env.QA_DATA = data
process.env.QA_ARGS = ''
const { sandbox } = await import('./sandbox-lib.mjs')
const dir = process.env.SHOTS ?? `${data}/shots`
mkdirSync(dir, { recursive: true })
const results = []
const check = (name, ok, detail = '') => { results.push(!!ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`) }

const c = await sandbox({ width: 1100, height: 900, seeded: false })
const { h, v, go, send } = c
const text = () => h.evaluate(() => document.body.innerText)
try {
  await v('onboarding:set', { welcomed: new Date().toISOString(), newsSeen: true, pageHints: false })
  await v('settings:set', { motion: false, hintRate: 0 })
  await h.reload()
  await h.waitForTimeout(1500)
  await go('stats')
  await h.waitForTimeout(1200)
  check('a fresh install shows the example, focus and all', /of focus in the last 7 days/.test(await text()) && (await h.locator('[data-example-frame]').count()) > 0)

  await h.evaluate(() => window.api.captures.create({ kind: 'note', body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'one of mine' }] }] } }))
  await go('home'); await go('stats')
  await h.waitForTimeout(1200)
  check('with no sessions: one line on how to start', await h.locator('[data-focus-empty]').isVisible(), (await h.locator('[data-focus-empty]').textContent().catch(() => '')) ?? '')
  await h.locator('[data-focus-empty]').scrollIntoViewIfNeeded()
  await h.screenshot({ path: `${dir}/first-empty.png` })

  const task = (await v('task:add', 'Write the first chapter', undefined, false)).id
  const id = await v('session:start', task, '', 25 * 60_000)
  await h.waitForTimeout(1500)
  await v('session:end', id, '', false)
  const one = await v('focus:task', task)
  check('the first session counts', one.recent.length === 1 && one.recent[0].outcome === 'early', JSON.stringify(one.recent))
  await send('task', task)
  await h.waitForTimeout(1500)
  check('the task says it was the first', /Your first session here/.test(await h.locator('[data-task-focus]').textContent()))
  await h.locator('[data-task-focus]').screenshot({ path: `${dir}/first-task.png` })
  await go('stats')
  await h.waitForTimeout(1200)
  const page = await text()
  check('Stats says the first is in, and holds back the best time', /Your first session is in/.test(page) && /Shown after three sessions/.test(page) && !/When you focus/.test(page))
  await h.locator('[data-focus-chart]').scrollIntoViewIfNeeded()
  await h.screenshot({ path: `${dir}/first-stats.png` })
  check('no page errors', !c.errors.length, c.errors.join(' | '))
} finally {
  await c.close()
  rmSync(data, { recursive: true, force: true })
}
console.log(`${results.filter(Boolean).length}/${results.length} passed`)
process.exit(results.every(Boolean) ? 0 : 1)
