// Transcribe on two stacked voice notes, the app's own kind (Opus in an MP4 with no length written, which
// AVFoundation reads as days long: the helper never finished, and "Listening… 1:43 of 0:47" counted on). Real
// speech recognition, no stand-in: needs macOS 26 and speech recognition allowed for the Electron that runs it.
// Every 50ms it reads the progress line and the play button and bar of both rows, and takes a picture into QA_SHOTS.
// Checks: the 47 second note has its words in under 10 seconds; the progress line never reads past the length and
// never goes back; the play button and the bar are at the same place in both rows before, during and after; "Stop"
// on the other ends it at once with "Stopped" and writes no words.
// QA_VOICE is a 47 second recording of speech made the app's way, and a second one beside it named with a "b":
//   ffmpeg -i speech.aiff -t 47 -ac 1 -c:a libopus -f mp4 -movflags frag_keyframe+empty_moov+default_base_moof voice47.m4a
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_VOICE=/path/voice47.m4a node qa/transcribe-real.mjs
import { mkdirSync, readFileSync } from 'node:fs'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'

const { check, done } = checks()
const c = await sandbox({ width: 1100, height: 760 })
const { page, v } = c
const wait = (ms) => page.waitForTimeout(ms)
const shots = `${process.env.QA_SHOTS ?? '/tmp'}/transcribe-real`
mkdirSync(shots, { recursive: true })
// Two different recordings (the same bytes would be one stored file, and one transcript for both).
const voices = [process.env.QA_VOICE, process.env.QA_VOICE.replace(/\.m4a$/, 'b.m4a')].map((file) => [...readFileSync(file)])
const EDITOR = '.tiptap.ProseMirror.haligtree-editor:not(.is-line)'

const rows = () => page.$$eval('.tiptap-attachment.is-audio', (all) => all.map((one) => {
  const box = (el) => { const r = el?.getBoundingClientRect(); return r ? `${Math.round(r.left)},${Math.round(r.width)}` : null }
  const line = [...one.querySelectorAll('.tiptap-attachment-listening')].find((el) => el.offsetParent)
  return { play: box(one.querySelector('.tiptap-media-play')), bar: box(one.querySelector('[data-wave]')), listening: line?.textContent ?? null, clock: line?.dataset.listeningClock ?? null }
}))
const secs = (clock) => { const [m, s] = clock.split(':').map(Number); return m * 60 + s }

