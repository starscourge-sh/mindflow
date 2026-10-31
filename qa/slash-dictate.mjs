// “Dictate” in the slash menu (slash-items.tsx, components/haligtree/talk.tsx), everywhere a note is
// written: the main window, a note's own window, quick capture and a sticky. Picked with ↵ and with the
// pointer, it starts listening at the caret (the Orb shows there), the words land where the caret was,
// ↵ keeps them and Esc drops them, with the talk keys on or off in Settings. A refused microphone and
// a refused speech recognizer each say why. Main's speech handlers are a stand-in (as qa/dictation.mjs).
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox node qa/slash-dictate.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'

const { check, done } = checks()
const shots = process.env.QA_SHOTS ?? '/tmp'
const c = await sandbox({ width: 1300, height: 860 })
const { h, v, electron, page: box } = c
const wait = (ms) => h.waitForTimeout(ms)

const standIn = (mode = 'ok', mic = true) => electron.evaluate(({ ipcMain }, [mode, mic]) => {
  for (const one of ['dictate:start', 'dictate:stop', 'dictate:cancel', 'mic:ask']) ipcMain.removeHandler(`haligtree:${one}`)
  globalThis.talk = { mode, started: 0, stopped: 0, to: null, final: '' }
  ipcMain.handle('haligtree:mic:ask', () => mic)
  ipcMain.handle('haligtree:dictate:start', (event) => {
    const t = globalThis.talk
    if (t.mode === 'denied') return { error: { code: 'denied', message: 'Haligtree may not use speech recognition. Allow it in System Settings, under Privacy & Security, then Speech Recognition' } }
    t.started++
    t.to = event.sender
    setImmediate(() => t.to.send('dictate:line', { ready: { onDevice: true } }))
    return { ok: true }
  })
  ipcMain.handle('haligtree:dictate:stop', () => {
    const t = globalThis.talk
    t.stopped++
    t.to?.send('dictate:line', { final: { text: t.final } })
    t.to?.send('dictate:line', { ended: true })
  })
  ipcMain.handle('haligtree:dictate:cancel', () => globalThis.talk.to?.send('dictate:line', { ended: true }))
}, [mode, mic])
const partial = (text) => electron.evaluate((_e, text) => globalThis.talk.to?.send('dictate:line', { partial: { text } }), text)
const settle = (text) => electron.evaluate((_e, text) => void (globalThis.talk.final = text), text)
const talk = () => electron.evaluate(() => ({ started: globalThis.talk.started, stopped: globalThis.talk.stopped }))
const textOf = (target) => target.evaluate(() => {
  const all = [...document.querySelectorAll('.tiptap')].filter((one) => one.editor?.isEditable)
  return (all.find((one) => one.contains(document.activeElement)) ?? all[0])?.editor?.getText() ?? ''
})
const toastSays = (target) => target.evaluate(() => [...document.querySelectorAll('[data-sonner-toast], [role=status]')].map((one) => one.textContent).join(' | '))

