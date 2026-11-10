// Two freezes the user hit on 10 Nov with their own book: opening "Voice
// Registers" (a long note with a 33-row table) held the window about 5 s, and
// Space on a selected picture in "Reading the primary source" (a picture of a
// page, its ~450 words read by Live Text) froze it while the picture opened.
// This times both: the longest stretch the window is blocked (a long task, or
// a frame held in layout) from the ask until it has been free for a second,
// failing over 300 ms.
//
// Run it on a copy of a real book (never the real folder): QA_BOOK is a folder
// holding haligtree.db (with -wal and -shm) and assets/, copied here into a
// fresh data folder.
//
//   npx electron-vite build --outDir out-x && QA_BOOK=<copy> QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/freeze-open.mjs
//
// PROF=30 prints where each step's time went (a CPU profile and the style and
// layout totals); TRACE=1 the slowest style, layout and script steps, and
// which selectors made the page restyle.
import { cpSync, mkdtempSync, existsSync } from 'fs'
import { execFileSync } from 'child_process'
import { tmpdir } from 'os'
import { join } from 'path'

const BLOCK_MS = 300
const data = process.env.QA_DATA ?? mkdtempSync(join(tmpdir(), 'haligtree-freeze-'))
process.env.QA_DATA = data
const book = process.env.QA_BOOK
if (!book) throw new Error('QA_BOOK: a copy of a book folder (haligtree.db and assets/), never the real one')
{
  for (const name of ['haligtree.db', 'haligtree.db-wal', 'haligtree.db-shm']) if (existsSync(join(book, name))) cpSync(join(book, name), join(data, name))
  cpSync(join(book, 'assets'), join(data, 'assets'), { recursive: true })
}
const sql = (q) => execFileSync('sqlite3', [join(data, 'haligtree.db'), q], { encoding: 'utf8' }).trim()

const { open, checks } = await import('./harness.mjs')
const { check, done } = checks()

/** With TRACE set, the window's own timeline until the returned stop, printed as its slowest style, layout and script steps. */
async function trace(page) {
  if (!process.env.TRACE) return async () => {}
  const cdp = await page.context().newCDPSession(page)
  const events = []
  cdp.on('Tracing.dataCollected', ({ value }) => events.push(...value))
  await cdp.send('Tracing.start', { categories: 'devtools.timeline,disabled-by-default-devtools.timeline.stack,disabled-by-default-devtools.timeline.invalidationTracking', transferMode: 'ReportEvents' })
  return async () => {
    const ended = new Promise((done) => cdp.once('Tracing.tracingComplete', done))
    await cdp.send('Tracing.end')
    await ended
    const slow = events.filter((e) => e.ph === 'X' && e.dur > 20000 && /UpdateLayoutTree|^Layout$|FunctionCall|EvaluateScript|TimerFire|FireAnimationFrame|EventDispatch|RunMicrotasks|ParseHTML|Paint|PrePaint|Layerize/.test(e.name))
    const why = new Map()
    for (const e of events) if (/StyleInvalidatorInvalidationTracking/.test(e.name)) {
      const d = e.args?.data ?? {}
      for (const one of d.selectors ?? []) why.set(`${d.reason ?? ''} on ${d.nodeName ?? ''}: ${one.selector}`, (why.get(`${d.reason ?? ''} on ${d.nodeName ?? ''}: ${one.selector}`) ?? 0) + 1)
    }
    ;[...why].sort((a, b) => b[1] - a[1]).slice(0, 25).forEach(([k, n]) => console.log('  why', n, k))
    for (const e of slow.sort((a, b) => a.ts - b.ts)) {
      const d = e.args?.data ?? e.args?.beginData ?? {}
      const where = d.stackTrace?.[0] ? `${d.stackTrace[0].functionName} ${String(d.stackTrace[0].url).split('/').pop()}:${d.stackTrace[0].lineNumber}` : d.functionName ? `${d.functionName} ${String(d.url).split('/').pop()}:${d.lineNumber}` : d.type ?? ''
      console.log(`${Math.round(e.dur / 1000)}ms ${e.name} ${e.args?.elementCount ?? e.args?.endData?.elementCount ?? d.elementCount ?? ''} ${where}`)
    }
  }
}

/** With `top` set, a CPU profile of the window until the returned stop, printed as the slowest functions. */
async function profile(page, top) {
  if (!top) return async () => {}
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Performance.enable')
  const metric = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((m) => [m.name, m.value]))
  const before = await metric()
  await cdp.send('Profiler.enable')
  await cdp.send('Profiler.setSamplingInterval', { interval: 500 })
  await cdp.send('Profiler.start')
  return async () => {
    const { profile } = await cdp.send('Profiler.stop')
    const after = await metric()
    console.log('-- ms in', ['ScriptDuration', 'TaskDuration', 'LayoutDuration', 'RecalcStyleDuration', 'LayoutCount', 'RecalcStyleCount', 'Nodes'].map((k) => `${k} ${/Count|Nodes/.test(k) ? after[k] - before[k] : Math.round((after[k] - before[k]) * 1000)}`).join(', '))
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
    console.log('-- self'); [...self].sort((a, b) => b[1] - a[1]).slice(0, Number(top)).forEach(([k, v]) => console.log(Math.round(v / 1000), k))
    console.log('-- inclusive'); [...incl].sort((a, b) => b[1] - a[1]).slice(0, Number(top)).forEach(([k, v]) => console.log(Math.round(v / 1000), k))
  }
}

