// How long Haligtree takes to start, step by step. Started from nothing QA_RUNS times (5 by default) as a person's
// launch is (by Electron itself, qa/harness.mjs `launch({ timing })`), on a copy of the data started once beforehand
// (any first-run work of a new build done, not counted): each time as the first start of a day (cold: the day's
// backup of the book not made yet, so it is made as it starts), then again (the same day). Read from main's own marks
// (src/main/start-times.ts) and the main window's (windows/home.tsx; the page's own paint timings), then ⌘K pressed
// the moment the window is shown, and the frame that draws the search box is "the first key answered". A table per
// kind of start: each step's median in ms and its share.
//
//   solo ./node_modules/.bin/electron-vite build --outDir out-x
//   solo --quiet env QA_ENTRY=$PWD/out-x/main/index.js QA_FROM=<seeded sandbox> QA_DATA=<a copy's path> QA_ARGS=--sandbox HALIGTREE_QA_AWAY=1 node qa/start-time.mjs
// QA_FROM: the data to start on, cloned (cp -c) to QA_DATA, which is deleted at the end; without it, QA_DATA as it is.
// QA_COMPARE=<another build's main/index.js>: that build started in turn with QA_ENTRY's, start for start, so the two
// tables are measured at the same load (the old build and the new back to back). With QA_FROM, each on a copy of its
// own (QA_DATA and QA_DATA-compared): on one copy, each build undid the other's picture index at every start.
// QA_FRAMES=<dir>: the main window's own frames, from the launch to the first key answered, of every start (cold-1…).
// QA_FRAMES_UNTIL=<ms>: filmed on to that long after the launch at least (a painting coming in after the first screen),
// the search box put away once the key is answered.
// QA_SETTLE=<ms>: the untimed first start of each build left open that long, so its own first-start work (a picture
// index made afresh) is done before the timed starts.
// QA_FORGET=<a path in the data>: taken away before each cold start too (sandbox/scenery-cache: the paintings looked
// through afresh, as on a book's first start).
// QA_THEME=<theme> (paper, dark…): worn from the first cold start on (set as the start before it ends), for light and dark frames.
// QA_PROFILE=<file> with HALIGTREE_QA_PROFILE_START=1: main's CPU profile from its first module to quick capture drawn,
// of each start, written as <file>-<cold|again>-<n>.cpuprofile (a profiled start is slower: not for the table).
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { SourceMapConsumer } from 'source-map'
import { checks, launch } from './harness.mjs'
import { cast } from './cast-lib.mjs'

const RUNS = Number(process.env.QA_RUNS ?? 5)
const FROM = process.env.QA_FROM
const DATA = process.env.QA_DATA
const FRAMES = process.env.QA_FRAMES
const UNTIL = Number(process.env.QA_FRAMES_UNTIL ?? 0)
const FORGET = process.env.QA_FORGET
const SETTLE = Number(process.env.QA_SETTLE ?? 0)
const THEME = process.env.QA_THEME
if (!DATA || (FROM ? !existsSync(FROM) : !existsSync(DATA))) throw new Error('QA_DATA is needed: a copy to start on, or where QA_FROM is cloned to')
const BUILDS = [['this build', process.env.QA_ENTRY], ...(process.env.QA_COMPARE ? [['the build compared', process.env.QA_COMPARE]] : [])]
const { check, done } = checks()
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
/** A frame of the page's stack ("at Xe (file:///…/home-AbC.js:1:2345)") as the source's file and line, read back through the build's map. */
const maps = new Map()
const placeOf = (frame) => {
  const [, url, line, column] = /(file:\/\/[^)\s]+?):(\d+):(\d+)/.exec(frame) ?? []
  if (!url) return frame || '?'
  const file = fileURLToPath(url)
  if (!maps.has(file)) maps.set(file, existsSync(`${file}.map`) ? new SourceMapConsumer(JSON.parse(readFileSync(`${file}.map`, 'utf8'))) : null)
  const found = maps.get(file)?.originalPositionFor({ line: Number(line), column: Number(column) - 1 })
  return found?.source ? `${found.source.replace(/^.*src\/renderer\/src\//, '')}:${found.line}` : frame
}
/** What each page whose 1.5 s limit ran out was still waiting for (lib/reads-in.tsx, test runs), by file and line. */
const heldSaid = (held) => held.map((one) => `${one.at}ms ${placeOf(one.page)}${one.self ? ' (its own reads)' : ''} waited for [${one.waiting.map(placeOf).join(', ')}]`).join('; ') || 'nothing: every page was in before its limit'
const median = (list) => { const s = list.filter(Number.isFinite).sort((a, b) => a - b); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : NaN }

