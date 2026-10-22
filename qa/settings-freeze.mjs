// The heavier settings, each changed while a frame loop runs in the main
// window: the longest gap between frames over the next 1.5s is the stall
// you would feel. Opening Settings and each page is timed the same way.
// Passes when no change stalls longer than 400ms (the machine running it adds noise).
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/settings-freeze.mjs
import { sandbox } from './sandbox-lib.mjs'

const LIMIT = Number(process.env.LIMIT ?? 400)
const c = await sandbox({ width: 1100, height: 760 })
const { h, v, send } = c
await v('settings:set', { hintRate: 0, rotCount: 0 })
const watch = () => h.evaluate(() => {
  const w = window
  w.__gaps = []; w.__stop = false
  let last = performance.now()
  const loop = (now) => { w.__gaps.push(now - last); last = now; if (!w.__stop) requestAnimationFrame(loop) }
  requestAnimationFrame(loop)
})
const read = () => h.evaluate(() => { window.__stop = true; return Math.round(Math.max(0, ...window.__gaps.slice(1))) })
const rows = []
const time = async (name, act, settle = 1500) => {
  await h.waitForTimeout(400)
  await watch()
  await act()
  await h.waitForTimeout(settle)
  const gap = await read()
  rows.push({ name, gap })
  console.log(`${gap > LIMIT ? 'SLOW' : 'ok  '}  ${String(gap).padStart(5)}ms  ${name}`)
}
const set = (patch) => () => v('settings:set', patch)

await send('view', 'home'); await h.waitForTimeout(1500)
await time('open Settings from Home', () => send('view', 'settings'))
await time('Motion off', set({ motion: false }))
await time('Motion on', set({ motion: true }))
await time('Interface size large', () => h.click('[aria-label="Large"]'))
await time('Interface size medium', () => h.click('[aria-label="Medium"]'))
await time('Text size 1.25', set({ textSize: 1.25 }))
await time('Text size 1', set({ textSize: 1 }))
for (const font of ['serif', 'mono', 'dyslexic', 'default']) await time(`Text font ${font}`, set({ noteFont: font }))
await time('Heading font mono', set({ headingFont: 'mono' }))
await time('Heading font back', set({ headingFont: 'same' }))
await time('Blurring off', set({ blur: false }))
await time('Blurring on', set({ blur: true }))
await time('Postcards off', set({ postcards: false }))
await time('Postcards on', set({ postcards: true }))
await time('Scenery on', set({ scenery: true }), 2500)
await time('Show another (scenery)', set({ sceneryShuffle: 1 }), 2500)
await time('Scenery off', set({ scenery: false }))
await time('Style Brutal', () => h.evaluate(() => document.querySelector('.mf-style-brutal')?.click()))
await time('Style Soft', () => h.evaluate(() => document.querySelector('.mf-style-soft')?.click()))
for (const page of ['home', 'inbox', 'today', 'tasks', 'stats', 'map', 'settings']) await time(`open ${page}`, () => send('view', page), 2000)
const slow = rows.filter((row) => row.gap > LIMIT)
console.log(slow.length ? `SLOW: ${slow.map((row) => `${row.name} ${row.gap}ms`).join(', ')}` : `all ${rows.length} under ${LIMIT}ms`)
console.log(c.errors.length ? 'errors: ' + c.errors.slice(0, 3).join(' | ') : 'no page errors')
await c.close()
process.exit(slow.length ? 1 : 0)
