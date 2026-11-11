// A row's right-click menu keeps every way to open it together (11 Nov: "Open", "Open in…", "Read" and "Open in a
// new tab" stood in four places): "Open" first, "Open in…" right under it, holding "Open in a new tab", "Open to the
// side", "Open in a new window" and "Read", in that order; none of them anywhere else in the menu. Pointing at a
// line shows no tip over the menu. "Read", picked from there, opens the note to read.
//   QA_ARGS=--sandbox QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/open-ways-together.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'
const { check, done } = checks()
const c = await sandbox({ width: 1400, height: 1000 })
const { h, v } = c
const wait = (ms) => h.waitForTimeout(ms)
const top = () => h.evaluate(() => [...(document.querySelector('[data-slot="context-menu-content"]')?.querySelectorAll(':scope > [role^="menuitem"], :scope > * > [role^="menuitem"]') ?? [])].map((one) => (one.querySelector('.truncate, span')?.textContent ?? one.textContent ?? '').trim().split('\n')[0]))
const sub = () => h.evaluate(() => [...(document.querySelector('[data-slot="context-menu-sub-content"]')?.querySelectorAll('[role^="menuitem"]') ?? [])].map((one) => { const r = one.getBoundingClientRect(); return { words: (one.textContent ?? '').trim(), h: Math.round(r.height), hand: getComputedStyle(one).cursor, cut: one.scrollWidth > one.clientWidth + 1 } }))
const tips = () => h.evaluate(() => document.querySelectorAll('[data-slot="tooltip-content"], [role="tooltip"]').length)
try {
  await v('settings:set', { sounds: false, hintRate: 0, safeMode: false })
  const id = await h.evaluate((body) => window.api.captures.create({ kind: 'note', body }), { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Ways to open this one' }] }, { type: 'paragraph', content: [{ type: 'text', text: 'Some words to read.' }] }] })
  await c.go('inbox'); await wait(1200)
  const row = h.locator(`[data-row][data-id="${id}"]`).first()
  for (const theme of ['dark', 'light']) {
    await c.look(theme)
    await row.click({ button: 'right' }); await wait(600)
    const lines = await top()
    check(`${theme}: "Open" is the first line and "Open in…" the one right under it`, lines[0]?.startsWith('Open') && !lines[0].startsWith('Open in') && lines[1]?.startsWith('Open in…'), lines.slice(0, 4).join(' | '))
    check(`${theme}: no other way to open stands anywhere else in the menu`, !lines.slice(2).some((one) => /^(Open in a new tab|Open to the side|Open in a new window|Read)$/.test(one)), lines.join(' | '))
    await h.locator('[data-slot="context-menu-content"] [role="menuitem"]', { hasText: 'Open in…' }).first().hover(); await wait(700)
    const ways = await sub()
    check(`${theme}: "Open in…" holds the four ways, most used first`, ways.length === 4 && /^Open in a new tab/.test(ways[0].words) && /^Open to the side/.test(ways[1].words) && /^Open in a new window/.test(ways[2].words) && /^Read/.test(ways[3].words), ways.map((one) => one.words).join(' | '))
    check(`${theme}: each of them shows the hand and none is cut short`, ways.every((one) => one.hand === 'pointer' && !one.cut), JSON.stringify(ways))
    for (const n of [0, 1, 2, 3]) { await h.locator('[data-slot="context-menu-sub-content"] [role^="menuitem"]').nth(n).hover(); await wait(650) }
    check(`${theme}: pointing at each line shows no tip over the menu`, (await tips()) === 0, String(await tips()))
    if (process.env.SHOTS) await h.screenshot({ path: `${process.env.SHOTS}/open-ways-${theme}.png` })
    if (theme === 'light') {
      await h.locator('[data-slot="context-menu-sub-content"] [role^="menuitem"]', { hasText: /^Read/ }).first().click(); await wait(1200)
      check('"Read", picked there, opens the note to read', (await h.locator('.mf-read').count()) === 1)
      await h.keyboard.press('Escape'); await wait(600)
    } else { await h.keyboard.press('Escape'); await wait(200); await h.keyboard.press('Escape'); await wait(300) }
  }
} catch (error) {
  check('the run finished', false, error.message.split('\n')[0])
} finally { await c.close() }
done()
