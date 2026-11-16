// Every line of a menu acts on what the menu was opened on (gate question 2: one action, one home, one name).
// Opens the block menu on each kind of block in a note (paragraph, heading, list, task, quote, code, table,
// divider, callout, link card, file, picture), the note's own ⋯ menu, and a late day's menu on the calendar,
// lists every line, and checks the known misplaced or misnamed lines are gone:
//   - "Show in list" (about the note) in a block's menu; it lives in the note's ⋯ menu and ⌥⌘L.
//   - "Download" and "Open in default app" beside a file's "Save a copy" and a link's "Open in the default app".
//   - "Open link" and "Read it here" on a link card, where a link in the words says "Open in the browser" and
//     "Open in the reader"; both say "Copy link" for the address, as Notion does ("Copy link to block" is the block's).
//   - "Reschedule all late" in one day's menu; every late task at once is the page's "N late · Reschedule all…".
// Row, folder, sidebar and pin menus are qa/menu-fit.mjs's.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox node qa/menus-belong.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const { check, done } = checks()
const c = await sandbox({ width: 1300, height: 1000 })
const { h, v, send, go } = c
const wait = (ms) => h.waitForTimeout(ms)
const ED = '.note-pane .tiptap.ProseMirror.haligtree-editor:not(.is-line)'
const NEVER_IN_A_BLOCK = /^(Show in list|Download|Open in default app|Open link|Copy address|Copy link to this line|Read it here)$/
const text = (t) => [{ type: 'text', text: t }]
const p = (t) => ({ type: 'paragraph', content: text(t) })
const lines = () => h.evaluate(() => {
  const root = document.querySelector('.tiptap-block-menu')
  return root ? [...root.querySelectorAll('.tiptap-slash-menu-title')].map((one) => one.textContent.trim()) : []
})
const shut = async () => { for (let i = 0; i < 3 && await h.locator('[role="menu"]').count(); i++) { await h.keyboard.press('Escape'); await wait(150) } }

