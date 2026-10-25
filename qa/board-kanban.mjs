// A page from Obsidian's Kanban plugin (kanban-plugin: board in its front
// matter) opens as a board, and whenever its ··· menu ticks "Board view" the
// board is what is drawn: opened from the list, stepped to and back, reopened,
// after a look at an earlier version, and in the expanded view.
//
//   npx electron-vite build --outDir out-h
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-h/main/index.js HALIGTREE_QA_AWAY=1 node qa/board-kanban.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const { check, done } = checks()
const s = await sandbox({ width: 1400, height: 860 })
const { h, v, send } = s
const wait = (ms = 300) => h.waitForTimeout(ms)
const page = async (title, body) => {
  const id = await v('article:new')
  await v('item:save', id, { title, body })
  return id
}
// What the menu says and what is drawn, in the place given.
const state = async (at = '[data-open]') => {
  await h.locator(`${at} button[aria-label="More"]`).first().click()
  await wait(300)
  const ticked = (await h.getByRole('menuitemcheckbox', { name: /Board view/ }).getAttribute('aria-checked').catch(() => null)) === 'true'
  // Read with the menu still open, then closed by its own button: Esc in the expanded view closes the view.
  const drawn = await h.evaluate((sel) => !!document.querySelector(`${sel} [data-board] section`), at)
  await h.locator(`${at} button[aria-label="More"]`).first().click({ force: true })
  await wait(200)
  return { ticked, drawn }
}
const agrees = async (name, at, want = true) => {
  const now = await state(at)
  check(`${name}: menu and page agree`, now.ticked === now.drawn, JSON.stringify(now))
  check(`${name}: it is a board`, now.drawn === want, JSON.stringify(now))
}

try {
  // As the importer stores it: the words in markdown, the front matter as fields.
  const htop = await page('HTOP', '## Todo\n\n- [ ] htop colours\n- [ ] sort by memory\n\n## Done\n\n- [x] install\n')
  await v('notes:fields:set', 'nuggets', htop, 'kanban-plugin', 'board')
  const others = []
  for (const name of ['One', 'Two', 'Three']) others.push(await page(name, `${name} words.`))
  await send('view', 'articles')
  await wait(1200)
  await send('article', htop)
  await wait(1600)
  await agrees('opened from the list', '[data-open]')
  // Stepped away to the next page and back, as the stepper (3 / 4) does.
  await h.keyboard.press('Escape')
  for (const id of [others[0], htop]) {
    await send('article', id)
    await wait(1200)
  }
  await agrees('stepped away and back', '[data-open]')
  // Reopened after the app has the editor from before (a reload keeps nothing).
  await h.reload()
  await wait(2500)
  await send('view', 'articles')
  await wait(1000)
  await send('article', htop)
  await wait(1600)
  await agrees('after a reload', '[data-open]')
  // Turned off and on again by the menu, then by ⌥⌘B.
  await h.locator('[data-open] button[aria-label="More"]').first().click()
  await wait(300)
  await h.getByRole('menuitemcheckbox', { name: /Board view/ }).click()
  await wait(800)
  await agrees('turned off by the menu', '[data-open]', false)
  await h.keyboard.press('Alt+Meta+b')
  await wait(800)
  await agrees('back on with ⌥⌘B', '[data-open]')
  // In the expanded view.
  await send('expand', `article:${htop}`)
  await wait(1500)
  await agrees('in the expanded view', '[data-expanded-note]')
  await h.keyboard.press('Escape')
  await wait(600)
  check('no errors on the page', s.errors.length === 0, s.errors.join(' | '))
} catch (error) {
  check('the run finished', false, error.message.split('\n')[0])
} finally {
  await s.close()
}
done()
