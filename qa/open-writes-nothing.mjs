// Opening a note writes nothing: a note is written only once the person changes it. Run on a COPY of a book
// (QA_DATA), never the book itself:
//
//   QA_DATA=<copy> QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/open-writes-nothing.mjs
//
// The editor shows some stored notes in its own shape (lib/lift-blocks.ts, the fix-ups as it opens): a picture
// inside a line on a line of its own, an empty list item given its line, an Obsidian cardlink block as its card, a
// line after a closing picture. On 18 Nov 2026 opening the book's largest note wrote it in that shape within half a
// second (7,017 blocks stored, 7,018 written, a letter gone, a version kept, its edited time moved), and a click in a
// note that ended on a picture wrote it too. Here: the largest note, and a short one the copy is given holding each of
// those, are each opened, looked at, clicked in once, left, and the app quit; every stored row is read straight from
// the copy's database at each step and must be byte for byte what it was.
import { DatabaseSync } from 'node:sqlite'
import { existsSync, readFileSync } from 'fs'
import { loadavg } from 'os'
import { join } from 'path'
import { sandbox } from './sandbox-lib.mjs'
import { checks } from './harness.mjs'

const { check, done } = checks()
const root = process.env.QA_DATA
if (!root || /book-master/.test(root)) throw new Error('QA_DATA must be your own copy of a book, never book-master')
const shelf = existsSync(join(root, 'books.json')) ? JSON.parse(readFileSync(join(root, 'books.json'), 'utf8')) : null
const file = shelf?.last && shelf.last !== 'default' ? join(root, 'books', shelf.last, 'haligtree.db') : join(root, 'haligtree.db')
const ask = (run, readOnly = true) => { const db = new DatabaseSync(file, { readOnly }); try { return run(db) } finally { db.close() } }
const wait = (ms) => new Promise((next) => setTimeout(next, ms))
const load = () => `load ${loadavg()[0].toFixed(1)}`
const ED = '.tiptap.ProseMirror.haligtree-editor:not(.is-line):not(.is-plain)'

const LARGEST = ask((db) => db.prepare("select id from captures where status = 'open' and kind = 'note' and body like '{%' order by length(body) desc limit 1").get()).id
// The short note: every fix-up the editor makes as a note opens, in eight lines.
const SHORT = 'qa-open-writes-nothing-0000-00000000'
const line = (...content) => ({ type: 'paragraph', content })
const words = (text) => ({ type: 'text', text })
const picture = (alt) => ({ type: 'image', attrs: { src: `/extras/attachments/${alt.replace(/\W+/g, '-')}.png`, alt } })
const body = JSON.stringify({ type: 'doc', content: [
  line(words('Opened, looked at and left, this note stays as it was stored.')),
  line(words('A picture in a line of words: '), picture('In a line')),
  line(picture('First of two'), words(' '), picture('Second of two')),
  { type: 'bulletList', content: [{ type: 'listItem' }, { type: 'listItem', content: [line(words('An item after an empty one'))] }] },
  { type: 'codeBlock', attrs: { language: 'cardlink' }, content: [words('url: https://example.com/a-card\ntitle: "A card from Obsidian"')] },
  line(words('Its last block is a picture, so a click asks for a line after it.')),
  picture('Closing picture'),
] })
if (!ask((db) => db.prepare('select 1 from captures where id = ?').get(SHORT))) {
  const at = new Date().toISOString()
  ask((db) => db.prepare("insert into captures (id, number, title, kind, status, body, captured_at, edited_at) values (?, (select coalesce(max(number), 0) + 1 from captures), '', 'note', 'open', ?, ?, ?)").run(SHORT, body, at, at), false)
}

