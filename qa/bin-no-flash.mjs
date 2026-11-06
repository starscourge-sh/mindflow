// Moved to the Bin, the row is gone as its picture goes through the shredder: it never shows again in its place under
// the strips before the list closes over it (the user, 6 Nov: "for a brief moment the item reappeared in the same
// position of the list before popping out"). Also how a conversion's flight runs: main thread stalls while it travels.
// And the Goals road: the faint dots lie on the same rows as the real ones (the user: "misalignment").
//   QA_ARGS=--sandbox QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/bin-no-flash.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'

const { check, done } = checks()
const c = await sandbox({ width: 1600, height: 900 })
const { h, go } = c
const wait = (ms) => h.waitForTimeout(ms)
const watch = (id) => h.evaluate((one) => {
  window.__seen = []
  window.__long = []
  const started = performance.now()
  window.__t0 = started
  new PerformanceObserver((list) => { for (const e of list.getEntries()) window.__long.push([Math.round(e.startTime - started), Math.round(e.duration)]) }).observe({ entryTypes: ['longtask'] })
  let last = started
  window.__gaps = []
  const tick = () => {
    const now = performance.now()
    if (now - last > 34) window.__gaps.push([Math.round(last - started), Math.round(now - last)])
    last = now
    const row = one && document.querySelector(`[data-id="${CSS.escape(one)}"]`)
    const strips = [...document.body.children].some((el) => el.style?.position === 'fixed' && el.style?.pointerEvents === 'none' && el.getAnimations().length)
    const shown = row && getComputedStyle(row).visibility !== 'hidden' && Number(getComputedStyle(row).opacity) > 0.05
    window.__seen.push([Math.round(now - started), !!strips, !!shown])
    if (now - started < 1500) requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
}, id)
try {
  await go('goals')
  await wait(1500)
  // The road: the faint dots and the real ones share rows.
  const goals = await h.locator('[data-id]').count()
  for (let i = 0; i < goals && !(await h.$('[data-road-ghost]')); i++) (await h.locator('[data-id]').nth(i).click(), await wait(700))
  const rows = await h.evaluate(() => {
    const ghost = document.querySelector('[data-road-ghost]')
    const real = document.querySelector('[data-road-band] svg[role="img"]')
    if (!ghost || !real) return null
    const ys = (root, pick) => [...new Set([...root.querySelectorAll(pick)].map((one) => Math.round(one.getBoundingClientRect().top * 2) / 2))].sort((a, b) => a - b)
    return { ghost: ys(ghost, 'circle'), real: ys(real, 'circle[data-dot]') }
  })
  check('the Goals road has faint dots to compare', !!rows, JSON.stringify(rows))
  if (rows) check('the faint dots lie on the real dots\' rows', rows.ghost.every((y) => rows.real.some((one) => Math.abs(one - y) <= 0.5)), JSON.stringify(rows))
  // To the Bin by the row's menu, as a pointer does it: a key does not shred.
  const id = await h.locator('[data-id]').nth(1).getAttribute('data-id')
  await h.locator(`[data-id="${id}"]`).first().click({ button: 'right' })
  await wait(350)
  await watch(id)
  await h.getByRole('menuitem', { name: /Move to the Bin/ }).first().click()
  await wait(1700)
  const seen = await h.evaluate(() => window.__seen)
  const first = seen.findIndex(([, strips]) => strips)
  const under = first < 0 ? [] : seen.slice(first).filter(([, , shown]) => shown)
  check('it shreds', first >= 0, `${seen.length} frames`)
  check('the row never shows under the strips', under.length === 0, `${under.length} frames, ${under.slice(0, 3).map((one) => one[0]).join(', ')}ms`)
  // A conversion, measured: Inbox row to a task by its menu.
  await go('inbox')
  await wait(1500)
  await h.evaluate(() => window.api.captures.create({ kind: 'note', body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Flight probe note' }] }] } }))
  await wait(800)
  await h.locator('[data-id]', { hasText: 'Flight probe note' }).first().click()
  await wait(1200)
  await h.locator('button[aria-label="Details"]').first().click()
  await wait(700)
  await watch(null)
  await h.getByRole('button', { name: 'Make it a task' }).first().click({ timeout: 5000 })
  await wait(1700)
  const report = await h.evaluate(() => ({ long: window.__long, gaps: window.__gaps }))
  console.log('flight: long tasks [at, ms]', JSON.stringify(report.long), 'frame gaps over 34ms [at, ms]', JSON.stringify(report.gaps))
  // Settings opens on "Your book", however it was left.
  await go('settings')
  await wait(800)
  await h.locator('[data-section="Appearance"]').first().click()
  await wait(300)
  await go('inbox')
  await wait(500)
  await go('settings')
  await wait(800)
  const on = await h.evaluate(() => document.querySelector('[data-section][aria-current="page"]')?.getAttribute('data-section') ?? 'none')
  check('Settings opens on "Your book" after leaving it on another section', on === 'Your book', on)
  check('no page errors', !c.errors.some((one) => one.startsWith('PAGEERROR')), c.errors.join(' | '))
} catch (error) {
  check('the run finishes', false, String(error).slice(0, 300))
} finally {
  await c.close()
  done()
}
