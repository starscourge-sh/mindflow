// Choose what to record: the start card's "Sound from: All of this Mac ▾" lists the apps open now (stand-ins in a
// test, never the real Mac's), one is chosen and the meeting program records that app's sound (it says so); a browser
// chosen says every tab in it is heard; "My microphone" off records none of yours; both remembered for next time; and
// changed while it records, from the live card. The card names no app of its own. Silent: test mode.
//   QA_ARGS=--sandbox QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/meeting-sound-from.mjs
import { join } from 'node:path'
import { checks } from './harness.mjs'
import { recorded } from './meeting-flow.mjs'

const FRAMES = process.env.FRAMES
const APPS = [{ bundle: 'com.example.call', name: 'Call' }, { bundle: 'com.google.Chrome', name: 'Google Chrome' }, { bundle: 'com.example.music', name: 'Music player' }]
const { check, done } = checks()
const { c, card } = await recorded({ apps: APPS })
const { h, v } = c
const wait = (ms) => h.waitForTimeout(ms)
try {
  await v('meeting:start', null)
  const m = await card()
  await m.waitForSelector('[data-meeting-card="ready"]')
  const text = await m.evaluate(() => document.querySelector('[data-meeting-card]').textContent)
  check('the start card has "Sound from: All of this Mac" and "My microphone"', /Sound fromAll of this Mac/.test(text) && /My microphone/.test(text), text)
  check('its own words name no app', !/Teams|Zoom|Chrome|Meet|Safari/.test(text.replace(/Sound from.*$/, '')), text)
  check('the microphone is on to start', await m.evaluate(() => document.querySelector('[data-meeting-mic]').getAttribute('aria-checked') === 'true'))
  if (FRAMES) await c.both(join(FRAMES, 'sound-from-card'), m)
  await m.click('[data-meeting-from-button]')
  await m.waitForSelector('[data-meeting-sound-from] [data-meeting-from="com.example.call"]')
  const rows = await m.evaluate(() => [...document.querySelectorAll('[data-meeting-from]')].map((b) => b.textContent))
  check('it lists All of this Mac, then the apps open now', rows.join('|') === 'All of this Mac|Call|Google Chrome|Music player', rows.join('|'))
  if (FRAMES) await c.both(join(FRAMES, 'sound-from-list'), m)
  await m.click('[data-meeting-from="com.google.Chrome"]'); await wait(300)
  const browser = await m.evaluate(() => document.querySelector('[data-meeting-browser]')?.textContent)
  check('a browser chosen says every tab is heard', browser === 'Every tab in Google Chrome is heard: mute the others.', browser)
  await m.click('[data-meeting-from-button]'); await m.click('[data-meeting-from="com.example.call"]'); await wait(300)
  check('another app chosen, the line about tabs goes', !(await m.$('[data-meeting-browser]')))
  await m.click('[data-meeting-mic]'); await wait(300)
  check('"My microphone" turned off', await m.evaluate(() => document.querySelector('[data-meeting-mic]').getAttribute('aria-checked') === 'false'))
  if (FRAMES) await c.both(join(FRAMES, 'sound-from-chosen'), m)
  await m.click('[data-meeting-start]')
  await m.waitForSelector('[data-meeting-card="live"]')
  await wait(800)
  let state = await v('meeting:state')
  check('the meeting program records the app chosen, the microphone off', state.recording?.bundle === 'com.example.call' && state.recording?.mic === false, JSON.stringify(state.recording))
  // Changed while it records, from the live card.
  await m.click('[data-meeting-from-button]'); await m.click('[data-meeting-from="all"]'); await wait(600)
  await m.click('[data-meeting-mic]'); await wait(600)
  state = await v('meeting:state')
  check('changed on the live card: all of this Mac and the microphone, at once', state.recording?.bundle === null && state.recording?.mic === true, JSON.stringify(state.recording))
  if (FRAMES) await c.both(join(FRAMES, 'sound-from-live'), m)
  await m.click('[data-meeting-from-button]'); await m.click('[data-meeting-from="com.example.music"]'); await wait(600)
  await m.click('[data-meeting-stop]')
  await h.waitForSelector('[data-meeting-page]', { timeout: 30000 })
  // Remembered: the next start card has the last choice.
  await v('meeting:start', null)
  const next = await card()
  await wait(800)
  state = await v('meeting:state')
  check('the last choice is remembered for next time', state.from?.bundle === 'com.example.music' && state.from?.mic === true, JSON.stringify(state.from))
  await next.click('[data-meeting-stop]').catch(() => {})
  check('no errors on the page', !c.errors.length, c.errors.join(' | '))
} catch (error) {
  check('the run finished', false, error.stack.split('\n').slice(0, 3).join(' / '))
} finally {
  await c.close()
  done()
}
