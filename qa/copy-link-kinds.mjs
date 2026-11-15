// "Copy link" for every kind, and the link it copies, pasted into a note,
// opens that thing. An event's comes from its right-click menu on the
// Calendar, a journal day's from the "Copy link" on its page; the rest are
// made by the same shared function (copyLinkItem) their menus call.
//
//   npx electron-vite build --outDir out-x
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/copy-link-kinds.mjs [shots]
import { sandbox } from './sandbox-lib.mjs'
import { checks } from './harness.mjs'
import { copiedText, paste, putOnBoard } from './pasteboard.mjs'
process.env.QA_ARGS ??= '--sandbox'

const shots = process.argv[2]
const { check, done } = checks()
const c = await sandbox({ width: 1200, height: 800 })
const { h, v, send, electron } = c
const para = (text) => ({ type: 'paragraph', content: [{ type: 'text', text }] })
const doc = (...lines) => ({ type: 'doc', content: lines.map(para) })
const clip = () => copiedText(electron)
const setClip = (text) => putOnBoard(electron, text)
const link = (key, name) => `[[@${key}|${name}]]`
const wait = (ms) => h.waitForTimeout(ms)
try {
  const made = []
  const note = await h.evaluate((d) => window.api.captures.create({ kind: 'note', body: d }), doc('Zephyrnotename'))
  made.push({ what: 'capture', key: note, name: 'Zephyrnotename' })
  const task = await v('task:add', 'Zephyrtaskname')
  made.push({ what: 'task', key: `task:${task.id}`, name: 'Zephyrtaskname' })
  const gem = await v('nugget:from', 'Zephyrgembody', {})
  const gemId = typeof gem === 'string' ? gem : gem.id
  made.push({ what: 'gem', key: `nugget:${gemId}`, name: 'Zephyrgembody' })
  const page = await v('article:new')
  const pageId = typeof page === 'string' ? page : page.id
  await v('item:save', pageId, { title: 'Zephyrpagename', body: doc('x') })
  made.push({ what: 'Page', key: `article:${pageId}`, name: 'Zephyrpagename' })
  const question = await v('question:new', 'Zephyrquestionname')
  made.push({ what: 'question', key: `question:${typeof question === 'string' ? question : question.id}`, name: 'Zephyrquestionname' })
  const goal = await v('goal:new', 'Zephyrgoalname', null)
  made.push({ what: 'goal', key: `goal:${typeof goal === 'string' ? goal : goal.id}`, name: 'Zephyrgoalname' })

  // An event: right-clicked on the Calendar, "Copy link".
  const at = new Date()
  at.setHours(10, 0, 0, 0)
  const event = await v('event:add', { title: 'Zephyreventname', start: at.toISOString(), end: new Date(at.getTime() + 3600000).toISOString() })
  await c.go('calendar')
  await wait(1500)
  await setClip('')
  await h.locator(`[data-cal-event="${event.key}"], [data-cal-event-chip="${event.key}"]`).first().click({ button: 'right' })
  await wait(400)
  // Cut, Copy and Copy link: the menu folds the copies under one "Copy".
  const fold = h.getByRole('menuitem', { name: /^Copy$/ })
  if (await fold.count() && await fold.first().getAttribute('aria-haspopup')) (await fold.first().hover(), await wait(400))
  const item = h.getByRole('menuitem', { name: /^Copy link/ })
  check('an event\'s right-click menu has "Copy link"', await item.count() > 0)
  if (shots) await h.screenshot({ path: `${shots}/event-menu.png` })
  if (await item.count()) await item.first().click()
  else await h.keyboard.press('Escape')
  await wait(500)
  const eventLink = await clip()
  check('it copies a link to the event', eventLink === link(`event:${event.key}`, 'Zephyreventname'), eventLink)
  made.push({ what: 'event', key: `event:${event.key}`, name: 'Zephyreventname', text: eventLink })
  // And on its page.
  await send('event', event.key)
  await wait(1500)
  await setClip('')
  const onPage = h.locator(`[data-event-detail="${event.key}"] [data-copy-event-link]`)
  check('an event\'s page has "Copy link"', await onPage.count() > 0)
  if (shots) await h.screenshot({ path: `${shots}/event-page.png` })
  if (await onPage.count()) await onPage.first().click()
  await wait(500)
  check('it copies the same link', (await clip()) === eventLink, await clip())
  await h.keyboard.press('Escape')

  // A journal day: "Copy link" on its page.
  const day = '2026-10-20'
  await v('notes:day:save', day, { body: doc('Zephyrdaybody') })
  await send('day', day)
  await wait(1500)
  await setClip('')
  const button = h.locator('[data-copy-day-link]')
  check('a journal day\'s page has "Copy link"', await button.count() > 0)
  if (shots) await h.screenshot({ path: `${shots}/day-page.png` })
  if (await button.count()) await button.first().click()
  await wait(500)
  const dayLink = await clip()
  check('it copies a link to the day', dayLink.startsWith(`[[@day:${day}|`), dayLink)
  made.push({ what: 'journal day', key: `day:${day}`, name: 'Zephyrdaybody', text: dayLink })

  // Each pasted into a note: a link, and a click on it opens that thing.
  const host = await h.evaluate((d) => window.api.captures.create({ kind: 'note', body: d }), doc('Host note'))
  for (const one of made) {
    await send('capture', host)
    await wait(1200)
    const editor = h.locator('.tiptap.ProseMirror[contenteditable="true"]').first()
    await editor.click()
    await h.keyboard.press('Meta+ArrowDown')
    await h.keyboard.press('Enter')
    await paste(h, one.text ?? link(one.key, one.name))
    await wait(600)
    const a = h.locator(`.tiptap.ProseMirror a[data-note="${one.key}"]`).last()
    const there = await a.count() > 0
    check(`${one.what}: the pasted link is a link`, there)
    if (!there) continue
    if (shots && one.what === 'journal day') await h.screenshot({ path: `${shots}/pasted.png` })
    await a.click()
    await wait(1500)
    // Opened: its own name or words on screen, and the note it was clicked in gone.
    const opened = await h.evaluate((s) => ![...document.querySelectorAll('.tiptap.ProseMirror')].some((x) => x.offsetParent && x.innerText.includes('Host note')) && (document.body.innerText.includes(s) || [...document.querySelectorAll('input, textarea')].some((x) => x.offsetParent && x.value.includes(s))), one.name)
    check(`${one.what}: clicking it opens it`, opened, await h.evaluate(() => document.body.innerText.slice(0, 160).replace(/\s+/g, ' ')))
    await c.page.evaluate(() => window.api.hidePrompt?.()).catch(() => {})
  }
  check('no page errors', !c.errors.filter((e) => /PAGEERROR/.test(e)).length, c.errors.join(' | ').slice(0, 300))
} catch (error) {
  check('ran to the end', false, error.message)
} finally {
  await c.close()
  done()
}
