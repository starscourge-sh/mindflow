// A goal's card on the desktop keeps its window while nothing changes: the same window (the same webContents id),
// never closed and made again, for 90 seconds, which is three turns of the menu bar's half-minute clock. Two cards:
// the one of a goal set to “Always” (put up by the app), and one stuck by hand for a goal whose “Goal on screen” is
// off (window.api.stick('goal', id, true), as qa/sticky-menu.mjs sticks its "One goal"). Should one go, the probe
// says when (seconds after it was stuck, and after the app started) and what in main took it down (the call stack
// where its window was told to peel off or was destroyed).
//   QA_ARGS=--sandbox QA_DATA=<a copy of the seeded sandbox> QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 [STAY=90] node qa/goal-card-stays.mjs
import { sandbox } from './sandbox-lib.mjs'
import { checks } from './harness.mjs'
process.env.QA_ARGS ??= '--sandbox'
process.env.HALIGTREE_QA_VIRTUAL ??= '1'

const STAY = Number(process.env.STAY ?? 90)
const { check, done } = checks()
const c = await sandbox({ width: 1280, height: 800 })
const { electron, h, v } = c
const wait = (ms) => h.waitForTimeout(ms)
/** The card's window for a goal, as main has it now: its webContents id, or null when there is none. */
const cardOf = (id) => electron.evaluate(({ BrowserWindow }, id) => {
  const win = BrowserWindow.getAllWindows().find((one) => !one.isDestroyed() && one.webContents.getURL().includes('view=sticky') && one.webContents.getURL().includes('type=goal&') && one.webContents.getURL().includes(`id=${id}`))
  return win ? { contents: win.webContents.id, window: win.id, visible: win.isVisible() } : null
}, id)
/** Watched from now on: closed or not, and who in main told it to go. */
const watch = (id, name) => electron.evaluate(({ BrowserWindow }, [id, name]) => {
  const win = BrowserWindow.getAllWindows().find((one) => !one.isDestroyed() && one.webContents.getURL().includes('view=sticky') && one.webContents.getURL().includes('type=goal&') && one.webContents.getURL().includes(`id=${id}`))
  if (!win) return false
  const seen = (globalThis.qaCards ??= {})
  const mine = (seen[name] = { from: Date.now(), closed: null, upAtClose: null, by: null })
  const said = (how) => void (mine.by ??= `${how}\n${new Error().stack.split('\n').slice(2, 9).map((line) => line.trim().replace(/\(.*[\\/]/, '(')).join('\n')}`)
  const send = win.webContents.send.bind(win.webContents)
  win.webContents.send = (channel, ...args) => (channel === 'sticky:peel' && said('told to peel off'), send(channel, ...args))
  const destroy = win.destroy.bind(win)
  win.destroy = () => (said('destroyed'), destroy())
  win.once('closed', () => ((mine.closed = Date.now() - mine.from), (mine.upAtClose = Math.round(process.uptime() * 10) / 10)))
  return true
}, [id, name])
const watched = () => electron.evaluate(() => globalThis.qaCards ?? {})

try {
  const goals = (await v('items', 'goal')).filter((one) => one.goalAt && !one.closedHow && !one.closedAt && !one.archivedAt)
  const always = goals.find((one) => one.goalBeacon === 'always' || one.beacon === 'always') ?? goals.find((one) => /Dune/.test(one.title))
  const byHand = goals.find((one) => one.id !== always?.id)
  check('the sandbox has a goal set to “Always” and another whose card is off', !!always && !!byHand, goals.map((one) => `${one.title.slice(0, 20)}:${one.goalBeacon ?? one.beacon ?? 'unset'}`).join(' | '))

  // The app's own card first: waited for, not slept through.
  let own = null
  for (let i = 0; i < 80 && !(own = await cardOf(always.id))?.visible; i++) await wait(250)
  check('the “Always” goal\'s card is on the desktop', !!own?.visible, JSON.stringify(own))
  // And one stuck by hand, as a page may ask.
  await h.evaluate((id) => window.api.stick('goal', id, true), byHand.id)
  let stuck = null
  for (let i = 0; i < 80 && !(stuck = await cardOf(byHand.id))?.visible; i++) await wait(250)
  check('a goal\'s card stuck by hand comes out', !!stuck?.visible, JSON.stringify(stuck))
  await watch(always.id, 'always')
  await watch(byHand.id, 'by hand')
  const started = Date.now()

  // Nothing is touched for 90 seconds; every 5 seconds each card is looked at.
  const first = { always: own?.contents, 'by hand': stuck?.contents }
  const changed = {}
  while (Date.now() - started < STAY * 1000) {
    await wait(5000)
    const now = { always: (await cardOf(always.id))?.contents ?? null, 'by hand': (await cardOf(byHand.id))?.contents ?? null }
    for (const name of ['always', 'by hand']) if (now[name] !== first[name] && !(name in changed)) changed[name] = { after: Math.round((Date.now() - started) / 1000), now: now[name] }
  }
  const seen = await watched()
  const end = { always: await cardOf(always.id), 'by hand': await cardOf(byHand.id) }
  for (const name of ['always', 'by hand']) {
    const one = seen[name] ?? {}
    const kept = one.closed === null && end[name]?.contents === first[name] && !(name in changed)
    check(`${name === 'always' ? 'the “Always” goal\'s card' : 'the card stuck by hand'}: the same window for ${STAY} seconds, never closed`, kept,
      kept ? `webContents ${first[name]}` : `webContents ${first[name]} closed ${one.closed === null ? 'never' : `${(one.closed / 1000).toFixed(1)} s after it was watched`}, ${one.upAtClose ?? '?'} s after the app started; now ${JSON.stringify(end[name])}`)
    if (!kept && one.by) console.log(`  what took it down: ${one.by.replace(/\n/g, '\n    ')}`)
  }

  // A goal changing anywhere makes the app look at the goals again at once: the card stuck by hand still stands.
  const other = goals.find((one) => one.id !== always.id && one.id !== byHand.id)
  await v('goal:beacon:set', other.id, null)
  await wait(1500)
  check('another goal changes: the card stuck by hand is still the same window', (await cardOf(byHand.id))?.contents === first['by hand'], JSON.stringify(await cardOf(byHand.id)))
  // Its own goal let go: the card goes with it, stuck by hand or not (no card is left for a goal that is over).
  await v('goal:close', byHand.id, 'let go')
  let left = await cardOf(byHand.id)
  for (let i = 0; i < 20 && left; i++) (await wait(250), (left = await cardOf(byHand.id)))
  check('its own goal let go: its card goes', left === null, JSON.stringify(left))
  check('and the “Always” goal\'s card is untouched by all of it', (await cardOf(always.id))?.contents === first.always, JSON.stringify(await cardOf(always.id)))
} catch (error) {
  check('ran to the end', false, error.message.split('\n')[0])
} finally {
  console.log(c.errors.length ? 'errors: ' + c.errors.slice(0, 3).join(' | ') : 'no page errors')
  await c.close()
  done()
}
