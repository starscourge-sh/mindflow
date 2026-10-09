// A very long imported note opens without freezing the app, and gg jumps to
// its top at once. The note is made up to look like "LIT - Cloud Engineer": a
// table of 40 badge pictures, 150 link cards, 80 folded callouts, 30 code
// blocks, 2,000 paragraphs and 200 headings, imported from a vault alongside
// 1,200 small notes, then opened from All captures with vim keys on.
//
//   npx electron-vite build --outDir out-perf && QA_ENTRY=out-perf/main/index.js node qa/big-doc.mjs
//
// PROF=40 prints where the open's time went (a CPU profile of the window),
// PROFKEYS=40 the same for G and gg, and TREE=name what that function spent
// its time in.
import { mkdtempSync, mkdirSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { deflateSync, crc32 } from 'zlib'

// Budgets. Opening is read from the ask to the last frozen moment of it (a
// task over 50 ms). Reading and drawing a 700,000-position note is real work,
// about 300 ms in one go on an M-series Mac: half a second still reads as a
// pause rather than a freeze, which leaves room for a slower machine; and the
// whole open within 1.5 s, three times what it takes here. G and gg are one
// key each: under 100 ms, the time in which a key still feels instant.
const OPEN_MS = 1500
const TASK_MS = 500
const GG_MS = 100

// A small picture, each one different so each is stored and drawn on its own.
function png(seed, width = 240, height = 240) {
  const chunk = (type, data) => {
    const head = Buffer.alloc(8)
    head.writeUInt32BE(data.length)
    head.write(type, 4)
    const crc = Buffer.alloc(4)
    crc.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type), data])))
    return Buffer.concat([head, data, crc])
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr.set([8, 2, 0, 0, 0], 8)
  const raw = Buffer.alloc((width * 3 + 1) * height)
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const at = y * (width * 3 + 1) + 1 + x * 3
    raw[at] = (x * seed) & 255
    raw[at + 1] = (y * 7 + seed * 13) & 255
    raw[at + 2] = ((x ^ y) + seed * 31) & 255
  }
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))])
}

const words = 'cloud engineer account region subnet gateway lambda bucket policy role trust boundary cost alarm metric deploy stack template pipeline container cluster node queue topic stream table index backup restore failover latency throughput'.split(' ')
const sentence = (i, n = 40) => Array.from({ length: n }, (_, k) => words[(i * 7 + k * 3) % words.length]).join(' ') + '.'

function bigNote() {
  const out = ['---', 'tags: [aws, career]', '---', '', '# Certifications', '']
  const row = (from) => '| ' + Array.from({ length: 5 }, (_, k) => `![[badge-${from + k}.png|120]]`).join(' | ') + ' |'
  out.push('| A | B | C | D | E |', '| - | - | - | - | - |')
  for (let i = 0; i < 40; i += 5) out.push(row(i))
  out.push('', '# Exam Prep', '')
  let cards = 0
  let callouts = 0
  let code = 0
  for (let p = 0; p < 2000; p++) {
    if (p % 10 === 0) out.push(`## Topic ${p / 10}: ${words[p % words.length]} ${words[(p + 5) % words.length]}`, '')
    out.push(`${sentence(p)} See [the guide](https://docs.aws.amazon.com/guide/${p}) and **${words[p % words.length]}** in \`${words[(p + 1) % words.length]}\`.`, '')
    if (p % 13 === 0 && cards < 150) {
      for (let k = 0; k < 2 && cards < 150; k++, cards++) {
        out.push('```cardlink', `url: https://www.youtube.com/watch?v=vid${cards}`, `title: "AWS ${words[cards % words.length]} explained, part ${cards}"`, 'host: www.youtube.com', `description: "${sentence(cards, 18)}"`, '```', '')
      }
    }
    if (p % 25 === 0 && callouts < 80) {
      callouts++
      out.push(`> [!note]- Question ${callouts}: ${words[callouts % words.length]}`, `> ${sentence(callouts, 30)}`, `> - ${sentence(callouts + 1, 10)}`, `> - ${sentence(callouts + 2, 10)}`, '')
    }
    if (p % 66 === 0 && code < 30) {
      code++
      out.push('```bash', ...Array.from({ length: 8 }, (_, k) => `aws ${words[(code + k) % words.length]} describe-${words[k % words.length]} --region eu-west-1 --output json # ${k}`), '```', '')
    }
  }
  return out.join('\n')
}

