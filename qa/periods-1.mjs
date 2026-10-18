// Decisions, experiments, other names, Recent, the week and month pages and questions kept in view, driven in the real app.
import { start, done } from './shots-lib.mjs'
const T = process.env.THEME ?? 'dark'
const c = await start()
const { page, electron } = c
const log = (...a) => console.log(...a)
const step = async (name, fn) => { try { await fn() } catch (e) { log('STEP FAIL', name, e.message.slice(0, 300)) } }
await c.v('settings:set', { safeMode: false, motion: true, hintRate: 0, rotCount: 0, scenery: false })
await c.theme(T)
const doc = (...blocks) => ({ type: 'doc', content: blocks })
const p = (text) => ({ type: 'paragraph', content: [{ type: 'text', text }] })
const toasts = async (w) => w.evaluate(() => [...document.querySelectorAll('[data-sonner-toast], [role="status"]')].map((e) => e.innerText.replace(/\n/g, ' ')).slice(-3))

let ids = {}
await step('migration', async () => {
  const rows = await page.evaluate(() => window.api.captures.list())
  const decisions = rows.filter((r) => r.kind === 'decision')
  for (const d of decisions) log('migrated', d.number, JSON.stringify(await c.v('notes:fields', 'captures', d.id)))
})

await step('seed', async () => {
  ids.exp = await page.evaluate((b) => window.api.captures.create({ kind: 'experiment', body: b }), doc(p('Write every morning for two weeks'), p('Would a daily writing habit make momentum?')))
  ids.dec = await page.evaluate((b) => window.api.captures.create({ kind: 'decision', body: b }), doc(p('Move the newsletter to Sundays')))
  ids.cosmetic = await page.evaluate((b) => window.api.captures.create({ kind: 'note', body: b }), doc(p('Why is cosmetic surgery so polarising?')))
  log('set alias', JSON.stringify(await c.v('aliases:set', 'captures', ids.cosmetic, ['why do we care so much about Botox?', ' botox ', 'botox'])))
  log('aliases', JSON.stringify(await c.v('aliases', 'captures', ids.cosmetic)))
  const at = (await page.evaluate(() => window.api.captures.search('Botox'))).map((r) => r.label)
  const find = (await page.evaluate(() => window.api.captures.find('care so much Botox'))).map((r) => r.label)
  log('@ finds by alias', JSON.stringify(at), '⌘K finds by alias', JSON.stringify(find))
  // A question, and an item alias
  ids.q = await c.v('question:new', 'What do I actually want from writing?')
  await c.v('aliases:set', 'nuggets', ids.q, ['writing purpose'])
  log('items:find by alias', JSON.stringify((await c.v('items:find', 'purpose')).map((r) => r.title)))
  log('pin q', await c.v('question:pin', ids.q, true), JSON.stringify(await c.v('questions:pinned')))
  // Twelve at most
  const more = []
  for (let n = 0; n < 12; n++) { const id = await c.v('question:new', `Held question number ${n + 1}`); more.push(await c.v('question:pin', id, true)) }
  log('pins after 12 more', JSON.stringify(more), 'count', (await c.v('questions:pinned')).length)
  // Keep three in view for the screenshots
  for (const one of (await c.v('questions:pinned')).slice(3)) await c.v('question:pin', one.id, false)
  log('recent 7', (await c.v('recent', 7)).length, JSON.stringify((await c.v('recent', 7)).slice(0, 4).map((r) => [r.type, r.title.slice(0, 30)])))
  const monday = (() => { const d = new Date(); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d.toISOString().slice(0, 10) })()
  await c.v('period:save', `week:${monday}`, { fields: { summary: 'A slow start, then the draft came together on Thursday.', people: 'Ana, Tom', theme: 'Shipping the ugly draft' } })
  await c.v('period:save', 'month:2026-09', { fields: { focus: 'Protect the mornings', season: 'The month I stopped waiting for permission' } })
  await c.v('period:save', 'month:2026-10', { fields: { focus: 'Finish the essay' } })
  log('year', JSON.stringify(await c.v('periods:year', '2026')))
  await c.v('period:save', 'month:2026-08', { fields: { focus: 'x' } }); await c.v('period:save', 'month:2026-08', { fields: { focus: null } })
  log('emptied page gone', JSON.stringify(await c.v('period', 'month:2026-08')))
})

const home = await c.showHome(1180, 780)
const hv = (ch, ...a) => home.evaluate(([ch, a]) => window.api.vigil(ch, ...a), [ch, a])

await step('decision', async () => {
  await c.send('capture', ids.dec); await home.waitForTimeout(1200)
  await c.shot(home, `pe-${T}-decision-open`)
  await home.getByRole('button', { name: 'Deciding' }).click(); await home.waitForTimeout(700)
  log('after Deciding', JSON.stringify(await hv('notes:fields', 'captures', ids.dec)), JSON.stringify(await toasts(home)))
  await home.getByLabel('Working out').fill('Pro: readers are home on Sundays. Con: I write on Saturdays.'); await home.locator('body').click({ position: { x: 5, y: 400 } }); await home.waitForTimeout(500)
  await c.shot(home, `pe-${T}-decision-deciding`)
  await home.getByRole('button', { name: 'Decided' }).click(); await home.waitForTimeout(1500)
  log('after Decided', JSON.stringify(await hv('notes:fields', 'captures', ids.dec)))
  await c.shot(home, `pe-${T}-decision-decided`)
  log('scan decision', JSON.stringify(await c.scan(home)).slice(0, 600))
})

