// How often the link offers under a note are true, on a copy of a real book: for the 60 notes written in most
// recently (with words enough to read), every "Mentions X, a note of yours" the offer card would make and every
// name under "Names N other notes without a link", each printed with the words that name it and the line they
// stand in, to be read and judged by a person. Run on a copy: reading a note marks it as opened.
//   QA_ARGS= QA_DATA=<a copy of a book> QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/offers-rate.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
const { check, done } = checks()
const c = await sandbox({ width: 1200, height: 800, seeded: false })
const { h } = c
try {
  await h.waitForTimeout(2500)
  const out = await h.evaluate(async () => {
    const call = (channel, ...args) => window.api.haligtree(channel, ...args)
    const words = (node) => (node?.type === 'text' ? node.text ?? '' : (node?.content ?? []).map(words).join(node?.type === 'doc' ? '\n' : ''))
    const linked = (node, into = []) => { if (node?.type === 'noteLink') into.push(String(node.attrs?.id ?? '')); for (const one of node?.content ?? []) linked(one, into); return into }
    // Newest first, as the Inbox lists them; nothing in the Bin.
    const all = (await window.api.captures.list()).filter((one) => one.status !== 'discarded')
    const rows = []
    let read = 0
    const took = []
    for (const meta of all) {
      if (read >= 60) break
      const one = await window.api.captures.get(meta.id)
      const body = one?.body
      if (!body) continue
      // A note kept as Markdown (an import) is its own words; one the editor wrote is read block by block.
      const text = typeof body === 'string' ? body : (body.content ?? []).map(words).join('\n')
      if (text.trim().length < 120) continue
      read++
      const asked = performance.now()
      const offers = await call('offers:note', meta.id, text, typeof body === 'string' ? [] : linked(body)).catch(() => null)
      took.push(performance.now() - asked)
      const found = await call('mentions', meta.id).catch(() => null)
      for (const link of offers?.links ?? []) rows.push({ kind: 'offer', note: (one.label ?? '').slice(0, 50), to: link.title, words: link.words, line: (text.split('\n').find((line) => line.toLowerCase().includes(String(link.words).toLowerCase())) ?? '').slice(0, 160) })
      for (const name of found?.named ?? []) rows.push({ kind: 'named', note: (one.label ?? '').slice(0, 50), to: name.title, words: name.words ?? '', line: (name.snippet ?? '').slice(0, 160) })
      for (const tag of offers?.tags ?? []) rows.push({ kind: 'tag', note: (one.label ?? '').slice(0, 50), to: `#${tag.tag}`, words: `${tag.notes} of ${tag.of}`, line: '' })
    }
    // Tags from your own notes, judged by the book itself: 60 tagged notes, each read with its own tags taken out.
    // A tag offered back that it had is right; any other is counted wrong, though the person may like it.
    const TAG = /(^|\s)#([\p{L}\p{Extended_Pictographic}][\p{L}\p{M}\p{N}\p{Extended_Pictographic}_-]*)/gu
    const tagged = { read: 0, made: 0, right: 0, back: 0, rows: [] }
    for (const meta of all) {
      if (tagged.read >= 60) break
      const one = await window.api.captures.get(meta.id)
      const body = one?.body
      if (!body) continue
      const text = typeof body === 'string' ? body : (body.content ?? []).map(words).join('\n')
      const had = [...new Set([...text.matchAll(TAG)].map((hit) => hit[2].toLowerCase()))].filter((tag) => tag !== 'bit')
      if (!had.length || text.trim().length < 120 || one.private) continue
      tagged.read++
      const offers = await call('offers:note', meta.id, text.replace(TAG, '$1'), []).catch(() => null)
      const tags = (offers?.tags ?? []).map((tag) => tag.tag)
      tagged.made += tags.length
      tagged.right += tags.filter((tag) => had.includes(tag)).length
      if (tags.some((tag) => had.includes(tag))) tagged.back++
      for (const tag of tags) tagged.rows.push(`${had.includes(tag) ? 'right' : 'wrong'} | in "${(one.label ?? '').slice(0, 50)}" | offered #${tag} | had ${had.map((one) => `#${one}`).join(' ')}`)
    }
    return { read, total: all.length, rows, tagged, took }
  })
  // The first ask waits for the book's index; the rest are what a note waits for once it is made.
  const rest = out.took.slice(1).sort((a, b) => a - b)
  console.log(`NOTE  the offers for one note: first ${Math.round(out.took[0] ?? 0)} ms (the book indexed), then median ${Math.round(rest[Math.floor(rest.length / 2)] ?? 0)} ms, slowest ${Math.round(rest.at(-1) ?? 0)} ms`)
  console.log(`NOTE  ${out.read} notes read of ${out.total} in the book`)
  for (const one of out.rows) console.log(`OFFER  ${one.kind.padEnd(6)} | in "${one.note}" | to "${one.to}" | words "${one.words}" | ${one.line.replace(/\s+/g, ' ')}`)
  const offers = out.rows.filter((one) => one.kind === 'offer').length
  console.log(`NOTE  ${offers} offers the card would make, ${out.rows.length - offers} names in the lists, over ${out.read} notes`)
  for (const line of out.tagged.rows) console.log(`TAG  ${line}`)
  console.log(`NOTE  tags: ${out.tagged.right} of ${out.tagged.made} offered were tags the note had (${out.tagged.made ? Math.round((100 * out.tagged.right) / out.tagged.made) : 100}%); ${out.tagged.back} of ${out.tagged.read} tagged notes got one of theirs back`)
  check('60 notes of the book were read', out.read === 60, `${out.read}`)
} catch (error) {
  check('the run finished', false, error.message.split('\n').slice(0, 6).join(' ⏎ '))
} finally { await c.close() }
done()
