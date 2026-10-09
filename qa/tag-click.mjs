// A plain click on a #tag opens that tag, wherever the note is written:
// a capture in the Inbox, a note in Notes, a note in a window of its own, and
// the box. Each with vim on and off, with the caret elsewhere and with it on
// the tag's own line, on a tag coloured on the Tags page and on one that is not.
// Then the two clicks that edit instead: ⌥-click, and a click on the tag the
// caret is already inside.
//
//   npx electron-vite build --outDir out-tags
//   QA_ARGS=--sandbox QA_ENTRY=out-tags/main/index.js node qa/tag-click.mjs
import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

process.env.QA_DATA ??= mkdtempSync(join(tmpdir(), 'vigil-tags-'))
process.env.QA_ARGS ??= '--sandbox'
const { sandbox } = await import('./sandbox-lib.mjs')

const c = await sandbox({ width: 1300, height: 860 })
const { h, page, v, go, send, electron } = c
const EDITOR = '.tiptap.ProseMirror.mindflow-editor:not(.is-line)'
const BODY = { type: 'doc', content: [
  { type: 'paragraph', content: [{ type: 'text', text: 'take a sad song' }] },
  { type: 'paragraph', content: [{ type: 'text', text: '#boom #tip #tip' }] }
] }
const results = []
const check = (ok, label) => { results.push({ ok, label }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`) }

// #boom is given a colour on the Tags page; #tip keeps the one its name picks.
await v('tag:set', 'boom', { color: 'red' })

const setVim = (win, on) => win.evaluate((on) => {
  localStorage.setItem('vim', on ? 'on' : 'off')
  window.dispatchEvent(new StorageEvent('storage', { key: 'vim', newValue: on ? 'on' : 'off' }))
}, on)

/** The editor `scope` finds in `win`, emptied down to the two lines. */
const fill = async (win, scope) => {
  await win.waitForSelector(`${scope} ${EDITOR}`, { timeout: 10000 })
  await win.$eval(`${scope} ${EDITOR}`, (el, json) => el.editor.commands.setContent(json, true), BODY)
  await win.waitForTimeout(400)
}
const tag = (win, scope, n) => win.locator(`${scope} ${EDITOR} .tiptap-token[data-token="tag"]`).nth(n)
/** Where the caret starts: the end of the first line, the end of the tag's line, or inside the tag. */
const place = async (win, scope, where) => {
  const lines = win.locator(`${scope} ${EDITOR} > p`)
  if (where === 'elsewhere') {
    const box = await lines.nth(0).boundingBox()
    await win.mouse.click(box.x + box.width - 4, box.y + box.height / 2)
  } else if (where === 'same line') {
    const box = await lines.nth(1).boundingBox()
    await win.mouse.click(box.x + box.width - 4, box.y + box.height / 2)
  } else {
    // Inside: put there by the keyboard's arrows, as you would to fix a typo.
    await win.$eval(`${scope} ${EDITOR}`, (el) => {
      let at = -1
      el.editor.state.doc.descendants((node, pos) => { if (at < 0 && node.isText && node.text.includes('#boom')) at = pos + node.text.indexOf('#boom') + 2 })
      el.editor.commands.focus()
      el.editor.commands.setTextSelection(at)
    })
  }
  await win.waitForTimeout(150)
}
const selection = (win, scope) => win.$eval(`${scope} ${EDITOR}`, (el) => el.editor.state.selection.from)
/** A real press: pointer there, button down a moment, up. Reports the pressed look while held. */
const press = async (win, locator, { alt = false } = {}) => {
  const box = await locator.boundingBox()
  await win.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 4 })
  const cursor = await locator.evaluate((el) => getComputedStyle(el).cursor)
  if (alt) await win.keyboard.down('Alt')
  await win.mouse.down()
  await win.waitForTimeout(60)
  const pressed = await locator.evaluate((el) => el.matches(':active')).catch(() => null)
  await win.mouse.up()
  if (alt) await win.keyboard.up('Alt')
  await win.waitForTimeout(700)
  return { cursor, pressed }
}

const homeView = () => h.evaluate(() => document.querySelector('header h1')?.textContent?.trim() ?? '')
const onTagPage = async (name) => h.evaluate((name) => {
  const title = document.querySelector('header h1')?.textContent ?? ''
  const page = document.querySelector('[class*="@container/page"]')?.textContent ?? ''
  return /tags/i.test(title) && page.includes(name)
}, name)

// ------------------------------------------------------------- the surfaces
const captures = await h.evaluate(() => window.api.captures.list())
const capture = captures.find((one) => one.status === 'open' && !one.archivedAt && !one.archived_at) ?? captures[0]
const nuggets = await v('items', 'nugget')
const nugget = nuggets.find((one) => !one.archivedAt) ?? nuggets[0]
const other = captures.filter((one) => one.id !== capture.id)[3]

const surfaces = {
  // The Inbox list with a capture open in its pane.
  async captures() {
    await go('inbox')
    await send('capture', capture.id)
    await h.waitForTimeout(1200)
    await fill(h, '.note-pane')
    return { win: h, scope: '.note-pane', opened: (name) => onTagPage(name), reset: async () => { await go('inbox'); await send('capture', capture.id); await h.waitForTimeout(900) } }
  },
  // A note in Notes, open in its pane.
  async notes() {
    await send('nugget', nugget.id)
    await h.waitForTimeout(1200)
    await fill(h, '.note-pane')
    return { win: h, scope: '.note-pane', opened: (name) => onTagPage(name), reset: async () => { await send('nugget', nugget.id); await h.waitForTimeout(900) } }
  },
  // A note in a window of its own: the tag opens in the main window.
  async window() {
    await go('home')
    await h.evaluate((id) => window.api.vigil('notes:window', 'capture', id), other.id)
    let win
    for (let i = 0; i < 50 && !win; i++) { win = electron.windows().find((w) => w.url().includes('note=')); if (!win) await h.waitForTimeout(200) }
    await win.waitForLoadState('domcontentloaded')
    await fill(win, 'body')
    return { win, scope: 'body', opened: (name) => onTagPage(name), reset: async () => { await go('home') } }
  },
  // The box: a tag opens search for it.
  async box() {
    await page.evaluate(() => window.api.vigil && localStorage.clear())
    await fill(page, 'body')
    const opened = async (name) => { const values = await page.evaluate(() => [...document.querySelectorAll('input')].map((one) => one.value)); if (process.env.DEBUG) console.log('inputs', values); return values.some((one) => one.trim() === `#${name}`) }
    // Search closed again: Escape from its own field.
    const reset = async () => {
      for (let i = 0; i < 3; i++) {
        const open = await page.evaluate(() => { const field = [...document.querySelectorAll('input')].find((one) => one.value.startsWith('#')); field?.focus(); return !!field })
        if (!open) return
        await page.keyboard.press('Escape')
        await page.waitForTimeout(400)
      }
    }
    return { win: page, scope: 'body', opened, reset }
  }
}

