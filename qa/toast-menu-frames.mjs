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
  await say()
  await wait(700)
  const before = await read()
  check('a notice shows at the bottom', !!before.notice && before.opacity === 1 && !before.hidden, JSON.stringify(before))
  // A row whose menu, opened just above the notice, comes down over its place (the menu keeps inside the window, so
  // it rises from a click near the foot): the row nearest the notice's middle, low on the page.
  const spot = await h.evaluate((n) => {
    const rows = [...document.querySelectorAll('[data-row], [data-capture-row], [role="option"]')].map((one) => one.getBoundingClientRect()).filter((r) => r.height && r.bottom <= innerHeight)
    const low = rows.filter((r) => r.left < n.left + n.width / 2 && r.right > n.left + n.width / 2).sort((a, b) => b.bottom - a.bottom)[0] ?? rows.sort((a, b) => b.bottom - a.bottom)[0]
    return low ? { x: Math.min(Math.max(low.left + 20, n.left + n.width / 2 - 60), low.right - 20), y: Math.round(low.top + low.height / 2) } : null
  }, before.notice)
  check('a row to open a menu on, low on the page', !!spot, JSON.stringify(spot))
  if (spot) {
    await h.mouse.move(spot.x, spot.y)
    await h.mouse.click(spot.x, spot.y, { button: 'right' })
    const opening = await film('open', 12)
    const shown = opening.filter((f) => f.menu)
    check('a real right-click menu opened', shown.length > 0, `${shown.length} of ${opening.length} frames`)
    const stayed = opening.every((f) => !f.notice || (Math.abs(f.notice.top - before.notice.top) <= 1 && Math.abs(f.notice.left - before.notice.left) <= 1))
    check('the notice never moves while the menu opens (every frame)', stayed, opening.map((f) => f.notice?.top ?? '-').join(' '))
    const over = shown.filter(covers)
    console.log(`(the menu ${over.length ? 'covers' : 'does not cover'} the notice's place: menu ${JSON.stringify(shown.at(-1)?.menu)}, notice ${JSON.stringify(before.notice)})`)
    if (over.length) {
      const settled = over.at(-1)
      check('covered: the notice is hidden where it stands', settled.hidden && settled.opacity < 0.05, JSON.stringify(settled))
      check('and a click there reaches the menu', settled.click === 'the menu', settled.click)
    } else check('not covered: the notice stays readable', shown.every((f) => f.notice && !f.hidden && f.opacity > 0.95), JSON.stringify(shown.at(-1)))
    await h.keyboard.press('Escape')
    const closing = await film('close', 10)
    const last = closing.at(-1)
    check('the menu shut: the notice is back in the same place, readable', !last.menu && !!last.notice && !last.hidden && last.opacity > 0.95 && Math.abs(last.notice.top - before.notice.top) <= 1, JSON.stringify(last))
    check('and it never moved while the menu shut (every frame)', closing.every((f) => !f.notice || Math.abs(f.notice.top - before.notice.top) <= 1), closing.map((f) => f.notice?.top ?? '-').join(' '))
  }
  check('no page errors', !c.errors.length, c.errors.slice(0, 3).join(' | '))
} finally {
  await c.close()
}
done()
