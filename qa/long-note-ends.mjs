// What a long note keeps beside its first and last block reaches nobody. Only the blocks near the screen of a long
// note are on its page, and a place a caret can be is kept at each end of the note, beside it in its scroller (a
// line break in a box of no height, extensions/long-document.ts): it stops the browser looking through every
// hidden block for one, which froze the window. This checks they cannot be seen, pressed, copied, found, counted,
// exported, read out or landed in: the note's top and end drawn light and dark with a short note beside them
// (SHOTS=<folder> keeps the pictures), and measured; ⌘A then a copy; "Select all" from the menu; find's count; the
// word count and whether it shows at the note's end; the note as Markdown; the accessibility tree; ↑ and ← at the
// top, ↓ and → at the end; a press above the first line and below the last.
//   QA_DATA=<book copy> QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/long-note-ends.mjs
// It ends with a line "SAME {...}": what must read the same on a build that has no such places (the app before
// the long-note work). Run it on both, on the same copy, and compare the two lines.
import { DatabaseSync } from 'node:sqlite'
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync } from 'fs'
import { loadavg } from 'os'
import { join } from 'path'
import { sandbox } from './sandbox-lib.mjs'
import { checks } from './harness.mjs'
// ⌘A in a note grows the selection a step at a time (qa/grow-selection.mjs): pressed until the whole note is picked.
const pickAll = async (page) => { for (let i = 0; i < 16; i++) { await page.keyboard.press('Meta+a'); if (await page.evaluate(() => { const ed = document.activeElement?.closest('.tiptap')?.editor; return !ed || ed.state.selection.toJSON().type === 'all' })) return } }

const { check, done } = checks()
const ED = '.tiptap.ProseMirror.haligtree-editor:not(.is-line)'
const root = process.env.QA_DATA
if (!root) throw new Error('QA_DATA must be a copy of a book')
const SHOTS = process.env.SHOTS ?? null
if (SHOTS) mkdirSync(SHOTS, { recursive: true })
const shelf = JSON.parse(readFileSync(join(root, 'books.json'), 'utf8'))
const db = new DatabaseSync(join(root, 'books', shelf.last, 'haligtree.db'), { readOnly: true })
const long = db.prepare("select id, body from captures where status = 'open' and kind = 'note' and body is not null order by length(body) desc limit 1").get()
const short = db.prepare("select id, body from captures where status = 'open' and kind = 'note' and body is not null and length(body) between 6000 and 40000 order by length(body) desc limit 1").get()
db.close()
const size = JSON.parse(long.body).content.length
const sha = (text) => createHash('sha256').update(text).digest('hex').slice(0, 16)
const load = () => `load ${loadavg()[0].toFixed(1)}`
const same = {}
let typewriter = null

