// A meeting is on: nothing of the desk shows. Every sticky note, the Today sticky and every goal card (one set to
// "Always" too) hide at once for each signal by itself (Haligtree's recorder, a camera, a microphone in another app,
// a Calendar event with other people, the screen mirrored), a wake brings nothing, and when the last signal ends they
// are back where they were, at once and silent. Two signals overlapping, “Show anyway” (the menu bar's and ⌘K's),
// the setting off, one stuck by hand in a meeting, Safe mode and quiet hours doing their part, the Calendar's own
// events; the main window and quick capture stay throughout. The signals are stand-ins a probe flips
// (globalThis.haligtreeSignal): a test run never listens to the Mac's own microphone or camera flags.
//   QA_DATA=<a copy of the seeded sandbox> QA_ARGS=--sandbox QA_ENTRY=out-x/main/index.js HALIGTREE_QA_AWAY=1 [SHOTS=<dir>] node qa/meeting-away.mjs
import { mkdirSync } from 'node:fs'
import { sandbox } from './sandbox-lib.mjs'
import { checks } from './harness.mjs'
process.env.QA_ARGS ??= '--sandbox'
process.env.HALIGTREE_QA_VIRTUAL ??= '1'
// The sandbox's events are make-believe and hide nothing; here the book's own events are followed, to test that path.
process.env.HALIGTREE_QA_SIGNALS ??= 'calendar'

const shots = process.env.SHOTS
if (shots) mkdirSync(shots, { recursive: true })
const { check, done } = checks()
const c = await sandbox({ width: 1280, height: 800 })
const { electron, h, v } = c
const wait = (ms) => h.waitForTimeout(ms)
/** Every sticky window: its key, whether it shows, where, and how solid. */
const desk = () => electron.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().filter((w) => !w.isDestroyed() && w.webContents.getURL().includes('view=sticky'))
  .map((w) => ({ key: new URL(w.webContents.getURL()).searchParams.get('type') + ':' + new URL(w.webContents.getURL()).searchParams.get('id'), visible: w.isVisible(), at: w.getBounds(), opacity: w.getOpacity() }))
  .sort((a, b) => a.key.localeCompare(b.key)))
/** A signal flipped, and the desk read in the same turn: what is true the instant it changes, no wait. */
const flip = (name, on) => electron.evaluate(({ BrowserWindow }, [name, on]) => {
  globalThis.haligtreeSignal(name, on)
  return BrowserWindow.getAllWindows().filter((w) => !w.isDestroyed() && w.webContents.getURL().includes('view=sticky'))
    .map((w) => ({ key: new URL(w.webContents.getURL()).searchParams.get('type') + ':' + new URL(w.webContents.getURL()).searchParams.get('id'), visible: w.isVisible(), at: w.getBounds(), opacity: w.getOpacity() }))
    .sort((a, b) => a.key.localeCompare(b.key))
}, [name, on])
const up = (list) => list.filter((one) => one.visible).length
const same = (a, b) => JSON.stringify(a.map((one) => [one.key, one.visible, one.at, one.opacity])) === JSON.stringify(b.map((one) => [one.key, one.visible, one.at, one.opacity]))
const menu = () => electron.evaluate(() => (globalThis.trayMenu ?? []).map((item) => item.label).filter(Boolean))
const choose = (label) => electron.evaluate((_, label) => {
  const find = (items) => { for (const item of items) { if (item.label === label) return item; const inside = item.submenu ? find(item.submenu.items) : null; if (inside) return inside } return null }
  const item = find(globalThis.trayBuilt.items)
  item?.click()
  return !!item
}, label)
const said = () => h.evaluate(() => window.api.deskAway())
const sounds = async () => (await Promise.all(electron.windows().filter((p) => p.url().includes('view=sticky')).map((p) => p.evaluate(() => (window.haligtreeHeard ?? []).length).catch(() => 0)))).reduce((a, b) => a + b, 0)
const others = () => electron.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().filter((w) => !w.isDestroyed() && /view=home/.test(w.webContents.getURL())).map((w) => w.isVisible()))

