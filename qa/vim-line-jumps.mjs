// Vim's counts by the lines the margin numbers (Settings, under “Vim keys”: “Jump by line numbers”), and “Relative”
// line numbers as a choice of their own. With the switch on, 4j lands on the line the relative margin marks 4 however
// the paragraphs wrap, 3k on the one marked 3 above, 7G and 1G on lines 7 and 1, and d2j and V3jd take exactly those
// lines (u puts them back), every place read from the margin's own labels. Off, 4j walks four rows as jjjj does. The
// switch shows only with Vim keys on; “Relative” on and off read from the margin, beside its sample. Quick capture,
// with no numbers shown, jumps by the same lines.
//   QA_ARGS=--sandbox QA_DATA=<copy of the seeded sandbox> QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/vim-line-jumps.mjs
// Frames to read by eye, when asked for: QA_SHOTS=<folder>.
import { join } from 'node:path'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const shots = process.env.QA_SHOTS
const { check, done } = checks()
const c = await sandbox({ width: 1100, height: 900 })
const { h, v, page } = c
const wait = (ms) => h.waitForTimeout(ms)
const p = (text) => ({ type: 'paragraph', content: text ? [{ type: 'text', text }] : [] })
const li = (text, more) => ({ type: 'listItem', content: [p(text), ...(more ? [more] : [])] })
const cell = (kind, text) => ({ type: kind, content: [p(text)] })
const long = (n) => `Paragraph ${n} is long enough to wrap onto a second and a third row of the note's column, so that a row on the screen and a line in the margin are never the same thing, whatever the width of the window it is read in.`
const SRC = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR4nGP8z8DwnwEJMDGgAQBOXgIB7Zr2GQAAAABJRU5ErkJggg=='
// Lines as the margin numbers them: 1 one, 2 two, 3 apples, 4 bread, 5 rye, 6 spelt, 7 cheese, 8 first said,
// 9 then said, 10 the table, 11 the picture, 12 the code, 13 three, 14 last.
const body = { type: 'doc', content: [
  p(long('one')), p(long('two')),
  { type: 'bulletList', content: [li('apples'), li('bread', { type: 'bulletList', content: [li('rye'), li('spelt')] }), li('cheese')] },
  { type: 'blockquote', content: [p('first said'), p('then said')] },
  { type: 'table', content: [0, 1].map((r) => ({ type: 'tableRow', content: ['A', 'B'].map((k) => cell(r ? 'tableCell' : 'tableHeader', `${k}${r}`)) })) },
  { type: 'image', attrs: { src: SRC } },
  { type: 'codeBlock', attrs: { language: null }, content: [{ type: 'text', text: 'let a = 1\nlet b = 2' }] },
  p(long('three')), p('last'),
] }
const LINES = 14
const flag = (target, key, on) => target.evaluate(([key, on]) => { localStorage.setItem(key, on ? 'on' : 'off'); window.dispatchEvent(new StorageEvent('storage', { key, newValue: on ? 'on' : 'off' })) }, [key, on])
const margin = () => h.evaluate(() => {
  const marks = [...document.querySelectorAll('[data-open] .mf-lines .mf-line')]
  return { words: marks.map((m) => m.textContent), here: marks.findIndex((m) => m.hasAttribute('data-here')) }
})
// The caret's place in the open note: its block's words, how far into them, and the top of its row on the screen.
const caret = (target = h, scope = '[data-open] .tiptap') => target.evaluate((scope) => {
  const ed = document.querySelector(scope).editor
  const { selection } = ed.state
  const node = selection.node
  if (node) return { text: `[${node.type.name}]`, at: selection.from }
  return { text: selection.$head.parent.textContent.slice(0, 20), at: selection.head, row: Math.round(ed.view.coordsAtPos(selection.head).top) }
}, scope)
const caretIn = (text, target = h, scope = '[data-open] .tiptap') => target.evaluate(([text, scope]) => {
  const ed = document.querySelector(scope).editor
  let at = 0
  ed.state.doc.descendants((node, pos) => { if (!at && node.isText && node.text.startsWith(text)) at = pos + 1 })
  ed.chain().focus().setTextSelection(at).run()
}, [text, scope])
const normal = async (target = h, scope = '[data-open] .tiptap') => {
  const mode = await target.evaluate((scope) => document.querySelector(scope).getAttribute('data-vim-mode'), scope)
  if (mode !== 'normal') await target.keyboard.press('Escape')
}
const keys = async (list, target = h) => { for (const key of list) await target.keyboard.press(key); await target.waitForTimeout(300) }

