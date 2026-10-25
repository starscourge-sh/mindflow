// What Haligtree can do, checked against the app: for each card in Catching,
// Writing, Windows and Bringing notes in, do its Try it in the sandbox and
// read back what really happened (the screen, and the data through the app's
// own API). PASS when the card tells the truth, FAIL when it does not, and
// CHECKED-PARTLY where a part cannot be driven from a test (a key pressed in
// another app, a screen recording, a notch): there the nearest real thing is
// checked instead, and the line says what.
//
//   npx electron-vite build --outDir out-pw
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-pw/main/index.js HALIGTREE_QA_AWAY=1 node qa/powers-claims-a.mjs
//
// ONLY=timer,clue runs just those cards.
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

// Pasted embeds are looked for in the vaults Obsidian knows: a made-up list, never yours.
process.env.HALIGTREE_OBSIDIAN_CONFIG = join(mkdtempSync(join(tmpdir(), 'powers-claims-obsidian-')), 'obsidian.json')
const s = await sandbox({ width: 1200, height: 820 })
const { h, page: box, electron } = s
const EDITOR = '.tiptap.ProseMirror.haligtree-editor:not(.is-line)'
const wait = (ms = 300) => h.waitForTimeout(ms)
const v = (channel, ...args) => h.evaluate(([c, a]) => window.api.haligtree(c, ...a), [channel, args])
const captures = () => h.evaluate(() => window.api.captures.list())
const only = (process.env.ONLY ?? '').split(',').filter(Boolean)
const results = []
const expect = (truth, said) => { if (!truth) throw new Error(said) }
class Partly extends Error {}
/** Passes, but says what was checked in place of the part no test can do. */
const partly = (said) => { throw new Partly(said) }

async function card(id, run) {
  if (only.length && !only.includes(id)) return
  try {
    const note = await run()
    results.push({ id, verdict: 'PASS', note: note ?? '' })
  } catch (error) {
    results.push({ id, verdict: error instanceof Partly ? 'CHECKED-PARTLY' : 'FAIL', note: error.message.split('\n')[0] })
  }
  const last = results.at(-1)
  console.log(`${last.verdict.padEnd(14)} ${id}${last.note ? `: ${last.note}` : ''}`)
  // Whatever a case left open is put away: menus, dialogs, a note.
  for (let i = 0; i < 3; i++) await h.keyboard.press('Escape').catch(() => {})
  await wait(200)
}

// --- quick capture --------------------------------------------------------------
async function boxOpen() {
  await h.evaluate(() => window.api.showPrompt())
  await box.waitForTimeout(400)
  await box.evaluate(() => localStorage.removeItem('capture-draft-kept'))
  await box.click(EDITOR)
  await box.keyboard.press('Meta+a')
  await box.keyboard.press('Backspace')
  await box.waitForTimeout(150)
}
async function boxType(words) {
  await boxOpen()
  await box.keyboard.type(words, { delay: 12 })
  await box.waitForTimeout(500)
}
const lit = (kind) => box.locator(`${EDITOR} .box-token[data-box-token="${kind}"]`).count()
const willDo = () => box.evaluate(() => document.querySelector('[data-will-do]')?.textContent ?? '')
/** ⌘↵: sent and put away. */
async function boxSend() {
  await box.keyboard.press('Meta+Enter')
  await box.waitForTimeout(1300)
}
const boxShown = () => electron.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().some((w) => !w.webContents.getURL().includes('view=') && w.isVisible()))
async function until(ask, ms = 4000) {
  const end = Date.now() + ms
  for (;;) {
    const got = await ask()
    if (got || Date.now() > end) return got
    await wait(200)
  }
}
const capture = (words) => until(async () => (await captures()).find((one) => (one.label ?? '').includes(words)))
const task = (words) => until(async () => (await v('tasks')).find((one) => one.title.includes(words)))
async function endFocus() {
  const now = await v('focus:now')
  if (now) await v('session:cancel', now.id)
}

// --- the main window ---------------------------------------------------------------
const go = async (view) => { await s.go(view); await wait(400) }
const text = (selector) => h.evaluate((sel) => document.querySelector(sel)?.textContent ?? '', selector)
const exists = (selector) => h.evaluate((sel) => !!document.querySelector(sel), selector)
/** Click the first element matching `selector` whose words include `words`. */
const clickText = (selector, words) => h.evaluate(([sel, w]) => {
  const found = [...document.querySelectorAll(sel)].find((one) => (one.textContent ?? '').trim().includes(w) && one.offsetParent)
  found?.click()
  return !!found
}, [selector, words])
/** Show me on a card: the page it opens and what it points at. */
async function showMe(id) {
  await go('powers')
  const el = h.locator(`[data-power="${id}"]`)
  await el.scrollIntoViewIfNeeded()
  await el.getByRole('button', { name: /Show me/ }).click()
  await wait(1600)
  const pointed = await h.evaluate(() => { const el = document.querySelector('[data-pointed]'); return el ? (el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 60) : null })
  const toast = await h.evaluate(() => [...document.querySelectorAll('[role="status"][aria-live]')].map((one) => one.textContent).join(' | '))
  const boxUp = await boxShown()
  await h.keyboard.press('Escape')
  await wait(300)
  return { pointed, toast, boxUp }
}
const mainKey = (chord) => electron.evaluate(({ globalShortcut }, c) => globalShortcut.isRegistered(c), chord)

