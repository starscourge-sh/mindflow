// Sums in notes: a line ending in "=" shows its answer as a faint ghost; Tab or → writes it in. Never in code.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/note-sums.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const { check, done } = checks()
const c = await sandbox({ width: 1400, height: 900 })
const { h, v } = c
const wait = (ms) => h.waitForTimeout(ms)
const shots = process.env.QA_SHOTS ?? '/tmp'
const p = (text) => ({ type: 'paragraph', content: [{ type: 'text', text }] })
const lines = ['12 × 4 =', '2.5*3+1 =', '3h 20m + 45m =', '2^10 =', '(1 + 2) * 3 ÷ 2 =', '200 * 10% =']
const want = ['48', '8.5', '4h 5m', '1024', '4.5', '20']
const body = { type: 'doc', content: [...lines.map(p), { type: 'codeBlock', content: [{ type: 'text', text: 'x = 2 + 2 =' }] }, p('7 * 6 =')] }
const ghosts = () => h.evaluate(() => [...document.querySelectorAll('[data-open] .tiptap:not(.is-line):not(.is-plain) .mf-calc-ghost')].map((one) => ({ line: one.closest('p, pre')?.textContent.slice(0, -one.textContent.length).trim(), ghost: one.textContent.trim(), code: !!one.closest('pre') })))
const endOf = (text) => h.evaluate((text) => { const ed = document.querySelector('[data-open] .tiptap:not(.is-line):not(.is-plain)').editor; let at = 0; ed.state.doc.descendants((node, pos) => { if (node.isTextblock && node.textContent === text) at = pos + node.nodeSize - 1 }); ed.chain().focus().setTextSelection(at).run() }, text)
const lineText = (start) => h.evaluate((start) => { const ed = document.querySelector('[data-open] .tiptap:not(.is-line):not(.is-plain)').editor; let found = ''; ed.state.doc.descendants((node) => { if (node.isTextblock && node.textContent.startsWith(start)) found = node.textContent }); return found }, start)
try {
  await v('settings:set', { sounds: false, hintRate: 0 })
  const id = await v('article:new')
  await v('item:save', id, { title: 'Sums', body })
  await c.send('article', id)
  await h.waitForSelector('[data-open] .tiptap:not(.is-line):not(.is-plain) .mf-calc-ghost', { timeout: 15000 })
  await wait(800)
  const shown = await ghosts()
  lines.forEach((line, i) => check(`"${line}" shows ${want[i]}`, shown.some((one) => one.line === line && one.ghost === want[i]), JSON.stringify(shown.find((one) => one.line === line))))
  check('nothing in a code block', !shown.some((one) => one.code), JSON.stringify(shown))
  await endOf('12 × 4 =')
  await h.keyboard.press('ArrowRight'); await wait(300)
  check('→ writes the answer in', (await lineText('12 × 4')) === '12 × 4 = 48', await lineText('12 × 4'))
  await endOf('3h 20m + 45m =')
  await h.keyboard.press('Tab'); await wait(300)
  check('Tab writes a time in', (await lineText('3h 20m')) === '3h 20m + 45m = 4h 5m', await lineText('3h 20m'))
  // Typed from scratch: the ghost follows the keys.
  await endOf('7 * 6 =')
  await h.keyboard.press('Enter'); await h.keyboard.type('9 / 3 ='); await wait(500)
  check('a sum typed fresh answers', (await ghosts()).some((one) => one.line === '9 / 3 =' && one.ghost === '3'), JSON.stringify(await ghosts()))
  await h.keyboard.press('ArrowRight'); await wait(200)
  check('→ writes a typed sum in', (await lineText('9 / 3')) === '9 / 3 = 3', await lineText('9 / 3'))
  await endOf('7 * 6 =')
  await c.both(`${shots}/note-sums`)
} catch (error) {
  check('the run finished', false, error.message.split('\n')[0])
} finally {
  await c.close?.()
}
done()
