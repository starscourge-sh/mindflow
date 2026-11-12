// Focus leaving a long note never stops the window. The caret is left in the note's first screen by a real click,
// the note is sent far from it (AT=0.05,0.45,0.95: the share of the way down), and then focus leaves the note each
// way it can: a press on the window's chrome, ⌘K, a menu opened, the window itself losing focus, another tab
// chosen, a press on "New tab". After each, the page's own clock must never stand still for more than 150 ms.
// (With the caret left in blocks that are no longer on the page, a press on "New tab" stopped the window for 45
// seconds and more.) On a copy of a real book (its largest note):
//   QA_DATA=<book copy> QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/long-note-leave.mjs
// WAYS=chrome,palette,menu,window,tab,newtab (all). LIMIT=150 (ms). A way that stops the window for more than 20 s
// ends the run there: nothing after it could be told apart from it.
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
const AT = (process.env.AT ?? '0.05,0.45,0.95').split(',').map(Number)
const WAYS = (process.env.WAYS ?? 'chrome,palette,menu,window,tab,newtab').split(',').filter(Boolean)
const LIMIT = Number(process.env.LIMIT ?? 150)
const load = () => `load ${loadavg()[0].toFixed(1)}`
const results = []
const check = (name, ok, detail = '') => (results.push(!!ok), console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`))

const c = await sandbox({ width: 1300, height: 900, seeded: false })
const { h, send } = c
const install = () => h.evaluate((sel) => {
  const ed = () => [...document.querySelectorAll(sel)].filter((one) => one.editor && one.isConnected).sort((a, b) => b.editor.state.doc.childCount - a.editor.state.doc.childCount)[0]
  const boxOf = (e) => { let box = e?.parentElement; while (box && !/auto|scroll/.test(getComputedStyle(box).overflowY)) box = box.parentElement; return box }
  // The page's own clock: the longest it stood still between two ticks since it was last asked.
  let last = performance.now()
  let worst = 0
  const tick = () => { const now = performance.now(); worst = Math.max(worst, now - last); last = now }
  setInterval(tick, 8)
  const frame = () => { tick(); requestAnimationFrame(frame) }
  requestAnimationFrame(frame)
  window.__leave = {
    ed, box: () => boxOf(ed()),
    open: (count) => { const e = ed(); return !!e && e.editor.state.doc.childCount >= count },
    stall: () => { tick(); const was = Math.round(worst); worst = 0; return was },
    where: () => { const e = ed(); const box = boxOf(e); if (!e || !box) return null; const r = box.getBoundingClientRect(); const s = getSelection(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + 200), caret: e.editor.state.selection.$head.index(0), keys: document.activeElement === e, top: Math.round(box.scrollTop), tall: box.scrollHeight, selection: s.rangeCount ? (e.contains(s.anchorNode) ? 'in the note' : 'elsewhere') : 'none' } },
    to: (share) => { const box = boxOf(ed()); box.scrollTo({ top: Math.round((box.scrollHeight - box.clientHeight) * share), behavior: 'instant' }) },
  }
}, ED)
const answers = (ms) => Promise.race([h.evaluate(() => 1).then(() => true, () => false), new Promise((done) => setTimeout(() => done(false), ms))])
const openNote = async () => {
  await send('capture', note.id)
  await h.waitForFunction((count) => window.__leave.open(count), size - 1, { timeout: 60000, polling: 50 })
}
/** The caret put in the note's first screen by a real click, then the note sent to `share` of the way down. */
const setUp = async (share) => {
  if (!(await h.evaluate((count) => window.__leave.open(count), size - 1))) await openNote()
  await h.evaluate(() => window.__leave.to(0))
  await h.waitForTimeout(600)
  const at = await h.evaluate(() => window.__leave.where())
  await h.mouse.click(at.x, at.y)
  await h.waitForTimeout(350)
  await h.evaluate((share) => window.__leave.to(share), share)
  await h.waitForTimeout(1200)
  return h.evaluate(() => window.__leave.where())
}
const center = (selector) => h.evaluate((selector) => { const r = document.querySelector(selector)?.getBoundingClientRect(); return r && r.width ? { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) } : null }, selector)
let gone = false
try {
  await h.evaluate(() => window.api.haligtree('onboarding:set', { welcomed: new Date().toISOString(), newsSeen: true, welcoming: false, pageHints: false }))
  await h.evaluate(() => window.api.haligtree('settings:set', { sounds: false, hintRate: 0, smoothScroll: true }))
  await h.waitForTimeout(1200)
  await install()
  await openNote()
  await h.waitForTimeout(1500)
  // A second tab beside the note's, made before any caret is left behind, to have one to choose.
  const mine = await h.evaluate(() => document.querySelector('[data-tab][data-tab-on]')?.getAttribute('data-tab') ?? null)
  // A press where something is, with the real pointer and nothing waited for: a window that stops is found out by its clock, not by a press that never returns.
  const press = async (selector) => { const at = await center(selector); if (at) await h.mouse.click(at.x, at.y); return !!at }
  console.log(`as it opened: ${JSON.stringify(await h.evaluate(() => window.__leave.where()))}; the window in front: ${await h.evaluate(() => document.hasFocus())}`)
  if (WAYS.includes('tab')) {
    await press('[data-tab-add]')
    await h.waitForTimeout(1200)
    await press(`[data-tab="${mine}"] [role="tab"]`)
    await h.waitForFunction((count) => window.__leave.open(count), size - 1, { timeout: 60000, polling: 50 })
    await h.waitForTimeout(1200)
  }
  const other = await h.evaluate((mine) => [...document.querySelectorAll('[data-tab]')].map((one) => one.getAttribute('data-tab')).find((key) => key !== mine) ?? null, mine)
  console.log(`note ${note.id.slice(0, 8)}: ${size} blocks; the limit is ${LIMIT} ms  (${load()})`)
  for (const share of AT) {
    for (const way of WAYS) {
      if (gone) break
      const before = await setUp(share)
      const said = `at ${Math.round(share * 100)}% (caret left in block ${before.caret}, the keys in the note: ${before.keys}, the browser's selection ${before.selection})`
      await h.evaluate(() => { window.__leave.stall(); window.__leave.note = window.__leave.ed() })
      const began = Date.now()
      // The way out, not waited for: a window that stops never says it is done.
      let act = Promise.resolve()
      let what = way
      if (way === 'chrome') {
        // The bar over the note, at a place with nothing to press: the keys simply leave the note.
        const bare = await h.evaluate(() => { const r = window.__leave.box().getBoundingClientRect(); const e = window.__leave.ed(); for (let y = r.top - 14; y > r.top - 60; y -= 10) for (let x = r.left + 8; x < r.right - 8; x += 12) { const under = document.elementFromPoint(x, y); if (under && !e.contains(under) && !under.closest('button, a, input, textarea, select, [role="tab"], [role="button"], [role="menuitem"], [contenteditable="true"], [data-tab]')) return { x: Math.round(x), y: Math.round(y) } } return null })
        what = bare ? 'a press on the bar over the note, where there is nothing to press' : 'a press on bare chrome (NO bare place found over the note)'
        act = bare ? h.mouse.click(bare.x, bare.y) : Promise.resolve()
      } else if (way === 'palette') {
        what = '⌘K'
        act = h.keyboard.press('Meta+k')
      } else if (way === 'menu') {
        const at = await h.evaluate(() => { const e = window.__leave.ed(); const pane = e.closest('[data-pane]') ?? document; const one = [...pane.querySelectorAll('button[aria-haspopup="menu"]')].find((each) => each.getBoundingClientRect().width > 0 && !e.contains(each)); const r = one?.getBoundingClientRect(); return r ? { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), name: one.getAttribute('aria-label') ?? one.textContent?.trim().slice(0, 20) ?? '' } : null })
        what = at ? `the menu "${at.name}" opened` : 'a menu opened (NO menu button found beside the note)'
        act = at ? h.mouse.click(at.x, at.y) : Promise.resolve()
      } else if (way === 'window') {
        what = 'the window losing focus'
        act = c.electron.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((one) => one.webContents.getURL().includes('view=home'))?.blurWebView())
      } else if (way === 'tab') {
        what = 'another tab chosen'
        const at = other ? await center(`[data-tab="${other}"] [role="tab"]`) : null
        act = at ? h.mouse.click(at.x, at.y) : Promise.resolve()
        if (!at) what += ' (NO other tab)'
      } else if (way === 'newtab') {
        what = 'a press on "New tab"'
        const at = await center('[data-tab-add]')
        act = at ? h.mouse.click(at.x, at.y) : Promise.resolve()
      }
      act.catch(() => {})
      // Answering again, however long that takes (up to 20 s), then two seconds more of the page's own clock.
      let alive = false
      for (let i = 0; i < 20 && !alive; i++) alive = await answers(1000)
      const back = Date.now() - began
      if (!alive) {
        check(`${what}, ${said}: the window answers within ${LIMIT} ms`, false, `it did NOT answer for ${back} ms: the run ends here  (${load()})`)
        gone = true
        break
      }
      await h.waitForTimeout(2000)
      const stall = await h.evaluate(() => window.__leave.stall())
      // Whether the way out was really taken: the keys are no longer in the note, or the window no longer in front.
      const left = await h.evaluate((way) => (way === 'window' ? !document.hasFocus() : document.activeElement !== window.__leave.note), way)
      check(`${what}, ${said}: the window answers within ${LIMIT} ms`, stall <= LIMIT && left, `its clock stood still for ${stall} ms at most; it answered the probe ${back} ms after${left ? '' : '; BUT the keys never left the note'}  (${load()})`)
      // Put back: the menu or the palette shut, the window in front again, the note's own tab chosen.
      if (way === 'palette' || way === 'menu') { await h.keyboard.press('Escape'); await h.waitForTimeout(300) }
      if (way === 'window') await c.electron.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((one) => one.webContents.getURL().includes('view=home'))?.focusOnWebView())
      if (way === 'tab' || way === 'newtab') {
        await press(`[data-tab="${mine}"] [role="tab"]`)
        await h.waitForFunction((count) => window.__leave.open(count), size - 1, { timeout: 60000, polling: 50 })
        await h.waitForTimeout(1200)
      }
    }
  }
  console.log(`\n${results.filter(Boolean).length}/${results.length} passed`)
  if (!gone) console.log('errors:', c.errors.filter((line) => !/ERR_FILE_NOT_FOUND|status of 404|NotSameOrigin/.test(line)).slice(0, 6).join(' | '))
} finally {
  await Promise.race([c.close(), new Promise((done) => setTimeout(done, 8000))])
}
process.exit(results.length && results.every(Boolean) ? 0 : 1)
