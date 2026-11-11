// A whole long note dropped or pasted into quick capture never freezes it:
// the words (text/plain and text/html, as Obsidian gives them, about 930,000
// characters) are kept as a note of their own in the Inbox, read a breath at
// a time, while the box stays empty and takes every key. Said with Undo.
// A short paste still lands in the box as before.
//
//   npx electron-vite build --outDir out-x
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/box-big-drop.mjs
//
// BOOK=<a copy of a book> NOTE=<capture id> drops that note's own words
// (read from the copy's database, never opened by the app) instead of the
// made-up note.
import { DatabaseSync } from 'node:sqlite'
import { existsSync, readFileSync } from 'fs'
import { loadavg } from 'os'
import { join } from 'path'
import { sandbox } from './sandbox-lib.mjs'
import { checks } from './harness.mjs'

const { check, done } = checks()
const load = () => `load ${loadavg()[0].toFixed(1)}`
const ED = '.tiptap.ProseMirror.haligtree-editor:not(.is-line)'

/** A stored note as the Markdown Obsidian would hand over: headings, lines, lists, code, tables. */
function markdownOf(node, depth = 0) {
  const text = (one) => (one.content ?? []).map((part) => part.text ?? (part.type === 'hardBreak' ? '\n' : '')).join('')
  switch (node.type) {
    case 'doc': return (node.content ?? []).map((one) => markdownOf(one)).join('\n\n')
    case 'heading': return `${'#'.repeat(node.attrs?.level ?? 2)} ${text(node)}`
    case 'paragraph': return text(node)
    case 'codeBlock': return `\`\`\`${node.attrs?.language ?? ''}\n${text(node)}\n\`\`\``
    case 'horizontalRule': return '---'
    case 'blockquote': return (node.content ?? []).map((one) => `> ${markdownOf(one)}`).join('\n')
    case 'bulletList': case 'orderedList': case 'taskList':
      return (node.content ?? []).map((item, at) => `${'  '.repeat(depth)}${node.type === 'orderedList' ? `${at + 1}.` : '-'} ${(item.content ?? []).map((one) => markdownOf(one, depth + 1)).join('\n')}`).join('\n')
    case 'table': return (node.content ?? []).map((row, at) => { const cells = (row.content ?? []).map((cell) => (cell.content ?? []).map((one) => text(one)).join(' ')); return `| ${cells.join(' | ')} |${at === 0 ? `\n| ${cells.map(() => '---').join(' | ')} |` : ''}` }).join('\n')
    default: return (node.content ?? []).map((one) => markdownOf(one, depth)).join('\n')
  }
}
function realNote() {
  const root = process.env.BOOK
  if (!root || !process.env.NOTE) return null
  const shelf = existsSync(join(root, 'books.json')) ? JSON.parse(readFileSync(join(root, 'books.json'), 'utf8')) : null
  const db = new DatabaseSync(shelf?.last && shelf.last !== 'default' ? join(root, 'books', shelf.last, 'haligtree.db') : join(root, 'haligtree.db'), { readOnly: true })
  const row = db.prepare('select body from captures where id like ?').get(`${process.env.NOTE}%`)
  db.close()
  return row ? markdownOf(JSON.parse(row.body)) : null
}
function madeUp() {
  const words = 'cloud engineer account region subnet gateway lambda bucket policy role trust boundary cost alarm metric deploy stack template pipeline container cluster node queue topic stream table index backup restore failover latency throughput'.split(' ')
  const sentence = (i, n = 40) => Array.from({ length: n }, (_, k) => words[(i * 7 + k * 3) % words.length]).join(' ') + '.'
  const out = ['## Exam Cliff Notes', '']
  for (let i = 0; out.join('\n').length < 930_000; i++) {
    if (i % 12 === 0) out.push(`## Part ${i / 12 + 1}`, '')
    out.push(sentence(i), '', `- **${words[i % words.length]}**: ${sentence(i + 1, 12)}`, `- ${sentence(i + 2, 10)}`, '')
    if (i % 30 === 0) out.push('```bash', `aws s3 ls s3://bucket-${i}`, '```', '', '| Name | Use |', '| --- | --- |', `| ${words[i % 30]} | ${sentence(i, 6)} |`, '')
  }
  return out.join('\n')
}
const text = realNote() ?? madeUp()
const html = `<meta charset="utf-8">${text.slice(0, 200_000).split('\n\n').map((one) => `<p>${one.replace(/[<&]/g, ' ')}</p>`).join('')}`
const words = text.trim().split(/\s+/).length
console.log(`the note: ${text.length.toLocaleString('en')} characters, ${words.toLocaleString('en')} words${process.env.NOTE ? ' (the real one)' : ' (made up)'}  [${load()}]`)

// An empty book of its own: nothing here needs the sandbox's notes.
const c = await sandbox({ width: 1200, height: 800, seeded: false })
const { page, h } = c
/** Hands the words to the box as a drop or a paste would, at the editor, and times the hand-over. */
const give = (how, plain, rich) => page.evaluate(([sel, how, plain, rich]) => {
  const target = document.querySelector(sel)
  const data = new DataTransfer()
  data.setData('text/plain', plain)
  if (rich) data.setData('text/html', rich)
  const box = target.getBoundingClientRect()
  const event = how === 'drop'
    ? new DragEvent('drop', { dataTransfer: data, bubbles: true, cancelable: true, clientX: box.left + 20, clientY: box.top + 10 })
    : new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true })
  const at = performance.now()
  target.dispatchEvent(event)
  return Math.round(performance.now() - at)
}, [ED, how, plain, rich])
const boxWords = () => page.evaluate((sel) => document.querySelector(sel)?.textContent ?? '', ED)
const captures = () => h.evaluate(() => window.api.captures.list())
const watch = () => page.evaluate(() => {
  window.__long = []
  window.__seen?.disconnect()
  window.__seen = new PerformanceObserver((list) => list.getEntries().forEach((e) => window.__long.push(Math.round(e.duration))))
  window.__seen.observe({ type: 'longtask' })
  window.__keys = []
  window.__onKey ??= (e) => { if (e.key.length !== 1) return; const t = performance.now(); requestAnimationFrame(() => window.__keys.push(Math.round(performance.now() - t))) }
  window.addEventListener('keydown', window.__onKey, true)
})
const watched = () => page.evaluate(() => ({ long: window.__long, keys: window.__keys }))

