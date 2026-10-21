// Tuck away by the clock: a goal card set to "Always" is shown in full before
// and after the hours set, peeks as a slim tab at the screen's edge in between
// (pointed at, it opens out of the tab; left, it folds back), or goes out of
// sight; a focus session tucks it; and one out of sight two days peeks out by
// itself, once that day. Settings shows the rules, each with a preview.
// Paper and Dark, 900x700 and 1600x1000 for the settings.
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-x/main/index.js MINDFLOW_QA_AWAY=1 node qa/goal-tuck.mjs
// SHOTS=dir keeps pictures.
import { mkdirSync } from 'node:fs'
import { sandbox } from './sandbox-lib.mjs'
import { checks } from './harness.mjs'

process.env.MINDFLOW_QA_VIRTUAL ??= '1'
const shots = process.env.SHOTS
if (shots) mkdirSync(shots, { recursive: true })
const { check, done } = checks()
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const c = await sandbox({ width: 1280, height: 800 })
const { electron, h, v } = c
const hhmm = (offsetMin) => { const d = new Date(Date.now() + offsetMin * 60_000); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` }
try {
  await electron.evaluate(({ screen }) => {
    globalThis.qaCursor = null
    const real = screen.getCursorScreenPoint.bind(screen)
    screen.getCursorScreenPoint = () => globalThis.qaCursor ?? real()
  })
  const dune = (await v('items', 'goal')).find((one) => /Dune/.test(one.title))
  const key = `goal:${dune.id}`
  const card = () => electron.evaluate(({ BrowserWindow, screen }, id) => {
    const w = BrowserWindow.getAllWindows().find((one) => !one.isDestroyed() && one.webContents.getURL().includes('view=sticky') && one.webContents.getURL().includes(`id=${id}`))
    return w ? { b: w.getBounds(), visible: w.isVisible(), work: screen.getDisplayMatching(w.getBounds()).workArea, count: BrowserWindow.getAllWindows().filter((one) => !one.isDestroyed() && one.webContents.getURL().includes(`id=${id}`)).length } : null
  }, dune.id)
  const page = async () => electron.windows().find((p) => p.url().includes('view=sticky') && p.url().includes(`id=${dune.id}`))
  const tick = () => electron.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().includes('view=home'))?.webContents.send('noop'))
  await wait(1500)
  const rest = (await card()).b
  check('to start, the card is up in full', (await card())?.visible && rest.width > 200)

  // Between the hours: a slim tab at the nearer edge, level with the card.
  await v('settings:set', { goalTuck: true, goalShowUntil: hhmm(-60), goalShowFrom: hhmm(60), goalBetween: 'peek', goalInFocus: 'tuck' })
  await wait(1200)
  let now = await card()
  check('between the hours, it peeks: a slim tab at the screen\'s edge', now?.visible && now.b.width === 46 && now.b.height === 116 && now.b.x + now.b.width === now.work.x + now.work.width, JSON.stringify(now?.b))
  const p = await page()
  check('the tab shows the goal\'s ring and days left', await p.evaluate(() => !!document.querySelector('[data-goal-tab="right"] svg') && /days? left|past/.test(document.querySelector('[data-goal-tab]').getAttribute('aria-label'))))
  if (shots) await p.screenshot({ path: `${shots}/tab.png` })
  // Pointed at: it opens out of the tab, under the pointer.
  await electron.evaluate((_, b) => (globalThis.qaCursor = { x: b.x + 20, y: b.y + 40 }), now.b)
  await p.evaluate(() => window.api.holdBeacon(true))
  await wait(500)
  now = await card()
  check('pointed at, the card opens out of its tab', now.b.width === rest.width && now.b.height === rest.height && now.b.x + now.b.width === now.work.x + now.work.width, JSON.stringify(now.b))
  check('opened, it shows the whole card', await p.evaluate(() => !!document.querySelector('[data-goal-card]') && !document.querySelector('[data-goal-tab]')))
  // Still pointed at, it stays open; then the pointer leaves and it folds back.
  await electron.evaluate((_, b) => (globalThis.qaCursor = { x: b.x + 100, y: b.y + 100 }), now.b)
  await wait(1000)
  check('while pointed at, it stays open', (await card()).b.width === rest.width)
  await electron.evaluate(() => (globalThis.qaCursor = { x: 5, y: 5 }))
  await wait(1200)
  check('the pointer gone, it folds back to the tab', (await card()).b.width === 46)
  // Its own place is kept as it was, never the tab's.
  const kept = await electron.evaluate(({ app }) => JSON.parse(process.getBuiltinModule('fs').readFileSync(process.getBuiltinModule('path').join(app.getPath('userData'), 'stickies.json'), 'utf8')))
  const own = kept.find((one) => `${one.type}:${one.id}` === key)?.bounds
  check('its own place is kept as it was, not the tab\'s', own && own.width === rest.width && own.x === rest.x && own.y === rest.y, JSON.stringify([own, rest]))

  // Out of sight in between, when chosen.
  await v('settings:set', { goalBetween: 'tuck' })
  await wait(1200)
  check('“Out of sight” in between: the card is hidden', !(await card()).visible)
  // Past the hours: shown in full again, in its own place.
  await v('settings:set', { goalShowUntil: hhmm(-120), goalShowFrom: hhmm(-60) })
  await wait(1200)
  now = await card()
  check('outside the hours: shown in full, where it rests', now.visible && now.b.width === rest.width && now.b.x === rest.x && now.b.y === rest.y, JSON.stringify(now.b))

  // A focus session tucks it, whatever the clock; ended, it comes back.
  const task = (await v('tasks'))[0]
  const session = await v('session:start', task.id, 'Practice', 25 * 60_000)
  await electron.evaluate(() => new Promise((r) => setTimeout(r, 31_000)))
  check('during a focus session: out of sight', !(await card()).visible)
  const running = await v('focus:now')
  await v('session:end', running?.id ?? session?.id ?? session, '', false)
  await wait(31_000)
  check('the session over: back in full', (await card()).visible)

  // Out of sight two days: it peeks out by itself, once that day.
  await v('settings:set', { goalShowUntil: hhmm(-60), goalShowFrom: hhmm(60), goalBetween: 'tuck', goalPeekOut: true })
  await wait(1200)
  check('tucked again', !(await card()).visible)
  await electron.evaluate((_, key) => { const seen = globalThis.vigilGoalSeen(); seen.last[key] = Date.now() - 3 * 86_400_000; delete seen.nudged[key] }, key)
  await v('settings:set', { goalPeekOut: true, goalShowFrom: hhmm(61) })
  await wait(1200)
  now = await card()
  check('out of sight two days, it peeks out by itself as a tab', now.visible && now.b.width === 46, JSON.stringify(now))
  const nudged = await electron.evaluate((_, key) => globalThis.vigilGoalSeen().nudged[key], key)
  check('and is marked as done for today, so not again till tomorrow', nudged === new Date().toLocaleDateString('sv'), String(nudged))
  check('one window for the card, all along', now.count === 1, String(now.count))
  await v('settings:set', { goalTuck: false })
  await wait(1200)
  check('rules off: the card is up in full', (await card()).visible && (await card()).b.width === rest.width)

  // Settings: the rules and their preview, at two sizes in paper and dark.
  await v('settings:set', { goalTuck: true })
  for (const theme of ['paper', 'dark']) {
    await c.theme(theme)
    for (const [w, hh] of [[900, 700], [1600, 1000]]) {
      await c.size(w, hh)
      await c.go('settings')
      await h.locator('[data-section="What comes back to you"]').first().click()
      await h.waitForTimeout(500)
      await h.locator('[data-setting-title="Tuck away"]').scrollIntoViewIfNeeded()
      await h.waitForTimeout(500)
      const rows = await h.evaluate(() => ['Tuck away', 'Shown in full', 'In between', 'During a focus session', 'Peek out now and then'].map((t) => {
        const row = document.querySelector(`[data-setting-title="${t}"]`)
        if (!row) return { t, missing: true }
        const box = row.getBoundingClientRect()
        const cut = [...row.querySelectorAll('button:not([role=switch]):not([data-setting-more]), input, [data-preview]')].filter((el) => { const b = el.getBoundingClientRect(); return b.right > box.right + 1 || b.left < box.left - 1 || (!el.matches('[data-preview]') && el.scrollWidth > el.clientWidth + 2) }).length
        return { t, cut }
      }))
      check(`${theme} ${w}: every tuck-away row is there, nothing cut off`, rows.every((one) => !one.missing && one.cut === 0), JSON.stringify(rows))
      if (shots) await h.screenshot({ path: `${shots}/settings-tuck-${theme}-${w}.png` })
    }
  }
  const sample = h.locator('[data-preview="tuck"]')
  check('the preview waits as a tab', await sample.locator('[data-preview-card="tab"]').count() === 1)
  await sample.scrollIntoViewIfNeeded()
  const sb = await sample.boundingBox()
  await h.mouse.move(sb.x - 20, sb.y + sb.height / 2)
  await h.mouse.move(sb.x + sb.width / 2, sb.y + sb.height / 2, { steps: 4 })
  await h.waitForTimeout(500)
  check('pointed at, the preview opens', await sample.locator('[data-preview-card="card"]').count() === 1)
  check('no errors on the page', !c.errors.length, c.errors.join(' | '))
} finally {
  await c.close()
}
done()
