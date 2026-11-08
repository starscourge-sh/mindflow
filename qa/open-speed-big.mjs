// Opening is instant on a big book: 800 captures, 700 gems, 400 tasks with no
// date and 150 tags. Timed from the click to the first frame that shows the
// thing opened, five times each, in two places:
//   quick capture's Tasks tab, "No date": a task row opens the task on the left
//   ("Back to your note", its title);
//   the main window's Tags page: a tag in the list shows its page (its name
//   in the page's header, over its first note).
// The pointer rests on the row a little over a tenth of a second before the
// click, as a hand coming to it does (what a row reads ahead starts then).
// Each must show within 100 ms (the median), and no single one over 200 ms.
//
//   npx electron-vite build --outDir out-p
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-p/main/index.js HALIGTREE_QA_AWAY=1 node qa/open-speed-big.mjs
import { DatabaseSync } from 'node:sqlite'
import { randomUUID } from 'crypto'
import { join } from 'path'
import { sandbox } from './sandbox-lib.mjs'
import { checks } from './harness.mjs'
process.env.QA_ARGS ??= '--sandbox'

const CAPTURES = 800, GEMS = 700, TASKS = 400, TAGS = 150
const { check, done } = checks()
const doc = (text) => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] })
const filler = 'A line of ordinary words, long enough to wrap once or twice on the page and be read like a real note would be. '

// The book made once, the gems written into it while the app is shut (as qa/big-group-speed.mjs does).
const first = await sandbox({ width: 1300, height: 900 })
await first.v('onboarding:set', { welcomed: new Date().toISOString(), newsSeen: true, pageHints: false })
await first.v('settings:set', { sounds: false, hintRate: 0, countIn: false })
await first.close()
const db = new DatabaseSync(join(process.env.QA_DATA, 'sandbox', 'haligtree.db'))
db.exec('begin')
const gem = db.prepare("insert into nuggets (id, tier, kind, title, body, created_at, updated_at) values (?, 'nugget', 'note', '', ?, ?, ?)")
for (let i = 0; i < GEMS; i++) {
  const at = new Date(Date.now() - i * 60000).toISOString()
  gem.run(randomUUID(), JSON.stringify(doc(`Gem ${i + 1}. ${filler}#tag${i % TAGS}`)), at, at)
}
db.exec('commit')
db.close()

const c = await sandbox({ width: 1300, height: 900, seeded: false })
const { h, page, v, go } = c
const timer = (win) => win.evaluate(() => {
  // From the click to the first frame in which `test` holds; the longest task meanwhile.
  window.__arm = (src) => {
    const test = new Function(`return (${src})`)()
    window.__took = null
    window.__long = []
    const seen = new PerformanceObserver((list) => list.getEntries().forEach((one) => window.__long.push(Math.round(one.duration))))
    seen.observe({ type: 'longtask' })
    document.addEventListener('click', () => {
      const at = performance.now()
      const look = () => {
        if (test()) return void ((window.__took = Math.round(performance.now() - at)), setTimeout(() => seen.disconnect(), 300))
        if (performance.now() - at < 5000) requestAnimationFrame(look)
      }
      requestAnimationFrame(look)
    }, { capture: true, once: true })
  }
})
// QA_PROFILE=1: a CPU profile of one click in each place, the costliest functions printed.
const profile = async (win, run) => {
  if (!process.env.QA_PROFILE || !win) return run()
  const cdp = await c.electron.context().newCDPSession(win)
  await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 200 }); await cdp.send('Profiler.start')
  await run()
  const { profile } = await cdp.send('Profiler.stop')
  const byId = new Map(profile.nodes.map((node) => [node.id, node]))
  const parent = new Map()
  for (const node of profile.nodes) for (const child of node.children ?? []) parent.set(child, node.id)
  const where = (node) => `${node.callFrame.functionName || '(anon)'} ${node.callFrame.url.split('/').pop()}:${node.callFrame.lineNumber + 1}`
  const self = new Map(), total = new Map()
  profile.samples.forEach((id, at) => {
    const us = profile.timeDeltas[at] ?? 0
    self.set(where(byId.get(id)), (self.get(where(byId.get(id))) ?? 0) + us)
    const seen = new Set()
    for (let up = id; up; up = parent.get(up)) { const key = where(byId.get(up)); if (!seen.has(key)) (seen.add(key), total.set(key, (total.get(key) ?? 0) + us)) }
  })
  const top = (map, n) => [...map].filter(([k]) => !/^\((idle|program|root|garbage collector)\)/.test(k)).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, us]) => `  ${(us / 1000).toFixed(1).padStart(7)}ms  ${k}`).join('\n')
  console.log(`--- self\n${top(self, 20)}\n--- inclusive\n${top(total, 50)}`)
}
const median = (list) => [...list].sort((a, b) => a - b)[Math.floor(list.length / 2)]
const verdict = (name, times, longs) => check(`${name}: median under 100 ms, none over 200 ms`, median(times) < 100 && Math.max(...times) <= 200, `${times.join(', ')} ms; long tasks ${JSON.stringify(longs)}`)

