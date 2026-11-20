// Recordings named by what was said (main/long-names.ts), with the Mac's model stood in (HALIGTREE_QA_CAPS=ai, its
// answer taking HALIGTREE_QA_AI_DELAY ms as a real model does):
// 1. A new recording, Apple Intelligence on: "Recording, 20 Nov at 14:10" becomes "<topic> · 20 Nov 14:10" once its
//    words are in; the Inbox row's name rolls in over the old one; a quiet notice says so, and its Undo puts the old
//    name back. The old name is kept as another name.
// 2. Settings › Review › Apple Intelligence offers "Name 1 recording by what was said…" for one still named
//    "Recording, …": a list to look over, then "Rename 1", one notice with Undo.
// 3. A name typed into a recording's heading while the model reads is never written over.
// 4. Apple Intelligence off in Settings: a new recording keeps "Recording, …" and nothing is offered.
//   QA_ARGS=--sandbox QA_DATA=<copy of the seeded sandbox> QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 [FRAMES=dir] node qa/recording-names.mjs
import { join } from 'node:path'
import { checks } from './harness.mjs'
import { recorded } from './meeting-flow.mjs'

process.env.HALIGTREE_QA_CAPS ??= 'ai'
process.env.HALIGTREE_QA_AI_DELAY ??= '4000'
const FRAMES = process.env.FRAMES
const { check, done } = checks()
const { c, record, card, made } = await recorded()
const { h, v } = c
const wait = (ms) => h.waitForTimeout(ms)
const get = (id) => h.evaluate((one) => window.api.captures.get(one), id)
const heading = (row) => row?.body?.content?.[0]?.content?.map((one) => one.text).join('') ?? ''
const KEPT = /^Recording, \d{1,2} \w{3} at \d{1,2}:\d{2}$/
const SAID = /^.+ · \d{1,2} \w{3} \d{1,2}:\d{2}$/
// A second recording starts at once (the card's first-time line is said once): through to its page, by the card's Stop.
const again = async () => {
  const before = await h.evaluate(() => document.querySelector('[data-meeting-page]')?.closest('[data-open]')?.dataset.open)
  await v('meeting:start', null)
  const m = await card()
  await m.waitForSelector('[data-meeting-card="live"]', { timeout: 8000 })
  await wait(made.seconds * 1000 + 2500)
  await m.click('[data-meeting-stop]')
  await h.waitForFunction((was) => { const id = document.querySelector('[data-meeting-page]')?.closest('[data-open]')?.dataset.open; return id && id !== was }, before, { timeout: 60000 })
  await wait(600)
  return h.evaluate(() => document.querySelector('[data-meeting-page]').closest('[data-open]')?.dataset.open)
}
try {
  // 1. A new recording, named once its words are in, its row rolling in the Inbox.
  const first = await record()
  const kept = await get(first)
  check('a recording is kept as "Recording, <day> at <time>"', KEPT.test(kept?.label ?? ''), kept?.label)
  const was = kept.label
  // The Inbox's list on screen (not the note), so its row is seen as the name changes.
  await c.go('home')
  await c.go('inbox')
  const rolled = []
  for (let i = 0; i < 80 && KEPT.test((await get(first))?.label ?? ''); i += 1) {
    if (FRAMES && i % 2 === 0) await h.screenshot({ path: join(FRAMES, `roll-${String(i).padStart(2, '0')}.png`) })
    await wait(100)
  }
  for (let i = 0; i < 12; i += 1) {
    rolled.push(await h.evaluate((id) => !!document.querySelector(`[data-app-named="${id}"][data-rolling]`), first))
    if (FRAMES) await h.screenshot({ path: join(FRAMES, `roll-after-${String(i).padStart(2, '0')}.png`) })
    await wait(40)
  }
  const named = await get(first)
  const time = was.replace(/^Recording, (\S+ \S+) at /, '$1 ')
  check('then named by what was said, its day and time after a dot', SAID.test(named?.label ?? '') && named.label.endsWith(` · ${time}`), named?.label)
  check('its heading says the same name', heading(named) === named?.label, heading(named))
  const also = await v('aliases', 'captures', first)
  check('its old name kept as another name', also.includes(was), JSON.stringify(also))
  check('its row in the Inbox rolls the new name in over the old', rolled.some(Boolean), rolled.join(','))
  const row = await h.evaluate((id) => document.querySelector(`[data-app-named="${id}"]`)?.getAttribute('aria-label'), first)
  check('and then reads the new name', row === named?.label, row)
  const notice = h.locator('[role="status"]', { hasText: 'by what was said' })
  check('a quiet notice says it was named', (await notice.count()) === 1, await notice.first().textContent().catch(() => ''))
  if (FRAMES) await c.both(join(FRAMES, 'named'))
  await notice.locator('button', { hasText: 'Undo' }).click(); await wait(900)
  const back = await get(first)
  check('Undo puts "Recording, …" back, in its heading too', back?.label === was && heading(back) === was, `${back?.label} / ${heading(back)}`)

  // 2. The backfill, from Settings, with the real pointer.
  await c.go('settings')
  await h.locator('[data-section="Review"]').first().click(); await wait(500)
  const offer = h.locator('[data-recording-names] [data-rename-look]')
  await offer.scrollIntoViewIfNeeded().catch(() => {})
  check('Settings offers "Name 1 recording by what was said…"', (await offer.count()) === 1 && /Name 1 recording by what was said/.test(await offer.textContent()), await offer.textContent().catch(() => 'none'))
  await offer.click()
  await h.locator('[data-recording-names] [data-rename-apply]').waitFor({ timeout: 20000 })
  const shown = await h.locator(`[data-long-name="${first}"] input`).inputValue()
  check('the list shows it with its new name, to change', SAID.test(shown), shown)
  if (FRAMES) await c.both(join(FRAMES, 'backfill'))
  await h.locator(`[data-long-name="${first}"] input`).fill(`Launch plan stand-up · ${time}`)
  await h.locator('[data-recording-names] [data-rename-apply]').click(); await wait(900)
  check('"Rename 1" names it as typed', (await get(first))?.label === `Launch plan stand-up · ${time}`, (await get(first))?.label)
  const after = h.locator('[role="status"]', { hasText: 'Named 1 recording' })
  check('one notice says so', (await after.count()) === 1)
  check('and the offer is gone, none left', (await h.locator('[data-recording-names]').count()) === 0)
  await after.locator('button', { hasText: 'Undo' }).click(); await wait(900)
  check('its Undo puts the old name back', (await get(first))?.label === was, (await get(first))?.label)

  // 3. A name typed into the heading while the model reads: never written over.
  const second = await again()
  const title = h.locator(`[data-open="${second}"] .ProseMirror h1`).first()
  // The whole heading picked, as a person picks a line to type over it.
  await title.click({ clickCount: 3 })
  await h.keyboard.type('Budget review')
  await wait(6000)
  const typed = await get(second)
  check('a name typed meanwhile is never written over', heading(typed) === 'Budget review' && !SAID.test(typed?.label ?? ''), `${typed?.label} / ${heading(typed)}`)
  const offered = await v('names:recordings')
  check('nor offered to be named later', !offered.some((one) => one.id === second), JSON.stringify(offered.map((one) => one.name)))

  // 4. Apple Intelligence off: a recording keeps its kept name, and nothing is offered.
  await v('settings:set', { aiStudy: false })
  const third = await again()
  await wait(6000)
  check('with Apple Intelligence off a recording stays "Recording, …"', KEPT.test((await get(third))?.label ?? ''), (await get(third))?.label)
  check('and no backfill is offered', (await v('names:recordings')).length === 0)
  check('no errors on the page', !c.errors.length, c.errors.join(' | '))
} catch (error) {
  check('the run finished', false, error.stack.split('\n').slice(0, 3).join(' / '))
} finally {
  await c.close()
  done()
}
