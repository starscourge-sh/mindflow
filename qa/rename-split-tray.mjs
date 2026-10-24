// A person renamed in place renames everywhere and Undo puts it all back; a
// name that is someone else's asks to merge first; a split is one sidebar row
// with both names and a card listing each; the menu bar title is short.
//
//   npx electron-vite build --outDir out-r
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=$PWD/out-r/main/index.js HALIGTREE_QA_AWAY=1 node qa/rename-split-tray.mjs
import { mkdirSync, mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

process.env.QA_DATA ??= mkdtempSync(join(tmpdir(), 'haligtree-rename-'))
process.env.QA_ARGS ??= '--sandbox'
const dir = process.env.SHOTS ?? 'scratchpad/rename'
mkdirSync(dir, { recursive: true })
const { sandbox } = await import('./sandbox-lib.mjs')

const results = []
const check = (name, ok, detail = '') => { results.push(!!ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`) }
const c = await sandbox({ width: 1300, height: 860 })
const { h, v } = c
const wait = (ms = 600) => h.waitForTimeout(ms)
const OLD = 'Marcus Aurelius'
const NEW = 'Marcus Aurelius the Stoic'
const key = (name) => name.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim()
const person = async (name) => {
  await h.evaluate((n) => window.dispatchEvent(new CustomEvent('haligtree:source', { detail: `attribution:${n}` })), name)
  await wait(1200)
}
/** Everything that names him: his notes' who, his photo, his line, a mention, the Feed. */
const places = async (name, mention) => {
  const page = await v('source', 'attribution', name)
  const people = await v('people')
  const body = JSON.stringify(await h.evaluate((id) => window.api.captures.peek('capture', id), mention))
  const feed = await v('feed').catch(() => null)
  const fed = (feed?.posts ?? []).filter((one) => key(one.who ?? '') === key(name)).length
  return { notes: page.items.length, who: page.items.every((one) => one.attribution === name), photo: !!people[key(name)]?.avatar, what: page.what, born: page.born, mentioned: body.includes(`person:${name}"`), fed }
}

try {
  await c.theme('light')
  // A note that @mentions him, to see the mention follow.
  const mention = await h.evaluate((name) => window.api.captures.create({ kind: 'note', body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Reading ' }, { type: 'noteLink', attrs: { id: `person:${name}`, label: name } }, { type: 'text', text: ' again' }] }] } }), OLD)
  await wait(500)
  const before = await places(OLD, mention)
  console.log('before', JSON.stringify(before))
  check('Marcus has notes, a photo, a line and a mention to start', before.notes > 0 && before.photo && !!before.what && before.mentioned, JSON.stringify(before))

  // 1. Typed over in place, ↵ renames everywhere.
  await person(OLD)
  const name = h.locator('[data-source-name]')
  await name.click()
  await h.keyboard.press('Meta+A')
  await h.keyboard.type(NEW)
  await wait(200)
  await h.screenshot({ path: `${dir}/name-editing-light.png`, clip: { x: 0, y: 0, width: 1300, height: 360 } })
  await c.theme('dark')
  await person(OLD)
  await h.locator('[data-source-name]').click()
  await h.keyboard.press('Meta+A')
  await h.keyboard.type(NEW)
  await wait(200)
  await h.screenshot({ path: `${dir}/name-editing-dark.png`, clip: { x: 0, y: 0, width: 1300, height: 360 } })
  // Esc puts it back and renames nothing.
  await h.keyboard.press('Escape')
  await wait(400)
  check('Esc puts the name back', (await h.locator('[data-source-name]').textContent()) === OLD && (await v('source', 'attribution', OLD)).items.length === before.notes)
  await c.theme('light')
  await person(OLD)
  await h.locator('[data-source-name]').click()
  await h.keyboard.press('Meta+A')
  await h.keyboard.type(NEW)
  await h.keyboard.press('Enter')
  await wait(1500)
  const toast = (await h.locator('[role="status"]').allTextContents().catch(() => [])).join(' | ')
  check('a notice says "Renamed in N notes" with Undo', /Renamed in \d+ notes?/.test(toast) && /Undo/.test(toast), toast)
  const after = await places(NEW, mention)
  console.log('after', JSON.stringify(after))
  check('his notes all name him anew', after.notes === before.notes && after.who, `${after.notes} of ${before.notes}`)
  check('his photo came along', after.photo)
  check('his line came along', after.what === before.what && after.born === before.born, `${after.what} ${after.born}`)
  check('the @mention follows', after.mentioned)
  check('the Feed shows him under the new name', after.fed === before.fed, `${after.fed} of ${before.fed}`)
  check('the old name has nothing left', (await v('source', 'attribution', OLD)).items.length === 0)
  check('his page is open under the new name', (await h.locator('[data-source-name]').textContent()) === NEW)

  // Undo puts every place back.
  await h.locator('[role="status"] button:has-text("Undo")').first().click()
  await wait(1500)
  const undone = await places(OLD, mention)
  console.log('undone', JSON.stringify(undone))
  check('Undo puts every place back', JSON.stringify(undone) === JSON.stringify(before), JSON.stringify(undone))

  // 2. Into a name that is someone else's: asked first, in the app's own sheet.
  const jane = await places('Jane Austen', mention)
  await person(OLD)
  await h.locator('[data-source-name]').click()
  await h.keyboard.press('Meta+A')
  await h.keyboard.type('jane austen')
  await h.keyboard.press('Enter')
  await wait(800)
  const ask = await h.locator('[data-sure]').textContent().catch(() => '')
  check('the merge is asked first', /Merge into Jane Austen\?/.test(ask) && /come(s)? along/.test(ask), ask)
  await h.screenshot({ path: `${dir}/merge-question-light.png` })
  await c.theme('dark')
  await person(OLD)
  await h.locator('[data-source-name]').click()
  await h.keyboard.press('Meta+A')
  await h.keyboard.type('jane austen')
  await h.keyboard.press('Enter')
  await wait(800)
  await h.screenshot({ path: `${dir}/merge-question-dark.png` })
  await h.locator('[data-sure-yes]').click()
  await wait(1500)
  await c.theme('light')
  const merged = await places('Jane Austen', mention)
  console.log('merged', JSON.stringify(merged))
  check('merged: their notes join Jane Austen', merged.notes === jane.notes + before.notes, `${merged.notes} = ${jane.notes} + ${before.notes}`)
  check('merged: Jane keeps her own photo and line', merged.photo && merged.what === jane.what && merged.born === jane.born, `${merged.what} ${merged.born}`)
  const marcusGone = await v('source', 'attribution', OLD)
  check('merged: nothing left under Marcus', marcusGone.items.length === 0)

  // 3. A split: one row with both names, and a card listing each.
  await c.go('gems')
  await wait(800)
  await h.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur())
  await h.keyboard.press('Alt+Meta+Backslash')
  await wait(1200)
  await c.go('feed')
  await wait(800)
  const row = h.locator('[data-pair-row="live"]')
  const box = await row.boundingBox()
  const panes = await row.locator('[data-pair-pane]').allInnerTexts()
  check('the split is one row with two names', (await row.count()) === 1 && panes.length === 2 && box && box.height <= 36, `${panes.join(' | ')}; ${box?.height}px`)
  await h.mouse.move(box.x + 20, box.y + box.height / 2)
  await wait(900)
  const card = await h.locator('[data-pair-card] [data-pair-card-pane]').allInnerTexts().catch(() => [])
  check('its card lists each pane on its own line', card.length === 2, card.join(' | '))
  await h.screenshot({ path: `${dir}/split-row-card-light.png`, clip: { x: 0, y: 0, width: 640, height: 860 } })
  await h.mouse.move(700, 500)
  await wait(400)
  await c.theme('dark')
  await wait(800)
  const row2 = await h.locator('[data-pair-row]').first().boundingBox()
  await h.mouse.move(row2.x + 20, row2.y + row2.height / 2)
  await wait(900)
  await h.screenshot({ path: `${dir}/split-row-card-dark.png`, clip: { x: 0, y: 0, width: 640, height: 860 } })
  await h.mouse.move(700, 500)
  await c.theme('light')

  // The same two notes kept and open again: one row, not two.
  await h.evaluate(() => {
    const live = JSON.parse(localStorage.getItem('split') ?? 'null')
    const kept = JSON.parse(localStorage.getItem('split-kept') ?? '[]')
    if (live) localStorage.setItem('split-kept', JSON.stringify([...kept, { ...live, id: 'copy-of-live' }]))
  })
  await h.reload()
  await wait(2500)
  check('the same notes side by side show as one row', await h.locator('[data-side-heading="split"] + div [data-pair-row]').count() === 1, String(await h.locator('[data-side-heading="split"] + div [data-pair-row]').count()))

  // 4. The menu bar title: one short thing at most.
  const title = await c.electron.evaluate(() => globalThis.trayTitle)
  check('the menu bar title is short', typeof title === 'string' && /^Sandbox( · [\d.,k]+ due)?$/.test(title), JSON.stringify(title))
  const menu = await c.electron.evaluate(() => globalThis.trayMenu ?? [])
  check('the tray menu still lists goals', menu.some((one) => one.label === 'Goals'), menu.slice(0, 6).map((one) => one.label).join(' | '))
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
