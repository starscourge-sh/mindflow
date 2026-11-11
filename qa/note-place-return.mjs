// A long note left part way down comes back exactly there, drawn there from its first frame. The user's report
// (11 Nov): reading "Git Deep Dive" at "3. The Four Object Types", opening the next note and clicking back, the note
// scrolled about and sometimes landed higher up ("Pandas Deep Dive" came back at "Index objects", not at
// "3. Data cleaning and transformation"). Their notes are long, with code blocks coloured after drawing, tables and
// pictures that load late.
//
// For each note: scroll a heading about two thirds down to 140px under the top of the pane, open another note, come
// back, and record where that heading is on every frame for 2 seconds (read after each frame is painted). Every frame
// that shows the note must have the heading within 2px of where it was left: no frame at the top, none elsewhere.
//
// Made-up notes (code blocks, tables, pictures that load 0.7 s late), clicked in the list:
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/note-place-return.mjs
// On a copy of a real book (never the real folder; a folder with haligtree.db and assets/), its "Git Deep Dive" and
// "Pandas Deep Dive":
//   QA_BOOK=<copy> QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/note-place-return.mjs
// DEBUG=1 also prints the blocks near the top of the pane whenever they move, and every scroll the page asks for, with where from.
import { cpSync, existsSync } from 'fs'
import { execFileSync } from 'child_process'
import { join } from 'path'
import { checks } from './harness.mjs'

