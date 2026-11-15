/**
 * The block grip's menu, “Delete” and “Duplicate”, on every kind of block inside every kind of holder: a list's item, a
 * quote, a callout, a column, and the note itself. Each takes or copies exactly the block the grip stands by (a table
 * whole, never a line of it or the line above it), and ⌘Z puts the note back exactly. First the user's own note of 15 Nov:
 * a heading, a list whose second item is an empty line holding a table, then a larger table, “Delete” from the grip
 * beside each table. A real pointer: hover, the grip, the menu's row. Never “Copy” (it writes the Mac's clipboard).
 *   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/grip-menu.mjs
 */
import { open, checks } from './harness.mjs'

const { check, done } = checks()
const EDITOR = '.tiptap.ProseMirror.haligtree-editor:not(.is-line)'
const app = await open()
const { page } = app
await page.evaluate(() => window.api.haligtree('onboarding:set', { welcomed: new Date().toISOString(), newsSeen: true, welcoming: false, pageHints: false }))

const json = () => page.$eval(EDITOR, (root) => JSON.stringify(root.editor.getJSON()))
const set = async (html) => {
  // Whatever the last case left open (a menu, the slash menu) put away first.
  await page.keyboard.press('Escape')
  await page.keyboard.press('Escape')
  await page.mouse.move(5, 5)
  await app.reset()
  await page.$eval(EDITOR, (root, value) => root.editor.commands.setContent(value), html)
  await page.waitForTimeout(250)
}
/** The grip beside `target` (a locator), its menu, and the row named `row`. `typed`: a letter typed in the block first, then straight to the grip, as a quick hand goes. */
async function fromGrip(target, row, { typed = false } = {}) {
  await page.mouse.move(5, 5)
  await target.hover({ timeout: 20000 })
  await page.waitForTimeout(250)
  const grip = page.locator('.tiptap-drag-handle:not(.is-hidden) .tiptap-drag-handle-grip')
  if (!(await grip.count()) || !(await grip.isVisible())) return 'no grip'
  const at = await grip.boundingBox()
  if (typed) {
    await target.click()
    await page.keyboard.press('End')
    await page.keyboard.type('s')
    await arrive('.tiptap-drag-handle:not(.is-hidden) .tiptap-drag-handle-grip')
    await page.mouse.down()
    await page.mouse.up()
  } else {
    try {
      await grip.click({ timeout: 2000 })
    } catch {
      return `the grip could not be pressed: ${await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.getAttribute('aria-label') ?? document.elementFromPoint(x, y)?.className ?? 'nothing', [at.x + at.width / 2, at.y + at.height / 2])} lies over it`
    }
  }
  await page.waitForTimeout(250)
  rows.splice(0, rows.length, ...(await page.$$eval('[role="menuitem"]', (all) => all.map((one) => one.textContent.trim()))))
  const line = page.getByRole('menuitem', { name: row, exact: true })
  if (!(await line.count())) return `no “${row}” row`
  await line.first().click({ timeout: 2000 }).catch(() => {})
  await page.waitForTimeout(250)
  return 'ok'
}
/** The rows the last menu offered. */
const rows = []
/**
 * The pointer arrives at `box` in one move, as a quick hand does: the one move lands on the grip, none in the note on
 * the way. The move carries its distance, as a real one does (the gutter, put away while typing, comes back on a move).
 */
async function arrive(box) {
  // The move's distance, heard by the window alone (the gutter comes back on a move), never by the note.
  await page.evaluate(() => window.dispatchEvent(new MouseEvent('mousemove', { movementX: 6, movementY: 2 })))
  await page.waitForTimeout(60)
  // Where the control is now: the box may have grown as the word was typed.
  const now = (await page.locator(box).first().boundingBox()) ?? { x: 0, y: 0, width: 0, height: 0 }
  const [x, y] = [now.x + now.width / 2, now.y + now.height / 2]
  await page.mouse.move(x, y)
  await page.waitForTimeout(60)
  seenAt.splice(0, seenAt.length, await page.evaluate(([x, y]) => {
    const under = document.elementFromPoint(x, y)
    const handle = document.querySelector('.tiptap-drag-handle')
    return `${under?.getAttribute('aria-label') ?? under?.className ?? 'nothing'} / ${handle?.className} ${handle ? getComputedStyle(handle).opacity : ''}`
  }, [x, y]))
}
/** What lay under the pointer as it arrived, and the gutter's own state. */
const seenAt = []
const undo = async () => (await page.keyboard.press('Meta+z'), await page.waitForTimeout(200))
/** How many times the note holds `mark` (a word of the block, or a kind of node). */
const count = (mark) => page.$eval(EDITOR, (root, mark) => {
  let n = 0
  root.editor.state.doc.descendants((node) => {
    if (node.type.name === mark || (node.isTextblock && node.textContent === mark)) n++
  })
  return n
}, mark)

