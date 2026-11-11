// Opening and closing a hundred notes leaves nothing listening that was not
// listening before: the count of listeners on every channel from the main
// process (window:shown, window:hiding and the rest, as the preload counts
// them in hear.ts) is the same after note 100 as after note 10, in the main
// window and in quick capture, and the box shown and put away twenty times
// adds none either. A count that climbs is a leak ("51 window:shown
// listeners added to [IpcRenderer]").
//
//   npx electron-vite build --outDir out-x
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/listeners-flat.mjs
import { sandbox } from './sandbox-lib.mjs'
import { checks } from './harness.mjs'

const { check, done } = checks()
// An empty book of its own, with a dozen notes made here.
const c = await sandbox({ width: 1200, height: 800, seeded: false })
const { h, page, send } = c
const counts = (win) => win.evaluate(() => window.api.listening())
const total = (all) => Object.values(all).reduce((sum, n) => sum + n, 0)
const grew = (before, after) => Object.keys(after).filter((channel) => after[channel] > (before[channel] ?? 0)).map((channel) => `${channel} ${before[channel] ?? 0} → ${after[channel]}`)

try {
  await h.evaluate(() => window.api.haligtree('onboarding:set', { welcomed: new Date().toISOString(), newsSeen: true, welcoming: false, pageHints: false }))
  await h.evaluate(() => window.api.haligtree('settings:set', { sounds: false, hintRate: 0 }))
  check('the preload counts its listeners', typeof (await counts(h)) === 'object', JSON.stringify(await counts(h)).slice(0, 200))
  const made = await h.evaluate(() => Promise.all(Array.from({ length: 12 }, (_, i) => window.api.captures.create({ kind: 'note', body: { type: 'doc', content: [{ type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: `Note ${i + 1}` }] }, { type: 'paragraph', content: [{ type: 'text', text: 'A line of ordinary words, long enough to wrap once on the page. '.repeat(4) }] }] } }))))
  const things = made.map((id) => ['capture', id])
  check('there are notes to open', things.length >= 5, `${things.length} notes`)
  const openOne = async (at) => {
    const [type, id] = things[at % things.length]
    await send(type, id)
    await h.waitForTimeout(120)
    // Closed again: another page, every third time, so the note's page is taken down, not only swapped.
    if (at % 3 === 2) { await send('view', ['today', 'all', 'tags'][at % 9 % 3]); await h.waitForTimeout(120) }
  }
  for (let at = 0; at < 10; at++) await openOne(at)
  await h.waitForTimeout(600)
  const early = await counts(h)
  for (let at = 10; at < 100; at++) await openOne(at)
  await send('view', 'today')
  await h.waitForTimeout(600)
  for (let at = 0; at < 10; at++) await openOne(at)
  await h.waitForTimeout(600)
  const late = await counts(h)
  console.log(`main window: ${total(early)} listening after 10 notes, ${total(late)} after 110; shown ${late['window:shown'] ?? 0}, hiding ${late['window:hiding'] ?? 0}`)
  check('the main window: no channel has more listeners after 110 notes than after 10', grew(early, late).length === 0, grew(early, late).join(', ') || `${total(late)} in all`)

  // Quick capture, shown and put away twenty times.
  const show = () => page.evaluate(() => window.api.showPrompt())
  const hide = () => c.electron.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((one) => !one.webContents.getURL().includes('view='))?.webContents.send('window:hiding'))
  for (let i = 0; i < 3; i++) { await show(); await page.waitForTimeout(200); await hide(); await page.waitForTimeout(150) }
  const boxEarly = await counts(page)
  for (let i = 0; i < 20; i++) { await show(); await page.waitForTimeout(120); await hide(); await page.waitForTimeout(100) }
  const boxLate = await counts(page)
  console.log(`quick capture: ${total(boxEarly)} listening after 3 shows, ${total(boxLate)} after 23; shown ${boxLate['window:shown'] ?? 0}, hiding ${boxLate['window:hiding'] ?? 0}`)
  check('quick capture: no channel has more listeners after 23 shows than after 3', grew(boxEarly, boxLate).length === 0, grew(boxEarly, boxLate).join(', ') || `${total(boxLate)} in all`)
  check('no page errors', !c.errors.length, c.errors.slice(0, 3).join(' | '))
} finally {
  await c.close()
}
done()
