// One recording per window, ever: a second start while one is starting or
// live (a double click on the mic, ⌘K "Record a voice note" while the mic
// records) does nothing. Stop and keep keeps exactly one, and every microphone
// stream asked for is closed after, so the Mac's orange mic dot goes away.
// Chromium's stand-in microphone, for this probe only.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/record-once.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS = `${process.env.QA_ARGS ?? '--sandbox'} --use-fake-device-for-media-stream --use-fake-ui-for-media-stream`

const { check, done } = checks()
const c = await sandbox({ width: 1100, height: 760 })
const { page, v } = c
const wait = (ms) => page.waitForTimeout(ms)
const EDITOR = '.tiptap.ProseMirror.haligtree-editor:not(.is-line)'
const reopen = async () => {
  await page.evaluate(() => window.api.hidePrompt()); await wait(500)
  await page.evaluate(() => window.api.showPrompt()); await wait(1200)
}
// Every stream the page asks for, kept, so the probe can see each one closed.
const watchMic = () => page.evaluate(() => {
  window.__streams = []
  const ask = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices)
  navigator.mediaDevices.getUserMedia = async (want) => { const s = await ask(want); window.__streams.push(s); return s }
})
const state = () => page.evaluate((sel) => ({
  recorders: document.querySelectorAll('[data-voice-recorder]').length,
  audio: document.querySelectorAll(`${sel} .tiptap-attachment.is-audio`).length,
  streams: window.__streams.length,
  open: window.__streams.flatMap((s) => s.getTracks()).filter((t) => t.readyState !== 'ended').length
}), EDITOR)

try {
  await v('settings:set', { hintRate: 0, rotCount: 0, sounds: false })
  await reopen()
  await watchMic()

  // A double click on the mic: the second lands while the first still waits for the microphone.
  await page.evaluate(() => { document.querySelector('[data-record-button]').click(); const b = document.querySelector('[data-shot="record"]'); b.click(); b.click() })
  await wait(1800)
  const twice = await state()
  check('a double click on the mic starts one recording', twice.recorders === 1 && twice.open <= 1, JSON.stringify(twice))

  // ⌘K "Record a voice note" while it records: nothing new starts.
  await page.keyboard.press('Meta+KeyK'); await wait(600)
  await page.keyboard.type('record a voice', { delay: 30 }); await wait(500)
  await page.keyboard.press('Enter'); await wait(1500)
  const again = await state()
  check('⌘K "Record a voice note" while one records starts nothing', again.recorders === 1 && again.open <= 1, JSON.stringify(again))

  await page.click('[data-create]')
  await page.waitForSelector(`${EDITOR} .tiptap-attachment.is-audio`, { timeout: 8000 }).catch(() => {})
  await wait(800)
  const kept = await state()
  check('Stop and keep keeps exactly one recording, and no recorder is left', kept.audio === 1 && kept.recorders === 0, JSON.stringify(kept))
  check('every microphone stream is closed after (the mic dot goes away)', kept.open === 0, JSON.stringify(kept))

  // Cancel after a double start: nothing kept, nothing left listening.
  await page.evaluate(() => { document.querySelector('[data-record-button]').click(); const b = document.querySelector('[data-shot="record"]'); b.click(); b.click() })
  await wait(1500)
  await page.keyboard.press('Escape'); await wait(800)
  const gone = await state()
  check('Esc after a double start leaves no recorder and no open microphone', gone.recorders === 0 && gone.open === 0 && gone.audio === 1, JSON.stringify(gone))
} catch (error) {
  check('ran without throwing', false, String(error?.stack ?? error))
} finally {
  await c.close?.()
  done()
}