await step('experiment', async () => {
  await c.send('capture', ids.exp); await home.waitForTimeout(1200)
  await home.getByRole('button', { name: 'Running' }).click(); await home.waitForTimeout(400)
  await home.getByLabel('Main question').fill('Would rebuilding a daily writing habit create momentum?')
  await home.getByLabel('Outcome').fill('Thinking much more clearly, but still blocked on publishing it.'); await home.locator('body').click({ position: { x: 5, y: 400 } }); await home.waitForTimeout(400)
  await home.getByRole('button', { name: 'A day, a decision or an experiment' }).click(); await home.waitForTimeout(700)
  await c.shot(home, `pe-${T}-context-picker`)
  await home.keyboard.press('Enter'); await home.waitForTimeout(800)
  log('exp fields', JSON.stringify(await hv('notes:fields', 'captures', ids.exp)))
  await c.shot(home, `pe-${T}-experiment`)
  await home.getByRole('button', { name: 'Decide from this' }).click(); await home.waitForTimeout(1500)
  const lineage = await hv('lineage', ids.exp)
  log('became', JSON.stringify(lineage.became.map((r) => r.title)))
  const made = lineage.became[0]?.id
  if (made) { log('decision from', JSON.stringify((await hv('lineage', made)).from.map((r) => r.title)), JSON.stringify(await hv('notes:fields', 'captures', made))) }
  await c.shot(home, `pe-${T}-decided-from`)
})

await step('aliases ui', async () => {
  await c.send('capture', ids.cosmetic); await home.waitForTimeout(1200)
  await home.getByLabel('Another name for this note').fill('beauty standards'); await home.keyboard.press('Enter'); await home.waitForTimeout(700)
  log('aliases after ui', JSON.stringify(await hv('aliases', 'captures', ids.cosmetic)))
  await c.shot(home, `pe-${T}-aliases`)
})

await step('week + recent', async () => {
  await c.send('view', 'weekpage'); await home.waitForTimeout(1200)
  await home.getByRole('button', { name: 'Recent', exact: true }).click(); await home.waitForTimeout(1200)
  await c.shot(home, `pe-${T}-week-recent`)
  log('scan week', JSON.stringify(await c.scan(home)).slice(0, 800))
  await home.keyboard.press('ArrowLeft'); await home.waitForTimeout(900)
  await c.shot(home, `pe-${T}-week-before`)
  await home.keyboard.press('Meta+Shift+y'); await home.waitForTimeout(600)
  log('recent closed', await home.locator('aside[aria-label="Recent"]').count())
})

await step('month + year', async () => {
  await c.send('view', 'monthpage'); await home.waitForTimeout(1200)
  await c.shot(home, `pe-${T}-month`)
  await home.getByRole('button', { name: 'Year' }).first().click(); await home.waitForTimeout(1200)
  await c.shot(home, `pe-${T}-year`)
  log('scan year', JSON.stringify(await c.scan(home)).slice(0, 400))
  await c.emulate(700, 700); await home.waitForTimeout(500)
  await c.send('view', 'weekpage'); await home.waitForTimeout(1000)
  await home.keyboard.press('Meta+Shift+y'); await home.waitForTimeout(800)
  await c.shot(home, `pe-${T}-narrow-week-recent`)
  log('scan narrow', JSON.stringify(await c.scan(home)).slice(0, 800))
})

await step('day page struck through', async () => {
  await c.emulate(1180, 780)
  const id = await page.evaluate((b) => window.api.captures.create({ kind: 'note', body: b }), doc(p('Dealt with already today')))
  await page.evaluate((id) => window.api.captures.save(id, { status: 'resolved' }), id)
  const today = new Date(); const day = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  await hv('notes:day:save', day, { body: doc(p('Plan'), { type: 'taskList', content: [{ type: 'taskItem', attrs: { checked: true }, content: [p('call Ana')] }, { type: 'taskItem', attrs: { checked: false }, content: [p('draft intro')] }] }) })
  await c.send('day', day); await home.waitForTimeout(1500)
  await c.shot(home, `pe-${T}-day`)
})

await step('box: pinned + recent tab', async () => {
  await electron.evaluate(({ BrowserWindow }) => { for (const w of BrowserWindow.getAllWindows()) if (!w.webContents.getURL().includes('home')) { w.show(); w.setBounds({ width: 1100, height: 720 }) } })
  await page.waitForTimeout(600)
  await c.qa.reset()
  await page.keyboard.type('Noticed I only write when nobody is waiting on it')
  await page.waitForTimeout(1500)
  await c.shot(page, `pe-${T}-box-pinned`)
  await page.getByRole('button', { name: /What do I actually want/ }).click(); await page.waitForTimeout(800)
  log('clue added', JSON.stringify((await c.v('item', ids.q)).glosses.map((g) => g.body)))
  await page.keyboard.press('Meta+Shift+y'); await page.waitForTimeout(1200)
  await c.shot(page, `pe-${T}-box-recent`)
  log('scan box', JSON.stringify(await c.scan(page)).slice(0, 800))
})

done(c)