const only = (process.env.ONLY ?? '').split(',').filter(Boolean)
for (const [name, start] of Object.entries(surfaces)) {
  if (only.length && !only.includes(name)) continue
  let s
  try { s = await start() } catch (error) { check(false, `${name}: could not open (${error.message.split('\n')[0]})`); continue }
  for (const vim of [false, true]) {
    for (const where of ['elsewhere', 'same line']) {
      for (const [n, label] of [[0, '#boom (coloured)'], [2, 'last #tip']]) {
        await setVim(s.win, vim)
        await s.win.waitForTimeout(200)
        if (name !== 'box' && name !== 'window') await s.reset()
        if (name === 'window') await go('home')
        await fill(s.win, s.scope)
        await place(s.win, s.scope, where)
        const name_ = n === 0 ? 'boom' : 'tip'
        const { cursor, pressed } = await press(s.win, tag(s.win, s.scope, n))
        const ok = await s.opened(name_)
        check(ok, `${name}, vim ${vim ? 'on' : 'off'}, caret ${where}: click ${label} opens it${ok ? '' : ` (view: ${await homeView()})`}`)
        if (!vim && where === 'elsewhere' && n === 0) check(cursor === 'pointer' && pressed === true, `${name}: hand over a tag (${cursor}), pressed while held (${pressed})`)
        if (name === 'box') await s.reset()
      }
    }
    // The two clicks that edit: neither opens, and the caret lands in the tag.
    for (const kind of ['alt', 'inside']) {
      await setVim(s.win, vim)
      if (name !== 'box' && name !== 'window') await s.reset()
      if (name === 'window') await go('home')
      await fill(s.win, s.scope)
      if (kind === 'inside') await place(s.win, s.scope, 'inside')
      else await place(s.win, s.scope, 'elsewhere')
      await press(s.win, tag(s.win, s.scope, 0), { alt: kind === 'alt' })
      const at = await selection(s.win, s.scope)
      const opened = await s.opened('boom')
      const title = await tag(s.win, s.scope, 0).getAttribute('title').catch(() => null)
      check(!opened && at >= 18 && at <= 23, `${name}, vim ${vim ? 'on' : 'off'}: ${kind === 'alt' ? '⌥-click' : 'click with the caret inside'} edits (caret ${at}, opened ${opened})`)
      if (kind === 'alt' && !vim) check(/⌥-click to edit/.test(title ?? ''), `${name}: tooltip says so ("${title}")`)
      if (name === 'box' && opened) await s.reset()
    }
  }
  if (name === 'window') await s.win.close().catch(() => {})
}

const failed = results.filter((one) => !one.ok)
console.log(`\n${results.length - failed.length} of ${results.length} passed${c.errors.length ? `; page errors: ${c.errors.slice(0, 3).join(' | ')}` : ''}`)
await c.close()
process.exit(failed.length ? 1 : 0)
