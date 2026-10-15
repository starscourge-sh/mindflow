// The box's extras: a face for each person, a Word's meaning looked up as you
// write it, and the light round the box's edge that says what it is doing.
// The dictionary is a small server here (MINDFLOW_QA_DICT, honoured only on a
// QA data folder), so nothing reaches the internet. Read back through the
// app's own API and the page, not by eye.
//
//   npx electron-vite build --outDir out-boxplus
//   QA_DATA=$(mktemp -d) QA_ENTRY=out-boxplus/main/index.js MINDFLOW_QA_AWAY=1 node qa/box-extras.mjs
//   QA_ARGS=--sandbox ... node qa/box-extras.mjs   (the practice copy: its seeded quotes signed with faces)
//
// SHOTS=dir saves light and dark pictures.
import { createServer } from 'http'
import { mkdirSync, mkdtempSync, writeFileSync } from 'fs'
import { execSync } from 'child_process'
import { tmpdir } from 'os'
import { join } from 'path'
import { open } from './harness.mjs'

process.env.QA_DATA ??= mkdtempSync(join(tmpdir(), 'vigil-extras-'))
const SANDBOX = (process.env.QA_ARGS ?? '').includes('--sandbox')

// --- the dictionary, played by a local server -----------------------------------
const hits = []
let sounds = 0
const ENTRIES = {
  serendipity: { delay: 700, phonetic: '/ˌsɛɹ.ənˈdɪp.ɪ.ti/', part: 'noun', definition: 'An unsought, unintended, and/or unexpected, but fortunate, discovery or learning experience.', example: 'Meeting her there was pure serendipity.' },
  sonder: { delay: 6000, phonetic: '/ˈsɒndə/', part: 'noun', definition: 'The realisation that each passer-by has a life as vivid as your own.', example: '' },
  apricity: { delay: 6000, phonetic: '/əˈprɪsɪti/', part: 'noun', definition: 'The warmth of the sun in winter.', example: '' },
  petrichor: { delay: 12000, phonetic: '/ˈpɛtɹɪkɔː/', part: 'noun', definition: 'The distinctive scent of rain on dry earth.', example: '' }
}
const server = createServer((req, res) => {
  const url = new URL(req.url, 'http://x')
  if (url.pathname.startsWith('/audio/')) {
    sounds++
    res.writeHead(200, { 'content-type': 'audio/mpeg' })
    return res.end(Buffer.alloc(64))
  }
  const word = decodeURIComponent(url.pathname.split('/').pop() ?? '')
  hits.push(word)
  if (word === 'outage') return (res.writeHead(503), res.end())
  const entry = ENTRIES[word]
  if (!entry) {
    res.writeHead(404, { 'content-type': 'application/json' })
    return res.end(JSON.stringify({ title: 'No Definitions Found' }))
  }
  setTimeout(() => {
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify([{ word, phonetic: entry.phonetic, phonetics: [{ text: entry.phonetic, audio: `http://127.0.0.1:${server.address().port}/audio/${word}.mp3` }], meanings: [{ partOfSpeech: entry.part, definitions: [{ definition: entry.definition, ...(entry.example ? { example: entry.example } : {}) }] }] }]))
  }, entry.delay)
})
await new Promise((done) => server.listen(0, '127.0.0.1', done))
server.unref()
process.env.MINDFLOW_QA_DICT = `http://127.0.0.1:${server.address().port}/api/v2/entries/en/`