/** One surface: type “Before. ” then “/dictate”, pick it, talk, keep with ↵; again and drop with Esc; again picked by the pointer. */
async function oneSurface(name, target, focus) {
  await focus()
  await target.keyboard.type('Before. ', { delay: 5 })
  await target.keyboard.type('/dictate', { delay: 20 }); await target.waitForTimeout(500)
  const n = (await talk()).started
  await target.keyboard.press('Enter'); await target.waitForTimeout(500)
  check(`${name}: picking “Dictate” with ↵ starts listening`, (await talk()).started === n + 1, JSON.stringify(await talk()))
  check(`${name}: the Orb shows by the caret`, !!(await target.$('[data-talk=orb]')), '')
  check(`${name}: the slash word is gone`, !(await textOf(target)).includes('/dictate'), JSON.stringify(await textOf(target)))
  await partial('ring the plumber'); await target.waitForTimeout(250)
  check(`${name}: words come in faint where the caret was`, (await target.evaluate(() => document.querySelector('[data-talk=faint]')?.textContent ?? '')).includes('Ring the plumber'), '')
  if (name === 'note') await c.both(`${shots}/slash-dictate-listening`)
  await settle('ring the plumber'); await target.keyboard.press('Enter'); await target.waitForTimeout(500)
  const kept = await textOf(target)
  check(`${name}: ↵ keeps the words at the caret`, /Before\. Ring the plumber$/.test(kept.trim()), JSON.stringify(kept))
  check(`${name}: the Orb goes`, !(await target.$('[data-talk=orb]')), '')

  await target.keyboard.type(' /dictate', { delay: 20 }); await target.waitForTimeout(500)
  await target.keyboard.press('Enter'); await target.waitForTimeout(400)
  await partial('never mind'); await target.waitForTimeout(200)
  await target.keyboard.press('Escape'); await target.waitForTimeout(400)
  const after = await textOf(target)
  check(`${name}: Esc drops the words and stops`, !after.includes('Never mind') && !(await target.$('[data-talk=orb]')) && !(await target.$('[data-talk=faint]')), JSON.stringify(after))

  await target.keyboard.type('/dictate', { delay: 20 }); await target.waitForTimeout(500)
  const m = (await talk()).started
  const item = target.locator('[role=option], [data-slash-item], button', { hasText: /^Dictate/ }).first()
  await item.click().catch(() => undefined); await target.waitForTimeout(500)
  check(`${name}: picking “Dictate” with the pointer starts listening`, (await talk()).started === m + 1, JSON.stringify(await talk()))
  await settle('with the pointer'); await target.keyboard.press('Enter'); await target.waitForTimeout(500)
  check(`${name}: the pointer's words land at the caret`, (await textOf(target)).trim().toLowerCase().endsWith('with the pointer'), JSON.stringify(await textOf(target)))
}

