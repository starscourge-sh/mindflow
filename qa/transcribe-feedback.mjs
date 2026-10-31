// A long transcription is never a silent wait: under the recording the orb
// says how long it has listened against the recording's length ("Listening…
// 0:02 of 0:05"), ticking, bare (no chip around it), and the window's edge
// pulses (the beam) while it runs. Main's handler is stood in for, so the
// wait is a known length and no speech is needed.
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/transcribe-feedback.mjs
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const { check, done } = checks()
const shots = process.env.QA_SHOTS ?? '/tmp'
const folder = mkdtempSync(join(tmpdir(), 'hal-feedback-'))
const fox = join(folder, 'fox.m4a')
execFileSync('say', ['-o', fox, '--data-format=aac', 'The quick brown fox jumps over the lazy dog. Then it runs into the woods.'])

const c = await sandbox({ width: 1300, height: 860 })
const { h, v, electron } = c
const wait = (ms) => h.waitForTimeout(ms)
const EDITOR = '[data-open] .tiptap'
try {
  await v('settings:set', { sounds: false, hintRate: 0 })
  await electron.evaluate(({ ipcMain }) => {
    ipcMain.removeHandler('haligtree:transcribe')
    ipcMain.handle('haligtree:transcribe', () => new Promise((resolve) => setTimeout(() => resolve({ segments: [{ text: 'The quick brown fox.', start: 0.4, end: 2 }], text: 'The quick brown fox.', onDevice: true }), 4500)))
  })
  const bytes = [...readFileSync(fox)]
  const id = await v('article:new')
  const src = await h.evaluate((bytes) => window.api.saveFile('Voice note 31 Oct 15.51.m4a', new Uint8Array(bytes)), bytes)
  await v('item:save', id, { title: 'Spoken', body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Before' }] }, { type: 'attachment', attrs: { src, name: 'Voice note 31 Oct 15.51.m4a', size: bytes.length, duration: 5.2 } }, { type: 'paragraph', content: [{ type: 'text', text: 'After' }] }] } })
  await c.send('article', id); await wait(1500)
  await h.evaluate(() => { window.__waits = []; window.addEventListener('haligtree:beam-wait', (event) => window.__waits.push(event.detail)) })
  await h.click(`${EDITOR} .tiptap-attachment.is-audio .tiptap-attachment-name`, { button: 'right', force: true }); await wait(500)
  await h.click('.tiptap-block-menu [data-transcribe]')
  await h.waitForSelector('.tiptap-attachment-listening', { timeout: 4000 }).catch(() => {})
  const first = await h.evaluate(() => document.querySelector('.tiptap-attachment-listening')?.innerText.trim() ?? '')
  await wait(2200)
  const later = await h.evaluate(() => document.querySelector('.tiptap-attachment-listening')?.innerText.trim() ?? '')
  const look = await h.evaluate(() => { const pill = document.querySelector('.tiptap-attachment-listening .mf-orb-pill'); const css = pill && getComputedStyle(pill); return css && { background: css.backgroundColor, shadow: css.boxShadow } })
  await h.screenshot({ path: `${shots}/transcribe-feedback-light.png` })
  await c.look('midnight'); await wait(300)
  await h.screenshot({ path: `${shots}/transcribe-feedback-dark.png` })
  await c.look('light')
  check('it says how long it has listened, against the recording\'s length', /^Listening… 0:0\d of 0:05$/.test(first), first)
  check('the time ticks on while it listens', later !== first && /^Listening… 0:0[2-4] of 0:05$/.test(later), `${first} → ${later}`)
  check('the orb and its words are bare, no chip around them', look && /rgba\(0, 0, 0, 0\)|transparent/.test(look.background) && look.shadow === 'none', JSON.stringify(look))
  check('the window\'s edge pulses while it listens', (await h.evaluate(() => window.__waits)).some((n) => n > 0), JSON.stringify(await h.evaluate(() => window.__waits)))
  await h.waitForFunction((sel) => /\[0:00\]/.test(document.querySelector(sel).textContent), EDITOR, { timeout: 15000 }).catch(() => {})
  await wait(400)
  check('once the words are in, the clock is gone and the pulse ends', !(await h.$('.tiptap-attachment-listening')) && (await h.evaluate(() => window.__waits.at(-1))) === 0, JSON.stringify(await h.evaluate(() => window.__waits)))
  check('no page errors', c.errors.filter((one) => !/favicon|ERR_/.test(one)).length === 0, c.errors.join(' | ').slice(0, 300))
} catch (error) {
  check('ran without throwing', false, String(error?.stack ?? error).split('\n')[0])
} finally {
  await c.close?.()
  rmSync(folder, { recursive: true, force: true })
  done()
}
