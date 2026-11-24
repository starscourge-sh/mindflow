import { readdirSync } from 'fs'
import { readdir, rm, stat } from 'fs/promises'
import { DatabaseSync } from 'node:sqlite'
import { join } from 'path'
import { pathToFileURL } from 'node:url'

/** One day's whole copy of a book, and what it held. */
export type Snapshot = { day: string; notes: number; pages: number; said: string }
const COPY = /^haligtree-(\d{4}-\d{2}-\d{2})\.db$/
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "21 Nov", from a day key. */
export function saidDay(day: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day)
  const month = match?.[2]
  const date = match?.[3]
  return month ? `${Number(date)} ${MONTHS[Number(month) - 1] ?? month}` : day
}

const countOf = (db: DatabaseSync, sql: string): number => {
  try {
    return Number((db.prepare(sql).get() as { n?: number } | undefined)?.n ?? 0)
  } catch {
    return 0
  }
}

/** The daily copies in a backup folder, newest first, each with how many notes and pages it held. */
export function listSnapshots(dir: string): Snapshot[] {
  const names = readdirSyncSafe(dir).filter((name) => COPY.test(name)).sort().reverse()
  const out: Snapshot[] = []
  for (const name of names) {
    const day = COPY.exec(name)![1]
    try {
      const db = openCopy(join(dir, name))
      try {
        const notes = countOf(db, "select count(*) n from captures where status != 'discarded'")
        const pages = countOf(db, "select count(*) n from nuggets where tier = 'article' and binned_at is null")
        const noteWord = notes === 1 ? 'note' : 'notes'
        const pageWord = pages === 1 ? 'page' : 'pages'
        out.push({ day, notes, pages, said: `${saidDay(day)} · ${notes.toLocaleString('en')} ${noteWord}, ${pages.toLocaleString('en')} ${pageWord}` })
      } finally {
        db.close()
      }
    } catch {
      // A copy that cannot be opened is left off the list.
    }
  }
  return out
}

/** A copy opened to look, never to write. */
const openCopy = (file: string): DatabaseSync => new DatabaseSync(`${pathToFileURL(file).href}?immutable=1`, { readOnly: true })

function readdirSyncSafe(dir: string): string[] {
  try {
    return readdirSync(dir)
  } catch {
    return []
  }
}

export type SnapshotRow = { id: string; table: 'captures' | 'nuggets'; title: string }

/** Notes and pages in one copy, titles only, for looking around. */
export function snapshotRows(file: string): SnapshotRow[] {
  const db = openCopy(file)
  try {
    const notes = rowsOf(db, 'captures', "select id, title, body from captures where status != 'discarded' order by captured_at desc limit 40")
    const pages = rowsOf(db, 'nuggets', "select id, title, body from nuggets where tier = 'article' and binned_at is null order by created_at desc limit 20")
    return [...notes, ...pages]
  } finally {
    db.close()
  }
}

function rowsOf(db: DatabaseSync, table: 'captures' | 'nuggets', sql: string): SnapshotRow[] {
  try {
    return (db.prepare(sql).all() as { id: string; title: string | null; body: string | null }[]).map((row) => ({
      id: String(row.id), table, title: (row.title || '').trim() || firstLine(row.body) || 'Untitled'
    }))
  } catch {
    return []
  }
}

/** One note's words from a copy, plain text. */
export function snapshotText(file: string, table: 'captures' | 'nuggets', id: string): { title: string; text: string } | null {
  if (table !== 'captures' && table !== 'nuggets') return null
  const db = openCopy(file)
  try {
    const row = db.prepare(`select title, body from ${table} where id = ?`).get(id) as { title: string | null; body: string | null } | undefined
    if (!row) return null
    return { title: (row.title || '').trim() || firstLine(row.body) || 'Untitled', text: plain(row.body).slice(0, 4000) }
  } catch {
    return null
  } finally {
    db.close()
  }
}

/** The whole row, for bringing one note back into the open book. */
export function snapshotRow(file: string, table: 'captures' | 'nuggets', id: string): Record<string, unknown> | null {
  if (table !== 'captures' && table !== 'nuggets') return null
  const db = openCopy(file)
  try {
    return (db.prepare(`select * from ${table} where id = ?`).get(id) as Record<string, unknown> | undefined) ?? null
  } catch {
    return null
  } finally {
    db.close()
  }
}

function firstLine(body: string | null): string {
  return plain(body).split('\n').map((line) => line.trim()).find(Boolean)?.slice(0, 80) ?? ''
}

/** TipTap JSON or plain text, as words. */
function plain(body: string | null): string {
  if (!body) return ''
  try {
    const doc = JSON.parse(body) as { content?: unknown }
    const parts: string[] = []
    const walk = (node: { type?: string; text?: string; content?: unknown[] }): void => {
      if (typeof node?.text === 'string') parts.push(node.text)
      for (const child of node?.content ?? []) walk(child as { type?: string; text?: string; content?: unknown[] })
      if (node?.type && node.type !== 'doc' && node.type !== 'text') parts.push('\n')
    }
    walk(doc as { type?: string; text?: string; content?: unknown[] })
    if (parts.length) return parts.join('').replace(/[ \t]+\n/g, '\n').replace(/[^\S\n]+/g, ' ').trim()
  } catch { /* already plain */ }
  return body.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

export type DeletedBook = { name: string; day: string | null; bytes: number; folder: string }

/** Folders kept after a book was deleted, with how much space each takes. */
export async function listDeleted(dir: string): Promise<DeletedBook[]> {
  const names = await readdir(dir).catch(() => [] as string[])
  const out: DeletedBook[] = []
  for (const folder of names) {
    if (folder.startsWith('.')) continue
    const path = join(dir, folder)
    const info = await stat(path).catch(() => null)
    if (!info?.isDirectory()) continue
    const day = /(\d{4}-\d{2}-\d{2})/.exec(folder)?.[1] ?? null
    out.push({ name: folder.replace(/\s+\d{4}-\d{2}-\d{2}\s+b-[a-z0-9]+$/i, '').trim() || folder, day, bytes: await bytesOf(path), folder })
  }
  return out.sort((a, b) => (b.day ?? '').localeCompare(a.day ?? ''))
}

async function bytesOf(dir: string): Promise<number> {
  let total = 0
  const names = await readdir(dir).catch(() => [] as string[])
  for (const name of names) {
    const path = join(dir, name)
    const info = await stat(path).catch(() => null)
    if (!info) continue
    total += info.isDirectory() ? await bytesOf(path) : info.size
  }
  return total
}

/** Copies older than `keepDays` go. The date in the folder name is the day it was deleted. */
export async function pruneDeleted(dir: string, keepDays = 30, today = new Date()): Promise<string[]> {
  const gone: string[] = []
  const limit = today.getTime() - keepDays * 86_400_000
  for (const one of await listDeleted(dir)) {
    if (!one.day) continue
    const at = Date.parse(`${one.day}T12:00:00`)
    if (Number.isFinite(at) && at < limit) {
      await rm(join(dir, one.folder), { recursive: true, force: true })
      gone.push(one.folder)
    }
  }
  return gone
}

/** A folder name from the deleted-books list, never a path. */
export function safeFolder(name: string): string | null {
  return typeof name === 'string' && name && !name.includes('/') && !name.includes('\\') && name !== '.' && name !== '..' ? name : null
}
