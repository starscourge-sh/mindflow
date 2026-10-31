// "Move to folder" with two folders of one name: each said with the folders
// it sits in ("Notes / Drafts", "Essays / Drafts"); a name of its own stays
// as it is. And the slash menu's "Table of contents" peek draws the block's
// tree (a trunk). Screenshots light and dark.
//   npx electron-vite build --outDir out-trees
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-trees/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox node qa/move-to-clash.mjs
import { mkdirSync } from 'fs'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const SHOTS = process.env.QA_SHOTS ?? '/private/tmp/claude-501/-Users-starscourge-Documents-forge-mindflow/703b99ba-c755-40e3-a385-896560d19061/scratchpad/trees-shots'
mkdirSync(SHOTS, { recursive: true })
const ED = '.note-pane .tiptap.ProseMirror.haligtree-editor:not(.is-line)'
const { check, done } = checks()
const c = await sandbox({ width: 1300, height: 900 })
const { h, v, send, close, both } = c
const wait = (ms) => h.waitForTimeout(ms)

try {
  await v('settings:set', { sounds: false, hintRate: 0 })
  const notes = await v('groups:make', 'article', 'Notes', null)
  const essays = await v('groups:make', 'article', 'Essays', null)
  await v('groups:make', 'article', 'Drafts', notes)
  await v('groups:make', 'article', 'Drafts', essays)
  const one = await v('article:new')
  await v('item:save', one, { title: 'A loose page to move', body: { type: 'doc', content: [{ type: 'paragraph' }] } })
  await c.go('articles'); await wait(1200)
  const row = h.locator('button[data-row]', { hasText: 'A loose page to move' }).first()
  await row.scrollIntoViewIfNeeded()
  await row.click({ button: 'right' }); await wait(300)
  await h.locator('[data-slot="context-menu-sub-trigger"]', { hasText: 'Move to folder' }).hover(); await wait(400)
  const sub = await h.locator('[data-slot="context-menu-sub-content"] [role="menuitem"]').allTextContents()
  check('two folders called Drafts are each said with the folder they sit in', sub.includes('Notes / Drafts') && sub.includes('Essays / Drafts') && !sub.includes('Drafts'), sub.join(' | '))
  check('a folder with a name of its own is said as it is', sub.includes('Notes') && sub.includes('Essays'), sub.join(' | '))
  await both(`${SHOTS}/move-to-folder`)
  await h.keyboard.press('Escape'); await h.keyboard.press('Escape'); await wait(300)

  // The slash menu's peek for "Table of contents": the block's own tree.
  const note = await h.evaluate(() => window.api.captures.create({ kind: 'note', body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Peek host' }] }, { type: 'paragraph' }] } }))
  await send('capture', note)
  await h.locator(ED).first().waitFor({ timeout: 10000 }); await wait(1500)
  await h.$eval(ED, (el) => el.editor.chain().focus('end').run())
  await wait(300); await h.keyboard.type('/'); await wait(500)
  await h.keyboard.type('table of con', { delay: 30 }); await wait(1500)
  const peek = await h.evaluate(() => {
    const art = document.querySelector('[data-peek-contents]')
    return art ? { rows: art.querySelectorAll('svg.pointer-events-none.absolute').length, words: art.textContent } : null
  })
  check('the "Table of contents" peek draws the tree, a trunk under Contents and one under its heading with sections', peek?.rows === 2 && /The ghost/.test(peek.words), JSON.stringify(peek))
  await both(`${SHOTS}/slash-toc-peek`)
} catch (error) {
  check('ran to the end', false, String(error?.stack ?? error))
} finally {
  await close()
}
done()