const EDITOR = '.tiptap.ProseMirror.mindflow-editor:not(.is-line)'
// Under load a window can be slow to show its box: tried again, a few times.
const launch = async () => {
  for (let i = 0; ; i++) {
    try { return await open() } catch (error) {
      if (i === 2) throw error
      try { execSync(`pkill -9 -f '${process.env.QA_ENTRY ?? 'out-boxplus/main/index.js'}'`) } catch {}
      await new Promise((done) => setTimeout(done, 2000))
    }
  }
}
let qa = await launch()
let { page } = qa
// The welcome holds keys back: marked done, and opened again.
if (!(await page.evaluate(() => window.api.vigil('onboarding:state').then((s) => !!s?.welcomed)))) {
  await page.evaluate(() => window.api.vigil('onboarding:set', { welcomed: new Date().toISOString(), welcoming: false }))
  const child = qa.electron.process()
  await qa.close?.()
  try { child.kill('SIGKILL') } catch {}
  await new Promise((done) => setTimeout(done, 1500))
  qa = await launch()
  page = qa.page
}
const errors = []
page.on('pageerror', (error) => errors.push(`PAGEERROR ${error.message}`))
// React's own warnings (a dev build): said, not failed on, as some are not this box's.
const warnings = []
page.on('console', (message) => ['error', 'warning'].includes(message.type()) && warnings.push(message.text().slice(0, 240)))
const results = []
const wait = (ms = 300) => page.waitForTimeout(ms)
const v = (channel, ...args) => page.evaluate(([c, a]) => window.api.vigil(c, ...a), [channel, args])
const captures = async () => (await page.evaluate(() => window.api.captures.list())) ?? []
const capture = async (words) => {
  for (let i = 0; i < 15; i++) {
    const found = (await captures()).find((one) => (one.label ?? '').includes(words))
    if (found) return found
    await wait(200)
  }
}
const define = () => page.evaluate(() => document.querySelector('[data-define]')?.getAttribute('data-define') ?? null)
// A wait told to the beam as any work tells it (beam.tsx): the box itself no
// longer turns it for a word or a link, which say their waits in place.
const holdBeam = (on) => page.evaluate((n) => window.dispatchEvent(new CustomEvent('vigil:beam-wait', { detail: n })), on ? 1 : 0)
const beamNow = () => page.evaluate(() => document.querySelector('.mf-beam')?.getAttribute('data-beam') ?? null)
/** The first beam state seen within ms, polled every frame in the page. */
const beamSeen = (state, ms = 2000) => page.evaluate(([s, ms]) => new Promise((done) => {
  const end = performance.now() + ms
  const look = () => document.querySelector(`.mf-beam[data-beam="${s}"]`) ? done(true) : performance.now() > end ? done(false) : requestAnimationFrame(look)
  look()
}), [state, ms])
async function fresh() {
  await page.evaluate(() => window.api.showPrompt())
  await wait(200)
  // A new capture (⌘N): no who, where or kind left from the case before.
  await page.keyboard.press('Meta+n')
  await wait(300)
  await qa.reset()
  await page.evaluate(() => localStorage.clear())
  await page.evaluate(() => delete document.documentElement.dataset.motion)
}
const type = async (words) => (await page.keyboard.type(words, { delay: 15 }), wait(300))
const send = async () => (await page.keyboard.press('Alt+Meta+Enter'), wait(1200))
const only = (process.env.ONLY ?? '').split(',').filter(Boolean)
async function check(name, run) {
  if (only.length && !only.some((one) => name.includes(one))) return
  try {
    await fresh()
    await run()
    results.push(`ok   ${name}`)
  } catch (error) {
    results.push(`FAIL ${name}: ${error.message}`)
  }
}
const expect = (truth, said) => { if (!truth) throw new Error(said) }
const until = async (test, ms = 4000) => { for (let i = 0; i < ms / 100; i++) { if (await test()) return true; await wait(100) } return false }

