// A notice at the bottom when a REAL right-click menu opens over its place, frame by frame (the user, 15 Nov 2026: a
// toast "shot up above the context menu then disappeard"). qa/toast-holds-still.mjs proves the rule on stand-ins; this
// drives the Inbox's own row menu where the notice stands, takes a frame every 50 ms as the menu opens and as Esc shuts
// it, and checks every frame: the notice never moves, it is hidden while the menu covers its place (and a click there
// reaches the menu), and it is back in the same place once the menu has gone. Frames in QA_SHOTS, to read by eye.
//   QA_DATA=<copy of the seeded sandbox> QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_SHOTS=<folder> node qa/toast-menu-frames.mjs
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const { check, done } = checks()
const c = await sandbox({ width: 1200, height: 800 })
const { h, v, go } = c
const wait = (ms) => h.waitForTimeout(ms)
const shots = process.env.QA_SHOTS ? join(process.env.QA_SHOTS, 'toast-menu') : ''
if (shots) mkdirSync(shots, { recursive: true })
const WORDS = 'A notice under the menu'
/** The notice's words' box, its row's look, the open menu's box, and what a click on the notice's middle would reach. */
const read = () => h.evaluate((words) => {
  const at = [...document.querySelectorAll('body *')].find((one) => one.childElementCount === 0 && one.textContent === words)
  const lane = at?.closest('.pointer-events-none.fixed')
  const box = at?.getBoundingClientRect()
  const menu = [...document.querySelectorAll('[role="menu"]')].find((one) => !one.closest('[data-state="closed"]') && one.getBoundingClientRect().height)
  const m = menu?.getBoundingClientRect()
  const hit = box ? document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2) : null
  return {
    notice: box ? { top: Math.round(box.top), left: Math.round(box.left), width: Math.round(box.width), height: Math.round(box.height) } : null,
    opacity: lane ? Number(getComputedStyle(lane).opacity) : null,
    hidden: lane ? getComputedStyle(lane).visibility === 'hidden' : null,
    menu: m ? { top: Math.round(m.top), left: Math.round(m.left), right: Math.round(m.right), bottom: Math.round(m.bottom) } : null,
    click: hit?.closest('[role="menu"]') ? 'the menu' : hit?.closest('[role="status"]') ? 'the notice' : hit ? hit.tagName.toLowerCase() : 'nothing'
  }
}, WORDS)
const covers = (f) => !!f.menu && !!f.notice && f.menu.top < f.notice.top + f.notice.height && f.menu.bottom > f.notice.top && f.menu.left < f.notice.left + f.notice.width && f.menu.right > f.notice.left
const film = async (name, n) => {
  const out = []
  for (let i = 0; i < n; i++) {
    out.push(await read())
    if (shots) await h.screenshot({ path: join(shots, `${name}-${String(i).padStart(2, '0')}.png`) }).catch(() => {})
    await wait(50)
  }
  return out
}
try {
  await v('settings:set', { sounds: false, hintRate: 0 })
  await go('inbox')
  await wait(800)
  const say = () => h.evaluate((text) => window.dispatchEvent(new CustomEvent('haligtree:toast', { detail: { text, tone: 'success' } })), WORDS)
  // Two presses on the rows beside the notice, a little left of it (never on the notice: it takes clicks): one just
  // above it, whose menu opens upward, clear of it; one just below it, whose menu, kept inside the window, rises over
  // its place (the user's case: a right-click near the foot of the page).
  for (const way of ['above', 'below']) {
    await say()
    await wait(700)
    const before = await read()
    check(`${way}: a notice shows at the bottom`, !!before.notice && before.opacity === 1 && !before.hidden, JSON.stringify(before))
    if (!before.notice) continue
    const spot = await h.evaluate(([n, way]) => {
      const x = n.left - 20
      const y = way === 'below' ? n.top + n.height + 8 : null
      if (y !== null) {
        const row = document.elementFromPoint(x, y)?.closest('[data-row]')
        return row ? { x, y: Math.round(y) } : null
      }
      const rows = [...document.querySelectorAll('[data-row]')].map((one) => one.getBoundingClientRect()).filter((r) => r.height && r.left + 10 <= x && r.right - 10 >= x && r.bottom <= n.top - 2)
      const low = rows.sort((a, b) => b.bottom - a.bottom)[0]
      return low ? { x, y: Math.round(low.top + low.height / 2) } : null
    }, [before.notice, way])
    check(`${way}: a row to open a menu on`, !!spot, JSON.stringify(spot))
    if (!spot) continue
    await h.mouse.move(spot.x, spot.y)
    await h.mouse.click(spot.x, spot.y, { button: 'right' })
    const opening = await film(`${way}-open`, 12)
    const shown = opening.filter((f) => f.menu)
    check(`${way}: a real right-click menu opened`, shown.length > 0, `${shown.length} of ${opening.length} frames`)
    if (!shown.length) continue
    check(`${way}: the notice never moves while the menu opens (every frame)`, opening.every((f) => !f.notice || (Math.abs(f.notice.top - before.notice.top) <= 1 && Math.abs(f.notice.left - before.notice.left) <= 1)), opening.map((f) => f.notice?.top ?? '-').join(' '))
    const over = shown.filter(covers)
    console.log(`(${way}: the menu ${over.length ? 'covers' : 'does not cover'} the notice's place: menu ${JSON.stringify(shown.at(-1)?.menu)}, notice ${JSON.stringify(before.notice)})`)
    if (over.length) {
      const settled = over.at(-1)
      check(`${way}: covered, the notice is hidden where it stands`, !!settled.notice && settled.hidden && settled.opacity < 0.05, JSON.stringify(settled))
      check(`${way}: and a click there reaches the menu`, settled.click === 'the menu', settled.click)
    } else check(`${way}: not covered, the notice stays readable where it is`, shown.every((f) => f.notice && !f.hidden && f.opacity > 0.95), JSON.stringify(shown.at(-1)))
    await h.keyboard.press('Escape')
    const closing = await film(`${way}-close`, 10)
    const last = closing.at(-1)
    check(`${way}: the menu shut, the notice is back in the same place, readable`, !last.menu && !!last.notice && !last.hidden && last.opacity > 0.95 && Math.abs(last.notice.top - before.notice.top) <= 1, JSON.stringify(last))
    await wait(400)
  }
  check('no page errors', !c.errors.length, c.errors.slice(0, 3).join(' | '))
} finally {
  await c.close()
}
done()