try {
  await v('settings:set', { hintRate: 0, rotCount: 0, sounds: false })
  await page.evaluate(() => window.api.showPrompt())
  await wait(1500)
  if (await page.$('[aria-label="Hide the side panel"]')) { await page.keyboard.press('Meta+Backslash'); await wait(1000) }
  await page.click(EDITOR)
  for (let n = 1; n <= 2; n += 1) {
    await page.evaluate(async ([bytes, n]) => {
      const src = await window.api.saveFile(`Voice note ${n}.m4a`, new Uint8Array(bytes))
      document.querySelector('.tiptap.ProseMirror.haligtree-editor:not(.is-line)').editor.chain().focus('end').insertContent([{ type: 'attachment', attrs: { src, name: `Voice note ${n}.m4a` } }, { type: 'paragraph' }]).run()
    }, [voices[n - 1], n])
    await wait(600)
  }
  await page.waitForFunction(() => document.querySelectorAll('.tiptap-attachment.is-audio [data-transcribe]').length >= 2, null, { timeout: 8000 })
  await wait(800)
  for (const look of ['light', 'dark']) {
    await page.evaluate((n) => { localStorage.setItem('theme', n === 'light' ? 'paper' : 'dark'); window.dispatchEvent(new StorageEvent('storage', { key: 'theme' })) }, look)
    await wait(300)
    await page.screenshot({ path: `${shots}/before-${look}.png` })
  }
  const before = await rows()
  check('both rows: play and bar at the same place before', before[0].play === before[1].play && before[0].bar === before[1].bar, JSON.stringify(before))

  // Play row 1, drag its bar, pause: every 50ms both rows keep their play button and bar, and at most one floating
  // thing (the bar's time bubble, only on the bar being dragged) shows.
  const still = []
  const sample = async (what) => still.push({ what, rows: await rows(), floating: await page.$$eval('.mf-sound-ghost, [role=tooltip]', (all) => all.filter((one) => one.getBoundingClientRect().width && getComputedStyle(one).display !== 'none').length) })
  await page.$$eval('.tiptap-attachment.is-audio .tiptap-media-play', (all) => all[0].click())
  for (let i = 0; i < 10; i += 1) { await sample('playing'); await wait(50) }
  const bar = await page.$$eval('.tiptap-attachment.is-audio [data-wave]', (all) => { const r = all[1].getBoundingClientRect(); return { x: r.left, y: r.top + r.height / 2, w: r.width } })
  await page.mouse.move(bar.x + 4, bar.y); await page.mouse.down()
  for (let i = 1; i <= 10; i += 1) { await page.mouse.move(bar.x + (bar.w * i) / 12, bar.y); await sample('dragging row 2'); await wait(50) }
  await page.mouse.up()
  await page.screenshot({ path: `${shots}/dragging.png` })
  await page.$$eval('.tiptap-attachment.is-audio .tiptap-media-play', (all) => all[0].click())
  for (let i = 0; i < 6; i += 1) { await sample('paused'); await wait(50) }
  const shifted = still.filter((one) => JSON.stringify(one.rows.map((r) => [r.play, r.bar])) !== JSON.stringify(before.map((r) => [r.play, r.bar])))
  check('play, drag and pause: play and bar stay put in both rows, every 50ms', shifted.length === 0, `${shifted.length} of ${still.length}; e.g. ${JSON.stringify(shifted[0] ?? {})}`)
  const crowded = still.filter((one) => one.floating > 1)
  check('play, drag and pause: never more than one floating thing', crowded.length === 0, `${crowded.length} frames; e.g. ${JSON.stringify(crowded[0] ?? {})}`)

  // Row 2 transcribed: timed, sampled every 50ms.
  const started = Date.now()
  await page.$$eval('.tiptap-attachment.is-audio', (all) => [...all[1].querySelectorAll('[data-transcribe]')].find((el) => el.offsetParent).click())
  const frames = []
  let n = 0
  while (Date.now() - started < 15000) {
    const now = await rows()
    frames.push({ t: Date.now() - started, ...now })
    if (n % 2 === 0) await page.screenshot({ path: `${shots}/during-${String(n).padStart(3, '0')}.png` })
    n += 1
    if (!now[1].listening && Date.now() - started > 300) break
    await wait(50)
  }
  const took = frames.at(-1).t
  const worded = await page.$$eval('.tiptap-attachment.is-audio', (all) => all.map((one) => one.hasAttribute('data-words')))
  check('the 47 second voice note has its words in under 10 seconds', worded[1] && took < 10000, `${took}ms; words: ${JSON.stringify(worded)}`)
  const clocks = frames.map((f) => f[1].clock).filter(Boolean).map(secs)
  check('the progress line never reads past the recording\'s length (0:47)', clocks.every((s) => s <= 47), clocks.join(' '))
  check('the progress line never goes back', clocks.every((s, i) => !i || s >= clocks[i - 1]), clocks.join(' '))
  const texts = [...new Set(frames.map((f) => f[1].listening).filter(Boolean))]
  console.log('progress lines seen:', texts.join(' | '))
  const moved = frames.filter((f) => f[0].play !== before[0].play || f[1].play !== before[1].play || f[0].bar !== before[0].bar || f[1].bar !== before[1].bar)
  check('play and bar stay put in both rows while it transcribes', moved.length === 0, `${moved.length} of ${frames.length}; e.g. ${JSON.stringify(moved[0] ?? {})}`)
  await wait(600)
  const after = await rows()
  check('play and bar stay put in both rows after', JSON.stringify(after.map((r) => [r.play, r.bar])) === JSON.stringify(before.map((r) => [r.play, r.bar])), JSON.stringify(after))
  await page.screenshot({ path: `${shots}/after.png` })

  // Row 1: Stop.
  await page.$$eval('.tiptap-attachment.is-audio', (all) => [...all[0].querySelectorAll('[data-transcribe]')].find((el) => el.offsetParent).click())
  await page.waitForFunction(() => [...document.querySelectorAll('[data-transcribe-stop]')].some((el) => el.offsetParent), null, { timeout: 4000 })
  await page.screenshot({ path: `${shots}/stop-shown.png` })
  const stopAt = Date.now()
  await page.$$eval('[data-transcribe-stop]', (all) => all.find((el) => el.offsetParent).click())
  await page.waitForFunction(() => ![...document.querySelectorAll('.tiptap-attachment-listening')].some((el) => el.offsetParent), null, { timeout: 4000 })
  const stopped = Date.now() - stopAt
  await wait(200)
  const said = await page.evaluate(() => document.body.innerText.includes('Stopped'))
  const firstWorded = await page.$$eval('.tiptap-attachment.is-audio', (all) => all[0].hasAttribute('data-words'))
  check('"Stop" ends it at once, says "Stopped", and writes no words', stopped < 1500 && said && !firstWorded, `${stopped}ms; said ${said}; words ${firstWorded}`)
  await page.screenshot({ path: `${shots}/stopped.png` })
} catch (error) {
  check('the run finished', false, error.message.split('\n')[0])
} finally {
  await c.close?.()
}
done()
