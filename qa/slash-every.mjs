// Every "/" command, by real typing, in each place a person types one: an empty line at the top of a note, after
// words in a paragraph, in a list, a table cell, a callout, and (BIG=<capture id>) at the end of a very long note.
// For each: typing its name finds it first; Esc takes the "/" and what was typed after it and leaves the note as it
// was; Enter makes what its name says; one ⌘Z puts the note back as it was before the "/". The menu's rows are one
// height, show the hand, cut no words short and keep inside the window. One line per command and place.
//
// One section a run, each about 90 seconds (all of it in one run took over six minutes and held the shared queue):
//   menu       the open menu: its shape, one lit row whatever the pointer rests on, the note's name while a search
//              is open, what a list's line and a table's cell offer. SHOTS=dir keeps frames 50ms apart, light and dark.
//   top:1 top:2 top:3   every command at the top of a note, a third of them a run
//   places:1   the eight commonest after words and in a list;  places:2   the same in a table cell and in a callout
//   table      the table's own commands, in a cell
//   picks      the commands that ask for a choice, taken to their result: a note picked for "Link to a note" and
//              "Embed a note", a real file handed to "File" and "PDF" through the page's own file picker
//   files      on a copy of a real book (QA_ARGS= QA_DATA=<copy>): the book's own files in the menu, called by their names
//   big        BIG=<capture id>, on a copy of a real book: three commands at the end of a very long note
//
//   QA_ARGS=--sandbox QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/slash-every.mjs <section>
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'
const SECTIONS = ['menu', 'top:1', 'top:2', 'top:3', 'places:1', 'places:2', 'table', 'picks', 'files', 'big']
const SECTION = process.argv[2] ?? process.env.SECTION ?? ''
if (!SECTIONS.includes(SECTION)) {
  console.log(`Say which section to run, one a run: node qa/slash-every.mjs <${SECTIONS.join(' | ')}>`)
  process.exit(2)
}
const { check, done } = checks()
const c = await sandbox({ width: 1280, height: 900 })
const { h, v } = c
const wait = (ms) => h.waitForTimeout(ms)
const sel = '[data-open] .tiptap'
const p = (text) => (text ? { type: 'paragraph', content: [{ type: 'text', text }] } : { type: 'paragraph' })
const doc = () => h.evaluate((sel) => JSON.stringify(document.querySelector(sel).editor.getJSON()), sel)
const kinds = (json) => [...new Set([...json.matchAll(/"type":"([a-zA-Z]+)"/g)].map((one) => one[1]))]
// A row of the book's own files says its kind at its end; a command says its shortcut there, or nothing.
const FILE_WORD = /^(Picture|GIF|PDF|Recording|Video|Document|File)$/
const menu = () => h.evaluate((fileWord) => {
  const box = document.querySelector('.tiptap-suggestion-popup .tiptap-slash-menu')
  if (!box) return null
  const r = box.getBoundingClientRect()
  const rows = [...box.querySelectorAll('.tiptap-slash-menu-list > button')]
  return {
    first: rows[0]?.querySelector('.tiptap-slash-menu-title')?.textContent ?? '', count: rows.length, asks: box.hasAttribute('data-slash-prompt'),
    inside: r.left >= 8 && r.top >= 8 && r.right <= innerWidth - 8 && r.bottom <= innerHeight - 8,
    heights: [...new Set(rows.map((one) => Math.round(one.getBoundingClientRect().height)))], hand: rows.every((one) => getComputedStyle(one).cursor === 'pointer'),
    // A command's name is never cut. A long file name is cut with "…" in its row and read whole in its card beside the menu (the files section reads it there).
    cut: rows.filter((one) => { const words = one.querySelector('.tiptap-slash-menu-title'); return words && words.scrollWidth > words.clientWidth + 1 && !new RegExp(fileWord).test(one.querySelector('.tiptap-slash-menu-hint')?.textContent ?? '') }).length,
    // No row wears the Mac's own grey tip (a title): a menu row shows no tip.
    tips: rows.filter((one) => one.title).length,
    pad: rows[0] ? [Math.round(rows[0].getBoundingClientRect().left - r.left), Math.round(r.right - rows[0].getBoundingClientRect().right)] : null,
  }
}, FILE_WORD.source)
// The rows of any of the editor's lists that are lit now (a fill of their own), by their words.
const lit = (list) => h.evaluate((list) => [...document.querySelectorAll(`${list} button`)].filter((one) => { const fill = getComputedStyle(one).backgroundColor; return fill !== 'rgba(0, 0, 0, 0)' && fill !== 'transparent' }).map((one) => (one.textContent ?? '').trim().slice(0, 30)), list)
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
const menuWhen = async (open = true, tries = 40) => { for (let n = 0; n < tries; n++) { const now = await menu(); if (!!now === open && (!open || now.count > 0 || now.asks)) return now; await wait(80) } return menu() }
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
  let shown = await menuWhen(true, big ? 150 : 40)
  out.opened = !!shown
  out.ms = Date.now() - started
  out.found = shown?.first === title
  out.look = shown ? shown.inside && shown.heights.length <= 1 && shown.hand && !shown.cut && !shown.tips : null
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
  for (let n = 0; n < 2 && (await h.evaluate(() => !!document.querySelector('[data-ask], .tiptap-suggestion-popup, [role="dialog"]:not(.mf-read)'))); n++) { out.asked = true; out.backedOut = true; await h.keyboard.press('Escape'); await wait(300) }
  const after = await doc()
  out.made = kinds(after).filter((one) => !kinds(before).includes(one)).join('+') || (after === before ? 'nothing' : 'same kinds')
  out.left = /"text":"[^"]*\/[a-z]/.test(after) && !/https:/.test(after)
  await h.evaluate((sel) => document.querySelector(sel).editor.commands.focus(), sel)
  let steps = 0
  for (; steps < 6 && (await doc()) !== before; steps++) { await h.keyboard.press('Meta+z'); await wait(180) }
  out.undo = (await doc()) === before ? steps : -1
  return out
}
/** Every row of the open menu with the heading it sits under: the book's own files ("From Files, in no note yet") are not commands. */
const listed = () => h.evaluate(() => { let group = ''; return [...document.querySelectorAll('.tiptap-slash-menu-list > *')].flatMap((one) => (one.matches('.tiptap-slash-menu-group') ? ((group = one.textContent ?? ''), []) : [{ title: one.querySelector('.tiptap-slash-menu-title')?.textContent ?? '', group, hint: one.querySelector('.tiptap-slash-menu-hint')?.textContent ?? '', cut: (() => { const words = one.querySelector('.tiptap-slash-menu-title'); return !!words && words.scrollWidth > words.clientWidth + 1 })(), tip: one.title }])) })
const report = () => {
  for (const one of rows) console.log(`ROW  ${one.title.padEnd(22)} | ${one.where.padEnd(20)} | found ${one.found ? 'yes' : 'NO'} | esc ${one.esc === undefined ? '-' : one.esc ? 'clean' : 'LEFT WORDS'} | made ${String(one.made ?? '-').padEnd(26)} | ⌘Z ${one.undo === undefined ? '-' : one.undo === -1 ? 'NOT BACK' : one.undo} | menu ${one.look === null ? 'none' : one.look ? 'ok' : 'BAD ' + one.lookWhy.slice(0, 160)} | ${one.ms}ms${one.left ? ' | "/" LEFT IN NOTE' : ''}`)
  const ran = rows.filter((one) => one.undo !== undefined)
  const undone = (one) => one.undo === 1 || (one.undo === 0 && (one.asked || one.made === 'nothing'))
  check(`${SECTION}: every command is found first by typing its name (${rows.length} walked)`, rows.length > 0 && rows.every((one) => one.found), rows.filter((one) => !one.found).map((one) => `${one.title} (${one.where})`).join(', '))
  check(`${SECTION}: Esc takes the "/" and what was typed, and leaves the note as it was`, rows.every((one) => one.esc !== false), rows.filter((one) => one.esc === false).map((one) => `${one.title} (${one.where})`).join(', '))
  check(`${SECTION}: picked, no "/name" is left in the note`, ran.every((one) => !one.left), ran.filter((one) => one.left).map((one) => `${one.title} (${one.where})`).join(', '))
  check(`${SECTION}: one ⌘Z puts the note back as it was before the "/"`, ran.every(undone), ran.filter((one) => !undone(one)).map((one) => `${one.title} (${one.where}): ${one.undo}`).join(', '))
  // A question backed out of (the formula, the source, which note) changes nothing: the note is exactly as it was, with no ⌘Z needed.
  const backed = ran.filter((one) => one.backedOut)
  check(`${SECTION}: backing out of a command's question leaves the note exactly as it was (${backed.map((one) => one.title).join(', ') || 'none asked here'})`, backed.every((one) => one.made === 'nothing' && one.undo === 0), backed.filter((one) => !(one.made === 'nothing' && one.undo === 0)).map((one) => `${one.title}: made ${one.made}, ⌘Z ${one.undo}`).join(', '))
  check(`${SECTION}: the menu keeps its shape wherever it opens`, rows.every((one) => one.look !== false), rows.filter((one) => one.look === false).map((one) => `${one.title} (${one.where})`).join(', '))
}
try {
  await v('settings:set', { sounds: false, hintRate: 0, safeMode: false })
  const id = await h.evaluate((body) => window.api.captures.create({ kind: 'note', body }), { type: 'doc', content: [p('Slash every')] })
  await c.send('capture', id); await wait(2500)
  // A real press in the note first, as a person makes: the page has the keys from then on.
  await h.locator(sel).first().click(); await wait(400)
  await place('top'); await wait(300)
  // A letter typed and taken back first: proof the keys reach the note before the "/" is judged.
  await h.keyboard.type('x'); await wait(200); await h.keyboard.press('Backspace'); await wait(300)
  console.log(`NOTE  before the first "/": caret in the note ${await h.evaluate((sel) => document.querySelector(sel).editor.isFocused, sel)}`)
  await h.keyboard.type('/', { delay: 20 }); await menuWhen(); await wait(300)
  const all = await listed()
  const whole = await menu()
  const only = process.env.ONLY ? new RegExp(process.env.ONLY, 'i') : null
  const titles = all.filter((one) => !/^From Files/.test(one.group)).map((one) => one.title).filter((title) => !only || only.test(title))

  if (SECTION === 'menu') {
    if (process.env.SHOTS) for (const theme of ['light', 'dark']) { await c.look(theme); await h.screenshot({ path: `${process.env.SHOTS}/slash-open-${theme}.png` }) }
    // Where a middle row sits, for a pointer to rest on before the menu opens again.
    const rest = await h.evaluate(() => { const r = [...document.querySelectorAll('.tiptap-slash-menu-list > button')][6]?.getBoundingClientRect(); return r ? { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) } : null })
    await h.keyboard.press('Escape'); await menuWhen(false)
    check('"/" on an empty line opens the menu with every command', all.length >= 30, `${all.length} rows`)
    check('the open menu keeps inside the window, rows one height, the hand on each, no name cut short, no tip on a row', !!whole && whole.inside && whole.heights.length === 1 && whole.hand && !whole.cut && !whole.tips, JSON.stringify(whole))
    check('a row keeps the same room on its left and right', !!whole?.pad && Math.abs(whole.pad[0] - whole.pad[1]) <= 6, JSON.stringify(whole?.pad))

    // --- One lit row a menu. The pointer brought to rest where a row will be, then the menu opened by the keys.
    await h.mouse.move(rest.x - 40, rest.y - 30); await h.mouse.move(rest.x, rest.y); await wait(200)
    await place('top'); await wait(150)
    await h.keyboard.type('/', { delay: 20 }); await menuWhen(); await wait(350)
    const atRest = await lit('.tiptap-slash-menu-list')
    if (process.env.SHOTS) await h.screenshot({ path: `${process.env.SHOTS}/slash-one-lit.png`, clip: { x: 300, y: 100, width: 900, height: 620 } })
    check('opened under a pointer at rest, one row is lit, the first: the pointer changes nothing until it moves', atRest.length === 1 && /^Text/.test(atRest[0]), atRest.join(' | '))
    await h.keyboard.press('ArrowDown'); await wait(120)
    const byKey = await lit('.tiptap-slash-menu-list')
    check('↓ moves the one lit row, and still one is lit', byKey.length === 1 && /^Heading 1/.test(byKey[0]), byKey.join(' | '))
    await h.mouse.move(rest.x + 6, rest.y + 3); await wait(150)
    const byHand = await lit('.tiptap-slash-menu-list')
    check('the pointer moved: the row under it is the one lit row', byHand.length === 1 && !/^Heading 1/.test(byHand[0]), byHand.join(' | '))
    await h.keyboard.press('Escape'); await menuWhen(false)
    // The note lists ("[[") and the emoji row (":") share the rule.
    await place('top'); await wait(150)
    await h.keyboard.type('[[', { delay: 20 }); await wait(900)
    const notes = await lit('.tiptap-suggestion-popup .tiptap-slash-menu-list')
    check('"[[" opened under the resting pointer: one note lit', notes.length === 1, notes.join(' | ') || 'no list')
    await h.keyboard.press('Escape'); await wait(300)
    await place('top'); await wait(150)
    await h.keyboard.type(':smi', { delay: 30 }); await wait(700)
    const faces = await h.evaluate(() => { const list = document.querySelector('.tiptap-emoji-list'); if (!list) return null; const r = list.getBoundingClientRect(); return { x: Math.round(r.left + r.width * 0.7), y: Math.round(r.top + r.height / 2) } })
    if (faces) {
      await h.keyboard.press('Escape'); await wait(200)
      await h.mouse.move(faces.x - 30, faces.y - 20); await h.mouse.move(faces.x, faces.y); await wait(150)
      await place('top'); await wait(150)
      await h.keyboard.type(':smi', { delay: 30 }); await wait(700)
    }
    const emoji = await lit('.tiptap-emoji-list')
    check('":smi" opened under the resting pointer: one emoji lit', !!faces && emoji.length === 1, faces ? emoji.join(' | ') : 'no emoji list')
    await h.keyboard.press('Escape'); await wait(300)
    await h.mouse.move(640, 760)
    // A block's own menu (a right-click in the note) shares these rows' look: under a moving pointer its rows light one at a time.
    await place('after words'); await wait(200)
    const para = await h.locator(`${sel} p`).first().boundingBox()
    await h.mouse.move(para.x + 60, para.y + para.height / 2, { steps: 3 })
    await h.mouse.click(para.x + 60, para.y + para.height / 2, { button: 'right' }); await wait(700)
    const blockRows = await h.evaluate(() => [...document.querySelectorAll('.tiptap-block-menu-list button')].filter((one) => one.getClientRects().length).slice(0, 4).map((one) => { const r = one.getBoundingClientRect(); return { x: Math.round(r.left + 40), y: Math.round(r.top + r.height / 2) } }))
    const blockLit = []
    for (const at of blockRows.slice(1, 3)) { await h.mouse.move(at.x, at.y, { steps: 4 }); await wait(180); blockLit.push(await lit('.tiptap-block-menu-list')) }
    check('a block\'s right-click menu lights the row under a moving pointer, one row at a time', blockRows.length >= 3 && blockLit.length === 2 && blockLit.every((one) => one.length === 1) && blockLit[0][0] !== blockLit[1][0], JSON.stringify({ rows: blockRows.length, blockLit }))
    for (let n = 0; n < 2 && (await h.evaluate(() => !!document.querySelector('.tiptap-block-menu'))); n++) { await h.keyboard.press('Escape'); await wait(250) }
    await h.mouse.move(640, 760)

    // --- A note is named by its first line, never by a "/" search open on it.
    const named = async () => ({ label: (await h.evaluate((id) => window.api.captures.get(id), id))?.label ?? '', tab: await h.evaluate(() => (document.querySelector('[data-tab-on] [data-tab-name]')?.textContent ?? '').trim()), body: JSON.stringify((await h.evaluate((id) => window.api.captures.get(id), id))?.body ?? '') })
    await place('top'); await h.keyboard.type('x'); await h.keyboard.press('Backspace'); await wait(1500)
    const was = await named()
    await h.keyboard.type('/', { delay: 20 }); await menuWhen(); await wait(1600)
    const open1 = await named()
    await h.keyboard.type('hea', { delay: 60 }); await wait(1600)
    const open2 = await named()
    check('with "/" then "/hea" open on its first line the note keeps its name, in the book, its tab and its row', open1.label === was.label && open2.label === was.label && !/^\//.test(open1.tab) && !/^\//.test(open2.tab) && !/"text":"\/(hea)?"/.test(open2.body), JSON.stringify({ was: was.label, open1: open1.label, open2: open2.label, tab: open2.tab }))
    const rowNames = await h.evaluate(() => [...document.querySelectorAll('[data-row]')].map((one) => (one.textContent ?? '').trim().split('\n')[0].slice(0, 12)).filter((one) => /^\//.test(one)))
    check('no row of any list on show is named by the open search', rowNames.length === 0, rowNames.join(' | '))
    await h.keyboard.press('Escape'); await menuWhen(false); await wait(1500)
    const closed = await named()
    check('Esc: the note is as it was, name and words', closed.label === was.label && closed.body === was.body, JSON.stringify({ was: was.label, closed: closed.label }))
    // Left on the page as words (the caret taken off it with a click), it is the note's words from then on, and kept.
    await place('after words'); await h.keyboard.type(' /usr', { delay: 30 }); await wait(400)
    const afterWords = await h.locator(`${sel} p`).last().boundingBox()
    await h.mouse.click(afterWords.x + afterWords.width - 20, afterWords.y + afterWords.height / 2); await wait(1800)
    const kept = await named()
    check('a "/" search left on the page as words (the caret clicked off it) is kept with the note', /\/usr/.test(kept.body) && !(await menu()), kept.body.slice(0, 200))
    await h.mouse.move(640, 760)

    // --- What a list's line and a table's cell offer.
    await place('list'); await h.keyboard.type(' /', { delay: 20 }); await menuWhen(); await wait(300)
    const inList = await h.evaluate(() => [...document.querySelectorAll('.tiptap-slash-menu-list > button .tiptap-slash-menu-title')].map((one) => one.textContent))
    await h.keyboard.press('Escape'); await menuWhen(false)
    check('on a list\'s line the menu leaves out what cannot be made there (a quote, a callout)', inList.length > 10 && !inList.includes('Quote') && !inList.includes('Callout'), inList.join(', ').slice(0, 160))
    await place('table cell'); await h.keyboard.type('/', { delay: 20 }); await menuWhen(); await wait(300)
    const inTable = await h.evaluate(() => [...document.querySelectorAll('.tiptap-slash-menu-list > button .tiptap-slash-menu-title')].map((one) => one.textContent))
    await h.keyboard.press('Escape'); await wait(150)
    check('in a table cell the menu offers the table\'s own commands, not a table in a table, and no merge with one plain cell', inTable.includes('Insert row below') && !inTable.includes('Table') && !inTable.includes('Two columns') && !inTable.includes('Merge or split cells'), inTable.join(', ').slice(0, 200))

    // Frames through one open, filter and pick, 50ms apart, light and dark (SHOTS=dir).
    if (process.env.SHOTS) {
      for (const theme of ['dark', 'light']) {
        await c.look(theme); await place('top'); await wait(200)
        let n = 0
        const frame = async () => h.screenshot({ path: `${process.env.SHOTS}/slash-frame-${theme}-${String(n++).padStart(2, '0')}.png`, clip: { x: 300, y: 100, width: 900, height: 620 } })
        await frame()
        for (const key of '/call') { await h.keyboard.type(key); await frame(); await wait(50); await frame() }
        for (let i = 0; i < 6; i++) { await wait(50); await frame() }
        await h.keyboard.press('Enter'); for (let i = 0; i < 6; i++) { await wait(50); await frame() }
        await h.keyboard.press('Meta+z'); await wait(200)
      }
      await c.look('light')
    }
  } else {
    await h.keyboard.press('Escape'); await menuWhen(false)
  }

  if (SECTION.startsWith('top:')) {
    // A third of the commands a run, in the menu's own order.
    const part = Number(SECTION.slice(4)) - 1
    const size = Math.ceil(titles.length / 3)
    const mine = titles.slice(part * size, (part + 1) * size)
    console.log(`NOTE  ${titles.length} commands in the menu; this run walks ${mine.length}: ${mine.join(', ')}`)
    for (const title of mine) rows.push(await walk(title, 'top'))
    report()
    // "Drawing" opens its canvas: nothing it needs may be asked of the web (the app works offline, and its policy refuses the fetch).
    if (mine.includes('Drawing')) {
      const outside = c.errors.filter((one) => /https?:\/\/(?!localhost|127\.0\.0\.1)/.test(one))
      for (const one of outside) console.log(`NOTE  console: ${one.slice(0, 260)}`)
      check('a drawing asks nothing of the web: no fetch outside the app, no error logged', outside.length === 0, outside.join(' / ').slice(0, 300))
    }
  }
  if (SECTION.startsWith('places:')) {
    const wheres = SECTION === 'places:1' ? ['after words', 'list'] : ['table cell', 'callout']
    for (const where of wheres) for (const title of EVERYWHERE.filter((one) => (!only || only.test(one)) && !SKIP[where]?.includes(one))) rows.push(await walk(title, where))
    report()
  }
  if (SECTION === 'picks') {
    const { writeFileSync } = await import('fs')
    const { join } = await import('path')
    const target = await h.evaluate((body) => window.api.captures.create({ kind: 'note', body }), { type: 'doc', content: [p('Target of the link'), p('Its second line, shown where it is embedded.')] })
    await wait(800)
    // ⌘Z until the note is as it was: how many it took (-1 if it never came back).
    const back = async (before) => { await h.evaluate((sel) => document.querySelector(sel).editor.commands.focus(), sel); let steps = 0; for (; steps < 6 && (await doc()) !== before; steps++) { await h.keyboard.press('Meta+z'); await wait(220) } return (await doc()) === before ? steps : -1 }
    // A command that lists notes: the name typed, the note picked with Enter.
    const pickNote = async (title, kind) => {
      await place('top'); await wait(150)
      const before = await doc()
      await h.keyboard.type(`/${title.toLowerCase()}`, { delay: 12 }); await menuWhen(); await wait(700)
      await h.keyboard.press('Enter'); await wait(800)
      await h.keyboard.type('Target of', { delay: 25 }); await wait(1000)
      const offered = await h.evaluate(() => [...document.querySelectorAll('.tiptap-suggestion-popup .tiptap-slash-menu-list > button')].map((one) => (one.textContent ?? '').trim().slice(0, 40)))
      await h.keyboard.press('Enter'); await wait(1000)
      const after = await doc()
      return { offered: offered.slice(0, 3), made: after.includes(`"type":"${kind}"`) && after.includes(target), left: /\[\[|"text":"[^"]*\/[a-z]/.test(after), undo: await back(before) }
    }
    const linked = await pickNote('Link to a note', 'noteLink')
    check('"Link to a note": the note typed is offered, Enter makes the link to it, no "[[" or "/" is left, ⌘Z takes it back', linked.made && !linked.left && linked.undo >= 1, JSON.stringify(linked))
    const embedded = await pickNote('Embed a note', 'noteEmbed')
    check('"Embed a note": the note typed is offered, Enter shows it in this one, nothing typed is left, ⌘Z takes it back', embedded.made && !embedded.left && embedded.undo >= 1, JSON.stringify(embedded))
    // "File" and "PDF" open the page's own file picker: handed a real file here (never the Mac's sheet), the file goes in as its block.
    const txt = join(process.env.QA_DATA, 'c1-attached-notes.txt')
    writeFileSync(txt, 'A few words in a file, to attach.\n')
    const pdf = join(process.env.QA_DATA, 'c1-one-page.pdf')
    writeFileSync(pdf, '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n')
    const attach = async (title, file, name) => {
      await place('top'); await wait(150)
      const before = await doc()
      await h.keyboard.type(`/${title.toLowerCase()}`, { delay: 12 }); const shown = await menuWhen(); await wait(700)
      const [chooser] = await Promise.all([h.waitForEvent('filechooser', { timeout: 8000 }), h.keyboard.press('Enter')])
      await chooser.setFiles(file); await wait(2200)
      const after = await doc()
      return { first: shown?.first, made: after.includes('"type":"attachment"') && after.includes(name), left: /"text":"[^"]*\/[a-z]/.test(after), undo: await back(before) }
    }
    const filed = await attach('File', txt, 'c1-attached-notes')
    check('"File": the file handed to its picker goes into the note as its card, by its name; ⌘Z takes it out', filed.first === 'File' && filed.made && !filed.left && filed.undo >= 1, JSON.stringify(filed))
    const paged = await attach('PDF', pdf, 'c1-one-page')
    check('"PDF": the PDF handed to its picker goes into the note as its block; ⌘Z takes it out', paged.first === 'PDF' && paged.made && !paged.left && paged.undo >= 1, JSON.stringify(paged))
    console.log(`PICK  Link to a note | ⌘Z ${linked.undo} | Embed a note | ⌘Z ${embedded.undo} | File | ⌘Z ${filed.undo} | PDF | ⌘Z ${paged.undo}`)
  }
  if (SECTION === 'table') {
    await place('table cell'); await h.keyboard.type('/', { delay: 20 }); await menuWhen(); await wait(300)
    const inTable = await h.evaluate(() => [...document.querySelectorAll('.tiptap-slash-menu-list > button .tiptap-slash-menu-title')].map((one) => one.textContent))
    await h.keyboard.press('Escape'); await wait(150)
    for (const title of inTable.filter((one) => /row|column|header|Merge|Fit to width|Delete table/.test(one) && (!only || only.test(one)))) rows.push(await walk(title, 'table cell'))
    report()
  }
  if (SECTION === 'files') {
    // The book's own files that no note uses yet, as "/media" lists them: each called by its name, or, with none
    // (a picture pasted in), by its kind and when it came. Never by words read out of the file.
    const known = (await v('media:list')).filter((one) => !one.uses.length && !one.gone && !one.deck)
    await place('top'); await h.keyboard.type('/media', { delay: 12 }); await menuWhen(); await wait(600)
    const files = (await listed()).filter((one) => FILE_WORD.test(one.hint))
    console.log(`NOTE  ${known.length} files in no note; the menu lists ${files.length}: ${files.map((one) => one.title).join(' | ').slice(0, 300)}`)
    const bare = (name) => name.replace(/\.[^.]+$/, '') || name
    const byName = (title) => known.some((one) => bare(one.name).trim() && bare(one.name) === title)
    const byKind = (title) => /^(Picture|GIF|PDF|Recording|Video|Document|File)(, \d{1,2} \w{3}( \d{4})? at \d{1,2}:\d\d( [AP]M)?)?$/.test(title)
    const junk = files.filter((one) => !byName(one.title) && !byKind(one.title))
    check('the book has files in no note, and the menu lists some', files.length > 0, `${known.length} known`)
    check('each file is called by its name, or by its kind and when it came: never by words read out of it', files.length > 0 && junk.length === 0, junk.map((one) => one.title).join(' | '))
    check('no file row wears the Mac\'s own tip', files.every((one) => !one.tip), files.filter((one) => one.tip).map((one) => one.title).join(' | '))
    // A name too long for its row is read whole in its card beside the menu: lit by the keys, the card says it.
    const at = (await listed()).findIndex((one) => FILE_WORD.test(one.hint))
    for (let n = 0; n < at; n++) await h.keyboard.press('ArrowDown')
    await wait(700)
    const card = await h.evaluate(() => (document.querySelector('[data-peek-card]')?.textContent ?? '').trim())
    const first = known.find((one) => bare(one.name) === files[0]?.title)
    check('a file\'s card beside the menu says its whole name', !!files[0] && card.includes(first?.name || files[0].title), card.slice(0, 200))
    if (process.env.SHOTS) for (const theme of ['light', 'dark']) { await c.look(theme); await h.screenshot({ path: `${process.env.SHOTS}/slash-files-${theme}.png`, clip: { x: 200, y: 80, width: 1000, height: 700 } }) }
    await h.keyboard.press('Escape'); await menuWhen(false)
  }
  if (SECTION === 'big') {
    // The end of a very long note (BIG=<capture id>, a copy of a real book): correctness; the times are printed, not judged.
    if (!process.env.BIG) check('BIG=<capture id> says which note', false)
    else {
      await c.send('capture', process.env.BIG)
      // Its words in the page first (a very long note takes a moment), then the caret at its very end, on a new line.
      for (let n = 0; n < 100 && !(await h.evaluate((sel) => (document.querySelector(sel)?.editor?.state.doc.content.size ?? 0) > 100000, sel)); n++) await wait(200)
      console.log(`NOTE  the long note: ${await h.evaluate((sel) => document.querySelector(sel).editor.state.doc.textContent.length, sel)} characters`)
      await h.locator(sel).first().click({ position: { x: 300, y: 200 } }).catch(() => {}); await wait(500)
      await h.evaluate((sel) => document.querySelector(sel).editor.commands.focus('end'), sel); await wait(1500)
      await h.keyboard.press('Enter'); await wait(1500)
      console.log(`NOTE  the caret is in the note: ${await h.evaluate((sel) => document.querySelector(sel).editor.isFocused, sel)}`)
      for (const title of ['Heading 2', 'Checklist', 'Table']) rows.push(await walk(title, 'end of the long note', { big: true }))
      await h.keyboard.press('Meta+z'); await wait(600)
      report()
    }
  }
  check('no page errors', !c.errors.some((one) => /PAGEERROR/.test(one)), c.errors.join(' / ').slice(0, 300))
} catch (error) {
  for (const one of rows) console.log(`ROW  ${one.title} | ${one.where} | found ${one.found} | esc ${one.esc} | made ${one.made} | undo ${one.undo}`)
  check('the run finished', false, error.message.split('\n')[0])
} finally { await c.close() }
done()
