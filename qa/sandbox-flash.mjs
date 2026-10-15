// Into and out of the sandbox with nothing drawn in between: on the welcome's
// Ready page, “Try it with example notes first” goes straight from the
// welcome to the dark “Opening the sandbox” screen, and Home (the page about
// to be replaced) is never drawn for a frame, not even half seen through a
// fade. The other ways in and out (Settings, the menu bar, the sandbox's own
// “My notes”) put the opening screen up on the very next frames.
//
// Every frame is sampled in the window itself (what covers it: the welcome,
// the opening screen and how opaque it is) and the screen is recorded as a
// CDP screencast into the shots folder.
//
//   npx electron-vite build --outDir out-x
//   QA_DATA=$(mktemp -d) QA_ENTRY=out-x/main/index.js MINDFLOW_QA_AWAY=1 node qa/sandbox-flash.mjs [shots-dir]            (fresh: the welcome's Ready page; FLASH_FROM=home: “Open the sandbox” from Home)
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-x/main/index.js MINDFLOW_QA_AWAY=1 node qa/sandbox-flash.mjs [shots-dir]   (in the sandbox: “My notes”)
import { mkdirSync, writeFileSync } from 'fs'
import { execSync } from 'child_process'
import { sandbox } from './sandbox-lib.mjs'

