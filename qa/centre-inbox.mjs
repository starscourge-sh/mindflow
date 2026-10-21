// The Inbox's moments, on a fresh book: old captures put away on their own
// with a line and Undo (C2), Inbox zero when the last one leaves, in the main
// window and in quick capture's panel (C1), and the tidy pass closing with
// what it did (C3).
//
//   npx electron-vite build --outDir out-centre
//   QA_DATA=$(mktemp -d) QA_ENTRY=out-centre/main/index.js MINDFLOW_QA_AWAY=1 node qa/centre-inbox.mjs
import { sandbox } from './sandbox-lib.mjs'

const results = []
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`) }
const shots = process.env.SHOTS
process.env.QA_ARGS = ''

const c = await sandbox({ width: 1100, height: 760, seeded: false })
const { h, page: box, v, go } = c
// Welcomed already, with page hints on: the welcome would lie over everything.
await v('onboarding:set', { welcomed: new Date().toISOString(), newsSeen: true, welcoming: false, pageHints: true })
await h.reload()
await h.waitForTimeout(1500)
const make = (text) => h.evaluate((words) => window.api.captures.create({ kind: 'note', body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: words }] }] } }), text)
try {
  // C2: on in Settings (off until chosen), at 30 days.
  await v('settings:set', { autoArchive: 30 })
  // C2: one capture forty days old, one new; the day's run (8s after start) puts the old one away.
  const old = await make('An old thought nobody touched')
  await v('capture:set', old, 'capturedAt', new Date(Date.now() - 40 * 86400000).toISOString())
  const fresh = await make('A fresh thought from today')
  await h.waitForTimeout(1000)
  await v('putaway:now')
  const run = await v('putaway:today')
  check('an untouched capture 40 days old is put away at the start of the day', run?.moved === 1 && run?.still === 1, JSON.stringify(run))
  const after = await h.evaluate(async () => (await window.api.captures.list()).map((one) => [one.label, !!one.archivedAt]))
  check('only the old one', after.some(([label, away]) => label.startsWith('An old') && away) && after.some(([label, away]) => label.startsWith('A fresh') && !away), JSON.stringify(after))
  await go('inbox')
  await h.waitForTimeout(800)
  const line = await h.evaluate(() => document.querySelector('[data-put-away]')?.textContent ?? null)
  check('the Inbox says so, with See them and Undo', /1 old capture was put away today/.test(line ?? '') && /See them/.test(line ?? '') && /Undo/.test(line ?? ''), line ?? 'none')
  if (shots) await h.screenshot({ path: `${shots}/inbox-put-away.png` })
  await h.click('[data-put-away] button:has-text("Undo")')
  await h.waitForTimeout(700)
  const back = await h.evaluate(async (id) => (await window.api.captures.list()).find((one) => one.id === id)?.archivedAt ?? null, old)
  check('Undo brings it back to the Inbox', back === null)
  const gone = await h.evaluate(() => !document.querySelector('[data-put-away]'))
  check('and the line goes', gone)

  // B2: the Inbox's line, the first time a capture takes its way out: "You've got it", then folded away.
  const hint = await h.evaluate(() => document.querySelector('[role="note"]')?.textContent ?? null)
  check('the Inbox\'s line is up', /Everything you catch waits here/.test(hint ?? ''), hint ?? 'none')
  await h.click('[data-row]', { button: 'right' })
  await h.waitForTimeout(300)
  await h.click('[role="menuitem"]:has-text("Resolve")')
  await h.waitForTimeout(300)
  const got = await h.evaluate(() => document.querySelector('[role="note"]')?.textContent ?? null)
  check('doing it says "You\'ve got it"', /You’ve got it/.test(got ?? ''), got ?? 'none')
  if (shots) await h.screenshot({ path: `${shots}/hint-got-it.png` })
  await h.waitForTimeout(2200)
  const folded = await h.evaluate(() => !document.querySelector('[role="note"]'))
  check('and the line folds away', folded)
  const seen = await v('onboarding:state')
  check('for good', seen?.hintsSeen?.includes('inbox'))

  // C1: the Inbox emptied in front of you.
  const quiet = await h.evaluate(() => !document.querySelector('[data-inbox-zero]'))
  check('no Inbox zero while captures wait', quiet)
  for (const id of [old, fresh]) await h.evaluate((one) => window.api.captures.save(one, { status: 'resolved' }), id)
  await h.waitForTimeout(1600)
  const zero = await h.evaluate(() => document.querySelector('[data-inbox-zero]')?.textContent ?? null)
  check('the last one leaving brings Inbox zero', /Inbox zero/.test(zero ?? ''), zero ?? 'none')
  check('it says where everything went, and where the next one goes', /Everything you caught has a place/.test(zero ?? ''))
  if (shots) await h.screenshot({ path: `${shots}/inbox-zero.png` })
  const heard = await h.evaluate(() => (window.vigilHeard ?? []).slice(-5))
  console.log('      (recordings heard:', heard.join(', ') || 'none', ')')
  // Arriving at an empty Inbox is quiet, not the moment again.
  await go('home')
  await go('inbox')
  const again = await h.evaluate(() => !document.querySelector('[data-inbox-zero]') && /Nothing waiting/.test(document.body.textContent ?? ''))
  check('coming back to an empty Inbox is the quiet page', again)

  // C1 in quick capture's panel.
  const third = await make('One for the panel')
  await box.evaluate(() => localStorage.setItem('panel', 'open'))
  await box.reload()
  await box.waitForTimeout(1500)
  const listed = await box.evaluate(() => document.body.textContent?.includes('One for the panel'))
  check('quick capture\'s panel lists it', listed)
  // Resolved from the box itself, as it is done there, with the box up.
  await c.electron.evaluate(({ BrowserWindow }) => { const win = BrowserWindow.getAllWindows().find((w) => !w.webContents.getURL().includes('view=')); win?.show(); win?.webContents.send('window:shown') })
  await box.waitForTimeout(1200)
  await box.evaluate((one) => window.api.captures.save(one, { status: 'resolved' }), third)
  await box.waitForTimeout(1600)
  const boxZero = await box.evaluate(() => document.querySelector('[data-inbox-zero]')?.textContent ?? null)
  check('quick capture\'s panel has its Inbox zero too', /Inbox zero/.test(boxZero ?? ''), boxZero ?? 'none')
  if (!boxZero) console.log('      box says:', (await box.evaluate(async () => JSON.stringify({ open: (await window.api.captures.list()).filter((o) => o.status === 'open' && !o.archivedAt).length, text: document.body.innerText.slice(0, 600) }))))
  if (shots) await box.screenshot({ path: `${shots}/box-inbox-zero.png` })

  // C3: the tidy pass ends saying what it did.
  const a = await make('First to tidy')
  const b = await make('Second to tidy')
  await h.evaluate((ids) => window.dispatchEvent(new CustomEvent('vigil:pass', { detail: { mode: 'tidy', ids } })), [a, b])
  await h.waitForTimeout(1200)
  await h.keyboard.press('t')
  await h.keyboard.type('errands', { delay: 20 })
  await h.keyboard.press('Enter')
  await h.waitForTimeout(600)
  await h.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur())
  await h.keyboard.press('Enter')
  await h.waitForTimeout(500)
  await h.keyboard.press('Enter')
  await h.waitForTimeout(900)
  const summary = await h.evaluate(() => document.querySelector('[data-pass-summary]')?.textContent ?? null)
  check('the tidy pass closes with what it did', /^2 tidied/.test(summary ?? ''), summary ?? 'none')
  check('including the tag put on', /1 tagged/.test(summary ?? ''), summary ?? '')
  if (shots) await h.screenshot({ path: `${shots}/pass-end.png` })

  check('no page errors', !c.errors.length, c.errors.slice(0, 3).join(' | '))
} catch (error) {
  check(`ran to the end: ${error.message}`, false)
} finally {
  await c.close()
}
const failed = results.filter((one) => !one.ok).length
console.log(`\n${results.length - failed}/${results.length} passed`)
process.exit(failed ? 1 : 0)