/** Bring an open note's Details out beside it: they start put away each time Haligtree opens. */
async function details() {
  const button = h.locator('[class*="@container/page"] button[aria-label="Details"]').first()
  if (await button.count() && (await button.getAttribute('aria-pressed')) !== 'true') { await button.click(); await wait(600) }
}
/** A group of the Details sidebar opened, if it is folded: only a few start open. */
async function unfold(name) {
  const head = h.locator('[class*="@container/page"] button[aria-expanded="false"]', { hasText: name }).first()
  if (await head.count()) { await head.click(); await wait(400) }
}
/** Details put away, as they are each time Haligtree opens. */
const noDetails = () => h.evaluate(() => { try { localStorage.removeItem('noteDetails') } catch {} window.dispatchEvent(new Event('mf:details')) })

// ================================================================== Catching

await card('box', async () => {
  expect(await mainKey('Command+.'), '⌘. is not registered as a key from any app')
  await boxType('Call Mum about Sunday')
  await boxSend()
  expect(await capture('Call Mum about Sunday'), 'not caught')
  expect(!(await boxShown()), 'quick capture still on screen after ⌘↵')
  const show = await showMe('box')
  expect(show.boxUp, 'Show me did not open quick capture')
  await box.keyboard.press('Escape')
  partly('⌘. is registered with macOS (pressing it from another app cannot be driven); ⌘↵ caught it and put the box away')
})

await card('timer', async () => {
  await boxType('5m tea')
  expect(await lit('timer') === 1, '5m not lit as a timer')
  await boxSend()
  const now = await until(() => v('focus:now'))
  expect(now && now.plannedMs === 300000 && /tea/.test(now.goal), `no 5 minute timer for tea: ${JSON.stringify(now)}`)
  await endFocus()
})

await card('rounds', async () => {
  await boxType('4x25 essay')
  expect(await lit('rounds') === 1, '4x25 not lit')
  const said = await willDo()
  expect(/4 rounds of 25 min, 5 min breaks, a long break after four/.test(said), `box says: ${said}`)
  await boxSend()
  const now = await until(() => v('focus:now'))
  const r = JSON.parse(now?.rounds ?? 'null')
  expect(r && r.rounds === 4 && r.workMs === 1500000 && r.breakMs === 300000 && now.goal === 'essay', `rounds ${now?.rounds} goal ${now?.goal}`)
  const dots = await until(() => electron.evaluate(({ BrowserWindow }) => Promise.all(BrowserWindow.getAllWindows().map((w) => w.webContents.executeJavaScript("document.querySelectorAll('[data-round-dots] > *').length").catch(() => 0))).then((n) => Math.max(...n))))
  expect(dots === 4, `the pill shows ${dots} round dots, not 4`)
  await endFocus()
  await boxType('4x25/10 essay')
  expect(/10 min breaks/.test(await willDo()), `4x25/10: ${await willDo()}`)
})

await card('clue', async () => {
  const q = (await v('items', 'question')).find((one) => /Hamlet/.test(one.title))
  const before = (await v('item', q.id)).glosses?.length ?? 0
  await boxType('+Hamlet: he speaks plainly to Horatio')
  expect(await lit('clue') === 1, `+Hamlet not lit as a clue; box reads "${await box.evaluate((e) => document.querySelector(e)?.textContent, EDITOR)}", tokens ${await box.evaluate(() => [...document.querySelectorAll('.box-token')].map((t) => t.dataset.boxToken).join())}, says ${await willDo()}`)
  await boxSend()
  const after = await until(async () => ((await v('item', q.id)).glosses?.length ?? 0) > before && (await v('item', q.id)).glosses)
  expect(after && after.some((one) => /Horatio/.test(one.body)), 'no clue added to the question')
  const g = (await v('items', 'goal')).find((one) => /Dune/.test(one.title))
  const gb = (await v('item', g.id)).glosses?.length ?? 0
  await boxType('+Finish Dune: read 40 pages')
  await boxSend()
  const ga = await until(async () => ((await v('item', g.id)).glosses?.length ?? 0) > gb)
  expect(ga, 'no log entry on the goal')
  const show = await showMe('clue')
  expect(show.pointed, 'Show me pointed at nothing')
})

