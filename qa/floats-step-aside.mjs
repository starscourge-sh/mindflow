// What Haligtree floats over your work gets out of its way (main/step-aside.ts). The session bubble: the pointer at
// rest beside it (not a pass across, not on it) sends it gliding, whole, to the nearest of its three places (the left, middle and right of the top of its screen) clear of
// the pointer, where it stays; a drag wins, even part way through a glide, and a place put by hand holds for that
// session; it is back in its place at the next session or from “Back to its place” in its menu; a switch in
// Settings; with Motion off it is simply elsewhere. The corner's cards: the same rule among the four corners, and
// never over the top of Haligtree's own window while that is in front.
// The pointer is told to main (screen.getCursorScreenPoint), as a test cannot move the Mac's own; windows keep
// their places while really parked (HALIGTREE_QA_VIRTUAL). Nothing shows on the screen and nothing makes a sound.
//   QA_DATA=<a copy of the seeded sandbox> QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox SHOT=<dir> node qa/floats-step-aside.mjs
import { mkdirSync } from 'fs'
import { checks } from './harness.mjs'
import { CALM_HOUR, sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'
process.env.HALIGTREE_QA_VIRTUAL = '1'
process.env.HALIGTREE_QA_STEPASIDE = '1'
const SHOT = process.env.SHOT ?? 'scratchpad/step-aside'
mkdirSync(SHOT, { recursive: true })

const { check, done } = checks()
const c = await sandbox({ width: 1100, height: 760, at: CALM_HOUR })
const { electron, h, v } = c
const wait = (ms) => new Promise((go) => setTimeout(go, ms))
const main = (fn, arg) => electron.evaluate(({ app, BrowserWindow, screen, Menu }, [fn, arg]) => {
  const of = (part) => BrowserWindow.getAllWindows().find((w) => !w.isDestroyed() && w.webContents.getURL().includes(part))
  return new Function('of', 'screen', 'BrowserWindow', 'Menu', 'app', 'arg', fn)(of, screen, BrowserWindow, Menu, app, arg)
}, [fn, arg])
const point = (x, y) => main('screen.getCursorScreenPoint = () => arg', { x: Math.round(x), y: Math.round(y) })
const at = (part) => main('const w = of(arg); return w ? { ...w.getBounds(), area: screen.getDisplayMatching(w.getBounds()).workArea, shown: w.isVisible() } : null', part)
const windowOf = async (part) => {
  for (let i = 0; i < 50; i++) {
    const found = electron.windows().find((one) => !one.isClosed() && one.url().includes(part))
    if (found) return found
    await wait(200)
  }
  return null
}
/** Where the window is, read again and again for a while: the glide as it happens. */
const watch = async (part, ms) => {
  const seen = []
  const from = Date.now()
  while (Date.now() - from < ms) {
    const one = await at(part)
    seen.push({ t: Date.now() - from, x: one.x, y: one.y })
    await wait(20)
  }
  return seen
}
const same = (a, b) => !!a && !!b && a.x === b.x && a.y === b.y
/** The session running now, given up. */
const over = async () => { const run = await v('focus:now'); if (run?.id) await v('session:cancel', run.id) }
const PILL = 'view=focus'

try {
  const screenArea = await main('return screen.getPrimaryDisplay().workArea')
  // Far from everything that floats here: low at the left, off the top (the bubble), the corners (the cards) and the middle.
  const far = { x: screenArea.x + 420, y: screenArea.y + screenArea.height - 260 }
  await point(far.x, far.y)
  await v('settings:set', { sounds: false, motion: true, countIn: false, focusShows: 'bubble', focusTools: true, pillSits: 'free', pillYields: true, notify: 'alerts', quietStart: '00:00', quietEnd: '00:00' })
  const made = await v('task:add', 'Write the essay plan')
  const task = made?.id ?? made
  await v('session:start', task, 'Write the essay plan', 25 * 60_000)
  await h.evaluate(() => window.api.showFocus(true))
  const pill = await windowOf(PILL)
  await wait(2500)
  // A session starts with the bubble open for a moment: read once it is at rest, as tall as the bubble alone.
  for (let i = 0; i < 60 && (await at(PILL)).height > 110; i++) await wait(150)
  const home = await at(PILL)
  const area = home.area
  const topLeft = { x: area.x + 12, y: area.y + 6 }
  check('the bubble starts at the top middle of its screen, at rest', home.shown && home.height <= 110 && home.x === Math.round(area.x + area.width / 2 - 170) && home.y === area.y + 6, JSON.stringify(home))

  // --- Ruling 1: a pass across is not a rest; a rest beside it is.
  for (let i = 0; i <= 10; i++) { await point(home.x - 60 + i * 46, home.y + 64 + 20); await wait(60) }
  await point(far.x, far.y)
  await wait(1000)
  check('a pass across it is not a rest: it stays', same(await at(PILL), home), JSON.stringify(await at(PILL)))
  const rest = { x: home.x + 250, y: home.y + 64 + 30 }
  await point(rest.x, rest.y)
  const seen = await watch(PILL, 1900)
  let b = await at(PILL)
  check('the pointer at rest under its right half, 30 points below it: it glides along the top to the left place', same(b, topLeft), JSON.stringify(b))
  check('whole, the same size, still up', b.shown && b.width === home.width && b.height === home.height, JSON.stringify(b))
  // The glide as read, for the report: when, and how far along.
  console.log(`GLIDE ${seen.filter((one, i) => i && (one.x !== seen[i - 1].x || one.x !== topLeft.x && one.x !== home.x)).map((one) => `${one.t}ms:${one.x}`).join(' ')}`)
  const first = seen.find((one) => one.x !== home.x)
  const between = seen.filter((one) => one.x !== home.x && one.x !== topLeft.x)
  check('it waits for the rest (0.6 s) before it moves', !!first && first.t >= 500, `first move seen at ${first?.t} ms`)
  check('it glides: places in between, each further on, never back', between.length >= 2 && seen.every((one, i) => !i || one.x <= seen[i - 1].x), `${between.length} places between`)
  const glideMs = first ? (seen.find((one) => one.x === topLeft.x)?.t ?? 0) - first.t : 0
  check('on quick capture’s clock: 300 ms and a little for the way, 520 at most (seen within 700)', glideMs > 0 && glideMs <= 700, `${glideMs} ms seen for ${home.x - topLeft.x} points`)
  // --- Ruling 2: never over the pointer, never off its screen.
  check('never over the pointer on its way', seen.every((one) => !(rest.x >= one.x && rest.x < one.x + home.width && rest.y >= one.y && rest.y < one.y + home.height)))
  check('and all on the screen it was on', seen.every((one) => one.x >= area.x && one.x + home.width <= area.x + area.width && one.y >= area.y && one.y + home.height <= area.y + area.height))
  await wait(1500)
  check('it stays clear while the pointer stays there', same(await at(PILL), topLeft))
  await point(far.x, far.y)
  await wait(1400)
  check('and does not creep back once the pointer has gone', same(await at(PILL), topLeft), JSON.stringify(await at(PILL)))

  // --- Ruling 4: sent back by a press (its right-click menu, the Mac's own: read here, never shown).
  // Only the bubble's own menu is stood in for (it has the ticking line): every other menu, the menu bar's too, is built as ever.
  await main('const build = Menu.buildFromTemplate; Menu.buildFromTemplate = (template) => (template.some((one) => one.label === "Ticking clock sound") ? ((globalThis.qaMenu = template), { popup: (one) => one?.callback?.() }) : build.call(Menu, template))')
  const menu = async () => { await pill.evaluate(() => void window.api.focusMenu(false)); await wait(400); return main('return (globalThis.qaMenu ?? []).map((one) => one.label ?? one.type)') }
  let lines = await menu()
  check('its menu has “Back to its place” while it is aside', lines.includes('Back to its place'), lines.join(' | '))
  await main('globalThis.qaMenu.find((one) => one.label === "Back to its place").click()')
  await wait(1300)
  check('pressed, it glides back to its place', same(await at(PILL), home), JSON.stringify(await at(PILL)))
  lines = await menu()
  check('and the line is gone once it is there', !lines.includes('Back to its place'), lines.join(' | '))

  // --- The pointer at rest on the bubble itself: it stays.
  const body = await pill.evaluate(() => { const r = document.querySelector('[data-island-frame]').getBoundingClientRect(); return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) } })
  await pill.mouse.move(body.x, body.y)
  await wait(300)
  await point(home.x + body.x, home.y + body.y)
  await wait(1700)
  b = await at(PILL)
  check('the pointer at rest on the bubble itself: it stays', b.x === home.x && b.y === home.y, JSON.stringify(b))
  await pill.mouse.move(2, 2)
  await point(far.x, far.y)
  await wait(1800)

  // --- Ruling 3: a drag wins, even part way through a glide, and where it is put holds for the session.
  await point(rest.x, rest.y)
  for (let i = 0; i < 100 && same(await at(PILL), home); i++) await wait(15)
  const caught = await at(PILL)
  await pill.evaluate(([x, y]) => window.api.grab(x, y), [caught.x + 170, caught.y + 20])
  await wait(700)
  const heldAt = await at(PILL)
  check('picked up part way through a glide, the glide stops there', !same(caught, home) && Math.abs(heldAt.x - caught.x) <= 60 && heldAt.x > topLeft.x, `${JSON.stringify({ x: caught.x })} then ${JSON.stringify({ x: heldAt.x })}`)
  const put = { x: area.x + Math.round(area.width / 2) - 170, y: area.y + Math.round(area.height * 0.6) }
  await pill.evaluate(([x, y]) => window.api.carry(x, y), [caught.x + 170 + (put.x - heldAt.x), caught.y + 20 + (put.y - heldAt.y)])
  await pill.evaluate(() => window.api.letGo())
  await wait(300)
  check('and it goes where the hand takes it', same(await at(PILL), put), JSON.stringify(await at(PILL)))
  await point(put.x + 170, put.y + 64 + 30)
  await wait(1700)
  check('put there by hand, it stays for this session, the pointer at rest just under it', same(await at(PILL), put), JSON.stringify(await at(PILL)))

  // --- The next session: the rule is back, and its place is where the hand last put it.
  await over()
  await h.evaluate(() => window.api.showFocus(false))
  await point(far.x, far.y)
  await wait(900)
  await v('session:start', task, 'Write the essay plan', 25 * 60_000)
  await h.evaluate(() => window.api.showFocus(true))
  await wait(2000)
  check('at the next session it is where you put it', same(await at(PILL), put) && (await at(PILL)).shown, JSON.stringify(await at(PILL)))
  // The pointer comes to rest while the bubble is still open from the session's start: it goes once it is at rest.
  await point(put.x + 170, put.y + 64 + 30)
  for (let i = 0; i < 60 && !same(await at(PILL), home); i++) await wait(150)
  const up = await at(PILL)
  check('low on the page with the pointer in the field under it: straight up to the top middle, never down over the pointer', up.x === home.x && up.y === home.y, JSON.stringify(up))
  await over()
  await h.evaluate(() => window.api.showFocus(false))
  await point(far.x, far.y)
  await wait(900)
  await v('session:start', task, 'Write the essay plan', 25 * 60_000)
  await h.evaluate(() => window.api.showFocus(true))
  await wait(2000)
  check('stepped aside, it is back in its place at the next session', same(await at(PILL), put), JSON.stringify(await at(PILL)))

  // --- Ruling 4: the switch in Settings, on to start, shown in place.
  await c.go('settings')
  await h.fill('input[type="search"], [data-settings-search] input, input[placeholder*="Search"]', 'steps aside').catch(() => {})
  await h.waitForTimeout(900)
  const row = '[data-setting-title="Steps aside for the pointer"]'
  const sample = () => h.$eval(`${row} [data-step-aside-sample]`, (one) => one.dataset.stepAsideSample).catch(() => null)
  check('Settings has “Steps aside for the pointer”, on to start, its small screen showing the bubble aside', (await h.getAttribute(`${row} [role="switch"]`, 'aria-checked').catch(() => null)) === 'true' && (await sample()) === 'aside', `${await sample()}`)
  for (const look of ['light', 'dark']) { await c.look(look); await h.locator(row).screenshot({ path: `${SHOT}/setting-${look}.png` }).catch(() => {}) }
  await h.click(`${row} [role="switch"]`)
  await h.waitForTimeout(700)
  check('switched off, the small screen shows it staying, and the setting is saved', (await sample()) === 'stays' && (await v('settings')).pillYields === false, `${await sample()}`)
  await h.locator(row).screenshot({ path: `${SHOT}/setting-off.png` }).catch(() => {})
  await point(put.x + 170, put.y + 64 + 30)
  await wait(1700)
  check('off, the bubble stays where it is with the pointer at rest beside it', same(await at(PILL), put), JSON.stringify(await at(PILL)))
  await point(far.x, far.y)
  await h.click(`${row} [role="switch"]`)
  await h.waitForTimeout(700)
  check('switched on again', (await v('settings')).pillYields === true && (await sample()) === 'aside')

  // --- Ruling 5: Motion off, it is simply elsewhere.
  await v('settings:set', { motion: false })
  await wait(700)
  await point(put.x + 170, put.y + 64 + 30)
  const still = await watch(PILL, 1700)
  check('with Motion off it is simply elsewhere: no place in between', same(await at(PILL), home) && still.every((one) => same(one, put) || same(one, home)), JSON.stringify(still.filter((one) => !same(one, put) && !same(one, home)).slice(0, 3)))
  await v('settings:set', { motion: true })
  await over()
  await h.evaluate(() => window.api.showFocus(false))
  await point(far.x, far.y)
  await wait(900)

  // --- The corner's cards: the top right to start; the same rule among the four corners.
  const CARD = 'view=nudge'
  const due = await v('task:add', 'Return the library book')
  const dueId = due?.id ?? due
  const raise = () => h.evaluate(([id]) => window.api.nudge({ kind: 'task', id, title: 'Return the library book', again: false }), [dueId])
  await raise()
  const card = await windowOf(CARD)
  await card.waitForSelector('[data-nudge="task"]', { timeout: 8000 })
  await wait(900)
  let k = await at(CARD)
  const corner = (name, tall) => ({ x: name.endsWith('left') ? area.x + 10 : area.x + area.width - 360 - 10, y: name.startsWith('top') ? area.y + 8 : area.y + area.height - tall - 8 })
  check('a card comes up at the top right of the screen', k.shown && same(k, corner('top-right', k.height)), JSON.stringify(k))
  await point(k.x - 30, k.y + 20)
  const slid = await watch(CARD, 1900)
  k = await at(CARD)
  check('the pointer at rest just left of it: it glides down to the bottom right, away from the pointer', same(k, corner('bottom-right', k.height)), JSON.stringify(k))
  check('gliding, not jumping', slid.filter((one) => one.y !== slid[0].y && one.y !== k.y).length >= 2)
  // On a card itself: you are reaching for it.
  const on = await card.evaluate(() => { const r = document.querySelector('[data-nudge="task"]').getBoundingClientRect(); return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) } })
  await card.mouse.move(on.x, on.y)
  await wait(300)
  await point(k.x + on.x, k.y + on.y)
  await wait(1700)
  check('the pointer at rest on a card itself: it stays', same(await at(CARD), k), JSON.stringify(await at(CARD)))
  await card.mouse.move(1, 1)
  await point(far.x, far.y)
  // Answered: the window goes, and the next card starts at the top right again.
  await card.click('[data-nudge-later]')
  await wait(1500)

  // --- Never over Haligtree's own bar: its main window in front, its top right where the card would be.
  const bar = await h.evaluate(() => Math.max(...[...document.querySelectorAll('[data-tabs]')].map((one) => one.getBoundingClientRect().bottom)))
  check('the strip a card keeps off (the top 88 points of the window) holds the tabs, “New” and the sound button', bar > 0 && bar <= 88, `the tab row ends ${bar} points down`)
  await main('const w = of("view=home"); const a = screen.getPrimaryDisplay().workArea; w.setBounds({ x: a.x + a.width - 1100, y: a.y, width: 1100, height: 760 }); w.isFocused = () => true')
  await raise()
  await card.waitForSelector('[data-nudge="task"]', { timeout: 8000 })
  await wait(900)
  k = await at(CARD)
  check('with Haligtree’s own window in front and its tabs at the top right, the card comes up at the bottom right instead', same(k, corner('bottom-right', k.height)), JSON.stringify(k))
  await card.click('[data-nudge-later]')
  await wait(1500)
  // Up at the top right while another app is in front, then Haligtree's window comes forward: it moves off the bar.
  await main('const w = of("view=home"); w.isFocused = () => false')
  await raise()
  await card.waitForSelector('[data-nudge="task"]', { timeout: 8000 })
  await wait(900)
  k = await at(CARD)
  check('with another app in front it is at the top right as ever', same(k, corner('top-right', k.height)), JSON.stringify(k))
  await main('const w = of("view=home"); w.isFocused = () => true; w.emit("focus")')
  await wait(1300)
  k = await at(CARD)
  check('Haligtree’s window coming to the front moves it off the bar, to the bottom right', same(k, corner('bottom-right', k.height)), JSON.stringify(k))
  await main('const w = of("view=home"); w.isFocused = () => false')
  check('no errors in the window', c.errors.length === 0, c.errors.slice(0, 3).join(' | '))
} catch (error) {
  check('the run finished', false, error.message.split('\n')[0])
} finally {
  await c.close?.()
}
done()
