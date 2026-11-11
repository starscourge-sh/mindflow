// Every chapter's line under its headline arrives the same way, Write's ("What you catch waits in your Inbox...") included:
// sampled every frame from the moment Next is pressed, the line is not whole at its first visible frame (it comes in over
// several frames, rising as it fades in), and its siblings (Catch, Remember, Make it yours, Name it) arrive the same way, from the one shared Words component.
// Then Reduce Motion: the line is a plain fade, no rise.
//
//   npx electron-vite build --outDir out-x && QA_ARGS=--sandbox QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/welcome-line-arrives.mjs [shots-dir]
import { mkdirSync, mkdtempSync } from 'fs'
import { join } from 'path'
import { sandbox } from './sandbox-lib.mjs'

const SHOTS = process.argv[2] ?? ''
if (SHOTS) mkdirSync(SHOTS, { recursive: true })
let failed = 0
const check = (name, ok, more = '') => {
  if (!ok) failed++
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${more ? `  (${more})` : ''}`)
}
const chapter = (h) => h.evaluate(() => document.querySelector('.mf-welcome footer .sr-only')?.textContent ?? '')
const next = async (h) => ((await h.$('footer button:has-text("Skip trying it")')) ? h.click('footer button:has-text("Skip trying it")') : h.click('footer button:has-text("Next"), footer button:has-text("Show me")'))

// From a press of Next: each frame, the new page's line, as seen (its own opacity times the page's, and where it sits).
const film = (h) => h.evaluate(() => new Promise((done) => {
  const frames = []
  const t0 = performance.now()
  const button = [...document.querySelectorAll('.mf-welcome footer button')].find((b) => /Next|Skip trying it|Show me/.test(b.textContent))
  const before = document.querySelector('.mf-welcome h1')?.getAttribute('aria-label') ?? document.querySelector('.mf-welcome h1')?.textContent
  button.click()
  const tick = () => {
    const sections = [...document.querySelectorAll('.mf-welcome main > section')]
    const page = sections[sections.length - 1]
    const line = page?.querySelector('[data-words] > div')
    const h1 = page?.querySelector('[data-words] h1')?.textContent ?? ''
    if (line && h1 !== before) {
      let seen = 1
      for (let el = line; el && el !== document.body; el = el.parentElement) seen *= Number(getComputedStyle(el).opacity)
      const m = new DOMMatrix(getComputedStyle(line).transform)
      frames.push({ t: Math.round(performance.now() - t0), seen: Math.round(seen * 100) / 100, y: Math.round(m.m42 * 10) / 10, own: Number(getComputedStyle(line).opacity) })
    }
    if (performance.now() - t0 < 1600) requestAnimationFrame(tick)
    else done(frames)
  }
  requestAnimationFrame(tick)
}))
const summary = (frames) => {
  const shown = frames.filter((f) => f.seen > 0.02)
  const first = shown[0]
  const whole = frames.find((f) => f.seen > 0.95)
  return { firstAt: first?.t, firstSeen: first?.seen, wholeAt: whole?.t, rise: Math.max(0, ...frames.map((f) => f.y)), ownFrom: frames[0]?.own }
}

for (const reduce of [false, true]) {
  // A folder of its own for the second app: opened again on the folder the first one was killed in, it closed its
  // window before the welcome came (on main too), and the run stopped with Reduce Motion unchecked.
  if (reduce && process.env.QA_DATA) process.env.QA_DATA = mkdtempSync(join(process.env.QA_DATA, 'reduce-'))
  const c = await sandbox({ width: 1280, height: 800, seeded: false })
  const { h } = c
  try {
    if (reduce) await h.emulateMedia({ reducedMotion: 'reduce' })
    // Asked again until it opens: asked once at once, before the page had begun listening (a busy machine, unseeded),
    // the ask was lost and the run stopped here, on main too.
    for (let i = 0; i < 20 && !(await h.$('.mf-welcome')); i++) {
      await h.evaluate(() => window.dispatchEvent(new CustomEvent('haligtree:welcome')))
      await h.waitForSelector('.mf-welcome', { timeout: 1000 }).catch(() => {})
    }
    await h.waitForSelector('.mf-welcome', { timeout: 8000 })
    const seen = {}
    for (let i = 0; i < 40 && !(await chapter(h)).includes('Name it'); i++) {
      const was = await chapter(h)
      // Each page played to its end first, so Next goes on, not settles.
      for (let k = 0; k < 6; k++) {
        const done = await h.evaluate(() => [...document.querySelectorAll('.mf-welcome main > section')].pop()?.querySelector('[data-reel]')?.dataset.reel === 'done')
        if (done) break
        await h.keyboard.press('Escape')
        await h.waitForTimeout(300)
      }
      const frames = await film(h)
      await h.waitForTimeout(300)
      const now = await chapter(h)
      if (process.env.DUMP && /Catch/.test(now)) console.log(JSON.stringify(frames.filter((f, i) => i % 3 === 0)))
      if (now !== was) seen[now.replace(/^Chapter \d of \d: /, '')] = summary(frames)
      else await next(h)
      if (SHOTS && /Write/.test(now)) await h.screenshot({ path: `${SHOTS}/${reduce ? 'still' : 'motion'}-write.png` })
    }
    console.log(JSON.stringify(seen))
    const names = ['Catch it', 'Write it out', 'It comes back', 'Make it yours', 'Name it'].filter((n) => Object.keys(seen).some((k) => k.startsWith(n.split(' ')[0])))
    const of = (n) => seen[Object.keys(seen).find((k) => k.startsWith(n.split(' ')[0]))]
    const write = of('Write')
    if (!reduce) {
      check('Write: its line comes in over frames, not whole at its first visible frame', write && write.firstSeen < 0.5 && write.wholeAt - write.firstAt >= 150, JSON.stringify(write))
      check('Write: its line rises as it comes in, as the headline does', write && write.rise >= 4, JSON.stringify(write))
      for (const n of names.filter((n) => !n.startsWith('Write'))) {
        const one = of(n)
        check(`${n}: arrives the same way, rising as it fades in`, one && one.rise >= 4, JSON.stringify(one))
      }
    } else {
      check('Reduce Motion: Write\'s line is a plain fade, no rise', write && write.rise === 0 && write.firstSeen < 0.9, JSON.stringify(write))
    }
  } finally {
    if (c.errors.length) console.log(c.errors.join('\n'))
    await c.close()
  }
}
console.log(failed ? `${failed} FAILED` : 'ALL PASS')
process.exit(failed ? 1 : 0)
