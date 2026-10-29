// Reading, E is "Write in it" (the shortcut list): on every kind that can be read, E unlocks the
// page, the caret goes in, and what is typed is saved where the item lives.
//
//   npx electron-vite build --outDir out-re
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-re/main/index.js HALIGTREE_QA_AWAY=1 node qa/read-e.mjs
import { sandbox } from './sandbox-lib.mjs'
import { checks } from './harness.mjs'
process.env.QA_ARGS ??= '--sandbox'

const c = await sandbox({ width: 1280, height: 840 })
const { h, v } = c
const { check, done } = checks()
const wait = (ms = 400) => h.waitForTimeout(ms)
await v('settings:set', { safeMode: false, hintRate: 0, rotCount: 0, motion: false })

try {
  await c.go('inbox')
  await wait(800)
  await h.evaluate(() => localStorage.setItem('readExitTold', '9'))
  // One of each kind there is to read: captures by their kind, and each tier of note.
  const captures = await h.evaluate(() => window.api.captures.list())
  const byKind = new Map()
  for (const one of captures) if (!byKind.has(one.kind ?? 'note')) byKind.set(one.kind ?? 'note', one)
  const links = [...byKind].map(([kind, one]) => ({ name: `capture (${kind})`, link: one.id, get: (id) => window.api.captures.get(id) }))
  for (const tier of ['nugget', 'article', 'question', 'goal']) {
    const rows = await v('items', tier)
    const kinds = new Map()
    for (const one of rows) if (!kinds.has(one.kind ?? '')) kinds.set(one.kind ?? '', one)
    for (const [kind, one] of kinds) links.push({ name: `${tier}${kind ? ` (${kind})` : ''}`, link: `${tier}:${one.id}`, id: one.id })
  }
  check('there are kinds to try', links.length >= 5, links.map((one) => one.name).join(', '))
  for (const one of links) {
    await h.evaluate((link) => window.dispatchEvent(new CustomEvent('haligtree:read', { detail: link })), one.link)
    await wait(1100)
    const reading = h.locator('[role="dialog"][aria-label="Reading"]')
    await h.mouse.move(640, 300)
    await h.keyboard.press('e')
    await wait(700)
    const lock = await reading.locator('[data-read-lock]').getAttribute('data-read-lock').catch(() => null)
    const editable = await h.evaluate(() => document.querySelector('[role="dialog"][aria-label="Reading"] .tiptap')?.getAttribute('contenteditable'))
    check(`${one.name}: E unlocks it to write in`, lock === 'open' && editable === 'true', JSON.stringify({ lock, editable }))
    await h.keyboard.type(' zqe')
    // Saved as you go: a moment after the keys stop.
    let saved = null
    for (let i = 0; i < 15 && !JSON.stringify(saved?.body ?? '').includes('zqe'); i++) {
      await wait(200)
      saved = one.id ? await v('item', one.id) : await h.evaluate((id) => window.api.captures.get(id), one.link)
    }
    const where = await h.evaluate(() => document.querySelector('[role="dialog"][aria-label="Reading"] .tiptap')?.textContent.slice(-60))
    check(`${one.name}: what is typed is saved`, JSON.stringify(saved?.body ?? '').includes('zqe'), 'on the page: ' + where)
    await h.keyboard.press('Escape')
    await wait(300)
    await h.keyboard.press('Escape')
    await wait(700)
  }
  // Vim on: the same E, the same writing.
  await h.evaluate(() => { localStorage.setItem('vim', 'on'); window.dispatchEvent(new StorageEvent('storage', { key: 'vim', newValue: 'on' })) })
  for (const one of [links[0], links.find((it) => it.id)]) {
    await h.evaluate((link) => window.dispatchEvent(new CustomEvent('haligtree:read', { detail: link })), one.link)
    await wait(1100)
    await h.keyboard.press('e')
    await wait(700)
    const lock = await h.locator('[role="dialog"][aria-label="Reading"] [data-read-lock]').getAttribute('data-read-lock').catch(() => null)
    check(`with Vim on, ${one.name}: E unlocks it`, lock === 'open', String(lock))
    await h.keyboard.press('Escape'); await wait(300); await h.keyboard.press('Escape'); await wait(300); await h.keyboard.press('Escape'); await wait(700)
  }
  await h.evaluate(() => { localStorage.setItem('vim', 'off'); window.dispatchEvent(new StorageEvent('storage', { key: 'vim', newValue: 'off' })) })
  // The Inbox read through with ⇧⌘R: E on its first page.
  await c.go('inbox')
  await wait(900)
  await h.keyboard.press('Meta+Shift+R')
  await wait(1100)
  await h.keyboard.press('Shift+E')
  await wait(700)
  check('the Inbox read with ⇧⌘R: ⇧E, as the list writes it, unlocks too', (await h.locator('[role="dialog"][aria-label="Reading"] [data-read-lock]').getAttribute('data-read-lock').catch(() => null)) === 'open')
} finally {
  await c.close()
}
done()
