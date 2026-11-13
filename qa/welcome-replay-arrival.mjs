// “Show the welcome again” from an ordinary run, its window not made see-through, plays the arrival out of the
// desktop: the window is put away and a see-through one made in its place (main: remakeHome), the mist comes in over
// the desktop and draws in to the window, and under the welcome the app is as it was left. Two tabs: a list scrolled
// down in the first, a long note part-way down on show in the second. Once the welcome is over: the same tabs, the
// same one on show, the note at the same block, the list at the same scroll, the window back where it stood, one main
// window. `esc`: Esc a little way into the arrival draws the mist in at once, with the same result.
// On a copy of the main book (its notes are long enough to scroll):
//   QA_DATA=<book copy> QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/welcome-replay-arrival.mjs [esc]
import { DatabaseSync } from 'node:sqlite'
import { readFileSync } from 'fs'
import { loadavg } from 'os'
import { join } from 'path'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'

// The arrival is allowed in this test run, for the replay only: the window is first made as on any ordinary launch.
process.env.HALIGTREE_QA_ARRIVAL = 'again'
process.env.HALIGTREE_QA_VIRTUAL ??= '1'
const ESC = process.argv[2] === 'esc'
const root = process.env.QA_DATA
const shelf = JSON.parse(readFileSync(join(root, 'books.json'), 'utf8'))
const db = new DatabaseSync(join(root, 'books', shelf.last, 'haligtree.db'), { readOnly: true })
// Long enough to scroll well past a screen, short enough to open at once.
const note = db.prepare("select id from captures where status = 'open' and kind = 'note' and body is not null and length(body) between 40000 and 400000 order by length(body) desc limit 1").get()
db.close()
const { check, done } = checks()
const load = () => `load ${loadavg()[0].toFixed(1)}`
const c = await sandbox({ width: 1100, height: 760, seeded: false })
const { electron, errors, close } = c
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

// The page's own reading of where things stand: its tabs, the note on show and the block at the top of its screen,
// and the front pane's list scroller.
const read = (page) => page.evaluate(() => {
  const tabs = [...document.querySelectorAll('[data-tab]')].map((one) => ({ key: one.getAttribute('data-tab'), on: one.hasAttribute('data-tab-on'), label: one.getAttribute('data-drag-title') }))
  const ed = [...document.querySelectorAll('.tiptap.ProseMirror.haligtree-editor:not(.is-line)')].filter((one) => one.editor && one.isConnected && one.getClientRects().length).sort((a, b) => b.editor.state.doc.childCount - a.editor.state.doc.childCount)[0]
  let block = null
  const box = ed?.closest('.haligtree-editor-content')
  if (ed && box) {
    const edge = box.getBoundingClientRect().top
    for (const child of ed.children) {
      if (child.hasAttribute('data-off')) continue
      const r = child.getBoundingClientRect()
      if ((r.height || r.width) && r.bottom > edge + 0.5) {
        const d = child.pmViewDesc
        block = { index: d?.node ? ed.editor.state.doc.resolve(d.posAtStart).index(0) : -1, at: Math.round(r.top - edge), top: Math.round(box.scrollTop) }
        break
      }
    }
  }
  const front = document.querySelector('[data-pane-front]') ?? document
  const lists = [...front.querySelectorAll('*')].filter((one) => !one.closest('.haligtree-editor-content') && /auto|scroll/.test(getComputedStyle(one).overflowY) && one.scrollHeight > one.clientHeight + 40)
  const list = lists.sort((a, b) => b.scrollHeight - a.scrollHeight)[0]
  return { tabs, block, list: list ? Math.round(list.scrollTop) : null, listTall: list?.scrollHeight ?? 0 }
})
const scrollList = (page, by) => page.evaluate((by) => {
  const front = document.querySelector('[data-pane-front]') ?? document
  const list = [...front.querySelectorAll('*')].filter((one) => !one.closest('.haligtree-editor-content') && /auto|scroll/.test(getComputedStyle(one).overflowY) && one.scrollHeight > one.clientHeight + 40).sort((a, b) => b.scrollHeight - a.scrollHeight)[0]
  list?.scrollTo({ top: by, behavior: 'instant' })
  return list ? list.scrollTop : null
}, by)
const homes = () => electron.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().filter((one) => !one.isDestroyed() && one.webContents.getURL().includes('view=home')).map((one) => ({ url: one.webContents.getURL().replace(/^.*\?/, ''), bounds: one.getBounds(), shown: one.isVisible() })))

