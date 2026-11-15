// “Show the welcome again” from an ordinary run plays the arrival as a scene over the whole screen (main: makeScene),
// in the same window, nothing made again in its place, and under the welcome the app is as it was left. Two tabs: a
// list scrolled down in the first, a long note part-way down on show in the second, words just typed in it. Once the
// welcome is over (its window grown back from the middle of the screen): the same tabs, the same one on show, the note
// at the same block with the words in it, the list at the same scroll, the window back where it stood, one main window.
// `esc`: Esc a little way into the arrival goes straight to the first page, with the same result.
// On a copy of the main book (its notes are long enough to scroll):
//   QA_DATA=<book copy> QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/welcome-replay-arrival.mjs [esc|away]
import { DatabaseSync } from 'node:sqlite'
import { readFileSync } from 'fs'
import { loadavg } from 'os'
import { join } from 'path'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'

// The arrival is allowed in this test run, for the replay only: the window is first made as on any ordinary launch.
process.env.HALIGTREE_QA_ARRIVAL = 'again'
process.env.HALIGTREE_QA_VIRTUAL ??= '1'
const ESC = process.argv[2] === 'esc' || process.env.QA_WAY === 'esc'
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
  // The page's own list, inside the front pane's page card: never the sidebar, which with one pane (no front pane to
  // look in) was the tallest box in the window while the Inbox was still being read, so it was the one scrolled.
  const card = document.querySelector('[data-pane-front] [data-pane-card]') ?? document.querySelector('[data-pane-card]')
  const lists = [...(card?.querySelectorAll('*') ?? [])].filter((one) => !one.closest('.haligtree-editor-content, [data-page-held]') && /auto|scroll/.test(getComputedStyle(one).overflowY) && one.scrollHeight > one.clientHeight + 40)
  const list = lists.sort((a, b) => b.scrollHeight - a.scrollHeight)[0]
  return { tabs, block, list: list ? Math.round(list.scrollTop) : null, listTall: list?.scrollHeight ?? 0, rows: list ? [...list.querySelectorAll('[data-pick], [data-row]')].filter((one) => !one.parentElement.closest('[data-pick], [data-row]')).map((one) => one.textContent.trim().slice(0, 28)) : [] }
})
const scrollList = async (page, by) => {
  // Once the Inbox's list is drawn and long enough: the page being left stays on show while it reads (page-swap.tsx).
  // The Inbox lists its last few days, so it may hold less than the 900 asked for: as far down as it goes, then.
  await page.waitForFunction(() => [...((document.querySelector('[data-pane-front] [data-pane-card]') ?? document.querySelector('[data-pane-card]'))?.querySelectorAll('[data-page="inbox"] *') ?? [])].some((one) => !one.closest('[data-page-held]') && /auto|scroll/.test(getComputedStyle(one).overflowY) && one.scrollHeight - one.clientHeight > 100), null, { timeout: 30000 }).catch(() => {})
  return page.evaluate((by) => {
    const card = document.querySelector('[data-pane-front] [data-pane-card]') ?? document.querySelector('[data-pane-card]')
    const list = [...(card?.querySelectorAll('*') ?? [])].filter((one) => !one.closest('.haligtree-editor-content, [data-page-held]') && /auto|scroll/.test(getComputedStyle(one).overflowY) && one.scrollHeight > one.clientHeight + 40).sort((a, b) => b.scrollHeight - a.scrollHeight)[0]
    list?.scrollTo({ top: by, behavior: 'instant' })
    return list ? [list.scrollTop, list.scrollHeight, [...list.querySelectorAll('[data-pick], [data-row]')].filter((one) => !one.parentElement.closest('[data-pick], [data-row]')).map((one) => one.textContent.trim().slice(0, 28))] : [null, 0, []]
  }, by)
}
const homes = () => electron.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().filter((one) => !one.isDestroyed() && one.webContents.getURL().includes('view=home')).map((one) => ({ url: one.webContents.getURL().replace(/^.*\?/, ''), bounds: one.getBounds(), shown: one.isVisible() })))

