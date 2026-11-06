// The moment of going to a book draws the bars of the book being gone to, not those of the book left (the user, 6 Nov:
// "follow settings of the destination book"). A book with its own bars keeps them; only a new one takes yours.
// Heading words too: the Inbox's groups say what they hold, many of it ("Notes", "Terms").
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 SHOT=<dir> node qa/going-follows-book.mjs
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'
import { DatabaseSync } from 'node:sqlite'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'

const { check, done } = checks()
const ROOT = process.env.QA_DATA
const SHOT = process.env.SHOT
const OWN = 'b-qaownbars1'
const FRESH = 'b-qafreshone'
const stored = (folder, bars) => {
  mkdirSync(folder, { recursive: true })
  const db = new DatabaseSync(join(folder, 'haligtree.db'))
  db.exec('create table if not exists settings (key text primary key, value text)')
  db.prepare('insert or replace into settings (key, value) values (?, ?)').run('progressBars', JSON.stringify(bars))
  db.close()
}
// Caught, never made: the restart.
const stub = (c) => c.electron.evaluate(({ app }) => {
  process.mainModule.require('child_process').spawn = () => ({ unref() {}, on() {}, kill() {} })
  app.relaunch = () => undefined
  app.quit = () => undefined
  app.exit = () => undefined
  const every = globalThis.setInterval
  globalThis.setInterval = (fn, ms, ...rest) => (ms === 80 && String(fn).includes('existsSync') ? every(() => undefined, 1e9) : every(fn, ms, ...rest))
})
const swing = async (c, book) => {
  const { h } = c
  await h.reload()
  await h.waitForTimeout(1800)
  const n = await h.evaluate(() => (window.haligtreeSaber ?? []).length)
  await h.evaluate((id) => window.dispatchEvent(new CustomEvent('haligtree:book-switch', { detail: id })), book)
  const frames = []
  let entry = null
  for (let i = 0; i < 40 && !entry; i++) {
    await h.waitForTimeout(25)
    entry = await h.evaluate((at) => (window.haligtreeSaber ?? [])[at] ?? null, n)
    frames.push(await h.evaluate(() => document.querySelector('[data-going] [data-style]')?.getAttribute('data-style') ?? null))
  }
  if (SHOT) await h.screenshot({ path: join(SHOT, `going-${book}-${entry?.bars}.png`) })
  return { entry, drawn: frames.filter(Boolean), words: await h.evaluate(() => document.querySelector('[data-going] p')?.textContent ?? '') }
}

writeFileSync(join(ROOT, 'books.json'), JSON.stringify({ books: [{ id: OWN, name: 'Own bars', createdAt: new Date().toISOString() }, { id: FRESH, name: 'Fresh', createdAt: new Date().toISOString() }] }))
stored(join(ROOT, 'books', OWN), 'dino')

// --- from your own notes, wearing lightsabers
process.env.QA_ARGS = ''
{
  const c = await sandbox({ width: 1100, height: 760, seeded: false })
  try {
    await c.v('settings:set', { progressBars: 'saber', motion: true, sounds: false })
    await stub(c)
    let got = await swing(c, OWN)
    check('to a book with its own bars: those bars, not yours', got.entry?.bars === 'dino' && got.drawn.every((one) => one === 'dino'), JSON.stringify({ bars: got.entry?.bars, drawn: [...new Set(got.drawn)] }))
    check('it fills for as long as it says', got.entry?.blade === true)
    await c.h.waitForTimeout(1200)
    const carried = JSON.parse(readFileSync(join(ROOT, 'books', OWN, 'carry.json'), 'utf8'))
    check('your bars do not overwrite that book\'s', !('progressBars' in carried.settings), Object.keys(carried.settings).join(','))
    check('the rest of your look still comes along', 'motion' in carried.settings)
  } finally {
    await c.close()
  }
}
// The switch above remembered that book as the last open: back to My book for the next run.
writeFileSync(join(ROOT, 'books.json'), JSON.stringify({ ...JSON.parse(readFileSync(join(ROOT, 'books.json'), 'utf8')), last: undefined }))
{
  const c = await sandbox({ width: 1100, height: 760, seeded: false })
  try {
    await stub(c)
    const got = await swing(c, FRESH)
    check('to a new book: it takes yours, a lightsaber here', got.entry?.bars === 'saber', got.entry?.bars)
    await c.h.waitForTimeout(1500)
    check('and yours are carried to it', JSON.parse(readFileSync(join(ROOT, 'books', FRESH, 'carry.json'), 'utf8')).settings.progressBars === 'saber')
    check('no database is made in a book only looked at', !existsSync(join(ROOT, 'books', FRESH, 'haligtree.db')))
    // Arriving: the window's first frame already wears this book's bars.
    const url = c.h.url()
    await c.h.addInitScript(() => {
      window.__styles = []
      new MutationObserver(() => {
        const bar = document.querySelector('[data-going] [data-style]')
        if (bar) window.__styles.push(bar.getAttribute('data-style'))
      }).observe(document, { childList: true, subtree: true })
    })
    await c.h.goto(`${url}${url.includes('?') ? '&' : '?'}arrived=1&bars=line`)
    await c.h.waitForTimeout(2500)
    const styles = [...new Set(await c.h.evaluate(() => window.__styles))]
    check('arriving, the first frame wears this book\'s bars', styles.length === 1 && styles[0] === 'line', styles.join(','))
    check('no page errors', !c.errors.some((one) => one.startsWith('PAGEERROR')), c.errors.join(' | '))
  } finally {
    await c.close()
  }
}

// --- out of the sandbox, wearing another style, home to a plain line
stored(ROOT, 'line')
process.env.QA_ARGS = '--sandbox'
{
  const c = await sandbox({ width: 1100, height: 760 })
  try {
    await c.v('settings:set', { progressBars: 'saber', motion: true, sounds: false })
    await stub(c)
    const got = await swing(c, 'default')
    check('back to your notes: their plain line, not the sandbox\'s blade', got.entry?.bars === 'line' && got.drawn.every((one) => one === 'line'), got.entry?.bars)
    // A second visit in the Inbox's words: many of a kind, and a phrase is not a word.
    await c.h.reload()
    await c.h.waitForTimeout(1500)
    await c.h.evaluate(() => Promise.all([window.api.captures.create({ kind: 'note', body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'One note' }] }] } }), window.api.captures.create({ kind: 'word', body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Byzantine Empire' }] }] } })]))
    await c.go('inbox')
    await c.h.waitForTimeout(900)
    const text = await c.h.locator('[data-pane-card]').first().innerText()
    check('the Inbox says Notes and Terms', /\bNotes\b/.test(text) && /\bTerms\b/.test(text), text.slice(0, 160).replace(/\n/g, ' / '))
    check('nothing still says Word', !/^Word\s*$/m.test(text))
    if (SHOT) await c.h.screenshot({ path: join(SHOT, 'inbox-headings.png') })
  } finally {
    await c.close()
  }
}
done()
