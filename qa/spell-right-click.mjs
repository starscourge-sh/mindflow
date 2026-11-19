// Spelling is asked one way everywhere there is text: the word with the text round it, of the Mac's own checker
// (the app's native module, no helper process), and a right-click on a word is taken, asked about, and answered
// with its menu whole.
//
//   npx electron-vite build --outDir out-x
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_SHOTS=/some/folder node qa/spell-right-click.mjs
//
// Driven with a real pointer in a note (its block menu), a sticky (no block menu, its own menu drawn by main, a
// text over 5,000 characters) and quick capture:
//   - the pill comes for a misspelt word the caret is put on, and not for a Spanish word in a Spanish sentence
//     (the same word in an English sentence is misspelt, as the red underline has it);
//   - the right-click menu's first frame already has its spelling rows, and nothing lands in it after;
//   - a word spelt right gets no spelling rows: in a sticky the right-click goes on to the sticky's own menu;
//   - the first right-click on a word in a long sticky has its rows (nothing is asked ahead any more);
//   - "Learn spelling" stops the word being flagged at once, in the note and in the sticky, and Undo flags it again.
// A test run learns for the run only: nothing is written to the Mac's dictionary (main's spell-check.ts).
// ONLY=sticky runs the sticky's part alone (its right-clicks, its pill and its own menu), short enough to run many
// times over: the sticky's own menu is the one thing here made by another window, the first time it is asked for.
import { loadavg } from 'os'
import { mkdirSync } from 'node:fs'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'
process.env.HALIGTREE_QA_VIRTUAL ??= '1'

const { check, done } = checks()
const only = process.env.ONLY ?? ''
/** Whether this part runs: all of them, or the one named in ONLY. */
const part = (name) => !only || only === name
const shots = process.env.QA_SHOTS
if (shots) mkdirSync(shots, { recursive: true })
const load = () => `load ${loadavg()[0].toFixed(1)}`
const c = await sandbox({ width: 1280, height: 900 })
const { h, v, electron } = c
const wait = (ms) => h.waitForTimeout(ms)
// MENU_LATE=<ms>: the menu window's page is slow to start, as on a busy Mac. Each step of its drawing is held back
// this long (React draws on a MessageChannel message), so it starts to listen for a menu that long after it has
// loaded. A menu sent the moment the page had loaded was dropped then, and the first right-click in a sticky opened
// nothing: with this set, the sticky's own menu fails every time on a build that does not wait for the page.
const late = Number(process.env.MENU_LATE) || 0
if (late) {
  await electron.context().addInitScript(`if (new URLSearchParams(location.search).get('view') === 'menu') {
    const Real = window.MessageChannel
    window.MessageChannel = class extends Real {
      constructor() {
        super()
        const post = this.port2.postMessage.bind(this.port2)
        this.port2.postMessage = (...args) => setTimeout(() => post(...args), ${late})
      }
    }
  }`)
}
const p = (text) => ({ type: 'paragraph', content: [{ type: 'text', text }] })
const WORDS = [p('Start here and rest a while.'), p('I will recieve it by tomorow.'), p('El gato duerme en la casa porque tiene mucho frío.'), p('The cat duerme on the mat every single day.')]
/** A text past 5,000 characters, the misspelt words in the middle of it. */
const line = (n) => p(`Line ${n}: the quick brown fox jumps over the lazy dog, again and again, until the evening comes.`)
/** A word in bold: its own element in the page, inside the line's. */
const BOLD = { type: 'paragraph', content: [{ type: 'text', text: 'A line with a ' }, { type: 'text', text: 'heavy', marks: [{ type: 'bold' }] }, { type: 'text', text: ' word in it.' }] }
const LONG = [line(1), line(2), ...WORDS, p('We were definately late.'), BOLD, ...Array.from({ length: 60 }, (_, n) => line(n + 3))]

