// "Pause the video while I type" against the real YouTube player (needs the network), not a stub:
// play a real video in a note, type, and read what the player itself reports.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/youtube-real-pause.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const { check, done } = checks()
const c = await sandbox({ width: 1400, height: 900 })
const { h, v } = c
const wait = (ms) => h.waitForTimeout(ms)
const shots = process.env.QA_SHOTS ?? '/tmp'
const p = (text) => ({ type: 'paragraph', content: text ? [{ type: 'text', text }] : [] })
const ed = (fn) => h.evaluate((fn) => new Function('ed', `return (${fn})(ed)`)(document.querySelector('[data-open] .tiptap').editor), fn.toString())
const lastLine = () => ed((e) => { let t = ''; e.state.doc.forEach((n) => (t = n.textContent)); return t })
// What the real player says of itself, asked fresh each time.
const said = () => h.evaluate(() => new Promise((done) => {
  const frame = document.querySelector('[data-open] [data-youtube-video] iframe')
  if (!frame) return done(null)
  const on = (e) => { if (e.source !== frame.contentWindow) return; try { const d = JSON.parse(e.data); if (d.event === 'infoDelivery' && d.info && 'playerState' in d.info) { removeEventListener('message', on); done(d.info) } } catch {} }
  addEventListener('message', on)
  frame.contentWindow.postMessage(JSON.stringify({ event: 'listening', id: 1, channel: 'widget' }), '*')
  setTimeout(() => (removeEventListener('message', on), done({ silent: true })), 4000)
}))
try {
  await v('settings:set', { sounds: false, hintRate: 0, typePause: true })
  const yt = await v('article:new')
  await v('item:save', yt, { title: 'Lecture', body: { type: 'doc', content: [{ type: 'youtube', attrs: { src: 'https://www.youtube.com/watch?v=jNQXAC9IVRw' } }, p('Notes:')] } })
  await c.send('article', yt); await wait(1500)
  await h.locator('[data-open] .mf-video-play').click()
  let state = null
  for (let i = 0; i < 20 && state?.playerState !== 1; i++) { await wait(750); state = await said() }
  // Where the player frame ended up, so a blocked network (YouTube's "sorry" page) reads as that, not as a broken switch.
  const frames = await c.electron.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().flatMap((w) => w.webContents.mainFrame.framesInSubtree.map((f) => f.url)).filter((u) => /youtube|google/.test(u)))
  check('the real player plays', state?.playerState === 1, `${JSON.stringify(state)} frames: ${frames.join(' ')}`)
  await ed((e) => { const end = e.state.doc.content.size; e.chain().focus().insertContentAt(end, { type: 'paragraph' }).setTextSelection(end + 1).run() })
  await wait(200)
  await h.keyboard.type('Elephants'); await wait(800)
  state = await said()
  check('typing pauses the real player', state?.playerState === 2, JSON.stringify(state))
  check('the new line starts with the time', /^\[0:\d\d\] Elephants$/.test(await lastLine()), await lastLine())
  await c.both?.(`${shots}/youtube-real-pause`)
  await wait(2800)
  state = await said()
  check('it plays on two seconds after the typing stops', state?.playerState === 1, JSON.stringify(state))
} catch (error) {
  check('the run finished', false, error.message.split('\n')[0])
} finally {
  await c.close?.()
}
done()
