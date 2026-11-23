// The note editor, used the way a person would: the block grip, Turn into,
// slash, the markdown marks, the selection bar, and Vim on and off.
// A block-type change must not leave a second bullet, or a heading, quote,
// or code block still sitting inside the list.
//   npx electron-vite build --outDir out-ed
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=$PWD/out-ed/main/index.js HALIGTREE_QA_AWAY=1 SHOTS=<dir> node qa/editor-abuse.mjs
import { mkdirSync } from 'fs'
import { sandbox } from './sandbox-lib.mjs'
import { checks } from './harness.mjs'
process.env.QA_ARGS ??= '--sandbox'

const SHOTS = process.env.SHOTS ?? ''
if (SHOTS) mkdirSync(SHOTS, { recursive: true })
const { check: raw, done } = checks()
const check = (name, ok, detail = '') => raw(name, ok, detail && typeof detail === 'object' ? JSON.stringify(detail) : String(detail))
const c = await sandbox({ width: 1280, height: 900, seeded: false })
const { h, v } = c
h.setDefaultTimeout(8000)
const wait = (ms) => h.waitForTimeout(ms)
const text = (value) => ({ type: 'text', text: value })
const para = (value) => ({ type: 'paragraph', content: value ? [text(value)] : [] })
const item = (value) => ({ type: 'listItem', content: [para(value)] })
const task = (value) => ({ type: 'taskItem', attrs: { checked: false }, content: [para(value)] })
const doc = (...content) => ({ type: 'doc', content })
const bullet = (value) => doc({ type: 'bulletList', content: [item(value)] })
const numbered = (value) => doc({ type: 'orderedList', content: [item(value)] })
const checks_ = (value) => doc({ type: 'taskList', content: [task(value)] })

const read = () => h.evaluate(() => {
  const ed = document.querySelector('[data-open] .tiptap:not(.is-line):not(.is-plain)')?.editor
  if (!ed) return { tree: 'NO EDITOR', bad: ['no editor'], vim: '', text: '' }
  const lines = []
  const bad = []
  const walk = (node, depth) => {
    if (node.isText) {
      lines.push(`${'  '.repeat(depth)}${JSON.stringify(node.text)}`)
      return
    }
    let label = node.type.name
    if (node.attrs?.level) label += ':' + node.attrs.level
    if (node.type.name === 'taskItem') label += node.attrs.checked ? ':on' : ':off'
    lines.push(`${'  '.repeat(depth)}${label}`)
    if (node.type.name === 'listItem' || node.type.name === 'taskItem') {
      let lists = 0
      let heading = false
      let quote = false
      let code = false
      let empty = false
      node.forEach((child) => {
        if (['bulletList', 'orderedList', 'taskList'].includes(child.type.name)) lists++
        if (child.type.name === 'heading') heading = true
        if (child.type.name === 'blockquote') quote = true
        if (child.type.name === 'codeBlock') code = true
        if (child.type.name === 'paragraph' && child.content.size === 0) empty = true
      })
      if (lists) bad.push(empty ? 'empty line over a nested list' : 'a list inside a list item')
      if (heading) bad.push('heading still inside the list')
      if (quote) bad.push('quote still inside the list')
      if (code) bad.push('code still inside the list')
    }
    node.forEach((child) => walk(child, depth + 1))
  }
  walk(ed.state.doc, 0)
  return { tree: lines.join('\n'), bad, vim: ed.view.dom.getAttribute('data-vim-mode') ?? '', text: ed.getText() }
})

const open = async (body) => {
  const id = await v('article:new')
  await v('item:save', id, { title: 'Abuse', body })
  await c.send('article', id)
  await wait(500)
  return id
}
const caret = (word) => h.evaluate((word) => {
  const ed = document.querySelector('[data-open] .tiptap:not(.is-line):not(.is-plain)').editor
  let at = 0
  ed.state.doc.descendants((node, pos) => {
    if (!at && node.isText && node.text === word) at = pos
  })
  ed.chain().focus().setTextSelection(at + 1).run()
}, word)
const atStart = (word) => h.evaluate((word) => {
  const ed = document.querySelector('[data-open] .tiptap:not(.is-line):not(.is-plain)').editor
  let at = 0
  ed.state.doc.descendants((node, pos) => {
    if (!at && node.isText && node.text === word) at = pos
  })
  ed.chain().focus().setTextSelection(at).run()
}, word)

const menu = async (word) => {
  await caret(word)
  const line = h.locator('[data-open] .ProseMirror p, [data-open] .ProseMirror pre, [data-open] .ProseMirror summary', { hasText: new RegExp(`^${word}$`) }).first()
  await line.click({ button: 'right' })
  await h.locator('.tiptap-block-menu').first().waitFor({ timeout: 4000 })
}

