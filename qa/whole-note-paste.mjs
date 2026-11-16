// A whole long note pasted back into itself, emptied: the user's largest note emptied with ⌘A and ⌫, then all of
// it pasted in again as Obsidian puts it on the clipboard (its Markdown as plain text, or HTML with it). Run on a
// COPY of a book (QA_DATA), never the book itself:
//
//   KIND=text QA_DATA=<copy> QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/whole-note-paste.mjs
//
// KIND is `text` (the Markdown alone, as Obsidian's editor copies) or `html` (the note's HTML with its Markdown, as
// a page copies). The paste lands and its first screen is drawn at the caret within 2 s, no stretch of the window
// frozen over 500 ms, no freeze log; a letter typed straight after lands at the caret; the wheel scrolls it; the
// contents and the count say what the page holds; the stored note holds every letter of the note (compared without
// line breaks or spaces). The paste is a paste event with the words on it (as qa/paste-shapes.mjs sends one): the
// Mac's own clipboard is never touched. Each appended transaction's steps and time are written out (`SHOW=1` for all).
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
    return { blocks: editor.state.doc.childCount, text: window.__wnpWords.text.length, html: window.__wnpWords.html.length, outline: nav ? nav.querySelectorAll('[data-level]').length : -1 }
  }, KIND)
  console.log(`(open: ${made.blocks} blocks; the copy is ${made.text} characters of Markdown${KIND === 'html' ? ` and ${made.html} of HTML` : ''}; the contents list ${made.outline} headings)`)

  // ⌘A and ⌫, with the keys, the caret put in the note by a press on a line on show (a list's too: one long list can
  // fill the screen of a note opened where it was left).
  const spot = await page(h, lineOnShow)
  if (!check('a line of the note is on show to press in', !spot.none, spot.none ? JSON.stringify(spot.none) : `block ${spot.index + 1}: "${spot.words}"`)) throw new Error('nothing to press')
  await h.mouse.click(spot.x, spot.y)
  await wait(400)
  const emptying = Date.now()
  await h.keyboard.press('Meta+a')
  await h.keyboard.press('Backspace')
  const emptied = await within(60000, h.waitForFunction(() => {
    const { doc } = window.__wnp.editor.state
    return doc.childCount <= 2 && !doc.textContent.trim()
  }, null, { timeout: 60000 }).then(() => Date.now() - emptying))
  check('⌘A and ⌫ empty the note', emptied !== null, emptied === null ? 'not within 60 s' : `${emptied} ms (${load()})`)
  await wait(1500)

  // The page's own clock through the paste: every frame, every appended transaction, every long frame and its scripts.
  await page(h, (ed) => {
    const { editor } = ed
    const { view } = editor
    // Each timed piece with when it ended, from the paste's start: what ends before the paste has landed is the paste's.
    const log = (window.__wnpLog = { appended: [], timed: [], frames: [], long: [], start: 0, landed: 0, firstScreen: 0 })
    let on = true
    const time = (kind, fn) => function (...args) {
      if (!on || !log.start) return fn.apply(this, args)
      const from = performance.now()
      try { return fn.apply(this, args) } finally { log.timed.push({ kind: kind === 'emit' ? `event ${args[0]}` : kind, ms: performance.now() - from, end: performance.now() - log.start }) }
    }
    for (const plugin of editor.state.plugins) {
      const spec = plugin.spec
      if (!spec.appendTransaction) continue
      const inner = spec.appendTransaction
      const name = `${plugin.key} ${String(inner).replace(/\s+/g, ' ').slice(0, 70)}`
      spec.appendTransaction = function (trs, before, after) {
        const from = performance.now()
        const out = inner.call(this, trs, before, after)
        if (on && log.start) log.appended.push({ name, ms: performance.now() - from, end: performance.now() - log.start, given: trs.reduce((n, tr) => n + tr.steps.length, 0), trs: trs.length, added: out ? out.steps.length : 0, kinds: out ? [...new Set(out.steps.map((step) => step.constructor.name))].join(' ') : '' })
        return out
      }
    }
    const proto = Object.getPrototypeOf(editor.state)
    proto.applyTransaction = time('the transaction and those added to it', proto.applyTransaction)
    view.updateState = time('drawing it', view.updateState.bind(view))
    view.dispatch = time('dispatch', view.dispatch.bind(view))
    editor.emit = time('emit', editor.emit.bind(editor))
    let scroller = ed.parentElement
    while (scroller && !/auto|scroll/.test(getComputedStyle(scroller).overflowY)) scroller = scroller.parentElement
    // Whether words of the note are on the screen: a drawn block with words across the scroller's box.
    window.__wnpOnScreen = () => {
      const box = scroller.getBoundingClientRect()
      let shown = 0
      for (const el of ed.children) {
        if (el.hasAttribute('data-off')) continue
        const r = el.getBoundingClientRect()
        if (r.bottom > box.top && r.top < box.bottom && r.height > 0 && el.textContent.trim()) shown++
      }
      return shown
    }
    const beat = () => {
      log.frames.push(performance.now())
      if (log.landed && !log.firstScreen && window.__wnpOnScreen() > 0) log.firstScreen = performance.now()
      if (performance.now() - log.start < 9000) requestAnimationFrame(beat)
      else on = false
    }
    try {
      new PerformanceObserver((list) => {
        for (const one of list.getEntries()) if (one.duration > 100) log.long.push({ at: one.startTime, ms: one.duration, scripts: (one.scripts ?? []).filter((s) => s.duration > 20).map((s) => `${Math.round(s.duration)}ms ${s.invoker} ${s.sourceFunctionName || ''} ${String(s.sourceURL).replace(/^.*\//, '')}:${s.sourceCharPosition}`) })
      }).observe({ type: 'long-animation-frame' })
    } catch {}
    setTimeout(() => {
      log.start = performance.now()
      requestAnimationFrame(beat)
      const data = new DataTransfer()
      data.setData('text/plain', window.__wnpWords.text)
      if (window.__wnpWords.html) data.setData('text/html', window.__wnpWords.html)
      view.dom.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }))
      log.landed = performance.now()
    }, 50)
  })

  // PROFILE=1: where the page's time went from the paste to 12 s after it, by function (self time), from Chrome's profiler.
  const profiler = process.env.PROFILE ? await h.context().newCDPSession(h) : null
  if (profiler) (await profiler.send('Profiler.enable'), await profiler.send('Profiler.setSamplingInterval', { interval: 500 }), await profiler.send('Profiler.start'))
  // Frames through the paste and after it, every 50 ms or as fast as the window gives them.
  const started = Date.now()
  let n = 0
  let typed = null
  let pasteText = null
  while (Date.now() - started < 7000 || !typed) {
    if (Date.now() - started > 60000) break
    const at = Date.now() - started
    await within(8000, h.screenshot({ path: join(shots, `${String(n++).padStart(3, '0')}-${String(at).padStart(5, '0')}ms.jpg`), type: 'jpeg', quality: 60, scale: 'css' }))
    const state = await within(8000, page(h, () => ({ landed: !!window.__wnpLog.landed, shown: window.__wnpLog.firstScreen })))
    // A letter straight after the paste lands, with the keys.
    if (!typed && state?.landed) {
      const before = await page(h, (ed) => {
        const { selection, doc } = ed.editor.state
        return { index: selection.$head.index(0), offset: selection.$head.parentOffset, text: selection.$head.parent.textContent, blocks: doc.childCount, json: JSON.stringify(ed.editor.getJSON()) }
      })
      pasteText = before.json
      delete before.json
      await within(15000, h.keyboard.type('z'))
      typed = { before, at: Date.now() - started }
    }
    await wait(30)
  }
  if (profiler) {
    while (Date.now() - started < 12000) await wait(200)
    const { profile } = await profiler.send('Profiler.stop')
    const self = new Map()
    const byId = new Map(profile.nodes.map((node) => [node.id, node]))
    const step = (profile.endTime - profile.startTime) / Math.max(1, profile.samples.length)
    for (const id of profile.samples) {
      const { callFrame: f } = byId.get(id)
      const key = `${f.functionName || '(anonymous)'} ${String(f.url).replace(/^.*\//, '')}:${f.lineNumber + 1}`
      self.set(key, (self.get(key) ?? 0) + step / 1000)
    }
    console.log(`  profile, self time from the paste to 12 s after (${Math.round((profile.endTime - profile.startTime) / 1000)} ms sampled):`)
    for (const [key, ms] of [...self].sort((a, b) => b[1] - a[1]).slice(0, 28)) console.log(`  ${ms.toFixed(0).padStart(7)} ms  ${key}`)
  }
  const log = await page(h, () => window.__wnpLog)
  const landed = log.landed - log.start
  // Frames from the paste's start: the longest stretch with none is how long the window was frozen.
  const beats = [0, ...log.frames.map((one) => one - log.start)]
  const gaps = beats.slice(1).map((one, i) => one - beats[i])
  const longest = Math.max(0, ...gaps)
  const firstScreen = log.firstScreen ? log.firstScreen - log.start : null
  const inPaste = (one) => one.end <= landed + 0.5
  const sum = (list, kind) => Math.round(list.filter((one) => one.kind === kind).reduce((n, one) => n + one.ms, 0))
  const pasteTimed = log.timed.filter(inPaste)
  console.log(`(the paste landed ${Math.round(landed)} ms after it began, in one task; of it: dispatch ${sum(pasteTimed, 'dispatch')} ms, of which the transaction and those added to it ${sum(pasteTimed, 'the transaction and those added to it')} ms, drawing ${sum(pasteTimed, 'drawing it')} ms; reading the words in the rest; ${load()})`)
  const table = (list, said) => {
    const byPass = new Map()
    for (const one of list) {
      const was = byPass.get(one.name) ?? { calls: 0, ms: 0, given: 0, added: 0, kinds: new Set() }
      if (one.kinds) one.kinds.split(' ').forEach((kind) => was.kinds.add(kind))
      byPass.set(one.name, { calls: was.calls + 1, ms: was.ms + one.ms, given: Math.max(was.given, one.given), added: was.added + one.added, kinds: was.kinds })
    }
    console.log(`  ${said}: ${list.length} calls, ${Math.round(list.reduce((n, one) => n + one.ms, 0))} ms in all`)
    for (const [name, one] of [...byPass].sort((a, b) => b[1].ms - a[1].ms).filter(([, one], i) => process.env.SHOW || i < 10 || one.added)) console.log(`  ${one.ms.toFixed(1).padStart(8)} ms  ${String(one.calls).padStart(2)} calls  given up to ${String(one.given).padStart(5)} steps  added ${String(one.added).padStart(5)} ${[...one.kinds].join(' ')}  ${name}`)
  }
  table(log.appended.filter(inPaste), 'passes added to the paste\'s own change')
  table(log.appended.filter((one) => !inPaste(one)), 'passes added to the changes after it, to 9 s')
  const later = log.timed.filter((one) => !inPaste(one) && one.kind === 'dispatch')
  console.log(`  later changes: ${later.length}, the longest ${Math.round(Math.max(0, ...later.map((one) => one.ms)))} ms`)
  for (const one of log.long.slice(0, 10)) console.log(`  long frame ${Math.round(one.ms)} ms at +${Math.round(one.at - log.start)}: ${one.scripts.join(' | ')}`)
  check('the paste lands and its first screen is drawn within 2 s', firstScreen !== null && firstScreen <= 2000, `landed ${Math.round(landed)} ms, first screen ${firstScreen === null ? 'never drawn in 9 s' : `${Math.round(firstScreen)} ms`} (${load()})`)
  check('no stretch of the window frozen over 500 ms', longest <= 500, `longest ${Math.round(longest)} ms between frames; ${gaps.filter((one) => one > 100).length} over 100 ms`)
  const after = await page(h, (ed, at) => {
    const { selection, doc } = ed.editor.state
    const view = ed.editor.view
    let box = ed.parentElement
    while (box && !/auto|scroll/.test(getComputedStyle(box).overflowY)) box = box.parentElement
    const r = box.getBoundingClientRect()
    const caret = view.coordsAtPos(selection.head)
    const nav = document.querySelector('nav[aria-label="Document outline"]')
    let headings = 0
    doc.forEach((node) => void (node.type.name === 'heading' && headings++))
    return { blocks: doc.childCount, long: ed.hasAttribute('data-long'), onScreen: window.__wnpOnScreen(), caretShown: caret.top >= r.top && caret.bottom <= r.bottom, text: doc.maybeChild(at.index)?.textContent ?? null, headings, outline: nav ? nav.querySelectorAll('[data-level]').length : -1, count: document.querySelector('.tiptap-word-count')?.textContent ?? '' }
  }, typed?.before ?? { index: 0 })
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
  check('after the paste the note is long again and words are on the screen', after.long && after.onScreen > 0, JSON.stringify({ long: after.long, onScreen: after.onScreen }))
  check('the caret is on the screen', after.caretShown)
  const wanted = typed ? typed.before.text.slice(0, typed.before.offset) + 'z' + typed.before.text.slice(typed.before.offset) : null
  check('a letter typed straight after the paste lands where the caret is', !!typed && after.text === wanted, typed ? `block ${typed.before.index + 1}, typed ${typed.at} ms in: was "${typed.before.text.slice(-30)}", now "${String(after.text).slice(-30)}"` : 'the paste never landed')
  const outline = await within(8000, h.waitForFunction((count) => document.querySelector('nav[aria-label="Document outline"]')?.querySelectorAll('[data-level]').length === count, made.outline, { timeout: 8000 }).then(() => made.outline))
  check('the contents list the note\'s headings as before it was emptied', outline === made.outline, `${made.outline} before, ${outline ?? `${after.outline} (not within 8 s)`} after`)

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

  // Stored: every letter of the note, and the one typed.
  const pasted = pasteText ? lettersOf(pasteText) : ''
  const plusZ = (a, b) => b === a + 'z' || (b.length === a.length + 1 && b.endsWith('z') && b.slice(0, -1) === a)
  let kept = ''
  const saving = Date.now()
  while (Date.now() - saving < 40000) {
    kept = lettersOf(stored())
    if (plusZ(pasted, kept) || plusZ(letters, kept)) break
    await wait(500)
  }
  check('what landed holds every letter of the note', pasted === letters, pasted === letters ? `${pasted.length} letters` : parting(letters, pasted))
  check('the stored note holds every letter of the note, and the one typed', plusZ(letters, kept), plusZ(letters, kept) ? `${kept.length} letters` : parting(letters + 'z', kept))
  if (!plusZ(letters, kept)) check('the stored note holds every letter that landed, and the one typed', plusZ(pasted, kept), plusZ(pasted, kept) ? `${kept.length} letters` : parting(pasted + 'z', kept))
  check('no freeze log', freezes().length === frozeBefore, freezes().slice(frozeBefore).join(', '))
  check('no page errors', !errorsOf(c).length, errorsOf(c).slice(0, 3).join(' | '))
  console.log(`(frames in ${shots})`)
} catch (error) {
  check('ran without throwing', false, String(error?.stack ?? error).slice(0, 600))
} finally {
  await c.close()
}
done()
