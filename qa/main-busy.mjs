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
//   3. with a right-click on another misspelt word 600 ms into the hold.
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
const arm = (then, after) => h.evaluate(([sel, then, after]) => {
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
}, [ED, then, after])
/** Hold main's own thread for BUSY ms, then read the page's beat: its longest silence, and when in the hold it did its part. */
async function hold() {
  const held = await electron.evaluate((_, ms) => { const from = Date.now(); while (Date.now() - from < ms) { /* held */ } return { from, to: Date.now() } }, BUSY)
  await h.waitForTimeout(300)
  const beat = await h.evaluate(() => { window.__beat.on = false; return window.__beat })
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

  // And what main says of it: the questions were asked without waiting, and none of the page's waiting calls ran.
  const table = await electron.evaluate(() => globalThis.mainStalls?.())
  const calls = (name) => table?.rows.find((row) => row.name === name)?.calls ?? 0
  check('the spelling was asked of main without waiting (spell:guesses), and nothing held main for 50 ms or more but the probe itself', calls('spell:guesses') > 0 && (table?.slow ?? []).length === 0, `spell:guesses ${calls('spell:guesses')} calls; named stalls: ${JSON.stringify(table?.slow ?? null).slice(0, 200)}`)
  check('no window asked main for the book or the clock with a call that waits', calls('book:here') === 0 && calls('clock:twelve') === 0 && calls('qa:quiet') === 0, `book:here ${calls('book:here')}, clock:twelve ${calls('clock:twelve')}, qa:quiet ${calls('qa:quiet')}`)
} finally {
  await c.close()
}
done()