/** ⌘K, some words, and the first thing it offers for them. */
async function palette(words, pick = true) {
  await h.keyboard.press('Meta+k')
  await wait(500)
  await h.keyboard.type(words, { delay: 25 })
  const found = await h.waitForFunction((w) => new RegExp(w, 'i').test(document.querySelector('[role="dialog"][aria-label="Search"] [data-search-at]')?.textContent ?? ''), words.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), { timeout: 6000 }).then(() => true).catch(() => false)
  if (found && pick) { await h.keyboard.press('Enter'); await wait(900) }
  return found
}
const rows = (words) => h.locator('[class*="@container/page"] [data-row]', words ? { hasText: words } : undefined)

await card('tagtask', async () => {
  await go('tags')
  await rows('work').first().click()
  await wait(600)
  await h.locator('[role="tab"]', { hasText: 'Manage' }).click()
  await wait(400)
  await h.locator('label', { hasText: 'Tagged notes become tasks' }).locator('[role="switch"]').click()
  await wait(600)
  expect((await v('tags')).find((one) => one.tag === 'work')?.action, '#work not marked as making a task')
  await boxType('Fix the printer #work')
  expect(await lit('task-tag') === 1, '#work not lit as a task in quick capture')
  await boxSend()
  expect(await task('Fix the printer'), 'no task made from #work')
  const show = await showMe('tagtask')
  expect(show.pointed, 'Show me pointed at nothing')
})

await card('remind', async () => {
  const want = { '!alert': 'alerts', '!quiet': 'quiet', '!pull': 'pull' }
  for (const [said, level] of Object.entries(want)) {
    await boxType(`Call the dentist ${level} tomorrow 9am ${said}`)
    await boxSend()
    const made = await task(`Call the dentist ${level}`)
    expect(made?.notify === level, `${said}: task ${made ? `notify ${made.notify}` : 'not made'}`)
  }
  // Open a task: its own reminder setting is there.
  await go('upcoming')
  await rows('Call the dentist alerts').first().click()
  await wait(700)
  const has = await h.evaluate(() => /Default\s*Pull\s*Quiet\s*Alert/.test(document.body.innerText.replace(/\n/g, ' ')))
  expect(has, 'an open task shows no Default / Pull / Quiet / Alert choice')
})

await card('comingback', async () => {
  await go('home')
  const seeded = await h.evaluate(() => (document.querySelector('[class*="@container/page"]')?.innerText ?? '').includes('You keep coming back to this'))
  // Not "every day": the box reads that as a repeating task, and a task is not a thought caught again.
  for (const said of ['I think better after a walk after lunch', 'I think better after a walk, after lunch', 'I think better after a walk after my lunch']) {
    await boxType(said)
    await boxSend()
  }
  await go('home')
  const shown = await until(() => h.evaluate(() => {
    const text = document.querySelector('[class*="@container/page"]')?.innerText ?? ''
    const at = text.indexOf('You keep coming back to this')
    return at < 0 ? '' : text.slice(at, at + 300)
  }), 6000)
  expect(/a walk,? after (my )?lunch/i.test(shown), `Home has no "You keep coming back to this" with the walk: ${shown.slice(0, 120)}`)
  // Said in other words, it is not the same thought to Haligtree: it matches nearly the same words only.
  const other = await h.evaluate(async () => {
    const ids = []
    for (const words of ['Take a long walk after dinner', 'A lunch walk helps me think', 'Walking clears my head nicely']) ids.push((await window.api.captures.create({ body: words })).id ?? null)
    const all = await window.api.captures.list()
    const mine = all.filter((one) => /long walk after dinner|lunch walk helps|clears my head nicely/.test(one.label)).map((one) => one.id)
    return Object.keys(await window.api.haligtree('repeats', mine)).length
  })
  return `nearly the same words three times: shown on Home; three in other words found as repeats: ${other}; the fresh sandbox's Home ${seeded ? 'has' : 'has NO'} example of it`
})

await card('onetask', async () => {
  await go('inbox')
  const list = rows()
  await list.nth(1).click({ modifiers: ['Shift'] })
  await list.nth(2).click({ modifiers: ['Shift'] })
  await list.nth(3).click({ modifiers: ['Shift'] })
  await wait(300)
  const picked = await h.locator('[data-row][data-picked]').count()
  expect(picked === 3, `⇧-click picked ${picked} rows, not 3`)
  const before = (await v('tasks')).length
  expect(await palette('Make one task'), '⌘K offers no Make one task')
  await wait(800)
  // It may ask for a name first: take what it offers.
  if (await h.locator('[role="dialog"] input').count()) { await h.keyboard.press('Enter'); await wait(800) }
  const after = await v('tasks')
  expect(after.length === before + 1, `tasks ${before} -> ${after.length}`)
})