const row = (id) => ask((db) => db.prepare('select * from captures where id = ?').get(id))
const versions = (id) => ask((db) => db.prepare('select count(*) as n from versions where item_id = ?').get(id).n)
const textOf = (n) => (n.type === 'text' ? n.text.length : (n.content ?? []).reduce((sum, one) => sum + textOf(one), 0))
const sizeOf = (text) => { const doc = JSON.parse(text); return `${doc.content.length} blocks, ${textOf(doc)} characters` }
const base = { [LARGEST]: row(LARGEST), [SHORT]: row(SHORT) }
const baseVersions = { [LARGEST]: versions(LARGEST), [SHORT]: versions(SHORT) }
for (const id of [LARGEST, SHORT]) console.log(`stored ${id.slice(0, 8)}: ${sizeOf(base[id].body)}, ${base[id].body.length} characters of JSON, ${baseVersions[id]} versions  (${load()})`)
const same = (label, id) => {
  const now = row(id)
  const columns = Object.keys(base[id]).filter((key) => String(base[id][key]) !== String(now[key]))
  return check(`${label}: stored byte for byte as it was`, now.body === base[id].body && !columns.length && versions(id) === baseVersions[id],
    `${sizeOf(now.body)}; ${versions(id)} versions; columns changed: ${columns.join(', ') || 'none'}`)
}

const c = await sandbox({ width: 1300, height: 900, seeded: false })
await c.h.evaluate(() => window.api.haligtree('onboarding:set', { welcomed: new Date().toISOString(), newsSeen: true, welcoming: false, pageHints: false }))
await c.h.evaluate(() => window.api.haligtree('settings:set', { sounds: false, hintRate: 0 }))
await wait(1200)
const held = () => c.h.evaluate((sel) => {
  const ed = [...document.querySelectorAll(sel)].filter((one) => one.editor && one.isConnected).sort((a, b) => b.editor.state.doc.childCount - a.editor.state.doc.childCount)[0]
  return ed ? `${ed.editor.state.doc.childCount} blocks, ${ed.editor.state.doc.textContent.length} characters` : 'no editor'
}, ED)

for (const [id, label, blocks] of [[LARGEST, `the largest note (${LARGEST.slice(0, 8)})`, 1000], [SHORT, 'a short note holding every fix-up', 6]]) {
  const started = Date.now()
  await c.send('capture', id)
  await c.h.waitForFunction(([sel, count]) => [...document.querySelectorAll(sel)].some((one) => one.editor && one.isConnected && one.editor.state.doc.childCount >= count && one.textContent.trim().length > 0), [ED, blocks], { timeout: 90000 })
  console.log(`(${label} opened in ${Date.now() - started} ms, ${load()}: the editor holds ${await held()})`)
  await wait(3000)
  same(`${label}, open three seconds, nothing touched`, id)
  // One click on its first line's words: a caret placed, nothing changed.
  const spot = await c.h.evaluate((sel) => {
    const ed = [...document.querySelectorAll(sel)].filter((one) => one.editor && one.isConnected).sort((a, b) => b.editor.state.doc.childCount - a.editor.state.doc.childCount)[0]
    const first = ed?.querySelector(':scope > p, :scope > h1, :scope > h2')
    const box = first?.getBoundingClientRect()
    return box && box.width ? { x: Math.round(box.left + Math.min(40, box.width / 2)), y: Math.round(box.top + box.height / 2) } : null
  }, ED)
  if (check(`${label}: its first line can be clicked`, !!spot, JSON.stringify(spot))) await c.h.mouse.click(spot.x, spot.y)
  await wait(1500)
  same(`${label}, clicked in once`, id)
  await c.send('view', 'today')
  await wait(2000)
  same(`${label}, opened and left`, id)
}
const errors = c.errors.filter((one) => !/ERR_FILE_NOT_FOUND|status of 404/.test(one))
check('no page errors (pictures missing from the copy aside)', !errors.length, errors.slice(0, 3).join(' | '))
await c.close()
await wait(1000)
same('after the app quit, the largest note', LARGEST)
same('after the app quit, the short note', SHORT)
done()
