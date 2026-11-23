// A task written with a picture in its description, as the user did (23 Nov): resizing the picture with its "S", "M" or
// "L" never sends the task off half written. The editor's toolbar buttons sat inside the add box's form as submit buttons.
import { readFileSync } from 'node:fs'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
const { check, done } = checks()
const s = await sandbox({ width: 1300, height: 900 })
const { h, close } = s
h.setDefaultTimeout(8000)
try {
  // Tasks reached as a person reaches it: its row in the sidebar.
  await h.locator('aside [data-side-row]', { hasText: /^Tasks/ }).first().click(); await h.waitForTimeout(1500)
  const before = (await s.v('tasks')).length
  await h.getByPlaceholder(/Add a task/).first().click()
  await h.keyboard.type('fix the timeout issue')
  await h.locator('[data-task-details]').first().click(); await h.waitForTimeout(600)
  const src = await h.evaluate((b) => window.api.saveImage('image/png', new Uint8Array(b)), Array.from(readFileSync(new URL('./fixtures/notebook-page.png', import.meta.url))))
  await h.evaluate((src) => document.querySelector('[data-task-details-box] .tiptap')?.editor?.commands.insertContent({ type: 'image', attrs: { src } }), src)
  await h.waitForTimeout(800)
  await h.locator('[data-task-details-box] .tiptap img').first().click(); await h.waitForTimeout(500)
  await h.locator('[aria-label="S width"]').first().click(); await h.waitForTimeout(800)
  const after = (await s.v('tasks')).length
  const still = await h.evaluate(() => !!document.querySelector('[data-task-details-box] .tiptap img'))
  check('pressing the picture\'s "S" makes no task and keeps the description open with the picture', after === before && still, JSON.stringify({ before, after, still }))
} catch (error) { check('ran', false, error.stack) } finally { await close() }
done()
