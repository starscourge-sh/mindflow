// A note full of large pictures opens with each picture's place kept and its
// colours shown at once, so nothing moves when the pictures arrive.
//
// The note is made up like an imported lecture: 40 slide screenshots, around
// 2000px each in varied colours and shapes, between bullet points, and a table
// of pictures. It is imported from a vault, then opened, then scrolled to the
// end, with every layout shift added up (PerformanceObserver 'layout-shift')
// and frames kept from the open, about every 30 ms.
//
//   npx electron-vite build --outDir out-thumbs && QA_ENTRY=out-thumbs/main/index.js node qa/placeholders.mjs
//
// OUT=folder keeps the frames and screenshots there; LABEL names this run's
// files; LONG=1 pads the note past the long-document size, so only the blocks
// near the screen are drawn.
import { mkdtempSync, mkdirSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { deflateSync, crc32 } from 'zlib'

const OUT = process.env.OUT ?? mkdtempSync(join(tmpdir(), 'vigil-placeholders-'))
const LABEL = process.env.LABEL ?? 'run'
mkdirSync(OUT, { recursive: true })

// A slide: a gradient between two colours with a title bar and a few blocks on it.
function slide(seed, width, height, band = 0) {
  const chunk = (type, data) => {
    const head = Buffer.alloc(8)
    head.writeUInt32BE(data.length)
    head.write(type, 4)
    const crc = Buffer.alloc(4)
    crc.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type), data])))
    return Buffer.concat([head, data, crc])
  }
  const hue = (h) => [0, 8, 4].map((n) => { const k = (n + h / 30) % 12; return Math.round(255 * (0.55 - 0.45 * Math.max(-1, Math.min(k - 3, 9 - k, 1)))) })
  const a = hue((seed * 47) % 360)
  const b = hue((seed * 47 + 140) % 360)
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr.set([8, 2, 0, 0, 0], 8)
  const raw = Buffer.alloc((width * 3 + 1) * height)
  const boxes = Array.from({ length: 3 }, (_, k) => [((seed * 13 + k * 29) % 50) / 100, 0.25 + k * 0.22, 0.3 + ((seed + k) % 3) * 0.1, 0.14])
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const at = y * (width * 3 + 1) + 1 + x * 3
    const t = (x / width + y / height) / 2
    let px = [0, 1, 2].map((c) => a[c] * (1 - t) + b[c] * t)
    if (y < height * 0.12) px = px.map((v) => v * 0.35)
    for (const [bx, by, bw, bh] of boxes) if (x > bx * width && x < (bx + bw) * width && y > by * height && y < (by + bh) * height) px = [245, 245, 240]
    // A little grain, as a screenshot of a photo or a rendered slide has, so it costs what a real one does to read.
    const grain = ((x * 7919 + y * 104729 + seed * 31) % 23) - 11
    if (y < band || y >= height - band) px = [0, 0, 0]
    raw[at] = Math.max(0, Math.min(255, px[0] + grain))
    raw[at + 1] = Math.max(0, Math.min(255, px[1] + grain))
    raw[at + 2] = Math.max(0, Math.min(255, px[2] + grain))
  }
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 1 })), chunk('IEND', Buffer.alloc(0))])
}

const SHAPES = [[2880, 1620], [2200, 1650], [1600, 2000], [2400, 1350], [1800, 1800], [2000, 1500]]
const words = 'slide lecture network packet router subnet latency cache memory thread process kernel socket buffer queue scheduler page fault'.split(' ')
const line = (i, n = 14) => Array.from({ length: n }, (_, k) => words[(i * 5 + k * 3) % words.length]).join(' ')

function note() {
  const out = ['# Lecture slides', '', `${line(0, 40)}.`, '']
  for (let i = 0; i < 40; i++) {
    out.push(`## Slide ${i + 1}`, '', `- ${line(i)}`, `- ${line(i + 1, 9)}`, `- ${line(i + 2, 11)}`, '', `![[slide-${i}.png]]`, '')
    // A video's 4:3 thumbnail with black bands baked in: shown without them.
    if (i === 1) out.push('![[banded.png]]', '')
    if (i === 6) out.push('| Before | After | Diagram |', '| - | - | - |', '| ![[cell-0.png|200]] | ![[cell-1.png|200]] | ![[cell-2.png|200]] |', '')
  }
  if (process.env.LONG) for (let p = 0; p < 2600; p++) out.push(`${line(p, 40)}.`, '')
  return out.join('\n')
}

