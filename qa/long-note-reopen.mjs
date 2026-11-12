// A long note left part-way down opens again where it was left: the block at the top of the screen is the same
// one, within 8px of where it sat. On a copy of a real book (its largest note):
//   QA_DATA=<book copy> QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/long-note-reopen.mjs
// VIM=on|off (off). WAYS=wheel,jump,fling: how the screen got there (hard pushes of the wheel that come to rest; sent
// to 45% in one step, as the thumb dragged; left in the middle of a fling). LEAVES=view,note,quit: to another page
// and back, to another note and back, the app quit and launched again. A caret is first put in the note's first
// screen with a real click, so it is left behind (CLICK=off for none). TRACE=1 prints every scroll the page set as
// the note opened again, and who set it. SHOTS=<folder> keeps the screen as it was left and as it came back.
import { DatabaseSync } from 'node:sqlite'
import { existsSync, mkdirSync, readFileSync } from 'fs'
import { SourceMap } from 'node:module'
import { loadavg } from 'os'
import { dirname, join } from 'path'
import { sandbox } from './sandbox-lib.mjs'

const root = process.env.QA_DATA
const shelf = JSON.parse(readFileSync(join(root, 'books.json'), 'utf8'))
const db = new DatabaseSync(join(root, 'books', shelf.last, 'haligtree.db'), { readOnly: true })
const note = db.prepare("select id, body from captures where status = 'open' and kind = 'note' and body is not null order by length(body) desc limit 1").get()
const other = db.prepare("select id from captures where status = 'open' and kind = 'note' and body is not null and length(body) between 3000 and 9000 order by length(body) desc limit 1").get()
db.close()
const size = JSON.parse(note.body).content.length
const ED = '.tiptap.ProseMirror.haligtree-editor:not(.is-line)'
const WAYS = (process.env.WAYS ?? 'wheel,jump,fling').split(',').filter(Boolean)
const LEAVES = (process.env.LEAVES ?? 'view,note').split(',').filter(Boolean)
const VIM = process.env.VIM ?? 'off'
const load = () => `load ${loadavg()[0].toFixed(1)}`
const results = []
const maps = new Map()
const assets = join(dirname(dirname(process.env.QA_ENTRY)), 'renderer', 'assets')
function sourceOf(url, line, column) {
  const name = url.split('/').pop()?.split('?')[0] ?? ''
  const file = name && existsSync(join(assets, `${name}.map`)) ? join(assets, name) : null
  if (!file) return `${name}:${line}`
  if (!maps.has(file)) maps.set(file, new SourceMap(JSON.parse(readFileSync(`${file}.map`, 'utf8'))))
  const at = maps.get(file).findEntry(line - 1, column - 1)
  return at?.originalSource ? `${at.originalSource.replace(/^.*?(src|node_modules)\//, '$1/').replace(/^src\/renderer\/src\//, '')}:${at.originalLine + 1}` : `${name}:${line}`
}
// A stack as the page gave it, each frame told as its place in the source.
const whence = (stack) => (stack ?? '').split('\n').slice(2, 9).map((line) => { const m = /\(?(\S+?):(\d+):(\d+)\)?$/.exec(line.trim()); return m ? sourceOf(m[1], Number(m[2]), Number(m[3])) : line.trim() }).join(' < ')