// --- a Word's meaning --------------------------------------------------------------
await check('word: looked up in the background, no beam while it is; shown as a ghost', async () => {
  await page.keyboard.type('Serendipity', { delay: 15 })
  expect(!(await beamSeen('working', 1500)), 'the beam turned for a word')
  expect(await until(async () => (await define()) === 'ghost'), `no ghost: ${await define()}`)
  const said = await page.evaluate(() => document.querySelector('[data-define]')?.textContent ?? '')
  expect(said.includes('noun') && said.includes('/ˌsɛɹ.ənˈdɪp.ɪ.ti/') && said.includes('fortunate'), `the ghost says: ${said}`)
  expect(await until(async () => !(await beamNow())), 'the beam still lit at rest')
})
await check('word: the meaning sits inside the writing surface, under the word', async () => {
  await type('Serendipity')
  expect(await until(async () => (await define()) === 'ghost'), 'no ghost')
  // Placed as it appears, and still there once the page rests.
  await wait(1500)
  const place = await page.evaluate(() => {
    const ghost = document.querySelector('[data-define]')
    const word = ghost.closest('.mf-faded').querySelector('.tiptap.ProseMirror p')
    const surface = ghost?.closest('.mf-faded')?.getBoundingClientRect()
    const g = ghost?.getBoundingClientRect()
    return { inside: !!surface && g.bottom <= surface.bottom + 1, below: g.top >= word.getBoundingClientRect().bottom - 1, left: Math.round(ghost.querySelector('[data-meaning]').getBoundingClientRect().left + 8 - word.getBoundingClientRect().left), gap: Math.round(g.top - word.getBoundingClientRect().bottom) }
  })
  expect(place.inside && place.below && Math.abs(place.left) <= 4 && place.gap <= 12, `placed: ${JSON.stringify(place)}`)
})
await check('toasts: said in the footer row, never over the writing or its fields', async () => {
  await type('Serendipity')
  expect(await until(async () => (await define()) === 'ghost'), 'no ghost')
  await page.keyboard.press('Meta+n')
  await wait(400)
  await type('“You have power over your mind.” - Marcus Aurelius')
  await wait(600)
  await page.keyboard.press('Meta+n')
  await wait(400)
  await type('Serendipity')
  await until(async () => (await define()) === 'ghost')
  await page.keyboard.press('Meta+n')
  await wait(400)
  const over = await page.evaluate(() => {
    const toast = document.querySelector('[role=status][aria-live]')?.getBoundingClientRect()
    const footer = document.querySelector('main[data-chrome]')?.getBoundingClientRect()
    if (!toast || !footer) return { toast: !!toast }
    const hits = [...document.querySelectorAll('.mf-faded, [data-will-do], .app-container [data-chrome] input, main[data-chrome] > :first-child, main[data-chrome] > :last-child')]
      .map((one) => one.getBoundingClientRect()).filter((r) => r.width && r.right > toast.left && r.left < toast.right && r.bottom > toast.top && r.top < toast.bottom)
    return { toast: true, hits: hits.length, inRow: toast.top >= footer.top - 2 && toast.bottom <= footer.bottom + 2 }
  })
  expect(over.toast && !over.hits && over.inRow, `toast: ${JSON.stringify(over)}`)
})
await check('who: a name read from a quote goes when the box is emptied by hand', async () => {
  await type('“You have power over your mind, not outside events.” - Marcus Aurelius')
  expect(await until(() => page.locator('[data-who-avatar]').count()), 'the quote did not fill who')
  await qa.reset()
  await wait(800)
  await type('Serendipity')
  await wait(600)
  expect(!(await page.locator('[data-who-avatar]').count()), `the who came along to the next note: ${await page.evaluate(() => [document.querySelector('[data-who-avatar]')?.parentElement?.querySelector('input')?.value, document.querySelector('.tiptap.ProseMirror')?.textContent, document.querySelectorAll('[data-who-avatar]').length])}`)
})
await check('word: Tab keeps it, and it is saved with the note; never without', async () => {
  await type('Serendipity')
  expect(await until(async () => (await define()) === 'ghost'), 'no ghost')
  await page.keyboard.press('Tab')
  await wait()
  expect((await define()) === 'kept', `Tab did not keep it: ${await define()}`)
  expect((await page.evaluate((s) => document.querySelector(s)?.textContent, EDITOR)) === 'Serendipity', 'Tab changed the words')
  // Sent by a key, a plain "done" has no sweep: the sound and the toast say it
  // (b19e316f). Watched from before the key, so a slow moment cannot miss one.
  const swept = beamSeen('success', 3000)
  await page.keyboard.press('Alt+Meta+Enter')
  expect(!(await swept), 'a sweep on a send by keys')
  await wait(1000)
  const kept = await capture('Serendipity')
  expect(kept?.kind === 'word', `not kept as a word: ${kept?.kind}`)
  const fields = await v('notes:fields', 'captures', kept.id)
  expect(fields.definition?.includes('fortunate') && fields.example?.includes('pure serendipity'), `fields: ${JSON.stringify(fields)}`)
  await fresh()
  await type('Serendipity')
  expect(await until(async () => (await define()) === 'ghost'), 'no ghost the second time')
  await send()
  const all = (await captures()).filter((one) => (one.label ?? '').includes('Serendipity'))
  const second = all.find((one) => one.id !== kept.id)
  expect(second, 'the second not kept')
  const none = await v('notes:fields', 'captures', second.id)
  expect(!none.definition, `saved without being taken: ${JSON.stringify(none)}`)
})
await check('word: asked again, answered from what was kept (no second fetch)', async () => {
  const before = hits.filter((one) => one === 'serendipity').length
  await type('serendipity')
  expect(await until(async () => (await define()) === 'ghost'), 'no ghost')
  expect(hits.filter((one) => one === 'serendipity').length === before, 'fetched again')
})
await check('word: a misspelling offers its fix in one click', async () => {
  await type('Serendipty')
  expect(await until(async () => (await define()) === 'fix'), `no fix chip: ${await define()}`)
  const chip = await page.evaluate(() => document.querySelector('[data-define="fix"]')?.textContent ?? '')
  expect(chip.replace(/\s+/g, ' ').includes('Did you mean serendipity?'), `chip says: ${chip}`)
  await page.click('[data-define="fix"] button')
  await wait()
  expect((await page.evaluate((s) => document.querySelector(s)?.textContent, EDITOR)) === 'Serendipity', 'not fixed, or its capital lost')
  expect(await until(async () => (await define()) === 'ghost'), 'no meaning after the fix')
})
await check('word: the dictionary down says nothing, and nothing breaks', async () => {
  await type('outage')
  await wait(1500)
  expect(!(await define()), `said something: ${await define()}`)
  expect(!(await beamNow()), 'beam left on')
})
await check('word: a sentence, a timer or a private note is never looked up', async () => {
  const before = hits.length
  await type('buy milk')
  await wait(900)
  await qa.reset()
  await type('5m petrichor')
  await wait(900)
  expect(hits.length === before, `looked up: ${hits.slice(before)}`)
})
await check('word: the sound plays on a click only, fetched by the app', async () => {
  await type('serendipity')
  expect(await until(async () => (await define()) === 'ghost'), 'no ghost')
  expect(sounds === 0, 'played before a click')
  await page.click('[data-define] button[aria-label^="Say"]')
  expect(await until(async () => sounds === 1), 'the sound was not fetched on the click')
})

