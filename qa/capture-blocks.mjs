// Selected blocks (a heading, a paragraph, a list) captured from a note, reworded or not: the note keeps exactly
// its own words, nothing doubled, nothing lost; the words are only marked as kept.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/capture-blocks.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const { check, done } = checks()
const c = await sandbox({ width: 1400, height: 1000 })
const { h, v } = c
const wait = (ms) => h.waitForTimeout(ms)
const p = (text) => ({ type: 'paragraph', content: [{ type: 'text', text }] })
const li = (text) => ({ type: 'listItem', content: [p(text)] })
const body = { type: 'doc', content: [
  p('Before the part.'),
  { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'The Paradox of Prohibition' }] },
  p('When an authority bans a text, it rarely vanishes.'),
  { type: 'bulletList', content: [li('What was banned.'), li('Why it was banned.'), li('Who held it.')] },
  p('As a result, the censors build an archive.'),
  p('After the part.')
] }
const text = () => h.evaluate(() => document.querySelector('[data-open] .tiptap')?.innerText ?? '')
const count = (all, one) => all.split(one).length - 1
try {
  await v('settings:set', { sounds: false, hintRate: 0 })
  const id = await v('article:new')
  await v('item:save', id, { title: 'Blocks', body })
  await c.send('article', id); await wait(1500)
  const before = await text()
  for (const [how, keys] of [['reworded, then Save', null], ['kept as it is (⌘-click)', 'Meta']]) {
    // Select from the heading through the last list item's paragraph after it.
    await h.evaluate(() => {
      const ed = document.querySelector('[data-open] .tiptap').editor
      let from = 0, to = 0
      ed.state.doc.descendants((node, pos) => {
        if (node.isText && node.text.startsWith('The Paradox')) from = pos
        if (node.isText && node.text.startsWith('As a result')) to = pos + node.nodeSize
      })
      ed.chain().focus().setTextSelection({ from, to }).run()
    })
    await wait(700)
    await h.click('[data-selection-bar] button[aria-label="Capture"]', keys ? { modifiers: [keys] } : {})
    await wait(700)
    if (!keys) { await h.keyboard.press('Meta+Enter'); await wait(900) }
    const after = await text()
    check(`${how}: the note keeps its words once each`, ['The Paradox of Prohibition', 'When an authority bans', 'What was banned', 'Who held it', 'As a result', 'Before the part', 'After the part'].every((one) => count(after, one) === 1), JSON.stringify(['The Paradox', 'What was banned', 'As a result'].map((one) => [one, count(after, one)])))
    check(`${how}: and nothing else changed`, after.replace(/\s+/g, ' ') === before.replace(/\s+/g, ' '), after.slice(0, 300))
    await h.keyboard.press('Escape'); await wait(300)
    // Captured twice the same words are refused the second time; change nothing for the next round.
    await v('item:save', id, { body }); await c.send('article', id); await wait(1200)
  }
  // The same in an Inbox note open in a window of its own, with the main window on it too (as on the user's screen).
  const cap = await h.evaluate(async () => window.api.captures.create({ body: 'Before the part.\n\n## The Paradox of Prohibition\n\nWhen an authority bans a text, it rarely vanishes.\n\n- What was banned.\n- Why it was banned.\n- Who held it.\n\nAs a result, the censors build an archive.\n\nAfter the part.' })).catch(() => null)
  if (cap) {
    await c.send('capture', cap); await wait(1200)
    await h.evaluate((one) => window.api.haligtree('notes:window', 'capture', one, null, null), cap).catch(() => {})
    let win = null
    for (let i = 0; i < 30 && !win; i++) (win = c.electron.windows().find((one) => /view=note|note\.html/.test(one.url()) && one.url().includes(cap))), await wait(200)
    check('the note opens in a window of its own', !!win, c.electron.windows().map((one) => one.url().slice(-80)).join(' | '))
    if (win) {
      await win.waitForTimeout(1500)
      const own = () => win.evaluate(() => document.querySelector('.tiptap')?.innerText ?? '')
      const was = await own()
      await win.evaluate(() => {
        const ed = document.querySelector('.tiptap').editor
        let from = 0, to = 0
        ed.state.doc.descendants((node, pos) => {
          if (node.isText && node.text.startsWith('The Paradox')) from = pos
          if (node.isText && node.text.startsWith('As a result')) to = pos + node.nodeSize
        })
        ed.chain().focus().setTextSelection({ from, to }).run()
      })
      await win.waitForTimeout(700)
      await win.click('[data-selection-bar] button[aria-label="Capture"]')
      await win.waitForTimeout(700)
      await win.keyboard.press('Meta+Enter'); await win.waitForTimeout(2500)
      const now = await own()
      const main = await text()
      const saved = JSON.stringify((await h.evaluate((one) => window.api.captures.get(one), cap).catch(() => null))?.body ?? '')
      check('in its own window: its words once each, there and in the main window', ['The Paradox', 'What was banned', 'As a result'].every((one) => count(now, one) === 1 && count(main, one) <= 1), JSON.stringify({ now: count(now, 'The Paradox'), main: count(main, 'The Paradox') }))
      check('and once each in what is saved', count(saved, 'The Paradox of Prohibition') === 1 && count(saved, 'What was banned') === 1, String(count(saved, 'The Paradox of Prohibition')))
      check('and the window shows what it showed, marked only', now.replace(/\s+/g, ' ') === was.replace(/\s+/g, ' '), now.slice(0, 200))
    }
  }
  // A long selection with headings: offered a capture a heading, which keeps each part apart and the note unchanged.
  const long = (n) => ({ type: 'doc', content: [1, 2, 3].flatMap((i) => [{ type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: `Part ${i}` }] }, p(`Words of part ${i}. `.repeat(n))]) })
  const big = await v('article:new')
  await v('item:save', big, { title: 'Long', body: long(40) })
  await c.send('article', big); await wait(1500)
  const inboxBefore = (await h.evaluate(() => window.api.captures.list())).length
  await h.evaluate(() => { const ed = document.querySelector('[data-open] .tiptap').editor; ed.chain().focus().selectAll().run() })
  await wait(700)
  await h.click('[data-selection-bar] button[aria-label="Capture"]'); await wait(700)
  check('a long selection with headings is offered a capture a heading', (await h.locator('[data-reword-parts]').count()) === 1, await h.locator('[data-reword-parts]').innerText().catch(() => 'none'))
  await h.click('[data-reword-split]'); await wait(1500)
  const added = (await h.evaluate(() => window.api.captures.list())).slice(0, 3).map((one) => one.label ?? one.title ?? '')
  check('and it keeps three captures, one a part', (await h.evaluate(() => window.api.captures.list())).length - inboxBefore === 3, JSON.stringify(added))
  const longText = await text()
  check('the note keeps its words once each', [1, 2, 3].every((i) => count(longText, `Part ${i}`) === 1), longText.slice(0, 120))
  check('no page errors', !c.errors?.some((one) => /PAGEERROR/.test(one)), (c.errors ?? []).slice(0, 2).join(' | '))
} catch (error) {
  check('the run finished', false, error.message.split('\n')[0])
} finally {
  await c.close?.()
}
done()
