// "decide" finds a note that says "decision". "define ephemeral" opens WordNet, on this Mac.
import { sandbox } from './sandbox-lib.mjs'

const SHOTS = process.env.QA_SHOTS
const c = await sandbox({ width: 1280, height: 860 })
const { h, v } = c
const fails = []
const check = (ok, name, got) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : `: ${JSON.stringify(got)}`}`); if (!ok) fails.push(name) }
try {
  await v('settings:set', { sounds: false, hintRate: 0 })
  const id = await h.evaluate(async () => window.api.captures.create({
    kind: 'note',
    title: 'The ruling',
    body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'The decision stood.' }] }] }
  }))
  const found = await h.evaluate(async () => (await window.api.captures.find('decide')).map((one) => one.id))
  check(found.includes(id), 'searching “decide” finds the note that says “decision”', found.slice(0, 8))
  const entry = await v('wordnet:define', 'ephemeral')
  check(entry?.word === 'ephemeral' && entry.senses.some((sense) => /short/i.test(sense.gloss)), 'define ephemeral comes from WordNet', entry?.senses?.[0]?.gloss?.slice(0, 120))
  await h.evaluate(() => window.dispatchEvent(new CustomEvent('haligtree:define', { detail: 'ephemeral' })))
  await h.waitForSelector('[data-wordnet]', { timeout: 8000 })
  const sheet = await h.evaluate(() => ({
    title: document.querySelector('[data-wordnet] h2')?.textContent ?? '',
    text: document.querySelector('[data-wordnet]')?.innerText ?? '',
    notice: (document.querySelector('[data-wordnet]')?.innerText ?? '').includes('Princeton University')
  }))
  check(sheet.title === 'Define ephemeral' && /short/i.test(sheet.text) && sheet.notice, 'the sheet shows the meaning and Princeton’s notice', sheet.title + ' / ' + sheet.text.slice(0, 180))
  if (SHOTS) await c.both(`${SHOTS}/wordnet`)
  await h.click('[data-save-word]')
  await h.waitForTimeout(600)
  const saved = await h.evaluate(async () => {
    const list = await window.api.captures.list()
    const one = [...list].reverse().find((row) => row.kind === 'word' && /ephemeral/i.test(`${row.label} ${row.title}`))
      ?? [...list].reverse().find((row) => row.kind === 'word')
    if (!one) return null
    const fields = await window.api.haligtree('notes:fields', 'captures', one.id)
    const full = await window.api.captures.get(one.id)
    return { label: one.label, title: one.title, body: JSON.stringify(full?.body ?? ''), definition: String(fields.definition ?? '') }
  })
  check(!!saved && /ephemeral/i.test(`${saved.label} ${saved.title} ${saved.body}`) && /short/i.test(saved.definition), 'Save this sense keeps the word and its meaning', saved)
} catch (error) {
  fails.push('threw: ' + error.message.split('\n')[0])
  console.log('threw', error.message.split('\n').slice(0, 8).join(' '))
} finally {
  await c.close()
}
console.log(fails.length ? `FAIL ${fails.length}: ${fails.join('; ')}` : 'PASS wordnet')
process.exit(fails.length ? 1 : 0)