const qa = await open()
const { electron } = qa
try {
  let h
  for (let i = 0; i < 100 && !h; i++) {
    h = electron.windows().find((w) => w.url().includes('view=home'))
    if (!h) await qa.page.waitForTimeout(200)
  }
  await h.waitForLoadState('domcontentloaded')
  await h.waitForTimeout(3000)
  const send = (type, id) => electron.evaluate(({ BrowserWindow }, [type, id]) => BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().includes('view=home'))?.webContents.send('home:open', type, id), [type, id])
  await h.evaluate(() => window.api.haligtree('onboarding:set', { welcomed: new Date().toISOString(), newsSeen: true, welcoming: false, pageHints: false }))

  const table = sql("select id from nuggets where title = 'Voice Registers' limit 1")
  const picture = sql("select id from nuggets where title = 'Reading the primary source' limit 1")
  if (!table || !picture) throw new Error(`notes not found (table ${table}, picture ${picture})`)

  // The longest the window's main thread is held, from now: a timer that should fire every 5 ms, and how late it
  // comes (script, style, layout and paint all hold it). Read from the page, so a held frame cannot hide from it.
  const watch = () => h.evaluate(() => {
    window.__gaps = []
    window.__t0 = performance.now()
    let last = performance.now()
    clearInterval(window.__beat)
    window.__beat = setInterval(() => {
      const now = performance.now()
      if (now - last > 50) window.__gaps.push([last, now - last])
      last = now
    }, 5)
  })
  const settle = async () => {
    await h.waitForFunction(() => {
      const last = window.__gaps.at(-1)
      return performance.now() - Math.max(window.__t0, last ? last[0] + last[1] : 0) > 1000
    }, null, { timeout: 120000, polling: 100 })
    return h.evaluate(() => {
      clearInterval(window.__beat)
      const long = window.__gaps
      return { longest: Math.round(Math.max(0, ...long.map(([, d]) => d))), all: Math.round(long.reduce((a, [, d]) => a + d, 0)), frames: long.length }
    })
  }

  // 1. Opening the note with the big table, from Writing.
  await send('view', 'writing')
  await h.waitForTimeout(2500)
  await watch()
  let stop = await profile(h, process.env.PROF)
  let stopTrace = await trace(h)
  await send('nugget', table)
  await h.waitForFunction(() => [...document.querySelectorAll('.tiptap.ProseMirror table')].some((one) => one.isConnected && one.offsetHeight > 0), null, { timeout: 60000 })
  const opened = await settle()
  await stop()
  await stopTrace()
  await h.screenshot({ path: join(data, 'table-open.png') })
  console.log(`OPEN TABLE  longest blocked ${opened.longest} ms; ${opened.all} ms held in ${opened.frames} stretches over 50 ms`)
  check('opening the note with a big table never blocks the window over 300 ms', opened.longest <= BLOCK_MS, `${opened.longest} ms`)

  // 2. Space on a selected picture.
  await send('nugget', picture)
  await h.waitForFunction(() => document.querySelector('.tiptap.ProseMirror img[src*="assets/"]')?.complete, null, { timeout: 60000 })
  await h.waitForTimeout(2500)
  const img = h.locator('.tiptap.ProseMirror img[src*="assets/"]').first()
  await img.scrollIntoViewIfNeeded()
  await img.click()
  await h.waitForTimeout(800)
  const selected = await h.evaluate(() => { const ed = document.querySelector('.tiptap.ProseMirror')?.editor; return ed?.state.selection.node?.type.name ?? null })
  check('the picture is selected whole', selected === 'image', selected)
  await watch()
  stop = await profile(h, process.env.PROF)
  stopTrace = await trace(h)
  await h.keyboard.press(' ')
  await h.waitForFunction(() => document.querySelectorAll('.mf-look-text [data-word]').length > 0, null, { timeout: 60000 })
  const looked = await settle()
  await stop()
  await stopTrace()
  const words = await h.evaluate(() => document.querySelectorAll('.mf-look-text [data-word]').length)
  const stretched = await h.evaluate(() => [...document.querySelectorAll('.mf-look-text [data-word]')].filter((one) => one.style.transform.startsWith('scaleX(')).length)
  await h.screenshot({ path: join(data, 'picture-look.png') })
  console.log(`SPACE  longest blocked ${looked.longest} ms; ${looked.all} ms held in ${looked.frames} stretches over 50 ms; ${words} words over the picture`)
  check('Space on a selected picture never blocks the window over 300 ms', looked.longest <= BLOCK_MS, `${looked.longest} ms, ${words} words`)
  check('every word is stretched to its box', words > 0 && stretched === words, `${stretched}/${words}`)
  console.log(`frames in ${data}`)
} finally {
  await qa.close?.()
  await electron.close().catch(() => {})
}
done()
