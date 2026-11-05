// Films the recorder and the player for the eye: quick capture's recorder (from its mic and from "/record"), a
// note's recorder, then a recording playing, seeking and dragging, in light and dark, Satin and Paper. A frame
// every 50ms through each change, into QA_SHOTS. Silent: Chromium's stand-in microphone, and the window is muted.
//   QA_SHOTS=/abs/dir QA_ARGS=--sandbox QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/voice-frames.mjs
import { sandbox, CALM_HOUR } from './sandbox-lib.mjs'
import { writeFileSync } from 'node:fs'
import { toneFile } from './tone.mjs'
process.env.QA_ARGS = `${process.env.QA_ARGS ?? '--sandbox'} --use-fake-device-for-media-stream --use-fake-ui-for-media-stream --autoplay-policy=no-user-gesture-required`

const shots = process.env.QA_SHOTS
if (!shots) throw new Error('QA_SHOTS: an absolute folder for the frames')
const c = await sandbox({ width: 1200, height: 820, at: CALM_HOUR })
const { page, h, v } = c
const wait = (ms) => h.waitForTimeout(ms)
const EDITOR = '[data-open] .tiptap'
/**
 * Frames of `target` while `act` runs and for `ms` after, at most one per 50ms, as Chromium paints them (a screencast:
 * a screenshot each takes longer than the motion), named `name-00.png`...
 */
const film = async (target, name, act, ms = 700) => {
  const cdp = await target.context().newCDPSession(target)
  const frames = []
  cdp.on('Page.screencastFrame', ({ data, sessionId, metadata }) => { frames.push({ data, at: metadata.timestamp * 1000 }); cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {}) })
  await cdp.send('Page.startScreencast', { format: 'png', everyNthFrame: 1 })
  await target.waitForTimeout(150)
  const began = Date.now()
  await act()
  await target.waitForTimeout(Math.max(0, ms - (Date.now() - began)))
  await cdp.send('Page.stopScreencast')
  await cdp.detach()
  let last = -Infinity, n = 0
  for (const one of frames) {
    if (one.at - last < 50) continue
    last = one.at
    writeFileSync(`${shots}/${name}-${String(n++).padStart(2, '0')}.png`, Buffer.from(one.data, 'base64'))
  }
  return n
}
const looks = async (target, name) => {
  for (const theme of ['paper', 'dark']) for (const finish of ['satin', 'paper']) {
    await v('settings:set', { reviewFinish: finish })
    await target.evaluate((n) => { localStorage.setItem('theme', n); window.dispatchEvent(new StorageEvent('storage', { key: 'theme' })) }, theme)
    await target.waitForTimeout(500)
    await target.screenshot({ path: `${shots}/${name}-${theme === 'paper' ? 'light' : 'dark'}-${finish}.png` })
  }
  await target.evaluate(() => { localStorage.setItem('theme', 'paper'); window.dispatchEvent(new StorageEvent('storage', { key: 'theme' })) })
  await v('settings:set', { reviewFinish: 'satin' })
}
try {
  await v('settings:set', { sounds: false, hintRate: 0, rotCount: 0 })
  // Quick capture: some words, then the mic's "Record".
  await page.evaluate(() => window.api.showPrompt())
  await wait(1500)
  await page.click('.ProseMirror')
  await page.keyboard.type('Thoughts on the Krebs cycle lecture', { delay: 10 })
  await page.click('[data-record-button]'); await wait(450)
  await film(page, 'qc-mic-start', () => page.click('[data-shot="record"]'), 900)
  await wait(1200)
  await looks(page, 'qc-mic-recording')
  await film(page, 'qc-mic-stop', () => page.click('[data-voice-recorder] [aria-label="Stop and keep"]'), 900)
  await wait(800)
  await looks(page, 'qc-player')
  // Quick capture's "/record".
  await page.click('.ProseMirror'); await page.keyboard.press('Meta+ArrowDown'); await page.keyboard.press('Enter')
  await page.keyboard.type('/record', { delay: 30 }); await wait(500)
  await film(page, 'qc-slash-start', () => page.keyboard.press('Enter'), 900)
  await page.screenshot({ path: `${shots}/qc-slash-recording.png` })
  await page.keyboard.press('Escape'); await wait(600)
  await page.keyboard.press('Escape'); await wait(600)

  // A note with a recording of a generated tone, played, clicked at 60% and dragged.
  const id = await v('article:new')
  const src = await h.evaluate(async (b64) => window.api.saveFile('Lecture tone.wav', Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0))), toneFile(6, 7).toString('base64'))
  await v('item:save', id, { title: 'Listening', body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'What the lecturer said about it.' }] }, { type: 'attachment', attrs: { src, name: 'Lecture tone.wav', size: 96000 } }, { type: 'paragraph' }] } })
  await c.send('article', id); await wait(1600)
  await looks(h, 'note-player')
  const player = await h.$(`${EDITOR} [data-sound-player], ${EDITOR} .tiptap-attachment.is-audio`)
  await player?.screenshot({ path: `${shots}/note-player-close.png` })
  await film(h, 'note-play', () => h.click(`${EDITOR} [data-sound-play], ${EDITOR} .tiptap-media-play`), 1200)
  const wave = await h.$(`${EDITOR} [data-wave], ${EDITOR} .tiptap-media-scrub`)
  const box = await wave.boundingBox()
  await film(h, 'note-seek', () => h.mouse.click(box.x + box.width * 0.6, box.y + box.height / 2), 500)
  await h.mouse.move(box.x + box.width * 0.2, box.y + box.height / 2); await h.mouse.down()
  for (let i = 1; i <= 8; i += 1) { await h.mouse.move(box.x + box.width * (0.2 + i * 0.075), box.y + box.height / 2); await player?.screenshot({ path: `${shots}/note-drag-${String(i).padStart(2, '0')}.png` }) }
  await h.mouse.up()
  // A note's own recorder.
  await h.click(EDITOR); await h.keyboard.press('Meta+ArrowDown'); await h.keyboard.press('Enter')
  await h.keyboard.type('/record', { delay: 30 }); await wait(500)
  await film(h, 'note-rec-start', () => h.keyboard.press('Enter'), 900)
  await wait(800)
  await looks(h, 'note-recording')
  await h.keyboard.press('Escape'); await wait(600)
  // Media's recordings.
  await c.go('media'); await wait(1200)
  await looks(h, 'media')
  // A card's sound in Review, both finishes, light and dark.
  await v('cards:list', [{ term: 'Which bird calls like this?', meaning: `[Bell call.wav](${src}) #birds` }])
  await v('tag:set', 'birds', { deck: true })
  await c.go('review', ':decks'); await wait(1500)
  // A new deck's one card: opened from its stack and learnt, then turned over.
  await h.click('text=Birds'); await wait(1200)
  await (await h.$('text=/Learn 1/'))?.click(); await wait(1200)
  await h.keyboard.press('Space'); await wait(800)
  await looks(h, 'review-card')
  console.log('frames in', shots)
} finally {
  await c.close()
}
