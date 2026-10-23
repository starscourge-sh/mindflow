// Read mode's lock, in the sandbox: a note read alone (its "Read" button) has a
// lock at the top right, in the same spot locked and unlocked; locked, typing
// changes nothing; unlocked, typing saves (read back through the API); ⌘L
// turns it either way; a #tag in the title and in the line under it opens the
// tag's page, as a tag in the words does.
//
//   npx electron-vite build --outDir out-re
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-re/main/index.js HALIGTREE_QA_AWAY=1 node qa/read-edit.mjs
import { sandbox } from './sandbox-lib.mjs'
import { checks } from './harness.mjs'

const c = await sandbox({ width: 1280, height: 840 })
const { h, v } = c
const { check, done } = checks()
const wait = (ms = 400) => h.waitForTimeout(ms)
await v('settings:set', { safeMode: false, hintRate: 0, rotCount: 0, motion: false })

const textOf = (body) => JSON.stringify(body ?? '')
const doc = {
  type: 'doc',
  content: [
    { type: 'paragraph', content: [{ type: 'text', text: 'The State of Probe #probetag' }] },
    ...Array.from({ length: 30 }, (_, n) => ({ type: 'paragraph', content: [{ type: 'text', text: `Line ${n + 1} of the probe note, long enough to read for a while.` }] }))
  ]
}

