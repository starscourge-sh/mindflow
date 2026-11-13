// The Inbox's graph draws every capture that is there (the user, 13 Nov: "why does the grapf view seem to not be
// showing what is actually there?"; their graph showed 3 dots for an Inbox of 13). With an Inbox like theirs (9 notes,
// a term and 3 links; two notes share #work, three are meetings), "Captures" over "All" has 13 capture dots and 1 tag
// dot, none off the canvas, none on another; the line under it says what is drawn ("13 captures · 2 share #work") at
// the Inbox's own text size, never in grey; a dot on its own opens its capture when pressed; and every time (This week,
// This month, All) and kind filter (Note, Term, Link, any mix) draws every capture in it. Then an Inbox of 0 and of 500.
//   QA_DATA=<empty folder> QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/inbox-graph-all.mjs
//   SHOTS=<folder> saves the user's case in light and dark at 1400 by 900 and 560 by 400, and frames as it opens.
import { mkdirSync } from 'node:fs'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS = ''
const { check, done } = checks()
const shots = process.env.SHOTS
if (shots) mkdirSync(shots, { recursive: true })
const c = await sandbox({ width: 1400, height: 900, seeded: false })
const { h, v, look } = c
const wait = (ms) => h.waitForTimeout(ms)
const DAY = 86_400_000
// The user's Inbox of 13 Nov, by its rows: [kind, first line, a meeting?]. Notes this week, links this month, the term older.
const INBOX = [
  ['note', 'Exam Cliff Notes'],
  ['note', 'credit note, purchase order, invoice :order type #work'],
  ['note', 'upgrade opensearch server size #work'],
  ['note', 'video editor for youtube + shortform: using local a.i #app-idea'],
  ['note', 'Recording, 8 Nov at 15:28', true],
  ['note', 'support desmos style diagrams/graphs in notes #haligtree'],
  ['note', 'Recording, 7 Nov at 21:00', true],
  ['note', 'Picture'],
  ['note', 'Meeting, 6 Nov at 10:03', true],
  ['word', 'Glossary'],
  ['link', 'Custom Navigation Hides Search Icon'],
  ['link', 'How the opensearch cluster scales'],
  ['link', 'A guide to local video models']
]
const AGO = { note: 0, link: 20, word: 60 }
const make = (rows) => h.evaluate(async (list) => {
  const ids = []
  for (const [kind, text, meeting] of list) ids.push(await window.api.captures.create({ kind, ...(meeting ? { medium: 'Meeting' } : {}), body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] } }))
  return ids
}, rows)
const graphOf = () => h.evaluate(() => {
  const canvas = document.querySelector('[data-inbox-graph] canvas')
  const dots = canvas?.mapDots?.() ?? []
  const rect = canvas?.getBoundingClientRect()
  return { dots, lines: canvas?.mapLines?.() ?? [], box: rect ? { x: rect.x, y: rect.y, w: rect.width, h: rect.height } : null }
})
// How close anything drawn comes to the canvas's edges, in screen pixels (from inbox-graph-settle.mjs).
const edges = () => h.evaluate(() => {
  const canvas = document.querySelector('[data-inbox-graph] canvas'); const { width, height } = canvas
  const data = canvas.getContext('2d').getImageData(0, 0, width, height).data
  let left = width, top = height, right = 0, bottom = 0
  for (let y = 0; y < height; y += 2) for (let x = 0; x < width; x += 2) if (data[(y * width + x) * 4 + 3] > 120) { left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y) }
  const d = devicePixelRatio
  return Math.min(left, top, width - right, height - bottom) / d
})
// The dots not wholly inside the canvas, from where the canvas says it draws each (none told counts as outside).
const outside = (g) => g.dots.filter((one) => !g.box || !one.screen || one.screen[0] - one.screen[2] < 0 || one.screen[1] - one.screen[2] < 0 || one.screen[0] + one.screen[2] > g.box.w || one.screen[1] + one.screen[2] > g.box.h)
// The smallest dot across, in screen pixels (a speck of a pixel or two reads as nothing; the playbook's dots are 7 to 9).
const smallest = (g) => Math.min(...g.dots.map((one) => (one.screen ? one.screen[2] * 2 : 0)))
const overlaps = (list) => {
  let pairs = 0
  for (let a = 0; a < list.length; a++) for (let b = a + 1; b < list.length; b++) if (list[a].r + list[b].r - Math.hypot(list[a].x - list[b].x, list[a].y - list[b].y) > 0.5) pairs++
  return pairs
}
const said = () => h.evaluate(() => {
  const line = document.querySelector('[data-inbox-graph-said]')
  if (!line) return null
  const body = document.createElement('span')
  body.className = 'text-body'
  document.body.append(body)
  const size = getComputedStyle(body).fontSize
  body.remove()
  return { text: line.textContent.replace(/\s+/g, ' ').trim(), size: getComputedStyle(line).fontSize, body: size, grey: !!line.querySelector('.text-muted-foreground') }
})
const empty = () => h.evaluate(() => document.querySelector('[data-inbox-graph] [data-empty] h2')?.textContent ?? null)
const chip = (name) => h.locator(`[data-inbox-graph] button[aria-label="${name}"]`).first()
const kindChip = (name) => h.locator('[data-filter-chips] button[aria-pressed]', { hasText: new RegExp(`^${name}$`) }).first()
// Settled: the same dots twice, 600ms apart.
const settled = async () => {
  let a = await graphOf()
  for (let i = 0; i < 12; i++) {
    await wait(600)
    const b = await graphOf()
    if (a.dots.length === b.dots.length && b.dots.every((one, at) => Math.hypot(one.x - a.dots[at].x, one.y - a.dots[at].y) < 0.5)) return b
    a = b
  }
  return a
}
const film = async (name) => {
  if (!shots) return
  const graph = await h.$('[data-inbox-graph]')
  for (let i = 0; i < 16; i++) { await graph.screenshot({ path: `${shots}/${name}-f${String(i).padStart(2, '0')}.png` }); await wait(50) }
}
try {
  await v('onboarding:set', { welcomed: new Date().toISOString(), newsSeen: true, welcoming: false, pageHints: false })
  await v('settings:set', { sounds: false, hintRate: 0, autoArchive: 0, inboxDays: 3650 })
  // An Inbox of 0: no graph box, the Inbox's own empty page (a new book's: its examples, with their "Try it" line).
  await h.reload(); await wait(1500)
  await c.go('inbox')
  const nothing = await h.evaluate(() => document.querySelector('[data-empty], [data-example-line]')?.textContent?.replace(/\s+/g, ' ').slice(0, 90) ?? null)
  check('an Inbox of 0: no graph, no empty box, the Inbox says it is empty', !(await h.$('[data-inbox-graph]')) && !!nothing, nothing ?? 'no empty page')
  const ids = await make(INBOX)
  for (const [kind, ago] of Object.entries(AGO)) if (ago) await v('captures:bulk', ids.filter((_, at) => INBOX[at][0] === kind), { capturedAt: new Date(Date.now() - ago * DAY).toISOString() })
  await h.reload(); await wait(1500)
  await c.go('inbox')
  if (!(await h.$('[data-inbox-graph]'))) await h.click('button:has-text("Graph")')
  await h.waitForSelector('[data-inbox-graph]', { timeout: 8000 })
  // The user's case: Note, Term and Link on, "Captures", "All".
  for (const name of ['Note', 'Term', 'Link']) await kindChip(name).click()
  await chip('Captures').click()
  await h.mouse.move(5, 5)
  await chip('All').click()
  await film('open-all')
  let g = await settled()
  const captures = g.dots.filter((one) => one.type === 'capture'), tags = g.dots.filter((one) => one.type === 'tag')
  check('the user\'s case: 13 capture dots and 1 tag dot', captures.length === 13 && tags.length === 1, `${captures.length} captures, ${tags.length} tags (${tags.map((one) => one.title).join(', ')})`)
  const off = outside(g)
  const clear = await edges()
  check('all 14 dots drawn, each 7px or more across, none on another, none off the canvas, 8px clear of its edge', g.dots.length === 14 && smallest(g) >= 7 && !overlaps(g.dots) && !off.length && clear >= 8,
    `${g.dots.length} dots, the smallest ${smallest(g).toFixed(1)}px, ${overlaps(g.dots)} overlapping, off: ${off.map((one) => one.title).join(', ') || 'none'}, ${clear.toFixed(1)}px clear in ${Math.round(g.box?.w)} by ${Math.round(g.box?.h)}`)
  const joined = new Set(g.lines.flat())
  const alone = captures.filter((one) => !joined.has(one.id))
  check('11 stand on their own with no line, 2 are joined to #work', alone.length === 11 && g.lines.length === 2, `${alone.length} on their own, ${g.lines.length} lines`)
  let line = await said()
  check('the line under it says what is drawn', line?.text === '13 captures · 2 share #work', JSON.stringify(line?.text))
  check('at the Inbox\'s own text size, nothing in grey', !!line && line.size === line.body && !line.grey, line ? `${line.size} against the page's ${line.body}${line.grey ? ', with grey' : ''}` : 'no line')
  if (shots) {
    for (const [w, hh] of [[1400, 900], [560, 400]]) {
      await c.size(w, hh); await wait(900)
      for (const name of ['light', 'dark']) { await look(name); await wait(500); await h.screenshot({ path: `${shots}/user-case-${w}x${hh}-${name}.png` }) }
      await look('light')
    }
    await c.size(1400, 900); await wait(900)
  }
  // At 560 by 400: no sideways scroll, the canvas still a picture, every dot inside it.
  await c.size(560, 400); await wait(1200)
  g = await settled()
  const small = await h.evaluate(() => ({ wide: document.documentElement.scrollWidth - innerWidth, said: !!document.querySelector('[data-inbox-graph-said]') }))
  const outSmall = outside(g).length
  check('at 560 by 400: no sideways scroll, all 14 dots inside a canvas of some size', small.wide <= 0 && g.dots.length === 14 && !outSmall && g.box?.h >= 150, `${small.wide}px sideways, ${g.dots.length} dots, ${outSmall} outside, canvas ${Math.round(g.box?.w)} by ${Math.round(g.box?.h)}`)
  await c.size(1400, 900); await wait(1200)
  // A dot on its own opens its capture when pressed, as the joined ones do.
  g = await settled()
  const lone = g.dots.find((one) => one.title === 'Exam Cliff Notes')
  if (lone && g.box) await h.mouse.click(g.box.x + lone.screen[0], g.box.y + lone.screen[1])
  const opened = lone ? await h.waitForFunction(() => [...document.querySelectorAll('.ProseMirror')].some((one) => one.textContent.includes('Exam Cliff Notes')), null, { timeout: 4000 }).then(() => true, () => false) : false
  check('pressing a dot on its own opens it', opened, lone ? `"Exam Cliff Notes" at ${lone.screen.map(Math.round).join(', ')}` : 'no such dot')
  await h.keyboard.press('Escape'); await wait(400)
  await c.go('inbox')
  if (!(await h.$('[data-inbox-graph]'))) await h.click('button:has-text("Graph")')
  // The Tags tab says what it draws and what it does not.
  await chip('Tags').click(); await wait(600)
  g = await settled()
  line = await said()
  check('Tags: says what is drawn and what is not', line?.text === '3 tags, from 4 of 13 captures · the other 9 have no tag', JSON.stringify(line?.text))
  check('Tags: its 3 tag dots each 7px or more across, inside the canvas', g.dots.length === 3 && smallest(g) >= 7 && !outside(g).length, `${g.dots.length} dots, the smallest ${smallest(g).toFixed(1)}px`)
  if (shots) for (const name of ['light', 'dark']) { await look(name); await wait(400); await (await h.$('[data-inbox-graph]')).screenshot({ path: `${shots}/tags-${name}.png` }) }
  await look('light')
  await chip('Captures').click(); await wait(600)
  // Every time and kind filter: a dot for every capture in it.
  const filters = [['Note'], ['Term'], ['Link'], ['Term', 'Link'], ['Note', 'Term', 'Link']]
  const days = { 'This week': 7, 'This month': 31, All: Infinity }
  let on = ['Note', 'Term', 'Link']
  for (const filter of filters) {
    for (const name of on) if (!filter.includes(name)) await kindChip(name).click()
    for (const name of filter) if (!on.includes(name)) await kindChip(name).click()
    on = filter
    for (const [range, within] of Object.entries(days)) {
      await chip(range).click(); await wait(300)
      const want = INBOX.filter(([kind], at) => filter.some((name) => ({ Note: 'note', Term: 'word', Link: 'link' })[name] === kind) && (AGO[INBOX[at][0]] ?? 0) < within).length
      const work = filter.includes('Note') ? 1 : 0
      if (!want) {
        const title = await empty()
        check(`${filter.join(' + ')}, ${range}: nothing in it, and the graph says so`, title === `Nothing captured ${range === 'This week' ? 'this week' : 'this month'}` && !(await h.$('[data-inbox-graph] canvas')), JSON.stringify(title))
        continue
      }
      g = await settled()
      const n = g.dots.filter((one) => one.type === 'capture').length, t = g.dots.filter((one) => one.type === 'tag').length
      line = await said()
      const words = `${want} ${want === 1 ? 'capture' : 'captures'}${want > 1 ? (work ? ' · 2 share #work' : ' · none share a tag') : ''}`
      check(`${filter.join(' + ')}, ${range}: ${want} capture dots, ${work} tag dot, said so`, n === want && t === work && line?.text === words && !overlaps(g.dots), `${n} captures, ${t} tags, ${overlaps(g.dots)} overlapping, said ${JSON.stringify(line?.text)}`)
    }
  }
  // An Inbox of 500: the newest 400 are drawn, and the line says so in words. (The newest 400 are all new ones: every
  // fourth carries #reading, so 100 share it, and #work's two are older.)
  await h.evaluate(async () => { for (let i = 0; i < 487; i++) await window.api.captures.create({ kind: 'note', body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: `A thought, number ${i + 1}${i % 4 ? '' : ' #reading'}` }] }] } }) })
  await h.reload(); await wait(1500)
  await c.go('inbox')
  if (!(await h.$('[data-inbox-graph]'))) await h.click('button:has-text("Graph")')
  await h.waitForSelector('[data-inbox-graph] canvas', { timeout: 8000 })
  await chip('All').click()
  g = await settled()
  line = await said()
  check('500: the newest 400 drawn, and the line says what happens past it', g.dots.filter((one) => one.type === 'capture').length === 400 && line?.text === '400 captures, the newest of 500 · 100 share #reading', `${g.dots.length} dots, said ${JSON.stringify(line?.text)}`)
  check('500: all 401 dots drawn (400 captures and #reading), none on another, none off the canvas', g.dots.length === 401 && !overlaps(g.dots) && !outside(g).length, `${g.dots.length} dots, ${overlaps(g.dots)} overlapping, ${outside(g).length} outside`)
  check('no errors on the page', !c.errors.length, c.errors.slice(0, 2).join(' | '))
} catch (error) {
  if (shots) await h.screenshot({ path: `${shots}/error.png` }).catch(() => {})
  check('the run finished', false, error.message.split('\n').slice(0, 12).join(' / '))
}
await c.close()
done()
