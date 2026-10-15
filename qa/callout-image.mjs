/**
 * A callout's title written in place, and the picture toolbar that has to
 * work every time.
 *
 * Callouts: an Obsidian one (`> [!info]- Title`) is pasted in, its title is
 * clicked and typed into with vim off and with vim on, Enter goes on into the
 * body, the chevron folds it without taking the caret, and the new title is
 * what the note's Markdown says afterwards.
 *
 * Pictures: five in one note, and every toolbar button (S M L, the three
 * alignments, caption, download) pressed 30 times each, in a random order
 * across the five, with text typed above them, undo, and vim's normal mode
 * mixed in. Every press must change what it says it changes.
 *
 *   npx electron-vite build --outDir out-callout
 *   QA_DATA=$(mktemp -d) QA_ENTRY=out-callout/main/index.js MINDFLOW_QA_AWAY=1 node qa/callout-image.mjs
 */
import { mkdirSync } from 'fs'
import { open } from './harness.mjs'

const SHOTS = process.env.QA_SHOTS ?? '/private/tmp/claude-501/-Users-starscourge-Documents-forge-mindflow/703b99ba-c755-40e3-a385-896560d19061/scratchpad/callout'
mkdirSync(SHOTS, { recursive: true })
const EDITOR = '.tiptap.ProseMirror.mindflow-editor:not(.is-line)'