await card('merge', async () => {
  const all = (await captures()).filter((one) => one.status === 'open' && one.kind === 'note')
  const [from, into] = [all.find((one) => /Mr Wolf/.test(one.label)), all.find((one) => /Kessel Run maths/.test(one.label))]
  await go('inbox')
  await noDetails()
  // Opened by its id: the Inbox list draws only the rows in view, and this one is far down it.
  await s.send('capture', from.id)
  await wait(1200)
  if (process.env.SHOTS) await h.screenshot({ path: `${process.env.SHOTS}/merge.png` })
  const shown = await h.getByText('Merge into another note…').count()
  await details()
  await unfold('Status')
  const button = h.getByText('Merge into another note…').first()
  expect(await button.count(), 'no “Merge into another note…” on the open note, even with Details out')
  await button.click()
  await wait(400)
  await h.keyboard.type('Kessel Run maths')
  await wait(300)
  await h.keyboard.press('Enter')
  await wait(900)
  const now = await captures()
  const joined = await h.evaluate((id) => window.api.captures.get(id), into.id)
  const fromNow = now.find((one) => one.id === from.id)
  const body = JSON.stringify(joined ?? (await captures()).find((one) => one.id === into.id))
  expect(fromNow?.status === 'discarded', `the merged note is ${fromNow?.status}`)
  expect(/Mr Wolf|solves problems/.test(body), 'the other note does not hold the merged words')
  return `merged, both sets of words kept; the field is in Details${shown ? '' : ', put away until you click Details'}`
})

// ================================================================== Writing
const PAGE_EDITOR = '[class*="@container/page"] .tiptap.ProseMirror'
/** Today's page, emptied, the caret in it. */
async function dayPage() {
  await go('day')
  await h.click(PAGE_EDITOR)
  await h.keyboard.press('Meta+a')
  await h.keyboard.press('Backspace')
  await wait(200)
}
const doc = (...blocks) => JSON.stringify({ type: 'doc', content: blocks })
const para = (words) => ({ type: 'paragraph', content: [{ type: 'text', text: words }] })
const head = (words) => ({ type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: words }] })
const list = (...items) => ({ type: 'bulletList', content: items.map((one) => ({ type: 'listItem', content: [para(one)] })) })

await card('board', async () => {
  const id = await h.evaluate((body) => window.api.captures.create({ body }), '## Lisbon trip\n\n- Book flights\n- Pack\n\n## Doing\n\n- Pick a route\n\n## Done\n\n- Ask for time off')
  await go('inbox')
  await s.send('capture', id)
  await wait(1200)
  if (process.env.SHOTS) await h.screenshot({ path: `${process.env.SHOTS}/board-0.png` })
  await h.keyboard.press('Alt+Meta+b')
  await wait(900)
  const lanes = await h.evaluate(() => document.querySelectorAll('[data-board] section, [data-board] .mf-island').length)
  expect(lanes >= 3, `⌥⌘B shows ${lanes} columns, not 3`)
  await h.keyboard.press('Alt+Meta+b')
  await wait(700)
  expect(!(await exists('[data-board]')), 'a second ⌥⌘B did not turn it back')
})

await card('versions', async () => {
  const leo = (await captures()).find((one) => /Leonardo/.test(one.label))
  await go('all')
  await s.send('capture', leo.id)
  await wait(1000)
  await h.locator(PAGE_EDITOR).first().focus()
  await h.keyboard.press('Meta+ArrowDown')
  await h.keyboard.type(' Mirror writing.', { delay: 20 })
  await wait(2500)
  // Focused and Enter: the menu opens the same way, and nothing floating over it can take the click.
  await h.locator('[class*="@container/page"] button[aria-label="More"]').first().focus()
  await h.keyboard.press('Enter')
  await wait(400)
  if (process.env.SHOTS) await h.screenshot({ path: `${process.env.SHOTS}/versions.png` })
  await h.getByRole('menuitem', { name: 'Version history' }).click()
  await wait(800)
  const slider = await exists('[class*="@container/page"] [role="slider"]')
  expect(slider, `no slider: ${await h.evaluate(() => [...document.querySelectorAll('[role="status"][aria-live]')].map((one) => one.textContent).join(' | '))}`)
  await clickText('button[aria-label="Back to now"]', '')
})

await card('find', async () => {
  await dayPage()
  await h.keyboard.type('The fox saw another fox by the fox den.', { delay: 10 })
  await h.keyboard.press('Alt+Meta+f')
  await wait(400)
  expect(await exists('input[aria-label="Find in note"]'), '⌥⌘F opened no find bar')
  await h.fill('input[aria-label="Find in note"]', 'fox')
  const replace = h.locator('input[placeholder="Replace with"]')
  expect(await replace.count(), '⌥⌘F did not open replace')
  await replace.fill('wolf')
  await wait(300)
  await h.locator('button[title^="Replace every match"]').click()
  await wait(500)
  const words = await text(PAGE_EDITOR)
  expect(/wolf saw another wolf by the wolf den/.test(words), `after replace all: ${words}`)
  await h.keyboard.press('Escape')
})

