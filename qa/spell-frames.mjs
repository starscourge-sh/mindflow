// Frames of the spelling pill and the right-click menu arriving, to look at by eye: the spelling is asked without
// waiting now (the answer comes a moment after the caret or the click), so nothing may flicker, jump or land late.
//
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_SHOTS=dir node qa/spell-frames.mjs
//
// Writes pill-NN.png (the caret stepped onto “recieve” with ←, a frame about every 50 ms for 0.7 s) and
// menu-NN.png (a right-click on “tomorow”, the same), in light and in dark, and prints when each first showed.
import { mkdirSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const { check, done } = checks()
const dir = process.env.QA_SHOTS ?? join(tmpdir(), 'spell-frames')
mkdirSync(dir, { recursive: true })
const ED = '[data-open] .tiptap'
const c = await sandbox({ width: 1100, height: 760 })
const { h, v, look } = c
const p = (text) => ({ type: 'paragraph', content: [{ type: 'text', text }] })

/** A frame about every 50 ms for `ms`, each named with the time since `from`; says when `sel` first showed. */
async function film(name, ms, sel) {
  const from = Date.now()
  let first = null
  for (let n = 0; Date.now() - from < ms; n++) {
    const at = Date.now() - from
    if (first === null && (await h.evaluate((sel) => !!document.querySelector(sel), sel))) first = at
    await h.screenshot({ path: join(dir, `${name}-${String(n).padStart(2, '0')}-${at}ms.png`), clip: { x: 180, y: 60, width: 760, height: 420 } })
    const left = 50 - ((Date.now() - from) % 50)
    await h.waitForTimeout(left)
  }
  return first
}

try {
  await v('settings:set', { sounds: false, hintRate: 0 })
  const id = await v('article:new')
  await v('item:save', id, { title: 'Spelling', body: { type: 'doc', content: [p('Start here and rest a while.'), p('I will recieve it by friday.'), p('It is definately tomorow.')] } })
  await c.send('article', id)
  await h.waitForSelector(ED, { timeout: 20000 })
  for (const theme of ['light', 'dark']) {
    await look(theme)
    // The caret at the end of “recieve”, one ← from inside it: the pill is asked for and placed on that key.
    await h.evaluate((sel) => {
      const ed = document.querySelector(sel).editor
      let at = -1
      ed.state.doc.descendants((node, pos) => { if (node.isText && node.text.includes('recieve')) at = pos + node.text.indexOf('recieve') + 'recieve'.length + 1 })
      ed.chain().focus().setTextSelection(at).run()
    }, ED)
    await h.waitForFunction((sel) => document.querySelector(sel)?.spellcheck === true, ED, { timeout: 10000 }).catch(() => {})
    await h.waitForTimeout(1500)
    await h.keyboard.press('ArrowLeft'); await h.keyboard.press('ArrowLeft')
    const pill = await film(`pill-${theme}`, 700, '[data-spell-hint]')
    check(`${theme}: the pill shows after ← onto “recieve”`, pill !== null, `first seen ${pill} ms after the key`)
    // A right-click on “tomorow” (never asked about before the first round): the menu, its spelling rows first.
    const spot = await h.evaluate((sel) => {
      const ed = document.querySelector(sel).editor
      let at = -1
      ed.state.doc.descendants((node, pos) => { if (node.isText && node.text.includes('tomorow')) at = pos + node.text.indexOf('tomorow') + 3 })
      const box = ed.view.coordsAtPos(at)
      return { x: box.left + 1, y: (box.top + box.bottom) / 2 }
    }, ED)
    await h.mouse.click(spot.x, spot.y, { button: 'right' })
    const menu = await film(`menu-${theme}`, 700, '[role="menu"]')
    const rows = await h.evaluate(() => [...document.querySelectorAll('[role="menu"] .tiptap-slash-menu-group, [role="menu"] [role="menuitem"]')].slice(0, 2).map((one) => one.textContent.trim()))
    check(`${theme}: the right-click menu shows, “Spelling” and “tomorrow” first`, menu !== null && rows[0] === 'Spelling' && rows[1] === 'tomorrow', `first seen ${menu} ms after the click; ${JSON.stringify(rows)}`)
    await h.keyboard.press('Escape')
    await h.waitForSelector('[role="menu"]', { state: 'detached', timeout: 3000 }).catch(() => {})
  }
  console.log(`frames in ${dir}`)
} finally {
  await c.close()
}
done()
