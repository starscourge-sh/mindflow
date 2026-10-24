// One writing surface everywhere (b23 wave 1), in the sandbox: a queued note
// read locked keeps its meta line and offers Gem on a selection; unlocked, the
// meta line stays in the same place, the property strip shows, a #tag typed in
// the words shows in the meta line at once, and the slash menu stays on its
// line while the page scrolls. A page opened in a new window shows its words.
//
//   npx electron-vite build --outDir out-w1
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-w1/main/index.js HALIGTREE_QA_AWAY=1 node qa/b23-wave1.mjs
import { sandbox } from './sandbox-lib.mjs'
import { checks } from './harness.mjs'

const c = await sandbox({ width: 1300, height: 760 })
const { h, v, electron } = c
const { check, done } = checks()
const wait = (ms = 400) => h.waitForTimeout(ms)
await v('settings:set', { safeMode: false, hintRate: 0, rotCount: 0, motion: false })
const reading = h.locator('[role="dialog"][aria-label="Reading"]')
const metaTop = () => reading.locator('[data-read-meta]').first().evaluate((el) => Math.round(el.getBoundingClientRect().top)).catch(() => null)

try {
  for (const row of (await v('queue')).queue) await v('queue:remove', row.id)
  // A long gem, so the page scrolls; tagged #book.
  const lines = Array.from({ length: 40 }, (_, i) => ({ type: 'paragraph', content: [{ type: 'text', text: `Line ${i + 1} of a long page about memory and reading.` }] }))
  const gems = (await v('items', 'nugget')).filter((one) => !one.archivedAt)
  const gem = gems.find((one) => JSON.stringify(one.body ?? '').length > 40) ?? gems[0]
  await v('item:save', gem.id, { body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Short lead line #book' }] }, ...lines] } })
  await v('queue:add', [gem.id], false)
  await h.evaluate(() => localStorage.setItem('readExitTold', '9'))
  await h.evaluate(() => window.dispatchEvent(new CustomEvent('haligtree:queue-read', { detail: { start: 0 } })))
  await wait(1400)
  check('reading opens', (await reading.count()) === 1)
  await wait(1200)
  const lockedTop = await metaTop()
  const lockedText = await reading.locator('[data-read-meta]').first().innerText().catch(() => '')
  check('locked: meta line shows with its tag', lockedTop !== null && /#book/.test(lockedText), lockedText)

  // Locked: words selected offer Gem and Capture, nothing to format.
  await h.evaluate(() => {
    const p = document.querySelectorAll('[role="dialog"][aria-label="Reading"] .ProseMirror > p')[3]
    const range = document.createRange()
    range.selectNodeContents(p)
    const sel = window.getSelection()
    sel.removeAllRanges()
    sel.addRange(range)
  })
  await h.mouse.move(600, 400)
  await wait(700)
  check('locked: a selection offers Gem', (await h.locator('button[aria-label="Gem"]:visible').count()) > 0)
  check('locked: and no formatting', (await h.locator('[aria-label="Move to a new page"]:visible').count()) === 0)
  await h.evaluate(() => window.getSelection()?.removeAllRanges())

  await h.keyboard.press('Meta+l')
  await wait(900)
  check('unlocked', (await reading.locator('[data-read-lock]').getAttribute('data-read-lock')) === 'open')
  const openTop = await metaTop()
  check('unlocked: the meta line stays in the same place', openTop !== null && Math.abs(openTop - lockedTop) <= 4, `${lockedTop} -> ${openTop}`)
  check('unlocked: the property strip shows', (await reading.locator('.mf-property-strip *').count()) > 0)

  // A tag typed in the words shows in the meta line.
  await h.keyboard.type(' #zqnew ')
  await wait(800)
  const after = await reading.locator('[data-read-meta]').first().innerText().catch(() => '')
  check('a tag typed in shows in the meta line', /#zqnew/.test(after), after)

  // The slash menu on its line while the page scrolls.
  await h.keyboard.press('Enter')
  await h.keyboard.type('/')
  await wait(700)
  const popup = h.locator('.tiptap-suggestion-popup').first()
  check('slash menu opens', (await popup.count()) === 1)
  const gap = () => h.evaluate(() => {
    const pop = document.querySelector('.tiptap-suggestion-popup')
    const sel = window.getSelection()
    if (!pop || !sel?.rangeCount) return null
    const caret = sel.getRangeAt(0).getBoundingClientRect()
    return Math.round(pop.getBoundingClientRect().top - caret.bottom)
  })
  const before = await gap()
  const caretY = () => h.evaluate(() => Math.round(window.getSelection().getRangeAt(0).getBoundingClientRect().top))
  const y0 = await caretY()
  // The reading page's own scroll, the way the wheel moves it.
  await h.evaluate(() => {
    let el = document.querySelector('[role="dialog"][aria-label="Reading"] .ProseMirror')
    while (el && !(el.scrollHeight > el.clientHeight + 20 && /auto|scroll/.test(getComputedStyle(el).overflowY))) el = el.parentElement
    el?.scrollBy(0, -160)
    el?.dispatchEvent(new Event('scroll'))
  })
  await wait(500)
  const moved = await gap()
  const open = await popup.count()
  const y1 = await caretY()
  check('the page did scroll', Math.abs(y1 - y0) > 40, `${y0} -> ${y1}`)
  check('slash menu stays on the caret line, or closes, while the page scrolls', open === 0 || (before !== null && moved !== null && Math.abs(moved - before) <= 3), `gap ${before} -> ${moved}, open ${open}`)
  // Scrolled until its line is out of sight: the menu goes, rather than hang at the edge (the user's ask, after 15).
  await h.evaluate(() => {
    let el = document.querySelector('[role="dialog"][aria-label="Reading"] .ProseMirror')
    while (el && !(el.scrollHeight > el.clientHeight + 20 && /auto|scroll/.test(getComputedStyle(el).overflowY))) el = el.parentElement
    el?.scrollBy(0, 4000)
    el?.dispatchEvent(new Event('scroll'))
  })
  await wait(500)
  check('slash menu closes once its line has scrolled out of sight', (await popup.count()) === 0, String(await popup.count()))
  // Back, and the menu again for what follows.
  await h.evaluate(() => {
    let el = document.querySelector('[role="dialog"][aria-label="Reading"] .ProseMirror')
    while (el && !(el.scrollHeight > el.clientHeight + 20 && /auto|scroll/.test(getComputedStyle(el).overflowY))) el = el.parentElement
    el?.scrollBy(0, -4000)
  })
  await wait(300)
  await h.keyboard.type('/'); await wait(600)
  // The block's picture beside the menu goes with the menu, level with its row (img302: it was left behind).
  await h.keyboard.press('ArrowDown')
  await wait(900)
  const besideAt = () => h.evaluate(() => {
    const peek = document.querySelector('[data-slash-peek]')
    const menu = document.querySelector('.tiptap-slash-menu')
    if (!peek || !menu) return null
    const a = peek.getBoundingClientRect(); const b = menu.getBoundingClientRect()
    return { dx: Math.round(Math.min(Math.abs(a.left - b.right), Math.abs(a.right - b.left))), inside: a.top >= b.top - 12 && a.top <= b.bottom }
  })
  const peek0 = await besideAt()
  await h.evaluate(() => {
    let el = document.querySelector('[role="dialog"][aria-label="Reading"] .ProseMirror')
    while (el && !(el.scrollHeight > el.clientHeight + 20 && /auto|scroll/.test(getComputedStyle(el).overflowY))) el = el.parentElement
    el?.scrollBy(0, 120)
  })
  await wait(600)
  const peek1 = await besideAt()
  // The menu's own list scrolled by the wheel, its chosen row out of sight (img302).
  await h.evaluate(() => {
    let el = document.querySelector('.tiptap-slash-menu [data-selected], .tiptap-slash-menu [aria-selected="true"]') ?? document.querySelector('.tiptap-slash-menu')
    while (el && !(el.scrollHeight > el.clientHeight + 20)) el = el.parentElement
    el?.scrollBy(0, 400)
  })
  await wait(600)
  const peek2 = await besideAt()
  check('the block picture stays by the menu when its list scrolls', peek2 === null || peek2.inside, JSON.stringify(peek2))
  check('the block picture stays beside the menu after a scroll', peek1 === null || (peek1.dx <= 10 && peek1.inside), `${JSON.stringify(peek0)} -> ${JSON.stringify(peek1)}`)
  await h.keyboard.press('Escape')
  await wait(300)
  await h.keyboard.press('Escape')
  await wait(700)

  // Motion on, as people have it: the window grows from the row to its size.
  await v('settings:set', { motion: true })
  // From Pages, as a person does: the row menu's "Open in…", "Open in a new window", on the page open beside the list.
  await c.go('articles')
  await wait(1200)
  const row = h.locator('[data-pane] [data-row][data-id]').nth(1)
  const rowId = await row.getAttribute('data-id')
  await row.click()
  await wait(1200)
  await row.click({ button: 'right' })
  await wait(500)
  await h.getByRole('menuitem', { name: /Open in…/ }).hover()
  await wait(500)
  await h.getByRole('menuitem', { name: /Open in a new window/ }).click()
  let mine = null
  for (let i = 0; i < 30 && !mine; i++) {
    mine = electron.windows().find((w) => decodeURIComponent(w.url()).includes('note=') && decodeURIComponent(w.url()).includes(rowId)) ?? null
    if (!mine) await wait(200)
  }
  check('row menu: the window opens', !!mine, rowId)
  if (mine) {
    await mine.waitForTimeout(2500)
    const bounds = await electron.evaluate(({ BrowserWindow }, id) => BrowserWindow.getAllWindows().find((w) => decodeURIComponent(w.webContents.getURL()).includes(id))?.getBounds(), rowId)
    check('row menu: the window grew to its full size', bounds && bounds.width >= 600 && bounds.height >= 500, JSON.stringify(bounds))
    const seen = await mine.evaluate(() => ({ words: document.querySelector('.ProseMirror')?.textContent?.trim().length ?? -1, title: document.querySelector('h1, [data-note-title], .mf-title')?.textContent ?? '' }))
    check('row menu: the window shows the page', seen.words > 0, JSON.stringify(seen))
    await mine.screenshot({ path: '/private/tmp/claude-501/-Users-starscourge-Documents-forge-mindflow/703b99ba-c755-40e3-a385-896560d19061/scratchpad/w1-window.png' }).catch(() => {})
    await mine.close().catch(() => {})
  }

  // A page opened in a new window shows its words, for a page and a capture.
  const pages = (await v('items', 'article')).filter((one) => !one.archivedAt)
  const capture = (await h.evaluate(() => window.api.captures.list?.() ?? null))?.[0]
  for (const [type, id, label] of [['article', pages[0]?.id, 'page'], ...(capture ? [['capture', capture.id, 'capture']] : [])]) {
    if (!id) continue
    await v('notes:window', type, id, null, null)
    let win = null
    for (let i = 0; i < 30 && !win; i++) {
      win = electron.windows().find((w) => decodeURIComponent(w.url()).includes('note=') && decodeURIComponent(w.url()).includes(id)) ?? null
      if (!win) await wait(200)
    }
    check(`${label}: its window opens`, !!win, electron.windows().map((w) => w.url()).join(' '))
    if (!win) continue
    await win.waitForTimeout(2000)
    const words = await win.evaluate(() => document.querySelector('.ProseMirror')?.textContent?.trim().length ?? -1)
    check(`${label}: its window shows the words`, words > 0, `${words} letters`)
    await win.close().catch(() => {})
  }
} finally {
  await c.close()
  done()
}