const book = process.env.QA_BOOK
if (book) {
  const data = process.env.QA_DATA
  if (!data) throw new Error('QA_DATA: a fresh folder to copy the book into')
  for (const name of ['haligtree.db', 'haligtree.db-wal', 'haligtree.db-shm']) if (existsSync(join(book, name))) cpSync(join(book, name), join(data, name))
  cpSync(join(book, 'assets'), join(data, 'assets'), { recursive: true })
}
const { sandbox } = await import('./sandbox-lib.mjs')
const { check, done } = checks()
const s = await sandbox({ width: 1300, height: 860, seeded: !book })
const { h, v, send, close } = s
const wait = (ms) => h.waitForTimeout(ms)
if (process.env.DEBUG) { h.on("console", (m) => m.text().startsWith("near") && console.log(m.text())); await h.evaluate(() => {
  window.__debug = true
  const tell = (what) => function (...args) { if (this.classList?.contains('haligtree-editor-content') && window.__near) console.log('near SCROLL', what, JSON.stringify(args).slice(0, 80), new Error().stack.split('\n').slice(2, 9).map((l) => l.trim().replace(/\(.*\/assets\//, '(')).join(' | ')) }
  const desc = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollTop')
  const said = tell('scrollTop=')
  Object.defineProperty(Element.prototype, 'scrollTop', { ...desc, set(v) { said.call(this, v); desc.set.call(this, v) } })
  for (const name of ['scrollTo', 'scrollBy']) { const was = Element.prototype[name]; const say = tell(name); Element.prototype[name] = function (...a) { say.apply(this, a); return was.apply(this, a) } }
  const was = Element.prototype.scrollIntoView; Element.prototype.scrollIntoView = function (...a) { console.log('near SCROLL intoView', this.className?.slice?.(0, 30), new Error().stack.split('\n').slice(2, 7).map((l) => l.trim()).join(' | ')); return was.apply(this, a) }
}) }

/** The pane's note showing these words, its scroller, and where the heading sits in it (px under the scroller's top). */
const findInPage = () => {
  window.__where = (heading) => {
    const one = [...document.querySelectorAll('.tiptap.ProseMirror :is(h1,h2,h3,h4,h5,h6)')].find((el) => el.getClientRects().length && el.textContent.trim().replace(/^H[1-6]/, "") === heading)
    if (!one) return null
    let box = one.parentElement
    while (box && !/(auto|scroll)/.test(getComputedStyle(box).overflowY)) box = box.parentElement
    if (!box) return null
    return { y: Math.round((one.getBoundingClientRect().top - box.getBoundingClientRect().top) * 10) / 10, top: Math.round(box.scrollTop), height: box.scrollHeight }
  }
}

/** Puts the heading `y` px under the top of its scroller, as a person scrolling there would (a wheel turn first). */
async function leaveAt(heading, y) {
  await h.evaluate(findInPage)
  await h.mouse.move(700, 450)
  await h.mouse.wheel(0, 300)
  await wait(300)
  for (let i = 0; i < 6; i++) {
    const ok = await h.evaluate(([heading, y]) => {
      const one = [...document.querySelectorAll('.tiptap.ProseMirror :is(h1,h2,h3,h4,h5,h6)')].find((el) => el.getClientRects().length && el.textContent.trim().replace(/^H[1-6]/, "") === heading)
      if (!one) return false
      let box = one.parentElement
      while (box && !/(auto|scroll)/.test(getComputedStyle(box).overflowY)) box = box.parentElement
      box.scrollTo({ top: box.scrollTop + one.getBoundingClientRect().top - box.getBoundingClientRect().top - y, behavior: 'instant' })
      return true
    }, [heading, y])
    if (!ok) return null
    // Pictures and code colours settle around it; scrolled again until it holds.
    await wait(500)
  }
  await wait(800)
  return h.evaluate((heading) => window.__where(heading), heading)
}

/** From now, where the heading is after each painted frame, for `ms`. */
const record = (heading, ms) => h.evaluate(([heading, ms]) => {
  window.__frames = []; window.__near = null
  const t0 = performance.now()
  const frame = () => {
    if (performance.now() - t0 > ms) return
    requestAnimationFrame(() => {
      // After the frame is painted: what the person saw.
      setTimeout(() => {
        const at = window.__where(heading)
        const title = document.querySelector('.tiptap.ProseMirror')?.textContent?.slice(0, 30) ?? ''
        window.__frames.push({ t: Math.round(performance.now() - t0), ...(at ?? { y: null }), title })
        if (window.__debug) {
          const dom = document.querySelector('.tiptap.ProseMirror')
          const edge = dom?.parentElement?.closest('.haligtree-editor-content')?.getBoundingClientRect().top ?? 0
          const near = [...(dom?.children ?? [])].map((el, i) => [i, el.className.slice(0, 30) || el.tagName, Math.round(el.getBoundingClientRect().top - edge), Math.round(el.getBoundingClientRect().height)]).filter(([, , top, height]) => top + height > -300 && top < 400)
          const was = JSON.stringify(window.__near ?? null)
          if (JSON.stringify(near) !== was) console.log('near', performance.now() - t0 | 0, JSON.stringify(near))
          window.__near = near
        }
        frame()
      })
    })
  }
  frame()
}, [heading, ms])
const frames = async (ms) => { await wait(ms + 300); return h.evaluate(() => window.__frames) }

async function trip({ name, heading, open, openOther }) {
  await open()
  await wait(2500)
  const left = await leaveAt(heading, 140)
  if (!left) return check(`${name}: "${heading}" found`, false, JSON.stringify(await h.evaluate(() => [...document.querySelectorAll('.tiptap.ProseMirror :is(h1,h2,h3,h4,h5,h6)')].slice(0, 5).map((el) => [el.textContent, el.getClientRects().length]))))
  console.log(`${name}: left "${heading}" at y ${left.y} (scrolled ${left.top} of ${left.height})`)
  await openOther()
  if (process.env.DEBUG) { console.log("kept", await h.evaluate(() => localStorage.getItem("note-places"))); await wait(1500); console.log("kept later", await h.evaluate(() => [localStorage.getItem("note-places"), document.querySelectorAll(".tiptap.ProseMirror").length, [...document.querySelectorAll("[data-document]")].map((one) => one.getAttribute("data-document") + ":" + one.getClientRects().length)])) }
  await wait(1500)
  await h.evaluate(findInPage)
  await record(heading, 2000)
  await open()
  const all = await frames(2000)
  const shown = all.filter((one) => one.y !== null)
  const off = shown.filter((one) => Math.abs(one.y - left.y) > 2)
  const first = all.findIndex((one) => one.y !== null)
  // Frames before the note shows hold the other note; a frame of this note with the heading off screen is a miss too.
  const lost = all.slice(first < 0 ? all.length : first).filter((one) => one.y === null)
  console.log(`${name}: ${all.length} frames, ${shown.length} with the heading; y per frame: ${shown.map((one) => one.y).join(' ')}`)
  if (off.length || lost.length) console.log(`  off: ${JSON.stringify([...off, ...lost].slice(0, 12))}`)
  check(`${name}: "${heading}" back at y ${left.y} (within 2px) on every frame from the first`, shown.length > 30 && !off.length && !lost.length, `${off.length} frames off, ${lost.length} frames without it, first ${JSON.stringify(shown[0])}`)
}

try {
  await v('settings:set', { hintRate: 0 })
  await h.evaluate(() => window.api.haligtree('onboarding:set', { welcomed: new Date().toISOString(), newsSeen: true, welcoming: false, pageHints: false }))
  if (book) {
    const sql = (q) => execFileSync('sqlite3', [join(process.env.QA_DATA, 'haligtree.db'), q], { encoding: 'utf8' }).trim()
    const id = (title) => sql(`select id from nuggets where title = '${title}' and binned_at is null limit 1`)
    const other = id('Go Deep Dive')
    await send('view', 'writing')
    await wait(3000)
    for (const [title, heading] of [['Git Deep Dive', '3. The Four Object Types'], ['Pandas Deep Dive', '3. Data cleaning and transformation']]) {
      await trip({ name: title, heading, open: () => send('nugget', id(title)), openOther: () => send('nugget', other) })
    }
  } else {
    // Long notes with what made the user's ones move: code in several languages (coloured after drawing), tables, and pictures that load late.
    const text = (t) => [{ type: 'text', text: t }]
    const p = (t) => ({ type: 'paragraph', content: text(t) })
    const code = (n) => ({ type: 'codeBlock', attrs: { language: ['javascript', 'python', 'bash', 'typescript'][n % 4] }, content: text(Array.from({ length: 8 + (n % 7) }, (_, i) => `const line${i} = compute(${i}, "value ${n}") // step ${i}`).join('\n')) })
    const table = (n) => ({ type: 'table', content: Array.from({ length: 6 }, (_, r) => ({ type: 'tableRow', content: Array.from({ length: 3 }, (_, c) => ({ type: r ? 'tableCell' : 'tableHeader', content: [p(`Row ${r} col ${c} of table ${n}, with words enough to wrap in a narrow cell`)] })) })) })
    const svg = (n) => `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="800" height="${300 + (n % 3) * 60}"><rect width="100%" height="100%" fill="#c9b"/><text x="20" y="40" font-size="30">picture ${n}</text></svg>`)}`
    const body = (title) => {
      const content = []
      for (let n = 0; n < 24; n++) {
        content.push({ type: 'heading', attrs: { level: 2 }, content: text(`${title} part ${n + 1}`) })
        content.push(p(`${title}, part ${n + 1}. Words enough to fill the width of the page and more besides, read slowly.`))
        content.push(code(n))
        if (n % 3 === 0) content.push(table(n))
        if (n % 2 === 0) content.push({ type: 'image', attrs: { src: svg(n), alt: `picture ${n}` } })
        content.push(p('More words after it, as a note goes on.'))
      }
      return { type: 'doc', content }
    }
    // Pictures load late, as the user's do from the web: every picture's address reaches the browser 0.7 s after it is set.
    await h.evaluate(() => {
      const late = (img, set, value) => setTimeout(() => set.call(img, value), 700)
      const attr = Element.prototype.setAttribute
      Element.prototype.setAttribute = function (name, value) { return this instanceof HTMLImageElement && name === 'src' && String(value).startsWith('data:image/svg') ? late(this, (v) => attr.call(this, 'src', v), value) : attr.call(this, name, value) }
      const desc = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src')
      Object.defineProperty(HTMLImageElement.prototype, 'src', { ...desc, set(value) { return String(value).startsWith('data:image/svg') ? late(this, desc.set, value) : desc.set.call(this, value) } })
    })
    await h.evaluate(() => localStorage.setItem('view:article', JSON.stringify({ sort: 'manual', group: 'none', filter: {}, density: 'list' })))
    const groups = await v('groups', 'article')
    const inFolders = new Set(groups.flatMap((one) => one.members))
    const ids = []
    for (const title of ['Heavy One', 'Heavy Two']) { const id = await v('article:new'); await v('item:save', id, { title, body: body(title) }); ids.push(id) }
    const loose = (await v('items', 'article')).filter((one) => !inFolders.has(one.id) && !ids.includes(one.id) && !one.archivedAt).map((one) => one.id)
    await v('groups:arrange', 'article', { top: [...ids, ...groups.filter((one) => !one.parent).map((one) => `g:${one.id}`), ...loose], groups: {} })
    await s.go('articles')
    await wait(900)
    const row = (title) => h.locator('[data-pane] [data-row]', { hasText: title }).first()
    for (const [one, other] of process.env.QA_ONLY ? [] : [["Heavy One", "Heavy Two"], ["Heavy Two", "Heavy One"]]) {
      await trip({ name: `${one} (list)`, heading: `${one} part 17`, open: () => row(one).click(), openOther: () => row(other).click() })
    }
    // And by a link, as the sidebar and ⌘K open a note.
    await trip({ name: 'Heavy One (link)', heading: 'Heavy One part 12', open: () => send('article', ids[0]), openOther: () => send('article', ids[1]) })
  }
} finally {
  await close()
}
done()
