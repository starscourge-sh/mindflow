// Settings that must do what they say, in the sandbox: Bubble sits is only
// offered while there is a bubble; Count in never holds a session up with no
// bubble on screen to count; turning on Show Vigil in screen recordings never
// lets a sticky kept out of shares show, even for a moment.
//
//   npx electron-vite build --outDir out-ts
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-ts/main/index.js MINDFLOW_QA_AWAY=1 node qa/session-settings.mjs
import { sandbox } from './sandbox-lib.mjs'

const results = []
const check = (name, ok, detail = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`) }

const c = await sandbox({ width: 1100, height: 900 })
const { electron, h, v } = c
try {
  // --- Bubble sits: shown with the bubble, gone with the time in the note alone.
  await v('settings:set', { focusShows: 'bubble' })
  await c.go('settings')
  await h.click('[data-section="Appearance"]')
  await h.waitForTimeout(600)
  const titles = () => h.$$eval('[data-setting] div.font-medium', (all) => all.map((one) => one.textContent))
  let shown = await titles()
  check('Bubble sits is offered with the bubble', shown.includes('Bubble sits') && !shown.includes('Pill sits'))
  await v('settings:set', { focusShows: 'note' })
  await h.waitForTimeout(800)
  shown = await titles()
  check('Bubble sits is not offered with the time in the note alone', !shown.includes('Bubble sits'))

  // --- Count in: held to count with the bubble; started at once without one.
  const held = async (shows) => {
    await v('settings:set', { countIn: true, focusShows: shows })
    const task = (await v('tasks'))[0]
    const id = await v('session:start', task.id, 'Count in check', 60000)
    const now = await v('focus:now')
    await v('session:cancel', id)
    return now?.pausedAt != null
  }
  check('with the bubble, a session counts in first', await held('bubble'))
  check('with the time in the note alone, a session starts at once', !(await held('note')))
  check('with both, a session counts in first', await held('both'))
  await v('settings:set', { countIn: false, focusShows: 'bubble' })

  // --- Ticking sound: picked in Settings, heard at once, kept; greyed with ticking off.
  await v('settings:set', { sounds: true, sessionTick: true, sessionTickSound: 'old' })
  await h.click('[data-section="Sound"]')
  await h.waitForTimeout(600)
  const chip = (label) => h.locator('[data-setting]').filter({ hasText: 'Ticking sound' }).locator(`button:has([aria-label="${label}"])`)
  await chip('Pocket watch').click()
  await h.waitForTimeout(700)
  check('picking a tick keeps it', (await v('settings')).sessionTickSound === 'watch')
  const sampled = await h.evaluate(() => [...(window.vigilHeard ?? [])])
  check('picking a tick plays a sample of it', sampled.includes('tick-sample watch'), sampled.join(' '))
  await v('settings:set', { sessionTick: false })
  await h.waitForTimeout(600)
  check('with ticking off, the tick choice is greyed', await h.locator('[data-setting]').filter({ hasText: 'Ticking sound' }).locator('[inert]').count() === 1)
  await v('settings:set', { sessionTickSound: 'old' })

  // --- Screen recordings: a sticky kept out of shares never shows on the way.
  await v('settings:set', { stickiesUnshared: true, stickiesShown: true })
  for (let i = 0; i < 30 && !(await electron.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().some((w) => w.webContents.getURL().includes('view=sticky')))); i++) await h.waitForTimeout(300)
  await electron.evaluate(({ BrowserWindow }) => {
    globalThis.protections = []
    const own = BrowserWindow.prototype.setContentProtection
    BrowserWindow.prototype.setContentProtection = function (on) {
      globalThis.protections.push({ sticky: this.webContents.getURL().includes('view=sticky'), on })
      return own.call(this, on)
    }
  })
  await h.evaluate(() => window.api.setRecordable(true))
  const calls = await electron.evaluate(() => globalThis.protections)
  const stickyCalls = calls.filter((one) => one.sticky)
  check('a sticky is set at least once', stickyCalls.length > 0, `${stickyCalls.length} calls`)
  check('a sticky kept out of shares is never unprotected', stickyCalls.every((one) => one.on), stickyCalls.map((one) => one.on).join(' '))
  check('the other windows show in recordings', calls.filter((one) => !one.sticky).every((one) => !one.on))
  await h.evaluate(() => window.api.setRecordable(false))
  check('no page errors', !c.errors.some((one) => one.includes('PAGEERROR')), c.errors.join(' | '))
} finally {
  await c.close()
}
const failed = results.filter((ok) => !ok).length
console.log(`\n${results.length - failed} of ${results.length} passed`)
process.exit(failed ? 1 : 0)
