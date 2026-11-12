// A goal's card taken down by hand stays down. Found by reading on 12 Nov, beside the card that vanished by itself
// (qa/goal-card-stays.mjs): a goal set to “Always” has a card put up by its setting, and the look at the goals (as a
// goal changes, and every half minute by the menu bar's clock) put that card straight back after “Take it down”,
// because the goal still asked for one. Now taking it down turns that goal's “Goal on screen” off, so its page says
// what is true, and “Put it back” brings both the card and the setting back as they were.
// A card only stuck by hand, on a goal that asks for none, is just unstuck: its goal's setting is not touched.
//   QA_ARGS=--sandbox QA_DATA=<a copy of the seeded sandbox> QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 [STAY=40] node qa/goal-card-down.mjs
import { sandbox } from './sandbox-lib.mjs'
import { checks } from './harness.mjs'
process.env.QA_ARGS ??= '--sandbox'
process.env.HALIGTREE_QA_VIRTUAL ??= '1'

// Longer than one turn of the half-minute clock, so a look at the goals by the clock falls inside it.
const STAY = Number(process.env.STAY ?? 40)
const { check, done } = checks()
const c = await sandbox({ width: 1280, height: 800 })
const { electron, h, v } = c
const wait = (ms) => h.waitForTimeout(ms)
/** The card's window for a goal, as main has it now, or null when there is none. */
const cardOf = (id) => electron.evaluate(({ BrowserWindow }, id) => {
  const win = BrowserWindow.getAllWindows().find((one) => !one.isDestroyed() && one.webContents.getURL().includes('view=sticky') && one.webContents.getURL().includes('type=goal&') && one.webContents.getURL().includes(`id=${id}`))
  return win ? { contents: win.webContents.id, visible: win.isVisible(), bounds: win.getBounds() } : null
}, id)
/** Waited for, never slept through: the card up (true) or gone (false), up to ten seconds. */
const until = async (id, up) => {
  let now = await cardOf(id)
  for (let i = 0; i < 40 && (up ? !now?.visible : !!now); i++) (await wait(250), (now = await cardOf(id)))
  return now
}
/** “Take it down” as the card's own right-click menu and ⌘W do it: main tells the card's page, which asks main. */
const takeDown = (id) => electron.evaluate(({ BrowserWindow }, id) => {
  const win = BrowserWindow.getAllWindows().find((one) => !one.isDestroyed() && one.webContents.getURL().includes('view=sticky') && one.webContents.getURL().includes('type=goal&') && one.webContents.getURL().includes(`id=${id}`))
  win?.webContents.send('sticky:do', 'down')
  return !!win
}, id)
/** A goal's own “Goal on screen” as the book keeps it: 'always', 'sometimes', 'off', or null (follows Settings). */
const setting = async (id) => (await v('items', 'goal')).find((one) => one.id === id)?.beacon ?? null
/** A look at the goals right now, as any goal changing causes one: another goal's setting written as it already is. */
const look = async (other) => { await v('goal:beacon:set', other.id, other.beacon ?? null); await wait(1500) }

try {
  await v('settings:set', { sounds: false })
  const goals = (await v('items', 'goal')).filter((one) => one.goalAt && !one.closedHow && !one.closedAt && !one.archivedAt)
  const always = goals.find((one) => one.beacon === 'always') ?? goals.find((one) => /Dune/.test(one.title))
  const byHand = goals.find((one) => one.id !== always?.id)
  const other = goals.find((one) => one.id !== always?.id && one.id !== byHand?.id)
  check('the sandbox has a goal set to “Always”, and two more', !!always && !!byHand && !!other && always.beacon === 'always', goals.map((one) => `${one.title.slice(0, 20)}:${one.beacon ?? 'unset'}`).join(' | '))

  // 1. The card its goal's setting put up.
  const first = await until(always.id, true)
  check('the “Always” goal\'s card is on the desktop', !!first?.visible, JSON.stringify(first))
  check('“Take it down” reaches the card', await takeDown(always.id))
  check('taken down, the card goes', (await until(always.id, false)) === null, JSON.stringify(await cardOf(always.id)))
  check('its goal\'s “Goal on screen” is off now, so its page says what is true', (await setting(always.id)) === 'off', String(await setting(always.id)))
  await look(other)
  check('the goals looked at again at once: the card is still down', (await cardOf(always.id)) === null, JSON.stringify(await cardOf(always.id)))
  const started = Date.now()
  let back = null
  while (Date.now() - started < STAY * 1000 && back === null) {
    await wait(5000)
    if (await cardOf(always.id)) back = Math.round((Date.now() - started) / 1000)
  }
  check(`and it stays down for ${STAY} seconds, past the half-minute look`, back === null, back === null ? '' : `back after ${back} s`)

  // 2. The setting still puts a card up when asked again, and “Put it back” undoes a take-down whole.
  await v('goal:beacon:set', always.id, 'always')
  const again = await until(always.id, true)
  check('set to “Always” again, its card comes out', !!again?.visible, JSON.stringify(again))
  await wait(1200)
  const place = (await cardOf(always.id))?.bounds
  await takeDown(always.id)
  check('taken down a second time, it goes', (await until(always.id, false)) === null)
  check('...and the setting is off again', (await setting(always.id)) === 'off', String(await setting(always.id)))
  // The window in sight offers “Put it back” (ui.tsx, the toast's own action).
  await h.evaluate(() => window.api.putStickyBack())
  const returned = await until(always.id, true)
  check('“Put it back” brings the card back', !!returned?.visible, JSON.stringify(returned))
  check('...and its goal\'s “Goal on screen” is “Always” as it was', (await setting(always.id)) === 'always', String(await setting(always.id)))
  await wait(1500)
  const now = await cardOf(always.id)
  check('...where it was, and only the one card', !!now && !!place && now.bounds.x === place.x && now.bounds.y === place.y && now.contents === returned?.contents, JSON.stringify([place, now]))

  // 3. A card only stuck by hand: unstuck, its goal's own setting left alone.
  const was = await setting(byHand.id)
  await h.evaluate((id) => window.api.stick('goal', id, true), byHand.id)
  check('a goal\'s card stuck by hand comes out', !!(await until(byHand.id, true))?.visible)
  await takeDown(byHand.id)
  check('taken down, it goes', (await until(byHand.id, false)) === null)
  await look(other)
  check('...stays down when the goals are looked at again', (await cardOf(byHand.id)) === null)
  check('...and its goal\'s “Goal on screen” is untouched', (await setting(byHand.id)) === was, JSON.stringify([was, await setting(byHand.id)]))
  check('the “Always” goal\'s card is untouched by that', (await cardOf(always.id))?.contents === returned?.contents, JSON.stringify(await cardOf(always.id)))
} catch (error) {
  check('ran to the end', false, error.message.split('\n')[0])
} finally {
  console.log(c.errors.length ? 'errors: ' + c.errors.slice(0, 3).join(' | ') : 'no page errors')
  await c.close()
  done()
}
