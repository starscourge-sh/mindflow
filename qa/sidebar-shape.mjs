// The sidebar has one shape in every book: Inbox, Home, Journal, Writing, Gems, Review,
// Tasks and Calendar as one list, then Pinned, Tags and the Bin. The sandbox
// starts the way its owner laid it out: the Feed with the writing.
// No Types group, no Everything or Questions row, no group headings. Tried in
// a new book of your own, in that book after its settings are put back to an
// older book's (its own order, rows hidden, a growing sidebar), and in the
// sandbox, a second book.
//
//   npx electron-vite build --outDir out-x
//   QA_DATA=$(mktemp -d) QA_ENTRY=out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/sidebar-shape.mjs
import { DatabaseSync } from 'node:sqlite'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'

const { check, done } = checks()
const DATA = process.env.QA_DATA
const SHAPE = ['Inbox', 'Home', 'Journal', 'Writing', 'Gems', 'Review', 'Tasks', 'Calendar']

/** The sidebar as it is drawn: each row's name in order, a gap as "|", and any heading's words. */
const read = (h) => h.evaluate(() => {
  const nav = document.querySelector('aside nav')
  const parts = []
  for (const one of nav?.querySelectorAll('[data-side-row], [data-side-gap]') ?? []) {
    if (one.hasAttribute('data-side-gap')) parts.push('|')
    else parts.push(one.getAttribute('aria-label') ?? one.textContent.trim())
  }
  return { parts, text: nav?.innerText ?? '' }
})

const look = async (where, open, shape = SHAPE) => {
  const c = await open()
  try {
    await c.h.waitForTimeout(2500)
    const { parts, text } = await read(c.h)
    const rows = parts.filter((one) => one !== '|')
    check(`${where}: the rows start ${shape.join(', ')}`, JSON.stringify(rows.slice(0, shape.length)) === JSON.stringify(shape), rows.join(', '))
    const gap = parts.indexOf('|')
    check(`${where}: one list, no gap inside it`, gap < 0 || gap > parts.indexOf('Calendar'), parts.join(' '))
    check(`${where}: no Types, Everything, Questions, Notes or Saved`, !/\b(Types|Everything|Questions|Notes|Saved|Matrix|Tomorrow|This week's tasks)\b/.test(text), text.replace(/\s+/g, ' ').slice(0, 300))
    check(`${where}: the Bin comes after the rest`, rows.indexOf('Bin') > rows.indexOf('Calendar'), rows.join(', '))
    const pinned = text.indexOf('Pinned'), tags = text.indexOf('Tags'), bin = text.indexOf('Bin')
    check(`${where}: Pinned, Tags and the Bin in that order (where there are pins and tags)`, (pinned < 0 || pinned < bin) && (tags < 0 || tags < bin) && (pinned < 0 || tags < 0 || pinned < tags), `${pinned} ${tags} ${bin}`)
    check(`${where}: no page errors`, !c.errors.some((one) => one.includes('PAGEERROR')), c.errors.join(' | '))
    return rows
  } finally {
    await c.close()
  }
}

try {
  // 1. A new book of your own.
  process.env.QA_ARGS = ''
  const own = await look('a new book', () => sandbox({ width: 1200, height: 860, seeded: false }))
  // 2. The same book with an older book's sidebar settings: its own order, rows hidden, growing, and the shape not yet taken.
  const file = [join(DATA, 'haligtree.db'), ...readdirSync(DATA, { recursive: true }).filter((one) => String(one).endsWith('haligtree.db')).map((one) => join(DATA, String(one)))].find(existsSync)
  check('found the book to age', !!file, DATA)
  if (file) {
    const db = new DatabaseSync(file)
    db.exec(`insert or replace into settings (key, value) values
      ('sidebarShown', '["home","inbox","all","questions","matrix","today"]'),
      ('sidebarOrder', '["today","inbox","home"]'),
      ('sidebarGrows', 'true'), ('sidebarMet', '["home"]');
      delete from settings where key = 'sidebarShapeOnce'`)
    db.close()
    const aged = await look('an older book', () => sandbox({ width: 1200, height: 860, seeded: false }))
    check('an older book has the same rows as a new one', JSON.stringify(aged) === JSON.stringify(own), aged.join(', '))
  }
  // 3. The sandbox: another book, the same shape.
  process.env.QA_ARGS = '--sandbox'
  await look('the sandbox', () => sandbox({ width: 1200, height: 860 }), ['Inbox', 'Home', 'Journal', 'Writing', 'Gems', 'Feed', 'Review', 'Tasks', 'Calendar'])
} catch (error) {
  check('ran', false, error.stack)
}
done()
