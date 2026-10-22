// Note windows, split panes and peeks, and a piece's word aim: each move
// played in the sandbox and checked, with pictures of each state.
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-pages/main/index.js HALIGTREE_QA_AWAY=1 HALIGTREE_QA_VIRTUAL=1 SHOTS=<dir> THEME=paper node qa/pages.mjs
import { mkdirSync } from 'fs'
import { sandbox } from './sandbox-lib.mjs'

const theme = process.env.THEME ?? 'paper'
const style = process.env.STYLE ?? ''
const dir = process.env.SHOTS ?? `${process.env.QA_DATA}/pages`
mkdirSync(dir, { recursive: true })
const c = await sandbox({ width: 1100, height: 720 })
const { h, electron, errors } = c
if (style) await h.evaluate((s) => localStorage.setItem('style', s), style)
await c.theme(theme)
await c.size(1100, 720)
await h.evaluate(() => void (window.__vis = (sel) => [...document.querySelectorAll(sel)].find((one) => one.offsetParent)))
const tag = `${theme}${style ? `-${style}` : ''}`
const shot = (win, name) => win.screenshot({ path: `${dir}/${name}-${tag}.png` }).catch((e) => console.log('shot failed', name, e.message))
let pass = 0
let fail = 0
const check = (ok, what, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}${extra ? `  (${extra})` : ''}`) }
const wait = (ms) => h.waitForTimeout(ms)
const bounds = (part) => electron.evaluate(({ BrowserWindow }, part) => {
  const win = BrowserWindow.getAllWindows().find((one) => one.webContents.getURL().includes(part))
  return win ? { ...win.getBounds(), opacity: win.qaOpacity ?? null, top: win.isAlwaysOnTop() } : null
}, part)
const noteWin = () => electron.windows().find((w) => w.url().includes('note='))

// --- a capture with words, open in the Inbox's page
const notes = await h.evaluate(() => window.api.captures.list())
const target = notes.find((one) => one.status === 'open' && !one.private && (one.label ?? '').length > 8) ?? notes[0]
await c.send('capture', target.id)
await wait(1400)
const editor = '[data-apart-note] .note-pane .ProseMirror'
check(await h.locator(editor).count() > 0, 'a capture opens in the main window inside its place', target.label)

// --- F4: ⌘O sends it to a window of its own, caret carried
const startAt = await h.evaluate((sel) => {
  const ed = window.__vis(sel).editor
  const at = Math.min(ed.state.doc.content.size - 1, 5)
  ed.chain().focus().setTextSelection(at).run()
  return at
}, editor)
const pane = await h.evaluate((sel) => { const r = window.__vis(sel).closest('.note-pane').getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height } }, editor)
const home = await bounds('view=home')
await h.keyboard.press('Meta+o')
// Grown from the note's own place: the first frames sit near where the note was.
let first = null
for (let i = 0; i < 60 && !first; i++) { first = await bounds('note='); if (!first) await wait(20) }
check(!!first, 'the note gets a window of its own')
const grewFrom = first && Math.abs(first.width - pane.width) < 4 && Math.abs(first.height - pane.height) < 4
check(grewFrom, 'the window starts where the note was in the main window', first && `${first.x},${first.y} ${first.width}x${first.height} vs pane ${home.x + pane.x},${home.y + pane.y} ${pane.width}x${pane.height}`)
let settled = null
for (let i = 0; i < 60; i++) { await wait(100); settled = await bounds('note='); if (settled?.width === 720 && settled.height === 640) break }
check(settled && settled.width === 720 && settled.height === 640, 'then glides to its own size, 720×640', settled && `${settled.width}x${settled.height}`)
check((await h.locator('[data-apart-trace]').count()) === 1, 'F3: the main window keeps a trace where the note was')
const traceText = await h.locator('[data-apart-trace]').innerText().catch(() => '')
check(/is open in its own window/.test(traceText) && /Bring it back/.test(traceText) && /Show its window/.test(traceText), 'the trace says where it went, with a way to it and a way back', traceText.replace(/\s+/g, ' ').slice(0, 120))
await shot(h, 'trace')
const win = noteWin()
await win.waitForSelector('.ProseMirror', { timeout: 8000 })
await win.waitForTimeout(600)
const carried = await win.evaluate(() => document.querySelector('.note-pane .ProseMirror').editor.state.selection.from)
check(carried === startAt, 'the caret arrives where it was', `${carried} vs ${startAt}`)
check(await win.locator('[data-open-in-haligtree]').count() === 1, 'the note window has Open in Haligtree')
await shot(win, 'note-window')

// --- F4 back: ⌘O in the note window, the caret moved first
const backAt = await win.evaluate(() => {
  const ed = document.querySelector('.note-pane .ProseMirror').editor
  const at = Math.min(ed.state.doc.content.size - 1, 9)
  ed.chain().focus().setTextSelection(at).run()
  return at
})
await win.keyboard.press('Meta+o')
await wait(120)
const onTop = await bounds('note=')
check(onTop?.top === true, 'going home, the small window stays on top while the main window opens under it')
let gone = false
for (let i = 0; i < 40 && !gone; i++) { await wait(100); gone = !(await bounds('note=')) }
check(gone, 'and closes once it has landed')
await wait(600)
check((await h.locator('[data-apart-trace]').count()) === 0 && (await h.locator(editor).count()) > 0, 'the note is back in its place in the main window')
const landed = await h.evaluate((sel) => window.__vis(sel).editor.state.selection.from, editor)
check(landed === backAt, 'with the caret where it was left in the small window', `${landed} vs ${backAt}`)

// --- F3: Bring it back from the trace, and a closed window gives the note back
await h.locator('[data-open-apart]').first().click()
for (let i = 0; i < 40 && !noteWin(); i++) await wait(100)
await wait(900)
await h.locator('[data-apart-back]').click()
gone = false
for (let i = 0; i < 40 && !gone; i++) { await wait(100); gone = !(await bounds('note=')) }
check(gone && (await h.locator('[data-apart-trace]').count()) === 0, 'Bring it back on the trace brings the note home')
await h.keyboard.press('Meta+o')
for (let i = 0; i < 40 && !noteWin(); i++) await wait(100)
await wait(900)
await noteWin()?.close().catch(() => {})
await electron.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((one) => one.webContents.getURL().includes('note='))?.close())
await wait(900)
check((await h.locator('[data-apart-trace]').count()) === 0 && (await h.locator(editor).count()) > 0, 'closing the small window puts the note back where it was')

// --- F1: a word aim, through ⌘K's own question
const words = await h.evaluate((sel) => window.__vis(sel).editor.getText().split(/\s+/).filter(Boolean).length, editor)
await h.evaluate(() => window.dispatchEvent(new CustomEvent('haligtree:aim')))
await wait(400)
const askBox = h.locator('[role="dialog"] input, [role="dialog"] textarea').first()
await askBox.fill(`${words + 400} by friday`)
await askBox.press('Enter')
await wait(700)
const aim = h.locator('[data-word-aim]:visible').first()
check((await aim.count()) === 1 && (await aim.getAttribute('data-word-aim')) === 'on', 'an aim set shows its hairline, filling', await aim.innerText().catch(() => ''))
check(/of [\d,]+ words · by /.test(await aim.innerText().catch(() => '')), 'it says how far, and by when')
await shot(h, 'aim-on')
const counted = Number(((await aim.innerText()).match(/([\d,]+) of/) ?? ['', '0'])[1].replace(/,/g, ''))
await h.evaluate(([sel, n]) => {
  const id = window.__vis(sel).closest('[data-apart-note]').getAttribute('data-apart-note')
  localStorage.setItem(`mf:aim:capture-${id}`, JSON.stringify({ words: n, by: null }))
  window.dispatchEvent(new CustomEvent('haligtree:aim-changed', { detail: `capture-${id}` }))
}, [editor, Math.ceil(counted / 0.93)])
await wait(500)
check((await aim.getAttribute('data-word-aim')) === 'charging' && /Nearly there/.test(await aim.innerText()), 'from 90% it charges and says how many are left', await aim.innerText())
await shot(h, 'aim-charging')
await h.evaluate((sel) => { const ed = window.__vis(sel).editor; ed.chain().focus('end').insertContent(' ' + 'and then some more words '.repeat(14)).run() }, editor)
await wait(700)
const doneText = await aim.innerText()
check((await aim.getAttribute('data-word-aim')) === 'done' && /That's the piece\./.test(doneText), 'at the aim: "That\'s the piece.", once', doneText)
await shot(h, 'aim-done')
await h.evaluate(() => window.__vis('[data-apart-note] .note-pane .ProseMirror').editor.commands.undo())
await wait(400)

// --- G1, G3: split, even out, close the others, and a pane folding away
await h.evaluate(() => document.activeElement?.blur())
await h.keyboard.press('Meta+Alt+\\')
await wait(900)
check((await h.locator('[data-split-area] [data-pane]').count()) === 2, 'split: two panes')
const widthsOf = () => h.evaluate(() => [...document.querySelectorAll('[data-split-area] > [data-pane]')].map((one) => Math.round(one.getBoundingClientRect().width)))
// One pane made wider, then ⌘K's Even out panes.
await h.evaluate(() => {
  const handle = document.querySelector('[data-pane-divider]').getBoundingClientRect()
  return handle.x
})
const div = await h.locator('[data-pane-divider]').boundingBox()
await h.mouse.move(div.x + 4, div.y + 100)
await h.mouse.down()
await h.mouse.move(div.x + 160, div.y + 100, { steps: 6 })
await h.mouse.up()
await wait(500)
const uneven = await widthsOf()
const runK = async (words) => {
  await h.keyboard.press('Meta+k')
  await wait(400)
  await h.keyboard.type(words)
  await wait(500)
  await h.keyboard.press('Enter')
  await wait(700)
}
await runK('Even out panes')
const evened = await widthsOf()
check(Math.abs(uneven[0] - uneven[1]) > 100 && Math.abs(evened[0] - evened[1]) <= 2, '⌘K Even out panes shares the room equally', `${uneven} → ${evened}`)
// The change is in front of you, so no toast (home.tsx evenPanes): ⌘Z lays the old widths back.
await h.evaluate(() => document.activeElement?.blur?.())
await h.keyboard.press('Meta+z'); await wait(600)
const unevened = await widthsOf()
check(Math.abs(unevened[0] - unevened[1]) > 100, 'and ⌘Z puts the widths back', `${evened} → ${unevened}`)
await runK('Even out panes')
// Closing the right pane: it narrows and fades while the left one widens on a spring.
const closing = await h.locator('[data-split-area] > [data-pane]').nth(1).getAttribute('data-pane')
await h.evaluate((key) => {
  window.__frames = []
  const t0 = performance.now()
  const step = () => {
    const gone = document.querySelector(`[data-pane="${key}"]`)
    const kept = document.querySelector('[data-split-area] > [data-pane]:not([data-pane="' + key + '"])')
    window.__frames.push({ t: Math.round(performance.now() - t0), gone: gone ? Math.round(gone.getBoundingClientRect().width) : 0, fade: gone ? Number(getComputedStyle(gone).opacity).toFixed(2) : '0', kept: Math.round(kept.getBoundingClientRect().width) })
    if (performance.now() - t0 < 450) requestAnimationFrame(step)
  }
  requestAnimationFrame(step)
  document.querySelector(`[data-pane="${key}"] [data-pane-close]`).click()
}, closing)
await wait(80)
await shot(h, 'pane-closing')
await wait(450)
const mid = await h.evaluate(() => window.__frames)
await wait(500)
const after = await widthsOf()
// Widths change at once, never frame by frame (panes.tsx: that rewrapped every pane's words as it went): the closed one simply goes.
const between = mid.filter((one) => one.gone > 0 || (one.kept > evened[0] + 10 && one.kept < mid.at(-1).kept - 10))
check(mid.length > 0 && between.length === 0, 'G1: the closed pane simply goes, and its neighbour takes the room in one step', mid.filter((_, i) => i % 3 === 0).map((one) => `${one.t}ms ${one.gone}/${one.kept} ${one.fade}`).join(', '))
check(after.length === 1 && after[0] > evened[0] * 1.8, 'then the one left has all the room', `${after}`)
// Close the other panes, from ⌘K, with Undo.
await h.keyboard.press('Meta+Alt+\\')
await wait(900)
await runK('Close the other panes')
check((await widthsOf()).length === 1, '⌘K Close the other panes leaves one')

// --- G2: a peek opens beside
await c.send('capture', target.id)
await wait(1200)
const other = notes.find((one) => one.id !== target.id && one.status !== 'discarded')
await h.evaluate(([sel, id, label]) => {
  const ed = window.__vis(sel).editor
  ed.chain().focus('end').insertContent([{ type: 'paragraph', content: [{ type: 'noteLink', attrs: { id, label } }] }]).run()
}, [editor, other.id, other.label ?? 'note'])
await wait(500)
const link = h.locator(`${editor} a.tiptap-note-link[data-note="${other.id}"]`).first()
console.log('links', await link.count())
await link.scrollIntoViewIfNeeded()
await link.hover()
await wait(300)
await link.evaluate((el) => el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })))
await wait(1200)
check(await h.locator('[data-note-preview] [data-open-beside]').count() === 1, 'G2: the peek offers Open beside')
await shot(h, 'peek')
await h.locator('[data-note-preview] [data-open-beside]').click()
await wait(120)
await shot(h, 'peek-growing')
await wait(900)
check((await widthsOf()).length === 2, 'Open beside grows the peek into a pane beside')
await h.evaluate(() => window.__vis('[data-apart-note] .note-pane .ProseMirror')?.editor?.commands.undo())

// --- F6: a drawing window shows its paper and picture while the canvas loads
await h.evaluate(() => window.api.openDrawing('qa-drawing', { elements: [], appState: {}, files: {} }, 'A test note', '<svg viewBox="0 0 100 50" xmlns="http://www.w3.org/2000/svg"><rect x="5" y="5" width="90" height="40" rx="6" fill="none" stroke="currentColor" stroke-width="2"/></svg>'))
let drawing = null
for (let i = 0; i < 60 && !drawing; i++) { drawing = electron.windows().find((w) => w.url().includes('drawing=')); if (!drawing) await wait(50) }
await drawing.waitForLoadState('domcontentloaded')
let paper = false
for (let i = 0; i < 80 && !paper; i++) { paper = await drawing.evaluate(() => !!document.querySelector('[data-drawing-paper] svg')).catch(() => false); if (!paper) await drawing.waitForTimeout(15) }
check(paper, 'F6: the drawing window shows its paper and the picture at once')
await shot(drawing, 'drawing-paper')
await drawing.waitForSelector('.drawing-surface', { timeout: 15000 })
await drawing.waitForTimeout(900)
check(await drawing.evaluate(() => !document.querySelector('[data-drawing-paper]')), 'then the live canvas takes over')
await drawing.close().catch(() => {})

console.log(errors.length ? `errors:\n${errors.slice(0, 8).join('\n')}` : 'no page errors')
console.log(`${pass} passed, ${fail} failed`)
await c.close()
process.exit(fail ? 1 : 0)
