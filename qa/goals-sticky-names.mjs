// The shared goals sticky with 13 open goals: each lane drawn says its goal's
// name and days left, the nearest few only, then "and N more"; resting on a
// lane names it in the footer, a click opens that goal. Saves a frame.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-m/main/index.js HALIGTREE_QA_AWAY=1 node qa/goals-sticky-names.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const { check, done } = checks()
const c = await sandbox({ width: 1280, height: 860 })
const { electron, h, v, go } = c
const wait = (ms) => h.waitForTimeout(ms)
const day = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toLocaleDateString('en-CA') }
try {
  await v('settings:set', { stickiesGlass: false, sounds: false })
  const open = (await v('items', 'goal')).filter((one) => !one.closedAt && !one.archivedAt && one.goalAt).length
  for (let i = open; i < 13; i++) await v('goal:new', i === open ? 'A goal with a long name that will not fit on its lane at all' : `Goal number ${i + 1}`, day(10 + i * 4), day(-20 + i))
  const goals = (await v('items', 'goal')).filter((one) => !one.closedAt && !one.archivedAt && one.goalAt)
  await go('goals')
  await h.locator('[data-all-goals-sticky]').click(); await wait(1500)
  let all = null
  for (let i = 0; i < 40 && !all; i++) (all = electron.windows().find((one) => !one.isClosed() && one.url().includes('type=goals&id=all')) ?? null, await wait(250))
  check('the goals sticky is up', !!all)
  await all.waitForSelector('[data-goals-lane]', { timeout: 8000 })
  await wait(800)
  const seen = await all.evaluate(() => ({
    lanes: [...document.querySelectorAll('[data-goals-lane]')].map((one) => ({ id: one.getAttribute('data-goals-lane'), name: one.querySelector('[data-goals-name]')?.textContent ?? '', shown: one.querySelector('[data-goals-name]')?.getBoundingClientRect().width ?? 0, text: one.textContent })),
    more: document.querySelector('[data-goals-more]')?.textContent ?? '',
    card: document.querySelector('[data-goals-sticky]').getBoundingClientRect().height,
    inside: [...document.querySelectorAll('[data-goals-lane]')].every((one) => one.getBoundingClientRect().bottom <= innerHeight)
  }))
  console.log(`${goals.length} goals, ${seen.lanes.length} lanes, "${seen.more}", card ${Math.round(seen.card)}px`)
  check('every lane says its goal\'s name, visibly', seen.lanes.length > 0 && seen.lanes.every((one) => one.name && one.shown > 20 && goals.some((g) => g.title === one.name)), JSON.stringify(seen.lanes.map((one) => one.name)))
  check('every lane says its days left', seen.lanes.every((one) => /today|tomorrow|in \d+ days|ago/.test(one.text)))
  check('the rest are counted: "and N more"', seen.more === `and ${goals.length - seen.lanes.length} more`, seen.more)
  check('the lanes all fit on the card', seen.inside)
  const first = seen.lanes[0]
  await all.locator(`[data-goals-lane="${first.id}"]`).hover(); await wait(400)
  const footer = await all.evaluate(() => document.querySelector('[data-goals-focus]')?.textContent ?? '')
  check('resting on a lane names it in the footer', footer.includes(first.name), footer)
  await all.screenshot({ path: `${process.env.SHOTS ?? process.env.QA_DATA}/goals-sticky-13.png` })
  await all.locator(`[data-goals-lane="${first.id}"]`).click(); await wait(1200)
  const opened = await h.evaluate(() => location.hash + ' ' + (document.querySelector('[data-page]')?.textContent ?? '').slice(0, 400))
  check('a click opens that goal', opened.includes(first.name), opened.slice(0, 120))
} catch (error) {
  check('ran', false, error.stack)
} finally {
  await c.close()
}
done()
