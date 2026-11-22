// Start fresh, as the person who imported Obsidian and tested for months runs it (start-fresh.ts, start-fresh.tsx): Settings ›
// Your book, "Start fresh…" unfolds what it will do with the book's real counts; they hold to confirm; Writing is empty but
// for "From Obsidian", the Feed, Home and Review show nothing put away, the PDFs and stats are gone, and a whole copy
// was made first. Then they bring back one gem from the pass (B) and one folder from its right-click, and see both in Writing.
//   cp -cR <sandbox-seed.noindex/c-tip> <yours>; QA_ARGS=--sandbox QA_DATA=<yours> QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/start-fresh.mjs
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const { check: told, done } = checks()
const c = await sandbox({ width: 1300, height: 900 })
const { h, v } = c
const wait = (ms) => h.waitForTimeout(ms)
const file = join(process.env.QA_DATA, 'sandbox', 'haligtree.db')
// The book read on its own, never through the app: what the screen's numbers must equal.
const sql = (query, ...args) => { const db = new DatabaseSync(file, { readOnly: true }); try { return db.prepare(query).get(...args) } finally { db.close() } }
const n = (query, ...args) => Number(Object.values(sql(query, ...args))[0] ?? 0)
const notice = () => h.evaluate(() => [...document.querySelectorAll('[role="status"]')].map((one) => one.textContent).join(' | '))
h.setDefaultTimeout(8000)
// A failed check says what was on screen: the notice and the page's last errors.
const check = async (name, ok, detail = '') => told(name, ok, ok ? detail : `${detail} | notice: ${await notice().catch(() => '?')} | errors: ${c.errors.slice(-4).join(' / ') || 'none'}`)
// Frames for the lead to read, with QA_SHOTS set: the plan, mid-hold, after.
const shot = (name) => (process.env.QA_SHOTS ? h.screenshot({ path: join(process.env.QA_SHOTS, `start-fresh-${name}.png`) }) : Promise.resolve())
try {
  await v('settings:set', { sounds: false, hintRate: 0 })
  // Test material to delete: a highlight and a ribbon in a PDF, a grade in Review's history.
  await v('pdf:highlight', 'haligtree://assets/' + 'a'.repeat(64) + '.pdf', { page: 1, quote: 'a test mark', start: 0, end: 11 })
  await v('ribbon:lay', 'haligtree://assets/' + 'a'.repeat(64) + '.pdf', { page: 3 })
  const before = {
    folders: n("select count(*) from note_groups where list = 'folders' and parent_id is null"),
    gems: n("select count(*) from nuggets where binned_at is null and superseded_by is null and archived_at is null and tier in ('nugget', 'question')"),
    pages: n("select count(*) from nuggets where binned_at is null and superseded_by is null and archived_at is null and tier = 'article'"),
    tasks: n("select count(*) from tasks where status = 'open'"),
    highlights: n('select count(*) from pdf_highlights'),
    inbox: n("select count(*) from captures where status = 'open' and folder_id is null and archived_at is null")
  }
  await c.go('settings'); await h.click('[data-section="Your book"]'); await wait(600)
  await h.click('[data-fresh-open]'); await wait(1200)
  const shown = await h.evaluate(() => Object.fromEntries([...document.querySelectorAll('[data-fresh-line]')].map((one) => [one.getAttribute('data-fresh-line'), Number(one.getAttribute('data-n'))])))
  await check('the plan says the book’s own counts: folders, pages, gems, open tasks, highlights',
    shown.folders === before.folders && shown.gems === before.gems && shown.pages === before.pages && shown.tasks === before.tasks && shown.highlights === before.highlights, JSON.stringify({ shown, before }))
  await check('it says where the copy goes before anything happens', /before start fresh/.test(await h.locator('[data-fresh-backup]').textContent()))
  // A first-timer clicks the hold button instead of holding it: nothing happens.
  // The plan is long: its button brought into view first, as a person scrolls to it (raw pointer moves never scroll).
  const button = h.locator('[data-fresh-plan] button', { hasText: 'Hold to start fresh' })
  await button.scrollIntoViewIfNeeded(); await wait(400)
  await shot('plan')
  const hold = await button.boundingBox()
  await h.mouse.click(hold.x + hold.width / 2, hold.y + hold.height / 2); await wait(800)
  await check('a plain click does nothing', n("select count(*) from note_groups where list = 'folders' and name = 'From Obsidian'") === 0)
  // Held as settings-books holds: 1,500 ms on the button's centre.
  await h.mouse.move(hold.x + hold.width / 2, hold.y + hold.height / 2); await h.mouse.down(); await wait(600)
  await shot('mid-hold')
  await wait(900); await h.mouse.up()
  let ran = false
  for (let i = 0; i < 40 && !ran; i++) (await wait(200), (ran = /Started fresh/.test(await notice())))
  await shot('after')
  await check('held, it runs and says what it did, with “Show me”', ran && /Show me/.test(await notice()), await notice())
  const backups = join(process.env.QA_DATA, 'sandbox', 'backups')
  const copy = existsSync(backups) ? readdirSync(backups).find((one) => one.startsWith('before start fresh')) : null
  await check('a whole copy of the book was made first', !!copy && existsSync(join(backups, copy, 'haligtree.db')), copy)
  const top = await v('folders')
  await check('Writing’s top is only “From Obsidian”', top.filter((one) => !one.parent).map((one) => one.name).join() === 'From Obsidian', top.filter((one) => !one.parent).map((one) => one.name).join())
  await check('no page or gem left loose in Writing', (await v('folders:items', 'unfiled')).length === 0)
  await check('every gem and page put away, none deleted', n("select count(*) from nuggets where binned_at is null and archived_at is null and tier in ('nugget', 'question', 'article')") === 0 && n("select count(*) from nuggets where tier in ('nugget', 'question', 'article')") >= before.gems + before.pages)
  await check('the Inbox kept as it was', n("select count(*) from captures where status = 'open' and folder_id is null and archived_at is null") === before.inbox)
  await check('Review has no decks and nothing due', (await v('decks:list')).length === 0 && (await v('review:queue')).length === 0)
  await check('Tasks shows none of the old open tasks', (await v('tasks')).filter((one) => one.status === 'open').length === 0)
  await check('highlights, ribbons, reading progress and review history at zero', n('select count(*) from pdf_highlights') + n('select count(*) from ribbons') + n('select count(*) from pdf_reading') + n('select count(*) from review_log') === 0)
  const away = new Set((await v('fresh:away')).map((one) => one.id))
  const feed = JSON.stringify(await v('feed'))
  const home = JSON.stringify(await v('home'))
  await check('the Feed and Home show nothing put away', ![...away].some((id) => feed.includes(id) || home.includes(id)))
  // The pass: a gem, brought back with B.
  await h.evaluate(() => document.querySelector('[data-setting-title="Bring back"]')?.scrollIntoView({ block: 'center' })); await wait(400)
  await h.click('[data-fresh-go]'); await wait(600)
  const list = await v('fresh:away')
  const gemAt = list.findIndex((one) => one.kind === 'gem')
  for (let i = 0; i < gemAt; i++) (await h.keyboard.press('ArrowRight'), await wait(120))
  const gem = list[gemAt]
  await h.keyboard.press('b'); await wait(900)
  await check('B brings the gem back: in Writing again, and the Feed may draw it', n('select count(*) from nuggets where id = ? and archived_at is null and binned_at is null', gem.id) === 1 && (await v('folders:items', 'unfiled')).some((one) => one.id === gem.id), gem.title)
  await h.keyboard.press('Escape'); await wait(400)
  await check('Esc stops the pass', (await h.locator('[data-fresh-pass]').count()) === 0)
  // A folder, from its own right-click in the sidebar.
  const folder = (await v('folders')).find((one) => one.away)
  await c.go('articles'); await wait(900)
  // Inside "From Obsidian" in the sidebar: unfolded first, then the folder right-clicked.
  await h.locator('[data-folder-name="From Obsidian"]').first().click(); await wait(700)
  await h.locator(`[data-folder-name="${folder.name}"]`).first().click({ button: 'right' }); await wait(500)
  await h.locator('[role="menuitem"]', { hasText: 'Bring back' }).first().click({ timeout: 3000 }); await wait(900)
  const after = (await v('folders')).find((one) => one.id === folder.id)
  await check('the folder’s right-click “Bring back” puts it at the top of Writing, what it holds in sight', after && !after.parent && after.hidden === 0, JSON.stringify(after))
} catch (error) {
  await check('the run finished', false, error.message.split('\n')[0])
} finally {
  await c.close?.()
}
done()