await card('aliases', async () => {
  await go('nuggets')
  const first = rows().first()
  const title = (await first.innerText()).split('\n')[0]
  await noDetails()
  await first.click()
  await wait(800)
  const before = await exists('input[placeholder="A nickname, or a short name"], input[placeholder="Another name…"]')
  await details()
  await unfold('Also called')
  const field = h.locator('input[placeholder="A nickname, or a short name"], input[placeholder="Another name…"]').first()
  expect(await field.count(), 'no Also called field, even with Details out')
  await field.fill('Zorblax')
  await field.press('Enter')
  await wait(800)
  await h.keyboard.press('Escape')
  await h.keyboard.press('Meta+k')
  await wait(400)
  await h.keyboard.type('Zorblax', { delay: 25 })
  await wait(1500)
  const said = await h.evaluate(() => document.querySelector('[role="dialog"][aria-label="Search"]')?.innerText ?? '')
  const found = said.includes(title.slice(0, 20))
  if (!found) console.log('   ⌘K for Zorblax shows:', said.replace(/\n/g, ' | ').slice(0, 300))
  await h.keyboard.press('Escape')
  expect(found, '⌘K does not find the gem by its other name')
  const linked = await h.evaluate(() => window.api.haligtree('search', 'Zorblax').then((r) => JSON.stringify(r).length > 10).catch(() => null))
  return `found by its other name; Also called is in Details${before ? '' : ', put away until you click Details'}`
})

await card('calc', async () => {
  await dayPage()
  await h.keyboard.type('12 * 4 =', { delay: 30 })
  const ghost = await until(() => text('.mf-calc-ghost'), 4000)
  expect(/48/.test(ghost), `no answer after "12 × 4 =": "${ghost}"`)
  await h.keyboard.press('Tab')
  await wait(300)
  const kept = await text(PAGE_EDITOR)
  expect(/=\s*48/.test(kept), `Tab did not keep it: ${kept}`)
})

await card('fold', async () => {
  await dayPage()
  await h.keyboard.type('## Trip ideas', { delay: 20 })
  await h.keyboard.press('Enter')
  await h.keyboard.type('Lisbon in May', { delay: 10 })
  await h.keyboard.press('Enter')
  await h.keyboard.type('Porto after', { delay: 10 })
  await h.keyboard.press('Meta+ArrowUp')
  await wait(200)
  await h.keyboard.press('Alt+Meta+BracketLeft')
  await wait(400)
  const hidden = await h.evaluate(() => document.querySelectorAll('.mf-fold-hidden').length)
  expect(hidden >= 2, `⌥⌘[ hid ${hidden} lines`)
  await h.keyboard.press('Alt+Meta+BracketLeft')
  await wait(300)
  expect(await h.evaluate(() => document.querySelectorAll('.mf-fold-hidden').length) === 0, 'a second ⌥⌘[ did not open it again')
})

await card('bit', async () => {
  await go('tags')
  await rows('bit').first().click()
  await wait(900)
  const row = h.locator('[class*="@container/page"] [data-private] .private-text').first()
  expect(await row.count(), 'no #bit note marked private in its list')
  await h.mouse.move(5, 5)
  await wait(400)
  const blurred = await row.evaluate((el) => getComputedStyle(el).filter)
  expect(/blur/.test(blurred), `not blurred: filter ${blurred}`)
  await row.hover()
  await wait(500)
  const near = await row.evaluate((el) => getComputedStyle(el).filter)
  expect(!/blur\([1-9]/.test(near), `still blurred when pointed at: ${near}`)
  // Never a hint: the hint picker leaves private ones out.
})

await card('glossary', async () => {
  await boxType('Sonder')
  await box.keyboard.press('Enter')
  await box.keyboard.type('The feeling that every passer-by has a life as full as yours', { delay: 8 })
  await box.waitForTimeout(400)
  await boxSend()
  const made = await capture('Sonder')
  expect(made?.kind === 'word', `caught as a ${made?.kind}, not a Word`)
  await go('kind:word')
  await rows('Sonder').first().click()
  await wait(700)
  await details()
  await clickText('[class*="@container/page"] button', 'Save as a gem')
  await wait(1200)
  const after = await capture('Sonder')
  const gem = (await v('items', 'nugget')).find((one) => /Sonder/.test(one.title ?? ''))
  const full = gem && await v('item', gem.id)
  expect(full?.prompt && /mean/.test(full.prompt), `P on the word: capture ${after?.status}, gem ${gem ? 'made' : 'none'}, prompt ${JSON.stringify(full?.prompt)}; toasts: ${await h.evaluate(() => [...document.querySelectorAll('[role="status"][aria-live]')].map((one) => one.textContent).join(' | '))}`)
})

// ================================================================== Windows
const windowUrls = () => electron.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().filter((w) => !w.isDestroyed()).map((w) => w.webContents.getURL()))
/** Settings, at a section, with the row holding these words. */
async function setting(section, words) {
  await h.evaluate((one) => localStorage.setItem('settings:section', one), section)
  // Settings reads its section as it opens: from elsewhere, so a page already on Settings opens it afresh.
  await go('today')
  await go('settings')
  await wait(500)
  return h.locator('[data-setting]', { hasText: words }).first()
}

