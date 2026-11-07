// Talk to type (native/listen.swift, main/dictation.ts, components/haligtree/talk.tsx).
// The real microphone can't run in a test, so main's handlers are replaced by a stand-in that
// streams partial and final words as the probe says. Checks: holding ⌥Space starts and letting go
// stops; the words land at the caret in a note, in quick capture and in Review's typed answer;
// faint, then firm; Esc takes them away; spoken punctuation; the denied and offline lines; no sound.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox node qa/dictation.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'

const { check, done } = checks()
const shots = process.env.QA_SHOTS ?? '/tmp'
const c = await sandbox({ width: 1300, height: 860 })
const { h, v, electron, page: box } = c
const wait = (ms) => h.waitForTimeout(ms)
const EDITOR = '[data-open] .tiptap'
const textIn = (target, sel) => target.evaluate((s) => document.querySelector(s)?.editor?.getText() ?? document.querySelector(s)?.value ?? '', sel)

/** Main's handlers, as the helper would answer: `mode` ok, denied or offline. */
const standIn = (mode = 'ok') => electron.evaluate(({ ipcMain }, mode) => {
  for (const one of ['start', 'stop', 'cancel']) ipcMain.removeHandler(`haligtree:dictate:${one}`)
  globalThis.talk = { mode, started: 0, stopped: 0, to: null, final: '' }
  ipcMain.handle('haligtree:dictate:start', (event) => {
    const t = globalThis.talk
    if (t.mode === 'denied') return { error: { code: 'denied', message: 'Haligtree may not use speech recognition. Allow it in System Settings, under Privacy & Security, then Speech Recognition' } }
    t.started++
    t.to = event.sender
    if (t.mode === 'offline') setImmediate(() => { t.to.send('dictate:line', { error: { code: 'offline', message: "This Mac can't turn speech into words offline yet. Turn on Dictation in System Settings, under Keyboard, so its language downloads, then try again" } }); t.to.send('dictate:line', { ended: true }) })
    else setImmediate(() => t.to.send('dictate:line', { ready: { onDevice: true } }))
    return { ok: true }
  })
  ipcMain.handle('haligtree:dictate:stop', () => {
    const t = globalThis.talk
    t.stopped++
    t.to?.send('dictate:line', { final: { text: t.final } })
    t.to?.send('dictate:line', { ended: true })
  })
  ipcMain.handle('haligtree:dictate:cancel', () => globalThis.talk.to?.send('dictate:line', { ended: true }))
}, mode)
const partial = (text) => electron.evaluate((_e, text) => globalThis.talk.to.send('dictate:line', { partial: { text } }), text)
const settle = (text) => electron.evaluate((_e, text) => void (globalThis.talk.final = text), text)
const talk = () => electron.evaluate(() => ({ started: globalThis.talk.started, stopped: globalThis.talk.stopped }))
const toastSays = (target = h) => target.evaluate(() => [...document.querySelectorAll('[data-sonner-toast], [role=status]')].map((one) => one.textContent).join(' | '))