const qa = await open()
const { page, electron } = qa
const failures = []
const check = (ok, what) => {
  if (!ok) failures.push(what)
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`)
}

// Big enough to hold five pictures and the toolbar over each.
await electron.evaluate(({ BrowserWindow }) => {
  const win = BrowserWindow.getAllWindows().find((w) => !w.webContents.getURL().includes('view='))
  win?.setBounds({ x: 40, y: 40, width: 1000, height: 900 })
  win?.showInactive()
})
const shot = (name) => page.screenshot({ path: `${SHOTS}/${name}.png`, timeout: 5000 }).catch((e) => console.log('  (no screenshot:', e.message.split('\n')[0], ')'))
// Download asks where to save: answered "cancel" here, and counted.
await electron.evaluate(({ dialog }) => {
  globalThis.__saves = 0
  dialog.showSaveDialog = async () => ((globalThis.__saves += 1), { canceled: true })
})
const saves = () => electron.evaluate(() => globalThis.__saves)

const setVim = (on) =>
  page.evaluate((on) => {
    localStorage.setItem('vim', on ? 'on' : 'off')
    window.dispatchEvent(new StorageEvent('storage', { key: 'vim', newValue: on ? 'on' : 'off' }))
  }, on)
const vimMode = () => page.$eval(EDITOR, (el) => el.getAttribute('data-vim-mode'))
const markdown = () => page.$eval(EDITOR, (el) => el.editor.storage.markdown?.getMarkdown?.() ?? el.editor.getMarkdown?.() ?? '')
const setDoc = (json) => page.$eval(EDITOR, (el, json) => el.editor.commands.setContent(json), json)

// ---------------------------------------------------------------- callouts
const CALLOUT = '> [!info]- Jayendra\'s Cloud Certification Blog\n> Some words inside it.\n\nAfter the callout.'

for (const vim of [false, true]) {
  const label = vim ? 'vim on' : 'vim off'
  await setVim(vim)
  await page.waitForTimeout(300)
  await qa.reset()
  await qa.paste(CALLOUT)
  await page.waitForTimeout(400)
  const title = page.locator(`${EDITOR} .tiptap-callout-title-text`).first()
  check((await title.count()) === 1, `${label}: the callout has a title to write in`)
  if (!(await title.count())) continue

  // Click at the end of the title and type.
  const box = await title.boundingBox()
  await page.mouse.click(box.x + box.width - 2, box.y + box.height / 2)
  await page.waitForTimeout(150)
  await page.keyboard.press('End')
  await page.keyboard.type(' 2024', { delay: 25 })
  await page.waitForTimeout(250)
  const attr = () => page.$eval(EDITOR, (el) => { let t = null; el.editor.state.doc.descendants((n) => { if (n.type.name === 'callout' && t == null) t = n.attrs.title }); return t })
  check((await attr()) === "Jayendra's Cloud Certification Blog 2024", `${label}: typing changes the title (${JSON.stringify(await attr())})`)
  // Backspace edits the title, not the body.
  await page.keyboard.press('Backspace')
  await page.waitForTimeout(150)
  check((await attr()) === "Jayendra's Cloud Certification Blog 202", `${label}: Backspace edits the title`)
  await page.keyboard.type('5', { delay: 25 })
  await shot(`callout-title-${vim ? 'vim' : 'plain'}`)

  // The chevron unfolds it without taking the caret out of the title.
  await page.locator(`${EDITOR} .tiptap-callout-fold`).first().click()
  await page.waitForTimeout(250)
  const unfolded = await page.$eval(EDITOR, (el) => !el.querySelector('.tiptap-callout[data-folded]'))
  check(unfolded, `${label}: the chevron unfolds it`)
  const stillTitle = await page.evaluate(() => document.activeElement?.classList.contains('tiptap-callout-title-text'))
  check(stillTitle, `${label}: the chevron leaves the caret in the title`)

  // Enter goes on into the body, at its start, ready to type.
  await page.keyboard.press('Enter')
  await page.waitForTimeout(200)
  if (vim) check(/insert/i.test((await vimMode()) ?? ''), `${label}: Enter lands in insert mode (${await vimMode()})`)
  await page.keyboard.type('Body: ', { delay: 25 })
  await page.waitForTimeout(200)
  const body = await page.$eval(EDITOR, (el) => el.querySelector('.tiptap-callout-body p')?.textContent)
  check(body === 'Body: Some words inside it.', `${label}: Enter moves into the body (${JSON.stringify(body)})`)
  check((await attr()) === "Jayendra's Cloud Certification Blog 2025", `${label}: the title is unchanged by Enter`)

  // The chevron folds it again from the body.
  await page.locator(`${EDITOR} .tiptap-callout-fold`).first().click()
  await page.waitForTimeout(250)
  check(await page.$eval(EDITOR, (el) => !!el.querySelector('.tiptap-callout[data-folded]')), `${label}: the chevron folds it`)

  // Saved as Markdown with the new title, and read back the same.
  const md = await markdown()
  check(md.includes("> [!info]- Jayendra's Cloud Certification Blog 2025"), `${label}: Markdown carries the new title`)
  await setDoc('')
  await qa.paste(md)
  await page.waitForTimeout(300)
  check((await attr()) === "Jayendra's Cloud Certification Blog 2025", `${label}: the title survives export and import`)
  await shot(`callout-after-${vim ? 'vim' : 'plain'}`)
}


// ---------------------------------------------------------------- pictures
/** Five pictures in one note in `win`, every button pressed 30 times in a random order. */
async function pictures(win, label) {
  const srcs = await win.evaluate(async () => {
    const out = []
    for (let i = 0; i < 5; i++) {
      const canvas = document.createElement('canvas')
      canvas.width = 640
      canvas.height = 260
      const ctx = canvas.getContext('2d')
      ctx.fillStyle = `hsl(${i * 70}, 55%, 55%)`
      ctx.fillRect(0, 0, 640, 260)
      ctx.fillStyle = '#fff'
      ctx.font = '48px sans-serif'
      ctx.fillText(`Picture ${i + 1}`, 40, 140)
      const blob = await new Promise((done) => canvas.toBlob(done, 'image/png'))
      out.push(await window.api.saveImage('image/png', new Uint8Array(await blob.arrayBuffer())))
    }
    return out
  })
  const doc = { type: 'doc', content: [] }
  srcs.forEach((src, i) => {
    doc.content.push({ type: 'paragraph', content: [{ type: 'text', text: `Words above picture ${i + 1}.` }] })
    doc.content.push({ type: 'image', attrs: { src, alt: `Picture ${i + 1}` } })
  })
  doc.content.push({ type: 'paragraph', content: [{ type: 'text', text: 'The end.' }] })
  await win.$eval(EDITOR, (el, json) => el.editor.commands.setContent(json), doc)
  await win.waitForTimeout(800)

  const winVim = () => win.$eval(EDITOR, (el) => el.getAttribute('data-vim-mode'))
  const winVimSet = (on) =>
    win.evaluate((on) => {
      localStorage.setItem('vim', on ? 'on' : 'off')
      window.dispatchEvent(new StorageEvent('storage', { key: 'vim', newValue: on ? 'on' : 'off' }))
    }, on)
  const images = () => win.locator(`${EDITOR} img`)
  const imagePos = (i) =>
    win.$eval(EDITOR, (el, i) => {
      let at = -1
      let k = 0
      el.editor.state.doc.descendants((n, pos) => void (n.type.name === 'image' && (k++ === i ? (at = pos) : 0)))
      const sel = el.editor.state.selection
      return { at, chosen: sel.node?.type.name === 'image' && sel.from === at }
    }, i)
  // Chosen by a click, as a person does; never a second click on the chosen one,
  // which would be a double-click and open Look. ProseMirror takes a click
  // within half a second of the last, on the same spot of the screen, as a
  // double-click and selects nothing; two pictures scrolled to the same place
  // in quick succession do that, which no hand does, so it waits and clicks again.
  let reclicks = 0
  // As a hand does it: the pointer travels there over a few frames, crossing
  // whatever is on the way, and the button is held for a moment.
  // Aimed where it has come to rest, as an eye would: a menu still on its way
  // from the last picture is not where a person clicks.
  const press = async (locator) => {
    let box = null
    for (let i = 0; i < 20; i++) {
      const was = box
      await win.waitForTimeout(50)
      box = await locator.boundingBox({ timeout: 2000 }).catch(() => null)
      const shown = box && (await locator.evaluate((el) => getComputedStyle(el).visibility === 'visible').catch(() => false))
      if (box && was && shown && box.x === was.x && box.y === was.y) break
    }
    if (!box) return false
    await win.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 6 })
    await win.mouse.down()
    await win.waitForTimeout(40 + Math.random() * 60)
    await win.mouse.up()
    return true
  }
  const choose = async (i) => {
    await images().nth(i).scrollIntoViewIfNeeded()
    if ((await imagePos(i)).chosen) return
    await press(images().nth(i))
    for (let tries = 0; tries < 3 && !(await imagePos(i)).chosen; tries++) {
      reclicks += 1
      await win.waitForTimeout(550)
      await press(images().nth(i))
    }
    await win.waitForTimeout(40)
  }
  const attrsOf = async (i) =>
    win.$eval(EDITOR, (el, i) => {
      const found = []
      el.editor.state.doc.descendants((n, pos) => void (n.type.name === 'image' && found.push({ width: n.attrs.width, align: n.attrs.align, pos })))
      return found[i]
    }, i)
  // Given a moment: a window in the background draws less often than one in front.
  const settle = async (test) => {
    for (let i = 0; i < 15; i++) {
      if (await test()) return true
      await win.waitForTimeout(100)
    }
    return false
  }

  const BUTTONS = [
    ...['S', 'M', 'L'].map((s) => ({ name: `${s} width`, want: { width: { S: '35%', M: '60%', L: '100%' }[s] } })),
    ...['left', 'center', 'right'].map((a) => ({ name: `Align ${a}`, want: { align: a } })),
    { name: 'Caption' },
    { name: 'Download' },
  ]
  const plan = BUTTONS.flatMap((b) => Array.from({ length: 30 }, () => b))
  for (let i = plan.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[plan[i], plan[j]] = [plan[j], plan[i]]
  }

  // What happened during a press, told when one misses.
  await win.$eval(EDITOR, (el) => {
    window.__log = []
    const say = (what) => window.__log.push(`${Math.round(performance.now())} ${what}`)
    const name = (t) => (t?.closest?.('[aria-label]:not(.ProseMirror)')?.getAttribute('aria-label') ?? `${t?.tagName}.${String(t?.className ?? '').slice(0, 40)}`)
    for (const type of ['pointerdown', 'mousedown', 'mouseup', 'click', 'dblclick', 'dragstart', 'drop']) document.addEventListener(type, (e) => say(`${type} ${name(e.target)} at ${Math.round(e.clientX)},${Math.round(e.clientY)} detail=${e.detail}`), true)
    el.editor.on('transaction', ({ transaction: tr }) => say(`tr sel=${JSON.stringify(tr.selection.toJSON())} doc=${tr.docChanged} steps=${JSON.stringify(tr.steps.map((x) => x.toJSON())).slice(0, 200)} metas=${Object.keys(tr.meta ?? {}).join(',')}`))
  })
  const counts = Object.fromEntries(BUTTONS.map((b) => [b.name, { ok: 0, fail: 0 }]))
  for (let n = 0; n < plan.length; n++) {
    const button = plan[n]
    const which = Math.floor(Math.random() * 5)

    await win.evaluate(() => (window.__log.length = 0))
    // Now and then: words typed above, an undo, or vim switched on or off.
    const twist = n % 9
    if (twist === 3) {
      // Not within half a second of a picture's click, or it is a double-click
      // that moves nothing, and the space typed next is Look's key.
      await win.waitForTimeout(550)
      await win.locator(`${EDITOR} p`).first().click()
      await win.waitForTimeout(60)
      if (/normal/i.test((await winVim()) ?? '')) await win.keyboard.press('Shift+A')
      else await win.keyboard.press('End')
      await win.keyboard.type(' more', { delay: 10 })
      // Back to normal mode in vim, where the pictures are then clicked.
      if (/insert/i.test((await winVim()) ?? '')) await win.keyboard.press('Escape')
    } else if (twist === 5) {
      await win.keyboard.press('ControlOrMeta+z')
    } else if (twist === 7) {
      await winVimSet(n % 2 === 0)
    }
    if (await win.locator('.mf-look').count()) {
      check(false, `${label}: Look opened by itself before press #${n}`)
      await win.keyboard.press('Escape')
      await win.waitForTimeout(600)
    }

    // Something to change: when it is already that, another first.
    const before = await attrsOf(which)
    if (!before) {
      check(false, `${label}: picture ${which + 1} is gone before press #${n}`)
      break
    }
    if (button.want) {
      const [k, v] = Object.entries(button.want)[0]
      if ((before[k] ?? (k === 'align' ? 'left' : null)) === v) {
        const other = BUTTONS.find((b) => b.want && Object.keys(b.want)[0] === k && b !== button)
        await choose(which)
        await press(win.locator(`[aria-label="${other.name}"]`))
        await settle(async () => (await attrsOf(which))[k] === other.want[k])
      }
    }

    await choose(which)
    const savesBefore = await saves()
    const found = await press(win.locator(`[aria-label="${button.name}"]`))

    let ok
    if (button.want) {
      const [k, v] = Object.entries(button.want)[0]
      ok = await settle(async () => ((await attrsOf(which))?.[k] ?? (k === 'align' ? 'left' : null)) === v)
    }
    else if (button.name === 'Caption') {
      ok = await settle(() => win.evaluate(() => document.activeElement?.classList.contains('mf-caption-text') ?? false))
      // Left empty: the caption goes and the picture is chosen again.
      await win.keyboard.press('Escape')
    } else ok = await settle(async () => (await saves()) === savesBefore + 1)
    counts[button.name][ok ? 'ok' : 'fail'] += 1
    if (!ok) {
      console.log(`  missed #${n} ${button.name} on picture ${which + 1}${found ? '' : ' (no button)'} vim=${await winVim()}`)
      if (process.env.QA_VERBOSE) for (const line of await win.evaluate(() => window.__log)) console.log('    ' + line)
    }
  }
  for (const [name, { ok, fail }] of Object.entries(counts)) check(fail === 0, `${label}: ${name}, ${ok} of ${ok + fail} presses took effect`)
  if (reclicks) console.log(`  (${reclicks} picture clicks were taken as double-clicks and made again)`)
  await choose(2)
  await win.waitForTimeout(300)
  await win.screenshot({ path: `${SHOTS}/image-toolbar-${label}.png`, timeout: 5000 }).catch(() => {})
}