const install = (h) => h.evaluate((sel) => {
  const ed = () => [...document.querySelectorAll(sel)].filter((one) => one.editor && one.isConnected).sort((a, b) => b.editor.state.doc.childCount - a.editor.state.doc.childCount)[0]
  const boxOf = (e) => { let box = e?.parentElement; while (box && !/auto|scroll/.test(getComputedStyle(box).overflowY)) box = box.parentElement; return box }
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
        return { pos, index: pos >= 0 ? e.editor.state.doc.resolve(pos).index(0) : -1, at: Math.round((r.top - edge) * 10) / 10, top: Math.round(box.scrollTop), tall: box.scrollHeight, drawn: e.childElementCount - e.querySelectorAll(':scope > [data-off]').length, text: (child.textContent ?? '').slice(0, 30) }
      }
    }
    return { pos: -1, index: -1, at: 0, top: Math.round(box.scrollTop), tall: box.scrollHeight, drawn: 0, text: '(no drawn block on screen)' }
  }
  // Every scroll the page sets itself, and every scroll event, with the block at the top of the screen then.
  const trace = []
  let tracing = false
  for (const name of ['scrollBy', 'scrollTo', 'scroll']) {
    const real = Element.prototype[name]
    Element.prototype[name] = function (...args) {
      const before = this.scrollTop
      const out = real.apply(this, args)
      if (tracing && this.classList?.contains('haligtree-editor-content')) trace.push({ t: Math.round(performance.now()), what: `${name}(${typeof args[0] === 'object' ? Math.round(args[0].top ?? 0) : Math.round(args[1] ?? 0)})`, from: Math.round(before), to: Math.round(this.scrollTop), stack: new Error().stack })
      return out
    }
  }
  document.addEventListener('scroll', (event) => { if (!tracing || !(event.target instanceof Element) || !event.target.classList.contains('haligtree-editor-content')) return; const now = first(); trace.push({ t: Math.round(performance.now()), what: 'scroll event', to: Math.round(event.target.scrollTop), first: now ? `${now.index} at ${now.at}` : 'none', drawn: now?.drawn }) }, { capture: true, passive: true })
  // When the page was last told of the wheel: each wheel event the probe sends is a gesture of its own, taken one a
  // frame, so a fling's last events arrive well after the last was sent.
  let wheelAt = 0
  window.addEventListener('wheel', () => void (wheelAt = performance.now()), { capture: true, passive: true })
  window.__a6 = {
    quiet: () => performance.now() - wheelAt,
    trace: (on) => { tracing = on; return trace.splice(0) },
    ed, box: () => boxOf(ed()), first, last: null, watching: null,
    // What the screen showed at each scroll, kept past the note's own going.
    watch: () => { const box = boxOf(ed()); if (!box || window.__a6.watching === box) return; window.__a6.watching = box; box.addEventListener('scroll', () => { const now = first(); if (now && now.pos >= 0) window.__a6.last = now }, { passive: true }) },
    open: (count) => { const e = ed(); return !!e && e.editor.state.doc.childCount >= count },
    state: () => { const e = ed(); const box = boxOf(e); if (!e || !box) return null; const view = box.getBoundingClientRect(); return { x: Math.round(view.left + view.width / 2), y: Math.round(view.top + view.height / 2), caret: e.editor.state.selection.$head.index(0), keys: document.activeElement === e, vim: e.getAttribute('data-vim-mode') } },
  }
}, ED)

const fling = (electron, x, y, speed, way, hold = 0) => electron.evaluate(async ({ BrowserWindow }, [x, y, speed, way, hold]) => {
  const win = BrowserWindow.getAllWindows().find((one) => one.webContents.getURL().includes('view=home'))
  const started = performance.now()
  let last = started
  for (;;) {
    await new Promise((next) => setTimeout(next, 8))
    const now = performance.now()
    const t = now - started
    if (hold && t > hold) break
    const v = t < 80 ? speed * (t / 80) : speed * Math.exp(-(t - 80) / 325)
    if (t >= 80 && v < 40) break
    const by = (v * (now - last)) / 1000
    last = now
    if (by < 0.5) continue
    win.webContents.sendInputEvent({ type: 'mouseWheel', x, y, deltaX: 0, deltaY: -way * by, hasPreciseScrollingDeltas: true, canScroll: true })
  }
}, [x, y, speed, way, hold])

// TRACE=1 with LEAVES=quit: the window is loaded again with this in it from its first moment, so every scroll set as
// the note comes back by itself (as it does when the app is launched) is told, and who set it.
const TRACER = `(() => {
  const log = (window.__t = [])
  for (const name of ['scrollBy', 'scrollTo', 'scroll']) {
    const real = Element.prototype[name]
    Element.prototype[name] = function (...args) {
      const before = this.scrollTop
      const out = real.apply(this, args)
      if (this.classList && this.classList.contains('haligtree-editor-content')) log.push({ t: Math.round(performance.now()), what: name + '(' + (typeof args[0] === 'object' ? Math.round(args[0].top || 0) : Math.round(args[1] || 0)) + ')', from: Math.round(before), to: Math.round(this.scrollTop), stack: new Error().stack })
      return out
    }
  }
  document.addEventListener('scroll', (event) => { const box = event.target; if (!(box instanceof Element) || !box.classList.contains('haligtree-editor-content')) return; const ed = box.querySelector('.ProseMirror'); const edge = box.getBoundingClientRect().top; let first = 'none'; if (ed) for (const child of ed.children) { if (child.hasAttribute('data-off')) continue; const r = child.getBoundingClientRect(); if ((r.height || r.width) && r.bottom > edge + 0.5) { first = Array.prototype.indexOf.call(ed.children, child) + ' at ' + Math.round(r.top - edge); break } } log.push({ t: Math.round(performance.now()), what: 'scroll event', to: Math.round(box.scrollTop), first, width: ed ? ed.clientWidth : 0 }) }, { capture: true, passive: true })
  for (const type of ['wheel', 'keydown', 'pointerdown', 'resize']) window.addEventListener(type, () => log.push({ t: Math.round(performance.now()), what: type, to: 0, first: '' }), { capture: true, passive: true })
})()`

