// Where a capture can go is on the capture itself (11 Nov): a chip in the open note's header says "Inbox" and opens
// the same ways out its details list under "Where it goes", from one list, each with its key, Writing's folders beside
// "Move to Writing". A Writing page's chip says its folder (or "Writing") and offers the folders to move it to.
// Also here: the island's state is on its heading, not a row to press; ⌘K offers every way out for a capture open
// or lit; a pin follows a capture to the page it became; a link to a moved capture opens that page from a note, and
// its hover card shows that page; nothing in the header moves as the chip's words change; one hover shows one surface.
//   QA_ARGS=--sandbox QA_DATA=<a copy of the seeded sandbox> QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/where-it-goes.mjs
// On a copy of a real book: QA_ARGS= QA_DATA=<the copy>. SHOT=<path prefix> keeps pictures; QA_THEME=dark runs it dark;
// QA_SIZE=560x400 runs the header checks in the smallest window.
import { sandbox } from './sandbox-lib.mjs'
const [W, H] = (process.env.QA_SIZE ?? '1440x900').split('x').map(Number)
const small = W < 700
const c = await sandbox({ width: W, height: H, at: '14:10' })
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
const rowsShown = () => h.evaluate(() => [...document.querySelectorAll('[data-pane] [data-row][data-type="capture"][data-id]')].filter((one) => one.offsetParent).map((one) => one.dataset.id))
const pageOf = async (capture) => (await v('lineage', capture)).became.find((one) => one.type === 'article')
const chip = () => h.locator('[data-note-head] [data-place-chip]').first()
const menuLines = () => h.evaluate(() => [...document.querySelectorAll('[data-slot="context-menu-content"] [role="menuitem"]')].map((one) => { const copy = one.cloneNode(true); for (const out of copy.querySelectorAll('svg, [data-menu-hint], [data-slot="context-menu-shortcut"]')) out.remove(); return copy.textContent.trim() }))
// Every box in the note's header but the chip itself: what must not move.
const headBoxes = () => h.evaluate(() => {
  const head = document.querySelector('[data-note-head]')
  if (!head) return null
  const at = (el) => { const b = el.getBoundingClientRect(); return [Math.round(b.left * 2) / 2, Math.round(b.top * 2) / 2, Math.round(b.width * 2) / 2, Math.round(b.height * 2) / 2].join(',') }
  const chip = head.querySelector('[data-place-chip]')
  return { chipLeft: chip ? Math.round(chip.getBoundingClientRect().left * 2) / 2 : null, chipTop: chip ? Math.round(chip.getBoundingClientRect().top * 2) / 2 : null,
    others: [...head.querySelectorAll('button')].filter((one) => one !== chip && one.offsetParent).map((one) => `${one.getAttribute('aria-label') ?? one.textContent}:${at(one)}`) }
})
const floats = () => h.evaluate(() => [...document.querySelectorAll('[role="tooltip"], [data-note-preview], [data-slot="tooltip-content"]')].filter((one) => one.getClientRects().length && getComputedStyle(one).visibility !== 'hidden' && Number(getComputedStyle(one).opacity) > 0.05).length)

