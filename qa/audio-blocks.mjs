// Voice notes and pictures in a note: a recording shows its whole length
// before it plays and its bar moves at a steady rate; it is named by its
// length ("Voice note · 0:03"), never ".m4a" or a size; no toolbar shows on
// hover or when picked: its actions are in its block menu (⋮⋮ or right-click)
// under "Voice note"; the picked outline goes as soon as the caret leaves.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/audio-blocks.mjs
import { checks, pickAll } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS = `${process.env.QA_ARGS ?? '--sandbox'} --use-fake-device-for-media-stream --use-fake-ui-for-media-stream --autoplay-policy=no-user-gesture-required`

const { check, done } = checks()
const c = await sandbox({ width: 1400, height: 900 })
const { h, v } = c
const wait = (ms) => h.waitForTimeout(ms)
const EDITOR = '[data-open] .tiptap'
const shots = process.env.QA_SHOTS ?? '/tmp'
const PNG = (fill) => `data:image/svg+xml;base64,${Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="480" height="200"><rect width="480" height="200" fill="${fill}"/></svg>`).toString('base64')}`

const attachments = () => h.evaluate((sel) => {
  const out = []
  document.querySelector(sel).editor.state.doc.descendants((node) => void (node.type.name === 'attachment' && out.push(node.attrs)))
  return out
}, EDITOR)
const record = async (seconds) => {
  await h.click(EDITOR); await h.keyboard.press('Meta+ArrowDown'); await h.keyboard.press('Enter')
  await h.keyboard.type('/record', { delay: 40 }); await wait(500)
  await h.keyboard.press('Enter')
  await h.waitForSelector('[data-voice-recorder]', { timeout: 6000 })
  await wait(seconds * 1000)
  await h.click('[data-voice-recorder] button[aria-label="Stop and keep"]')
  await h.waitForFunction(() => !document.querySelector('[data-voice-recorder]'), null, { timeout: 8000 })
  await wait(800)
}
// Every toolbar on screen (the recordings' and the pictures'), with its box.
const bars = () => h.evaluate((sel) => {
  const box = (el) => { const r = el.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right } }
  const media = [...document.querySelectorAll(`${sel} [data-media-toolbar] .tiptap-toolbar`)].map((el) => ({ kind: 'media', ...box(el), owner: [...document.querySelectorAll(`${sel} .tiptap-attachment`)].indexOf(el.closest('.tiptap-attachment')) }))
  const pictures = [...document.querySelectorAll('[aria-label="S width"]')].filter((el) => !el.closest('[data-media-toolbar]') && el.getBoundingClientRect().width > 0 && getComputedStyle(el.closest('[data-state], div')).visibility !== 'hidden').map((el) => ({ kind: 'picture', ...box(el.closest('.tiptap-toolbar') ?? el) }))
  return [...media, ...pictures]
}, EDITOR)
const blocks = (what = '.tiptap-attachment') => h.evaluate(([sel, what]) => [...document.querySelectorAll(`${sel} ${what}`)].map((el) => {
  const r = el.getBoundingClientRect()
  return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, picked: el.classList.contains('is-selected') || el.classList.contains('ProseMirror-selectednode') }
}), [EDITOR, what])
const overlaps = (a, b) => a.top < b.bottom && a.bottom > b.top && a.left < b.right && a.right > b.left
const caretTo = async (text) => {
  await h.evaluate(([sel, text]) => {
    const editor = document.querySelector(sel).editor
    let at = null
    editor.state.doc.descendants((node, pos) => { if (at == null && node.isText && node.text.includes(text)) at = pos + 1 })
    editor.chain().focus().setTextSelection(at).run()
  }, [EDITOR, text])
  await wait(300)
}
const pick = async (index, what = '.tiptap-attachment') => {
  await h.evaluate(([sel, index, what]) => {
    const editor = document.querySelector(sel).editor
    const el = document.querySelectorAll(`${sel} ${what}`)[index]
    const pos = editor.view.posAtDOM(el.closest('[data-node-view-wrapper]')?.parentElement ?? el, 0)
    editor.chain().focus().setNodeSelection(pos).run()
  }, [EDITOR, index, what])
  await wait(300)
}

try {
  await v('settings:set', { sounds: false, hintRate: 0 })
  const id = await v('article:new')
  await v('item:save', id, { title: 'Spoken', body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Before' }] }] } })
  await c.send('article', id); await wait(1400)

  // --- 1. the length, known before play -------------------------------------------------
  await record(4)
  await record(3)
  const kept = await attachments()
  // The length kept against the sound itself, decoded and timed.
  const decoded = await h.evaluate((list) => Promise.all(list.map(async (one) => (await new OfflineAudioContext(1, 1, 44100).decodeAudioData(await (await fetch(one.src)).arrayBuffer())).duration)), kept)
  check('two recordings kept, each with its true length (within 0.3s of the sound decoded)', kept.length === 2 && kept.every((one, at) => one.duration > 1 && Math.abs(one.duration - decoded[at]) < 0.3), JSON.stringify(kept.map((one, at) => [one.name, one.duration, decoded[at]])))
  const first = await h.evaluate((sel) => {
    const block = document.querySelector(`${sel} .tiptap-attachment.is-audio`)
    return { total: block.querySelector('[data-sound-time]').textContent, max: Number(block.querySelector('[data-sound-player]').dataset.length), own: block.querySelector('audio').duration }
  }, EDITOR)
  check('before play, the bar and the time use the whole length', Math.abs(first.max - kept[0].duration) < 0.05 && first.total.trim() === `0:0${Math.floor(kept[0].duration)}`, JSON.stringify(first))
  // Played, sampled: the share done against the time passed is a straight line.
  const samples = await h.evaluate(async (sel) => {
    const block = document.querySelector(`${sel} .tiptap-attachment.is-audio`)
    const wave = block.querySelector('[data-wave]')
    const input = { get value() { return Number(wave.dataset.at) }, max: 1 }
    block.querySelector('audio').muted = true
    block.querySelector('.tiptap-media-play').click()
    const out = []
    const t0 = performance.now()
    while (performance.now() - t0 < 3000) {
      await new Promise((r) => setTimeout(r, 200))
      out.push({ t: (performance.now() - t0) / 1000, done: Number(input.value) / Number(input.max), max: Number(input.max) })
    }
    block.querySelector('.tiptap-media-play').click()
    return out
  }, EDITOR)
  const moving = samples.filter((one) => one.done > 0)
  const slope = moving.length > 2 ? (moving.at(-1).done - moving[0].done) / (moving.at(-1).t - moving[0].t) : 0
  const worst = Math.max(...moving.map((one) => Math.abs(moving[0].done + slope * (one.t - moving[0].t) - one.done)))
  check('the bar moves at a steady rate (one second of a ' + kept[0].duration + 's recording is about 1/' + kept[0].duration + ' of it)', moving.length > 8 && Math.abs(slope - 1 / kept[0].duration) < 0.06 && worst < 0.08 && new Set(samples.map((one) => one.max)).size === 1, JSON.stringify({ slope, want: 1 / kept[0].duration, worst, maxes: [...new Set(samples.map((one) => one.max))] }))

  // A recording without a length (an older one, a dropped file) finds it once and keeps it.
  const old = await v('article:new')
  await v('item:save', old, { title: 'Older', body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Old one' }] }, { type: 'attachment', attrs: { ...kept[0], duration: null } }, { type: 'paragraph' }] } })
  await c.send('article', old); await wait(2500)
  const learnt = await h.evaluate((sel) => {
    const block = document.querySelector(`${sel} .tiptap-attachment.is-audio`)
    let duration = null
    document.querySelector(sel).editor.state.doc.descendants((node) => void (node.type.name === 'attachment' && (duration = node.attrs.duration)))
    return { duration, total: block.querySelector('[data-sound-time]').textContent, max: Number(block.querySelector('[data-sound-player]').dataset.length), at: block.querySelector('audio').currentTime }
  }, EDITOR)
  check('one without a length finds it before play, keeps it, and starts at 0:00', Math.abs(learnt.duration - kept[0].duration) < 0.3 && Math.abs(learnt.max - learnt.duration) < 0.05 && learnt.at === 0, JSON.stringify(learnt))
  await c.send('article', id); await wait(1400)

  // --- 2. no toolbar: the block menu holds its actions ----------------------------------
  await caretTo('Before')
  const [a, b] = await blocks()
  const titles = await h.evaluate((sel) => [...document.querySelectorAll(`${sel} .tiptap-attachment.is-audio`)].map((el) => el.querySelector('.tiptap-attachment-card')?.innerText.replace(/\s+/g, ' ').trim()), EDITOR)
  check('each recording is named "Voice note" with its length on the right, with no file kind or size', titles.length === 2 && titles.every((one) => /0:0\d/.test(one) && /Voice note/.test(one) && !/m4a|weba|KB|MB/i.test(one)), JSON.stringify(titles))
  await h.mouse.move((b.left + b.right) / 2 - 150, (b.top + b.bottom) / 2); await wait(400)
  let now = await bars()
  check('hovering a recording shows no toolbar', now.length === 0, JSON.stringify(now))
  await h.screenshot({ path: `${shots}/audio-blocks-hover.png` })
  await pick(1)
  now = await bars()
  check('a recording picked shows no toolbar either', now.length === 0, JSON.stringify(now))
  await h.mouse.click((a.left + a.right) / 2 - 200, (a.top + a.bottom) / 2, { button: 'right' }); await wait(500)
  const menu = await h.evaluate(() => {
    const el = document.querySelector('.tiptap-block-menu')
    if (!el) return null
    const filter = el.querySelector('input')
    return { heading: el.querySelector('[data-kind-heading]')?.textContent, rows: [...el.querySelectorAll('[role=menuitem] .tiptap-slash-menu-title')].map((one) => one.textContent), filterShown: !!filter && filter.getBoundingClientRect().height > 2 }
  })
  check('right-click: the menu heads its own actions "Voice note"', menu?.heading === 'Voice note', JSON.stringify(menu))
  check('with Transcribe, Play from start, Save a copy, Open in the default app first, then the block\'s', ['Transcribe', 'Play from start', 'Save a copy', 'Open in the default app'].every((one, i) => menu?.rows[i] === one) && menu.rows.includes('Duplicate') && (menu.rows.includes('Delete') || menu.rows.includes('Remove from note')), JSON.stringify(menu?.rows))
  check('no Filter box until something is typed', menu && !menu.filterShown, JSON.stringify(menu))
  for (const name of ['light', 'dark']) { await c.look(name); await h.screenshot({ path: `${shots}/audio-blocks-menu-${name}.png` }) }
  await c.look('light')
  await h.keyboard.press('Escape'); await wait(300)
  // The grip's menu: the same, with no Filter box either.
  await h.mouse.move((a.left + a.right) / 2 - 150, (a.top + a.bottom) / 2); await wait(400)
  const grip = h.locator('.tiptap-drag-handle-grip').first()
  {
    await grip.click(); await wait(500)
    const gripMenu = await h.evaluate(() => { const el = document.querySelector('.tiptap-block-menu'); return el && { heading: el.querySelector('[data-kind-heading]')?.textContent, filterShown: el.querySelector('input').getBoundingClientRect().height > 2 } })
    check('the grip menu: the same heading, no Filter box until typed', gripMenu?.heading === 'Voice note' && !gripMenu.filterShown, JSON.stringify(gripMenu))
    await h.keyboard.press('Escape'); await wait(300)
  }
  // "Save a copy" and "Open in the default app" reach main with the recording (main's handlers stood in for, so no dialog or app opens).
  await c.electron.evaluate(({ ipcMain }) => {
    globalThis.__asked = []
    for (const channel of ['save-file-as', 'open-file']) {
      ipcMain.removeHandler(channel)
      ipcMain.handle(channel, (_event, src, name) => (globalThis.__asked.push({ channel, src, name }), true))
    }
  })
  for (const row of ['data-save-copy', 'data-open-default']) {
    await h.mouse.click((a.left + a.right) / 2 - 200, (a.top + a.bottom) / 2, { button: 'right' }); await wait(500)
    await h.click(`.tiptap-block-menu [${row}]`); await wait(400)
  }
  const asked = await c.electron.evaluate(() => globalThis.__asked)
  check('"Save a copy" and "Open in the default app" from the menu reach main with the recording', asked.length === 2 && asked[0].channel === 'save-file-as' && /\.m4a|\.weba/.test(asked[0].name) && asked[1].channel === 'open-file' && asked.every((one) => one.src === kept[0].src), JSON.stringify(asked))
  await h.mouse.move(5, 5)

  // --- 3. the outline and toolbar follow the selection ----------------------------------
  await caretTo('Before'); await wait(300)
  let marks = await blocks()
  check('caret moved out: no outline, no toolbar', marks.every((one) => !one.picked) && (await bars()).length === 0, JSON.stringify(marks))
  await pickAll(h)
  await wait(300)
  marks = await blocks()
  check('select all: both outlined, but no toolbar', marks.every((one) => one.picked) && (await bars()).length === 0, JSON.stringify(marks))
  await caretTo('Before'); await wait(300)
  marks = await blocks()
  check('then the caret in the words: neither outlined', marks.every((one) => !one.picked) && (await bars()).length === 0, JSON.stringify(marks))
  await pick(0)
  await h.keyboard.press('Backspace'); await wait(500)
  marks = await blocks()
  const left = await attachments()
  const picked = await h.evaluate((sel) => document.querySelector(sel).editor.state.selection.constructor.name, EDITOR)
  check('the first deleted: the other is not left looking picked unless it is', left.length === 1 && marks.length === 1 && (marks[0].picked === (picked === 'NodeSelection')) && (await bars()).length === 0, JSON.stringify({ marks, picked, bars: await bars() }))
  await caretTo('Before')
  check('and with the caret elsewhere: no outline, no toolbar', (await blocks()).every((one) => !one.picked) && (await bars()).length === 0, JSON.stringify(await blocks()))
  await h.screenshot({ path: `${shots}/audio-blocks-after-delete.png` })

  // --- 4. pictures: two in a row, and one beside a recording ----------------------------
  const pics = await v('article:new')
  await v('item:save', pics, { title: 'Pictures', body: { type: 'doc', content: [
    { type: 'paragraph', content: [{ type: 'text', text: 'Top words' }] },
    { type: 'image', attrs: { src: PNG('#2e8b57') } },
    { type: 'image', attrs: { src: PNG('#8b2e57') } },
    { type: 'attachment', attrs: kept[1] },
    { type: 'paragraph', content: [{ type: 'text', text: 'End words' }] },
  ] } })
  await c.send('article', pics); await wait(1600)
  await pick(1, 'img')
  now = await bars()
  const imgs = await blocks('img')
  check('second picture picked: one toolbar, inside that picture', now.length === 1 && now[0].kind === 'picture' && overlaps(now[0], imgs[1]) && !overlaps(now[0], imgs[0]) && imgs[1].picked && !imgs[0].picked, JSON.stringify({ now, imgs }))
  const audio = (await blocks())[0]
  await h.mouse.move((audio.left + audio.right) / 2 - 150, (audio.top + audio.bottom) / 2); await wait(400)
  now = await bars()
  check('a picture picked, the recording under it hovered: still one toolbar', now.length === 1 && now[0].kind === 'picture', JSON.stringify(now))
  await caretTo('End words'); await h.mouse.move((audio.left + audio.right) / 2 - 150, (audio.top + audio.bottom) / 2); await wait(400)
  now = await bars()
  check('nothing picked, the recording under a picture hovered: no toolbar', now.length === 0, JSON.stringify({ now, audio }))
  for (const name of ['light', 'dark']) { await c.look(name); await h.screenshot({ path: `${shots}/audio-blocks-pictures-${name}.png` }) }
  await c.look('light')
  await h.mouse.move(5, 5); await wait(300)
  check('caret in the words: no picture or recording outlined, no toolbar', (await blocks('img')).every((one) => !one.picked) && (await blocks()).every((one) => !one.picked) && (await bars()).length === 0, JSON.stringify(await bars()))
  // --- 5. a note's own window and quick capture: the same rules ---------------------------
  const elsewhere = async (page, sel, label) => {
    const state = () => page.evaluate((sel) => ({
      bars: [...document.querySelectorAll(`${sel} [data-media-toolbar] .tiptap-toolbar`)].map((el) => { const r = el.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, owner: [...document.querySelectorAll(`${sel} .tiptap-attachment`)].indexOf(el.closest('.tiptap-attachment')) } }),
      blocks: [...document.querySelectorAll(`${sel} .tiptap-attachment`)].map((el) => { const r = el.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, picked: el.classList.contains('is-selected') } }),
      total: document.querySelector(`${sel} [data-sound-time]`)?.textContent,
    }), sel)
    await page.evaluate((sel) => {
      const editor = document.querySelector(sel).editor
      let at = null
      editor.state.doc.descendants((node, pos) => { if (node.type.name === 'attachment') at = pos })
      editor.chain().focus().setNodeSelection(at).run()
    }, sel)
    await page.waitForTimeout(400)
    let now = await state()
    check(`${label}: second picked, no toolbar, length shown`, now.bars.length === 0 && now.total?.trim() === `0:0${Math.floor(kept[0].duration)}`, JSON.stringify(now))
    await page.screenshot({ path: `${shots}/audio-blocks-${label.replace(/\W+/g, '-')}.png` })
    await page.evaluate((sel) => document.querySelector(sel).editor.chain().focus('start').run(), sel)
    await page.waitForTimeout(400)
    now = await state()
    check(`${label}: caret moved out, no outline, no toolbar`, now.bars.length === 0 && now.blocks.every((one) => !one.picked), JSON.stringify(now))
  }
  const two = [{ type: 'paragraph', content: [{ type: 'text', text: 'Two notes' }] }, { type: 'attachment', attrs: kept[0] }, { type: 'attachment', attrs: kept[1] }, { type: 'paragraph' }]
  const cap = await h.evaluate((body) => window.api.captures.create({ kind: 'note', body }), { type: 'doc', content: two })
  await h.evaluate((one) => window.api.haligtree('notes:window', 'capture', one, null, null), cap).catch(() => {})
  let win = null
  for (let i = 0; i < 30 && !win; i++) (win = c.electron.windows().find((one) => /view=note|note\.html/.test(one.url()) && one.url().includes(cap))), await wait(200)
  check('the note window opens', !!win, '')
  if (win) {
    await win.waitForSelector('.tiptap .tiptap-attachment.is-audio', { timeout: 6000 }).catch(() => {})
    await win.waitForTimeout(800)
    await elsewhere(win, '.tiptap', 'note window')
    await c.electron.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().includes('note='))?.close())
  }
  const box = c.page
  await c.electron.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((w) => !/[?&](view|note)=/.test(w.webContents.getURL()))?.show())
  await box.waitForTimeout(600)
  await box.evaluate((doc) => document.querySelector('.tiptap').editor.commands.setContent(doc), { type: 'doc', content: two })
  await box.waitForTimeout(800)
  await elsewhere(box, '.tiptap', 'quick capture')
  await box.evaluate(() => document.querySelector('.tiptap').editor.commands.clearContent(true))

  check('no page errors', c.errors.filter((one) => !/favicon|ERR_/.test(one)).length === 0, c.errors.join(' | ').slice(0, 400))
} catch (error) {
  check('ran without throwing', false, String(error?.stack ?? error))
} finally {
  await c.close?.()
  done()
}
