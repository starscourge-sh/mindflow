// A first-timer meets Writing as one place (22 Nov: Writing and Folders were two, "I have stuff in Writing but nothing
// under Folders"). On the sandbox: Writing opens on its folders first and the pages in no folder loose under them, with
// no "Not in a folder" row; they make a folder from "New folder" and name it where it appears, carry two pages onto
// it in the sidebar; make a second folder and carry the first into it on the page (rested on its
// middle); carry it back out onto the path's "Writing"; undo that with ⌘Z; try to carry the outer folder onto its own
// child (nothing happens, nothing is lost); and open Recent, every page and gem by date, the two pages naming their
// folder. Every move says what it did with Undo. Frames of each step go to QA_SHOTS.
//
//   cp -cR <seeded sandbox> <copy>
//   QA_ARGS=--sandbox QA_DATA=<copy> QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/writing-folders.mjs
import { loadavg } from 'os'
import { mkdirSync } from 'fs'
import { sandbox } from './sandbox-lib.mjs'
import { checks } from './harness.mjs'
process.env.QA_ARGS ??= '--sandbox'

const { check, done } = checks()
const shots = process.env.QA_SHOTS
if (shots) mkdirSync(shots, { recursive: true })
const c = await sandbox({ width: 1300, height: 860 })
const { h, v, go } = c
const wait = (ms) => h.waitForTimeout(ms)
const shot = async (name) => shots && c.both(`${shots}/${name}`)
// Asked again until it holds, for at most 5 s (a save and its notice land a moment after the drop).
const until = async (ask) => { for (let i = 0; i < 50; i++) { const got = await ask(); if (got) return got; await wait(100) } return ask() }
const said = () => h.evaluate(() => [...document.querySelectorAll('[role="status"]')].map((one) => one.textContent?.trim()).filter(Boolean).join(' | '))
const folderNamed = async (name) => (await v('folders')).find((one) => one.name === name)
const folderOf = async (id) => (await v('folders:of', 'nuggets'))[id] ?? null
// A carry as a hand makes it: press, a small first move, then on to the target in steps, rested there, let go.
const carry = async (from, to, { rest = 300, at = 0.5 } = {}) => {
  const a = await from.boundingBox()
  const b = await to.boundingBox()
  await h.mouse.move(a.x + 40, a.y + a.height / 2)
  await h.mouse.down()
  await h.mouse.move(a.x + 40, a.y + a.height / 2 + 8, { steps: 3 })
  for (let i = 1; i <= 14; i++) { await h.mouse.move(a.x + 40 + (b.x + 40 - a.x - 40) * (i / 14), a.y + a.height / 2 + (b.y + b.height * at - a.y - a.height / 2) * (i / 14)); await wait(25) }
  // Rested: a folder rested on another's middle goes inside it (sortable.tsx's dwell); a small wiggle keeps it live.
  for (let i = 0; i < Math.ceil(rest / 100); i++) { await h.mouse.move(b.x + 40 + (i % 2), b.y + b.height * at); await wait(100) }
  await h.mouse.up()
  await wait(700)
}
// Recent is a long list drawn as it scrolls (note-list.tsx `VirtualList`), as Pages' and Gems' are: a row not
// touched lately sits further down, so it is scrolled to, as a person would, at most 60 screens.
const reveal = async (sel) => {
  for (let i = 0; i < 60 && !(await h.locator(sel).count()); i++) {
    await h.evaluate(() => {
      let box = document.querySelector('[data-recent] [data-row]')?.parentElement
      while (box && !(box.scrollHeight > box.clientHeight + 4 && /(auto|scroll)/.test(getComputedStyle(box).overflowY))) box = box.parentElement
      if (box) box.scrollTop += box.clientHeight * 0.8
    })
    await h.waitForTimeout(60)
  }
  return h.locator(sel)
}
try {
  console.log(`load ${loadavg()[0].toFixed(1)}`)
  await v('settings:set', { hintRate: 0, sounds: false })
  await h.evaluate(() => { for (const name of ['own-order', 'sorted-drag', 'grouped-drag']) localStorage.setItem(`hint:${name}`, '1') })

  // 1. Writing opens on its folders, then the pages in no folder, loose; never a "Not in a folder" row.
  await go('articles')
  await wait(800)
  const loose = () => h.locator('[data-page="articles"] button[data-row]')
  check('Writing shows the pages in no folder at its top level', (await loose().count()) >= 3, `${await loose().count()}`)
  check('no "Not in a folder" anywhere, and no Folders section in the sidebar', !/Not in a folder/.test(await h.evaluate(() => document.body.textContent ?? '')) && (await h.locator('[data-side-section-handle="folders"]').count()) === 0)
  await shot('1-top')

  // 2. "New folder" in Writing's head: the folder appears in Writing's own rows, named there, as Finder names one.
  const make = async (name) => {
    await h.locator('[data-folders-new-page]').click()
    const field = h.locator('[data-page="articles"] input[data-folder-name]')
    check(`"New folder" is named in place on Writing's page (${name})`, await until(async () => (await field.count()) === 1))
    await field.fill(name)
    await h.keyboard.press('Enter')
    return until(() => folderNamed(name))
  }
  const essays = await make('Essays')
  const coursework = await make('Coursework')
  check('both folders are made at the top of Writing', !!essays && !!coursework && !essays.parent && !coursework.parent)
  check('Writing\'s folders come first, over its loose pages', await h.evaluate(() => {
    const rows = document.querySelector('[data-page="articles"] [data-folder-rows]')
    const page = document.querySelector('[data-page="articles"] button[data-row]')
    return !!rows && !!page && !!(rows.compareDocumentPosition(page) & Node.DOCUMENT_POSITION_FOLLOWING)
  }))
  check('…and hang under Writing in the sidebar', await until(async () => (await h.locator(`[data-side-folders-section] [data-side-folder="${essays.id}"]`).count()) === 1))
  await shot('2-folders-made')

  // 3. Two pages carried, one after the other, onto Essays in the sidebar: each goes in, said with Undo.
  const pick = [await loose().nth(0).getAttribute('data-id'), await loose().nth(1).getAttribute('data-id')]
  for (const id of pick) await carry(h.locator(`[data-page="articles"] button[data-row][data-id="${id}"]`), h.locator(`[data-side-folder="${essays.id}"]`), { rest: 200 })
  check('the two pages are both in Essays', await until(async () => (await folderOf(pick[0])) === essays.id && (await folderOf(pick[1])) === essays.id), JSON.stringify([await folderOf(pick[0]), await folderOf(pick[1])]))
  check('…said with its notice', /Moved .* into “Essays”/.test(await said()), await said())
  check('…and they leave Writing\'s top level (a page in a folder shows only inside it)', await until(async () => (await h.locator(`[data-page="articles"] button[data-row][data-id="${pick[0]}"]`).count()) === 0))
  await shot('3-pages-in')

  // 4. On the page, Essays rested on Coursework's middle goes inside it.
  const pageFolder = (id) => h.locator(`[data-page="articles"] [data-folder-open="${id}"]`)
  await carry(pageFolder(essays.id), pageFolder(coursework.id), { rest: 900 })
  check('Essays, rested on Coursework, goes inside it', await until(async () => (await folderNamed('Essays'))?.parent === coursework.id), JSON.stringify(await folderNamed('Essays')))
  check('…said as "Moved “Essays” into “Coursework”", with Undo', await until(async () => /Moved “Essays” into “Coursework”/.test(await said())), await said())
  check('…and it leaves Writing\'s top level, gliding out', await until(async () => (await pageFolder(essays.id).count()) === 0))
  await shot('4-nested')

  // 5. Inside Coursework, Essays carried onto the path's "Writing": back at the top.
  await pageFolder(coursework.id).click()
  await wait(1000)
  check('Coursework\'s page shows Essays first, its path "Writing › Coursework"', (await h.locator(`[data-page="folders"] [data-folder-open="${essays.id}"]`).count()) === 1 && /Writing.*Coursework/.test((await h.locator('[data-folder-path]').textContent()) ?? ''))
  await carry(h.locator(`[data-page="folders"] [data-folder-open="${essays.id}"]`), h.locator('[data-folder-path] [data-path-top]'), { rest: 200 })
  check('carried onto "Writing", Essays is at the top again', await until(async () => !(await folderNamed('Essays'))?.parent), JSON.stringify(await folderNamed('Essays')))
  check('…said as "Moved “Essays” to the top of Writing"', await until(async () => /Moved “Essays” to the top of Writing/.test(await said())), await said())
  await shot('5-out')

  // 6. ⌘Z: back inside Coursework, the pages still in it.
  await h.keyboard.press('Meta+z')
  check('⌘Z puts Essays back inside Coursework', await until(async () => (await folderNamed('Essays'))?.parent === coursework.id))
  check('…its two pages still in it', (await folderOf(pick[0])) === essays.id && (await folderOf(pick[1])) === essays.id)

  // 7. The wrong thing: Coursework carried onto Essays, its own child, in the sidebar. Nothing moves, nothing is lost.
  await h.locator(`[data-side-folder="${coursework.id}"]`).hover()
  const fold = h.locator(`[data-folder-fold="${coursework.id}"][aria-expanded="false"]`)
  if (await fold.count()) { await fold.click(); await wait(500) }
  await carry(h.locator(`[data-side-folder="${coursework.id}"]`), h.locator(`[data-side-folder="${essays.id}"]`), { rest: 900 })
  const after = await v('folders')
  check('a folder never goes into its own child: the tree is as it was', !after.find((one) => one.id === coursework.id)?.parent && after.find((one) => one.id === essays.id)?.parent === coursework.id)
  await shot('7-refused')

  // 8. Recent: every page and gem, newest first, under Today, Yesterday, This week, Earlier; the two name Essays.
  await go('articles')
  await h.locator('[data-folder-kinds] [aria-label^="Recent"]').click()
  await wait(900)
  const parts = await h.evaluate(() => [...document.querySelectorAll('[data-recent] [data-group-head]')].map((one) => one.getAttribute('data-group-head')))
  const ORDER = ['Today', 'Yesterday', 'This week', 'Earlier']
  check('Recent is grouped by date, in order', parts.length > 0 && parts.every((one, n) => ORDER.includes(one) && (n === 0 || ORDER.indexOf(one) > ORDER.indexOf(parts[n - 1]))), JSON.stringify(parts))
  check('…the two pages there, naming Essays', ((await (await reveal(`[data-recent] button[data-row][data-id="${pick[0]}"]`)).locator('[data-row-folder]').textContent({ timeout: 2000 }).catch(() => '')) ?? '').includes('Essays'))
  check('…gems among the pages', (await h.locator('[data-recent] button[data-row][data-type="nugget"]').count()) > 0)
  await shot('8-recent')
  // A row opens its page in the folder it lives in.
  await (await reveal(`[data-recent] button[data-row][data-id="${pick[0]}"]`)).click({ timeout: 3000 })
  await wait(1200)
  check('a Recent row opens its page in its folder', /Essays/.test((await h.locator('[data-folder-path]').textContent().catch(() => '')) ?? '') && (await h.locator(`[data-open="${pick[0]}"]`).count()) > 0)

  const errors = c.errors.filter((one) => !/ERR_FILE_NOT_FOUND|status of 404/.test(one))
  check('no page errors', !errors.length, errors.slice(0, 3).join(' | '))
} catch (error) {
  check('the run finished', false, String(error?.stack ?? error))
} finally {
  await c.close()
  done()
}
