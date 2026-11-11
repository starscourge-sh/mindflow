// "Make it yours": the dial turns itself to show a theme, then back. Is each turn one smooth glide? Every frame,
// the ring's angle and the frame's time are kept: a turn that jumps (a whole detent in one frame), a frame over
// 20ms, or the angle going back and forth (two motions fighting) fails. A turn of yours mid-glide stops it where
// it is. Light and dark. Frames as screenshots, every 50ms, when given a folder.
//
//   npx electron-vite build --outDir out-x && QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/welcome-dial-glide.mjs [shots-dir]
import { mkdirSync, writeFileSync } from 'fs'
import { sandbox } from './sandbox-lib.mjs'

const SHOTS = process.argv[2] ?? ''
if (SHOTS) mkdirSync(SHOTS, { recursive: true })
let failed = 0
const check = (name, ok, more = '') => {
  if (!ok) failed++
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${more ? `  (${more})` : ''}`)
}
const next = async (h) => ((await h.$('footer button:has-text("Skip trying it")')) ? h.click('footer button:has-text("Skip trying it")') : h.click('footer button:has-text("Next"), footer button:has-text("Show me")'))
const title = (h) => h.evaluate(() => document.querySelector('.mf-welcome h1')?.textContent ?? '')

for (const theme of ['light', 'dark']) {
  const c = await sandbox({ width: 1280, height: 800, seeded: false })
  const { h } = c
  try {
    await h.waitForSelector('.mf-welcome', { timeout: 8000 }).catch(() => h.evaluate(() => window.dispatchEvent(new CustomEvent('haligtree:welcome'))))
    await h.waitForSelector('.mf-welcome', { timeout: 8000 })
    await c.look(theme)
    // Every frame from here: its time, and the ring's angle.
    await h.evaluate(() => {
      const w = window
      w.__dial = []
      let last = performance.now()
      const angle = () => {
        const ring = document.querySelector('.mf-welcome [data-detent="0"]')?.parentElement
        if (!ring) return null
        const m = new DOMMatrix(getComputedStyle(ring).transform)
        return (Math.atan2(m.b, m.a) * 180) / Math.PI
      }
      const tick = (now) => {
        if (/Make it yours/.test(document.querySelector('.mf-welcome h1')?.textContent ?? '')) w.__dial.push({ t: now, dt: now - last, deg: angle(), vt: document.documentElement.matches(':active-view-transition') })
        last = now
        w.__dialRaf = requestAnimationFrame(tick)
      }
      w.__dialRaf = requestAnimationFrame(tick)
    })
    // Every frame as the page draws it (the screencast), kept when a folder is given.
    const cdp = SHOTS ? await c.electron.context().newCDPSession(h) : null
    const shots = []
    cdp?.on('Page.screencastFrame', (frame) => {
      if (shots.length > 2000) shots.shift()
      shots.push({ t: frame.metadata.timestamp * 1000, data: frame.data })
      void cdp.send('Page.screencastFrameAck', { sessionId: frame.sessionId }).catch(() => {})
    })
    await cdp?.send('Page.startScreencast', { format: 'jpeg', quality: 70, everyNthFrame: 1, maxWidth: 960 })
    // On to the dial's page, met as it comes: kept from its first frame.
    for (let i = 0; i < 30 && !/Make it yours/.test(await title(h)); i++) {
      await h.evaluate(() => document.querySelectorAll('.mf-welcome [data-reel]').length)
      await next(h)
      await h.waitForTimeout(400)
    }
    const met = Date.now() - 400
    check(`${theme}: on Make it yours`, /Make it yours/.test(await title(h)))
    await h.waitForTimeout(4500)
    await cdp?.send('Page.stopScreencast')
    if (SHOTS) shots.filter((one) => one.t >= met).forEach((one, i, kept) => writeFileSync(`${SHOTS}/${theme}-${String(i).padStart(3, '0')}-${Math.round(one.t - kept[0].t)}ms.jpg`, Buffer.from(one.data, 'base64')))
    const frames = await h.evaluate(() => (cancelAnimationFrame(window.__dialRaf), window.__dial.slice(1)))
    const per = 360 / (await h.evaluate(() => document.querySelectorAll('.mf-welcome [data-detent]').length))
    const steps = []
    for (let i = 1; i < frames.length; i++) if (frames[i].deg !== null && frames[i - 1].deg !== null) {
      let d = frames[i].deg - frames[i - 1].deg
      if (d > 180) d -= 360
      if (d < -180) d += 360
      steps.push(d)
    }
    const moving = steps.filter((d) => Math.abs(d) > 0.05)
    const jumps = steps.filter((d) => Math.abs(d) > per * 0.6)
    const long = frames.filter((one) => one.dt > 20)
    const sorted = frames.map((one) => one.dt).sort((a, b) => a - b)
    // Back and forth within one turn: the sign flips while it is moving, more than a spring's one settle each way.
    let flips = 0
    for (let i = 1; i < moving.length; i++) if (Math.sign(moving[i]) !== Math.sign(moving[i - 1]) && Math.abs(moving[i]) > 0.5 && Math.abs(moving[i - 1]) > 0.5) flips++
    console.log(`${theme}: ${frames.length} frames, median ${sorted[sorted.length >> 1]?.toFixed(1)}ms, worst ${Math.round(sorted[sorted.length - 1] ?? 0)}ms, ${long.length} over 20ms; ring moved on ${moving.length} frames, ${jumps.length} jumps of more than ${(per * 0.6).toFixed(0)}°, ${flips} reversals; ${frames.filter((one) => one.vt).length} frames in a view transition`)
    const t0 = frames[0]?.t ?? 0
    const at = (pick) => frames.filter(pick).map((one) => Math.round(one.t - t0)).join(' ')
    console.log(`  frames over 20ms at (ms from the page's first frame): ${at((one) => one.dt > 20)}; view transitions from ${at((one, i) => one.vt && !frames[i - 1]?.vt)}`)
    check(`${theme}: the dial turned by itself`, moving.length > 0, `${moving.length} frames moving`)
    check(`${theme}: each turn glides (no detent passed in one frame)`, jumps.length === 0, jumps.map((d) => d.toFixed(1)).join(' '))
    check(`${theme}: a turn never fights itself`, flips <= 4, `${flips} reversals`)
    check(`${theme}: frames inside the budget while it turns (under 5% over 20ms)`, long.length / Math.max(1, frames.length) < 0.05, `${long.length} of ${frames.length}`)
  } finally {
    if (c.errors.length) console.log(c.errors.join('\n'))
    await c.close()
  }
}
process.exit(failed ? 1 : 0)
