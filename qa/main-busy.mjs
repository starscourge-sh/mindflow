// A busy main process never freezes a window: the page keeps its beat while
// main's one thread is held, even with the caret moving onto a misspelt word.
//
//   npx electron-vite build --outDir out-x
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/main-busy.mjs
//
// The worst freezes were two things multiplying. The main process held its
// thread for seconds (the old name matcher took 10.8 s on a 930,000 character
// note), and the page made a call that waits for main to answer: the spelling
// pill asked Chromium `webFrame.isWordMisspelled` at every caret move. Each
// such call froze the window for as long as main stayed busy.
//
// This holds main's thread for BUSY ms (3000), a known time, three times:
//   1. with nothing asked of the page: the window should keep painting;
//   2. with the caret moved onto a misspelt word 600 ms into the hold;
//   3. with a right-click on another misspelt word 600 ms into the hold;
//   4. and 5. the same right-click in a sticky and in quick capture, each in its own window.
// The page's own timer and its frames are its beat: the longest stretch with
// neither is how long it could not paint or take a key (keys reach a window
// through main, so none can be sent while main is held: a page that beats
// takes the key the moment main hands it over). Then, main free again: the
// pill is on the word with its fix, Tab takes it, and the right-click menu
// came up whole, its spelling rows first, and a row puts the word right.
import { loadavg } from 'os'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'
process.env.HALIGTREE_QA_VIRTUAL ??= '1'

const { check, done } = checks()
const BUSY = Number(process.env.BUSY ?? 3000)
/** A stretch this long without a beat is a freeze a person feels (the same bar as never-freezes.mjs). */
const BLOCK_MS = Number(process.env.BLOCK_MS ?? 100)
const load = () => `load ${loadavg()[0].toFixed(1)}`
const ED = '[data-open] .tiptap'
const c = await sandbox({ width: 1280, height: 900 })
const { h, v, electron } = c
const p = (text) => ({ type: 'paragraph', content: [{ type: 'text', text }] })

/** Start the page's beat (a timer every 10 ms and every frame), and do `then` in the page `after` ms on. */
const arm = (then, after, pg = h, sel = ED) => pg.evaluate(([sel, then, after]) => {
  const beat = (window.__beat = { last: performance.now(), worst: 0, at: 0, did: null, on: true })
  const tick = () => {
    const now = performance.now()
    if (now - beat.last > beat.worst) (beat.worst = now - beat.last), (beat.at = beat.last)
    beat.last = now
  }
  const timer = () => { if (beat.on) (tick(), setTimeout(timer, 10)) }
  const frame = () => { if (beat.on) (tick(), requestAnimationFrame(frame)) }
  timer(); frame()
  if (!then) return
  setTimeout(() => {
    const ed = document.querySelector(sel).editor
    // Where a word is in the note: the middle of its letters.
    const middle = (word) => { let at = -1; ed.state.doc.descendants((node, pos) => { if (node.isText && node.text.includes(word)) at = pos + node.text.indexOf(word) + 3 }); return at }
    beat.did = Date.now()
    if (then.caret) ed.chain().focus().setTextSelection(middle(then.caret)).run()
    if (then.menu) {
      const spot = ed.view.coordsAtPos(middle(then.menu))
      ed.view.dom.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: spot.left + 1, clientY: (spot.top + spot.bottom) / 2, button: 2 }))
    }
  }, after)
}, [sel, then, after])
/** Hold main's own thread for BUSY ms, then read the page's beat: its longest silence, and when in the hold it did its part. */
async function hold(pg = h) {
  const held = await electron.evaluate((_, ms) => { const from = Date.now(); while (Date.now() - from < ms) { /* held */ } return { from, to: Date.now() } }, BUSY)
  await pg.waitForTimeout(300)
  const beat = await pg.evaluate(() => { window.__beat.on = false; return window.__beat })
  return { silent: Math.round(beat.worst), into: beat.did ? beat.did - held.from : null, held: held.to - held.from }
}