await card('stickies', async () => {
  expect(await mainKey('Control+Alt+Command+N'), '⌃⌥⌘N is not registered')
  // Any note will do: the first one Everything shows (a task, which stays in its lists, has no sticky).
  await go('all')
  const stick = h.getByRole('menuitem', { name: 'Stick on the desktop' })
  for (let i = 0; i < 8 && !(await stick.count()); i++) {
    await h.keyboard.press('Escape')
    await rows().nth(i).click({ button: 'right' })
    await wait(400)
  }
  expect(await stick.count(), 'no “Stick on the desktop” on a note in Everything')
  await stick.click()
  await wait(1500)
  expect((await windowUrls()).some((url) => /view=sticky&type=capture/.test(url)), 'no sticky window for the note')
  await go('day')
  const keep = await clickText('button', 'Stick on the desktop')
  expect(keep, "today's page has no Stick on the desktop")
  await wait(1500)
  expect((await windowUrls()).some((url) => /view=sticky&type=today/.test(url)), "no sticky for today's tasks")
  const over = await electron.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().filter((w) => w.webContents.getURL().includes('view=sticky')).every((w) => w.isAlwaysOnTop()))
  expect(over, 'a sticky is not kept over everything')
  partly('stickies made and kept on top; ⌃⌥⌘N is registered with macOS (pressing it from another app cannot be driven)')
})

await card('recordings', async () => {
  await setting('What comes back to you', 'screen recordings')
  // One switch per kind of window now, under “Hide from recordings”: the main window's is the one tried.
  const row = h.locator('[data-setting]', { has: h.locator('[data-recording="main"]') }).first()
  expect(await row.count(), 'no screen recordings switch where Show me goes')
  const blank = () => electron.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().filter((w) => !w.isDestroyed()).map((w) => typeof w.isContentProtected === 'function' ? w.isContentProtected() : null))
  const before = await blank()
  await row.locator('[role="switch"]').first().click()
  await wait(800)
  const after = await blank()
  await row.locator('[role="switch"]').first().click()
  await wait(500)
  // Shown in recordings to start; the switch on hides the main window.
  expect(before.every((one) => one === false), `to start, a window is already hidden from recordings: ${before}`)
  expect(after.some((one) => one === true), `switched on, nothing is hidden: ${after}`)
  partly('windows show in recordings to start, and the main window is content-protected once its switch is on (what a real share shows cannot be driven)')
})

await card('window', async () => {
  await go('inbox')
  const before = (await windowUrls()).filter((url) => /note=/.test(url)).length
  await rows().nth(2).click({ modifiers: ['Alt', 'Meta'] })
  await wait(1800)
  const after = (await windowUrls()).filter((url) => /note=/.test(url)).length
  expect(after === before + 1, `⌥⌘-click opened ${after - before} windows`)
})

await card('safe', async () => {
  expect(await mainKey('Alt+Command+S'), '⌥⌘S is not registered')
  const was = (await v('settings')).safeMode
  expect(await palette('safe mode on'), '⌘K offers no safe mode')
  const on = (await v('settings')).safeMode
  const repeats = await h.evaluate(async () => Object.keys(await window.api.haligtree('repeats', (await window.api.captures.list()).map((one) => one.id))).length)
  await palette('safe mode off')
  expect(!was && on, `safe mode ${was} -> ${on}`)
  expect(repeats === 0, `in safe mode, ideas still come back: ${repeats}`)
  partly('⌥⌘S is registered with macOS and ⌘K flips it; in it nothing comes back (pressing the key itself cannot be driven)')
})

await card('notch', async () => {
  const row = await setting('Appearance', 'Bubble sits')
  expect(await row.count(), 'no "Bubble sits" setting where Show me goes')
  await row.scrollIntoViewIfNeeded()
  if (process.env.SHOTS) await h.screenshot({ path: `${process.env.SHOTS}/notch.png` })
  await row.locator('[data-choice="notch"]').click() // Under the notch
  await wait(500)
  const sits = (await v('settings')).pillSits
  await row.locator('[data-choice="free"]').click() // Where I put it
  expect(sits === 'notch', `Under the notch stored ${sits}; buttons: ${JSON.stringify(await row.evaluate((el) => [...el.querySelectorAll('button')].map((b) => b.textContent)))}`)
  partly('the choice is kept; how the bubble sits around a real notch needs a Mac with one (qa/glide-pill and HALIGTREE_QA_NOTCH cover the placing)')
})

await card('news', async () => {
  expect(await palette("What's new"), "⌘K offers no What's new")
  await wait(600)
  const list = await exists('[data-whats-new]')
  const shows = await h.locator('[data-whats-new] button', { hasText: 'Show me' }).count()
  expect(list && shows > 0, `What's new: list ${list}, ${shows} Show me buttons`)
})

