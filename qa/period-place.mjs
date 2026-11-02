// Day, Week, Month and Year put their bar and their picture in one place: the tabs, the arrows and the jump back to
// now start at the same x on all four at every window width, and the picture (Day's report, Week's and Month's banner)
// has one left edge and one width. The jump back's T sits right beside its words, never across a gap. Day's
// picture reads as a painting, not a black slab: the dark pool behind its title is only as dark as the painting needs.
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-x/main/index.js HALIGTREE_QA_AWAY=1 [QA_SHOTS=dir] node qa/period-place.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const { check, done } = checks()
const c = await sandbox({ width: 1300, height: 880 })
const { h, v, go, size, look } = c
const wait = (ms) => h.waitForTimeout(ms)
const shots = process.env.QA_SHOTS
const SCALES = ['Day', 'Week', 'Month', 'Year']

const read = () => h.evaluate(() => {
  const steps = [...document.querySelectorAll('[data-period-steps]')].find((one) => one.getBoundingClientRect().width > 0)
  if (!steps) return null
  const box = (one) => { const r = one.getBoundingClientRect(); return `${Math.round(r.left)},${Math.round(r.width)}` }
  const bar = {}
  for (const one of steps.querySelectorAll('button[aria-pressed]')) bar[`tab ${one.getAttribute('aria-label')}`] = box(one)
  for (const one of steps.querySelectorAll('[data-period-step]')) bar[`arrow ${one.dataset.periodStep}`] = box(one)
  const now = steps.querySelector('[data-period-now]')
  bar['jump back starts'] = String(Math.round(now.getBoundingClientRect().left))
  // The words a person sees: the text in the button that is not hidden and not the keycap.
  const walker = document.createTreeWalker(now, NodeFilter.SHOW_TEXT)
  let end = -Infinity
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const el = node.parentElement
    if (el.closest('kbd') || getComputedStyle(el).visibility === 'hidden' || !node.textContent.trim()) continue
    const range = document.createRange(); range.selectNodeContents(node)
    for (const r of range.getClientRects()) end = Math.max(end, r.right)
  }
  const cap = now.querySelector('kbd')?.getBoundingClientRect()
  const gap = cap ? Math.round(cap.left - end) : null
  const pic = [...document.querySelectorAll('[role="main"] [data-scene], [data-pane] [data-scene]')].find((one) => one.getBoundingClientRect().width > 0)
  const p = pic?.getBoundingClientRect()
  const on = steps.querySelector('button[aria-pressed="true"]')?.getAttribute('aria-label') ?? null
  const pool = document.querySelector('[data-report-pool]')
  return { bar, gap, picture: p ? `${Math.round(p.left)},${Math.round(p.top)},${Math.round(p.width)}` : null, on, pool: pool ? getComputedStyle(pool).backgroundImage.slice(0, 140) : null }
})
async function open(scale) {
  const at = await h.evaluate((label) => {
    const steps = [...document.querySelectorAll('[data-period-steps]')].find((one) => one.getBoundingClientRect().width > 0)
    const r = steps?.querySelector(`button[aria-label="${label}"]`)?.getBoundingClientRect()
    return r && { x: r.left + r.width / 2, y: r.top + r.height / 2 }
  }, scale)
  await h.mouse.click(at.x, at.y)
  for (let i = 0; i < 25; i++) { const now = await read(); if (now?.on === scale) break; if (i === 10) await h.mouse.click(at.x, at.y); await wait(200) }
  await wait(900)
  return read()
}

try {
  await v('settings:set', { sounds: false, hintRate: 0 })
  await v('onboarding:set', { welcomed: new Date().toISOString(), newsSeen: true, welcoming: false, pageHints: false })
  await go('day')
  // The sandbox's own line folds away on its own and lifts every page with it: let it go first.
  for (let i = 0; i < 60 && await h.evaluate(() => /in the sandbox/.test(document.body.innerText)); i++) await wait(250)
  await wait(600)
  // Each page once first, so each has read its data and its picture before anything is measured.
  for (const scale of SCALES) await open(scale)
  const ways = []
  for (const pageWidth of (process.env.QA_PAGE_WIDTHS ?? 'narrow,wide,full').split(',')) for (const width of (process.env.QA_WIDTHS ?? '900,1300,1800').split(',').map(Number)) ways.push([pageWidth, width, false])
  // Recent open beside the page (⇧⌘Y), and the window at a phone's width.
  ways.push(['narrow', 1300, true], ['narrow', 390, false])
  for (const [pageWidth, width, recent] of ways) {
    await v('settings:set', { pageWidth, fullWidth: pageWidth === 'full' })
    if (recent) { await h.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur()); await h.keyboard.press('Shift+Meta+y'); await wait(600) }
    await size(width, 880)
    await wait(600)
    const seen = {}
    for (const scale of SCALES) seen[scale] = await open(scale)
    check(`${pageWidth}${recent ? ' with Recent' : ''} ${width}px: each tab opens its page`, SCALES.every((one) => seen[one]?.on === one), SCALES.map((one) => seen[one]?.on).join(','))
    const base = seen.Day
    for (const scale of SCALES.slice(1)) {
      const moved = Object.keys(base.bar).filter((key) => base.bar[key] !== seen[scale].bar[key]).map((key) => `${key} ${base.bar[key]} -> ${seen[scale].bar[key]}`)
      check(`${pageWidth} ${width}px, Day to ${scale}: every tab, arrow and the jump back in the same place`, !moved.length, moved.join(' | '))
    }
    const pics = SCALES.filter((one) => seen[one].picture).map((one) => `${one} ${seen[one].picture}`)
    check(`${pageWidth} ${width}px: Day, Week and Month have a picture with one left edge, top and width`, pics.length === 3 && new Set(pics.map((one) => one.split(' ')[1])).size === 1, pics.join(' | '))
    for (const scale of SCALES) check(`${pageWidth} ${width}px, ${scale}: the T sits within 8px of its words`, seen[scale].gap !== null && seen[scale].gap >= 0 && seen[scale].gap <= 8, seen[scale].gap)
    if (recent) { await h.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur()); await h.keyboard.press('Shift+Meta+y'); await wait(600) }
    if (width === 1300 && pageWidth === 'narrow') console.log('pool:', seen.Day.pool, '| bar:', JSON.stringify(seen.Day.bar))
  }
  if (shots) {
    await size(1300, 880); await wait(500)
    for (const name of ['light', 'dark']) {
      await look(name)
      for (const scale of SCALES) { await open(scale); await h.screenshot({ path: `${shots}/period-${scale.toLowerCase()}-${name}.png` }) }
    }
    await look('light')
  }
  check('no page errors', !c.errors.filter((one) => one.includes('PAGEERROR')).length, c.errors.slice(0, 3).join(' | '))
} catch (error) {
  check('ran', false, error.stack)
} finally {
  await c.close()
}
done()
