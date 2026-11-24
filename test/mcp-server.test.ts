// Run with: node --test test/mcp-server.test.ts
// The server is read-only, and a private note is never returned.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mcpAnswer, type McpBook } from '../src/main/mcp-server.ts'

const notes = new Map<string, { title: string; text: string; private?: boolean }>([
  ['open', { title: 'The ruling', text: 'The decision stood.' }],
  ['secret', { title: 'A secret', text: 'Do not read this.', private: true }]
])
const log: string[] = []
const book: McpBook = {
  search: (query) => [...notes.entries()].filter(([, one]) => !one.private && `${one.title} ${one.text}`.toLowerCase().includes(query.toLowerCase())).map(([id, one]) => ({ id, title: one.title })),
  read: (id) => {
    const one = notes.get(id)
    if (!one) return 'missing'
    if (one.private) return 'private'
    return { title: one.title, text: one.text }
  },
  note: (client, what) => log.push(`${client} ${what}`)
}
const state = { client: 'An app' }

test('an app can search and read, and a private note is refused', () => {
  const hello = mcpAnswer({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { clientInfo: { name: 'Claude' } } }, book, state)
  assert.equal((hello as { result: { serverInfo: { name: string } } }).result.serverInfo.name, 'Haligtree')
  assert.equal(log[0], 'Claude connected')
  const found = mcpAnswer({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'search_notes', arguments: { query: 'decision' } } }, book, state) as { result: { content: { text: string }[] } }
  assert.match(found.result.content[0].text, /The ruling/)
  assert.equal(log[1], 'Claude searched “decision”')
  const secret = mcpAnswer({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'read_note', arguments: { id: 'secret' } } }, book, state) as { result: { isError?: boolean; content: { text: string }[] } }
  assert.equal(secret.result.isError, true)
  assert.match(secret.result.content[0].text, /private/)
  assert.equal(log[2], 'Claude was refused a private note')
  const read = mcpAnswer({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'read_note', arguments: { id: 'open' } } }, book, state) as { result: { content: { text: string }[] } }
  assert.match(read.result.content[0].text, /The decision stood/)
  assert.equal(mcpAnswer({ jsonrpc: '2.0', method: 'notifications/initialized' }, book, state), null)
})
