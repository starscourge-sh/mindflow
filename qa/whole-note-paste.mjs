// A whole long note pasted back into itself, emptied: the user's largest note emptied with ⌘A and ⌫, then all of
// it pasted in again as Obsidian puts it on the clipboard (its Markdown as plain text, or HTML with it). Run on a
// COPY of a book (QA_DATA), never the book itself:
//
//   KIND=text QA_DATA=<copy> QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/whole-note-paste.mjs
//
// KIND is `text` (the Markdown alone, as Obsidian's editor copies) or `html` (the note's HTML with its Markdown, as
// a page copies). ⌘A and ⌫ empty the note within 300 ms and one ⌘Z brings all of it back. The paste's first words
// show at the caret within 500 ms, the window draws a frame at least every 100 ms all through it (a key, a scroll, a
// click answered), and all of it is in within 2 s; while it is coming the app's loader says so where the words land,
// and a letter typed meanwhile lands after the paste. The wheel scrolls it; the contents and the count say what the
// page holds; the note holds every letter of the note (compared without line breaks or spaces); one ⌘Z takes the
// paste back out whole; no freeze log, no page errors. The paste is a paste event with the words on it (as
// qa/paste-shapes.mjs sends one): the Mac's own clipboard is never touched. PROF=1: what each plugin's state, passes,
// marks and views cost in each step (⌘A ⌫, ⌘Z, the paste); PROFILE=1: where the page's time went, by function.
import { DatabaseSync } from 'node:sqlite'
import { existsSync, mkdirSync, readdirSync, readFileSync } from 'fs'
import { loadavg } from 'os'
import { join } from 'path'
import { sandbox } from './sandbox-lib.mjs'
import { checks } from './harness.mjs'
import { lineOnShow } from './line-on-show.mjs'

process.env.HALIGTREE_FREEZE_CATCH ??= '1'
const { check, done } = checks()
const ED = '.tiptap.ProseMirror.haligtree-editor:not(.is-line)'
const KIND = process.env.KIND ?? 'text'
const root = process.env.QA_DATA
if (!root) throw new Error('QA_DATA must be a copy of a book')
const shots = join(process.env.QA_SHOTS ?? '/tmp', `whole-note-paste-${KIND}`)
mkdirSync(shots, { recursive: true })
const shelf = existsSync(join(root, 'books.json')) ? JSON.parse(readFileSync(join(root, 'books.json'), 'utf8')) : null
const file = shelf?.last && shelf.last !== 'default' ? join(root, 'books', shelf.last, 'haligtree.db') : join(root, 'haligtree.db')
const ask = (run) => {
  const read = (readOnly) => { const db = new DatabaseSync(file, { readOnly }); try { return run(db) } finally { db.close() } }
  try { return read(true) } catch { return read(false) }
}
const id = ask((db) => db.prepare("select id from captures where status = 'open' and kind = 'note' and body is not null order by length(body) desc limit 1").get()).id
const stored = () => ask((db) => db.prepare('select body from captures where id = ?').get(id)).body
const wait = (ms) => new Promise((next) => setTimeout(next, ms))
const load = () => `load ${loadavg()[0].toFixed(1)}`
const within = (ms, promise) => Promise.race([promise.catch(() => null), wait(ms).then(() => null)])
/**
 * Every letter of a stored note, in order, with no line breaks or spaces: what a person reads, however it is cut
 * into lines. Emoji are left out, whichever way each is kept (an emoji, its character, its `:name:` code: a pasted
 * ❌ becomes an emoji, as it always has), and a link card reads as its address (a line that is only an address
 * becomes a card once pasted, as it always has).
 */
