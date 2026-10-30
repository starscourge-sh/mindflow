// The Inbox stays calm as a book grows: it lists the last 7 days, older open
// captures behind one line at its end (and quick capture's Inbox the same);
// untouched captures put away on their own, never pinned, reminded, dated,
// a task's source or glossed ones, with a line and Undo; no Inbox count in the
// sidebar; past 20 captures, Tidy offered once, dismissable for the day.
//
//   npx electron-vite build --outDir out-p
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-p/main/index.js HALIGTREE_QA_AWAY=1 node qa/inbox-calm.mjs
//   SHOTS=<folder> also saves light and dark screenshots.
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { sandbox } from './sandbox-lib.mjs'

const results = []
const check = (name, ok, detail = '') => { results.push(!!ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`) }
const shots = process.env.SHOTS
process.env.QA_ARGS = ''

const c = await sandbox({ width: 1200, height: 860, seeded: false })
const { h, page: box, v, go } = c
const wait = (ms) => h.waitForTimeout(ms)
await v('onboarding:set', { welcomed: new Date().toISOString(), newsSeen: true, welcoming: false, pageHints: false })
// Nothing put away until the probe asks; no other line offering to tidy.
await v('settings:set', { autoArchive: 0, inboxDays: 7, rotCount: 0, dailyTidy: false })
await h.reload(); await wait(1500)
const make = (text) => h.evaluate((words) => window.api.captures.create({ kind: 'note', body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: words }] }] } }), text)
const ago = (days) => new Date(Date.now() - days * 86400000).toISOString()
const aged = async (text, days) => { const id = await make(text); await v('capture:set', id, 'capturedAt', ago(days)); return id }
const body = () => h.evaluate(() => document.body.innerText)
const list = () => h.evaluate(async () => (await window.api.captures.list()).map((one) => ({ id: one.id, label: one.label, away: !!one.archivedAt })))
const shoot = async (name) => {
  if (!shots) return
  for (const theme of ['light', 'dark']) {
    await h.evaluate((t) => document.documentElement.classList.toggle('dark', t === 'dark'), theme)
    await wait(300)
    await h.screenshot({ path: `${shots}/${name}-${theme}.png` })
  }
  await h.evaluate(() => document.documentElement.classList.remove('dark'))
}

try {
  // A: 22 from today, 3 from ten days ago, and old ones to test putting away.
  for (let i = 1; i <= 22; i++) await make(`Fresh thought ${i}`)
  const tenDays = [await aged('Ten days old one', 10), await aged('Ten days old two', 10), await aged('Ten days old three', 10)]
  const plain = await aged('Forty days plain', 40)
  const pinned = await aged('Forty days pinned', 40)
  await v('pin', 'captures', pinned, true)
  const reminded = await aged('Forty days reminded', 40)
  await v('remind', 'captures', reminded, new Date(Date.now() + 3 * 86400000).toISOString())
  const dated = await aged('Forty days dated', 40)
  {
    const db = new DatabaseSync(join(process.env.QA_DATA, 'haligtree.db'))
    db.prepare('update captures set fields = ? where id = ?').run(JSON.stringify({ Due: '2026-12-01' }), dated)
    db.close()
  }
  const sourced = await aged('Forty days task source', 40)
  await v('task:add', 'follow up the forty day thought', sourced)
  const glossed = await aged('Forty days glossed', 40)
  await v('gloss', glossed, 'This still matters to me')
  // Edited long ago too, so only the exemption keeps them.
  {
    const db = new DatabaseSync(join(process.env.QA_DATA, 'haligtree.db'))
    db.prepare("update captures set edited_at = null").run()
    db.close()
  }
  await go('home'); await go('inbox'); await wait(800)
  const line = await h.evaluate(() => document.querySelector('[data-inbox-older="line"]')?.textContent ?? '')
  check('older open captures are one line at the list\'s end', /^8 older captures, from before .* · Go through them$/.test(line), line || 'none')
  const text = await body()
  check('and not rows', !/Ten days old|Forty days plain/.test(text))
  check('a pinned one shows, however old', text.includes('Forty days pinned'))
  const size = await h.evaluate(() => parseFloat(getComputedStyle(document.querySelector('[data-inbox-older]')).fontSize))
  check('the line is not small text', size >= 14, String(size))
  await h.evaluate(() => document.querySelector('[data-inbox-older]').scrollIntoView({ block: 'end' })); await wait(400)
  await shoot('inbox-older-line')
  await h.click('[data-inbox-older="line"] button')
  await wait(700)
  const older = await body()
  check('"Go through them" lists the older ones alone', older.includes('Ten days old one') && !older.includes('Fresh thought 1\n') && /8 older captures/.test(await h.evaluate(() => document.querySelector('[data-inbox-older="shown"]')?.textContent ?? '')))
  const inSight = await h.evaluate(() => { const r = document.querySelector('[data-inbox-older="shown"]').getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight })
  check('the line saying they are the older ones is in sight, with its way back', inSight)
  await shoot('inbox-older-shown')
  await h.click('[data-inbox-older="shown"] button'); await wait(600)
  check('and the way back lists the recent ones', !(await body()).includes('Ten days old one') && !!(await h.$('[data-inbox-older="line"]')))
  // Back (⌘[) returns to the recent ones; Esc does too.
  await h.click('[data-inbox-older="line"] button'); await wait(600)
  await h.evaluate(() => document.activeElement?.blur?.())
  await h.keyboard.press('Meta+BracketLeft'); await wait(700)
  check('Back from the older ones lists the recent ones', !(await body()).includes('Ten days old one') && !!(await h.$('[data-inbox-older="line"]')))
  await h.keyboard.press('Meta+BracketRight'); await wait(700)
  check('and Forward goes through them again', (await body()).includes('Ten days old one'))
  await h.keyboard.press('Escape'); await wait(600)
  check('Esc from the older ones lists the recent ones', !(await body()).includes('Ten days old one') && !!(await h.$('[data-inbox-older="line"]')))
  const found = await h.evaluate(() => window.api.captures.search('Ten days old')).catch(() => null)
  check('search still finds an older one', JSON.stringify(found ?? '').includes('Ten days old'), JSON.stringify(found)?.slice(0, 120))
  await v('settings:set', { inboxDays: 0 }); await go('home'); await go('inbox'); await wait(600)
  check('"Everything" lists them all, with no line', !(await h.$('[data-inbox-older]')))
  await v('settings:set', { inboxDays: 7 }); await wait(400)

  // A, quick capture's Inbox: the same days.
  await box.evaluate(() => localStorage.setItem('panel', 'open'))
  await box.reload(); await box.waitForTimeout(1500)
  const boxText = await box.evaluate(() => document.body.innerText)
  const boxLine = await box.evaluate(() => document.querySelector('[data-inbox-older="box"]')?.textContent ?? '')
  check('quick capture\'s Inbox follows the same days', !boxText.includes('Ten days old') && /8 older captures wait in the Inbox/.test(boxLine), boxLine || 'none')

  // C: no Inbox count in the sidebar at all, so none counting the older ones.
  await go('inbox'); await wait(400)
  check('the sidebar has no Inbox count to count older ones', !(await h.$('[data-side-count="inbox"]')))

  // D: past 20, Tidy offered in the Inbox's lines, dismissable for the day.
  const full = await h.evaluate(() => document.querySelector('[data-inbox-line="full"]')?.textContent ?? '')
  check('past 20, the Inbox offers Tidy', /^23 captures in your Inbox\.\s*Tidy them/.test(full), full || 'none')
  await shoot('inbox-tidy-offer')
  await h.click('[data-inbox-line="full"] button:has-text("Tidy them")'); await wait(1200)
  check('"Tidy them" opens the existing Tidy pass', !!(await h.$('[data-pass]')))
  await h.keyboard.press('Escape'); await wait(800)
  await h.hover('[data-inbox-line="full"]')
  await h.click('[data-inbox-line="full"] button[aria-label="Not today"]'); await wait(500)
  await h.reload(); await wait(1500); await go('inbox')
  check('put away, it stays away today', !(await h.$('[data-inbox-line="full"]')))

  // B: the setting, in place, with its preview; picked, it runs at once.
  await h.evaluate(() => localStorage.setItem('settings:section', 'What comes back to you'))
  await go('settings'); await wait(900)
  const row = h.locator('[data-setting-title="Put away captures I haven\'t sorted after"]')
  await row.scrollIntoViewIfNeeded()
  const shows = h.locator('[data-setting-title="Inbox shows"]')
  check('"Inbox shows" says what it means now', /The Inbox lists 23 captures now, and 8 older wait behind its line\./.test(await shows.innerText()), (await shows.innerText()).replace(/\s+/g, ' '))
  await row.getByRole('button', { name: '7 days' }).or(row.getByText('7 days', { exact: true })).first().click()
  await wait(1200)
  check('and the put-away row says from when', /Captures untouched since .* go next/.test(await row.innerText()))
  await shows.evaluate((el) => el.scrollIntoView({ block: 'center' })); await wait(300)
  await shoot('settings-rows')
  const after = await list()
  const away = (id) => after.find((one) => one.id === id)?.away
  check('picked, untouched old captures go at once', away(plain) && tenDays.every(away), JSON.stringify(after.filter((one) => one.away).map((one) => one.label)))
  check('never a pinned one', !away(pinned))
  check('never one with a reminder', !away(reminded))
  check('never one with a date', !away(dated))
  check('never a task\'s source', !away(sourced))
  check('never one with a thought added', !away(glossed))
  check('never a recent one', after.filter((one) => one.label.startsWith('Fresh thought')).every((one) => !one.away))
  check('nothing deleted', after.length === 31, String(after.length))

  await go('inbox'); await wait(800)
  const notice = await h.evaluate(() => document.querySelector('[data-put-away]')?.textContent ?? '')
  check('the Inbox says what happened, with See them and Undo', /4 old captures were put away today/.test(notice) && /See them/.test(notice) && /Undo/.test(notice), notice || 'none')
  await h.evaluate(() => document.querySelector('[data-put-away]')?.scrollIntoView({ block: 'center' })); await wait(300)
  await shoot('inbox-put-away')
  await h.click('[data-put-away] button:has-text("Undo")'); await wait(900)
  const back = await list()
  check('Undo brings them back', [plain, ...tenDays].every((id) => !back.find((one) => one.id === id)?.away))
  check('and the line goes', !(await h.$('[data-put-away]')))

  check('no page errors', !c.errors.length, c.errors.slice(0, 3).join(' | '))
} catch (error) {
  check(`ran to the end: ${error.message}`, false)
} finally {
  await c.close()
}
const failed = results.filter((one) => !one).length
console.log(`\n${results.length - failed}/${results.length} passed`)
process.exit(failed ? 1 : 0)
