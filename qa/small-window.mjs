// A note in a small window of its own (main/small-window.ts), apart from quick capture, as Raycast Notes is apart
// from Raycast: every way in (quick capture's ⌥⌘O, a row's "Open in a small window", the key from anywhere), what is
// typed saved to the book, quick capture blank and sending its own capture while a small window holds another, the
// window growing with the words to a ceiling, a resize by hand turning that off and "Auto-size" giving it back, the
// step aside and its switch, nothing left behind when closed empty, and the windows back after a restart.
//   cp -cR <scratchpad>/sandbox-seed.noindex/c-tip <copy>
//   QA_DATA=<copy> QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox node qa/small-window.mjs
//   SMALL_PART=restart runs only the restart (on the same QA_DATA, after a full run).
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
import { paste, putOnBoard } from './pasteboard.mjs'
process.env.QA_ARGS ??= '--sandbox'
process.env.HALIGTREE_QA_VIRTUAL ??= '1'
process.env.HALIGTREE_QA_STEPASIDE = '1'

const { check, done } = checks()
// What the app wrote down as the last run quit, read before this one starts (it writes the file again as it opens them).
const find = (dir, depth = 0) => {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (name === 'small-windows.json') return path
    if (depth < 3 && statSync(path).isDirectory() && !name.startsWith('.')) { const got = find(path, depth + 1); if (got) return got }
  }
  return null
}
const keptFile = process.env.SMALL_PART === 'restart' && process.env.QA_DATA ? find(process.env.QA_DATA) : null
const keptBefore = keptFile ? JSON.parse(readFileSync(keptFile, 'utf8')) : []
const c = await sandbox({ width: 1100, height: 760 })
const { page: boxPage, h, v, electron } = c
const wait = (ms) => boxPage.waitForTimeout(ms)
const EDITOR = '.tiptap.ProseMirror.haligtree-editor:not(.is-line):not(.is-plain)'
const smalls = () => electron.windows().filter((w) => /[?&]small=/.test(w.url()))
const until = async (fn, ms = 6000) => { for (let t = 0; t < ms; t += 100) { const got = await fn(); if (got) return got; await wait(100) } return null }
/** A small window's main-process side: its bounds as the app keeps them, and whether it is open. */
const win = (url, fn = 'return w.getBounds()', arg) => electron.evaluate(({ BrowserWindow, screen, app }, [url, fn, arg]) => {
  const w = BrowserWindow.getAllWindows().find((one) => !one.isDestroyed() && one.webContents.getURL().endsWith(url))
  return w ? new Function('w', 'screen', 'app', 'arg', fn)(w, screen, app, arg) : null
}, [url.slice(url.indexOf('?')), fn, arg])
const holds = (page) => page.evaluate(() => new URLSearchParams(location.search).get('small'))
const words = (id) => h.evaluate((id) => window.api.captures.get(id).then((one) => JSON.stringify(one?.body ?? null)), id)
/** The cursor a person sees with the pointer resting on what `selector` finds: read where the pointer is, not from the element. */
const cursorAt = async (page, selector) => {
  // In view first, as a person scrolls a long menu to a line before resting on it.
  await page.locator(selector).first().scrollIntoViewIfNeeded().catch(() => {})
  const box = await page.locator(selector).first().boundingBox().catch(() => null)
  if (!box) return 'not there'
  const [x, y] = [box.x + box.width / 2, box.y + box.height / 2]
  await page.mouse.move(x, y); await page.waitForTimeout(150)
  return page.evaluate(([x, y]) => { const at = document.elementFromPoint(x, y); return at ? getComputedStyle(at).cursor : 'nothing there' }, [x, y])
}
const cardHeight = (page) => page.evaluate(() => document.querySelector('.app-container')?.offsetHeight ?? 0)
const typeIn = async (page, text) => {
  await page.click(EDITOR)
  await page.keyboard.press('End')
  await page.keyboard.type(text, { delay: 20 })
  await page.waitForTimeout(1300)
}

