// The chosen pill behind every segmented control and chip row fills its item,
// whatever happened while it moved: the window hidden or minimised mid-glide,
// the interface size changed while away, the font swapped late, pages switched
// fast. Each case is measured on screen (the pill's own box against the chosen
// item's), within 1px.
//
//   npx electron-vite build --outDir out-pill && QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-pill/main/index.js node qa/glide-pill.mjs
//
// The pill went wrong only under React's development build (the one
// `electron-vite dev` runs): its double start of every effect left the
// re-measuring switched off, so a pill measured before its label filled in
// stayed a 17px dot. Run it against a development build to see that.
import { sandbox } from './sandbox-lib.mjs'

const c = await sandbox()
const { electron, h, go, v } = c
const VIEWS = ['home', 'stats', 'today', 'week', 'review', 'settings', 'day']
const fails = []
let checked = 0

const win = (call) => electron.evaluate(({ BrowserWindow }, call) => {
  const w = BrowserWindow.getAllWindows().find((one) => one.webContents.getURL().includes('view=home'))
  if (call === 'hide') w.hide()
  if (call === 'show') w.showInactive()
  if (call === 'minimize') w.minimize()
  if (call === 'restore') w.restore()
}, call)

/** Every chosen pill on the page against its chosen item: how far apart each edge is. */
const measure = () => h.evaluate(() => {
  const out = []
  for (const pill of document.querySelectorAll('[data-glide]')) {
    // Hover lights are tinted (bg-x/50); the chosen pill is solid.
    if (/bg-[a-z-]+\//.test(pill.className)) continue
    const box = pill.parentElement
    const item = box.querySelector(':scope > button[aria-pressed="true"], :scope > button[aria-selected="true"], [aria-current="page"]:not([inert] *), [data-search-at][aria-selected="true"]')
    if (!item || !item.offsetWidth) continue
    const a = pill.getBoundingClientRect()
    const b = item.getBoundingClientRect()
    const off = Math.max(Math.abs(a.left - b.left), Math.abs(a.top - b.top), Math.abs(a.width - b.width), Math.abs(a.height - b.height))
    out.push({ label: (item.textContent ?? '').trim().slice(0, 18), off: Math.round(off * 10) / 10, pill: Math.round(a.width), item: Math.round(b.width), opacity: +getComputedStyle(pill).opacity })
  }
  return out
})

const check = async (view, condition) => {
  for (const one of await measure()) {
    checked++
    if (one.off > 1 || one.opacity < 0.99) fails.push(`${view} / ${condition}: "${one.label}" pill ${one.pill}px vs item ${one.item}px, off by ${one.off}px, opacity ${one.opacity}`)
  }
}

/** Click a not-chosen item in the first chip row or segmented control, so the pill starts to travel. */
const pickAnother = () => h.evaluate(() => {
  for (const pill of document.querySelectorAll('[data-glide]')) {
    if (/bg-[a-z-]+\//.test(pill.className)) continue
    const other = pill.parentElement.querySelector(':scope > button[aria-pressed="false"], :scope > button[aria-selected="false"]')
    if (other) return other.click(), true
  }
  return false
})

const wait = (ms) => h.waitForTimeout(ms)

for (const view of VIEWS) {
  await go(view)
  await wait(600)
  await check(view, 'at rest')

  // Hidden mid-glide, then shown again.
  if (await pickAnother()) {
    await wait(30)
    await win('hide')
    await wait(800)
    await win('show')
    await wait(500)
    await check(view, 'hidden mid-glide')
  }

  // Minimised mid-glide, then restored.
  if (await pickAnother()) {
    await wait(30)
    await win('minimize')
    await wait(1200)
    await win('restore')
    await wait(500)
    await check(view, 'minimised mid-glide')
  }

  // The interface size changed while the window was away.
  await win('hide')
  await v('settings:set', { interfaceSize: 'large' })
  await wait(400)
  await win('show')
  await wait(500)
  await check(view, 'interface size changed while hidden')
  await v('settings:set', { interfaceSize: 'medium' })
  await wait(500)
  await check(view, 'interface size back')

  // A font that arrives late, wider than the one it replaces, while hidden.
  await win('hide')
  await h.evaluate(() => document.body.style.setProperty('font-family', 'Georgia, serif'))
  await wait(300)
  await win('show')
  await wait(500)
  await check(view, 'font swapped while hidden')
  await h.evaluate(() => document.body.style.removeProperty('font-family'))
  await wait(500)
  await check(view, 'font back')
}

// Pages switched fast, then the last one left to settle.
for (const view of [...VIEWS, ...VIEWS]) await c.send('view', view), await wait(60)
await wait(900)
await check('settings', 'pages switched fast')

// Opened while hidden: the window put away, a page chosen, then shown.
await win('hide')
await c.send('view', 'stats')
await wait(900)
await win('show')
await wait(500)
await check('stats', 'opened while hidden')

console.log(`${checked} pills measured, ${fails.length} wrong`)
for (const line of fails) console.log('FAIL ' + line)
if (c.errors.length) console.log(c.errors.slice(0, 5).join('\n'))
await c.close()
process.exit(fails.length ? 1 : 0)
