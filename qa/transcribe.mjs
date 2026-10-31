// Voice notes into words, on this Mac (native/transcribe.swift, main/transcribe.ts, lib/transcribe.ts).
// 1. The helper alone, on a short sentence macOS speaks (`say`): its words come back with times, or,
//    where speech recognition is not allowed or not on this Mac, a plain sentence saying so.
// 2. In the app: "Transcribe" (the recording's cc button) writes the words under it as lines led by
//    their time, a time plays the recording from there, the right-click menu and ⌘K offer it, and a
//    voice note made as its own capture is named by its first words. Where the Mac will not make
//    the words, the friendly message is checked, then the words are given by a stand-in for main's
//    handler, so the rest is checked all the same.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox node qa/transcribe.mjs
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'

const { check, done } = checks()
const shots = process.env.QA_SHOTS ?? '/tmp'
const HELPER = new URL('../resources/transcribe', import.meta.url).pathname
const folder = mkdtempSync(join(tmpdir(), 'haligtree-transcribe-'))
const fox = join(folder, 'fox.m4a')
execFileSync('say', ['-o', fox, '--data-format=aac', 'The quick brown fox jumps over the lazy dog. Then it runs into the woods.'])

const lines = (args) => {
  let out = ''
  try {
    out = execFileSync(HELPER, args, { encoding: 'utf8', timeout: 120_000 })
  } catch (error) {
    out = String(error.stdout ?? '')
  }
  return out.split('\n').filter(Boolean).map((one) => JSON.parse(one))
}

// --- 1. The helper ---------------------------------------------------------------
const status = lines(['--status'])[0]?.status
check('the helper says whether speech recognition is allowed', ['granted', 'denied', 'restricted', 'not-determined'].includes(status), status)
const heard = lines([fox, 'en-US'])
const real = status === 'granted' && !heard.some((one) => one.error)
if (real) {
  const segments = heard.filter((one) => one.segment).map((one) => one.segment)
  const words = segments.map((one) => one.text).join(' ').toLowerCase()
  check('the words come back', /quick brown fox/.test(words) && /lazy dog/.test(words), words)
  check('each sentence has a start and end time', segments.length >= 1 && segments.every((one) => one.end > one.start && one.start >= 0), JSON.stringify(segments))
  check('a later sentence starts later', segments.length < 2 || segments[1].start > segments[0].start, JSON.stringify(segments.map((one) => one.start)))
  check('a last line says it is done', !!heard.at(-1)?.done, JSON.stringify(heard.at(-1)))
} else {
  console.log(`  (speech recognition on this Mac: ${status}; the friendly message is checked instead)`)
  const error = heard.find((one) => one.error)?.error
  check('not allowed: says so plainly, no crash', !!error && /^[A-Z][^{}\n]+$/.test(error.message) && !/exception|nil|null/i.test(error.message), JSON.stringify(heard))
}
check('a file it cannot read: says so', lines([join(folder, '..', 'none.m4a')])[0]?.error?.code === 'missing', '')
check('a .weba or other unreadable kind: says so', lines([HELPER])[0]?.error?.code === 'unreadable', JSON.stringify(lines([HELPER])))

// --- 2. In the app -----------------------------------------------------------------
const c = await sandbox({ width: 1300, height: 860 })
const { h, v, electron } = c
const wait = (ms) => h.waitForTimeout(ms)
const EDITOR = '[data-open] .tiptap'
const doc = () => h.evaluate((sel) => document.querySelector(sel).editor.getJSON(), EDITOR)
const textOf = (node) => (node.content ?? []).map((one) => one.text ?? textOf(one)).join('')
const FAKE = [{ text: 'The quick brown fox jumps over the lazy dog.', start: 0.4, end: 3.1 }, { text: 'Then it runs into the woods.', start: 3.6, end: 5.9 }]
/** Main's handler, given the words the Mac would make, for a Mac that will not make them. */
const standIn = () => electron.evaluate(({ ipcMain }, segments) => {
  ipcMain.removeHandler('haligtree:transcribe')
  ipcMain.handle('haligtree:transcribe', () => new Promise((resolve) => setTimeout(() => resolve({ segments, text: segments.map((one) => one.text).join(' '), onDevice: true }), 1500)))
}, FAKE)
const undoButton = () => h.locator('button', { hasText: /^Undo/ }).last()
/** Its block menu (a right-click on it), then its "Transcribe": no toolbar shows on a recording. */
const transcribeFromMenu = async () => {
  await h.click(`${EDITOR} .tiptap-attachment.is-audio .tiptap-attachment-name`, { button: 'right', force: true }); await wait(500)
  await h.click('.tiptap-block-menu [data-transcribe]')
}
const toastSays = () => h.evaluate(() => [...document.querySelectorAll('[data-sonner-toast], [role=status]')].map((one) => one.textContent).join(' | '))

