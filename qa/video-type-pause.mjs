// Typing pauses the note's video and stamps the time: for a video file in the note and for a YouTube block
// (a stubbed player that speaks YouTube's iframe messages). Two seconds after the typing stops it plays on;
// ⌥K pauses and plays, ⌥J ⌥L skip; the switch on the block turns it off.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_VIDEO=/path/clip.mp4 node qa/video-type-pause.mjs
import { readFileSync } from 'fs'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const { check, done } = checks()
const c = await sandbox({ width: 1400, height: 900 })
const { h, v, electron } = c
const wait = (ms) => h.waitForTimeout(ms)
const shots = process.env.QA_SHOTS ?? '/tmp'
const p = (text) => ({ type: 'paragraph', content: text ? [{ type: 'text', text }] : [] })
const ed = (fn, arg) => h.evaluate(([fn, arg]) => new Function('ed', 'arg', `return (${fn})(ed, arg)`)(document.querySelector('[data-open] .tiptap').editor, arg), [fn.toString(), arg])
const lastLine = () => ed((e) => { let t = ''; e.state.doc.forEach((n) => (t = n.textContent)); return t })
const toEnd = async () => { await ed((e) => { const end = e.state.doc.content.size; e.chain().focus().insertContentAt(end, { type: 'paragraph' }).setTextSelection(end + 1).run() }); await wait(150) }

// The stub: YouTube's player page, answering "listening" with its state and obeying play, pause and seek.
const STUB = `<!doctype html><body style="background:#222;color:#eee;font:14px sans-serif">stub player<script>
let state = 1, time = 245, at = Date.now()
const now = () => state === 1 ? time + (Date.now() - at) / 1000 : time
const tell = () => parent.postMessage(JSON.stringify({ event: 'infoDelivery', info: { playerState: state, currentTime: now() } }), '*')
addEventListener('message', (e) => { const d = JSON.parse(e.data)
  if (d.event === 'listening') setInterval(tell, 250)
  if (d.func === 'pauseVideo') { time = now(); state = 2; tell() }
  if (d.func === 'playVideo') { at = Date.now(); state = 1; tell() }
  if (d.func === 'seekTo') { time = d.args[0]; at = Date.now(); tell() } })
</script>`
try {
  await v('settings:set', { sounds: false, hintRate: 0, typePause: true })
  await electron.evaluate(({ session, net }, stub) => {
    session.defaultSession.protocol.handle('https', (request) => new URL(request.url).hostname.endsWith('youtube-nocookie.com')
      ? new Response(stub, { headers: { 'content-type': 'text/html' } })
      : net.fetch(request, { bypassCustomProtocolHandlers: true }))
  }, STUB)

  // 1. A video file in the note.
  const bytes = [...readFileSync(process.env.QA_VIDEO)]
  const src = await h.evaluate((b) => window.api.saveFile('tides.mp4', new Uint8Array(b)), bytes)
  const id = await v('article:new')
  await v('item:save', id, { title: 'Tides lecture', body: { type: 'doc', content: [{ type: 'attachment', attrs: { src, name: 'tides.mp4', size: bytes.length } }, p('Notes:')] } })
  await c.send('article', id); await wait(1500)
  await h.evaluate(async () => { const f = document.querySelector('[data-open] video.tiptap-attachment-video'); f.muted = true; await f.play() })
  await wait(600)
  await toEnd()
  await h.keyboard.type('The moon'); await wait(200)
  const file = () => h.evaluate(() => { const f = document.querySelector('[data-open] video.tiptap-attachment-video'); return { paused: f.paused, time: f.currentTime } })
  check('video file: typing pauses it', (await file()).paused, JSON.stringify(await file()))
  check('video file: the new line starts with the time', /^\[0:0\d\] The moon$/.test(await lastLine()), await lastLine())
  check('video file: the time is a link that plays the video', await h.locator('[data-open] .mf-time-link').count() > 0, '')
  await h.keyboard.type(' pulls'); await wait(1200)
  check('video file: still paused while typing goes on', (await file()).paused, '')
  await wait(2400)
  check('video file: plays on two seconds after the typing stops', !(await file()).paused, JSON.stringify(await file()))
  let before = (await file()).time
  await h.keyboard.press('Alt+KeyL'); await wait(200)
  check('video file: ⌥L goes on five seconds', (await file()).time > before + 4, `${before} → ${(await file()).time}`)
  before = (await file()).time
  await h.keyboard.press('Alt+KeyJ'); await wait(200)
  check('video file: ⌥J goes back five seconds', (await file()).time < before - 4, `${before} → ${(await file()).time}`)
  await h.keyboard.press('Alt+KeyK'); await wait(200)
  check('video file: ⌥K pauses', (await file()).paused, '')
  await h.keyboard.press('Alt+KeyK'); await wait(300)
  check('video file: ⌥K plays again', !(await file()).paused, '')
  await h.keyboard.press('Alt+KeyK'); await wait(200)

  // 2. A YouTube block, its player stubbed.
  const yt = await v('article:new')
  await v('item:save', yt, { title: 'A YouTube lecture', body: { type: 'doc', content: [{ type: 'youtube', attrs: { src: 'https://www.youtube.com/watch?v=abcdefghijk' } }, p('Notes:')] } })
  await c.send('article', yt); await wait(1500)
  await h.locator('[data-open] .mf-video-play').click(); await wait(2500)
  const stub = () => h.evaluate(() => new Promise((done) => {
    const frame = document.querySelector('[data-open] [data-youtube-video] iframe')
    const on = (e) => { if (e.source !== frame.contentWindow) return; removeEventListener('message', on); done(JSON.parse(e.data).info) }
    addEventListener('message', on)
  }))
  check('YouTube: the stub player is playing', (await stub()).playerState === 1, JSON.stringify(await stub()))
  await toEnd()
  await h.keyboard.type('Gravity'); await wait(500)
  check('YouTube: typing pauses it', (await stub()).playerState === 2, JSON.stringify(await stub()))
  check('YouTube: the new line starts with the time', /^\[4:0\d\] Gravity$/.test(await lastLine()), await lastLine())
  await wait(2600)
  check('YouTube: plays on after the typing stops', (await stub()).playerState === 1, JSON.stringify(await stub()))
  await c.both(`${shots}/video-type-pause`)
  // The switch on the block turns it off for every note.
  await h.locator('[data-open] [data-type-pause]').click(); await wait(300)
  await toEnd()
  await h.keyboard.type('Plain'); await wait(500)
  check('switched off: typing leaves it playing', (await stub()).playerState === 1, JSON.stringify(await stub()))
  check('switched off: no time stamped', (await lastLine()) === 'Plain', await lastLine())
  check('the switch is remembered as the setting', (await v('settings')).typePause === false, '')
} catch (error) {
  check('the run finished', false, error.message.split('\n')[0])
} finally {
  await c.close?.()
}
done()
