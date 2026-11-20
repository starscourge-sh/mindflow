// The editor critique of 9 Nov, item by item:
//   1. a page with no title is named by its first line in the header, tab, Recent and list; an empty one reads "New note";
//      one with a title of its own keeps it;
//   2. notes are written in Fraunces;
//   3. "/tab" then Enter makes a table;
//   4. Tab in a paragraph keeps the caret in the note, and the next word typed lands there;
//   5. the bar over picked words starts Bold, Italic, Link;
//   6. the grip's block menu opens beside the grip, not over its line, actions first, "Turn into" a step away, no "Close menu";
//   7. the / menu typed on the last line flips above it, clear of the "Add a thought" bar; the word count hides meanwhile;
//   8. "#astro" by "#astrophysics" offers it first, and once written says it is a new tag with "Use #astrophysics".
//   QA_ARGS=--sandbox QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/editor-critique.mjs [shots-dir]
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const shots = process.argv[2]
const { check, done } = checks()
const c = await sandbox({ width: 1440, height: 900 })
const { h, v } = c
const wait = (ms) => h.waitForTimeout(ms)
const p = (text) => ({ type: 'paragraph', content: text ? [{ type: 'text', text }] : [] })
const ed = () => h.evaluate(() => !!document.querySelector('[data-open] .tiptap:not(.is-line):not(.is-plain)')?.editor)
const caretAt = (text, end = true) => h.evaluate(([text, end]) => {
  const e = document.querySelector('[data-open] .tiptap:not(.is-line):not(.is-plain)').editor
  let at = 0
  e.state.doc.descendants((node, pos) => { if (node.isText && node.text.includes(text)) at = pos + node.text.indexOf(text) + (end ? text.length : 0) })
  e.chain().focus().setTextSelection(at).run()
}, [text, end])
const docText = () => h.evaluate(() => document.querySelector('[data-open] .tiptap:not(.is-line):not(.is-plain)').editor.getText())
const FIRST = 'Kepler threw out the circle after six years of numbers'
try {
  await v('settings:set', { sounds: false, hintRate: 0 })

  // 1. Named by its first line.
  const id = await v('article:new')
  await v('item:save', id, { body: { type: 'doc', content: [p(`${FIRST} that would not fit.`), p('Mars kept missing by eight minutes of arc.'), p('tagged')] } })
  await c.send('article', id); await wait(1800)
  const named = await h.evaluate((first) => {
    const start = first.slice(0, 24)
    const leaves = [...document.querySelectorAll('body *')].filter((el) => !el.closest('.ProseMirror') && [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().startsWith(start)))
    const where = leaves.map((el) => el.closest('[data-tab]') ? 'tab' : el.closest('aside[aria-label="Recent"], [data-chrome]') ? 'side' : el.closest('[data-row], li, [role="option"], [role="row"], button') ? 'list' : el.tagName.toLowerCase())
    const untitled = [...document.querySelectorAll('body *')].filter((el) => [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim() === 'Untitled')).length
    return { where, untitled, field: !!document.querySelector('[data-page-title] [contenteditable="true"]') }
  }, FIRST)
  check('1. no title field on a page named by its first line', !named.field, JSON.stringify(named))
  check('1. its first line names it in the tab', named.where.includes('tab'), JSON.stringify(named.where))
  check('1. and in at least two more places (Recent, the list)', named.where.filter((one) => one !== 'tab').length >= 2, JSON.stringify(named.where))
  check('1. "Untitled" is shown nowhere', named.untitled === 0, String(named.untitled))
  const item = await v('item', id)
  check('1. read back, it is called by its first line and marked as having no title of its own', item?.title?.startsWith(FIRST) && item.line != null, JSON.stringify({ title: item?.title, line: item?.line }))
  const raw = await h.evaluate((id) => window.api.haligtree('items:find', 'Kepler threw').then((rows) => rows.find((one) => one.id === id)), id)
  check('1. ⌘K and @ find it by its first line too', raw?.title?.startsWith(FIRST), JSON.stringify(raw))
  // An empty one reads "New note".
  const empty = await v('article:new')
  await c.send('article', empty); await wait(1500)
  const emptyTab = await h.evaluate(() => [...document.querySelectorAll('[data-tab]')].map((t) => t.textContent.trim()))
  check('1. an empty page reads "New note" in its tab', emptyTab.some((t) => t.includes('New note')), JSON.stringify(emptyTab))
  // A title of its own wins.
  const titled = await v('article:new')
  await v('item:save', titled, { title: 'Orbits', body: { type: 'doc', content: [p('Some words first.')] } })
  await c.send('article', titled); await wait(1500)
  const field = await h.evaluate(() => document.querySelector('[data-page-title] [contenteditable="true"]')?.textContent ?? null)
  check('1. a page with a title of its own shows it in its field', field === 'Orbits', String(field))

  // 2. Serif.
  await c.send('article', id); await wait(1500)
  const font = await h.evaluate(() => getComputedStyle(document.querySelector('[data-open] .ProseMirror p')).fontFamily)
  check('2. notes are written in Fraunces', /Fraunces/.test(font), font)
  if (shots) {
    for (const [w, hh] of [[1440, 900], [760, 900]]) { await c.size(w, hh); await wait(600); await c.both(`${shots}/named-${w}`) }
    await c.size(1440, 900); await wait(600)
  }

  // 3. /tab then Enter makes a table.
  await caretAt('tagged'); await h.keyboard.press('Enter'); await h.keyboard.type('/tab', { delay: 40 }); await wait(500)
  const top = await h.evaluate(() => document.querySelector('.tiptap-slash-menu [aria-selected="true"], .tiptap-slash-menu .is-selected, .tiptap-slash-menu button')?.textContent.trim())
  await h.keyboard.press('Enter'); await wait(600)
  const table = await h.evaluate(() => { let n = 0; document.querySelector('[data-open] .tiptap:not(.is-line):not(.is-plain)').editor.state.doc.descendants((node) => void (node.type.name === 'table' && n++)); return n })
  check('3. "/tab" offers Table first, and Enter makes a table', table === 1, JSON.stringify({ top, table }))

  // 4. Tab keeps the caret in the note.
  await caretAt('eight minutes of arc.'); await h.keyboard.type(' One', { delay: 30 })
  await h.keyboard.press('Tab'); await h.keyboard.type(' two', { delay: 30 }); await wait(300)
  const kept = await h.evaluate(() => ({ inside: !!document.activeElement?.closest('.ProseMirror') }))
  check('4. Tab in a paragraph keeps the caret in the note', kept.inside, JSON.stringify(kept))
  check('4. the word typed after Tab lands in the note', (await docText()).includes('arc. One two'), (await docText()).slice(0, 160))
  await h.keyboard.press('Shift+Tab'); await h.keyboard.type(' three', { delay: 30 }); await wait(200)
  check('4. so does ⇧Tab', (await docText()).includes('One two three'), '')

  // 5. The selection bar's order.
  await h.evaluate(() => { const e = document.querySelector('[data-open] .tiptap:not(.is-line):not(.is-plain)').editor; let at = 0; e.state.doc.descendants((n, pos) => { if (n.isText && n.text.includes('six years')) at = pos + n.text.indexOf('six years') }); e.chain().focus().setTextSelection({ from: at, to: at + 9 }).run() })
  await wait(900)
  const bar = await h.evaluate(() => [...document.querySelectorAll('[data-selection-bar] button, [data-selection-bar] [role="separator"], [data-selection-bar] .tiptap-separator, [data-selection-bar] [data-orientation="vertical"]')].filter((b) => b.offsetParent || b.getBoundingClientRect().height).map((b) => b.tagName === 'BUTTON' ? b.getAttribute('aria-label') || b.textContent.trim() : '|'))
  check('5. the bar starts Bold, Italic, Link', bar[0] === 'Bold' && bar[1] === 'Italic' && bar[2] === 'Link', JSON.stringify(bar))
  check('5. then "Aa" for the rest, and Haligtree\'s own actions after a line, by name', bar.includes('More text styles') && bar.indexOf('|') > 2 && bar.includes('Gem'), JSON.stringify(bar))
  const words = await h.evaluate(() => [...document.querySelectorAll('[data-selection-bar] [data-keep-word] .tiptap-button-text')].filter((w) => w.getBoundingClientRect().width).map((w) => w.textContent.trim()))
  check('5. Capture and Gem say their names on the bar', words.join() === 'Capture,Gem', JSON.stringify(words))
  if (shots) await c.both(`${shots}/toolbar-1440`)
  await caretAt('Mars', false); await wait(300)

  // 6. The block menu beside the grip.
  const line = await h.evaluate(() => { const el = [...document.querySelectorAll('[data-open] .ProseMirror > p')].find((one) => one.textContent.startsWith('Mars')); const r = el.getBoundingClientRect(); return { x: r.left + 40, y: r.top + 8, left: r.left, top: r.top, bottom: r.top + 26 } })
  await h.mouse.move(line.x, line.y); await wait(200); await h.mouse.move(line.x + 5, line.y + 2); await wait(400)
  await h.locator('.tiptap-drag-handle-grip').click({ force: true }); await wait(500)
  const menu = await h.evaluate(() => {
    const m = document.querySelector('.tiptap-block-menu'); if (!m) return null
    const r = m.getBoundingClientRect()
    const rows = [...m.querySelectorAll('.tiptap-slash-menu-title')].map((t) => t.textContent.trim())
    return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, rows, sub: !!m.querySelector('[data-turn-into-sub]'), close: !!m.querySelector('[data-close-menu]') }
  })
  check('6. the block menu opens beside the grip, clear of its line', menu && (menu.right <= line.left + 2 || menu.top >= line.bottom - 2), JSON.stringify({ menu: menu && { left: menu.left, right: menu.right, top: menu.top }, line }))
  const pane = await h.evaluate(() => { let at = document.querySelector('[data-open] .ProseMirror'); for (; at; at = at.parentElement) if (/(auto|scroll)/.test(getComputedStyle(at).overflowY)) return at.getBoundingClientRect().left; return 0 })
  check('6. the block menu stays inside the note\'s pane, never over the list of notes', menu && menu.left >= pane - 1, JSON.stringify({ left: menu?.left, pane }))
  check('6. its actions come first, "Turn into" a step away, no "Close menu"', menu && menu.sub && !menu.close && !['Text', 'Heading 1'].includes(menu.rows[0]), JSON.stringify(menu?.rows))
  if (shots) await c.both(`${shots}/block-menu-1440`)
  await h.keyboard.press('Escape'); await wait(300)

  // 7. The / menu on a low line flips above it, clear of the bar.
  const long = await v('article:new')
  await v('item:save', long, { body: { type: 'doc', content: Array.from({ length: 40 }, (_, i) => p(`Line ${i + 1} of a long page about orbits and numbers.`)) } })
  await c.send('article', long); await wait(1800)
  await caretAt('Line 40 of a long page about orbits and numbers.')
  await h.evaluate(() => { const e = document.querySelector('[data-open] .tiptap:not(.is-line):not(.is-plain)').editor; const at = e.view.coordsAtPos(e.state.selection.from); const scroller = document.querySelector('[data-open] .haligtree-editor-content') ?? document.scrollingElement; scroller.scrollTop = scroller.scrollHeight })
  await wait(400)
  await h.keyboard.press('Enter'); await h.keyboard.type('/', { delay: 40 }); await wait(600)
  const low = await h.evaluate(() => {
    const m = document.querySelector('.tiptap-slash-menu')?.getBoundingClientRect()
    const bar = [...document.querySelectorAll('[data-composer]')].map((b) => b.getBoundingClientRect()).find((r) => r.height && r.top > innerHeight / 2)
    const e = document.querySelector('[data-open] .tiptap:not(.is-line):not(.is-plain)').editor
    const caret = e.view.coordsAtPos(e.state.selection.from)
    const count = document.querySelector('.tiptap-word-count')
    return { menu: m && { top: m.top, bottom: m.bottom }, bar: bar && bar.top, caret: caret.top, count: count ? getComputedStyle(count).visibility : 'none' }
  })
  check('7. the / menu stops above the "Add a thought" bar', low.menu && (!low.bar || low.menu.bottom <= low.bar + 1), JSON.stringify(low))
  check('7. with no room under its line, the / menu opens above it', low.menu && low.menu.bottom <= low.caret + 2, JSON.stringify(low))
  check('7. the word count hides while the menu is open', low.count !== 'visible', low.count)
  if (shots) await c.both(`${shots}/slash-low-1440`)
  await h.keyboard.press('Escape'); await wait(200)

  // 8. #astro by #astrophysics.
  const tagged = await v('article:new')
  await v('item:save', tagged, { body: { type: 'doc', content: [p('For the #astrophysics exam.'), p('More')] } })
  await c.send('article', tagged); await wait(1800)
  await caretAt('More'); await h.keyboard.type(' #astro', { delay: 50 }); await wait(700)
  const offered = await h.evaluate(() => [...document.querySelectorAll('.tiptap-slash-menu button, .tiptap-slash-menu [role="option"]')].map((b) => b.textContent.trim()))
  check('8. "#astro" offers #astrophysics first', /astrophysics/.test(offered[0] ?? ''), JSON.stringify(offered))
  await h.keyboard.type(' ', { delay: 50 }); await wait(900)
  const said = await h.evaluate(() => [...document.querySelectorAll('[data-sonner-toast], [role=status], [data-toast-up]')].map((t) => t.textContent.trim()).join(' | '))
  check('8. written anyway, it says it is a new tag and offers "Use #astrophysics"', /#astro is a new tag/.test(said) && /Use #astrophysics/.test(said), said)
  const use = h.getByText('Use #astrophysics').first()
  if (await use.count()) { await use.click(); await wait(500) }
  check('8. "Use #astrophysics" puts the tag in use there', (await docText()).includes('More #astrophysics'), (await docText()).slice(0, 80))
} catch (error) {
  check('the run finished', false, error.message.split('\n')[0])
} finally {
  if (c.errors.length) console.log('page errors:', c.errors.slice(0, 5).join(' / '))
  await c.close?.()
}
done()