const lettersOf = (body) => {
  const out = []
  const walk = (node) => {
    if (node.text) out.push(node.text)
    if (node.type === 'bookmark') out.push(String(node.attrs?.url ?? node.attrs?.href ?? ''))
    for (const one of node.content ?? []) walk(one)
  }
  walk(typeof body === 'string' ? JSON.parse(body) : body)
  return out.join('').replace(/:[a-zA-Z0-9_+-]+:/g, '').replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}\u{1F3FB}-\u{1F3FF}]/gu, '').replace(/\s+/g, '')
}
const parting = (was, now) => {
  let at = 0
  while (at < was.length && at < now.length && was[at] === now[at]) at++
  return `they part at ${at} of ${was.length} (${now.length} now): was "${was.slice(Math.max(0, at - 40), at + 60)}" now "${now.slice(Math.max(0, at - 40), at + 60)}"`
}
const original = stored()
const letters = lettersOf(original)
console.log(`note ${id.slice(0, 8)}: ${original.length} characters stored, ${letters.length} letters; pasted as ${KIND} (${load()})`)

const page = (target, run, arg) => target.evaluate(([body, arg]) => new Function('ed', 'arg', `return (${body})(ed, arg)`)(window.__wnp, arg), [run.toString(), arg])
const errorsOf = (c) => c.errors.filter((line) => !/ERR_FILE_NOT_FOUND|status of 404/.test(line))

