// Opening and closing ⌘K, a block's menu and a hover card over the largest note of a book restyles only what they
// touch. Each is opened and closed TIMES (10) with real keys and a real pointer, under a Chromium trace of the page,
// and the biggest style pass of each open and each close must stay under BAR_MS (16). Run on a COPY of a book
// (QA_DATA), never the book itself:
//
//   QA_DATA=<copy> QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/menus-restyle.mjs
//
// Over the largest note (7,000 blocks) every one of them restyled the whole window, about 15,000 elements and 140 to
// 360 ms each time: a sibling rule ending in a bare "*" (.mf-segs, .mf-margin-card, the overhang pill), Brutal's
// rule on the class attribute, and the page-wide :has() rules (main.css, haligtree-editor.scss say which); then the
// note's own spacing, whose line before named no class ("p + p", "h2 + p", "li + li"), restyled its 3,472 paragraphs
// and 935 headings, about 5,000 elements and 75 to 100 ms (test/has-narrow.test.ts holds both kinds out). WHY=1
// prints what Chromium said made the biggest pass of each kind (invalidation tracking), to find the next one.
import { DatabaseSync } from 'node:sqlite'
import { existsSync, readFileSync } from 'fs'
import { loadavg } from 'os'
import { join } from 'path'
import { sandbox } from './sandbox-lib.mjs'
import { checks } from './harness.mjs'

const { check, done } = checks()
const TIMES = Number(process.env.TIMES ?? 10)
const BAR = Number(process.env.BAR_MS ?? 16)
const root = process.env.QA_DATA
if (!root) throw new Error('QA_DATA must be a copy of a book')
const shelf = existsSync(join(root, 'books.json')) ? JSON.parse(readFileSync(join(root, 'books.json'), 'utf8')) : null
const file = shelf?.last && shelf.last !== 'default' ? join(root, 'books', shelf.last, 'haligtree.db') : join(root, 'haligtree.db')
const db = new DatabaseSync(file, { readOnly: true })
const note = db.prepare("select id from captures where status = 'open' and kind = 'note' and body is not null order by length(body) desc limit 1").get()
db.close()
const load = () => `load ${loadavg()[0].toFixed(1)}`
const EDITOR = '.tiptap.ProseMirror.haligtree-editor:not(.is-line)'