const vault = mkdtempSync(join(tmpdir(), 'vigil-bigdoc-vault-'))
mkdirSync(join(vault, 'attachments'))
for (let i = 0; i < 40; i++) writeFileSync(join(vault, 'attachments', `badge-${i}.png`), png(i + 1))
writeFileSync(join(vault, 'LIT - Cloud Engineer.md'), bigNote())
mkdirSync(join(vault, 'inbox'))
for (let i = 0; i < 1200; i++) writeFileSync(join(vault, 'inbox', `note ${i}.md`), `${sentence(i, 8)}\n\n${sentence(i + 1, 20)}\n`)
process.env.QA_DATA ??= mkdtempSync(join(tmpdir(), 'vigil-bigdoc-data-'))
process.env.MINDFLOW_QA_VAULT = vault

const { open } = await import('./harness.mjs')

/** With `top` set, a CPU profile of the window until the returned stop, printed as the slowest functions. */
async function profile(page, top) {
  if (!top) return async () => {}
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Profiler.enable')
  await cdp.send('Profiler.setSamplingInterval', { interval: 500 })
  await cdp.send('Profiler.start')
  return async () => {
    const { profile } = await cdp.send('Profiler.stop')
    const byId = new Map(profile.nodes.map((n) => [n.id, n]))
    const parent = new Map()
    for (const n of profile.nodes) for (const c of n.children ?? []) parent.set(c, n.id)
    const self = new Map()
    const incl = new Map()
    const key = (n) => `${n.callFrame.functionName || '(anon)'} ${n.callFrame.url.split('/').pop()}:${n.callFrame.lineNumber}`
    profile.samples.forEach((sid, i) => {
      const us = profile.timeDeltas[i] ?? 0
      self.set(key(byId.get(sid)), (self.get(key(byId.get(sid))) ?? 0) + us)
      const seen = new Set()
      for (let cur = sid; cur; cur = parent.get(cur)) { const k = key(byId.get(cur)); if (!seen.has(k)) { seen.add(k); incl.set(k, (incl.get(k) ?? 0) + us) } }
    })
    console.log('-- self'); [...self].sort((a, b) => b[1] - a[1]).slice(0, 25).forEach(([k, v]) => console.log(Math.round(v / 1000), k))
    // TREE=name prints what the functions of that name spent their time in.
    if (process.env.TREE) {
      const counts = new Map()
      profile.samples.forEach((sid, i) => counts.set(sid, (counts.get(sid) ?? 0) + (profile.timeDeltas[i] ?? 0)))
      const walk = (n) => (n.us = (counts.get(n.id) ?? 0) + (n.children ?? []).reduce((a, c) => a + walk(byId.get(c)), 0))
      walk(profile.nodes[0])
      const print = (n, depth) => { if (n.us < 2000 || depth > 5) return; console.log('  '.repeat(depth) + Math.round(n.us / 1000) + ' ' + key(n)); for (const c of n.children ?? []) print(byId.get(c), depth + 1) }
      for (const n of profile.nodes) if (n.callFrame.functionName === process.env.TREE) print(n, 0)
    }
    console.log('-- inclusive'); [...incl].sort((a, b) => b[1] - a[1]).slice(0, Number(top)).forEach(([k, v]) => console.log(Math.round(v / 1000), k))
  }
}
const qa = await open()
const { electron } = qa
const results = []
const check = (name, ok, detail) => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  (${detail})`) }
try {
  let h
  for (let i = 0; i < 100 && !h; i++) {
    h = electron.windows().find((w) => w.url().includes('view=home'))
    if (!h) await qa.page.waitForTimeout(200)
  }
  await electron.evaluate(({ BrowserWindow }) => { const w = BrowserWindow.getAllWindows().find((one) => one.webContents.getURL().includes('view=home')); w?.setBounds({ x: 40, y: 40, width: 1400, height: 900 }); w?.show() })
  const send = (type, id) => electron.evaluate(({ BrowserWindow }, [type, id]) => BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().includes('view=home'))?.webContents.send('home:open', type, id), [type, id])

  // Imported, every note turned into a document.
  let id = null
  let count = 0
  for (let i = 0; i < 240 && !id; i++) {
    await h.waitForTimeout(1000)
    ;[id, count] = await h.evaluate(async () => {
      const list = await window.api.captures.list()
      const one = list.find((row) => /Cloud Engineer|Certifications/.test(row.label ?? ''))
      if (!one || list.length < 1201) return [null, list.length]
      const pending = await window.api.vigil('imports:pending')
      return [pending.length ? null : one.id, list.length]
    })
  }
  if (!id) throw new Error(`the big note never finished importing (${count} captures)`)
  // Vim keys on, then All captures, as it was when it froze.
  await h.evaluate(() => localStorage.setItem('vim', 'on'))
  await h.reload()
  await h.waitForTimeout(2500)
  await send('view', 'all')
  await h.waitForTimeout(2500)

  // Opening it: every frozen stretch (a task over 50 ms) from the ask until
  // the window has been free for a whole second.
  await h.evaluate(() => {
    window.__long = []
    new PerformanceObserver((list) => list.getEntries().forEach((e) => window.__long.push([e.startTime, e.duration]))).observe({ type: 'longtask' })
    window.__t0 = performance.now()
    // When the note's words are on the page, checked every 10 ms from inside it.
    window.__shownAt = null
    const look = () => {
      if ([...document.querySelectorAll('.tiptap.ProseMirror > h1')].some((one) => one.isConnected && one.textContent.includes('Exam Prep'))) window.__shownAt = performance.now() - window.__t0
      else setTimeout(look, 10)
    }
    look()
  })
  const stopProfile = await profile(h, process.env.PROF)
  await send('capture', id)
  await h.waitForFunction(() => window.__shownAt !== null, null, { timeout: 120000 })
  const shown = await h.evaluate(() => window.__shownAt)
  await h.waitForFunction(() => {
    const last = window.__long.at(-1)
    return performance.now() - Math.max(window.__t0, last ? last[0] + last[1] : 0) > 1000
  }, null, { timeout: 120000, polling: 100 })
  const opened = await h.evaluate((shown) => {
    const long = window.__long.filter(([at]) => at >= window.__t0)
    const end = Math.max(...long.map(([at, d]) => at + d), window.__t0 + shown)
    return { ms: Math.round(end - window.__t0), longest: Math.round(Math.max(0, ...long.map(([, d]) => d))), frozen: Math.round(long.reduce((a, [, d]) => a + d, 0)), tasks: long.length }
  }, shown)
  await stopProfile()
  const size = await h.evaluate(() => { const ed = [...document.querySelectorAll('.tiptap.ProseMirror')].find((one) => one.textContent.includes('Exam Prep')); let n = {}; ed.editor.state.doc.descendants((node) => { n[node.type.name] = (n[node.type.name] ?? 0) + 1 }); return n })
  console.log('DOC', JSON.stringify({ image: size.image, bookmark: size.bookmark, callout: size.callout, codeBlock: size.codeBlock, paragraph: size.paragraph, heading: size.heading }))
  console.log(`OPEN  words on screen ${Math.round(shown)} ms; done ${opened.ms} ms; longest frozen ${opened.longest} ms; frozen in all ${opened.frozen} ms over ${opened.tasks} tasks`)
  check('opens in time', opened.ms < OPEN_MS, `${opened.ms} ms, budget ${OPEN_MS}`)
  check('never frozen long while opening', opened.longest < TASK_MS, `${opened.longest} ms, budget ${TASK_MS}`)

  // G and gg in vim's normal mode, each from a caret placed by a click on
  // the words on screen: from the first key to the next frame drawn after
  // the last, and the line the caret lands on has to be on screen.
  const ED = '.tiptap.ProseMirror.mindflow-editor:not(.is-line)'
  const clickOnScreen = async () => {
    const spot = await h.evaluate((sel) => {
      const ed = [...document.querySelectorAll(sel)].find((one) => one.textContent.includes('Exam Prep'))
      const frame = ed.parentElement.getBoundingClientRect()
      const line = [...ed.querySelectorAll(':scope > p, :scope > h1, :scope > h2')].find((p) => { const r = p.getBoundingClientRect(); return r.height && r.top >= frame.top && r.bottom <= frame.bottom })
      const r = line.getBoundingClientRect()
      return { x: r.left + 20, y: r.top + r.height / 2 }
    }, ED)
    await h.mouse.click(spot.x, spot.y)
    // Normal mode; Escape only if the click left it typing, as another Escape leaves the note.
    if (await h.evaluate((sel) => document.querySelector(sel + '[data-vim-mode="insert"]') !== null, ED)) await h.keyboard.press('Escape')
    await h.waitForTimeout(600)
  }
  const timeKeys = async (keys) => {
    await h.evaluate(() => {
      window.__keys = []
      window.__long = []
      window.__onKey ??= (e) => { const t = e.timeStamp; requestAnimationFrame(() => setTimeout(() => window.__keys.push(performance.now() - t), 0)) }
      window.addEventListener('keydown', window.__onKey, true)
    })
    const stop = await profile(h, process.env.PROFKEYS)
    for (const key of keys) await h.keyboard.press(key)
    await h.waitForFunction((n) => window.__keys.length >= n, keys.length, { timeout: 120000 })
    await h.waitForTimeout(1000)
    await stop()
    return h.evaluate(() => ({ frame: Math.round(window.__keys.at(-1)), longest: Math.round(Math.max(0, ...window.__long.map(([, d]) => d))) }))
  }
  const where = () => h.evaluate((sel) => {
    const ed = [...document.querySelectorAll(sel)].find((one) => one.textContent.includes('Exam Prep'))
    const box = ed.parentElement
    const line = ed.editor.view.domAtPos(ed.editor.state.selection.from).node
    const rect = (line.nodeType === 1 ? line : line.parentElement).getBoundingClientRect()
    const frame = box.getBoundingClientRect()
    return { at: ed.editor.state.selection.from, size: ed.editor.state.doc.content.size, top: Math.round(box.scrollTop), seen: rect.bottom > frame.top && rect.top < frame.bottom }
  }, ED)
  await clickOnScreen()
  const G = await timeKeys(['Shift+G'])
  const atEnd = await where()
  console.log(`G   ${JSON.stringify(G)} ${JSON.stringify(atEnd)}`)
  check('G goes to the end and shows it', atEnd.at > atEnd.size - 400 && atEnd.seen, `at ${atEnd.at} of ${atEnd.size}, on screen ${atEnd.seen}`)
  check('G is instant', G.frame < GG_MS && G.longest < GG_MS, `next frame ${G.frame} ms, longest frozen ${G.longest} ms, budget ${GG_MS}`)
  // Scrolled to the bottom by hand, a click there, then gg.
  await h.evaluate((sel) => { const box = [...document.querySelectorAll(sel)].find((one) => one.textContent.includes('Exam Prep')).parentElement; box.scrollTo({ top: box.scrollHeight, behavior: 'instant' }) }, ED)
  await h.waitForTimeout(800)
  await clickOnScreen()
  const from = await where()
  const gg = await timeKeys(['g', 'g'])
  const atTop = await where()
  console.log(`gg  ${JSON.stringify(gg)} from ${from.at}, ${JSON.stringify(atTop)}`)
  check('gg goes to the top and shows it', from.at > from.size / 2 && atTop.at < 40 && atTop.top === 0 && atTop.seen, `from ${from.at} to ${atTop.at}, scrolled ${atTop.top}, on screen ${atTop.seen}`)
  check('gg is instant', gg.frame < GG_MS && gg.longest < GG_MS, `next frame ${gg.frame} ms, longest frozen ${gg.longest} ms, budget ${GG_MS}`)
} finally {
  try { await qa.electron.close() } catch {}
  try { qa.electron.process().kill('SIGKILL') } catch {}
}
console.log(`${results.filter(Boolean).length}/${results.length} passed`)
process.exit(results.every(Boolean) ? 0 : 1)
