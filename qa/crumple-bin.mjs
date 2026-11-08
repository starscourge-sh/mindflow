// Moved to the Bin by a click: the row crumples like paper (React Bits' PaperCrumple)
// and flies to the sidebar's Bin; the note is in the Bin and Undo brings it back.
// By a key (⌘⌫) nothing crumples, and with Motion off nothing crumples either.
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/crumple-bin.mjs
// QA_FRAMES=<folder> keeps a frame every 50ms through the first move.
import { mkdirSync, writeFileSync } from 'node:fs'
import { sandbox } from './sandbox-lib.mjs'
import { checks } from './harness.mjs'
process.env.QA_ARGS ??= '--sandbox'

const { check, done } = checks()
const c = await sandbox({ width: 1400, height: 900 })
const { h, go } = c
const wait = (ms) => h.waitForTimeout(ms)
const frames = process.env.QA_FRAMES
if (frames) mkdirSync(frames, { recursive: true })

// Watches for the paper: whether it came, how long it stayed, and where it last was.
const watch = () => h.evaluate(() => {
  const seen = (window.qaCrumple = { came: false, at: 0, gone: 0, last: null, ready: false })
  const tick = () => {
    const paper = document.querySelector('[data-crumple]')
    if (paper) {
      if (!seen.came) (seen.came = true, (seen.at = performance.now()))
      seen.last = paper.getBoundingClientRect().toJSON()
      if (!seen.ready && paper.querySelector('[data-status="ready"]')) seen.ready = performance.now() - seen.at
    } else if (seen.came && !seen.gone) seen.gone = performance.now()
    if (!seen.gone) requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
})
const seen = () => h.evaluate(() => window.qaCrumple)
// The Bin at the sidebar's foot (or its row, with it shown in the list).
const binRow = () => h.evaluate(() => [...document.querySelectorAll('[data-home~="bin"]')].find((el) => el.offsetParent)?.getBoundingClientRect().toJSON() ?? null)
const titleOf = (row) => row.evaluate((el) => el.getAttribute('data-id'))
const inList = (id) => h.evaluate((id) => !!document.querySelector(`[data-id="${CSS.escape(id)}"]`), id)
const byMenu = async (row) => {
  await row.click({ button: 'right' }); await wait(500)
  await h.getByRole('menuitem', { name: /^Move to the Bin/ }).first().click()
}

try {
  await go('articles'); await wait(1500)
  const bin = await binRow()
  check('the sidebar Bin row is a landing place', !!bin, JSON.stringify(bin))

  // 1. A click: it crumples, flies to the Bin, is in the Bin, and Undo brings it back.
  let row = h.locator('[data-id]').first()
  let id = await titleOf(row)
  await watch()
  await row.click({ button: 'right' }); await wait(500)
  const t0 = Date.now()
  const clicked = h.getByRole('menuitem', { name: /^Move to the Bin/ }).first().click()
  // Filmed from inside the page (the window's own capturePage), a frame every 50ms: page.screenshot is too slow for it.
  const film = frames ? h.evaluate(async () => {
    const shots = []
    const t0 = performance.now()
    while (performance.now() - t0 < 1000) {
      const at = performance.now() - t0
      const png = await window.api.pictureOfRect({ x: 0, y: 0, width: innerWidth, height: innerHeight })
      if (png) shots.push({ at: Math.round(at), png: btoa(Array.from(png, (b) => String.fromCharCode(b)).join('')) })
      await new Promise((go) => setTimeout(go, Math.max(0, 50 * (shots.length) - (performance.now() - t0))))
    }
    return shots
  }) : null
  for (const [n, shot] of ((await film) ?? []).entries()) writeFileSync(`${frames}/f${String(n).padStart(2, '0')}-${shot.at}ms.png`, Buffer.from(shot.png, 'base64'))
  await clicked; await wait(1200)
  let s = await seen()
  check('click: the paper crumpled (PaperCrumple drew it)', s.came && s.ready, JSON.stringify(s))
  check('click: crumple and flight under 600ms once drawn', s.gone - s.at - s.ready < 650, `${Math.round(s.ready)}ms to draw, then ${Math.round(s.gone - s.at - s.ready)}ms to crumple and fly`)
  const near = s.last && bin && Math.abs(s.last.x + s.last.width / 2 - (bin.x + bin.width / 2)) < 60 && Math.abs(s.last.y + s.last.height / 2 - (bin.y + bin.height / 2)) < 40
  check('click: it ends on the sidebar Bin', !!near, JSON.stringify({ last: s.last, bin }))
  check('click: the row left the list', !(await inList(id)))
  const toast = h.getByText(/^Moved to the Bin/).first()
  check('click: "Moved to the Bin" is said', await toast.isVisible().catch(() => false))
  await h.getByRole('button', { name: /^Undo/ }).first().click(); await wait(1500)
  check('Undo: the note is back in the list', await inList(id))
  await go('discarded'); await wait(1200)
  check('Undo: the note is not in the Bin', !(await inList(id)))

  // 2. Moved again, then looked for in the Bin.
  await go('articles'); await wait(1200)
  row = h.locator('[data-id]').first(); id = await titleOf(row)
  await byMenu(row); await wait(1500)
  await go('discarded'); await wait(1200)
  check('click: the note is in the Bin', await inList(id))

  // 3. By a key, nothing crumples.
  await go('articles'); await wait(1200)
  row = h.locator('[data-id]').first(); id = await titleOf(row)
  await row.click(); await wait(800)
  await watch()
  await h.keyboard.press('Meta+Backspace'); await wait(1400)
  s = await seen()
  check('⌘⌫: nothing crumples', !s.came)
  check('⌘⌫: still goes to the Bin', !(await inList(id)))

  // 4. Motion off: nothing crumples.
  await h.evaluate(() => (document.documentElement.dataset.motion = 'off'))
  row = h.locator('[data-id]').first(); id = await titleOf(row)
  await watch()
  await byMenu(row); await wait(1400)
  s = await seen()
  check('Motion off: nothing crumples', !s.came)
  check('Motion off: still goes to the Bin', !(await inList(id)))
  check('no page errors', !c.errors.length, c.errors.slice(0, 3).join(' | '))
} finally { await c.close() }
done()
