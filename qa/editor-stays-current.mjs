// 10 Nov: the editor no longer draws itself again on every keystroke (shouldRerenderOnTransaction: false). Its bars,
// buttons keep themselves current: Bold lit on bold words in the selection
// bar, "Look up" offered for one word and not for the next pick of several, the language label after a change.
//   QA_ARGS=--sandbox QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/editor-stays-current.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'
const { check, done } = checks()
const c = await sandbox({ width: 1300, height: 860 })
const { h, send } = c
try {
  await h.waitForTimeout(3000)
  const made = await h.evaluate(() => window.api.captures.create({ kind: 'note', body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Stays current' }] }, { type: 'paragraph', content: [{ type: 'text', text: 'one two three' }] }, { type: 'codeBlock', attrs: { language: null }, content: [{ type: 'text', text: 'const a = 1' }] }] } }))
  await c.go('captures'); await send('capture', made); await h.waitForTimeout(2500)
  const ed = '[data-open] .ProseMirror'
  await h.locator(ed).getByText('one two three').click(); await h.keyboard.press('End'); await h.keyboard.type(' four five six seven')
  await h.waitForTimeout(800)
  check('typing lands', (await h.locator(ed).textContent()).includes('three four five six seven'))
  // One word picked, made bold: the bar's Bold lights and "Look up" is offered.
  await h.evaluate(() => { const e = document.querySelector('[data-open] .ProseMirror').editor; let at = -1; e.state.doc.descendants((n, p) => { if (n.isText && n.text.includes('four')) at = p + n.text.indexOf('four') }); e.chain().focus().setTextSelection({ from: at, to: at + 4 }).run() })
  await h.waitForTimeout(800)
  await h.keyboard.press('Meta+b'); await h.waitForTimeout(600)
  const lit = await h.evaluate(() => [...document.querySelectorAll('[data-active-state="on"]')].some((b) => /bold/i.test(b.getAttribute('aria-label') ?? b.textContent ?? '')))
  check('Bold lights in the selection bar once the word is bold', lit)
  const lookOne = await h.locator('[data-look-up]').count()
  // Then several words on one line: no "Look up".
  await h.evaluate(() => { const e = document.querySelector('[data-open] .ProseMirror').editor; let at = -1; e.state.doc.descendants((n, p) => { if (n.isText && n.text.startsWith('one two')) at = p }); e.chain().focus().setTextSelection({ from: at, to: at + 7 }).run() })
  await h.waitForTimeout(800)
  const lookMany = await h.locator('[data-look-up]').count()
  check('"Look up" for one word, not for the next pick of several on one line', lookOne > 0 && lookMany === 0, `${lookOne} then ${lookMany}`)
  const unlit = await h.evaluate(() => ![...document.querySelectorAll('[data-active-state="on"]')].some((b) => /bold/i.test(b.getAttribute('aria-label') ?? '')))
  check('Bold goes dark on plain words', unlit)
  // The code block's language label follows a change made elsewhere.
  const block = h.locator(`${ed} .tiptap-code-block`).first()
  await block.hover(); await h.waitForTimeout(500)
  await h.evaluate(() => { const e = document.querySelector('[data-open] .ProseMirror').editor; let at = -1; e.state.doc.descendants((n, p) => { if (n.type.name === 'codeBlock') at = p }); e.chain().command(({ tr }) => (tr.setNodeMarkup(at, undefined, { language: 'python' }), true)).run() })
  await h.waitForTimeout(500)
  const label = await block.locator('.tiptap-code-controls .tiptap-button-text').first().textContent()
  const said = await h.evaluate(() => { const e = document.querySelector('[data-open] .ProseMirror').editor; const out = []; e.state.doc.descendants((n) => { if (n.type.name === 'codeBlock') out.push(n.attrs.language) }); return out.join(',') + ' blocks in page ' + document.querySelectorAll('[data-open] .tiptap-code-block').length })
  check('the code block names its new language', label === 'Python', `${label}; ${said}`)
} finally {
  await c.close()
}
done()
