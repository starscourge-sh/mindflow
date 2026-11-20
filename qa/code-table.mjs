// A table pasted from a terminal, kept as a code block: plain (no colours from a wrong language guess: "Mother's"
// opened a string), never wrapped (its last column stayed on its own line), no spelling squiggles, and a note that
// opens with it keeps "Add property" above it, not under it as if a footer. The block menu's own lines carry icons.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 [SHOTS=<dir>] node qa/code-table.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'
const { check, done } = checks()
const c = await sandbox({ width: 1100, height: 800 })
const { h, v } = c
const wait = (ms) => h.waitForTimeout(ms)
const rows = ["Mother's Day Cards                             336", "    MC01   Mother's Day Counterline                  335", "    MP01   Mother's Day Import Promotions              1", '', "Valentine's Day Cards                          299", '    VC01   Valentine Counterline                     297', '    VP01   Valentine Promotion                         2']
try {
  await v('settings:set', { sounds: false, hintRate: 0 })
  const id = await v('article:new')
  await v('item:save', id, { title: 'Cards', body: { type: 'doc', content: [{ type: 'codeBlock', attrs: { language: null }, content: [{ type: 'text', text: rows.join('\n') }] }, { type: 'paragraph' }] } })
  await c.send('article', id); await wait(3000)
  const got = await h.evaluate(() => {
    const pre = document.querySelector('[data-open] .tiptap:not(.is-line):not(.is-plain) pre')
    const strip = document.querySelector('[data-open] [data-property-strip]:not([data-in-panel])')
    return { painted: pre.querySelectorAll('[class^="hljs-"]').length, white: getComputedStyle(pre).whiteSpace, spell: pre.spellcheck, lines: Math.round(pre.querySelector('code').getBoundingClientRect().height / parseFloat(getComputedStyle(pre).lineHeight || '20')), above: strip ? strip.getBoundingClientRect().bottom <= pre.getBoundingClientRect().top + 1 : null }
  })
  check('a table is left plain, no colours from a guess', got.painted === 0, JSON.stringify(got))
  check('its lines are never wrapped', got.white === 'pre', got.white)
  check('no spelling squiggles in code', got.spell === false, String(got.spell))
  check('"Add property" sits above a note that opens with code', got.above === true, String(got.above))
  if (process.env.SHOTS) await h.screenshot({ path: `${process.env.SHOTS}/code-table.png` })
  // The block menu, from the code block's handle.
  await h.hover('[data-open] .tiptap:not(.is-line):not(.is-plain) pre'); await wait(400)
  const handle = h.locator('.tiptap-drag-handle-grip').first()
  await handle.click(); await wait(600)
  const icons = await h.evaluate(() => [...document.querySelectorAll('.tiptap-block-menu-list [role=menuitem]')].filter((one) => /^(Copy|Duplicate|Delete)$/.test(one.textContent.trim())).map((one) => !!one.querySelector('svg, [data-menu-icon]')))
  check('the block menu\'s Copy, Duplicate and Delete carry icons', icons.length >= 3 && icons.every(Boolean), JSON.stringify(icons))
  if (process.env.SHOTS) await h.screenshot({ path: `${process.env.SHOTS}/code-table-menu.png` })
} catch (error) {
  check('the run finished', false, error.message.split('\n')[0])
} finally {
  await c.close?.()
}
done()
