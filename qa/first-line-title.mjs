// 10 Nov: a note named by its first line shows that line as a title, like a titled note's h1.
//   QA_ARGS=--sandbox QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/first-line-title.mjs [shots-prefix]
import { sandbox } from './sandbox-lib.mjs'
const c = await sandbox({ width: 1200, height: 800 })
const { h, send } = c
let ok = true
const check = (name, pass, detail = '') => { ok &&= pass; console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`) }
const look = (sel) => h.evaluate((s) => { const el = document.querySelector(s); if (!el) return null; const st = getComputedStyle(el); return { text: el.textContent.slice(0, 40), size: st.fontSize, weight: st.fontWeight, family: st.fontFamily.slice(0, 30), color: st.color } }, sel)
const list = await h.evaluate(async () => (await window.api.captures.list()).map((one) => ({ id: one.id, s: JSON.stringify(one) })))
const club = list.find((one) => one.s.includes('Frankenstein book club'))?.id
await send('capture', club); await h.waitForTimeout(3000)
const line = await look('[data-open] .ProseMirror > p:first-child')
const second = await look('[data-open] .ProseMirror ol li p, [data-open] .ProseMirror > p:nth-of-type(2)')
check('the first line is set large, as a title', !!line && parseFloat(line.size) >= 1.7 * parseFloat(second?.size ?? '99'), JSON.stringify({ line, second }))
if (process.argv[2]) await c.both(`${process.argv[2]}-club`)
// A note opened with an h1 of its own keeps it, and its first paragraph after the strip stays body text.
const start = list.find((one) => one.s.includes('Start here'))?.id
await send('capture', start); await h.waitForTimeout(3000)
const h1 = await look('[data-open] .ProseMirror > h1:first-child')
const para = await look('[data-open] .ProseMirror > p')
check('a titled note: its h1 is the title, its words stay body size', !!h1 && !!para && parseFloat(para.size) < 20 && line && h1.size === line.size, JSON.stringify({ h1, para }))
if (process.argv[2]) await c.both(`${process.argv[2]}-start`)
// Typing a new note: its first line becomes the title as it is written.
const made = await h.evaluate(() => window.api.captures.create({ kind: 'note', body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Shopping for the trip' }] }, { type: 'paragraph', content: [{ type: 'text', text: 'Boots, map, a torch.' }] }] } }))
await c.go('captures'); await send('capture', made); await h.waitForTimeout(2500)
const fresh = await look('[data-open] .ProseMirror > p:first-child')
const body = await look('[data-open] .ProseMirror > p:nth-of-type(2)')
check('a new note: first line titled, second line body', !!fresh && !!body && parseFloat(fresh.size) > parseFloat(body.size) * 1.7, JSON.stringify({ fresh, body }))
if (process.argv[2]) await c.both(`${process.argv[2]}-new`)
console.log(ok ? 'all passed' : 'some failed')
await c.close()
process.exit(0)
