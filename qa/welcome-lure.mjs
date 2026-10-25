// On the welcome's last page a slow stream of leaves drifts in from the edges to the
// recommended way in and sinks behind it; the nearer the pointer, the quicker they come
// and the louder a soft rustle of wind; leaving the page stops the wind. The dial's page
// does the same toward the dial's ring. Under reduced motion nothing moves and nothing is heard.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-l/main/index.js HALIGTREE_QA_AWAY=1 node qa/welcome-lure.mjs [shots folder] [light|dark]
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
const lure = () => h.evaluate(() => ({ ...(window.haligtreeLure ?? {}), rustle: window.haligtreeRustle?.() ?? -1, heard: [...(window.haligtreeHeard ?? [])].slice(-12) }))
const shot = (name) => SHOTS && h.screenshot({ type: 'jpeg', quality: 85, scale: 'css', path: join(SHOTS, `lure-${THEME}-${name}.jpg`) })
// One page's three checks: drawn toward its target over time, quicker and louder with the pointer over it, quiet with the pointer away.
const page = async (name, target) => {
  const box = await h.locator(target).first().boundingBox()
  await h.mouse.move(1430, 40)
  await h.waitForTimeout(4000)
  const first = await lure()
  await h.waitForTimeout(3000)
  const later = await lure()
  await shot(`${name}-far`)
  check(`${name}: leaves come, a few at a time`, later.leaves >= 2 && later.leaves <= 6, JSON.stringify(later))
  check(`${name}: slowly, with the pointer far`, later.pace < 1.2, `pace ${later.pace?.toFixed(2)}`)
  check(`${name}: with the pointer far, no wind`, later.rustle === 0, String(later.rustle))
  // Toward it, a step at a time, then over it.
  for (let i = 1; i <= 10; i++) (await h.mouse.move(1430 + (box.x + box.width / 2 - 1430) * (i / 10), 40 + (box.y + box.height / 2 - 40) * (i / 10))), await h.waitForTimeout(60)
  await h.waitForTimeout(400)
  const coming = await lure()
  await h.waitForTimeout(3200)
  const over = await lure()
  await shot(`${name}-over`)
  check(`${name}: over it they quicken, nearly three times as fast, eased in`, coming.pace < over.pace && over.pace > 2.5, `${coming.pace?.toFixed(2)} -> ${over.pace?.toFixed(2)}`)
  check(`${name}: they reach it and sink behind it, more of them over it`, over.sunk > later.sunk && over.sunk - coming.sunk >= 1, `sunk ${first.sunk} -> ${later.sunk} -> ${coming.sunk} -> ${over.sunk}`)
  check(`${name}: and the wind rises, eased in`, coming.rustle < over.rustle && over.rustle > 0.8 && over.heard.includes('rustle'), `${coming.rustle?.toFixed(2)} -> ${over.rustle?.toFixed(2)}`)
  await h.mouse.move(1430, 40)
  await h.waitForTimeout(3500)
  const back = await lure()
  check(`${name}: the pointer away again, they slow and the wind falls`, back.pace < 1.4 && back.rustle < 0.15, JSON.stringify(back))
}
const next = async () => {
  await h.keyboard.press('Escape')
  await h.waitForTimeout(300)
  await h.locator('footer button').filter({ hasText: /^(Next|Show me|Skip trying it)/ }).last().click().catch(() => {})
  await h.waitForTimeout(700)
}
try {
  await c.theme(THEME)
  if (!(await h.$('.mf-welcome'))) await h.evaluate(() => window.dispatchEvent(new CustomEvent('haligtree:welcome')))
  await h.waitForSelector('[data-thesis="line"]', { timeout: 15000 })
  await h.waitForTimeout(1500)
  const DIAL = '.mf-welcome [role="slider"][aria-label="Theme"]'
  for (let i = 0; i < 30 && !(await h.locator(DIAL).count()); i++) await next()
  await h.waitForTimeout(1500)
  await page('dial', DIAL)
  // Over the dial's swatches and words, no leaf: they sink behind its ring.
  const clear = await h.evaluate((sel) => {
    const ring = document.querySelector(sel).getBoundingClientRect()
    const canvas = document.querySelector('[data-welcome-leaves]')
    const room = canvas.getBoundingClientRect()
    const scale = canvas.width / room.width
    const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data
    let inked = 0
    const cx = ring.left + ring.width / 2 - room.left
    const cy = ring.top + ring.height / 2 - room.top
    for (let y = 0; y < canvas.height; y += 3) for (let x = 0; x < canvas.width; x += 3) if (Math.hypot(x / scale - cx, y / scale - cy) < ring.width / 2 - 12 && data[(y * canvas.width + x) * 4 + 3] > 4) inked++
    return inked
  }, DIAL)
  check('dial: no leaf drawn over the ring', clear === 0, String(clear))
  await next()
  for (let i = 0; i < 30 && !(await h.getByText(/commonplace book is ready/).count()); i++) await next()
  await h.waitForTimeout(1500)
  await page('last', '.mf-welcome [data-recommended]')
  // Leaving the page while the wind blows: it stops.
  const box = await h.locator('.mf-welcome [data-recommended]').boundingBox()
  await h.mouse.move(box.x + 30, box.y + 30)
  await h.waitForTimeout(2500)
  const blowing = await lure()
  await h.keyboard.press('ArrowLeft')
  await h.waitForTimeout(1500)
  const left = await lure()
  check('leaving the page stops the wind', blowing.rustle > 0.5 && left.rustle === 0 && left.heard.includes('rustle-end'), `${blowing.rustle?.toFixed(2)} -> ${left.rustle} ${left.heard.join()}`)
  check('no page errors', errors.length === 0, errors.join(' | '))

  // Reduced motion: nothing drawn in, nothing heard.
  await h.click('footer [data-skip]').catch(() => {})
  await h.waitForTimeout(800)
  await h.click('footer [data-skip]').catch(() => {})
  await h.waitForTimeout(3000)
  await h.emulateMedia({ reducedMotion: 'reduce' })
  await h.evaluate(() => (window.haligtreeLure = undefined))
  await h.evaluate(() => window.dispatchEvent(new CustomEvent('haligtree:welcome')))
  await h.waitForSelector('[data-thesis="line"]', { timeout: 8000 })
  for (let i = 0; i < 30 && !(await h.locator('.mf-welcome [data-recommended]').count()); i++) await next()
  const quiet = await h.locator('.mf-welcome [data-recommended]').boundingBox()
  if (quiet) await h.mouse.move(quiet.x + 30, quiet.y + 30)
  await h.waitForTimeout(2500)
  const still = await lure()
  check('reduced motion: the last page is up', !!quiet)
  check('reduced motion: no leaves, no wind', (await h.locator('[data-welcome-leaves]').count()) === 0 && !still.leaves && still.rustle === 0, JSON.stringify(still))
} finally {
  await close()
}
done()
