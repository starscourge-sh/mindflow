// A pasted link whose page cannot be read stays a plain link and says why, quietly, once ("Couldn't read this page"),
// one notice for several pasted together; a link that works still becomes its card. A Word saved with its forms for a
// meaning ("(runs) (, running) (past participle; run).", an older reading) has its meaning read again once, as it is
// next shown, and kept in its place.
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/link-fail-word.mjs
import { mkdirSync } from 'fs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const shots = process.env.SHOTS ?? 'scratchpad/link-fail-word'
mkdirSync(shots, { recursive: true })
const c = await sandbox({ width: 1200, height: 860 })
const { h, v } = c
const results = []
const check = (name, ok, detail = '') => (results.push(!!ok), console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`))
const wait = (ms) => h.waitForTimeout(ms)
const EDITOR = '[data-open] .tiptap'
const GARBLED = '(runs) (, running) (past participle; run).'
const toasts = () => h.evaluate(() => [...document.querySelectorAll('[data-sonner-toast], [data-toast], [role="status"]')].map((one) => one.textContent.trim()).filter(Boolean))
const paste = async (words) => {
  const id = await v('article:new')
  await v('item:save', id, { title: 'Pasted', body: { type: 'doc', content: [{ type: 'paragraph' }] } })
  await c.send('article', id); await wait(1400)
  await h.evaluate(([sel, words]) => {
    const ed = document.querySelector(sel).editor
    ed.commands.focus('end')
    const data = new DataTransfer()
    data.setData('text/plain', words)
    ed.view.dom.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }))
  }, [EDITOR, words])
}
const doc = () => h.evaluate((sel) => {
  const el = document.querySelector(sel)
  return { links: [...el.querySelectorAll('a[href]')].map((a) => a.getAttribute('href')), cards: el.querySelectorAll('[data-type="bookmark"], .tiptap-bookmark').length, text: el.textContent }
}, EDITOR)
const until = async (test, ms = 8000) => { for (let i = 0; i < ms / 200; i++) { if (await test()) return true; await wait(200) } return false }

try {
  await v('settings:set', { hintRate: 0, sounds: false })
  // One link that cannot be read.
  await paste('http://127.0.0.1:9/nothing-here')
  await until(async () => (await doc()).cards === 0 && (await doc()).links.length === 1)
  let at = await doc()
  check('a link that fails stays the plain link, no card', at.cards === 0 && at.links[0] === 'http://127.0.0.1:9/nothing-here', JSON.stringify(at))
  await until(async () => (await toasts()).some((one) => /Couldn.t read/.test(one)), 3000)
  let said = await toasts()
  check('it says why, quietly: "Couldn\'t read this page"', said.some((one) => /Couldn.t read this page/.test(one)), said.join(' | '))
  for (const look of ['light', 'dark']) { await c.look(look); await h.screenshot({ path: `${shots}/one-${look}.png` }) }
  await c.look('light')
  await wait(6000)

  // Three pasted together: one notice for all of them.
  await paste('http://127.0.0.1:9/one\nhttp://127.0.0.1:9/two\nhttp://127.0.0.1:9/three')
  await until(async () => (await doc()).cards === 0 && (await doc()).links.length === 3)
  at = await doc()
  check('three that fail stay three plain links', at.cards === 0 && at.links.length === 3, JSON.stringify(at))
  await until(async () => (await toasts()).some((one) => /Couldn.t read 3 pages/.test(one)), 3000)
  said = await toasts()
  check('one notice for the three, never one each', said.filter((one) => /Couldn.t read/.test(one)).length === 1 && said.some((one) => /Couldn.t read 3 pages/.test(one)), said.join(' | '))
  await h.screenshot({ path: `${shots}/three-light.png` })

  // A Word kept with its forms for a meaning, from before: read again once, as it is shown.
  const id = await h.evaluate(async () => window.api.captures.create({ kind: 'word', title: 'run', body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'run' }] }] } }))
  await v('notes:fields:set', 'captures', id, 'definition', GARBLED)
  await c.send('capture', id); await wait(2500)
  await until(async () => (await v('notes:fields', 'captures', id)).definition !== GARBLED, 8000)
  const fields = await v('notes:fields', 'captures', id)
  check('a Word saved with its forms gets its meaning read again', typeof fields.definition === 'string' && fields.definition !== GARBLED && !/^\(|past participle/.test(fields.definition), String(fields.definition))
  check('…once: it is marked read', !!fields._meaningRead, JSON.stringify(fields))
  const shown = await h.evaluate(() => document.body.innerText)
  check('the new meaning is what the note shows, the old one gone', !shown.includes('(runs) (, running)'))
  check('the mark is never shown as a property', !/meaningRead/.test(shown))
  for (const look of ['light', 'dark']) { await c.look(look); await h.screenshot({ path: `${shots}/word-${look}.png` }) }
  await c.look('light')
  check('no errors', c.errors.length === 0, c.errors.slice(0, 2).join(' | '))
} finally { await c.close() }
const passed = results.filter(Boolean).length
console.log(`\n${passed}/${results.length} passed; frames in ${shots}`)
process.exit(passed === results.length ? 0 : 1)
