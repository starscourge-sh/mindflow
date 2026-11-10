// 10 Nov: code blocks are plain node views (components/code/code-block-node-view.ts), drawn without React, so
// no patch to TipTap is needed to open many quickly. Typing in a code block and turning a line into one keep the caret.
//   QA_ARGS=--sandbox QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/code-block-caret.mjs
import { sandbox } from './sandbox-lib.mjs'
const c = await sandbox({ width: 1200, height: 800 })
const { h, send } = c
let ok = true
const check = (name, pass, detail = '') => { ok &&= pass; console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`) }
const made = await h.evaluate(() => window.api.captures.create({ kind: 'note', body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Code test' }] }, { type: 'codeBlock', attrs: { language: 'js' }, content: [{ type: 'text', text: 'const a = 1' }] }, { type: 'paragraph', content: [{ type: 'text', text: 'after' }] }] } }))
await c.go('captures'); await send('capture', made); await h.waitForTimeout(2500)
const code = h.locator('[data-open] .ProseMirror pre code').first()
await code.click(); await h.keyboard.press('End'); await h.keyboard.type(' + 2'); await h.keyboard.press('Enter'); await h.keyboard.type('const b = 3')
await h.waitForTimeout(300)
const text = await code.innerText()
check('typing at the end of a code line and on a new line lands in order', text.replace(/\n+$/, '') === 'const a = 1 + 2\nconst b = 3', JSON.stringify(text))
// A new code block made from a line by ``` keeps the caret in it.
const after = h.locator('[data-open] .ProseMirror > p', { hasText: 'after' })
await after.click(); await h.keyboard.press('End'); await h.keyboard.press('Enter'); await h.keyboard.type('```'); await h.keyboard.press('Space'); await h.keyboard.type('let z = 9')
await h.waitForTimeout(300)
const blocks = await h.evaluate(() => [...document.querySelectorAll('[data-open] .ProseMirror pre code')].map((one) => one.innerText.trim()))
check('a code block made with ``` takes the words typed next', blocks.includes('let z = 9'), JSON.stringify(blocks))
console.log(ok ? 'all passed' : 'some failed')
await c.close(); process.exit(0)