// --- the beam --------------------------------------------------------------------
await check('beam: a warm sweep when a timer lights', async () => {
  await page.keyboard.type('5m tea', { delay: 15 })
  expect(await beamSeen('warm', 2000), 'no warm beam')
})
await check('beam: none at all with motion off, even while fetching', async () => {
  await page.evaluate(() => (document.documentElement.dataset.motion = 'off'))
  await holdBeam(true)
  expect(await beamSeen('working', 2500), 'no beam element')
  const shown = await page.evaluate(() => getComputedStyle(document.querySelector('.mf-beam')).display)
  expect(shown === 'none', `beam shown with motion off: ${shown}`)
  await holdBeam(false)
  await page.evaluate(() => delete document.documentElement.dataset.motion)
})
await check('beam: cost per frame while it turns (no layout each frame, under 1 ms of work)', async () => {
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Performance.enable')
  // The page's own work over 2s with nothing asking for frames (a frame loop
  // would itself make the page tick the animation), then the frame times.
  const sample = async () => {
    const take = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((m) => [m.name, m.value]))
    const a = await take()
    await wait(2000)
    const b = await take()
    const frames = await page.evaluate(() => new Promise((done) => { const t = []; let last = performance.now(); const end = last + 1000; const tick = (now) => { t.push(now - last); last = now; now < end ? requestAnimationFrame(tick) : done(t) }; requestAnimationFrame(tick) }))
    const sorted = [...frames].sort((x, y) => x - y)
    return { layouts: b.LayoutCount - a.LayoutCount, styles: b.RecalcStyleCount - a.RecalcStyleCount, scriptMs: +((b.ScriptDuration - a.ScriptDuration) * 1000).toFixed(1), taskMs: +((b.TaskDuration - a.TaskDuration) * 1000).toFixed(1), p50: +sorted[Math.floor(sorted.length / 2)].toFixed(2), p95: +sorted[Math.floor(sorted.length * 0.95)].toFixed(2) }
  }
  await holdBeam(true)
  expect(await beamSeen('working', 2500), 'no beam')
  // Once the words have settled (the kind's hint types itself in for a moment after a key).
  await wait(1500)
  await page.addStyleTag({ content: '.mf-beam{display:none!important}' }).then((tag) => tag.evaluate((el) => (el.id = 'qa-nobeam')))
  const without = await sample()
  await page.evaluate(() => document.getElementById('qa-nobeam')?.remove())
  expect(await beamNow() === 'working', 'the fetch ended before the beam was measured')
  const on = await sample()
  await holdBeam(false)
  await wait(1000)
  const off = await sample()
  console.log(`beam cost, 2s idle each (styles and layouts are counts; frames over 1s, ms): turning ${JSON.stringify(on)}  fetching without the beam ${JSON.stringify(without)}  at rest ${JSON.stringify(off)}`)
  // A few style passes come from the page's own timers reading layout while it turns (the toast's 150 ms check): what counts is the work, under a millisecond a frame.
  expect(on.layouts <= without.layouts + 3 && (on.taskMs - without.taskMs) / 120 < 1, `work while turning: ${JSON.stringify(on)} vs ${JSON.stringify(without)}`)
})
await check('beam: rests while the window is put away', async () => {
  await holdBeam(true)
  expect(await beamSeen('working', 2500), 'no beam')
  await page.evaluate(() => window.api.hideWindow())
  await wait(600)
  const hidden = await page.evaluate(() => !!document.querySelector('.mf-beam'))
  await page.evaluate(() => window.api.showPrompt())
  expect(!hidden, 'still drawn while the window is put away')
  expect(await beamSeen('working', 1500), 'not back when the window came back')
  await holdBeam(false)
})

