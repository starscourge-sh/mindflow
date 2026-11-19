// A press in a long note just after it opens is not lost (found by A13, 14 Nov: as the note settled in its first
// second, long-document.ts told it its old selection over the press, so the press was lost and the letters typed next
// went over the note's first letter, "Exam" becoming "zqxam"). The largest note's row in the Inbox is pressed with a
// real pointer; the moment its first words are on the screen, a line of them is pressed at its end, two letters are
// typed, and ⌘A is pressed, all with real input. Then: the caret went where the press was, the letters are in that
// line in order, ⌘A picked the whole note, and what is stored is the whole note with the two letters added and nothing
// else changed (read straight from the copy's database file). Run on a COPY of a book (QA_DATA), never the book itself:
//
//   QA_DATA=<copy> QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/long-note-press-early.mjs
import { DatabaseSync } from 'node:sqlite'
import { existsSync, readFileSync } from 'fs'
import { loadavg } from 'os'
import { join } from 'path'
import { sandbox } from './sandbox-lib.mjs'
import { checks } from './harness.mjs'

const { check, done } = checks()
const SEL = '.tiptap.ProseMirror.haligtree-editor:not(.is-line):not(.is-plain)'
const root = process.env.QA_DATA
if (!root) throw new Error('QA_DATA must be a copy of a book')
const shelf = existsSync(join(root, 'books.json')) ? JSON.parse(readFileSync(join(root, 'books.json'), 'utf8')) : null
const file = shelf?.last && shelf.last !== 'default' ? join(root, 'books', shelf.last, 'haligtree.db') : join(root, 'haligtree.db')
const read = (id) => {
  const db = new DatabaseSync(file, { readOnly: true })
  try {
    return id
      ? db.prepare('select id, body from captures where id = ?').get(id)
      : db.prepare("select id, body from captures where status = 'open' and kind = 'note' and body is not null order by length(body) desc limit 1").get()
  } finally {
    db.close()
  }
}
const note = read()
const stored = JSON.parse(note.body)
const wordsOf = (node) => (node.type === 'text' ? (node.text ?? '') : (node.content ?? []).map(wordsOf).join(''))
const words = wordsOf(stored.content.find((block) => wordsOf(block).trim().length >= 12) ?? stored.content[0]).trim().slice(0, 16)
const load = () => `load ${loadavg()[0].toFixed(1)}`
console.log(`note ${note.id.slice(0, 8)}: ${stored.content.length} blocks; its first words "${words}"  (${load()})`)
const TYPED = 'zq'

const c = await sandbox({ width: 1300, height: 900, seeded: false })
const { h, send } = c

