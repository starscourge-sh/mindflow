// The arrow beside Next: once a page waits for you, a small arrow in the accent nudges toward the way on.
//  - never there while a page still plays (Next not ready)
//  - there on every step once it is ready, just left of Next, level with it, pointing at it
//  - never over Back, the step marks, the step name or Skip, in a narrow and a wide window
//  - gone the moment Next (or Enter) is pressed
//  - it moves (a nudge) with Motion on; with Reduce motion it is there and still
// Pace (how long each step holds still) is measured by qa/welcome-read.mjs.
//
//   npx electron-vite build --outDir out-x && QA_DATA=$(mktemp -d) QA_ENTRY=out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/welcome-pace.mjs [shots-dir]
import { mkdirSync } from 'fs'
import { sandbox } from './sandbox-lib.mjs'

const SHOTS = process.argv[2] ?? ''
if (SHOTS) mkdirSync(SHOTS, { recursive: true })
let failed = 0
const check = (name, ok, more = '') => {
  if (!ok) failed++
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${more ? `  (${more})` : ''}`)
}

const open = async (c) => {
  const { h } = c
  if (!(await h.waitForSelector('.mf-welcome', { timeout: 8000 }).then(() => true, () => false))) await h.evaluate(() => window.dispatchEvent(new CustomEvent('haligtree:welcome')))
  await h.waitForSelector('.mf-welcome', { timeout: 8000 })
}
const chapter = (h) => h.evaluate(() => document.querySelector('.mf-welcome footer .sr-only')?.textContent ?? '')
const ready = (h) => h.evaluate(() => document.querySelector('.mf-welcome footer [data-next]')?.hasAttribute('data-ready') ?? false)
const done = (h) => h.evaluate(() => [...document.querySelectorAll('.mf-welcome [data-reel]')].every((el) => el.dataset.reel === 'done'))
const settle = async (h) => {
  for (let i = 0; i < 10 && !(await done(h)); i++) (await h.keyboard.press('Escape'), await h.waitForTimeout(450))
}
// Where the arrow is against Next and the rest of the footer.
const look = (h) => h.evaluate(() => {
  // The one coming in, not one still fading out.
  const arrow = [...document.querySelectorAll('.mf-welcome [data-next-arrow]')].pop()
  const footer = document.querySelector('.mf-welcome footer')
  const next = [...footer.querySelectorAll('[data-next]')].pop()
  const box = (el) => (el ? (({ left, right, top, bottom, width }) => ({ left, right, top, bottom, width }))(el.getBoundingClientRect()) : null)
  const a = box(arrow)
  const n = box(next)
  const others = [...footer.querySelectorAll('button:not([data-next]), [aria-hidden] > span, span.min-w-\\[8rem\\]')].filter((el) => el.getBoundingClientRect().width > 0 && getComputedStyle(el).visibility !== 'hidden' && !(arrow && (el.contains(arrow) || arrow.contains(el))))
  const hits = a ? others.filter((el) => { const o = el.getBoundingClientRect(); return Math.min(a.right, o.right) - Math.max(a.left, o.left) > 0 && Math.min(a.bottom, o.bottom) - Math.max(a.top, o.top) > 0 }).map((el) => el.innerText.trim() || el.className.split(' ')[0]) : []
  const svg = arrow?.querySelector('svg')
  return {
    there: !!arrow && Number(getComputedStyle(arrow).opacity) > 0.5,
    attached: !!arrow,
    a, n, hits,
    transform: svg ? getComputedStyle(svg).transform : '',
    color: arrow ? getComputedStyle(arrow).color : '',
    primary: (() => { const p = document.createElement('span'); p.style.color = 'var(--primary)'; footer.append(p); const c = getComputedStyle(p).color; p.remove(); return c })()
  }
})

for (const [theme, width, height] of [['light', 1600, 1000], ['dark', 820, 620]]) {
  const c = await sandbox({ width, height, seeded: false })
  const { h } = c
  const tag = `${theme} ${width}x${height}`
  try {
    await c.theme(theme)
    await open(c)
    // Why plays: no arrow while Next is not ready.
    let early = 0
    for (let i = 0; i < 12; i++) {
      const [r, l] = [await ready(h), await look(h)]
      if (!r && l.attached) early++
      await h.waitForTimeout(250)
    }
    check(`${tag}: no arrow while Why still plays`, early === 0, `${early} looks`)
    const steps = ['Why', 'You', 'Catch', 'Write', 'Remember', 'Make it yours', 'Ready']
    for (const step of steps) {
      if (!(await chapter(h)).includes(step)) {
        check(`${tag}: reached ${step}`, false, await chapter(h))
        break
      }
      await settle(h)
      await h.waitForTimeout(1100)
      const l = await look(h)
      const level = l.a && l.n && Math.abs((l.a.top + l.a.bottom) / 2 - (l.n.top + l.n.bottom) / 2) <= 4
      const beside = l.a && l.n && l.a.right <= l.n.left + 1 && l.n.left - l.a.right <= 20
      check(`${tag}: ${step}: ready, the arrow is there, level with Next and just left of it`, (await ready(h)) && l.there && level && beside, JSON.stringify({ a: l.a, n: l.n }))
      check(`${tag}: ${step}: the arrow covers nothing else in the footer`, l.hits.length === 0, l.hits.join(', '))
      if (step === 'Why') check(`${tag}: the arrow is in the accent`, l.color === l.primary, `${l.color} vs ${l.primary}`)
      if (step === 'Why') {
        const moves = new Set()
        for (let i = 0; i < 10; i++) (moves.add((await look(h)).transform), await h.waitForTimeout(160))
        check(`${tag}: the arrow nudges toward Next (Motion on)`, moves.size >= 3, `${moves.size} positions`)
      }
      if (SHOTS && ['Why', 'Catch', 'Write', 'Ready'].includes(step)) await h.screenshot({ path: `${SHOTS}/${theme}-${width}-${step.replace(/\W+/g, '-').toLowerCase()}-arrow.png` })
      if (step === 'Ready') break
      const was = await chapter(h)
      // Watched in the page, a frame at a time, from the press on: the arrow must be gone within 250ms of it.
      await h.evaluate(() => {
        const w = window
        w.__arrow = { pressed: 0, frames: [] }
        const on = () => (w.__arrow.pressed = w.__arrow.pressed || performance.now())
        window.addEventListener('keydown', on, { capture: true, once: true })
        window.addEventListener('pointerdown', on, { capture: true, once: true })
        const tick = (now) => {
          const a = [...document.querySelectorAll('.mf-welcome [data-next-arrow]')].pop()
          if (w.__arrow.pressed) w.__arrow.frames.push({ t: now - w.__arrow.pressed, there: !!a && Number(getComputedStyle(a).opacity) > 0.5 })
          if (!w.__arrow.pressed || now - w.__arrow.pressed < 400) requestAnimationFrame(tick)
        }
        requestAnimationFrame(tick)
      })
      const skip = await h.$('footer button:has-text("Skip trying it")')
      if (skip) await skip.click()
      else await h.keyboard.press('Enter')
      await h.waitForTimeout(600)
      const seen = await h.evaluate(() => window.__arrow.frames)
      const goneAt = seen.find((one) => !one.there)
      check(`${tag}: ${step}: pressing ${skip ? '“Skip trying it”' : 'Enter'} takes the arrow away at once`, !!goneAt && goneAt.t <= 250, goneAt ? `gone ${Math.round(goneAt.t)}ms after` : `${seen.length} frames, never gone`)
      // A page that stays the same step after a press (none now; kept for safety): settle it again next time round.
      for (let i = 0; i < 4 && (await chapter(h)) === was; i++) (await settle(h), await h.keyboard.press('Enter'), await h.waitForTimeout(700))
    }
  } finally {
    if (c.errors.length) console.log(c.errors.join('\n'))
    await c.close()
  }
}

// Reduce motion: every page arrives settled, the arrow with it, and it holds still.
{
  const c = await sandbox({ width: 1280, height: 800, seeded: false })
  const { h } = c
  try {
    await h.emulateMedia({ reducedMotion: 'reduce' })
    await h.reload()
    await open(c)
    await h.waitForTimeout(900)
    const moves = new Set()
    for (let i = 0; i < 10; i++) (moves.add((await look(h)).transform), await h.waitForTimeout(160))
    const l = await look(h)
    check('reduce motion: the arrow is there and still', l.there && moves.size === 1, `${moves.size} positions, there ${l.there}`)
    if (SHOTS) await h.screenshot({ path: `${SHOTS}/still-arrow.png` })
    await h.evaluate(() => (document.documentElement.dataset.motion = 'off'))
    await h.keyboard.press('Enter')
    await h.waitForTimeout(800)
    const moves2 = new Set()
    for (let i = 0; i < 10; i++) (moves2.add((await look(h)).transform), await h.waitForTimeout(160))
    check('Motion off: the arrow is there on the next page and still', (await look(h)).there && moves2.size === 1, `${moves2.size} positions`)
  } finally {
    if (c.errors.length) console.log(c.errors.join('\n'))
    await c.close()
  }
}
console.log(failed ? `${failed} failed` : 'all passed')
process.exit(failed ? 1 : 0)
