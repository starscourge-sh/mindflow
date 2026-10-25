// Five small joins between parts of Haligtree: a struggling Review card made a
// task or a page; one note kept long ago and never linked, "From the archives"
// in the Feed; a quote answered over a year ago asking again; an active goal's
// cards first in Review (the same cards, only their order); and a goal's
// halfway and finish on the Journal's week page.
//
//   npx electron-vite build --outDir out-s
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=$PWD/out-s/main/index.js HALIGTREE_QA_AWAY=1 node qa/synergies.mjs
import { mkdtempSync, readdirSync, statSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { DatabaseSync } from 'node:sqlite'

process.env.QA_DATA ??= mkdtempSync(join(tmpdir(), 'haligtree-synergies-'))
process.env.QA_ARGS ??= '--sandbox'
const { sandbox } = await import('./sandbox-lib.mjs')

const results = []
const check = (name, ok, detail = '') => { results.push(!!ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`) }
const dbs = (dir) => readdirSync(dir).flatMap((name) => {
  const path = join(dir, name)
  return statSync(path).isDirectory() ? dbs(path) : name === 'haligtree.db' ? [path] : []
})
const day = (by) => { const d = new Date(); d.setDate(d.getDate() + by); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }

// --- first run: the sandbox laid down, then what the second run reads set up.
let c = await sandbox({ width: 1300, height: 860 })
let lifted, queueBefore, lone
try {
  const { v } = c
  // Every quote in today's Feed given a reply (aged a year below, while the app is shut).
  const feed = (await v('feed')).posts
  for (const post of feed.filter((one) => one.kind === 'quote')) await v('gloss', post.id, 'What I made of it back then.')
  // A goal under way with a tag, halfway today (forty days from twenty ago), and one made today.
  await v('goal:new', 'Read twelve classics this year #probegoal', day(20), day(-20))
  const done = await v('goal:new', 'Finish the probe before film night', day(10), day(-5))
  await v('goal:close', done, 'made it')
  queueBefore = (await v('review:queue')).map((one) => one.id)
  lifted = queueBefore.at(-1)
  lone = await v('nugget:from', 'Words kept long ago and left alone, linked to nothing.', {})
} finally { await c.close() }
for (const file of dbs(process.env.QA_DATA)) {
  const db = new DatabaseSync(file)
  db.exec("update glosses set created_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-400 days') where item_id in (select id from captures where kind = 'quote' union select id from nuggets where kind = 'quote')")
  db.prepare("update nuggets set created_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-200 days') where id = ?").run(lone)
  // The last card in the queue joins the goal's tag.
  db.prepare("update nuggets set title = title || ' #probegoal' where id = ?").run(lifted)
  db.close()
}

// --- second run: each of the five read back.
c = await sandbox({ width: 1300, height: 860 })
const { v, h, go } = c
try {
  // 4. The goal's card first; the same cards due, none added.
  const queue = (await v('review:queue')).map((one) => one.id)
  check('Review: the active goal\'s tagged card comes first', queue[0] === lifted, `first ${queue[0]?.slice(0, 8)}, goal card ${lifted?.slice(0, 8)}, was at ${queueBefore.indexOf(lifted) + 1} of ${queueBefore.length}`)
  check('Review: the same cards due, only reordered', queue.length === queueBefore.length && queue.every((id) => queueBefore.includes(id)), `${queue.length} now, ${queueBefore.length} before`)

  // 2. One note never linked, from three months or more ago, once.
  for (let load = 1; load <= 2; load++) {
    const posts = (await v('feed')).posts
    const lonely = posts.filter((one) => one.unlinked)
    const ids = posts.map((one) => (one.type === 'poll' ? one.poll.open.id : one.id))
    check(`Feed load ${load}: one never-linked note at most, and not shown twice`, lonely.length === 1 && ids.filter((id) => id === lonely[0].id).length === 1, `${lonely.length} of ${posts.length}, ${lonely[0]?.unlinked} months, "${lonely[0]?.title?.slice(0, 40)}"`)
    check(`Feed load ${load}: it is 3 months old or more`, lonely[0] && lonely[0].unlinked >= 3 && Date.now() - Date.parse(lonely[0].made) >= 89 * 86400000)
  }
  await go('feed')
  await h.waitForTimeout(1500)
  const context = await h.evaluate(() => [...document.querySelectorAll('[data-feed-context]')].map((one) => one.textContent).find((text) => /never linked/.test(text)) ?? '')
  check('Feed: "From the archives: you kept this N months ago and never linked it." with "Open it"', /^From the archives: you kept this \d+ months ago and never linked it\.Open it$/.test(context), context)

  // 3. A quote answered over a year ago asks again.
  const asks = await h.evaluate(() => document.querySelectorAll('[data-feed-read-now]').length)
  check('Feed: "How does this read to you now?" under a year-old reply on a quote', asks >= 1, `${asks} shown`)
  if (asks) {
    const id = await h.evaluate(() => document.querySelector('[data-feed-read-now]').closest('[data-feed-id]').getAttribute('data-feed-id'))
    const before = (await v('glosses', id)).length
    await h.locator('[data-feed-read-now]').first().click()
    await h.waitForTimeout(500)
    await h.keyboard.type('Reads differently now.')
    await h.keyboard.press('Enter')
    await h.waitForTimeout(900)
    const after = await v('glosses', id)
    check('its reply joins the same thread', after.length === before + 1 && after.some((one) => one.body === 'Reads differently now.'), `${before} → ${after.length}`)
  }

  // 5. The week's page says the goal's halfway and its finish.
  await go('weekpage')
  await h.waitForTimeout(1500)
  const lines = await h.evaluate(() => [...document.querySelectorAll('[data-week-goal-lines] li')].map((one) => one.textContent))
  check('Week page: "Halfway on “Read twelve classics this year #probegoal”"', lines.includes('Halfway on “Read twelve classics this year #probegoal”'), lines.join(' | '))
  check('Week page: "Finished “Finish the probe before film night”"', lines.includes('Finished “Finish the probe before film night”'))

  // 1. Struggling: a task with no day, linked to the card; a page in Writing.
  const slipping = await v('review:slipping')
  check('a struggling card to work with', slipping.length > 0, `${slipping.length}`)
  await go('review')
  await h.waitForTimeout(1500)
  const shelf = await h.evaluate(() => !!document.querySelector('[data-struggling]'))
  check('Review shows the Struggling shelf', shelf)
  if (shelf) {
    const tasksBefore = (await v('tasks')).length
    await h.locator('[data-struggling-task]').first().click()
    await h.waitForTimeout(900)
    const made = (await v('tasks')).filter((one) => one.title.startsWith('Rewrite: '))
    check('"Make it a task" makes "Rewrite: …" with no day, linked to the card', made.length === 1 && !made[0].due && !made[0].plan && (await v('tasks')).length === tasksBefore + 1,
      `"${made[0]?.title}", due ${made[0]?.due}, plan ${made[0]?.plan}`)
    check('the task links to the card', made[0]?.fromId === slipping[0].id)
    const pagesBefore = (await v('items', 'article')).length
    await h.locator('[data-struggling-page]').first().click()
    await h.waitForTimeout(1500)
    const pages = await v('items', 'article')
    const editorTitle = await h.evaluate(() => document.querySelector('h1, [data-title]')?.textContent ?? '')
    check('"Write it out as a page" makes a page in Writing and opens it', pages.length === pagesBefore + 1, `${pagesBefore} → ${pages.length}, "${editorTitle.slice(0, 50)}"`)
  }
  console.log('errors:', c.errors?.slice?.(0, 5))
} catch (error) {
  console.log('FAIL  probe stopped:', error.message)
  results.push(false)
} finally {
  await c.close()
}
const passed = results.filter(Boolean).length
console.log(`\n${passed} of ${results.length} passed`)
process.exit(passed === results.length ? 0 : 1)
