// The welcome's steps, book-first: ↵ walks Why → You → Catch → Write → Remember → Out of the box →
// Name it → Make it yours → Permissions → Your notes → Ready. ⇧↵ and ← come back; a foot mark jumps.
// Out of the box: first tile is Reading (not dated plans); Permissions calendar + alerts as before.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-a/main/index.js HALIGTREE_QA_AWAY=1 node qa/welcome-steps.mjs [shots folder]
import { mkdirSync } from 'fs'
import { join } from 'path'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'

delete process.env.QA_ARGS
process.env.HALIGTREE_QA_CALENDAR = '[]'
const SHOTS = process.argv[2] ?? process.env.QA_SHOTS ?? ''
if (SHOTS) mkdirSync(SHOTS, { recursive: true })
const { check, done } = checks()
const c = await sandbox({ width: 1280, height: 800, seeded: false })
const { h, errors, close } = c
const STEPS = ['Why', 'You', 'Catch', 'Write', 'Remember', 'Out of the box', 'Name it', 'Make it yours', 'Permissions', 'Your notes', 'Ready']
const TOUR = String(STEPS.indexOf('Out of the box') + 1)
const PERMS = String(STEPS.indexOf('Permissions') + 1)
const chapter = () => h.evaluate(() => (document.querySelector('.mf-welcome footer .sr-only')?.textContent ?? '').replace(/^Chapter \d+ of \d+: /, ''))
const up = () => h.evaluate(() => !!document.querySelector('.mf-welcome'))
const shot = (name) => SHOTS && h.screenshot({ type: 'jpeg', quality: 82, scale: 'css', path: join(SHOTS, `steps-${name}.jpg`) })
try {
  await h.waitForSelector('[data-intro]', { timeout: 10000 })
  await h.keyboard.press('Enter')
  await h.waitForSelector('[data-thesis="line"]', { timeout: 8000 })
  // A letter settles Why without going on (↵ would Continue once settled; Esc asks to leave).
  await h.keyboard.press('x')
  await h.waitForSelector('[data-thesis="gap-2"]', { timeout: 8000 })
  await h.waitForTimeout(400)
  const thesisGaps = await h.evaluate(() => [...document.querySelectorAll('[data-thesis^="gap-"]')].map((el) => el.textContent ?? ''))
  check('thesis three lead with writing and reading, not plans', thesisGaps[0]?.includes('Your writing') && /reading/i.test(thesisGaps[1] ?? '') && !/plan/i.test(thesisGaps[1] ?? ''), thesisGaps.join(' | '))
  check('still on Why after settling the thesis', (await chapter()) === 'Why', await chapter())
  const seen = ['Why']
  for (let i = 0; i < 50 && seen[seen.length - 1] !== 'Ready'; i++) {
    const was = await chapter()
    const skip = await h.$('footer button:has-text("Skip trying it")')
    if (skip) await skip.click()
    else await h.keyboard.press('Enter')
    await h.waitForTimeout(700)
    const now = await chapter()
    if (now !== was) seen.push(now)
  }
  check('↵ reaches every step in order, Why to Ready (book-first)', seen.join(' > ') === STEPS.join(' > '), seen.join(' > '))
  await h.keyboard.press('Shift+Enter'); await h.waitForTimeout(700)
  check('⇧↵ goes back a step (Ready to Your notes)', (await chapter()) === 'Your notes', await chapter())
  await h.keyboard.press('ArrowLeft'); await h.waitForTimeout(700)
  check('← goes back a step (Your notes to Permissions)', (await chapter()) === 'Permissions', await chapter())
  await h.click(`[data-mark-to="${TOUR}"]`); await h.waitForTimeout(900)
  check('a mark in the row goes to Out of the box', (await chapter()) === 'Out of the box', await chapter())
  check('the step you are on is the long gold mark', await h.evaluate((n) => document.querySelector(`[data-mark-to="${n}"]`)?.getAttribute('aria-current') === 'step', TOUR))
  await h.waitForSelector('[data-tile][data-playing]', { timeout: 6000 }).catch(() => null)
  const playing = await h.evaluate(() => document.querySelector('[data-tile][data-playing]')?.getAttribute('data-tile') ?? null)
  check('on Out of the box a tile plays by itself', !!playing, String(playing))
  check('first tile is Reading (book-first), not Dated plans', playing === 'pdfcard' || (await h.evaluate(() => document.querySelector('[data-tile]')?.getAttribute('data-tile'))) === 'pdfcard', String(playing))
  check('the tile playing has its line filling', (await h.locator('[data-tile][data-playing] [data-tile-progress]').count()) === 1)
  const before = await h.evaluate(() => document.querySelector('[data-tile][data-playing]')?.textContent ?? '')
  await h.waitForTimeout(1600)
  const after = await h.evaluate(() => document.querySelector('[data-tile][data-playing]')?.textContent ?? '')
  check('its demo moves while it plays (its words change)', before !== after, `${before.slice(0, 40)} | ${after.slice(0, 40)}`)
  await shot('tour')
  await h.click('[data-tile="review"]'); await h.waitForTimeout(400)
  check('a click on another tile plays it', await h.evaluate(() => document.querySelector('[data-tile="review"]')?.hasAttribute('data-playing')))
  check('six tiles, each a demo the Powers page draws', (await h.locator('[data-tile]').count()) === 6)
  const tileOrder = await h.evaluate(() => [...document.querySelectorAll('[data-tile]')].map((el) => el.getAttribute('data-tile')))
  check('Dated plans is the last tile', tileOrder[tileOrder.length - 1] === 'taskwords', tileOrder.join(' > '))
  await h.click(`[data-mark-to="${PERMS}"]`); await h.waitForTimeout(900)
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
