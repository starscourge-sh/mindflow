// A #tag typed into a note's name becomes its tag and leaves the name (the user, 17 Nov, asked more than once:
// "why are tags kept in the name of the capture"). Quick capture: "#app-idea video editor" sent with ⌘↵ is named
// "video editor", tagged #app-idea on its last line, and its row shows #app-idea as before. Notes already saved so:
// moved once as the Inbox opens, said there with Undo, and Undo, pressed with the pointer, puts every one back.
//   QA_ARGS=--sandbox QA_DATA=<copy of the seeded sandbox> QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 [SHOTS=/abs/dir] node qa/tags-off-name.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'
process.env.HALIGTREE_QA_VIRTUAL ??= '1'
const { check, done } = checks()
const SHOTS = process.env.SHOTS

const c = await sandbox({ width: 1280, height: 800 })
const { electron, page, h, v, go, both, errors } = c
const sql = (q, ...args) => electron.evaluate((_, [q, args]) => globalThis.qaFeedSql(q, ...args), [q, args])
const EDITOR = '.tiptap.ProseMirror.haligtree-editor:not(.is-line)'
const textOf = (body) => { const doc = typeof body === 'string' ? JSON.parse(body) : body; return typeof doc === 'string' ? doc : (doc?.content ?? []).map((block) => (block.content ?? []).map((one) => one.text ?? '').join('')).join('\n') }
const labelOf = async (id) => (await sql("select label(title, body, named) as name from captures where id = ?", id))[0]?.name
try {
  await v('settings:set', { hintRate: 0, rotCount: 0, sounds: false, boxOneLine: false })
  // Saved before: a note with a tag in its name, as the user's book has them.
  const old = await sql("select id from captures where status = 'open' order by captured_at desc limit 1")
  const oldId = old[0].id
  const was = (await sql('select body from captures where id = ?', oldId))[0].body
  await sql('update captures set body = ? where id = ?', JSON.stringify({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'credit note, purchase order, invoice :order type #work ' }] }, { type: 'paragraph', content: [{ type: 'text', text: 'if im using stock' }] }] }), oldId)
  await sql("delete from settings where key = 'tagsOffNames'")

  // Quick capture, typed and sent.
  await page.evaluate(() => window.api.showPrompt()); await page.waitForTimeout(1300)
  await page.click(EDITOR)
  await page.keyboard.type('#app-idea video editor for youtube + shortform')
  await page.waitForTimeout(300)
  await page.keyboard.press('Meta+Enter')
  await page.waitForTimeout(1500)
  const sent = (await sql("select id, body from captures where body like '%video editor for youtube%' order by captured_at desc limit 1"))[0]
  check('quick capture: the name is the words without the tag', (await labelOf(sent?.id)) === 'video editor for youtube + shortform', await labelOf(sent?.id))
  check('quick capture: the tag is on the note’s last line, still its tag', textOf(sent?.body).split('\n').at(-1) === '#app-idea' && (await v('notes:tags', 'captures', sent?.id)).includes('app-idea'), JSON.stringify(textOf(sent?.body)))

  // The Inbox opens: the ones saved before are moved once, and it says so.
  await go('inbox')
  await h.waitForSelector('[data-tags-moved]', { timeout: 8000 }).catch(() => null)
  const line = await h.$eval('[data-tags-moved]', (el) => el.innerText).catch(() => '')
  check('the Inbox says the tags moved out of the names, with Undo', /#tags moved out of the names of/.test(line) && /Undo/.test(line), line)
  check('the note saved before is named without its tag, the tag on its last line', (await labelOf(oldId)) === 'credit note, purchase order, invoice :order type' && /\n#work$/.test(textOf((await sql('select body from captures where id = ?', oldId))[0].body)), await labelOf(oldId))
  // Its row still shows its tag, as it did when the tag was in its name.
  const row = await h.evaluate(() => [...document.querySelectorAll('[class*="@container/page"] button[data-row]')].map((one) => one.innerText.replace(/\s+/g, ' ')).find((text) => text.startsWith('credit note, purchase order')) ?? '')
  check('its row still shows #work beside the name', /#work/.test(row) && !/order type #work/.test(row), JSON.stringify(row))
  if (SHOTS) await both(`${SHOTS}/q1-tags-moved-inbox`)
  // Undo, pressed as a person does.
  const undo = await h.$('[data-tags-moved] button:has-text("Undo")')
  await undo?.click()
  await h.waitForTimeout(1200)
  check('Undo puts the note’s tag back in its name', /#work\s*$/.test(textOf((await sql('select body from captures where id = ?', oldId))[0].body).split('\n')[0]))
  check('the line goes once undone', !(await h.$('[data-tags-moved]')))
  await sql('update captures set body = ? where id = ?', was, oldId)
  check('no page errors', !errors.length, errors.slice(0, 3).join(' | '))
} finally {
  await c.close()
  done()
}
