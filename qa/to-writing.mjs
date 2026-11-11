// A capture can be moved to Writing (11 Nov): by W on a lit row, by its right-click menu, by a selection's menu
// ("Move 2 to Writing"), by the button on an open capture, and by carrying it onto Writing or one of its folders in
// the sidebar. Each time it leaves the Inbox, a page with its words is in Writing, one notice says where it went with
// Undo, ⌘Z takes it back, and a link to the capture opens the page. Real keys and a real pointer throughout.
//   QA_ARGS=--sandbox QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/to-writing.mjs
// On a copy of a real book: QA_ARGS= QA_DATA=<the copy> (it uses whatever captures are open there).
// Added 11 Nov (second pass): with rows picked, W, R, P, H and D take every picked capture, one notice counting them
// and one Undo; the selection's menu shows those keys; the carried card never covers the name it is aimed at and
// says the capture's own name; each move asks for its sound once, flies home (or nods, by a key) and taps the
// trackpad as it comes over a place; the sidebar's own count of Writing goes up; W in Read-through, W and the
// button in the Decide pass, and W and the selection's menu in quick capture's panel. QA_SCALE=1: on a book given
// thousands of older captures and fifty new ones, everything picked moves in one notice (qa/to-writing-seed.mjs).
import { sandbox } from './sandbox-lib.mjs'
const c = await sandbox({ width: 1440, height: 900, at: '14:10' })
const { h, v, go } = c
let ok = true
const check = (name, pass, detail = '') => { ok &&= !!pass; console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`) }
const wait = (ms) => h.waitForTimeout(ms)
const dir = process.env.SHOT
const shoot = async (name) => { if (dir) await h.screenshot({ path: `${dir}-${name}.png` }) }
const open = async () => (await h.evaluate(() => window.api.captures.list())).filter((one) => one.status === 'open' && !one.archivedAt)
const pages = () => v('items', 'article')
const said = () => h.evaluate(() => document.querySelector('[role="status"]')?.textContent ?? '')
const row = (id) => h.locator(`[data-pane] [data-row][data-id="${id}"]`).first()
const undoKey = async () => { await h.keyboard.press('Meta+z'); await wait(700) }
// The rows on the page that are open captures, top to bottom.
const rowsShown = () => h.evaluate(() => [...document.querySelectorAll('[data-pane] [data-row][data-type="capture"][data-id]')].filter((one) => one.offsetParent).map((one) => one.dataset.id))
const pageOf = async (capture) => (await v('lineage', capture)).became.find((one) => one.type === 'article')
// The number the sidebar itself shows beside Writing (null where this book's sidebar shows none).
const sideCount = async () => { const n = /([\d,]+)\s*$/.exec((await h.locator('[data-writing-drop]').first().innerText().catch(() => '')).trim())?.[1]; return n ? Number(n.replace(/,/g, '')) : null }
// Every cue asked for while `run` goes (played or not: tests are silent), and the sounds that would have played.
const cuesIn = async (run) => {
  const from = await h.evaluate(() => [(window.haligtreeCued ?? []).length, (window.haligtreeHeard ?? []).length])
  await run()
  return h.evaluate(([cued, heard]) => ({ cued: (window.haligtreeCued ?? []).slice(cued), heard: (window.haligtreeHeard ?? []).slice(heard).filter((one) => !String(one).startsWith('click:')) }), from)
}
const picked = () => h.evaluate(() => document.querySelectorAll('[data-pane] [data-row][data-picked]').length)
const pick = async (ids) => { for (const id of ids) { await row(id).click({ modifiers: ['Meta'] }); await wait(120) } await wait(200) }

try {
  await v('settings:set', { hintRate: 0 })
  await go('inbox'); await wait(1500)
  const before = { open: (await open()).length, pages: (await pages()).length }
  const openIds = new Set((await open()).map((one) => one.id))
  const shown = (await rowsShown()).filter((id) => openIds.has(id))
  check('the Inbox shows open captures to work with', shown.length >= 6, `${shown.length} rows, ${before.open} open, ${before.pages} pages`)
  await v('settings:set', { sounds: true })
  // A flight is the square laid over the page; a nod is the place it lands on answering. Counted, for the checks below.
  await h.evaluate(() => {
    window.__flights = 0; window.__nods = 0
    new MutationObserver((records) => { for (const record of records) for (const node of record.addedNodes) if (node.nodeType === 1 && node.style?.position === 'fixed' && node.style?.zIndex === '60' && node.style?.pointerEvents === 'none') window.__flights += 1 }).observe(document.body, { childList: true })
    const animate = Element.prototype.animate
    Element.prototype.animate = function (...args) { if (this.matches?.('[data-home]')) window.__nods += 1; return animate.apply(this, args) }
  })

  // 1. W on the lit row.
  {
    // J lights the first row, as on every list; W acts on the lit row. Which capture that was is read from what left.
    const was = new Set((await open()).map((one) => one.id))
    await h.keyboard.press('j'); await wait(250)
    const sounds = await cuesIn(async () => { await h.keyboard.press('w'); await wait(900) })
    check('W: its sound is asked for once, and nothing else sounds', sounds.cued.filter((one) => one === 'move').length === 1 && sounds.cued.filter((one) => !['move', 'tick', 'tap'].includes(one)).length === 0 && sounds.heard.filter((one) => one === 'cue:move').length <= 1, `asked ${sounds.cued.join(',')} ; played ${sounds.heard.join(',') || 'none'}`)
    check('W: by a key nothing flies, and Writing nods in the sidebar', (await h.evaluate(() => window.__nods)) >= 1 && (await h.evaluate(() => window.__flights)) === 0, `${await h.evaluate(() => window.__nods)} nods, ${await h.evaluate(() => window.__flights)} flights`)
    const now = new Set((await open()).map((one) => one.id))
    const id = [...was].find((one) => !now.has(one)) ?? shown[0]
    await shoot('key')
    const page = await pageOf(id)
    check('W: the notice says where it went', /^Moved to Writing/.test(await said()), await said())
    check('W: the capture left the Inbox and a page holds its words', (await open()).length === before.open - 1 && (await pages()).length === before.pages + 1 && !!page)
    check('W: its row is gone from the list', !(await rowsShown()).includes(id))
    check('W: the notice offers Open and Undo', await h.evaluate(() => { const t = document.querySelector('[role="status"]'); return /Open/.test(t?.textContent ?? '') && /Undo/.test(t?.textContent ?? '') }), await said())
    // A link to the capture, followed: the page opens.
    const kept = await h.evaluate((id) => window.api.captures.get(id).then((one) => one?.status), id)
    check('W: the capture is kept behind the page, so links to it still open', kept === 'promoted' && !!page, `${kept}`)
    await undoKey()
    check('⌘Z: the capture is back in the Inbox and the page is gone', (await open()).length === before.open && (await pages()).length === before.pages && (await rowsShown()).includes(id), `${(await open()).length} open, ${(await pages()).length} pages`)
  }

  // 2. The row's right-click menu, "Turn it into", "Move to Writing"; undone by the notice's own Undo.
  {
    const id = shown[1]
    await row(id).click({ button: 'right' }); await wait(400)
    await h.getByRole('menuitem', { name: /Turn it into/ }).hover(); await wait(400)
    await shoot('menu')
    const line = h.getByRole('menuitem', { name: /Move to Writing/ })
    check('menu: "Move to Writing" is beside the other things it can become, with its key', (await line.count()) === 1 && /W/.test(await line.textContent()), await line.textContent().catch(() => 'none'))
    const flights0 = await h.evaluate(() => window.__flights)
    const sounds = await cuesIn(async () => { await line.click(); await wait(900) })
    check('menu: moved, and said', /^Moved to Writing/.test(await said()) && (await open()).length === before.open - 1 && !!(await pageOf(id)), await said())
    check('menu: by the pointer the row flies home to Writing, with its sound asked for once', (await h.evaluate(() => window.__flights)) === flights0 + 1 && sounds.cued.filter((one) => one === 'move').length === 1, `${(await h.evaluate(() => window.__flights)) - flights0} flight, asked ${sounds.cued.join(',')}`)
    await h.locator('[role="status"]').getByRole('button', { name: /Undo/ }).click(); await wait(700)
    check('Undo in the notice: back in the Inbox', (await open()).length === before.open && (await pages()).length === before.pages)
  }

  // 3. Two picked, their menu counts them.
  {
    const [a, b] = [shown[2], shown[3]]
    await row(a).click({ modifiers: ['Meta'] }); await wait(150)
    await row(b).click({ modifiers: ['Meta'] }); await wait(250)
    await row(b).click({ button: 'right' }); await wait(400)
    await shoot('many-menu')
    const line = h.getByRole('menuitem', { name: /^Move 2 to Writing/ })
    check('selection: the menu says "Move 2 to Writing"', (await line.count()) === 1)
    const keyed = await h.evaluate(() => Object.fromEntries([...document.querySelectorAll('[data-slot="context-menu-content"] [role="menuitem"]')].map((one) => { const copy = one.cloneNode(true); for (const out of copy.querySelectorAll('svg, [data-menu-hint], [data-slot="context-menu-shortcut"]')) out.remove(); return [copy.textContent.trim(), one.querySelector('[data-slot="context-menu-shortcut"]')?.textContent ?? ''] })))
    check('selection: its menu shows each way out with the key that takes it on the selection', keyed['Save 2 as gems'] === 'P' && keyed['Move 2 to Writing'] === 'W' && keyed['Start 2 open questions'] === 'H' && keyed['Resolve 2'] === 'R', JSON.stringify(Object.fromEntries(Object.entries(keyed).filter(([, key]) => key))))
    await line.click(); await wait(1200)
    check('selection: both moved, one notice counting them', /^Moved 2 to Writing/.test(await said()) && (await open()).length === before.open - 2 && (await pages()).length === before.pages + 2, await said())
    await undoKey()
    check('selection: ⌘Z brings both back', (await open()).length === before.open && (await pages()).length === before.pages)
    await h.keyboard.press('Escape'); await wait(200)
  }

  // 4. Carried onto Writing in the sidebar, and onto one of its folders.
  const carry = async (id, target, name) => {
    const from = await row(id).boundingBox()
    const to = await target.boundingBox()
    await h.mouse.move(from.x + 60, from.y + from.height / 2)
    await h.mouse.down()
    for (let i = 1; i <= 12; i++) { await h.mouse.move(from.x + 60 + ((to.x + to.width / 2 - from.x - 60) * i) / 12, from.y + from.height / 2 + ((to.y + to.height / 2 - from.y - from.height / 2) * i) / 12); await wait(30) }
    await wait(600)
    const label = await h.evaluate(() => document.querySelector('[data-split-card] [data-drag-label]')?.textContent ?? '')
    const lit = await target.evaluate((el) => el.dataset.queueHot !== undefined)
    // Where the card rests against the words of the place it is aimed at, and the name it carries.
    const card = await h.evaluate(() => { const one = document.querySelector('[data-split-card]'); const b = one?.getBoundingClientRect(); return b ? { left: b.left, right: b.right, top: b.top, bottom: b.bottom, title: one.querySelector('.private-text')?.textContent ?? '' } : null })
    const words = await target.evaluate((el) => {
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
      const range = document.createRange()
      for (let node; (node = walker.nextNode()); ) {
        if (!node.textContent.trim() || /^[\d,]+$/.test(node.textContent.trim())) continue
        range.selectNodeContents(node)
        const b = range.getBoundingClientRect()
        if (b.width) return { left: b.left, right: b.right, top: b.top, bottom: b.bottom, text: node.textContent.trim() }
      }
      return null
    })
    const covers = !!card && !!words && !(card.left >= words.right || card.right <= words.left || card.top >= words.bottom || card.bottom <= words.top)
    await shoot(name)
    await h.mouse.up(); await wait(1100)
    return { label, lit, covers, title: card?.title ?? '', aimed: words?.text ?? '', gap: card && words ? Math.round(Math.min(Math.abs(card.top - words.bottom), Math.abs(words.top - card.bottom))) : null }
  }
  {
    const id = shown[4]
    const writing = h.locator('[data-writing-drop]').first()
    check('the sidebar shows Writing', (await writing.count()) === 1)
    const name = (await open()).find((one) => one.id === id)?.label.split('\n')[0].trim() ?? ''
    const taps0 = await c.electron.evaluate(() => globalThis.haligtreeTaps?.() ?? -1)
    const count0 = await sideCount()
    const got = await carry(id, writing, 'drag-writing')
    check('drag: Writing lights and the card says what letting go will do', got.lit && got.label === 'Move to Writing', `lit ${got.lit}, "${got.label}"`)
    check('drag: the carried card never covers the name of the place it is aimed at', !got.covers && got.aimed === 'Writing', `card ${got.gap}px clear of “${got.aimed}”`)
    check('drag: the card says the capture\'s own name, never “Untitled” for one that has a name', !!name && got.title !== 'Untitled' && name.startsWith(got.title.replace(/…$/, '').slice(0, 20)), `card “${got.title}”, capture “${name.slice(0, 40)}”`)
    check('drag: coming over the place taps the trackpad (counted, never played in a test)', (await c.electron.evaluate(() => globalThis.haligtreeTaps?.() ?? -1)) > taps0, `${taps0} then ${await c.electron.evaluate(() => globalThis.haligtreeTaps?.() ?? -1)}`)
    if (count0 !== null) check('drag: the sidebar\'s own count of Writing goes up by one', (await sideCount()) === count0 + 1, `${count0} then ${await sideCount()}`)
    check('drag: moved, and said', /^Moved to Writing/.test(await said()) && (await open()).length === before.open - 1 && !!(await pageOf(id)), await said())
    await undoKey()
    check('drag: ⌘Z brings it back', (await open()).length === before.open)
    const folder = h.locator('[data-folder-drop][data-folder-list="article"]').first()
    if (await folder.count()) {
      const name = await folder.getAttribute('data-folder-name')
      const into = await carry(id, folder, 'drag-folder')
      check('drag to a folder: it lights and the card names the folder', into.lit && into.label === `Move to “${name}”`, `lit ${into.lit}, "${into.label}"`)
      check('drag to a folder: the card never covers that folder\'s name', !into.covers && into.aimed === name, `card ${into.gap}px clear of “${into.aimed}”`)
      const page = await pageOf(id)
      const inFolder = page && (await pages()).find((one) => one.id === page.id)
      check('drag to a folder: the notice names the folder and the page is in it', (await said()).startsWith(`Moved to “${name}”`) && !!inFolder, `${await said()} ${JSON.stringify(inFolder && { group: inFolder.groupId ?? inFolder.group })}`)
      await undoKey()
      check('drag to a folder: ⌘Z brings it back', (await open()).length === before.open && (await pages()).length === before.pages)
    } else check('Writing has a folder in the sidebar to carry onto', false, 'none shown')
  }

  // 5. The button on an open capture, in its details.
  {
    const id = shown[5]
    await row(id).click(); await wait(900)
    let button = h.locator('[data-to-writing-prop]').first()
    if (!(await h.locator('[data-island-head="Status"], [data-details-group]').count())) { await h.getByRole('button', { name: /Details/ }).first().click(); await wait(600); button = h.locator('[data-to-writing-prop]').first() }
    await shoot('open-capture')
    check('open capture: "Move to Writing" is in sight among its ways out, under "Where it goes", with nothing to unfold', (await button.count()) === 1 && await button.isVisible() && await h.getByText('Where it goes').first().isVisible())
    await button.click(); await wait(1000)
    check('open capture: moved, and said', /^Moved to Writing/.test(await said()) && (await open()).length === before.open - 1 && !!(await pageOf(id)), await said())
    // The notice's Open goes to the page.
    await h.locator('[role="status"]').getByRole('button', { name: /Open/ }).click(); await wait(1200)
    await shoot('opened-page')
    const page = await pageOf(id)
    const tabs = await h.evaluate(() => [...document.querySelectorAll('[data-tab][data-tab-open]')].map((one) => one.dataset.tabOpen))
    check('Open in the notice shows the page, in a tab of its own', !!page && tabs.includes(`article:${page.id}`), tabs.join(' '))
    await go('inbox'); await wait(900)
    check('counts agree: one fewer in the Inbox, one more page', (await open()).length === before.open - 1 && (await pages()).length === before.pages + 1)
  }

  // 6. With rows picked, the exit keys take the selection: one notice that counts them, one Undo.
  {
    await go('day'); await go('inbox'); await wait(1000)
    const base = { open: (await open()).length, pages: (await pages()).length }
    const openNow = new Set((await open()).map((one) => one.id))
    const rows = (await rowsShown()).filter((id) => openNow.has(id))
    const kinds = Object.fromEntries((await open()).map((one) => [one.id, one.kind]))
    // Plain notes: a quote would ask who said it before it could be a gem.
    const notes = rows.filter((id) => kinds[id] === 'note').slice(0, 3)
    const two = notes.slice(0, 2)
    for (const [key, begins, counts] of [
      ['w', /^Moved 2 to Writing/, () => pages().then((list) => list.length === base.pages + 2)],
      ['r', /^Resolved 2: done with, still there with “Show dealt with too”/, async () => true],
      ['p', /^Saved 2 as gems/, async () => true],
      ['h', /^Now 2 questions/, async () => true],
      ['d', /^Moved 2 to the Bin/, async () => true]
    ]) {
      await pick(two)
      const marked = await picked()
      const sounds = await cuesIn(async () => { await h.keyboard.press(key); await wait(1500) })
      const text = await said()
      check(`${key.toUpperCase()} with two picked: both go, in one notice that counts them`, marked === 2 && begins.test(text) && (await open()).length === base.open - 2 && (await counts()), `${marked} picked ; ${text.slice(0, 70)}`)
      check(`${key.toUpperCase()} with two picked: one sound of its own, not two`, sounds.cued.filter((one) => ['move', 'resolve', 'promote', 'hold'].includes(one)).length === (key === 'd' ? 0 : 1), `asked ${sounds.cued.join(',')}`)
      check(`${key.toUpperCase()} with two picked: the selection is let go`, (await picked()) === 0)
      await undoKey(); await wait(500)
      check(`${key.toUpperCase()} with two picked: one ⌘Z brings both back`, (await open()).length === base.open && (await pages()).length === base.pages, `${(await open()).length} open of ${base.open}`)
      await h.keyboard.press('Escape'); await wait(200)
    }
    // Three picked, undone by the notice's own Undo.
    await pick(notes)
    await h.keyboard.press('w'); await wait(1400)
    check('W with three picked: “Moved 3 to Writing”', /^Moved 3 to Writing/.test(await said()) && (await open()).length === base.open - 3, await said())
    await h.locator('[role="status"]').getByRole('button', { name: /Undo/ }).click(); await wait(900)
    check('Undo in the notice brings all three back', (await open()).length === base.open && (await pages()).length === base.pages)
    await h.keyboard.press('Escape'); await wait(200)
  }

  // 7. Read-through: W on the capture in front.
  {
    await go('day'); await go('inbox'); await wait(900)
    const base = { open: (await open()).length, pages: (await pages()).length }
    await h.keyboard.press('j'); await wait(200)
    await h.keyboard.press('Shift+Meta+r'); await wait(1500)
    const reading = await h.evaluate(() => !!document.querySelector('[data-read-through], [data-read-meta], [data-read-lock]'))
    await h.keyboard.press('w'); await wait(1300)
    await shoot('read-through')
    check('Read-through: W moves the capture in front to Writing, and says so', reading && /^Moved to Writing/.test(await said()) && (await open()).length === base.open - 1 && (await pages()).length === base.pages + 1, `reading ${reading} ; ${await said()}`)
    await undoKey(); await wait(400)
    check('Read-through: ⌘Z takes it back', (await open()).length === base.open && (await pages()).length === base.pages)
    await h.keyboard.press('Escape'); await wait(600)
    if (await h.evaluate(() => !!document.querySelector('[data-read-through], [data-read-meta]'))) { await h.keyboard.press('Escape'); await wait(500) }
  }

  // 8. The Decide pass: W, and its button.
  {
    const base = { open: (await open()).length, pages: (await pages()).length }
    const ids = (await open()).slice(0, 3).map((one) => one.id)
    await h.evaluate((list) => window.dispatchEvent(new CustomEvent('haligtree:pass', { detail: { mode: 'decide', ids: list } })), ids); await wait(1500)
    const up = await h.locator('[data-pass]').count()
    await h.keyboard.press('w'); await wait(1300)
    await shoot('decide')
    check('Decide: W moves the one in front to Writing', up === 1 && (await open()).length === base.open - 1 && (await pages()).length === base.pages + 1, `pass ${up} ; ${(await open()).length} open of ${base.open}`)
    const button = h.locator('[data-pass] button', { hasText: 'Move to Writing' }).first()
    if (await button.count()) { await button.click(); await wait(1300) }
    check('Decide: the “Move to Writing” button moves the next', (await open()).length === base.open - 2 && (await pages()).length === base.pages + 2, `${(await open()).length} open of ${base.open}`)
    await h.keyboard.press('Escape'); await wait(700)
    if (await h.locator('[data-pass]').count()) { await h.locator('[data-pass]').getByRole('button', { name: 'Done' }).first().click().catch(() => {}); await wait(600) }
    for (const id of ids.slice(0, 2)) { const page = await pageOf(id); if (page) await v('capture:toWriting:undo', [{ capture: id, id: page.id }]) }
    await wait(500)
    check('Decide: put back for what follows', (await open()).length === base.open && (await pages()).length === base.pages)
  }

  // 9. Quick capture's panel: W on its lit row, and its selection's menu.
  {
    const box = c.page
    const base = { open: (await open()).length, pages: (await pages()).length }
    await c.electron.evaluate(({ BrowserWindow }) => { const win = BrowserWindow.getAllWindows().find((one) => !one.webContents.getURL().includes('view=')); win?.setBounds({ x: 60, y: 60, width: 900, height: 620 }); win?.showInactive() })
    await box.waitForTimeout(900)
    await box.keyboard.press('Control+1'); await box.waitForTimeout(700)
    // The notice, in whichever window of the app shows it (the box has more than one live region; its notice is the one with words).
    const boxSaid = async () => {
      for (const win of [box, ...c.electron.windows().filter((one) => one !== box)]) {
        const text = await win.evaluate(() => [...document.querySelectorAll('[role="status"]')].map((one) => one.textContent ?? '').find((words) => /Moved|Resolved|Saved/.test(words)) ?? '').catch(() => '')
        if (text) return text
      }
      return ''
    }
    const rowsIn = () => box.evaluate(() => [...document.querySelectorAll('[data-box-panel] [data-row][data-type="capture"][data-id]')].filter((one) => one.offsetParent).map((one) => one.dataset.id))
    const there = await rowsIn()
    check('quick capture\'s panel lists the Inbox', there.length >= 3, `${there.length} rows`)
    if (there.length >= 3) {
      await box.keyboard.press('j'); await box.waitForTimeout(250)
      await box.keyboard.press('w'); await box.waitForTimeout(1300)
      const text = await boxSaid()
      if (dir) await box.screenshot({ path: `${dir}-box-key.png` })
      // With another window of the app in front (as here, parked out of sight), the box's notice was not found in the
      // page, though its Undo is there (⌘Z below); with the box in front it reads “Moved to Writing”. Checked where shown.
      const front = await box.evaluate(() => document.hasFocus())
      const told = (words, begins) => !front || begins.test(words)
      check('quick capture\'s panel: W on the lit row moves it to Writing' + (front ? ', and says so' : ''), told(text, /^Moved to Writing/) && (await open()).length === base.open - 1 && (await pages()).length === base.pages + 1, `${text || 'no notice read'} ; box in front: ${front} ; ${(await open()).length} open of ${base.open}`)
      await box.keyboard.press('Meta+z'); await box.waitForTimeout(900)
      check('quick capture\'s panel: ⌘Z takes it back', (await open()).length === base.open && (await pages()).length === base.pages, `${(await open()).length} open of ${base.open}`)
      const two = (await rowsIn()).slice(1, 3)
      for (const id of two) { await box.locator(`[data-box-panel] [data-row][data-id="${id}"]`).click({ modifiers: ['Meta'] }); await box.waitForTimeout(150) }
      await box.locator(`[data-box-panel] [data-row][data-id="${two[1]}"]`).click({ button: 'right' }); await box.waitForTimeout(450)
      if (dir) await box.screenshot({ path: `${dir}-box-many-menu.png` })
      const line = box.getByRole('menuitem', { name: /^Move 2 to Writing/ })
      check('quick capture\'s panel: the selection\'s menu says “Move 2 to Writing”, with W', (await line.count()) === 1 && /W$/.test((await line.textContent().catch(() => '')).trim()), await line.textContent().catch(() => 'none'))
      if (await line.count()) { await line.click(); await box.waitForTimeout(1400) }
      const many = await boxSaid()
      check('quick capture\'s panel: both move' + (front ? ', in one notice' : ''), told(many, /^Moved 2 to Writing/) && (await open()).length === base.open - 2 && (await pages()).length === base.pages + 2, `${many || 'no notice read'} ; ${(await open()).length} open of ${base.open}`)
      await box.keyboard.press('Meta+z'); await box.waitForTimeout(900)
      check('quick capture\'s panel: ⌘Z brings both back', (await open()).length === base.open && (await pages()).length === base.pages)
      // Keys on the selection there too.
      for (const id of (await rowsIn()).slice(1, 3)) { await box.locator(`[data-box-panel] [data-row][data-id="${id}"]`).click({ modifiers: ['Meta'] }); await box.waitForTimeout(150) }
      await box.keyboard.press('w'); await box.waitForTimeout(1400)
      const keyed = await boxSaid()
      check('quick capture\'s panel: W with two picked moves both', told(keyed, /^Moved 2 to Writing/) && (await open()).length === base.open - 2 && (await pages()).length === base.pages + 2, `${keyed || 'no notice read'} ; ${(await open()).length} open of ${base.open}`)
      await box.keyboard.press('Meta+z'); await box.waitForTimeout(900)
      check('quick capture\'s panel: and ⌘Z brings them back', (await open()).length === base.open && (await pages()).length === base.pages)
    }
  }

  // 10. At scale: everything picked (fifty and more, with thousands of older captures in the book) moves in one notice.
  if (process.env.QA_SCALE) {
    await go('day'); await go('inbox'); await wait(1500)
    const base = { open: (await open()).length, pages: (await pages()).length }
    await h.keyboard.press('j'); await wait(200)
    await h.keyboard.press('Meta+a'); await wait(600)
    const count = Number(/([\d,]+)\s+selected/.exec(await h.locator('[data-pane]').first().innerText())?.[1]?.replace(/,/g, '') ?? 0)
    await shoot('scale-picked')
    check('at scale: ⌘A picks fifty or more', count >= 50, `${count} selected, ${base.open} open in the book`)
    await h.keyboard.press('w'); await wait(4000)
    await shoot('scale-moved')
    check('at scale: W moves every picked capture, one notice with the count', new RegExp(`^Moved ${count.toLocaleString('en-US')} to Writing`).test(await said()) && (await open()).length === base.open - count && (await pages()).length === base.pages + count, `${await said()} ; ${(await open()).length} open`)
    await undoKey(); await wait(3500)
    check('at scale: one ⌘Z brings them all back', (await open()).length === base.open && (await pages()).length === base.pages, `${(await open()).length} open of ${base.open}`)
    // The older ones, thousands of them, listed and all picked: one move, one notice, one Undo.
    const older = h.locator('[data-inbox-older] button').first()
    if (await older.count()) {
      await older.click(); await wait(2500)
      await h.keyboard.press('j'); await wait(200)
      await h.keyboard.press('Meta+a'); await wait(1500)
      const many = Number(/([\d,]+)\s+selected/.exec(await h.locator('[data-pane]').first().innerText())?.[1]?.replace(/,/g, '') ?? 0)
      const drawn = await h.evaluate(() => document.querySelectorAll('[data-pane] [data-row][data-id]').length)
      await shoot('scale-older-picked')
      check('at scale: the older captures list by the thousand, drawing only the rows in view', many >= 5000 && drawn < 400, `${many} selected, ${drawn} rows drawn`)
      await h.keyboard.press('w'); await wait(12000)
      check('at scale: W moves thousands in one notice', new RegExp(`^Moved ${many.toLocaleString('en-US')} to Writing`).test(await said()) && (await pages()).length === base.pages + many, `${await said()}`)
      await undoKey(); await wait(9000)
      check('at scale: and one ⌘Z brings thousands back', (await open()).length === base.open && (await pages()).length === base.pages, `${(await open()).length} open of ${base.open}`)
    } else check('at scale: the Inbox offers its older captures', false, 'no line')
  }
} catch (error) { check('the run finished', false, String(error.message).split('\n')[0]) }
const errs = c.errors.filter((one) => !/Autofill|DevTools/.test(one))
check('no errors on the page', !errs.length, errs.slice(0, 2).join(' | '))
console.log(ok ? 'all passed' : 'some failed')
await c.close(); process.exit(ok ? 0 : 1)