const c = await sandbox({ width: 1300, height: 900, seeded: false })
const { h, send, electron } = c
const install = () => h.evaluate((sel) => {
  const ed = () => [...document.querySelectorAll(sel)].filter((one) => one.editor && one.isConnected && !one.closest('[inert]')).sort((a, b) => b.editor.state.doc.childCount - a.editor.state.doc.childCount)[0]
  const boxOf = (e) => { let box = e?.parentElement; while (box && !/auto|scroll/.test(getComputedStyle(box).overflowY)) box = box.parentElement; return box }
  const marks = () => [...document.querySelectorAll('[data-long-end]')]
  const drawn = (e) => [...e.children].filter((one) => one.getClientRects().length && one.getBoundingClientRect().height > 0)
  const where = () => {
    const e = ed()
    const s = getSelection()
    const { selection, doc } = e.editor.state
    // atEnd: the caret at the note's very end (past the closing of every block the last place sits in).
    return { inMark: !!s.rangeCount && marks().some((one) => one.contains(s.anchorNode) || one.contains(s.focusNode)), inNote: !s.rangeCount || e.contains(s.anchorNode), keys: document.activeElement === e ? 'in the note' : (document.activeElement?.nodeName ?? 'nowhere'), block: selection.$head.index(0), blocks: doc.childCount, head: selection.head, size: doc.content.size, atEnd: selection.empty && selection.head === doc.content.size - selection.$head.depth }
  }
  window.__ends = {
    ed, box: () => boxOf(ed()), marks, where,
    open: (count) => { const e = ed(); return !!e && e.editor.state.doc.childCount >= count && e.textContent.trim().length > 0 },
    to: (share) => { const box = boxOf(ed()); box.scrollTo({ top: Math.round((box.scrollHeight - box.clientHeight) * share), behavior: 'instant' }) },
    // At the note's top: how far down its scroller the note's own element starts, and its first block. At its
    // end: the room between the note's foot and whatever comes next in the scroller with any height (none: null).
    top: () => { const e = ed(); const first = drawn(e)[0]; const from = boxOf(e).getBoundingClientRect().top; const round = (n) => Math.round(n * 10) / 10; return { edge: round(e.getBoundingClientRect().top - from), first: first ? round(first.getBoundingClientRect().top - from) : null } },
    foot: () => { const e = ed(); let next = e.nextElementSibling; while (next && !next.getBoundingClientRect().height) next = next.nextElementSibling; return next ? Math.round((next.getBoundingClientRect().top - e.getBoundingClientRect().bottom) * 10) / 10 : null },
    pane: () => { const r = (ed().closest('.note-pane') ?? boxOf(ed())).getBoundingClientRect(); return { x: Math.round(r.left), y: Math.round(r.top), width: Math.round(r.width), height: Math.round(r.height) } },
    count: () => { const pill = ed().closest('.haligtree-editor-wrapper')?.querySelector('.tiptap-word-count'); return pill ? { says: pill.textContent.trim(), shows: pill.hasAttribute('data-clear') } : null },
  }
}, ED)
const wait = (ms) => h.waitForTimeout(ms)
const answers = (ms) => Promise.race([h.evaluate(() => 1).then(() => true, () => false), new Promise((next) => setTimeout(() => next(false), ms))])
const opened = (count) => h.waitForFunction((count) => window.__ends.open(count), count, { timeout: 90000, polling: 100 })
const shot = async (name) => { if (SHOTS) await h.screenshot({ path: join(SHOTS, `${name}.png`), clip: await h.evaluate(() => window.__ends.pane()) }) }
/** The note's top and its end, light and dark: four pictures, and the three sizes. */
const look = async (kind) => {
  const out = {}
  for (const [name, share] of [['top', 0], ['end', 1]]) {
    await h.evaluate((share) => window.__ends.to(share), share)
    await wait(900)
    await h.evaluate((share) => window.__ends.to(share), share)
    await wait(500)
    if (name === 'top') out.top = await h.evaluate(() => window.__ends.top())
    else { out.foot = await h.evaluate(() => window.__ends.foot()); out.count = await h.evaluate(() => window.__ends.count()) }
    for (const theme of ['light', 'dark']) { await c.look(theme); await wait(250); await shot(`${kind}-${name}-${theme}`) }
    await c.look('light')
  }
  return out
}
const told = (one) => `its own element starts ${one.top.edge}px down its scroller and its first block ${one.top.first}px; ${one.foot === null ? 'nothing comes after it in the scroller' : `${one.foot}px between its foot and what comes next`}; the count at its end ${JSON.stringify(one.count)}`

