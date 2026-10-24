// "Keep a Markdown copy": a folder chosen once gets every note as its own .md
// file, kept up to date a few seconds after a change: a new note appears, a
// renamed one moves to its new name (the old file goes), a binned one goes,
// and a file the app did not write is never touched. A folder that already
// holds other things gets "Haligtree notes" inside it instead. Stopping
// leaves the files where they are.
//   QA_DATA=$(mktemp -d) QA_ENTRY=out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/markdown-copy.mjs (it runs in the sandbox)
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'

const { check, done } = checks()
process.env.QA_ARGS = '--sandbox'
const c = await sandbox({ width: 1200, height: 860 })
const { h, electron, errors, close } = c
const doc = (text) => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] })
const md = (dir) => (existsSync(dir) ? readdirSync(dir).filter((one) => one.endsWith('.md')).sort() : [])
const until = async (test, ms = 12000) => { for (let at = 0; at < ms && !test(); at += 250) await h.waitForTimeout(250); return test() }
const pick = (folder) => electron.evaluate(({ dialog }, folder) => void (dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [folder] })), folder)
try {
  // A folder with someone's own things in it: the notes go in a folder of their own inside.
  const vault = mkdtempSync(join(tmpdir(), 'haligtree-copy-'))
  writeFileSync(join(vault, 'Mine.md'), 'my own file')
  const id = await h.evaluate((body) => window.api.captures.create({ body }), doc('Fear is the mind-killer'))
  await pick(vault)
  const status = await h.evaluate(() => window.api.haligtree('markdown-copy:choose'))
  const folder = join(vault, 'Haligtree sandbox notes')
  check('a folder with other things in it gets a notes folder of its own inside it', status.folder === folder, JSON.stringify(status))
  check('the notes are written at once', await until(() => md(folder).includes('Fear is the mind-killer.md')), JSON.stringify(md(folder)))
  check('each with what is known up top', readFileSync(join(folder, 'Fear is the mind-killer.md'), 'utf8').startsWith('---\n'))
  // A new note appears a few seconds after.
  await h.evaluate((body) => window.api.captures.create({ body }), doc('The rest is silence'))
  check('a new note appears a few seconds later', await until(() => md(folder).includes('The rest is silence.md')), JSON.stringify(md(folder)))
  // Renamed: the old file goes, the new one comes.
  await h.evaluate(([id, body]) => window.api.captures.save(id, { body }), [id, doc('Fear is the little death')])
  check('a renamed note moves to its new name', await until(() => md(folder).includes('Fear is the little death.md') && !md(folder).includes('Fear is the mind-killer.md')), JSON.stringify(md(folder)))
  // Binned: it goes.
  await h.evaluate((id) => window.api.captures.save(id, { status: 'discarded' }), id)
  check('a note moved to the Bin goes from the copy', await until(() => !md(folder).includes('Fear is the little death.md')), JSON.stringify(md(folder)))
  check('the file that was there first is never touched', readFileSync(join(vault, 'Mine.md'), 'utf8') === 'my own file')
  // Where and how fresh, as Settings says it.
  const now = await h.evaluate(() => window.api.haligtree('markdown-copy'))
  check('the copy knows where it is kept, how many notes and when', now.folder === folder && now.count > 0 && !!now.at && !now.failing, JSON.stringify(now))
  // Stopped: the files stay, and no longer change.
  await h.evaluate(() => window.api.haligtree('markdown-copy:stop'))
  const left = md(folder)
  await h.evaluate((body) => window.api.captures.create({ body }), doc('Written after stopping'))
  await h.waitForTimeout(7000)
  check('stopped, the files stay and no longer change', JSON.stringify(md(folder)) === JSON.stringify(left) && left.length > 0, JSON.stringify(md(folder)))
  check('no page errors', errors.length === 0, errors.join(' | '))
} finally {
  await close()
}
done()
