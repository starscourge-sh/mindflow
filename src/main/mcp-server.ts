import { createServer, type Server } from 'node:http'

/**
 * A read-only MCP server on this Mac, off until it is switched on. Other apps
 * ask over 127.0.0.1 only. Private notes are never returned. Each connection
 * and each read is remembered, so Settings can say who looked and at what.
 */

export const MCP_PORT = 47321

export type McpBook = {
  search: (query: string) => { id: string; title: string }[]
  read: (id: string) => { title: string; text: string } | 'private' | 'missing'
  note: (client: string, what: string) => void
}

type State = { client: string }

const tools = [
  { name: 'search_notes', description: 'Search this book. Private notes are left out.', inputSchema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] } },
  { name: 'read_note', description: 'Read one note by its id. A private note is refused.', inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] } }
]

const text = (value: unknown) => ({ content: [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value) }] })

/** One JSON-RPC message, answered. A notification answers nothing. */
export function mcpAnswer(message: unknown, book: McpBook, state: State): unknown | null {
  const msg = message as { jsonrpc?: string; id?: unknown; method?: string; params?: { name?: string; arguments?: Record<string, unknown>; clientInfo?: { name?: string } } }
  if (!msg || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string')
    return { jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Invalid request' } }
  if (msg.method.startsWith('notifications/')) return null
  const id = msg.id ?? null
  if (msg.method === 'initialize') {
    state.client = String(msg.params?.clientInfo?.name || 'An app')
    book.note(state.client, 'connected')
    return { jsonrpc: '2.0', id, result: { protocolVersion: '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'Haligtree', version: '0.4.0' } } }
  }
  if (msg.method === 'tools/list') return { jsonrpc: '2.0', id, result: { tools } }
  if (msg.method === 'tools/call') {
    const name = msg.params?.name
    const args = msg.params?.arguments ?? {}
    if (name === 'search_notes') {
      const query = String(args.query ?? '')
      const rows = book.search(query)
      book.note(state.client, `searched “${query}”`)
      return { jsonrpc: '2.0', id, result: text(rows) }
    }
    if (name === 'read_note') {
      const noteId = String(args.id ?? '')
      const found = book.read(noteId)
      if (found === 'private') {
        book.note(state.client, 'was refused a private note')
        return { jsonrpc: '2.0', id, result: { ...text('That note is private and was not read.'), isError: true } }
      }
      if (found === 'missing') return { jsonrpc: '2.0', id, error: { code: -32004, message: 'No such note' } }
      book.note(state.client, `read “${found.title}”`)
      return { jsonrpc: '2.0', id, result: text(found) }
    }
    return { jsonrpc: '2.0', id, error: { code: -32601, message: 'No such tool' } }
  }
  return { jsonrpc: '2.0', id, error: { code: -32601, message: 'Method not found' } }
}

let listening: Server | null = null
let failed = ''

export const mcpStatus = (): { on: boolean; port: number; error: string } => ({ on: !!listening, port: MCP_PORT, error: failed })

/** Start listening, or say why it could not. Calling it again while it is up does nothing. */
export function startMcp(book: McpBook): string {
  if (listening) return ''
  failed = ''
  const state: State = { client: 'An app' }
  const server = createServer((req, res) => {
    const host = req.socket.remoteAddress ?? ''
    if (host !== '127.0.0.1' && host !== '::1' && host !== '::ffff:127.0.0.1') {
      res.writeHead(403)
      res.end()
      return
    }
    const chunks: Buffer[] = []
    req.on('data', (chunk) => chunks.push(chunk))
    req.on('end', () => {
      let message: unknown
      try { message = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}') } catch { message = null }
      const answered = mcpAnswer(message, book, state)
      if (answered == null) {
        res.writeHead(202)
        res.end()
        return
      }
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify(answered))
    })
  })
  server.on('error', (error: NodeJS.ErrnoException) => { failed = error.code === 'EADDRINUSE' ? 'That port is already in use.' : (error.message || 'Could not listen.') })
  server.listen(MCP_PORT, '127.0.0.1')
  listening = server
  return ''
}

export function stopMcp(): void {
  listening?.close()
  listening = null
  failed = ''
}
