// Files keeps two kinds of file: library files (added on purpose: Files' "Add", a drop on Files, Finder, "Keep in
// Files", and every file a book held before this was kept) and attachments (pictures and files pasted or dropped into a
// note). When the last note lets go of an attachment it waits under Files' "Unlinked" chip, with the day it was let go,
// until "Move all to the Bin" (with Undo); a library file in no note says "In no note" and is never offered for clean-up.
//   QA_ARGS=--sandbox QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/files-unlinked.mjs [shots]
import { join } from 'node:path'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const results = []
const check = (name, ok, detail = '') => { results.push(!!ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`) }
const c = await sandbox({ width: 1300, height: 900 })
const { h, v, send, go, electron, both, size } = c
const wait = (ms) => h.waitForTimeout(ms)
const SHOTS = process.argv[2] ?? process.env.QA_SHOTS
const ED = '.note-pane .tiptap.ProseMirror.haligtree-editor:not(.is-line)'
const toastText = () => h.evaluate(() => [...document.querySelectorAll('[role=status], [data-sonner-toast]')].map((one) => one.textContent).join(' | '))
const tile = (src) => v('media:list').then((all) => all.find((one) => one.src === src))
const unlinked = () => v('media:list').then((all) => all.filter((one) => !one.deck && !one.uses.length && one.how === 'attachment').map((one) => one.src))
const chipText = () => h.evaluate(() => document.querySelector('[data-media-unlinked] button')?.textContent.replace(/\s+/g, ' ').trim() ?? null)

/** A picture of its own colour, dropped into the open note as Finder drops it; gives back its stored address. */
async function dropPicture(colour) {
  const before = await h.evaluate((sel) => [...document.querySelectorAll(`${sel} img`)].map((one) => one.getAttribute('src')), ED)
  await h.evaluate(([sel, colour]) => new Promise((done) => {
    const canvas = Object.assign(document.createElement('canvas'), { width: 320, height: 200 })
    const pen = canvas.getContext('2d'); pen.fillStyle = colour; pen.fillRect(0, 0, 320, 200)
    canvas.toBlob((blob) => {
      const ed = document.querySelector(sel).editor
      const data = new DataTransfer()
      data.items.add(new File([blob], 'dropped.png', { type: 'image/png' }))
      const box = ed.view.dom.getBoundingClientRect()
      ed.view.dom.dispatchEvent(new DragEvent('drop', { dataTransfer: data, bubbles: true, cancelable: true, clientX: box.left + 20, clientY: box.bottom - 4 }))
      done()
    })
  }), [ED, colour])
  for (let i = 0; i < 60; i++) {
    const now = await h.evaluate((sel) => [...document.querySelectorAll(`${sel} img`)].map((one) => one.getAttribute('src')), ED)
    const fresh = now.find((src) => !before.includes(src) && /assets\//.test(src ?? ''))
    if (fresh) return fresh
    await wait(200)
  }
  return null
}
const note = async (text, content = []) => {
  const id = await h.evaluate((body) => window.api.captures.create({ kind: 'note', body }), { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }, ...content] })
  await send('capture', id)
  await h.locator(ED).waitFor({ timeout: 10000 })
  await wait(1500)
  return id
}
/** The picture toolbar's remove: click the picture, then the toolbar's bin; the paper crumples, then it goes. */
async function crumple() {
  const img = h.locator(`${ED} img`).first()
  await img.click()
  await wait(500)
  const n = await h.locator(`${ED} img`).count()
  // How long the paper crumples before the picture leaves the note: the Bin's own crumple (CRUMPLE_MS, 650ms), not the 1.5s it was.
  const gone = h.evaluate(({ ED, n }) => new Promise((done) => {
    const t0 = performance.now()
    const tick = () => (document.querySelectorAll(`${ED} img`).length < n || performance.now() - t0 > 4000 ? done(Math.round(performance.now() - t0)) : requestAnimationFrame(tick))
    tick()
  }), { ED, n })
  await h.locator('[aria-label="Delete image"]').first().click()
  const ms = await gone
  check('the picture crumples for the Bin\'s time, then leaves the note (under 1.2s)', ms < 1200, `${ms}ms`)
  await wait(2600)
  return toastText()
}

try {
  await v('settings:set', { sounds: false, hintRate: 0 })
  await v('media:list')

  // 1. An existing book: a file a note held before this was kept is a library file. A store without the new table is made by taking it away.
  await note('An old note with its picture #legacy')
  const old = await dropPicture('#a63')
  await wait(2500)
  check('a picture dropped into a note is an attachment', (await tile(old))?.how === 'attachment', JSON.stringify((await tile(old))?.how))
  await electron.evaluate(({ app }) => {
    const { DatabaseSync } = process.mainModule.require('node:sqlite')
    const db = new DatabaseSync(process.mainModule.require('path').join(app.getPath('userData'), 'haligtree.db'))
    db.exec('drop table if exists media_how')
    db.close()
  })
  check('an existing book (no record of how files came): every file its notes hold is a library file', (await v('media:list')).filter((one) => !one.deck && one.uses.length).every((one) => one.how === 'library'), String((await v('media:list')).filter((one) => !one.deck && one.uses.length && one.how !== 'library').length))
  check('the old picture is a library file', (await tile(old))?.how === 'library')
  const legacyToast = await crumple()
  check('removed: its notice says it stays in Files', /Picture removed from the note\. It stays in Files/.test(legacyToast), legacyToast)
  await wait(2500)
  const oldTile = await tile(old)
  check('let go, the old picture shows as "In no note", never under Unlinked', oldTile && !oldTile.uses.length && oldTile.how === 'library' && !(await unlinked()).includes(old), JSON.stringify(oldTile && { uses: oldTile.uses.length, how: oldTile.how }))

  // 2. An attachment (dropped into a note) and a library file (added through Files, then put in a note).
  const n1 = await note('A note with a dropped picture #attached')
  const pasted = await dropPicture('#3a7')
  check('a picture dropped into a note', !!pasted, pasted)
  await wait(2500)
  check('it is an attachment', (await tile(pasted))?.how === 'attachment')
  const bytes = await h.evaluate(() => new Promise((done) => { const canvas = Object.assign(document.createElement('canvas'), { width: 200, height: 120 }); const pen = canvas.getContext('2d'); pen.fillStyle = '#57c'; pen.fillRect(0, 0, 200, 120); canvas.toBlob((blob) => blob.arrayBuffer().then((b) => done([...new Uint8Array(b)]))) }))
  const told = await h.evaluate((bytes) => window.api.haligtree('media:add', [{ name: 'Library shot.png', bytes: new Uint8Array(bytes) }]), bytes)
  const library = told.added[0]?.src
  check('a picture added through Files', !!library, JSON.stringify(told))
  await note('A note holding the library picture #library', [{ type: 'image', attrs: { src: library } }])
  await wait(2500)
  check('it is a library file, used by the note', (await tile(library))?.how === 'library' && (await tile(library))?.uses.length === 1)
  const libToast = await crumple()
  check('library picture removed: "Picture removed from the note. It stays in Files"', /Picture removed from the note\. It stays in Files/.test(libToast), libToast)
  await send('capture', n1)
  await wait(1500)
  const attToast = await crumple()
  check('attachment removed: "Picture removed. It\'s in Files › Unlinked"', /Picture removed\. It's in Files › Unlinked/.test(attToast), attToast)
  check('with Undo and Open', /Undo/.test(attToast) && /Open/.test(attToast), attToast)
  await wait(2500)

  // 3. Unlinked: only the attachment, newest let go first, with the day.
  const loose = await unlinked()
  check('Unlinked holds the attachment, not the library file', loose.includes(pasted) && !loose.includes(library) && !loose.includes(old), JSON.stringify(loose.length))
  check('the library file shows as in no note', (await tile(library))?.uses.length === 0 && (await tile(library))?.how === 'library')
  check('the attachment has the moment it was let go', !!(await tile(pasted))?.letGoAt && Date.now() - Date.parse((await tile(pasted)).letGoAt) < 60_000, (await tile(pasted))?.letGoAt)
  // "Open" on the notice goes to Files on Unlinked.
  await h.locator('[data-sonner-toast] button, [role=status] button', { hasText: /^Open/ }).first().click().catch(() => {})
  await wait(1500)
  check('"Open" on the notice opens Files on Unlinked', await h.evaluate(() => !!document.querySelector('[data-media-unlinked] [aria-pressed="true"], [data-media-unlinked] [data-on]')) || await h.evaluate(() => !!document.querySelector('[data-media-bin-unlinked]')))
  await go('media')
  await wait(800)
  check(`the chip says "Unlinked ${loose.length}"`, (await chipText()) === `Unlinked ${loose.length}`, await chipText())
  if (!(await h.evaluate(() => !!document.querySelector('[data-media-bin-unlinked]')))) await h.locator('[data-media-unlinked] button').click()
  await wait(800)
  const shown = await h.evaluate(() => [...document.querySelectorAll('[data-media-grid] [data-src]')].map((one) => one.dataset.src))
  check('on Unlinked, the page shows the attachment and not the library file', shown.includes(pasted) && !shown.includes(library), JSON.stringify(shown.length))
  const where = await h.evaluate((src) => document.querySelector(`[data-media-grid] [data-id="${src}"] [data-media-where]`)?.textContent ?? document.querySelector(`[data-media-grid] [data-src="${src}"]`)?.closest('[data-id]')?.textContent ?? '', pasted)
  check('its tile says "Unlinked today"', /Unlinked today/.test(where), where)
  if (SHOTS) { await both(join(SHOTS, 'unlinked-1300')); await size(560, 700); await both(join(SHOTS, 'unlinked-560')); await size(1300, 900) }

  // 4. "Keep in Files" on its tile takes it out of Unlinked; off puts it back.
  const at = h.locator(`[data-media-grid] [data-src="${pasted}"]`).first()
  await at.click({ button: 'right' })
  await wait(500)
  const line = h.getByRole('menuitem', { name: /Keep in Files/ }).first()
  check('its right-click has "Keep in Files"', await line.isVisible().catch(() => false))
  await line.click().catch(() => {})
  await wait(1200)
  check('"Keep in Files" on: out of Unlinked, a library file', !(await unlinked()).includes(pasted) && (await tile(pasted))?.how === 'library')
  await v('media:keep', pasted, false)
  await wait(800)
  check('off again: back under Unlinked', (await unlinked()).includes(pasted))

  // 5. "Move all to the Bin": only attachments go; Undo brings them back under Unlinked.
  await go('media'); await wait(800)
  if (!(await h.evaluate(() => !!document.querySelector('[data-media-bin-unlinked]')))) await h.locator('[data-media-unlinked] button').click()
  await wait(600)
  const count = (await unlinked()).length
  await h.locator('[data-media-bin-unlinked]').click()
  await wait(1200)
  const binToast = await toastText()
  check(`"Move all to the Bin" says how many went`, new RegExp(`Moved ${count === 1 ? '1 unlinked file' : `${count} unlinked files`} to the Bin`).test(binToast), binToast)
  check('the attachment is gone from Files, the library files stay', !(await tile(pasted)) && !!(await tile(library)) && !!(await tile(old)))
  await h.locator('[data-sonner-toast] button, [role=status] button', { hasText: /^Undo/ }).first().click()
  await wait(1200)
  check('Undo: back under Unlinked', (await unlinked()).includes(pasted) && (await unlinked()).length === count)

  // 6. In a note: "Remove and move to the Bin" from the picture's right-click, with Undo.
  await note('Holding it again #again', [{ type: 'image', attrs: { src: pasted } }])
  await wait(2000)
  const img = h.locator(`${ED} img`).first()
  const box = await img.boundingBox()
  await h.mouse.click(box.x + box.width / 2, box.y + box.height / 2, { button: 'right' }); await wait(600)
  const titles = await h.evaluate(() => [...document.querySelectorAll('.tiptap-block-menu .tiptap-slash-menu-title')].map((one) => one.textContent))
  check('the picture\'s right-click: "Keep in Files", "Remove from note", "Remove and move to the Bin"', ['Keep in Files', 'Remove from note', 'Remove and move to the Bin'].every((one) => titles.includes(one)) && !titles.includes('Delete'), JSON.stringify(titles))
  await h.locator('[data-remove-to-bin]').click()
  await wait(1800)
  const rbToast = await toastText()
  check('"Picture removed and moved to the Bin"', /Picture removed and moved to the Bin/.test(rbToast), rbToast)
  check('gone from Files, and from the note', !(await tile(pasted)) && (await h.locator(`${ED} img`).count()) === 0)
  await h.locator('[data-sonner-toast] button, [role=status] button', { hasText: /^Undo/ }).first().click()
  await wait(2500)
  check('Undo: the picture is back in the note and in Files', (await h.locator(`${ED} img`).count()) === 1 && (await tile(pasted))?.uses.length === 1, JSON.stringify((await tile(pasted))?.uses.length))
  check('no page errors', !c.errors?.length, (c.errors ?? []).slice(0, 2).join(' | '))
} finally { await c.close() }
const passed = results.filter(Boolean).length
console.log(`\n${passed}/${results.length} passed`)
process.exit(passed === results.length ? 0 : 1)
