// Every "/" command, by real typing, in each place a person types one: an empty line at the top of a note, after
// words in a paragraph, in a list, a table cell, a callout, and (BIG=<capture id>) at the end of a very long note.
// For each: typing its name finds it first; Esc takes the "/" and what was typed after it and leaves the note as it
// was; Enter makes what its name says; one ⌘Z puts the note back as it was before the "/". The menu's rows are one
// height, show the hand, cut no words short and keep inside the window. One line per command and place.
//   QA_ARGS=--sandbox QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/slash-every.mjs
//   SHOTS=dir keeps frames 50ms apart through the menu opening, filtering and picking, light and dark.
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'
const { check, done } = checks()
const c = await sandbox({ width: 1280, height: 900 })
const { h, v } = c
const wait = (ms) => h.waitForTimeout(ms)
const sel = '[data-open] .tiptap'
const p = (text) => (text ? { type: 'paragraph', content: [{ type: 'text', text }] } : { type: 'paragraph' })
const doc = () => h.evaluate((sel) => JSON.stringify(document.querySelector(sel).editor.getJSON()), sel)
const kinds = (json) => [...new Set([...json.matchAll(/"type":"([a-zA-Z]+)"/g)].map((one) => one[1]))]
const menu = () => h.evaluate(() => {
  const box = document.querySelector('.tiptap-suggestion-popup .tiptap-slash-menu')
  if (!box) return null
  const r = box.getBoundingClientRect()
  const rows = [...box.querySelectorAll('.tiptap-slash-menu-list > button')]
  return {
    first: rows[0]?.querySelector('.tiptap-slash-menu-title')?.textContent ?? '', count: rows.length, asks: box.hasAttribute('data-slash-prompt'),
    inside: r.left >= 8 && r.top >= 8 && r.right <= innerWidth - 8 && r.bottom <= innerHeight - 8,
    heights: [...new Set(rows.map((one) => Math.round(one.getBoundingClientRect().height)))], hand: rows.every((one) => getComputedStyle(one).cursor === 'pointer'),
    // A long file name is cut with "…" on purpose and says itself whole on hover (the row's title): any other cut is a fault.
    cut: rows.filter((one) => { const words = one.querySelector('.tiptap-slash-menu-title'); return words && words.scrollWidth > words.clientWidth + 1 && !one.title }).length,
    pad: rows[0] ? [Math.round(rows[0].getBoundingClientRect().left - r.left), Math.round(r.right - rows[0].getBoundingClientRect().right)] : null,
  }
})
// Each place: the note laid down, the caret put where the "/" will be typed, and what is typed before it.
const PLACES = {
  // An empty first line over a line of words: a note with nothing in it at all is the new-note page, whose "/" is not the editor's.
  top: { lead: '', set: (ed) => { ed.commands.setContent({ type: 'doc', content: [{ type: 'paragraph' }, { type: 'paragraph', content: [{ type: 'text', text: 'Words under it.' }] }] }); ed.chain().focus().setTextSelection(1).run() } },
  'after words': { lead: ' ', set: (ed) => { ed.commands.setContent({ type: 'doc', content: ['Before words.', 'Middle words', 'After words.'].map((text) => ({ type: 'paragraph', content: [{ type: 'text', text }] })) }); let at = 0; ed.state.doc.descendants((node, pos) => void (node.isText && node.text === 'Middle words' && (at = pos + node.nodeSize))); ed.chain().focus().setTextSelection(at).run() } },
  list: { lead: ' ', set: (ed) => { ed.commands.setContent({ type: 'doc', content: [{ type: 'bulletList', content: ['First item', 'Second item'].map((text) => ({ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] })) }] }); let at = 0; ed.state.doc.descendants((node, pos) => void (node.isText && node.text === 'First item' && (at = pos + node.nodeSize))); ed.chain().focus().setTextSelection(at).run() } },
  'table cell': { lead: '', set: (ed) => ed.chain().setContent({ type: 'doc', content: [{ type: 'paragraph' }] }).focus('start').insertTable({ rows: 2, cols: 2, withHeaderRow: true }).run() },
  callout: { lead: '', set: (ed) => ed.chain().setContent({ type: 'doc', content: [{ type: 'paragraph' }] }).focus('start').toggleCallout().run() },
}
// The menu once it has opened (or closed), never a fixed wait: a busy machine opens it late.
const menuWhen = async (open = true) => { for (let n = 0; n < 40; n++) { const now = await menu(); if (!!now === open && (!open || now.count > 0 || now.asks)) return now; await wait(80) } return menu() }
const place = (name) => h.evaluate(([sel, code]) => new Function('ed', `return (${code})(ed)`)(document.querySelector(sel).editor), [sel, PLACES[name].set.toString()])
// Opens a system sheet or the microphone when run: found and backed out of, never run here.
const NOT_RUN = /^(File|PDF|Voice note|Call or lecture|Dictate|Export as .+)$/
const EVERYWHERE = ['Heading 2', 'Bulleted list', 'Checklist', 'Quote', 'Code', 'Callout', 'Divider', 'Table']
// Not offered there, by design: no table in a table's cell; no quote or callout on a list's line (they cannot wrap it).
const SKIP = { 'table cell': ['Table'], list: ['Quote', 'Callout'] }
const rows = []
async function walk(title, where, { big = false } = {}) {
  const out = { title, where }
  if (!big) { await place(where); await wait(120) }
  if (!big && PLACES[where].lead) await h.keyboard.type(PLACES[where].lead)
  await wait(80)
  const before = await doc()
  // Found by its name, and Esc leaves nothing of it.
  const started = Date.now()
  await h.keyboard.type(`/${title.toLowerCase()}`, { delay: 12 }); await wait(250)
  let shown = await menuWhen()
  out.opened = !!shown
  out.ms = Date.now() - started
  out.found = shown?.first === title
  out.look = shown ? shown.inside && shown.heights.length <= 1 && shown.hand && !shown.cut : null
  out.lookWhy = shown && !out.look ? JSON.stringify(shown) : ''
  if (!shown) return out
  await h.keyboard.press('Escape'); await menuWhen(false)
  out.esc = (await doc()) === before && !(await menu())
  if (NOT_RUN.test(title) || !out.found) return out
  // Picked: what it makes, then one ⌘Z.
  // A pause before picking, as a person reading the menu makes: longer than the half second that joins two edits into one undo.
  await h.keyboard.type(`/${title.toLowerCase()}`, { delay: 12 }); await menuWhen(); await wait(700)
  await h.keyboard.press('Enter'); await wait(450)
  shown = await menu()
  if (shown?.asks) {
    // A question first (which link, which video): answered with a link, kept with Enter.
    out.asked = true
    await h.keyboard.type('https://www.youtube.com/watch?v=dQw4w9WgXcQ', { delay: 4 }); await h.keyboard.press('Enter'); await wait(900)
  }
  // A question in a sheet (the formula, the source), or a list of notes (a link, an embed): left with Esc.
  for (let n = 0; n < 2 && (await h.evaluate(() => !!document.querySelector('[data-ask], .tiptap-suggestion-popup, [role="dialog"]:not(.mf-read)'))); n++) { out.asked = true; await h.keyboard.press('Escape'); await wait(300) }
  const after = await doc()
  out.made = kinds(after).filter((one) => !kinds(before).includes(one)).join('+') || (after === before ? 'nothing' : 'same kinds')
  out.left = /"text":"[^"]*\/[a-z]/.test(after) && !/https:/.test(after)
  await h.evaluate((sel) => document.querySelector(sel).editor.commands.focus(), sel)
  let steps = 0
  for (; steps < 6 && (await doc()) !== before; steps++) { await h.keyboard.press('Meta+z'); await wait(180) }
  out.undo = (await doc()) === before ? steps : -1
  return out
}
try {
  await v('settings:set', { sounds: false, hintRate: 0, safeMode: false })
  const id = await h.evaluate((body) => window.api.captures.create({ kind: 'note', body }), { type: 'doc', content: [p('Slash every')] })
  await c.send('capture', id); await wait(1800)
  await place('top'); await wait(200)
  await h.keyboard.type('/', { delay: 20 }); await menuWhen(); await wait(300)
  const all = await h.evaluate(() => [...document.querySelectorAll('.tiptap-slash-menu-list > button')].map((one) => ({ title: one.querySelector('.tiptap-slash-menu-title')?.textContent ?? '', group: '' })))
  const whole = await menu()
  if (process.env.SHOTS) for (const theme of ['light', 'dark']) { await c.look(theme); await h.screenshot({ path: `${process.env.SHOTS}/slash-open-${theme}.png` }) }
  await h.keyboard.press('Escape'); await wait(200)
  check('"/" on an empty line opens the menu with every command', all.length >= 30, `${all.length} rows`)
  check('the open menu keeps inside the window, rows one height, the hand on each, no name cut short', !!whole && whole.inside && whole.heights.length === 1 && whole.hand && !whole.cut, JSON.stringify(whole))
  check('a row keeps the same room on its left and right', !!whole?.pad && Math.abs(whole.pad[0] - whole.pad[1]) <= 6, JSON.stringify(whole?.pad))
  const only = process.env.ONLY ? new RegExp(process.env.ONLY, 'i') : null
  const titles = all.map((one) => one.title).filter((title) => PLACES && !/\.(png|jpe?g|pdf|gif|webp|mp3|m4a|mov|mp4)$/i.test(title) && (!only || only.test(title)))
  // Frames through one open, filter and pick.
  if (process.env.SHOTS) {
    await c.look('dark'); await place('top')
    const typed = '/call'
    let n = 0
    const frame = async () => h.screenshot({ path: `${process.env.SHOTS}/slash-frame-${String(n++).padStart(2, '0')}.png`, clip: { x: 300, y: 100, width: 900, height: 620 } })
    for (const key of typed) { await h.keyboard.type(key); await frame(); await wait(50); await frame() }
    for (let i = 0; i < 6; i++) { await wait(50); await frame() }
    await h.keyboard.press('Enter'); for (let i = 0; i < 6; i++) { await wait(50); await frame() }
    await c.look('light'); await h.screenshot({ path: `${process.env.SHOTS}/slash-callout-light.png` }); await c.look('dark')
  }
  for (const title of titles) rows.push(await walk(title, 'top'))
  for (const where of Object.keys(PLACES).filter((one) => one !== 'top' && !process.env.TOP_ONLY)) for (const title of EVERYWHERE.filter((one) => (!only || only.test(one)) && !SKIP[where]?.includes(one))) rows.push(await walk(title, where))
  // Table's own commands, in a cell.
  await place('list'); await h.keyboard.type(' /', { delay: 20 }); await menuWhen(); await wait(300)
  const inList = await h.evaluate(() => [...document.querySelectorAll('.tiptap-slash-menu-list > button .tiptap-slash-menu-title')].map((one) => one.textContent))
  await h.keyboard.press('Escape'); await menuWhen(false)
  check('on a list\'s line the menu leaves out what cannot be made there (a quote, a callout)', inList.length > 10 && !inList.includes('Quote') && !inList.includes('Callout'), inList.join(', ').slice(0, 160))
  await place('table cell'); await h.keyboard.type('/', { delay: 20 }); await menuWhen(); await wait(300)
  const inTable = await h.evaluate(() => [...document.querySelectorAll('.tiptap-slash-menu-list > button .tiptap-slash-menu-title')].map((one) => one.textContent))
  await h.keyboard.press('Escape'); await wait(150)
  for (const title of inTable.filter((one) => /row|column|header|Merge|Fit to width|Delete table/.test(one) && (!only || only.test(one)))) rows.push(await walk(title, 'table cell'))
  check('in a table cell the menu offers the table\'s own commands, not a table in a table, and no merge with one plain cell', inTable.includes('Insert row below') && !inTable.includes('Table') && !inTable.includes('Two columns') && !inTable.includes('Merge or split cells'), inTable.join(', ').slice(0, 200))
  // The end of a very long note (BIG=<capture id>, a copy of a real book).
  if (process.env.BIG) {
    await c.send('capture', process.env.BIG)
    // Its words in the page first (a very long note takes a moment), then the caret at its very end, on a new line.
    for (let n = 0; n < 100 && !(await h.evaluate((sel) => (document.querySelector(sel)?.editor?.state.doc.content.size ?? 0) > 100000, sel)); n++) await wait(200)
    console.log(`NOTE  the long note: ${await h.evaluate((sel) => document.querySelector(sel).editor.state.doc.textContent.length, sel)} characters`)
    await h.evaluate((sel) => document.querySelector(sel).editor.commands.focus('end'), sel); await wait(800)
    await h.keyboard.press('Enter'); await wait(800)
    for (const title of ['Heading 2', 'Checklist', 'Table']) rows.push(await walk(title, 'end of the long note', { big: true }))
    await h.keyboard.press('Meta+z'); await wait(600)
  }
  for (const one of rows) console.log(`ROW  ${one.title.padEnd(22)} | ${one.where.padEnd(20)} | found ${one.found ? 'yes' : 'NO'} | esc ${one.esc === undefined ? '-' : one.esc ? 'clean' : 'LEFT WORDS'} | made ${String(one.made ?? '-').padEnd(26)} | ⌘Z ${one.undo === undefined ? '-' : one.undo === -1 ? 'NOT BACK' : one.undo} | menu ${one.look === null ? 'none' : one.look ? 'ok' : 'BAD ' + one.lookWhy.slice(0, 160)} | ${one.ms}ms${one.left ? ' | "/" LEFT IN NOTE' : ''}`)
  const ran = rows.filter((one) => one.undo !== undefined)
  check('every command is found first by typing its name', rows.every((one) => one.found), rows.filter((one) => !one.found).map((one) => `${one.title} (${one.where})`).join(', '))
  check('Esc takes the "/" and what was typed, and leaves the note as it was', rows.every((one) => one.esc !== false), rows.filter((one) => one.esc === false).map((one) => `${one.title} (${one.where})`).join(', '))
  check('picked, no "/name" is left in the note', ran.every((one) => !one.left), ran.filter((one) => one.left).map((one) => `${one.title} (${one.where})`).join(', '))
  check('one ⌘Z puts the note back as it was before the "/"', ran.every((one) => one.undo === 1 || (one.undo === 0 && (one.asked || one.made === 'nothing'))), ran.filter((one) => !(one.undo === 1 || (one.undo === 0 && (one.asked || one.made === 'nothing')))).map((one) => `${one.title} (${one.where}): ${one.undo}`).join(', '))
  check('the menu keeps its shape wherever it opens', rows.every((one) => one.look !== false), rows.filter((one) => one.look === false).map((one) => `${one.title} (${one.where})`).join(', '))
  check('no page errors', !c.errors.some((one) => /PAGEERROR/.test(one)), c.errors.join(' / ').slice(0, 300))
} catch (error) {
  for (const one of rows) console.log(`ROW  ${one.title} | ${one.where} | found ${one.found} | esc ${one.esc} | made ${one.made} | undo ${one.undo}`)
  check('the run finished', false, error.message.split('\n')[0])
} finally { await c.close() }
done()
