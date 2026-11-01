// Folders and groups, told apart as Apple Notes tells Folders from Smart Folders: a folder is where a note
// lives; a group gathers by a rule (a tag) and moves nothing. Both hang off Writing's trunk in the sidebar,
// folders first; a group wears a sparkle and an italic name, counts what it gathers, and its page says
// its rule on a line of its own; a folder's page says what a folder is. Shots to QA_SHOTS, light and dark.
//
//   npx electron-vite build --outDir out-wr
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-wr/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox node qa/folders-groups.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'

const { check, done } = checks()
const s = await sandbox({ width: Number(process.env.QA_WIDTH ?? 1300), height: 860 })
const { h, v, go, both, close, errors } = s
const shots = process.env.QA_SHOTS
try {
  await v('settings:set', { hintRate: 0 })
  await h.evaluate(() => localStorage.setItem('sidebar:folders:article', 'true'))
  for (const title of ['Rome after Caesar #rome', 'The roads of Rome #rome', 'Bread in the empire #rome']) {
    const id = await v('article:new')
    await v('item:save', id, { title })
  }
  // Made from Writing's right-click menu, as a person would: "New group by a tag…", then the tag.
  await go('articles')
  await h.locator('aside [data-side-row][aria-label="Writing"]').click({ button: 'right' })
  await h.waitForTimeout(300)
  await h.getByRole('menuitem', { name: /New group by a tag/ }).click()
  await h.waitForTimeout(400)
  await h.keyboard.type('rome')
  await h.keyboard.press('Enter')
  await h.waitForTimeout(1200)
  const side = await h.evaluate(() => {
    const group = document.querySelector('aside [data-side-group]')
    const folders = [...document.querySelectorAll('aside [data-side-folders="article"] [data-side-folder], aside [data-side-folders="article"] button[data-folder-list]')]
    const lastFolder = folders.at(-1)?.getBoundingClientRect().top ?? 0
    return {
      group: !!group, below: group ? group.getBoundingClientRect().top > lastFolder : false,
      italic: group ? getComputedStyle(group.querySelector('.italic') ?? group).fontStyle : null,
      count: group?.textContent.match(/\d+$/)?.[0] ?? null, current: group?.getAttribute('aria-current'),
      inTree: !!group?.closest('[data-side-folders="article"]')
    }
  })
  check('the group hangs off Writing’s trunk, after its folders', side.group && side.below && side.inTree, JSON.stringify(side))
  check('its own look: an italic name', side.italic === 'italic', side.italic)
  check('it counts what it gathers (3; the count is drawn twice, stacked, for its roll)', side.count === '33', side.count)
  check('made, it is opened', side.current === 'page', side.current)
  const page = await h.evaluate(() => ({ rule: document.querySelector('[data-group-rule]')?.textContent, rows: document.querySelectorAll('[role="main"] [data-row]').length }))
  check('its page says its rule on a line of its own', /A group: every page tagged #rome/.test(page.rule ?? ''), page.rule)
  check('its page lists what it gathers', page.rows === 3, page.rows)
  if (shots) await both(`${shots}/group`)
  // A folder's page says what a folder is.
  await h.locator('aside [data-side-folders="article"] [data-folder-list="article"]').first().click().catch(() => null)
  await h.waitForTimeout(900)
  const folder = await h.evaluate(() => document.querySelector('[data-folder-said]')?.textContent)
  check('a folder’s page says what a folder is', /A folder: the one place these notes live/.test(folder ?? ''), folder)
  if (shots) await both(`${shots}/folder`)
  check('no page errors', errors.length === 0, errors.join(' | '))
} finally {
  await close()
}
done()
