// The first run, walked as a new person: a fresh install (no sandbox), every
// chapter of the welcome, the first note written in it and one caught in the
// real box, the Ready page, and bringing notes in from Obsidian (a copy of a
// few real notes, pointed at by a made-up Obsidian config) and from Apple Notes
// (a made-up export). The real data folder, vault and Notes are never touched.
//   QA_DATA=$(mktemp -d) QA_ENTRY=out-x/main/index.js MINDFLOW_QA_AWAY=1 SHOTS=<dir> VAULT=<copy of a vault> node qa/walk-first.mjs
// No sandbox: QA_ARGS stays empty.
import { mkdirSync, mkdtempSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { sandbox } from './sandbox-lib.mjs'

const SHOTS = process.env.SHOTS ?? mkdtempSync(join(tmpdir(), 'walk-first-'))
mkdirSync(SHOTS, { recursive: true })
const root = mkdtempSync(join(tmpdir(), 'walk-first-src-'))
// A vault: the copy given, or a small made-up one.
let vault = process.env.VAULT
if (!vault) {
  vault = join(root, 'Garden')
  mkdirSync(join(vault, '.obsidian'), { recursive: true })
  mkdirSync(join(vault, 'Daily'), { recursive: true })
  writeFileSync(join(vault, 'Daily', 'Monday.md'), '# Monday\n\nA long walk. #walks\n')
}
writeFileSync(join(root, 'obsidian.json'), JSON.stringify({ vaults: { a: { path: vault, ts: 1, open: true } } }))
process.env.MINDFLOW_OBSIDIAN_CONFIG = join(root, 'obsidian.json')
const notesFile = join(root, 'apple-notes.json')
writeFileSync(notesFile, JSON.stringify({ folders: [{ id: 'f1', name: 'Recipes', notes: [1, 2, 3].map((n) => ({ id: `x-coredata://fake/ICNote/p${n}`, title: `Bread ${n}`, html: `<div><h1>Bread ${n}</h1></div><div>Flour, water, salt, ${n} hours.</div>`, created: '2021-01-01T09:00:00Z', modified: '2021-02-01T09:00:00Z' })) }] }))
process.env.MINDFLOW_QA_APPLE_NOTES = notesFile
process.env.MINDFLOW_QA_APPLE_NOTES_WAIT = '10'

const results = []
const check = (name, ok, detail = '') => (results.push(!!ok), console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${String(detail).slice(0, 300)})` : ''}`))
const c = await sandbox({ width: 1100, height: 760, seeded: false })
const { h, page: box, v, electron } = c
const wait = (ms) => h.waitForTimeout(ms)
const shot = async (name, w = h) => { try { await w.screenshot({ path: `${SHOTS}/${name}.png`, timeout: 15000 }) } catch (e) { console.log('no shot', name, String(e.message).split('\n')[0]) } }
const welcome = () => h.evaluate(() => (document.querySelector('[role="dialog"][aria-modal]')?.innerText ?? '').replace(/\s+/g, ' '))
const chapter = () => h.evaluate(() => document.querySelector('[role="dialog"][aria-modal] footer .sr-only')?.textContent ?? '')
const waitFor = async (test, ms = 15000) => { for (let t = 0; t < ms; t += 200) { const got = await test().catch(() => null); if (got) return got; await wait(200) } return null }
/** Settle a chapter that is playing (any key), then move on (Enter). */
const onward = async () => {
  const was = await chapter()
  await h.keyboard.press('ArrowRight')
  if (await waitFor(async () => (await chapter()) !== was, 1000)) return true
  await h.keyboard.press('ArrowRight')
  return waitFor(async () => (await chapter()) !== was, 5000)
}
const step = async (name, run) => { try { await run() } catch (error) { await shot(`err-first-${name.replace(/\W+/g, '-')}`); check(`${name}: ran`, false, String(error?.message ?? error).split('\n').filter((line) => /intercept|visible|waiting for|Timeout/.test(line)).slice(-3).join(' / ')) } }