await card('bin', async () => {
  await go('inbox')
  await h.mouse.click(600, 400)
  await h.keyboard.press('Escape')
  await h.keyboard.press('g')
  await h.keyboard.press('d')
  await wait(900)
  expect(await exists('[data-bin]'), 'G D did not open the Bin')
  const kinds = await h.evaluate(() => [...new Set([...document.querySelectorAll('[data-bin-row]')].map((one) => one.getAttribute('data-bin-row')))])
  const first = h.locator('[data-bin-row]').first()
  const id = await first.getAttribute('data-id')
  const type = await first.getAttribute('data-bin-row')
  await first.getByRole('button', { name: /Restore/ }).click()
  await wait(800)
  const back = (await v('bin:list')).every((one) => one.id !== id)
  expect(back, `Restore left the ${type} in the Bin`)
  if (process.env.SHOTS) await h.screenshot({ path: `${process.env.SHOTS}/bin.png` })
  expect(await h.locator('button', { hasText: 'Hold to empty' }).count(), 'no Hold to empty')
  // A task closed without doing and a gem moved to the Bin wait there too.
  const t = (await v('tasks')).find((one) => one.status === 'open')
  await v('task:save', t.id, { status: 'dropped' })
  const gem = (await v('items', 'nugget'))[0]
  await v('bin:put', gem.id)
  const binned = await v('bin:list')
  expect(binned.some((one) => one.id === t.id) && binned.some((one) => one.id === gem.id), 'a dropped task or a binned gem is not in the Bin')
  return `kinds in the sandbox Bin: ${kinds.join(', ')}`
})

await card('lock', async () => {
  await boxType('Wi-Fi password is on the fridge')
  await box.getByRole('button', { name: 'Actions', exact: true }).click()
  await box.waitForTimeout(300)
  await box.getByRole('menuitemcheckbox', { name: 'Lock', exact: true }).click()
  await box.keyboard.press('Escape')
  await box.waitForTimeout(300)
  await box.click(EDITOR).catch(() => {})
  await box.keyboard.type('XYZ')
  await box.waitForTimeout(300)
  const words = await box.evaluate((e) => document.querySelector(e)?.textContent, EDITOR)
  expect(!words.includes('XYZ'), `locked, yet typing changed it: ${words}`)
  // The lock is for this sitting: a new capture, or another note opened, is unlocked.
  await box.keyboard.press('Meta+n')
  await box.waitForTimeout(400)
  const editable = await box.evaluate((e) => document.querySelector(e)?.getAttribute('contenteditable'), EDITOR)
  await box.keyboard.press('Escape')
  return `typing blocked; the lock lasts while that note is open (new capture editable: ${editable})`
})

// ================================================================== Bringing notes in
const root = mkdtempSync(join(tmpdir(), 'powers-claims-vault-'))
const vault = join(root, 'Garden vault')
mkdirSync(join(vault, '.obsidian'), { recursive: true })
mkdirSync(join(vault, 'pics'), { recursive: true })
writeFileSync(join(vault, 'Raised beds.md'), '---\ntags: [garden]\nstatus: planning\n---\n# Raised beds\n\nAlong the fence, see [[Compost]].\n')
writeFileSync(join(vault, 'Compost.md'), '# Compost\n\nTurn it every two weeks.\n')
// A one-pixel PNG.
writeFileSync(join(vault, 'pics', 'route-map.png'), Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'))
const hashOf = () => JSON.stringify(['Raised beds.md', 'Compost.md'].map((one) => readFileSync(join(vault, one), 'utf8')))
const pick = (paths) => electron.evaluate(({ dialog }, list) => {
  globalThis.__said = null
  dialog.showOpenDialog = async () => ({ canceled: false, filePaths: list })
  dialog.showMessageBox = async (...args) => ((globalThis.__said = args.at(-1)?.detail ?? args.at(-1)?.message), { response: 0 })
}, paths)

await card('vault', async () => {
  const before = hashOf()
  await pick([vault])
  const row = await setting('Import and backups', 'Obsidian')
  expect(await row.count(), 'no Obsidian import where Show me goes')
  await row.getByRole('button', { name: /Obsidian or Notion/ }).click()
  await wait(800)
  if (await exists('[data-vault-picker]')) { await h.click('[data-vault-other]'); await wait(500) }
  // It asks which of the vault's folders to bring in, all chosen to start.
  const bring = h.getByRole('button', { name: /^Bring in/ })
  expect(await until(() => bring.count()), 'no choice of folders to bring in')
  await bring.click()
  // Each folder becomes a group in Writing.
  const made = await until(async () => (await v('items', 'article')).find((one) => /Raised beds/.test(one.title)), 8000)
  expect(made, 'the vault did not come in')
  // What came in is said over the page once it is done; Escape puts it away.
  const said = h.locator('[role="dialog"], [role="alertdialog"]', { hasText: /notes? (are|is) in/ })
  expect(await until(() => said.count()), 'no word of what came in')
  await h.keyboard.press('Escape')
  await wait(400)
  expect(!(await said.count()), 'Escape does not put away what came in')
  const body = JSON.stringify(await v('item', made.id))
  const fields = await h.evaluate((id) => window.api.haligtree('notes:fields', 'articles', id).catch(() => null), made.id)
  expect(/Compost/.test(body) && /noteLink|V-\d+|MF-\d+|\[\[/.test(body), `the [[Compost]] link was not kept: ${body.slice(0, 200)}`)
  expect(hashOf() === before, 'the vault files were changed')
  const tags = (await v('tags')).some((one) => one.tag === 'garden')
  return `note, link kept; frontmatter: tag #garden ${tags ? 'kept' : 'NOT kept'}, fields ${JSON.stringify(fields)?.slice(0, 80)}`
})

await card('files', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'powers-claims-files-'))
  writeFileSync(join(dir, 'readwise.csv'), 'Highlight,Book Title,Book Author,Highlighted at\n"Fear is the mind-killer.",Dune,Frank Herbert,2024-01-02\n')
  writeFileSync(join(dir, 'My Clippings.txt'), 'Frankenstein (Mary Shelley)\n- Your Highlight on page 3 | Added on Monday, 1 January 2024 10:00:00\n\nBeware; for I am fearless, and therefore powerful.\n==========\n')
  writeFileSync(join(dir, 'Notes.md'), '# Rosetta Stone\n\nFound in 1799.\n')
  writeFileSync(join(dir, 'bookmarks.html'), '<DL><DT><A HREF="https://en.wikipedia.org/wiki/Gandalf" ADD_DATE="1700000000">Gandalf</A></DL>')
  writeFileSync(join(dir, 'anki.txt'), '#separator:tab\nWho tutors Hermione in Arithmancy?\tProfessor Vector\n')
  await pick(['readwise.csv', 'My Clippings.txt', 'Notes.md', 'bookmarks.html', 'anki.txt'].map((one) => join(dir, one)))
  const row = await setting('Import and backups', 'Files…')
  expect(await row.count(), 'no Files… import where Show me goes')
  if (process.env.SHOTS) await h.screenshot({ path: `${process.env.SHOTS}/files.png` })
  await row.getByRole('button', { name: /Files/ }).click()
  // What came in is said on the page itself now, not in a message box.
  const said = await until(() => h.evaluate(() => [...document.querySelectorAll('[data-import-done] li')].map((one) => one.textContent).join('\n')), 8000)
  expect(said, 'no Imported message')
  const counts = [...said.matchAll(/: (\d+) new/g)].map((one) => Number(one[1]))
  expect(counts.length === 5 && counts.every((n) => n >= 1), `imported: ${said.replace(/\n/g, '; ')}`)
  // What came in is said in its own panel over the page: put away before the next card.
  await h.keyboard.press('Escape'); await wait(400)
  return said.replace(/\n/g, '; ')
})

