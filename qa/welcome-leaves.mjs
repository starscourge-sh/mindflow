// The welcome's first screen has autumn leaves blowing behind the words, drawn in
// letters on tinted tiles; the words stay clear; Next blows them away, gone in
// a gust, and a few small leaves drift on, faint, through the rest.
//   QA_DATA=$(mktemp -d) QA_ENTRY=out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/welcome-leaves.mjs [shots folder] [light|dark]
import { mkdirSync } from 'fs'
import { join } from 'path'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'

delete process.env.QA_ARGS
const SHOTS = process.argv[2] ?? ''
const THEME = process.argv[3] ?? 'light'
if (SHOTS) mkdirSync(SHOTS, { recursive: true })
const { check, done } = checks()
const c = await sandbox({ width: 1440, height: 900, seeded: false })
const { h, errors, close } = c
const NEXT = 'footer button:has-text("Show me"), footer button:has-text("Next")'
try {
  if (THEME === 'light') await h.evaluate(() => { localStorage.setItem('theme', 'paper'); document.documentElement.classList.remove('dark') })
  await h.waitForSelector('[data-welcome-leaves]', { timeout: 8000 })
  await h.waitForTimeout(4500)
  const look = () => h.evaluate(() => {
    const canvas = document.querySelector('[data-welcome-leaves]')
    if (!canvas) return { inked: 0, underWords: 0 }
    const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data
    let inked = 0
    for (let i = 3; i < data.length; i += 4 * 9) if (data[i] > 30) inked++
    return { inked }
  })
  for (let i = 0; i < 3; i++) {
    if (SHOTS) await h.screenshot({ path: join(SHOTS, `leaves-${THEME}-${i}.png`) })
    await h.waitForTimeout(2500)
  }
  const swimming = await look()
  check("leaves blow across the first screen", swimming.inked > 200, JSON.stringify(swimming))
  await h.locator(NEXT).first().click()
  await h.waitForTimeout(150)
  check('Next blows them away', await h.locator('[data-welcome-leaves="drifting"]').count() === 1)
  if (SHOTS) await h.screenshot({ path: join(SHOTS, `leaves-${THEME}-scatter.png`) })
  await h.waitForTimeout(3200)
  const after = await look()
  if (SHOTS) await h.screenshot({ path: join(SHOTS, `leaves-${THEME}-after.png`) })
  check('the big ones gone, a few small ones drifting on', after.inked > 20 && after.inked < swimming.inked / 3, `${swimming.inked} -> ${after.inked}`)
  check('no page errors', errors.length === 0, errors.join(' | '))
} finally {
  await close()
}
done()