/** One start, from the launch to the first key answered and quick capture drawn: every step in ms since the launch. */
async function start(label, n) {
  const launchedAt = Date.now()
  const app = await launch({ timing: true })
  let frames = null
  const home = await new Promise((done) => {
    const look = (page) => page.url().includes('view=home') && done(page)
    app.windows().forEach(look)
    app.on('window', look)
  })
  if (FRAMES && label !== 'first') frames = await cast(home)
  const main = () => app.evaluate(() => ({ origin: performance.timeOrigin, times: { ...globalThis.haligtreeHomeTimes }, node: performance.nodeTiming?.bootstrapComplete }))
  let seen = await main()
  for (let i = 0; i < 1500 && !seen.times.shown; i++) (await wait(10), (seen = await main()))
  // ⌘K the moment the window is on screen; answered when the frame after the search box appears has been drawn.
  // Whether the loader is on the first screen is read in the same breath, before the key.
  const answer = home.evaluate(() => new Promise((done) => {
    const orb = !!document.querySelector('.mf-orb-pill, .mf-shimmer')
    let pressed = 0
    addEventListener('keydown', (event) => void (pressed ||= event.timeStamp), { capture: true, once: true })
    const look = () => (document.querySelector('[aria-label="Search"] input') ? requestAnimationFrame(() => done({ orb, pressed, answered: performance.now() })) : requestAnimationFrame(look))
    requestAnimationFrame(look)
    setTimeout(() => done({ orb, pressed, answered: NaN }), 15000)
  }))
  const sentAt = Date.now()
  await home.keyboard.press('Meta+k')
  const key = await answer
  // Filmed on past the key: the search box put away again, so what comes in after the first screen (a painting) is seen.
  if (frames && UNTIL) await home.keyboard.press('Escape')
  for (let i = 0; i < 500 && !seen.times.boxDrawn; i++) (await wait(20), (seen = await main()))
  if (process.env.QA_PROFILE) writeFileSync(`${process.env.QA_PROFILE}-${label}-${n}.cpuprofile`, JSON.stringify((await app.evaluate(() => globalThis.mainProfile(false)))?.profile ?? null))
  // What held main's one thread 50ms or more while it started (stalls.ts), for the first start of each kind.
  if (n === 1) {
    const stalls = await app.evaluate(() => globalThis.mainStalls?.()).catch(() => null)
    console.log(`(${label} start 1: main's event loop held up to ${stalls?.delay.worst}ms; held 50ms or more by ${stalls?.slow.map((one) => `${one.name} ${one.ms}ms`).join(', ') || 'nothing with a name'})`)
  }
  const page = await home.evaluate(() => {
    const at = (name) => performance.getEntriesByName(name)[0]?.startTime ?? NaN
    const nav = performance.getEntriesByType('navigation')[0]
    return new Promise((done) => {
      const lcp = []
      new PerformanceObserver((list) => lcp.push(...list.getEntries().map((one) => ({ at: one.renderTime || one.startTime, what: `${one.element?.tagName?.toLowerCase() ?? '?'}${one.element?.className ? `.${String(one.element.className).split(' ')[0]}` : ''} ${(one.element?.textContent ?? '').trim().slice(0, 40)}` })))).observe({ type: 'largest-contentful-paint', buffered: true })
      const scripts = Math.max(...performance.getEntriesByType('resource').filter((one) => /\.m?js(\?|$)/.test(one.name)).map((one) => one.responseEnd))
      // The page's own thread: each task that held it 50ms or more, and the ⌘K keydown's own timing (its wait for the
      // thread, its handler, and the paint after it).
      const long = []
      new PerformanceObserver((list) => long.push(...list.getEntries().map((one) => [Math.round(one.startTime), Math.round(one.duration)]))).observe({ type: 'longtask', buffered: true })
      const keys = []
      new PerformanceObserver((list) => keys.push(...list.getEntries().filter((one) => one.name === 'keydown').map((one) => ({ at: one.startTime, waited: one.processingStart - one.startTime, ran: one.processingEnd - one.processingStart, painted: one.startTime + one.duration - one.processingEnd })))).observe({ type: 'event', buffered: true, durationThreshold: 16 })
      setTimeout(() => done({ origin: performance.timeOrigin, html: nav?.responseEnd ?? NaN, scripts, code: at('haligtree:code'), render: at('haligtree:render'), whole: at('haligtree:whole'), fcp: at('first-contentful-paint'), lcp, long, keys, held: window.haligtreeHeld ?? [] }), 100)
    })
  })
  console.log(`(${label} start ${n}: held past the limit: ${heldSaid(page.held)})`)
  if (frames) {
    await wait(Math.max(0, launchedAt + UNTIL - Date.now()))
    const got = await frames.stop()
    const dir = `${FRAMES}/${label}-${n}`
    mkdirSync(dir, { recursive: true })
    for (const [at, data] of got) if (at <= Math.max(page.origin + key.answered + 400, launchedAt + UNTIL)) writeFileSync(`${dir}/${String(Math.round(at - launchedAt)).padStart(5, '0')}ms.jpg`, Buffer.from(data, 'base64'))
  }
  if (THEME && label !== 'again') await home.evaluate((theme) => localStorage.setItem('theme', theme), THEME)
  if (label === 'first') await wait(SETTLE)
  await Promise.race([app.close(), wait(6000)])
  try { app.process().kill('SIGKILL') } catch {}
  const m = (step) => seen.origin + (seen.times[step] ?? NaN) - launchedAt
  const p = (at) => page.origin + at - launchedAt
  return {
    node: seen.origin + (seen.node ?? NaN) - launchedAt, first: m('first'), code: m('code'), ready: m('ready'), book: m('book'), made: m('made'), pageCode: p(page.code), render: p(page.render), whole: p(Number.isFinite(page.whole) ? page.whole : page.render), drawn: m('drawn'), shown: m('shown'),
    // Pressed when the probe sent it: the page may never hear a ⌘K the menu bar takes first, though the search still opens.
    pressed: sentAt - launchedAt, answered: p(key.answered), painted: m('painted'), fcp: p(page.fcp), lcp: page.lcp.length ? p(page.lcp.at(-1).at) : NaN, lcpWhat: page.lcp.at(-1)?.what ?? '',
    box: m('box'), boxDrawn: m('boxDrawn'), html: p(page.html), scripts: p(page.scripts), orb: key.orb,
    // The key's way: sent by the probe, reached the page (main's thread passes it on), waited for the page's thread, ran, painted.
    keyWay: { reached: key.pressed ? Math.round(p(key.pressed) - (sentAt - launchedAt)) : 'not heard by the page', ...Object.fromEntries(Object.entries(page.keys[0] ?? {}).filter(([k]) => k !== 'at').map(([k, v]) => [k, Math.round(v)])) },
    held: page.held.length,
    busy: page.long.filter(([at, ms]) => p(at) + ms >= m('shown') && p(at) <= p(key.answered)).map(([at, ms]) => `${Math.round(p(at))}+${ms}`)
  }
}