const SHOTS = process.argv[2] ?? ''
if (SHOTS) mkdirSync(SHOTS, { recursive: true })
const IN_SANDBOX = (process.env.QA_ARGS ?? '').includes('--sandbox')
let failed = 0
const check = (name, ok, more = '') => {
  if (!ok) failed++
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${more ? `  (${more})` : ''}`)
}

/** In the window: one sample a frame (and every 8ms while frames do not come) of what covers it. */
const sampler = () => {
  const opacity = (el) => {
    let o = 1
    for (let at = el; at && at !== document.documentElement; at = at.parentElement) o *= Number(getComputedStyle(at).opacity)
    return o
  }
  const samples = []
  window.__flash = { samples, t0: null }
  const take = () => {
    const welcome = document.querySelector('.mf-welcome')
    const going = document.querySelector('[data-going]')
    samples.push({ t: performance.now(), welcome: welcome ? Math.round(opacity(welcome) * 100) / 100 : 0, going: going ? Math.round(opacity(going) * 100) / 100 : 0, text: going?.textContent?.trim() ?? '' })
  }
  const frame = () => (take(), requestAnimationFrame(frame))
  requestAnimationFrame(frame)
  setInterval(take, 8)
}

/** Records the window until it goes, then reads back every sample. */
async function record(c, label, trigger) {
  const { h } = c
  await h.evaluate(sampler)
  const frames = []
  const cdp = await h.context().newCDPSession(h).catch(() => null)
  if (cdp && SHOTS) {
    cdp.on('Page.screencastFrame', ({ data, sessionId, metadata }) => {
      frames.push({ t: metadata.timestamp, data })
      cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {})
    })
    await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 60, everyNthFrame: 1 }).catch(() => {})
  }
  await h.waitForTimeout(300)
  await h.evaluate(() => (window.__flash.t0 = performance.now()))
  await trigger()
  let samples = []
  const until = Date.now() + 6000
  while (Date.now() < until) {
    const got = await h.evaluate(() => window.__flash.samples.length ? { t0: window.__flash.t0, samples: window.__flash.samples } : null).catch(() => null)
    if (!got) break
    samples = got.samples.map((s) => ({ ...s, t: Math.round(s.t - got.t0) }))
    // Enough once the opening screen has stood fully up for a second.
    const up = samples.findIndex((s) => s.t > 0 && s.going >= 0.98)
    if (up >= 0 && samples[samples.length - 1].t - samples[up].t > 1000) break
    await h.waitForTimeout(100)
  }
  if (cdp) await cdp.send('Page.stopScreencast').catch(() => {})
  if (SHOTS) {
    const first = frames[0]?.t ?? 0
    frames.forEach((f, i) => writeFileSync(`${SHOTS}/${label}-${String(i).padStart(3, '0')}-${Math.round((f.t - first) * 1000)}ms.jpg`, Buffer.from(f.data, 'base64')))
    writeFileSync(`${SHOTS}/${label}-samples.json`, JSON.stringify(samples, null, 1))
  }
  return samples.filter((s) => s.t >= 0)
}

/** A sample where neither the welcome nor a fully opaque opening screen covers the window: the page under it shows. */
const bare = (s) => s.welcome < 0.98 && s.going < 0.98

const c = await sandbox({ width: 1100, height: 720, seeded: IN_SANDBOX })
const { h } = c
try {
  if (!IN_SANDBOX && process.env.FLASH_FROM === 'home') {
    // --- From Home (Settings, ⌘K, the menu bar all call the same enterSandbox) ---
    await h.waitForSelector('.mf-welcome', { timeout: 10000 })
    await h.click('.mf-welcome footer button:has-text("Skip the welcome")')
    await h.waitForTimeout(800)
    await h.click('.mf-welcome footer button:has-text("Skip the tips")')
    await h.waitForTimeout(1500)
    const samples = await record(c, 'home', () => h.evaluate(() => window.dispatchEvent(new CustomEvent('vigil:sandbox-enter'))))
    const seen = samples.find((s) => s.going > 0)
    const up = samples.find((s) => s.going >= 0.98)
    check('home: “Opening the sandbox” starts on the next frames', !!seen && seen.t < 120, seen ? `${seen.t}ms` : 'never')
    check('home: and stands fully up', !!up, up ? `at ${up.t}ms` : 'never')
  } else if (!IN_SANDBOX) {
    // --- From the welcome's Ready page ---
    await h.waitForSelector('.mf-welcome', { timeout: 10000 })
    await h.waitForTimeout(800)
    await h.click('.mf-welcome footer button:has-text("Skip the welcome")')
    await h.waitForSelector('.mf-welcome [data-choice="2"]', { timeout: 8000 })
    await h.waitForTimeout(1200)
    const samples = await record(c, 'welcome', () => h.click('.mf-welcome [data-choice="2"]'))
    // Until the opening screen is fully up: every sample has the welcome under it, or the screen itself.
    const up = samples.findIndex((s) => s.going >= 0.98)
    const before = up < 0 ? samples : samples.slice(0, up)
    const flashes = before.filter(bare)
    check('welcome: the opening screen stands fully up', up >= 0, up >= 0 ? `at ${samples[up].t}ms` : 'never')
    check('welcome: no frame shows the page under the welcome before the opening screen covers it', flashes.length === 0, `${flashes.length} of ${before.length} samples bare, ${flashes.length ? `${flashes[0].t}ms to ${flashes[flashes.length - 1].t}ms` : 'none'}`)
    const seen = samples.find((s) => s.going > 0)
    check('welcome: the opening screen starts on the next frames after the click', !!seen && seen.t < 120, seen ? `${seen.t}ms` : 'never')
    check('welcome: it says “Opening the sandbox”', samples.some((s) => s.text === 'Opening the sandbox'))
  } else {
    // --- In the sandbox: “My notes” ---
    await h.waitForTimeout(1500)
    const samples = await record(c, 'leave', () => h.evaluate(() => window.dispatchEvent(new CustomEvent('vigil:sandbox-leave'))))
    const seen = samples.find((s) => s.going > 0)
    const up = samples.find((s) => s.going >= 0.98)
    check('leave: “Back to your notes” starts on the next frames', !!seen && seen.t < 120, seen ? `${seen.t}ms` : 'never')
    check('leave: and stands fully up', !!up, up ? `at ${up.t}ms` : 'never')
  }
} catch (error) {
  failed++
  console.log('FAIL run', error.message)
} finally {
  await c.close()
}
// The run the switch started (detached, so the test does not own it) ended too.
try { execSync(`pkill -f "${process.env.QA_ENTRY ?? '.'} --show-home"`) } catch {}
console.log(failed ? `${failed} failed` : 'all passed')
process.exit(failed ? 1 : 0)
