// The keys a list's row menu names work after a plain click on the row, the
// way they do after ⇧-click. In each list: click a row (it opens beside the
// list and is lit), press ⌫, and it is in the Bin with a notice; ⌘Z brings it
// back. ↓ after a click moves on from the clicked row. And ⌫ typed inside an
// open note's editor deletes a letter, never the note.
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-keys/main/index.js MINDFLOW_QA_AWAY=1 node qa/list-keys-after-click.mjs
import { sandbox } from './sandbox-lib.mjs'

const results = []
const check = (name, ok, detail = '') => (results.push(!!ok), console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`))
const c = await sandbox({ width: 1400, height: 900 })
const { h, page: box, go, send, v } = c

const ROW = '[data-row][data-id], [data-pick], [data-drag-open]'
const rows = (w, root) => w.evaluate(([root, ROW]) => {
  const scope = document.querySelector(root) ?? document.body
  return [...new Set([...scope.querySelectorAll(ROW)].filter((one) => one.getBoundingClientRect().height > 0 && !one.closest('[data-example], [data-beside], .note-pane'))
    .map((one) => one.dataset.id ?? one.dataset.pick ?? one.dataset.dragOpen))].filter(Boolean)
}, [root, ROW])
const rowAt = (w, root, key) => w.locator(`${root} [data-row][data-id="${key}"], ${root} [data-pick="${key}"], ${root} [data-drag-open="${key}"]`).first()
const toastNow = (w) => w.evaluate(() => [...document.querySelectorAll('[role=status][aria-live]')].map((one) => one.textContent.replace(/\s+/g, ' ').trim()).filter(Boolean).join(' | '))
const keysAt = (w) => w.evaluate(() => { const a = document.activeElement; return a?.isContentEditable ? 'editor' : `${a?.tagName ?? ''}${a?.dataset?.row !== undefined ? ' row' : ''}` })
const until = async (test, ms = 4000) => { const t0 = Date.now(); let s; do { await h.waitForTimeout(200); s = await test() } while (!s && Date.now() - t0 < ms); return s }
// Binned, by what the database says: a long list draws only what is in view.
const binned = (w, key) => w.evaluate(async (key) => {
  const id = key.includes(':') ? key.split(':').slice(1).join(':') : key
  const capture = await window.api.captures.get(id).catch(() => null)
  if (capture) return capture.status === 'discarded'
  const item = await window.api.vigil('item', id).catch(() => null)
  if (item) return !!item.binnedAt
  const task = await window.api.vigil('task', id).catch(() => null)
  return task ? task.status === 'dropped' : null
}, key)

async function list(name, w, root, open) {
  if (process.env.ONLY && !name.includes(process.env.ONLY)) return
  await open()
  const shown = await rows(w, root)
  if (shown.length < 2) return check(`${name}: has rows to try`, false, `${shown.length}`)
  // ↓ after a click: from the clicked row to the next one.
  await rowAt(w, root, shown[0]).click({ position: { x: 30, y: 10 } })
  await w.waitForTimeout(700)
  await w.keyboard.press('ArrowDown')
  await w.waitForTimeout(300)
  const ring = await w.evaluate((root) => { const one = (document.querySelector(root) ?? document).querySelector('[data-cursor]'); return one?.dataset.id ?? one?.dataset.pick ?? one?.dataset.dragOpen ?? null }, root)
  check(`${name}: ↓ after a click moves on from the clicked row`, ring === shown[1] || ring?.endsWith(`:${shown[1]}`) || shown[1].endsWith(`:${ring}`), `ring on ${ring}, rows ${shown.slice(0, 2).join(', ')}`)
  // ⌫ after a plain click: the clicked one, to the Bin.
  const one = shown[1]
  await rowAt(w, root, one).click({ position: { x: 30, y: 10 } })
  await w.waitForTimeout(700)
  const where = await keysAt(w)
  await w.keyboard.press('Backspace')
  const gone = await until(() => binned(w, one))
  check(`${name}: ⌫ after a plain click bins the clicked row`, gone, `keys were in ${where}`)
  if (!gone) return
  check(`${name}: with a notice and its Undo`, /Bin/.test(await toastNow(w)) && /Undo/.test(await toastNow(w)), await toastNow(w))
  await w.waitForTimeout(300)
  await w.keyboard.press('Meta+z')
  const back = await until(async () => (await binned(w, one)) === false)
  check(`${name}: ⌘Z brings it back`, back)
}

try {
  await v('settings:set', { sounds: false, hintRate: 0, countIn: false })
  await v('onboarding:set', { pageHints: false })
  for (const w of [h, box]) await w.evaluate(() => localStorage.setItem('saber-offered', new Date().toISOString()))
  const page = (id) => `[data-page="${id}"]`
  const main = (id) => async () => { await go(id); await h.waitForTimeout(600) }
  for (const [name, id] of [['Everything', 'all'], ['Inbox', 'inbox'], ['Writing', 'articles'], ['Gems', 'nuggets'], ['Questions', 'questions'], ['Tasks (Upcoming)', 'upcoming']])
    await list(name, h, page(id), main(id))
  // A tag page, its list and its stream: a click opens the note on its own
  // page, and ⌫ there takes the one it opened.
  const [tag] = await v('tags')
  for (const [name, tab] of [['list', /^Manage$/i], ['stream', /^Read$/i]]) {
    if (process.env.ONLY && !`Tag ${name}`.includes(process.env.ONLY)) continue
    await send('tag', tag.tag); await h.waitForTimeout(1400)
    const switcher = h.getByRole('button', { name: tab }).or(h.getByRole('tab', { name: tab })).first()
    if (await switcher.count()) { await switcher.click(); await h.waitForTimeout(700) }
    const key = await h.evaluate((name) => [...document.querySelectorAll(name === 'list' ? 'button[data-pick]' : 'div[data-pick]')].find((one) => one.getBoundingClientRect().height > 0 && !one.dataset.pick.startsWith('task:'))?.dataset.pick, name)
    if (!key) { check(`Tag #${tag.tag} ${name}: has rows to try`, false); continue }
    await h.locator(`[data-pick="${key}"]`).first().click({ position: { x: 30, y: 8 } })
    await h.waitForTimeout(1200)
    const where = await keysAt(h)
    await h.keyboard.press('Backspace')
    const gone = await until(() => binned(h, key))
    check(`Tag #${tag.tag} ${name}: ⌫ after a plain click bins the one it opened`, gone, `${key}, keys were in ${where}`)
    if (!gone) continue
    await h.waitForTimeout(300)
    await h.keyboard.press('Meta+z')
    check(`Tag #${tag.tag} ${name}: ⌘Z brings it back`, await until(async () => (await binned(h, key)) === false))
  }

  // Quick capture's Inbox and Tasks tabs.
  const boxOpen = (key) => async () => {
    await box.evaluate(() => window.api.showPrompt()); await box.waitForTimeout(600)
    await box.evaluate(() => document.activeElement?.blur()); await box.keyboard.press(key); await box.waitForTimeout(700)
  }
  await list('Quick capture Inbox', box, 'body', boxOpen('Control+1'))
  await list('Quick capture Tasks', box, 'body', boxOpen('Control+2'))
  await box.keyboard.press('Escape')

  // ⌫ inside the open note's editor deletes a letter, not the note.
  if (!process.env.ONLY) {
    await go('inbox'); await h.waitForTimeout(600)
    const [first] = await rows(h, page('inbox'))
    await rowAt(h, page('inbox'), first).click({ position: { x: 30, y: 10 } })
    await h.waitForTimeout(900)
    const editor = h.locator('.note-pane [contenteditable=true], [data-page="inbox"] [contenteditable=true]').first()
    await editor.click()
    await h.keyboard.press('Meta+ArrowDown')
    await h.keyboard.type('zq')
    await h.waitForTimeout(200)
    const before = await editor.innerText()
    await h.keyboard.press('Backspace')
    await h.waitForTimeout(600)
    const after = await editor.innerText().catch(() => '')
    const at = before.indexOf('zq')
    check('Editor: ⌫ while writing deletes a letter', at >= 0 && !after.includes('zq') && after.length === before.length - 1, `“${before.slice(Math.max(0, at - 4), at + 4)}” → “${after.slice(Math.max(0, at - 4), at + 3)}”`)
    check('Editor: and the note stays out of the Bin', (await binned(h, first)) === false)
  }
} finally {
  await c.close()
}
const passed = results.filter(Boolean).length
console.log(`\n${passed}/${results.length} passed`)
if (passed !== results.length) process.exitCode = 1