try {
  if (process.env.SMALL_PART === 'restart') {
    // What the full run left open as it quit (the box's words, a note from the Inbox, the one typed into), as the app
    // wrote it down: every one of them back.
    const want = keptBefore.length
    const back = await until(() => want > 0 && smalls().length >= want && smalls(), 20000)
    check(`after a restart, the ${want} small windows open when the app quit are back`, want >= 2 && back && back.length === want, back ? back.map((one) => one.url().replace(/^.*small=/, '')).join(', ') : `${smalls().length} of ${want}`)
    const texts = []
    for (const one of back ?? smalls()) {
      await one.waitForSelector(EDITOR, { timeout: 15000 }).catch(() => {})
      await until(async () => (await one.locator(EDITOR).innerText().catch(() => '')).trim().length > 0, 5000)
      texts.push({ one, text: await one.locator(EDITOR).innerText().catch(() => '') })
    }
    const typed = texts.find((t) => /Distilling the report/.test(t.text))
    check('each with the note it held, words and all', !!typed && texts.some((t) => /Box words for a small window/.test(t.text)), texts.map((t) => t.text.slice(0, 30)).join(' | '))
    if (typed) {
      const b = await win(typed.one.url())
      const link = decodeURIComponent(typed.one.url().replace(/^.*[?&]small=([^&]*).*$/, '$1'))
      const saved = keptBefore.find((one) => one.link === link)?.bounds
      // Its left edge and width as written down; its top only moves if its height needs it to (grown to its ceiling).
      check('where it was, at the size it had', b && saved && b.x === saved.x && b.width === saved.width && b.height === saved.height, JSON.stringify({ now: b, saved }))
    }
  } else {
    await v('settings:set', { hintRate: 0, rotCount: 0, sounds: false, motion: true, boxAutoHide: true })
    // 1. From quick capture: what is in the box moves into a small window, and the box is blank.
    await boxPage.evaluate(() => window.api.showPrompt()); await wait(1200)
    await boxPage.click(EDITOR)
    await boxPage.keyboard.type('Box words for a small window', { delay: 20 })
    await wait(400)
    await boxPage.keyboard.press('Alt+Meta+KeyO')
    const first = await until(() => smalls()[0])
    check('⌥⌘O in quick capture opens a small window', !!first)
    if (!first) throw new Error('no small window')
    await first.waitForSelector(EDITOR, { timeout: 15000 })
    await until(async () => /Box words/.test(await first.locator(EDITOR).innerText()))
    check('holding what was in the box', /Box words for a small window/.test(await first.locator(EDITOR).innerText()))
    const firstId = (await holds(first)).replace('capture:', '')
    check('kept as a capture in the book', /Box words for a small window/.test(await words(firstId)), firstId)
    await boxPage.evaluate(() => window.api.showPrompt()); await wait(900)
    check('quick capture comes back blank, ready for the next thing', (await boxPage.locator(EDITOR).innerText()).trim() === '', await boxPage.locator(EDITOR).innerText())
    // 2. Quick capture sends its own capture while the small window holds another.
    await boxPage.click(EDITOR)
    await boxPage.keyboard.type('Box capture while small open', { delay: 20 })
    await boxPage.keyboard.press('Meta+Enter'); await wait(1500)
    const listed = await h.evaluate(() => window.api.captures.list().then((all) => all.map((one) => one.label)))
    check('quick capture still sends its own capture', listed.some((one) => /Box capture while small open/.test(one)))
    check('and the small window keeps its own note', /Box words for a small window/.test(await first.locator(EDITOR).innerText()))
    // 3. Typed in the small window: saved to the book.
    await typeIn(first, ' and more typed here')
    check('words typed in the small window are saved', /and more typed here/.test(await words(firstId)), (await words(firstId)).slice(0, 160))
    // 3b. Rule 6: the same inputs in quick capture and in the small window, side by side: what each shows and which
    // sounds each asks for (sound.ts keeps every cue by name on window.haligtreeCued, played or not).
    const parity = []
    for (const [name, at] of [['box', boxPage], ['small', first]]) {
      if (name === 'box') { await boxPage.evaluate(() => window.api.showPrompt()); await wait(900) }
      await at.click(EDITOR)
      await at.keyboard.press('Meta+ArrowDown')
      const cued = async (act) => {
        await at.evaluate(() => void (window.haligtreeCued && (window.haligtreeCued.length = 0)))
        await act()
        await at.waitForTimeout(700)
        return (await at.evaluate(() => [...(window.haligtreeCued ?? [])])).join(' ') || 'none'
      }
      const text = () => at.locator(EDITOR).innerText()
      const row = { name }
      row.listSound = await cued(async () => { await at.keyboard.press('Enter'); await at.keyboard.type('- listed item', { delay: 25 }) })
      row.list = await at.locator(`${EDITOR} li`).filter({ hasText: 'listed item' }).count() === 1
      await at.keyboard.press('Enter'); await at.keyboard.press('Enter')
      await at.waitForTimeout(700)
      await at.keyboard.type('zz', { delay: 25 })
      await at.waitForTimeout(700)
      row.undoSound = await cued(() => at.keyboard.press('Meta+z'))
      row.undo = !(await text()).includes('zz') && (await text()).includes('listed item')
      row.pasteSound = await cued(() => paste(at, 'Pasted line from a report', EDITOR))
      row.paste = (await text()).includes('Pasted line from a report')
      // On a line of its own: "/" opens its menu at a word's start, never in the middle of one.
      await at.keyboard.press('Enter')
      row.slashSound = await cued(() => at.keyboard.type('/', { delay: 25 }))
      // Quick capture holds a pop-up out of sight until its window has room under the card (lib/fit-box.ts): given
      // the time that takes on a loaded Mac, three seconds at most, as a person sees it arrive.
      row.slash = !!(await until(() => at.locator('.tiptap-suggestion-popup').first().isVisible().catch(() => false), 3000))
      await at.keyboard.press('Backspace'); await at.keyboard.press('Backspace'); await at.waitForTimeout(300)
      parity.push(row)
    }
    const [inBox, inSmall] = parity
    for (const key of ['list', 'listSound', 'undo', 'undoSound', 'paste', 'pasteSound', 'slash', 'slashSound'])
      check(`the same in both: ${key} (box: ${inBox[key]}, small window: ${inSmall[key]})`, String(inBox[key]) === String(inSmall[key]) && inBox[key] !== false)
    await boxPage.evaluate(() => window.api.hideWindow()); await wait(300)
    // 4. A row's "Open in a small window" in the main window's Inbox.
    await c.go('inbox')
    const olds = await h.evaluate(() => window.api.captures.list().then((all) => all.filter((one) => one.status === 'open' && !one.archivedAt && /^[A-Za-z][\w ,'-]{8,}/.test(one.label)).map((one) => ({ id: one.id, label: one.label.split('\n')[0] }))))
    const old = olds.find((one) => !/Box (words|capture)/.test(one.label))
    const row = h.getByText(old?.label.slice(0, 30) ?? 'no such row', { exact: false }).first()
    await row.click({ button: 'right' }); await wait(500)
    const openIn = h.getByRole('menuitem', { name: /^Open in…/ })
    if (await openIn.count()) { await openIn.first().hover(); await wait(400) }
    const line = h.getByRole('menuitem', { name: 'Open in a small window' })
    check('a capture row\'s menu says “Open in a small window”', (await line.count()) > 0)
    check('the hand on that line', (await cursorAt(h, '[role="menuitem"]:has-text("Open in a small window")')) === 'pointer')
    if (await line.count()) await line.first().click()
    const second = await until(() => smalls().length >= 2 && smalls().find((one) => one !== first))
    check('it opens that note in a small window of its own', !!second && (await holds(second)) === `capture:${old?.id}`, second ? await holds(second) : 'none')
    // 4b. One note, one window: its own window taking the note puts it down in the small window, which says where it
    // went, as the main window does; "Bring it back" there closes that window and the small one has the note again.
    await row.click({ button: 'right' }); await wait(500)
    if (await openIn.count()) { await openIn.first().hover(); await wait(400) }
    await h.getByRole('menuitem', { name: 'Open in a new window' }).first().click().catch(() => {})
    const big = await until(() => electron.windows().find((one) => /[?&]note=/.test(one.url())))
    check('“Open in a new window” on a note a small window holds opens its own window', !!big)
    const putDown = second ? await until(async () => (await second.locator('[data-apart-trace]').count()) > 0) : null
    check('and the small window puts it down, saying where it went, with its way there and back', !!putDown && (await second.locator('[data-apart-show]').count()) === 1)
    if (putDown) await second.locator('[data-apart-back]').click()
    check('“Bring it back” there closes that window', !!(await until(() => !electron.windows().some((one) => /[?&]note=/.test(one.url())))))
    check('and the small window has its note again', !!second && !!(await until(async () => (await second.locator('[data-apart-trace]').count()) === 0 && (await second.locator(EDITOR).count()) > 0)))
    // 5. The key from anywhere: a new note, saved as it is written; quick capture untouched.
    await electron.evaluate(() => globalThis.haligtreeChords.get('⌥⌘.')())
    const fresh = await until(() => smalls().find((one) => one !== first && one !== second))
    check('⌥⌘. opens a new note in a small window', !!fresh)
    await fresh.waitForSelector(EDITOR, { timeout: 15000 })
    const freshLink = await until(async () => { const at = await holds(fresh); return at && at !== 'new' && at })
    check('a new note is a capture from its first moment', /^capture:/.test(freshLink ?? ''), freshLink)
    const freshId = (freshLink ?? '').replace('capture:', '')
    const title = () => fresh.locator('[data-drag-strip] .text-control').first().innerText().catch(() => '')
    check('empty, its faint title says “Untitled”', /Untitled/.test(await title()), await title())
    for (const [name, at] of [['window dots’ ×', '.mf-dots button[aria-label="Close"]'], ['new note', 'button[aria-label="New note"]'], ['browse', '[data-small-browse]'], ['menu', 'button[aria-label="Options"]'], ['“Close note”', '[data-create]']]) {
      const cursor = await cursorAt(fresh, at)
      check(`the hand on its ${name}, under a resting pointer`, cursor === 'pointer', cursor)
    }
    await fresh.mouse.move(-40, -40)
    const short = (await win(fresh.url())).height
    await typeIn(fresh, 'Distilling the report')
    check('typed, the title is its first line', /Distilling the report/.test(await title()), await title())
    // 6. Auto-size: one line a time the card grows, drawn by the page in the room its window already holds below it;
    // the window changes size only when that room runs short, in one step (QC2's mechanism, as quick capture grows).
    const cards = [await cardHeight(fresh)]
    const windows = [(await win(fresh.url())).height]
    for (let i = 0; i < 6; i++) {
      await fresh.keyboard.press('Enter'); await fresh.keyboard.type(`point ${i + 1}`, { delay: 10 })
      await wait(350)
      cards.push(await cardHeight(fresh)); windows.push((await win(fresh.url())).height)
    }
    const grown = windows.at(-1)
    check('the card grows with every row written', cards.every((one, n) => !n || one > cards[n - 1]), cards.join(' → '))
    check('the card is never taller than its window', cards.every((one, n) => one <= windows[n]), `${cards.join(',')} in ${windows.join(',')}`)
    const resized = windows.filter((one, n) => n && one !== windows[n - 1]).length
    check('the window changes size at most once in six rows, never a row at a time', resized <= 1, windows.join(' → '))
    for (let i = 0; i < 70; i++) await fresh.keyboard.press('Enter'), await fresh.keyboard.type(`more ${i + 1}`, { delay: 0 })
    await wait(1200)
    const top = await win(fresh.url(), 'const b = w.getBounds(); const a = screen.getDisplayMatching(b).workArea; return { ...b, ceiling: a.height - 80, foot: a.y + a.height - 40 }')
    check('and stops at the screen\'s height less a margin above and below', top.height === top.ceiling && top.y + top.height === top.foot, JSON.stringify(top))
    check('the card fills it there, its words scrolling', (await cardHeight(fresh)) === top.height, `${await cardHeight(fresh)} in ${top.height}`)
    check('saved, every line', /more 70/.test(await words(freshId)))
    // 7. Resized by hand: growing stops, and “Auto-size” gives it back.
    await win(fresh.url(), 'w.setBounds({ ...w.getBounds(), height: 300 }); w.emit("will-resize")')
    await wait(500)
    const pill = fresh.locator('button[data-small-auto]')
    check('a resize by hand shows “Auto-size”', (await pill.count()) === 1)
    await fresh.keyboard.type(' x', { delay: 10 }); await wait(600)
    check('and it no longer grows with the words', (await win(fresh.url())).height === 300, (await win(fresh.url())).height)
    // Pointed at, as a person reaches for it: the row under the words comes back from its fade while typing.
    await fresh.mouse.move(260, 120); await wait(400)
    check('the hand on “Auto-size”', (await cursorAt(fresh, 'button[data-small-auto]')) === 'pointer')
    if (await pill.count()) await pill.click()
    await wait(900)
    check('“Auto-size” gives growing back at once', (await win(fresh.url())).height > 300 && (await pill.count()) === 0, (await win(fresh.url())).height)
    // 8. Steps aside when clicked past close by; stays put with its switch off.
    const before = await win(fresh.url())
    await win(fresh.url(), 'screen.getCursorScreenPoint = () => arg; w.isFocused = () => false; w.emit("blur")', { x: before.x + 30, y: before.y + 30 })
    await wait(900)
    const aside = await win(fresh.url(), 'const b = w.getBounds(); return { ...b, area: screen.getDisplayMatching(b).workArea }')
    check('clicked past close by, it steps aside to the far corner', aside.x !== before.x || aside.y !== before.y, JSON.stringify({ before, aside }))
    await fresh.getByRole('button', { name: 'Options' }).first().click({ force: true }); await wait(400)
    const stepLine = fresh.getByRole('menuitemcheckbox', { name: /Steps aside/ })
    check('its menu has “Steps aside”, on', (await stepLine.count()) === 1 && (await stepLine.getAttribute('aria-checked')) === 'true')
    check('and “Collect what I copy”', (await fresh.getByRole('menuitem', { name: /Collect what I copy/ }).count()) === 1)
    check('and “Auto-size”', (await fresh.getByRole('menuitemcheckbox', { name: /Auto-size/ }).count()) === 1)
    for (const [name, at] of [['“Steps aside”', '[role="menuitemcheckbox"]:has-text("Steps aside")'], ['“Collect what I copy”', '[role="menuitem"]:has-text("Collect what I copy")'], ['“Keep on top”', '[role="menuitemcheckbox"]:has-text("Keep on top")']]) {
      const cursor = await cursorAt(fresh, at)
      check(`the hand on its menu's ${name}`, cursor === 'pointer', cursor)
    }
    if (await stepLine.count()) await stepLine.click({ force: true })
    await fresh.keyboard.press('Escape'); await wait(400)
    const still = await win(fresh.url())
    await win(fresh.url(), 'screen.getCursorScreenPoint = () => arg; w.isFocused = () => false; w.emit("blur")', { x: still.x + 30, y: still.y + 30 })
    await wait(900)
    const stayed = await win(fresh.url())
    check('with “Steps aside” off it stays put', stayed.x === still.x && stayed.y === still.y, JSON.stringify({ still, stayed }))
    // 8b. Distilling a report: “Collect what I copy” from its menu, a line copied in another app lands in this note,
    // and Esc stops it with the window still open (qa/collect-copies.mjs's way: the stand-in pasteboard, the app hidden).
    await fresh.mouse.move(200, 40)
    await fresh.getByRole('button', { name: 'Options' }).first().click({ force: true }); await wait(400)
    await fresh.getByRole('menuitem', { name: /^Collect what I copy/ }).click({ force: true }); await wait(800)
    check('“Collect what I copy” in its menu shows the Collecting pill', await fresh.locator('[data-collecting]').isVisible().catch(() => false))
    await electron.evaluate(({ app }) => app.hide()); await wait(400)
    await putOnBoard(electron, 'A line worth keeping from the report'); await wait(1800)
    check('a line copied in another app lands in the small window\'s note', /A line worth keeping from the report/.test(await words(freshId)))
    await electron.evaluate(({ app }) => app.show()); await wait(800)
    await fresh.keyboard.press('Escape'); await wait(600)
    check('Esc stops collecting, and the window stays open', !(await fresh.locator('[data-collecting]').count()) && smalls().includes(fresh))
    // 9. Opened empty and closed empty: nothing left behind.
    await electron.evaluate(() => globalThis.haligtreeChords.get('⌥⌘.')())
    const empty = await until(() => smalls().find((one) => ![first, second, fresh].includes(one)))
    await empty.waitForSelector(EDITOR, { timeout: 15000 })
    const emptyLink = await until(async () => { const at = await holds(empty); return at && at !== 'new' && at })
    const emptyId = (emptyLink ?? '').replace('capture:', '')
    check('an empty one is a capture while it is open', (await words(emptyId)) !== 'null', emptyLink)
    await empty.click('.mf-dots button[aria-label="Close"]', { force: true })
    await until(async () => !smalls().includes(empty))
    await wait(500)
    check('closed empty, its note is gone too: nothing left behind', (await words(emptyId)) === 'null')
    // 10. Kept for the next start: SMALL_PART=restart on the same data reads them back.
    check('a written one closed is kept where it lives (the Inbox)', /Box words/.test(await words(firstId)))
  }
} catch (error) {
  check('the run finished', false, error.message.split('\n')[0])
} finally {
  // Quit as a person does, so the open windows are written down for the next start.
  await electron.evaluate(({ app }) => app.quit()).catch(() => {})
  await wait(1500).catch(() => {})
  await c.close?.()
}
done()
