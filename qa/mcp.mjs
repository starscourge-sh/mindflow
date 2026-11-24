// Other apps can read the book only after the switch is on, and a private note is refused.
import { sandbox } from './sandbox-lib.mjs'

const c = await sandbox({ width: 1100, height: 800 })
const { h, v } = c
const fails = []
const check = (ok, name, got) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : `: ${JSON.stringify(got)}`}`); if (!ok) fails.push(name) }
const post = async (body) => {
  const res = await fetch('http://127.0.0.1:47321/', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  return res.status === 202 ? null : res.json()
}
try {
  await v('settings:set', { sounds: false, hintRate: 0, mcp: false })
  const closed = await fetch('http://127.0.0.1:47321/').then(() => 'open', () => 'closed')
  check(closed === 'closed', 'nothing is listening until the switch is on', closed)
  const openId = await h.evaluate(async () => window.api.captures.create({ kind: 'note', title: 'The ruling', body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'The decision stood.' }] }] } }))
  const secretId = await h.evaluate(async () => window.api.captures.create({ kind: 'note', title: 'A secret', private: true, body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Do not read this.' }] }] } }))
  await v('settings:set', { mcp: true })
  let hello = null
  for (let i = 0; i < 20 && !hello?.result; i++) {
    await h.waitForTimeout(100)
    hello = await post({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { clientInfo: { name: 'Probe' } } }).catch((error) => ({ error: error.message }))
  }
  check(hello?.result?.serverInfo?.name === 'Haligtree', 'an app can connect', hello?.result?.serverInfo)
  const found = await post({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'search_notes', arguments: { query: 'decision' } } })
  check(String(found?.result?.content?.[0]?.text ?? '').includes(openId), 'search returns the open note', found?.result?.content?.[0]?.text?.slice(0, 180))
  const refused = await post({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'read_note', arguments: { id: secretId } } })
  check(refused?.result?.isError === true && /private/.test(refused.result.content[0].text), 'a private note is refused', refused?.result)
  const log = await v('mcp:log')
  check(log.some((row) => row.client === 'Probe' && row.what === 'connected') && log.some((row) => /refused a private note/.test(row.what)), 'Settings can say who connected and that a private note was refused', log)
} catch (error) {
  fails.push('threw: ' + error.message.split('\n')[0])
  console.log('threw', error.message.split('\n').slice(0, 8).join(' '))
} finally {
  await v('settings:set', { mcp: false }).catch(() => {})
  await c.close()
}
console.log(fails.length ? `FAIL ${fails.length}: ${fails.join('; ')}` : 'PASS mcp')
process.exit(fails.length ? 1 : 0)