try {
  console.log(`build ${process.env.QA_ENTRY.split('/').slice(-3, -2)}; note ${note?.id}; ${ESC ? 'Esc mid-way' : 'played through'} (${load()})`)
  // The mist over the desktop plays only for a window looked at: a parked test window never has the keys (welcome-mist.tsx).
  await electron.context().addInitScript(() => { document.hasFocus = () => true })
  const h = c.h
  await h.evaluate(() => window.api.haligtree('onboarding:set', { welcomed: new Date().toISOString(), newsSeen: true, welcoming: false, pageHints: false }))
  await h.evaluate(() => window.api.haligtree('settings:set', { hintRate: 0 }))
  check('an ordinary run: the main window is not made see-through', (await electron.evaluate(() => globalThis.haligtreeArrival())).made === false)
  // The first tab: the Inbox, scrolled down.
  await c.go('inbox')
  await h.waitForTimeout(1200)
  const listAt = await scrollList(h, 900)
  await h.waitForTimeout(500)
  // The second tab: the long note, part-way down.
  await h.click('[data-tab-add]')
  await h.waitForTimeout(700)
  await c.send('capture', note.id)
  await h.waitForFunction(() => !!document.querySelector('.haligtree-editor-content'), null, { timeout: 30000 })
  await h.waitForTimeout(1500)
  await h.evaluate(() => { const box = [...document.querySelectorAll('.haligtree-editor-content')].find((one) => one.getClientRects().length); box?.scrollTo({ top: box.scrollHeight * 0.3, behavior: 'instant' }) })
  await h.waitForTimeout(1200)
  const before = await read(h)
  const bounds = (await homes())[0]?.bounds
  console.log(`before: ${JSON.stringify({ ...before, listAt, bounds })}`)
  check('set up: two tabs, the note on show part-way down, the list scrolled', before.tabs.length === 2 && before.tabs[1].on && before.block?.top > 300 && listAt > 300, JSON.stringify({ tabs: before.tabs.length, block: before.block, listAt }))

  // “Show the welcome again” from the Haligtree menu, as a person picks it.
  const asked = Date.now()
  await electron.evaluate(({ Menu }) => {
    const find = (items) => { for (const one of items) { if (one.label === 'Show the welcome again') return one; const inner = one.submenu && find(one.submenu.items); if (inner) return inner } }
    find(Menu.getApplicationMenu().items)?.click()
  })
  // The window made in its place.
  let h2 = null
  for (let i = 0; i < 100 && !h2; i++) (await wait(100), (h2 = electron.windows().find((one) => one.url().includes('again=1')) ?? null))
  check('a window is made in its place', !!h2, (await homes()).map((one) => one.url).join(' | '))
  if (!h2) throw new Error('no window made again')
  h2.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message))
  await h2.waitForFunction(() => !!window.haligtreeArrival?.frames?.length, null, { timeout: 20000 })
  const up = await homes()
  check('the old window has gone: one main window, see-through, standing clear', up.length === 1 && up[0].url.includes('again=1') && (await electron.evaluate(() => globalThis.haligtreeArrival())).made === true && (await electron.evaluate(() => globalThis.haligtreeArrival())).clear === true, JSON.stringify(up))
  console.log(`the mist's first frame ${Date.now() - asked} ms after the ask (${load()})`)
  if (ESC) {
    await h2.waitForTimeout(2500)
    await h2.keyboard.press('Escape')
    const pressed = Date.now()
    await h2.waitForFunction(() => window.haligtreeArrival?.landed, null, { timeout: 8000, polling: 50 }).catch(() => undefined)
    const took = Date.now() - pressed
    check('Esc mid-way: the mist draws in to the window at once (within 1.5 s)', took < 1500, `${took} ms (${load()})`)
  } else await h2.waitForFunction(() => window.haligtreeArrival?.landed, null, { timeout: 45000, polling: 250 })
  const frames = await h2.evaluate(() => window.haligtreeArrival.frames)
  check('out of the desktop: nothing of the page drawn at first, the page whole at the end', frames[0][2] === 0 && frames.at(-1)[2] === 1, `${frames.length} frames; first ${JSON.stringify(frames[0])}, last ${JSON.stringify(frames.at(-1))}`)
  let rose = true
  for (let i = 1; i < frames.length; i++) if (frames[i][2] === 0 && frames[i][1] < frames[i - 1][1] - 0.001) rose = false
  check('the mist only grows until it draws in', rose)
  await h2.waitForTimeout(400)
  check('landed: the window is a window again (its shadow and buttons back)', (await electron.evaluate(() => globalThis.haligtreeArrival())).clear === false)
  // The welcome over: skipped to its end, then started without the tour.
  await h2.waitForSelector('footer [data-skip]', { timeout: 30000 })
  await h2.waitForTimeout(ESC ? 600 : 300)
  await h2.click('footer [data-skip]')
  await h2.waitForTimeout(900)
  await h2.click('footer [data-skip]')
  await h2.waitForSelector('.mf-welcome', { state: 'detached', timeout: 15000 })
  await h2.waitForTimeout(1500)
  const after = await read(h2)
  const now = (await homes())[0]
  console.log(`after: ${JSON.stringify({ ...after, bounds: now?.bounds })}`)
  check('the same tabs, the same one on show', JSON.stringify(after.tabs) === JSON.stringify(before.tabs), JSON.stringify({ before: before.tabs, after: after.tabs }))
  check('the note at the same place: the same block at the top, within 8 px', !!after.block && after.block.index === before.block.index && Math.abs(after.block.at - before.block.at) <= 8, JSON.stringify({ before: before.block, after: after.block }))
  check('the window back where it stood, within 1 px', !!now && ['x', 'y', 'width', 'height'].every((key) => Math.abs(now.bounds[key] - bounds[key]) <= 1), JSON.stringify({ before: bounds, after: now?.bounds }))
  // The other tab: the list where it was scrolled to.
  await h2.click(`[data-tab="${before.tabs[0].key}"] [role="tab"]`)
  await h2.waitForTimeout(1500)
  const list = await read(h2)
  check('the list in the other tab at the same scroll, within 2 px', list.list !== null && Math.abs(list.list - listAt) <= 2, `before ${listAt}, after ${list.list} (of ${list.listTall})`)
  check('no page errors', errors.length === 0, errors.join(' | '))
} finally {
  await close()
}
done()
