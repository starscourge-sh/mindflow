// Tabs of notes switched over and over: each editor is torn down on leaving and built on coming back, so a widget that
// redraws for ever would show here. Six note tabs, ⌃Tab thirty times; every frame timed; then the window must fall quiet.
// Run it on a dev build too (StrictMode): NODE_ENV=development npx electron-vite build --mode development --outDir out-dev
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=$PWD/out-dev/main/index.js HALIGTREE_QA_AWAY=1 node qa/tabs-frames.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'
const { check, done } = checks()
const c = await sandbox({ width: 1400, height: 880 })
const { h, v } = c
const wait = (ms = 500) => h.waitForTimeout(ms)
const answers = (limit = 4000) => Promise.race([
  h.evaluate(() => new Promise((done) => { const at = performance.now(); requestAnimationFrame(() => requestAnimationFrame(() => done(Math.round(performance.now() - at)))) })),
  new Promise((done) => setTimeout(() => done(null), limit))
])
try {
  await v('settings:set', { hintRate: 0 })
  const notes = (await v('items', 'article')).slice(0, 6)
  const tabs = notes.map((one, at) => ({ key: `t${at}`, trail: { views: [{ id: 'articles', focus: one.id }], at: 0 } }))
  await h.evaluate((tabs) => localStorage.setItem('split', JSON.stringify({ panes: [{ key: 'p', tabs, active: 't0' }], front: 'p', sizes: [1] })), tabs)
  await h.reload(); await wait(2500)
  await h.evaluate(() => { window.__frames = []; let last = performance.now(); const tick = (now) => { window.__frames.push(Math.round(now - last)); last = now; requestAnimationFrame(tick) }; requestAnimationFrame(tick) })
  const seen = []
  for (let i = 0; i < 30; i++) {
    await h.keyboard.press('Control+Tab')
    await wait(180)
    seen.push(await h.evaluate(() => document.querySelector('[data-tab-on]')?.getAttribute('data-drag-title')))
  }
  const frames = await h.evaluate(() => window.__frames.splice(0))
  frames.sort((a, b) => a - b)
  console.log(`switching: ${frames.length} frames, median ${frames[frames.length >> 1]}ms, 95th ${frames[Math.floor(frames.length * 0.95)]}ms, worst ${frames[frames.length - 1]}ms`)
  check('every switch landed on the next tab', new Set(seen).size === notes.length, [...new Set(seen)].join(' | '))
  await wait(2000)
  const quiet = await h.evaluate(() => window.__frames.splice(0))
  quiet.sort((a, b) => a - b)
  const ms = await answers()
  console.log(`quiet after: ${quiet.length} frames, worst ${quiet[quiet.length - 1]}ms; a frame round trip ${ms}ms`)
  check('the window answers afterwards', ms !== null && ms < 250, String(ms))
  const mutations = await h.evaluate(() => new Promise((done) => {
    let count = 0
    const watch = new MutationObserver((list) => (count += list.length))
    watch.observe(document.querySelector('[data-pane-card]'), { childList: true, subtree: true })
    setTimeout(() => (watch.disconnect(), done(count)), 2000)
  }))
  check('nothing redraws for ever: the page falls still', mutations < 20, `${mutations} changes in 2s at rest`)
} finally {
  if (c.errors.length) console.log('errors:', c.errors.slice(0, 5).join('\n'))
  await c.close()
}
done()
