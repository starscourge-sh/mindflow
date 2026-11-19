// A note's pictures from other sites (a picture whose address is on the web): each one a person scrolls to shows,
// or says why it cannot in the app's own words, never the browser's broken picture. Run on a COPY of a book:
//
//   QA_DATA=<copy> QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/web-pictures.mjs
//
// It opens the note with the most web pictures, shows a few from each site in turn (the note's own scrolling to
// them), waits for each to load or fail, and films each one where it stands.
import { DatabaseSync } from 'node:sqlite'
import { existsSync, mkdirSync, readFileSync } from 'fs'
import { join } from 'path'
import { sandbox } from './sandbox-lib.mjs'
import { checks } from './harness.mjs'

const { check, done } = checks()
const root = process.env.QA_DATA
if (!root) throw new Error('QA_DATA must be a copy of a book')
const shots = join(process.env.QA_SHOTS ?? '/tmp', 'web-pictures')
mkdirSync(shots, { recursive: true })
const shelf = existsSync(join(root, 'books.json')) ? JSON.parse(readFileSync(join(root, 'books.json'), 'utf8')) : null
const file = shelf?.last && shelf.last !== 'default' ? join(root, 'books', shelf.last, 'haligtree.db') : join(root, 'haligtree.db')
const db = new DatabaseSync(file, { readOnly: true })
const rows = db.prepare(`select id, body from captures where status = 'open' and kind = 'note' and body like '%"src":"http%'`).all()
db.close()
const count = (body) => (body.match(/"type":"image","attrs":\{[^}]*"src":"https?:/g) ?? []).length
const best = rows.map((row) => ({ id: row.id, n: count(row.body) })).sort((a, b) => b.n - a.n)[0]
if (!best?.n) throw new Error('no note with a web picture in this book')
console.log(`note ${best.id.slice(0, 8)}: ${best.n} web pictures`)
const wait = (ms) => new Promise((next) => setTimeout(next, ms))

const c = await sandbox({ width: 1300, height: 900, seeded: false })
const h = c.h
try {
  await h.evaluate(() => window.api.haligtree('onboarding:set', { welcomed: new Date().toISOString(), newsSeen: true, welcoming: false, pageHints: false }))
  await h.evaluate(() => window.api.haligtree('settings:set', { sounds: false, hintRate: 0 }))
  await wait(1200)
  await c.send('capture', best.id)
  await h.waitForFunction(() => {
    const ed = [...document.querySelectorAll('.tiptap.ProseMirror.haligtree-editor:not(.is-line):not(.is-plain)')].filter((one) => one.editor).sort((a, b) => b.editor.state.doc.childCount - a.editor.state.doc.childCount)[0]
    if (!ed || ed.editor.state.doc.childCount < 2) return false
    window.__wp = ed
    return true
  }, null, { timeout: 90000 })
  await wait(2000)
  // Up to three pictures from each site, in the note's order.
  const spots = await h.evaluate(() => {
    const per = new Map()
    const out = []
    window.__wp.editor.state.doc.descendants((node, pos) => {
      if (node.type.name !== 'image' || !/^https?:/.test(node.attrs.src ?? '')) return
      const host = new URL(node.attrs.src).host
      if ((per.get(host) ?? 0) >= 3) return
      per.set(host, (per.get(host) ?? 0) + 1)
      out.push({ pos, host })
    })
    return out
  })
  console.log(`(${spots.length} pictures looked at, from ${[...new Set(spots.map((one) => one.host))].join(', ')})`)
  const seen = []
  for (const [n, spot] of spots.entries()) {
    // The caret put beside it and the note scrolled there, as a click in the contents would.
    await h.evaluate((pos) => window.__wp.editor.chain().setTextSelection(pos).scrollIntoView().run(), spot.pos)
    const one = await h.waitForFunction((pos) => {
      const { view } = window.__wp.editor
      const dom = view.nodeDOM(pos)
      if (!dom || !dom.isConnected) return false
      const img = dom.tagName === 'IMG' ? dom : dom.querySelector?.('img')
      if (!img) return false
      // On the screen, as a person scrolled to it: a picture lower down is only asked for once it comes near.
      img.scrollIntoView({ block: 'center' })
      // Settled: drawn, or the app's own face in its place saying why not (haligtree-editor.tsx `missing`), or broken.
      // The face drawn (it stands in the picture's place once the cause is known), and its words then.
      if (img.dataset.missing && img.complete && img.src.startsWith('data:')) return { state: 'said', words: img.alt }
      // Failed, and its error not yet told (it comes a moment after): waited for, as a person sees the face then. One
      // that is still the browser's broken picture when the wait runs out never settled.
      if (!img.complete || !img.naturalWidth) return false
      return { state: 'shown', words: '' }
    }, spot.pos, { timeout: 20000, polling: 200 }).then((handle) => handle.jsonValue()).catch(() => ({ state: 'never settled', words: '' }))
    await wait(400)
    const box = await h.evaluate((pos) => {
      const dom = window.__wp.editor.view.nodeDOM(pos)
      const face = dom?.nextElementSibling?.matches?.('[data-picture-missing]') ? dom.nextElementSibling : null
      const shown = face ?? dom
      shown?.scrollIntoView?.({ block: 'center' })
      const r = shown?.getBoundingClientRect?.()
      if (!r || !r.width || !r.height) return null
      // Kept inside the window: a clip past its edge is refused.
      const x = Math.max(0, r.left - 40)
      const y = Math.max(0, r.top - 40)
      const width = Math.min(innerWidth - x, r.width + 80, 900)
      const height = Math.min(innerHeight - y, Math.max(80, r.height + 80), 700)
      return width > 0 && height > 0 ? { x, y, width, height } : null
    }, spot.pos)
    const path = join(shots, `${String(n).padStart(2, '0')}-${spot.host}-${one.state}.png`)
    await h.screenshot({ path, ...(box ? { clip: box } : {}) })
    seen.push({ ...spot, ...one })
    console.log(`  ${spot.host} at ${spot.pos}: ${one.state}${one.words ? ` ("${one.words}")` : ''}`)
  }
  check('every web picture looked at shows, or says in the app\'s words why it cannot', seen.length > 0 && seen.every((one) => one.state === 'shown' || one.state === 'said'), seen.filter((one) => one.state !== 'shown' && one.state !== 'said').map((one) => `${one.host}: ${one.state}`).join(', '))
  // Why, as its site answered: never "isn't here" for a picture that is there, behind its site's sign-in.
  const said = seen.filter((one) => one.state === 'said')
  check('a web picture not shown says why, as its site answered, naming the site', said.every((one) => one.words.includes(one.host.replace(/^www\./, '')) && !/isn.t here/.test(one.words)), said.map((one) => `"${one.words}"`).join(', ') || 'none needed saying')
  check('no picture refused for coming from another site', !c.errors.some((line) => /NotSameOrigin/.test(line)), c.errors.filter((line) => /NotSameOrigin/.test(line)).slice(0, 2).join(' | '))
  console.log(`(frames in ${shots})`)
} catch (error) {
  check('ran without throwing', false, String(error?.stack ?? error).slice(0, 600))
} finally {
  await c.close()
}
done()
