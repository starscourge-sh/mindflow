// What main answers when "Reading List" is opened again after its first offer (Dorian Gray, a character) is put away
// with ×: every ask for the note's offers and every "left" is recorded in main as it comes (which view asked, when,
// what came back), and whether the note's editor was made again. A run of a COPY of the user's book.
//   QA_ARGS= QA_DATA=<copy of book-master> QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 [TRIES=3] node qa/offer-reopen.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS = ''
process.env.HALIGTREE_QA_CAPS ??= 'every'
const { check, done } = checks()
const c = await sandbox({ width: 1300, height: 900 })
const { h, v, send, electron } = c
const wait = (ms) => h.waitForTimeout(ms)
const PAGE = 'b022896d-02b4-415f-a88f-8b5f653b4c2b'
const OFFER = '[data-note-offer]'
const offer = () => h.evaluate((s) => { const el = document.querySelector(s); return el ? el.getAttribute('data-note-offer') : null }, OFFER)
try {
  await h.evaluate(() => window.api.haligtree('onboarding:set', { welcomed: new Date().toISOString(), newsSeen: true, welcoming: false, pageHints: false }))
  await v('settings:set', { sounds: false, noteOffers: true, celebrate: false })
  // Main's own record of each ask and each "left": wrapped where ipcMain keeps its handlers, its answer read as it is sent.
  await electron.evaluate(({ ipcMain }) => {
    const log = (globalThis.__offerLog = [])
    const t0 = Date.now()
    for (const channel of ['haligtree:offers:note', 'haligtree:offers:left']) {
      const real = ipcMain._invokeHandlers.get(channel)
      ipcMain._invokeHandlers.set(channel, async (event, ...args) => {
        const asker = channel.endsWith('left') ? args[0] : args[3]
        const entry = { channel: channel.slice(17), asker, at: Date.now() - t0 }
        log.push(entry)
        const value = await real(event, ...args)
        entry.answeredAt = Date.now() - t0
        entry.answer = value === null ? 'null' : value === undefined ? '-' : `people ${value.people?.length ?? '?'}, characters ${value.characters?.length ?? '?'}, links ${value.links?.length ?? '?'}`
        return value
      })
    }
  })
  const log = () => electron.evaluate(() => globalThis.__offerLog.map((one) => ({ ...one })))
  const tries = Number(process.env.TRIES ?? 3)
  let back = 0
  for (let n = 1; n <= tries; n++) {
    // A fresh start each try: the dismissals cleared. The first as qa/offer-people.mjs does it (the note opened where
    // the book left the window, beside its list, and asked once straight); the others from Home.
    const start = (await log()).length
    await h.evaluate(() => localStorage.removeItem('note-offers:dismissed'))
    if (n > 1) {
      await h.evaluate(() => document.querySelector('.note-pane')?.setAttribute('data-left-for-home', ''))
      await c.go('home')
      await h.waitForFunction(() => !document.querySelector('[data-left-for-home]'), null, { timeout: 60000 })
    }
    await send('article', PAGE)
    await h.waitForSelector('.note-pane .tiptap.ProseMirror', { timeout: 30000 })
    if (n === 1) {
      await wait(1500)
      await h.evaluate(async (page) => {
        const editor = document.querySelector('.tiptap.ProseMirror.haligtree-editor:not(.is-line)').editor
        await window.api.haligtree('offers:note', `article:${page}`, editor.getText({ blockSeparator: '\n' }), [], 'probe')
      }, PAGE)
    }
    let first = null
    for (let t = 0; t < 40000 && !(first = await offer()); t += 250) await wait(250)
    const mark = await h.evaluate(() => { const ed = document.querySelector('.tiptap.ProseMirror.haligtree-editor:not(.is-line)'); if (ed) ed.dataset.o3 = 'old'; return !!ed })
    await h.click(`${OFFER} [data-offer-away]`).catch(() => {})
    await wait(1200)
    const left = Date.now()
    // Where the window is after "Home": each pane's view in front, and the old editor still in the page, still seen.
    const where = () => h.evaluate(() => {
      const kept = JSON.parse(localStorage.getItem('split') ?? 'null')
      const views = (kept?.panes ?? []).map((pane) => { const tab = pane.tabs.find((one) => one.key === pane.active); const view = tab?.trail.views[tab.trail.at]; return `${view?.id ?? '?'}${view?.focus ? `:${String(view.focus).slice(0, 8)}` : ''}` })
      const old = document.querySelector('[data-o3="old"]')
      return { panes: views.join(' | '), active: kept?.active ?? null, oldInPage: !!old, oldSeen: !!old?.checkVisibility?.() }
    })
    // Left for real: Home takes the page only once it has what it shows, and until then the note stays shown and read
    // (sent back 900 ms after "Home", the note had never gone: no "left", no new ask, the old editor still seen).
    await h.evaluate(() => document.querySelector('.note-pane')?.setAttribute('data-left-for-home', ''))
    await c.go('home')
    await h.waitForFunction(() => !document.querySelector('[data-left-for-home]'), null, { timeout: 60000 })
    console.log(`NOTE    after Home: ${JSON.stringify(await where())}`)
    if (process.env.SHOT) await h.screenshot({ path: `${process.env.SHOT}/reopen-${n}-after-home.png` })
    await send('article', PAGE)
    await h.waitForSelector('.tiptap.ProseMirror', { timeout: 30000 })
    console.log(`NOTE    after the note again: ${JSON.stringify(await where())}`)
    if (process.env.SHOT) await h.screenshot({ path: `${process.env.SHOT}/reopen-${n}-note-again.png` })
    const remade = await h.evaluate(() => document.querySelector('.tiptap.ProseMirror.haligtree-editor:not(.is-line)')?.dataset.o3 !== 'old')
    let next = null
    for (let t = 0; t < 40000 && !(next = await offer()); t += 250) await wait(250)
    const took = Date.now() - left
    const asks = (await log()).slice(start)
    console.log(`NOTE  try ${n}: first offer ${first}; marked ${mark}; editor made again ${remade}; after reopening: ${next ?? 'none'} (${took} ms)`)
    for (const one of asks) console.log(`NOTE    ${one.channel} ${one.asker} at ${one.at} ms: ${one.answer ?? 'not answered yet'}${one.answeredAt ? ` at ${one.answeredAt} ms` : ''}`)
    if (next === 'people') back++
  }
  check(`opened again after × on its first offer, the people's offer comes back every time (${back} of ${tries})`, back === tries)
  check('no page errors', !c.errors.some((one) => one.includes('PAGEERROR')), c.errors.slice(0, 3).join(' | '))
} catch (error) {
  check('the run finished', false, String(error?.message ?? error).split('\n').slice(0, 4).join(' ⏎ '))
} finally {
  await c.close()
}
done()
