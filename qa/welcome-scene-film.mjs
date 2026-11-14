// Films the welcome's arrival as it now is (welcome-scene.tsx, main: makeScene): the scene window over the whole screen
// from its first frame to the handover, over a picture of a desktop stood behind its page (the Mac's own blur under the
// fog stood in for by blurring that picture on the scene's clock), and then the welcome's own window from just before
// the handover to the first page's words. Every frame each page draws (the browser's own screencast), named by the
// scene's clock and written as JPEGs in <folder>/desk and <folder>/window, for contact sheets read by eye beside Dia's.
// A film, not a check: qa/welcome-arrival.mjs holds the checks.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/welcome-scene-film.mjs <folder> [dark|light] [desktop.jpg]
import { mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { sandbox } from './sandbox-lib.mjs'

delete process.env.QA_ARGS
process.env.HALIGTREE_QA_ARRIVAL = '1'
process.env.HALIGTREE_QA_VIRTUAL ??= '1'
const SHOTS = process.argv[2]
const THEME = process.argv[3] ?? 'dark'
const DESK = process.argv[4]
// `pace` measures the scene window's frames in real time instead of filming.
const PACE = process.argv[5] === 'pace'
// The scene's moments filmed, in ms of its clock: Dia's own beats, as welcome-scene.tsx follows them.
const MOMENTS = (process.env.QA_MOMENTS ?? '200,1400,2200,3200,4600,5200,6600,7400,8600,10000,10900,11500,11900,12300,12700').split(',').map(Number)
for (const part of ['desk', 'window']) mkdirSync(join(SHOTS, part), { recursive: true })
const desktop = DESK ? `url(data:image/jpeg;base64,${readFileSync(DESK).toString('base64')}) center / cover` : 'linear-gradient(180deg, #f2a65a 0%, #c86b46 45%, #3d4f6b 100%)'
const c = await sandbox({ width: 1440, height: 900, seeded: false })
const { h, close } = c
const film = async (page, maxWidth) => {
  const cdp = await page.context().newCDPSession(page)
  const frames = []
  cdp.on('Page.screencastFrame', (one) => {
    frames.push({ data: one.data, at: one.metadata.timestamp })
    void cdp.send('Page.screencastFrameAck', { sessionId: one.sessionId }).catch(() => undefined)
  })
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 70, maxWidth, maxHeight: maxWidth, everyNthFrame: 1 })
  return { frames, stop: () => cdp.send('Page.stopScreencast').catch(() => undefined) }
}
try {
  await c.theme(THEME)
  await h.evaluate(() => window.dispatchEvent(new CustomEvent('haligtree:welcome')))
  let s = null
  for (let i = 0; i < 100 && !s; i++) (s = c.electron.windows().find((one) => one.url().includes('view=scene')) ?? null) || (await h.waitForTimeout(50))
  if (!s) throw new Error('no scene window')
  await s.waitForLoadState('domcontentloaded')
  // The desktop behind the scene's page.
  await s.evaluate((background) => {
    const el = document.createElement('div')
    el.id = 'qa-desktop'
    el.style.cssText = `position:fixed;inset:0;z-index:-1;background:${background}`
    document.body.prepend(el)
  }, desktop)
  let t0 = 0
  for (let i = 0; i < 100 && !t0; i++) (t0 = await c.electron.evaluate(() => globalThis.haligtreeArrival?.().t0 ?? 0)) || (await h.waitForTimeout(50))
  if (!t0) throw new Error('the scene never started')
  const place = await c.electron.evaluate(() => globalThis.haligtreeArrival?.().place ?? null)
  if (PACE) {
    // How smoothly the scene window draws in real time: each frame's gap, to the handover.
    await s.evaluate(() => { window.qaGaps = []; let last = performance.now(); const tick = (now) => { window.qaGaps.push(now - last); last = now; if (window.qaGaps.length < 2000) requestAnimationFrame(tick) }; requestAnimationFrame(tick) })
    await h.waitForTimeout(Math.max(0, t0 + 12700 - Date.now()))
    const gaps = await s.evaluate(() => window.qaGaps)
    const sorted = [...gaps].sort((a, b) => a - b)
    const pick = (q) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))]
    console.log(`scene window frames: ${gaps.length} in ${(gaps.reduce((a, b) => a + b, 0) / 1000).toFixed(1)}s; median ${pick(0.5).toFixed(1)} ms, 95th ${pick(0.95).toFixed(1)} ms, longest ${sorted.at(-1).toFixed(1)} ms; over 34 ms: ${gaps.filter((g) => g > 34).length}`)
  } else {
    // The scene window at the moments asked (its own clock set, each drawn and taken).
    for (const at of MOMENTS.filter((one) => one < 12790)) {
      await s.evaluate((now) => {
        window.qaSceneNow = now
        window.qaScenePaint?.()
      }, t0 + at)
      await s.waitForTimeout(60)
      writeFileSync(join(SHOTS, 'desk', `${String(at).padStart(6, '0')}.jpg`), await s.screenshot({ type: 'jpeg', quality: 82 }))
    }
    // The welcome's own window from the handover on, in real time.
    await h.waitForTimeout(Math.max(0, t0 + 12300 - Date.now()))
    const windowFilm = await film(h, 1100)
    await h.waitForTimeout(Math.max(0, t0 + 19000 - Date.now()))
    await windowFilm.stop()
    for (const one of windowFilm.frames) writeFileSync(join(SHOTS, 'window', `${String(Math.round(one.at * 1000 - t0)).padStart(6, '0')}.jpg`), Buffer.from(one.data, 'base64'))
    console.log(`desk moments: ${MOMENTS.filter((one) => one < 12790).length}; window frames: ${windowFilm.frames.length}`)
  }
  writeFileSync(join(SHOTS, 'place.json'), JSON.stringify(place))
  console.log(`steps: ${JSON.stringify(await c.electron.evaluate(() => globalThis.haligtreeArrival?.() ?? null))}`)
} finally {
  await close()
}