await setVim(false)
await qa.reset()
await pictures(page, 'box')

// The same in a note open in the main window, where the block handles are
// about too.
const home = electron.windows().find((w) => w.url().includes('view=home'))
if (home) {
  await electron.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().includes('view=home'))
    win?.setBounds({ x: 40, y: 40, width: 1100, height: 900 })
    win?.showInactive()
  })
  // A fresh install opens on the welcome: skipped (it asks once).
  for (let i = 0; i < 4 && (await home.locator('.mf-welcome').count()); i++) {
    await home.getByRole('button', { name: /Skip|Close/ }).first().click({ timeout: 3000 }).catch(() => {})
    await home.waitForTimeout(700)
  }
  const id = await home.evaluate(() => window.api.captures.create({ title: 'Pictures', kind: 'note', markdown: 'Pictures' }))
  await electron.evaluate(({ BrowserWindow }, id) => BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().includes('view=home'))?.webContents.send('home:open', 'capture', id), id)
  await home.waitForSelector(EDITOR, { timeout: 10000 })
  await home.waitForTimeout(1200)
  await pictures(home, 'note')
} else check(false, 'the main window is there')

console.log(failures.length ? `\n${failures.length} failed` : '\nall passed')
await qa.close()
process.exit(failures.length ? 1 : 0)