try {
  await v('settings:set', { sounds: false, hintRate: 0, talkToType: true, talkKey: 'alt-space', talkTaps: false })
  await standIn()
  const id = await v('article:new')
  await v('item:save', id, { title: 'Spoken', body: { type: 'doc', content: [{ type: 'paragraph' }] } })
  await c.send('article', id); await wait(1500)

  const only = process.env.QA_ONLY
  if (!only) {
  await oneSurface('note', h, async () => { await h.click('[data-open] .tiptap'); await h.keyboard.press('End') })

  // --- Talk keys off in Settings: /dictate still starts, and ↵ and Esc still answer --------
  await v('settings:set', { talkToType: false }); await wait(400)
  await h.keyboard.press('Enter')
  await oneSurface('note, talk keys off', h, async () => undefined)
  await v('settings:set', { talkToType: true }); await wait(400)

  // --- A note's own window -------------------------------------------------------------
  const id2 = await v('article:new')
  await v('item:save', id2, { title: 'Spoken alone', body: { type: 'doc', content: [{ type: 'paragraph' }] } })
  await h.evaluate((i) => window.api.haligtree('notes:window', 'article', i, null, null), id2).catch(() => undefined)
  let win = null
  for (let i = 0; i < 40 && !win; i++) { win = electron.windows().find((w) => /[?&]note=/.test(w.url())); if (!win) await wait(250) }
  if (win) {
    await win.waitForSelector('.tiptap', { timeout: 8000 }).catch(() => undefined); await win.waitForTimeout(800)
    await oneSurface('note window', win, async () => { await win.click('.tiptap'); await win.keyboard.press('End') })
    await electron.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().filter((w) => /[?&]note=/.test(w.webContents.getURL())).forEach((w) => w.close()))
  } else check('note window opens', false, 'no window')

  // --- Quick capture -------------------------------------------------------------------
  await electron.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].show())
  await box.waitForTimeout(800)
  await oneSurface('quick capture', box, async () => { await box.click('.tiptap') })
  await box.screenshot({ path: `${shots}/slash-dictate-box.png` })
  await box.keyboard.press('Escape')
  await electron.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].hide())

  }
  // --- A sticky ------------------------------------------------------------------------
  const capture = (await h.evaluate(() => window.api.captures.list()))[0]?.id
  await h.evaluate((i) => window.api.stick('capture', i, true), capture)
  let sticky = null
  for (let i = 0; i < 40 && !sticky; i++) { sticky = electron.windows().find((w) => w.url().includes('view=sticky') && w.url().includes(capture)); if (!sticky) await wait(250) }
  if (sticky) {
    // A sticky edits on a double-click in its words (sticky-note.tsx), its editor loaded lazily.
    await sticky.waitForSelector('[data-hide-first], .note-pane, main', { timeout: 8000 }).catch(() => undefined)
    await sticky.waitForTimeout(1200)
    const words = await sticky.evaluate(() => {
      const area = [...document.querySelectorAll('div')].find((one) => one.scrollHeight > 0 && getComputedStyle(one).overflowY === 'auto')
      const r = (area ?? document.body).getBoundingClientRect()
      return { x: r.left + Math.min(60, r.width / 2), y: r.top + Math.min(30, r.height / 2) }
    })
    await sticky.mouse.dblclick(words.x, words.y)
    await sticky.waitForSelector('.tiptap[contenteditable=true]', { timeout: 10000 }).catch(() => undefined); await sticky.waitForTimeout(600)
    // A sticky's editor is small and bare by design (sticky-note.tsx: slash={false}), so it offers no
    // slash menu and no “Dictate” to be wrong about; talking is the talk key there.
    if (await sticky.$('.tiptap[contenteditable=true]')) {
      await sticky.click('.tiptap'); await sticky.keyboard.press('End')
      await sticky.keyboard.type(' /dic', { delay: 20 }); await sticky.waitForTimeout(400)
      check('sticky: no slash menu, so no “Dictate” is offered', !(await sticky.evaluate(() => [...document.querySelectorAll('[role=option], [data-slash-item]')].some((one) => /Dictate/.test(one.textContent ?? '')))), '')
      for (let i = 0; i < 5; i++) await sticky.keyboard.press('Backspace')
      await settle('call the plumber')
      const n = (await talk()).started
      await sticky.keyboard.down('Alt'); await sticky.keyboard.down('Space'); await sticky.waitForTimeout(400)
      check('sticky: holding ⌥Space listens, the Orb by the caret', (await talk()).started === n + 1 && !!(await sticky.$('[data-talk=orb]')), JSON.stringify(await talk()))
      await sticky.keyboard.up('Space'); await sticky.keyboard.up('Alt'); await sticky.waitForTimeout(500)
      check('sticky: the words land in the note (at the caret: End is the line end there)', /call the plumber/i.test(await textOf(sticky)), JSON.stringify((await textOf(sticky)).slice(-60)))
    }
    else check('sticky: its editor opens on a double-click', false, (await sticky.evaluate(() => document.body.innerText.slice(0, 200))) + ' ' + JSON.stringify(words))
  } else check('sticky opens', false, 'no sticky')
  await h.evaluate((i) => window.api.stick('capture', i, false), capture)

  // --- Refused ---------------------------------------------------------------------------
  await h.click('[data-open] .tiptap'); await h.keyboard.press('End'); await h.keyboard.press('Enter')
  await standIn('ok', false)
  await h.keyboard.type('/dictate', { delay: 20 }); await wait(400); await h.keyboard.press('Enter'); await wait(600)
  check('microphone refused: says where to allow it', /Privacy & Security, then Microphone/.test(await toastSays(h)), await toastSays(h))
  check('microphone refused: nothing listening', !(await h.$('[data-talk=orb]')), '')
  await standIn('denied', true)
  await h.keyboard.type('/dictate', { delay: 20 }); await wait(400); await h.keyboard.press('Enter'); await wait(600)
  check('speech recognition refused: says where to allow it', /then Speech Recognition/.test(await toastSays(h)), await toastSays(h))
  check('no page errors', c.errors.length === 0, c.errors.join(' | '))
} finally {
  await c.close()
}
done()