try {
  await v('settings:set', { sounds: false, hintRate: 0, talkToType: true, talkKey: 'alt-space', talkTaps: false })
  await standIn()
  const id = await v('article:new')
  await v('item:save', id, { title: 'Spoken', body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Before.' }] }] } })
  await c.send('article', id); await wait(1500)
  await h.click(EDITOR); await h.keyboard.press('End')

  // --- Hold ⌥Space in a note ----------------------------------------------------------
  await h.keyboard.down('Alt'); await h.keyboard.down('Space'); await wait(400)
  check('holding ⌥Space starts listening', (await talk()).started === 1, JSON.stringify(await talk()))
  check('the Orb shows by the caret', !!(await h.$('[data-talk=orb]')), '')
  check('the beam turns while it listens', await h.evaluate(() => !!document.querySelector('[data-beam], .mf-beam, [class*=beam]')), '')
  await partial('pick up the books full stop')
  await wait(300)
  const faint = await h.evaluate(() => document.querySelector('[data-talk=faint]')?.textContent ?? '')
  check('words come in faint at the caret as they are heard', faint === ' Pick up the books.', JSON.stringify(faint))
  check('faint words are not in the note yet', (await textIn(h, EDITOR)) === 'Before.', await textIn(h, EDITOR))
  await h.screenshot({ path: `${shots}/dictation-listening-light.png` })
  await c.look('dark'); await h.screenshot({ path: `${shots}/dictation-listening-dark.png` }); await c.look('light')
  await settle('pick up the books full stop new line then comma the milk')
  await h.keyboard.up('Space'); await h.keyboard.up('Alt'); await wait(500)
  check('letting go stops listening', (await talk()).stopped === 1, JSON.stringify(await talk()))
  const firm = await textIn(h, EDITOR)
  check('the words firm up in the note, with spoken punctuation and capitals', firm === 'Before. Pick up the books.\n\nThen, the milk', JSON.stringify(firm))
  check('no faint words left, no Orb', !(await h.$('[data-talk=faint]')) && !(await h.$('[data-talk=orb]')), '')
  check('no ⌥Space character typed', !firm.includes(' '), JSON.stringify(firm))

  // --- Esc takes the faint words away ------------------------------------------------------
  await h.keyboard.down('Alt'); await h.keyboard.down('Space'); await wait(300)
  await partial('never mind'); await wait(200)
  await h.keyboard.press('Escape'); await wait(300)
  await h.keyboard.up('Space'); await h.keyboard.up('Alt'); await wait(300)
  check('Esc removes the unconfirmed words', (await textIn(h, EDITOR)) === firm && !(await h.$('[data-talk=faint]')), await textIn(h, EDITOR))
  check('Esc keeps the note open', !!(await h.$(EDITOR)), '')

  // --- /dictate in the slash menu ---------------------------------------------------------
  await h.keyboard.press('Enter'); await h.keyboard.type('/dictate'); await wait(500)
  const offered = await h.evaluate(() => [...document.querySelectorAll('[role=option], [data-slash-item], button')].some((one) => /^Dictate/.test(one.textContent?.trim() ?? '')))
  check('“Dictate” is in the slash menu', offered, '')
  await h.keyboard.press('Enter'); await wait(400)
  check('“Dictate” starts listening', (await talk()).started === 3, JSON.stringify(await talk()))
  await settle('from the menu'); await h.keyboard.press('Enter'); await wait(400)
  check('Enter stops a tapped listening and keeps the words', (await textIn(h, EDITOR)).endsWith('From the menu'), await textIn(h, EDITOR))

  // --- Quick capture -------------------------------------------------------------------
  await electron.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].show())
  await box.waitForTimeout(800)
  await box.keyboard.type('Ring the plumber', { delay: 5 })
  await settle('about the boiler')
  const before = (await talk()).started
  await box.keyboard.down('Alt'); await box.keyboard.down('Space'); await box.waitForTimeout(300)
  await box.keyboard.up('Space'); await box.keyboard.up('Alt'); await box.waitForTimeout(500)
  const boxed = await box.evaluate(() => document.querySelector('.tiptap')?.editor?.getText() ?? document.querySelector('textarea')?.value ?? '')
  check('quick capture: the words land at the caret', (await talk()).started === before + 1 && boxed.includes('Ring the plumber about the boiler'), JSON.stringify(boxed))
  await electron.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].hide())

  // --- Review's typed answer -----------------------------------------------------------
  await v('settings:set', { grades: 2, newPerDay: 500 })
  const card = await v('nugget:from', 'mitochondria', {})
  await v('item:save', card, { prompt: 'Where in a cell is ATP made?' })
  for (const one of await v('cards:all')) if (one.id !== card) await v('item:save', one.id, { suspended: true })
  await h.reload(); await wait(2500); await standIn()
  await c.go('review', ':today'); await wait(800)
  const answer = h.locator('textarea').first()
  await answer.click()
  await settle('mitochondria')
  await h.keyboard.down('Alt'); await h.keyboard.down('Space'); await wait(300)
  await partial('mito')
  await wait(200)
  check('Review: faint while heard (the field is marked as listening)', await h.evaluate(() => document.querySelector('textarea')?.hasAttribute('data-talking')), '')
  await h.keyboard.up('Space'); await h.keyboard.up('Alt'); await wait(400)
  check('Review: the answer is typed', (await answer.inputValue()) === 'Mitochondria', await answer.inputValue())
  check('Review: the field is firm again', !(await h.evaluate(() => document.querySelector('textarea')?.hasAttribute('data-talking'))), '')

  // --- Denied and offline ---------------------------------------------------------------
  await standIn('denied')
  await h.keyboard.down('Alt'); await h.keyboard.down('Space'); await wait(400)
  await h.keyboard.up('Space'); await h.keyboard.up('Alt'); await wait(300)
  check('denied: a friendly line that says where to allow it', /Privacy & Security, then Speech Recognition/.test(await toastSays()), await toastSays())
  check('denied: nothing is left listening', !(await h.$('[data-talk=orb]')), '')
  await standIn('offline'); await wait(300)
  await h.keyboard.down('Alt'); await h.keyboard.down('Space'); await wait(400)
  await h.keyboard.up('Space'); await h.keyboard.up('Alt'); await wait(400)
  check('offline: says so plainly with the Settings path', /offline yet\. Turn on Dictation in System Settings, under Keyboard/.test(await toastSays()), await toastSays())
  check('offline: never hangs (no Orb left)', !(await h.$('[data-talk=orb]')), '')

  // --- Silent ------------------------------------------------------------------------
  const heard = await h.evaluate(() => window.haligtreeHeard ?? [])
  check('no sound in tests', !heard.some((one) => /listen/.test(one)), JSON.stringify(heard))
  check('no page errors', c.errors.length === 0, c.errors.join(' | '))
  // --- The helper killed or gone while words are coming: what was heard stays ----------
  await standIn()
  await c.send('article', id); await wait(1200)
  await h.click(EDITOR); await h.keyboard.press('End')
  await h.keyboard.down('Alt'); await h.keyboard.down('Space'); await wait(400)
  await partial('words said before the helper died')
  await wait(200)
  await electron.evaluate(() => globalThis.talk.to.send('dictate:line', { ended: true }))
  await wait(300)
  await h.keyboard.up('Space'); await h.keyboard.up('Alt'); await wait(300)
  check('the helper gone mid-words: what was heard stays in the note', /words said before the helper died/i.test(await textIn(h, EDITOR)), await textIn(h, EDITOR))
  check('and it says so', /Talk to type stopped/.test(await toastSays()), await toastSays())
  await h.keyboard.down('Alt'); await h.keyboard.down('Space'); await wait(400)
  await partial('and words before an error')
  await wait(200)
  await electron.evaluate(() => globalThis.talk.to.send('dictate:line', { error: { code: 'failed', message: 'Talk to type could not hear the words' } }))
  await wait(300)
  await h.keyboard.up('Space'); await h.keyboard.up('Alt'); await wait(300)
  check('an error mid-words: what was heard stays too', /and words before an error/i.test(await textIn(h, EDITOR)), await textIn(h, EDITOR))
} finally {
  await c.close()
}
done()
