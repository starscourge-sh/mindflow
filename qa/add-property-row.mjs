// "Add property" as Obsidian does it: a new empty row in the block with its
// name focused, the book's names offered under it with their kinds' icons,
// a known date name giving a date control, a new name starting as text with
// its kind changed from its icon, Esc taking an empty row away, and a value
// saved and shown.
//
//   npx electron-vite build --outDir out-x
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-x/main/index.js HALIGTREE_QA_AWAY=1 SHOTS=<dir> node qa/add-property-row.mjs
import { sandbox } from './sandbox-lib.mjs'
import { checks } from './harness.mjs'
process.env.QA_ARGS ??= '--sandbox'

const { check, done } = checks()
const s = await sandbox({ width: 1200, height: 820 })
const { h, send, go, v, errors } = s
const shot = (name) => process.env.SHOTS && h.screenshot({ path: `${process.env.SHOTS}/${name}.png` }).catch(() => {})
const strip = '[data-property-strip]'
const text = () => h.evaluate((sel) => document.querySelector(sel)?.textContent ?? '', strip)
const add = async () => { await h.click(`${strip} [data-add-property]`); await h.waitForTimeout(400) }
try {
  // Names this book already uses: a date one and a text one.
  await v('props:type', 'Deadline', 'date')
  await v('props:type', 'Director', 'text')
  const made = await h.evaluate(() => window.api.captures.create({ kind: 'note', body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'A film to see' }] }, { type: 'paragraph', content: [{ type: 'text', text: 'Somewhere below the title' }] }] } }))
  for (let i = 0; i < 60 && (await h.evaluate(() => document.body.innerText.includes('Setting out the examples'))); i++) await h.waitForTimeout(500)
  await go('captures')
  await send('capture', made)
  await h.waitForTimeout(1500)

  // 1. A new row inside the block, laid out as the others, its name focused; no popover.
  await add()
  const row = await h.evaluate(() => {
    const one = document.querySelector('[data-new-property]')
    return one && { focused: document.activeElement === one.querySelector('input'), cells: one.children.length, inStrip: !!one.closest('[data-property-strip]'), popover: !!document.querySelector('[data-slot="popover-content"]') }
  })
  check('1. "Add property" puts a row in the block with its name focused', !!row?.focused && row.inStrip && row.cells === 2 && !row.popover, JSON.stringify(row))

  // 2. The names in use, each with its kind's icon, narrowing as you type.
  await h.keyboard.type('D')
  await h.waitForTimeout(200)
  const listed = await h.evaluate(() => [...document.querySelectorAll('[data-name-option]')].map((one) => `${one.dataset.nameOption}:${one.dataset.kind}:${!!one.querySelector('svg')}`))
  check('2. names in use are offered with their kinds and icons', listed.includes('Deadline:date:true') && listed.includes('Director:text:true'), listed.join(','))
  await h.keyboard.type('ea')
  await h.waitForTimeout(200)
  const narrowed = await h.evaluate(() => [...document.querySelectorAll('[data-name-option]')].map((one) => one.dataset.nameOption))
  check('2. typing narrows the list', narrowed.includes('Deadline') && !narrowed.includes('Director'), narrowed.join(','))
  await shot('new-row-dropdown')

  // 3. Arrow and Enter picks Deadline: its own date control opens, in the row's editor.
  await h.keyboard.press('ArrowDown')
  await h.keyboard.press('Enter')
  await h.waitForTimeout(900)
  const dated = await h.evaluate(() => ({ row: !!document.querySelector('[data-property="Deadline"]'), gone: !document.querySelector('[data-new-property]'), editor: document.querySelector('[data-slot="popover-content"]')?.textContent ?? '' }))
  check('3. a known date name gives its row and a date control', dated.row && dated.gone && /Pick a date/.test(dated.editor), JSON.stringify(dated).slice(0, 200))
  await shot('date-control')
  // Clicked away with no value: kept, shown as Empty.
  await h.mouse.click(1100, 780)
  await h.waitForTimeout(600)
  check('4. leaving a named row with no value keeps it, Empty', /Deadline\s*Empty/.test(await text()), await text())

  // 3. A brand new name starts as text; a value saves and shows.
  await add()
  await h.keyboard.type('Cinema')
  await h.keyboard.press('Enter')
  await h.waitForTimeout(900)
  const typed = await h.evaluate(() => ({ focused: document.activeElement?.closest('[data-slot="popover-content"]') && document.activeElement.tagName, kinds: document.querySelector('[data-property-kind="Cinema"]')?.getAttribute('aria-label') }))
  check('3. a new name opens a text box, focused', typed.focused === 'INPUT', JSON.stringify(typed))
  await h.keyboard.type('Rio')
  await h.keyboard.press('Enter')
  await h.waitForTimeout(900)
  check('3. its value saves and shows', /Cinema\s*Rio/.test(await text()), await text())
  // Its icon changes the kind.
  await h.click('[data-property-kind="Cinema"]')
  await h.waitForTimeout(400)
  const kinds = await h.evaluate(() => [...document.querySelectorAll('[data-slot="popover-content"] [data-kind]')].map((one) => `${one.dataset.kind}${one.hasAttribute('data-on') ? '*' : ''}`))
  check('3. its icon offers the kinds, Text marked', kinds.includes('text*') && kinds.includes('date'), kinds.join(','))
  await h.click('[data-slot="popover-content"] [data-kind="number"]')
  await h.waitForTimeout(900)
  const kind = (await v('props:names')).find((one) => one.name === 'Cinema')?.type
  check('3. picking a kind keeps it', kind === 'number', String(kind))

  // 4. Esc on a row with no name takes it away; clicking away does too.
  await add()
  await h.keyboard.press('Escape')
  await h.waitForTimeout(300)
  check('4. Esc takes an empty row away', !(await h.$('[data-new-property]')))
  await add()
  await h.mouse.click(1100, 780)
  await h.waitForTimeout(300)
  check('4. clicking away takes an empty row away', !(await h.$('[data-new-property]')))
  const fields = await h.evaluate((id) => window.api.haligtree('notes:fields', 'captures', id), made.id ?? made)
  check('4. no stray property saved', Object.keys(fields).sort().join(',') === 'Cinema,Deadline', JSON.stringify(fields))
  check('no page errors', errors.length === 0, errors.join(' | '))
} finally {
  await s.close()
}
done()
