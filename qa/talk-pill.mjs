// Talk to type shows a pill while it listens: × drops the words, the voice's
// level as bars, ✓ keeps them, centred on the note. The bars follow the
// helper's levels; an older helper that sends none leaves them resting flat
// and everything else working. The helper itself is stood in for here (no
// microphone, no speech): main's dictate:start answers at once and the probe
// sends the helper's lines as main would.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/talk-pill.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const { check, done } = checks()
const c = await sandbox({ width: 1400, height: 900 })
const { h, v, electron } = c
const wait = (ms) => h.waitForTimeout(ms)
const shots = process.env.QA_SHOTS ?? '/tmp'
const EDITOR = '[data-open] .tiptap'
const line = (payload) => electron.evaluate(({ BrowserWindow }, one) => BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().includes('view=home'))?.webContents.send('dictate:line', one), payload)
const pill = () => h.evaluate((sel) => {
  const el = document.querySelector('[data-talk-pill]')
  if (!el) return null
  const r = el.getBoundingClientRect()
  const note = document.querySelector(sel).getBoundingClientRect()
  // The level is drawn (recorder-bar.tsx): each column's inked height, in CSS pixels.
  const canvas = el.querySelector('[data-voice-level]')
  const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data
  const bars = []
  for (let x = 0; x < canvas.width; x += 1) { let tall = 0; for (let y = 0; y < canvas.height; y += 1) if (data[(y * canvas.width + x) * 4 + 3] > 40) tall += 1; bars.push(Math.round(tall / devicePixelRatio)) }
  return { h: Math.round(r.height), middle: Math.round(r.left + r.width / 2), note: Math.round(note.left + note.width / 2), tallest: Math.max(...bars), flat: bars.every((b) => b <= 2), cancel: !!el.querySelector('[aria-label="Cancel"]'), keep: !!el.querySelector('[aria-label="Keep the words"]') }
}, EDITOR)
const words = () => h.evaluate((sel) => document.querySelector(sel).editor.getText(), EDITOR)

try {
  await v('settings:set', { sounds: false, hintRate: 0, talkToType: true, talkKey: 'alt-space', talkTaps: true })
  await electron.evaluate(({ ipcMain }) => {
    for (const one of ['haligtree:mic:ask', 'haligtree:dictate:start', 'haligtree:dictate:stop', 'haligtree:dictate:cancel']) ipcMain.removeHandler(one)
    ipcMain.handle('haligtree:mic:ask', () => true)
    ipcMain.handle('haligtree:dictate:start', () => ({ ok: true }))
    ipcMain.handle('haligtree:dictate:stop', () => undefined)
    ipcMain.handle('haligtree:dictate:cancel', () => undefined)
  })
  const id = await v('article:new')
  await v('item:save', id, { title: 'Talked', body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Before ' }] }] } })
  await c.send('article', id); await wait(1400)
  await h.click(EDITOR); await h.keyboard.press('Meta+ArrowDown'); await wait(300)

  // An older helper: words, no levels.
  await h.keyboard.press('Alt+Space'); await wait(400)
  await line({ ready: { onDevice: true } }); await line({ partial: { text: 'the guilds' } }); await wait(300)
  const old = await pill()
  check('listening shows the pill: ×, the bars and ✓', !!old && old.cancel && old.keep, JSON.stringify(old))
  check('an older helper sends no levels: the bars rest flat', !!old && old.flat, JSON.stringify(old))
  check('the pill is centred on the note and 32 tall', !!old && Math.abs(old.middle - old.note) <= 2 && old.h === 32, JSON.stringify(old))
  await h.click('[data-talk-pill] [aria-label="Keep the words"]'); await line({ final: { text: 'the guilds' } }); await wait(500)
  check('✓ keeps the words in the note', /Before the guilds/.test(await words()) && !(await pill()), await words())

  // A new helper: levels about 20 a second.
  await h.keyboard.press('Alt+Space'); await wait(400)
  await line({ ready: { onDevice: true } })
  for (const level of [0.02, 0.1, 0.25, 0.3, 0.18, 0.05]) { await line({ level }); await wait(50) }
  await line({ partial: { text: 'Venice' } }); await wait(200)
  const live = await pill()
  check('the bars follow the helper\'s levels', !!live && live.tallest >= 12 && !live.flat, JSON.stringify(live))
  for (const name of ['light', 'dark']) { await c.look(name); await wait(300); await h.screenshot({ path: `${shots}/talk-pill-${name}.png` }) }
  await c.look('light')
  await h.click('[data-talk-pill] [aria-label="Cancel"]'); await wait(500)
  check('× drops the words and the pill goes', !/Venice/.test(await words()) && !(await pill()), await words())
} catch (error) {
  check('ran without throwing', false, String(error?.stack ?? error))
} finally {
  await c.close?.()
  done()
}