// --- faces -------------------------------------------------------------------------
// A small sepia portrait, drawn here, as a picture file to pick and to paste.
const portrait = async (tone) => Buffer.from(await page.evaluate((tone) => {
  const c = document.createElement('canvas'); c.width = 240; c.height = 300
  const g = c.getContext('2d')
  g.fillStyle = tone; g.fillRect(0, 0, 240, 300)
  g.fillStyle = '#5b4632'; g.beginPath(); g.ellipse(120, 120, 52, 64, 0, 0, Math.PI * 2); g.fill()
  g.beginPath(); g.ellipse(120, 300, 100, 80, 0, 0, Math.PI * 2); g.fill()
  return c.toDataURL('image/png').split(',')[1]
}, tone), 'base64')
const picture = join(process.env.QA_DATA, 'portrait.png')
await check('faces: initials at first, a picture picked by right click, kept once per person', async () => {
  writeFileSync(picture, await portrait('#c9ad86'))
  await type('“You have power over your mind, not outside events.” - Marcus Aurelius')
  expect(await until(() => page.locator('[data-who-avatar] .mf-avatar[data-avatar="initials"]').count()), 'no initials in the who chip')
  expect((await page.locator('[data-who-avatar]').textContent()) === 'MA', 'not MA')
  await page.click('[data-who-avatar]', { button: 'right' })
  const chooser = page.waitForEvent('filechooser')
  await page.getByRole('menuitem', { name: 'Add a picture…' }).click()
  await (await chooser).setFiles(picture)
  expect(await until(() => page.locator('[data-who-avatar] .mf-avatar[data-avatar="picture"] img').count()), 'no picture in the chip')
  const people = await v('people')
  expect(/^mindflow:\/\/assets\/[a-f0-9]{64}\.webp$/.test(people['marcus aurelius']?.avatar ?? ''), `people: ${JSON.stringify(people)}`)
})
await check('faces: a picture pasted into the who field replaces it; another spelling is the same person', async () => {
  const was = (await v('people'))['marcus aurelius']?.avatar
  await type('“Waste no more time arguing what a good man should be.” - marcus  aurelius')
  expect(await until(() => page.locator('[data-who-avatar] .mf-avatar[data-avatar="picture"]').count()), 'the same person had no picture')
  const bytes = (await portrait('#a98b66')).toString('base64')
  await page.evaluate((b64) => {
    const input = document.querySelector('[data-who-avatar]').parentElement.querySelector('input')
    const file = new File([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))], 'face.png', { type: 'image/png' })
    const data = new DataTransfer()
    data.items.add(file)
    input.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }))
  }, bytes)
  expect(await until(async () => (await v('people'))['marcus aurelius']?.avatar !== was), 'paste did not change it')
  await send()
})
await check('faces: in the @ picker’s People group', async () => {
  await type('@Marc')
  expect(await until(() => page.locator('.tiptap-suggestion-popup .mf-avatar img').count()), 'no face in the @ menu')
})
await check('faces: removed from the right-click menu, initials again', async () => {
  await type('“The impediment to action advances action.” - Marcus Aurelius')
  expect(await until(() => page.locator('[data-who-avatar] .mf-avatar[data-avatar="picture"]').count()), `no picture: ${await page.evaluate(() => document.querySelector('[data-who-avatar]')?.outerHTML ?? 'no chip')} ${JSON.stringify(await v('people'))}`)
  await page.click('[data-who-avatar]', { button: 'right' })
  await page.getByRole('menuitem', { name: 'Remove the picture' }).click()
  expect(await until(() => page.locator('[data-who-avatar] .mf-avatar[data-avatar="initials"]').count()), 'not initials again')
  expect(!(await v('people'))['marcus aurelius'], 'still kept')
})