const vault = mkdtempSync(join(tmpdir(), 'vigil-placeholders-vault-'))
mkdirSync(join(vault, 'attachments'))
for (let i = 0; i < 40; i++) writeFileSync(join(vault, 'attachments', `slide-${i}.png`), slide(i + 1, ...SHAPES[i % SHAPES.length]))
for (let i = 0; i < 3; i++) writeFileSync(join(vault, 'attachments', `cell-${i}.png`), slide(50 + i, 1200, 800))
// 1280x960 with 120 black rows over and under: a 16:9 picture in a 4:3 frame.
writeFileSync(join(vault, 'attachments', 'banded.png'), slide(77, 1280, 960, 120))
writeFileSync(join(vault, 'Lecture slides.md'), note())
process.env.QA_DATA ??= mkdtempSync(join(tmpdir(), 'vigil-placeholders-data-'))
process.env.MINDFLOW_QA_VAULT = vault

const { open } = await import('./harness.mjs')
const ED = '.tiptap.ProseMirror.mindflow-editor:not(.is-line)'
const home = async (qa) => {
  let h
  for (let i = 0; i < 100 && !h; i++) {
    h = qa.electron.windows().find((w) => w.url().includes('view=home'))
    if (!h) await qa.page.waitForTimeout(200)
  }
  await qa.electron.evaluate(({ BrowserWindow }) => { const w = BrowserWindow.getAllWindows().find((one) => one.webContents.getURL().includes('view=home')); w?.setBounds({ x: 40, y: 40, width: 1200, height: 860 }); w?.show() })
  return h
}
// First run: imported, and the pictures' sizes and colours worked out in the background.
let id = null
{
  const qa = await open()
  try {
    const h = await home(qa)
    for (let i = 0; i < 240 && !id; i++) {
      await h.waitForTimeout(1000)
      id = await h.evaluate(async () => {
        const one = (await window.api.captures.list()).find((row) => /Lecture slides/.test(row.label ?? ''))
        return one && !(await window.api.vigil('imports:pending')).length ? one.id : null
      })
    }
    if (!id) throw new Error('the note never finished importing')
    await h.evaluate(() => window.api.vigil('onboarding:set', { welcomed: new Date().toISOString(), newsSeen: true }))
    // Every picture's size and colours worked out, as they are soon after an import (a build without them goes on at once).
    for (let i = 0; i < 120; i++) {
      const known = await h.evaluate(async () => Object.keys((await window.api.vigil('pictures:looks').catch(() => null)) ?? {}).length)
      if (!known || known >= 45) break
      await h.waitForTimeout(500)
    }
    if (process.env.THEME) await h.evaluate((n) => localStorage.setItem('theme', n), process.env.THEME)
    await h.waitForTimeout(4000)
  } finally {
    try { await qa.electron.close() } catch {}
    try { qa.electron.process().kill('SIGKILL') } catch {}
  }
}
// BACKFILL=1: forget every picture's size and colours, as for pictures stored
// before this existed, so the note works them out as it is opened.
if (process.env.BACKFILL) {
  const { DatabaseSync } = await import('node:sqlite')
  const db = new DatabaseSync(join(process.env.QA_DATA, 'mindflow.db'))
  db.exec('delete from picture_looks')
  db.close()
}
// Second run, the app started afresh, so nothing is in its memory yet: the note opened.
delete process.env.MINDFLOW_QA_VAULT
const qa = await open()
const { electron } = qa
try {
  const h = await home(qa)
  const send = (type, id) => electron.evaluate(({ BrowserWindow }, [type, id]) => BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().includes('view=home'))?.webContents.send('home:open', type, id), [type, id])
  // A picture is read as it would be from a busy disk, or while the main
  // process is busy with something else: SLOW ms late (150 unless set). The
  // same for every build, so a run before and after compare.
  // And never seen before, as a note just imported is: nothing in the cache.
  await electron.evaluate(({ session }) => session.defaultSession.clearCache())
  await electron.evaluate(({ app, net, protocol }, slow) => {
    const { pathToFileURL } = process.mainModule.require('url')
    const { join } = process.mainModule.require('path')
    protocol.unhandle('mindflow')
    protocol.handle('mindflow', async (request) => {
      const { host, pathname } = new URL(request.url)
      const name = pathname.replace(/^\/+/, '')
      if (host !== 'assets' || !/^[a-f0-9]{64}\.[a-z0-9]+$/.test(name)) return new Response('not found', { status: 404 })
      await new Promise((done) => setTimeout(done, slow))
      return net.fetch(pathToFileURL(join(app.getPath('userData'), 'assets', name)).toString()).catch(() => new Response('not found', { status: 404 }))
    })
  }, Number(process.env.SLOW ?? 150))
  // A page reads through the handler it was loaded with: loaded again, it reads through this one.
  await h.reload()
  await h.waitForTimeout(Number(process.env.SETTLE ?? 2500))
  await send('view', 'all')
  await h.waitForTimeout(Number(process.env.SETTLE ?? 1500) / 2)

  // Frames from the moment it is asked for, as the window paints them.
  const cdp = await h.context().newCDPSession(h)
  const frames = []
  cdp.on('Page.screencastFrame', (frame) => {
    frames.push({ at: frame.metadata.timestamp * 1000, data: frame.data })
    void cdp.send('Page.screencastFrameAck', { sessionId: frame.sessionId }).catch(() => {})
  })
  await h.evaluate(() => {
    window.__shifts = []
    new PerformanceObserver((list) => list.getEntries().forEach((e) => window.__shifts.push([e.startTime, e.value, e.hadRecentInput]))).observe({ type: 'layout-shift' })
    window.__long = []
    new PerformanceObserver((list) => list.getEntries().forEach((e) => window.__long.push([e.startTime, e.duration]))).observe({ type: 'longtask' })
    window.__t0 = performance.now()
    window.__wall0 = Date.now()
    window.__shownAt = null
    const look = () => {
      if ([...document.querySelectorAll('.tiptap.ProseMirror h2')].some((one) => one.isConnected && one.textContent.includes('Slide 1'))) {
        window.__shownAt = performance.now() - window.__t0
        window.__drawnThen = [...document.querySelectorAll('.tiptap.ProseMirror img')].filter((img) => img.naturalWidth).map((img) => img.src.slice(0, 40)).join(' ')
      }
      else setTimeout(look, 5)
    }
    look()
    // What the pictures on screen are doing, every 30 ms: drawn, showing their colours, or nothing yet.
    window.__states = []
    const every = setInterval(() => {
      const t = Math.round(performance.now() - window.__t0)
      if (t > 1500) return clearInterval(every)
      const shown = [...document.querySelectorAll('.tiptap.ProseMirror img')].filter((img) => { const r = img.getBoundingClientRect(); return r.height > 0 && r.top < innerHeight && r.bottom > 0 })
      if (shown.length) window.__states.push(`${t}:${shown.map((img) => (img.dataset.waiting !== undefined ? 'c' : img.complete && img.naturalWidth ? 'P' : '_')).join('')}`)
    }, 30)
  })
  // Nothing kept from Home's own copy of the first picture: the note opens as one never seen.
  await cdp.send('Network.enable')
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true })
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 70, everyNthFrame: 1 })
  const knownLooks = await h.evaluate(async () => Object.keys((await window.api.vigil('pictures:looks').catch(() => ({}))) ?? {}).length)
  // How long the main process is ever held up while the note opens.
  await electron.evaluate(() => {
    globalThis.__lag = 0
    let last = Date.now()
    clearInterval(globalThis.__lagTimer)
    globalThis.__lagTimer = setInterval(() => { const now = Date.now(); globalThis.__lag = Math.max(globalThis.__lag, now - last - 10); last = now }, 10)
  })
  const wall0 = await h.evaluate(() => window.__wall0)
  // PROF=n: where the open's time went, the n costliest functions.
  if (process.env.PROF) {
    await cdp.send('Profiler.enable')
    await cdp.send('Profiler.setSamplingInterval', { interval: 200 })
    await cdp.send('Profiler.start')
  }
  await send('capture', id)
  await h.waitForFunction(() => window.__shownAt !== null, null, { timeout: 60000 })
  await h.waitForFunction(() => {
    const last = window.__long.at(-1)
    return performance.now() - Math.max(window.__t0, last ? last[0] + last[1] : 0) > 1000
  }, null, { timeout: 60000, polling: 100 })
  await cdp.send('Page.stopScreencast')
  if (process.env.PROF) {
    const { profile } = await cdp.send('Profiler.stop')
    const byId = new Map(profile.nodes.map((n) => [n.id, n]))
    const parent = new Map()
    for (const n of profile.nodes) for (const c of n.children ?? []) parent.set(c, n.id)
    const incl = new Map()
    const key = (n) => `${n.callFrame.functionName || '(anon)'} ${n.callFrame.url.split('/').pop()}:${n.callFrame.lineNumber}`
    profile.samples.forEach((sid, i) => {
      const seen = new Set()
      for (let cur = sid; cur; cur = parent.get(cur)) { const k = key(byId.get(cur)); if (!seen.has(k)) { seen.add(k); incl.set(k, (incl.get(k) ?? 0) + (profile.timeDeltas[i] ?? 0)) } }
    })
    ;[...incl].sort((a, b) => b[1] - a[1]).slice(0, Number(process.env.PROF)).forEach(([k, v]) => console.log('PROF', Math.round(v / 1000), k))
    const self = new Map()
    profile.samples.forEach((sid, i) => { const k = key(byId.get(sid)); self.set(k, (self.get(k) ?? 0) + (profile.timeDeltas[i] ?? 0)) })
    ;[...self].sort((a, b) => b[1] - a[1]).slice(0, 25).forEach(([k, v]) => console.log('SELF', (v / 1000).toFixed(1), k))
  }
  const opened = await h.evaluate(() => {
    const long = window.__long.filter(([at]) => at >= window.__t0)
    const end = Math.max(...long.map(([at, d]) => at + d), window.__t0 + window.__shownAt)
    const shift = window.__shifts.filter(([at, , input]) => at >= window.__t0 && !input).reduce((a, [, v]) => a + v, 0)
    return { drawnThen: window.__drawnThen, shown: Math.round(window.__shownAt), done: Math.round(end - window.__t0), shift }
  })
  // One frame for every 30 ms of the first 1.2 s: the last one painted by then.
  const dir = join(OUT, `frames-${LABEL}`)
  mkdirSync(dir, { recursive: true })
  let kept = 0
  for (let t = 0; t <= 1200; t += 30) {
    const frame = frames.filter((one) => one.at - wall0 <= t).at(-1)
    if (!frame) continue
    writeFileSync(join(dir, `${String(t).padStart(4, '0')}ms.jpg`), Buffer.from(frame.data, 'base64'))
    kept++
  }
  await h.screenshot({ path: join(OUT, `${LABEL}-opened.png`) })

  // Then down to the end, a screenful at a time, as someone reading it would.
  await h.evaluate(() => (window.__t1 = performance.now()))
  for (let i = 0; i < 80; i++) {
    const end = await h.evaluate((sel) => {
      const box = [...document.querySelectorAll(sel)].find((one) => one.textContent.includes('Slide 1')).parentElement
      box.scrollBy({ top: 500, behavior: 'instant' })
      return box.scrollTop + box.clientHeight >= box.scrollHeight - 2
    }, ED)
    await h.waitForTimeout(120)
    if (i === 6) await h.screenshot({ path: join(OUT, `${LABEL}-scrolling.png`) })
    if (end) break
  }
  await h.waitForTimeout(1500)
  const scrolled = await h.evaluate(() => window.__shifts.filter(([at, , input]) => at >= window.__t1 && !input).reduce((a, [, v]) => a + v, 0))
  const pictures = await h.evaluate((sel) => {
    const ed = [...document.querySelectorAll(sel)].find((one) => one.textContent.includes('Slide 1'))
    const all = [...ed.querySelectorAll('img')]
    return { all: all.length, loaded: all.filter((img) => img.naturalWidth).length, placeheld: all.filter((img) => img.style.backgroundImage).length }
  }, ED)
  // The banded picture shown without its bands, and the table of pictures.
  const banded = await h.evaluate((sel) => {
    const ed = [...document.querySelectorAll(sel)].find((one) => one.textContent.includes('Slide 1'))
    const img = [...ed.querySelectorAll('img')].find((one) => one.naturalWidth === 1280 && one.naturalHeight === 960)
    img.scrollIntoView({ block: 'center', behavior: 'instant' })
    const r = img.getBoundingClientRect()
    return { box: `${Math.round(r.width)}x${Math.round(r.height)}`, ratio: +(r.width / r.height).toFixed(3), viewBox: img.style.getPropertyValue('object-view-box') }
  }, ED)
  await h.waitForTimeout(400)
  await h.screenshot({ path: join(OUT, `${LABEL}-banded.png`) })
  await h.evaluate((sel) => [...document.querySelectorAll(sel)].find((one) => one.textContent.includes('Slide 1')).querySelector('table').scrollIntoView({ block: 'center', behavior: 'instant' }), ED)
  await h.waitForTimeout(400)
  await h.screenshot({ path: join(OUT, `${LABEL}-table.png`) })
  console.log(`LOOKS  ${await h.evaluate(async () => Object.keys((await window.api.vigil('pictures:looks').catch(() => ({}))) ?? {}).length)} known once opened and scrolled`)
  console.log(`MAIN   ${knownLooks} looks known as it opened; held up at most ${await electron.evaluate(() => globalThis.__lag)} ms`)
  console.log(`BANDED ${JSON.stringify(banded)} (16:9 is 1.778)`)
  console.log(`OPEN   words on screen ${opened.shown} ms (pictures drawn by then: ${opened.drawnThen}); done ${opened.done} ms`)
  console.log(`SHIFT  opening ${opened.shift.toFixed(4)}; scrolling ${scrolled.toFixed(4)}; in all ${(opened.shift + scrolled).toFixed(4)}`)
  console.log(`PICS   ${JSON.stringify(pictures)}`)
  console.log(`FRAMES ${kept} in ${dir}`)
  console.log(`ON SCREEN (P drawn, c its colours, _ nothing) ${(await h.evaluate(() => window.__states)).join(' ')}`)
} finally {
  try { await qa.electron.close() } catch {}
  try { qa.electron.process().kill('SIGKILL') } catch {}
}
process.exit(0)
