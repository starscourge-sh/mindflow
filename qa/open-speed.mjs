// How long a note takes to open: from the click to its words on screen and its page-turn sound.
// Each way in (a card on Home, the sidebar's Recent, a row in Everything, ⌘K, a pin in the
// sidebar) is timed step by step, for a long note with pictures and embedded notes and for a
// short one, opened cold (first time) and warm (again). Then a task, a gem, a tag's page, the
// Calendar and a sidebar page each, the same way. Fails when a note's words take longer than
// QA_BUDGET ms (150 by default) to be drawn.
// Run: QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-open/main/index.js HALIGTREE_QA_AWAY=1 node qa/open-speed.mjs
import { sandbox } from './sandbox-lib.mjs'

const BUDGET = Number(process.env.QA_BUDGET ?? 150)
const results = []
const check = (name, ok, detail = '') => (results.push(!!ok), console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`))
const c = await sandbox({ width: 1400, height: 900 })
const { h, v, go, close, errors } = c
const wait = (ms) => h.waitForTimeout(ms)

// Watches every frame from the press: when the page changed, the note's pane, its editor,
// its words, the frame they were drawn in, and the sound. Long tasks too, which hold it up.
const arm = (want) => h.evaluate((want) => {
  const marks = {}
  const long = []
  let t0 = null
  const heard = window.haligtreeHeard ?? []
  const push = heard.push
  heard.push = function (...names) {
    if (t0 !== null) for (const name of names) {
      if (name === 'page-turn' && marks.turn === undefined) marks.turn = performance.now() - t0
      if (name.startsWith('cue:') && marks.cue === undefined) marks.cue = performance.now() - t0
    }
    return push.apply(this, names)
  }
  const observer = new PerformanceObserver((list) => {
    for (const one of list.getEntries()) if (t0 !== null && one.startTime >= t0 - 5) long.push([Math.round(one.startTime - t0), Math.round(one.duration)])
  })
  try { observer.observe({ type: 'longtask', buffered: false }) } catch {}
  // Long animation frames: what each slow frame spent on script, on layout
  // forced in the middle of it, and on drawing (style and layout, then paint).
  const frames = []
  const loaf = new PerformanceObserver((list) => {
    for (const one of list.getEntries()) {
      if (t0 === null || one.startTime + one.duration < t0) continue
      const forced = one.scripts.reduce((sum, s) => sum + (s.forcedStyleAndLayoutDuration ?? 0), 0)
      const script = one.scripts.reduce((sum, s) => sum + s.duration, 0)
      const draw = one.startTime + one.duration - (one.renderStart || one.startTime + one.duration)
      frames.push(`${Math.round(one.duration)}ms@${Math.round(one.startTime - t0)}[js ${Math.round(script)} forced ${Math.round(forced)} draw ${Math.round(draw)}]`)
    }
  })
  try { loaf.observe({ type: 'long-animation-frame', buffered: false }) } catch {}
  const start = (event) => {
    if (t0 !== null) return
    if (want.key && event.type !== 'keydown') return
    if (!want.key && event.type !== 'pointerdown') return
    t0 = event.timeStamp
    const frame = () => {
      const now = performance.now() - t0
      const pane = want.pane ? document.querySelector(want.pane) : null
      if (marks.route === undefined && want.page && document.querySelector(`[data-page="${want.page}"]`)) marks.route = now
      if (marks.pane === undefined && pane) marks.pane = now
      const editor = pane?.querySelector('.tiptap.ProseMirror') ?? (want.pane ? null : document.querySelector(want.ready))
      if (marks.editor === undefined && editor) marks.editor = now
      const text = want.words ? editor?.textContent?.includes(want.words) : !!editor
      if (marks.text === undefined && text) marks.text = now
      else if (marks.text !== undefined && marks.painted === undefined) marks.painted = now
      if (now < 4000 && (marks.painted === undefined)) requestAnimationFrame(frame)
    }
    requestAnimationFrame(frame)
  }
  window.addEventListener('pointerdown', start, true)
  window.addEventListener('keydown', start, true)
  window.__openSpeed = () => {
    observer.disconnect()
    loaf.disconnect()
    heard.push = push
    window.removeEventListener('pointerdown', start, true)
    window.removeEventListener('keydown', start, true)
    return { marks: Object.fromEntries(Object.entries(marks).map(([k, v]) => [k, Math.round(v)])), long, frames }
  }
}, want)
const collect = async () => { await wait(1500); return h.evaluate(() => window.__openSpeed()) }

// QA_PROFILE=pinned,home: a CPU profile of those warm opens, the costliest functions printed.
const PROFILE = process.env.QA_PROFILE?.split(',')
const cdp = PROFILE ? await c.electron.context().newCDPSession(h) : null
const profiler = {
  start: async () => { await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 200 }); await cdp.send('Profiler.start') },
  stop: async (name) => {
    const { profile } = await cdp.send('Profiler.stop')
    if (process.env.QA_PROFILE_DIR) (await import('fs')).writeFileSync(`${process.env.QA_PROFILE_DIR}/${name.replace(/\W+/g, '-')}.cpuprofile`, JSON.stringify(profile))
    const byId = new Map(profile.nodes.map((node) => [node.id, node]))
    const self = new Map()
    const gap = profile.timeDeltas
    profile.samples.forEach((id, at) => { self.set(id, (self.get(id) ?? 0) + (gap[at] ?? 0)) })
    const parent = new Map()
    for (const node of profile.nodes) for (const child of node.children ?? []) parent.set(child, node.id)
    const where = (node) => `${node.callFrame.functionName || '(anon)'} ${node.callFrame.url.split('/').pop()}:${node.callFrame.lineNumber + 1}`
    const selfBy = new Map(); const total = new Map()
    for (const [id, us] of self) {
      const node = byId.get(id)
      selfBy.set(where(node), (selfBy.get(where(node)) ?? 0) + us)
      const seen = new Set()
      for (let at = id; at; at = parent.get(at)) { const key = where(byId.get(at)); if (!seen.has(key)) (seen.add(key), total.set(key, (total.get(key) ?? 0) + us)) }
    }
    const top = (map, n) => [...map].filter(([k]) => !/^\(idle\)|^\(program\)|^\(root\)/.test(k)).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, us]) => `  ${(us / 1000).toFixed(1).padStart(7)}ms  ${k}`).join('\n')
    console.log(`--- profile ${name}: self\n${top(selfBy, 25)}\n--- inclusive (app code)\n${top(new Map([...total].filter(([k]) => /home-|index-|\.tsx?:|chunk|-[\w]{8}\.js/.test(k))), 60)}`)
  }
}

const rows = []
const report = (path, note, round, got) => {
  const m = got.marks
  rows.push({ path, note, round, ...m, long: got.long.map(([at, ms]) => `${ms}ms@${at}`).join(' ') })
  console.log(`${path.padEnd(16)} ${note.padEnd(6)} ${round.padEnd(5)} route ${m.route ?? '-'} pane ${m.pane ?? '-'} editor ${m.editor ?? '-'} text ${m.text ?? '-'} painted ${m.painted ?? '-'} cue ${m.cue ?? '-'} turn ${m.turn ?? '-'}  long: ${got.long.map(([at, ms]) => `${ms}ms@${at}`).join(' ') || 'none'}${process.env.QA_FRAMES ? `\n  > frames: ${got.frames.slice(0, 4).join(' ')}` : ''}`)
}

try {
  await v('settings:set', { sounds: true, hintRate: 0, countIn: false })
  await v('onboarding:set', { pageHints: false })

  // Notes of a real size: a long one with pictures, embedded notes, a table of
  // tasks and headings; a short one; and twenty more so Home has many cards.
  const ids = await h.evaluate(async () => {
    const picture = (seed) => {
      const canvas = document.createElement('canvas')
      canvas.width = 1600; canvas.height = 1000
      const g = canvas.getContext('2d')
      for (let i = 0; i < 400; i++) { g.fillStyle = `hsl(${(seed * 40 + i * 7) % 360} 60% ${30 + (i % 40)}%)`; g.fillRect((i * 97) % 1600, (i * 53) % 1000, 120, 90) }
      return canvas.toDataURL('image/jpeg', 0.9)
    }
    const p = (words) => ({ type: 'paragraph', content: [{ type: 'text', text: words }] })
    const make = (body) => window.api.captures.create({ kind: 'note', body })
    const small = []
    for (let i = 0; i < 3; i++) small.push(await make({ type: 'doc', content: [p(`Embedded piece ${i + 1} with a few words of its own.`), p('And a second line to show.')] }))
    const content = [{ type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Field notes on the long walk' }] }]
    for (let i = 0; i < 160; i++) {
      if (i % 20 === 0) content.push({ type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: `Part ${i / 20 + 1}` }] })
      if (i % 20 === 5) content.push({ type: 'image', attrs: { src: picture(i) } })
      if (i % 50 === 10) content.push({ type: 'noteEmbed', attrs: { id: small[(i / 50) | 0] ?? small[0], label: '' } })
      if (i % 30 === 15) content.push({ type: 'taskList', content: [1, 2, 3].map((n) => ({ type: 'taskItem', attrs: { checked: n === 1 }, content: [p(`Step ${n} of part ${i}`)] })) })
      content.push(p(`Walked line ${i}: the path bent toward the river, and the light came low through the trees while the notes kept on about what was seen and heard along the way, line by line.`))
    }
    const long = await make({ type: 'doc', content })
    const short = await make({ type: 'doc', content: [p('Short thought: buy string for the kite.')] })
    for (let i = 0; i < 20; i++) await make({ type: 'doc', content: [p(`Card filler ${i}: something noticed on the way home.`)] })
    return { long, short }
  })
  const WORDS = { long: 'Walked line 0', short: 'buy string for the kite' }
  await h.evaluate((ids) => {
    const when = new Date().toISOString()
    // Opened before: ⌘K lists them under Recent before anything is typed.
    localStorage.setItem('sidebar:open-today', JSON.stringify([ids.long, ids.short].map((id) => ({ type: 'capture', id, at: when }))))
  }, ids)
  await h.reload(); await wait(3000)

  const pane = (id) => `.note-pane[data-open="${id}"]`
  const home = async () => { await go('home'); await wait(600) }
  // Each way in: how to get there, then what is pressed. Pins first: once
  // opened, the notes are on Home too; then unpinned. Recent is ⌘K's, before anything is typed.
  const ways = {
    pinned: { before: async () => { await v('pin', 'captures', ids.long, true); await v('pin', 'captures', ids.short, true); await home() }, target: (id) => `aside [data-side-row][data-drag-open="capture:${id}"]`, after: async () => { await v('pin', 'captures', ids.long, false); await v('pin', 'captures', ids.short, false) } },
    everything: { before: async () => { await go('all'); await wait(900) }, target: (id) => `[data-row][data-id="${id}"]`, stay: true },
    search: {
      key: true,
      before: async (id, note) => {
        await home()
        await h.keyboard.press('Meta+k'); await wait(400)
        await h.keyboard.type(note === 'long' ? 'Field notes on the long' : 'Short thought: buy string', { delay: 10 }); await wait(900)
      }
    },
    home: { before: home, target: (id) => `[data-page="home"] [data-drag-open="capture:${id}"]` },
    recent: { before: async () => { await home(); await h.keyboard.press('Meta+k'); await wait(700) }, target: (id) => `[role="dialog"][aria-label="Search"] [data-drag-open="capture:${id}"]` }
  }
  const failures = []
  const warm = {}
  // Opened once cold, then QA_WARM more times (3 by default): the warm opens' middle time is what counts.
  const rounds = ['cold', ...Array.from({ length: Number(process.env.QA_WARM ?? 3) }, (_, n) => `warm${n + 1}`)]
  for (const round of rounds) {
    for (const [path, way] of Object.entries(ways)) {
      for (const note of ['long', 'short']) {
        const id = ids[note]
        await way.before(id, note)
        const there = way.key || (await h.locator(way.target(id)).count())
        if (!there) { console.log(`${path} ${note}: nothing to click`); failures.push(`${path} ${note} missing`); continue }
        // The pointer comes to rest on it first, as a person's does, then presses.
        if (!way.key) { await h.locator(way.target(id)).first().hover(); await wait(300) }
        await arm({ key: !!way.key, page: way.stay ? undefined : 'all', pane: pane(id), words: WORDS[note] })
        const profiling = PROFILE && round === 'warm1' && PROFILE.includes(path)
        if (profiling) await profiler.start()
        if (way.key) await h.keyboard.press('Enter')
        else await h.locator(way.target(id)).first().click()
        const got = await collect()
        if (profiling) await profiler.stop(`${path} ${note}`)
        report(path, note, round, got)
        if (round !== 'cold') (warm[`${path} ${note}`] ??= []).push(got.marks)
        // Put away again, so the next open is an open and not the same one.
        if (way.stay) { await go('home'); await wait(400) }
      }
      await way.after?.()
    }
  }

  // The rest of the app: a task and a gem from Home, then sidebar pages
  // (Gems, the Calendar, Tags, Everything). The press, then the page drawn.
  const side = (label) => `aside [data-side-row]:text-is("${label}"), aside [data-side-row]:has(span:text-is("${label}"))`
  const sweep = [
    ['gem from Home', 'nuggets', '[data-page="home"] [data-drag-open^="nugget:"]', '[data-page="nuggets"] .tiptap.ProseMirror'],
    ['task from Home', null, '[data-page="home"] [data-drag-open^="task:"]', '[data-page] [data-task-tags]'],
    ['sidebar Gems', 'nuggets', side('Gems')],
    ['sidebar Calendar', 'calendar', side('Calendar')],
    ['sidebar Tags', 'tags', side('Tags')],
    ['sidebar Everything', 'all', side('Everything')],
    ['sidebar Tasks', 'today', side('Tasks')]
  ]
  for (const [path, page, target, ready] of sweep) {
    await home()
    const there = await h.locator(target).count()
    if (!there) { console.log(`${path}: nothing to click`); continue }
    await h.locator(target).first().hover(); await wait(300)
    await arm({ page, ready: ready ?? `[data-page="${page}"]` })
    const profiling = PROFILE?.includes(page ?? 'task')
    if (profiling) await profiler.start()
    await h.locator(target).first().click()
    const got = await collect()
    if (profiling) await profiler.stop(path)
    report(path, '-', 'page', got)
  }

  // The middle of the warm opens, each step, for each way in.
  const middle = (list) => { const sorted = list.filter((one) => one !== undefined).sort((a, b) => a - b); return sorted.length ? sorted[Math.floor(sorted.length / 2)] : undefined }
  console.log('\nmiddle of the warm opens (ms from the press): page, note pane, words drawn, page-turn sound')
  for (const [name, marks] of Object.entries(warm)) {
    const at = (step) => middle(marks.map((one) => one[step]))
    console.log(`= ${name.padEnd(18)} page ${at('route') ?? '-'}  pane ${at('pane') ?? '-'}  drawn ${at('painted') ?? '-'}  turn ${at('turn') ?? '-'}`)
    if (!(at('painted') <= BUDGET)) failures.push(`${name}: words drawn at ${at('painted') ?? 'never'}ms`)
  }
  for (const one of failures) console.log('over budget:', one)
  check(`every note's words are drawn within ${BUDGET}ms of the press`, failures.length === 0, failures.join('; '))
} finally {
  await close()
}
console.log(errors.filter((e) => !/net::|Failed to load resource/.test(e)).slice(0, 10).join('\n') || 'no errors')
process.exit(results.every(Boolean) ? 0 : 1)
