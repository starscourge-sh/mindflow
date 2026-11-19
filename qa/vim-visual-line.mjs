/**
 * Vim's V (visual line) covers the whole line, from its first character to its
 * last, wherever the cursor stood on it: in a code block (each of its lines),
 * a paragraph, a heading, a list item and a quote; and j grows it by whole lines.
 *
 *   npx electron-vite build --outDir out-m
 *   QA_DATA=$(mktemp -d) QA_ENTRY=out-m/main/index.js HALIGTREE_QA_AWAY=1 node qa/vim-visual-line.mjs
 */
import { open } from './harness.mjs'

const EDITOR = '.tiptap.ProseMirror.haligtree-editor:not(.is-line):not(.is-plain)'
const qa = await open()
const { page } = qa
const results = []
const check = (ok, what) => (results.push(!!ok), console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}  (${JSON.stringify(last)})`))
let last = ''

await page.evaluate(() => {
  localStorage.setItem('vim', 'on')
  window.dispatchEvent(new StorageEvent('storage', { key: 'vim', newValue: 'on' }))
})
await page.waitForTimeout(300)

/** Some HTML, the cursor `offset` characters into the text of block `block`, then the keys; what the selection covers. */
async function picked(html, block, offset, keys) {
  await page.keyboard.press('Escape'); await page.keyboard.press('Escape')
  await page.$eval(EDITOR, (el, html) => el.editor.commands.setContent(html), html)
  await page.$eval(EDITOR, (el) => el.focus())
  await page.keyboard.press('Escape')
  await page.$eval(EDITOR, (el, [block, offset]) => {
    let at = null
    let seen = 0
    el.editor.state.doc.descendants((node, pos) => {
      if (at !== null || !node.isTextblock) return
      if (seen++ === block) at = pos + 1 + offset
    })
    el.editor.commands.setTextSelection(at)
  }, [block, offset])
  await page.waitForTimeout(80)
  for (const key of keys) await page.keyboard.press(key)
  await page.waitForTimeout(150)
  return last = await page.$eval(EDITOR, (el) => { const { from, to } = el.editor.state.selection; return el.editor.state.doc.textBetween(from, to, '|', '|') })
}

const code = '<pre><code>pip install harper\nnpm run build\nls -la</code></pre>'
check((await picked(code, 0, 5, ['Shift+V'])) === 'pip install harper', 'V on a code block\'s first line covers it whole')
check((await picked(code, 0, 22, ['Shift+V'])) === 'npm run build', 'V on a middle line covers it whole, from its first character')
check((await picked(code, 0, 33, ['Shift+V'])) === 'ls -la', 'V on the last line covers it whole')
check((await picked(code, 0, 2, ['Shift+V', 'j'])) === 'pip install harper\nnpm run build', 'V then j covers two whole lines')
check((await picked('<p>One plain line</p><p>Two</p>', 0, 4, ['Shift+V'])) === 'One plain line', 'V in a paragraph covers it whole')
check((await picked('<h2>A heading here</h2>', 0, 3, ['Shift+V'])) === 'A heading here', 'V in a heading covers it whole')
check((await picked('<ul><li><p>First item</p></li><li><p>Second</p></li></ul>', 0, 3, ['Shift+V'])) === 'First item', 'V in a list item covers it whole')
check((await picked('<blockquote><p>Quoted words</p></blockquote>', 0, 3, ['Shift+V'])) === 'Quoted words', 'V in a quote covers it whole')

await qa.close()
const passed = results.filter(Boolean).length
console.log(`${passed}/${results.length} passed`)
process.exit(passed === results.length ? 0 : 1)
