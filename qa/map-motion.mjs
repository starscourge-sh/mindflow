// The Map's motion: a swipe of the empty space let go mid-move carries on and slows (a slow drag stops where it
// is let go), and zooming while a dot is lit lets the light fade out instead of the whole map snapping back.
// Names fade in and out as the map zooms (never 0 to 1 in one frame) and never flicker at their threshold; during
// the replay no dot already there jolts; the replay bar is the app's own, not a stock slider; Reduce motion keeps
// the fades and drops the springs.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/map-motion.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'
const { check, done } = checks()
const c = await sandbox({ width: 1100, height: 760 })
const { h } = c
// Where the drawing sits: the left edge and top of everything drawn, in screen pixels. Breathing moves dots a
// pixel or two; a pan moves the lot by far more.
const look = () => h.evaluate(() => {
  const canvas = document.querySelector('[data-page=map] canvas[data-dots]'); const { width, height } = canvas
  const data = canvas.getContext('2d').getImageData(0, 0, width, height).data
  let left = width, top = height
  for (let y = 0; y < height; y += 3) for (let x = 0; x < width; x += 3) if (data[(y * width + x) * 4 + 3] > 200) { if (x < left) left = x; if (y < top) top = y }
  return [left / devicePixelRatio, top / devicePixelRatio]
})
const far = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1])
const empty = () => h.evaluate(() => {
  const canvas = document.querySelector('[data-page=map] canvas[data-dots]'); const { width, height } = canvas
  const data = canvas.getContext('2d').getImageData(0, 0, width, height).data
  const rect = canvas.getBoundingClientRect()
  for (let y = 40; y < height - 40; y += 8) for (let x = 40; x < width / 4; x += 8) if (data[(y * width + x) * 4 + 3] === 0) return [rect.left + x / devicePixelRatio, rect.top + y / devicePixelRatio]
  return null
})
try {
  await c.v('settings:set', { sounds: false, hintRate: 0 })
  await c.send('view', 'map'); await h.waitForTimeout(4000)
  let at = await empty()
  check('found empty space to drag', !!at, String(at))
  // A fast swipe, let go while still moving.
  await h.mouse.move(at[0], at[1]); await h.mouse.down()
  for (let i = 1; i <= 6; i++) { await h.mouse.move(at[0] + i * 25, at[1] + i * 10); await h.waitForTimeout(12) }
  await h.mouse.up()
  const v0 = await look(); await h.waitForTimeout(250); const v1 = await look()
  await h.waitForTimeout(800); const v2 = await look(); await h.waitForTimeout(400); const v3 = await look()
  check('after a swipe the map carries on moving', far(v0, v1) > 15, `${far(v0, v1).toFixed(1)}px in 250ms`)
  check('and then comes to rest', far(v2, v3) < 4, `${far(v2, v3).toFixed(1)}px later`)
  // A slow drag, held still before letting go: nothing carries on.
  at = await empty()
  await h.mouse.move(at[0], at[1]); await h.mouse.down()
  for (let i = 1; i <= 4; i++) { await h.mouse.move(at[0] + i * 4, at[1]); await h.waitForTimeout(40) }
  await h.waitForTimeout(150); await h.mouse.up()
  const w0 = await look(); await h.waitForTimeout(300); const w1 = await look()
  check('a drag held still before letting go stays where it is', far(w0, w1) < 4, `${far(w0, w1).toFixed(1)}px`)

  // ---- The user's size of map: 302 notes and 961 links, named like theirs, caught over two years.
  await c.electron.evaluate(({ ipcMain }) => {
    let seed = 11
    const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
    const first = ['Vocabulary', 'Content', 'Reading', 'Weekly', 'Garden', 'Research', 'Morning', 'Project', 'Design', 'Book', 'Travel', 'Health']
    const second = ['Reference', 'Pipeline', 'Notes', 'Review', 'Ideas', 'Plan', 'Questions', 'Log', 'Sketches', 'Summary', 'Draft', 'List']
    const kinds = ['note', 'note', 'note', 'quote', 'word', 'link', 'todo']
    const tags = [undefined, undefined, ['book', 'brown'], ['bug', 'red'], ['idea', 'green'], ['work', 'blue']]
    const start = Date.parse('2024-11-01')
    const nodes = Array.from({ length: 302 }, (_, i) => {
      const t = tags[i % 6]
      const at = new Date(start + Math.floor(Math.pow(i / 302, 0.8) * 730) * 86400000).toISOString()
      return { type: 'capture', id: `n${String(i).padStart(3, '0')}`, title: `${first[i % 12]} ${second[Math.floor(i / 12) % 12]}${i > 143 ? ` ${Math.floor(i / 144) + 1}` : ''}`, kind: kinds[i % 7], links: 0, at, ...(t ? { tag: t[0], tint: t[1] } : {}) }
    })
    const id = (i) => `n${String(i).padStart(3, '0')}`
    const edges = [], seen = new Set()
    const add = (a, b) => { const key = a < b ? `${a}|${b}` : `${b}|${a}`; if (a !== b && !seen.has(key)) (seen.add(key), edges.push([id(a), id(b), 1 + Math.floor(random() * 2)])) }
    // Each note links back to one before it (most to the busy early ones), then more links among them, to 961.
    for (let i = 1; i < 302; i++) add(Math.floor(Math.pow(random(), 2) * i), i)
    while (edges.length < 961) add(Math.floor(Math.pow(random(), 1.6) * 302), Math.floor(random() * 302))
    for (const [a, b] of edges) (nodes[+a.slice(1)].links++, nodes[+b.slice(1)].links++)
    ipcMain.removeHandler('haligtree:notes:graph:all')
    ipcMain.handle('haligtree:notes:graph:all', () => ({ nodes, edges, alone: 0 }))
  })
  await h.reload(); await h.waitForTimeout(1500)
  await c.go('map')
  const dots = () => h.evaluate(() => Number(document.querySelector('[data-page=map] canvas[data-dots]')?.dataset.dots))
  for (let n = 0; n < 40 && (await dots()) !== 302; n++) await h.waitForTimeout(250)
  await h.waitForTimeout(3000)
  check('the map holds the 302 notes', (await dots()) === 302, await dots())

  // ---- Names come and go gracefully: sampled every frame (about 16ms) while the map zooms.
  // `mapNames` gives each name drawn at rest and how strongly; a build without it names a dot fully or not at all.
  await h.evaluate(() => {
    const canvas = document.querySelector('[data-page=map] canvas[data-dots]')
    const read = () => canvas.mapNames?.() ?? Object.fromEntries((canvas.mapNamed?.() ?? []).map((id) => [id, 1]))
    const qa = (window.__names = { on: true, frames: [] })
    const step = (t) => { if (!qa.on) return; qa.frames.push({ t, names: read() }); requestAnimationFrame(step) }
    requestAnimationFrame(step)
  })
  const box = await h.locator('[data-page=map] canvas[data-dots]').boundingBox()
  const zoom = (deltaY) => h.evaluate(([deltaY, x, y]) => document.querySelector('[data-page=map] canvas[data-dots]').dispatchEvent(new WheelEvent('wheel', { deltaY, ctrlKey: true, clientX: x, clientY: y, bubbles: true, cancelable: true })), [deltaY, box.x + box.width * 0.5, box.y + box.height * 0.5])
  const take = () => h.evaluate(() => { const frames = window.__names.frames; window.__names.frames = []; return frames })
  // Every name's strength frame by frame: how many went fully on or off, how many of those passed through between.
  const study = (frames) => {
    const ids = new Set(frames.flatMap((f) => Object.keys(f.names)))
    let changed = 0, eased = 0, snapped = [], flips = []
    for (const id of ids) {
      const seen = frames.map((f) => f.names[id] ?? 0)
      let crossings = 0
      for (let n = 1; n < seen.length; n++) {
        if ((seen[n - 1] < 0.5) !== (seen[n] < 0.5)) crossings++
        if (Math.abs(seen[n] - seen[n - 1]) > 0.6) snapped.push(id)
      }
      if (crossings) changed++
      if (crossings && seen.some((o) => o > 0.02 && o < 0.98)) eased++
      if (crossings > 2) flips.push(`${id.slice(0, 6)}:${crossings}`)
    }
    // The first name that came and went, frame by frame, to see why.
    const first = flips[0] && [...ids].find((id) => id.startsWith(flips[0].split(':')[0]))
    const series = first ? frames.map((f) => (f.names[first] ?? 0).toFixed(1)).join(' ').replace(/^(0\.0 |1\.0 )+/, '…') : ''
    return { changed, eased, snapped: [...new Set(snapped)], flips, frames: frames.length, series }
  }
  await h.mouse.move(box.x + 4, box.y + 4)
  await h.waitForTimeout(2500); await take()
  // In close (more dots grow big enough to be named, the edges' names leave the frame), then back out past the whole
  // map (names give way as it shrinks): names must come and go either way.
  for (const delta of [-30, -30, -30, -30, -30, 30, 30, 30, 30, 30, 30, 30, 30, -30, -30, -30]) { await zoom(delta); await h.waitForTimeout(260) }
  await h.waitForTimeout(400)
  const faded = study(await take())
  console.log('zoom in and out', JSON.stringify(faded))
  check('names change as the map zooms', faded.changed >= 3, `${faded.changed} names came or went`)
  check('a name fades as it shows or hides, never 0 to 1 in one frame', faded.changed > 0 && !faded.snapped.length && faded.eased === faded.changed, `${faded.eased} of ${faded.changed} eased; ${faded.snapped.length} snapped in one frame over ${faded.frames} frames`)
  // Resting near a threshold: from far out, the zoom nudged in by 8% and back by 4%, over and over, as it creeps back
  // to the whole map, so every name's threshold is passed with the zoom resting either side of it.
  for (let n = 0; n < 8; n++) await zoom(40)
  await h.waitForTimeout(300); await take()
  for (let n = 0; n < 160; n++) { await zoom(n % 2 ? 4 : -8); await h.waitForTimeout(50) }
  await h.waitForTimeout(400)
  const rest = study(await take())
  console.log('nudged near thresholds', JSON.stringify(rest))
  check('no name flickers while the zoom rests near its threshold', !rest.flips.length, `${rest.flips.length} names came and went more than once: ${rest.flips.slice(0, 6).join(' ')}`)
  await h.evaluate(() => (window.__names.on = false))

  // ---- The replay: existing dots never jolt. Each frame, every dot the layout holds and where it is drawn, in the map's
  // own units (the camera's moves are not the dots'); a dot counts as existing a second after it arrived.
  await c.go('map'); await h.waitForTimeout(1500)
  await h.click('[data-map-replay]')
  await h.evaluate(() => {
    const canvas = document.querySelector('[data-page=map] canvas[data-dots]')
    const qa = (window.__replay = { on: true, worst: 0, worstAt: '', frames: 0, born: new Map(), last: new Map(), lastT: 0 })
    const step = (t) => {
      if (!qa.on) return
      const dt = qa.lastT ? t - qa.lastT : 16.7
      qa.lastT = t
      qa.frames++
      for (const dot of canvas.mapDots()) {
        if (!dot.held) { qa.born.delete(dot.id); qa.last.delete(dot.id); continue }
        if (!qa.born.has(dot.id)) qa.born.set(dot.id, t)
        const at = dot.drawn ?? [dot.x, dot.y]
        const was = qa.last.get(dot.id)
        if (was && t - qa.born.get(dot.id) > 1000 && dt > 0) {
          // Per 60th of a second, so a slow frame does not count as a jump.
          const jump = Math.hypot(at[0] - was[0], at[1] - was[1]) * Math.min(1, 16.7 / dt)
          if (jump > qa.worst) ((qa.worst = jump), (qa.worstAt = `${dot.title.slice(0, 24)} at ${Math.round(t)}`))
        }
        qa.last.set(dot.id, at)
      }
      requestAnimationFrame(step)
    }
    requestAnimationFrame(step)
  })
  await h.waitForTimeout(7000)
  const jolt = await h.evaluate(() => ((window.__replay.on = false), { worst: window.__replay.worst, at: window.__replay.worstAt, frames: window.__replay.frames }))
  console.log('replay jolt', JSON.stringify(jolt))
  // 1.5 map units a 60th of a second (90 a second) is a dot easing aside; the map is 600 to 900 units across.
  check('during the replay no existing dot jumps more than 1.5 map units between frames', jolt.frames > 100 && jolt.worst < 1.5, `${jolt.worst.toFixed(2)} at ${jolt.at} over ${jolt.frames} frames`)

  // ---- The replay bar: made from the app's own pieces.
  const bar = await h.evaluate(() => {
    const el = document.querySelector('[data-map-replay-bar]')
    const date = el?.querySelector('[data-map-replay-date]')
    return { ranges: el?.querySelectorAll('input[type=range]').length ?? -1, thumbs: el?.querySelectorAll('[data-slot^="slider"]').length ?? -1, marks: el?.querySelectorAll('[data-map-replay-marks] rect').length ?? 0, date: date ? parseFloat(getComputedStyle(date).fontSize) : 0 }
  })
  check('the replay bar has no stock slider and no round stock thumb', bar.ranges === 0 && bar.thumbs === 0, JSON.stringify(bar))
  check('its timeline shows the notes\' dates as marks', bar.marks >= 10, `${bar.marks} marks`)
  // The replay is a quiet bar at the map's foot since 7389b25e1 (8 Nov), its date at the controls' size, no longer large.
  check('the date reads at the controls\' size, not small print', bar.date >= 13, `${bar.date}px`)
  await h.keyboard.press('Escape'); await h.waitForTimeout(300)

  // ---- Reduce motion: names and growth still fade, nothing springs or travels.
  await h.emulateMedia({ reducedMotion: 'reduce' })
  await c.go('map'); await h.waitForTimeout(1500)
  await h.evaluate(() => {
    const canvas = document.querySelector('[data-page=map] canvas[data-dots]')
    const read = () => canvas.mapNames?.() ?? Object.fromEntries((canvas.mapNamed?.() ?? []).map((id) => [id, 1]))
    const qa = (window.__names = { on: true, frames: [] })
    const step = (t) => { if (!qa.on) return; qa.frames.push({ t, names: read() }); requestAnimationFrame(step) }
    requestAnimationFrame(step)
  })
  // In first, as the motion part above does: from the map's fit, out first then back met at most one name's threshold
  // (1 of 1 eased on a calm run, 0 of 0 at load 10 to 19), so it measured nothing.
  for (const delta of [-30, -30, -30, -30, -30, 30, 30, 30, 30, 30, 30, 30, 30, -30, -30, -30]) { await zoom(delta); await h.waitForTimeout(260) }
  await h.waitForTimeout(300)
  const calm = study(await take())
  await h.evaluate(() => (window.__names.on = false))
  check('with Reduce motion names still fade', calm.changed > 0 && !calm.snapped.length, `${calm.eased} of ${calm.changed} eased, ${calm.snapped.length} snapped`)
  await h.click('[data-map-replay]')
  const reduced = await h.evaluate(() => new Promise((resolve) => {
    const canvas = document.querySelector('[data-page=map] canvas[data-dots]')
    const first = new Map(), alphas = new Set(), end = performance.now() + 2500
    let moved = 0
    const step = () => {
      for (const dot of canvas.mapDots()) {
        if (!dot.held) continue
        const at = dot.drawn ?? [dot.x, dot.y]
        if (!first.has(dot.id)) first.set(dot.id, at)
        moved = Math.max(moved, Math.hypot(at[0] - first.get(dot.id)[0], at[1] - first.get(dot.id)[1]))
        if (dot.shown > 0.02 && dot.shown < 0.98) alphas.add(dot.id)
      }
      if (performance.now() < end) requestAnimationFrame(step)
      else resolve({ moved, fading: alphas.size, held: first.size, replayed: canvas.dataset.replayed })
    }
    requestAnimationFrame(step)
  }))
  console.log('reduce motion replay', JSON.stringify(reduced))
  check('with Reduce motion the replay still grows, each dot fading in where it sits', Number(reduced.replayed) > 0 && reduced.fading >= 3 && reduced.moved < 0.5, JSON.stringify(reduced))
  await h.keyboard.press('Escape'); await h.waitForTimeout(300)
  await h.emulateMedia({ reducedMotion: 'no-preference' })
} catch (error) {
  check('the run finished', false, error.message.split('\n')[0])
}
await c.close()
done()
