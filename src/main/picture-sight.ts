import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { ipcMain, powerMonitor } from 'electron'
import helper from '../../resources/labels?asset&asarUnpack'
import { database } from './captures'
import { assetsDir } from './pictures'
import { PICTURE } from './picture-lines'

/**
 * What each kept picture shows and what it looks like, read by the Mac's own Vision (native/labels.swift --sight, in
 * a process of its own, never on this thread): a few of Vision's words for it ("dog", "document", "sky"), which Files
 * filters by, and its feature print, the numbers pictures are compared by, for "More like this" and the near copies
 * gathered for one clean-up. Read a few at a time and only while the person has left the Mac alone for a minute, as
 * the small copies are made (pictures.ts `fill`). Nothing leaves the Mac.
 */

/** A near copy: two pictures this close are the same picture, give or take a cursor, a clock or a crop. */
const NEAR = 0.35
/** "More like this": the closest, up to this many, and none further than this. */
const LIKE = 24
const LIKE_FAR = 0.9
const IDLE = 60
const FEW = 4
const SEEN = /\.(png|jpe?g|webp|heic|gif|tiff?)$/i
/**
 * Vision's words that say nothing a person would look for, or that read wrong on a chip ("adult 12" over a painting):
 * a body's age, sex or bareness, people as a count, and the most generic kinds of thing. Never shown or filtered by.
 */
const UNSAID = new Set(['adult', 'child', 'baby', 'kid', 'teen', 'toddler', 'people', 'person', 'crowd', 'man', 'woman', 'boy', 'girl', 'nude', 'naked', 'nudity', 'bare', 'underwear', 'lingerie', 'swimwear', 'bikini', 'skin', 'body', 'structure', 'material', 'object', 'thing'])
const said = (labels: string[]): string[] => labels.filter((label) => !UNSAID.has(label.toLowerCase()))

type Sight = { labels: string[]; print: Float32Array }
let made = false
const db = (): ReturnType<typeof database> => {
  if (!made) database().exec('create table if not exists picture_sight (name text primary key, labels text not null, print blob, read_at text not null)')
  made = true
  return database()
}
/** Every picture's sight read so far, by file name, kept in memory for the comparisons. */
let known: Map<string, Sight> | null = null
let knownFor = ''
const sights = (): Map<string, Sight> => {
  if (known && knownFor === assetsDir()) return known
  knownFor = assetsDir()
  known = new Map((db().prepare('select name, labels, print from picture_sight').all() as { name: string; labels: string; print: Buffer | null }[])
    .map((row) => [row.name, { labels: JSON.parse(row.labels) as string[], print: row.print ? new Float32Array(row.print.buffer.slice(row.print.byteOffset, row.print.byteOffset + row.print.byteLength)) : new Float32Array() }]))
  return known
}

/** One picture looked at now; null when it could not be (asked again in a later quiet minute). */
function look(name: string): Promise<Sight | null> {
  const path = join(assetsDir(), name)
  if (!existsSync(path)) return Promise.resolve(null)
  return new Promise((done) =>
    execFile(helper, ['--sight', path], { timeout: 60_000, maxBuffer: 8 * 1024 * 1024 }, (error, out) => {
      try {
        const said = (JSON.parse(String(out).trim().split('\n').pop() ?? '') as { sight?: { labels: { name: string }[]; print: number[] } }).sight
        if (error || !said) return done(null)
        const sight = { labels: said.labels.map((one) => one.name), print: Float32Array.from(said.print) }
        db().prepare('insert or replace into picture_sight (name, labels, print, read_at) values (?, ?, ?, ?)').run(name, JSON.stringify(sight.labels), Buffer.from(sight.print.buffer), new Date().toISOString())
        sights().set(name, sight)
        done(sight)
      } catch {
        done(null)
      }
    }))
}

/** The pictures in the store not looked at yet. */
const unseen = async (): Promise<string[]> => (await readdir(assetsDir()).catch(() => [] as string[])).filter((name) => PICTURE.test(name) && SEEN.test(name) && !sights().has(name))

let looking = false
/** A few at a time while the Mac is left alone (`now`: a test's turn, at once). */
async function lookSome(now = false): Promise<number> {
  if (looking) return 0
  looking = true
  let found = 0
  try {
    while (now || powerMonitor.getSystemIdleTime() >= IDLE) {
      const next = (await unseen()).slice(0, FEW)
      if (!next.length) break
      for (const name of next) if (await look(name)) found++
    }
  } finally {
    looking = false
  }
  // Nothing is told: a word for a picture changes no note, and telling every list the book changed would reload Home, the
  // sidebar and the Week page under the person every few seconds while the Mac is idle. Files reads them as it opens.
  return found
}

const distance = (a: Float32Array, b: Float32Array): number => {
  if (!a.length || a.length !== b.length) return Infinity
  let sum = 0
  for (let i = 0; i < a.length; i++) sum += (a[i] - b[i]) ** 2
  return Math.sqrt(sum)
}
const srcOf = (name: string): string => `haligtree://assets/${name}`
const nameOf = (src: unknown): string => String(src ?? '').replace(/^haligtree:\/\/assets\//, '').replace(/\?.*$/, '')

/** Near copies, each group oldest-kept first by file name order as read; only groups of two or more. */
function nearCopies(): string[][] {
  const all = [...sights()].filter(([, one]) => one.print.length)
  const taken = new Set<string>()
  const groups: string[][] = []
  for (const [name, one] of all) {
    if (taken.has(name)) continue
    const group = [name, ...all.filter(([other, two]) => other !== name && !taken.has(other) && distance(one.print, two.print) < NEAR).map(([other]) => other)]
    if (group.length < 2) continue
    for (const each of group) taken.add(each)
    groups.push(group.map(srcOf))
  }
  return groups
}

export function registerPictureSight(): void {
  setInterval(() => void lookSome(), 15_000)
  // Files: every picture's words, and the near copies gathered.
  ipcMain.handle('haligtree:pictures:sight', () => ({ labels: Object.fromEntries([...sights()].map(([name, one]) => [srcOf(name), said(one.labels)])), near: nearCopies() }))
  // "More like this": the closest pictures to this one, closest first.
  ipcMain.handle('haligtree:pictures:like', (_event, src: unknown) => {
    const one = sights().get(nameOf(src))
    if (!one?.print.length) return []
    return [...sights()].filter(([name, other]) => name !== nameOf(src) && other.print.length).map(([name, other]) => ({ src: srcOf(name), far: distance(one.print, other.print) }))
      .filter((each) => each.far < LIKE_FAR).sort((a, b) => a.far - b.far).slice(0, LIKE)
  })
  // For the probes: every unseen picture looked at now, rather than in the next quiet minute.
  if (process.env.HALIGTREE_QA_AWAY) ipcMain.handle('haligtree:pictures:sight-now', () => lookSome(true))
}
