// Anki's picture-hiding notes come in as cards from a picture, not skipped: Anki's own "Image Occlusion" note
// (23.10 and later, one card per cloze number, its covers in the Occlusion field, oi=1 hiding all) and the
// common add-on's "Image Occlusion Enhanced" note (its covers an SVG Question Mask). In Review each shows its
// picture with its covers, the asked one glowing, and Space lifts it off. Built here: sqlite + media + zip.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_SHOTS=dir node qa/anki-occlusion.mjs
import { execFileSync } from 'child_process'
import { writeFileSync, readFileSync, mkdtempSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { DatabaseSync } from 'node:sqlite'
import { zipSync } from 'fflate'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS = ''
const { check, done } = checks()

const dir = mkdtempSync(join(tmpdir(), 'apkg-occlusion-'))
const picture = join(dir, 'cell.png')
execFileSync('swift', [join(import.meta.dirname, 'labelled-diagram.swift'), picture])
const sqlite = join(dir, 'collection.anki2')
const anki = new DatabaseSync(sqlite)
anki.exec(`create table col (id integer primary key, models text, decks text);
  create table notes (id integer primary key, guid text, mid integer, tags text, flds text);
  create table cards (id integer primary key, nid integer, did integer, ord integer, queue integer);
  create table revlog (id integer primary key, cid integer, ease integer, ivl integer, time integer, type integer);`)
anki.prepare('insert into col values (1, ?, ?)').run(
  JSON.stringify({
    20: { name: 'Image Occlusion', type: 1, flds: ['Occlusion', 'Image', 'Header', 'Back Extra', 'Comments'].map((name, ord) => ({ name, ord })), tmpls: [{ ord: 0, qfmt: '{{cloze:Occlusion}}', afmt: '{{cloze:Occlusion}}' }] },
    21: { name: 'Image Occlusion Enhanced', type: 0, flds: ['ID (hidden)', 'Header', 'Image', 'Question Mask', 'Footer', 'Remarks', 'Sources', 'Extra 1', 'Extra 2', 'Answer Mask', 'Original Mask'].map((name, ord) => ({ name, ord })), tmpls: [{ ord: 0, qfmt: '{{Image}}{{Question Mask}}', afmt: '{{Image}}{{Answer Mask}}' }] }
  }),
  JSON.stringify({ 1: { name: 'Default' }, 2: { name: 'Cell parts' } }))
const t0 = Date.now() - 5 * 86400000
// The diagram's labels as Vision finds them (qa/labelled-diagram.swift): Nucleus, Ribosome, Vacuole.
const occlusion = [
  '{{c1::image-occlusion:rect:left=.745:top=.205:width=.105:height=.05:oi=1}}',
  '{{c2::image-occlusion:ellipse:left=.735:top=.425:rx=.07:ry=.03:oi=1}}',
  '{{c3::image-occlusion:polygon:points=.04,.80 .15,.80 .15,.86 .04,.86:oi=1}}'
].join('<br>')
anki.prepare('insert into notes values (?, ?, 20, ?, ?)').run(t0, 'io1', '', [occlusion, '<img src="cell.png">', 'Parts of a cell', 'A plant cell', ''].join('\x1f'))
for (const ord of [0, 1, 2]) anki.prepare('insert into cards values (?, ?, 2, ?, 0)').run(200 + ord, t0, ord)
// The add-on's note: one card, Cytoplasm asked, every other label covered too (hide all).
const mask = '<svg width="2400" height="1600" xmlns="http://www.w3.org/2000/svg"><g><title>Masks</title><rect class="qshape" x="110" y="930" width="300" height="70" fill="#FF7E7E"/><rect class="shape" x="110" y="250" width="420" height="70" fill="#FFEBA2"/></g></svg>'
anki.prepare('insert into notes values (?, ?, 21, ?, ?)').run(t0 + 1, 'io2', '', ['id1', 'Cell parts', '<img src="cell.png">', '<img src="mask-q.svg">', '', 'The jelly of the cell', '', '', '', '', ''].join('\x1f'))
anki.prepare('insert into cards values (300, ?, 2, 0, 0)').run(t0 + 1)
anki.close()
const file = join(dir, 'Cells.apkg')
writeFileSync(file, zipSync({ 'collection.anki2': readFileSync(sqlite), media: Buffer.from(JSON.stringify({ 0: 'cell.png', 1: 'mask-q.svg' })), 0: readFileSync(picture), 1: Buffer.from(mask) }))

const c = await sandbox({ width: 1200, height: 900, seeded: false })
const { h, electron } = c
const shots = process.env.QA_SHOTS
const waitFor = async (test, ms = 10000) => { for (const end = Date.now() + ms; Date.now() < end; await h.waitForTimeout(150)) if (await test().catch(() => false)) return true; return false }
const pictured = () => h.evaluate(async () => (await window.api.haligtree('items', 'deck')).filter((one) => /"occlusion"/.test(one.fields ?? '')).map((one) => ({ prompt: one.prompt, occlusion: JSON.parse(one.fields).occlusion })))
try {
  await h.evaluate(() => window.api.haligtree('onboarding:set', { welcomed: new Date().toISOString() }))
  await h.reload()
  await h.waitForTimeout(1500)
  await electron.evaluate(async ({ dialog, Menu }, path) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] })
    const find = (menu, label = '') => { for (const one of menu?.items ?? []) { if (/^Files/.test(one.label) && /import/i.test(label)) return one; const deep = find(one.submenu, one.label); if (deep) return deep } return null }
    find(Menu.getApplicationMenu())?.click()
  }, file)
  // A sheet may ask first (keep reviews, hold a big deck): it is taken as it comes.
  if (await waitFor(() => h.evaluate(() => !!document.querySelector('[data-apkg-go]')), 4000)) await h.evaluate(() => document.querySelector('[data-apkg-go]')?.click())
  check('four picture cards came in, none skipped', await waitFor(async () => (await pictured()).length === 4), JSON.stringify((await pictured()).length))
  const all = await pictured()
  const own = all.filter((one) => one.occlusion.covers.length === 3)
  check("Anki's own note: a card per cloze number, each asking its own, every cover kept, hide all", own.length === 3 && new Set(own.map((one) => one.occlusion.ask)).size === 3 && own.every((one) => one.occlusion.hide === 'all'), JSON.stringify(own.map((one) => [one.occlusion.ask, one.occlusion.hide])))
  check('its rect, ellipse and polygon become a box, an oval and a free shape', JSON.stringify(own[0]?.occlusion.covers.map((one) => one.kind)) === '["box","oval","shape"]', JSON.stringify(own[0]?.occlusion.covers))
  const addOn = all.find((one) => one.occlusion.covers.length === 2)
  const asked = addOn?.occlusion.covers.find((one) => one.group === addOn.occlusion.ask)
  check("the add-on's note: its mask read as shares of the picture, the asked shape and the other kept", !!asked && Math.abs(asked.x - 110 / 2400) < 0.001 && Math.abs(asked.h - 70 / 1600) < 0.001 && addOn.occlusion.hide === 'all', JSON.stringify(addOn?.occlusion))
  check('each keeps the picture in the book', all.every((one) => /^haligtree:\/\/assets\/[a-f0-9]{64}\.png$/.test(one.occlusion.src)))
  await h.keyboard.press('Escape')
  await c.go('home')
  await c.go('review')
  await waitFor(() => h.evaluate(() => !!document.querySelector('[data-study-now]')))
  await h.evaluate(() => document.querySelector('[data-study-now]').click())
  check('in Review an imported one shows its picture with its covers, one asked', await waitFor(() => h.evaluate(() => !!document.querySelector('[data-picture-face="asked"] [data-cover="asked"]'))))
  if (shots) await c.both(join(shots, 'anki-occlusion-asked'))
  await h.keyboard.press('Space')
  check('Space lifts the asked cover off', await waitFor(() => h.evaluate(() => !!document.querySelector('[data-picture-face="shown"] [data-cover="asked"][data-cover-off]'))))
  if (shots) await c.both(join(shots, 'anki-occlusion-shown'))
} catch (error) {
  check('ran', false, String(error?.message ?? error).split('\n')[0])
} finally {
  check('no page errors', !c.errors.length, c.errors.slice(0, 3).join(' | '))
  await c.close()
  rmSync(dir, { recursive: true, force: true })
  done()
}