const c = await sandbox({ width: 1300, height: 900, seeded: false })
const h = c.h
try {
  await h.evaluate(() => window.api.haligtree('onboarding:set', { welcomed: new Date().toISOString(), newsSeen: true, welcoming: false, pageHints: false }))
  await h.evaluate(() => window.api.haligtree('settings:set', { sounds: false, hintRate: 0 }))
  const logs = await c.electron.evaluate(({ app }) => app.getPath('logs'))
  const freezes = () => (existsSync(logs) ? readdirSync(logs).filter((name) => /^freeze-/.test(name)) : [])
  const frozeBefore = freezes().length
  await wait(1200)
  await c.send('capture', id)
  await h.waitForFunction((sel) => {
    const ed = [...document.querySelectorAll(sel)].filter((one) => one.editor).sort((a, b) => b.editor.state.doc.childCount - a.editor.state.doc.childCount)[0]
    if (!ed || ed.editor.state.doc.childCount < 1000) return false
    window.__wnp = ed
    return true
  }, ED, { timeout: 90000 })
  await wait(2500)
  // What a person copies out of Obsidian: the note's Markdown (and, for `html`, its HTML too), made by the note's own editor.
  const made = await page(h, (ed, kind) => {
    const { editor } = ed
    window.__wnpWords = { text: editor.storage.markdown.manager.serialize(editor.getJSON()), html: kind === 'html' ? editor.getHTML() : '' }
    const nav = document.querySelector('nav[aria-label="Document outline"]')
    return { blocks: editor.state.doc.childCount, text: window.__wnpWords.text.length, html: window.__wnpWords.html.length, outline: nav ? nav.querySelectorAll('[data-level]').length : -1, count: document.querySelector('.tiptap-word-count')?.textContent ?? '' }
  }, KIND)
  console.log(`(open: ${made.blocks} blocks; the copy is ${made.text} characters of Markdown${KIND === 'html' ? ` and ${made.html} of HTML` : ''}; the contents list ${made.outline} headings; count "${made.count}")`)

  // What each plugin costs, by step (PROF=1): its state worked out, the passes it adds to a change, its marks, its view.
  await page(h, (ed) => {
    const { editor } = ed
    const { view } = editor
    const cost = (window.__wnpCost = {})
    window.__wnpPhase = ''
    const add = (kind, name, ms) => {
      if (!window.__wnpPhase) return
      const phase = (cost[window.__wnpPhase] ??= {})
      const one = (phase[`${kind} ${name}`] ??= { ms: 0, n: 0 })
      one.ms += ms
      one.n++
    }
    const timed = (kind, name, fn) => function (...args) {
      const from = performance.now()
      try { return fn.apply(this, args) } finally { add(kind, name, performance.now() - from) }
    }
    for (const field of editor.state.config.fields) field.apply = timed('state', field.name, field.apply)
    for (const plugin of editor.state.plugins) {
      if (plugin.spec.appendTransaction) plugin.spec.appendTransaction = timed('passes', plugin.key, plugin.spec.appendTransaction)
      if (plugin.props.decorations) plugin.props.decorations = timed('marks', plugin.key, plugin.props.decorations)
    }
    const viewed = editor.state.plugins.filter((plugin) => plugin.spec.view)
    view.pluginViews.forEach((one, i) => one.update && (one.update = timed('view', viewed[i]?.key ?? i, one.update.bind(one))))
    const proto = Object.getPrototypeOf(editor.state)
    proto.applyTransaction = timed('all', 'the change and what is added to it', proto.applyTransaction)
    view.updateState = timed('all', 'drawing it', view.updateState.bind(view))
    editor.emit = timed('all', 'events', editor.emit.bind(editor))
  })
  const profiler = process.env.PROFILE ? await h.context().newCDPSession(h) : null
  if (profiler) (await profiler.send('Profiler.enable'), await profiler.send('Profiler.setSamplingInterval', { interval: 500 }))
  /** A step timed and broken down: the page's own costs (PROF=1) and the profiler's (PROFILE=1). */
  const phase = async (name, run) => {
    await page(h, (_ed, phase) => void (window.__wnpPhase = phase), name)
    if (profiler) await profiler.send('Profiler.start')
    const out = await run()
    await page(h, () => void (window.__wnpPhase = ''))
    if (profiler) {
      const { profile } = await profiler.send('Profiler.stop')
      const self = new Map()
      const byId = new Map(profile.nodes.map((node) => [node.id, node]))
      const parentOf = new Map()
      for (const node of profile.nodes) for (const child of node.children ?? []) parentOf.set(child, node)
      const step = (profile.endTime - profile.startTime) / Math.max(1, profile.samples.length)
      const named = (f) => `${f.functionName || '(anonymous)'} ${String(f.url).replace(/^.*\//, '')}:${f.lineNumber + 1}:${f.columnNumber + 1}`
      // Each function's own time, and (for the costliest) the chains of callers its time came through.
      const through = new Map()
      for (const id of profile.samples) {
        const node = byId.get(id)
        const key = named(node.callFrame)
        self.set(key, (self.get(key) ?? 0) + step / 1000)
        const chain = []
        for (let up = parentOf.get(node.id); up && chain.length < 9; up = parentOf.get(up.id)) if (up.callFrame.url) chain.push(named(up.callFrame))
        const paths = through.get(key) ?? new Map()
        paths.set(chain.join(' < '), (paths.get(chain.join(' < ')) ?? 0) + step / 1000)
        through.set(key, paths)
      }
      console.log(`  profile of ${name}, self time (${Math.round((profile.endTime - profile.startTime) / 1000)} ms sampled):`)
      for (const [key, ms] of [...self].sort((a, b) => b[1] - a[1]).slice(0, 16)) {
        console.log(`  ${ms.toFixed(0).padStart(7)} ms  ${key}`)
        if (ms < 100 || /^\((idle|program|garbage collector)\)/.test(key)) continue
        for (const [chain, part] of [...through.get(key)].sort((a, b) => b[1] - a[1]).slice(0, 2)) console.log(`           ${part.toFixed(0)} ms through ${chain || '(the page itself)'}`)
      }
    }
    if (process.env.PROF) {
      const rows = await page(h, (_ed, name) => Object.entries(window.__wnpCost[name] ?? {}).sort((a, b) => b[1].ms - a[1].ms).slice(0, 18), name)
      console.log(`  costs in ${name}:`)
      for (const [key, one] of rows) console.log(`  ${one.ms.toFixed(1).padStart(8)} ms  ${String(one.n).padStart(4)}x  ${key}`)
    }
    return out
  }

  // ⌘A and ⌫, with the keys, the caret put in the note by a press on a line on show (a list's too: one long list can
  // fill the screen of a note opened where it was left).
  const spot = await page(h, lineOnShow)
  if (!check('a line of the note is on show to press in', !spot.none, spot.none ? JSON.stringify(spot.none) : `block ${spot.index + 1}: "${spot.words}"`)) throw new Error('nothing to press')
  await h.mouse.click(spot.x, spot.y)
  await wait(400)
  const isEmpty = () => h.waitForFunction(() => {
    const { doc } = window.__wnp.editor.state
    return doc.childCount <= 2 && !doc.textContent.trim()
  }, null, { timeout: 60000, polling: 'raf' })
  const empty = async () => {
    const from = Date.now()
    await h.keyboard.press('Meta+a')
    await h.keyboard.press('Backspace')
    return within(60000, isEmpty().then(() => Date.now() - from))
  }
  const emptied = await phase('⌘A ⌫', empty)
  check('⌘A and ⌫ empty the note within 300 ms', emptied !== null && emptied <= 300, emptied === null ? 'not within 60 s' : `${emptied} ms (${load()})`)
  await wait(800)
  const back = await phase('⌘Z', async () => {
    const from = Date.now()
    await h.keyboard.press('Meta+z')
    return within(60000, h.waitForFunction((blocks) => window.__wnp.editor.state.doc.childCount >= blocks, made.blocks, { timeout: 60000, polling: 'raf' }).then(() => Date.now() - from))
  })
  const whole = back === null ? '' : lettersOf(await page(h, (ed) => ed.editor.getJSON()))
  check('one ⌘Z brings the whole note back', back !== null && whole === letters, back === null ? 'not within 60 s' : whole === letters ? `${back} ms, ${whole.length} letters (${load()})` : parting(letters, whole))
  await wait(800)
  if ((await empty()) === null) throw new Error('the note did not empty again')
  await wait(1500)

  // The page's own clock through the paste: every frame, when the first words show, the loader, and when all is in.
  await page(h, (ed) => {
    const { editor } = ed
    const { view } = editor
    const log = (window.__wnpLog = { frames: [], long: [], start: 0, landed: 0, firstScreen: 0, loader: 0, loaderWords: '', allIn: 0 })
    let scroller = ed.parentElement
    while (scroller && !/auto|scroll/.test(getComputedStyle(scroller).overflowY)) scroller = scroller.parentElement
    // Words of the note on the screen: a drawn block with words across the scroller's box (the loader is not words).
    window.__wnpOnScreen = () => {
      const box = scroller.getBoundingClientRect()
      let shown = 0
      for (const el of ed.children) {
        if (el.hasAttribute('data-off') || el.hasAttribute('data-paste-loader')) continue
        const r = el.getBoundingClientRect()
        if (r.bottom > box.top && r.top < box.bottom && r.height > 0 && el.textContent.trim()) shown++
      }
      return shown
    }
    // Still coming: the paste's own state says where the rest lands (a build that lands it whole has none).
    const coming = () => editor.state.plugins.find((one) => String(one.key).startsWith('pasteInPieces'))?.getState(editor.state)
    window.__wnpComing = () => !!coming()
    const beat = () => {
      const now = performance.now()
      log.frames.push(now)
      if (log.landed && !log.firstScreen && window.__wnpOnScreen() > 0) log.firstScreen = now
      const loader = ed.querySelector('[data-paste-loader]')
      if (loader && !log.loader) {
        const r = loader.getBoundingClientRect()
        const box = scroller.getBoundingClientRect()
        if (r.height > 0 && r.bottom > box.top && r.top < box.bottom && loader.querySelector('.mf-shimmer')) ((log.loader = now), (log.loaderWords = loader.textContent.trim()))
      }
      if (log.landed && !log.allIn && !coming()) log.allIn = now
      if (now - log.start < 9000 || (!log.allIn && now - log.start < 60000)) requestAnimationFrame(beat)
    }
    try {
      new PerformanceObserver((list) => {
        // Each long frame's script time and its drawing (style, layout, paint) told apart.
        for (const one of list.getEntries()) if (one.duration > 100) log.long.push({ at: one.startTime, ms: one.duration, drawing: one.renderStart ? one.startTime + one.duration - one.renderStart : 0, layout: one.styleAndLayoutStart ? one.startTime + one.duration - one.styleAndLayoutStart : 0, scripts: (one.scripts ?? []).filter((s) => s.duration > 20).map((s) => `${Math.round(s.duration)}ms ${s.invoker} ${s.sourceFunctionName || ''} ${String(s.sourceURL).replace(/^.*\//, '')}:${s.sourceCharPosition}`) })
      }).observe({ type: 'long-animation-frame' })
    } catch {}
    window.__wnpGo = () => {
      log.start = performance.now()
      requestAnimationFrame(beat)
      const data = new DataTransfer()
      data.setData('text/plain', window.__wnpWords.text)
      if (window.__wnpWords.html) data.setData('text/html', window.__wnpWords.html)
      view.dom.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }))
      log.landed = performance.now()
    }
  })

  const shot = (n, at) => within(8000, h.screenshot({ path: join(shots, `${String(n).padStart(3, '0')}-${String(at).padStart(5, '0')}ms.jpg`), type: 'jpeg', quality: 60, scale: 'css' }))
  let typed = null
  await phase('the paste', async () => {
    await page(h, () => void setTimeout(() => window.__wnpGo(), 50))
    // Frames through the paste and after it, every 50 ms or as fast as the window gives them.
    const started = Date.now()
    let n = 0
    while (Date.now() - started < 6000 || !typed) {
      if (Date.now() - started > 60000) break
      await shot(n++, Date.now() - started)
      const state = await within(8000, page(h, () => ({ shown: !!window.__wnpLog.firstScreen, coming: window.__wnpComing() })))
      // A letter with the keys once the first words show: while the rest is still coming, where a build has it come.
      if (!typed && state?.shown) {
        await within(15000, h.keyboard.type('z'))
        typed = { at: Date.now() - started, coming: state.coming }
      }
      await wait(30)
    }
    await within(60000, h.waitForFunction(() => !!window.__wnpLog.allIn, null, { timeout: 60000 }))
  })
  const log = await page(h, () => window.__wnpLog)
  const landed = log.landed - log.start
  const firstScreen = log.firstScreen ? log.firstScreen - log.start : null
  const allIn = log.allIn ? log.allIn - log.start : null
  // Frames from the paste's start to the first after all is in: the longest stretch with none is how long the window could not answer.
  const beats = [0, ...log.frames.map((one) => one - log.start)]
  const through = beats.filter((one, i) => !allIn || one <= allIn || beats[i - 1] <= allIn)
  const gaps = through.slice(1).map((one, i) => one - through[i])
  const longest = Math.max(0, ...gaps)
  console.log(`(the paste event took ${Math.round(landed)} ms; first words ${firstScreen === null ? 'never' : `${Math.round(firstScreen)} ms`}; all in ${allIn === null ? 'never' : `${Math.round(allIn)} ms`}; ${gaps.length} frames to then, ${gaps.filter((one) => one > 100).length} over 100 ms; ${load()})`)
  for (const one of log.long.slice(0, 8)) console.log(`  long frame ${Math.round(one.ms)} ms at +${Math.round(one.at - log.start)} (drawing ${Math.round(one.drawing)} ms, of it style and layout ${Math.round(one.layout)} ms): ${one.scripts.join(' | ')}`)
  const sum = (key) => Math.round(log.long.reduce((all, one) => all + (one[key] ?? 0), 0))
  console.log(`(${log.long.length} long frames, ${sum('ms')} ms in all: drawing ${sum('drawing')} ms, of it style and layout ${sum('layout')} ms)`)
  check('the paste shows its first words at the caret within 500 ms', firstScreen !== null && firstScreen <= 500, `${firstScreen === null ? 'never drawn in 9 s' : `${Math.round(firstScreen)} ms`} (${load()})`)
  check('the window draws a frame at least every 100 ms all through the paste', longest <= 100, `longest ${Math.round(longest)} ms between frames, ${gaps.filter((one) => one > 100).length} over 100 ms`)
  check('all of the paste is in within 2 s', allIn !== null && allIn <= 2000, allIn === null ? 'not within 9 s' : `${Math.round(allIn)} ms`)
  check('while it comes the app\'s loader says so where the words land', !typed?.coming || (!!log.loader && /pasting/i.test(log.loaderWords)), typed?.coming ? (log.loader ? `"${log.loaderWords}" from ${Math.round(log.loader - log.start)} ms` : 'no loader on the screen') : 'it came in one go')
  const after = await page(h, (ed) => {
    const { selection, doc } = ed.editor.state
    const view = ed.editor.view
    let box = ed.parentElement
    while (box && !/auto|scroll/.test(getComputedStyle(box).overflowY)) box = box.parentElement
    const r = (box ?? document.documentElement).getBoundingClientRect()
    const caret = view.coordsAtPos(selection.head)
    const nav = document.querySelector('nav[aria-label="Document outline"]')
    let headings = 0
    doc.forEach((node) => void (node.type.name === 'heading' && headings++))
    return { blocks: doc.childCount, long: ed.hasAttribute('data-long'), onScreen: window.__wnpOnScreen(), caretShown: caret.top >= r.top && caret.bottom <= r.bottom, headings, outline: nav ? nav.querySelectorAll('[data-level]').length : -1, count: document.querySelector('.tiptap-word-count')?.textContent ?? '', loaders: ed.querySelectorAll('[data-paste-loader]').length }
  })
  console.log(`(after: ${after.blocks} blocks, ${after.onScreen} drawn on the screen, the contents list ${after.outline} of ${after.headings} headings; count "${after.count}")`)
  // What the paste made of the note's emoji and Obsidian pictures, once the pictures have been looked for.
  await wait(1500)
  const kinds = (doc) => {
    const n = { emoji: 0, waiting: 0, missing: 0, pictures: 0 }
    const walk = (node) => {
      if (node.type === 'emoji') n.emoji++
      if (node.type === 'imagePlaceholder') node.attrs?.missing ? n.missing++ : node.attrs?.embed && n.waiting++
      if (node.type === 'image') n.pictures++
      for (const one of node.content ?? []) walk(one)
    }
    walk(typeof doc === 'string' ? JSON.parse(doc) : doc)
    return n
  }
  const now = await page(h, (ed) => ed.editor.getJSON())
  console.log(`(the note before: ${JSON.stringify(kinds(original))}; after the paste: ${JSON.stringify(kinds(now))})`)
  await h.screenshot({ path: join(shots, 'after-paste.png') })
  check('after the paste the note is long again, words on the screen, no loader left', after.long && after.onScreen > 0 && !after.loaders, JSON.stringify({ long: after.long, onScreen: after.onScreen, loaders: after.loaders }))
  check('the caret is on the screen', after.caretShown)
  const onPage = lettersOf(now)
  check('a letter typed while the paste came lands after it, in order', !!typed && onPage === letters + 'z', !typed ? 'the paste never showed' : onPage === letters + 'z' ? `typed ${typed.at} ms in${typed.coming ? ', while it came' : ', after it was all in'}` : parting(letters + 'z', onPage))
  const outline = await within(8000, h.waitForFunction((count) => document.querySelector('nav[aria-label="Document outline"]')?.querySelectorAll('[data-level]').length === count, made.outline, { timeout: 8000 }).then(() => made.outline))
  check('the contents list the note\'s headings as before it was emptied', outline === made.outline, `${made.outline} before, ${outline ?? `${after.outline} (not within 8 s)`} after`)
  // The words the count says, as the note's own did before it was emptied: never left at what had come so far. Within
  // a few in a thousand (the letter typed is a word more or joins the last; the HTML's emoji and cards read a little differently).
  const words = (count) => Number(/([\d,]+) words/.exec(count)?.[1].replace(/,/g, '') ?? NaN)
  const counted = await within(8000, h.waitForFunction((was) => {
    const now = Number(/([\d,]+) words/.exec(document.querySelector('.tiptap-word-count')?.textContent ?? '')?.[1].replace(/,/g, '') ?? NaN)
    return Math.abs(now - was) <= Math.max(2, was * 0.0005) && now
  }, words(made.count), { timeout: 8000 }).then((one) => one.jsonValue()))
  check('the count says what the page holds, as the note\'s own did', counted !== null, `"${made.count}" before it was emptied, "${await page(h, () => document.querySelector('.tiptap-word-count')?.textContent ?? '')}" after`)

  // The wheel takes the note up: words drawn wherever it goes. Told by the block at the top of the screen (the
  // scroll itself moves as the note puts the space kept above right, by design: long-document.ts `rest`).
  const topBlock = (ed) => {
    let box = ed.parentElement
    while (box && !/auto|scroll/.test(getComputedStyle(box).overflowY)) box = box.parentElement
    const r = box.getBoundingClientRect()
    const all = [...ed.children]
    const first = all.findIndex((el) => !el.hasAttribute('data-off') && el.getBoundingClientRect().bottom > r.top + 1)
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), first, onScreen: window.__wnpOnScreen() }
  }
  const box = await page(h, topBlock)
  await h.mouse.move(box.x, box.y)
  for (let i = 0; i < 6; i++) (await h.mouse.wheel(0, -1500), await wait(120))
  await wait(800)
  const up = await page(h, topBlock)
  await h.screenshot({ path: join(shots, 'wheeled-up.png') })
  check('the wheel scrolls the pasted note up, words drawn where it goes', up.first >= 0 && up.first < box.first && up.onScreen > 0, `the block at the top of the screen was ${box.first + 1}, then ${up.first + 1}; ${up.onScreen} blocks with words on the screen`)

  // Stored: every letter of the note, and the one typed after it.
  let kept = ''
  const saving = Date.now()
  while (Date.now() - saving < 40000) {
    kept = lettersOf(stored())
    if (kept === letters + 'z') break
    await wait(500)
  }
  check('the stored note holds every letter of the note, and the one typed after it', kept === letters + 'z', kept === letters + 'z' ? `${kept.length} letters` : parting(letters + 'z', kept))

  // ⌘Z: the letter typed (a change of its own once the paste was in), then the whole paste in one step, never part of it.
  const steps = []
  // What Undo holds, and what the note holds: what each ⌘Z took back is told by the difference.
  const held = () => page(h, (ed) => {
    const { state } = ed.editor
    const history = state.plugins.find((one) => String(one.key).startsWith('history'))?.getState(state)
    const n = { steps: history?.done?.eventCount ?? -1, blocks: state.doc.childCount, pictures: 0, waiting: 0, cards: 0, letters: state.doc.textContent.length }
    state.doc.descendants((node) => void (node.type.name === 'image' ? n.pictures++ : node.type.name === 'imagePlaceholder' ? n.waiting++ : node.type.name === 'bookmark' && n.cards++))
    return n
  })
  console.log(`(before ⌘Z: ${JSON.stringify(await held())})`)
  for (let i = 0; i < 3; i++) {
    const was = await page(h, (ed) => ed.editor.state.doc.textContent.length)
    const from = Date.now()
    await h.keyboard.press('Meta+z')
    await within(30000, h.waitForFunction((was) => window.__wnp.editor.state.doc.textContent.length !== was, was, { timeout: 30000, polling: 'raf' }))
    const left = lettersOf(await page(h, (ed) => ed.editor.getJSON()))
    steps.push({ ms: Date.now() - from, left: left.length })
    console.log(`(after ⌘Z ${i + 1}: ${JSON.stringify(await held())})`)
    if (!left.length) break
  }
  const out = steps.findIndex((one) => !one.left)
  check('one ⌘Z takes the whole paste back out', out >= 0 && steps.slice(0, out).every((one) => one.left >= letters.length), steps.map((one) => `${one.left} letters left after ${one.ms} ms`).join(', '))
  check('no freeze log', freezes().length === frozeBefore, freezes().slice(frozeBefore).join(', '))
  check('no page errors', !errorsOf(c).length, errorsOf(c).slice(0, 3).join(' | '))
  console.log(`(frames in ${shots})`)
} catch (error) {
  check('ran without throwing', false, String(error?.stack ?? error).slice(0, 600))
} finally {
  await c.close()
}
done()