try {
  await h.evaluate(() => window.api.haligtree('onboarding:set', { welcomed: new Date().toISOString(), newsSeen: true, welcoming: false, pageHints: false }))
  await h.evaluate(() => window.api.haligtree('settings:set', { sounds: false, hintRate: 0 }))
  await page.evaluate(() => window.api.showPrompt())
  await page.waitForTimeout(1200)
  await page.click(ED)
  await page.keyboard.press('Meta+a'); await page.keyboard.press('Backspace')

  for (const how of ['drop', 'paste']) {
    const before = (await captures()).length
    await watch()
    const took = await give(how, text, html)
    check(`${how}: the hand-over itself does not hold the box`, took < 100, `${took} ms  [${load()}]`)
    check(`${how}: the box is left empty, not filled with the note`, (await boxWords()).length < 200, `${(await boxWords()).length} characters in the box`)
    // Typed while the note is being read and kept: each key lands, and soon.
    for (const key of 'still here') { await page.keyboard.press(key === ' ' ? 'Space' : key); await page.waitForTimeout(40) }
    const typed = await boxWords()
    check(`${how}: keys typed meanwhile land in the box`, typed.replace(/ /g, ' ').includes('still here'), JSON.stringify(typed.slice(0, 60)))
    let kept = null
    for (let i = 0; i < 600 && !kept; i++) { const all = await captures(); if (all.length > before) kept = all.find((one) => !one.status || one.status === 'open') && all.length; else await page.waitForTimeout(100) }
    const list = await captures()
    check(`${how}: one new note is in the Inbox`, list.length === before + 1, `${before} captures before, ${list.length} after`)
    // Nothing kept (the box took the words itself): the rest of this way in has nothing to look at.
    if (list.length !== before + 1) { check(`${how}: the note was kept, said and can be undone`, false, 'no note was kept'); await page.click(ED); await page.keyboard.press('Meta+a'); await page.keyboard.press('Backspace'); continue }
    const newest = [...list].sort((a, b) => String(b.capturedAt ?? b.captured_at).localeCompare(String(a.capturedAt ?? a.captured_at)))[0]
    const whole = await h.evaluate((id) => window.api.captures.get(id).then((one) => { let n = 0; const walk = (node) => { if (node.text) n += node.text.length; (node.content ?? []).forEach(walk) }; walk(one.body); return { chars: n, blocks: one.body.content.length } }), newest.id)
    check(`${how}: it holds the whole note`, whole.chars > text.replace(/[#*`|>\-\s]/g, '').length * 0.9, `${whole.chars.toLocaleString('en')} characters in ${whole.blocks.toLocaleString('en')} blocks, from ${text.length.toLocaleString('en')}`)
    await page.waitForTimeout(400)
    const said = await page.evaluate(() => [...document.querySelectorAll('[data-toast], [role="status"], [data-sonner-toast]')].map((one) => one.textContent).join(' | ') || document.body.innerText.split('\n').filter((line) => /kept as a note/.test(line)).join(' | '))
    check(`${how}: the box says where the words went`, /words kept as a note in your Inbox/.test(said), said.slice(0, 160))
    const seen = await watched()
    check(`${how}: nothing held the box over 100 ms`, Math.max(0, ...seen.long) <= 100, `long tasks ${JSON.stringify(seen.long)} ms; keys ${JSON.stringify(seen.keys)} ms  [${load()}]`)
    // What ran in any long frame, as the window itself noted it (lib/freeze-notes.ts).
    if (Math.max(0, ...seen.long) > 100) console.log((await page.evaluate(() => window.__freezeNotes?.() ?? '')).split('\n').filter((line) => /^\s+\d+ms /.test(line)).slice(-8).join('\n'))
    check(`${how}: every key drew within 50 ms`, seen.keys.length >= 8 && Math.max(...seen.keys) <= 50, JSON.stringify(seen.keys))
    await page.screenshot({ path: `${process.env.SHOTS ?? '/tmp'}/box-big-${how}.png` }).catch(() => {})
    // Undo takes it to the Bin.
    await page.getByRole('button', { name: /^Undo/ }).first().click({ timeout: 3000 }).catch(() => {})
    await page.waitForTimeout(600)
    const after = await h.evaluate((id) => window.api.captures.get(id).then((one) => one?.status), newest.id)
    check(`${how}: Undo puts the note in the Bin`, after === 'discarded', String(after))
    await page.click(ED)
    await page.keyboard.press('Meta+a'); await page.keyboard.press('Backspace')
  }
  // A short paste is a thought for the box, as ever.
  await give('paste', 'A short thought, pasted.', '')
  await page.waitForTimeout(400)
  check('a short paste still lands in the box', (await boxWords()).includes('A short thought, pasted.'), (await boxWords()).slice(0, 80))
  check('no page errors', !c.errors.length, c.errors.slice(0, 3).join(' | '))
} finally {
  await c.close()
}
done()
