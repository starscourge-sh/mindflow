// A folder of notes brought in whole (into the Inbox) gets each note's kind from the capture box's own guess
// (import.ts `kindOf`, captures.ts `importNote`): a quote, a word, a link; a checklist of several lines stays a note;
// unsure stays a note. Made in a fresh folder of its own, launched on a COPY of the seeded sandbox:
//
//   QA_ARGS=--sandbox QA_DATA=<sandbox copy> QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/folder-import-kinds.mjs
import { DatabaseSync } from 'node:sqlite'
import { mkdtempSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { sandbox } from './sandbox-lib.mjs'
import { checks } from './harness.mjs'
process.env.QA_ARGS ??= '--sandbox'

const { check, done } = checks()
const vault = mkdtempSync(join(process.env.QA_DATA ?? tmpdir(), 'kinds-'))
const notes = {
  'Said once.md': '“The only way out is through.”, Robert Frost',
  'Petrichor.md': 'Petrichor',
  'A site.md': 'https://example.com/an-article',
  'Errands.md': 'Buy milk\n- [ ] eggs\n- [ ] bread',
  'Thinking.md': 'Some thoughts on why the bridge felt longer on the way back than it did going out this morning.'
}
for (const [name, text] of Object.entries(notes)) writeFileSync(join(vault, name), text)
process.env.HALIGTREE_QA_VAULT = vault
const c = await sandbox({ width: 1100, height: 760 })
try {
  const db = () => new DatabaseSync(join(process.env.QA_DATA, 'sandbox', 'haligtree.db'), { readOnly: true })
  let rows = []
  for (let i = 0; i < 60 && rows.length < 5; i++) {
    const one = db()
    rows = one.prepare("select source, kind from captures where source in ('Said once.md', 'Petrichor.md', 'A site.md', 'Errands.md', 'Thinking.md')").all()
    one.close()
    if (rows.length < 5) await c.h.waitForTimeout(500)
  }
  const kind = Object.fromEntries(rows.map((one) => [one.source, one.kind]))
  console.log(JSON.stringify(kind))
  check('all five came in', rows.length === 5, `${rows.length}`)
  check('a quote is a quote', kind['Said once.md'] === 'quote')
  check('one word is a word', kind['Petrichor.md'] === 'word')
  check('a link is a link', kind['A site.md'] === 'link')
  check('a checklist of several lines stays a note', kind['Errands.md'] === 'note')
  check('unsure stays a note', kind['Thinking.md'] === 'note')
} finally {
  await c.close()
}
done()
