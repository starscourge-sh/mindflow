// A voice note: /Record in a note shows the recorder bar (a live waveform from the right, the time,
// Stop), Esc throws it away, Stop keeps it as an audio block in the note.
// Chromium's stand-in microphone, for this probe only.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-small/main/index.js HALIGTREE_QA_AWAY=1 node qa/audio-record.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS = `${process.env.QA_ARGS ?? '--sandbox'} --use-fake-device-for-media-stream --use-fake-ui-for-media-stream`

const { check, done } = checks()
const c = await sandbox({ width: 1400, height: 900 })
const { h, v } = c
const wait = (ms) => h.waitForTimeout(ms)
const EDITOR = '[data-open] .tiptap'
const shots = process.env.QA_SHOTS ?? '/tmp'
const audioBlocks = () => h.evaluate((sel) => {
  const out = []
  document.querySelector(sel).editor.state.doc.descendants((node) => void (node.type.name === 'attachment' && out.push(node.attrs)))
  return out
}, EDITOR)
const slash = async () => {
  await h.click(EDITOR); await h.keyboard.press('Meta+ArrowDown'); await h.keyboard.press('Enter')
  await h.keyboard.type('/record', { delay: 40 }); await wait(500)
  await h.keyboard.press('Enter')
  await h.waitForSelector('[data-voice-recorder]', { timeout: 6000 }).catch(() => {})
}

try {
  await v('settings:set', { sounds: false, hintRate: 0 })
  const id = await v('article:new')
  await v('item:save', id, { title: 'Spoken', body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Before' }] }] } })
  await c.send('article', id); await wait(1400)

  await slash()
  check('/Record shows the recorder', !!(await h.$('[data-voice-recorder]')), '')
  await wait(1600)
  const live = await h.evaluate(() => {
    const canvas = document.querySelector('[data-voice-level]')
    const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data
    let inked = 0
    for (let i = 3; i < data.length; i += 4) if (data[i] > 0) inked++
    return { inked, time: document.querySelector('[data-voice-time]').textContent }
  })
  check('the level is drawn as it records', live.inked > 50, JSON.stringify(live))
  check('the time counts up', /^0:0[1-9]$/.test(live.time), live.time)
  // The level is a waveform moving in from the right, as Voice Memos draws it: over two seconds of the stand-in
  // microphone's beeps, its bars (ink taller than the faint line through quiet) reach further left as they pass,
  // and the newest stand at the right edge.
  const flow = await h.evaluate(async () => {
    const canvas = document.querySelector('[data-voice-level]')
    const bars = () => {
      const { width, height } = canvas
      const data = canvas.getContext('2d').getImageData(0, 0, width, height).data
      const xs = []
      for (let x = 0; x < width; x += 1) { let tall = 0; for (let y = 0; y < height; y += 1) if (data[(y * width + x) * 4 + 3] > 40) tall += 1; if (tall > 3 * devicePixelRatio) xs.push(x) }
      return { left: xs[0] ?? width, right: xs.at(-1) ?? -1, width }
    }
    const first = bars()
    await new Promise((done) => setTimeout(done, 2000))
    return { first, later: bars() }
  })
  check('the level grows in from the right and moves left', flow.later.left < flow.first.left && flow.later.right > flow.later.width * 0.85, JSON.stringify(flow))
  // One family with quick capture's round controls: their 32px height, the page's paper and a hairline.
  const pill = await h.evaluate(() => {
    const el = document.querySelector('[data-voice-recorder]')
    const s = getComputedStyle(el)
    return { h: Math.round(el.getBoundingClientRect().height), fill: s.backgroundColor, page: getComputedStyle(document.body).backgroundColor, ring: s.boxShadow.includes('0px 0px 0px 1px') }
  })
  // Centred on the note it writes into, not the window (the list beside the note pulled it left).
  const centred = await h.evaluate((sel) => {
    const pill = document.querySelector('[data-voice-recorder]').getBoundingClientRect()
    const note = document.querySelector(sel).getBoundingClientRect()
    return { pill: Math.round(pill.left + pill.width / 2), note: Math.round(note.left + note.width / 2), window: Math.round(innerWidth / 2) }
  }, EDITOR)
  check('the pill is centred on the note, not the window', Math.abs(centred.pill - centred.note) <= 2, JSON.stringify(centred))
  check('the recorder pill is 32 tall, in the page\'s paper with a hairline', pill.h === 32 && pill.ring, JSON.stringify(pill))
  await h.screenshot({ path: `${shots}/audio-record-live.png` })
  await h.keyboard.press('Escape'); await wait(800)
  check('Esc closes the recorder', !(await h.$('[data-voice-recorder]')), '')
  check('Esc keeps nothing', (await audioBlocks()).length === 0, JSON.stringify(await audioBlocks()))

  await slash(); await wait(1500)
  await h.click('[data-voice-recorder] button[aria-label="Stop and keep"]')
  // Kept: for a moment the pill stays, its stop a tick, its bars settling; then it goes.
  const settling = await h.evaluate(() => ({ pill: !!document.querySelector('[data-voice-recorder]'), tick: !!document.querySelector('[data-voice-recorder] [data-kept]') }))
  check('kept, the pill stays a moment with a tick in place of the stop', settling.pill && settling.tick, JSON.stringify(settling))
  await h.waitForSelector(`${EDITOR} .tiptap-attachment.is-audio`, { timeout: 8000 }).catch(() => {})
  await wait(800)
  const kept = await audioBlocks()
  check('Stop keeps it in the note as an audio block', kept.length === 1 && /^haligtree:\/\/assets\/.+\.(m4a|weba)$/.test(kept[0].src) && /^Voice note /.test(kept[0].name), JSON.stringify(kept))
  check('the recorder is gone after Stop', !(await h.$('[data-voice-recorder]')), '')
  const plays = await h.evaluate(async (sel) => {
    const audio = document.querySelector(`${sel} .tiptap-attachment.is-audio audio`)
    if (!audio) return -1
    if (audio.readyState < 1) await new Promise((r) => (audio.onloadedmetadata = r, setTimeout(r, 3000)))
    return audio.duration
  }, EDITOR)
  check('the recording plays back with a length', plays > 0, String(plays))
  await h.screenshot({ path: `${shots}/audio-record-kept.png` })

  // ⌘K offers it too, as a new capture.
  await h.keyboard.press('Escape'); await h.keyboard.press('Meta+KeyK'); await wait(600)
  await h.keyboard.type('record a voice', { delay: 30 }); await wait(600)
  check('⌘K offers “Record a voice note”', /Record a voice note/.test(await h.evaluate(() => document.body.innerText)), '')
  await h.keyboard.press('Escape')
} catch (error) {
  check('ran without throwing', false, String(error?.stack ?? error))
} finally {
  await c.close?.()
  done()
}