try {
  await c.go('inbox')
  await wait(800)
  const row = h.locator('[data-pane] [data-row][data-id]').first()
  const id = await row.getAttribute('data-id')
  await h.evaluate(([at, body]) => window.api.captures.save(at, { body }), [id, doc])
  await wait(500)
  await row.click()
  await wait(1000)
  await h.evaluate(() => localStorage.setItem('readExitTold', '9'))

  const openRead = async () => {
    await h.locator('[data-pane] button[aria-label="Read"]').first().click()
    await wait(1000)
    await h.mouse.move(640, 40)
    await wait(300)
  }
  await openRead()
  // SHOTS=dir keeps a picture of the page, locked.
  if (process.env.SHOTS) await h.screenshot({ path: `${process.env.SHOTS}/read-locked.png` })
  const reading = h.locator('[role="dialog"][aria-label="Reading"]')
  const lock = reading.locator('[data-read-lock]')
  check('read mode is open with a lock', (await lock.count()) === 1)
  check('it starts locked', (await lock.getAttribute('data-read-lock')) === 'locked')
  const rectLocked = await lock.boundingBox()
  check('the lock sits at the top right', rectLocked && rectLocked.y < 40 && rectLocked.x > 1000, JSON.stringify(rectLocked))

  // Locked: a click in the words, then typing, changes nothing.
  const words = reading.locator('.tiptap.ProseMirror')
  await words.locator('p').nth(5).click()
  await h.keyboard.type('zqzq')
  await wait(800)
  let saved = await h.evaluate((at) => window.api.captures.get(at), id)
  check('locked, typing changes nothing', !textOf(saved?.body).includes('zqzq'))
  check('locked, the words are not editable', (await words.getAttribute('contenteditable')) === 'false')

  // Scrolled a little, then unlocked by the button: same spot, same scroll, editable.
  const scroller = reading.locator('.overflow-y-auto').first()
  await scroller.evaluate((el) => (el.scrollTop = 200))
  await wait(200)
  const scrollBefore = await scroller.evaluate((el) => el.scrollTop)
  await lock.click()
  await wait(700)
  const rectOpen = await lock.boundingBox()
  check('unlocked by the button', (await lock.getAttribute('data-read-lock')) === 'open')
  check('the button has not moved', JSON.stringify(rectOpen) === JSON.stringify(rectLocked), `${JSON.stringify(rectLocked)} vs ${JSON.stringify(rectOpen)}`)
  const scrollAfter = await scroller.evaluate((el) => el.scrollTop)
  check('the page stays where it was scrolled', Math.abs(scrollAfter - scrollBefore) < 4, `${scrollBefore} -> ${scrollAfter}`)
  check('unlocked, the words are editable', (await reading.locator('.tiptap.ProseMirror').getAttribute('contenteditable')) === 'true')
  check('the caret is in the words', await h.evaluate(() => !!document.activeElement?.closest('.tiptap.ProseMirror')))
  await h.keyboard.type('zzunlocked')
  await wait(1000)
  saved = await h.evaluate((at) => window.api.captures.get(at), id)
  check('unlocked, typing saves', textOf(saved?.body).includes('zzunlocked'))
  const said = textOf(saved?.body)
  check('and lands where it was clicked (in line 5)', said.indexOf('zzunlocked') > said.indexOf('Line 5 ') && said.indexOf('zzunlocked') < said.indexOf('Line 6 '))

  // ⌘L locks it again, and unlocks it again.
  await h.keyboard.press('Meta+l')
  await wait(600)
  check('⌘L locks it', (await lock.getAttribute('data-read-lock')) === 'locked' && (await reading.locator('.tiptap.ProseMirror').getAttribute('contenteditable')) === 'false')
  await h.keyboard.type('qzqz')
  await wait(700)
  saved = await h.evaluate((at) => window.api.captures.get(at), id)
  check('locked again, typing changes nothing', !textOf(saved?.body).includes('qzqz'))
  await h.keyboard.press('Meta+l')
  await wait(600)
  check('⌘L unlocks it', (await lock.getAttribute('data-read-lock')) === 'open')
  await h.keyboard.press('Meta+l')
  await wait(600)

  // The tag in the title line and in the line under it: a page of its own.
  await h.mouse.move(640, 40)
  const titleTag = reading.locator('.tiptap.ProseMirror > :first-child .tiptap-token[data-token="tag"]')
  check('the title has its tag', (await titleTag.count()) === 1)
  check('the title tag shows a pointer', (await titleTag.evaluate((el) => getComputedStyle(el).cursor)) === 'pointer')
  const metaTag = reading.locator('[data-read-meta] [data-read-tag="probetag"]')
  check('the line under the title has the tag as a button', (await metaTag.count()) === 1)
  await titleTag.click()
  await wait(1200)
  check('clicking the title tag ends reading', (await reading.count()) === 0)
  const onTag = await h.evaluate(() => document.body.innerText.includes('#probetag') || !!document.querySelector('[data-pane] [data-tag-page], [data-pane] h1'))
  check('and opens the tag page', onTag && (await h.locator('[data-pane]').first().innerText()).toLowerCase().includes('probetag'))

  // The meta line's tag does the same.
  await c.go('inbox')
  await wait(800)
  await h.locator(`[data-pane] [data-row][data-id="${id}"]`).first().click()
  await wait(900)
  await openRead()
  await reading.locator('[data-read-meta] [data-read-tag="probetag"]').click()
  await wait(1200)
  check('clicking the meta line tag opens the tag page', (await reading.count()) === 0 && (await h.locator('[data-pane]').first().innerText()).toLowerCase().includes('probetag'))

  // A past version or a card has nowhere for a tag to lead: no pointer there.
  const inert = await h.evaluate(() => {
    const box = Object.assign(document.createElement('div'), { className: 'haligtree-editor-content tags-inert' })
    const tag = Object.assign(document.createElement('span'), { className: 'tiptap-token', textContent: '#x' })
    tag.dataset.token = 'tag'
    box.append(tag)
    document.body.append(box)
    const cursor = getComputedStyle(tag).cursor
    box.remove()
    return cursor
  })
  check('a tag where it leads nowhere gives no pointer', inert !== 'pointer', inert)
  const errs = c.errors.filter((one) => !/Autofill|DevTools/.test(one))
  check('no errors', errs.length === 0, errs.join(' | '))
} catch (error) {
  check('ran without throwing', false, error.message)
} finally {
  await c.close()
}
done()