try {
  await h.evaluate(() => window.api.haligtree('onboarding:set', { welcomed: new Date().toISOString(), newsSeen: true, welcoming: false, pageHints: false }))
  await h.evaluate(() => window.api.haligtree('settings:set', { sounds: false, hintRate: 0 }))
  // LINES=off: the run with line numbers off, to tell what they change.
  if (process.env.LINES === 'off') await h.evaluate(() => window.api.haligtree('settings:set', { lineNumbers: false }))
  await h.waitForTimeout(2500)
  await send('view', 'inbox')
  await h.waitForTimeout(1500)
  const spot = await h.evaluate(async (id) => {
    const frame = () => new Promise((next) => requestAnimationFrame(() => requestAnimationFrame(next)))
    const find = () => document.querySelector(`[data-row][data-id="${id}"]`)
    let box = document.querySelector('[data-row]')?.parentElement ?? null
    while (box && !/auto|scroll/.test(getComputedStyle(box).overflowY)) box = box.parentElement
    for (let i = 0; i < 400 && !find() && box && box.scrollTop + box.clientHeight < box.scrollHeight - 2; i++) { box.scrollBy({ top: box.clientHeight * 0.8, behavior: 'instant' }); await frame() }
    const row = find()
    if (!row) return null
    row.scrollIntoView({ block: 'center', behavior: 'instant' })
    await frame()
    const r = row.getBoundingClientRect()
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
  }, note.id)
  if (!spot) throw new Error('The note has no row in the Inbox')
  await h.mouse.move(spot.x, spot.y)
  await h.waitForTimeout(400)
  await h.mouse.click(spot.x, spot.y)
  // The first words on the screen: a line of words in the first screen, and its end.
  const handle = await h.waitForFunction(([sel, words]) => {
    const ed = [...document.querySelectorAll(sel)].find((one) => one.isConnected && one.getBoundingClientRect().height > 0 && one.textContent.includes(words))
    if (!ed?.editor) return null
    const lines = [...ed.querySelectorAll(':scope > p')].filter((p) => p.textContent.trim().length > 30 && !p.querySelector('img, code'))
    const line = lines.find((p) => { const r = p.getBoundingClientRect(); return r.top > 120 && r.bottom < innerHeight - 160 })
    if (!line) return null
    // On the screen: measured a frame after it was first there, once it has been painted, as a person sees it (read
    // between the page making the note and the browser painting it, it was a layout no one ever saw).
    if (!window.__lineSeen) return void (window.__lineSeen = true) ?? null
    const range = document.createRange()
    range.selectNodeContents(line)
    const rects = [...range.getClientRects()].filter((one) => one.width > 0)
    const last = rects.at(-1)
    const growth = ed.editor.storage.noteGrowth
    const index = ed.editor.state.doc.resolve(ed.editor.view.posAtDOM(line, 0)).index(0)
    return { x: last.right - 1, y: last.top + last.height / 2, text: ed.editor.state.doc.child(index).textContent, coming: !!growth?.coming, blocks: ed.editor.state.doc.childCount, index }
  }, [SEL, words], { timeout: 45000, polling: 'raf' })
  const first = await handle.jsonValue()
  console.log(`first screen: ${first.blocks} blocks on the page, the rest ${first.coming ? 'still coming' : 'already there'}; pressing the end of "${first.text.slice(-40)}"  (${load()})`)
  // DIAG=1: every change of the caret from here on, with what made it (best read on a dev-mode build).
  if (process.env.DIAG) await h.evaluate((sel) => {
    const ed = [...document.querySelectorAll(sel)].find((one) => one.editor)?.editor
    if (!ed || window.__diagOn) return
    window.__diagOn = true
    window.__diag = []
    const t0 = performance.now()
    const view = ed.view
    const dispatch = view.dispatch.bind(view)
    view.dispatch = (tr) => {
      if (tr.selectionSet) window.__diag.push({ ms: Math.round(performance.now() - t0), at: tr.selection.from, steps: tr.steps.length, meta: Object.keys(tr.meta ?? {}).join(','), by: (new Error().stack ?? '').split('\n').slice(2, 7).map((one) => one.trim().replace(/^at /, '').replace(/\(.*[/\\]/, '(')).join(' < ') })
      return dispatch(tr)
    }
  }, SEL)
  await h.mouse.click(first.x, first.y)
  // Vim's normal mode (if the book has Vim on) is left first, as a person would: at the line's end, to type after it.
  const vim = await h.evaluate((sel) => { const ed = [...document.querySelectorAll(sel)].find((one) => one.editor); const { $head } = ed.editor.state.selection; return { mode: ed.getAttribute('data-vim-mode'), atEnd: $head.parentOffset === $head.parent.content.size } }, SEL)
  if (vim.mode === 'normal') await h.keyboard.press(vim.atEnd ? 'i' : 'a')
  await h.keyboard.type(TYPED)
  await h.keyboard.press('Meta+a')
  const pressedWhile = await h.evaluate((sel) => !![...document.querySelectorAll(sel)].find((one) => one.editor)?.editor.storage.noteGrowth?.coming, SEL)
  // Once it is all there.
  await h.waitForFunction((sel) => { const ed = [...document.querySelectorAll(sel)].find((one) => one.editor)?.editor; return ed && !ed.storage.noteGrowth?.coming }, SEL, { timeout: 60000, polling: 50 })
  await h.waitForTimeout(300)
  const after = await h.evaluate(([sel, index]) => {
    const ed = [...document.querySelectorAll(sel)].find((one) => one.editor).editor
    const { doc, selection } = ed.state
    return { blocks: doc.childCount, from: selection.from, to: selection.to, size: doc.content.size, all: selection.from <= 1 && selection.to >= doc.content.size - 1, line: doc.child(index)?.textContent ?? '' }
  }, [SEL, first.index])
  console.log(`then: ⌘A pressed ${pressedWhile ? 'while the rest was still coming' : 'after the note was whole'}; the note has ${after.blocks} blocks, the selection ${after.from} to ${after.to} of ${after.size}`)
  if (process.env.DIAG) console.log(`(caret changes after the press:\n${(await h.evaluate(() => window.__diag ?? [])).map((one) => `  ${one.ms} ms → ${one.at} (${one.steps} steps; ${one.meta}) by ${one.by}`).join('\n')})`)
  check('a press at the end of a line of the first screen put the caret there, and the letters typed went in there in order', after.line === first.text + TYPED, `"${after.line.slice(-44)}"`)
  check('⌘A pressed as the note came in picks all of it once it is there', after.all && after.blocks >= stored.content.length, `${after.from} to ${after.to} of ${after.size}; ${after.blocks} blocks`)
  // What is stored: the whole note, the two letters added to that line, nothing else changed.
  await h.keyboard.press('ArrowRight')
  let saved = null
  for (let i = 0; i < 100 && !(saved && wordsOf(saved).includes(first.text + TYPED)); i++) {
    await h.waitForTimeout(200)
    saved = JSON.parse(read(note.id).body)
  }
  // All its words in order, the two letters after the line pressed: a block lost, doubled or put out of its place
  // shows. (Compared as one run of letters without spaces or line breaks: lib/lift-blocks.ts lifts a picture or a
  // link card out of its line and trims the blank space round it when a note is first saved after an edit, on every
  // build: on premium-pass's, a space before the largest note's "AWS Glue" heading.)
  const plain = (node) => wordsOf(node).replace(/\s/g, '')
  const all = plain(stored)
  const cut = all.indexOf(first.text.replace(/\s/g, '')) + first.text.replace(/\s/g, '').length
  const expected = all.slice(0, cut) + TYPED + all.slice(cut)
  const got = plain(saved)
  let differs = 0
  while (differs < Math.min(got.length, expected.length) && got[differs] === expected[differs]) differs++
  check('what is stored is the whole note with the two letters added and nothing else changed', got === expected, `${saved.content.length} blocks stored of ${stored.content.length}; ${got.length} letters, ${expected.length} expected${got === expected ? '' : `; first difference at letter ${differs}: "${got.slice(differs, differs + 30)}"`}`)
  const faults = c.errors.filter((line) => !/ERR_FILE_NOT_FOUND|ERR_BLOCKED_BY_RESPONSE|status of 40\d/.test(line))
  check('no page errors', !faults.length, faults.slice(0, 3).join(' | '))
} finally {
  await c.close()
}
done()
