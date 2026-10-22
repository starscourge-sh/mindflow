/**
 * Vim's bracket and quote text objects: di[ da[ ci( yi{ di" da' and the
 * rest (and ip), round the cursor or the next pair along the line, as vim does.
 *
 *   npx electron-vite build --outDir out-vim
 *   QA_DATA=$(mktemp -d) QA_ENTRY=out-vim/main/index.js HALIGTREE_QA_AWAY=1 node qa/vim-pairs.mjs
 */
import { open } from './harness.mjs'

const EDITOR = '.tiptap.ProseMirror.haligtree-editor:not(.is-line)'
const qa = await open()
const { page } = qa
const results = []
const check = (ok, what) => (results.push(!!ok), console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}`))

await page.evaluate(() => {
  localStorage.setItem('vim', 'on')
  window.dispatchEvent(new StorageEvent('storage', { key: 'vim', newValue: 'on' }))
})
await page.waitForTimeout(300)

const text = () => page.$eval(EDITOR, (el) => el.editor.state.doc.textContent)
/** One line, the cursor on the nth character of it, in normal mode, then the keys. */
async function run(line, at, keys) {
  await qa.reset()
  await page.$eval(EDITOR, (el, line) => el.editor.commands.setContent(`<p>${line}</p>`), line)
  await page.$eval(EDITOR, (el) => el.focus())
  await page.keyboard.press('Escape')
  await page.$eval(EDITOR, (el, at) => el.editor.commands.setTextSelection(1 + at), at)
  await page.waitForTimeout(80)
  for (const key of keys) await page.keyboard.press(key)
  await page.waitForTimeout(150)
  return text()
}

const cases = [
  ['[libra] correct the date', 3, ['d', 'i', '['], '[] correct the date'],
  ['[libra] correct the date', 3, ['d', 'a', '['], ' correct the date'],
  ['[libra] correct the date', 0, ['d', 'i', ']'], '[] correct the date'],
  ['go (with [nested] parts) now', 5, ['d', 'i', '('], 'go () now'],
  ['go (with [nested] parts) now', 11, ['d', 'i', '['], 'go (with [] parts) now'],
  ['go (with [nested] parts) now', 11, ['d', 'i', 'b'], 'go () now'],
  ['before {inside} after', 0, ['d', 'i', '{'], 'before {} after'],
  ['say "hello there" twice', 7, ['d', 'i', '"'], 'say "" twice'],
  ['say "hello there" twice', 7, ['d', 'a', '"'], 'say twice'],
  ['one whole paragraph', 4, ['d', 'i', 'p'], ''],
  ["it is 'quoted' here", 0, ['d', 'i', "'"], "it is '' here"],
]
for (const [line, at, keys, want] of cases) {
  const got = await run(line, at, keys)
  check(got === want, `${keys.join('')} on ${JSON.stringify(line)} at ${at} → ${JSON.stringify(got)}`)
}
// ci[ leaves you typing inside.
const changed = await run('[libra] fix it', 2, ['c', 'i', '[', 'v', 'i', 'g', 'i', 'l'])
check(changed === '[haligtree] fix it', `ci[ then typing → ${JSON.stringify(changed)}`)

console.log(`${results.filter(Boolean).length}/${results.length} passed`)
await qa.close?.()
process.exit(results.every(Boolean) ? 0 : 1)
