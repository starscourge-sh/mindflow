// Questions lists every question flat: a folder from Gems or Writing is never a folder row there. A question that
// lives in a folder says so quietly on its row ("in Gems › Obsidian"), and a click on that line opens the folder in
// its own section. The user's book had 17 imported questions in the Gems folder "Obsidian".
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-q/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox [SHOTS=<dir>] node qa/questions-no-folders.mjs
process.env.QA_ARGS ??= '--sandbox'
const { sandbox } = await import('./sandbox-lib.mjs')
import { checks } from './harness.mjs'

const { check, done } = checks()
const shots = process.env.SHOTS
const c = await sandbox({ width: 1200, height: 860 })
const { h, v, go } = c
const wait = (ms) => h.waitForTimeout(ms)
const look = () => h.evaluate(() => ({
  folders: [...document.querySelectorAll('[role="main"] [data-group-row]')].map((one) => one.innerText.replace(/\s+/g, ' ').trim()),
  rows: [...document.querySelectorAll('[role="main"] [data-row]')].map((one) => ({ id: one.getAttribute('data-id'), text: one.innerText.replace(/\s+/g, ' ').trim() }))
}))
const path = () => h.locator('[data-path-part]').allInnerTexts().then((all) => all.map((one) => one.trim().split('\n').at(-1).trim()).join(' › '))
try {
  await v('onboarding:set', { welcomed: new Date().toISOString(), newsSeen: true, pageHints: false })
  await v('settings:set', { hintRate: 0 })
  // A Gems folder holding three questions, as an import left the user's; and one question loose.
  const folder = await v('groups:make', 'nugget', 'Obsidian')
  const inside = []
  for (const title of ['Why does ice float on water?', 'What makes a bridge sing in the wind?', 'How do bees agree on a new home?']) inside.push(await v('question:new', title))
  const loose = await v('question:new', 'Why is the sky darker at the zenith?')
  await v('groups:place', inside.map((id) => ({ id, group: folder })))
  // And one in a Writing folder: Questions drew Writing's folders as rows too.
  const drafts = await v('groups:make', 'article', 'Drafts')
  const written = await v('question:new', 'What do tides owe to the sun?')
  await v('groups:place', [{ id: written, group: drafts }])
  for (const view of ['view:question', 'view:article']) await h.evaluate((key) => localStorage.setItem(key, JSON.stringify({ sort: 'newest', group: 'none', filter: {}, density: 'list' })), view)
  await h.reload(); await wait(1500)
  for (const theme of ['light', 'dark']) {
    await c.theme(theme)
    await go('questions'); await wait(900)
    const seen = await look()
    if (shots) await h.screenshot({ path: `${shots}/questions-${theme}.png` })
    check(`${theme}: no folder row on Questions`, seen.folders.length === 0, JSON.stringify(seen.folders))
    const ids = seen.rows.map((one) => one.id)
    check(`${theme}: every question is a plain row: the Gems folder's three, the Writing folder's one and the loose one`, [...inside, written, loose].every((id) => ids.includes(id)), JSON.stringify(ids.length))
    const marked = await h.evaluate((ids) => ids.map((id) => document.querySelector(`[role="main"] [data-row][data-id="${id}"] [data-row-folder]`)?.textContent?.trim() ?? ''), inside)
    check(`${theme}: each question in the folder says "in Gems › Obsidian"`, marked.every((one) => one === 'in Gems › Obsidian'), JSON.stringify(marked))
    const bare = await h.evaluate((id) => !!document.querySelector(`[role="main"] [data-row][data-id="${id}"] [data-row-folder]`), loose)
    check(`${theme}: the loose question has no folder line`, !bare)
    const wrote = await h.evaluate((id) => document.querySelector(`[role="main"] [data-row][data-id="${id}"] [data-row-folder]`)?.textContent?.trim() ?? '', written)
    check(`${theme}: the one in Writing's folder says "in Writing › Drafts"`, wrote === 'in Writing › Drafts', wrote)
  }
  await c.theme('light'); await go('questions'); await wait(900)
  // Answered: a question in the folder answered shows there flat too, with its line.
  await v('question:close', inside[0], 'answered')
  await go('questions'); await wait(400)
  await h.locator('[data-question-filter] button').nth(1).click(); await wait(900)
  const answered = await look()
  if (shots) await h.screenshot({ path: `${shots}/answered-light.png` })
  check('Answered: no folder row either, the answered one plain with its line', answered.folders.length === 0 && answered.rows.some((one) => one.id === inside[0] && /in Gems › Obsidian/.test(one.text)), JSON.stringify(answered))
  await h.locator('[data-question-filter] button').nth(0).click(); await wait(900)
  // The folder line is a link: its hand cursor, and a click opens the folder in Gems.
  const mark = h.locator(`[role="main"] [data-row][data-id="${inside[1]}"] [data-row-folder]`)
  const cursor = await mark.evaluate((one) => getComputedStyle(one).cursor).catch(() => '')
  check('the folder line shows the hand', cursor === 'pointer', cursor)
  await mark.hover(); await wait(300)
  if (shots) await h.screenshot({ path: `${shots}/questions-hover-light.png` })
  await mark.click(); await wait(1200)
  if (shots) await h.screenshot({ path: `${shots}/opened-gems-folder-light.png` })
  const there = await path()
  check('a click opens the folder in Gems', /Gems/.test(there) && there.endsWith('Obsidian'), there)
  const inGems = await look()
  check('and it holds the three questions', inside.every((id) => inGems.rows.some((one) => one.id === id)), JSON.stringify(inGems.rows.map((one) => one.id)))
  // From the keys: Tab reaches the line, Enter opens it; Back comes home to Questions.
  await h.keyboard.press('Meta+BracketLeft'); await wait(1200)
  check('Back returns to Questions', /Questions/.test(await path()), await path())
  await h.locator(`[role="main"] [data-row][data-id="${inside[2]}"] [data-row-folder]`).focus()
  await h.keyboard.press('Enter')
  for (let at = 0; shots && at < 8; at++) (await h.screenshot({ path: `${shots}/enter-frame-${at}.png` }), await wait(50))
  await wait(1000)
  check('Enter on the focused line opens the folder too', (await path()).endsWith('Obsidian'), await path())
  // Writing's folder line opens Writing's folder.
  await go('questions'); await wait(900)
  await h.locator(`[role="main"] [data-row][data-id="${written}"] [data-row-folder]`).click(); await wait(1200)
  check('the Writing line opens the folder in Writing', /Writing/.test(await path()) && (await path()).endsWith('Drafts'), await path())
  // Gems still shows the folder as a folder row: it owns it.
  await go('nuggets'); await wait(900)
  const gems = await look()
  check('Gems still shows "Obsidian" as its own folder row', gems.folders.some((one) => /Obsidian/.test(one)), JSON.stringify(gems.folders))
  check('no page errors', !c.errors?.some((one) => /PAGEERROR/.test(one)), (c.errors ?? []).slice(0, 2).join(' | '))
} catch (error) {
  check('the run finished', false, error.message.split('\n')[0])
} finally {
  await c.close?.()
}
done()