const turn = async (word, into) => {
  await menu(word)
  await h.locator('[data-turn-into-sub]').hover()
  await wait(200)
  const row = h.locator('.tiptap-block-menu-sub .tiptap-slash-menu-title', { hasText: new RegExp(`^${into}$`) })
  if (!(await row.count())) {
    const titles = await h.locator('.tiptap-slash-menu-title').allTextContents()
    await h.keyboard.press('Escape')
    return { missing: true, titles, ...(await read()) }
  }
  await row.click()
  await wait(250)
  return read()
}

const want = (got, { text: words, has, lacks, clean }) => {
  if (got.missing) return false
  const tree = got.tree ?? ''
  if (words) {
    const plain = String(got.text ?? '').replace(/\s+/g, ' ').trim()
    if (plain !== words) return false
  }
  if (has && !has.every((one) => tree.includes(one))) return false
  if (lacks && lacks.some((one) => tree.includes(one))) return false
  if (clean && got.bad?.length) return false
  return true
}

try {
  await v('settings:set', { sounds: false, hintRate: 0 })
  await h.evaluate(() => localStorage.setItem('vim', 'off'))
  const skip = h.locator('[data-skip-intro]')
  if (await skip.count()) {
    await skip.click()
    await wait(200)
    const leave = h.locator('[data-skip]')
    if (await leave.count()) await leave.click()
    await wait(300)
  }

  const kinds = [
    ['Text', { has: ['paragraph'], lacks: ['listItem', 'bulletList'], clean: true }],
    ['Heading 1', { has: ['heading:1'], lacks: ['listItem', 'bulletList'], clean: true }],
    ['Heading 2', { has: ['heading:2'], lacks: ['listItem'], clean: true }],
    ['Heading 3', { has: ['heading:3'], lacks: ['listItem'], clean: true }],
    ['Bulleted list', { has: ['bulletList', 'listItem'], lacks: ['heading'], clean: true }],
    ['Numbered list', { has: ['orderedList'], lacks: ['bulletList'], clean: true }],
    ['Checklist', { has: ['taskList', 'taskItem'], lacks: ['bulletList'], clean: true }],
    ['Quote', { has: ['blockquote'], lacks: ['listItem'], clean: true }],
    ['Code', { has: ['codeBlock'], lacks: ['listItem'], clean: true }],
    ['Toggle', { has: ['details'], lacks: ['listItem'], clean: true }],
    ['Callout', { has: ['callout'], lacks: ['listItem'], clean: true }]
  ]
  let shot = false
  for (const [into, expect] of kinds) {
    await open(bullet('Milk'))
    let got
    try {
      got = await turn('Milk', into)
    } catch (error) {
      await h.keyboard.press('Escape').catch(() => {})
      await h.mouse.move(40, 40)
      await wait(200)
      try {
        got = await turn('Milk', into)
      } catch (again) {
        check(`turn a bullet into ${into}`, false, (again.message ?? error.message ?? String(again)).slice(0, 240))
        await h.keyboard.press('Escape').catch(() => {})
        continue
      }
    }
    if (!shot && SHOTS) {
      await open(bullet('Milk'))
      try {
        await menu('Milk')
        await h.locator('[data-turn-into-sub]').hover()
        await wait(200)
        await h.screenshot({ path: `${SHOTS}/turn-into.png` })
      } catch { /* the menu shot is extra */ }
      await h.keyboard.press('Escape').catch(() => {})
      await open(bullet('Milk'))
      got = await turn('Milk', into)
      shot = true
    }
    check(`turn a bullet into ${into}`, want(got, { text: 'Milk', ...expect }), got.missing ? got.titles : `${(got.bad ?? []).join('; ')}\n${got.tree}`)
  }

  await open(numbered('Milk'))
  const asBullet = await turn('Milk', 'Bulleted list')
  check('turn a number into a bullet, one list', want(asBullet, { text: 'Milk', has: ['bulletList'], lacks: ['orderedList'], clean: true }), asBullet.tree)

  await open(checks_('Milk'))
  const asNumber = await turn('Milk', 'Numbered list')
  check('turn a checkbox into a number, one list', want(asNumber, { text: 'Milk', has: ['orderedList'], lacks: ['taskList'], clean: true }), asNumber.tree)

  const typeAt = async (body, word, keys, whole = false) => {
    await open(body)
    await h.evaluate(({ word, keys, whole }) => {
      const ed = document.querySelector('[data-open] .tiptap:not(.is-line):not(.is-plain)').editor
      let at = 1
      if (word) {
        ed.state.doc.descendants((node, pos) => {
          if (node.isText && node.text === word) at = pos
        })
      }
      ed.chain().focus().setTextSelection(at).run()
      const view = ed.view
      const put = (text) => {
        const { from, to } = view.state.selection
        const handled = view.someProp('handleTextInput', (fn) => fn(view, from, to, text, () => {}))
        if (!handled) view.dispatch(view.state.tr.insertText(text))
      }
      if (whole) put(keys)
      else for (const ch of keys) put(ch)
    }, { word, keys, whole })
    await wait(250)
    return read()
  }
  const typed = [
    [bullet('Milk'), '- ', 'typing - on a bullet does not nest another', { has: ['bulletList'], clean: true }],
    [numbered('Milk'), '- ', 'typing - on a number becomes one bullet', { has: ['bulletList'], lacks: ['orderedList'], clean: true }],
    [bullet('Milk'), '1. ', 'typing 1. on a bullet becomes one number', { has: ['orderedList'], lacks: ['bulletList'], clean: true }],
    [checks_('Milk'), '- ', 'typing - on a checkbox becomes one bullet', { has: ['bulletList'], lacks: ['taskList'], clean: true }],
    [bullet('Milk'), '# ', 'typing # on a bullet becomes a heading', { has: ['heading:1'], lacks: ['listItem'], clean: true }],
    [bullet('Milk'), '> ', 'typing > on a bullet becomes a quote', { has: ['blockquote'], lacks: ['listItem'], clean: true }],
    [doc(para('Milk')), '- ', 'typing - on text becomes one bullet', { has: ['bulletList', 'listItem'], clean: true }],
    [doc(para('Milk')), '# ', 'typing # on text becomes a heading', { has: ['heading:1'], lacks: ['listItem'], clean: true }],
    [doc(para('')), '[] ', 'typing [] becomes one checkbox', { has: ['taskList'], clean: true }],
    [bullet('Milk'), '# ', 'pasting # on a bullet becomes a heading', { has: ['heading:1'], lacks: ['listItem'], clean: true, whole: true }]
  ]
  for (const [body, keys, name, expect] of typed) {
    const got = await typeAt(body, body.content[0].type === 'paragraph' && !body.content[0].content?.length ? '' : 'Milk', keys, expect.whole)
    const words = keys === '[] ' ? '' : 'Milk'
    check(name, want(got, { text: words || undefined, ...expect }) && (words ? (got.text ?? '').includes('Milk') : got.tree.includes('taskList')), `${(got.bad ?? []).join('; ')}\n${got.tree}`)
  }

  const put = async (keys) => {
    await h.evaluate((keys) => {
      const view = document.querySelector('[data-open] .tiptap:not(.is-line):not(.is-plain)').editor.view
      for (const ch of keys) {
        const { from, to } = view.state.selection
        const handled = view.someProp('handleTextInput', (fn) => fn(view, from, to, ch, () => {}))
        if (!handled) view.dispatch(view.state.tr.insertText(ch))
      }
    }, keys)
  }
  await open(doc(para('')))
  await h.evaluate(() => document.querySelector('[data-open] .tiptap:not(.is-line):not(.is-plain)').editor.commands.focus('end'))
  await put('/')
  await wait(200)
  await put('heading')
  await h.locator('.tiptap-slash-menu').first().waitFor({ timeout: 2500 }).catch(() => {})
  const slash = h.locator('.tiptap-slash-menu button', { hasText: 'Heading 1' })
  check('slash offers Heading 1', (await slash.count()) > 0, String(await slash.count()))
  if (SHOTS) await h.screenshot({ path: `${SHOTS}/slash.png` }).catch(() => {})
  if (await slash.count()) await slash.first().click()
  await wait(150)
  await h.keyboard.type('Milk')
  await wait(100)
  const headed = await read()
  check('slash Heading 1 is a heading, not a list', want(headed, { text: 'Milk', has: ['heading:1'], lacks: ['listItem'], clean: true }), headed.tree)

  await open(doc(para('')))
  await h.evaluate(() => document.querySelector('[data-open] .tiptap:not(.is-line):not(.is-plain)').editor.commands.focus('end'))
  await put('/')
  await wait(200)
  await put('bullet')
  await h.locator('.tiptap-slash-menu').first().waitFor({ timeout: 2500 }).catch(() => {})
  const bullets = h.locator('.tiptap-slash-menu button', { hasText: 'Bulleted list' })
  if (await bullets.count()) await bullets.first().click()
  await wait(150)
  await h.keyboard.type('Milk')
  const slashed = await read()
  check('slash Bulleted list is one bullet', want(slashed, { text: 'Milk', has: ['bulletList'], clean: true }) && (slashed.tree.match(/bulletList/g) ?? []).length === 1, slashed.tree)

  await open(doc(para('Alpha'), para('Beta')))
  await menu('Alpha')
  await h.locator('.tiptap-slash-menu-title', { hasText: /^Duplicate$/ }).click()
  await wait(200)
  const copied = await read()
  check('duplicate makes a second Alpha', (copied.text.match(/Alpha/g) ?? []).length === 2, copied.tree)
  await menu('Alpha')
  await h.locator('.tiptap-slash-menu-title', { hasText: /^Delete$/ }).click()
  await wait(200)
  const left = await read()
  check('delete takes that block', (left.text.match(/Alpha/g) ?? []).length === 1 && left.text.includes('Beta'), left.tree)

  await open(doc(para('Paint')))
  const box = await h.locator('[data-open] .ProseMirror').locator('text=Paint').boundingBox()
  await h.mouse.move(box.x + 2, box.y + box.height / 2)
  await h.mouse.down()
  await h.mouse.move(box.x + box.width - 2, box.y + box.height / 2, { steps: 6 })
  await h.mouse.up()
  await wait(200)
  if (SHOTS) await h.screenshot({ path: `${SHOTS}/selection.png` }).catch(() => {})
  const bar = h.locator('[data-selection-bar]')
  check('selecting words shows the selection bar', (await bar.count()) > 0)
  const bold = h.locator('[data-selection-bar] [aria-label="Bold"]')
  if (await bold.count()) await bold.click()
  await wait(100)
  const italic = h.locator('[data-selection-bar] [aria-label="Italic"]')
  if (await italic.count()) await italic.click()
  await wait(100)
  const marks = await h.evaluate(() => {
    const ed = document.querySelector('[data-open] .tiptap:not(.is-line):not(.is-plain)').editor
    const found = []
    ed.state.doc.descendants((node) => {
      if (node.isText) found.push(...node.marks.map((mark) => mark.type.name))
    })
    return found
  })
  check('the selection bar bolds and italicizes', marks.includes('bold') && marks.includes('italic'), marks.join(','))

  await c.go('settings')
  await h.locator('input[placeholder="Search…"]').fill('vim')
  await wait(300)
  const vimRow = h.locator('[data-setting-title="Vim keys"]')
  await vimRow.scrollIntoViewIfNeeded()
  const vimSwitch = vimRow.locator('[role="switch"]')
  if ((await vimSwitch.getAttribute('aria-checked')) !== 'true') await vimSwitch.click()
  await wait(200)
  await open(doc(para('Vimmy')))
  await caret('Vimmy')
  await wait(150)
  const normal = await read()
  check('a note opens in normal mode when Vim is on', normal.vim === 'normal', normal.vim)
  await h.keyboard.press('i')
  await wait(80)
  await h.keyboard.type('Z')
  await h.keyboard.press('Escape')
  await wait(80)
  const inserted = await read()
  check('i inserts, Escape returns to normal', inserted.text.includes('Z') && inserted.vim === 'normal', `${inserted.vim} ${inserted.text}`)
  await h.keyboard.press('x')
  await wait(80)
  const cut = await read()
  check('x in normal mode deletes a letter', !cut.text.includes('Z') && cut.text.includes('Vimmy'), cut.text)
  await c.go('settings')
  await h.locator('input[placeholder="Search…"]').fill('vim')
  await wait(300)
  const vimRow2 = h.locator('[data-setting-title="Vim keys"]')
  await vimRow2.scrollIntoViewIfNeeded()
  const vimOff = vimRow2.locator('[role="switch"]')
  if ((await vimOff.getAttribute('aria-checked')) === 'true') await vimOff.click()
  await wait(200)
  // Same path as Vim-on: open the note from Settings via home:open, then focus with caret
  // (do not Esc Settings or click the editor: both flake under QA_AWAY).
  await open(doc(para('Plain')))
  // Wait until Vim has left the editor: a letter typed while normal mode still
  // lingered was swallowed, and the check read only “Plain”.
  for (let i = 0; i < 40; i++) {
    await caret('Plain')
    const now = await read()
    if (now.vim !== 'normal' && now.text.includes('Plain')) break
    await wait(50)
  }
  await caret('Plain')
  await wait(80)
  await h.keyboard.type('Q')
  await wait(150)
  const plain = await read()
  check('with Vim off, a letter is typed', plain.text.includes('Q') && plain.vim !== 'normal', `${plain.vim} ${plain.text}`)
} catch (error) {
  check('the run finished', false, error.stack?.split('\n').slice(0, 8).join(' | '))
} finally {
  await c.close?.()
}
done()
