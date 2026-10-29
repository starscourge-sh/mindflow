// A change made anywhere shows on the stickies and in the menu bar at once,
// with no restart: a rename, a Bin and its Undo on a note's, a gem's and a
// Page's sticky; a goal renamed on its sticky and in the menu bar's goals; a
// task added, renamed and done on the Today sticky and in the menu bar's
// "due" count.
//
//   npx electron-vite build --outDir out-x
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/live-elsewhere.mjs
import { sandbox } from './sandbox-lib.mjs'
import { checks } from './harness.mjs'
process.env.QA_ARGS ??= '--sandbox'

const { check, done } = checks()
const c = await sandbox({ width: 1100, height: 760 })
const { h, v, electron } = c
const doc = (text) => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] })
// Watched for up to 3 seconds: the menu bar's own clock comes round only every 30.
const soon = async (read) => {
  for (let i = 0; i < 15; i++) {
    if (await read()) return true
    await h.waitForTimeout(200)
  }
  return false
}
const stickyText = (key) => {
  const win = electron.windows().find((one) => one.url().includes('sticky') && one.url().includes(key))
  return win ? win.evaluate(() => document.body.innerText).catch(() => '') : Promise.resolve('')
}
const stuck = []
const stick = async (type, id) => {
  await h.evaluate(([t, i]) => window.api.stick(t, i, true), [type, id])
  stuck.push([type, id])
  await h.waitForTimeout(1800)
}
try {
  // A note, a gem and a Page, each stuck to the screen.
  const note = await h.evaluate((d) => window.api.captures.create({ kind: 'note', body: d }), doc('Stickyone note'))
  const gem = await v('nugget:from', 'Stickyone gem', {})
  const pageId = await v('article:new')
  await v('item:save', pageId, { title: 'Stickyone page', body: doc('Stickyone page words') })
  for (const [type, id, what] of [['capture', note, 'note'], ['nugget', gem, 'gem'], ['article', pageId, 'Page']]) {
    await stick(type, id)
    check(`the ${what}'s sticky shows it`, /Stickyone/.test(await stickyText(id)))
    if (type === 'capture') await h.evaluate(([i, d]) => window.api.captures.save(i, { body: d }), [id, doc('Stickytwo note')])
    else await v('item:save', id, type === 'article' ? { title: 'Stickytwo page' } : { body: doc('Stickytwo gem') })
    check(`the ${what}'s sticky shows a rename at once`, await soon(async () => /Stickytwo/.test(await stickyText(id))))
    const before = await stickyText(id)
    // A capture goes to the Bin by its status, the rest by bin:put, as their menus do.
    if (type === 'capture') await h.evaluate((i) => window.api.captures.save(i, { status: 'discarded' }), id)
    else await v('bin:put', id)
    check(`the ${what}'s sticky says it went to the Bin`, await soon(async () => (await stickyText(id)) !== before), (await stickyText(id)).slice(0, 80))
    await v('bin:restore', type, id)
    check(`and its Undo shows it back`, await soon(async () => (await stickyText(id)) === before))
  }

  // A goal: its sticky and the menu bar's goals.
  const day = new Date(Date.now() + 20 * 86400000).toISOString().slice(0, 10)
  const goal = await v('goal:new', 'Trayone goal', day)
  const goalId = typeof goal === 'string' ? goal : goal.id
  await stick('goal', goalId)
  check('the menu bar lists a new goal at once', await soon(async () => (await electron.evaluate(() => globalThis.trayMenu ?? [])).some((one) => one.label === 'Trayone goal')))
  await v('item:save', goalId, { title: 'Traytwo goal' })
  check('the goal sticky shows its new name', await soon(async () => /Traytwo goal/.test(await stickyText(goalId))))
  check('the menu bar shows the goal\'s new name at once', await soon(async () => (await electron.evaluate(() => globalThis.trayMenu ?? [])).some((one) => one.label === 'Traytwo goal')))

  // A task due now: the Today sticky and the menu bar's count.
  await stick('today', 'today')
  const countOf = async () => Number((/(\d+) due/.exec(await electron.evaluate(() => globalThis.trayTitle ?? '')) ?? [0, 0])[1])
  const was = await countOf()
  const task = await v('task:add', 'Trayone task')
  await v('task:save', task.id, { due: new Date(Date.now() - 3600000).toISOString(), allDay: 0 })
  check('the Today sticky lists a task added elsewhere', await soon(async () => /Trayone task/.test(await stickyText('today'))))
  check('the menu bar counts a task now due at once', await soon(async () => (await countOf()) === was + 1), `${was} -> ${await countOf()}`)
  await v('task:save', task.id, { title: 'Traytwo task' })
  check('the Today sticky shows the task renamed', await soon(async () => /Traytwo task/.test(await stickyText('today'))))
  await v('task:done', task.id)
  check('the menu bar count drops when it is done', await soon(async () => (await countOf()) === was), `${await countOf()}`)
  check('no page errors', !c.errors.filter((e) => /PAGEERROR/.test(e)).length, c.errors.join(' | ').slice(0, 300))
} finally {
  for (const [type, id] of stuck) await h.evaluate(([t, i]) => window.api.stick(t, i, false), [type, id]).catch(() => {})
  await c.close()
  done()
}
