// Blocks and panes, driven in the real main window on sandbox data:
//   1. lines picked and dragged by the grip onto a toggle's own line go inside it;
//   2. a box dragged from the margin picks several blocks, ⌫ removes them, ⌘Z brings them back;
//   3. words picked, then a web address pasted: the words become that link;
//      a note link pasted: the words become a link to that note, saying the words;
//   4. "Turn into page" on a sentence: a new page with it, a link left in its place;
//   5. "Try it for 2 minutes" on a task starts a two minute focus round;
//   6. split view opens a fourth pane.
//
//   npx electron-vite build --outDir out-blocks
//   QA_ENTRY=out-blocks/main/index.js MINDFLOW_QA_AWAY=1 node qa/block-gestures.mjs
import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

process.env.QA_DATA ??= mkdtempSync(join(tmpdir(), 'vigil-blocks-'))
process.env.QA_ARGS ??= '--sandbox'
process.env.MINDFLOW_QA_AWAY ??= '1'
const { sandbox } = await import('./sandbox-lib.mjs')

const results = []
const check = (name, ok, detail = '') => (results.push(!!ok), console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`))
const c = await sandbox({ width: 1500, height: 950 })
const { h, electron, send, v } = c
const wait = (ms = 600) => h.waitForTimeout(ms)
const ED = '.note-pane .tiptap.ProseMirror.mindflow-editor:not(.is-line)'
const p = (text) => ({ type: 'paragraph', content: [{ type: 'text', text }] })
const doc = () => h.$eval(ED, (root) => root.editor.getJSON())
const tops = async () => (await doc()).content.map((one) => one.type === 'details' ? `[toggle:${one.content[1].content.map((x) => x.content?.[0]?.text ?? '').join(',')}]` : one.content?.[0]?.text ?? one.content?.[0]?.attrs?.label ?? '')

try {
  const other = await h.evaluate(() => window.api.captures.create({ kind: 'note', body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Linked target page' }] }] } }))
  const id = await h.evaluate((body) => window.api.captures.create({ kind: 'note', body }), {
    type: 'doc', content: [
      p('Probe heading line'),
      { type: 'details', attrs: { open: false }, content: [{ type: 'detailsSummary', content: [{ type: 'text', text: 'A toggle' }] }, { type: 'detailsContent', content: [{ type: 'paragraph' }] }] },
      p('alpha line'), p('beta line'), p('gamma line'), p('delta line'), p('the words to link here'), p('A sentence to lift out. And one that stays.')
    ]
  })
  await send('capture', id)
  await wait(1500)
  await h.locator(ED).waitFor({ timeout: 8000 })

  // 1. Pick alpha and beta, drag by the grip onto the toggle's line.
  await h.$eval(ED, (root) => {
    const e = root.editor
    let a = 0, b = 0
    e.state.doc.forEach((n, pos) => { if (n.textContent === 'alpha line') a = pos + 1; if (n.textContent === 'beta line') b = pos + n.nodeSize - 1 })
    e.chain().focus().setTextSelection({ from: a, to: b }).run()
  })
  const alpha = h.locator(`${ED} > p`, { hasText: 'alpha line' })
  await alpha.hover(); await wait(250)
  const grip = h.locator('.tiptap-drag-handle-grip')
  const from = await grip.boundingBox()
  const summary = await h.locator(`${ED} [data-type="details"] summary`).boundingBox()
  await h.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
  await h.mouse.down()
  await h.mouse.move(summary.x + 30, summary.y + summary.height / 2, { steps: 14 })
  const lit = await h.evaluate(() => !!document.querySelector('[data-type="details"].is-drop-into'))
  await wait(120)
  await h.mouse.up()
  await wait(400)
  let t = await tops()
  check('dragged lines onto a toggle go inside it', t.includes('[toggle:alpha line,beta line]') && !t.includes('alpha line') && !t.includes('beta line'), t.join(' | '))
  check('the toggle is lit while they are held over it', lit)
  check('and it opens to show them', await h.evaluate(() => !!document.querySelector('[data-type="details"].is-open')))

  // 2. Marquee from the left margin over gamma and delta.
  const box = await h.locator(ED).boundingBox()
  const g = await h.locator(`${ED} > p`, { hasText: 'gamma line' }).boundingBox()
  const d = await h.locator(`${ED} > p`, { hasText: 'delta line' }).boundingBox()
  const marginX = box.x + 6
  await h.mouse.move(marginX, g.y + 2)
  await h.mouse.down()
  await h.mouse.move(marginX + 200, d.y + d.height / 2, { steps: 10 })
  const shown = await h.evaluate(() => !!document.querySelector('[data-marquee]'))
  await h.mouse.up()
  const picked = await h.$eval(ED, (root) => { const { from, to } = root.editor.state.selection; return root.editor.state.doc.textBetween(from, to, '|') })
  check('a box from the margin is drawn', shown)
  check('and picks the blocks it touches', picked === 'gamma line|delta line', picked)
  await h.keyboard.press('Backspace'); await wait(300)
  t = await tops()
  check('⌫ removes the picked blocks', !t.includes('gamma line') && !t.includes('delta line'), t.join(' | '))
  await h.keyboard.press('Meta+z'); await wait(300)
  t = await tops()
  check('⌘Z brings them back', t.includes('gamma line') && t.includes('delta line'), t.join(' | '))

  // 3. Paste a web address, then a note link, onto picked words.
  const pick = (text) => h.$eval(ED, (root, text) => {
    const e = root.editor
    let at = -1
    e.state.doc.descendants((n, pos) => { if (at < 0 && n.isText && n.text.includes(text)) at = pos + n.text.indexOf(text) })
    e.chain().focus().setTextSelection({ from: at, to: at + text.length }).run()
  }, text)
  const paste = async (text) => { await electron.evaluate(({ clipboard }, text) => clipboard.writeText(text), text); await h.keyboard.press('Meta+v'); await wait(300) }
  await pick('words')
  await paste('https://example.com/page')
  const linked = await h.$eval(ED, (root) => { let out = null; root.editor.state.doc.descendants((n) => { if (n.isText && n.marks.some((m) => m.type.name === 'link')) out = { text: n.text, href: n.marks.find((m) => m.type.name === 'link').attrs.href } }); return out })
  check('a web address pasted onto words links them', linked?.text === 'words' && linked.href === 'https://example.com/page', JSON.stringify(linked))
  await pick('link here')
  await paste(`[[@${other}|Linked target page]]`)
  const noted = await h.$eval(ED, (root) => { let out = null; root.editor.state.doc.descendants((n) => { if (n.type.name === 'noteLink') out = n.attrs }); return out })
  check('a note link pasted onto words links to that note, saying the words', noted?.id === other && noted.text === 'link here', JSON.stringify(noted))

  // 4. Turn a sentence into its own page.
  await pick('A sentence to lift out.')
  await wait(500)
  const button = h.locator('[data-turn-into-page]')
  const offered = await button.isVisible().catch(() => false)
  check('the selection bar offers "Turn into page"', offered)
  if (offered) {
    await button.click(); await wait(800)
    const made = await h.$eval(ED, (root) => { const out = []; root.editor.state.doc.descendants((n) => { if (n.type.name === 'noteLink') out.push(n.attrs) }); return out.find((one) => one.label.startsWith('A sentence')) ?? null })
    const page = made && await h.evaluate((id) => window.api.captures.get(id), made.id)
    const text = JSON.stringify(page?.body ?? '')
    const left = await h.$eval(ED, (root) => root.editor.getText())
    check('a link to the new page is left in its place', !!made && !left.includes('A sentence to lift out.') && left.includes('And one that stays.'), JSON.stringify(made))
    check('the new page holds the sentence', text.includes('A sentence to lift out.'), text.slice(0, 120))
  }

  // 5. Try it for 2 minutes, from a task's panel.
  const task = await v('task:add', 'Probe task to try')
  await send('task', task.id)
  await wait(1500)
  const tryIt = h.getByText('Try it for 2 minutes', { exact: true }).first()
  const there = await tryIt.isVisible().catch(() => false)
  check('a task offers "Try it for 2 minutes"', there)
  if (there) {
    await tryIt.click(); await wait(800)
    const now = await v('focus:now')
    check('it starts a two minute focus round on the task', now?.taskId === task.id && now.plannedMs === 120000, JSON.stringify(now && { taskId: now.taskId, plannedMs: now.plannedMs }))
    if (now) await v('session:cancel', now.id)
  }

  // 6. Four panes: the sidebar away, then ⌥⌘\ three times.
  await c.go('ideas')
  await h.evaluate(() => document.activeElement?.blur?.())
  await h.keyboard.press('Meta+Backslash'); await wait(400)
  for (let i = 0; i < 3; i++) { await h.keyboard.press('Meta+Alt+Backslash'); await wait(700) }
  const panes = await h.evaluate(() => document.querySelectorAll('[data-pane]').length)
  check('split view opens a fourth pane', panes === 4, `${panes} panes`)
  await h.keyboard.press('Meta+Alt+Backslash'); await wait(700)
  const still = await h.evaluate(() => document.querySelectorAll('[data-pane]').length)
  check('and never a fifth', still === 4, `${still} panes`)
  for (let i = 0; i < 3; i++) { await h.keyboard.press('Control+w'); await wait(400) }
  await h.keyboard.press('Meta+Backslash'); await wait(300)
  const errors = c.errors.filter((one) => !/net::|Failed to load resource/.test(one))
  check('no page errors', !errors.length, errors.slice(0, 3).join(' / '))
} catch (error) {
  check('ran to the end', false, String(error?.stack ?? error).slice(0, 400))
} finally {
  await c.close()
}
const failed = results.filter((ok) => !ok).length
console.log(`\n${results.length - failed}/${results.length} passed`)
process.exit(failed ? 1 : 0)
