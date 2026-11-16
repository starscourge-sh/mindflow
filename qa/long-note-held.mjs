// A place being held gives way to every scroll that is asked for. A long note left far down opens again at the
// place it was left and holds it there while its sizes settle, until the first wheel, press or key. Straight after
// it opens, with no wheel, press or key on the note first, each way the app has of sending a note somewhere must
// land there and stay: never pulled back to the kept place. On a copy of a real book (its largest note):
//   QA_DATA=<book copy> QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/long-note-held.mjs
// WAYS=top,cmdup,rail,link,openat,find (the six): the scroller set to its very top by a script, as the app's own
// code does; ⌘↑ with the note given the keys by the app, not by a click; a heading pressed in the contents rail; a
// link to a far heading followed while the note is open; the note opened by such a link; find's next match.
// And the other places a note is sent to, the same two ways each (followed with the note open, and the note opened
// by it): picture,openpicture (where a stored picture sits, as Files opens the note it is used in) and
// line,openline (a line by its lasting name, as a link to a block does). The picture ways run with the six by
// default; one the note has nothing for is said and not counted. The line ways are asked for by name
// (WAYS=line,openline), on a copy that may be written: a note with no named line has a far paragraph given one.
// WHY=1 says what is on the page as the note is opened by a link, and the order its place is asked for in.
import { DatabaseSync } from 'node:sqlite'
import { readFileSync } from 'fs'
import { loadavg } from 'os'
import { join } from 'path'
import { sandbox } from './sandbox-lib.mjs'

const root = process.env.QA_DATA
const shelf = JSON.parse(readFileSync(join(root, 'books.json'), 'utf8'))
const db = new DatabaseSync(join(root, 'books', shelf.last, 'haligtree.db'), { readOnly: true })
const note = db.prepare("select id, body from captures where status = 'open' and kind = 'note' and body is not null order by length(body) desc limit 1").get()
db.close()
const size = JSON.parse(note.body).content.length
const ED = '.tiptap.ProseMirror.haligtree-editor:not(.is-line)'
const WAYS = (process.env.WAYS ?? 'top,cmdup,rail,link,openat,find,picture,openpicture').split(',').filter(Boolean)
const load = () => `load ${loadavg()[0].toFixed(1)}`
const results = []

