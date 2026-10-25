// Whose words a note is, on a list row: a small round dot at the start of the
// line under its title, by its age, in its voice's colour (not grey); no bar
// along the row's rounded side any more. Checked in Soft, Paper and Brutal, on a light theme and a dark
// one, with a picture of the rows each time in SHOTS.
//   npx electron-vite build --outDir out-x
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-x/main/index.js HALIGTREE_QA_AWAY=1 [SHOTS=<dir>] node qa/voice-dot.mjs
import { mkdirSync } from 'fs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const SHOTS = process.env.SHOTS
if (SHOTS) mkdirSync(SHOTS, { recursive: true })
const results = []
const check = (name, ok, detail = '') => { results.push(!!ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`) }

const c = await sandbox({ width: 1200, height: 860 })
const { h, go } = c
try {
  for (const style of ['soft', 'paper', 'brutal']) for (const theme of ['paper', 'github']) {
    await h.evaluate(([t, s]) => { localStorage.setItem('theme', t); localStorage.setItem('style', s) }, [theme, style])
    await h.reload(); await h.waitForTimeout(1800)
    await go('inbox'); await h.waitForTimeout(900)
    const dot = await h.evaluate(() => {
      const row = [...document.querySelectorAll('[data-voice]:not([data-voice-edge])')].find((one) => one.getBoundingClientRect().height > 0)
      if (!row) return null
      const mark = row.querySelector('[data-voice-dot]')
      const bar = getComputedStyle(row, '::before').content
      if (!mark) return { bar }
      const s = getComputedStyle(mark)
      const r0 = row.getBoundingClientRect()
      const m = mark.getBoundingClientRect()
      // The dot's colour, read as sRGB through a canvas, so oklab and color-mix come out as numbers.
      const pen = document.createElement('canvas').getContext('2d')
      pen.fillStyle = s.backgroundColor; pen.fillRect(0, 0, 1, 1)
      const [r, g, b] = pen.getImageData(0, 0, 1, 1).data
      const age = mark.nextElementSibling?.getBoundingClientRect()
      return { w: m.width, h: m.height, left: m.left - r0.left, spread: Math.max(r, g, b) - Math.min(r, g, b), byAge: age ? Math.round(age.left - m.right) : null, bar, top: r0.top, x: r0.left }
    })
    const tag = `${style}/${theme === 'github' ? 'dark' : 'paper'}`
    check(`${tag}: a row's voice is a small dot, not a bar on its edge`, dot && Math.abs(dot.w - dot.h) < 0.5 && dot.w >= 5 && dot.w <= 8 && (dot.bar === 'none' || dot.bar === 'normal'), JSON.stringify(dot))
    check(`${tag}: by the row's age, well in from its edge`, dot && dot.left >= 24 && dot.byAge !== null && dot.byAge <= 8, JSON.stringify(dot))
    check(`${tag}: in its colour, not grey`, dot && dot.spread >= 24, String(dot?.spread))
    if (SHOTS && dot) await h.screenshot({ path: `${SHOTS}/voice-${style}-${theme}.png`, clip: { x: Math.max(0, dot.x - 8), y: Math.max(0, dot.top - 8), width: 520, height: 260 } })
  }
} finally {
  if (c.errors.length) console.log('errors:', c.errors.slice(0, 5))
  await c.close()
}
const passed = results.filter(Boolean).length
console.log(`\n${passed}/${results.length} passed`)
process.exit(passed === results.length ? 0 : 1)
