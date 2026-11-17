// Several picked notes let go on a shelf folder go into that folder.
// The card names the folder. The old build reorders the list instead.
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=$PWD/out-fs/main/index.js HALIGTREE_QA_AWAY=1 node qa/handover-shelf.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const { check, done } = checks()
const c = await sandbox({ width: 1280, height: 860, seeded: false })
const { h, v } = c
h.setDefaultTimeout(8000)
h.on('pageerror', (error) => console.log('PAGE', error.message.split('\n')[0]))
const wait = (ms) => h.waitForTimeout(ms)
const p = (text) => ({ type: 'paragraph', content: [{ type: 'text', text }] })

try {
  await v('settings:set', { hintRate: 0, rotCount: 0, sounds: false })
  await v('onboarding:set', { welcomed: new Date().toISOString(), newsSeen: true, welcoming: false, pageHints: false })
  const made = []
  for (const title of ['North page', 'East page', 'West page']) {
    const id = await v('article:new')
    await v('item:save', id, { title, body: { type: 'doc', content: [p(title)] } })
    made.push(id)
  }
  const folder = 'shelf-essays'
  await v('groups:arrange', 'article', {
    top: [...made, `g:${folder}`],
    groups: { [folder]: [] },
    revive: [{ id: folder, name: 'Essays', icon: null, color: null, folded: 0, folder: 1 }]
  })
  await h.evaluate(() => localStorage.setItem('view:article', JSON.stringify({ sort: 'manual', group: 'none', filter: {}, density: 'list' })))
  await c.go('articles')
  await wait(900)
  const skip = h.locator('[data-skip-intro]')
  if (await skip.count()) await skip.click({ force: true }).catch(() => {})
  await wait(400)
  const row = (title) => h.locator('button[data-row]', { hasText: title }).first()
  for (const title of ['North page', 'East page']) {
    await row(title).click({ modifiers: ['Meta'], position: { x: 80, y: 12 } })
    await wait(80)
  }
  const from = await row('East page').boundingBox()
  const onto = await h.locator('[data-folder-drop][data-folder-name="Essays"]').boundingBox()
  if (!from || !onto) throw new Error('the row or the folder was not on the page')
  await h.mouse.move(from.x + 160, from.y + from.height / 2)
  await h.mouse.down()
  await h.mouse.move(from.x + 160, from.y + from.height / 2 + 16, { steps: 4 })
  await wait(180)
  await h.mouse.move(onto.x + onto.width / 2, onto.y + onto.height / 2, { steps: 18 })
  await wait(500)
  const said = await h.evaluate(() => document.querySelector('[data-drag-label]')?.textContent?.trim() ?? '')
  check('the card names the shelf folder', said === 'Move 2 into Essays', said || 'no card')
  await h.mouse.up()
  await wait(800)
  const where = await h.evaluate(() => [...document.querySelectorAll('[data-group-block]')].map((el) => el.textContent?.replace(/\s+/g, ' ').trim().slice(0, 80) ?? ''))
  const toast = await h.evaluate(() => [...document.querySelectorAll('[data-sonner-toast], [role="status"]')].map((el) => el.textContent?.replace(/\s+/g, ' ').trim() ?? '').filter(Boolean).slice(0, 4))
  check('letting go puts the two notes in Essays', toast.some((line) => /Moved 2/.test(line) && /Essays/.test(line)), JSON.stringify({ toast, where }))
} catch (error) {
  check('the run finished', false, error instanceof Error ? error.message.split('\n')[0] : String(error))
} finally {
  await c.close?.()
}
done()