/** The steps in order, each from the one before; the last is the key's own answer, from its press. */
const STEPS = [
  ['Electron and Node start, to main\'s first line', null, 'first'],
  ['main\'s code read (every module run)', 'first', 'code'],
  ['to the app ready', 'code', 'ready'],
  ['the book opened', 'ready', 'book'],
  ['the rest of main set up, to the main window made', 'book', 'made'],
  ['the page loaded and its code read', 'made', 'pageCode'],
  ['its first render', 'pageCode', 'render'],
  ['its first screen whole (every part\'s reads in)', 'render', 'whole'],
  ['drawn, told to main', 'whole', 'drawn'],
  ['shown', 'drawn', 'shown'],
  ['the first key (⌘K) answered, from its press', 'pressed', 'answered']
]

function table(label, runs) {
  const rows = STEPS.map(([name, from, to]) => [name, median(runs.map((r) => (r[to] ?? NaN) - (from ? r[from] : 0)))])
  const whole = rows.reduce((sum, [, ms]) => sum + (Number.isFinite(ms) ? ms : 0), 0)
  console.log(`\n${label}: medians of ${runs.length} starts, ms (share of the whole)`)
  for (const [name, ms] of rows) console.log(`  ${String(Math.round(ms)).padStart(6)}  ${(Number.isFinite(ms) ? (100 * ms / whole).toFixed(1) : '?').padStart(5)}%  ${name}`)
  console.log(`  ${String(Math.round(whole)).padStart(6)}  100.0%  the whole, launch to the first key answered`)
  const at = (key) => Math.round(median(runs.map((r) => r[key])))
  console.log(`  beside it (ms since the launch): Node ready for main's code ${at('node')}, the page's HTML ${at('html')} and scripts ${at('scripts')} read, first paint ${at('painted')}, first contentful paint ${at('fcp')}, largest contentful paint ${at('lcp')} (${runs.at(-1).lcpWhat}), shown ${at('shown')}, key pressed ${at('pressed')}, quick capture made ${at('box')} and drawn ${at('boxDrawn')}`)
  console.log(`  each start's shown / answered: ${runs.map((r) => `${Math.round(r.shown)}/${Math.round(r.answered)}`).join(', ')}`)
  console.log(`  each start's ⌘K, ms: ${runs.map((r) => JSON.stringify(r.keyWay)).join(' ')}`)
  console.log(`  the page's thread held 50ms or more between shown and the key answered (ms since launch + how long): ${runs.map((r) => `[${r.busy.join(' ')}]`).join(' ')}`)
  return { rows, whole }
}

