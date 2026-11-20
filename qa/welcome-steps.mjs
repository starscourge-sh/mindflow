// The welcome's steps, by a power user on keys and a first-timer who clicks: ↵ walks every step to Ready, ⇧↵ and ←
// come back, a mark in the row at the foot goes straight to its step; on "Out of the box" a tile plays (ringed, its
// line filling, its demo moving) and a click plays another; on "Permissions" the calendar's "Grant access" goes
// through the app's own request (the calendar stand-in HALIGTREE_QA_CALENDAR, never the real macOS one) and its row
// says "Access granted", and "Turn on alerts" turns alerts on (its sample notification counted, never shown in a
// test run); Esc with nothing playing asks before leaving, Esc again stays, and ↵ on the question leaves.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-a/main/index.js HALIGTREE_QA_AWAY=1 node qa/welcome-steps.mjs [shots folder]
import { mkdirSync } from 'fs'
import { join } from 'path'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'

delete process.env.QA_ARGS
// The calendar's stand-in: macOS's own question is never asked by a test run.
process.env.HALIGTREE_QA_CALENDAR = '[]'
const SHOTS = process.argv[2] ?? ''
if (SHOTS) mkdirSync(SHOTS, { recursive: true })
const { check, done } = checks()
const c = await sandbox({ width: 1280, height: 800, seeded: false })
const { h, errors, close } = c
const STEPS = ['Why', 'You', 'Catch', 'Out of the box', 'Permissions', 'Make it yours', 'Name it', 'Plan', 'Your notes', 'Ready']
const chapter = () => h.evaluate(() => (document.querySelector('.mf-welcome footer .sr-only')?.textContent ?? '').replace(/^Chapter \d+ of \d+: /, ''))
const up = () => h.evaluate(() => !!document.querySelector('.mf-welcome'))
const shot = (name) => SHOTS && h.screenshot({ type: 'jpeg', quality: 82, scale: 'css', path: join(SHOTS, `steps-${name}.jpg`) })
try {
  await h.waitForSelector('[data-intro]', { timeout: 10000 })
  // Past the arrival, as a person in a hurry does.
  await h.keyboard.press('Enter')
  await h.waitForSelector('[data-thesis="line"]', { timeout: 8000 })
  // 1. ↵ through every step. A step still playing takes one ↵ to settle; Catch's own way past is "Skip trying it".
  const seen = [await chapter()]
  for (let i = 0; i < 40 && seen[seen.length - 1] !== 'Ready'; i++) {
    const was = await chapter()
    const skip = await h.$('footer button:has-text("Skip trying it")')
    if (skip) await skip.click()
    else await h.keyboard.press('Enter')
    await h.waitForTimeout(700)
    const now = await chapter()
    if (now !== was) seen.push(now)
  }
  check('↵ reaches every step in order, Why to Ready', seen.join(' > ') === STEPS.join(' > '), seen.join(' > '))
  // 2. Back by keys, then a mark in the row.
  await h.keyboard.press('Shift+Enter'); await h.waitForTimeout(700)
  check('⇧↵ goes back a step (Ready to Your notes)', (await chapter()) === 'Your notes', await chapter())
  await h.keyboard.press('ArrowLeft'); await h.waitForTimeout(700)
  check('← goes back a step (Your notes to Plan)', (await chapter()) === 'Plan', await chapter())
  await h.click('[data-mark-to="4"]'); await h.waitForTimeout(900)
  check('a mark in the row goes to its step (Out of the box)', (await chapter()) === 'Out of the box', await chapter())
  check('the step you are on is the long gold mark', await h.evaluate(() => document.querySelector('[data-mark-to="4"]')?.getAttribute('aria-current') === 'step'))
  // 3. A tile plays: ringed, its line filling along its foot, its demo moving; a click plays another from its start.
  await h.waitForSelector('[data-tile][data-playing]', { timeout: 6000 }).catch(() => null)
  const playing = await h.evaluate(() => document.querySelector('[data-tile][data-playing]')?.getAttribute('data-tile') ?? null)
  check('on Out of the box a tile plays by itself', !!playing, String(playing))
  check('the tile playing has its line filling', (await h.locator('[data-tile][data-playing] [data-tile-progress]').count()) === 1)
  const before = await h.evaluate(() => document.querySelector('[data-tile][data-playing]')?.textContent ?? '')
  await h.waitForTimeout(1600)
  const after = await h.evaluate(() => document.querySelector('[data-tile][data-playing]')?.textContent ?? '')
  check('its demo moves while it plays (its words change)', before !== after, `${before.slice(0, 40)} | ${after.slice(0, 40)}`)
  await shot('tour')
  await h.click('[data-tile="review"]'); await h.waitForTimeout(400)
  check('a click on another tile plays it', await h.evaluate(() => document.querySelector('[data-tile="review"]')?.hasAttribute('data-playing')))
  check('six tiles, each a demo the Powers page draws', (await h.locator('[data-tile]').count()) === 6)
  // 4. Permissions: the calendar's Grant access goes through the app's own request and its row says so.
  await h.click('[data-mark-to="5"]'); await h.waitForTimeout(900)
  await h.waitForSelector('[data-grant="calendar"]:not([data-state="reading"])', { timeout: 6000 }).catch(() => null)
  check('the calendar row asks first', (await h.getAttribute('[data-grant="calendar"]', 'data-state')) === 'unasked', await h.getAttribute('[data-grant="calendar"]', 'data-state'))
  await h.click('[data-grant="calendar"] [data-grant-ask]')
  await h.waitForSelector('[data-grant="calendar"][data-state="granted"]', { timeout: 6000 }).catch(() => null)
  check('Grant access on the calendar: its row says "Access granted"', /Access granted/.test(await h.locator('[data-grant="calendar"]').innerText()))
  check('and the setting that reads it is on, as Settings\' own switch would leave it', await h.evaluate(async () => (await window.api.haligtree('settings')).macCalendar === true))
  await h.click('[data-grant="alerts"] [data-grant-ask]')
  await h.waitForSelector('[data-grant="alerts"][data-state="granted"]', { timeout: 6000 }).catch(() => null)
  check('Turn on alerts: alerts are on, and its row says so', (await h.evaluate(async () => (await window.api.haligtree('settings')).notify)) === 'alerts' && /Alerts on/.test(await h.locator('[data-grant="alerts"]').innerText()))
  await shot('permissions')
  // 5. Esc asks before leaving; Esc again stays; ↵ on the question leaves.
  await h.keyboard.press('Escape'); await h.waitForTimeout(400)
  check('Esc with nothing playing asks "Leave the welcome?"', await h.locator('[data-leave-ask]').isVisible().catch(() => false))
  await shot('leave-ask')
  await h.keyboard.press('Escape'); await h.waitForTimeout(400)
  check('Esc again stays: the question goes, the welcome stays on Permissions', !(await h.locator('[data-leave-ask]').count()) && (await up()) && (await chapter()) === 'Permissions')
  await h.keyboard.press('Escape'); await h.waitForTimeout(400)
  await h.keyboard.press('Enter'); await h.waitForTimeout(3600)
  check('↵ on the question leaves the welcome', !(await up()))
  check('no page errors', !errors.length, errors.slice(0, 3).join(' | '))
} finally {
  await close()
}
done()