await card('embeds', async () => {
  writeFileSync(process.env.HALIGTREE_OBSIDIAN_CONFIG, JSON.stringify({ vaults: { a: { path: vault, ts: 1, open: true } } }))
  await dayPage()
  await h.evaluate((value) => {
    const target = document.querySelector('[class*="@container/page"] .tiptap.ProseMirror')
    target.focus()
    const data = new DataTransfer()
    data.setData('text/plain', value)
    target.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }))
  }, 'Packing for Lisbon, see:\n\n![[route-map.png]]')
  const img = await until(() => h.evaluate(() => document.querySelector('[class*="@container/page"] .tiptap img')?.getAttribute('src') ?? ''), 6000)
  expect(img && !/route-map\.png\]\]/.test(img), `no picture brought in: ${img || (await text(PAGE_EDITOR)).slice(0, 80)}`)
})

// ================================================================== Show me, each card
const SHOW = { box: 'box', timer: 'box', rounds: 'box', lock: 'box', comingback: 'toast', news: 'toast' }
for (const id of ['box', 'timer', 'rounds', 'clue', 'tagtask', 'remind', 'comingback', 'onetask', 'merge', 'board', 'versions', 'find', 'aliases', 'calc', 'fold', 'bit', 'glossary', 'stickies', 'recordings', 'window', 'safe', 'notch', 'news', 'bin', 'lock', 'vault', 'files', 'embeds']) {
  await card(`show:${id}`, async () => {
    const show = await showMe(id)
    if (show.boxUp) await box.keyboard.press('Escape')
    const want = SHOW[id] ?? 'point'
    if (want === 'box') expect(show.boxUp, 'quick capture did not open')
    else if (want === 'toast') expect(show.toast, 'no words said')
    else expect(show.pointed, `pointed at nothing${show.toast ? `; said: ${show.toast}` : ''}`)
    return want === 'point' ? `points at "${show.pointed}"` : ''
  })
}

// ================================================================== the end
const fails = results.filter((one) => one.verdict === 'FAIL')
console.log(`\n${results.length} cards: ${results.filter((one) => one.verdict === 'PASS').length} pass, ${results.filter((one) => one.verdict === 'CHECKED-PARTLY').length} checked partly, ${fails.length} fail`)
if (s.errors.length) console.log('errors:\n' + s.errors.slice(0, 10).join('\n'))
await s.close()
process.exit(fails.length ? 1 : 0)
