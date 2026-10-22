// The details sidebar and tags, end to end: the Family tree names its
// columns, the details groups fold (Family, Links and Details open at first,
// remembered per group), a tag wears one colour in the note, its task chips,
// the sidebar and quick capture, and renaming a tag from its right-click menu
// rewrites every note, gem and task, with one Undo, a merge included.
//
//   npx electron-vite build --outDir out-x
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-x/main/index.js HALIGTREE_QA_AWAY=1 SHOTS=<dir> node qa/details-tags.mjs
import { mkdirSync } from 'fs'
import { sandbox } from './sandbox-lib.mjs'

const dir = process.env.SHOTS ?? `${process.env.QA_DATA}/shots`
mkdirSync(dir, { recursive: true })
const results = []
const check = (name, ok, detail = '') => { results.push(!!ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`) }

const c = await sandbox({ width: 1400, height: 900 })
const { h, v, send } = c
const wait = (ms) => h.waitForTimeout(ms)
try {
  const make = async (text) => {
    const id = await h.evaluate(() => window.api.captures.create({ kind: 'note', body: { type: 'doc', content: [{ type: 'paragraph' }] } }))
    await h.evaluate(([id, text]) => window.api.captures.save(id, { body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] } }), [id, text])
    return id
  }
  await v('tag:set', 'probehue', { color: 'purple' })
  const note = await make('Probe source line #probehue and #probeplain')
  const gem = await v('promote', note)
  await v('task:add', 'Probe task to check #probehue #probeplain')
  const task = (await v('tasks')).find((one) => one.title.includes('Probe task'))
  // Enough of them that the sidebar lists both among its first tags.
  for (let i = 0; i < 12; i++) await make(`Probe filler ${i} #probehue #probeplain`)
  await wait(800)

  // --- 26 and 31: the gem's details
  await send('nugget', gem)
  await wait(1500)
  const details = h.locator('button[aria-label="Details"][aria-pressed="false"]').first()
  if (await details.count()) { await details.click(); await wait(900) }
  const labels = await h.evaluate(() => [...document.querySelectorAll('[data-family-label]')].map((one) => one.textContent))
  check('the Family tree names its columns', labels.includes('Came from') && labels.includes('This note'), labels.join(', '))
  const overlap = await h.evaluate(() => {
    const boxes = [...document.querySelectorAll('[data-family-label]')].map((one) => one.getBoundingClientRect())
    return boxes.some((a, i) => boxes.some((b, j) => i !== j && a.left < b.right - 0.5 && b.left < a.right - 0.5))
  })
  check('and the names never overlap', !overlap)
  const cut = await h.evaluate(() => [...document.querySelectorAll('[data-family-label]')].filter((one) => one.scrollWidth > one.clientWidth + 1).map((one) => one.textContent))
  check('and none is cut short', cut.length === 0, cut.join(', '))
  const groups = () => h.evaluate(() => Object.fromEntries([...document.querySelectorAll('[data-details-group]')].map((one) => [one.dataset.detailsGroup, one.hasAttribute('data-open')])))
  const first = await groups()
  check('Family and Details start open', first.Family === true && first.Details === true, JSON.stringify(first))
  const closed = Object.entries(first).filter(([name]) => !['Family', 'Links', 'Details'].includes(name))
  check('every other group starts folded', closed.length > 0 && closed.every(([, open]) => !open), JSON.stringify(closed))
  await h.screenshot({ path: `${dir}/31-details-first.png` })
  await h.locator('[data-details-group="Comes back"] button[aria-expanded]').click()
  await wait(500)
  check('a folded group opens by its heading', (await groups())['Comes back'] === true)
  await h.locator('[data-details-group="Family"] button[aria-expanded]').click()
  await wait(400)
  await h.screenshot({ path: `${dir}/31-details-changed.png` })
  await h.reload()
  await wait(1800)
  await send('nugget', gem)
  await wait(1500)
  if (await details.count()) { await details.click(); await wait(900) }
  const again = await groups()
  check('each group is remembered as you left it', again['Comes back'] === true && again.Family === false, JSON.stringify(again))
  await h.locator('[data-details-group="Family"] button[aria-expanded]').click()
  await wait(400)
  await h.locator('[data-family-label]').first().scrollIntoViewIfNeeded()
  await h.screenshot({ path: `${dir}/26-family.png` })

  // --- 34: one colour everywhere
  const hueOf = (css) => h.evaluate((css) => { const probe = document.createElement('span'); probe.style.color = css; document.body.append(probe); const got = getComputedStyle(probe).color; probe.remove(); return got }, css)
  const purple = await hueOf('var(--tt-color-text-purple)')
  const editorHue = async (tag) => h.evaluate((tag) => [...document.querySelectorAll('.tiptap-token[data-token="tag"]')].find((one) => one.textContent.replace('#', '') === tag)?.dataset.tokenColor ?? null, tag)
  await send('capture', note)
  await wait(1500)
  const plainHue = await editorHue('probeplain')
  check('the note paints #probehue in its own colour', (await editorHue('probehue')) === 'purple', String(await editorHue('probehue')))
  await send('task', task.id)
  await wait(1500)
  const chip = (tag) => h.evaluate((tag) => { const one = document.querySelector(`[data-tag-chip="${tag}"]`); return one ? getComputedStyle(one).color : null }, tag)
  check('a task\'s #probehue chip wears it', (await chip('probehue')) === purple, String(await chip('probehue')))
  const plainCss = await hueOf(`var(--tt-color-text-${plainHue})`)
  check('and an uncoloured tag\'s chip matches the note\'s colour for it', (await chip('probeplain')) === plainCss, `${await chip('probeplain')} vs ${plainCss} (${plainHue})`)
  await h.screenshot({ path: `${dir}/34-task-chips.png`, clip: { x: 220, y: 40, width: 1100, height: 300 } })
  const shown = (await v('settings')).sidebarShown
  await v('settings:set', { sidebarShown: [...new Set([...shown, 'tags'])] })
  await wait(1000)
  const open = h.getByRole('button', { name: 'Show your tags' })
  if (await open.count()) { await open.first().click(); await wait(600) }
  const side = await h.evaluate(() => { const icon = document.querySelector('[data-side-tag="probehue"] svg'); return icon ? getComputedStyle(icon).color : null })
  check('the sidebar\'s #probehue wears it', side === purple, String(side))
  const sidePlain = await h.evaluate(() => { const icon = document.querySelector('[data-side-tag="probeplain"] svg'); return icon ? getComputedStyle(icon).color : null })
  check('and the sidebar\'s uncoloured tag is not grey', sidePlain === plainCss, String(sidePlain))
  // Quick capture: a task line's #tag in its own colour.
  const box = c.page
  await c.electron.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((w) => !w.webContents.getURL().includes('view='))?.show())
  await box.waitForTimeout(800)
  const typed = await box.evaluate(async () => {
    const editor = document.querySelector('.ProseMirror')?.editor
    if (!editor) return null
    editor.commands.setContent('<p>fix the login #bug and #probehue</p>')
    await new Promise((r) => setTimeout(r, 900))
    return [...document.querySelectorAll('.box-token, .tiptap-token')].map((one) => `${one.textContent}:${one.dataset.tokenColor}`)
  })
  const bugHue = (await v('tag:meta')).find((one) => one.tag === 'bug')?.color
  check('quick capture lights a task #tag in its own colour, not green', typed?.includes(`#bug:${bugHue}`), `${JSON.stringify(typed)} bug=${bugHue}`)
  check('and any other #tag in its own colour', typed?.includes('#probehue:purple'), JSON.stringify(typed))
  await box.evaluate(() => document.querySelector('.ProseMirror')?.editor?.commands.setContent('<p></p>')).catch(() => {})

  // --- 51: rename from the sidebar's right-click menu
  await h.locator('[data-side-tag="probehue"]').click({ button: 'right' })
  await wait(400)
  await h.getByRole('menuitem', { name: 'Rename or merge…' }).click()
  await wait(500)
  await h.keyboard.press('Meta+a')
  await h.keyboard.type('proberenamed')
  await h.keyboard.press('Enter')
  await wait(1500)
  const carried = async (tag) => (await v('tag:read', tag)).map((one) => one.type).sort().join(',')
  const after = await carried('proberenamed')
  check('the rename reaches the note, the gem and the task', after.includes('capture') && after.includes('task') && /article|nugget/.test(after), after)
  check('and nothing still says the old name', (await v('tag:read', 'probehue')).length === 0)
  const meta = (await v('tag:meta')).find((one) => one.tag === 'proberenamed')
  check('its colour goes with it', meta?.color === 'purple', JSON.stringify(meta))
  await h.screenshot({ path: `${dir}/51-renamed.png` })
  await h.getByRole('button', { name: 'Undo' }).first().click()
  await wait(1500)
  check('one Undo puts every one back', (await v('tag:read', 'proberenamed')).length === 0 && (await carried('probehue')) === after, await carried('probehue'))
  check('and its colour too', (await v('tag:meta')).find((one) => one.tag === 'probehue')?.color === 'purple')
  // A merge has its Undo too.
  const before = await carried('probeplain')
  await h.locator('[data-side-tag="probehue"]').click({ button: 'right' })
  await wait(400)
  await h.getByRole('menuitem', { name: 'Rename or merge…' }).click()
  await wait(500)
  await h.keyboard.press('Meta+a')
  await h.keyboard.type('probeplain')
  await h.keyboard.press('Enter')
  await wait(1500)
  check('a merge carries them into the other tag', (await v('tag:read', 'probehue')).length === 0)
  await h.getByRole('button', { name: 'Undo' }).first().click()
  await wait(1500)
  check('and its Undo pulls them apart again', (await carried('probehue')) === after && (await carried('probeplain')) === before)
  check('no errors on the page', c.errors.length === 0, c.errors.slice(0, 3).join(' | '))
} finally { await c.close() }
const passed = results.filter(Boolean).length
console.log(`\n${passed}/${results.length} passed`)
process.exit(passed === results.length ? 0 : 1)