try {
  await h.evaluate(() => window.api.haligtree('onboarding:set', { welcomed: new Date().toISOString(), newsSeen: true, welcoming: false, pageHints: false }))
  await h.evaluate(() => window.api.haligtree('settings:set', { sounds: false, hintRate: 0, smoothScroll: true }))
  // TYPEWRITER=1: typewriter scrolling on for this run (put back as it was after), which gives a note 60% of the
  // window as room after its last line.
  typewriter = await h.evaluate((on) => { const was = localStorage.getItem('typewriter'); if (on) localStorage.setItem('typewriter', 'on'); return was }, !!process.env.TYPEWRITER)
  await wait(1200)
  await install()
  await send('capture', long.id)
  await opened(size - 1)
  await wait(2000)
  const marks = await h.evaluate(() => window.__ends.marks().map((one) => { const r = one.getBoundingClientRect(); const e = window.__ends.ed(); return { height: r.height, tall: one.offsetHeight, scrolls: one.scrollHeight, beside: one.nextSibling === e ? 'before the note' : one.previousSibling === e ? 'after the note' : 'elsewhere', hidden: one.getAttribute('aria-hidden'), pointer: getComputedStyle(one).pointerEvents, inNote: e.contains(one) } }))
  console.log(`note ${long.id.slice(0, 8)}: ${size} blocks; ${marks.length} places kept beside it: ${JSON.stringify(marks)}  (${load()})`)
  check('each place kept beside the note has no height, takes no press and is outside the note', marks.every((one) => one.height === 0 && one.tall === 0 && one.pointer === 'none' && !one.inNote && one.beside !== 'elsewhere'), JSON.stringify(marks))

  // What a selection drawn across the note's edges, or "Select all" with the keys outside any note, would copy of
  // the scroller: the same words with the places there as with them taken away for a moment.
  const across = await h.evaluate(() => {
    const box = window.__ends.box()
    const e = window.__ends.ed()
    const kept = window.__ends.marks()
    const there = box.innerText
    for (const one of kept) one.remove()
    const gone = box.innerText
    if (kept[0]) e.before(kept[0])
    if (kept[1]) e.after(kept[1])
    return { there: there.length, gone: gone.length, same: there === gone, starts: JSON.stringify(there.slice(0, 12)), ends: JSON.stringify(there.slice(-12)) }
  })
  check('the scroller reads the same, as text, with the places there and with them gone', across.same, `${across.there} characters with them, ${across.gone} without; it starts ${across.starts} and ends ${across.ends}`)

  // 1. Seen: the top and the end, light and dark, and their sizes.
  const tall = await look('long')
  console.log(`the long note${(await h.evaluate(() => window.__ends.box().classList.contains('is-typewriter'))) ? ' (typewriter scrolling on)' : ''}: ${told(tall)}`)
  check('nothing stands between a long note\'s foot and what comes next', tall.foot === null || Math.abs(tall.foot) <= 0.5, `${tall.foot}px`)

  // 2. Copied: ⌘A then a copy (asked of the page with a copy event of its own: the real clipboard is left alone).
  await h.evaluate(() => { window.__ends.to(0.4); window.__ends.ed().editor.commands.focus(null, { scrollIntoView: false }) })
  await wait(900)
  const copy = () => h.evaluate(() => { const e = window.__ends.ed(); const data = new DataTransfer(); e.dispatchEvent(new ClipboardEvent('copy', { clipboardData: data, bubbles: true, cancelable: true })); const { selection, doc } = e.editor.state; return { text: data.getData('text/plain'), html: data.getData('text/html').length, span: selection.to - selection.from, whole: doc.content.size } })
  await pickAll(h)
  await wait(800)
  const keyed = await copy()
  check('⌘A picks the whole note, and a copy takes its words', keyed.span >= keyed.whole - 2 && keyed.text.length > 500000, `${keyed.span} of ${keyed.whole} picked; ${keyed.text.length} characters copied, ${keyed.html} of HTML`)
  same.copy = `${keyed.text.length} ${sha(keyed.text)}`
  same.copyHtml = keyed.html
  await h.keyboard.press('ArrowLeft')
  await wait(400)
  // 3. "Select all" as the Edit menu does it (it tells the page, which runs the browser's own command unless
  // something takes it: src/preload), with the keys in the note and its caret left at the note's start, far
  // from the screen. Run last of the long note's checks, below: where it stops the window, nothing after it runs.
  const menuAll = async () => {
    await h.evaluate(() => window.__ends.ed().editor.commands.focus('start'))
    await wait(800)
    await h.evaluate(() => window.__ends.to(0.4))
    await wait(900)
    const began = Date.now()
    electron.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((one) => one.webContents.getURL().includes('view=home'))?.webContents.send('menu:select-all')).catch(() => {})
    let alive = false
    for (let i = 0; i < 40 && !alive; i++) alive = await answers(1000)
    const menuIn = Date.now() - began
    if (alive) await wait(600)
    const menu = alive ? await copy() : null
    check('"Select all" from the menu picks the whole note, the window answering at once', !!menu && menu.span >= menu.whole - 2 && menuIn < 1000, menu ? `${menu.span} of ${menu.whole} picked; the window answered ${menuIn} ms after  (${load()})` : `the window did not answer for ${menuIn} ms  (${load()})`)
    check('what it copies is what ⌘A copies', !!menu && menu.text === keyed.text, menu ? `${menu.text.length} characters against ${keyed.text.length}` : '')
    if (!alive) return false
    const after = await h.evaluate(() => window.__ends.where())
    check('with the whole note picked, the browser\'s selection is in neither place', !after.inMark, JSON.stringify(after))
    await h.keyboard.press('ArrowLeft')
    await wait(300)
    return true
  }

  // 4. Found and counted.
  await h.evaluate(() => { window.__ends.to(0); window.__ends.ed().editor.commands.focus('start') })
  await wait(600)
  await h.keyboard.press('Meta+f')
  await wait(500)
  await h.keyboard.type('correct answer', { delay: 20 })
  await wait(1200)
  same.found = await h.evaluate(() => window.__ends.ed().editor.storage.findAndReplace?.results.length ?? -1)
  await h.keyboard.press('Escape')
  await wait(400)
  check('find counts its matches', same.found > 0, `"correct answer": ${same.found}`)
  same.count = tall.count?.says ?? null
  same.countShowsAtEnd = tall.count?.shows ?? null

  // 5. Exported: the note as Markdown, as Export writes it.
  const markdown = await h.evaluate(() => { const { editor } = window.__ends.ed(); return { text: editor.storage.markdown.manager.serialize(editor.getJSON()), blocks: editor.getJSON().content.length } })
  same.markdown = `${markdown.text.length} ${sha(markdown.text)}`
  check('the note as Markdown holds its own blocks, no more', markdown.blocks === size, `${markdown.blocks} blocks of ${size}; ${markdown.text.length} characters of Markdown`)

  // 6. Read out: neither place, nor the line break in it, is in the accessibility tree.
  const read = []
  let unread = ''
  try {
    const cdp = await h.context().newCDPSession(h)
    await cdp.send('Accessibility.enable')
    for (let i = 0; i < marks.length; i++) for (const part of ['', '.firstChild']) {
      const { result } = await cdp.send('Runtime.evaluate', { expression: `document.querySelectorAll('[data-long-end]')[${i}]${part}` })
      const { nodes } = result.objectId ? await cdp.send('Accessibility.getPartialAXTree', { objectId: result.objectId, fetchRelatives: false }) : { nodes: [] }
      read.push({ place: i, part: part || 'itself', ignored: nodes[0]?.ignored ?? null, role: nodes[0]?.role?.value ?? null, why: (nodes[0]?.ignoredReasons ?? []).map((one) => one.name).join(',') })
    }
    // And the note's scroller, as it is read out: how many things it holds for a reader, beside the note.
    const { result } = await cdp.send('Runtime.evaluate', { expression: 'window.__ends.box()' })
    const { nodes } = await cdp.send('Accessibility.getPartialAXTree', { objectId: result.objectId, fetchRelatives: false })
    same.readOut = `${nodes[0]?.ignored ? 'the scroller is passed over' : (nodes[0]?.role?.value ?? '')}, ${(nodes[0]?.childIds ?? []).length} things in it`
  } catch (error) {
    unread = String(error?.message ?? error).slice(0, 200)
  }
  check('a screen reader is told of neither place', !unread && read.every((one) => one.ignored === true), unread || JSON.stringify(read))

  // 7. Landed in by keys: ↑ and ← at the very top, ↓ and → at the very end.
  await h.evaluate(() => { window.__ends.to(0); window.__ends.ed().editor.commands.focus('start') })
  await wait(700)
  for (const key of ['ArrowUp', 'ArrowUp', 'ArrowLeft', 'ArrowLeft', 'ArrowUp']) { await h.keyboard.press(key); await wait(60) }
  await wait(300)
  const up = await h.evaluate(() => window.__ends.where())
  check('↑ and ← at the note\'s first place: the caret stays in the note', !up.inMark && up.inNote && up.keys === 'in the note' && up.block === 0, JSON.stringify(up))
  await h.keyboard.press('Meta+ArrowDown')
  await wait(1100)
  for (const key of ['ArrowDown', 'ArrowDown', 'ArrowRight', 'ArrowRight', 'ArrowDown']) { await h.keyboard.press(key); await wait(60) }
  await wait(300)
  const down = await h.evaluate(() => window.__ends.where())
  check('↓ and → at the note\'s last place: the caret stays in the note', !down.inMark && down.inNote && down.keys === 'in the note' && down.block >= down.blocks - 1, JSON.stringify(down))
  same.keysAtEnds = `${up.block}/${up.keys} ${down.block}/${down.keys}`

  // 8. Landed in by a press: under the last line at the note's end and over the first at its top, on the nearest
  // bare place in the note's own box, then on the nearest in the scroller outside the note's box. A press the
  // note takes must leave a caret in the note (never in a kept place); one outside it takes the keys from the
  // note as it always did, and where the browser's own selection goes then (nothing shows of it) is written down.
  const press = async (share, inside, name) => {
    await h.evaluate((share) => window.__ends.to(share), share)
    await wait(900)
    const at = await h.evaluate(([end, inside]) => {
      const e = window.__ends.ed()
      const box = window.__ends.box()
      const view = box.getBoundingClientRect()
      const all = [...e.children].filter((one) => one.getClientRects().length && one.getBoundingClientRect().height > 0)
      const edge = end ? all[all.length - 1].getBoundingClientRect().bottom : all[0].getBoundingClientRect().top
      const x = Math.round(e.getBoundingClientRect().left + e.clientWidth / 2)
      for (let step = 3; step < 160; step += 3) {
        const y = Math.round(end ? edge + step : edge - step)
        if (y <= view.top + 1 || y >= view.bottom - 1) break
        const under = document.elementFromPoint(x, y)
        if (under && box.contains(under) && !all.some((one) => one.contains(under)) && (under === e) === inside) return { x, y, from: step, under: `${under.nodeName.toLowerCase()}${typeof under.className === 'string' && under.className ? '.' + under.className.trim().split(/\s+/).slice(0, 2).join('.') : ''}` }
      }
      return null
    }, [share === 1, inside])
    if (!at) { console.log(`(${name}: no such bare place on the screen)`); return 'no such place' }
    const screenBefore = await h.evaluate(() => Math.round(window.__ends.box().scrollTop))
    await h.mouse.click(at.x, at.y)
    await wait(500)
    const now = await h.evaluate(() => window.__ends.where())
    now.moved = (await h.evaluate(() => Math.round(window.__ends.box().scrollTop))) - screenBefore
    const said = `${now.keys}, caret in block ${now.block === now.blocks - 1 ? 'last' : now.block}`
    console.log(`(${name}, ${at.from}px ${share === 1 ? 'under the last block' : 'over the first'}, on ${at.under}: the keys ${said}; the browser's selection in a kept place: ${now.inMark})`)
    if (now.keys === 'in the note') check(`${name}: taken by the note, the caret is in the note`, !now.inMark && now.inNote, JSON.stringify(now))
    // Under the last line, in the note's box or the bare scroller below it: the keys in the note, the caret at its end.
    if (share === 1) check(`${name}: the caret is at the note's end and the note did not move`, now.keys === 'in the note' && now.atEnd && now.moved === 0, `the keys ${now.keys}, caret in block ${now.block} of ${now.blocks}${now.atEnd ? ', at its end' : `, at ${now.head} of ${now.size}`}; the note moved ${now.moved}px`)
    return said
  }
  same.pressUnderInNote = await press(1, true, 'a press under the last line, in the note\'s own box')
  same.pressUnderOutside = await press(1, false, 'a press under the note, in its scroller')
  await h.evaluate(() => window.__ends.ed().editor.commands.focus('start'))
  await wait(700)
  same.pressOverInNote = await press(0, true, 'a press over the first line, in the note\'s own box')
  same.pressOverOutside = await press(0, false, 'a press over the note, in its scroller')

  // A press on the bare edge of the dock under an open note (the room round the composer) is a press on nothing:
  // the keys stay in the note.
  await h.evaluate(() => { window.__ends.to(0.4); window.__ends.ed().editor.commands.focus(null, { scrollIntoView: false }) })
  await wait(700)
  const edge = await h.evaluate(() => { const dock = document.querySelector('[data-thought-dock]'); if (!dock) return null; const r = dock.getBoundingClientRect(); for (let y = r.top + 2; y < r.bottom - 1; y += 2) for (let x = r.left + 4; x < r.right - 4; x += 8) if (document.elementFromPoint(x, y) === dock) return { x: Math.round(x), y: Math.round(y) }; return null })
  if (edge) {
    const had = await h.evaluate(() => window.__ends.where())
    await h.mouse.click(edge.x, edge.y)
    await wait(400)
    const has = await h.evaluate(() => window.__ends.where())
    check('a press on the bare edge of the dock under the note leaves the keys in the note', had.keys === 'in the note' && has.keys === 'in the note' && has.head === had.head, `the keys before: ${had.keys}; after: ${has.keys}; the caret ${has.head === had.head ? 'where it was' : 'moved'}`)
  } else console.log('(no bare edge of a dock under the note on this page)')

  // 9. A change that carries only a word for another part of the editor (the block handle held still while its
  // menu is open: a `lockDragHandle` change as the menu opens and another as it shuts) moves nothing of a long
  // note: not its caret, not the browser's selection, not the screen, not the blocks that are drawn.
  const still = async (name) => {
    const read = () => h.evaluate(() => {
      const e = window.__ends.ed()
      const s = getSelection()
      const blockOf = (node) => { let block = node; while (block && block.parentElement !== e) block = block.parentElement; return block ? Array.prototype.indexOf.call(e.children, block) : -1 }
      const drawn = [...e.children].filter((one) => !one.hasAttribute('data-off'))
      const { selection } = e.editor.state
      return { screen: Math.round(window.__ends.box().scrollTop), caret: `${selection.anchor} to ${selection.head}`, browser: s.rangeCount ? `${e.contains(s.anchorNode) ? `block ${blockOf(s.anchorNode)}` : 'outside the note'}:${s.anchorOffset}` : 'none', keys: document.activeElement === e, drawn: `${drawn.length} from ${Array.prototype.indexOf.call(e.children, drawn[0])}` }
    })
    const before = await read()
    await h.evaluate(() => { const { view } = window.__ends.ed().editor; view.dispatch(view.state.tr.setMeta('lockDragHandle', true)) })
    await wait(250)
    const locked = await read()
    await h.evaluate(() => { const { view } = window.__ends.ed().editor; view.dispatch(view.state.tr.setMeta('lockDragHandle', false)) })
    await wait(250)
    const after = await read()
    check(`${name}: the block handle locked and let go moves nothing`, JSON.stringify(before) === JSON.stringify(locked) && JSON.stringify(before) === JSON.stringify(after), `${JSON.stringify(before)}${JSON.stringify(before) === JSON.stringify(after) ? '' : ` then ${JSON.stringify(locked)} then ${JSON.stringify(after)}`}`)
  }
  await h.evaluate(() => { window.__ends.to(0); window.__ends.ed().editor.commands.focus('start') })
  await wait(800)
  await still('the caret on the screen')
  await h.evaluate(() => window.__ends.to(0.4))
  await wait(1600)
  await still('the caret left far from the screen')
  await h.evaluate(() => document.activeElement?.blur?.())
  await wait(400)
  await still('the same, the keys out of the note')

  console.log(`SAME so far ${JSON.stringify(same)}`)
  const answered = await menuAll()

  // 10. A short note beside it: the same top, the same foot.
  if (short && answered) {
    await send('capture', short.id)
    await h.waitForFunction((count) => { const e = window.__ends.ed(); return !!e && e.editor.state.doc.childCount < count && e.textContent.trim().length > 0 }, size - 1, { timeout: 30000, polling: 100 })
    await wait(1800)
    const small = await look('short')
    const blocks = await h.evaluate(() => window.__ends.ed().editor.state.doc.childCount)
    console.log(`a short note (${blocks} blocks, ${await h.evaluate(() => window.__ends.marks().length)} places kept beside it): ${told(small)}`)
    check('a long note starts as far down its scroller as a short one', Math.abs(tall.top.edge - small.top.edge) <= 0.5, `${tall.top.edge}px against ${small.top.edge}px`)
    same.sizes = `long ${tall.top.edge}/${tall.foot} short ${small.top.edge}/${small.foot}`
    same.shortCountShowsAtEnd = small.count?.shows ?? null
    // The same two presses under a short note's last line.
    await h.evaluate(() => window.__ends.ed().editor.commands.focus('start'))
    await wait(500)
    same.shortPressUnderInNote = await press(1, true, 'a short note: a press under the last line, in its own box')
    same.shortPressUnderOutside = await press(1, false, 'a short note: a press under it, in its scroller')
  }
  check('no page errors', c.errors.filter((line) => !/ERR_FILE_NOT_FOUND|status of 404|NotSameOrigin/.test(line)).length === 0, c.errors.slice(0, 3).join(' | '))
  console.log(`SAME ${JSON.stringify(same)}`)
} finally {
  if (process.env.TYPEWRITER) await Promise.race([h.evaluate((was) => (was === null ? localStorage.removeItem('typewriter') : localStorage.setItem('typewriter', was)), typewriter).catch(() => {}), new Promise((next) => setTimeout(next, 3000))])
  await Promise.race([c.close(), new Promise((next) => setTimeout(next, 8000))])
}
done()
