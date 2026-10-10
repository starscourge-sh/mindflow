// Tidy stickies: every sticky out glides into a column down the right middle
// of its screen, clear of the top quarter, inside the work area; "Put them
// back" returns each to where it was; the new places are kept in
// stickies.json; with Motion off they jump there at once. Real windows.
//
//   npx electron-vite build --outDir out-stickies
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-stickies/main/index.js MINDFLOW_QA_AWAY= node qa/tidy-stickies.mjs
import { mkdirSync, readFileSync, readdirSync, existsSync, writeFileSync } from 'fs'
import { join } from 'path'
import { open } from './harness.mjs'

const SHOTS = process.env.QA_SHOTS ?? 'scratchpad/stickies'
mkdirSync(SHOTS, { recursive: true })
const results = []
const check = (name, ok, detail = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`) }

const h = await open()
const { page, electron: app } = h
await page.waitForTimeout(1500)

/** Every sticky window: its key from its address, and where it is. */
const stickies = () => app.evaluate(({ BrowserWindow, screen }) => BrowserWindow.getAllWindows()
  .filter((w) => !w.isDestroyed() && w.webContents.getURL().includes('view=sticky'))
  .map((w) => {
    const url = new URL(w.webContents.getURL())
    return { key: `${url.searchParams.get('type')}:${url.searchParams.get('id')}`, b: w.getBounds(), visible: w.isVisible(), work: screen.getDisplayMatching(w.getBounds()).workArea }
  }))
/**
 * A picture of the desk: the screen is not readable from here (stickies are
 * kept out of screen captures), so each sticky's own page is captured and laid
 * where its window is, over the work area, its top quarter shaded.
 */
const shot = async (name) => {
  const png = await app.evaluate(async ({ BrowserWindow, screen }) => {
    const wa = screen.getPrimaryDisplay().workArea
    const k = 0.5
    const cards = await Promise.all(BrowserWindow.getAllWindows().filter((w) => !w.isDestroyed() && w.isVisible() && w.webContents.getURL().includes('view=sticky'))
      .map(async (w) => ({ b: w.getBounds(), src: (await Promise.race([w.webContents.capturePage(), new Promise((r) => setTimeout(() => r(null), 4000))]))?.toDataURL() ?? '' })))
    const html = `<body style="margin:0;background:#2b2f36;position:relative;width:${wa.width * k}px;height:${wa.height * k}px;overflow:hidden">
      <div style="position:absolute;left:0;top:0;right:0;height:${wa.height * 0.25 * k}px;background:rgba(255,80,80,.18);border-bottom:1px dashed #f88;font:12px sans-serif;color:#fbb;padding:4px">top quarter: kept clear</div>
      ${cards.map(({ b, src }) => `<img src="${src}" style="position:absolute;left:${(b.x - wa.x) * k}px;top:${(b.y - wa.y) * k}px;width:${b.width * k}px;height:${b.height * k}px;outline:1px solid rgba(255,255,255,.25)">`).join('')}</body>`
    const view = new BrowserWindow({ show: false, paintWhenInitiallyHidden: true, width: Math.round(wa.width * k), height: Math.round(wa.height * k), useContentSize: true })
    const late = (ms) => new Promise((_, no) => setTimeout(() => no(new Error('slow')), ms))
    try {
      await Promise.race([view.loadURL('about:blank'), late(8000)])
      await Promise.race([view.webContents.executeJavaScript(`document.documentElement.innerHTML = ${JSON.stringify(html)}; new Promise((r) => setTimeout(r, 300))`), late(8000)])
      return (await Promise.race([view.webContents.capturePage(), late(8000)])).toPNG().toString('base64')
    } finally { view.destroy() }
  }).catch(() => null)
  if (png) writeFileSync(join(SHOTS, `${name}.png`), Buffer.from(png, 'base64'))
}

// The sandbox's own stickies taken down, then four notes stuck: they fit in one column.
// The sandbox puts its own back as it starts, so they are taken down once they are all out.
await page.waitForTimeout(3000)
for (let i = 0; i < 20 && (await stickies()).length; i++) {
  for (const one of await stickies()) await page.evaluate(([type, id]) => window.api.stick(type, id, false), one.key.split(':'))
  await page.waitForTimeout(500)
}
let all = []
for (let i = 0; i < 40 && all.length < 14; i++) (all = await page.evaluate(() => window.api.captures.list())), all.length < 14 && (await page.waitForTimeout(250))
const ids = all.slice(0, 4).map((one) => one.id)
check('the sandbox has notes to stick', all.length >= 14, `${all.length}`)
for (const id of ids) await page.evaluate((id) => window.api.stick('capture', id, true), id)
for (let i = 0; i < 40 && (await stickies()).filter((s) => s.visible).length < 4; i++) await page.waitForTimeout(250)
check('four stickies are up', (await stickies()).filter((s) => s.visible).length === 4)

// Scattered, as by hand: one at the top right (over other apps' buttons), one top left, the rest about.
const scatter = async () => {
  await app.evaluate(({ BrowserWindow, screen }) => {
    const wa = screen.getPrimaryDisplay().workArea
    const spots = [[wa.x + wa.width - 310, wa.y + 4], [wa.x + 20, wa.y + 30], [wa.x + wa.width / 2, wa.y + wa.height / 2], [wa.x + 200, wa.y + wa.height - 260], [wa.x + wa.width - 700, wa.y + 120]]
    BrowserWindow.getAllWindows().filter((w) => w.webContents.getURL().includes('view=sticky')).forEach((w, n) => {
      const [x, y] = spots[n % spots.length]
      w.setPosition(Math.round(x), Math.round(y))
      w.emit('moved')
    })
  })
  await page.waitForTimeout(400)
  return Object.fromEntries((await stickies()).map((s) => [s.key, s.b]))
}
const before = await scatter()
await shot('1-scattered')

const userData = await app.evaluate(({ app }) => app.getPath('userData'))
const kept = () => {
  const file = [join(userData, 'stickies.json'), ...(existsSync(join(userData, 'sandbox')) ? readdirSync(join(userData, 'sandbox')).map((f) => join(userData, 'sandbox', f)) : [])].find((f) => f.endsWith('stickies.json') && existsSync(f))
  return file ? Object.fromEntries(JSON.parse(readFileSync(file, 'utf8')).map((one) => [`${one.type}:${one.id}`, one.bounds])) : {}
}

/** Every sticky inside its work area, against the right edge 24 in, and below the top quarter. */
const tidy = (list) => list.every(({ b, work }) =>
  b.x >= work.x && b.y >= work.y && b.x + b.width <= work.x + work.width && b.y + b.height <= work.y + work.height &&
  work.x + work.width - (b.x + b.width) >= 24 && work.x + work.width - (b.x + b.width) <= 24 + 16 &&
  b.y >= work.y + work.height * 0.25 - 1 && b.y + b.height <= work.y + work.height - 24)
const sameAs = (list, want) => list.every((s) => want[s.key] && s.b.x === want[s.key].x && s.b.y === want[s.key].y)

// Midway it is still on its way: a glide, not a jump.
await page.evaluate(() => window.api.tidyStickies())
await page.waitForTimeout(90)
const midway = await stickies()
await page.waitForTimeout(1200)
const after = await stickies()
await shot('2-tidied')
check('tidied: every sticky right middle, inside the work area, clear of the top quarter', tidy(after), JSON.stringify(after.map((s) => s.b)))
check('tidied: glides rather than jumping (some still on the way at 90ms)', !tidy(midway))
check('tidied: none overlap when they fit in one column', after.every((a, i) => after.every((b, j) => i === j || a.b.y + a.b.height <= b.b.y || b.b.y + b.b.height <= a.b.y)))
const ys = after.map((s) => s.b.y).sort((a, b) => a - b)
const mid = (ys[0] + Math.max(...after.map((s) => s.b.y + s.b.height))) / 2
check('tidied: the column is centred on the screen height', Math.abs(mid - (after[0].work.y + after[0].work.height / 2)) <= after[0].work.height * 0.13, `${Math.round(mid)}`)
await page.waitForTimeout(300)
check('tidied: new places kept in stickies.json', sameAs(after, kept()))

// Put them back.
await page.evaluate(() => window.api.untidyStickies())
await page.waitForTimeout(1200)
const back = await stickies()
await shot('3-put-back')
check('put back: every sticky where it was', sameAs(back, before), JSON.stringify(back.map((s) => s.b)))
check('put back: old places kept in stickies.json', sameAs(back, kept()))

// A drag after a tidy is still kept as your own place (the tidy left no stale mark behind).
await page.evaluate(() => window.api.tidyStickies())
await page.waitForTimeout(1200)
await app.evaluate(({ BrowserWindow }) => {
  const w = BrowserWindow.getAllWindows().find((x) => x.webContents.getURL().includes('view=sticky'))
  w.setPosition(w.getBounds().x - 300, w.getBounds().y)
  w.emit('moved')
})
await page.waitForTimeout(300)
const dragged = (await stickies())[0]
check('a drag after a tidy is kept', kept()[dragged.key]?.x === dragged.b.x)

// Motion off: straight there, no glide.
await page.evaluate(() => window.api.vigil('settings:set', { motion: false }))
const before2 = await scatter()
await page.evaluate(() => window.api.tidyStickies())
await page.waitForTimeout(60)
const still = await stickies()
check('Motion off: tidied at once', tidy(still), JSON.stringify(still.map((s) => s.b)))
await page.evaluate(() => window.api.untidyStickies())
await page.waitForTimeout(60)
check('Motion off: put back at once', sameAs(await stickies(), before2))
await page.evaluate(() => window.api.vigil('settings:set', { motion: true }))

// Too many for one column: fourteen overlap as a fan, still inside the right middle.
const more = all.slice(4, 14).map((one) => one.id)
for (const id of more) await page.evaluate((id) => window.api.stick('capture', id, true), id)
for (let i = 0; i < 40; i++) { const now = await stickies(); if (now.length >= 4 + more.length && now.every((s) => s.visible)) break; await page.waitForTimeout(250) }
await page.evaluate(() => window.api.tidyStickies())
await page.waitForTimeout(1500)
const fan = await stickies()
await shot('4-fan')
check(`a fan of ${fan.length}: inside the right middle, clear of the top quarter`, tidy(fan), JSON.stringify(fan.map((s) => s.b)))

// The toast says it with "Put them back", in the window main picked.
const toastSaid = await app.evaluate(({ BrowserWindow }) => Promise.all(BrowserWindow.getAllWindows().filter((w) => !w.isDestroyed()).map((w) => w.webContents.executeJavaScript(`document.querySelector('[role=status]')?.textContent ?? ''`).catch(() => ''))))
check('a toast offers Put them back', toastSaid.some((t) => /tidied.*Put them back/.test(t)), toastSaid.filter(Boolean).join(' | '))

const failed = results.filter((ok) => !ok).length
console.log(failed ? `${failed} FAILED` : 'ALL PASS')
app.process().kill('SIGKILL')
process.exit(failed ? 1 : 0)
