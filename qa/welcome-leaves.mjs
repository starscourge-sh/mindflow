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
  // Through the arrival's mist first (qa/welcome-mist.mjs).
  await h.waitForSelector('[data-thesis="line"]', { timeout: 15000 })
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
  check("leaves blow across the first screen", swimming.inked > 100, JSON.stringify(swimming))
  // Settled first (a press while it plays finishes it), then on.
  await h.keyboard.press('Escape')
  await h.waitForTimeout(500)
  await h.locator(NEXT).first().click()
  await h.waitForTimeout(150)
  check('Next blows them away', await h.locator('[data-welcome-leaves="drifting"]').count() === 1)
  if (SHOTS) await h.screenshot({ path: join(SHOTS, `leaves-${THEME}-scatter.png`) })
  await h.waitForTimeout(3200)
  const after = await look()
  if (SHOTS) await h.screenshot({ path: join(SHOTS, `leaves-${THEME}-after.png`) })
  await h.waitForTimeout(9000)
  const later = await h.evaluate(() => {
    const canvas = document.querySelector('[data-welcome-leaves]')
    const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data
    let edges = 0, middle = 0
    for (let i = 3; i < data.length; i += 4 * 5) if (data[i] > 4) { const x = ((i - 3) / 4) % canvas.width; const y = Math.floor((i - 3) / 4 / canvas.width); x < canvas.width * 0.2 || x > canvas.width * 0.8 || y < canvas.height * 0.16 || y > canvas.height * 0.84 ? (edges += data[i]) : (middle += data[i]) }
    // Ink for each part of the page as large: the leaves cross the middle on the breeze, faint there, clear at the edges.
    return { edges: Math.round(edges / 0.592 / 255), middle: Math.round(middle / 0.408 / 255) }
  })
  if (SHOTS) await h.screenshot({ path: join(SHOTS, `leaves-${THEME}-later.png`) })
  check('later, clearly there, inked strongest round the edges, fainter across the middle', later.edges > 150 && later.edges > later.middle * 2.5, JSON.stringify(later))
  check('the big ones gone, smaller ones drifting on', after.inked > 20 && after.inked < swimming.inked * 0.6, `${swimming.inked} -> ${after.inked}`)
  // On "It comes back to you.", full to its edges: none in the middle of the page.
  for (let i = 0; i < 20 && !(await h.getByText('It comes back to you.').count()); i++) {
    await h.locator('footer button').filter({ hasText: /^(Next|Show me|Skip trying it)/ }).last().click().catch(() => {})
    await h.waitForTimeout(900)
  }
  await h.waitForTimeout(6000)
  const full = await h.evaluate(() => {
    const canvas = document.querySelector('[data-welcome-leaves]')
    if (!canvas) return null
    const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data
    let middle = 0
    for (let i = 3; i < data.length; i += 4 * 5) if (data[i] > 4) { const x = ((i - 3) / 4) % canvas.width; const y = Math.floor((i - 3) / 4 / canvas.width); if (x > canvas.width * 0.25 && x < canvas.width * 0.75 && y > canvas.height * 0.2 && y < canvas.height * 0.8) middle++ }
    return { middle }
  })
  if (SHOTS) await h.screenshot({ path: join(SHOTS, `leaves-${THEME}-remember.png`) })
  check('on "It comes back to you." none in the middle of the page', full && full.middle === 0, JSON.stringify(full))
  // The last page: the leaves gather into one bunch at a single base, bottom right, a florilegium.
  for (let i = 0; i < 30 && !(await h.getByText(/commonplace book is ready/).count()); i++) {
    await h.keyboard.press('Escape')
    await h.waitForTimeout(300)
    await h.locator('footer button').filter({ hasText: /^(Next|Show me|Skip trying it)/ }).last().click().catch(() => {})
    await h.waitForTimeout(700)
  }
  await h.waitForTimeout(5200)
  const bunch = await h.evaluate(() => {
    const canvas = document.querySelector('[data-welcome-leaves]')
    if (!canvas) return null
    const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data
    let near = 0
    for (let i = 3; i < data.length; i += 4 * 3) if (data[i] > 20) { const x = ((i - 3) / 4) % canvas.width; const y = Math.floor((i - 3) / 4 / canvas.width); if (x > canvas.width * 0.68 && y > canvas.height * 0.4) near++ }
    return { near }
  })
  if (SHOTS) await h.screenshot({ path: join(SHOTS, `leaves-${THEME}-bunch.png`) })
  check('on the last page they gather into one bunch, bottom right', bunch && bunch.near > 4000, JSON.stringify(bunch))
  check('no page errors', errors.length === 0, errors.join(' | '))
} finally {
  await close()
}
done()
