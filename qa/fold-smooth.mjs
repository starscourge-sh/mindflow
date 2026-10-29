// Folding and unfolding, frame by frame: a 41-note folder in Writing's list
// ("YouTube"), with a folder and loose notes under it, folded and opened by
// the mouse at the top of the list, scrolled into it, and at the list's end;
// then the sidebar's own folds (Writing's folders, Tags, a group of places).
// Each frame records where the rows under the fold are, the list's height and
// its scroll: the rows under it must move one way only, in step with the
// fold's edge (never drawn over by it, never left behind it), the scroll must
// not jump. Frames much longer than the rest are printed, not counted.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-p/main/index.js HALIGTREE_QA_AWAY=1 node qa/fold-smooth.mjs
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const results = []
const check = (name, ok, detail = '') => (results.push(!!ok), console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`))
const c = await sandbox({ width: 1100, height: 760 })
const { h, v } = c
const wait = (ms) => h.waitForTimeout(ms)

for (const list of ['article', 'nugget']) for (const group of await v('groups', list)) await v('groups:delete', group.id)
const note = async (title) => { const id = await v('article:new'); await v('item:save', id, { title }); return id }
const tube = []
for (let i = 1; i <= 41; i++) tube.push(await note(`Video ${i}`))
const later = []
for (let i = 1; i <= 5; i++) later.push(await note(`Later ${i}`))
const loose = [await note('Loose one'), await note('Loose two')]
const T = 'tube0000-0000-0000-0000-000000000000'
const L = 'later000-0000-0000-0000-000000000000'
await v('groups:arrange', 'article', { top: [`g:${T}`], groups: { [T]: tube }, make: { id: T, name: 'YouTube' } })
await v('groups:arrange', 'article', { top: [`g:${T}`, `g:${L}`, ...loose], groups: { [T]: tube, [L]: later }, make: { id: L, name: 'Later' } })
const groups = await v('groups', 'article')
const tubeId = groups.find((one) => one.name === 'YouTube').id
const laterId = groups.find((one) => one.name === 'Later').id
await h.evaluate(() => localStorage.setItem('view:article', JSON.stringify({ sort: 'manual', group: 'none', filter: {}, density: 'list' })))
await h.reload()
await wait(1500)
await c.go('articles')
await wait(800)

// Records each frame until stopped: what is under the fold, and the list.
const record = (under, group) => h.evaluate(([under, group]) => {
  const scroller = (() => { let box = document.querySelector('[data-group-block]'); while (box && !/auto|scroll/.test(getComputedStyle(box).overflowY)) box = box.parentElement; return box })()
  const frames = []
  let last = performance.now()
  window.__stop = false
  const tick = () => {
    const now = performance.now()
    const mark = document.querySelector(under)
    const fold = document.querySelector(`[data-group-block="${group}"] > [data-fold]`)
    frames.push({
      dt: Math.round(now - last),
      under: mark ? Math.round(mark.getBoundingClientRect().top * 10) / 10 : null,
      edge: fold ? Math.round(fold.getBoundingClientRect().bottom * 10) / 10 : null,
      scroll: scroller.scrollTop,
      tall: scroller.scrollHeight
    })
    last = now
    if (!window.__stop) requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
  window.__frames = frames
}, [under, group])
const stop = () => h.evaluate(() => ((window.__stop = true), window.__frames))
const scrollTo = (where) => h.evaluate((where) => {
  let box = document.querySelector('[data-group-block]'); while (box && !/auto|scroll/.test(getComputedStyle(box).overflowY)) box = box.parentElement
  box.scrollTop = where === 'end' ? box.scrollHeight : where
}, where)

/** Folds (or opens) a group with the mouse and reads every frame of it. */
async function turn(name, under, group) {
  const head = h.locator(`[data-group-row="${group}"]`).first()
  await head.scrollIntoViewIfNeeded()
  await record(under, group)
  await wait(50)
  await head.click()
  await wait(600)
  const frames = await stop()
  const moving = frames.filter((one, at) => at > 0 && (one.under !== frames[at - 1].under || one.edge !== frames[at - 1].edge))
  const steps = frames.slice(1).map((one, at) => (one.under ?? 0) - (frames[at].under ?? 0)).filter((d) => Math.abs(d) > 0.2)
  const ups = steps.filter((d) => d < 0).length
  const downs = steps.filter((d) => d > 0).length
  // The row under the fold sits on the fold's edge (its air between) on every frame: never over it, never left behind.
  const gaps = frames.filter((one) => one.under !== null && one.edge !== null).map((one) => Math.round(one.under - one.edge))
  const scrolls = new Set(frames.map((one) => one.scroll))
  const slow = frames.slice(2).filter((one) => one.dt > 40)
  const spread = gaps.length ? Math.max(...gaps) - Math.min(...gaps) : 0
  // At the list's end a fold shutting pulls the scroll back with it, so what is under it holds still (within a pixel).
  const unders = frames.map((one) => one.under).filter((one) => one !== null)
  const held = Math.max(...unders) - Math.min(...unders) <= 1
  check(`${name}: what is under it moves one way only`, ups === 0 || downs === 0 || held, held ? `held within a pixel, at ${unders[0]}` : `${ups} frames up, ${downs} down, ${moving.length} moving`)
  check(`${name}: what is under it keeps to the fold's edge every frame`, spread <= 1, `gap to the edge ${Math.min(...gaps)} to ${Math.max(...gaps)}`)
  check(`${name}: the list's scroll does not jump`, scrolls.size === 1 || name.includes('folded at the end'), [...scrolls].join(' → '))
  // Reported, not counted: the click's own draw, whose length depends on the machine.
  console.log(`      frames over 40ms: ${slow.map((one) => one.dt).join(', ') || 'none'}`)
  if (process.env.FRAMES) console.log(JSON.stringify(frames.slice(0, 16)))
  return frames
}

