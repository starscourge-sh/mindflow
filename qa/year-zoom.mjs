// The Journal's year by hand: strokes near the pointer swell (taller near it, falling off, gone after leaving, none
// with Motion off); a pinch spreads the year (months, then week starts, then each day's name), two fingers sideways
// move along it, past the ends it springs back, Esc and a double-click give the whole year back, a plain scroll still
// scrolls the page, a click at the deepest zoom still opens the day, and the narrow window's two bands zoom too.
// Frames every 50ms through hover and pinch go to QA_SHOTS (default: a temp folder).
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox node qa/year-zoom.mjs
import { mkdirSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'
const { check, done } = checks()
const shots = process.env.QA_SHOTS ?? join(tmpdir(), `year-zoom-${process.pid}`)
mkdirSync(shots, { recursive: true })
const c = await sandbox({ width: 1300, height: 900 })
const { h, go, close, size } = c
const wait = (ms) => h.waitForTimeout(ms)
const waitFor = async (test, ms = 8000) => { for (const end = Date.now() + ms; Date.now() < end; await wait(100)) if (await test()) return true; return false }
const zoom = () => h.evaluate(() => Number(document.querySelector('[data-year-zoom]')?.getAttribute('data-year-zoom') ?? 0))
const pan = (b = 0) => h.evaluate((b) => Number(document.querySelectorAll('[data-year-track]')[b]?.getAttribute('data-year-pan') ?? 0), b)
// Each stroke's drawn height, by its day index from the band's start.
const heights = (b = 0) => h.evaluate((b) => [...document.querySelectorAll('[data-year-band]')[b].querySelectorAll('svg [data-stroke]')].map((r) => ({ h: Math.round(r.getBoundingClientRect().height), marked: r.hasAttribute('data-year-marked') })), b)
// A pinch driven in the page a frame at a time, as a trackpad sends it: wheel events with ctrlKey at the pointer.
const pinch = (x, y, deltaY, n) => h.evaluate(([x, y, deltaY, n]) => new Promise((res) => {
  let i = 0
  const gaps = []
  let then = performance.now()
  const tick = (now) => {
    gaps.push(now - then); then = now
    const at = document.elementFromPoint(x, y) ?? document.body
    at.dispatchEvent(new WheelEvent('wheel', { deltaY, deltaX: 0, ctrlKey: true, clientX: x, clientY: y, bubbles: true, cancelable: true }))
    if (++i < n) requestAnimationFrame(tick); else res(gaps.slice(1))
  }
  requestAnimationFrame(tick)
}), [x, y, deltaY, n])
const swipe = (x, y, deltaX, n) => h.evaluate(([x, y, deltaX, n]) => new Promise((res) => {
  let i = 0
  const tick = () => {
    const at = document.elementFromPoint(x, y) ?? document.body
    at.dispatchEvent(new WheelEvent('wheel', { deltaX, deltaY: 0, clientX: x, clientY: y, bubbles: true, cancelable: true }))
    if (++i < n) requestAnimationFrame(tick); else res()
  }
  requestAnimationFrame(tick)
}), [x, y, deltaX, n])
// Frames every 50ms while `work` runs.
const film = async (name, work) => {
  let n = 0, on = true
  const clip = await h.locator('[data-year-marks]').boundingBox()
  const shooting = (async () => { while (on) { const t = Date.now(); await h.screenshot({ path: join(shots, `${name}-${String(n++).padStart(3, '0')}.png`), clip, timeout: 3000 }).catch((e) => console.log('frame failed', String(e).slice(0, 120))); await wait(Math.max(0, 50 - (Date.now() - t))) } })()
  const out = await work()
  await wait(500)
  on = false
  await shooting
  return out
}
const frameGaps = (ms) => h.evaluate((ms) => new Promise((res) => { const gaps = []; let then = performance.now(); const end = then + ms; const tick = (now) => { gaps.push(now - then); then = now; if (now < end) requestAnimationFrame(tick); else res(gaps.slice(1)) }; requestAnimationFrame(tick) }), ms)
const stat = (gaps) => { const s = [...gaps].sort((a, b) => a - b); return { n: s.length, p95: Math.round(s[Math.floor(s.length * 0.95)] ?? 0), max: Math.round(s[s.length - 1] ?? 0) } }
try {
  await go('yearpage')
  check('the year is drawn', await waitFor(() => h.evaluate(() => !!document.querySelector('[data-year-marks] svg [data-stroke]'))))
  await h.locator('[data-year-marks]').scrollIntoViewIfNeeded()
  await wait(400)
  let box = await h.locator('[data-year-band="0"] svg').boundingBox()
  const step = box.width / (await heights()).length
  const base = await heights()
  // A stroke well away from today and any mark, so its swell is the swell alone.
  const free = (i) => base.slice(i - 14, i + 15).every((one) => !one.marked && one.h <= 14)
  let at = [80, 120, 200, 250, 300, 40].find(free) ?? 150
  const xOf = (i) => box.x + i * step + 0.5

  // --- the swell
  const hoverGaps = film('hover', async () => {
    const gaps = frameGaps(1400)
    for (let k = 0; k <= 20; k++) { await h.mouse.move(xOf(at - 10 + k), box.y + box.height - 6); await wait(30) }
    return gaps
  })
  const hg = stat(await hoverGaps)
  await h.mouse.move(xOf(at), box.y + box.height - 6)
  await wait(500)
  const swollen = await heights()
  const around = [0, 1, 2, 4, 6, 9, 12, 16].map((d) => swollen[at + d].h)
  console.log('swell heights at 0,1,2,4,6,9,12,16 days off:', around.join(', '), '| base', base[at].h, '| hover frames', JSON.stringify(hg))
  check('the stroke under the pointer swells tallest', around[0] >= 26 && around[0] > around[1], around.join(','))
  check('...the swell falls off smoothly over about 12 days', around.every((one, i) => i === 0 || one <= around[i - 1]) && around[2] > base[at + 2].h && around[7] === base[at + 16].h, around.join(','))
  check('...both sides alike', Math.abs(swollen[at - 4].h - swollen[at + 4].h) <= 1, `${swollen[at - 4].h} ${swollen[at + 4].h}`)
  check('...hover frames stay smooth (p95 under 25ms)', hg.p95 < 25, JSON.stringify(hg))
  const nameGap = await h.evaluate(() => {
    const names = [...document.querySelectorAll('[data-year-band="0"] [data-mark-label]')].map((el) => el.getBoundingClientRect())
    const strokes = [...document.querySelectorAll('[data-year-band="0"] svg [data-stroke]:not([data-year-marked])')].map((el) => el.getBoundingClientRect())
    return Math.min(999, ...names.flatMap((n) => strokes.filter((s) => s.left >= n.left - 1 && s.left <= n.right + 1).map((s) => s.top - n.bottom)))
  })
  check('...a swollen stroke never touches a name above it', nameGap >= 1, String(nameGap))
  await film('leave', async () => { await h.mouse.move(box.x + box.width / 2, box.y - 200) })
  const after = await heights()
  check('...gone after the pointer leaves', after.every((one, i) => one.h === base[i].h), JSON.stringify(after.filter((one, i) => one.h !== base[i].h).length))

  // --- marked strokes clear of other names
  const crossing = await h.evaluate(() => {
    const names = [...document.querySelectorAll('[data-year-names] [data-mark-label]')].map((el) => el.getBoundingClientRect())
    const tall = [...document.querySelectorAll('svg [data-year-marked]')].map((el) => el.getBoundingClientRect())
    return tall.filter((s) => names.some((n) => s.left >= n.left - 1 && s.left <= n.right + 1 && s.top < n.bottom - 1)).length
  })
  check('no marked stroke runs through another name', crossing === 0, String(crossing))

  // --- pinch in, the levels of detail
  const y = box.y + box.height - 6
  const x = xOf(at)
  const pinchGaps = await film('pinch', () => pinch(x, y, -3, 40))
  const pg = stat(pinchGaps)
  await wait(400)
  const z1 = await zoom()
  console.log('zoom after pinch:', z1, '| pinch frames', JSON.stringify(pg))
  check('a pinch spreads the year', z1 > 3, String(z1))
  check('...pinch frames, filmed, recorded', pg.n > 0, JSON.stringify(pg))
  const weekWords = await h.evaluate(() => [...document.querySelectorAll('[data-year-band="0"] [data-year-months] span')].map((s) => s.textContent))
  const deepGaps = stat(await pinch(x, y, -10, 200)); console.log('pinch frames (not filmed):', JSON.stringify(deepGaps)); check('...pinch frames stay smooth unfilmed (p95 under 25ms)', deepGaps.p95 < 25, JSON.stringify(deepGaps))
  await wait(900)
  const deep = await zoom()
  const dayWords = await h.evaluate(() => [...document.querySelectorAll('[data-year-band="0"] [data-year-months] span')].filter((s) => Number(getComputedStyle(s.parentElement).opacity) > 0.5).map((s) => s.textContent))
  console.log('deepest zoom', deep, '| words then:', weekWords.slice(0, 8).join(' '), '| now:', dayWords.slice(0, 4).join(' / '))
  check('...week starts appear on the way in', weekWords.some((one) => /^\d+$/.test(one)), weekWords.slice(0, 12).join(' '))
  check('...at the deepest each day is named ("Mon 24 Nov")', dayWords.length > 3 && dayWords.every((one) => /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun) \d+ [A-Z][a-z]{2}$/.test(one)), dayWords.slice(0, 6).join(' / '))
  const overlap = await h.evaluate(() => [...document.querySelectorAll('[data-year-band="0"] [data-stroke-axis]')].some((axis) => { const r = [...axis.children].map((s) => s.getBoundingClientRect()).sort((a, b) => a.left - b.left); return r.some((one, i) => i && one.left < r[i - 1].right) }))
  check('...the words never overlap', !overlap)
  const xs = await h.evaluate(() => { const left = document.querySelector('[data-year-band="0"] [data-year-clip]').getBoundingClientRect().left; return [...document.querySelectorAll('[data-year-band="0"] svg [data-stroke]')].map((r) => r.getBoundingClientRect().left - left).filter((x) => x > -1 && x < 1300) })
  check('...strokes stay on whole pixels', xs.length > 3 && xs.every((one) => Math.abs(one - Math.round(one)) < 0.01), xs.slice(0, 5).join(','))
  // Past the deepest it gives, then springs back.
  const over = await film('overpinch', async () => { await pinch(x, y, -20, 25); const was = await zoom(); await wait(900); return was })
  const back = await zoom()
  check('...past the deepest it gives a little, then springs back', over > deep * 1.02 && Math.abs(back - deep) < deep * 0.01, `${deep} -> ${over} -> ${back}`)

  // --- along, sideways
  const p0 = await pan()
  await swipe(x, y, 40, 10)
  await wait(100)
  const p1 = await pan()
  check('two fingers sideways move along while zoomed', p1 > p0 + 300, `${p0} -> ${p1}`)
  await film('pastend', async () => { await swipe(x, y, -400, 60) }); await wait(700)
  const p2 = await pan()
  check('...past the start it springs back to the start', p2 === 0, String(p2))
  // A plain scroll still scrolls the page.
  const scroller = () => h.evaluate(() => { let el = document.querySelector('[data-year-marks]'); while (el && !(el.scrollHeight > el.clientHeight + 4 && /auto|scroll/.test(getComputedStyle(el).overflowY))) el = el.parentElement; return el ? el.scrollTop : -1 })
  const s0 = await scroller()
  await h.mouse.move(x, y)
  await h.mouse.wheel(0, 120)
  await wait(400)
  const s1 = await scroller()
  check('a plain scroll down still scrolls the page, zoom kept', s1 !== s0 && (await zoom()) > 3, `${s0} -> ${s1}`)
  await h.mouse.wheel(0, -120)
  await wait(400)

  // --- a click at the deepest opens the day
  box = await h.locator('[data-year-band="0"] svg').boundingBox()
  // --- Esc
  await film('esc', async () => { await h.keyboard.press('Escape') }); await wait(800)
  check('Esc gives the whole year back', (await zoom()) === 1 && (await pan()) === 0, String(await zoom()))
  // --- double-click
  await pinch(x, y, -8, 40)
  await wait(500)
  const zd = await zoom()
  const months = await h.locator('[data-year-band="0"] [data-year-months]').boundingBox(); const clipBox = await h.locator('[data-year-band="0"] [data-year-clip]').boundingBox()
  await h.mouse.dblclick(clipBox.x + 30, months.y + 6)
  await wait(1300)
  check('a double-click gives the whole year back', zd > 2 && (await zoom()) === 1, `${zd} -> ${await zoom()}`)

  // --- Motion off: no swell, the pointed-at stroke still stands up
  await h.evaluate(() => { document.documentElement.dataset.motion = 'off' })
  box = await h.locator('[data-year-band="0"] svg').boundingBox()
  await h.mouse.move(xOf(at), box.y + box.height - 6)
  await wait(400)
  const still = await heights()
  check('Motion off: no swell, only the pointed-at stroke stands', still[at].h === 22 && still[at + 2].h === base[at + 2].h && still[at + 1].h === base[at + 1].h, `${still[at].h} ${still[at + 1].h} ${still[at + 2].h}`)
  await h.evaluate(() => { delete document.documentElement.dataset.motion })
  await h.mouse.move(10, 10)

  // --- narrow: two bands, each zooms
  await size(700, 800)
  await wait(800)
  const bands = await h.evaluate(() => document.querySelectorAll('[data-year-band]').length)
  check('the narrow window draws the year in bands', bands >= 2, String(bands))
  const b1 = await h.locator('[data-year-band="1"] svg').boundingBox()
  if (b1) {
    await h.locator('[data-year-band="1"]').scrollIntoViewIfNeeded()
    const bb = await h.locator('[data-year-band="1"] svg').boundingBox()
    await film('narrow', () => pinch(bb.x + bb.width / 2, bb.y + bb.height - 6, -8, 60))
    await wait(400)
    const wide = await h.evaluate(() => { const clip = document.querySelector('[data-year-band="1"] [data-year-clip]').getBoundingClientRect(); const page = document.documentElement.scrollWidth; return { clip: Math.round(clip.width), page, view: innerWidth } })
    check('...the second band zooms inside its card, no sideways page scroll', (await zoom()) > 3 && wide.page <= wide.view, JSON.stringify(wide))
    await h.keyboard.press('Escape')
    await wait(800)
  }
  await size(1300, 900)
  await wait(800)

  // --- deepest zoom, a click opens the day
  box = await h.locator('[data-year-band="0"] svg').boundingBox()
  await pinch(xOf(at), box.y + box.height - 6, -10, 260)
  await wait(900)
  box = { ...(await h.locator('[data-year-band="0"] svg').boundingBox()), x: (await h.locator('[data-year-band="0"] [data-year-clip]').boundingBox()).x, width: (await h.locator('[data-year-band="0"] [data-year-clip]').boundingBox()).width }
  const day = await h.evaluate(([x, y]) => document.elementFromPoint(x, y)?.closest('svg') && [...document.querySelectorAll('[data-year-band="0"] svg [data-stroke]')].find((r) => Math.abs(r.getBoundingClientRect().left - x) < 2)?.getAttribute('data-year-day'), [box.x + box.width / 2, box.y + box.height - 6])
  const sx = await h.evaluate((x) => [...document.querySelectorAll('[data-year-band="0"] svg [data-stroke]')].map((r) => r.getBoundingClientRect().left).sort((a, b) => Math.abs(a - x) - Math.abs(b - x))[0], box.x + box.width / 2)
  await h.mouse.move(sx + 10, box.y + box.height - 6); await wait(300); console.log('tip before click:', await h.evaluate(() => document.querySelector('[data-year-marks] [class*="pointer-events-none"]')?.textContent)); await h.mouse.click(sx + 10, box.y + box.height - 6)
  await wait(1200)
  const opened = await h.evaluate(() => ({ year: !!document.querySelector('[data-year-marks]'), text: document.querySelector('h1')?.textContent ?? '', dialog: document.querySelector('[role="dialog"]')?.textContent?.slice(0, 60) ?? '' }))
  console.log('clicked', day, '->', JSON.stringify(opened))
  check('at the deepest a click on a day still opens it', !opened.year || !!opened.dialog, JSON.stringify(opened))
  console.log('frames in', shots)
  check('no page errors', c.errors.length === 0, c.errors.join(' | '))
} finally {
  await close()
}
done()
