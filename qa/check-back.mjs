// Check back: a decision and an experiment are one kind now, a date then a
// question back to you. A book of the old shape (a decision, an experiment, a
// goal still in the Inbox, a practice) is opened twice: everything converts on
// the first open, nothing changes on the second, nothing is lost. Then, in
// the sandbox, one comes back on Home, asks its question, and is answered.
//
//   npx electron-vite build --outDir out-x
//   QA_DATA=$(mktemp -d) QA_ENTRY=out-x/main/index.js HALIGTREE_QA_AWAY=1 SHOTS=<dir> node qa/check-back.mjs
import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { DatabaseSync } from 'node:sqlite'
import { open } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
import { checks } from './harness.mjs'

const { check, done } = checks()
const data = process.env.QA_DATA ?? mkdtempSync(join(tmpdir(), 'haligtree-qa-'))
process.env.QA_DATA = data
process.env.QA_ARGS = ''
const file = join(data, 'haligtree.db')
const day = (n) => { const at = new Date(); at.setDate(at.getDate() + n); at.setHours(12, 0, 0, 0); return at.toISOString() }
const launch = async () => {
  const qa = await open()
  await qa.page.waitForTimeout(2500)
  return qa
}
const stop = async (qa) => { try { await qa.close() } catch {} ; try { qa.electron.process().kill('SIGKILL') } catch {} }

// 1. A first open makes the book; then old-shaped rows go in, as an older Haligtree wrote them.
let qa = await launch()
await stop(qa)
{
  const db = new DatabaseSync(file)
  const now = new Date().toISOString()
  const add = db.prepare("insert into captures (id, number, title, kind, status, body, captured_at, fields) values (?, (select coalesce(max(number), 0) + 1 from captures), ?, ?, 'open', ?, ?, ?)")
  add.run('qa-d', 'Take the Leeds job', 'decision', '"Take the Leeds job"', now, JSON.stringify({ state: 'Decided', call: 'Take it', reopen: 'Rent up a third', revisit: day(-1) }))
  add.run('qa-e', 'No phone before 9', 'experiment', '"No phone before 9"', now, JSON.stringify({ status: 'Running', question: 'Do I sleep better?', until: day(-2) }))
  add.run('qa-g', 'Run a 10k by December', 'goal', '"Run a 10k by December"', now, null)
  db.prepare("insert into practices (id, name, days, at, target_min, load_kind, load, created_at) values ('qa-p', 'Spanish', '[1,3,5]', '07:30', 15, 'tag', 'spanish', ?)").run(now)
  db.close()
}

// 2. Opened: converted. Opened again: the same.
const snapshot = () => {
  const db = new DatabaseSync(file)
  const rows = {
    captures: db.prepare("select id, kind, kind_was, status, fields from captures where id like 'qa-%' order by id").all().map((one) => ({ ...one })),
    goals: db.prepare("select title from nuggets where tier = 'goal' and capture_id = 'qa-g'").all().map((one) => ({ ...one })),
    tasks: db.prepare("select t.title, t.recurrence, p.load, p.target_min from practices p join tasks t on t.id = p.task_id where p.id = 'qa-p'").all().map((one) => ({ ...one }))
  }
  db.close()
  return rows
}
qa = await launch()
const back = await qa.page.evaluate(() => window.api.haligtree('returning'))
await stop(qa)
const first = snapshot()
const d = first.captures.find((one) => one.id === 'qa-d')
const e = first.captures.find((one) => one.id === 'qa-e')
const g = first.captures.find((one) => one.id === 'qa-g')
const df = JSON.parse(d.fields), ef = JSON.parse(e.fields)
check('2. a decision is a Check back, its look-again day its date', d.kind === 'checkback' && d.kind_was === 'decision' && df.back === day(-1), JSON.stringify(d))
check('2. it asks whether the call still holds, and keeps the call and what would reopen it', df.ask === 'Does “Take it” still hold?' && df.call === 'Take it' && df.reopen === 'Rent up a third', d.fields)
check('2. an experiment is a Check back asking its question on its run-until day', e.kind === 'checkback' && ef.ask === 'Do I sleep better?' && ef.back === day(-2), e.fields)
check('2. a goal still in the Inbox is on Goals, the capture kept as a note', first.goals.length === 1 && g.kind === 'note' && g.kind_was === 'goal', JSON.stringify(first.goals))
check('2. a practice is a repeating task, its material and minutes kept', first.tasks.length === 1 && first.tasks[0].recurrence === 'every mon, wed, fri' && first.tasks[0].load === 'spanish' && first.tasks[0].target_min === 15, JSON.stringify(first.tasks))
check('2. both due Check backs come back', ['qa-d', 'qa-e'].every((id) => back.some((one) => one.id === id && one.ask)), JSON.stringify(back.map((one) => [one.id, one.ask])))
qa = await launch()
await stop(qa)
check('2. opened again, nothing changes', JSON.stringify(snapshot()) === JSON.stringify(first))

// 3. In the sandbox: the kinds, and one answered on Home.
process.env.QA_DATA = mkdtempSync(join(tmpdir(), 'haligtree-qa-'))
process.env.QA_ARGS = '--sandbox'
const s = await sandbox({ width: 1200, height: 860 })
try {
  const { h, page, go, errors } = s
  for (let i = 0; i < 60 && (await h.evaluate(() => document.body.innerText.includes('Setting out the examples'))); i++) await h.waitForTimeout(500)
  // Quick capture's kinds: no Goal, Practice, Decision or Experiment; one Check back.
  await page.click('.tiptap.ProseMirror')
  await page.keyboard.type('Walk after lunch', { delay: 15 })
  await page.click('[data-kind-chip]')
  await page.waitForTimeout(600)
  const kinds = await page.$$eval('[cmdk-item]', (all) => all.map((one) => one.getAttribute('data-value') ?? one.textContent))
  check('3. quick capture offers Check back, and no Goal, Practice, Decision or Experiment', kinds.some((one) => /check back/i.test(one)) && !kinds.some((one) => /^(goal|practice|decision|experiment)$/i.test(one.trim())), kinds.join(', '))
  await page.keyboard.press('Escape')
  // The surprise party's Check back, brought to today: it comes back on Home.
  const party = (await h.evaluate(() => window.api.captures.find('surprise party'))).find((one) => one.kind === 'checkback')
  await s.v('notes:fields:set', 'captures', party?.id, 'back', day(0))
  await go('home')
  await h.waitForTimeout(1500)
  const card = await h.$('[data-check-back]')
  check('3. a Check back due today is on Home, asking its question', !!card && /It asks:/.test(await card.textContent()), card ? await card.textContent() : 'none')
  if (process.env.SHOTS) await h.screenshot({ path: `${process.env.SHOTS}/check-back-home.png` })
  if (card) {
    const asked = await card.textContent()
    await card.$('textarea').then((box) => box.fill('Yes, and the cake was a surprise'))
    await card.$('button:has-text("Answer")').then((button) => button.click())
    await h.waitForTimeout(1200)
    const due = await h.evaluate(() => window.api.haligtree('returning'))
    check('3. answered, it stops coming back and keeps the answer', !due.some((one) => asked.includes(one.ask)), JSON.stringify(due.map((one) => one.ask)))
  }
  check('no page errors', errors.length === 0, errors.join(' | '))
} finally {
  await s.close()
}
done()
