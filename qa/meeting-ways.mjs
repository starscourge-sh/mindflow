// Every way into recording a meeting brings up the same card, and "Not now" puts it away: ⌘K in the main window and
// in quick capture, "/meeting" in a note, the menu bar, ⌃⌥⌘M from anywhere
// and "Record this meeting" on a Calendar event happening now (its name on the card). While one records, ⌃⌥⌘M notes
// the moment; the menu bar offers the moment and the stop. Without the Mac's sound allowed: the one line and the way
// to Settings. Silent: made-up tracks, a stand-in calendar.
//   QA_ARGS=--sandbox QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/meeting-ways.mjs
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { checks } from './harness.mjs'
import { sandbox, CALM_HOUR } from './sandbox-lib.mjs'
import { makeMeeting } from './meeting-lib.mjs'

const fixture = join(process.env.QA_DATA, 'meeting-fixture')
mkdirSync(fixture, { recursive: true })
const made = makeMeeting(fixture)
process.env.HALIGTREE_QA_MEETING = [made.you, made.others, made.script].join('|')
const DENIED = process.env.HALIGTREE_QA_MEETING_SCREEN === 'denied'
{
  // The app runs at CALM_HOUR (14:10 today): the event is on then.
  const now = new Date(); now.setHours(14, 10, 0, 0)
  process.env.HALIGTREE_QA_CALENDAR = JSON.stringify([{ title: 'Design sync', start: new Date(now.getTime() - 5 * 60_000).toISOString(), end: new Date(now.getTime() + 25 * 60_000).toISOString(), allDay: false, calendar: 'Work', color: '#2a9d8f', people: ['Thandi Nkosi', 'Marco Rossi'] }])
}
const { check, done } = checks()
const c = await sandbox({ width: 1200, height: 820, at: CALM_HOUR })
const { electron, page, h, v, go } = c
const wait = (ms) => h.waitForTimeout(ms)
const card = () => electron.windows().find((w) => w.url().includes('view=meeting'))
const shown = async () => {
  for (let i = 0; i < 50; i += 1) {
    const m = card()
    const state = m && (await m.evaluate(() => document.querySelector('[data-meeting-card]')?.dataset.meetingCard).catch(() => null))
    if (state) return { m, state, text: await m.evaluate(() => document.querySelector('[data-meeting-card]').textContent) }
    await wait(100)
  }
  return null
}
const away = async () => { const one = await shown(); await one?.m.getByText('Not now').click(); await wait(500); return !card() }
// ⌘K from quick capture opens in the main window, the one palette everywhere: typed there.
const palette = async (target) => {
  await target.keyboard.press('Meta+k'); await wait(700)
  await h.keyboard.type('record a meeting', { delay: 10 }); await wait(400)
  await h.keyboard.press('Enter'); await wait(300)
}

try {
  await v('settings:set', { sounds: false, hintRate: 0, rotCount: 0, macCalendar: true })
  const ways = []
  const way = async (name, run, title) => {
    await run()
    const one = await shown()
    const ok = !!one && one.state === (DENIED ? 'ready' : 'ready') && (!title || one.text.includes(title))
    ways.push(name)
    check(`${name}: the card comes up`, ok, one ? `${one.state}: ${one.text.slice(0, 120)}` : 'no card')
    check(`${name}: "Not now" puts it away`, await away())
  }
  await page.evaluate(() => window.api.showPrompt()); await wait(1200)
  if (await page.evaluate(() => document.visibilityState) !== 'visible') { await page.evaluate(() => window.api.showPrompt()); await wait(1200) }
  // Words in the box first, as a person has them when a meeting starts.
  await page.click('.ProseMirror'); await page.keyboard.type('Notes for the design sync', { delay: 10 }); await wait(500)
  await way('⌘K in quick capture', () => palette(page))
  await way('"/meeting" in the box', async () => {
    await page.click('.ProseMirror'); await page.keyboard.press('End'); await page.keyboard.press('Enter'); await page.keyboard.type('/meeting', { delay: 20 }); await wait(500); await page.keyboard.press('Enter')
  })
  await way('the menu bar', () => electron.evaluate(() => globalThis.trayBuilt.items.find((one) => one.label === 'Record a call or lecture').click()))
  await way('⌃⌥⌘M from anywhere', () => electron.evaluate(() => globalThis.haligtreeChords.get('⌃⌥⌘M')()))
  await way('⌘K in the main window', () => palette(h))
  await go('day'); await wait(1500)
  await way('a Calendar event on now', () => h.click('[data-record-event]'), '“Design sync”')

  if (DENIED) {
    // Not allowed: the one line and the way to Settings, never a recording.
    await electron.evaluate(() => globalThis.haligtreeChords.get('⌃⌥⌘M')())
    const one = await shown()
    await one.m.click('[data-meeting-start]'); await wait(800)
    const after = await shown()
    check('without the Mac\'s sound allowed: one plain line and the way to Settings', after.state === 'denied' && /Screen & System Audio Recording/.test(after.text) && /Open System Settings/.test(after.text), after.text)
    check('and nothing records', !(await electron.evaluate(() => globalThis.trayMenu.some((one) => one.label === 'Recording a meeting'))))
    await after.m.getByText('Not now').click()
  } else {
    // Recording: the same key notes the moment; the menu bar says so and stops it.
    await electron.evaluate(() => globalThis.haligtreeChords.get('⌃⌥⌘M')())
    const one = await shown()
    await one.m.click('[data-meeting-start]')
    await one.m.waitForSelector('[data-meeting-card="live"]')
    await wait(4000)
    await electron.evaluate(() => globalThis.haligtreeChords.get('⌃⌥⌘M')())
    await wait(300)
    check('⌃⌥⌘M while recording notes this moment', await one.m.evaluate(() => document.querySelectorAll('[aria-label="Moment noted"]').length) === 1)
    const menu = await electron.evaluate(() => globalThis.trayMenu.map((one) => one.label))
    check('the menu bar offers the moment and the stop while recording', menu.includes('Note this moment') && menu.includes('Stop and keep the meeting') && !menu.includes('Record a call or lecture'), menu.slice(0, 8).join(' | '))
    await electron.evaluate(() => globalThis.trayBuilt.items.find((one) => one.label === 'Stop and keep the meeting').click())
    await h.waitForSelector('[data-meeting-page]', { timeout: 30000 })
    check('stopped from the menu bar, the meeting is kept', true)
    // Meetings in ⌘K: the list under #recording.
    await palette(h).catch(() => {})
  }
  check('no errors on the page', !c.errors.length, c.errors.join(' | '))
} catch (error) {
  check('the run finished', false, error.stack)
} finally {
  await c.close()
  done()
}
