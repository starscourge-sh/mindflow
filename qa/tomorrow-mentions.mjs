// @ in the "For tomorrow" box under Today: the editor's @ menu opens under the line, notes only; picked
// (Enter, or a click), the note's name takes the place of the @ and what was typed, and the task made from the line
// is made from that note: it shows the note's name under its words, a click opening it. A day in the note's name
// ("Friday") is never read as the task's day. Pictures in light and dark.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-p/main/index.js HALIGTREE_QA_AWAY=1 node qa/tomorrow-mentions.mjs
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const results = []
const check = (name, ok, detail = '') => { results.push(!!ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`) }
const shots = process.env.QA_SHOTS ?? process.env.QA_DATA
const c = await sandbox({ width: 1100, height: 900, at: '22:00' })
const { h, v, go } = c
const wait = (ms) => h.waitForTimeout(ms)
const shot = async (name) => {
  for (const [look, theme] of [['light', 'paper'], ['dark', 'dark']]) {
    await h.evaluate((t) => { localStorage.setItem('theme', t); window.dispatchEvent(new StorageEvent('storage', { key: 'theme' })) }, theme)
    await wait(400)
    await h.screenshot({ path: `${shots}/${name}-${look}.png` })
  }
  await h.evaluate(() => { localStorage.setItem('theme', 'paper'); window.dispatchEvent(new StorageEvent('storage', { key: 'theme' })) })
  await wait(250)
}
try {
  await v('settings:set', { motion: false, hintRate: 0, closeDayAt: '19:00', tomorrowBox: true })
  const note = await h.evaluate(() => window.api.captures.create({ kind: 'note', body: { type: 'doc', content: [
    { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Garden plans for Friday' }] },
    { type: 'paragraph', content: [{ type: 'text', text: 'Beans by the fence, tomatoes in pots.' }] }
  ] } }))
  const noteId = typeof note === 'string' ? note : note?.id
  await h.reload(); await wait(1500); await go('today'); await wait(2500)
  const menu = () => h.evaluate(() => [...document.querySelectorAll('.tiptap-suggestion-popup .tiptap-slash-menu-title')].map((one) => one.textContent))
  // A line's words as read back: a note picked shows as its name.
  const words = (sel) => h.evaluate((sel) => document.querySelector(`${sel} .ProseMirror`)?.innerText.replace(/\s+/g, ' ') ?? '', sel)
  const inLine = (sel) => h.evaluate((sel) => !!document.activeElement?.closest(sel), sel)
  const open = () => h.$('.tiptap-suggestion-popup:visible')
  const task = async (words) => (await v('tasks')).find((one) => one.title.startsWith(words))

  // Today's own list is written in with the task line (qa/day-merge.mjs); @ notes are the "For tomorrow" box's.
  let made
  // The "For tomorrow" box, with a click this time.
  const box = h.locator('[data-tomorrow-new] .ProseMirror')
  check('the "For tomorrow" box is there in the evening', (await box.count()) === 1)
  await box.scrollIntoViewIfNeeded(); await box.click(); await wait(200)
  await h.keyboard.type('Buy stakes for @garden', { delay: 25 }); await wait(900)
  const rows2 = await menu()
  check('@ in the "For tomorrow" box opens the same menu', rows2.some((one) => one.includes('Garden plans')), rows2.join(' | '))
  await h.locator('.tiptap-suggestion-popup [role=option], .tiptap-suggestion-popup button', { hasText: 'Garden plans' }).first().click(); await wait(400)
  check('a click picks, the caret kept in the line', (await words('[data-tomorrow-new]')).startsWith('Buy stakes for ') && (await words('[data-tomorrow-new]')).includes('Garden plans for Friday') && await inLine('[data-tomorrow-new]'), JSON.stringify(await words('[data-tomorrow-new]')))
  await h.keyboard.press('Enter'); await wait(1500)
  made = await task('Buy stakes')
  const tomorrow = new Date(new Date(c.now()).getTime() + 864e5).toDateString()
  check('the line for tomorrow is made from the note, for tomorrow', made?.fromId === noteId && made?.dueAt && new Date(made.dueAt).toDateString() === tomorrow, JSON.stringify({ fromId: made?.fromId, due: made?.dueAt }))
  const from2 = h.locator(`[data-tomorrow-line="${made?.id}"] [data-from-note]`)
  check('its line in the box shows the note\'s name', (await from2.count()) === 1)
  await from2.scrollIntoViewIfNeeded()
  await shot('mentions-lines')

  // Words with the name taken out again: no link.
  await box.click(); await h.keyboard.type('Weed @garden', { delay: 25 }); await wait(900)
  await h.keyboard.press('Enter'); await wait(300)
  // Backspace until the name is gone (it goes in one, as a picked note does in a note).
  for (let i = 0; i < 30 && (await words('[data-tomorrow-new]')).includes('Garden'); i++) await h.keyboard.press('Backspace')
  if (!(await words('[data-tomorrow-new]')).endsWith(' ')) await h.keyboard.type(' ')
  await h.keyboard.type('the beds'); await h.keyboard.press('Enter'); await wait(1500)
  made = await task('Weed the beds')
  check('a name taken back out of the words leaves the task unlinked', made && !made.fromId, JSON.stringify({ title: made?.title, fromId: made?.fromId }))

  // Clicked, the name opens the note.
  await from2.scrollIntoViewIfNeeded(); await from2.click(); await wait(1500)
  const opened = await h.evaluate(() => document.querySelector('.haligtree-editor-content, [data-note-window]')?.textContent?.includes('Beans by the fence') ?? false)
  check('the note\'s name opens the note', opened)
} catch (error) {
  check('the run finished', false, error.message.split('\n')[0])
} finally { await c.close() }
const passed = results.filter(Boolean).length
console.log(`\n${passed}/${results.length} passed`)
process.exit(passed === results.length ? 0 : 1)
