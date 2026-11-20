// The 10 Nov editor pass, each as a person meets it: 500 tags fold to two
// rows and "+N more"; a link card's and a code block's buttons are reached
// by keys and wear the focus ring; links are never red in dark; a wide table
// scrolls with a bar you can see and columns that keep their width; a note
// of a picture alone opens with the caret after it, not the picture picked.
// QA_SHOTS=<folder> writes light and dark pictures of each.
import { sandbox } from './sandbox-lib.mjs'
import { p, t, code, card, table, link, pic } from './long-note-doc.mjs'
import { clearBoard, copiedText } from './pasteboard.mjs'

const SHOTS = process.env.QA_SHOTS
const c = await sandbox({ width: 1280, height: 860 })
const { h, v } = c
const fails = []
const check = (ok, name, got) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : `: ${JSON.stringify(got)}`}`); if (!ok) fails.push(name) }
const ED = '[data-open] .ProseMirror'
const open = async (id) => { await c.send('article', id); await h.waitForSelector(ED); await h.waitForTimeout(1200) }
const shot = async (name) => SHOTS && c.both(`${SHOTS}/${name}`)
const editor = (fn, arg) => h.evaluate(([fn, arg]) => new Function('e', 'arg', `return (${fn})(e, arg)`)(document.querySelector('[data-open] .tiptap:not(.is-line):not(.is-plain)').editor, arg), [fn.toString(), arg])
try {
  await v('settings:set', { sounds: false, hintRate: 0 })

  // 1. 500 tags: two rows and "+N more", which opens the rest in place, and "Fewer" folds them.
  const tags = await v('article:new')
  await v('item:save', tags, { body: { type: 'doc', content: [p('Tags and links'), p(...Array.from({ length: 500 }, (_, i) => `#tag-number-${i} `))] } })
  await open(tags)
  await h.waitForSelector('[data-tag-more]', { timeout: 8000 }).catch(() => {})
  const strip = async () => h.evaluate(() => {
    const chips = [...document.querySelectorAll('[data-property="tags"] [data-tag-chip]')]
    const rows = new Set(chips.map((one) => Math.round(one.getBoundingClientRect().top))).size
    return { chips: chips.length, rows, more: document.querySelector('[data-tag-more]')?.textContent ?? null }
  })
  const folded = await strip()
  check(folded.rows <= 2 && /^\+\d+ more$/.test(folded.more ?? '') && folded.chips + Number(folded.more.match(/\d+/)[0]) === 500, '500 tags show two rows and a "+N more" that counts the rest', folded)
  await shot('tags-folded')
  await h.click('[data-tag-more]')
  await h.waitForTimeout(300)
  const opened = await strip()
  check(opened.chips === 500 && !opened.more && await h.evaluate(() => !!document.querySelector('[data-tag-fewer]')), '"+N more" opens all 500 in place, with "Fewer" after them', opened)
  await h.click('[data-tag-fewer]')
  await h.waitForTimeout(300)
  check((await strip()).rows <= 2, '"Fewer" folds them back to two rows', await strip())

  // 2. A link card and a code block: picked by keys, Tab reaches their buttons, the ring shows, Esc comes back.
  const blocks = await v('article:new')
  await v('item:save', blocks, { body: { type: 'doc', content: [p('A card and some code'), card(1), p('Between them'), code(2), p('After')] } })
  await open(blocks)
  const pick = (type) => editor((e, type) => { let at = -1; e.state.doc.forEach((n, off) => { if (n.type.name === type && at < 0) at = off }); e.chain().setNodeSelection(at).focus().run(); return at }, type)
  await pick('bookmark')
  await h.waitForTimeout(200)
  await h.keyboard.press('Tab')
  await h.waitForTimeout(200)
  const cardFocus = await h.evaluate(() => { const a = document.activeElement; const style = a && getComputedStyle(a); return { label: a?.getAttribute('aria-label'), outline: style?.outlineStyle, width: style?.outlineWidth, shown: style && getComputedStyle(a).opacity } })
  check(/Copy URL|Open in the reader/.test(cardFocus.label ?? '') && cardFocus.outline !== 'none' && cardFocus.width !== '0px' && cardFocus.shown === '1', 'Tab on a picked link card goes to its button, which wears the focus ring', cardFocus)
  await shot('card-button-focused')
  // "Open in the reader" comes first on a web page's card: Tab goes on to "Copy URL".
  if (cardFocus.label === 'Open in the reader') {
    await h.keyboard.press('Tab')
    await h.waitForTimeout(150)
    const next = await h.evaluate(() => document.activeElement?.getAttribute('aria-label'))
    check(next === 'Copy URL', 'Tab moves from "Open in the reader" to "Copy URL"', next)
  }
  await clearBoard(c.electron)
  await h.keyboard.press('Enter')
  await h.waitForTimeout(300)
  const copied = await copiedText(c.electron)
  check(copied.startsWith('https://'), 'Enter on "Copy URL" copies the address', copied.slice(0, 60))
  await h.keyboard.press('Escape')
  await h.waitForTimeout(200)
  const back = await editor((e) => ({ type: e.state.selection.node?.type.name ?? null, focused: e.view.hasFocus() }))
  check(back.type === 'bookmark' && back.focused, 'Esc from the button comes back to the card, picked', back)
  // The code block: the caret goes in, Esc picks it, Tab reaches its buttons.
  await editor((e) => { let at = -1; e.state.doc.forEach((n, off) => { if (n.type.name === 'codeBlock' && at < 0) at = off }); e.chain().setTextSelection(at + 3).focus().run() })
  await h.waitForTimeout(200)
  const drawn = await h.evaluate(() => document.querySelectorAll('.tiptap-code-controls button').length)
  check(drawn > 0, 'the caret in a code block draws its buttons', drawn)
  await h.keyboard.press('Escape')
  await h.waitForTimeout(150)
  const picked = await editor((e) => e.state.selection.node?.type.name ?? null)
  check(picked === 'codeBlock', 'Esc in a code block picks the whole block', picked)
  await h.keyboard.press('Tab')
  await h.waitForTimeout(200)
  const codeFocus = await h.evaluate(() => { const a = document.activeElement; const style = a && getComputedStyle(a); return { inControls: !!a?.closest('.tiptap-code-controls'), text: a?.textContent?.trim().slice(0, 20), aria: a?.getAttribute('aria-label'), outline: style?.outlineStyle, controls: getComputedStyle(document.querySelector('.tiptap-code-controls')).opacity } })
  check(codeFocus.inControls && codeFocus.outline !== 'none' && codeFocus.controls === '1', 'Tab on a picked code block goes to its buttons, ring showing', codeFocus)
  await shot('code-button-focused')
  await h.keyboard.press('Escape')
  await h.waitForTimeout(200)
  check(await editor((e) => e.state.selection.node?.type.name ?? null) === 'codeBlock', 'Esc from a code button comes back to the block', '')

  // 3. Links in dark: never the red that means "this removes something"; a link to a missing note faded.
  const links = await v('article:new')
  const URL = 'https://en.wikipedia.org/wiki/Astrolabe'
  await v('item:save', links, { body: { type: 'doc', content: [p('See ', t('the astrolabe', [{ type: 'link', attrs: { href: URL } }]), ' and ', link(7), ' for more.')] } })
  await open(links)
  await h.waitForTimeout(800)
  for (const theme of ['light', 'dark']) {
    await c.look(theme)
    const colours = await h.evaluate(() => {
      const rgb = (el) => getComputedStyle(el).color.match(/[\d.]+/g).slice(0, 3).map(Number)
      const web = document.querySelector('[data-open] .ProseMirror a[href^="http"]')
      const note = document.querySelector('[data-open] .ProseMirror .tiptap-note-link')
      return { web: rgb(web), note: rgb(note), missing: note.classList.contains('is-unresolved') }
    })
    // Red: the red channel well over both others.
    const red = ([r, g, b]) => r > 120 && r > g * 1.6 && r > b * 1.6
    check(!red(colours.web) && !red(colours.note), `${theme}: web links and note links are not red`, colours)
    check(colours.missing, `${theme}: a link to a note that is not there is drawn faded`, colours)
  }
  await shot('links')

  // 4. A 30x10 table: wider than the column, it scrolls, with a bar that is there, and its columns keep their width.
  const wide = await v('article:new')
  await v('item:save', wide, { body: { type: 'doc', content: [p('A wide table'), table(30, 10), p('After')] } })
  await open(wide)
  const tbl = await h.evaluate(() => {
    const box = document.querySelector('[data-open] .tableWrapper')
    const cells = [...box.querySelectorAll('tr:first-child > *')].map((one) => Math.round(one.getBoundingClientRect().width))
    return { scrolls: box.scrollWidth > box.clientWidth, bar: box.offsetHeight - box.clientHeight - parseFloat(getComputedStyle(box).borderBottomWidth || 0), narrowest: Math.min(...cells) }
  })
  check(tbl.scrolls && tbl.bar >= 4 && tbl.narrowest >= 150, 'a 30x10 table scrolls sideways with a bar showing and columns at least 150px', tbl)
  await shot('table')

  // 5. A note of a picture alone opens with the caret after the picture, nothing picked.
  const picture = await v('article:new')
  await v('item:save', picture, { body: { type: 'doc', content: [{ type: 'image', attrs: { src: pic } }] } })
  await open(picture)
  const sel = await editor((e) => ({ kind: e.state.selection.constructor.name, node: e.state.selection.node?.type.name ?? null, at: e.state.selection.from, after: e.state.doc.child(0).nodeSize, ring: !!document.querySelector('[data-open] .ProseMirror .ProseMirror-selectednode') }))
  check(!sel.node && !sel.ring && sel.at >= sel.after, 'a picture alone opens with the caret after it, not picked', sel)
  await shot('picture-only')

  // 6. A note of code alone is named "Code": test/first-line.test.ts (main/import.ts firstLine) and captures.ts label().
} catch (e) { fails.push('threw: ' + e.message.split('\n')[0]); console.log('threw', e.message.split('\n').slice(0, 3).join(' ')) }
finally { await c.close() }
console.log(fails.length ? `FAIL ${fails.length}: ${fails.join('; ')}` : 'PASS editor pass')
process.exit(fails.length ? 1 : 0)