try {
  await v('settings:set', { sounds: false })
  await waitFor(async () => (await welcome()).includes('Most notes'), 20000)

  await step('why', async () => {
    check('a fresh install opens on the welcome', (await welcome()).includes('Most notes are written once'))
    await shot('01-why')
    // Esc settles; it never leaves or goes back.
    await h.keyboard.press('Escape')
    await wait(500)
    check('Esc on the first page keeps the welcome up', (await welcome()).includes('Most notes'))
    await onward()
    check('Show me goes to You', (await chapter()).includes('You'), await chapter())
  })

  await step('you', async () => {
    await wait(1200)
    await shot('02-you')
    const mind = h.locator('[role="dialog"] input[placeholder^="A thought"]')
    await mind.click()
    await h.keyboard.type('Ask Mum about the garden 🌱')
    // Enter in a text field moves the cursor on, never past the page.
    await h.keyboard.press('Enter')
    await wait(500)
    check('Enter in “What’s on your mind?” stays on You', (await chapter()).includes('You'), await chapter())
    await h.getByRole('button', { name: 'Study', exact: true }).click()
    await h.getByRole('button', { name: 'Obsidian', exact: true }).click()
    await h.getByRole('button', { name: 'Apple Notes', exact: true }).click()
    await wait(400)
    await shot('02-you-filled')
    // Back and forward again: what was typed is kept.
    await h.locator('[role="dialog"]').focus()
    await onward()
    check('Next goes to Catch', (await chapter()).includes('Catch'), await chapter())
    // A second press inside 400ms of the last is taken as the same press (welcome.tsx, go): a moment between, as a person leaves.
    await wait(600)
    await h.keyboard.press('ArrowLeft')
    await wait(900)
    check('← goes back to You', (await chapter()).includes('You'))
    // Back first shows what your answers made ("shaped for you"), then the answers themselves.
    await shot('02-you-summary')
    await wait(600)
    await h.keyboard.press('ArrowLeft')
    await wait(900)
    check('what was typed in You is kept after Back', (await h.locator('[role="dialog"] input[placeholder^="A thought"]').inputValue().catch(() => '')) === 'Ask Mum about the garden 🌱')
    await h.locator('[role="dialog"]').focus()
    // On through the answers' summary to Catch, one press at a time, as a person reads.
    for (let i = 0; i < 5 && !(await chapter()).includes('Catch'); i++) (await h.keyboard.press('ArrowRight'), await wait(1300))
    check('on through the answers again, to Catch', (await chapter()).includes('Catch'), await chapter())
  })

  await step('catch', async () => {
    // Let it play to its end, then try the real box.
    // Esc settles a chapter that is playing at its end (never a page on), as a person in a hurry would.
    await wait(1500)
    await h.keyboard.press('Escape')
    await waitFor(async () => (await welcome()).includes('Your turn'), 20000)
    await shot('03-catch')
    // A first thought written on You is not quick capture tried: the turn still waits.
    check('Catch ends on “Your turn”, even after a first thought on You', (await welcome()).includes('Your turn'), (await welcome()).slice(-200))
    await h.keyboard.press('Enter')
    await waitFor(() => box.evaluate(() => document.hasFocus()), 5000)
    await wait(800)
    check('Enter on Your turn opens quick capture', (await welcome()).includes('Now write something'))
    await shot('03-catch-open')
    await shot('03-box', box)
    await box.keyboard.type('Rewatch Spirited Away on Saturday at 20:00', { delay: 15 })
    await wait(500)
    await shot('03-box-typed', box)
    await box.keyboard.press('Meta+Enter')
    const kept = await waitFor(async () => (await welcome()).includes('Saved'), 8000)
    check('⌘↵ saves it and the welcome says where it went', !!kept, (await welcome()).slice(-200))
    await shot('03-catch-kept')
    await h.locator('[role="dialog"]').focus()
    await onward()
    check('Next goes to Write', (await chapter()).includes('Write'), await chapter())
  })

  for (const [n, name] of [[4, 'write'], [5, 'remember'], [6, 'yours']]) {
    await step(name, async () => {
      await h.keyboard.press('ArrowRight')
      await wait(1500)
      await shot(`0${n}-${name}`)
      console.log(`  ${name}: ${(await welcome()).slice(0, 400)}`)
      await onward()
    })
  }

  await step('ready', async () => {
    await wait(1500)
    await shot('07-ready')
    const said = await welcome()
    console.log(`  ready: ${said.slice(0, 600)}`)
    check('Ready counts the notes written in the welcome', /Your first (two|2) notes are in it/i.test(said), said.slice(0, 300))
    check('Ready offers the app named before', said.includes('Bring my notes from Obsidian'))
    for (const [w, hh] of [[900, 700], [1600, 1000]]) { await c.size(w, hh); await shot(`07-ready-${w}`) }
    await c.size(1100, 760)
    await h.keyboard.press('3')
    await wait(800)
    await shot('07-ready-import')
    check('3 shows what each thing becomes, on Obsidian', (await welcome()).includes('Choose your vault'), (await welcome()).slice(-300))
    await h.getByRole('button', { name: 'Choose your vault…' }).click()
  })

  await step('obsidian', async () => {
    const picker = await waitFor(() => h.$('[data-vault-picker]'), 8000)
    check('the vault picker lists the vault from Obsidian', !!picker)
    await shot('08-vault-pick')
    await h.locator('[data-vault]').first().click()
    await h.waitForSelector('[data-import-folders="choose"]', { timeout: 8000 })
    await wait(500)
    await shot('08-vault-folders')
    await h.click('[data-folders-bring]')
    await h.waitForSelector('[data-import-done]', { timeout: 60000 })
    await wait(600)
    const done = await h.textContent('[data-import-done]')
    console.log(`  done: ${done}`)
    check('the import says what came in and where', /are in|is in/.test(done), done)
    await shot('08-vault-done')
  })

  await step('obsidian report adds up', async () => {
    const done = await h.textContent('[data-import-done]')
    // A folder of one note is no group: the line says where that one went, so the count adds up.
    const made = Number(/(\d+) notes? (are|is) in/.exec(done)?.[1] ?? 0)
    const said = /marked not yet sorted: (\d+) in .*?, (\d+) on (its|their) own/.exec(done)
    check('the import says where every note went, lone ones too', !said || Number(said[1]) + Number(said[2]) === made, done)
    await h.getByRole('button', { name: 'Done' }).click()
    await wait(600)
  })

  await step('first notes', async () => {
    const rows = await h.evaluate(() => window.api.captures.list())
    const mind = rows.find((one) => one.label.includes('Ask Mum'))
    const caught = rows.find((one) => one.label.includes('Spirited Away'))
    console.log('  first captures:', rows.map((one) => `${one.kind}:${one.label}`).join(' | '))
    check('what was on your mind is the first note, in the Inbox', mind?.status === 'open', mind?.kind)
    // The welcome's own example is "Rewatch Empire…, Dated for you": typed the same way, it is a task.
    const tasks = await v('tasks').catch(() => null)
    console.log('  tasks:', JSON.stringify(tasks)?.slice(0, 300))
    check('“Rewatch … on Saturday at 20:00” is caught as a task, as the welcome showed', caught?.kind === 'todo' || JSON.stringify(tasks ?? '').includes('Spirited Away'), caught?.kind)
    await shot('09-home')
  })

  await step('apple notes', async () => {
    // Getting started's row for the app you came from, or the same sheet from ⌘K.
    const row = h.locator('button:visible:enabled', { hasText: /Bring your notes from/ }).first()
    if (await row.count()) await row.click()
    else await h.evaluate(() => void window.api.importFrom('apple-notes'))
    await wait(800)
    await shot('10-import-sheet')
    const sheet = h.locator('[role="dialog"][aria-label="Bring your notes"]')
    if (await sheet.count()) {
      await sheet.getByRole('tab', { name: 'Apple Notes' }).click()
      await sheet.getByRole('button', { name: 'Choose folders…' }).click()
    }
    await h.waitForSelector('[data-import-folders="ask"], [data-import-folders="choose"]', { timeout: 8000 })
    await shot('10-apple-ask')
    if (await h.$('[data-notes-continue]')) await h.click('[data-notes-continue]')
    await h.waitForSelector('[data-import-folders="choose"]', { timeout: 15000 })
    await h.click('[data-folders-bring]')
    await h.waitForSelector('[data-import-done]', { timeout: 30000 })
    await wait(500)
    const done = await h.textContent('[data-import-done]')
    console.log('  apple done:', done)
    check('Apple Notes: three notes in, said where', /3 notes are in/.test(done) && /Apple Notes \/ Recipes/.test(done), done)
    await shot('10-apple-done')
    await h.getByRole('button', { name: 'Done' }).click()
  })

  await step('files', async () => {
    const md = join(root, 'Reading list.md')
    writeFileSync(md, '# Reading list\n\n- Dune\n- The Left Hand of Darkness\n  - lent by Sam\n')
    await electron.evaluate(({ dialog }, paths) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: paths }) }, [md])
    await h.evaluate(() => void window.api.importFrom('files'))
    const said = await waitFor(async () => { const now = await h.evaluate(() => document.querySelector('[data-import-done]')?.textContent ?? ''); return /Reading list/.test(now) ? now : null }, 20000)
    await wait(600)
    console.log('  files done:', said)
    await shot('11-files-done')
    check('a Markdown file comes in and its card says where', /Reading list/.test(said ?? '') && /Inbox/.test(said ?? ''), said)
  })

  console.log('errors:', c.errors.join(' | ') || 'none')
} finally {
  await c.close()
}
const passed = results.filter(Boolean).length
console.log(`${passed}/${results.length} passed`)
process.exit(passed === results.length ? 0 : 1)
