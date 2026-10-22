// Vim keys indent the vim way, and formulas never eat ordinary words.
//   >> and << move a bullet in or out with its sub-bullets, 3>> takes three
//   lines, >j reaches as far as the motion, > and < in visual mode move every
//   selected line and go back to normal mode, words selected with the mouse
//   count as a visual selection, a first bullet with nothing to go under stays
//   while the rest move, one u puts it all back, a code block gets two spaces.
//   ⌥⌘9 with nothing selected starts a new formula instead of taking the word,
//   a formula copies as its text, and "$20 and $500" pasted stays money.
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/vim-indent.mjs
import { sandbox } from './sandbox-lib.mjs'

const c = await sandbox({ width: 1000, height: 700 })
const { page, v } = c
const results = []
const check = (name, ok, detail = '') => (results.push(!!ok), console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`))
await v('settings:set', { hintRate: 0, rotCount: 0, motion: false })
const ED = '.tiptap.ProseMirror.haligtree-editor[contenteditable=true]:not(.is-line)'

const LIST = '- top\n  - sub\n    - aa\n    - bb\n    - cc\n    - dd\n'
/** The list as indented names, one line each, formulas as [x]. */
const outline = () => page.evaluate((s) => {
  const out = []
  const words = (p) => (p?.content ?? []).map((x) => x.text ?? `[${x.attrs?.latex ?? x.type}]`).join('')
  const walk = (n, d) => { for (const one of n.content ?? []) { if (one.type === 'listItem' || one.type === 'taskItem') { out.push('  '.repeat(d) + words(one.content?.[0])); walk({ content: one.content.slice(1) }, d + 1) } else if (one.type === 'paragraph') { if (one.content) out.push('  '.repeat(d) + words(one)) } else if (one.type === 'codeBlock') out.push('code:' + JSON.stringify(one.content?.[0]?.text ?? '')); else walk(one, d) } }
  walk(document.querySelector(s).editor.getJSON(), 0)
  return out.join('|')
}, ED)
const mode = () => page.$eval(ED, (e) => e.getAttribute('data-vim-mode'))
/** Fresh content, the cursor on the line that starts with `at`, in normal mode. */
const start = async (content, at, type = 'markdown') => {
  // The box can be between one editor and the next (a fresh capture): wait for it.
  await page.waitForFunction((s) => !!document.querySelector(s)?.editor, ED, { timeout: 10000 }).catch(() => page.evaluate(() => window.api.showPrompt()))
  await page.evaluate(([s, content, at, type]) => {
    const editor = document.querySelector(s).editor
    editor.commands.setContent(content, type === 'json' ? {} : { contentType: 'markdown' })
    let pos = null
    editor.state.doc.descendants((node, p) => { if (pos === null && node.isText && (node.text.startsWith(at) || node.text.includes('\n' + at))) pos = p + (node.text.startsWith(at) ? 0 : node.text.indexOf('\n' + at) + 1) })
    editor.commands.focus()
    editor.commands.setTextSelection(pos ?? 1)
  }, [ED, content, at, type])
  if ((await mode()) === 'insert') await page.keyboard.press('Escape')
  await page.waitForTimeout(150)
}
const keys = async (...list) => { for (const k of list) { await page.keyboard.press(k); await page.waitForTimeout(60) } await page.waitForTimeout(150) }

try {
  // The switch Settings flips, heard the way every editor hears it.
  await page.evaluate(() => { localStorage.setItem('vim', 'on'); window.dispatchEvent(new StorageEvent('storage', { key: 'vim', newValue: 'on' })) })
  await page.evaluate(() => window.api.showPrompt()); await page.waitForTimeout(700)
  for (let i = 0; i < 3 && !(await page.waitForFunction((s) => !!document.querySelector(s)?.editor, ED, { timeout: 10000 }).catch(() => null)); i++) await page.evaluate(() => window.api.showPrompt())

  await start(LIST, 'bb')
  check('in normal mode to begin', (await mode()) === 'normal', await mode())
  await keys('>', '>')
  check('>> nests a bullet under the one above', (await outline()) === 'top|  sub|    aa|      bb|    cc|    dd', await outline())
  await keys('<', '<')
  check('<< brings it back out', (await outline()) === 'top|  sub|    aa|    bb|    cc|    dd', await outline())

  await start('- top\n  - one\n  - two\n    - kid\n', 'two')
  await keys('>', '>')
  check('>> carries the sub-bullets with it', (await outline()) === 'top|  one|    two|      kid', await outline())

  await start(LIST, 'bb')
  await keys('3', '>', '>')
  check('3>> moves three lines', (await outline()) === 'top|  sub|    aa|      bb|      cc|      dd', await outline())

  await start(LIST, 'bb')
  await keys('>', 'j')
  check('>j moves this line and the next', (await outline()) === 'top|  sub|    aa|      bb|      cc|    dd', await outline())

  await start(LIST, 'bb')
  // Apart from the setup in history, so one u is the indent's alone.
  await page.waitForTimeout(700)
  await keys('V', 'j', '>')
  check('V j > moves both selected lines', (await outline()) === 'top|  sub|    aa|      bb|      cc|    dd', await outline())
  check('and goes back to normal mode', (await mode()) === 'normal', await mode())
  await keys('u')
  check('one u puts it all back', (await outline()) === 'top|  sub|    aa|    bb|    cc|    dd', await outline())

  await start(LIST, 'aa')
  await keys('V', 'j', 'j', '>')
  check('the first bullet under its parent stays, the rest go under it', (await outline()) === 'top|  sub|    aa|      bb|      cc|    dd', await outline())

  await start(LIST, 'cc')
  await keys('v', 'j', '<')
  check('v j < lifts every line it touches', (await outline()) === 'top|  sub|    aa|    bb|  cc|  dd', await outline())

  // Selected with the mouse, as in the report: from bb to cc, then >.
  await start(LIST, 'aa')
  const box = async (t) => page.locator(`${ED} p`, { hasText: new RegExp(`^${t}$`) }).boundingBox()
  const [b, cc] = [await box('bb'), await box('cc')]
  await page.mouse.move(b.x + 2, b.y + b.height / 2); await page.mouse.down()
  await page.mouse.move(cc.x + cc.width - 2, cc.y + cc.height / 2, { steps: 8 }); await page.mouse.up()
  await page.waitForTimeout(300)
  await keys('>')
  check('> on lines selected with the mouse moves them', (await outline()) === 'top|  sub|    aa|      bb|      cc|    dd', await outline())
  check('and leaves normal mode with nothing selected', (await mode()) === 'normal' && (await page.evaluate((s) => document.querySelector(s).editor.state.selection.empty, ED)), await mode())

  await start('A plain line\n\nAnother line\n', 'A plain')
  await keys('>', '>')
  check('>> in a plain paragraph changes nothing', (await outline()) === 'A plain line|Another line', await outline())

  await start('```\nlet a = 1\nlet b = 2\n```\n', 'let a')
  await keys('>', '>')
  check('>> in a code block adds two spaces', (await outline()) === 'code:"  let a = 1\\nlet b = 2"', await outline())
  await keys('<', '<')
  check('<< takes them off again', (await outline()) === 'code:"let a = 1\\nlet b = 2"', await outline())
  await start('```\nlet a = 1\nlet b = 2\n```\n', 'let b')
  await keys('>', '>')
  check('>> on a code block\'s last line moves that line alone', (await outline()) === 'code:"let a = 1\\n  let b = 2"', await outline())

  // Formulas.
  await start('- size defaults to 20, but 500 returns all\n', 'size')
  await keys('w', 'w', 'w')
  await page.keyboard.press('Meta+Alt+9'); await page.waitForTimeout(200)
  const typed = await outline()
  check('⌥⌘9 with nothing selected keeps the word under the cursor', typed.includes('defaults to 20') && typed.includes('[x]'), typed)
  await keys('u')

  await start('- write x2 here\n', 'write')
  await keys('w', 'v', 'l')
  await page.keyboard.press('Meta+Alt+9'); await page.waitForTimeout(200)
  check('⌥⌘9 on selected words makes them a formula', (await outline()) === 'write [x2] here', await outline())

  await start({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'defaults to ' }, { type: 'inlineMath', attrs: { latex: '20' } }, { type: 'text', text: ', fine' }] }] }, 'defaults', 'json')
  const copied = await page.evaluate((s) => {
    const editor = document.querySelector(s).editor
    editor.commands.selectAll()
    const data = new DataTransfer()
    editor.view.dom.dispatchEvent(new ClipboardEvent('copy', { clipboardData: data, bubbles: true, cancelable: true }))
    return { text: data.getData('text/plain'), html: data.getData('text/html') }
  }, ED)
  await keys('Escape')
  check('a formula copies as its text', copied.text === 'defaults to 20, fine', JSON.stringify(copied.text))
  check('and keeps its text in the copy for other apps', />20</.test(copied.html), copied.html.slice(0, 160))

  await start('', '')
  await keys('i')
  await page.evaluate((value) => { const t = document.querySelector('.tiptap.ProseMirror.haligtree-editor:not(.is-line)'); t.focus(); const d = new DataTransfer(); d.setData('text/plain', value); t.dispatchEvent(new ClipboardEvent('paste', { clipboardData: d, bubbles: true, cancelable: true })) }, '- costs $20 and $500 in all\n- and $x^2$ is a formula')
  await page.waitForTimeout(300)
  check('pasted money stays words, a written formula is still one', (await outline()) === 'costs $20 and $500 in all|and [x^2] is a formula', await outline())
} finally {
  await c.close()
}
const passed = results.filter(Boolean).length
console.log(`\n${passed}/${results.length} passed`)
process.exit(passed === results.length ? 0 : 1)
