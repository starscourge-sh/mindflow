// ⌘K results read as results, not a page of loose text: each row is one line that
// never wraps (kind icon, title cut short with "…", at most two tags, the kind word
// at the right), with a second line only for why it came up. Titles start on one
// left edge, kind words end on one right edge, rows of one shape are one height.
//   QA_ARGS=--sandbox QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/search-rows.mjs
// SHOT=<folder> keeps the frames, light and dark.
import { mkdtempSync, readFileSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { PDFDocument, StandardFonts } from 'pdf-lib'
import { CALM_HOUR, sandbox } from './sandbox-lib.mjs'
import { checks } from './harness.mjs'
process.env.QA_ARGS ??= '--sandbox'

const { check, done } = checks()
const c = await sandbox({ width: 1100, height: 800, at: CALM_HOUR })
const { h, v, electron, both } = c
const wait = (ms) => h.waitForTimeout(ms)
const shots = process.env.SHOT
await v('settings:set', { sounds: false, hintRate: 0, motion: false })
const para = (text) => ({ type: 'paragraph', content: [{ type: 'text', text }] })
const note = (kind, ...lines) => h.evaluate(([kind, body]) => window.api.captures.create({ kind, body }), [kind, { type: 'doc', content: lines.map((one) => (typeof one === 'string' ? para(one) : one)) }])

// A mix: a note with three tags and a body line, a quote with a title far too long, a task with a day,
// a PDF, a page, and a picture with words in it.
await note('note', 'Adam Smith on the pin factory #economics #history #reading', 'Adding one worker to each step multiplies the output of the whole factory, day after day.')
await note('quote', 'Adding the habit of reading every single day so that this title runs far past the width of the search window and has to be cut short')
await v('task:add', 'Add the reading list to the syllabus #school tomorrow')
const page = await v('article:new')
await v('item:save', page, { title: 'Adding up the week', body: { type: 'doc', content: [para('Adding up the week'), para('What I read, what I wrote, and what I added to the pile.')] } })
const pdf = await PDFDocument.create()
const font = await pdf.embedFont(StandardFonts.Helvetica)
pdf.addPage([500, 600]).drawText('Adding machines and the people who used them.', { x: 30, y: 520, size: 12, font })
const file = join(mkdtempSync(join(tmpdir(), 'haligtree-rows-')), 'Adding machines.pdf')
writeFileSync(file, await pdf.save())
await electron.evaluate(({ app }, path) => app.emit('open-file', { preventDefault() {} }, path), file); await wait(3000)
const src = await h.evaluate((bytes) => window.api.saveImage('image/png', new Uint8Array(bytes)), [...readFileSync(join(import.meta.dirname, 'fixtures/notebook-page.png'))])
const photo = await note('note', 'Lecture photo', { type: 'image', attrs: { src } }, 'Stoic judgements, from the reading.')
for (let i = 0; i < 60; i++) { const all = await h.evaluate(() => window.api.captures.find('judgements')); if (all.find((one) => one.id === photo)?.picture) break; await wait(500) }
await c.send('view', 'day'); await wait(1200)

// Each row as drawn: its title, its kind word, its first line and (if any) the found line.
const measure = () => h.evaluate(() => [...document.querySelectorAll('button[data-row]')].map((row) => {
  const box = (el) => el && el.getBoundingClientRect()
  const title = row.querySelector('[data-row-title]') ?? row.children[1]
  const kind = row.querySelector('[data-row-kind]')
  const found = row.querySelector('[data-found-line]')
  const t = box(title)
  // Everything on the first line, the found line apart: on one line when every piece shares the title's middle.
  const parts = [...(row.querySelector('[data-row-line]') ?? row).children].filter((one) => !one.matches('[data-found-line]') && box(one).height)
  const mid = t.top + t.height / 2
  return {
    text: (title?.textContent ?? '').slice(0, 40),
    title: Math.round(t.left), titleH: Math.round(t.height),
    oneLine: parts.every((one) => Math.abs(box(one).top + box(one).height / 2 - mid) < 6),
    kind: kind ? Math.round(box(kind).right) : null,
    found: !!found, foundAt: found ? Math.round(box(found.firstElementChild ?? found).left) : null,
    picture: !!row.querySelector('[data-found-picture] img'),
    h: Math.round(box(row).height)
  }
}))
const spread = (list) => (list.length ? Math.max(...list) - Math.min(...list) : 0)

const ask = async (words, name, least = 3) => {
  await h.keyboard.press('Meta+k'); await wait(500)
  await h.keyboard.type(words, { delay: 25 }); await wait(1400)
  for (let i = 0; i < 3; i++) await h.screenshot()
  const rows = await measure()
  if (shots) await both(`${shots}/search-rows-${name}`)
  const one = rows.filter((row) => !row.found), two = rows.filter((row) => row.found)
  check(`"${words}": rows found (${rows.length}, ${two.length} with a found line)`, rows.length >= least, JSON.stringify(rows.map((row) => row.text)))
  check(`"${words}": no row's first line wraps`, rows.every((row) => row.oneLine && row.titleH <= 22), JSON.stringify(rows.filter((row) => !row.oneLine || row.titleH > 22)))
  check(`"${words}": every title starts on one left edge`, spread(rows.map((row) => row.title)) <= 1, JSON.stringify(rows.map((row) => row.title)))
  check(`"${words}": every row says its kind at the right, on one edge (within 2px)`, rows.every((row) => row.kind !== null) && spread(rows.map((row) => row.kind)) <= 2, JSON.stringify(rows.map((row) => [row.text, row.kind])))
  check(`"${words}": one-line rows are one height`, spread(one.map((row) => row.h)) <= 1, JSON.stringify(one.map((row) => row.h)))
  check(`"${words}": two-line rows are one height (pictures too)`, spread(two.map((row) => row.h)) <= 1, JSON.stringify(two.map((row) => [row.h, row.picture])))
  check(`"${words}": found lines start where titles start`, two.every((row) => Math.abs(row.foundAt - row.title) <= 1), JSON.stringify(two.map((row) => [row.title, row.foundAt])))
  await h.keyboard.press('Escape'); await wait(400)
  return rows
}

const adds = await ask('add', 'add')
check('"add": the long quote is cut short on one line', adds.some((row) => row.text.startsWith('Adding the habit')), JSON.stringify(adds.map((row) => row.text)))
await ask('judgements', 'picture', 1)
check('"judgements": the picture row shows its picture', (await (async () => { await h.keyboard.press('Meta+k'); await wait(400); await h.keyboard.type('judgements', { delay: 25 }); await wait(1200); const has = await h.evaluate(() => !!document.querySelector('button[data-row] [data-found-picture] img')); await h.keyboard.press('Escape'); await wait(300); return has })()))
await ask('the', 'the')
// Tags, a task's day and a cut-short title side by side.
const reading = await ask('reading', 'reading')
check('"reading": the task shows its day on its one line', reading.some((row) => row.text.startsWith('Add the reading list')), JSON.stringify(reading.map((row) => row.text)))
// The window at its smallest: the preview folds away, the rows still hold one line each.
await c.size(560, 400)
await ask('add', 'add-small')
await c.size(1100, 800)

// The tags: at most two beside a title, then "+1".
await h.keyboard.press('Meta+k'); await wait(400); await h.keyboard.type('pin factory', { delay: 25 }); await wait(1200)
const tags = await h.evaluate(() => { const row = [...document.querySelectorAll('button[data-row]')].find((one) => one.textContent.includes('pin factory')); return row && { tags: [...row.querySelectorAll('[data-tag]')].map((one) => one.dataset.tag), rest: row.querySelector('[data-tags]')?.textContent.match(/\+\d+/)?.[0] ?? null } })
check('three tags: two shown, then "+1"', JSON.stringify(tags) === JSON.stringify({ tags: ['economics', 'history'], rest: '+1' }), JSON.stringify(tags))
// The keys still work on the new rows: ↓ moves the highlight, Enter opens the one lit.
await h.keyboard.press('ArrowDown'); await wait(150); await h.keyboard.press('ArrowUp'); await wait(150)
const lit = await h.evaluate(() => document.querySelector('button[data-row][data-search-at]')?.textContent ?? null)
check('↑↓ light a row', !!lit, lit)
await h.keyboard.press('Enter'); await wait(1200)
check('Enter opens it: the note is on the page', await h.evaluate(() => [...document.querySelectorAll('.ProseMirror')].some((one) => one.textContent.includes('pin factory'))))
// The pointer: the row shows the hand.
await h.keyboard.press('Meta+k'); await wait(400); await h.keyboard.type('add', { delay: 25 }); await wait(1200)
check('a row shows the hand', (await h.evaluate(() => getComputedStyle(document.querySelector('button[data-row]')).cursor)) === 'pointer')
await h.keyboard.press('Escape'); await wait(300)
console.log(c.errors.length ? c.errors.join('\n') : 'no page errors')
done()
await c.close()