try {
  await v('settings:set', { sounds: false, hintRate: 0 })
  const id = await v('article:new')
  await v('item:save', id, { title: 'Spelling', body: { type: 'doc', content: [p('Start here and rest a while.'), p('I will recieve it by friday.'), p('It is definately tomorow.')] } })
  await c.send('article', id)
  await h.waitForSelector(ED, { timeout: 20000 })
  await h.evaluate((sel) => document.querySelector(sel).editor.commands.focus('start'), ED)
  // Its spellcheck is on from a pause after it opens (the squiggles come then).
  await h.waitForFunction((sel) => document.querySelector(sel)?.spellcheck === true, ED, { timeout: 10000 }).catch(() => {})
  await h.waitForTimeout(1500)

  await arm(null, 0)
  const idle = await hold()
  check(`main held ${idle.held} ms, nothing asked of the page: the window keeps its beat (no ${BLOCK_MS} ms without a frame or a timer)`, idle.silent < BLOCK_MS, `longest silence ${idle.silent} ms  [${load()}]`)

  await arm({ caret: 'recieve' }, 600)
  const caret = await hold()
  check(`main held ${caret.held} ms, the caret moved onto a misspelt word ${caret.into} ms in: the window keeps its beat`, caret.into > 0 && caret.into < BUSY && caret.silent < BLOCK_MS, `longest silence ${caret.silent} ms  [${load()}]`)
  // Main free again: what a person sees is as it was, the pill under the word with its fix, and Tab takes it.
  const pill = await h.waitForSelector('[data-spell-hint]', { timeout: 6000 }).then((one) => one.evaluate((el) => ({ fix: el.textContent, word: el.getAttribute('data-spell-word') })), () => null)
  check('main free again: the pill is on “recieve” and offers “receive”', pill?.word === 'recieve' && /receive/.test(pill?.fix ?? ''), JSON.stringify(pill))
  await h.keyboard.press('Tab')
  await h.waitForFunction((sel) => document.querySelector(sel).innerText.includes('I will receive it'), ED, { timeout: 3000 }).catch(() => {})
  check('Tab takes the fix', await h.evaluate((sel) => document.querySelector(sel).innerText.includes('I will receive it'), ED))

  await arm({ menu: 'tomorow' }, 600)
  const menu = await hold()
  check(`main held ${menu.held} ms, a right-click on a misspelt word ${menu.into} ms in: the window keeps its beat`, menu.into > 0 && menu.into < BUSY && menu.silent < BLOCK_MS, `longest silence ${menu.silent} ms  [${load()}]`)
  // The menu came up whole once main answered: its spelling rows are its first.
  const rows = await h.waitForSelector('[role="menu"]', { timeout: 6000 }).then(() => h.evaluate(() => [...document.querySelectorAll('[role="menu"] .tiptap-slash-menu-group, [role="menu"] [role="menuitem"]')].slice(0, 3).map((one) => one.textContent.trim())), () => null)
  check('main free again: the right-click menu is up, “Spelling” and “tomorrow” first', rows?.[0] === 'Spelling' && rows?.[1] === 'tomorrow', JSON.stringify(rows))
  await h.locator('[role="menu"] [role="menuitem"]', { hasText: /^tomorrow$/ }).first().click().catch(() => {})
  await h.waitForFunction((sel) => document.querySelector(sel).innerText.includes('definately tomorrow.'), ED, { timeout: 3000 }).catch(() => {})
  check('its row puts the word right', await h.evaluate((sel) => document.querySelector(sel).innerText.includes('definately tomorrow.'), ED), await h.evaluate((sel) => document.querySelector(sel).innerText.slice(0, 120), ED))

  // The same right-click where the words have no block menu (a sticky, its own window) and in quick capture.
  const words = [p('Start here and rest a while.'), p('It is definately tomorow.')]
  const spellingRows = (pg) => pg.waitForSelector('[role="menu"]', { timeout: 6000 }).then(() => pg.evaluate(() => [...document.querySelectorAll('[role="menu"] .tiptap-slash-menu-group, [role="menu"] [role="menuitem"]')].slice(0, 3).map((one) => one.textContent.trim())), () => null)
  const note = await h.evaluate((body) => window.api.captures.create({ title: 'Busy sticky', body: { type: 'doc', content: body } }), words)
  await h.evaluate((one) => window.api.stick('capture', one, true), note)
  let sticky = null
  for (let i = 0; i < 60 && !sticky; i++) (sticky = electron.windows().find((one) => one.url().includes('view=sticky') && one.url().includes(note))), await h.waitForTimeout(250)
  check('a sticky is up', !!sticky)
  if (sticky) {
    const WORDS = '.sticky-text .tiptap[contenteditable="true"]'
    await sticky.waitForSelector('.sticky-text', { timeout: 20000 })
    await sticky.bringToFront()
    await sticky.locator('.sticky-text').click()
    await sticky.keyboard.press('e')
    await sticky.waitForSelector(WORDS, { timeout: 10000 })
    await sticky.waitForTimeout(1500)
    await arm({ menu: 'tomorow' }, 600, sticky, WORDS)
    const stuck = await hold(sticky)
    check(`main held ${stuck.held} ms, a right-click on a misspelt word in a sticky ${stuck.into} ms in: the sticky keeps its beat`, stuck.into > 0 && stuck.into < BUSY && stuck.silent < BLOCK_MS, `longest silence ${stuck.silent} ms  [${load()}]`)
    const got = await spellingRows(sticky)
    check('main free again: the sticky\'s spelling menu is up, “Spelling” and “tomorrow” first', got?.[0] === 'Spelling' && got?.[1] === 'tomorrow', JSON.stringify(got))
    await sticky.keyboard.press('Escape')
  }
  const box = c.page
  const BOX = '.tiptap.ProseMirror.haligtree-editor:not(.is-line)'
  await box.evaluate(() => window.api.showPrompt())
  await box.waitForTimeout(800)
  await box.evaluate(([sel, body]) => document.querySelector(sel).editor.chain().focus().setContent({ type: 'doc', content: body }).run(), [BOX, words])
  await box.waitForTimeout(1500)
  await arm({ menu: 'tomorow' }, 600, box, BOX)
  const boxed = await hold(box)
  check(`main held ${boxed.held} ms, a right-click on a misspelt word in quick capture ${boxed.into} ms in: the box keeps its beat`, boxed.into > 0 && boxed.into < BUSY && boxed.silent < BLOCK_MS, `longest silence ${boxed.silent} ms  [${load()}]`)
  const boxRows = await spellingRows(box)
  check('main free again: quick capture\'s menu is up, “Spelling” and “tomorrow” first', boxRows?.[0] === 'Spelling' && boxRows?.[1] === 'tomorrow', JSON.stringify(boxRows))
  await box.keyboard.press('Escape')

  // And what main says of it: the questions were asked without waiting, and none of the page's waiting calls ran.
  const table = await electron.evaluate(() => globalThis.mainStalls?.())
  const calls = (name) => table?.rows.find((row) => row.name === name)?.calls ?? 0
  // The answer is worked out on main's own thread (the Mac's checker, in the app): none of the asks may hold it 50 ms.
  // What else held it that long is named beside the result (a sticky's window being made, the sandbox still being
  // laid down), for whoever is looking at main's stalls: it is not this probe's to judge.
  const spell = table?.rows.find((row) => row.name === 'spell:check')
  const others = (table?.slow ?? []).filter((one) => one.name !== 'spell:check').map((one) => `${one.name} ${one.ms} ms`)
  check('the spelling was asked of main without waiting (spell:check), and no ask held main for 50 ms or more', !!spell && spell.calls > 0 && spell.slow === 0, `spell:check ${calls('spell:check')} calls${spell ? `, ${(spell.ms / Math.max(1, spell.calls)).toFixed(1)} ms each on average, worst ${spell.worst} ms` : ''} [${load()}]; other named stalls of 50 ms or more: ${others.join(', ') || 'none'}`)
  check('no script interpreter runs beside the app for spelling (no osascript among its children)', !(await electron.evaluate(() => process.getBuiltinModule('child_process').execFileSync('/bin/ps', ['-axo', 'ppid=,command=']).toString().split('\n').some((line) => line.trim().startsWith(`${process.pid} `) && /osascript/.test(line)))))
  check('no window asked main for the book or the clock with a call that waits', calls('book:here') === 0 && calls('clock:twelve') === 0 && calls('qa:quiet') === 0, `book:here ${calls('book:here')}, clock:twelve ${calls('clock:twelve')}, qa:quiet ${calls('qa:quiet')}`)
} finally {
  await c.close()
}
done()
