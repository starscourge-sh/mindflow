// A practice's offer in a book of your own (never the sandbox). With another app in front, or the main window
// closed, it is the corner's card: “Practice at 21:00”, the practice's name as the line, “5 min” its own mark, and
// Home's “Now” card waits while the corner has it (one surface). The card steps aside for a pointer at rest beside
// it. Haligtree's main window coming to the front takes the offer inside, off the corner. Answered anywhere else,
// the card goes. Left alone, it waits on Home's “Now” card.
// The pointer and which window is in front are told to main, as a test can do neither on the Mac itself.
//   QA_DATA=<an empty folder> QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 SHOT=<dir> node qa/practice-offer-corner.mjs
import { mkdirSync } from 'fs'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
// A plain book of its own, whatever the run was given: the sandbox never raises a card.
delete process.env.QA_ARGS
process.env.HALIGTREE_QA_VIRTUAL = '1'
process.env.HALIGTREE_QA_STEPASIDE = '1'
const SHOT = process.env.SHOT ?? 'scratchpad/practice-corner'
mkdirSync(SHOT, { recursive: true })

const { check, done } = checks()
const c = await sandbox({ width: 1100, height: 760, at: '21:02', seeded: false })
const { electron, h, v } = c
// A card left alone goes after two minutes: a window marked quick counts them as three seconds, so a run need not sit through them.
await electron.context().addInitScript('{ const real = window.setTimeout; window.setTimeout = (run, ms, ...more) => real(run, ms === 120000 && window.qaQuick ? 3000 : ms, ...more) }')
const wait = (ms) => new Promise((go) => setTimeout(go, ms))
const main = (fn, arg) => electron.evaluate(({ app, BrowserWindow, screen }, [fn, arg]) => {
  const of = (part) => BrowserWindow.getAllWindows().find((w) => !w.isDestroyed() && w.webContents.getURL().includes(part))
  return new Function('of', 'screen', 'BrowserWindow', 'app', 'arg', fn)(of, screen, BrowserWindow, app, arg)
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
const CARD = 'view=nudge'
const now = '[data-practice-now]'
const until = async (ok) => { for (let i = 0; i < 50; i++) { if (await ok()) return true; await wait(150) } return false }
const front = (on) => main(`const w = of("view=home"); w.isFocused = () => arg; if (arg) w.emit("focus")`, on)

try {
  // A new book opens on the welcome, and nothing is offered over that: this one has had it.
  await v('onboarding:set', { welcomed: new Date().toISOString(), welcoming: false })
  await h.reload()
  await h.waitForTimeout(1500)
  const area = await main('return screen.getPrimaryDisplay().workArea')
  const far = { x: area.x + Math.round(area.width / 2), y: area.y + Math.round(area.height / 2) }
  await point(far.x, far.y)
  await v('settings:set', { sounds: false, motion: true, countIn: false, focusShows: 'bubble', focusTools: true, pillYields: true, notify: 'alerts', quietStart: '00:00', quietEnd: '00:00' })
  const made = await v('task:add', 'Stretch every day at 21:00')
  const practice = await v('practices:set', made?.id ?? made, { on: true })
  check('a practice of your own, at 21:00', !!practice?.id && practice.on === true, JSON.stringify(practice))
  await c.go('home')
  const offer = await v('practices:check')
  check('at 21:02 it is offered', offer?.id === practice.id && offer.at === '21:00', JSON.stringify(offer))

  // --- Another app in front: the corner's card.
  const card = await windowOf(CARD)
  const up = card && await card.waitForSelector('[data-nudge-practice]', { timeout: 8000 }).then(() => true, () => false)
  check('with another app in front it is the corner’s card', !!up && (await at(CARD))?.shown === true)
  await wait(900)
  const said = up ? await card.$eval('[data-nudge-practice]', (one) => ({ lead: one.querySelector('[data-nudge-lead]')?.textContent, mark: one.querySelector('[data-nudge-mark]')?.textContent, words: one.querySelector('[data-nudge-words]')?.textContent, all: one.textContent, buttons: [...one.querySelectorAll('button')].map((b) => b.textContent.trim()) })) : null
  check('within the hour it says “Practice at 21:00”', said?.lead === 'Practice at 21:00', JSON.stringify(said?.lead))
  check('the practice’s name is the line, and “5 min” its own quiet mark: no “…, 5 minutes?”', said?.words === 'Stretch' && said?.mark === '5 min' && !/minutes\?/.test(said?.all ?? ''), JSON.stringify(said))
  check('with “Start”, “Not tonight” and “In 30 min”', JSON.stringify(said?.buttons) === JSON.stringify(['Start', 'Not tonight', 'In 30 min']), JSON.stringify(said?.buttons))
  check('one surface: Home’s “Now” card waits while the corner has it', !(await h.$(now)), `the corner holds ${await h.evaluate(() => window.api.practiceCorner())}, its window shown: ${(await at(CARD))?.shown}`)
  for (const look of ['light', 'dark']) { await c.look(look); await card.waitForTimeout(400); await card.screenshot({ path: `${SHOT}/corner-card-${look}.png`, timeout: 8000 }).catch(() => {}) }
  let k = await at(CARD)
  const corner = (name, tall) => ({ x: name.endsWith('left') ? k.area.x + 10 : k.area.x + k.area.width - 360 - 10, y: name.startsWith('top') ? k.area.y + 8 : k.area.y + k.area.height - tall - 8 })
  const same = (a, b) => a.x === b.x && a.y === b.y
  check('at the top right of the screen', same(k, corner('top-right', k.height)), JSON.stringify(k))
  // --- It steps aside as the bubble does.
  await point(k.x - 30, k.y + 20)
  await wait(1900)
  k = await at(CARD)
  check('the pointer at rest just left of it: it glides to the bottom right, clear of the pointer', same(k, corner('bottom-right', k.height)), JSON.stringify(k))
  await point(far.x, far.y)

  // --- Haligtree's own window comes to the front: the offer goes inside, off the corner.
  await front(true)
  check('Haligtree’s window coming to the front takes the card off the corner', await until(async () => !(await card.$('[data-nudge-practice]'))))
  check('and asks on Home’s “Now” card instead: one surface, never both', await until(async () => !!(await h.$(now))), JSON.stringify(await v('practices:offer')))
  check('the offer is not answered by that: still open', !!(await v('practices:offer')))
  await h.screenshot({ path: `${SHOT}/inside-after-front.png`, timeout: 8000 }).catch(() => {})
  // --- Offered with the window in front: inside from the start, no card window.
  await v('practices:answer', practice.id, 'later')
  await v('practices:unanswer', practice.id)
  await wait(1500)
  check('offered while Haligtree is in front: on Home’s card, and no card window comes up', !!(await h.$(now)) && !(await at(CARD))?.shown, JSON.stringify(await at(CARD)))
  await front(false)

  // --- Left alone for its two minutes (three seconds here), it leaves the corner by itself and waits on Home's “Now” card.
  await card.evaluate(() => void (window.qaQuick = true))
  await v('practices:answer', practice.id, 'later')
  await v('practices:unanswer', practice.id)
  check('offered with another app in front: the corner’s card, and Home’s card waits', await until(async () => !!(await card.$('[data-nudge-practice]'))) && !(await h.$(now)))
  check('left alone, it leaves the corner by itself', await until(async () => !(await card.$('[data-nudge-practice]'))))
  check('and waits on Home’s “Now” card, nothing lost: the offer still stands', await until(async () => !!(await h.$(now))) && !!(await v('practices:offer')), JSON.stringify(await v('practices:offer')))
  await card.evaluate(() => void (window.qaQuick = false))

  // --- Answered in another window while its card is up in the corner: the card goes.
  await v('practices:answer', practice.id, 'later')
  await v('practices:unanswer', practice.id)
  check('offered again with another app in front: the corner’s card', await until(async () => !!(await card.$('[data-nudge-practice]'))))
  await v('practices:answer', practice.id, 'skip')
  check('answered in another window, its card in the corner goes', await until(async () => !(await card.$('[data-nudge-practice]'))))
  check('and nothing is asked anywhere', !(await h.$(now)) && (await v('practices:offer')) === null)

  // --- The review reminder, in a book of your own: the corner's card, with “Review now” and “In an hour”.
  await h.evaluate(() => window.api.nudge({ kind: 'review', text: '12 cards, about 5 minutes', again: false }))
  check('the review reminder is a card in the corner, with Review now and In an hour', await until(async () => { const said = await card.$eval('[data-nudge="review"]', (one) => one.textContent).catch(() => ''); return said.includes('Time to review') && said.includes('Review now') && said.includes('In an hour') }))
  await card.click('[data-nudge-later]')
  check('“In an hour” puts it away', await until(async () => !(await card.$('[data-nudge="review"]'))))

  // --- The main window closed: the corner's card is the only place.
  await v('practices:unanswer', practice.id)
  await until(async () => !!(await card.$('[data-nudge-practice]')))
  await card.click('[data-practice-later]')
  await wait(600)
  check('“In 30 min” on the card says so, with Undo', /again in 30 minutes/.test(await card.$eval('[data-nudge-said]', (one) => one.textContent).catch(() => '')))
  await main('of("view=home").hide()')
  await card.click('[data-nudge-undo]')
  check('with the main window closed, the corner’s card asks', await until(async () => !!(await card.$('[data-nudge-practice]'))) && (await at(CARD))?.shown === true)
  await main('of("view=home").showInactive()')
  check('no errors in the window', c.errors.length === 0, c.errors.slice(0, 3).join(' | '))
} catch (error) {
  check('the run finished', false, error.message.split('\n')[0])
} finally {
  await c.close?.()
}
done()
