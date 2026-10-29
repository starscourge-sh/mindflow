// A Raindrop export with highlights comes in whole: each link keeps its card, its highlights as quotes under it
// (without a copied search answer's "+2" and "·source" lines) and its folder as a #tag; importing the same file
// again adds nothing twice. Imported through File's own "Import files", on a copy of a real export.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/bookmark-highlights.mjs [export.html]
import { copyFileSync, writeFileSync, mkdtempSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'
const { check, done } = checks()
const dir = mkdtempSync(join(tmpdir(), 'raindrop-'))
const file = join(dir, 'highlights.html')
if (process.argv[2]) copyFileSync(process.argv[2], file)
else writeFileSync(file, `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<DL><p>
<DT><H3>Unsorted</H3>
<DL><p>
<DT><A HREF="https://example.org/screwtape" ADD_DATE="1791995205" TAGS="">Screwtape letters</A>
<DD><blockquote COLOR="yellow">The main point is the gradual slope.
Prodigal Catholic
 +2
·Great Books In 10 Minutes</blockquote>
<DD><blockquote COLOR="yellow">Hell relies on distraction.</blockquote>
</DL><p>
<DT><H3>tools</H3>
<DL><p>
<DT><A HREF="https://example.org/tool" ADD_DATE="1791995205" TAGS="">A tool</A>
</DL><p>
</DL><p>`)
const c = await sandbox({ width: 1200, height: 800 })
const { h, electron } = c
const importOnce = () => electron.evaluate(async ({ dialog, Menu }, path) => {
  dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] })
  const find = (menu, label = '') => { for (const one of menu?.items ?? []) { if (one.label === 'Files…' && /import/i.test(label)) return one; const deep = find(one.submenu, one.label); if (deep) return deep } return null }
  find(Menu.getApplicationMenu())?.click()
}, file)
const links = () => h.evaluate(async () => Promise.all((await window.api.captures.list()).filter((one) => one.kind === 'link').map(async (one) => ({ title: one.title, body: JSON.stringify((await window.api.captures.get(one.id))?.body ?? '') }))))
try {
  const before = (await links()).length
  await importOnce(); await h.waitForTimeout(3000)
  const after = await links()
  const fresh = after.slice(0, after.length - before)
  console.log(`${after.length - before} links came in`)
  check('the links came in', after.length > before, `${after.length - before}`)
  const quoted = after.filter((one) => one.body.includes('"blockquote"'))
  check('highlights come as quotes under their link', quoted.length > 0, `${quoted.length} links with quotes`)
  check('with no "+2" or "·source" lines left from a copied search answer', !quoted.some((one) => /"text":"\+\d+"|"text":"·/.test(one.body)), quoted.map((one) => one.title).join(', '))
  check('a highlighted link is a card', quoted.every((one) => one.body.includes('"bookmark"')))
  if (!process.argv[2]) check('a folder becomes its #tag; Unsorted does not', after.some((one) => one.title === 'A tool' && one.body.includes('#tools')) && !after.some((one) => one.body.includes('#unsorted')))
  await importOnce(); await h.waitForTimeout(3000)
  const twice = await links()
  check('importing the same file again adds nothing twice', twice.length === after.length && JSON.stringify(twice) === JSON.stringify(after), `${twice.length} vs ${after.length}`)
  void fresh
} catch (error) {
  check('the run finished', false, error.message.split('\n')[0])
} finally {
  await c.close()
}
done()