try {
  await v('settings:set', { sounds: false, hintRate: 0, countIn: false, homeCalendar: true })
  await v('onboarding:set', { pageHints: false })
  const doc = { type: 'doc', content: [
    p('A plain line of wrenfield words'),
    { type: 'heading', attrs: { level: 2 }, content: text('A wrenfield heading') },
    { type: 'bulletList', content: [{ type: 'listItem', content: [p('A wrenfield list item')] }] },
    { type: 'taskList', content: [{ type: 'taskItem', attrs: { checked: false }, content: [p('A wrenfield task item')] }] },
    { type: 'blockquote', content: [p('A wrenfield quote')] },
    { type: 'codeBlock', content: text('const wrenfield = 1') },
    { type: 'table', content: [{ type: 'tableRow', content: [{ type: 'tableCell', content: [p('wrenfield cell')] }, { type: 'tableCell', content: [p('two')] }] }] },
    { type: 'horizontalRule' },
    { type: 'callout', content: [p('A wrenfield callout')] },
    { type: 'bookmark', attrs: { href: 'https://example.com/wrenfield', title: 'Wrenfield page' } },
    { type: 'attachment', attrs: { src: 'https://example.com/wrenfield.pdf', name: 'wrenfield.pdf' } },
    { type: 'attachment', attrs: { src: 'https://example.com/wrenfield.zip', name: 'wrenfield.zip' } },
    p('The end')
  ] }
  const id = await h.evaluate((body) => window.api.captures.create({ kind: 'note', body }), doc)
  await send('capture', id)
  await h.locator(ED).waitFor({ timeout: 10000 })
  await wait(2000)
  // A picture dropped in, as Finder drops it, so it is the book's own file.
  await h.evaluate((sel) => new Promise((done) => {
    const canvas = Object.assign(document.createElement('canvas'), { width: 320, height: 200 })
    const pen = canvas.getContext('2d'); pen.fillStyle = '#6a8'; pen.fillRect(0, 0, 320, 200)
    canvas.toBlob((blob) => {
      const ed = document.querySelector(sel).editor
      const data = new DataTransfer()
      data.items.add(new File([blob], 'wrenfield.png', { type: 'image/png' }))
      const box = ed.view.dom.getBoundingClientRect()
      ed.view.dom.dispatchEvent(new DragEvent('drop', { dataTransfer: data, bubbles: true, cancelable: true, clientX: box.left + 20, clientY: box.bottom - 4 }))
      done()
    })
  }), ED)
  await h.waitForSelector(`${ED} img`, { timeout: 15000 }).catch(() => {})
  await wait(1200)

  const kinds = [
    ['paragraph', `${ED} > p`],
    ['heading', `${ED} > h2`],
    ['list', `${ED} > ul:not([data-type]) li p`],
    ['task', `${ED} [data-type="taskList"] li p`],
    ['quote', `${ED} > blockquote p`],
    ['code', `${ED} pre`],
    ['table', `${ED} td p`],
    ['divider', `${ED} hr`],
    ['callout', `${ED} [data-callout] p, ${ED} .tiptap-callout p, ${ED} [data-type="callout"] p`],
    ['link card', `${ED} .tiptap-bookmark`],
    ['PDF', `:is(${ED} [data-attachment], ${ED} .tiptap-attachment, ${ED} [data-type="attachment"]) >> nth=0`],
    ['file', `:is(${ED} [data-attachment], ${ED} .tiptap-attachment, ${ED} [data-type="attachment"]) >> nth=1`],
    ['picture', `${ED} img`]
  ]
  const seen = {}
  for (const [kind, sel] of kinds) {
    const at = h.locator(sel).first()
    if (!(await at.count())) { check(`${kind}: is in the note`, false, sel); continue }
    await at.scrollIntoViewIfNeeded().catch(() => {})
    const box = await at.boundingBox()
    await h.mouse.click(box.x + Math.min(12, box.width / 2), box.y + Math.min(8, box.height / 2), { button: 'right' }); await wait(600)
    const got = await lines()
    seen[kind] = got
    console.log(`  ${kind}: ${got.join(' | ')}`)
    const wrong = got.filter((one) => NEVER_IN_A_BLOCK.test(one))
    check(`${kind}: its menu opens, every line about the ${kind}`, got.length > 0 && !wrong.length, wrong.join(', ') || JSON.stringify(got))
    await shut()
  }
  // One name for one action, across the block kinds.
  const card = seen['link card'] ?? [], file = seen.file ?? [], picture = seen.picture ?? []
  check('a link card says what a link in the words says', ['Open in the browser', 'Copy link'].every((one) => card.includes(one)), JSON.stringify(card))
  check('a file says "Save a copy" and "Open in the default app"', ['Save a copy', 'Open in the default app'].every((one) => file.includes(one)), JSON.stringify(file))
  check('a picture says "Save a copy", as a file does', picture.includes('Save a copy'), JSON.stringify(picture))

  // The note's own menu has the note's "Show in list".
  await h.locator('.note-pane button[aria-label="More"]').first().click(); await wait(500)
  const more = await h.evaluate(() => [...document.querySelectorAll('[role=menu] [role=menuitem]')].map((one) => one.textContent.replace(/\s+/g, ' ').trim()))
  console.log(`  note ⋯: ${more.join(' | ')}`)
  check('the note\'s ⋯ menu has “Show in list”', more.some((one) => /^Show in list/.test(one)), JSON.stringify(more))
  await shut()

  // A late day's menu moves that day's late ones only.
  const day = (n) => { const d = new Date(); d.setDate(d.getDate() + n); d.setHours(10, 0, 0, 0); return d }
  for (const n of [-1, -1, -2]) await v('task:save', (await v('task:add', `wrenfield late ${n}`)).id, { due: day(n).toISOString(), allDay: 1 })
  await go('calendar'); await wait(1200)
  await h.evaluate(() => document.activeElement?.blur?.())
  await h.keyboard.press('d'); await wait(300)
  await h.keyboard.press('ArrowLeft'); await wait(600)
  const key = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const head = h.locator(`[data-cal-head="${key(day(-1))}"][data-cal-late]`).first()
  if (await head.count()) {
    await head.click({ button: 'right' }); await wait(500)
    const menu = await h.locator('[role="menu"]').first().innerText().catch(() => '')
    console.log(`  late day: ${menu.replace(/\n/g, ' | ')}`)
    check('a late day\'s menu moves that day\'s late ones, never every late one', /Reschedule this day's \d+ late/.test(menu) && !/Reschedule all/.test(menu), menu.replace(/\n/g, ' | '))
    await shut()
  } else check('yesterday, with late tasks, is on the calendar', false)
} finally {
  await c.close()
}
done()
