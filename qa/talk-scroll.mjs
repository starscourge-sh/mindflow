// Talk to type in quick capture and in a note: once the words fill what shows, the newest ones stay in sight as
// they arrive (the user's 8bc629d7: "once the full prompt has been filled up, it does not auto scroll as the person
// continues to speak"). Main's dictation is a stand-in that sends the words as the probe says (as qa/dictation.mjs).
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox node qa/talk-scroll.mjs
import { checks } from './harness.mjs'
import { CALM_HOUR, sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const { check, done } = checks()
const c = await sandbox({ width: 1100, height: 760, at: CALM_HOUR })
const { page: box, electron, h } = c
await electron.evaluate(({ ipcMain }) => {
  for (const one of ['start', 'stop', 'cancel']) ipcMain.removeHandler(`haligtree:dictate:${one}`)
  globalThis.talk = { to: null }
  ipcMain.handle('haligtree:dictate:start', (event) => {
    globalThis.talk.to = event.sender
    setImmediate(() => event.sender.send('dictate:line', { ready: { onDevice: true } }))
    return { ok: true }
  })
  ipcMain.handle('haligtree:dictate:stop', () => (globalThis.talk.to?.send('dictate:line', { final: { text: globalThis.talk.last ?? '' } }), globalThis.talk.to?.send('dictate:line', { ended: true })))
  ipcMain.handle('haligtree:dictate:cancel', () => globalThis.talk.to?.send('dictate:line', { ended: true }))
})
const partial = (text) => electron.evaluate((_e, text) => (globalThis.talk.last = text, globalThis.talk.to.send('dictate:line', { partial: { text } })), text)
const SENTENCE = 'Behind you stands a symbol of the old city and the people who kept it going through the long winter. '
// Where the newest faint word is against what scrolls the writing: in sight when its foot is inside.
const sight = (page) => page.evaluate(() => {
  const words = document.querySelector('[data-talk="faint"]')
  if (!words?.lastChild) return null
  const range = document.createRange()
  range.selectNodeContents(words.lastChild)
  range.collapse(false)
  const end = range.getBoundingClientRect()
  let at = words.parentElement
  while (at && !(/(auto|scroll)/.test(getComputedStyle(at).overflowY) && at.scrollHeight > at.clientHeight)) at = at.parentElement
  const port = (at ?? document.documentElement).getBoundingClientRect()
  return { end: Math.round(end.bottom), top: Math.round(port.top), bottom: Math.round(Math.min(port.bottom, innerHeight)), scrolls: !!at }
})
async function speak(page, where) {
  await page.keyboard.down('Alt'); await page.keyboard.down('Space'); await page.waitForTimeout(300)
  let said = ''
  let worst = null
  for (let i = 1; i <= 14; i++) {
    said += SENTENCE
    await partial(said.trim())
    await page.waitForTimeout(120)
    const at = await sight(page)
    if (at && at.scrolls && (at.end > at.bottom || at.end < at.top)) worst ??= { i, ...at }
  }
  const last = await sight(page)
  check(`${where}: the words fill more than shows`, !!last?.scrolls, JSON.stringify(last))
  check(`${where}: the newest words stay in sight as they arrive`, !worst, JSON.stringify(worst))
  await page.keyboard.up('Space'); await page.keyboard.up('Alt'); await page.waitForTimeout(600)
}
try {
  await c.v('settings:set', { hintRate: 0, rotCount: 0, sounds: false, boxOneLine: false })
  await box.evaluate(() => window.api.showPrompt())
  await box.waitForTimeout(1200)
  await box.keyboard.type('Notes from the talk: ')
  await speak(box, 'quick capture')
  await box.keyboard.press('Meta+a'); await box.keyboard.press('Backspace')
  await box.evaluate(() => window.api.hidePrompt())
  await box.waitForTimeout(400)
  // A note in the main window, its page shorter than the words.
  await c.size(900, 520)
  const made = await h.evaluate(() => window.api.captures.create({ kind: 'note', body: '<p>Lecture notes</p><p></p>' }))
  await c.send('capture', made.id ?? made)
  await h.waitForTimeout(1500)
  const editor = h.locator('[data-open] .tiptap').first()
  await editor.click()
  await h.keyboard.press('Meta+ArrowDown')
  await speak(h, 'a note')
} finally {
  await c.close()
}
done()
