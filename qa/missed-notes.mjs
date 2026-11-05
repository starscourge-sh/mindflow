// Notes the user saved as tasks that never reached a queue (5 Nov), checked in the real app:
//  7ce1ac77  a task just taken is as easy to reopen from quick capture as a note: the Tasks tab's "New" list
//  227a5b14 / 2ae0569a  Home leaves out what was resolved or put in the Bin
//  8d51e533  a right-click menu near the window's foot is never cut off
//   npx electron-vite build --outDir out-x
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/missed-notes.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const { check, done } = checks()
const SHOTS = process.env.SHOTS
const c = await sandbox({ width: 1200, height: 800 })
const { page, h, v, go, size, look } = c
const wait = (ms) => page.waitForTimeout(ms)
const shot = async (target, name) => SHOTS && target.screenshot({ path: `${SHOTS}/${name}.png` })
try {
  await v('settings:set', { hintRate: 0, rotCount: 0, motion: false, sounds: false })

  // --- 7ce1ac77: a task taken a moment ago, dated next month, so it is in none of Today, Upcoming's top or No date's.
  const made = await v('task:add', 'Probe ring the plumber back in two weeks', undefined, false)
  await v('task:save', made.id, { dueAt: new Date(Date.now() + 40 * 864e5).toISOString() })
  await page.evaluate(() => window.api.showPrompt()); await wait(900)
  await page.keyboard.press('Control+2'); await wait(900)
  const chips = await page.evaluate(() => [...document.querySelectorAll('[data-later-lists]')].map((b) => b.parentElement?.innerText.replace(/\n/g, ' ')).join(' | '))
  const fresh = (await page.evaluateHandle(() => [...document.querySelectorAll('button[aria-pressed]')].find((b) => (b.getAttribute('aria-label') ?? '').startsWith('New')) ?? null)).asElement()
  check('7ce1ac77: the box\'s Tasks tab has a "New" list', !!fresh, chips)
  if (fresh) {
    const before = await page.evaluate(() => [...document.querySelectorAll('button[aria-pressed]')].filter((b) => b.closest('[data-later-lists]') === null && b.parentElement?.querySelector('button[aria-pressed]')).map((b) => `${b.getAttribute('aria-label')}@${Math.round(b.getBoundingClientRect().x)},${Math.round(b.getBoundingClientRect().y)}`).join(' '))
    // By the pointer, as a person clicks: Playwright's own click scrolls the chip into view first.
    const at = await fresh.boundingBox()
    await page.mouse.click(at.x + at.width / 2, at.y + at.height / 2)
    // A frame every 50ms through the change, to be read by eye.
    for (let i = 0; i < 8; i++) { await shot(page, `box-new-frame-${i}`); await page.waitForTimeout(50) }
    await wait(300)
    const after = await page.evaluate(() => [...document.querySelectorAll('button[aria-pressed]')].filter((b) => b.closest('[data-later-lists]') === null && b.parentElement?.querySelector('button[aria-pressed]')).map((b) => `${b.getAttribute('aria-label')}@${Math.round(b.getBoundingClientRect().x)},${Math.round(b.getBoundingClientRect().y)}`).join(' '))
    const scrolls = await page.evaluate(() => { const out = []; let n = [...document.querySelectorAll('button[aria-pressed]')].find((b) => (b.getAttribute('aria-label') ?? '').startsWith('New')); while (n) { if (n.scrollLeft) out.push(`${n.tagName}.${String(n.className).slice(0, 40)}=${n.scrollLeft}/${n.scrollWidth - n.clientWidth}`); n = n.parentElement } return out.join(' ; ') })
    check('7ce1ac77: picking it moves no chip', before === after, `${before} -> ${after} [${scrolls}]`)
    const rows = await page.evaluate(() => [...document.querySelectorAll('[data-task-row], button[data-row]')].map((r) => r.innerText.split('\n')[0]))
    check('7ce1ac77: the task just taken is first in it', /ring the plumber/.test(rows[0] ?? ''), rows.slice(0, 3).join(' / '))
    await shot(page, 'box-new-light'); await look('dark'); await shot(page, 'box-new-dark'); await look('light')
  }
  await page.keyboard.press('Escape'); await wait(300); await page.keyboard.press('Escape'); await wait(500)

  // --- 227a5b14 / 2ae0569a: resolved and binned things leave Home.
  const kept = await h.evaluate(() => window.api.captures.create({ title: 'Probe settled thought about lanterns', kind: 'note', body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Probe settled thought about lanterns' }] }] } }).then((id) => ({ id })).catch(() => null))
  const done1 = await v('task:add', 'Probe binned task about lanterns', undefined, true)
  await v('task:save', done1.id, { status: 'dropped' })
  if (kept?.id) await h.evaluate((id) => window.api.captures.save(id, { status: 'resolved' }), kept.id)
  await go('home'); await h.waitForTimeout(1500)
  const home = await h.evaluate(() => document.body.innerText)
  check('227a5b14: Home does not show a task in the Bin', !home.includes('Probe binned task about lanterns'))
  check('2ae0569a: Home does not show a resolved note', !home.includes('Probe settled thought about lanterns'), kept ? '' : 'note not made')

  // --- 8d51e533: a menu opened at the window's foot stays whole inside it.
  await size(900, 560)
  await go('today'); await h.waitForTimeout(900)
  const rowsNow = h.locator('button[data-row]')
  const n = await rowsNow.count()
  const last = rowsNow.nth(Math.max(0, n - 1))
  const box = await last.boundingBox()
  await h.mouse.click(box.x + 40, Math.min(box.y + box.height / 2, 540), { button: 'right' }); await wait(600)
  const menu = await h.evaluate(() => { const m = document.querySelector('[role=menu]'); if (!m) return null; const r = m.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, vh: innerHeight, vw: innerWidth, scroll: m.scrollHeight > m.clientHeight + 1, overflow: getComputedStyle(m).overflowY } })
  check('8d51e533: the menu at the foot is whole inside the window', menu && menu.top >= 0 && menu.bottom <= menu.vh && menu.left >= 0 && menu.right <= menu.vw, JSON.stringify(menu))
  await shot(h, 'foot-menu')
  await h.keyboard.press('Escape')
} catch (error) {
  check('the run finished', false, error.message.split('\n')[0])
} finally {
  await c.close?.()
}
done()