// --- The user's note: a table in a list's item, under its empty line, and one at the top level ------------------------
const TABLE = (rows) => `<table><tbody>${rows.map((row, at) => `<tr>${row.map((cell) => at ? `<td><p>${cell}</p></td>` : `<th><p>${cell}</p></th>`).join('')}</tr>`).join('')}</tbody></table>`
const NOTE = `<h2>Clearing out the flat</h2><ul><li><p>Boxes for the books</p></li><li><p></p>${TABLE([['removed', 'where it showed up', 'amount'], ['the old lamp', 'hall', '2'], ['', '', '']])}</li></ul>${TABLE([['room', 'what is left', 'by when', 'who'], ['kitchen', 'the shelves', 'Friday', 'me'], ['hall', 'the coats', 'Saturday', 'Sam'], ['study', 'the desk', 'Sunday', 'me']])}<p>Last line</p>`
const tables = () => page.$eval(EDITOR, (root) => {
  const found = []
  root.editor.state.doc.descendants((node, pos) => void (node.type.name === 'table' && found.push({ pos, first: node.firstChild?.firstChild?.textContent ?? '' })))
  return found
})
const safe = (run) => run.catch((error) => `stopped: ${String(error.message).split('\n')[0]}`)
let said
let left
// QA_PART=typed: the user's own path alone (a word typed in the table, then the grip), without the pointer cases and the sweep.
const ALL = process.env.QA_PART !== 'typed'
await page.setViewportSize?.({ width: 1100, height: 820 }).catch(() => {})
if (ALL) {
await set(NOTE)
const before = await json()
said = await safe(fromGrip(page.locator(`${EDITOR} th`, { hasText: 'removed' }).first(), 'Delete'))
left = await tables()
check('the user’s note: “Delete” from the grip beside the table in the list’s item takes that table, and only it', said === 'ok' && left.length === 1 && left[0].first === 'room' && (await count('Boxes for the books')) === 1, `${said} ${JSON.stringify(left)}`)
await undo()
check('the user’s note: ⌘Z puts that table back exactly', (await json()) === before, (await json()).slice(0, 300))
said = await safe(fromGrip(page.locator(`${EDITOR} th`, { hasText: 'room' }).first(), 'Delete'))
left = await tables()
check('the user’s note: “Delete” from the grip beside the top-level table takes that table, and only it', said === 'ok' && left.length === 1 && left[0].first === 'removed', `${said} ${JSON.stringify(left)}`)
await undo()
check('the user’s note: ⌘Z puts it back exactly', (await json()) === before, '')

// --- The sweep: every kind of block, in every kind of holder -----------------------------------------------------------
const KINDS = {
  paragraph: { html: '<p>Target words</p>', mark: 'Target words', at: () => page.locator(`${EDITOR} p`, { hasText: 'Target words' }).first() },
  heading: { html: '<h3>Target heading</h3>', mark: 'Target heading', at: () => page.locator(`${EDITOR} h3`, { hasText: 'Target heading' }).first() },
  table: { html: TABLE([['Target cell', 'two'], ['three', 'four']]), mark: 'table', at: () => page.locator(`${EDITOR} th`, { hasText: 'Target cell' }).first() },
  code: { html: '<pre><code>let target = 1</code></pre>', mark: 'codeBlock', at: () => page.locator(`${EDITOR} pre`).first() },
  divider: { html: '<hr>', mark: 'horizontalRule', at: () => page.locator(`${EDITOR} hr`).first() },
}
const HOLDERS = {
  'the note': (block) => `<p>Lead line</p>${block}<p>After</p>`,
  'a list’s item': (block) => `<ul><li><p>Lead line</p>${block}</li><li><p>Next item</p></li></ul><p>After</p>`,
  'a quote': (block) => `<blockquote><p>Lead line</p>${block}</blockquote><p>After</p>`,
  'a callout': (block) => `<div data-callout><p>Lead line</p>${block}</div><p>After</p>`,
  'a column': (block) => `<div data-columns><div class="mf-columns-row"><div data-column><p>Lead line</p>${block}</div><div data-column><p>Other column</p></div></div></div><p>After</p>`,
}
const failed = []
for (const [holder, wrap] of Object.entries(HOLDERS)) {
  for (const [kind, one] of Object.entries(KINDS)) {
    await set(wrap(one.html))
    const was = await json()
    const n = await count(one.mark)
    if (n !== 1) {
      failed.push(`${kind} in ${holder}: seeded ${n}`)
      continue
    }
    for (const [row, want] of [['Delete', 0], ['Duplicate', 2]]) {
      said = await fromGrip(one.at(), row).catch((error) => `stopped: ${String(error.message).split('\n')[0]}`)
      const now = await count(one.mark)
      const kept = (await count('Lead line')) === 1 && (await count('After')) === 1
      if (said !== 'ok' || now !== want || !kept) failed.push(`${row} on a ${kind} in ${holder}: ${said}, ${now} left (wanted ${want})${kept ? '' : ', took more than it'}`)
      await undo()
      if ((await json()) !== was) failed.push(`${row} on a ${kind} in ${holder}: ⌘Z did not put it back exactly`)
      await set(wrap(one.html))
    }
  }
}
check('“Delete” and “Duplicate” from the grip take or copy exactly the block it stands by, every kind in every holder, and ⌘Z puts each back', failed.length === 0, failed.join(' | '))
}