async function launch() {
  const c = await sandbox({ width: 1300, height: 900, seeded: false })
  const { h } = c
  await h.evaluate(() => window.api.haligtree('onboarding:set', { welcomed: new Date().toISOString(), newsSeen: true, welcoming: false, pageHints: false }))
  await h.evaluate(() => window.api.haligtree('settings:set', { sounds: false, hintRate: 0, smoothScroll: true }))
  if (await h.evaluate((want) => { const had = localStorage.getItem('vim'); localStorage.setItem('vim', want); return had !== want }, VIM)) { await h.reload(); await h.waitForLoadState('domcontentloaded') }
  await h.waitForTimeout(1200)
  await install(h)
  return c
}
const openNote = async (c, id = note.id, count = size - 1) => {
  const t = Date.now()
  await c.send('capture', id)
  await c.h.waitForFunction((count) => window.__a6.open(count), count, { timeout: 60000, polling: 50 })
  return Date.now() - t
}
/** Until the page has not been told of the wheel for 700 ms: what a fling sent has all arrived. */
const drained = (h) => h.waitForFunction(() => window.__a6.quiet() > 700, null, { timeout: 60000, polling: 100 })
const rest = async (h) => {
  // Until the wheel has all arrived and the scroll has stood still for 600 ms.
  await drained(h)
  let was = -1
  for (let still = 0, i = 0; still < 4 && i < 100; i++) {
    const now = await h.evaluate(() => window.__a6.box()?.scrollTop ?? -1)
    still = now === was ? still + 1 : 0
    was = now
    await h.waitForTimeout(150)
  }
}
const show = (one) => (one ? `block ${one.index} at ${one.at}px (scroll ${one.top} of ${one.tall}, ${one.drawn} drawn) "${one.text}"` : 'nothing')

