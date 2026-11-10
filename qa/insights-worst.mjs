// The new surfaces from qa/insights.mjs with worst-case data: a 300-letter title, an unbroken word, 120 notes two
// steps out, 6 tagged blocks with emoji and Arabic, a note with 12,345 words, and the smallest window (560 x 400).
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=$PWD/out-insights/main/index.js HALIGTREE_QA_AWAY=1 SHOTS=<dir> node qa/insights-worst.mjs
import { mkdirSync, readdirSync, statSync } from 'fs'
import { join } from 'path'
import { DatabaseSync } from 'node:sqlite'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const dir = process.env.SHOTS ?? `${process.env.QA_DATA}/shots`
mkdirSync(dir, { recursive: true })
const { check, done } = checks()
const c = await sandbox({ width: 1280, height: 860 })
const { h, send } = c
const para = (text) => ({ type: 'paragraph', content: [{ type: 'text', text }] })
const link = (id, label) => ({ type: 'paragraph', content: [{ type: 'noteLink', attrs: { id, label, text: label } }] })
const make = (body) => h.evaluate((body) => window.api.captures.create({ kind: 'note', body }), body)
const sideways = () => h.evaluate(() => [...document.querySelectorAll('[data-local-graph], [data-entry-blocks], [data-entry-from], [data-writing-spent]')].filter((one) => one.scrollWidth > one.clientWidth + 1 && getComputedStyle(one).overflowX !== 'hidden' && !one.className.includes('truncate')).map((one) => one.className.slice(0, 40)))
try {
  await h.waitForTimeout(1500)
  const long = `${'A very long title that keeps going '.repeat(9)}end`
  const word = 'Supercalifragilisticexpialidocious'.repeat(5)
  // 120 notes two steps out, through one neighbour.
  const fars = []
  for (let i = 0; i < 120; i++) fars.push(await make({ type: 'doc', content: [para(`Far note ${i}`)] }))
  const near = await make({ type: 'doc', content: [para('The one neighbour'), ...fars.map((id, n) => link(id, `Far note ${n}`))] })
  const hub = await make({ type: 'doc', content: [para(long), link(near, 'The one neighbour'), para(`${word} #worsttag`), para('مرحبا بالعالم، هذا سطر عربي طويل #worsttag'), para('🌍🔥✨ emoji only line #worsttag'), para('Fourth #worsttag'), para('Fifth #worsttag'), para('Sixth #worsttag'), para('An untagged line')] })
  const found = []
  const walk = (at) => { for (const name of readdirSync(at)) { const path = join(at, name); if (statSync(path).isDirectory()) walk(path); else if (name === 'haligtree.db') found.push(path) } }
  walk(process.env.QA_DATA)
  const db = new DatabaseSync(found.sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0])
  db.prepare("insert into word_days (day, id, kind, words, seconds) values (date('now', 'localtime', '-40 days'), ?, 'capture', 12345, 98765)").run(hub)
  await h.evaluate(() => (localStorage.setItem('localGraph:steps', '2'), localStorage.setItem('noteDetails', 'open'), window.dispatchEvent(new Event('mf:details'))))
  for (const [w, hh] of [[1280, 860], [560, 400]]) {
    await c.size(w, hh)
    await send('capture', hub); await h.waitForTimeout(2500)
    await h.evaluate(() => document.querySelector('[data-local-graph]')?.scrollIntoView({ block: 'center' }))
    await h.waitForTimeout(600)
    const foot = await h.evaluate(() => document.querySelector('[data-local-count]')?.textContent ?? '')
    check(`${w}: 120 two steps out are capped at the busiest 60 and said so`, /60 of 120 two steps away/.test(foot), foot)
    check(`${w}: nothing runs off sideways`, (await sideways()).length === 0, JSON.stringify(await sideways()))
    await c.both(join(dir, `worst-graph-${w}`))
    await h.evaluate(() => document.querySelector('[data-writing-spent]')?.scrollIntoView({ block: 'center' }))
    const spent = await h.evaluate(() => document.querySelector('[data-writing-spent]')?.textContent ?? '')
    check(`${w}: 27 hours of writing reads in hours`, /^WritingAbout 27 h, 12,345 words$/.test(spent), spent)
    await c.both(join(dir, `worst-writing-${w}`))
    await h.evaluate(() => localStorage.setItem('tag:look', 'stream'))
    await send('tag', 'worsttag'); await h.waitForTimeout(2500)
    const blocks = await h.evaluate(() => ({ lines: document.querySelectorAll('[data-entry-blocks] p').length, from: document.querySelector('[data-entry-from]')?.textContent ?? '' }))
    check(`${w}: three blocks and "And 3 more lines"`, blocks.lines === 4 && (await h.evaluate(() => document.querySelector('[data-entry-blocks]')?.textContent ?? '')).includes('And 3 more lines with #worsttag'), JSON.stringify(blocks))
    check(`${w}: the long title is cut with an ellipsis on one line`, blocks.from.endsWith('…”') || blocks.from.length <= 90, blocks.from.slice(-20))
    const wide = await h.evaluate(() => [...document.querySelectorAll('[data-entry-blocks] p')].every((one) => one.scrollWidth <= one.clientWidth + 1))
    check(`${w}: the unbroken word wraps inside the block`, wide)
    await c.both(join(dir, `worst-tag-${w}`))
  }
  db.close()
  check('no page errors', c.errors.length === 0, c.errors.slice(0, 3).join(' | '))
} catch (error) {
  check('the run finished', false, error.message.split('\n')[0])
} finally {
  await c.close?.()
}
done()
