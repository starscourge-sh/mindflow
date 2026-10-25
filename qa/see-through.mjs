// Every floating surface is opaque: page by page, at the top and scrolled, in
// the main window, a note window and the box, anything that floats (fixed,
// sticky, or absolute above the page) with a see-through background is listed
// by its classes. A dimming scrim behind a dialog is meant to be see-through.
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-x/main/index.js HALIGTREE_QA_AWAY=1 THEME=paper [STYLE=brutal] [SHOTS=<dir>] node qa/see-through.mjs
import { mkdirSync } from 'fs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const theme = process.env.THEME ?? 'paper'
const shots = process.env.SHOTS
if (shots) mkdirSync(shots, { recursive: true })
const pages = (process.env.PAGES ?? 'home,inbox,today,day,week,weekpage,monthpage,yearpage,review,queue,later,upcoming,matrix,goals,questions,nuggets,articles,all,tags,stats,map,settings,powers,whatsnew,discarded,archived').split(',')
const c = await sandbox({ width: 1000, height: 700, seeded: false })
const { h, go } = c
const report = {}
const add = (where, found) => { for (const [k, v] of Object.entries(found)) (report[k] ??= { bg: v, where: [] }).where.push(where) }
// While the examples are set out: the pill that says so floats over the page.
for (let i = 0; i < 150; i++) {
  const state = await c.v('sandbox:state').catch(() => null)
  if (i % 3 === 0) add('setting out', await scan(h).catch(() => ({})))
  if (i === 6 && shots) await h.screenshot({ path: `${shots}/setting-out-default.png` }).catch(() => {})
  if (state?.seeded || (state && !state.on)) break
  await h.waitForTimeout(200)
}
await h.evaluate((s) => localStorage.setItem('style', s), process.env.STYLE ?? 'soft')
// Examples set out three weeks ago: the pill offering to freshen them floats over the page after the reload.
await c.v('settings:set', { sandboxSeededOn: new Date(Date.now() - 21 * 86_400_000).toISOString().slice(0, 10) })
await c.theme(theme)
await c.size(1000, 700)
await go('inbox')
add('stale examples', await scan(h))
if (shots) await h.screenshot({ path: `${shots}/stale-pill-${theme}${process.env.STYLE ? '-' + process.env.STYLE : ''}.png` })
await h.getByRole('button', { name: 'Not now' }).click().catch(() => {})

/** Floating things whose own background (or a see-through parent's, up to the floating one) lets the page show through. */
function scan(page) { return page.evaluate(() => {
  const alpha = (color) => {
    if (!color || color === 'transparent') return 0
    const slash = color.match(/\/\s*([\d.]+%?)\s*\)$/)
    if (slash) return slash[1].endsWith('%') ? parseFloat(slash[1]) / 100 : parseFloat(slash[1])
    const rgba = color.match(/^rgba\(([^)]+)\)$/)
    return rgba ? parseFloat(rgba[1].split(',')[3]) : 1
  }
  // Absolute counts when it is not tucked behind (a hover highlight sits at -z-10) and carries words or a control.
  const floats = (style, node) => style.position === 'fixed' || style.position === 'sticky' || (style.position === 'absolute' && !(parseInt(style.zIndex) < 0) && (parseInt(style.zIndex) > 0 || !!node.querySelector('svg, button') || !!(node.textContent ?? '').trim()))
  const name = (el) => `${el.tagName.toLowerCase()}.${String(el.className?.baseVal ?? el.className ?? '').trim().split(/\s+/).slice(0, 14).join('.')} "${(el.textContent ?? '').trim().slice(0, 30)}"`
  const found = {}
  for (const el of document.querySelectorAll('body *')) {
    const box = el.getBoundingClientRect()
    if (box.width < 16 || box.height < 12 || box.bottom < 0 || box.top > innerHeight) continue
    const style = getComputedStyle(el)
    if (style.visibility === 'hidden' || style.opacity === '0') continue
    const own = alpha(style.backgroundColor)
    if (!(own > 0 && own < 0.97)) continue
    // A scrim: a dimming layer over the whole window behind a dialog.
    if (style.position === 'fixed' && box.width >= innerWidth - 2 && box.height >= innerHeight - 2) continue
    for (let node = el; node && node !== document.body; node = node.parentElement) {
      const s = node === el ? style : getComputedStyle(node)
      if (node !== el && alpha(s.backgroundColor) >= 0.97) break
      // A row of a long list, placed by the list itself: in the flow, over nothing.
      if (node.hasAttribute('data-index') && s.position === 'absolute') break
      if (floats(s, node)) { found[name(el)] = `${style.backgroundColor} (floats: ${node === el ? 'itself' : name(node).slice(0, 80)})`; break }
    }
  }
  return found
}) }

