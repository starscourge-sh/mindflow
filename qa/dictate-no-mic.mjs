// "/ Dictate" with no microphone to use: it says so plainly, with a way to System Settings › Privacy › Microphone,
// never nothing (walkthrough-2026-11-04.md, item 2). Two ways it happens, each stood in for in main: macOS says no
// (mic:ask false), and the helper finds no microphone at all (its "mic" error line).
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_SHOTS=dir node qa/dictate-no-mic.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'
const { check, done } = checks()
const c = await sandbox({ width: 1200, height: 800 })
const { h, v } = c
const wait = (ms) => h.waitForTimeout(ms)
const shots = process.env.QA_SHOTS ?? '/tmp'
await v('settings:set', { sounds: false, hintRate: 0, motion: false })
const id = await v('article:new')
await v('item:save', id, { title: 'Dictation', body: { type: 'doc', content: [{ type: 'paragraph' }] } })
await c.send('article', id); await wait(1500)
const TOASTS = '[role=status]'
const said = () => h.evaluate((s) => [...document.querySelectorAll(s)].map((one) => one.textContent?.trim()).join(' | '), TOASTS)
const dictate = async (want = /microphone/i) => {
  await h.locator('[data-open] .tiptap.ProseMirror').click()
  await h.keyboard.type('/dictate'); await wait(500)
  await h.keyboard.press('Enter')
  let words = ''
  for (let n = 0; n < 60 && !want.test(words); n++) { await wait(100); words = await said() }
  return words
}
// macOS says no.
await c.electron.evaluate(({ ipcMain }) => { ipcMain.removeHandler('haligtree:mic:ask'); ipcMain.handle('haligtree:mic:ask', () => false) })
const denied = await dictate()
await c.both(`${shots}/dictate-mic-denied`)
check('"/ Dictate", the microphone not allowed: it says so', /may not use the microphone/i.test(denied), denied)
check('…with "Open Microphone settings"', /Open Microphone settings/.test(denied), denied)
await h.keyboard.press('Escape'); await wait(2500)
// No microphone at all: the helper's own line.
await c.electron.evaluate(({ ipcMain }) => {
  ipcMain.removeHandler('haligtree:mic:ask'); ipcMain.handle('haligtree:mic:ask', () => true)
  ipcMain.removeHandler('haligtree:dictate:start')
  ipcMain.handle('haligtree:dictate:start', (event) => (setTimeout(() => event.sender.send('dictate:line', { error: { code: 'mic', message: 'No microphone could be used. Check one is connected and allowed' } }), 300), { ok: true }))
})
const none = await dictate(/No microphone found/)
await c.both(`${shots}/dictate-no-mic`)
check('"/ Dictate", no microphone: "No microphone found"', /No microphone found/.test(none), none)
check('…with "Open Microphone settings"', /Open Microphone settings/.test(none), none)
done()
await c.close?.()
