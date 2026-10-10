// Reword before keeping: selected words open a card by them, filled with the
// words, to change before they are kept as a capture or an idea. Checks the
// database holds the new words and the link back, two cards waiting at once
// both save, and Esc or a click elsewhere never loses words. In the main
// window, a note's own window and the box; screenshots in light and dark.
//
//   npx electron-vite build --outDir out-reword
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-reword/main/index.js MINDFLOW_QA_AWAY=1 SHOT=<dir> node qa/reword.mjs
import { mkdirSync, writeFileSync } from 'fs'
import { sandbox } from './sandbox-lib.mjs'

const SHOT = process.env.SHOT ?? `${process.env.QA_DATA}/shots`
mkdirSync(SHOT, { recursive: true })
const c = await sandbox({ width: 1100, height: 760 })
const { electron, h, page: box, v } = c
let failed = 0
const check = (name, ok, detail = '') => { if (!ok) failed++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`) }
const shot = async (p, name) => writeFileSync(`${SHOT}/${name}.png`, await p.screenshot())

const SOURCE = 'The quick brown fox jumps over the lazy dog. Second sentence about rivers. Third line on mountains and a fourth on tea.'
const source = await h.evaluate((body) => window.api.captures.create({ body }), SOURCE)

/** Select a phrase in the page's note editor holding the source words. */
const select = (p, phrase) => p.evaluate((phrase) => {
  const dom = [...document.querySelectorAll('.ProseMirror')].find((one) => one.textContent.includes(phrase))
  const editor = dom?.editor
  if (!editor) return false
  let at = -1
  editor.state.doc.descendants((node, pos) => {
    if (at < 0 && node.isText && node.text.includes(phrase)) at = pos + node.text.indexOf(phrase)
  })
  if (at < 0) return false
  editor.chain().focus().setTextSelection({ from: at, to: at + phrase.length }).run()
  return true
}, phrase)
const card = (p) => p.evaluate(() => {
  const one = document.querySelector('[data-reword]')
  const field = one?.querySelector('textarea')
  return one && { value: field.value, focused: document.activeElement === field, caret: field.selectionStart, end: field.value.length, kind: one.getAttribute('aria-label'), question: !!one.querySelector('input') }
})
const waiting = (p) => p.evaluate(() => [...document.querySelectorAll('[data-reword-draft]')].map((one) => one.textContent.trim()))
const captureWith = async (words) => (await h.evaluate(() => window.api.captures.list())).find((one) => (one.label ?? '').trim() === words)
const linkedBack = async (id, to) => ((await v('lineage', id))?.from ?? []).some((one) => one.id === to)
const replaceWords = async (p, words) => { await p.keyboard.press('Meta+a'); await p.keyboard.type(words, { delay: 10 }) }

// --- the main window -----------------------------------------------------------------
await c.theme('light')
await c.send('capture', source)
await h.waitForTimeout(1500)
check('main: source note open', await select(h, 'quick brown fox'))
await h.waitForTimeout(400)
await h.locator('[aria-label="Capture"]:visible').first().click()
await h.waitForTimeout(300)
let now = await card(h)
check('main: card opens with the selected words', now?.value === 'quick brown fox', JSON.stringify(now))
check('main: caret at the end of the words', now?.focused && now.caret === now.end)
await shot(h, 'main-light-capture')
await h.keyboard.type(' is quick to move', { delay: 10 })
// The note scrolls behind it: wheel over the note, the card stays.
await h.mouse.move(300, 400); await h.mouse.wheel(0, 200); await h.waitForTimeout(200)
check('main: still open after the note scrolls', !!(await card(h)))
await h.keyboard.press('Meta+Enter')
await h.waitForTimeout(900)
let made = await captureWith('quick brown fox is quick to move')
check('main: reworded capture saved', !!made)
check('main: capture links back to its note', made && await linkedBack(made.id, source))
const toastText = await h.evaluate(() => document.querySelector('[role=status]')?.textContent ?? '')
check('main: toast offers Open and Undo', /Open/.test(toastText) && /Undo/.test(toastText), toastText)
check('main: card gone after saving', !(await card(h)))

// Undo takes it back.
await h.evaluate(() => [...document.querySelectorAll('[role=status] button')].find((one) => /Undo/.test(one.textContent))?.click())
await h.waitForTimeout(600)
check('main: Undo removes the capture', !(await captureWith('quick brown fox is quick to move')))

// An idea by the keys, with its question.
await select(h, 'lazy dog'); await h.waitForTimeout(200)
await h.keyboard.press('Control+Meta+i'); await h.waitForTimeout(300)
now = await card(h)
check('main: ⌃⌘I opens a gem card with its question field', now?.value === 'lazy dog' && now.question && /gem/.test(now.kind), JSON.stringify(now))
await replaceWords(h, 'Dogs rest most of the day')
await h.locator('[data-reword] input').fill('How much of the day do dogs rest?')
await shot(h, 'main-light-idea')
await h.locator('[data-reword] textarea').focus()
await h.keyboard.press('Meta+Enter'); await h.waitForTimeout(900)
const nugget = (await v('items', 'nugget')).find((one) => one.title === 'Dogs rest most of the day')
const full = nugget && await v('item', nugget.id)
check('main: reworded idea saved', !!nugget)
check('main: idea keeps its question and its link back', full?.prompt === 'How much of the day do dogs rest?' && full?.captureId === source, JSON.stringify({ prompt: full?.prompt, captureId: full?.captureId }))

// Esc: unchanged words simply go (they are still in the note); changed words wait in the corner.
await select(h, 'jumps over'); await h.waitForTimeout(200)
await h.keyboard.press('Control+Meta+c'); await h.waitForTimeout(250)
await h.keyboard.press('Escape'); await h.waitForTimeout(250)
check('main: Esc on unchanged words closes the card', !(await card(h)) && (await waiting(h)).length === 0)
check('main: Esc leaves the main window where it was', await h.evaluate((id) => document.body.textContent.includes('Second sentence about rivers'), source))
await select(h, 'Second sentence'); await h.waitForTimeout(200)
await h.keyboard.press('Control+Meta+c'); await h.waitForTimeout(250)
await h.keyboard.type(' A', { delay: 10 })
await h.keyboard.press('Escape'); await h.waitForTimeout(300)
check('main: Esc on changed words keeps them waiting', (await waiting(h)).includes('Second sentence A'), JSON.stringify(await waiting(h)))

// A click elsewhere tucks the card away, words kept: two at once.
await select(h, 'mountains'); await h.waitForTimeout(200)
await h.keyboard.press('Control+Meta+i'); await h.waitForTimeout(250)
await h.keyboard.type(' B', { delay: 10 })
const note = await h.evaluate(() => { const r = [...document.querySelectorAll('.ProseMirror p')].find((one) => one.textContent.includes('rivers')).getBoundingClientRect(); return { x: r.right - 20, y: r.bottom - 6 } })
await h.mouse.click(note.x, note.y); await h.waitForTimeout(350)
const two = await waiting(h)
check('main: a click elsewhere keeps the words', two.includes('mountains B'), JSON.stringify(two))
check('main: two drafts waiting at once', two.length === 2)
// The note took that click: it is still editable behind them.
await h.keyboard.type('Z', { delay: 10 }); await h.waitForTimeout(200)
check('main: the note takes typing with drafts waiting', await h.evaluate(() => [...document.querySelectorAll('.ProseMirror')].some((one) => one.textContent.includes('Z'))), await h.evaluate((n) => `${document.activeElement?.outerHTML.slice(0, 120)} | at point ${document.elementFromPoint(n.x, n.y)?.outerHTML.slice(0, 80)}`, note))
check('main: the click put the caret there, the selected words are untouched', await h.evaluate(() => [...document.querySelectorAll('.ProseMirror')].some((one) => one.textContent.includes('mountains'))))
await h.keyboard.press('Backspace')
await shot(h, 'main-light-stack')

// Both saved, one after the other from the corner.
for (const words of ['Second sentence A', 'mountains B']) {
  await h.locator(`[data-reword-draft]:has-text("${words}") button`).first().click(); await h.waitForTimeout(250)
  await h.keyboard.press('Meta+Enter'); await h.waitForTimeout(700)
}
const capA = await captureWith('Second sentence A')
const nugB = (await v('items', 'nugget')).find((one) => one.title === 'mountains B')
check('main: both waiting drafts saved', !!capA && !!nugB)
check('main: both link back', capA && await linkedBack(capA.id, source) && (await v('item', nugB?.id))?.captureId === source)
check('main: corner empty after both saved', (await waiting(h)).length === 0)

// ⌘↵ on the selection: kept as is, no card.
await select(h, 'fourth on tea'); await h.waitForTimeout(250)
await h.keyboard.press('Meta+Enter'); await h.waitForTimeout(800)
check('main: ⌘↵ keeps the selection as a capture at once', !!(await captureWith('fourth on tea')) && !(await card(h)))

// Dark, with a card open and one waiting.
await c.theme('dark')
await c.send('capture', source); await h.waitForTimeout(1500)
await select(h, 'Third line'); await h.waitForTimeout(200)
await h.keyboard.press('Control+Meta+c'); await h.waitForTimeout(250)
await h.keyboard.type(', reworded', { delay: 10 })
await h.mouse.click(note.x, note.y); await h.waitForTimeout(300)
await select(h, 'brown fox'); await h.waitForTimeout(200)
await h.keyboard.press('Control+Meta+i'); await h.waitForTimeout(300)
await shot(h, 'main-dark-idea-and-stack')
await h.keyboard.press('Escape'); await h.waitForTimeout(200)
// The waiting one survives a reload of the window.
await h.reload(); await h.waitForTimeout(1500)
check('main: a waiting draft survives a reload', (await waiting(h)).includes('Third line, reworded'), JSON.stringify(await waiting(h)))
await h.locator('[data-reword-draft]:has-text("Third line") button').last().click(); await h.waitForTimeout(500)
check('main: the ✕ lets it go', (await waiting(h)).length === 0)
await c.theme('light')

// --- a note in its own window ---------------------------------------------------------
await v('notes:window', 'capture', source)
let nw
for (let i = 0; i < 40 && !nw; i++) { nw = electron.windows().find((w) => w.url().includes('note=capture')); await h.waitForTimeout(250) }
await nw.waitForSelector('.ProseMirror'); await nw.waitForTimeout(1200)
await select(nw, 'rivers'); await nw.waitForTimeout(400)
await nw.locator('[aria-label="Gem"]:visible').first().click(); await nw.waitForTimeout(300)
now = await card(nw)
check('note window: card opens', now?.value === 'rivers', JSON.stringify(now))
await nw.keyboard.type(' run to the sea', { delay: 10 })
await shot(nw, 'note-window-light-idea')
await nw.keyboard.press('Meta+Enter'); await nw.waitForTimeout(900)
const fromWindow = (await v('items', 'nugget')).find((one) => one.title === 'rivers run to the sea')
check('note window: idea saved with its link back', fromWindow && (await v('item', fromWindow.id))?.captureId === source)
await electron.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().includes('note='))?.close())

// --- the box --------------------------------------------------------------------------
await electron.evaluate(({ BrowserWindow }) => { const w = BrowserWindow.getAllWindows().find((w) => !/[?&](view|note)=/.test(w.webContents.getURL())); w?.show(); w?.focus() })
await box.waitForTimeout(600)
await c.qa.reset()
await c.qa.type(['Box thought about gardens and slow mornings'])
await select(box, 'slow mornings'); await box.waitForTimeout(300)
await box.keyboard.press('Control+Meta+c'); await box.waitForTimeout(300)
now = await card(box)
check('box: card opens', now?.value === 'slow mornings', JSON.stringify(now))
await box.keyboard.type(' are good', { delay: 10 })
await shot(box, 'box-light-capture')
await box.keyboard.press('Escape'); await box.waitForTimeout(300)
const shown = await electron.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((w) => !/[?&](view|note)=/.test(w.webContents.getURL()))?.isVisible())
check('box: Esc closes only the card, the box stays', shown)
check('box: the changed words wait in the corner', (await waiting(box)).includes('slow mornings are good'))
await box.locator('[data-reword-draft] button').first().click(); await box.waitForTimeout(250)
await box.keyboard.press('Meta+Enter'); await box.waitForTimeout(900)
check('box: ⌘↵ in the card saves it, not the note', !!(await captureWith('slow mornings are good')) && await box.evaluate(() => document.querySelector('.ProseMirror')?.textContent.includes('Box thought')))

check('no page errors', !c.errors.some((one) => /PAGEERROR/.test(one)), c.errors.filter((one) => /PAGEERROR/.test(one)).join(' | ').slice(0, 300))
console.log(failed ? `${failed} FAILED` : 'ALL PASS')
await c.close()
process.exit(failed ? 1 : 0)
