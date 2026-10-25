// The menu bar is Haligtree's own (app-menu.ts), and Gems' "Start a page"
// over several gems makes one page, opened in Writing, as a scaffold: a
// question, each gem a quote with who said it, a title of its own.
//
//   npx electron-vite build --outDir out-x
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/menu-and-page.mjs
import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

process.env.QA_DATA ??= mkdtempSync(join(tmpdir(), 'haligtree-menu-'))
process.env.QA_ARGS ??= '--sandbox'
const { sandbox } = await import('./sandbox-lib.mjs')

const results = []
const check = (name, ok, detail = '') => { results.push(!!ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`) }
const c = await sandbox({ width: 1300, height: 860 })
const { h, v } = c
const wait = (ms = 600) => h.waitForTimeout(ms)

try {
  await v('onboarding:set', { welcomed: new Date().toISOString(), newsSeen: true, welcoming: false, pageHints: false })
  // 1. The menu bar, read as macOS has it.
  const menu = await c.electron.evaluate(({ Menu }) => Menu.getApplicationMenu().items.map((top) => ({ label: top.label, items: top.submenu?.items.filter((one) => one.type !== 'separator').map((one) => one.label) ?? [] })))
  const of = (label) => menu.find((top) => top.label === label)?.items ?? []
  console.log(JSON.stringify(menu))
  check('the app menu is Haligtree\'s, with About and Settings…', of('Haligtree').includes('About Haligtree') && of('Haligtree').includes('Settings…') && of('Haligtree').includes('Quit Haligtree'))
  check('File makes and brings in notes', ['Quick capture', 'New note', 'New page', 'Import', 'Export everything…', 'Close Window'].every((one) => of('File').includes(one)), of('File').join(' | '))
  check('Edit keeps Select All', of('Edit').includes('Select All'))
  check('View goes to the places', ['Inbox', 'Home', 'Journal', 'Writing', 'Gems', 'Feed', 'Review', 'Tasks', 'Calendar'].every((one) => of('View').includes(one)) && of('View').includes('Show or Hide Sidebar'), of('View').join(' | '))
  check('Help has What Haligtree can do and the shortcuts', of('Help').includes('What Haligtree can do') && of('Help').includes('Keyboard shortcuts'), of('Help').join(' | '))
  // A View item, chosen as a click would: the main window goes there.
  await c.electron.evaluate(({ Menu }) => Menu.getApplicationMenu().items.find((top) => top.label === 'View').submenu.items.find((one) => one.label === 'Gems').click())
  await wait(1200)
  const lit = () => h.evaluate(() => document.querySelector('[data-side-row][aria-current="page"]')?.textContent?.trim() ?? '')
  check('View > Gems opens Gems', (await lit()).startsWith('Gems'), await lit())

  // 2. Two gems picked with x, then "Start a page".
  const pagesBefore = (await v('items', 'article')).map((one) => one.id)
  await h.evaluate(() => document.activeElement?.blur?.())
  await h.keyboard.press('j'); await h.keyboard.press('x'); await wait(150)
  await h.keyboard.press('j'); await h.keyboard.press('x'); await wait(300)
  const picked = await h.evaluate(() => [...document.querySelectorAll('[data-row][data-picked]')].map((one) => one.getAttribute('data-id')))
  check('two gems picked', picked.length === 2, String(picked.length))
  await h.getByRole('button', { name: 'Start a page' }).first().click()
  await wait(1500)
  const pages = await v('items', 'article')
  check('exactly one page made', pages.length === pagesBefore.length + 1, `${pagesBefore.length} then ${pages.length}`)
  check('Writing is showing', (await lit()).startsWith('Writing'), await lit())
  const made = { ...pages.find((one) => !pagesBefore.includes(one.id)) }
  Object.assign(made, await v('item', made.id))
  const gems = (await v('items', 'nugget')).filter((one) => picked.includes(one.id))
  const body = typeof made.body === 'string' ? made.body : JSON.stringify(made.body)
  console.log('title:', made.title, '\nbody:', body.slice(0, 600))
  check('its title is not the first gem\'s', !gems.some((one) => one.title === made.title) && made.title.startsWith('On '), made.title)
  check('it opens with a question', body.startsWith('What ties these together?'))
  check('each gem is a quote', (body.match(/^> /gm) ?? []).length >= 2)
  const open = await h.evaluate(() => document.querySelectorAll('.ProseMirror blockquote').length)
  check('the editor shows them as quotes', open >= 2, `${open} quotes drawn`)
  check('it keeps where it came from', JSON.stringify(made.origins ?? []).includes(picked[0]), JSON.stringify(made.origins))
  console.log('errors:', c.errors?.slice?.(0, 5))
} catch (error) {
  console.log('FAIL  probe stopped:', error.message)
  results.push(false)
} finally {
  await c.close()
}
const passed = results.filter(Boolean).length
console.log(`\n${passed} of ${results.length} passed`)
process.exit(passed === results.length ? 0 : 1)