try {
  // “Relative” unset, as in every book the day it comes: it follows Vim keys, on here.
  await v('settings:set', { sounds: false, hintRate: 0, lineNumbers: true, relativeLineNumbers: null })
  await flag(h, 'vim', true); await flag(h, 'vimLines', true)
  const id = await v('article:new')
  await v('item:save', id, { title: 'Jumps', body })
  await c.send('article', id); await wait(1500)
  await caretIn('Paragraph one'); await wait(300); await normal(); await wait(200)
  let got = await margin()
  check(`“Relative” unset with Vim keys on: ${LINES} numbered lines, the caret's line 1 its own number, the rest counted out from it`, got.words.length === LINES && got.here === 0 && got.words.join(' ') === '1 1 2 3 4 5 6 7 8 9 10 11 12 13', got.words.join(' '))
  if (shots) await h.screenshot({ path: join(shots, 'v2-start-paper.png') })
  // Filmed, a frame every 50 ms for 400 ms, when asked (QA_SHOTS): the press and where it lands.
  const film = async (name, act) => {
    if (!shots) return act()
    const started = Date.now()
    const acting = act()
    for (let i = 0; Date.now() - started < 400; i++) {
      const at = Date.now()
      await h.screenshot({ path: join(shots, `v2-film-${name}-${String(i).padStart(2, '0')}-${String(at - started).padStart(3, '0')}ms.png`) }).catch(() => {})
      const left = 50 - (Date.now() - at)
      if (left > 0) await wait(left)
    }
    await acting
  }

  // 4j: the line the margin marks 4 below, past two paragraphs that wrap.
  let before = await margin()
  let aim = before.words.findIndex((w, i) => i > before.here && w === '4')
  await h.keyboard.press('4')
  await film('4j', () => keys(['j'])); got = await margin()
  check('4j lands on the line the margin marked 4 (rye, line 5)', aim === 4 && got.here === aim && (await caret()).text.startsWith('rye'), `${got.here} vs ${aim}, ${(await caret()).text}`)
  // 3k: the one marked 3 above.
  before = got
  aim = before.words.reduce((found, w, i) => (i < before.here && w === '3' ? i : found), -1)
  await keys(['3', 'k']); got = await margin()
  check('3k lands on the line the margin marked 3 above (two)', got.here === aim && (await caret()).text.startsWith('Paragraph two'), `${got.here} vs ${aim}, ${(await caret()).text}`)
  // 7G and 1G: the lines the margin numbers 7 and 1; there the caret's own number says so.
  await keys(['7', 'Shift+G']); got = await margin()
  check('7G goes to line 7 as the margin numbers it (cheese)', got.here === 6 && got.words[6] === '7' && (await caret()).text === 'cheese', `${got.here} ${got.words[got.here]} ${(await caret()).text}`)
  await keys(['1', '1', 'Shift+G']); got = await margin()
  check('11G goes to the picture, picked whole, its own line 11', got.here === 10 && got.words[10] === '11' && (await caret()).text === '[image]', `${got.here} ${got.words[got.here]} ${(await caret()).text}`)
  await keys(['1', 'j']); got = await margin()
  check('1j from the picture: the code block, line 12', got.here === 11 && got.words[11] === '12', `${got.here} ${got.words[got.here]}`)
  await keys(['9', '9', 'j']); got = await margin()
  check('99j stops on the last line, 14, never an error', got.here === LINES - 1 && got.words[LINES - 1] === String(LINES) && (await caret()).text === 'last', `${got.here} ${(await caret()).text}`)
  await keys(['1', 'Shift+G']); got = await margin()
  check('1G goes to line 1', got.here === 0 && got.words[0] === '1', `${got.here} ${got.words[0]}`)

  // d2j takes the caret's line and the two the margin marks 1 and 2 under it: from rye (5), rye, spelt and cheese
  // (5, 6, 7), bread kept without its sub-bullets; u puts them back.
  await caretIn('rye'); await wait(200); await normal()
  before = await margin()
  await keys(['d', '2', 'j']); got = await margin()
  const text = () => h.evaluate(() => document.querySelector('[data-open] .tiptap').editor.state.doc.textContent)
  let words = await text()
  check('d2j from rye takes exactly three numbered lines (rye, spelt, cheese)', got.words.length === LINES - 3 && !/rye|spelt|cheese/.test(words) && /bread/.test(words) && /first said/.test(words), `${got.words.length} lines; ${words.slice(0, 160)}`)
  await keys(['u']); got = await margin(); words = await text()
  check('u puts the three back', got.words.length === LINES && /rye.*spelt.*cheese/.test(words), `${got.words.length} lines`)
  // d1j from apples (3) takes apples and bread (3, 4); rye and spelt are lines of their own, not among those two, and stay.
  await caretIn('apples'); await wait(200); await normal()
  await keys(['d', '1', 'j']); got = await margin(); words = await text()
  check('d1j from apples takes apples and bread, and keeps bread\'s sub-bullets rye and spelt', got.words.length === LINES - 2 && !/apples|bread/.test(words) && /rye.*spelt.*cheese/.test(words), `${got.words.length} lines; ${words.slice(400, 460)}`)
  await keys(['u']); got = await margin()
  const breadHolds = await h.evaluate(() => { const bread = document.querySelector('[data-open] .tiptap').editor.state.doc.child(2).child(1); return bread.textContent === 'breadryespelt' && bread.childCount === 2 })
  check('u puts them back as they were, rye and spelt under bread', got.words.length === LINES && breadHolds, `${got.words.length} lines`)
  // >2j from two (2) reaches bread (4): apples cannot go in (first of its list), bread goes in under it, its own
  // sub-bullets with it; walked by rows, two rows down from two's first row stay in two and nothing moved.
  await caretIn('Paragraph two'); await wait(200); await normal()
  await keys(['Shift+>', '2', 'j'])
  const nested = () => h.evaluate(() => {
    const list = document.querySelector('[data-open] .tiptap').editor.state.doc.child(2)
    return list.firstChild.childCount > 1 && list.firstChild.child(1).firstChild?.textContent.startsWith('bread')
  })
  check('>2j from two reaches the line marked 2 (bread): it goes in under apples', await nested())
  await keys(['u'])
  // y2k from then said (9) takes then said and the two above it, cheese and first said.
  await caretIn('then said'); await wait(200); await normal()
  await keys(['y', '2', 'k'])
  const yanked = await h.evaluate(() => {
    const ed = document.querySelector('[data-open] .tiptap').editor
    return ed.state.plugins.find((one) => one.key.startsWith('vimMode'))?.getState(ed.state)?.register?.text ?? ''
  })
  check('y2k from then said takes cheese, first said and then said', /^cheese\s+first said\s+then said$/.test(yanked.trim()), JSON.stringify(yanked))
  // V3jd: from first said (8), V3j reaches the picture (11) and d takes the four.
  await caretIn('first said'); await wait(200); await normal()
  await keys(['Shift+V', '3', 'j']); got = await margin()
  check('V3j from first said reaches the line the margin marked 3 (the picture)', got.here === 10, `${got.here}`)
  await keys(['d']); got = await margin(); words = await text()
  const kinds = await h.evaluate(() => { const out = []; document.querySelector('[data-open] .tiptap').editor.state.doc.forEach((n) => out.push(n.type.name)); return out.join(' ') })
  check('V3jd takes exactly those four lines (the quote\'s two, the table, the picture)', got.words.length === LINES - 4 && !/first said|then said|A0/.test(words) && !/table|image/.test(kinds) && /let a = 1/.test(words), `${got.words.length} lines; ${kinds}`)
  await keys(['u']); got = await margin()
  check('u puts the four back', got.words.length === LINES, `${got.words.length} lines`)

  // Off: 4j walks four rows on the screen, landing on the row jjjj lands on (its column may differ by a letter, as
  // it did before), not on the line marked 4.
  await flag(h, 'vimLines', false)
  await caretIn('Paragraph one'); await wait(200); await normal()
  await keys(['4', 'j'])
  const counted = await caret()
  await caretIn('Paragraph one'); await wait(200)
  await keys(['j', 'j', 'j', 'j'])
  const walked = await caret()
  check('switched off, 4j walks four rows on the screen to the row jjjj reaches, not to the line marked 4 (rye)', counted.row === walked.row && counted.text === walked.text && !counted.text.startsWith('rye'), `${counted.text} row ${counted.row} vs ${walked.text} row ${walked.row}`)

  // “Relative” off: plain numbers, Vim keys on or not; on: counted out from the caret's line.
  await v('settings:set', { relativeLineNumbers: false }); await wait(400)
  await caretIn('bread'); await wait(300)
  got = await margin()
  check('“Relative” off with Vim keys on: every line its own number, 1 to 14', got.words.join(' ') === Array.from({ length: LINES }, (_, i) => i + 1).join(' ') && got.here === 3, got.words.join(' '))
  if (shots) await h.screenshot({ path: join(shots, 'v2-plain-paper.png') })
  await v('settings:set', { relativeLineNumbers: true }); await wait(400)
  got = await margin()
  check('“Relative” on: the caret\'s line keeps 4, the rest count out from it', got.words.slice(0, 6).join(' ') === '3 2 1 4 1 2', got.words.join(' '))
  // Unset again: Vim keys off, plain numbers, as everyone without Vim had; on again, counted out.
  await v('settings:set', { relativeLineNumbers: null }); await flag(h, 'vim', false); await wait(400)
  got = await margin()
  check('“Relative” unset with Vim keys off: plain numbers', got.words.slice(0, 6).join(' ') === '1 2 3 4 5 6', got.words.join(' '))
  await flag(h, 'vim', true); await wait(400)
  got = await margin()
  check('“Relative” unset with Vim keys on again: counted out', got.words.slice(0, 6).join(' ') === '3 2 1 4 1 2', got.words.join(' '))
  for (const [theme, name] of [['dark', 'dark'], ['paper', 'paper']]) {
    if (!shots) break
    await h.evaluate((theme) => { localStorage.setItem('theme', theme); window.dispatchEvent(new StorageEvent('storage', { key: 'theme' })) }, theme)
    await wait(600)
    await h.screenshot({ path: join(shots, `v2-relative-${name}.png`) })
  }

  // Settings, Writing: “Relative” under “Line numbers”, its sample both looks; “Jump by line numbers” under “Vim
  // keys”, only while Vim keys are on, its sample showing where 2j lands.
  await h.evaluate(() => localStorage.setItem('settings:section', 'Writing'))
  await c.send('view', 'home'); await wait(500); await c.send('view', 'settings'); await wait(1200)
  const row = (title) => `[data-setting-title="${title}"]`
  const shown = (title) => h.$(row(title)).then(Boolean)
  const into = async (title) => { await h.$eval(row(title), (el) => el.scrollIntoView({ block: 'center', behavior: 'instant' })); await wait(300) }
  await into('Line numbers')
  check('“Relative” shows under “Line numbers” while they are on', await shown('Relative'))
  const relativeOn = () => h.$eval(`${row('Relative')} button[role="switch"]`, (one) => one.getAttribute('aria-checked'))
  const says = () => h.$eval(row('Relative'), (one) => one.textContent)
  check('unset, it is on with Vim keys on, and says it starts as “Vim keys” are and stays where put', (await relativeOn()) === 'true' && /It starts as “Vim keys” are, on or off, and stays where you put it/.test(await says()), await says())
  // The switch stands where it stood when pressed: its words stay the same, so the row keeps its height.
  const place = () => h.$eval(`${row('Relative')} button[role="switch"]`, (one) => { const r = one.getBoundingClientRect(); return `${Math.round(r.left)},${Math.round(r.top)}` })
  const spot = await place()
  // Each number as drawn: ink for the look chosen, faded ink for the other, told apart by their colours.
  const sample = () => h.$eval(`${row('Relative')} [data-preview="relative-lines"]`, (one) => {
    const ink = getComputedStyle(one.querySelector('[data-chosen]')).color
    return [...one.querySelectorAll(':scope > span')].map((r) => [...r.querySelectorAll(':scope > span')].slice(0, 2).map((n) => `${n.textContent}@${getComputedStyle(n).color === ink ? 'ink' : 'faded'}`).join('/')).join(' ')
  })
  check('its sample shows both looks, relative in ink', (await sample()) === '12@faded/1@ink 13@faded/13@ink 14@faded/1@ink', await sample())
  await film('relative-off', () => h.click(`${row('Relative')} button[role="switch"]`)); await wait(600)
  check('pressed off: saved off, the plain numbers in ink, the switch where it was pressed', (await v('settings')).relativeLineNumbers === false && (await sample()) === '12@ink/1@faded 13@ink/13@faded 14@ink/1@faded' && (await place()) === spot, `${await sample()} at ${await place()} (was ${spot})`)
  if (shots) await h.screenshot({ path: join(shots, 'v2-settings-lines.png') })
  const dark = async (name) => {
    await h.evaluate(() => { localStorage.setItem('theme', 'dark'); window.dispatchEvent(new StorageEvent('storage', { key: 'theme' })) }); await wait(600)
    await h.screenshot({ path: join(shots, name) })
    await h.evaluate(() => { localStorage.setItem('theme', 'paper'); window.dispatchEvent(new StorageEvent('storage', { key: 'theme' })) }); await wait(600)
  }
  if (shots) await dark('v2-settings-lines-dark.png')
  await h.click(`${row('Relative')} button[role="switch"]`); await wait(600)
  check('pressed on again: saved on', (await v('settings')).relativeLineNumbers === true)
  await v('settings:set', { lineNumbers: false }); await wait(500)
  check('with line numbers off, “Relative” is not shown', !(await shown('Relative')))
  await v('settings:set', { lineNumbers: true }); await wait(500)
  await into('Vim keys')
  check('“Jump by line numbers” shows under “Vim keys” while they are on', await shown('Jump by line numbers'))
  const jumpOn = () => h.$eval(`${row('Jump by line numbers')} [data-preview="line-jumps"]`, (one) => one.hasAttribute('data-on'))
  check('it is off (set off above), its sample showing 2j on the wrapped row', (await jumpOn()) === false)
  await film('jump-on', () => h.click(`${row('Jump by line numbers')} button[role="switch"]`)); await wait(500)
  check('pressed on: stored on, its sample showing 2j on the line marked 2', (await h.evaluate(() => localStorage.getItem('vimLines'))) === 'on' && (await jumpOn()) === true)
  if (shots) await h.screenshot({ path: join(shots, 'v2-settings-vim.png') })
  if (shots) await dark('v2-settings-vim-dark.png')
  await h.click(`${row('Vim keys')} button[role="switch"]`); await wait(500)
  check('with Vim keys off, “Jump by line numbers” is not shown', !(await shown('Jump by line numbers')))
  check('“Relative”, set on above, stays on with Vim keys off: once set it no longer follows them', (await relativeOn()) === 'true' && (await v('settings')).relativeLineNumbers === true, await relativeOn())
  await h.click(`${row('Vim keys')} button[role="switch"]`); await wait(500)
  check('Vim keys on again: it shows, still on', (await shown('Jump by line numbers')) && (await jumpOn()) === true)
  // The smallest window, 560 by 400: both rows whole, their samples and switches inside the page.
  const size = (w, hh) => c.electron.evaluate(({ BrowserWindow }, [w, hh]) => BrowserWindow.getAllWindows().find((one) => one.webContents.getURL().includes('home.html')).setSize(w, hh), [w, hh])
  await size(560, 400); await wait(1000)
  const inside = []
  for (const title of ['Relative', 'Jump by line numbers']) {
    await into(title)
    inside.push(await h.$eval(row(title), (one) => {
      const page = one.closest('[data-setting]').parentElement.getBoundingClientRect()
      const parts = [...one.querySelectorAll('[data-preview], button[role="switch"]')].map((el) => el.getBoundingClientRect())
      return parts.length === 2 && parts.every((r) => r.left >= page.left && r.right <= page.right + 0.5 && r.width > 0)
    }))
    if (shots) await h.screenshot({ path: join(shots, `v2-narrow-${title.split(' ')[0].toLowerCase()}.png`) })
  }
  check('at 560 by 400 both rows stand whole: sample and switch inside the page', inside.every(Boolean), JSON.stringify(inside))
  await size(1100, 900); await wait(800)

  // Quick capture shares the switches: the same jumps by the same lines, with no numbers shown there. Driven where
  // it stands, put away, as qa/vim-visual-line.mjs drives it.
  const BOX = '.tiptap.ProseMirror.haligtree-editor:not(.is-line):not(.is-plain)'
  await page.$eval(BOX, (el, json) => el.editor.commands.setContent(json), body)
  await page.waitForTimeout(400)
  await caretIn('Paragraph one', page, BOX); await page.waitForTimeout(200); await normal(page, BOX)
  await keys(['4', 'j'], page)
  const boxAt = []
  boxAt.push((await caret(page, BOX)).text)
  await keys(['3', 'k'], page); boxAt.push((await caret(page, BOX)).text)
  await keys(['7', 'Shift+G'], page); boxAt.push((await caret(page, BOX)).text)
  await keys(['1', '1', 'Shift+G'], page); boxAt.push((await caret(page, BOX)).text)
  check('quick capture: 4j, 3k, 7G and 11G land on rye, two, cheese and the picture, as in the main window', boxAt[0].startsWith('rye') && boxAt[1].startsWith('Paragraph two') && boxAt[2] === 'cheese' && boxAt[3] === '[image]', boxAt.join(' | '))
  await page.$eval(BOX, (el) => el.editor.commands.setContent(''))
  check('no page errors', c.errors.length === 0, c.errors.slice(0, 3).join(' | '))
} catch (error) {
  check('the run finished', false, error.message.split('\n')[0])
} finally {
  await c.close?.()
}
done()
