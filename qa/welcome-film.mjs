// Films the whole welcome as a newcomer plays it (welcome.tsx and its chapters), every frame the window draws (the
// browser's own screencast, timed), from the first frame through each chapter's arrival, its play and its leaving, to
// "Open my book" turning it over onto Home. Run on an empty data folder for a first run, or with `replay` on the seeded
// sandbox, opened from Settings as a person replays it. Writes <folder>/<ms>.jpg and <folder>/steps.json (when each
// chapter was asked for), for contact sheets read by eye. A film, not a check.
//   (replay: "Show the welcome again", as its menu line and ⌘K ask for it)
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-w/main/index.js HALIGTREE_QA_AWAY=1 node qa/welcome-film.mjs <folder> [light|dark] [1440|1180] [first|replay]
import { mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import { sandbox } from './sandbox-lib.mjs'

const SHOTS = process.argv[2]
const THEME = process.argv[3] ?? 'light'
const WIDTH = Number(process.argv[4] ?? 1440)
const MODE = process.argv[5] ?? 'first'
if (MODE === 'first') delete process.env.QA_ARGS
else process.env.QA_ARGS ??= '--sandbox'
mkdirSync(SHOTS, { recursive: true })
const c = await sandbox({ width: WIDTH, height: Math.round(WIDTH * 0.625), seeded: MODE !== 'first' })
const { h, close } = c
const steps = []
let t0 = 0
const film = async () => {
  const cdp = await h.context().newCDPSession(h)
  let n = 0
  cdp.on('Page.screencastFrame', (one) => {
    const at = Math.round(one.metadata.timestamp * 1000 - t0)
    writeFileSync(join(SHOTS, `${String(at).padStart(7, '0')}.jpg`), Buffer.from(one.data, 'base64'))
    n++
    void cdp.send('Page.screencastFrameAck', { sessionId: one.sessionId }).catch(() => undefined)
  })
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 72, maxWidth: 1200, maxHeight: 1200, everyNthFrame: 1 })
  return { count: () => n, stop: () => cdp.send('Page.stopScreencast').catch(() => undefined) }
}
const mark = (what) => steps.push({ at: Date.now() - t0, what })
// Every layout shift the browser counts (what moved, from where to where) and every frame that took over 100ms, on the
// page's own clock, for the list of glitches beside the film.
await c.electron.context().addInitScript(() => {
  window.qaShifts = []
  window.qaLong = []
  const name = (el) => !el || !el.tagName ? '?' : `${el.tagName.toLowerCase()}${[...el.attributes].filter((a) => a.name.startsWith('data-')).map((a) => `[${a.name}]`).slice(0, 3).join('')}.${String(el.className).split(' ').slice(0, 2).join('.')} "${(el.textContent ?? '').trim().slice(0, 40)}"`
  try {
    new PerformanceObserver((list) => {
      for (const one of list.getEntries()) window.qaShifts.push({ at: Math.round(one.startTime), value: Math.round(one.value * 1000) / 1000, parts: (one.sources ?? []).map((s) => `${name(s.node)} ${Math.round(s.previousRect.x)},${Math.round(s.previousRect.y)} -> ${Math.round(s.currentRect.x)},${Math.round(s.currentRect.y)}`) })
    }).observe({ type: 'layout-shift', buffered: true })
    new PerformanceObserver((list) => { for (const one of list.getEntries()) window.qaLong.push({ at: Math.round(one.startTime), ms: Math.round(one.duration) }) }).observe({ type: 'long-animation-frame', buffered: true })
  } catch {
    // Not counted in this browser.
  }
})
try {
  // A first run is filmed from its theme's reload, the welcome's own first frame on.
  t0 = Date.now()
  const reel = await film()
  if (MODE === 'first') {
    await c.theme(THEME)
  } else {
    await c.v('settings:set', { hintRate: 0, rotCount: 0 })
    await c.look(THEME)
  }
  if (MODE === 'replay') {
    // As a person replays it: "Show the welcome again", from the settings menu at the sidebar's foot or ⌘K (both
    // playWelcome, lib/onboarding.ts), over Home.
    await c.go('home')
    await h.waitForTimeout(800)
    mark('replay asked')
    await h.evaluate(() => window.dispatchEvent(new CustomEvent('haligtree:welcome')))
  }
  await h.waitForSelector('.mf-welcome', { timeout: 15000 })
  mark('welcome up')
  // Through the intro to the first chapter (the first run's title card plays on its own).
  await h.waitForSelector('[data-thesis="line"], .mf-welcome footer [data-next]', { timeout: 30000 })
  const chapter = () => h.evaluate(() => document.querySelector('.mf-welcome footer .sr-only')?.textContent ?? '')
  for (let i = 0; i < 20; i++) {
    const name = await chapter()
    mark(`chapter ${name}`)
    // Played to its end: Next ready (two looks), or two and a half minutes.
    const start = Date.now()
    let readyFor = 0
    while (Date.now() - start < 150000 && readyFor < 2) {
      const ready = await h.evaluate(() => {
        const next = document.querySelector('.mf-welcome footer [data-next]')
        const done = [...document.querySelectorAll('.mf-welcome [data-reel]')].every((el) => el.dataset.reel === 'done')
        return !!next?.hasAttribute('data-ready') && done
      })
      readyFor = ready ? readyFor + 1 : 0
      await h.waitForTimeout(250)
    }
    await h.waitForTimeout(800)
    mark(`ready ${name}`)
    const start2 = await h.$('[data-start-choices]')
    if (start2) {
      mark('open my book')
      await h.keyboard.press('Enter')
      await h.waitForTimeout(3500)
      mark('home')
      break
    }
    const skip = await h.$('footer button:has-text("Skip trying it")')
    if (skip) await skip.click()
    else await h.click('footer button:has-text("Continue"), footer button:has-text("Get started")')
    mark('next pressed')
    await h.waitForTimeout(400)
  }
  await reel.stop()
  writeFileSync(join(SHOTS, 'steps.json'), JSON.stringify(steps, null, 1))
  // On the film's clock: the page's own time when the film started, taken off.
  const { shifts, long, origin } = await h.evaluate(() => ({ shifts: window.qaShifts ?? [], long: window.qaLong ?? [], origin: performance.timeOrigin }))
  const at = (ms) => Math.round(origin + ms - t0)
  writeFileSync(join(SHOTS, 'shifts.json'), JSON.stringify({ shifts: shifts.map((one) => ({ ...one, at: at(one.at) })), long: long.filter((one) => one.ms > 100).map((one) => ({ ...one, at: at(one.at) })) }, null, 1))
  console.log(`layout shifts: ${shifts.length}; frames over 100ms: ${long.filter((one) => one.ms > 100).length}`)
  console.log(`frames: ${reel.count()}; ${steps.map((one) => `${one.at}ms ${one.what}`).join(' | ')}`)
} finally {
  await close()
}
