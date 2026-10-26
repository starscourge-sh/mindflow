// An empty folder, opened from the sidebar, sits as every other empty page does: the same left edge,
// width and title size as Inbox, Bin, Questions, Tasks and an empty tag; its path bar on that same edge;
// the folder's own icon for its picture; the button named as the toolbar names it; no arrow.
//
//   npx electron-vite build --outDir out-c
//   QA_DATA=$(mktemp -d) QA_ENTRY=out-c/main/index.js HALIGTREE_QA_AWAY=1 node qa/empty-folder.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
// A fresh book, so every page is truly empty.
process.env.QA_ARGS = ''

const { check, done } = checks()
const s = await sandbox({ width: 1400, height: 900, seeded: false })
const { h, v, go, send, close } = s
const shots = process.env.QA_SHOTS
const measure = () => h.evaluate(() => {
  // The empty block: the shared Empty, or a page's example in its rest (its scenery frame).
  const box = document.querySelector('[data-empty]') ?? document.querySelector('.relative.isolate.mx-5')
  if (!box) return null
  const r = box.getBoundingClientRect()
  const title = box.matches('[data-empty]') ? box.querySelector('h2') : null
  const path = document.querySelector('[data-path-bar]')?.getBoundingClientRect()
  // Where its words and picture start: the Empty's padding inside, or the frame's own edge.
  const edge = Math.round(title ? title.getBoundingClientRect().left : r.left)
  return { edge, width: Math.round(title ? r.width : 0), title: title && getComputedStyle(title).fontSize, path: path ? Math.round(path.left) : null, arrow: !!box.querySelector('svg path[style*="stroke-dasharray"]'), button: box.querySelector('button')?.textContent.trim() ?? null, art: box.firstElementChild?.outerHTML.slice(0, 80) }
})
try {
  await v('onboarding:set', { welcomed: new Date().toISOString(), newsSeen: true, welcoming: false, pageHints: false })
  await h.reload()
  await h.waitForTimeout(1500)
  await v('settings:set', { hintRate: 0, sidebarShown: ['inbox', 'home', 'day', 'articles', 'nuggets', 'review', 'today', 'calendar', 'tags', 'discarded'] })
  await h.waitForTimeout(1200)
  const others = {}
  for (const [name, id, focus] of [['Inbox', 'inbox'], ['Bin', 'discarded'], ['Questions', 'questions'], ['Tasks', 'today'], ['Writing', 'articles'], ['Tag', 'tags', 'nothing-here']]) {
    if (focus) await send('tag', focus)
    else await go(id)
    await h.waitForTimeout(focus ? 1200 : 500)
    others[name] = await measure()
    console.log(name, JSON.stringify(others[name]))
    if (shots) await h.screenshot({ path: `${shots}/empty-${name.toLowerCase()}.png` })
  }
  // An empty folder in Writing and in Gems, opened from the sidebar.
  const seen = Object.values(others).filter(Boolean)
  for (const list of ['article', 'nugget']) {
    await go(list === 'article' ? 'articles' : 'nuggets')
    await h.evaluate((l) => window.dispatchEvent(new CustomEvent('haligtree:folder-new', { detail: { list: l, parent: null } })), list)
    await h.waitForTimeout(900)
    await h.keyboard.type(list === 'article' ? 'Drafts' : 'Lines')
    await h.keyboard.press('Enter')
    await h.waitForTimeout(600)
    await h.locator(`aside [data-side-folder-list=${list}], aside [data-folder-list=${list}][data-side-folder]`).first().click()
    await h.waitForTimeout(1000)
    const folder = await measure()
    console.log(list, 'folder', JSON.stringify(folder))
    if (shots) await h.screenshot({ path: `${shots}/empty-folder-${list}.png` })
    check(`${list}: the empty folder page shows`, !!folder)
    if (!folder) continue
    // The pages that fill the list column (Inbox, Bin, Questions, Tasks, Writing) start their block where it starts.
    const column = seen.filter((one) => !one.title)
    const empties = seen.filter((one) => one.title)
    check(`${list}: same left edge as the other pages (${folder.edge} vs ${column.map((one) => one.edge)})`, column.length > 0 && column.every((one) => Math.abs(one.edge - folder.edge) <= 1))
    check(`${list}: same width and title size as the other Empty blocks (${folder.width}, ${folder.title} vs ${empties.map((one) => `${one.width}, ${one.title}`)})`, empties.every((one) => one.width === folder.width && one.title === folder.title))
    check(`${list}: the path bar on the block's edge (${folder.path} vs ${folder.edge})`, folder.path !== null && Math.abs(folder.path - folder.edge) <= 1)
    check(`${list}: button says ${list === 'article' ? 'New page' : 'New gem'} (${folder.button})`, folder.button === (list === 'article' ? 'New page' : 'New gem'))
    check(`${list}: no arrow`, !folder.arrow)
    check(`${list}: the folder's own icon, not the book`, /data-empty-art/.test(folder.art ?? ''))
  }
  check('no page errors', s.errors.length === 0, s.errors.join('\n'))
} finally {
  await close()
}
done()