const load = () => execFileSync('uptime').toString().replace(/.*averages?:/, '').trim()
const dataOf = (entry) => (FROM && entry !== BUILDS[0][1] ? `${DATA}-compared` : DATA)
if (FROM) for (const [, entry] of BUILDS) (rmSync(dataOf(entry), { recursive: true, force: true }), execFileSync('cp', ['-cR', FROM, dataOf(entry)]))
const runs = new Map(BUILDS.map(([name]) => [name, { cold: [], again: [] }]))
const as = (entry) => void ((process.env.QA_ENTRY = entry), (process.env.QA_DATA = dataOf(entry)))
for (const [, entry] of BUILDS) (as(entry), await start('first', 0))
// The day's backups, where a test run keeps them (backup.ts `backupBase`): the sandbox's in its own folder.
const backups = (entry) => [`${dataOf(entry)}/backups`, `${dataOf(entry)}/sandbox/backups`]
for (let n = 1; n <= RUNS; n++) {
  for (const [name, entry] of BUILDS) {
    as(entry)
    for (const one of [...backups(entry), ...(FORGET ? [`${dataOf(entry)}/${FORGET}`] : [])]) rmSync(one, { recursive: true, force: true })
    const { cold, again } = runs.get(name)
    cold.push(await start('cold', n))
    // The day's copy of the book, made as it started (backup.ts): there, whole, with no part of one left beside it.
    const copies = backups(entry).map((one) => `${one}/database`).filter((dir) => existsSync(dir)).flatMap((dir) => readdirSync(dir))
    cold.at(-1).copied = copies.includes(`haligtree-${new Date().toLocaleDateString('sv')}.db`) && !copies.some((name) => name.endsWith('.part'))
    again.push(await start('again', n))
    console.log(`(${name}, start ${n}: cold shown ${Math.round(cold.at(-1).shown)}ms, again ${Math.round(again.at(-1).shown)}ms; load ${load()})`)
  }
}
if (FROM) for (const [, entry] of BUILDS) rmSync(dataOf(entry), { recursive: true, force: true })
for (const [name, { cold, again }] of runs) {
  const a = table(`${name}, cold (the first start of a day: its backup still to make)`, cold)
  const b = table(`${name}, again (started again the same day)`, again)
  console.log(`(${name}: wholes ${Math.round(a.whole)}ms cold, ${Math.round(b.whole)}ms again)`)
  for (const [label, kind] of [['cold', cold], ['again', again]]) {
    check(`${name}, ${label}: every start showed the main window and answered its first key`, kind.every((r) => Number.isFinite(r.shown) && Number.isFinite(r.answered)), kind.map((r) => `${Math.round(r.shown)}/${Math.round(r.answered)}`).join(' '))
    check(`${name}, ${label}: never shown before the page had drawn itself`, kind.every((r) => r.shown >= r.drawn), kind.map((r) => `${Math.round(r.drawn)}→${Math.round(r.shown)}`).join(' '))
    check(`${name}, ${label}: quick capture made and drawn for ⌘. every time`, kind.every((r) => Number.isFinite(r.boxDrawn)), kind.map((r) => Math.round(r.boxDrawn)).join(' '))
    check(`${name}, ${label}: no loader on the first screen when it was shown`, kind.every((r) => !r.orb))
    check(`${name}, ${label}: no page waited out its 1.5 s limit (each was whole before it)`, kind.every((r) => !r.held), kind.map((r) => r.held).join(' '))
  }
  check(`${name}: each first start of a day made the day's copy of the book, whole`, cold.every((r) => r.copied), cold.map((r) => r.copied).join(' '))
}
console.log(`(load at the end: ${load()})`)
done()