console.log(results.join('\n'))

// --- pictures ----------------------------------------------------------------------
if (process.env.SHOTS) {
  mkdirSync(process.env.SHOTS, { recursive: true })
  const where = SANDBOX ? 'sandbox' : 'fresh'
  await page.evaluate(() => window.api.showPrompt())
  writeFileSync(picture, await portrait('#c9ad86'))
  // A new capture each time (⌘N), so no who or kind is left from the one before.
  const blank = async () => {
    await page.keyboard.press('Meta+n')
    await wait(400)
    await qa.reset()
    await page.evaluate(() => (document.documentElement.dataset.solid = ''))
  }
  for (const theme of ['light', 'github']) {
    const name = theme === 'light' ? 'light' : 'dark'
    await page.evaluate((one) => localStorage.setItem('theme', one), theme)
    await page.reload()
    await page.waitForSelector(EDITOR)
    await wait(1200)
    // A Word's meaning, waiting for Tab.
    await blank()
    await type('Serendipity')
    await until(async () => (await define()) === 'ghost')
    // The window's glide to its new height has landed.
    await wait(1200)
    await page.screenshot({ path: `${process.env.SHOTS}/${where}-word-${name}.png` })
    // A misspelling's fix.
    await blank()
    await type('Serendipty')
    await until(async () => (await define()) === 'fix')
    await page.screenshot({ path: `${process.env.SHOTS}/${where}-fix-${name}.png` })
    // A quote with a face, and the beam caught mid-turn while a meaning is fetched.
    await blank()
    await v('people:set', 'Marcus Aurelius', null)
    await type('“You have power over your mind, not outside events.” - Marcus Aurelius')
    await until(() => page.locator('[data-who-avatar]').count())
    const chooser = page.waitForEvent('filechooser', { timeout: 5000 }).catch(() => null)
    await page.click('[data-who-avatar]')
    await (await chooser)?.setFiles(picture)
    await until(() => page.locator('[data-who-avatar] img').count())
    await page.screenshot({ path: `${process.env.SHOTS}/${where}-face-${name}.png` })
    await blank()
    await holdBeam(true)
    await beamSeen('working', 2500)
    await wait(1500)
    await page.screenshot({ path: `${process.env.SHOTS}/${where}-beam-${name}.png` })
    await holdBeam(false)
    await qa.reset()
  }
  // The practice copy's quotes, signed with faces, in the main window.
  if (SANDBOX) {
    const home = qa.electron.windows().find((w) => w.url().includes('view=home'))
    if (home) {
      // Marcus Aurelius with the portrait (kept from the shots above); Oscar Wilde in initials.
      const quote = (await captures()).find((one) => one.kind === 'quote' && one.attribution === 'Marcus Aurelius')
      await page.evaluate((id) => window.api.openInHome('capture', id), quote?.id)
      await home.waitForTimeout(2000)
      await home.screenshot({ path: `${process.env.SHOTS}/sandbox-quote.png` })
    }
  }
}

if (errors.length) console.log(errors.join('\n'))
if (warnings.length) console.log(`console:\n${[...new Set(warnings)].join('\n')}`)
const child = qa.electron.process()
await qa.close?.()
try { child.kill('SIGKILL') } catch {}
process.exit(results.some((one) => one.startsWith('FAIL')) || errors.length ? 1 : 0)
