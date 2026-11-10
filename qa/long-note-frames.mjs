// Frames through select-all, delete-all and Undo in the 3,100-block note
// (one every ~50ms for 1.5s after each), the changed pieces at the smallest
// window (560 x 400), and the stillness of the tag strip as the note opens.
// Writes pictures to QA_SHOTS; prints what moved.
import { sandbox } from './sandbox-lib.mjs'
import { bigDoc, openTimed, p, code, card, table } from './long-note-doc.mjs'

const SHOTS = process.env.QA_SHOTS
const c = await sandbox({ width: 1280, height: 860 })
const { h, v } = c
const fails = []
const film = async (name, act) => {
  const t0 = Date.now()
  const pending = act()
  let i = 0
  while (Date.now() - t0 < 1500) {
    const at = Date.now()
    await h.screenshot({ path: `${SHOTS}/frame-${name}-${String(i++).padStart(2, '0')}.png`, timeout: 60000 }).catch(() => {})
    const left = 50 - (Date.now() - at)
    if (left > 0) await h.waitForTimeout(left)
  }
  await pending
  console.log(`${name}: ${i} frames in ${Date.now() - t0}ms`)
}
try {
  await v('settings:set', { sounds: false, hintRate: 0 })
  // Stillness: the tag strip, "Add property" and the first line, every frame while a note with 60 tags opens.
  const tags = await v('article:new')
  await v('item:save', tags, { body: { type: 'doc', content: [p('Tags'), p(...Array.from({ length: 60 }, (_, i) => `#tag-number-${i} `))] } })
  await h.evaluate(() => { window.__boxes = []; const tick = () => { const at = (sel) => { const r = document.querySelector(sel)?.getBoundingClientRect(); return r ? `${Math.round(r.left)},${Math.round(r.top)},${Math.round(r.width)},${Math.round(r.height)}` : '-' }; window.__boxes.push([at('[data-open] [data-property="tags"]'), at('[data-open] .ProseMirror > p')].join(' ')); if (window.__boxes.length < 120) requestAnimationFrame(tick) }; requestAnimationFrame(tick) })
  await c.send('article', tags)
  await h.waitForTimeout(2500)
  const boxes = await h.evaluate(() => window.__boxes.filter((one) => !one.includes('-')))
  const moves = new Set(boxes).size
  console.log(`stillness: ${boxes.length} frames with the strip shown, ${moves} different placements`, [...new Set(boxes)].slice(0, 4))
  if (moves > 1) fails.push(`the tag strip or the first line moved after showing: ${[...new Set(boxes)].join(' | ')}`)
  // Phone width: the strip, a code block, a card and a table at 560 x 400.
  const mixed = await v('article:new')
  await v('item:save', mixed, { body: { type: 'doc', content: [p('Small window'), p('#one #two #three #four #five #six #seven #eight #nine #ten #eleven #twelve'), code(1), card(1), table(6, 6)] } })
  await c.send('article', mixed)
  await h.waitForTimeout(1500)
  await c.size(560, 400)
  for (const [name, sel] of [['narrow-top', null], ['narrow-code', '.node-codeBlock'], ['narrow-card', '.node-bookmark'], ['narrow-table', '.tableWrapper']]) {
    if (sel) await h.evaluate((sel) => document.querySelector(`[data-open] ${sel}`)?.scrollIntoView({ block: 'center' }), sel)
    await h.waitForTimeout(400)
    await c.both(`${SHOTS}/${name}`)
    const wide = await h.evaluate(() => { let sc = document.querySelector('[data-open] .ProseMirror'); while (sc && !/(auto|scroll)/.test(getComputedStyle(sc).overflowY)) sc = sc.parentElement; return sc ? sc.scrollWidth - sc.clientWidth : null })
    if (wide > 2) fails.push(`${name}: the page scrolls sideways by ${wide}px at 560 wide`)
  }
  await c.size(1280, 860)
  // Frames through select-all, delete-all and Undo.
  const big = await v('article:new'); await v('item:save', big, { body: bigDoc() })
  console.log('open', await openTimed(c, big, 3000))
  await h.waitForTimeout(2500)
  await h.evaluate(() => document.querySelector('[data-open] .tiptap').editor.commands.focus('end'))
  await film('select-all', () => h.keyboard.press('Meta+a'))
  await film('delete-all', () => h.keyboard.press('Backspace'))
  await film('undo', () => h.keyboard.press('Meta+z'))
} catch (e) { fails.push('threw: ' + e.message.split('\n')[0]) }
finally { await c.close() }
console.log(fails.length ? `FAIL\n- ${fails.join('\n- ')}` : 'PASS frames, phone width and stillness')
process.exit(fails.length ? 1 : 0)
