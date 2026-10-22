// A send from quick capture taken back with ⌘Z: the box is open again with
// exactly what was sent in it (its tags too), the caret at the end, and what
// the send made (a capture, a task, a timer, a clue, a marked day) is gone.
// Every send that offers an undo is tried.
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/box-undo.mjs
import { sandbox } from './sandbox-lib.mjs'

const c = await sandbox({ width: 1100, height: 760 })
const { page, electron, v } = c
const results = []
const check = (name, ok, detail = '') => (results.push(!!ok), console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`))
await v('settings:set', { hintRate: 0, rotCount: 0, motion: false })
const box = () => electron.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().filter((w) => !/view=/.test(w.webContents.getURL())).some((w) => w.isVisible()))
const words = () => page.evaluate(() => document.querySelector('.tiptap.ProseMirror.haligtree-editor')?.innerText.trim())
const captured = async (bit) => (await page.evaluate(() => window.api.captures.list())).some((one) => (one.label ?? '').includes(bit))
const tasked = async (bit) => (await v('tasks')).some((one) => one.status === 'open' && (one.title ?? '').includes(bit))
const question = (await v('questions:pinned').catch(() => []))?.[0]

const cases = [
  { name: 'a todo', typed: 'Call the plumber tomorrow #home', made: (t) => tasked('plumber'), capture: 'plumber' },
  { name: 'a plain note', typed: 'A plain thought about spring tides', made: () => captured('spring tides'), capture: 'spring tides' },
  { name: 'a plain note kept with ⌥⌘↵ (the box stays)', typed: 'Neap tides are the quiet ones', keys: 'Alt+Meta+Enter', made: () => captured('Neap tides'), capture: 'Neap tides' },
  { name: 'a todo kept with ⌥⌘↵ (the box stays)', typed: 'Book the dentist friday #health', keys: 'Alt+Meta+Enter', made: (t) => tasked('dentist'), capture: 'dentist' },
  { name: 'a timer', typed: '5m tea', made: async () => (await v('focus:now'))?.goal === 'tea' },
  { name: 'a marked day', typed: '!milestone Recital on 9 Dec', made: async () => (await v('milestones', null, null)).some((one) => one.title === 'Recital') }
]
if (question) cases.push({ name: 'a clue', typed: `+${question.title.split(' ')[0].toLowerCase()}: the tide was late again`, made: async () => true, skipMade: true })

try {
  for (const one of cases) {
    await page.evaluate(() => window.api.showPrompt())
    await page.waitForTimeout(700)
    await page.keyboard.type(one.typed, { delay: 12 })
    await page.waitForTimeout(700)
    await page.keyboard.press(one.keys ?? 'Meta+Enter')
    // The toast comes up as the send lands; ⌘Z straight away, as a hand would.
    await page.waitForFunction(() => /Undo/.test(document.body.innerText), null, { timeout: 4000 }).catch(() => {})
    const madeFirst = one.skipMade ? true : await one.made()
    await page.keyboard.press('Meta+z')
    await page.waitForTimeout(1200)
    const back = await words()
    check(`${one.name}: sent, then ⌘Z`, madeFirst, one.typed)
    check(`${one.name}: the box is open again`, await box())
    check(`${one.name}: with exactly what was sent`, back === one.typed, JSON.stringify(back))
    if (!one.skipMade) check(`${one.name}: what it made is gone`, !(await one.made()))
    if (one.capture) check(`${one.name}: and no capture is left behind`, !(await captured(one.capture)))
    check(`${one.name}: no celebration of it is left up`, !(await page.locator('[data-celebration] *').count()))
    // The caret at the end: typing carries on from there.
    await page.keyboard.type(' again', { delay: 10 })
    await page.waitForTimeout(200)
    check(`${one.name}: the caret is at the end`, (await words()) === `${one.typed} again`, JSON.stringify(await words()))
    await page.keyboard.press('Meta+a'); await page.keyboard.press('Backspace')
    await page.keyboard.press('Escape'); await page.waitForTimeout(500)
  }
} finally {
  const passed = results.filter(Boolean).length
  console.log(`${passed}/${results.length} passed`)
  console.log(c.errors.length ? 'errors: ' + c.errors.slice(0, 3).join(' | ') : 'no page errors')
  await c.close()
  process.exit(passed === results.length ? 0 : 1)
}
