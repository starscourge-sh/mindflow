// What a calendar is tied to (main/events.ts, calendar-events.tsx CalendarLayers, side-folder-section.tsx folderMenu,
// folder-view.tsx): the user, 17 Nov, "what exactly is the synergy between 'calendars' and everything else...?".
// 1. A calendar's right-click "Keep its notes in a folder › Trips": said with Undo; a note made for one of its events
//    goes into Trips; Trips' page shows the calendar's coming events.
// 2. A folder's own right-click offers the same tie from its side.
// 3. "Colour from a tag": the calendar's tick wears the tag's colour; a colour picked by hand lets the tag go.
// Real pointer for the menus.
//   QA_DATA=<a copy of the seeded sandbox> QA_ENTRY=$PWD/out-q2/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox node qa/calendar-ties.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'

const { check, done } = checks()
const s = await sandbox({ width: 1300, height: 900 })
const { h, v, go, send, close } = s
const wait = (ms) => h.waitForTimeout(ms)
const cal = async (id) => (await v('calendars')).find((one) => one.id === id)
const menuLine = (words) => h.locator('[role="menuitem"]', { hasText: words }).first()
try {
  await v('settings:set', { sounds: false, hintRate: 0 })
  const folder = await v('folders:make', 'Lisbon trip', null)
  const made = await v('calendar:set', { name: 'Travel' })
  await go('calendar'); await wait(1500)
  // 1. Tied from the calendar's menu.
  await h.locator(`[data-cal-layer="${made.id}"]`).click({ button: 'right' }); await wait(400)
  await menuLine('Keep its notes in a folder').hover(); await wait(400)
  await menuLine('Lisbon trip').click(); await wait(600)
  check('the calendar\'s menu ties it to a folder', (await cal(made.id))?.folder === folder, JSON.stringify(await cal(made.id)))
  check('and says so, with Undo', (await h.locator('[role="status"]', { hasText: 'now goes to Lisbon trip' }).count()) >= 1)
  const start = new Date(Date.now() + 2 * 86_400_000); start.setHours(10, 0, 0, 0)
  const event = await v('event:add', { title: 'Lisbon flight', start: start.toISOString(), end: new Date(start.getTime() + 3_600_000).toISOString(), calendarId: made.id })
  const note = await h.evaluate(() => window.api.captures.create({ kind: 'note', body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Pack the adapter' }] }] } }))
  await v('event:note:link', event.key, note); await wait(400)
  const held = await v('folders:items', folder)
  check('a note made for one of its events goes into the folder', held.some((one) => one.id === note), JSON.stringify(held.map((one) => one.title)))
  await send('folder', `folders:${folder}`); await wait(1500)
  const shown = await h.evaluate(() => [...document.querySelectorAll('[data-folder-event]')].map((one) => one.textContent))
  check('the folder\'s page shows the calendar\'s coming events', shown.some((one) => one.includes('Lisbon flight')), JSON.stringify(shown))
  // 2. From the folder's side: untied from its own menu (on Folders' page).
  await send('folder', 'folders:all'); await wait(1500)
  const row = h.locator(`[data-all-folder="${folder}"]`).first()
  if (await row.count()) {
    await row.click({ button: 'right' }); await wait(400)
    await menuLine('Notes of Travel').hover(); await wait(400)
    await h.getByRole('menuitem', { name: 'Travel', exact: true }).click(); await wait(600)
    check('a folder\'s own menu unties it', (await cal(made.id))?.folder === null, JSON.stringify(await cal(made.id)))
  } else check('Folders lists the folder', false)
  // 3. A tag's colour.
  const tag = (await v('tags'))[0]?.tag
  await go('calendar'); await wait(1200)
  await h.locator(`[data-cal-layer="${made.id}"]`).click({ button: 'right' }); await wait(400)
  await menuLine('Colour from a tag').hover(); await wait(400)
  await menuLine(`#${tag}`).click(); await wait(600)
  check('"Colour from a tag" ties the tag', (await cal(made.id))?.tag === tag, JSON.stringify(await cal(made.id)))
  const tick = await h.evaluate((id) => getComputedStyle(document.querySelector(`[data-cal-layer="${id}"] [role="checkbox"] span`)).backgroundColor, made.id)
  const want = await h.evaluate((t) => { const probe = document.createElement('span'); probe.style.color = `var(--tt-color-text-${window.__tagHue?.(t) ?? 'x'})`; return null }, tag)
  check('its tick wears a colour', !!tick && tick !== 'rgba(0, 0, 0, 0)', `${tick} ${want ?? ''}`)
} finally {
  await close()
}
done()
