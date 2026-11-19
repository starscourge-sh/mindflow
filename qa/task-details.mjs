// "Add a task" takes more than its words before it is made (ask 45, 17 Nov: "links... more appealing than a long link",
// "a description... without having to create it first then opening it", "and potentially a screen shot"). A link
// pasted becomes a chip, never a long address in the words; ⇧↵ opens the details, which take a description and a
// pasted picture; ⌘↵ there adds the task, and all of it is its description. Pastes are synthetic paste events
// carrying their data: the Mac's clipboard is never touched.
//   QA_ARGS=--sandbox QA_DATA=<copy of the seeded sandbox> QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 [SHOTS=/abs/dir] node qa/task-details.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'
const { check, done } = checks()
const c = await sandbox({ width: 1280, height: 800 })
const { electron, h, go, both, errors } = c
const sql = (q, ...args) => electron.evaluate((_, [q, args]) => globalThis.qaFeedSql(q, ...args), [q, args])
const URL_ = 'https://x.com/soltwagner/status/2116923959216386187'
const ADD = 'form input[data-task-input]'
// A paste into what has the keys, carrying text or a picture.
const paste = (what) => h.evaluate(async (w) => {
  const data = new DataTransfer()
  if (w.text) data.setData('text/plain', w.text)
  if (w.png) {
    const bytes = Uint8Array.from(atob(w.png), (ch) => ch.charCodeAt(0))
    data.items.add(new File([bytes], 'shot.png', { type: 'image/png' }))
  }
  document.activeElement.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }))
}, what)
// A 1 by 1 picture.
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
try {
  await go('today')
  await h.click(ADD)
  await h.keyboard.type('extract feature requests from woday comments ', { delay: 15 })
  await paste({ text: URL_ })
  await h.waitForTimeout(800)
  const chip = await h.$eval('[data-task-link]', (el) => el.innerText).catch(() => '')
  const words = await h.$eval(ADD, (el) => el.value)
  check('a link pasted is a chip, its long address not in the words', !!chip && !words.includes('x.com/'), JSON.stringify({ chip, words }))
  await h.keyboard.press('Shift+Enter'); await h.waitForTimeout(400)
  check('⇧↵ opens the details, its field taking the keys', await h.evaluate(() => document.activeElement?.hasAttribute('data-task-description')))
  await h.keyboard.type('Comments under the thread ask for folders and export.', { delay: 10 })
  await paste({ png: PNG }); await h.waitForTimeout(1500)
  check('a picture pasted shows in the details', !!(await h.$('[data-task-picture]')))
  if (process.env.SHOTS) await both(`${process.env.SHOTS}/q1-task-details`)
  await h.keyboard.press('Meta+Enter'); await h.waitForTimeout(1500)
  const made = (await sql("select title, notes from tasks where title like 'extract feature requests%' order by created_at desc limit 1"))[0]
  check('⌘↵ adds the task with its words alone as its name', made?.title?.trim() === 'extract feature requests from woday comments', made?.title)
  const notes = String(made?.notes ?? '')
  check('its description holds the words, the picture and the link', notes.includes('Comments under the thread') && /"type":"image"/.test(notes) && notes.includes(URL_), notes.slice(0, 300))
  check('the field is empty again, chips and details gone', !(await h.$('[data-task-link]')) && !(await h.$('[data-task-details-box]')) && !(await h.$eval(ADD, (el) => el.value)))
  check('no page errors', !errors.length, errors.slice(0, 3).join(' | '))
} catch (error) {
  check('the probe ran to its end', false, error.message)
} finally {
  await c.close()
  done()
}