try {
  await v('settings:set', { hintRate: 0 })
  await v('onboarding:set', { pageHints: false }).catch(() => {})
  if (process.env.QA_THEME) await c.look(process.env.QA_THEME)
  await go('inbox'); await wait(1500)
  const before = { open: (await open()).length, pages: (await pages()).length }
  const openIds = new Set((await open()).map((one) => one.id))
  const shown = (await rowsShown()).filter((id) => openIds.has(id))
  check('the Inbox shows open captures to work with', shown.length >= 5, `${shown.length} rows, ${before.open} open`)
  check('the switch beside “Sort” is named by the app\'s own word, “Show dealt with too”, and nothing in the header says “sorted”',
    (await h.getByRole('switch', { name: 'Show dealt with too' }).count()) === 1 && !/sorted/i.test(await h.locator('[data-sorted-too]').first().innerText().catch(() => 'sorted')), await h.locator('[data-sorted-too]').first().innerText().catch(() => 'none'))

  // A row's own right-click menu, for its material: what the chip's menu must match.
  await row(shown[0]).click({ button: 'right' }); await wait(400)
  const rowMenu = await h.evaluate(() => { const el = document.querySelector('[data-slot="context-menu-content"]'); if (!el) return null; const s = getComputedStyle(el); return { bg: s.backgroundColor, blur: s.backdropFilter, radius: s.borderRadius } })
  await h.keyboard.press('Escape'); await wait(300)
  // 1. The chip on an open capture.
  const first = shown[0]
  await row(first).click(); await wait(1100)
  if (await chip().count()) { await chip().scrollIntoViewIfNeeded(); await wait(300) }
  await shoot('header')
  check('an open capture says where it is, in its header: a chip named for the Inbox', (await chip().count()) === 1 && /Inbox/.test((await chip().getAttribute('aria-label')) ?? ''), (await chip().getAttribute('aria-label').catch(() => 'no chip')) ?? '')
  if (await chip().count()) {
    const words = await chip().locator('[data-place-name]').evaluate((el) => (el.offsetParent ? el.textContent : ''))
    check(small ? 'in the smallest window the chip folds to its mark, as “Details” does' : 'the chip reads “Inbox”', small ? words === '' : words === 'Inbox', `"${words}"`)
    check('the chip shows the hand', (await chip().evaluate((el) => getComputedStyle(el).cursor)) === 'pointer')
    const head = await h.evaluate(() => { const one = document.querySelector('[data-note-head]'); const b = one.getBoundingClientRect(); return { wide: one.scrollWidth <= one.clientWidth + 1, tall: Math.round(b.height), cut: [...one.querySelectorAll('button')].filter((el) => el.offsetParent && (el.getBoundingClientRect().right > b.right + 0.5 || el.getBoundingClientRect().left < b.left - 0.5)).length } })
    check('the header stays one line, nothing cut off or pushed out', head.wide && head.cut === 0 && head.tall <= 40, JSON.stringify(head))
    const size = await chip().evaluate((el) => { const b = el.getBoundingClientRect(); return { w: Math.round(b.width), h: Math.round(b.height) } })
    check('the chip is big enough to press (24px or more each way)', size.w >= 24 && size.h >= 24, JSON.stringify(size))

    // Its menu: the same ways out as the details' island, in the same order.
    const still0 = await headBoxes()
    await chip().click(); await wait(350)
    await shoot('menu')
    const still1 = await headBoxes()
    check('opening the menu moves nothing in the header', JSON.stringify(still0) === JSON.stringify(still1), `${JSON.stringify(still0?.others).slice(0, 120)}`)
    const heading = await h.evaluate(() => document.querySelector('[data-slot="context-menu-content"] [data-slot="context-menu-label"]')?.textContent ?? '')
    const lines = await menuLines()
    check('the menu is headed “Where it goes”', heading === 'Where it goes', heading)
    const surface = await h.evaluate(() => { const el = document.querySelector('[data-slot="context-menu-content"]'); if (!el) return null; const s = getComputedStyle(el); const b = el.getBoundingClientRect(); return { bg: s.backgroundColor, blur: s.backdropFilter, left: Math.round(b.left), right: Math.round(innerWidth - b.right), top: Math.round(b.top), bottom: Math.round(innerHeight - b.bottom) } })
    // Any colour form Chromium gives back: an alpha after a slash, or rgba's fourth number; none is solid.
    const bg = surface?.bg ?? ''
    const alpha = bg.includes('/') ? Number(bg.split('/')[1].replace(')', '')) : /^rgba\(/.test(bg) ? Number(bg.replace(/[^\d.,]/g, '').split(',')[3]) : 1
    // The app's one floating material (lib/float.ts), the very one a row's right-click menu wears: never a surface of its own.
    check('the menu wears the app\'s one menu material, as a row\'s right-click menu does, clear of the window\'s edges', !!surface && bg !== '' && alpha >= 0.85 && bg === rowMenu?.bg && surface.blur === rowMenu?.blur && surface.left >= 12 && surface.right >= 12 && surface.bottom >= 12, `${JSON.stringify(surface)} ; a row's: ${JSON.stringify(rowMenu)}`)
    // One hover, one surface: every line pointed at with a real pointer shows no tip or card over the menu.
    let extra = 0; let hands = 0; let rows = 0
    for (const item of await h.locator('[data-slot="context-menu-content"] [role="menuitem"]').all()) {
      await item.hover(); await wait(260)
      rows += 1
      // A line that opens more beside it shows that submenu: the one surface its hover has.
      extra += await floats()
      hands += (await item.evaluate((el) => getComputedStyle(el).cursor)) === 'pointer' ? 1 : 0
    }
    check('one hover, one surface: no tip or card over any line of the menu', extra === 0 && rows >= 6, `${rows} lines hovered, ${extra} extra surfaces`)
    check('every line of the menu shows the hand', hands === rows, `${hands}/${rows}`)
    const icons = await h.evaluate(() => [...document.querySelectorAll('[data-slot="context-menu-content"] [role="menuitem"]')].every((one) => one.querySelector('svg')))
    check('every line of the menu has its icon', icons)
    await h.keyboard.press('Escape'); await wait(250)

    // The island: the same list, its state on its heading.
    if (!(await h.locator('[data-details-group="Status"]').count())) { await h.getByRole('button', { name: 'Details' }).first().click(); await wait(600) }
    await shoot('details')
    const island = await h.evaluate(() => {
      const group = document.querySelector('[data-details-group="Status"]')
      return { title: group?.querySelector('h2')?.textContent ?? '', now: group?.querySelector('[data-where-now]')?.textContent ?? '', ways: [...(group?.querySelectorAll('[data-way]') ?? [])].map((one) => one.textContent.trim()), rows: [...(group?.querySelectorAll('[data-island-body] > *') ?? [])].map((one) => one.textContent.trim()) }
    })
    check('the island “Where it goes” says “In the Inbox” on its heading, and holds no row that reads “Open”', island.title === 'Where it goes' && island.now === 'In the Inbox' && !island.rows.includes('Open'), JSON.stringify({ title: island.title, now: island.now, first: island.rows[0] }))
    // Read out, each row is its own words: a tip beside it never takes the name's place.
    const namedRows = await Promise.all(['Save as a gem', 'Move to Writing', 'Resolve', 'Move to the Bin'].map((name) => h.locator('[data-details-group="Status"]').getByRole('button', { name, exact: true }).count()))
    check('each row of the island is named by its own words, to a screen reader too', namedRows.every((n) => n === 1), namedRows.join(','))
    check('one list: the chip\'s menu and the island name the same ways out, in the same order', lines.length >= 7 && JSON.stringify(lines) === JSON.stringify(island.ways), `menu ${lines.join(' | ')} ;; island ${island.ways.join(' | ')}`)
    for (const name of ['Save as a gem', 'Move to Writing', 'Make it a task', 'Resolve', 'Move to the Bin', 'Add as a clue to a question…', 'Merge into another note…']) check(`“${name}” is among them`, lines.includes(name))
    check('the Bin is last', lines.at(-1) === 'Move to the Bin', lines.at(-1))
    if (await h.getByRole('button', { name: 'Details' }).first().getAttribute('aria-pressed') === 'true') { await h.getByRole('button', { name: 'Details' }).first().click(); await wait(400) }

    // Stepping to the next capture (the list is beside the note, so not in the smallest window): the chip stays where it was.
    if (!small) {
    const at0 = await headBoxes()
    await h.keyboard.press('Escape').catch(() => {})
    await row(shown[1]).click(); await wait(900)
    const at1 = await headBoxes()
    check('on the next capture the chip is in the same place', at0?.chipLeft === at1?.chipLeft && at0?.chipTop === at1?.chipTop, `${at0?.chipLeft},${at0?.chipTop} then ${at1?.chipLeft},${at1?.chipTop}`)
    check('and the tools on the right have not moved', JSON.stringify(at0?.others.filter((one) => /^(Read|Details|More|Open in its own window):/.test(one))) === JSON.stringify(at1?.others.filter((one) => /^(Read|Details|More|Open in its own window):/.test(one))))
    }

    // 2. From the chip, into a folder of Writing.
    const folders = (await v('groups', 'article').catch(() => [])).filter((one) => one.folder !== 0)
    const id = shown[1]
    if (folders.length && !small) {
      await chip().click(); await wait(300)
      await h.locator('[data-slot="context-menu-content"] [role="menuitem"]', { hasText: 'Move to Writing' }).first().hover(); await wait(450)
      await shoot('folders')
      const sub = await h.evaluate(() => [...document.querySelectorAll('[data-slot="context-menu-sub-content"] [role="menuitem"]')].map((one) => one.textContent.trim()))
      check('“Move to Writing” opens Writing itself and its folders beside it', sub.length === folders.length + 1 && /^Writing/.test(sub[0]) && /W$/.test(sub[0]), sub.join(' | '))
      const target = folders[0]
      await h.locator('[data-slot="context-menu-sub-content"] [role="menuitem"]', { hasText: target.name }).first().click(); await wait(1100)
      const page = await pageOf(id)
      const listed = page && (await pages()).find((one) => one.id === page.id)
      check('chip, a folder: the notice names the folder, the capture left and its page is in that folder', (await said()).startsWith(`Moved to “${target.name}”`) && (await open()).length === before.open - 1 && !!listed && (await v('groups', 'article')).find((one) => one.id === target.id)?.members.includes(page.id), `${await said()}`)
      check('the next capture is open in its place, its chip saying “Inbox”', (await chip().count()) === 1 && /Inbox/.test((await chip().getAttribute('aria-label')) ?? ''))
      await undoKey()
      check('⌘Z: back in the Inbox, the page gone', (await open()).length === before.open && (await pages()).length === before.pages)
    } else if (!small) check('Writing has folders to move into', false, 'none in this book')

    // 3. From the chip, by its key with the menu open, undone by the notice.
    {
      if (!small) { await row(shown[2]).click(); await wait(900) }
      await chip().scrollIntoViewIfNeeded(); await wait(200)
      await chip().click(); await wait(300)
      await h.keyboard.press('w'); await wait(1100)
      check('chip, W with its menu open: moved to Writing, and said', /^Moved to Writing/.test(await said()) && (await open()).length === before.open - 1 && !!(await pageOf(small ? first : shown[2])), await said())
      await h.locator('[role="status"]').getByRole('button', { name: /Undo/ }).click(); await wait(800)
      check('Undo in the notice: back in the Inbox', (await open()).length === before.open && (await pages()).length === before.pages)
    }
  }

  // 3b. A row's own right-click menu, a key pressed with it open: taken once, on that row, and said once.
  if (!small) {
    await go('day'); await go('inbox'); await wait(900)
    const id = (await rowsShown()).find((one) => openIds.has(one))
    await row(id).click({ button: 'right' }); await wait(400)
    await h.keyboard.press('r'); await wait(1100)
    check('a row\'s menu, R with it open: resolved once, and said (never taken twice, the second refused)', /^Resolved/.test(await said()) && (await open()).length === before.open - 1, await said())
    await undoKey()
    check('⌘Z: back', (await open()).length === before.open)
  }

  // 4. ⌘K offers every way out: for the capture open, and for the one the keys are on with none open.
  const palette = async (words) => {
    await h.keyboard.press('Meta+k'); await wait(450)
    await h.keyboard.type(words, { delay: 15 }); await wait(500)
    // Each action on show: its name, a bar, then its keys.
    return h.evaluate(() => [...document.querySelectorAll('[data-action-label]')].filter((one) => one.offsetParent).map((one) => `${one.textContent.trim()}|${[...one.parentElement.querySelectorAll('kbd')].map((key) => key.textContent.trim()).join('')}`))
  }
  // Esc backs out a layer at a time: the words, then the palette.
  const shut = async () => { for (let n = 0; n < 3 && (await h.locator('[data-action-label]').count()); n++) { await h.keyboard.press('Escape'); await wait(250) } }
  if (!small) {
    await row(shown[3]).click(); await wait(900)
    const found = []
    for (const [words, name] of [['save as a gem', 'Save as a gem'], ['move to writing', 'Move to Writing'], ['make it a task', 'Make it a task'], ['resolve', 'Resolve'], ['move to the bin', 'Move to the Bin'], ['add as a clue', 'Add as a clue to a question…'], ['merge into', 'Merge into another note…']]) {
      const rows = await palette(words)
      found.push([name, rows.some((one) => one.startsWith(`${name}|`))])
      await shut()
    }
    check('⌘K, a capture open: every way out is offered by name', found.every(([, there]) => there), found.filter(([, there]) => !there).map(([name]) => name).join(', ') || 'all 7')
    const rows = await palette('move to writing')
    const line = rows.find((one) => one.startsWith('Move to Writing|')) ?? ''
    check('⌘K: “Move to Writing” is the first offered, with its key', rows[0] === line && line.split('|')[1] === 'W', rows.slice(0, 2).join(' ; '))
    await h.keyboard.press('Enter'); await wait(1200)
    check('⌘K, a capture open: “Move to Writing” moves it, and says so', /^Moved to Writing/.test(await said()) && (await open()).length === before.open - 1 && !!(await pageOf(shown[3])), await said())
    await undoKey()
    check('⌘Z after ⌘K: back in the Inbox', (await open()).length === before.open && (await pages()).length === before.pages)
    // None open: the row the keys are on.
    await go('day'); await go('inbox'); await wait(900)
    const was = new Set((await open()).map((one) => one.id))
    await h.keyboard.press('j'); await wait(300)
    const lit = await h.evaluate(() => document.querySelector('[data-pane] [data-row][data-cursor]')?.dataset.id ?? '')
    const litRows = await palette('resolve')
    check('⌘K, a capture lit and none open: “Resolve” is the first offered, for it, with its key', (litRows[0] ?? '') === 'Resolve|R', litRows.slice(0, 3).join(' ; '))
    await h.keyboard.press('Enter'); await wait(1000)
    const still = new Set((await h.evaluate(() => window.api.captures.list())).filter((each) => each.status === 'open').map((each) => each.id))
    const gone = [...was].filter((one) => !still.has(one))
    check('⌘K, a capture lit: it is the lit one that resolves', /^Resolved/.test(await said()) && gone.length === 1 && gone[0] === lit, `${await said()} ${gone.length} gone`)
    await undoKey()
    check('⌘Z: it is back', (await open()).length === before.open)
  }

  // 5. A pin follows the capture to the page it became, and back.
  if (!small) {
    const id = shown[4]
    const pinLabel = ((await open()).find((one) => one.id === id)?.label ?? '').split('\n')[0].trim()
    await v('pin', 'captures', id, true); await wait(300)
    await row(id).click(); await wait(800)
    await chip().click(); await wait(300)
    await h.locator('[data-slot="context-menu-content"] [role="menuitem"]', { hasText: 'Move to Writing' }).first().hover(); await wait(350)
    const direct = h.locator('[data-slot="context-menu-sub-content"] [role="menuitem"]').first()
    if (await direct.count()) await direct.click(); else await h.locator('[data-slot="context-menu-content"] [role="menuitem"]', { hasText: 'Move to Writing' }).first().click()
    await wait(1100)
    const page = await pageOf(id)
    const pins = await v('pins')
    check('a pinned capture moved to Writing: the pin is on the page now, not on the capture kept behind it', !!page && pins.some((one) => one.id === page.id) && !pins.some((one) => one.id === id), pins.map((one) => `${one.type}:${one.title}`).slice(0, 4).join(' | '))
    const named = pins.find((one) => one.id === page?.id)?.title ?? ''
    check('and the pin goes by the page\'s words, never “Untitled”', !!named && named !== 'Untitled' && pinLabel.startsWith(named.slice(0, 16)), `pin “${named}”, capture “${pinLabel.slice(0, 40)}”`)
    const side = await h.evaluate((title) => [...document.querySelectorAll('[data-drag-open^="article:"]')].some((one) => one.textContent.includes(title.slice(0, 12))), (await v('pins')).find((one) => one.id === page?.id)?.title ?? '~none~')
    check('the sidebar\'s pin is the page', side)
    await undoKey()
    const back = await v('pins')
    check('⌘Z: the pin is back on the capture', back.some((one) => one.id === id) && (await open()).length === before.open, back.map((one) => one.type).join(','))
    await v('pin', 'captures', id, false)
  }

  // 6. A real link to a moved capture, clicked in a note and in its hover card, opens the page it became.
  if (!small) {
    const all = await h.evaluate(() => window.api.captures.list())
    let pair = null
    for (const one of all.filter((each) => each.status === 'open' && !each.archivedAt)) {
      const body = JSON.stringify((await h.evaluate((id) => window.api.captures.get(id), one.id))?.body ?? '')
      const to = all.find((other) => other.id !== one.id && other.status === 'open' && !other.archivedAt && (body.includes(`"id":"${other.id}"`) || body.includes(`[[@${other.id}|`)))
      if (to) { pair = { from: one.id, to: to.id }; break }
    }
    if (!pair) check('the book has a note that links to another capture', false, 'none found')
    else {
      await h.evaluate((id) => window.api.haligtree('capture:toWriting', [id], null), pair.to); await wait(600)
      const page = await pageOf(pair.to)
      await go('day'); await go('inbox'); await wait(800)
      await row(pair.from).click(); await wait(1200)
      const link = h.locator(`.note-pane a.tiptap-note-link[data-note="${pair.to}"], .note-pane a.tiptap-note-link[data-note="capture:${pair.to}"]`).first()
      check('the note shows its link to the moved capture', (await link.count()) === 1 && !!page)
      if (await link.count()) {
        await link.scrollIntoViewIfNeeded()
        await link.hover(); await wait(1100)
        const card = h.locator('[data-note-preview]').first()
        await shoot('link-card')
        // The card is a preview, with nothing in it to press: it must show what the click opens, the page, by its kind.
        const kind = await card.locator('p').first().innerText().catch(() => '')
        check('pointing at the link shows the card of the Writing page it became, not of the capture kept behind it', (await card.count()) === 1 && /^Writing$/.test(kind.trim()), `kind line “${kind.trim()}”`)
        await h.mouse.move(5, 5); await wait(500)
        await link.scrollIntoViewIfNeeded()
        await link.click(); await wait(1300)
        const tabs = await h.evaluate(() => [...document.querySelectorAll('[data-tab][data-tab-open]')].map((one) => one.dataset.tabOpen))
        const here = await h.evaluate(() => document.querySelector('[data-open]')?.dataset.open ?? '')
        check('a click on the link in the note opens the Writing page it became', tabs.includes(`article:${page.id}`) || here === page.id, `${tabs.join(' ')} ; open ${here}`)
        // 7. The page's own chip: its folder, or "Writing", and the folders to move it to.
        const place = h.locator('[data-note-head] [data-place-chip]').first()
        await shoot('page-header')
        check('the Writing page says where it is: “Writing”, loose in no folder', (await place.count()) === 1 && /^Writing\./.test((await place.getAttribute('aria-label')) ?? ''), (await place.getAttribute('aria-label').catch(() => 'no chip')) ?? '')
        const folders = (await v('groups', 'article').catch(() => [])).filter((one) => one.folder !== 0)
        if ((await place.count()) && folders.length) {
          await place.click(); await wait(350)
          await shoot('page-menu')
          const names = await menuLines()
          check('its menu lists Writing\'s folders, under “Move to folder”, and no way back to the Inbox', (await h.evaluate(() => document.querySelector('[data-slot="context-menu-content"] [data-slot="context-menu-label"]')?.textContent)) === 'Move to folder' && names.length >= folders.length && !names.some((one) => /inbox/i.test(one)), names.join(' | '))
          const target = folders[0]
          await h.locator('[data-slot="context-menu-content"] [role="menuitem"]', { hasText: target.name }).first().click(); await wait(1100)
          check('picked, the page moves there, with the list\'s own notice', new RegExp(`^Moved .*to ${target.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(await said()) && (await v('groups', 'article')).find((one) => one.id === target.id)?.members.includes(page.id), await said())
          check('and its chip says the folder now', new RegExp(`^${target.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\.`).test((await place.getAttribute('aria-label')) ?? ''), (await place.getAttribute('aria-label')) ?? '')
          await shoot('page-in-folder')
          await undoKey()
          check('⌘Z: loose in Writing again', !(await v('groups', 'article')).find((one) => one.id === target.id)?.members.includes(page.id) && /^Writing\./.test((await place.getAttribute('aria-label')) ?? ''))
        }
      }
      await h.evaluate(([capture, id]) => window.api.haligtree('capture:toWriting:undo', [{ capture, id }]), [pair.to, page?.id]); await wait(400)
    }
  }
} catch (error) { check('the run finished', false, String(error.message).split('\n')[0]) }
const errs = c.errors.filter((one) => !/Autofill|DevTools/.test(one))
check('no errors on the page', !errs.length, errs.slice(0, 2).join(' | '))
console.log(ok ? 'all passed' : 'some failed')
await c.close(); process.exit(ok ? 0 : 1)