const scrollAll = (page, to) => page.evaluate((to) => {
  for (const el of document.querySelectorAll('*')) if (el.scrollHeight > el.clientHeight + 40 && /auto|scroll/.test(getComputedStyle(el).overflowY)) el.scrollTop = to === 'mid' ? el.scrollHeight / 3 : 0
}, to)

for (const p of pages) {
  await go(p)
  add(p, await scan(h))
  await scrollAll(h, 'mid'); await h.waitForTimeout(500)
  add(`${p} scrolled`, await scan(h))
  // Pointing at a few rows brings out what shows on hover: peeks, buttons, tips.
  for (const box of await h.evaluate(() => [...document.querySelectorAll('[data-id], [data-row], a, [role="row"]')].slice(0, 4).map((el) => { const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 } }).filter((b) => b.y > 0 && b.y < innerHeight))) {
    await h.mouse.move(box.x, box.y); await h.waitForTimeout(700)
    add(`${p} hover`, await scan(h))
  }
  if (shots) await h.screenshot({ path: `${shots}/${p}-${theme}.png` })
  await scrollAll(h, 'top')
}
// A note, open in the main window and in a window of its own.
const list = await h.evaluate(() => window.api.captures.list())
const id = (list.find((one) => one.kind === 'note' && /Odyssey|Start here/.test(one.label ?? '')) ?? list.find((one) => one.kind === 'note') ?? list[0]).id
await c.send('capture', id); await h.waitForTimeout(1500)
add('note', await scan(h))
await scrollAll(h, 'mid'); await h.waitForTimeout(500)
add('note scrolled', await scan(h))
if (shots) await h.screenshot({ path: `${shots}/note-${theme}.png` })
await h.evaluate((id) => window.api.haligtree('notes:window', 'capture', id), id)
let w
for (let i = 0; i < 30 && !w; i++) { w = c.electron.windows().find((x) => x.url().includes('note=')); if (!w) await h.waitForTimeout(300) }
if (w) {
  await w.waitForTimeout(1800)
  add('note window', await scan(w))
  await scrollAll(w, 'mid'); await w.waitForTimeout(500)
  add('note window scrolled', await scan(w))
  if (shots) await w.screenshot({ path: `${shots}/note-window-${theme}.png` })
}
// The box: the window with no view of its own.
const box = c.electron.windows().find((one) => !/[?&](view|note|drawing)=/.test(one.url())) ?? c.page
console.log('box window:', box.url().replace(/^.*\//, ''))
await c.electron.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((one) => !/[?&](view|note|drawing)=/.test(one.webContents.getURL()))?.show())
await box.waitForTimeout(800)
await box.evaluate((t) => { localStorage.setItem('theme', t); window.dispatchEvent(new StorageEvent('storage', { key: 'theme' })) }, theme).catch(() => {})
await box.waitForTimeout(600)
await box.keyboard.type('Ring the plumber about the boiler', { delay: 5 }).catch(() => {})
await box.waitForTimeout(500)
// With the pointer in, the box's own buttons turn up in a pill over the top lines.
await box.evaluate(() => document.querySelector('.app-container')?.classList.add('pointer-in'))
await box.waitForTimeout(400)
// On a see-through dark theme the box itself is glass over the desktop (real vibrancy), and its pill is glass with it.
const glass = await box.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--mf-window-tint').trim() !== '100%')
if (glass) console.log('box: glass theme, its pill is glass on purpose')
else add('box', await scan(box))
if (shots) await box.screenshot({ path: `${shots}/box-${theme}${process.env.STYLE ? '-' + process.env.STYLE : ''}.png` })

for (const [k, v] of Object.entries(report)) console.log(`SEE-THROUGH  ${k}\n    ${v.bg}\n    on: ${v.where.slice(0, 6).join(', ')}${v.where.length > 6 ? ` +${v.where.length - 6}` : ''}`)
console.log(`${Object.keys(report).length} see-through floating surfaces (${theme}${process.env.STYLE ? ' ' + process.env.STYLE : ''})`)
if (c.errors.length) console.log('errors', c.errors.slice(0, 5))
await c.close()
process.exit(0)
