// 10 Nov: the Book club note offered to link "Frankenstein #book" (a note's tag read as part of its name).
//   QA_ARGS=--sandbox QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/tag-name-offer.mjs [shot]
import { sandbox } from './sandbox-lib.mjs'
const c = await sandbox({ width: 1200, height: 800 })
const { h, send } = c
let ok = true
const check = (name, pass, detail = '') => { ok &&= pass; console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`) }
const id = await h.evaluate(async () => (await window.api.captures.list()).find((one) => JSON.stringify(one).includes('Frankenstein book club'))?.id)
check('the Book club note is in the sandbox', !!id, String(id))
await send('capture', id); await h.waitForTimeout(4000)
const offer = await h.evaluate(() => document.querySelector('[data-note-offer]')?.textContent ?? [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Link it')?.closest('div')?.parentElement?.textContent ?? '')
check('no offer names a note with its tag', !offer.includes('#book'), JSON.stringify(offer))
check('any link offer reads "Mentions …, a note of yours"', !offer || /Mentions .+, a note of yours/.test(offer), JSON.stringify(offer))
if (process.argv[2]) await h.screenshot({ path: process.argv[2] })
console.log(ok ? 'all passed' : 'some failed')
await c.close()
process.exit(0)
