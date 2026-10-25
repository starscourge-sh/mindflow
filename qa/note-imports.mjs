// Apple Notes and Obsidian, folder by folder, into Writing's groups, every note
// "not yet sorted" until it is kept, tagged, moved or binned.
//
// Real Notes cannot be driven here: a made-up export (50 notes over 3 folders,
// with pictures, a checklist and a locked note) stands in for it through
// HALIGTREE_QA_APPLE_NOTES. A made-up Obsidian config points at a vault of three
// folders. Neither the real Notes nor the real Obsidian is touched.
//
//   npx electron-vite build --outDir out-imports
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-imports/main/index.js HALIGTREE_QA_AWAY=1 node qa/note-imports.mjs [shots folder]
import { mkdirSync, mkdtempSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { sandbox } from './sandbox-lib.mjs'

const shots = process.argv[2] ?? mkdtempSync(join(tmpdir(), 'note-imports-shots-'))
mkdirSync(shots, { recursive: true })
const root = mkdtempSync(join(tmpdir(), 'note-imports-'))

// --- a made-up Apple Notes: Recipes 20, Trips 18, Work 12 (one of them locked)
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
const day = (n) => new Date(Date.UTC(2021, 0, 1 + n, 9)).toISOString()
const note = (folder, n) => ({
  id: `x-coredata://fake/ICNote/p${folder}${n}`,
  title: `${folder} note ${n + 1}`,
  html: `<div><h1>${folder} note ${n + 1}</h1></div><div>Words of <b>${folder.toLowerCase()}</b> note ${n + 1}, with <a href="https://example.com/${n}">a link</a>.</div>` +
    (n === 0 ? `<ul class="checklist"><li class="checked">Bought flour</li><li class="unchecked">Bake bread</li></ul>` : '') +
    (n % 5 === 1 ? `<div><img src="${PNG}"></div>` : '') +
    (n % 4 === 2 ? '<ul><li>One thing</li><li>Another thing</li></ul>' : ''),
  created: day(n),
  modified: day(n + 30),
  ...(folder === 'Work' && n === 11 ? { locked: true } : {})
})
const folders = [['Recipes', 20], ['Trips', 18], ['Work', 12]].map(([name, count]) => ({ id: `folder-${name}`, name, notes: Array.from({ length: count }, (_, n) => note(name, n)) }))
const notesFile = join(root, 'apple-notes.json')
writeFileSync(notesFile, JSON.stringify({ folders }))
process.env.HALIGTREE_QA_APPLE_NOTES = notesFile
process.env.HALIGTREE_QA_APPLE_NOTES_WAIT = '35'

// --- a made-up Obsidian vault: Daily (3), Projects (4), Archive (2), and one at the top
const vault = join(root, 'Garden')
mkdirSync(join(vault, '.obsidian'), { recursive: true })
for (const [folder, count] of [['Daily', 3], ['Projects', 4], ['Archive', 2]]) {
  mkdirSync(join(vault, folder), { recursive: true })
  for (let n = 0; n < count; n++) writeFileSync(join(vault, folder, `${folder} ${n + 1}.md`), `---\ntags: [${folder.toLowerCase()}]\n---\n# ${folder} ${n + 1}\n\nSome words in ${folder} ${n + 1}.\n`)
}
writeFileSync(join(vault, 'Top note.md'), 'At the top of the vault.\n')
writeFileSync(join(root, 'obsidian.json'), JSON.stringify({ vaults: { a: { path: vault, ts: 1, open: true } } }))
process.env.HALIGTREE_OBSIDIAN_CONFIG = join(root, 'obsidian.json')

const results = []
const check = (name, ok, detail = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`) }

process.env.QA_ARGS ??= '--sandbox'
const c = await sandbox({ width: 1100, height: 760 })
try {
  const { h, v, go, size } = c
  const articles = async () => v('items', 'article')
  const groups = async () => v('groups', 'article')
  const before = (await articles()).length
  const waitFor = async (test, ms = 15000) => { for (let i = 0; i < ms / 200; i++) { const got = await test(); if (got) return got; await h.waitForTimeout(200) } return null }

  // 1. Asking plainly first: what macOS will ask, and that nothing changes.
  await h.evaluate(() => void window.api.importFrom('apple-notes'))
  await h.waitForSelector('[data-import-folders="ask"]', { timeout: 8000 })
  const asking = await h.textContent('[data-notes-ask]')
  check('it says macOS will ask, and that Notes is only read', /macOS will ask once/.test(asking) && /nothing in Notes is changed/.test(asking), asking.slice(0, 120))
  await h.waitForTimeout(400)
  await h.screenshot({ path: join(shots, 'apple-ask.png') })
  await h.click('[data-notes-continue]')
  await h.waitForSelector('[data-import-folders="choose"]', { timeout: 8000 })
  await h.waitForTimeout(400)
  const rows = await h.$$eval('[data-import-folder]', (all) => all.map((one) => one.textContent))
  check('three folders, each with its count', rows.length === 3 && rows[0].includes('20 notes') && rows[1].includes('18 notes') && rows[2].includes('12 notes'), rows.join(' | '))
  const bringing = () => h.getAttribute('[data-folders-bring]', 'data-folders-bring')
  check('every folder chosen to begin with', (await bringing()) === '50', await bringing())
  await h.screenshot({ path: join(shots, 'apple-choose.png') })
  // Space on the cursor's row (wherever the pointer left it) leaves that folder out.
  await h.keyboard.press('Space')
  await h.waitForTimeout(500)
  check('leaving a folder out takes its notes off the count', ['30', '32', '38'].includes(await bringing()), await bringing())
  await h.keyboard.press('Space')
  await h.waitForTimeout(300)

  // 2. Brought in, with progress and the way to stop it.
  await h.click('[data-folders-bring]')
  const chip = await waitFor(() => h.$('[data-import-progress]'), 6000)
  check('progress shows while it comes in', !!chip, chip ? await chip.getAttribute('data-import-progress') : 'none')
  check('the progress chip offers Stop', !!(await h.$('[data-import-stop]')))
  if (chip) await h.screenshot({ path: join(shots, 'apple-progress.png') })
  await h.waitForSelector('[data-import-done]', { timeout: 30000 })
  await h.waitForTimeout(500)
  const done = await h.textContent('[data-import-done]')
  check('the report counts 49 in and the locked one left', done.includes('49 notes are in') && /1 locked note was left in Notes/.test(done), done.slice(0, 300))
  check('the report says where they went', /in Writing, in 3 groups, one for each folder, marked not yet sorted/.test(done), done.slice(0, 400))
  check('the report offers Writing', !!(await h.$('[data-open-writing]')))
  await h.screenshot({ path: join(shots, 'apple-done.png') })

  const all = await articles()
  const fromNotes = all.filter((one) => one.title.match(/^(Recipes|Trips|Work) note/))
  check('49 articles in Writing, all not yet sorted', fromNotes.length === 49 && fromNotes.every((one) => one.unsorted === 1), `${fromNotes.length}, ${before} before`)
  const first = fromNotes.find((one) => one.title === 'Recipes note 1')
  check('created and modified dates kept', first?.createdAt === day(0) && first?.updatedAt === day(30), `${first?.createdAt} ${first?.updatedAt}`)
  const body = await v('imports:body', 'nuggets', first?.id)
  // By now the window has made it the editor's own document: a checklist of two, the link, the bold word.
  const ticks = [...body.matchAll(/"taskItem","attrs":\{"checked":(true|false)\},"content":\[\{"type":"paragraph","content":\[\{"type":"text","text":"([^"]+)"/g)].map((one) => `${one[1]}:${one[2]}`)
  check('the checklist, the link and the words came through', ticks.join() === 'true:Bought flour,false:Bake bread' && body.includes('"href":"https://example.com/0"') && /"text":"recipes","marks":\[\{"type":"bold"/.test(body), ticks.join())
  check('the title line is not said twice', !/Recipes note 1\\n/.test(body.slice(0, 30)))
  const second = await v('imports:body', 'nuggets', fromNotes.find((one) => one.title === 'Recipes note 2')?.id)
  check('the picture is copied into Haligtree', /haligtree:\/\/assets\/[0-9a-f]{64}\.png/.test(second ?? ''), second)
  const named = (await groups()).map((one) => `${one.name}:${one.members.length}`)
  check('a group per folder, named for the folder', ['Recipes:20', 'Trips:18', 'Work:11'].every((one) => named.includes(one)), named.join(', '))

  // 3. Writing shows what is left, by group and in all.
  await h.keyboard.press('Escape')
  await go('articles')
  await h.waitForTimeout(800)
  const pills = await h.$$eval('[data-sort-these]', (all) => all.map((one) => one.getAttribute('data-sort-these')))
  check('each import group shows its count to sort', pills.sort().join() === ['11', '18', '20'].sort().join(), pills.join())
  check('the list header counts every one left', (await h.getAttribute('[data-sort-all]', 'data-sort-all')) === '49')
  for (const [w, hh] of [[900, 700], [1600, 1000]]) {
    await size(w, hh)
    await h.screenshot({ path: join(shots, `writing-${w}.png`) })
    // The pill never covers the group's name, and stays on one line.
    const fits = await h.evaluate(() => [...document.querySelectorAll('[data-sort-these]')].every((pill) => {
      const box = pill.getBoundingClientRect()
      const name = pill.closest('[data-group-block]')?.querySelector('[data-group-row] .truncate')?.getBoundingClientRect()
      return box.height < 30 && (!name || name.right <= box.left + 1)
    }))
    check(`the to-sort pill fits beside the name at ${w}`, fits)
  }
  await size(1100, 760)

  // 4. Sort these: plain Keep, Move and Bin, tag chips; each one sorted, the count going down.
  const trips = (await groups()).find((one) => one.name === 'Trips')
  await h.click(`[data-group-block="${trips.id}"] [data-sort-these]`)
  await h.waitForSelector('[data-sort-bar]', { timeout: 6000 })
  await h.waitForTimeout(600)
  check('the pass opens on the first of 18', (await h.getAttribute('[data-sort-bar]', 'data-sort-bar')) === '18')
  await h.screenshot({ path: join(shots, 'sort-pass.png') })
  // Simple: plain buttons, no keycaps or keys sheet, the note open to write in with the caret in it, its group quiet over it.
  const bar = await h.evaluate(() => ({ caps: document.querySelectorAll('[data-sort-bar] kbd, [data-sort-bar] [data-kbd], .mf-read footer kbd').length, keys: [...document.querySelectorAll('.mf-read button')].some((one) => /Keys/.test(one.textContent)), words: document.querySelector('[data-sort-bar]')?.innerText.replace(/\s+/g, ' '), writing: !!document.activeElement?.closest('.mf-read .ProseMirror'), hint: /to write/.test(document.querySelector('.mf-read')?.innerText ?? ''), group: document.querySelector('[data-sort-group]')?.textContent, out: /Out of/.test(document.querySelector('.mf-read')?.innerText ?? '') }))
  check('the sort bar is plain: "18 left", Keep, Move, Bin, no keycaps', /1\s*8 left/.test(bar.words) && /Keep/.test(bar.words) && /Move/.test(bar.words) && /Bin/.test(bar.words) && !bar.caps && !bar.keys && !bar.hint, JSON.stringify(bar))
  check('the note opens with the caret in it, to write', bar.writing)
  check('its group is a quiet name over the page, no "Out of" line', bar.group === 'Trips' && !bar.out, JSON.stringify(bar))
  check('tag chips offer the tags you use most, with a +', (await h.locator('[data-sort-tag-pick]').count()) > 0 && (await h.locator('[data-sort-tag-button]').count()) === 1)
  await h.keyboard.type(' (written while sorting)')
  await h.waitForTimeout(700)
  const unsortedIn = async (id) => (await articles()).filter((one) => trips.members.includes(one.id) && one.unsorted).length
  await h.click('[data-sort-keep]')
  await h.waitForTimeout(800)
  check('Keep keeps it: one fewer to sort', (await unsortedIn()) === 17 && (await h.getAttribute('[data-sort-bar]', 'data-sort-bar')) === '17')
  const wrote = (await Promise.all(trips.members.map((id) => v('imports:body', 'nuggets', id)))).some((one) => /written while sorting/.test(one ?? ''))
  check('what was written in it while sorting is saved', wrote)
  const pick = await h.getAttribute('[data-sort-tag-pick]', 'data-sort-tag-pick')
  await h.click('[data-sort-tag-pick]')
  await h.waitForTimeout(800)
  const chipBodies = await Promise.all(trips.members.map((id) => v('imports:body', 'nuggets', id)))
  check('a tag chip tags it, which sorts it', (await unsortedIn()) === 16 && chipBodies.some((one) => new RegExp(`#${pick}`).test(one ?? '')), pick)
  await h.click('[data-sort-tag-button]')
  await h.waitForSelector('[data-sort-tag] input', { timeout: 3000 })
  await h.keyboard.type('travel')
  await h.keyboard.press('Space')
  await h.waitForTimeout(800)
  const tagged = (await articles()).filter((one) => trips.members.includes(one.id) && !one.unsorted)
  const tagBody = await Promise.all(tagged.map((one) => v('imports:body', 'nuggets', one.id)))
  check('+ and a typed tag tags it, which sorts it', (await unsortedIn()) === 15 && tagBody.some((one) => /#travel/.test(one ?? '')), `${await unsortedIn()} left; ${tagBody.map((one) => (one ?? '').slice(-90)).join(' | ')}`)
  await h.click('[data-sort-move]')
  await h.waitForSelector('[data-move-out]', { timeout: 3000 })
  await h.screenshot({ path: join(shots, 'sort-move.png') })
  await h.click('[data-move-out]')
  await h.waitForTimeout(800)
  const out = (await articles()).filter((one) => trips.members.includes(one.id) && !one.unsorted).length
  const stillIn = (await groups()).find((one) => one.id === trips.id)?.members.length
  check('Move, No group, takes it out of the group, which sorts it', (await unsortedIn()) === 14 && out === 4 && stillIn === 17, `${stillIn} in the group`)
  await h.click('[data-sort-bin]')
  await h.waitForTimeout(900)
  const binned = (await articles()).filter((one) => trips.members.includes(one.id)).length
  check('Bin puts it in the Bin, and it no longer counts', binned === 17 && (await h.getAttribute('[data-sort-bar]', 'data-sort-bar')) === '13', `${binned} left in Writing`)
  // ⌘Z takes the Bin back, even with the caret in the next note: the note returns, still to sort.
  await h.keyboard.press('Meta+z')
  await h.waitForTimeout(900)
  check('Undo brings it back, to sort again', (await articles()).filter((one) => trips.members.includes(one.id)).length === 18 && (await unsortedIn()) === 14)
  await h.keyboard.press('Escape')
  await h.waitForTimeout(800)
  check('Esc ends the pass, and the pill rolls to what is left', (await h.getAttribute(`[data-group-block="${trips.id}"] [data-sort-these]`, 'data-sort-these')) === '14')
  // Moved by hand out of its group (the row menu's way): sorted too.
  const work = (await groups()).find((one) => one.name === 'Work')
  const layout = { top: [`g:${work.id}`, work.members[0]], groups: { [work.id]: work.members.slice(1) } }
  await v('groups:arrange', 'article', layout)
  check('dragged out of its group by hand, a note is sorted', !(await articles()).find((one) => one.id === work.members[0])?.unsorted)
  // A tag written in by hand sorts it as well.
  const recipes = (await groups()).find((one) => one.name === 'Recipes')
  await v('item:save', recipes.members[3], { body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Sorted by hand #baking' }] }] } })
  check('a tag written in by hand sorts it', !(await articles()).find((one) => one.id === recipes.members[3])?.unsorted)
  // Mark all as sorted, from the group's menu, and Undo.
  await v('imports:sorted', recipes.members, true)
  check('a whole group marked sorted shows no pill', await waitFor(async () => !(await h.$(`[data-group-block="${recipes.id}"] [data-sort-these]`)), 4000))
  await v('imports:sorted', recipes.members, false)

  // 5. Brought in again: nothing twice.
  await h.evaluate(() => void window.api.importFrom('apple-notes'))
  await h.waitForSelector('[data-import-folders="choose"]', { timeout: 8000 })
  check('allowed once, Notes is asked straight away next time', true)
  await h.click('[data-folders-bring]')
  await h.waitForSelector('[data-import-done]', { timeout: 30000 })
  await h.waitForTimeout(400)
  const again = await h.textContent('[data-import-done]')
  check('a second import brings nothing twice', /Nothing new came in/.test(again) && /49 were already here/.test(again), again.slice(0, 200))
  await h.keyboard.press('Escape')

  // 6. Stopped part way: what came in stays, filed the same way.
  folders.push({ id: 'folder-Long', name: 'Long', notes: Array.from({ length: 60 }, (_, n) => note('Long', n)) })
  writeFileSync(notesFile, JSON.stringify({ folders }))
  await h.evaluate(() => void window.api.importFrom('apple-notes'))
  await h.waitForSelector('[data-import-folders="choose"]', { timeout: 8000 })
  // Only the long folder, so the stop lands inside it.
  await h.click('[data-folders-all]')
  await h.click('[data-import-folder="Long"]')
  await h.click('[data-folders-bring]')
  await h.waitForSelector('[data-import-stop]', { timeout: 8000 })
  await h.waitForTimeout(500)
  await h.click('[data-import-stop]')
  await h.waitForSelector('[data-import-done]', { timeout: 15000 })
  await h.waitForTimeout(400)
  const stopped = await h.textContent('[data-import-done]')
  const long = (await articles()).filter((one) => one.title.startsWith('Long note')).length
  check('Stop ends it early and keeps what came in', /Stopped before the end/.test(stopped) && long > 0 && long < 60, `${long} of 60`)
  await h.keyboard.press('Escape')

  // 7. macOS said no: said plainly, with the way to Privacy settings.
  writeFileSync(notesFile, JSON.stringify({ denied: true, folders: [] }))
  await h.evaluate(() => void window.api.importFrom('apple-notes'))
  await h.waitForSelector('[data-notes-refused="denied"]', { timeout: 8000 })
  const no = await h.textContent('[data-notes-refused]')
  check('a refusal is said plainly, with Privacy settings', /macOS said no/.test(no) && /Open Privacy settings/.test(no) && /Try again/.test(no), no.slice(0, 160))
  await h.waitForTimeout(300)
  await h.screenshot({ path: join(shots, 'apple-refused.png') })
  await h.keyboard.press('Escape')
  await h.waitForTimeout(300)

  // 8. Obsidian: the vault, then which folders, each a group in Writing.
  await h.evaluate(() => void window.api.importFrom('vault'))
  await h.waitForSelector('[data-vault-picker]', { timeout: 8000 })
  await h.waitForTimeout(300)
  await h.keyboard.press('Enter')
  await h.waitForSelector('[data-import-folders="choose"]', { timeout: 8000 })
  await h.waitForTimeout(400)
  const vaultRows = await h.$$eval('[data-import-folder]', (all) => all.map((one) => one.textContent))
  check('the vault\'s folders with counts, the top of it first', vaultRows.length === 4 && vaultRows[0].includes('Garden') && vaultRows.some((one) => one.includes('Projects') && one.includes('4 notes')), vaultRows.join(' | '))
  await h.screenshot({ path: join(shots, 'obsidian-choose.png') })
  // Leave Archive out.
  await h.click('[data-import-folder="Archive"]')
  await h.waitForTimeout(300)
  await h.click('[data-folders-bring]')
  await h.waitForSelector('[data-import-done]', { timeout: 30000 })
  await h.waitForTimeout(500)
  const obsidian = await h.textContent('[data-import-done]')
  check('8 notes in, said as in Writing', /8 notes are in/.test(obsidian) && /in Writing/.test(obsidian), obsidian.slice(0, 200))
  const og = (await groups()).filter((one) => ['Daily', 'Projects', 'Archive', 'Garden'].includes(one.name)).map((one) => `${one.name}:${one.members.length}`)
  check('a group per chosen folder; Archive and the lone top note not grouped', og.sort().join() === ['Daily:3', 'Projects:4'].join(), og.join(', '))
  const vaultNotes = (await articles()).filter((one) => /^(Daily|Projects|Archive) \d|^Top note/.test(one.title))
  check('the chosen notes are articles, not yet sorted; Archive stayed out', vaultNotes.length === 8 && vaultNotes.every((one) => one.unsorted === 1) && !vaultNotes.some((one) => one.title.startsWith('Archive')), vaultNotes.map((one) => one.title).join(', '))
  check('no page errors', !c.errors.length, c.errors.join(' | '))

  // Dark, for the look.
  await h.keyboard.press('Escape')
  await c.theme('dark')
  await go('articles')
  await h.waitForTimeout(800)
  await h.screenshot({ path: join(shots, 'writing-dark.png') })
  await h.evaluate(() => void window.api.importFrom('vault'))
  await h.waitForSelector('[data-vault-picker]', { timeout: 8000 })
  await h.keyboard.press('Enter')
  await h.waitForSelector('[data-import-folders="choose"]', { timeout: 8000 })
  await h.waitForTimeout(400)
  await h.screenshot({ path: join(shots, 'obsidian-choose-dark.png') })
} finally {
  await c.close()
}
console.log(`${results.filter(Boolean).length}/${results.length} passed; shots in ${shots}`)
process.exit(results.every(Boolean) ? 0 : 1)
