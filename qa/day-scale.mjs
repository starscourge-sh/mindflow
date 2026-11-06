// The Journal's day with 5,000 notes made that day (BOOK=n for another size): its tasks drawn in under 2 seconds, the
// Captured list at its first 50 rows with "Show 100 more of 4,950" under them. PROFILE=file keeps a CPU profile,
// SHOT=file a picture of the list's foot. On main (beta.150) the tasks took 40.7 s, every one of the 5,000 rows drawn.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/day-scale.mjs
import { checks } from './harness.mjs'
const { check, done } = checks()
import { writeFileSync } from 'node:fs'
const N = Number(process.env.BOOK ?? 5000)
const { open } = await import('./harness.mjs')
const qa = await open()
const { electron, page } = qa
try {
  await page.evaluate(() => window.api.haligtree('onboarding:set', { welcomed: new Date().toISOString(), newsSeen: true, welcoming: false, pageHints: false }))
  const made = Date.now()
  await page.evaluate(async (n) => {
    for (let i = 0; i < n; i += 50) await Promise.all(Array.from({ length: Math.min(50, n - i) }, (_, j) => j + i).map((i) => window.api.captures.create({ kind: 'note', body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: `A walk along the river, again (${i}). Notes on the Calvin cycle came up too.` }] }] } })))
  }, N)
  console.log(`made ${N} notes in ${Date.now() - made} ms`)
  await page.evaluate(() => window.api.haligtree('task:add', 'Hand in the Stoicism essay today 5pm'))
  const h = electron.windows().find((w) => w.url().includes('view=home'))
  await h.reload(); await h.waitForTimeout(2500); await h.keyboard.press('Escape')
  const cdp = process.env.PROFILE ? await h.context().newCDPSession(h) : null
  if (cdp) { await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 500 }); await cdp.send('Profiler.start') }
  const t0 = Date.now()
  await electron.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().includes('view=home'))?.webContents.send('home:open', 'view', 'day'))
  await h.locator('[data-pane]').getByText('Hand in the Stoicism essay').first().waitFor({ timeout: 120000 })
  const took = Date.now() - t0
  console.log(`RESULT task list drawn after ${took} ms`)
  check(`${N} notes made today: the day's tasks are drawn in under 2 s`, took < 2000, `${took} ms`)
  await h.waitForTimeout(3000)
  console.log('DOM', JSON.stringify(await h.evaluate(() => {
    const all = document.querySelectorAll('*').length
    const big = [...document.querySelectorAll('*')].map((el) => [el.childElementCount, el]).sort((a, b) => b[0] - a[0]).slice(0, 5).map(([n, el]) => `${n} ${el.tagName} ${[...el.attributes].map((a) => a.name).join(',')} ${el.className.toString().slice(0, 60)} | ${el.parentElement?.closest('[data-pane] [class]')?.tagName}`)
    return { all, big, rows: document.querySelectorAll('[data-row]').length }
  })))
  const more = await h.evaluate(() => document.querySelector('[data-show-more]')?.innerText.replace(/\s+/g, ' ') ?? '')
  check('the Captured list shows its first 50, the rest a press away', N <= 50 || more === `Show 100 more of ${(N - 50).toLocaleString('en-GB')}`, more)
  if (process.env.SHOT) { await h.evaluate(() => document.querySelector('[data-show-more]')?.scrollIntoView({ block: 'center' })); await h.waitForTimeout(500); await h.screenshot({ path: process.env.SHOT }) }
  if (cdp) { const { profile } = await cdp.send('Profiler.stop'); writeFileSync(process.env.PROFILE, JSON.stringify(profile)) }
} finally { await qa.close?.() ?? electron.close() }
done()