const nextRow = `[data-group-row="${laterId}"]`
await scrollTo(0)
await wait(300)
await turn('YouTube folded at the top', nextRow, tubeId)
await turn('YouTube opened at the top', nextRow, tubeId)
// Scrolled so its heading is just on screen near the top, its notes running past the bottom.
await scrollTo(0)
await h.evaluate((id) => { const head = document.querySelector(`[data-group-row="${id}"]`); let box = head; while (box && !/auto|scroll/.test(getComputedStyle(box).overflowY)) box = box.parentElement; box.scrollTop += head.getBoundingClientRect().top - box.getBoundingClientRect().top - 4 }, tubeId)
await wait(300)
const before = await h.evaluate((id) => Math.round(document.querySelector(`[data-group-row="${id}"]`).getBoundingClientRect().top), tubeId)
await turn('YouTube folded scrolled to its heading', nextRow, tubeId)
const after = await h.evaluate((id) => Math.round(document.querySelector(`[data-group-row="${id}"]`).getBoundingClientRect().top), tubeId)
check('its heading stays where it was clicked', Math.abs(after - before) <= 1, `${before} → ${after}`)
await turn('YouTube opened scrolled to its heading', nextRow, tubeId)
// Later, at the list's end, folded and opened.
await scrollTo('end')
await wait(300)
await turn('Later folded at the end', `[data-sortable-id="${loose[0]}"]`, laterId)
await turn('Later opened at the end', `[data-sortable-id="${loose[0]}"]`, laterId)

// The sidebar's folds: Writing's folders, Tags and a group of places, each with what is under it.
const side = (sel) => h.locator(`aside ${sel}`).first()
// `measure` is read each frame: a top or a height that the fold moves.
async function sideTurn(name, button, measure) {
  if (!(await side(button).count())) return check(`${name}: on screen`, false)
  await h.evaluate((measure) => {
    const read = new Function(`return (${measure})`)
    const frames = []
    let last = performance.now()
    window.__stop = false
    const tick = () => {
      const now = performance.now()
      const n = read()
      frames.push({ dt: Math.round(now - last), under: n == null ? null : Math.round(n * 10) / 10 })
      last = now
      if (!window.__stop) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
    window.__frames = frames
  }, measure)
  await wait(50)
  await side(button).hover()
  await side(button).click()
  await wait(600)
  const frames = await stop()
  const steps = frames.slice(1).map((one, at) => (one.under ?? 0) - (frames[at].under ?? 0)).filter((d) => Math.abs(d) > 0.2)
  const ups = steps.filter((d) => d < 0).length
  const downs = steps.filter((d) => d > 0).length
  const slow = frames.slice(2).filter((one) => one.dt > 40)
  if (process.env.FRAMES) console.log(JSON.stringify(frames.map((one) => one.under)))
  // Instant, as asked: one step, no slide (qa/fold-instant.mjs checks it lands in the first frame).
  check(`${name}: it moves one way only, in one step`, steps.length === 1, `${ups} up, ${downs} down`)
  console.log(`      frames over 40ms: ${slow.map((one) => one.dt).join(', ') || 'none'}`)
}
const gemsTop = `document.querySelector('aside [data-side-row][aria-label="Gems"]')?.getBoundingClientRect().top`
const tagsTall = `document.querySelector('aside [data-tags-fold]')?.parentElement?.nextElementSibling?.getBoundingClientRect().height`
await sideTurn('Writing\'s folders folded', '[data-folders-fold="article"]', gemsTop)
await sideTurn('Writing\'s folders opened', '[data-folders-fold="article"]', gemsTop)
if ((await side('[data-tags-fold]').getAttribute('aria-expanded')) !== 'true') { await side('[data-tags-fold]').click(); await wait(600) }
await sideTurn('Tags folded', '[data-tags-fold]', tagsTall)
await sideTurn('Tags opened', '[data-tags-fold]', tagsTall)

if (c.errors.length) console.log(c.errors.slice(0, 5).join('\n'))
await c.close()
const passed = results.filter(Boolean).length
console.log(`\n${passed}/${results.length} passed`)
process.exit(passed === results.length ? 0 : 1)