let c = await launch()
try {
  console.log(`build ${process.env.QA_ENTRY.split('/').slice(-3, -2)}; Vim ${VIM}; note ${note.id} (${size} blocks); other ${other?.id}  (${load()})`)
  console.log(`opened in ${await openNote(c)} ms: ${show(await c.h.evaluate(() => window.__a6.first()))}`)
  await c.h.waitForTimeout(1500)
  for (const leave of LEAVES) {
    for (const way of WAYS) {
      const { h, electron, send } = c
      // From the top, a caret put in the first screen by a real click (it is left behind by what follows).
      await h.evaluate(() => window.__a6.box().scrollTo({ top: 0, behavior: 'instant' }))
      await rest(h)
      const where = await h.evaluate(() => window.__a6.state())
      if (process.env.CLICK !== 'off') { await h.mouse.click(where.x - 100, where.y - 100); await h.waitForTimeout(300) }
      const held = await h.evaluate(() => window.__a6.state())
      await h.evaluate(() => window.__a6.watch())
      let before
      if (way === 'wheel') {
        for (let push = 0; push < 5; push++) await fling(electron, where.x, where.y, 40000, 1, 260)
        await fling(electron, where.x, where.y, 12000, 1)
        await rest(h)
        before = await h.evaluate(() => window.__a6.first())
      } else if (way === 'jump') {
        await h.evaluate(() => { const box = window.__a6.box(); box.scrollTo({ top: box.scrollHeight * 0.45, behavior: 'instant' }) })
        await rest(h)
        before = await h.evaluate(() => window.__a6.first())
      } else {
        await h.evaluate(() => { const box = window.__a6.box(); box.scrollTo({ top: box.scrollHeight * 0.3, behavior: 'instant' }) })
        await rest(h)
        const flung = fling(electron, where.x, where.y, 12000, 1)
        await h.waitForTimeout(350)
        if (leave === 'note') await send('capture', other.id)
        else if (leave === 'view') await send('view', 'today')
        await flung
      }
      if (way !== 'fling') {
        if (process.env.SHOTS) { mkdirSync(process.env.SHOTS, { recursive: true }); await h.screenshot({ path: join(process.env.SHOTS, `${way}-${leave}-left.png`) }) }
        if (leave === 'note') await send('capture', other.id)
        else if (leave === 'view') await send('view', 'today')
      }
      if (leave === 'quit') {
        if (way === 'fling') { await h.waitForTimeout(60) }
        before = before ?? await h.evaluate(() => window.__a6.last)
        await Promise.race([c.close(), new Promise((done) => setTimeout(done, 8000))])
        await new Promise((done) => setTimeout(done, 1500))
        c = await launch()
        if (process.env.TRACE) {
          // The place as the quit kept it is put back first: loading the window again keeps wherever the launch put the note.
          const places = await c.h.evaluate(() => localStorage.getItem('note-places'))
          await c.electron.context().addInitScript(`localStorage.setItem('note-places', ${JSON.stringify(places)});${TRACER}`)
          await c.h.reload()
          await c.h.waitForLoadState('domcontentloaded')
          await c.h.waitForTimeout(6000)
          for (const one of await c.h.evaluate(() => window.__t ?? [])) console.log(`    ${one.t} ${one.what}${one.from !== undefined ? ` ${one.from} -> ${one.to}` : ` at ${one.to}, first ${one.first}${one.width ? `, note ${one.width}px wide` : ''}`}${one.stack ? `   by ${whence(one.stack)}` : ''}`)
          await install(c.h)
        }
      } else {
        await h.waitForFunction((count) => !window.__a6.open(count), size - 1, { timeout: 20000, polling: 50 })
        // The rest of the fling arrives at a page with no note on it; none of it is left for the note opened again.
        await drained(h)
        await h.waitForTimeout(900)
        if (way === 'fling') before = await h.evaluate(() => window.__a6.last)
      }
      const kept = await c.h.evaluate((id) => JSON.parse(localStorage.getItem('note-places') ?? '{}')[`capture-${id}`] ?? null, note.id)
      if (process.env.TRACE) await c.h.evaluate(() => window.__a6.trace(true))
      const took = await openNote(c)
      // SHOTS=<folder>: the screen as the note came back (three frames, one after another), to set beside it as it was left.
      if (process.env.SHOTS) for (let n = 0; n < 3; n++) await c.h.screenshot({ path: join(process.env.SHOTS, `${way}-${leave}-back-${n}.png`) })
      const samples = []
      let waited = 0
      for (const ms of [0, 150, 350, 700, 1500, 3000]) { await c.h.waitForTimeout(ms - waited); waited = ms; samples.push([ms, await c.h.evaluate(() => window.__a6.first())]) }
      const after = samples[samples.length - 1][1]
      const ok = !!before && !!after && before.pos === after.pos && Math.abs(before.at - after.at) <= 8
      const early = samples.filter(([, one]) => !one || one.pos !== before?.pos || Math.abs(one.at - before.at) > 8).map(([ms, one]) => `+${ms}ms block ${one?.index} at ${one?.at}px`)
      results.push(ok)
      console.log(`\n[${ok ? 'ok' : 'FAIL'}] got there by ${way}, left by ${leave} (caret left in block ${held.caret}, Vim mode ${held.vim ?? 'off'})  (${load()})`)
      console.log(`  left at:   ${show(before)}`)
      console.log(`  kept:      ${JSON.stringify(kept)}`)
      console.log(`  came back: ${show(after)}  (opened in ${took} ms)${before && after ? `; ${after.index - before.index} blocks and ${Math.round(after.at - before.at)}px from where it was` : ''}`)
      if (early.length) console.log(`  on the way: ${early.join('; ')}`)
      if (process.env.TRACE) for (const one of await c.h.evaluate(() => window.__a6.trace(false))) console.log(`    ${one.t} ${one.what}${one.from !== undefined ? ` ${one.from} -> ${one.to}` : ` at ${one.to}, first ${one.first}, ${one.drawn} drawn`}${one.stack ? `   by ${whence(one.stack)}` : ''}`)
    }
  }
  console.log(`\n${results.filter(Boolean).length}/${results.length} came back to the same block within 8px`)
  console.log('errors:', c.errors.filter((line) => !/ERR_FILE_NOT_FOUND|status of 404|NotSameOrigin/.test(line)).slice(0, 6).join(' | '))
} finally {
  await Promise.race([c.close(), new Promise((done) => setTimeout(done, 8000))])
}
process.exit(results.every(Boolean) ? 0 : 1)