try {
  await v('settings:set', { sounds: false, hintRate: 0 })
  const bytes = [...readFileSync(fox)]
  const id = await v('article:new')
  const src = await h.evaluate((bytes) => window.api.saveFile('Voice note 31 Oct 15.51.m4a', new Uint8Array(bytes)), bytes)
  await v('item:save', id, { title: 'Spoken', body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Before' }] }, { type: 'attachment', attrs: { src, name: 'Voice note 31 Oct 15.51.m4a', size: bytes.length } }, { type: 'paragraph', content: [{ type: 'text', text: 'After' }] }] } })
  await c.send('article', id); await wait(1500)

  // The recording's block menu, under "Voice note", starts with "Transcribe".
  await h.click(`${EDITOR} .tiptap-attachment.is-audio .tiptap-attachment-name`, { button: 'right', force: true }); await wait(500)
  check('the recording\'s menu offers “Transcribe” first, under “Voice note”', await h.evaluate(() => document.querySelector('.tiptap-block-menu [data-kind-heading]')?.textContent === 'Voice note' && document.querySelector('.tiptap-block-menu [role=menuitem]')?.hasAttribute('data-transcribe')), '')
  await h.keyboard.press('Escape'); await wait(300)
  if (!real) {
    await transcribeFromMenu()
    await h.waitForFunction(() => /speech recognition/i.test(document.body.innerText), null, { timeout: 15000 }).catch(() => {})
    const said = await toastSays()
    check('Transcribe where the Mac will not: a plain toast says why', /speech recognition/i.test(said) && /System Settings/.test(said), said)
    check('…and nothing is written', !/\[0:00\]/.test(textOf(await doc())), '')
    await standIn()
  }
  await transcribeFromMenu()
  const orb = await h.waitForSelector('.tiptap-attachment-listening', { timeout: 4000 }).then(() => true, () => false)
  check('“Listening…” shows under it while it runs', orb, '')
  await h.waitForFunction((sel) => /\[0:0\d\]/.test(document.querySelector(sel).textContent), EDITOR, { timeout: 120000 }).catch(() => {})
  await wait(500)
  const blocks = (await doc()).content
  const at = blocks.findIndex((one) => one.type === 'attachment')
  const after = blocks.slice(at + 1).map(textOf)
  check('the words land right under the recording, each led by its time', /^\[0:00\] The quick brown fox/i.test(after[0]) && /^\[0:0\d\] Then it runs/i.test(after[1]), JSON.stringify(after))
  check('the note\'s own words stay where they were', textOf(blocks[0]) === 'Before' && after.includes('After'), JSON.stringify(after))
  check('the lines are quiet transcript lines', (await h.$$(`${EDITOR} .mf-transcript-line`)).length === 2, '')
  check('Listening… is gone once the words are in', !(await h.$('.tiptap-attachment-listening')), '')

  // Transcribe again: the recording's own words are replaced in place, never added twice; Undo puts the old ones back.
  await h.evaluate((sel) => { const ed = document.querySelector(sel).editor; let at = -1; ed.state.doc.descendants((n, p) => void (n.type.name === 'attachment' && (at = p))); const next = at + ed.state.doc.nodeAt(at).nodeSize; ed.view.dispatch(ed.state.tr.insertText(' (edited)', next + ed.state.doc.nodeAt(next).nodeSize - 1)) }, EDITOR)
  await transcribeFromMenu()
  await h.waitForFunction((sel) => !/\(edited\)/.test(document.querySelector(sel).textContent), EDITOR, { timeout: 120000 }).catch(() => {})
  await wait(500)
  const again = (await doc()).content.map(textOf)
  check('Transcribe again replaces its words in place, once', again.filter((one) => /^\[0:00\]/.test(one)).length === 1 && again.filter((one) => /^\[0:0\d\]/.test(one)).length === 2 && !again.some((one) => /edited/.test(one)) && again.at(-1) === 'After', JSON.stringify(again))
  const said = await toastSays()
  check('…saying so, with Undo', /in place of the recording's old ones/.test(said) && (await undoButton().count()) > 0, said)
  await undoButton().click().catch(() => {}); await wait(500)
  const undone = (await doc()).content.map(textOf)
  check('…and Undo puts the old words back', undone.some((one) => /\(edited\)$/.test(one)) && undone.filter((one) => /^\[0:0\d\]/.test(one)).length === 2, JSON.stringify(undone))

  // A time plays the recording from there.
  const second = (await h.$$(`${EDITOR} .mf-time-link[data-audio]`))[1]
  check('each time is a link to the recording', !!second, '')
  await second?.click(); await wait(700)
  const playing = await h.evaluate((sel) => { const a = document.querySelector(`${sel} .tiptap-attachment.is-audio audio`); return { at: a.currentTime, paused: a.paused } }, EDITOR)
  check('a time plays the recording from there', playing.at >= 3 && !playing.paused, JSON.stringify(playing))
  await h.evaluate((sel) => document.querySelector(`${sel} .tiptap-attachment.is-audio audio`).pause(), EDITOR)

  await c.look('light'); await wait(500)
  await h.screenshot({ path: `${shots}/transcribe-light.png` })
  await c.look('midnight'); await wait(600)
  await h.screenshot({ path: `${shots}/transcribe-dark.png` })
  await c.look('light')

  // The right-click menu on the recording, and on a time.
  await h.click(`${EDITOR} .tiptap-attachment.is-audio .tiptap-attachment-name`, { button: 'right', force: true }); await wait(500)
  check('right-click on a recording offers “Transcribe”', !!(await h.$('.tiptap-block-menu [data-transcribe]')), await h.evaluate(() => [...document.querySelectorAll('.tiptap-block-menu .tiptap-slash-menu-title, .tiptap-block-menu [data-kind-heading]')].map((one) => one.textContent).join(', ')))
  await h.keyboard.press('Escape'); await wait(300)
  await h.click(`${EDITOR} .mf-time-link[data-audio]`, { button: 'right' }); await wait(500)
  check('right-click on a time offers “Play from”', /Play from 0:00/.test(await h.evaluate(() => document.body.innerText)), '')
  await h.keyboard.press('Escape'); await wait(300)

  // Saved as plain words: ⌘K's search finds the note by them.
  await wait(1600)
  await h.keyboard.press('Escape'); await h.keyboard.press('Meta+KeyK'); await wait(600)
  await h.keyboard.type('lazy dog', { delay: 30 }); await wait(1200)
  check('⌘K finds the note by its words', /Spoken/.test(await h.evaluate(() => document.querySelector('[role="dialog"]')?.innerText ?? document.body.innerText)), '')
  await h.keyboard.press('Escape'); await wait(300)

  // ⌘K on a note whose recording has no words yet.
  const bare = await v('article:new')
  await v('item:save', bare, { title: 'Spoken again', body: { type: 'doc', content: [{ type: 'attachment', attrs: { src, name: 'Voice note 31 Oct 15.51.m4a', size: bytes.length } }, { type: 'paragraph' }] } })
  await c.send('article', bare); await wait(1400)
  await h.keyboard.press('Meta+KeyK'); await wait(600)
  await h.keyboard.type('transcribe', { delay: 30 }); await wait(600)
  check('⌘K offers “Transcribe the voice notes”', /Transcribe the voice notes/.test(await h.evaluate(() => document.body.innerText)), '')
  await h.keyboard.press('Enter')
  await h.waitForFunction((sel) => /\[0:00\]/.test(document.querySelector(sel)?.textContent ?? ''), EDITOR, { timeout: 120000 }).catch(() => {})
  check('…and it writes them', /\[0:00\] The quick brown fox/i.test(textOf(await doc())), textOf(await doc()).slice(0, 120))

  // With the setting on, a voice note kept as its own capture gets its words, and its first words name it.
  await v('settings:set', { transcribeAsYouRecord: true })
  const capture = await h.evaluate((body) => window.api.captures.create(body), { kind: 'note', body: { type: 'doc', content: [{ type: 'attachment', attrs: { src, name: 'Voice note 31 Oct 15.51.m4a', size: bytes.length, transcribe: true } }, { type: 'paragraph' }] } })
  await c.send('capture', capture); await wait(1400)
  await h.waitForFunction((sel) => /\[0:00\]/.test(document.querySelector(sel)?.textContent ?? ''), EDITOR, { timeout: 120000 }).catch(() => {})
  check('as you record: a new voice note gets its words', /\[0:00\] The quick brown fox/i.test(textOf(await doc())), textOf(await doc()).slice(0, 120))
  const flag = await h.evaluate((sel) => { let on = null; document.querySelector(sel).editor.state.doc.descendants((n) => void (n.type.name === 'attachment' && (on = n.attrs.transcribe))); return on }, EDITOR)
  check('…once: its “to transcribe” mark is cleared', flag === false, String(flag))
  await wait(1600)
  const named = await h.evaluate((id) => window.api.captures.list().then((all) => all.find((one) => one.id === id)), capture)
  check('a transcribed voice note is named by its first words', /^The quick brown fox/.test(named?.label ?? named?.title ?? ''), JSON.stringify(named)?.slice(0, 200))

  // The setting and its preview, in Settings' Writing.
  await h.evaluate(() => localStorage.setItem('settings:section', 'Writing'))
  await c.send('view', 'settings'); await wait(1500)
  const row = await h.$('[data-preview="transcribe"]')
  check('Settings has “Transcribe voice notes as you record them”, with its preview', !!row && /Transcribe voice notes as you record them/.test(await h.evaluate(() => document.body.innerText)), '')
  check('…on, the preview shows the words under the recording', /Pick up eggs/.test((await row?.innerText()) ?? ''), '')
  await row?.scrollIntoViewIfNeeded()
  await h.screenshot({ path: `${shots}/transcribe-setting-light.png` })
  await c.look('midnight'); await wait(600)
  await h.screenshot({ path: `${shots}/transcribe-setting-dark.png` })
} catch (error) {
  check('ran without throwing', false, String(error?.stack ?? error))
} finally {
  await c.close?.()
  rmSync(folder, { recursive: true, force: true })
  done()
}
