// Folders in Writing work as Finder's do, walked as a person would: a nested
// folder opened from the sidebar shows only what it holds under a path bar,
// the path goes back up, a click on a folder row folds it in place and ⌘-click opens it, the counts agree
// in the sidebar, the folder row and the header, New and ⇧⌘N make things
// inside, a note carried onto the path goes up (and Undo brings it back),
// F2 renames, "Delete folder, keep its notes" keeps them, an empty folder
// says so calmly, and "Read as one page" opens the folder as one stream.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 [SHOTS=<dir>] node qa/folders-finder.mjs
process.env.QA_ARGS ??= '--sandbox'
const { sandbox } = await import('./sandbox-lib.mjs')
import { checks } from './harness.mjs'

const { check, done } = checks()
const shots = process.env.SHOTS
const c = await sandbox({ width: 1200, height: 900 })
const { h, v } = c
const wait = (ms) => h.waitForTimeout(ms)
const groups = () => v('groups', 'article')
const named = async (name) => (await groups()).find((one) => one.name === name)
const sideCount = (id) => h.locator(`[data-side-folder="${id}"] [data-count]`).first().getAttribute('data-count').then(Number)
const path = () => h.locator('[data-path-part]').allInnerTexts().then((all) => all.map((one) => one.trim().split('\n').at(-1).trim()))
const blocks = () => h.evaluate(() => [...document.querySelectorAll('[data-group-block]')].filter((one) => !one.parentElement?.closest('[data-group-block]')).map((one) => one.getAttribute('data-group-block')))
const header = () => h.locator('[data-list-count]').first().getAttribute('data-list-count').then(Number)
const rowCount = (id) => h.locator(`[data-group-block="${id}"] [data-count]`).first().innerText().then((text) => Number(text.replace(/\D/g, '')))
try {
  await v('onboarding:set', { welcomed: new Date().toISOString(), newsSeen: true, pageHints: false })
  await h.evaluate(() => localStorage.setItem('view:article', JSON.stringify({ sort: 'newest', group: 'none', filter: {}, density: 'list' })))
  await h.reload(); await wait(1500)
  await c.go('articles'); await wait(900)
  const history = await named('History'), renaissance = await named('Renaissance'), leonardo = await named('Leonardo')

  // 1. Renaissance, from the sidebar: only what it holds, under its path.
  await h.locator(`[data-side-folder="${renaissance.id}"]`).first().click(); await wait(900)
  check('the path bar reads Writing › History › Renaissance', (await path()).join(' › ') === 'Writing › History › Renaissance', (await path()).join(' › '))
  check('only its own folder shows: Leonardo', (await blocks()).join() === leonardo.id, JSON.stringify(await blocks()))
  const holds = renaissance.members.length + leonardo.members.length
  check('the header counts every note inside, its subfolder\'s too', (await header()) === holds, `${await header()} vs ${holds}`)
  check('the sidebar says the same', (await sideCount(renaissance.id)) === holds, String(await sideCount(renaissance.id)))
  check('Leonardo\'s row and its sidebar count agree', (await rowCount(leonardo.id)) === (await sideCount(leonardo.id)), `${await rowCount(leonardo.id)} vs ${await sideCount(leonardo.id)}`)
  if (shots) await h.screenshot({ path: `${shots}/nested-folder.png` })

  // 2. The triangle folds it in place; ⌘-click on the row opens it.
  const open = () => h.locator(`[data-group-row="${leonardo.id}"]`).getAttribute('aria-expanded')
  const was = await open()
  await h.locator(`[data-group-row="${leonardo.id}"] [data-group-fold]`).click(); await wait(500)
  check('the triangle folds it in place', (await open()) !== was && (await path()).at(-1) === 'Renaissance', `${was} → ${await open()}`)
  await h.locator(`[data-group-row="${leonardo.id}"] [data-group-fold]`).click(); await wait(500)
  await h.locator(`[data-group-row="${leonardo.id}"]`).click({ position: { x: 120, y: 18 }, modifiers: ['Meta'] }); await wait(800)
  check('⌘-click on it opens it', (await path()).join(' › ') === 'Writing › History › Renaissance › Leonardo', (await path()).join(' › '))
  await h.keyboard.press('Meta+ArrowUp'); await wait(800)
  check('⌘↑ goes up to Renaissance', (await path()).at(-1) === 'Renaissance', (await path()).join(' › '))
  await h.locator('[data-path-part]').filter({ hasText: 'History' }).click(); await wait(800)
  check('the path part goes up to History', (await path()).join(' › ') === 'Writing › History', (await path()).join(' › '))

  // 3. ⇧⌘N makes a folder inside, its name ready to type.
  await h.mouse.move(700, 500)
  await h.keyboard.press('Shift+Meta+n')
  await wait(900)
  const made = (await groups()).find((one) => one.name === 'New folder')
  check('⇧⌘N makes a folder inside, named as it is made', made?.parent === history.id && (await h.locator('input[aria-label="Folder name"]').count()) === 1, JSON.stringify(made))
  await h.keyboard.type('Rome'); await h.keyboard.press('Enter'); await wait(700)
  const rome = await named('Rome')
  check('typed, it is named', !!rome)

  // 4. F2 on a folder row renames it, as in Obsidian (Enter folds it).
  await h.locator(`[data-group-row="${rome.id}"]`).focus(); await h.keyboard.press('F2'); await wait(400)
  await h.keyboard.type('Ancient Rome'); await h.keyboard.press('Enter'); await wait(700)
  check('F2 renames a folder', !!(await named('Ancient Rome')))

  // 5. The empty folder, opened: its own quiet state, and a New button.
  await h.locator(`[data-group-row="${rome.id}"]`).click({ position: { x: 120, y: 18 }, modifiers: ['Meta'] }); await wait(900)
  const empty = await h.locator('[data-empty]').innerText().catch(() => '')
  check('an empty folder says so: "Nothing in Ancient Rome yet"', /Nothing in Ancient Rome yet/.test(empty) && /Drag notes here, or start one/.test(empty), empty.replace(/\s+/g, ' '))
  check('with a New button', (await h.locator('[data-folder-new-note]').count()) === 1)
  if (shots) await h.screenshot({ path: `${shots}/empty-folder.png` })

  // 6. A page carried onto the path bar goes up; Undo puts it back.
  await h.locator('[data-path-part]').filter({ hasText: 'History' }).click(); await wait(800)
  await h.locator(`[data-side-folder="${renaissance.id}"]`).first().click(); await wait(900)
  const page = renaissance.members[0]
  const row = h.locator(`button[data-row][data-id="${page}"]`).first()
  const from = await row.boundingBox()
  const to = await h.locator('[data-path-part]').filter({ hasText: 'History' }).boundingBox()
  await h.mouse.move(from.x + 60, from.y + from.height / 2); await h.mouse.down()
  await h.mouse.move(from.x + 60, from.y + from.height / 2 + 8, { steps: 4 })
  await h.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 16 }); await wait(300)
  await h.mouse.up(); await wait(900)
  check('carried onto History in the path, it moves up into History', (await named('History')).members.includes(page), JSON.stringify((await named('History')).members))
  await h.keyboard.press('Meta+z'); await wait(900)
  check('⌘Z puts it back in Renaissance', (await named('Renaissance')).members.includes(page))

  // 7. Delete folder, keep its notes: they go up one level.
  await h.locator('[data-path-part]').filter({ hasText: 'History' }).click(); await wait(800)
  const kept = (await named('Renaissance')).members
  await h.locator(`[data-group-row="${renaissance.id}"]`).click({ button: 'right' }); await wait(400)
  check('the menu says "Delete folder, keep its notes"', (await h.locator('[data-folder-delete]').innerText()).trim() === 'Delete folder, keep its notes')
  check('and "Read as one page"', (await h.locator('[data-group-open-page]').innerText()).trim() === 'Read as one page')
  await h.locator('[data-folder-delete]').click(); await wait(1200)
  const after = await named('History')
  check('deleted, its notes move up into History', !(await named('Renaissance')) && kept.every((id) => after.members.includes(id)), JSON.stringify(after.members))
  check('and its subfolder goes up too', (await named('Leonardo'))?.parent === history.id)

  // 8. "Read as one page" opens the folder as one stream.
  await h.keyboard.press('Escape')
  const films = await named('Films and books')
  await h.locator('[data-path-part]').filter({ hasText: 'Writing' }).click(); await wait(900)
  await h.locator(`[data-group-row="${films.id}"]`).click({ button: 'right' }); await wait(400)
  await h.locator('[data-group-open-page]').click(); await wait(900)
  check('"Read as one page" opens it as one page', (await h.locator(`[data-group-page="${films.id}"]`).count()) === 1)
  // 9. New, in a folder, makes the page inside it.
  await h.keyboard.press('Escape'); await wait(300)
  await h.locator(`[data-side-folder="${history.id}"]`).first().click(); await wait(900)
  const before = (await named('History')).members.length
  await h.keyboard.press('Meta+n'); await wait(1200)
  check('New makes the page inside the folder', (await named('History')).members.length === before + 1, `${before} → ${(await named('History')).members.length}`)
  check('no page errors', !c.errors?.some((one) => /PAGEERROR/.test(one)), (c.errors ?? []).slice(0, 2).join(' | '))
} catch (error) {
  check('the run finished', false, error.message.split('\n')[0])
} finally {
  await c.close?.()
}
done()
