// A long name made short while the note or task is open in an editor (main/long-names.ts, the "names:apply" a
// rename sends): the open note takes its new title at once, typing after it keeps both the new title and the typing,
// and its Markdown copy says the new title at once; an open task's description takes the long words at once, and
// typing in it keeps them. Real keys for the typing.
//   QA_DATA=<a copy of the seeded sandbox> QA_ENTRY=$PWD/out-q2/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox node qa/rename-open.mjs
import { readdirSync, readFileSync, statSync } from 'fs'
import { join } from 'path'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'

process.env.HALIGTREE_QA_CAPS = 'ai'
const { check, done } = checks()
const s = await sandbox({ width: 1300, height: 900 })
const { h, v, send, close } = s
const wait = (ms) => h.waitForTimeout(ms)
const cap = (name, ...args) => h.evaluate(([n, a]) => window.api.captures[n](...a), [name, args])
const LONG = 'Go: Code a database in 45 steps: a series of test-driven small coding puzzles'
const files = (dir) => { try { return readdirSync(dir).flatMap((one) => { const p = join(dir, one); return statSync(p).isDirectory() ? files(p) : p.endsWith('.md') ? [p] : [] }) } catch { return [] } }
try {
  await v('settings:set', { sounds: false, hintRate: 0 })
  // 1. A note open in the main window.
  const note = await cap('create', { kind: 'note', body: { type: 'doc', content: [{ type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: LONG }] }, { type: 'paragraph', content: [{ type: 'text', text: 'Each step a failing test.' }] }] } })
  await send('capture', note); await wait(1800)
  const editor = h.locator('[role="main"] .tiptap').first()
  check('the note is open in its editor', (await editor.textContent())?.includes(LONG))
  await v('names:apply', [{ kind: 'capture', id: note, name: LONG, to: 'Build a database in Go' }])
  await wait(1200)
  const first = await h.evaluate(() => document.querySelector('[role="main"] .tiptap > *')?.textContent ?? '')
  check('the open note takes its new title at once', first.endsWith('Build a database in Go'), first)
  await editor.locator('p').last().click(); await h.keyboard.press('End')
  await h.keyboard.type(' Typed after the rename.', { delay: 10 })
  await wait(2500)
  const body = JSON.stringify((await cap('get', note))?.body ?? '')
  check('typing after it keeps the new title', body.includes('"text":"Build a database in Go"'), body.slice(0, 160))
  check('and the typing', body.includes('Typed after the rename.'))
  check('and the long first line under it', body.includes(LONG))
  const number = (await cap('get', note))?.number
  const copy = files(process.env.QA_DATA).filter((one) => one.endsWith(`-${number}.md`)).map((one) => readFileSync(one, 'utf8'))
  check('its Markdown copy says the new title', copy.some((one) => one.includes('Build a database in Go')), `${copy.length} copies`)

  // 2. A task open on its page.
  const made = await v('task:add', 'send shaun loom on a.i assisted jackhammer experience and the notes')
  const title = (await v('task', made.id)).title
  await send('task', made.id); await wait(1800)
  await v('names:apply', [{ kind: 'task', id: made.id, name: title, to: 'Loom for Shaun' }])
  await wait(1200)
  const desc = () => h.evaluate(() => document.querySelector('[data-open] .tiptap.haligtree-editor:not(.is-line):not(.is-plain)')?.textContent ?? '')
  check('the open task\'s description takes the long words at once', (await desc()).includes(title), await desc())
  await h.locator('[data-open] .tiptap.haligtree-editor:not(.is-line):not(.is-plain)').first().click(); await h.keyboard.press('Meta+ArrowDown')
  await h.keyboard.type(' and more words', { delay: 10 })
  await wait(1500)
  const notes = JSON.stringify((await v('task', made.id))?.notes ?? '')
  check('typing in it keeps them', notes.includes(title) && notes.includes('and more words'), notes.slice(0, 200))
  check('and its name is the short one', (await v('task', made.id))?.title === 'Loom for Shaun')
} finally {
  await close()
}
done()