/** The middle of the `nth` place `word` is written in an editor, brought into view first. */
const spot = (pg, sel, word, nth = 0) => pg.evaluate(([sel, word, nth]) => {
  if (!document.querySelector(sel)) return null
  const walk = document.createTreeWalker(document.querySelector(sel), NodeFilter.SHOW_TEXT)
  let node, seen = 0
  while ((node = walk.nextNode())) {
    for (let at = node.textContent.indexOf(word); at >= 0; at = node.textContent.indexOf(word, at + 1)) {
      if (seen++ !== nth) continue
      node.parentElement.scrollIntoView({ block: 'center' })
      const range = document.createRange()
      range.setStart(node, at)
      range.setEnd(node, at + word.length)
      const box = range.getBoundingClientRect()
      return { x: Math.round(box.left + box.width / 2), y: Math.round(box.top + box.height / 2) }
    }
  }
  return null
}, [sel, word, nth])
/** The caret put on a word with the pointer; the pill's words once it is there for that word (waited for up to `ms`). */
const pillOn = async (pg, sel, word, nth = 0, ms = 3000) => {
  // A pill on show hangs under its word, over the line below: a press meant for a word there lands on the pill and
  // takes its fix. So the caret is taken off that word first (up a line, where nothing is misspelt) and the pill
  // seen to go, as a person presses somewhere clear before pressing what the pill covered.
  if (await pg.$('[data-spell-hint]')) {
    await pg.keyboard.press('ArrowUp')
    await pg.waitForSelector('[data-spell-hint]', { state: 'detached', timeout: 3000 }).catch(() => {})
  }
  const at = await spot(pg, sel, word, nth)
  if (!at) return 'no such word'
  await pg.mouse.click(at.x, at.y)
  return pg.waitForSelector(`[data-spell-hint][data-spell-word="${word}"]`, { timeout: ms }).then((one) => one.textContent(), () => null)
}
/** Frames through a change: one about every 50 ms for `ms`, named by when each was taken. */
const film = async (pg, name, ms = 500) => {
  if (!shots) return
  const from = Date.now()
  for (let n = 0; Date.now() - from < ms; n++) await pg.screenshot({ path: `${shots}/${name}-${String(n).padStart(2, '0')}-${Date.now() - from}ms.png` }).catch(() => {})
}
/**
 * A right-click on a word with the pointer. What the page's menu listed the moment it was first on the page (before
 * it was painted), what it lists a while later, and how long after the right-click it came; `first` null with no
 * menu. With `name`, frames are kept through the opening.
 */
const rightClick = async (pg, sel, word, nth = 0, settle = 700, name = '') => {
  const at = await spot(pg, sel, word, nth)
  if (!at) return { first: null, later: null, ms: null }
  await pg.evaluate(() => {
    const read = () => [...document.querySelectorAll('[role="menu"] .tiptap-slash-menu-group, [role="menu"] [role="menuitem"]')].map((one) => one.textContent.trim())
    const seen = (window.__menu = { first: null, ms: null, asked: 0, read })
    addEventListener('contextmenu', () => (seen.asked = performance.now()), { capture: true, once: true })
    const watch = (seen.watch = new MutationObserver(() => {
      if (seen.first || !document.querySelector('[role="menu"]')) return
      seen.first = read()
      seen.ms = Math.round(performance.now() - seen.asked)
      watch.disconnect()
    }))
    watch.observe(document.body, { childList: true, subtree: true })
  })
  await pg.mouse.click(at.x, at.y, { button: 'right' })
  if (name && shots) await film(pg, name, settle)
  else await pg.waitForTimeout(settle)
  return pg.evaluate(() => (window.__menu.watch.disconnect(), { first: window.__menu.first, later: document.querySelector('[role="menu"]') ? window.__menu.read() : null, ms: window.__menu.ms }))
}
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)
const shut = async (pg) => { await pg.keyboard.press('Escape'); await pg.waitForTimeout(250) }
/**
 * Main's own menu window (a sticky's menu), whether it is open and what it lists. Waited for up to 12 s: the menu's
 * window is made the first time a menu is asked for, and its page takes seconds to load on a busy machine.
 */