try {
  console.log(`build ${process.env.QA_ENTRY.split('/').slice(-3, -2)}; note ${note?.id}; ${ESC ? 'Esc mid-way' : 'played through'} (${load()})`)
  await electron.context().addInitScript(() => { document.hasFocus = () => true })
  const h = c.h
  await h.evaluate(() => window.api.haligtree('onboarding:set', { welcomed: new Date().toISOString(), newsSeen: true, welcoming: false, pageHints: false }))
  await h.evaluate(() => window.api.haligtree('settings:set', { hintRate: 0 }))
  // The first tab: the Inbox, scrolled down.
  await c.go('inbox')
  await h.waitForTimeout(1200)
  // Where it was scrolled, and how tall the list was: the same scroll in another list (the Inbox's older captures, put
  // in its place by a note opened in the other tab) is not the same place.
  const [listAt, listTallAt, listRows] = await scrollList(h, 900)
  await h.waitForTimeout(500)
  // The second tab: the long note, part-way down.
  await h.click('[data-tab-add]')
  // The new tab on show before the note is sent to it: sent while the page was still busy with the click, the note
  // opened in a tab of its own beside the new one, three tabs where the set-up asks for two.
  await h.waitForFunction(() => { const tabs = document.querySelectorAll('[data-tab]'); return tabs.length === 2 && tabs[1].hasAttribute('data-tab-on') }, null, { timeout: 15000 }).catch(() => {})
  await c.send('capture', note.id)
  await h.waitForFunction(() => !!document.querySelector('.haligtree-editor-content'), null, { timeout: 30000 })
  await h.waitForTimeout(1500)
  await h.evaluate(() => { const box = [...document.querySelectorAll('.haligtree-editor-content')].find((one) => one.getClientRects().length); box?.scrollTo({ top: box.scrollHeight * 0.3, behavior: 'instant' }) })
  await h.waitForTimeout(1200)
  // Words typed a moment before the ask, still waiting to be saved (the editor saves 500 ms after the last key): a line
  // on screen, pressed in its words, to its end (in Vim's insert mode, if Vim is on in this book), typed into.
  const end = await h.evaluate(() => {
    const box = [...document.querySelectorAll('.haligtree-editor-content')].find((one) => one.getClientRects().length)
    const edge = box.getBoundingClientRect()
    // Words on screen, well inside it: the first point down the note's column that lands in its text.
    const column = box.querySelector('.ProseMirror').getBoundingClientRect()
    for (let y = edge.top + 120; y < edge.bottom - 120; y += 24) {
      const x = column.left + Math.min(160, column.width / 3)
      const at = document.caretRangeFromPoint(x, y)
      const text = at?.startContainer
      if (text?.nodeType === Node.TEXT_NODE && text.textContent.trim().length > 3 && text.parentElement?.closest('.ProseMirror') && !text.parentElement.closest('a, code, [contenteditable="false"]')) return { x: Math.round(x), y: Math.round(y) }
    }
    return null
  })
  const TYPED = ` kept${Date.now() % 100000}`
  if (end) {
    await h.mouse.click(end.x, end.y)
    if (await h.locator('.ProseMirror[data-vim-mode="normal"]').count()) await h.keyboard.press('i')
    await h.keyboard.press('End')
    await h.keyboard.type(TYPED, { delay: 15 })
  }
  // Where things stand as the ask comes, the words just typed among them.
  const before = await read(h)
  const typedIn = await h.evaluate((typed) => [...document.querySelectorAll('.haligtree-editor-content .ProseMirror')].some((one) => one.textContent.includes(typed.trim())), TYPED)
  const bounds = (await homes())[0]?.bounds
  console.log(`before: ${JSON.stringify({ ...before, listAt, bounds, typedIn })}`)
  check('set up: two tabs, the note on show part-way down with words just typed in it, the list scrolled', before.tabs.length === 2 && before.tabs[1].on && before.block?.top > 300 && listAt > 100 && typedIn, JSON.stringify({ tabs: before.tabs.length, block: before.block, listAt, typedIn }))
  // "Show the welcome again" from the Haligtree menu, as a person picks it.
  await electron.evaluate(({ Menu }) => {
    const find = (items) => { for (const one of items) { if (one.label === 'Show the welcome again') return one; const inner = one.submenu && find(one.submenu.items); if (inner) return inner } }
    find(Menu.getApplicationMenu().items)?.click()
  })
  let scene = null
  for (let i = 0; i < 60 && !scene; i++) (scene = electron.windows().find((one) => one.url().includes('view=scene')) ?? null) || (await wait(50))
  check('a scene window comes over the screen for it', !!scene)
  const h2 = h
  check('no window is made in its place: one main window throughout, the same page', (await homes()).length === 1 && !(await homes())[0].url.includes('again'), JSON.stringify(await homes()))
  if (ESC) {
    await wait(2500)
    await scene?.keyboard.press('Escape')
    const pressed = Date.now()
    await h2.waitForSelector('[data-thesis]', { timeout: 4000 }).catch(() => undefined)
    const took = Date.now() - pressed
    check('Esc mid-way: straight to the first page in the welcome\'s window (within 1.5 s)', took < 1500, `${took} ms (${load()})`)
  } else await h2.waitForSelector('[data-thesis]', { timeout: 30000 })
  // One arrival, one chord: the welcome opened once (in a dev build too, where StrictMode mounts twice).
  const chords = await h2.evaluate(() => (window.haligtreeHeard ?? []).filter((one) => one === 'cue:ambience').length)
  check('the arrival\'s chord plays once', chords === 1, `${chords} times`)
  // The welcome over: skipped to its end, then started without the tour.
  await h2.waitForSelector('footer [data-skip]', { timeout: 30000 })
  await h2.waitForTimeout(ESC ? 600 : 300)
  await h2.click('footer [data-skip]')
  await h2.waitForTimeout(900)
  await h2.click('footer [data-skip]')
  await h2.waitForSelector('.mf-welcome', { state: 'detached', timeout: 15000 })
  await h2.waitForTimeout(2500)
  const after = await read(h2)
  const now = (await homes())[0]
  console.log(`after: ${JSON.stringify({ ...after, bounds: now?.bounds })}`)
  check('the same tabs, the same one on show', JSON.stringify(after.tabs) === JSON.stringify(before.tabs), JSON.stringify({ before: before.tabs, after: after.tabs }))
  check('the note at the same place: the same block at the top, within 8 px', !!after.block && after.block.index === before.block.index && Math.abs(after.block.at - before.block.at) <= 8, JSON.stringify({ before: before.block, after: after.block }))
  check('the words typed just before the ask were saved, and are in the note', !!end && await h2.evaluate((typed) => [...document.querySelectorAll('.haligtree-editor-content .ProseMirror')].some((one) => one.textContent.includes(typed.trim())), TYPED), `${TYPED.trim()}${end ? '' : ' (no line on screen to type into)'}`)
  check('the window back where it stood, within 1 px', !!now && ['x', 'y', 'width', 'height'].every((key) => Math.abs(now.bounds[key] - bounds[key]) <= 1), JSON.stringify({ before: bounds, after: now?.bounds }))
  // The other tab: the list where it was scrolled to.
  await h2.click(`[data-tab="${before.tabs[0].key}"] [role="tab"]`)
  await h2.waitForTimeout(1500)
  const list = await read(h2)
  // Its rows are named when it fails: the note typed into joins the Inbox's recent rows once edited (15 Nov: 760 then 818,
  // the one new row the note just written in).
  const gone = listRows.filter((one) => !list.rows.includes(one))
  const joined = list.rows.filter((one) => !listRows.includes(one))
  check('the list in the other tab at the same scroll, within 2 px, the same list (its height within 40 px)', list.list !== null && Math.abs(list.list - listAt) <= 2 && Math.abs(list.listTall - listTallAt) <= 40, `before ${listAt} (of ${listTallAt}), after ${list.list} (of ${list.listTall}); rows gone ${JSON.stringify(gone)}, rows new ${JSON.stringify(joined)}`)
  check('no page errors', errors.length === 0, errors.join(' | '))
} finally {
  await close()
}
done()
