// A press under the last line puts the caret at the end, in every page you write in: a note, a piece of Writing and
// a day's page, each pressed on the bare room in its own box under the last line and on the bare room below it.
//   QA_ARGS=--sandbox QA_DATA=<a copy of the seeded sandbox> QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/press-under-last.mjs
import { DatabaseSync } from 'node:sqlite'
import { existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import { sandbox } from './sandbox-lib.mjs'
import { checks } from './harness.mjs'

const { check, done } = checks()
if (process.env.FILM) mkdirSync(process.env.FILM, { recursive: true })
const root = process.env.QA_DATA
const file = [join(root, 'sandbox', 'haligtree.db'), join(root, 'haligtree.db')].find((one) => existsSync(one))
const db = new DatabaseSync(file, { readOnly: true })
// A note and a piece of Writing of a few paragraphs: room under them on the screen.
const note = db.prepare("select id from captures where status = 'open' and kind = 'note' and body is not null and length(body) between 600 and 4000 order by length(body) desc limit 1").get()
const piece = db.prepare("select id from nuggets where tier = 'article' and binned_at is null and body is not null and length(body) between 600 and 6000 order by length(body) desc limit 1").get()
db.close()

const c = await sandbox({ width: 1300, height: 900 })
const { h, send, go } = c
const wait = (ms) => h.waitForTimeout(ms)

/** The page's editor you write in: the largest one on show. */
const install = () => h.evaluate(() => {
  const ed = () => [...document.querySelectorAll('.tiptap.ProseMirror.haligtree-editor:not(.is-line)')].filter((one) => one.editor && one.isConnected && one.getClientRects().length && !one.closest('[inert], [data-page-held]')).sort((a, b) => b.getBoundingClientRect().height - a.getBoundingClientRect().height)[0]
  window.__under = {
    ed,
    where: () => {
      const e = ed()
      const { selection, doc } = e.editor.state
      return { keys: document.activeElement === e ? 'in the page' : (document.activeElement?.nodeName ?? 'nowhere'), atEnd: selection.empty && selection.head === doc.content.size - selection.$head.depth, head: selection.head, size: doc.content.size }
    },
    // A bare place under the last block: on the editor's own box (inside) or on what holds it, below it (outside).
    spot: (inside) => {
      const e = ed()
      const blocks = [...e.children].filter((one) => one.getClientRects().length && one.getBoundingClientRect().height > 0)
      const bottom = blocks[blocks.length - 1].getBoundingClientRect().bottom
      const x = Math.round(e.getBoundingClientRect().left + e.clientWidth / 2)
      for (let step = 3; step < 400; step += 3) {
        const y = Math.round(bottom + step)
        if (y >= innerHeight - 2) break
        const under = document.elementFromPoint(x, y)
        if (!under || blocks.some((one) => one.contains(under))) continue
        if (inside ? under === e : !e.contains(under) && under.contains(e) === false && under.closest('.haligtree-editor-content, [data-day-write]')) return { x, y, on: `${under.nodeName.toLowerCase()}${typeof under.className === 'string' && under.className ? '.' + under.className.trim().split(/\s+/).slice(0, 2).join('.') : ''}`, from: step }
      }
      return null
    }
  }
})

async function presses(name) {
  await install()
  for (const inside of [true, false]) {
    await h.evaluate(() => window.__under.ed().editor.commands.focus('start'))
    await wait(300)
    const at = await h.evaluate((inside) => window.__under.spot(inside), inside)
    const what = `${name}: a press under the last line, ${inside ? "in the page's own box" : 'in the room below it'}`
    if (!at) { console.log(`(${what}: no bare place there on the screen)`); continue }
    const top = () => h.evaluate(() => { let box = window.__under.ed().parentElement; while (box && !/auto|scroll/.test(getComputedStyle(box).overflowY)) box = box.parentElement; return Math.round(box?.scrollTop ?? 0) })
    const before = await top()
    await h.mouse.click(at.x, at.y)
    // FILM=<folder>: the press filmed, a frame as fast as they come for 200 ms.
    if (process.env.FILM) for (let i = 0, from = Date.now(); Date.now() - from < 200; i++) await h.screenshot({ path: join(process.env.FILM, `${name.replace(/\W+/g, '-')}-${inside ? 'in' : 'below'}-${i}.png`) })
    await wait(400)
    const now = await h.evaluate(() => window.__under.where())
    const after = await top()
    check(`${what}: the caret is at the end and the page did not move`, now.keys === 'in the page' && now.atEnd && after === before, `${at.from}px under, on ${at.on}: the keys ${now.keys}, the caret at ${now.head} of ${now.size}; scrolled ${before} then ${after}`)
  }
}

try {
  await h.evaluate(() => window.api.haligtree('onboarding:set', { welcomed: new Date().toISOString(), newsSeen: true, welcoming: false, pageHints: false }))
  if (note) {
    await send('capture', note.id)
    await wait(1500)
    await presses('A note')
  }
  if (piece) {
    await send('article', piece.id)
    await wait(1500)
    await presses('A piece of Writing')
  }
  await go('day')
  await wait(1200)
  await presses("Today's page")
  check('no page errors', c.errors.filter((line) => !/ERR_FILE_NOT_FOUND|status of 404|NotSameOrigin/.test(line)).length === 0, c.errors.slice(0, 3).join(' | '))
} finally {
  await Promise.race([c.close(), new Promise((next) => setTimeout(next, 8000))])
}
done()