// --- As the user had it: a word typed in the table, and then its grip -------------------------------------------------
// The editor's handle lets its record go at any key while the grip stays on show (in a grace of a second, and for good
// when the pointer reaches the grip without crossing the note's words). Pressed then, the grip's menu was a bare
// “Block” whose “Delete” did nothing (the user's screenshot of 15 Nov, 18:44). The grip is pressed straight after the
// key: what it names is then the record alone.
await page.setViewportSize?.({ width: 1100, height: 820 }).catch(() => {})
const pressAfterTyping = async (cell, control, row) => {
  await set(NOTE)
  await page.mouse.move(5, 5)
  await cell.hover({ timeout: 20000 })
  await page.waitForTimeout(250)
  await cell.click()
  await page.keyboard.press('End')
  await page.keyboard.type('s')
  await page.locator(control).first().dispatchEvent('click')
  await page.waitForTimeout(300)
  rows.splice(0, rows.length, ...(await page.$$eval('[role="menuitem"]', (all) => all.map((one) => one.textContent.trim()))))
  if (row) await page.getByRole('menuitem', { name: row, exact: true }).first().dispatchEvent('click').catch(() => {})
  await page.waitForTimeout(250)
}
const GRIP = '.tiptap-drag-handle .tiptap-drag-handle-grip'
await safe(pressAfterTyping(page.locator(`${EDITOR} td`, { hasText: 'the old lamp' }).first(), GRIP, 'Delete'))
left = await tables()
check('typed in the table in the list’s item, then its grip: the menu is the table’s (its own rows, not a bare “Block”)', rows.includes('Delete') && rows.some((one) => /row|column/i.test(one)), rows.join(', '))
check('and its “Delete” takes that table', left.length === 1 && left[0].first === 'room', JSON.stringify(left))
await safe(pressAfterTyping(page.locator(`${EDITOR} td`, { hasText: 'kitchen' }).first(), GRIP, 'Delete'))
left = await tables()
check('the same for the top-level table', left.length === 1 && left[0].first === 'removed', `${JSON.stringify(left)} ${rows.join(', ')}`)
await safe(pressAfterTyping(page.locator(`${EDITOR} td`, { hasText: 'the old lamp' }).first(), '.tiptap-drag-handle [aria-label="Insert a block below"]', null))
const slash = await page.$eval(EDITOR, (root) => {
  let found = null
  root.editor.state.doc.descendants((node, pos, parent) => void (node.isTextblock && node.textContent === '/' && (found = parent?.type.name ?? 'doc')))
  return found
})
check('typed in the table, then the grip’s +: a line below the table’s item', slash === 'listItem', String(slash))
await page.keyboard.press('Escape')

const errors = app.drain().filter((line) => /PAGE ERROR/.test(line))
check('no page errors', errors.length === 0, errors.join(' / '))
await app.close().catch(() => {})
done()
