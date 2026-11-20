// Where a join happened, shown (20 Nov: the user joined two "Exam Cliff Notes" and "can't tell what happened? was one
// just deleted? was it appended? how does the app avoid duplicating content?"). On a COPY of a book (QA_DATA): two
// notes that say nearly the same are put in, the one is opened, its offer's "Join them" pressed, and the probe reads:
// a labelled divider in the note, kept with it, naming the other and how many lines came over; the note scrolled to it,
// the lines under it lit a moment; the notice with "Show what came over" and Undo; ⌘Z (its Undo) takes the divider away.
//
//   cp -cR <book> <copy> && npx electron-vite build --outDir out-x
//   QA_DATA=<copy> QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/join-visible.mjs
//   SHOTS=<folder>  frames of the divider, light and dark.
import { DatabaseSync } from 'node:sqlite'
import { existsSync, mkdirSync, readFileSync } from 'fs'
import { join } from 'path'
import { randomUUID } from 'crypto'
import { sandbox } from './sandbox-lib.mjs'
import { checks } from './harness.mjs'

const { check, done } = checks()
const root = process.env.QA_DATA
if (!root) throw new Error('QA_DATA must be a copy of a book')
const shelf = existsSync(join(root, 'books.json')) ? JSON.parse(readFileSync(join(root, 'books.json'), 'utf8')) : null
const file = shelf?.last && shelf.last !== 'default' ? join(root, 'books', shelf.last, 'haligtree.db') : join(root, 'haligtree.db')
const db = new DatabaseSync(file)
const p = (text) => ({ type: 'paragraph', content: [{ type: 'text', text }] })
const shared = ['Exam Cliff Notes', 'Photosynthesis turns light, water and carbon dioxide into sugar and oxygen in the leaf.', 'Mitosis makes two cells the same as the one, meiosis makes four with half the chromosomes.', 'Enzymes speed reactions and are shaped for one job: heat and acid change their shape.', 'Osmosis moves water across a membrane toward the side with more dissolved salt.']
// The two lines only the other has, in words the note holds already, so the two still read as nearly the same.
const extra = ['Enzymes change shape with heat, so reactions slow as the leaf cells get too hot.', 'Meiosis makes the cells with half the chromosomes, and mitosis the cells the same as the one.']
const when = new Date(Date.now() - 86_400_000).toISOString()
const put = (lines) => {
  const id = randomUUID()
  db.prepare("insert into captures (id, title, kind, status, body, captured_at) values (?, '', 'note', 'open', ?, ?)").run(id, JSON.stringify({ type: 'doc', content: lines.map(p) }), when)
  return id
}
const keep = put(shared)
const other = put([...shared.slice(0, 3), extra[0], shared[3], shared[4], extra[1]])
db.close()
const book = () => new DatabaseSync(file, { readOnly: true })
const bodyOf = (id) => { const one = book(); try { return one.prepare('select body, status from captures where id = ?').get(id) } finally { one.close() } }
const shots = process.env.SHOTS ?? null
if (shots) mkdirSync(shots, { recursive: true })

const c = await sandbox({ width: 1300, height: 900, seeded: false })
const { h, send } = c
const pane = `[data-open="${keep}"]`
try {
  await send('capture', keep)
  await h.waitForSelector(`${pane} .ProseMirror`, { timeout: 60_000 })
  const offer = h.locator('[data-note-offer="same"] [data-offer-action="join"]')
  await offer.waitFor({ state: 'attached', timeout: 60_000 })
  await offer.evaluate((one) => one.scrollIntoView({ block: 'center' }))
  await h.waitForTimeout(600)
  // The note's top in view first, so a divider shown afterwards was scrolled to, not there already.
  await h.evaluate((sel) => document.querySelector(`${sel} .ProseMirror`)?.closest('.note-pane')?.scrollTo(0, 0), pane)
  await offer.click()
  const divider = h.locator(`${pane} [data-joined-from]`)
  await divider.waitFor({ timeout: 20_000 }).catch(() => {})
  await h.waitForTimeout(300)
  const lit = await h.evaluate(() => !document.querySelector('style[data-joined-lit]') ? 0 : [...document.querySelectorAll('[data-joined-at] ~ *')].filter((one) => getComputedStyle(one).backgroundColor !== 'rgba(0, 0, 0, 0)').length)
  await h.waitForTimeout(700)
  const seen = await divider.evaluate((one) => { const r = one.getBoundingClientRect(); return { words: one.textContent, top: Math.round(r.top), bottom: Math.round(r.bottom), inView: r.top >= 40 && r.bottom <= innerHeight - 80 } }).catch(() => null)
  check('the note holds a labelled divider naming the other and how many lines came over', /^Joined from “Exam Cliff Notes”, \d{1,2}\u00a0[A-Z][a-z]{2} · 2 lines it had that this didn't$/.test(seen?.words ?? ''), seen?.words)
  check('the note is scrolled to it, in view', !!seen?.inView, JSON.stringify(seen))
  check('the lines that came over are lit a moment', lit >= 2, `${lit}`)
  const stored = bodyOf(keep)
  check('the divider is kept with the note', /"type":"joinedFrom"/.test(stored.body) && /"title":"Exam Cliff Notes"/.test(stored.body) && /"lines":2/.test(stored.body), stored.body.slice(0, 160))
  const notice = await h.evaluate(() => document.querySelector('[role=status]')?.textContent ?? '')
  check('the notice offers "Show what came over" and Undo', /Show what came over/.test(notice) && /Undo/.test(notice), notice)
  if (shots) {
    await h.evaluate(() => document.querySelectorAll('style[data-joined-lit]').forEach((one) => one.remove()))
    await c.both(`${shots}/join-divider`)
  }
  await h.waitForTimeout(2500)
  const still = await h.evaluate(() => /Show what came over/.test(document.querySelector('[role=status]')?.textContent ?? ''))
  check('the notice is still there after 4 seconds', still)
  // Undo, from the notice.
  await h.locator('[role=status] button', { hasText: 'Undo' }).first().click()
  const until = Date.now() + 8000
  while (Date.now() < until && /joinedFrom/.test(bodyOf(keep).body)) await h.waitForTimeout(200)
  await h.waitForTimeout(800)
  check('Undo takes the divider away, from the note and from what is kept', !/joinedFrom/.test(bodyOf(keep).body) && (await h.locator('[data-joined-from]').count()) === 0)
  check('and the other is out of the Bin', bodyOf(other).status === 'open', bodyOf(other).status)
  check('no page errors', c.errors.length === 0, c.errors.slice(0, 2).join(' | '))
} finally {
  await c.close()
}
done()
