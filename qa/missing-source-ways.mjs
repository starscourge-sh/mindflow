// "Quotes have no source" on Sources: each row offers, on pointing, three ways out, "Add who",
// "Unknown" (kept a quote, source unattributed, never asked again) and "Not a quote" (a note
// again, with Undo). Nothing on the row moves as they show. A quote's own "No source yet" line
// offers the same two other ways.
//
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_SHOTS=<dir> node qa/missing-source-ways.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const { check, done } = checks()
const c = await sandbox({ width: 1300, height: 900 })
const { h, errors } = c
const shots = process.env.QA_SHOTS
const shot = (name) => shots && h.screenshot({ path: `${shots}/${name}.png` }).catch(() => {})
const wait = (ms) => h.waitForTimeout(ms)
const doc = (text) => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] })
const make = (patch) => h.evaluate((p) => window.api.captures.create(p), patch)
const get = (id) => h.evaluate((one) => window.api.captures.get(one), id)

try {
  const unknown = await make({ kind: 'quote', body: doc('Fortune favours the bold, said someone once') })
  const mine = await make({ kind: 'quote', body: doc('Raycast notes: clipboard history and snippets') })
  await make({ kind: 'quote', body: doc('The best way out is always through') })
  await c.go('sources')
  await wait(1200)
  const row = (id) => h.locator(`[data-missing-row="${id}"]`)
  const ways = (id) => row(id).locator('[data-missing-ways]')
  const box = (id) => row(id).evaluate((one) => JSON.stringify([...one.querySelectorAll('button')].map((b) => { const r = b.getBoundingClientRect(); return [Math.round(r.x), Math.round(r.y), Math.round(r.width)] })))
  const before = await box(unknown)
  const hidden = await ways(unknown).evaluate((one) => getComputedStyle(one).opacity)
  await shot('missing-rest')
  await row(unknown).hover()
  await wait(300)
  const shown = await ways(unknown).evaluate((one) => getComputedStyle(one).opacity)
  await shot('missing-hover')
  check('1. at rest the ways out are out of sight; pointed at, they show', hidden === '0' && shown === '1', `${hidden} → ${shown}`)
  check('2. nothing on the row moves as they show', before === (await box(unknown)), `${before} / ${await box(unknown)}`)
  check('3. three ways out: Add who, Unknown, Not a quote', (await ways(unknown).innerText()).replace(/\s+/g, ' ').trim() === 'Add who Unknown Not a quote', await ways(unknown).innerText())
  const cursor = await ways(unknown).locator('button').first().evaluate((one) => getComputedStyle(one).cursor)
  check('4. the hand on them', cursor === 'pointer', cursor)
  await row(unknown).locator('[data-source-unknown]').click()
  await wait(900)
  const u = await get(unknown)
  check('5. Unknown: still a quote, its source Unattributed, gone from the list', u.kind === 'quote' && u.attribution === 'Unattributed' && (await row(unknown).count()) === 0, `${u.kind} ${u.attribution}`)
  const line = await h.evaluate(() => ({ face: !!document.querySelector('[data-face="Unattributed"]'), line: document.querySelector('[data-source-unknown-line]')?.textContent ?? null }))
  check('5b. "Unattributed" is never a face among the people: one quiet "Source unknown" line with its count instead', !line.face && /^Source unknown\d/.test(line.line ?? ''), JSON.stringify(line))
  await h.evaluate(() => { window.__said = []; addEventListener('haligtree:toast', (e) => window.__said.push(`${e.detail.text}${e.detail.undo ? ' [Undo]' : ''}`)) })
  await row(mine).hover()
  await row(mine).locator('[data-not-quote]').click()
  await wait(900)
  check('6. Not a quote: a note again, gone from the list', (await get(mine)).kind === 'note' && (await row(mine).count()) === 0, (await get(mine)).kind)
  const said = await h.evaluate(() => window.__said)
  check('7. said once, with Undo', said.length === 1 && said[0] === 'Not a quote: kept as a note of yours [Undo]', said.join(' | '))
  await h.evaluate(() => [...document.querySelectorAll('button')].find((one) => /^Undo/.test(one.textContent?.trim() ?? ''))?.click())
  await wait(900)
  check('8. Undo makes it a quote again, back in the list', (await get(mine)).kind === 'quote' && (await row(mine).count()) === 1, (await get(mine)).kind)
  await c.theme?.('dark').catch(() => {})
  await row(mine).hover()
  await wait(300)
  await shot('missing-hover-dark')
  check('no page errors', errors.length === 0, errors.join(' | '))
} finally {
  await c.close()
}
done()