try {
  await v('settings:set', { sounds: true, hintRate: 0, quietStart: '00:00', quietEnd: '00:00', stepAway: true })
  // No event of the sandbox's own with people on at this hour: the Calendar's part is tested with one made here.
  const around = await v('events', new Date(Date.now() - 60_000).toISOString(), new Date(Date.now() + 60_000).toISOString())
  for (const one of around) if (!one.allDay && one.people.length) await v('event:save', one.key, { people: [] }, 'one')
  const dune = (await v('items', 'goal')).find((one) => /Dune/.test(one.title))
  await v('item:save', dune.id, { goalBeacon: 'always' }).catch(() => undefined)
  await h.evaluate(() => window.api.stick('today', 'today', true))
  // A note of the book's, stuck on the desktop.
  const note = (await h.evaluate(() => window.api.captures.list?.() ?? [])).find((one) => one?.id)?.id
  await h.evaluate((id) => window.api.stick('capture', id, true), note)
  await wait(4000)
  const rest = await desk()
  const kinds = new Set(rest.map((one) => one.key.split(':')[0]))
  check('to start, a stuck note, the Today sticky and a goal card are all on the desktop', up(rest) === rest.length && rest.length >= 3 && kinds.has('today') && kinds.has('goal') && [...kinds].some((kind) => !['today', 'goal', 'goals'].includes(kind)), rest.map((one) => `${one.key.slice(0, 14)}:${one.visible}`).join(' '))
  check('and nothing says a meeting is on', (await said()).why === null && (await said()).seen === 'Nothing is on', JSON.stringify(await said()))

  // Each signal by itself.
  for (const name of ['recording', 'camera', 'mic', 'event', 'mirrored']) {
    const before = await sounds()
    const away = await flip(name, true)
    check(`${name}: every sticky and goal card is hidden the instant it comes on`, up(away) === 0, `${up(away)} of ${away.length} still up`)
    await electron.evaluate(({ powerMonitor }) => (powerMonitor.emit('resume'), powerMonitor.emit('unlock-screen')))
    await wait(700)
    check(`${name}: a wake brings nothing out`, up(await desk()) === 0)
    const back = await flip(name, false)
    check(`${name}: off, all are back the same instant, where they were, whole`, same(back, rest), back.filter((one, i) => JSON.stringify(one) !== JSON.stringify(rest[i])).map((one) => `${one.key.slice(0, 12)} v${one.visible} o${one.opacity} ${one.at.x},${one.at.y}`).join(' '))
    await wait(600)
    check(`${name}: they stay there (no fly-in after) and no sticky made a sound`, same(await desk(), rest) && (await sounds()) === before, `sounds ${before} to ${await sounds()}`)
  }

  // Two signals overlapping: away until the last one ends.
  await flip('camera', true)
  await flip('mic', true)
  check('two signals: still hidden after the first one ends', up(await flip('camera', false)) === 0)
  check('two signals: back when the last one ends', same(await flip('mic', false), rest))

  // The menu bar's lines, and “Show anyway” for this meeting only.
  await flip('camera', true)
  await wait(300)
  const lines = await menu()
  check('the menu bar says “Hidden for a meeting” with “Show anyway”, beside “Show sticky notes”', lines.includes('Hidden for a meeting') && lines.indexOf('Show anyway') === lines.indexOf('Hidden for a meeting') + 1 && lines.indexOf('Show sticky notes') === lines.indexOf('Show anyway') + 1, lines.slice(-12).join(' | '))
  check('Settings says what it sees', (await said()).seen === 'A camera is on: stickies and goal cards are hidden', (await said()).seen)
  check('“Show anyway” is there to choose', await choose('Show anyway'))
  await wait(300)
  check('“Show anyway”: they are out again, in the meeting', same(await desk(), rest))
  check('and the menu says so, with the way back', (await menu()).includes('Shown anyway for this meeting') && (await menu()).includes('Hide them again'), (await menu()).slice(-12).join(' | '))
  await flip('camera', false)
  check('the meeting over: the menu has no line about it', !(await menu()).some((line) => /meeting|anyway/i.test(line)), (await menu()).slice(-10).join(' | '))
  check('“Show anyway” was for that meeting only: the next one hides them again', up(await flip('camera', true)) === 0)

  // ⌘K has the same, driven to its result.
  await h.bringToFront().catch(() => undefined)
  await h.keyboard.press('Meta+k')
  await wait(500)
  await h.keyboard.type('sticky notes anyway', { delay: 15 })
  await wait(500)
  check('⌘K offers “Show sticky notes anyway” and says why they are hidden', (await h.getByText('Show sticky notes anyway').count()) >= 1 && (await h.getByText('Hidden for a meeting: out again, this time only').count()) >= 1)
  if (shots) await h.screenshot({ path: `${shots}/command-show-anyway.png` })
  await h.keyboard.press('Enter')
  await wait(500)
  check('⌘K: chosen, they are out again', same(await desk(), rest))
  await h.keyboard.press('Escape').catch(() => undefined)
  await flip('camera', false)

  // The setting off: nothing hides, and it still says what it sees.
  await v('settings:set', { stepAway: false })
  check('“Step away in meetings” off: a signal hides nothing', same(await flip('mic', true), rest))
  check('and Settings says they stay out', (await said()).seen === 'Another app is using the microphone: stickies and goal cards stay out', (await said()).seen)
  await v('settings:set', { stepAway: true })
  await wait(200)
  check('switched on in a call: they hide at once', up(await desk()) === 0)

  // Stuck by hand in a meeting: that one was asked for.
  await h.evaluate(() => window.api.stick('today', 'today', false))
  await wait(600)
  await h.evaluate(() => window.api.stick('today', 'today', true))
  await wait(4000)
  const inCall = await desk()
  check('a sticky stuck by hand in the meeting shows, the rest stay hidden', inCall.filter((one) => one.visible).map((one) => one.key).join() === 'today:today', inCall.map((one) => `${one.key.slice(0, 12)}:${one.visible}`).join(' '))
  check('the main window stayed throughout', (await others()).every(Boolean))
  await flip('mic', false)
  await wait(300)
  check('the meeting over: every one is on the desktop again', up(await desk()) === (await desk()).length)
  const rested = await desk()

  // Safe mode and quiet hours still do their part.
  await v('settings:set', { safeMode: true })
  await wait(400)
  await flip('mirrored', true)
  await v('settings:set', { safeMode: false })
  await wait(400)
  check('Safe mode ending in a meeting leaves them hidden', up(await desk()) === 0)
  check('and they are back when the meeting ends', same(await flip('mirrored', false), rested))
  const now = new Date()
  const hhmm = (minutes) => { const d = new Date(now.getTime() + minutes * 60_000); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` }
  await v('settings:set', { quietStart: hhmm(-60), quietEnd: hhmm(60) })
  await wait(300)
  check('quiet hours: every sticky and goal card is away, the “Always” goal card too', up(await desk()) === 0)
  check('the menu bar says “Hidden for quiet hours” with “Show anyway”', (await menu()).includes('Hidden for quiet hours') && (await menu()).includes('Show anyway'))
  await v('settings:set', { quietStart: '00:00', quietEnd: '00:00' })
  await wait(300)
  check('quiet hours over: back where they were', same(await desk(), rested))

  // The Calendar's own part: an event with other people now, then dropped.
  const made = await v('event:add', { title: 'Reading group', start: new Date(Date.now() - 5 * 60_000).toISOString(), end: new Date(Date.now() + 30 * 60_000).toISOString(), people: ['Paul Atreides'] })
  await wait(300)
  check('a Calendar event with other people happening now hides them', up(await desk()) === 0 && /Calendar event/.test((await said()).seen), (await said()).seen)
  await v('event:save', made.key, { people: [] }, 'one')
  await wait(300)
  check('the same event with nobody else on it hides nothing', same(await desk(), rested))

  // The row in Settings, beside Quiet hours and Safe mode, light and dark.
  await c.go('settings')
  await wait(800)
  await h.click('[data-section="What comes back to you"]')
  await wait(700)
  await h.locator('[data-desk-seen]').scrollIntoViewIfNeeded()
  await wait(400)
  check('Settings shows “Step away in meetings” with what it sees now', (await h.locator('[data-desk-seen]').textContent()) === 'Now: Nothing is on', await h.locator('[data-desk-seen]').textContent())
  await flip('camera', true)
  await wait(400)
  check('and the line follows a signal as it comes on', (await h.locator('[data-desk-seen]').textContent()) === 'Now: A camera is on: stickies and goal cards are hidden', await h.locator('[data-desk-seen]').textContent())
  if (shots) await c.both(`${shots}/settings-step-away-in-a-call`)
  await flip('camera', false)
  await wait(300)
  if (shots) await c.both(`${shots}/settings-step-away`)
} catch (error) {
  check('ran to the end', false, error.message.split('\n')[0])
} finally {
  console.log(c.errors.length ? 'errors: ' + c.errors.slice(0, 3).join(' | ') : 'no page errors')
  await c.close()
  done()
}
