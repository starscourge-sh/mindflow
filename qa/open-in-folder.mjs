// A note that lives in a folder, opened from outside the list (a link in another note, search, Recent), is shown in
// the list inside its folder, as the sidebar names it there; the list is never left at its top with no row for the
// note (the user, 14 Nov, a link in a gem's "Connected to" opening "On discipline and operating principles", which lives
// in Writing › Obsidian, while Writing's list stayed on its top level: "notice the sidebar loses its way...? why").
//   QA_DATA=<copy of the seeded sandbox> QA_ARGS=--sandbox QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/open-in-folder.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'
const { check, done } = checks()
const c = await sandbox({ width: 1300, height: 860 })
const { h, go, send, v } = c
const shots = process.env.QA_SHOTS
const rows = () => h.evaluate(() => [...document.querySelectorAll('[data-pane] [data-row][data-id]')].map((one) => ({ id: one.dataset.id, text: one.textContent.replace(/\s+/g, ' ').trim().slice(0, 40), folder: !!one.closest('[data-folder-row], [data-group-row]') || /\d+ pages?$/.test(one.textContent.trim()) })))
try {
  await v('settings:set', { sounds: false, hintRate: 0 })
  await v('onboarding:set', { pageHints: false })
  await go('articles')
  await h.waitForTimeout(800)
  const top = await rows()
  // A folder of Writing ("History" in the sandbox, with "Renaissance" inside it), gone into from the sidebar as a
  // person does, to find a page that lives in it.
  const clickSide = (name) => h.evaluate((name) => {
    const hit = [...document.querySelectorAll('aside *, nav *, [data-sidebar] *')].find((el) => el.childElementCount === 0 && el.textContent.trim() === name)
    const target = hit?.closest('button, a, [role="button"], [data-side-row], [data-row]')
    target?.click()
    return !!target
  }, name)
  const folderName = 'History'
  const went = await clickSide(folderName)
  await h.waitForTimeout(900)
  const inside = (await rows()).filter((one) => !top.some((other) => other.id === one.id))
  const page = inside[0]
  check(`the sidebar's "${folderName}" holds a page that is not at the top of Writing`, went && !!page, JSON.stringify({ went, top: top.slice(0, 6).map((one) => one.text), inside: inside.map((one) => one.text) }))
  // Back to the top, then something else open, and the page asked for by its id, as a link asks for it.
  await clickSide('Writing')
  await h.waitForTimeout(600)
  await go('home')
  await h.waitForTimeout(600)
  await send('article', page.id)
  await h.waitForTimeout(1500)
  const after = await rows()
  const openNow = await h.evaluate(() => ({ open: [...document.querySelectorAll('[data-open]')].map((one) => one.getAttribute('data-open')), tab: document.querySelector('[data-tab-on]')?.textContent?.trim().slice(0, 40), heading: document.querySelector('[data-open] h1, .note-pane h1')?.textContent?.trim().slice(0, 40) }))
  const opened = openNow.open.includes(page.id)
  if (shots) await h.screenshot({ path: `${shots}/open-in-folder.png` })
  check('opened by its id from elsewhere, the page has its row in the list (the list is in its folder)', after.some((one) => one.id === page.id), JSON.stringify(after.map((one) => one.text)))
  check('…and the page beside the list is that page', opened, JSON.stringify({ id: page.id, ...openNow }))
  check('no page errors', !c.errors.some((one) => one.includes('PAGEERROR')), c.errors.slice(0, 3).join(' | '))
} catch (error) {
  check('the run finished', false, String(error?.message ?? error).split('\n')[0])
} finally {
  await c.close()
}
done()
