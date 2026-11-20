// The recorder bar and the one sound player. Quick capture: the bar grows out of the mic over the footer's row,
// under the words (which stay in sight), from the mic and from "/record" alike, its level a waveform growing in from
// the right. A note: the bar floats at the bottom, centred on the note, clear of the line being written. The player
// draws the file's own waveform (bars that follow the sound, different for two files), a click at 60% plays from
// about 60%, dragging the playhead seeks, the played part is ink and the rest faint, speed steps 1×, 1.5×, 2×, the keys
// move it, and the same player shows in a note, quick capture and Media. Silent: generated tones and Chromium's
// stand-in microphone, never the real one.
//   QA_ARGS=--sandbox QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/voice-player.mjs
import { checks } from './harness.mjs'
import { sandbox, CALM_HOUR } from './sandbox-lib.mjs'
import { toneFile } from './tone.mjs'
process.env.QA_ARGS = `${process.env.QA_ARGS ?? '--sandbox'} --use-fake-device-for-media-stream --use-fake-ui-for-media-stream --autoplay-policy=no-user-gesture-required`

const { check, done } = checks()
const c = await sandbox({ width: 1200, height: 820, at: CALM_HOUR })
const { page, h, v } = c
const wait = (ms) => h.waitForTimeout(ms)
const EDITOR = '[data-open] .tiptap:not(.is-line):not(.is-plain)'
const rect = (el) => { const r = el.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height } }
const overlaps = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top
const save = (target, b64, name) => target.evaluate(([b64, name]) => window.api.saveFile(name, Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0))), [b64, name])

// Where the bar is, against the words and the footer row (or the note), and how its level is drawn.
const barState = (target, scope) => target.evaluate((scope) => {
  const box = (el) => { const r = el.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height } }
  const bar = document.querySelector('[data-voice-recorder]')
  if (!bar) return null
  const words = [...document.querySelectorAll(`${scope} p`)].filter((p) => p.textContent.trim()).map((p) => { const range = document.createRange(); range.selectNodeContents(p); return box(range) })
  const row = document.querySelector('main[data-chrome]')
  const canvas = bar.querySelector('[data-voice-level]')
  const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data
  // Which columns hold a bar (ink taller than the faint line through the middle): the newest are at the right.
  const inked = []
  for (let x = 0; x < canvas.width; x += 1) { let tall = 0; for (let y = 0; y < canvas.height; y += 1) if (data[(y * canvas.width + x) * 4 + 3] > 40) tall += 1; if (tall > 3 * devicePixelRatio) inked.push(x) }
  return { bar: box(bar), placed: bar.dataset.recorderBar, words, wordsShown: words.length > 0 && words.every((w) => w.height > 0), row: row && box(row), width: canvas.width, inked: inked.length, rightmost: inked.at(-1) ?? -1, leftmost: inked[0] ?? -1 }
}, scope)
// The player's facts: its bars, the played share, the colours, its parts.
const playerState = (target, sel) => target.evaluate((sel) => {
  const player = document.querySelector(sel)
  if (!player) return null
  const bars = [...player.querySelectorAll('[data-wave] > .mf-sound-bars rect')].map((r) => Math.round(Number(r.getAttribute('height')) * 10) / 10)
  const xs = [...player.querySelectorAll('[data-wave] > .mf-sound-bars rect')].slice(0, 3).map((r) => Number(r.getAttribute('x')))
  const audio = player.querySelector('audio')
  const alpha = (color) => { const m = color.match(/[\d.]+/g); return color.startsWith('rgba') || color.includes('/') ? Number(m.at(-1)) : 1 }
  const base = player.querySelector('[data-wave] > .mf-sound-bars rect')
  const ink = player.querySelector('.mf-sound-played rect')
  return {
    bars, step: xs[1] - xs[0], at: (player.querySelector('[data-playhead]').getBoundingClientRect().left + 1 - player.querySelector('[data-wave]').getBoundingClientRect().left) / player.querySelector('[data-wave]').getBoundingClientRect().width,
    time: audio.currentTime, duration: audio.duration, rate: audio.playbackRate, speed: player.querySelector('[data-speed]').textContent,
    faint: base && alpha(getComputedStyle(base).fill), ink: ink && alpha(getComputedStyle(ink).fill),
    parts: ['[data-sound-play]', '[data-wave]', '[data-playhead]', '[data-sound-time]', '[data-speed]'].filter((one) => player.querySelector(one)),
    stock: player.querySelectorAll('input[type=range], audio[controls]').length, volume: player.querySelectorAll('[aria-label^="Sound o"]').length,
    shown: player.querySelector('[data-sound-time]').textContent
  }
}, sel)
const spread = (list) => { const mean = list.reduce((a, b) => a + b, 0) / (list.length || 1); return Math.sqrt(list.reduce((a, b) => a + (b - mean) ** 2, 0) / (list.length || 1)) }