try {
  await v('settings:set', { sounds: false, hintRate: 0, countIn: false })
  // Captures and tasks through the app, so their tags are read as written.
  await h.evaluate(async ({ CAPTURES, TASKS, TAGS, filler }) => {
    const doc = (text) => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] })
    for (let i = 0; i < CAPTURES; i += 50) await Promise.all(Array.from({ length: Math.min(50, CAPTURES - i) }, (_, k) => window.api.captures.create({ body: doc(`Capture ${i + k + 1}. ${filler}#tag${(i + k) % TAGS}`) })))
    for (let i = 0; i < TASKS; i += 50) await Promise.all(Array.from({ length: Math.min(50, TASKS - i) }, (_, k) => window.api.haligtree('task:add', `Errand ${i + k + 1} #tag${(i + k) % TAGS}`)))
  }, { CAPTURES, TASKS, TAGS, filler })
  const tags = await v('tags')
  console.log(`book: ${(await v('tasks')).length} tasks, ${tags.length} tags`)

  // 1. The main window's Tags page.
  await go('tags'); await h.waitForTimeout(1500)
  await timer(h)
  const tagTimes = [], tagLong = []
  for (const at of [1, 6, 11, 3, 8]) {
    // The rows on screen (the list draws only those), by their place in it.
    const row = h.locator('[data-row]').filter({ has: h.locator('span.truncate') }).nth(at)
    const tag = (await row.locator('span.truncate').first().textContent()).trim()
    await h.evaluate((tag) => window.__arm(`() => document.querySelector('[data-tag-head] [data-tag-title]')?.textContent.trim().replace(/^#/, '') === ${JSON.stringify(tag)}`), tag)
    await row.hover(); await h.waitForTimeout(120)
    await profile(at === 6 ? h : null, async () => {
      await row.click()
      await h.waitForFunction(() => window.__took !== null, null, { timeout: 6000 }).catch(() => {})
    })
    await h.waitForTimeout(500)
    const { took, long } = await h.evaluate(() => ({ took: window.__took, long: window.__long }))
    tagTimes.push(took ?? 9999); tagLong.push(...long)
    await h.waitForTimeout(400)
  }
  verdict('a tag clicked on the Tags page shows its page', tagTimes, tagLong)

  // 2. Quick capture's Tasks tab, "No date".
  await page.evaluate(() => window.api.showPrompt())
  await page.waitForTimeout(900)
  if (!(await page.locator('[aria-label="Hide the side panel"]').count())) await page.locator('[aria-label="Show the side panel"]').click().catch(() => {})
  await page.waitForTimeout(500)
  await page.locator('[data-home="task"]').first().click(); await page.waitForTimeout(700)
  await page.getByRole('button', { name: /^No date/ }).first().click(); await page.waitForTimeout(900)
  // The list draws only the rows in sight (a long one), so its chip says how many it holds.
  const drawn = await page.locator('[data-row][data-id]').count()
  const last = await page.evaluate(async () => { const list = document.querySelector('[data-vlist]'); let box = list?.parentElement; while (box && !/auto|scroll/.test(getComputedStyle(box).overflowY)) box = box.parentElement; if (!box) return -1; box.scrollTop = box.scrollHeight; await new Promise((done) => setTimeout(done, 400)); const at = Math.max(...[...list.querySelectorAll('[data-index]')].map((one) => Number(one.dataset.index))); box.scrollTop = 0; await new Promise((done) => setTimeout(done, 300)); return at })
  check('the No date list holds the book\'s tasks, and draws only those in sight', last >= TASKS - 1 && drawn < 60, `its last row is number ${last + 1}, ${drawn} rows drawn`)
  await timer(page)
  const taskTimes = [], taskLong = []
  for (const at of [2, 9, 25, 4, 60]) {
    // The row at that place in the list, scrolled to (a long list draws it once it is near the screen).
    const row = page.locator(`[data-index="${at}"] [data-row][data-id]`)
    for (let tries = 0; tries < 20 && !(await row.count()); tries++) {
      await page.evaluate((at) => { const list = document.querySelector('[data-vlist]'); let box = list?.parentElement; while (box && !/auto|scroll/.test(getComputedStyle(box).overflowY)) box = box.parentElement; if (box) box.scrollTop = at * 44 }, at)
      await page.waitForTimeout(100)
    }
    await row.scrollIntoViewIfNeeded()
    const title = (await row.locator('[data-task-title]').textContent()).trim()
    await page.evaluate((title) => window.__arm(`() => [...document.querySelectorAll('button')].some((one) => one.textContent.includes('Back to your note')) && [...document.querySelectorAll('.note-pane')].some((one) => one.textContent.includes(${JSON.stringify(title)}))`), title)
    await row.hover(); await page.waitForTimeout(120)
    await profile(at === 9 ? page : null, async () => {
      await row.click()
      await page.waitForFunction(() => window.__took !== null, null, { timeout: 6000 }).catch(() => {})
    })
    await page.waitForTimeout(500)
    const { took, long } = await page.evaluate(() => ({ took: window.__took, long: window.__long }))
    taskTimes.push(took ?? 9999); taskLong.push(...long)
    await page.waitForTimeout(300)
  }
  verdict('a task clicked in quick capture\'s No date opens on the left', taskTimes, taskLong)
  check('no page errors', !c.errors.length, c.errors.slice(0, 3).join(' | '))
} finally {
  await c.close()
}
done()