const c = await sandbox({ width: 1300, height: 900, seeded: false })
const { h, send } = c
const install = () => h.evaluate((sel) => {
  const ed = () => [...document.querySelectorAll(sel)].filter((one) => one.editor && one.isConnected).sort((a, b) => b.editor.state.doc.childCount - a.editor.state.doc.childCount)[0]
  const boxOf = (e) => { let box = e?.parentElement; while (box && !/auto|scroll/.test(getComputedStyle(box).overflowY)) box = box.parentElement; return box }
  // The first block reaching below the top edge of the scroller, as its place among the note's blocks, and where it starts.
  const first = () => {
    const e = ed()
    const box = boxOf(e)
    if (!e || !box) return null
    const edge = box.getBoundingClientRect().top
    for (const child of e.children) {
      if (child.hasAttribute('data-off')) continue
      const r = child.getBoundingClientRect()
      if (!r.height && !r.width) continue
      if (r.bottom > edge + 0.5) {
        const d = child.pmViewDesc
        const pos = d?.node ? d.posAtStart : -1
        return { index: pos >= 0 ? e.editor.state.doc.resolve(pos).index(0) : -1, at: Math.round(r.top - edge), top: Math.round(box.scrollTop) }
      }
    }
    return { index: -1, at: 0, top: Math.round(box.scrollTop) }
  }
  let wheelAt = 0
  window.addEventListener('wheel', () => void (wheelAt = performance.now()), { capture: true, passive: true })
  window.__held = {
    ed, box: () => boxOf(ed()), first,
    open: (count) => { const e = ed(); return !!e && e.editor.state.doc.childCount >= count },
    caret: () => ed().editor.state.selection.$head.index(0),
    // A heading far from block `from`, said once in the note, and the block it is.
    heading: (from) => { const seen = new Map(); ed().editor.state.doc.forEach((node, _offset, index) => { if (node.type.name !== 'heading') return; const text = node.textContent.trim(); if (text.length > 6) seen.set(text, seen.has(text) ? -1 : index) }); const far = [...seen].filter(([, index]) => index >= 0 && Math.abs(index - from) > 600); const pick = far[Math.floor(far.length * 0.7)]; return pick ? { text: pick[0], index: pick[1] } : null },
    // A stored picture far from block `from` (the first place its address is in the note, which is where the app goes), and a line with a lasting name.
    picture: (from) => { const first = new Map(); ed().editor.state.doc.forEach((node, _offset, index) => { const look = (one) => { const src = one.attrs?.src; if (typeof src === 'string' && /^(haligtree|mindflow):\/\/assets\//.test(src) && !first.has(src)) first.set(src, index) }; look(node); node.descendants((one) => void look(one)) }); const far = [...first].sort((a, b) => Math.abs(b[1] - from) - Math.abs(a[1] - from))[0]; return far && Math.abs(far[1] - from) > 20 ? { text: far[0], index: far[1] } : null },
    line: (from) => {
      const e = ed().editor
      const first = new Map()
      let far = null
      e.state.doc.forEach((node, offset, index) => {
        const look = (one) => { const id = one.attrs?.blockId; if (typeof id === 'string' && id && !first.has(id)) first.set(id, index) }
        look(node)
        node.descendants((one) => void look(one))
        if (node.type.name === 'paragraph' && node.textContent.trim().length > 20 && (!far || Math.abs(index - from) > Math.abs(far.index - from))) far = { index, offset }
      })
      const known = [...first].sort((a, b) => Math.abs(b[1] - from) - Math.abs(a[1] - from))[0]
      if (known && Math.abs(known[1] - from) > 20) return { text: `^${known[0]}`, index: known[1], made: false }
      // None in this note: a far paragraph is given one, as "Copy link to block" gives it (a name on the line, no word changed).
      if (!far || Math.abs(far.index - from) <= 20) return null
      const id = `held${Date.now().toString(36)}`
      e.view.dispatch(e.state.tr.setNodeAttribute(far.offset, 'blockId', id).setMeta('addToHistory', false))
      return e.state.doc.nodeAt(far.offset)?.attrs?.blockId === id ? { text: `^${id}`, index: far.index, made: true } : null
    },
    // Whether the match find is on is on the screen.
    match: () => { const box = boxOf(ed()).getBoundingClientRect(); const r = ed().querySelector('.find-and-replace-result-current')?.getBoundingClientRect(); return !!r && r.height > 0 && r.top >= box.top && r.bottom <= box.bottom },
  }
}, ED)
const rest = async () => {
  let was = -1
  for (let still = 0, i = 0; still < 4 && i < 100; i++) {
    const now = await h.evaluate(() => window.__held.box()?.scrollTop ?? -1)
    still = now === was ? still + 1 : 0
    was = now
    await h.waitForTimeout(150)
  }
}
const openNote = async (heading) => {
  await send('capture', note.id, heading)
  await h.waitForFunction((count) => window.__held.open(count), size - 1, { timeout: 60000, polling: 50 })
}
const say = (one) => (one ? `block ${one.index} at ${one.at}px (scroll ${one.top})` : 'nothing')
try {
  await h.evaluate(() => window.api.haligtree('onboarding:set', { welcomed: new Date().toISOString(), newsSeen: true, welcoming: false, pageHints: false }))
  await h.evaluate((smooth) => window.api.haligtree('settings:set', { sounds: false, hintRate: 0, smoothScroll: smooth }), process.env.SMOOTH !== 'off')
  await h.waitForTimeout(1200)
  await install()
  await openNote()
  await h.waitForTimeout(1500)
  console.log(`note ${note.id.slice(0, 8)}: ${size} blocks  (${load()})`)
  for (const way of WAYS) {
    // Left far down, by a jump that comes to rest, with a press on the note first so nothing is held from before.
    const where = await h.evaluate(() => { const r = window.__held.box().getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) } })
    await h.mouse.click(where.x, where.y)
    await h.evaluate(() => { const box = window.__held.box(); box.scrollTo({ top: box.scrollHeight * 0.45, behavior: 'instant' }) })
    await rest()
    const left = await h.evaluate(() => window.__held.first())
    const heading = await h.evaluate((from) => window.__held.heading(from), left.index)
    // Another place to be sent to: where a stored picture sits, or a line by its lasting name.
    const other = /picture|line/.test(way)
    const place = !other ? null : await h.evaluate(([from, picture]) => (picture ? window.__held.picture(from) : window.__held.line(from)), [left.index, /picture/.test(way)])
    if (other && !place) { console.log(`\n(${way}: this note holds no ${/picture/.test(way) ? 'stored picture' : 'line with a lasting name'} far from the place kept: not run)`); continue }
    if (process.env.WHY) await h.evaluate(() => { const e = window.__held.ed(); window.__was = { ed: e.editor, dom: e } })
    await send('view', 'today')
    await h.waitForFunction((count) => !window.__held.open(count), size - 1, { timeout: 20000, polling: 50 })
    await h.waitForTimeout(900)
    let held = null
    if (way === 'openat') {
      // WHY=1: what is on the page as the link is followed, and whether the note that then shows is a new one.
      if (process.env.WHY) console.log(`  (before the link: ${JSON.stringify(await h.evaluate((sel) => ({ oldEditorDestroyed: window.__was.ed.isDestroyed, oldDomOnPage: window.__was.dom.isConnected, editorsOnPage: [...document.querySelectorAll(sel)].filter((one) => one.isConnected).map((one) => `${one.editor ? one.editor.state.doc.childCount : 'no editor'}${one.checkVisibility() ? '' : ' unseen'}`), pages: [...document.querySelectorAll('[data-page]')].map((one) => `${one.getAttribute('data-page')}${one.checkVisibility() ? '' : ' unseen'}`) }), ED))})`)
      // And the order the two askers come in: the editor's own "create" (where a waiting heading is taken), each
      // selection set, each jump of the scroller.
      if (process.env.WHY) await h.evaluate((sel) => {
        const was = window.__was.ed
        const t0 = performance.now()
        const log = (window.__order = [])
        const say = (what) => log.push(`+${Math.round(performance.now() - t0)}ms ${what}`)
        let attached = null
        const look = () => {
          const e = [...document.querySelectorAll(sel)].filter((one) => one.editor && one.isConnected).sort((a, b) => b.editor.state.doc.childCount - a.editor.state.doc.childCount)[0]
          if (e && e.editor !== attached && e.editor.state.doc.childCount > 100) {
            attached = e.editor
            say(`the note's editor is on the page (${e.editor === was ? 'the SAME one as before' : 'a new one'}; its "create" has ${e.editor.isInitialized ? 'already been told' : 'not been told yet'})`)
            e.editor.on('create', () => say('the editor tells "create"'))
            e.editor.on('transaction', ({ transaction }) => { if (transaction.selectionSet) say(`selection set in block ${transaction.selection.$head.index(0)}${transaction.scrolledIntoView ? ', asked into view' : ''}`) })
            let box = e.parentElement
            while (box && !/auto|scroll/.test(getComputedStyle(box).overflowY)) box = box.parentElement
            if (box) { let last = box.scrollTop; say(`scroller at ${Math.round(last)}`); box.addEventListener('scroll', () => { if (Math.abs(box.scrollTop - last) > 200) say(`scroller to ${Math.round(box.scrollTop)}`); last = box.scrollTop }, { passive: true }) }
          }
          if (performance.now() - t0 < 6000) requestAnimationFrame(look)
        }
        requestAnimationFrame(look)
      }, ED)
      await openNote(heading.text)
      if (process.env.WHY) console.log(`  (after it: ${JSON.stringify(await h.evaluate(() => ({ sameEditor: window.__held.ed().editor === window.__was.ed, sameDom: window.__held.ed() === window.__was.dom, pages: [...document.querySelectorAll('[data-page]')].map((one) => `${one.getAttribute('data-page')}${one.checkVisibility() ? '' : ' unseen'}`) })))})`)
    }
    else if (way === 'openpicture' || way === 'openline') await openNote(place.text)
    else {
      await openNote()
      await h.waitForTimeout(700)
      held = await h.evaluate(() => window.__held.first())
    }
    // What is asked for, straight after it opens: no wheel, press or key on the note first.
    let want = () => false
    let asked = ''
    if (way === 'top') {
      asked = 'the scroller set to its very top by a script'
      await h.evaluate(() => window.__held.box().scrollTo({ top: 0, behavior: 'instant' }))
      want = (now) => now.top <= 2
    } else if (way === 'cmdup') {
      asked = '⌘↑, the note given the keys by the app'
      await h.evaluate(() => window.__held.ed().editor.commands.focus(null, { scrollIntoView: false }))
      await h.waitForTimeout(120)
      await h.keyboard.press('Meta+ArrowUp')
      want = (now) => now.top <= 2
    } else if (way === 'rail') {
      // A real pointer over the rail (it opens under it; a move is no press), then a press on the stroke on show
      // there whose heading is furthest from the place kept.
      const list = await h.evaluate(() => { const r = document.querySelector('.tiptap-toc-list')?.getBoundingClientRect(); return r ? { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) } : null })
      if (list) { await h.mouse.move(list.x, list.y); await h.waitForTimeout(450) }
      const item = await h.evaluate((from) => {
        const box = document.querySelector('.tiptap-toc-list')?.getBoundingClientRect()
        if (!box) return null
        const where = new Map()
        window.__held.ed().editor.state.doc.forEach((node, _offset, index) => { if (node.type.name !== 'heading') return; const text = node.textContent.trim(); where.set(text, where.has(text) ? -1 : index) })
        let best = null
        for (const one of document.querySelectorAll('.tiptap-toc-item')) {
          const r = one.getBoundingClientRect()
          const index = where.get((one.title || one.textContent || '').trim()) ?? -1
          if (!r.height || r.top < box.top + 2 || r.bottom > box.bottom - 2 || index < 0) continue
          if (!best || Math.abs(index - from) > Math.abs(best.index - from)) best = { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), index, text: (one.title || one.textContent || '').trim() }
        }
        return best
      }, left.index)
      asked = item ? `the heading "${item.text}" pressed in the contents rail (block ${item.index}, ${Math.abs(item.index - left.index)} blocks from the place kept)` : 'a heading pressed in the contents rail (NO stroke on show to press)'
      if (item) await h.mouse.click(item.x, item.y)
      want = (now) => !!item && Math.abs(item.index - left.index) > 20 && Math.abs(now.index - item.index) <= 1
    } else if (way === 'link' || way === 'openat') {
      asked = way === 'link' ? `a link to the heading "${heading.text}" followed with the note open` : `the note opened by a link to the heading "${heading.text}"`
      if (way === 'link') await send('capture', note.id, heading.text)
      want = (now) => Math.abs(now.index - heading.index) <= 1
    } else if (other) {
      const what = /picture/.test(way) ? 'where a stored picture sits' : `a line by its lasting name${place.made ? ' (given one for this run)' : ''}`
      asked = /^open/.test(way) ? `the note opened by a link to ${what} (block ${place.index})` : `a link to ${what} (block ${place.index}) followed with the note open`
      if (!/^open/.test(way)) await send('capture', note.id, place.text)
      want = (now) => Math.abs(now.index - place.index) <= 1
    } else if (way === 'find') {
      // A word of the far heading, typed into find and stepped to with Return.
      const word = heading.text.split(/\s+/).sort((a, b) => b.length - a.length)[0]
      asked = `find's next match for "${word}"`
      await h.evaluate(() => window.__held.ed().editor.commands.focus(null, { scrollIntoView: false }))
      await h.waitForTimeout(120)
      await h.keyboard.press('Meta+f')
      await h.waitForTimeout(400)
      await h.keyboard.type(word, { delay: 20 })
      await h.waitForTimeout(500)
      await h.keyboard.press('Enter')
      want = () => true
    }
    const samples = []
    let waited = 0
    for (const ms of [150, 500, 1200, 2500]) { await h.waitForTimeout(ms - waited); waited = ms; samples.push([ms, await h.evaluate(() => window.__held.first()), way === 'find' ? await h.evaluate(() => window.__held.match()) : true]) }
    const settled = samples.filter(([ms]) => ms >= 500)
    const end = samples[samples.length - 1][1]
    const there = settled.every(([, one, shown]) => !!one && want(one) && shown)
    const still = Math.abs(settled[settled.length - 1][1].top - settled[settled.length - 2][1].top) <= 2
    const back = !!left && end.index === left.index
    const ok = there && still && !back
    results.push(ok)
    console.log(`\n[${ok ? 'ok' : 'FAIL'}] ${asked}  (${load()})`)
    console.log(`  left at ${say(left)}${held ? `; opened again at ${say(held)} (${held.index === left.index && Math.abs(held.at - left.at) <= 8 ? 'held there' : 'NOT where it was left'})` : ''}`)
    console.log(`  then: ${samples.map(([ms, one, shown]) => `+${ms}ms ${say(one)}${way === 'find' ? (shown ? ', the match on screen' : ', NO match on screen') : ''}`).join('; ')}`)
    console.log(`  ${there ? 'landed where it was sent' : 'NOT where it was sent'}${way === 'top' || way === 'cmdup' || way === 'rail' || other ? '' : heading ? ` (block ${heading.index})` : ''}, ${still ? 'stayed' : 'moved after'}${back ? ', and is BACK at the kept place' : ''}`)
    if (process.env.WHY && way === 'openat') console.log(`  the order: ${(await h.evaluate(() => window.__order ?? [])).join(' | ')}`)
    // The pointer off the rail again, so it shuts.
    if (way === 'rail') { await h.mouse.move(where.x, where.y); await h.waitForTimeout(300) }
    if (way === 'find') { await h.keyboard.press('Escape'); await h.waitForTimeout(300) }
  }
  console.log(`\n${results.filter(Boolean).length}/${results.length} passed`)
  console.log('errors:', c.errors.filter((line) => !/ERR_FILE_NOT_FOUND|status of 404|NotSameOrigin/.test(line)).slice(0, 6).join(' | '))
} finally {
  await Promise.race([c.close(), new Promise((done) => setTimeout(done, 8000))])
}
process.exit(results.length && results.every(Boolean) ? 0 : 1)