const ownMenu = async () => {
  let seen = { open: false, rows: [], page: null }
  for (let i = 0; i < 120; i++) {
    const state = await electron.evaluate(() => globalThis.qaPopupMenu ?? {})
    const page = electron.windows().find((one) => one.url().includes('view=menu'))
    if (state.open && page) {
      const rows = await page.$$eval('[data-popup-menu] [role^="menuitem"]', (all) => all.map((one) => (one.getAttribute('aria-label') || one.textContent).trim())).catch(() => [])
      seen = { open: true, rows, page }
      if (rows.length) return seen
    }
    await wait(100)
  }
  return seen
}

try {
  await v('settings:set', { sounds: false, hintRate: 0, stickiesGlass: false })
  const ED = '[data-open] .tiptap'
  if (part('note')) {
    const id = await v('article:new')
    await v('item:save', id, { title: 'Spelling everywhere', body: { type: 'doc', content: WORDS } })
    await c.send('article', id)
    await h.waitForSelector(ED, { timeout: 20000 })
    await h.evaluate((sel) => document.querySelector(sel).editor.commands.focus('start'), ED)
    await h.waitForFunction((sel) => document.querySelector(sel)?.spellcheck === true, ED, { timeout: 10000 }).catch(() => {})
    await wait(1500)

    // A note: the pill, the block menu with its spelling rows, another language, a word spelt right.
    for (const look of ['light', 'dark']) {
      await c.look(look)
      const at = await spot(h, ED, 'recieve')
      await h.mouse.click(at.x, at.y)
      await film(h, `note-pill-${look}`)
      const pill = await h.waitForSelector('[data-spell-hint][data-spell-word="recieve"]', { timeout: 3000 }).then((one) => one.evaluate((el) => ({ text: el.textContent, left: Math.round(el.getBoundingClientRect().left), top: Math.round(el.getBoundingClientRect().top) })), () => null)
      await wait(400)
      const after = await h.evaluate(() => { const el = document.querySelector('[data-spell-hint]'); return el ? { text: el.textContent, left: Math.round(el.getBoundingClientRect().left), top: Math.round(el.getBoundingClientRect().top) } : null })
      check(`note, ${look}: the caret put on “recieve” brings the pill with “receive”, and the pill does not move after`, /receive/.test(pill?.text ?? '') && same(pill, after), `${JSON.stringify(pill)} then ${JSON.stringify(after)}`)
      if (shots) await h.screenshot({ path: `${shots}/note-pill-${look}.png` })
      const menu = await rightClick(h, ED, 'tomorow', 0, 700, `note-menu-${look}`)
      if (shots) await h.screenshot({ path: `${shots}/note-menu-${look}.png` })
      check(`note, ${look}: the right-click menu's first frame is whole: “Spelling”, “tomorrow”, its other rows, and nothing lands after`, menu.first?.[0] === 'Spelling' && menu.first?.[1] === 'tomorrow' && same(menu.first, menu.later), `first seen ${menu.ms} ms after the right-click [${load()}]; first ${JSON.stringify(menu.first?.slice(0, 8))}; later ${JSON.stringify(menu.later?.slice(0, 8))}`)
      check(`note, ${look}: the spelling rows end with “Learn spelling”`, !!menu.first?.includes('Learn spelling'), JSON.stringify(menu.first?.slice(0, 8)))
      await shut(h)
    }
    await c.look('light')
    check('note: a Spanish word in a Spanish sentence gets no pill (“duerme” in “El gato duerme en la casa…”)', (await pillOn(h, ED, 'duerme', 0, 1800)) === null)
    const spanish = await rightClick(h, ED, 'duerme', 0)
    check('note: and no spelling rows on its right-click (the block menu opens without them)', !!spanish.later && !spanish.later.includes('Spelling'), JSON.stringify(spanish.later?.slice(0, 5)))
    await shut(h)
    const english = await rightClick(h, ED, 'duerme', 1)
    check('note: the same word in an English sentence is misspelt (“The cat duerme on the mat…”): “Spelling” heads its menu', english.first?.[0] === 'Spelling' && same(english.first, english.later), JSON.stringify(english.first?.slice(0, 5)))
    await shut(h)
    const right = await rightClick(h, ED, 'Start')
    check('note: a word spelt right gets the block menu without spelling rows', !!right.later?.length && !right.later.includes('Spelling'), JSON.stringify(right.later?.slice(0, 4)))
    await shut(h)
  }

  // A sticky: no block menu, its own menu drawn by main, and a text past 5,000 characters.
  let sticky = null
  const SW = '.sticky-text .tiptap[contenteditable="true"]'
  /** The sticky's words open for writing (E), if they are not already. */
  const writeIn = async () => {
    await sticky.bringToFront()
    if (await sticky.evaluate((sel) => !!document.querySelector(sel), SW)) return
    await sticky.locator('.sticky-text').click()
    await sticky.keyboard.press('e')
    await sticky.waitForSelector(SW, { timeout: 10000 })
    await sticky.waitForFunction((sel) => document.querySelector(sel)?.spellcheck === true, SW, { timeout: 10000 }).catch(() => {})
    await sticky.waitForTimeout(1500)
  }
  if (part('sticky')) {
    const long = LONG.map((one) => one.content.map((part) => part.text).join('')).join('\n').length
    const note = await h.evaluate((body) => window.api.captures.create({ title: 'Long sticky', body: { type: 'doc', content: body } }), LONG)
    await h.evaluate((one) => window.api.stick('capture', one, true), note)
    for (let i = 0; i < 60 && !sticky; i++) (sticky = electron.windows().find((one) => one.url().includes('view=sticky') && one.url().includes(note))), await wait(250)
    check('a sticky is up', !!sticky)
    if (sticky) {
      await sticky.waitForSelector('.sticky-text', { timeout: 20000 })
      await writeIn()
      // Its first right-click on a misspelt word, the pointer never having rested on the words: nothing was asked ahead.
      const first = await rightClick(sticky, SW, 'tomorow')
      if (shots) await sticky.screenshot({ path: `${shots}/sticky-menu.png` })
      check(`sticky, ${long} characters: the first right-click on “tomorow” has its spelling rows, whole in the first frame`, first.first?.[0] === 'Spelling' && first.first?.[1] === 'tomorrow' && same(first.first, first.later), `first seen ${first.ms} ms after the right-click [${load()}]; ${JSON.stringify(first.first?.slice(0, 8))}`)
      // Its row is pressed with the pointer: the word is put right and the sticky is still being written in.
      await sticky.locator('[role="menu"] [role="menuitem"]', { hasText: /^tomorrow$/ }).first().click({ timeout: 3000 }).catch(() => {})
      await sticky.waitForTimeout(400)
      const fixed = await sticky.evaluate((sel) => ({ writing: !!document.querySelector(sel), text: document.querySelector('.sticky-text')?.innerText ?? '' }), SW)
      check('sticky: a press on its row puts the word right, and the sticky is still being written in', fixed.writing && fixed.text.includes('it by tomorrow.'), `still writing: ${fixed.writing}; ${JSON.stringify(fixed.text.slice(fixed.text.indexOf('I will'), fixed.text.indexOf('I will') + 40))}`)
      // Esc closes the menu alone: the writing stays open (one layer at a time).
      const again = await rightClick(sticky, SW, 'recieve')
      await sticky.keyboard.press('Escape')
      await sticky.waitForTimeout(400)
      const escaped = await sticky.evaluate((sel) => ({ writing: !!document.querySelector(sel), menu: !!document.querySelector('[role="menu"]') }), SW)
      check('sticky: Esc closes the spelling menu and nothing else: the sticky is still being written in', again.first?.[0] === 'Spelling' && escaped.writing && !escaped.menu, JSON.stringify({ rows: again.first?.slice(0, 3), ...escaped }))
      check('sticky: the caret put on “recieve” brings the pill with “receive”', /receive/.test((await pillOn(sticky, SW, 'recieve')) ?? ''))
      check('sticky: a Spanish word in a Spanish sentence gets no pill', (await pillOn(sticky, SW, 'duerme', 0, 1800)) === null)
      // The pill pressed with the pointer: it is drawn at the foot of the page, outside the card, and the press
      // counted as a press off the sticky, which ended the writing before the word was put right.
      await pillOn(sticky, SW, 'definately')
      const pillAt = await sticky.evaluate(() => { const box = document.querySelector('[data-spell-hint][data-spell-word="definately"]')?.getBoundingClientRect(); return box ? { x: Math.round(box.left + 12), y: Math.round(box.top + box.height / 2) } : null })
      if (pillAt) await sticky.mouse.click(pillAt.x, pillAt.y)
      await sticky.waitForTimeout(400)
      const pressed = await sticky.evaluate((sel) => ({ writing: !!document.querySelector(sel), text: document.querySelector('.sticky-text')?.innerText ?? '' }), SW)
      check('sticky: a press on the pill puts the word right (“definately” to “definitely”), and the sticky is still being written in', !!pillAt && pressed.writing && pressed.text.includes('We were definitely late.'), `the pill was there: ${!!pillAt}; still writing: ${pressed.writing}; ${JSON.stringify(pressed.text.slice(pressed.text.indexOf('We were'), pressed.text.indexOf('We were') + 26))}`)
      // Spelt right: nothing of the words' own to show, so the right-click goes on to the sticky's own menu.
      const plain = await rightClick(sticky, SW, 'quick', 0, 300)
      const own = await ownMenu()
      check('sticky: a right-click on a word spelt right opens the sticky\'s own menu (“Take it down” in it), no spelling menu', own.open && own.rows.some((row) => /Take it down/.test(row)) && !plain.later, `page menu ${JSON.stringify(plain.later)}; own menu ${JSON.stringify(own.rows.slice(0, 6))}`)
      check('sticky: its own menu has the writing\'s “Paste” first (asked from words you can write in)', own.rows.some((row) => /^Paste/.test(row)), JSON.stringify(own.rows.slice(0, 4)))
      if (own.page) { await own.page.keyboard.press('Escape'); await wait(400) }
      // The same on a word in bold, which is an element of its own inside the line: the right-click is passed on
      // from the element it landed on, and still reaches the sticky's menu.
      await writeIn()
      const bold = await rightClick(sticky, SW, 'heavy', 0, 300)
      const again2 = await ownMenu()
      check('sticky: a right-click on a word in bold, spelt right, opens the sticky\'s own menu too', again2.open && again2.rows.some((row) => /Take it down/.test(row)) && !bold.later, `page menu ${JSON.stringify(bold.later)}; own menu ${JSON.stringify(again2.rows.slice(0, 4))}`)
      if (again2.page) { await again2.page.keyboard.press('Escape'); await wait(400) }
    }
  }

  // "Learn spelling": at once, in the window it was learnt in and in the other.
  if (!only) {
    await h.bringToFront()
    check('note: before it is learnt, “recieve” has its pill', /receive/.test((await pillOn(h, ED, 'recieve')) ?? ''))
    await rightClick(h, ED, 'recieve')
    await h.locator('[role="menu"] [data-learn-spelling]').first().click({ timeout: 3000 }).catch(() => {})
    await wait(300)
    const said = await h.evaluate(() => /Learnt “recieve”/.test(document.body.innerText))
    check('“Learn spelling” says so, with the way back (“Learnt “recieve”…”, Undo)', said && (await h.locator('button', { hasText: /Undo/ }).count()) > 0)
    if (shots) await h.screenshot({ path: `${shots}/note-learnt.png` })
    check('note: learnt, “recieve” is no longer flagged: no pill with the caret on it', (await pillOn(h, ED, 'recieve', 0, 1800)) === null)
    const learnt = await rightClick(h, ED, 'recieve')
    check('note: and no spelling rows on its right-click', !!learnt.later && !learnt.later.includes('Spelling'), JSON.stringify(learnt.later?.slice(0, 4)))
    await shut(h)
    if (sticky) {
      await writeIn()
      check('sticky (another window): “recieve” is no longer flagged there either', (await pillOn(sticky, SW, 'recieve', 0, 1800)) === null)
      const there = await rightClick(sticky, SW, 'recieve', 0, 400)
      const theirs = await ownMenu()
      check('sticky: and its right-click has no spelling rows any more (the sticky\'s own menu comes instead)', !there.later && theirs.open, `page menu ${JSON.stringify(there.later)}; own menu open: ${theirs.open}`)
      if (theirs.page) { await theirs.page.keyboard.press('Escape'); await wait(400) }
      await h.bringToFront()
    }
    // Undo, from the notice.
    await rightClick(h, ED, 'tomorow')
    await h.locator('[role="menu"] [data-learn-spelling]').first().click({ timeout: 3000 }).catch(() => {})
    await wait(300)
    await h.locator('button', { hasText: /Undo/ }).first().click({ timeout: 3000 }).catch(() => {})
    await wait(400)
    const undone = await rightClick(h, ED, 'tomorow')
    check('Undo on the notice: “tomorow” is flagged again, its rows back at the head of the menu', undone.first?.[0] === 'Spelling' && undone.first?.[1] === 'tomorrow', JSON.stringify(undone.first?.slice(0, 4)))
    await shut(h)
  }

  // Quick capture, in its own window.
  if (part('box')) {
    const box = c.page
    const BOX = '.tiptap.ProseMirror.haligtree-editor:not(.is-line):not(.is-plain)'
    await box.evaluate(() => window.api.showPrompt())
    await box.waitForTimeout(800)
    await box.bringToFront()
    await box.evaluate(([sel, body]) => document.querySelector(sel).editor.chain().focus().setContent({ type: 'doc', content: body }).run(), [BOX, [p('It is definately here by wendsday.')]])
    await box.waitForTimeout(1500)
    const boxPill = await pillOn(box, BOX, 'definately')
    check('quick capture: the caret put on “definately” brings the pill with “definitely”', /definitely/.test(boxPill ?? ''), `${JSON.stringify(boxPill)}; the box has the keys: ${await box.evaluate(() => document.hasFocus())}`)
    if (shots) await box.screenshot({ path: `${shots}/box-pill.png` })
    const boxMenu = await rightClick(box, BOX, 'definately')
    if (shots) await box.screenshot({ path: `${shots}/box-menu.png` })
    check('quick capture: the right-click menu\'s first frame is whole, “Spelling” and “definitely” first', boxMenu.first?.[0] === 'Spelling' && boxMenu.first.includes('definitely') && same(boxMenu.first, boxMenu.later), `first seen ${boxMenu.ms} ms after the right-click [${load()}]; ${JSON.stringify(boxMenu.first?.slice(0, 6))}`)
    await shut(box)
    const boxPlain = await rightClick(box, BOX, 'here')
    check('quick capture: a word spelt right gets the block menu without spelling rows', !!boxPlain.later?.length && !boxPlain.later.includes('Spelling'), JSON.stringify(boxPlain.later?.slice(0, 4)))
    await shut(box)
  }

  // What main says: asked of the checker in the app itself, and no helper process beside the app. How long an ask
  // held main is printed, not judged: this probe is not a timing run (qa/main-busy.mjs, run alone, holds the bar).
  const table = await electron.evaluate(() => globalThis.mainStalls?.())
  const row = table?.rows.find((one) => one.name === 'spell:check')
  const wake = table?.rows.find((one) => one.name === 'spell:wake')
  check('main answered every spelling question itself, in the app (spell:check)', !!row && row.calls > 0, row ? `${row.calls} asks, ${(row.ms / row.calls).toFixed(2)} ms each on average, worst ${row.worst} ms; waking the checker after launch took ${wake?.worst ?? '?'} ms [${load()}]` : 'no spell:check row')
  check('no script interpreter runs beside the app (no osascript among its children)', !(await electron.evaluate(() => process.getBuiltinModule('child_process').execFileSync('/bin/ps', ['-axo', 'ppid=,command=']).toString().split('\n').some((line) => line.trim().startsWith(`${process.pid} `) && /osascript/.test(line)))))
} catch (error) {
  check('ran without throwing', false, String(error?.stack ?? error))
} finally {
  await c.close()
  done()
}
