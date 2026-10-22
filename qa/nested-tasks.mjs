// A nested list in a note made tasks keeps its nesting: seven lines at the top
// with five indented under two of them offer "7 tasks, 5 steps", not "12
// tasks"; each indented line becomes a step of the line above, and "camping:"
// over its steps is a task named "camping". A pasted nested list offers the same.
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-x/main/index.js HALIGTREE_QA_AWAY=1 [SHOT=<file.png>] node qa/nested-tasks.mjs
import { sandbox } from './sandbox-lib.mjs'

const results = []
const check = (name, ok, detail = '') => (results.push(!!ok), console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`))
const c = await sandbox({ width: 1100, height: 820 })
const { h, v, send } = c
const wait = (ms) => h.waitForTimeout(ms)
const item = (text, sub) => ({ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }, ...(sub ? [{ type: 'bulletList', content: sub.map((one) => item(one)) }] : [])] })
try {
  const id = await h.evaluate((list) => window.api.captures.create({ kind: 'note', body: { type: 'doc', content: [{ type: 'bulletList', content: list }] } }), [
    item('buy oat milk'), item('confirm hotel booking', ['ring the front desk', 'pay the deposit']), item('camping:', ['pack the tent', 'book the train', 'print the map']),
    item('water the plants'), item('email Jo back'), item('fix the bike light'), item('renew the library card')
  ])
  await send('capture', id)
  await wait(1500)
  await h.evaluate(() => {
    const root = document.querySelector('.tiptap.ProseMirror[contenteditable="true"]')
    const texts = [...root.querySelectorAll('li p')]
    const range = document.createRange()
    range.setStart(texts[0].firstChild, 0)
    range.setEnd(texts.at(-1).firstChild, texts.at(-1).textContent.length)
    getSelection().removeAllRanges()
    getSelection().addRange(range)
  })
  await wait(700)
  const make = h.locator('[data-make-tasks]')
  const said = (await make.innerText().catch(() => '')).trim()
  check('the selection offers “7 tasks, 5 steps”', said === '7 tasks, 5 steps', said)
  if (process.env.SHOT) await h.screenshot({ path: process.env.SHOT })
  const before = (await v('tasks')).length
  await make.click()
  await wait(1500)
  const all = await v('tasks')
  check('seven tasks made, not twelve', all.length - before === 7, String(all.length - before))
  const camping = all.find((one) => one.title === 'camping')
  check('“camping:” is a task named “camping”', !!camping)
  check('with its three steps', (camping?.subtasks ?? []).map((one) => one.text).join('|') === 'pack the tent|book the train|print the map', JSON.stringify(camping?.subtasks))
  const hotel = all.find((one) => one.title === 'confirm hotel booking')
  check('“confirm hotel booking” has its two steps', (hotel?.subtasks ?? []).length === 2)
  check('no step became a task of its own', !all.some((one) => one.title === 'pay the deposit'))
  const toast = await h.evaluate(() => document.body.innerText.includes('7 tasks, linked to their lines, with 5 steps'))
  check('the notice says the same', toast)
} catch (error) {
  check('ran to the end', false, error.message.split('\n')[0])
} finally {
  const passed = results.filter(Boolean).length
  console.log(`${passed}/${results.length} passed`)
  console.log(c.errors.length ? 'errors: ' + c.errors.slice(0, 3).join(' | ') : 'no page errors')
  await c.close()
  process.exit(passed === results.length ? 0 : 1)
}
