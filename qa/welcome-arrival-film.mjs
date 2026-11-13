// Films the welcome's arrival out of the desktop with every frame the page draws (the browser's own screencast, not
// one picture at a time), over a picture stood behind the page for the desktop, busy or plain, in light or dark: the
// spark's burst in the mist and the mist drawing in to the window, each frame named by the mist's own clock, laid six
// to a row on contact sheets for reading by eye. A film, not a check: qa/welcome-arrival.mjs holds the checks.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/welcome-arrival-film.mjs <folder> [light|dark] [busy|plain]
import { mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import { sandbox } from './sandbox-lib.mjs'

delete process.env.QA_ARGS
process.env.HALIGTREE_QA_ARRIVAL = '1'
const SHOTS = process.argv[2]
const THEME = process.argv[3] ?? 'dark'
const KIND = process.argv[4] ?? 'busy'
mkdirSync(SHOTS, { recursive: true })
const c = await sandbox({ width: 1440, height: 900, seeded: false })
const { h, close } = c
try {
  await c.electron.context().addInitScript(() => { document.hasFocus = () => true })
  await c.theme(THEME)
  // Played afresh, held at its start (as qa/welcome-arrival.mjs replays it), the desktop's picture put behind it, then let go.
  await h.evaluate(() => { document.hasFocus = () => true; window.dispatchEvent(new Event('focus')) })
  await h.evaluate(() => { document.documentElement.setAttribute('data-arrival-hold', ''); window.dispatchEvent(new CustomEvent('haligtree:welcome')) })
  await h.waitForSelector('[data-welcome-mist="desk"]', { timeout: 8000 })
  await h.waitForTimeout(400)
  await h.evaluate((kind) => {
    const el = document.createElement('div')
    el.id = 'qa-desktop'
    el.style.cssText = `position:fixed;inset:0;z-index:-1;background:${kind === 'busy'
      ? 'repeating-linear-gradient(115deg, rgba(255,255,255,.22) 0 10px, transparent 10px 64px), repeating-linear-gradient(24deg, rgba(0,0,0,.28) 0 5px, transparent 5px 92px), radial-gradient(circle at 78% 64%, #1f6b3a 0 17%, transparent 17.3%), radial-gradient(circle at 21% 28%, #ffd166 0 8%, transparent 8.3%), radial-gradient(circle at 50% 50%, #e63946 0 5%, transparent 5.3%), linear-gradient(180deg, #f78fb3 0%, #b28dff 38%, #4a78b8 62%, #1d3f72 100%)'
      : '#4a78b8'}`
    document.body.prepend(el)
  }, KIND)
  const cdp = await h.context().newCDPSession(h)
  const frames = []
  cdp.on('Page.screencastFrame', (one) => {
    frames.push({ data: one.data, at: one.metadata.timestamp })
    void cdp.send('Page.screencastFrameAck', { sessionId: one.sessionId }).catch(() => undefined)
  })
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 60, maxWidth: 720, maxHeight: 450, everyNthFrame: 1 })
  // The mist's clock against the screencast's: read once as it starts.
  await h.evaluate(() => document.documentElement.removeAttribute('data-arrival-hold'))
  const pairs = []
  const began = Date.now()
  while (Date.now() - began < 25000) {
    const now = await h.evaluate(() => ({ t: window.haligtreeArrival?.frames.at(-1)?.[0] ?? -1, landed: !!window.haligtreeArrival?.landed }))
    pairs.push({ wall: Date.now() / 1000, t: now.t })
    if (now.landed) break
    await h.waitForTimeout(200)
  }
  await h.waitForTimeout(500)
  await cdp.send('Page.stopScreencast')
  const trace = await h.evaluate(() => window.haligtreeArrival?.frames ?? [])
  // Each screencast frame named by the mist's clock: the nearest reading of it, moved on by the wall clock since.
  const named = frames.map((one) => {
    const near = pairs.reduce((best, p) => (Math.abs(p.wall - one.at) < Math.abs(best.wall - one.at) ? p : best), pairs[0])
    return { ...one, t: Math.round(near.t + (one.at - near.wall) * 1000) }
  })
  const inAt = trace.find((one) => one[3] < trace[0][3])?.[0] ?? Infinity
  const gaps = named.slice(1).map((one, i) => Math.round((one.at - named[i].at) * 1000))
  console.log(`${THEME} ${KIND}: ${named.length} frames filmed; the draw-in from ${Math.round(inAt)} ms; frame gaps in the draw-in: longest ${Math.max(...gaps.filter((_, i) => named[i + 1].t >= inAt))} ms, mean ${(gaps.filter((_, i) => named[i + 1].t >= inAt).reduce((a, b) => a + b, 0) / Math.max(1, gaps.filter((_, i) => named[i + 1].t >= inAt).length)).toFixed(1)} ms`)
  // The parts worth reading frame by frame: the spark's burst (4.6 to 7.4 s) and the drawing in to the end.
  const parts = { burst: named.filter((one) => one.t >= 4600 && one.t <= 7400), drawin: named.filter((one) => one.t >= inAt - 200) }
  for (const [name, list] of Object.entries(parts)) {
    list.forEach((one, i) => writeFileSync(join(SHOTS, `${THEME}-${KIND}-${name}-${String(i).padStart(3, '0')}-${one.t}ms.jpg`), Buffer.from(one.data, 'base64')))
    for (let part = 0; part * 36 < list.length; part++) {
      const tiles = list.slice(part * 36, part * 36 + 36).map((one) => ({ label: `${one.t}ms`, data: one.data }))
      const sheet = await h.evaluate(async (tiles) => {
        const pictures = []
        for (const one of tiles) { const picture = new Image(); picture.src = `data:image/jpeg;base64,${one.data}`; await picture.decode(); pictures.push(picture) }
        const width = 360
        const height = Math.round(width * pictures[0].naturalHeight / pictures[0].naturalWidth)
        const canvas = document.createElement('canvas')
        canvas.width = 6 * width
        canvas.height = Math.ceil(tiles.length / 6) * height
        const ctx = canvas.getContext('2d')
        pictures.forEach((picture, i) => {
          const x = (i % 6) * width, y = Math.floor(i / 6) * height
          ctx.drawImage(picture, x, y, width, height)
          ctx.fillStyle = 'rgba(0,0,0,0.75)'
          ctx.fillRect(x, y, 84, 22)
          ctx.fillStyle = 'white'
          ctx.font = '14px ui-monospace, monospace'
          ctx.fillText(tiles[i].label, x + 5, y + 16)
        })
        return canvas.toDataURL('image/jpeg', 0.85).split(',')[1]
      }, tiles).catch((error) => (console.log(`(no sheet: ${error.message})`), null))
      if (sheet) writeFileSync(join(SHOTS, `sheet-${THEME}-${KIND}-${name}-${part + 1}.jpg`), Buffer.from(sheet, 'base64'))
    }
    console.log(`${name}: ${list.length} frames, ${list[0]?.t ?? '-'} to ${list.at(-1)?.t ?? '-'} ms`)
  }
} finally {
  await close()
}
