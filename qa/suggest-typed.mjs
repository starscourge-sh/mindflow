// The lists that a mark brings up ("/", ":", "@", "#") open as you type the
// mark, and only then: not when you click into "/endpoint" or "#work" already
// written, not after pasting them, and never inside code.
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/suggest-typed.mjs
import { sandbox } from './sandbox-lib.mjs'

const c = await sandbox({ width: 1000, height: 700 })
const { page, electron, v } = c
const results = []
const check = (name, ok, detail = '') => (results.push(!!ok), console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`))
await v('settings:set', { hintRate: 0, rotCount: 0, motion: false })
// Any suggestion list in sight (the slash menu, emoji, notes or tags), or a "/" being read as one.
const menu = () => page.evaluate(() => [...document.querySelectorAll('.tiptap-emoji-list, .tiptap-slash-menu, .tiptap-slash-token, [data-slash-menu], .tiptap-suggestion-popup, [role=listbox]')].some((el) => el.getBoundingClientRect().height > 0))
const clear = async () => { await page.keyboard.press('Escape'); await page.keyboard.press('Meta+a'); await page.keyboard.press('Backspace'); await page.waitForTimeout(200) }
// The caret put just after the given words, by a click there.
const clickAfter = async (words) => {
  const at = await page.evaluate((w) => {
    const root = document.querySelector('.tiptap.ProseMirror.haligtree-editor[contenteditable=true]')
    const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
    for (let n = walk.nextNode(); n; n = walk.nextNode()) {
      const i = n.textContent.indexOf(w)
      if (i < 0) continue
      const r = document.createRange(); r.setStart(n, i + w.length - 1); r.setEnd(n, i + w.length)
      const b = r.getBoundingClientRect()
      return { x: b.right - 1, y: b.top + b.height / 2 }
    }
    return null
  }, words)
  await page.mouse.click(at.x, at.y)
  await page.waitForTimeout(400)
}
try {
  await page.evaluate(() => window.api.showPrompt())
  await page.waitForTimeout(700)
  await clear()
  await page.keyboard.type('a /', { delay: 30 })
  await page.waitForTimeout(400)
  check('typing "/" opens the menu', await menu())
  await clear()
  await electron.evaluate(({ clipboard }) => clipboard.writeText('call the /endpoint and #work'))
  await page.keyboard.press('Meta+v')
  await page.waitForTimeout(500)
  check('pasting words ending in "#work" opens nothing', !(await menu()))
  await page.keyboard.press('Escape')
  await clickAfter('/endpoint')
  check('clicking into "/endpoint" opens nothing', !(await menu()))
  await clickAfter('#work')
  check('clicking into "#work" opens nothing', !(await menu()))
  await page.locator('.tiptap.ProseMirror.haligtree-editor[contenteditable=true]').focus()
  await page.keyboard.press('Meta+ArrowDown')
  await page.keyboard.type(' #bo', { delay: 30 })
  await page.waitForTimeout(500)
  check('typing "#bo" after it still offers tags', await menu(), await page.evaluate(() => document.querySelector('.tiptap.ProseMirror.haligtree-editor[contenteditable=true]')?.innerText + ' | ' + [...document.querySelectorAll('[class*=menu],[class*=suggest]')].map((e) => e.className.slice(0, 40)).join(',')))
  await clear()
  // Inside code: `api` made code by its backticks, then a "/" typed inside it.
  await page.keyboard.type('see `api` ', { delay: 30 })
  await page.waitForTimeout(300)
  for (let i = 0; i < 2; i++) await page.keyboard.press('ArrowLeft')
  await page.keyboard.type('/', { delay: 30 })
  await page.waitForTimeout(400)
  const inCode = await page.evaluate(() => !!window.getSelection()?.anchorNode?.parentElement?.closest('code'))
  check('typing "/" inside code opens nothing', inCode && !(await menu()), `in code: ${inCode}; ${await page.evaluate(() => document.querySelector('.haligtree-editor[contenteditable=true]')?.innerHTML.slice(0, 200))}`)
  // Your case: a "/word" written as code, the caret left at its end, and the box left and come back to.
  await clear()
  await page.keyboard.type('`/things` endpoint', { delay: 30 })
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)
  for (let i = 0; i < ' endpoint'.length + 1; i++) await page.keyboard.press('ArrowLeft')
  await page.waitForTimeout(400)
  check('the caret come to the end of "/things" in code opens nothing', !(await menu()), await page.evaluate(() => document.querySelector('.haligtree-editor[contenteditable=true]')?.innerHTML.slice(0, 120)))
  await page.evaluate(() => window.dispatchEvent(new Event('blur')))
  await page.evaluate(() => window.api.showPrompt())
  await page.waitForTimeout(400)
  await page.evaluate(() => window.api.showPrompt())
  await page.waitForTimeout(900)
  check('nor does coming back to the box with the caret there', !(await menu()))
} finally {
  await c.close()
}
const passed = results.filter(Boolean).length
console.log(`\n${passed}/${results.length} passed`)
process.exit(passed === results.length ? 0 : 1)