try {
  await v('settings:set', { sounds: false, hintRate: 0, rotCount: 0 })

  // 1. Quick capture, from its mic.
  await page.evaluate(() => window.api.showPrompt())
  await wait(1500)
  await page.click('.ProseMirror')
  await page.keyboard.type('Thoughts on the Krebs cycle lecture', { delay: 10 })
  await page.click('[data-record-button]'); await wait(450)
  // Every frame of the bar's outline from the moment it shows: it should start as the mic's circle, where the mic is.
  const mic = await page.evaluate(() => { const r = document.querySelector('[data-record-button]').getBoundingClientRect(); return r.left + r.width / 2 })
  await page.evaluate(() => {
    window.__clips = []
    const watch = new MutationObserver(() => {
      const bar = document.querySelector('[data-voice-recorder]')
      if (!bar) return
      watch.disconnect()
      const end = performance.now() + 450
      const step = () => { const r = bar.getBoundingClientRect(); window.__clips.push({ clip: getComputedStyle(bar).clipPath, left: r.left, width: r.width }); if (performance.now() < end) requestAnimationFrame(step) }
      step()
    })
    watch.observe(document.body, { childList: true, subtree: true })
  })
  await page.click('[data-shot="record"]')
  await page.waitForSelector('[data-voice-recorder]', { timeout: 6000 }).catch(() => {})
  await wait(500)
  // The first bar: Chromium's stand-in microphone beeps once a second.
  for (let i = 0; i < 15 && !((await barState(page, '.ProseMirror'))?.inked > 0); i += 1) await wait(100)
  const grow = await page.evaluate(() => window.__clips)
  const inset = (one) => { const m = one?.clip.match(/inset\(0px ([\d.]+)px 0px ([\d.]+)px/); return m ? { right: Number(m[1]), left: Number(m[2]) } : null }
  const first = inset(grow[0])
  const firstMiddle = first && grow[0].left + first.left + (grow[0].width - first.left - first.right) / 2
  check('from the mic, the bar grows out of the mic: first a circle on it, then the whole row', !!first && Math.abs(firstMiddle - mic) <= 3 && grow[0].width - first.left - first.right <= 34 && /none|inset\(0px round/.test(grow.at(-1).clip), JSON.stringify({ mic, firstMiddle, frames: grow.length, first: grow[0]?.clip, last: grow.at(-1)?.clip }))
  const early = await barState(page, '.ProseMirror')
  await wait(1600)
  const qc = await barState(page, '.ProseMirror')
  check('quick capture: the bar takes the footer\'s row, beside the mic', !!qc && qc.placed === 'docked' && !!qc.row && Math.abs(qc.bar.top - (qc.row.top + 8)) <= 2 && qc.bar.height <= 34, JSON.stringify(qc && { bar: qc.bar, row: qc.row, placed: qc.placed }))
  check('quick capture: the words stay in sight, never under the bar', !!qc && qc.wordsShown && qc.words.every((w) => !overlaps(w, qc.bar)), JSON.stringify(qc && qc.words))
  check('the level grows in from the right', !!early && !!qc && early.rightmost > early.width * 0.9 && qc.inked > early.inked && qc.leftmost < early.leftmost, JSON.stringify(early && { early: [early.leftmost, early.rightmost, early.inked], later: [qc.leftmost, qc.rightmost, qc.inked], width: qc.width }))
  await page.keyboard.press('Meta+Enter')
  await page.waitForSelector('.ProseMirror [data-sound-player]', { timeout: 8000 }).catch(() => {})
  await wait(800)
  const qcPlayer = await playerState(page, '.ProseMirror [data-sound-player]')
  check('kept: the recording plays in quick capture in the one player', !!qcPlayer && qcPlayer.parts.length === 5, JSON.stringify(qcPlayer))

  // 2. Quick capture's "/record": the same place.
  await page.click('.ProseMirror'); await page.keyboard.press('Meta+ArrowDown'); await page.keyboard.press('Enter')
  await page.keyboard.type('/record', { delay: 30 }); await wait(500)
  await page.keyboard.press('Enter')
  await page.waitForSelector('[data-voice-recorder]', { timeout: 6000 }).catch(() => {})
  await wait(600)
  const slash = await barState(page, '.ProseMirror')
  check('"/record" in quick capture docks in the same place', !!slash && !!qc && slash.placed === 'docked' && Math.abs(slash.bar.top - qc.bar.top) <= 2 && Math.abs(slash.bar.left - qc.bar.left) <= 2, JSON.stringify({ slash: slash?.bar, mic: qc?.bar }))
  await page.keyboard.press('Escape'); await wait(500)
  await page.keyboard.press('Escape'); await wait(500)

  // 3. A note with two generated recordings.
  const one = await save(h, toneFile(6, 7).toString('base64'), 'Lecture one.wav')
  const two = await save(h, toneFile(6, 3).toString('base64'), 'Lecture two.wav')
  const id = await v('article:new')
  await v('item:save', id, { title: 'Listening', body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'What the lecturer said about it.' }] }, { type: 'attachment', attrs: { src: one, name: 'Lecture one.wav', size: 96044 } }, { type: 'paragraph', content: [{ type: 'text', text: 'And the second half.' }] }, { type: 'attachment', attrs: { src: two, name: 'Lecture two.wav', size: 96044 } }, { type: 'paragraph' }] } })
  await c.send('article', id); await wait(1800)
  const FIRST = `${EDITOR} .tiptap-attachment:nth-of-type(1) [data-sound-player]`
  const players = await h.$$(`${EDITOR} [data-sound-player]`)
  const a = await h.evaluate((sel) => [...document.querySelectorAll(`${sel} [data-sound-player]`)].map((p) => [...p.querySelectorAll('[data-wave] > .mf-sound-bars rect')].map((r) => Number(r.getAttribute('height')))), EDITOR)
  check('the player draws the file\'s own waveform: bars that vary with the sound', players.length === 2 && a[0].length > 30 && spread(a[0]) > 2 && new Set(a[0].map((x) => Math.round(x))).size > 6, JSON.stringify(a[0]?.slice(0, 40)))
  check('two files, two waveforms (not a fixed pattern)', a.length === 2 && a[0].length === a[1].length && a[0].some((x, i) => Math.abs(x - a[1][i]) > 3), `${a[0]?.slice(0, 12)} vs ${a[1]?.slice(0, 12)}`)
  const sel = `${EDITOR} [data-sound-player]`
  const wave = await h.$(`${sel} [data-wave]`)
  const box = await wave.boundingBox()
  await h.mouse.click(box.x + box.width * 0.6, box.y + box.height / 2)
  await wait(300)
  const clicked = await playerState(h, sel)
  check('a click at 60% across jumps to about 60%', !!clicked && Math.abs(clicked.time / clicked.duration - 0.6) < 0.03 && Math.abs(clicked.at - 0.6) < 0.03, JSON.stringify(clicked && { time: clicked.time, duration: clicked.duration, at: clicked.at }))
  check('the played part is ink, the rest faint', !!clicked && clicked.ink >= 0.95 && clicked.faint <= 0.4, JSON.stringify(clicked && { ink: clicked.ink, faint: clicked.faint }))
  await h.mouse.move(box.x + box.width * 0.6, box.y + box.height / 2); await h.mouse.down()
  for (let i = 1; i <= 7; i += 1) await h.mouse.move(box.x + box.width * (0.6 - i * 0.05), box.y + box.height / 2)
  await h.mouse.up(); await wait(300)
  const dragged = await playerState(h, sel)
  check('dragging the playhead seeks (60% to 25%)', !!dragged && Math.abs(dragged.time / dragged.duration - 0.25) < 0.03, JSON.stringify(dragged && { time: dragged.time, at: dragged.at }))
  const speeds = []
  for (let i = 0; i < 3; i += 1) { await h.click(`${sel} [data-speed]`); await wait(150); const s = await playerState(h, sel); speeds.push(`${s.speed.slice(0, s.speed.indexOf('×') + 1)}=${s.rate}`) }
  check('speed steps 1.5×, 2×, then back to 1×', speeds.join(' ') === '1.5×=1.5 2×=2 1×=1', speeds.join(' '))
  await h.focus(`${sel} [data-wave]`)
  const before = (await playerState(h, sel)).time
  await h.keyboard.press('ArrowRight'); await wait(200)
  const after = (await playerState(h, sel)).time
  check('→ on the waveform moves it on five seconds, not the caret', Math.abs(after - Math.min(before + 5, 6)) < 0.2, `${before} -> ${after}`)
  await h.keyboard.press('Home'); await wait(150)
  await h.keyboard.press(' '); await wait(1300)
  const played = await playerState(h, sel)
  check('Space on it plays, and the time on the right counts up', !!played && played.time > 1 && played.shown === '0:01', JSON.stringify(played && { time: played.time, shown: played.shown }))
  await h.keyboard.press(' '); await wait(200)
  const note = await playerState(h, sel)
  check('no stock slider and no volume button', note.stock === 0 && note.volume === 0, JSON.stringify(note))

  // A press on the player between its controls picks the block, as any block: then ⌫ takes it away and ⌘Z brings it back.
  const count = () => h.evaluate((sel) => document.querySelectorAll(`${sel} [data-sound-player]`).length, EDITOR)
  await h.click(`${sel} .mf-sound-name`); await wait(300)
  const picked = await h.evaluate((sel) => { const { selection } = document.querySelector(sel).editor.state; return selection.node?.type.name ?? null }, EDITOR)
  await h.keyboard.press('Backspace'); await wait(300)
  const gone = await count()
  await h.keyboard.press('Meta+z'); await wait(400)
  check('a press on its name picks the recording; ⌫ removes it and ⌘Z brings it back', picked === 'attachment' && gone === 1 && (await count()) === 2, JSON.stringify({ picked, gone, back: await count() }))

  // 4. A note's own recorder floats at the bottom, centred on the note, clear of the line written into, in a long
  // note too, written at its very end.
  const long = await v('article:new')
  await v('item:save', long, { title: 'A long lecture', body: { type: 'doc', content: Array.from({ length: 60 }, (_, i) => ({ type: 'paragraph', content: [{ type: 'text', text: `Line ${i + 1} of what was said in the lecture about the cycle.` }] })) } })
  await c.send('article', long); await wait(1600)
  // The note's last paragraph, not its last child: the editor ends with a block of its own after the words.
  await h.click(`${EDITOR} > p:last-of-type`); await h.keyboard.press('Meta+ArrowDown'); await h.keyboard.press('Enter')
  await h.keyboard.type('/record', { delay: 30 }); await wait(500)
  await h.keyboard.press('Enter')
  await h.waitForSelector('[data-voice-recorder]', { timeout: 6000 }).catch(() => {})
  await wait(800)
  const floating = await h.evaluate((sel) => {
    const bar = document.querySelector('[data-voice-recorder]').getBoundingClientRect()
    const note = document.querySelector(sel).getBoundingClientRect()
    // The line the recording goes into: the caret's block (an empty line has no caret box of its own).
    const node = getSelection().anchorNode
    const caret = (node.nodeType === 1 ? node : node.parentElement).closest('p, li, h1, h2, h3').getBoundingClientRect()
    return { placed: document.querySelector('[data-voice-recorder]').dataset.recorderBar, middle: Math.round(bar.left + bar.width / 2), note: Math.round(note.left + note.width / 2), bar: { top: bar.top, bottom: bar.bottom }, caret: { top: caret.top, bottom: caret.bottom }, window: innerHeight }
  }, EDITOR)
  check('a note\'s recorder floats at the bottom, centred on the note, clear of the caret\'s line', floating.placed === 'floating' && floating.caret.bottom > 0 && Math.abs(floating.middle - floating.note) <= 2 && floating.bar.bottom > floating.window - 160 && (floating.caret.bottom <= floating.bar.top || floating.caret.top >= floating.bar.bottom), JSON.stringify(floating))
  await h.keyboard.press('Escape'); await wait(600)

  // 5. Media: the same player, playing in place without opening its note.
  await c.go('media'); await wait(1500)
  const media = await playerState(h, '[data-media="audio"] [data-sound-player]')
  check('Media\'s recordings wear the same player', !!media && media.parts.length === 5 && media.step === note.step && media.bars.length > 20, JSON.stringify(media && { parts: media.parts, step: media.step, bars: media.bars.length }))
  const tile = await h.$('[data-media="audio"] [data-wave]')
  const tb = await tile.boundingBox()
  await h.mouse.click(tb.x + tb.width * 0.5, tb.y + tb.height / 2); await wait(600)
  const stayed = await h.evaluate(() => !document.querySelector('[data-open] .tiptap:not(.is-line):not(.is-plain)') && !!document.querySelector('[data-media="audio"]'))
  const mediaAt = await playerState(h, '[data-media="audio"] [data-sound-player]')
  check('clicking a tile\'s waveform seeks there and does not open the note', stayed && Math.abs(mediaAt.time / mediaAt.duration - 0.5) < 0.05, JSON.stringify({ stayed, time: mediaAt?.time }))

  // 6. A card's sound (an Anki card's [sound:...]) plays in the same player in Review, not as raw text.
  await v('cards:list', [{ term: 'Which bird calls like this?', meaning: `[Bell call.wav](${one}) #birds` }])
  await v('tag:set', 'birds', { deck: true })
  await c.go('review', ':decks'); await wait(1500)
  // A new deck's one card: opened from its stack and learnt, then turned over.
  await h.click('text=Birds'); await wait(1200)
  await (await h.$('text=/Learn 1/'))?.click(); await wait(1200)
  await h.keyboard.press('Space'); await wait(800)
  const card = await playerState(h, '[data-sound-player]')
  const raw = await h.evaluate(() => document.body.innerText.includes('haligtree://assets'))
  check('a card\'s sound plays in the same player in Review, never as raw text', !!card && card.parts.length === 5 && card.step === note.step && !raw, JSON.stringify(card && { parts: card.parts, raw }))
} catch (error) {
  check('the run finished', false, error.message.split('\n').slice(0, 12).join(' | '))
} finally {
  await c.close()
}
done()