const c = await sandbox({ width: 1300, height: 900, seeded: false })
const { h, send } = c
try {
  await h.evaluate(() => window.api.haligtree('onboarding:set', { welcomed: new Date().toISOString(), newsSeen: true, welcoming: false, pageHints: false }))
  await h.evaluate(() => window.api.haligtree('settings:set', { sounds: false, hintRate: 0 }))
  await send('view', 'inbox')
  await h.waitForTimeout(2000)
  await send('capture', note.id)
  await h.waitForFunction((sel) => [...document.querySelectorAll(sel)].some((one) => one.childElementCount > 5000), EDITOR, { timeout: 60000 })
  await h.waitForTimeout(4000)
  const blocks = await h.evaluate((sel) => Math.max(...[...document.querySelectorAll(sel)].map((one) => one.childElementCount)), EDITOR)
  // The sidebar's Tags, unfolded with a click on their heading if they are folded.
  const heading = await h.evaluate(() => {
    if (document.querySelector('[data-note-hover][data-note^="tag:"]')) return null
    const button = [...document.querySelectorAll('button')].find((one) => one.textContent.trim() === 'Tags' && one.getBoundingClientRect().width > 0)
    const r = button?.getBoundingClientRect()
    return r ? { x: Math.round(r.left + 20), y: Math.round(r.top + r.height / 2) } : null
  })
  if (heading) (await h.mouse.click(heading.x, heading.y), await h.waitForTimeout(800))
  // A line of the note on screen, to write in and to right-click, and a tag in the sidebar, whose card comes up on pointing.
  const spots = await h.evaluate((sel) => {
    const ed = [...document.querySelectorAll(sel)].sort((a, b) => b.childElementCount - a.childElementCount)[0]
    const line = [...ed.children].find((one) => one.tagName === 'P' && one.getBoundingClientRect().top > 160 && one.getBoundingClientRect().bottom < innerHeight - 160 && one.textContent.trim().length > 30)
    const tag = [...document.querySelectorAll('[data-note-hover][data-note^="tag:"]')].find((one) => { const r = one.getBoundingClientRect(); return r.width > 0 && r.top > 60 && r.bottom < innerHeight - 20 })
    const at = (el, dx = 0) => { const r = el.getBoundingClientRect(); return { x: Math.round(r.left + Math.min(r.width / 2, 40) + dx), y: Math.round(r.top + r.height / 2) } }
    const edge = ed.getBoundingClientRect()
    return { line: line && at(line), tag: tag && at(tag), away: { x: Math.round(edge.left + edge.width / 2), y: Math.round(innerHeight - 60) } }
  }, EDITOR)
  console.log(`the note: ${blocks} blocks, ${await h.evaluate(() => document.querySelectorAll('*').length)} elements in the window  (${load()})`)
  if (!spots.line) throw new Error('no line of the note on screen')
  await h.mouse.click(spots.line.x, spots.line.y)
  await h.waitForTimeout(800)

  const cdp = await c.electron.context().newCDPSession(h)
  /** The biggest style pass while `act` runs and the page settles after it. */
  const traced = async (act) => {
    const events = []
    const take = ({ value }) => events.push(...value)
    cdp.on('Tracing.dataCollected', take)
    const ended = new Promise((resolve) => cdp.once('Tracing.tracingComplete', resolve))
    const why = !!process.env.WHY
    await cdp.send('Tracing.start', { transferMode: 'ReportEvents', traceConfig: { includedCategories: ['devtools.timeline', 'disabled-by-default-devtools.timeline', ...(why ? ['disabled-by-default-devtools.timeline.invalidationTracking'] : [])], excludedCategories: ['*'] } })
    // Ended whatever happens, or a kind that stops leaves the next one unable to trace.
    try {
      await act()
      await h.waitForTimeout(450)
    } finally {
      await cdp.send('Tracing.end')
      await ended
      cdp.off('Tracing.dataCollected', take)
    }
    const big = events.filter((e) => e.name === 'UpdateLayoutTree' && e.ph === 'X').sort((a, b) => b.dur - a.dur)[0]
    const pass = { ms: big ? big.dur / 1000 : 0, elements: big?.args?.elementCount ?? 0 }
    if (why) {
      const whole = events.filter((e) => e.name === 'StyleInvalidatorInvalidationTracking' && /subtree/.test(e.args.data.reason ?? ''))
      const has = events.filter((e) => e.name === 'ScheduleStyleInvalidationTracking' && e.args.data.changedPseudo === 'has').map((e) => e.args.data.nodeName.split(' ')[0])
      const hits = new Map()
      for (const e of events.filter((one) => one.name === 'StyleInvalidatorInvalidationTracking' && !/subtree/.test(one.args.data.reason ?? ''))) {
        const key = `${e.args.data.reason}: ${(e.args.data.selectors ?? []).map((s) => s.selector).join(' ;; ').slice(0, 200)}`
        hits.set(key, (hits.get(key) ?? 0) + 1)
      }
      pass.why = [
        ...whole.map((e) => `whole ${e.args.data.nodeName.slice(0, 70)}: ${(e.args.data.selectors ?? []).map((s) => s.selector).join(' ;; ').slice(0, 300)}`),
        ...(has.length ? [`:has() asked again on ${[...new Set(has)].join(', ')} (${has.length})`] : []),
        ...[...hits].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([key, n]) => `${n} x ${key}`),
      ]
    }
    return pass
  }
  const shown = (sel) => h.waitForSelector(sel, { state: 'attached', timeout: 8000 })
  const gone = (sel) => h.waitForSelector(sel, { state: 'detached', timeout: 8000 })
  const kinds = [
    ['⌘K', async () => (await h.keyboard.press('Meta+k'), await shown('[role="dialog"][aria-label="Search"]')), async () => (await h.keyboard.press('Escape'), await gone('div[aria-label="Search"]'))],
    // The block's menu stays in the page once closed (data-state="closed"): open is what counts.
    ['a block\'s menu', async () => (await h.mouse.click(spots.line.x, spots.line.y, { button: 'right' }), await shown('[role="menu"][data-state="open"]')), async () => (await h.keyboard.press('Escape'), await gone('[role="menu"][data-state="open"]'))],
    ...(spots.tag ? [['a hover card', async () => (await h.mouse.move(spots.tag.x - 30, spots.tag.y), await h.mouse.move(spots.tag.x, spots.tag.y, { steps: 4 }), await shown('[data-note-preview]')), async () => (await h.mouse.move(spots.away.x, spots.away.y, { steps: 4 }), await gone('[data-note-preview]'))]] : []),
    // TYPED=1: a new line typed and taken out again, shown, not held to the bar (the editor's own work is in that pass
    // too). A line put in among the note's blocks still has Chromium restyle every paragraph, and the position rules
    // (:nth-child) mark every block: minutes a run, so not by default.
    ...(process.env.TYPED ? [['a new line typed', async () => (await h.keyboard.press('Meta+ArrowRight'), await h.keyboard.press('Enter')), async () => await h.keyboard.press('Backspace'), 'shown']] : []),
  ]
  if (!spots.tag) console.log('(no tag in the sidebar on screen: no hover card to point at)')
  for (const [name, open, close, shownOnly] of kinds) {
    const opens = [], closes = []
    if (shownOnly) (await h.mouse.click(spots.line.x, spots.line.y), await h.waitForTimeout(500))
    let step = 'opening'
    try {
      for (let i = 0; i < TIMES; i++) {
        step = `opening it the ${i + 1}. time`
        opens.push(await traced(open))
        step = `closing it the ${i + 1}. time`
        closes.push(await traced(close))
      }
    } catch (error) {
      // A menu that will not go (it once stayed open after Esc): said, with what was open and focused, and the run goes on.
      const left = await h.evaluate(() => ({ open: [...document.querySelectorAll('[data-state="open"]')].map((one) => `${one.tagName.toLowerCase()}[role=${one.getAttribute('role')}]`).slice(0, 4), focus: `${document.activeElement?.tagName.toLowerCase()}.${String(document.activeElement?.className).split(' ')[0]}` }))
      check(`${name}: opened and closed ${TIMES} times`, false, `stopped ${step}: ${String(error.message).split('\n')[0]}; open: ${left.open.join(', ') || 'nothing'}; focus on ${left.focus}  (${load()})`)
      await h.keyboard.press('Escape')
      await h.keyboard.press('Escape')
      await h.mouse.click(spots.line.x, spots.line.y)
      continue
    }
    const say = (list) => list.map((one) => `${one.ms.toFixed(1)}/${one.elements}`).join(' ')
    console.log(`${name} opened (ms/elements): ${say(opens)}\n${name} closed (ms/elements): ${say(closes)}  (${load()})`)
    const worst = [...opens, ...closes].sort((a, b) => b.ms - a.ms)[0]
    if (worst.why?.length) console.log(`  the biggest pass of ${name}:\n    ${worst.why.join('\n    ')}`)
    if (!shownOnly) check(`${name}, opened and closed ${TIMES} times over the largest note: every style pass under ${BAR} ms`, [...opens, ...closes].every((one) => one.ms < BAR), `worst ${worst.ms.toFixed(1)} ms, ${worst.elements} elements restyled  (${load()})`)
  }
  check('a hover card was pointed at', !!spots.tag)
  const faults = c.errors.filter((line) => !/ERR_FILE_NOT_FOUND|ERR_BLOCKED_BY_RESPONSE|status of 40\d/.test(line))
  check('no page errors', !faults.length, faults.slice(0, 3).join(' | '))
} finally {
  await c.close()
}
done()
