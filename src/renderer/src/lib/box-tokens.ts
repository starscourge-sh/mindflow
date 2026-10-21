import type { Editor } from '@tiptap/core'
import { Plugin, PluginKey, type EditorState, type Transaction } from '@tiptap/pm/state'
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'

import type { BlockColor } from '@/extensions/block-color'
import type { Item } from '@/lib/vigil'
import { readTask, readySaid, PRIORITY_NAMES, bucketOf, type Span } from '../../../main/task-words'
import { kindOf } from '../../../main/import'
import { dayKey, dayMonth } from '../../../main/dates'
import { short } from '@/lib/clock'
import * as chrono from 'chrono-node'
import dayjs from 'dayjs'
import { lengthSaid, roundsFrom, timerFrom, type Rounds } from './timer'
import { saidBy } from './welcome-box'
import { clueTarget } from '@/components/vigil/questions-view'
import { TAG_DOES } from '@/components/capture-kinds/kind-fields'
import type { CaptureType } from '@/components/capture-kinds/capture-kind-picker'
import { TAG, tagsIn } from '../../../main/tag-words'
import { clip, cut } from '../../../main/clip'

/**
 * The box reads plain words as commands: "5m tea" is a timer, "+name:" a clue,
 * "tomorrow 5pm" a task's date, "#bug" a task. Each one is lit where it stands
 * as you type, Todoist's way, in the colour of what it will do, and each can be
 * kept as plain text instead: click it, press Backspace straight after it, or
 * its × under the box. Nothing is written into the words; what was kept plain
 * is a list of places held beside them, moved as you type, for this capture
 * only. The send reads the same plan, so what is lit is what happens.
 */

export type TokenKind = 'clue' | 'clue-miss' | 'timer' | 'rounds' | Span['kind'] | 'task-tag' | 'book' | 'bit' | 'signature' | 'link' | 'milestone' | 'milestone-miss'

export type BoxToken = {
  /** Stable while you type: the kind and the words. */
  id: string
  kind: TokenKind
  /** Document positions. */
  from: number
  to: number
  text: string
  color: BlockColor
  /** What it will do, in a few plain words: the line under the box and the hint. */
  effect: string
  /** A date's day ("2026-10-19") and how it is said ("today", "Fri"): a list's lines told apart. */
  day?: { key: string; said: string }
}

export type BoxContext = {
  /** An open capture, not a new one: its words are only words. */
  off: boolean
  kind: CaptureType
  chosen: boolean
  held: Item[]
  actionTags: string[]
}

export type BoxPlan = {
  /** What is lit now, in order. */
  tokens: BoxToken[]
  /** The kind it is sent as. */
  kind: CaptureType
  clue: { name: string; rest: string; question: Item } | null
  /** "+name" that matches nothing: offered as a new question. */
  miss: { name: string } | null
  timer: { ms: number; goal: string } | null
  /** "4x25": pomodoro rounds, not a capture. */
  rounds?: Rounds | null
  url: URL | null
  /** It goes to the task list, and the words in its first line kept plain for that. */
  task: boolean
  taskPlain: { from: number; to: number; text: string }[]
  /** A Todo written as a list: each task line, in order, with the words kept plain in it. */
  listPlain?: { text: string; plain: { from: number; to: number; text: string }[] }[]
  /** Of a list's task lines, how many land on no day. */
  undated?: number
  plainTags: string[]
  /** The quote's "- Name" is read into Who said it and taken off its line. */
  signature: { who: string; where: string } | null
  /** The quote's "- Name" was kept as plain text. */
  signatureKept: boolean
  /** A link already made its card, and nothing else written: sent as that link. */
  card: { pos: number; href: string; title: string; loading: boolean } | null
  /** "!milestone Exam on 3 Dec": that day marked, nothing captured. */
  milestone?: { title: string; day: string } | null
}

type Kept = { kind: TokenKind; from: number; to: number; seq: number }
type State = { kept: Kept[]; plan: BoxPlan; deco: DecorationSet; edits: number; seq: number }
type Meta = { keep?: Kept; rearm?: number; refresh?: true }

const COLOR: Record<TokenKind, BlockColor> = {
  clue: 'purple', 'clue-miss': 'gray', timer: 'yellow', rounds: 'red', date: 'blue', deadline: 'red', repeat: 'purple', priority: 'orange', plan: 'green', notify: 'pink', length: 'gray', snooze: 'gray', ready: 'yellow',
  'task-tag': 'green', book: 'brown', bit: 'gray', signature: 'pink', link: 'blue', milestone: 'orange', 'milestone-miss': 'gray'
}

/**
 * A block's words, and the document position of each character, worked out
 * only for a block that has something lit in it: a long draft pays for its
 * words once a key, not for a map of every letter.
 */
type Block = { pos: number; text: string; at: number[] }
function readBlock(node: ProseMirrorNode, pos: number): Block {
  const parts: string[] = []
  node.forEach((child) => void parts.push(child.isText ? (child.text ?? '') : child.type.name === 'hardBreak' ? '\n' : String(child.attrs.label ?? '')))
  let map: number[] | null = null
  return {
    pos,
    text: parts.join(''),
    get at() {
      if (map) return map
      map = []
      node.forEach((child, offset) => {
        const start = pos + 1 + offset
        const said = child.isText ? (child.text ?? '') : child.type.name === 'hardBreak' ? '\n' : String(child.attrs.label ?? '')
        for (let i = 0; i < said.length; i += 1) map!.push(child.isText ? start + i : start)
      })
      map.push(pos + node.nodeSize - 1)
      return map
    }
  }
}

const blocksOf = (doc: ProseMirrorNode): Block[] => {
  const blocks: Block[] = []
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true
    blocks.push(readBlock(node, pos))
    return false
  })
  return blocks
}

const trimTitle = (title: string): string => clip(title, 36)

/** What keeping a kind of token as words gives up, for the toast: "no timer". */
const DROPPED: Record<TokenKind, string> = {
  clue: 'no clue added', 'clue-miss': 'it will be a capture', timer: 'no timer', rounds: 'no rounds', date: 'no date', deadline: 'no deadline', length: 'no length', snooze: 'not hidden', ready: 'no get-ready day',
  repeat: 'no repeat', priority: 'no priority', plan: 'no plan', notify: 'no reminder', 'task-tag': 'not a task',
  book: 'not a book', bit: 'not private', signature: 'no speaker', link: 'not saved as a link', milestone: 'no day marked', 'milestone-miss': 'no day marked'
}

/** The toast for words kept plain: "“5m” stays as words, no timer". */
export function keptMessage(tokens: Pick<BoxToken, 'kind' | 'text'>[]): string {
  const words = tokens.map((one) => one.text).join(' ')
  const shown = clip(words, 24)
  const lost = [...new Set(tokens.map((one) => DROPPED[one.kind]))].join(', ')
  return `“${shown}” stays as words, ${lost}`
}

/** "!milestone Exam on 3 Dec", "!mark Launch next friday": the name and the day, or null. */
export function markOf(line: string, now = new Date()): { title: string; day: string } | null {
  const said = /^!(?:milestone|mark)\s+(.+)$/i.exec(line.trim())
  if (!said) return null
  const found = chrono.parse(said[1], now, { forwardDate: true })[0]
  if (!found) return null
  const title = (said[1].slice(0, found.index) + said[1].slice(found.index + found.text.length)).replace(/\s+on\s*$/i, '').replace(/^\s*on\s+/i, '').replace(/[\s,:–-]+$/, '').trim()
  return title ? { title: cut(title, 60), day: dayKey(found.start.date()) } : null
}

const TASK_KINDS = new Set<TokenKind>(['date', 'deadline', 'repeat', 'priority', 'plan', 'notify', 'length', 'snooze', 'ready'])

type Read = ReturnType<typeof readTask>
/**
 * A task line as readTask reads it, kept between keys: a list of fifty lines
 * reads only the one that changed. Known by its words, what was kept plain
 * in it, and the minute.
 */
const reads = new Map<string, Read>()
function readCached(text: string, now: Date, plain: { from: number; to: number }[]): Read {
  const id = `${Math.floor(now.getTime() / 60_000)}|${plain.map((one) => `${one.from}-${one.to}`).join(',')}|${text}`
  const got = reads.get(id)
  if (got) return got
  if (reads.size > 400) reads.clear()
  const read = readTask(text, now, plain)
  reads.set(id, read)
  return read
}

/** What each of a task's lit words will do: "For tomorrow 17:00", "Priority: High". */
function effectsOf(read: Read, text: string, now: Date): { kind: Span['kind']; from: number; to: number; effect: string; day?: BoxToken['day'] }[] {
  // "For tomorrow 17:00": a day word mid-sentence, in lower case.
  const when = (iso: string, allDay: boolean): string => short(iso, allDay).replace(/^(Today|Tomorrow)/, (word) => word.toLowerCase())
  const out: ReturnType<typeof effectsOf> = []
  for (const span of read.spans) {
    const words = text.slice(span.from, span.to)
    const effect =
      span.kind === 'date' && read.due ? `For ${when(read.due, read.allDay)}`
      : span.kind === 'deadline' && read.deadline ? `Due by ${when(read.deadline, !read.deadlineTimed)}`
      : span.kind === 'repeat' && /^until\b/i.test(words) && read.until ? `Until ${when(read.until, true)}`
      : span.kind === 'repeat' && read.recurrence ? `Repeat ${read.recurrence.replace(/^every!?\s*/i, 'every ')}${/^every!/i.test(read.recurrence) ? ', counted from when you last did it' : ''}`
      : span.kind === 'priority' ? `Priority: ${PRIORITY_NAMES[read.priority]}`
      : span.kind === 'plan' && read.plan ? `Plan it for ${read.plan.length === 7 && bucketOf(read.plan, now) !== 'month' ? dayjs(`${read.plan}-01`).format('MMMM') : { month: 'this month', year: 'this year', next: 'next year', someday: 'someday' }[bucketOf(read.plan, now) ?? 'someday']}`
      : span.kind === 'notify' && read.notify ? `Remind ${{ pull: 'only when you look', quiet: 'quietly', alerts: 'with an alert' }[read.notify]}`
      : span.kind === 'length' && read.estimate ? `Takes about ${lengthSaid(read.estimate * 60_000)}`
      : span.kind === 'snooze' && read.snooze ? `Hidden until ${when(read.snooze, true)}`
      : span.kind === 'ready' && read.getReady ? `Get ready ${readySaid(read.getReady)}`
      : null
    if (!effect) continue
    const day = span.kind === 'date' && read.due ? { key: dayKey(new Date(read.due)), said: when(read.due, true) } : undefined
    out.push({ kind: span.kind, from: span.from, to: span.to, effect, day })
  }
  return out
}

/**
 * A note's lines with words, as docList reads them (code left out), and
 * whether each is a task's own line or a step indented under the one above.
 */
const LISTS = new Set(['bulletList', 'orderedList', 'taskList'])
function listLines(doc: ProseMirrorNode, blocks: Block[]): { block: Block; start: number; text: string; top: boolean }[] {
  const lines: { block: Block; start: number; text: string; depth: number }[] = []
  for (const block of blocks) {
    const text = block.text.trim()
    if (!text || doc.nodeAt(block.pos)?.type.name === 'codeBlock') continue
    const $at = doc.resolve(block.pos)
    let depth = 0
    for (let d = $at.depth; d > 0; d--) if (LISTS.has($at.node(d).type.name)) depth++
    lines.push({ block, start: block.text.search(/\S/), text, depth })
  }
  const least = Math.min(...lines.map((one) => one.depth))
  return lines.map((one, index) => ({ block: one.block, start: one.start, text: one.text, top: index === 0 || one.depth <= least }))
}

const EMPTY: BoxPlan ={ tokens: [], kind: 'note', clue: null, miss: null, timer: null, url: null, task: false, taskPlain: [], plainTags: [], signature: null, signatureKept: false, card: null }

/** What the box will do with these words, given what was kept plain. */
export function planBox(doc: ProseMirrorNode, ctx: BoxContext, kept: Kept[] = [], now = new Date()): BoxPlan {
  if (ctx.off) return { ...EMPTY, kind: ctx.kind }
  const blocks = blocksOf(doc)
  // The first line with words in it, as the stored note's name is read.
  let line: { block: Block; start: number; text: string } | null = null
  for (const block of blocks) {
    let offset = 0
    for (const part of block.text.split('\n')) {
      if (part.trim()) {
        line = { block, start: offset + part.search(/\S/), text: part.trim() }
        break
      }
      offset += part.length + 1
    }
    if (line) break
  }
  if (!line) {
    // A pasted link that became its card: a link, named after its page.
    const cards: { pos: number; node: ProseMirrorNode }[] = []
    doc.forEach((node, offset) => void (node.type.name === 'bookmark' && cards.push({ pos: offset, node })))
    const only = cards.length === 1 && doc.childCount - cards.length === doc.content.content.filter((one) => one.type.name === 'paragraph' && !one.content.size).length ? cards[0] : null
    if (only && !(ctx.chosen && ctx.kind !== 'note' && ctx.kind !== 'link')) {
      const href = String(only.node.attrs.href)
      try {
        const url = new URL(href)
        return { ...EMPTY, kind: ctx.chosen ? ctx.kind : 'link', url, card: { pos: only.pos, href, title: String(only.node.attrs.title ?? ''), loading: !!only.node.attrs.loading } }
      } catch {
        // Not an address after all: a card like any other.
      }
    }
    return { ...EMPTY, kind: ctx.chosen ? ctx.kind : 'note' }
  }
  const first = line
  const pos = (index: number): number => first.block.at[first.start + index]
  const isKept = (kind: TokenKind | TokenKind[], from: number, to: number): boolean =>
    kept.some((one) => (Array.isArray(kind) ? kind.includes(one.kind) : one.kind === kind) && one.from < to && one.to > from)
  const token = (kind: TokenKind, from: number, to: number, effect: string): BoxToken => {
    const text = doc.textBetween(from, to, '\n', (leaf) => String(leaf.attrs.label ?? ''))
    return { id: `${kind}:${text}`, kind, from, to, text, color: COLOR[kind], effect }
  }

  // "+name: …": a clue for a question, or a log for a goal, and nothing else.
  const plus = clueTarget(first.text, ctx.held)
  let miss: BoxPlan['miss'] = null
  const tokens: BoxToken[] = []
  if (plus) {
    const colon = first.text.indexOf(':')
    const [from, to] = [pos(0), pos(colon >= 0 ? colon + 1 : first.text.length)]
    if (!isKept(['clue', 'clue-miss'], from, to)) {
      if (plus.question) {
        const goal = plus.question.tier === 'goal'
        return {
          ...EMPTY,
          kind: ctx.kind,
          clue: { ...plus, question: plus.question },
          tokens: [token('clue', from, to, `${goal ? 'Log it to' : 'Add a clue to'} “${trimTitle(plus.question.title)}”`)]
        }
      }
      miss = { name: plus.name }
      tokens.push(token('clue-miss', from, to, ctx.held.length ? `No question or goal matches “${trimTitle(plus.name)}”` : 'No questions or goals yet'))
    }
  }

  // "!milestone Exam on 3 Dec" (or !mark): a day marked for something, and nothing else.
  const marked = markOf(first.text, now)
  if (marked) {
    const [from, to] = [pos(0), pos(first.text.length)]
    if (!isKept('milestone', from, to)) return { ...EMPTY, kind: ctx.kind, milestone: marked, tokens: [token('milestone', from, to, `Mark ${dayMonth(`${marked.day}T12:00`)}: ${trimTitle(marked.title)}`)] }
  }
  // "!milestone" that marks nothing: after other words, on a later line, or
  // with no day. Greyed, with what it needs, so it never looks like it worked.
  for (const block of blocks) {
    for (const match of block.text.matchAll(/(?:^|\s)(!(?:milestone|mark))(?=\s|$)/gi)) {
      const index = (match.index ?? 0) + match[0].length - match[1].length
      const [from, to] = [block.at[index], block.at[index + match[1].length]]
      if (marked && block === first.block || isKept('milestone-miss', from, to)) continue
      const atStart = block === first.block && index === first.start
      tokens.push(token('milestone-miss', from, to, atStart ? `${match[1]} needs a name and a day, like “${match[1]} Exam on 3 Dec”` : `${match[1]} works only at the start of the first line`))
    }
  }

  const full = blocks.map((block) => block.text).join('\n').trim()
  const single = doc.childCount === 1

  // A bare address is a link, its site where it came from.
  let url: URL | null = null
  if (/^https?:\/\/\S+$/.test(full) && !(ctx.chosen && ctx.kind !== 'note' && ctx.kind !== 'link')) {
    const [from, to] = [pos(0), pos(first.text.length)]
    if (!isKept('link', from, to)) {
      try {
        url = new URL(full)
        tokens.push(token('link', from, to, `Save as a link from ${url.hostname.replace(/^www\./, '')}`))
      } catch {
        url = null
      }
    }
  }
  const guessed = kindOf(first.text) as CaptureType | null
  // The kind the wording suggests until one is picked; a link kept as plain text is a note.
  let kind: CaptureType = ctx.chosen ? ctx.kind : guessed === 'link' ? (url ? 'link' : 'note') : (guessed ?? 'note')

  // "4x25 essay": pomodoro rounds, not a capture. The same rule as a timer below.
  const rounds = !ctx.chosen && kind !== 'todo' && single ? roundsFrom(full) : null
  if (rounds) {
    const [from, to] = [pos(rounds.span.from), pos(rounds.span.to)]
    if (!isKept('rounds', from, to)) {
      const breaks = `${lengthSaid(rounds.breakMs)} breaks`
      const effect = `${rounds.rounds} ${rounds.rounds === 1 ? 'round' : 'rounds'} of ${lengthSaid(rounds.workMs)}${rounds.rounds > 1 ? `, ${breaks}` : ''}${rounds.rounds >= 4 ? ', a long break after four' : ''}${rounds.goal === 'Focus' ? '' : ` for ${trimTitle(rounds.goal)}`}`
      return { ...EMPTY, kind, rounds, tokens: [token('rounds', from, to, effect)] }
    }
  }

  // "5m tea", "timer 25m": a countdown, not a capture. Not when a kind was
  // picked or it is a todo, nor when the rest has a date, a repeat or a tag.
  const timed = !ctx.chosen && kind !== 'todo' && single ? timerFrom(full) : null
  if (timed) {
    const rest = readTask(timed.goal, now)
    const on = !rest.due && !rest.deadline && !rest.recurrence && !rest.plan && !tagsIn(full).length
    const spans = timed.spans.map((span) => [pos(span.from), pos(span.to)] as const)
    if (on && !spans.some(([from, to]) => isKept('timer', from, to))) {
      const effect = `Start a ${lengthSaid(timed.ms)} timer${timed.goal === 'Timer' ? '' : ` for ${timed.goal}`}`
      return { ...EMPTY, kind, timer: { ms: timed.ms, goal: timed.goal }, tokens: spans.map(([from, to]) => token('timer', from, to, effect)) }
    }
  }

  // The tags that do something: a task, a book, kept private.
  const plainTags: string[] = []
  let tagged = false
  for (const block of blocks) {
    if (!block.text.includes('#')) continue
    for (const match of block.text.matchAll(new RegExp(String.raw`(?:^|\s)(#(${TAG}))`, 'gu'))) {
      const name = match[2].toLowerCase()
      const kindOfTag: TokenKind | null = ctx.actionTags.includes(name) ? 'task-tag' : TAG_DOES[name] ? (name === 'bit' ? 'bit' : 'book') : null
      if (!kindOfTag) continue
      const index = (match.index ?? 0) + match[0].length - match[1].length
      const [from, to] = [block.at[index], block.at[index + match[1].length]]
      if (isKept(kindOfTag, from, to)) {
        plainTags.push(name)
        continue
      }
      // A kind picked by hand is a decision, a tag only a guess: the tag then says so instead of making a task.
      const yours = kindOfTag === 'task-tag' && ctx.chosen && kind !== 'todo'
      if (kindOfTag === 'task-tag' && !yours) tagged = true
      tokens.push(token(kindOfTag, from, to, yours ? `#${name}: kept as ${/^[aeiou]/.test(kind) ? 'an' : 'a'} ${kind}, as you chose` : kindOfTag === 'task-tag' ? `Add to your tasks (#${name})` : kindOfTag === 'bit' ? 'Keep it private' : 'Make it a book: status, rating and takeaway'))
    }
  }
  // A tag kept plain in one place and lit in another still does its work.
  const lit = new Set(tokens.map((one) => one.text.slice(1).toLowerCase()))
  const plainOnly = [...new Set(plainTags)].filter((tag) => !lit.has(tag))

  // A task reads its first line for a day, a repeat, a priority.
  // A tag that files it in your tasks makes it a task, unless a kind was picked by hand.
  if (tagged) kind = 'todo'
  const task = kind === 'todo'
  const taskPlain: BoxPlan['taskPlain'] = []
  let listPlain: BoxPlan['listPlain']
  let undated = 0
  if (task) {
    // A Todo of two lines or more is a task a line, as Create makes it
    // (main/day-lines.ts docList): each task line read for its own day.
    const lines = kind === 'todo' ? listLines(doc, blocks) : []
    const reading = lines.length >= 2 ? lines.filter((one) => one.top) : [{ block: first.block, start: first.start, text: first.text, top: true }]
    if (lines.length >= 2) listPlain = []
    for (const line of reading) {
      const at = (index: number): number => line.block.at[line.start + index]
      const [lineFrom, lineTo] = [at(0), at(line.text.length)]
      // Positions back to places in the line: the ones kept plain, as readTask wants them.
      const offset = (where: number): number => {
        const index = line.block.at.indexOf(where, line.start)
        return index < 0 ? -1 : index - line.start
      }
      const plain: BoxPlan['taskPlain'] = []
      for (const one of kept) {
        if (!TASK_KINDS.has(one.kind) || one.from < lineFrom || one.to > lineTo) continue
        const [from, to] = [offset(one.from), offset(one.to)]
        if (from >= 0 && to > from) plain.push({ from, to, text: line.text.slice(from, to) })
      }
      if (line.block === first.block && line.start === first.start) taskPlain.push(...plain)
      listPlain?.push({ text: line.text, plain })
      const read = readCached(line.text, now, plain)
      if (!read.due && !read.recurrence) undated += 1
      for (const one of effectsOf(read, line.text, now)) tokens.push({ ...token(one.kind, at(one.from), at(one.to), one.effect), ...(one.day && { day: one.day }) })
    }
  }

  // A quote's "- Name": who said it, and the tail taken off its line.
  let signature: BoxPlan['signature'] = null
  let signatureKept = false
  if (kind === 'quote') {
    const by = saidBy(first.text)
    // Where its dash stands, read as saidBy reads it.
    const tail = /[”"']\s*([-–—]\s*[^-–—”"']{2,90}?)\s*$/.exec(first.text)
    const dash = tail ? tail.index + tail[0].indexOf(tail[1]) : -1
    if (by.who && dash >= 0) {
      const [from, to] = [pos(dash), pos(first.text.length)]
      if (isKept('signature', from, to)) signatureKept = true
      else {
        signature = by
        tokens.push(token('signature', from, to, `Said by ${by.who}${by.where ? `, in ${by.where}` : ''}`))
      }
    }
  }

  return { tokens: tokens.sort((a, b) => a.from - b.from), kind, clue: null, miss, timer: null, url, task, taskPlain, ...(listPlain && { listPlain, undated }), plainTags: plainOnly, signature, signatureKept, card: null }
}

// --- the plugin -------------------------------------------------------------

/** Where the draft's kept-plain places wait between sittings, beside the draft itself. */
const KEPT = 'capture-draft-kept'
/** What was kept plain in these words last time, if they are the same words. */
function keptFor(doc: ProseMirrorNode): Kept[] {
  try {
    const saved = JSON.parse(localStorage.getItem(KEPT) ?? 'null') as { text: string; kept: Omit<Kept, 'seq'>[] } | null
    if (!saved || saved.text !== doc.textContent) return []
    return saved.kept.filter((one) => one.from >= 0 && one.to <= doc.content.size && one.from < one.to).map((one) => ({ ...one, seq: 0 }))
  } catch {
    return []
  }
}

const key = new PluginKey<State>('box-tokens')

const paint = (doc: ProseMirrorNode, plan: BoxPlan): DecorationSet =>
  DecorationSet.create(doc, plan.tokens.map((one) => Decoration.inline(one.from, one.to, {
    class: 'box-token',
    'data-box-token': one.kind,
    'data-token-color': one.color,
    'data-token-id': one.id
  })))

/** The plan for the box as it is now: what the send reads. */
export const planNow = (editor: Editor | null | undefined): BoxPlan | null => (editor && !editor.isDestroyed ? (key.getState(editor.state)?.plan ?? null) : null)

/** Keep a lit token as plain text, for this capture. */
export function keepPlain(view: EditorView, token: Pick<BoxToken, 'kind' | 'from' | 'to'>): number {
  const state = key.getState(view.state)
  const seq = (state?.seq ?? 0) + 1
  view.dispatch(view.state.tr.setMeta(key, { keep: { kind: token.kind, from: token.from, to: token.to, seq } } satisfies Meta))
  return seq
}

/** Light it again: the undo of keeping it plain. */
export function rearm(view: EditorView, seq: number): void {
  if (!view.isDestroyed) view.dispatch(view.state.tr.setMeta(key, { rearm: seq } satisfies Meta))
}

/** Read the plan again, after something it reads besides the words changed: the kind, the questions held. */
export function replan(editor: Editor | null | undefined): void {
  if (editor && !editor.isDestroyed) editor.view.dispatch(editor.state.tr.setMeta(key, { refresh: true } satisfies Meta))
}

/** What a plan says, for telling whether it changed: everything but where. */
const said = (plan: BoxPlan): string => JSON.stringify({ ...plan, card: plan.card && [plan.card.href, plan.card.title, plan.card.loading], tokens: plan.tokens.map((one) => [one.id, one.effect]), clue: plan.clue && [plan.clue.question.id, plan.clue.rest], url: plan.url?.href })

export type BoxTokensOptions = {
  context: () => BoxContext
  /** The plan changed in what it says. */
  onPlan: (plan: BoxPlan) => void
  /** A token kept plain by a click or Backspace, with the number that brings it back. */
  onKept: (token: BoxToken, seq: number) => void
  /** The pointer is over a token, or left it. */
  onHover: (hover: { token: BoxToken; rect: DOMRect } | null) => void
}

/** Light the box's command words, and let each be kept as plain text. */
export function boxTokensPlugin({ context, onPlan, onKept, onHover }: BoxTokensOptions): Plugin<State> {
  const make = (doc: ProseMirrorNode, kept: Kept[], edits: number, seq: number): State => {
    const plan = planBox(doc, context(), kept)
    return { kept, plan, deco: paint(doc, plan), edits, seq }
  }
  const hit = (view: EditorView, target: EventTarget | null): BoxToken | null => {
    const chip = (target as Element | null)?.closest?.('.box-token')
    if (!chip || !view.dom.contains(chip)) return null
    const id = chip.getAttribute('data-token-id')
    const at = view.posAtDOM(chip, 0)
    return key.getState(view.state)?.plan.tokens.find((one) => one.id === id && at >= one.from && at <= one.to) ?? null
  }
  return new Plugin<State>({
    key,
    state: {
      init: (_, state) => make(state.doc, context().off ? [] : keptFor(state.doc), 0, 0),
      apply: (tr: Transaction, was: State, _old: EditorState, state: EditorState): State => {
        const meta = tr.getMeta(key) as Meta | undefined
        if (!tr.docChanged && !meta) return was
        let kept = was.kept
        let { edits, seq } = was
        if (tr.docChanged) {
          kept = kept.flatMap((one) => {
            const from = tr.mapping.map(one.from, 1)
            const to = tr.mapping.map(one.to, -1)
            return from < to ? [{ ...one, from, to }] : []
          })
          edits = Math.max(seq, edits) + 1
          seq = edits
        }
        if (meta?.keep) {
          kept = [...kept, meta.keep]
          seq = Math.max(seq, meta.keep.seq)
        }
        if (meta?.rearm !== undefined) kept = kept.filter((one) => one.seq !== meta.rearm)
        return make(state.doc, kept, edits, seq)
      }
    },
    view: (view) => {
      let last = ''
      const tell = (): void => {
        const plan = key.getState(view.state)?.plan
        if (!plan) return
        const now = said(plan)
        if (now === last) return
        last = now
        onPlan(plan)
      }
      tell()
      // Kept with the draft: the same words coming back after a quit or a
      // reload come back with what was kept plain in them.
      let stored = ''
      const keep = (): void => {
        if (context().off) return
        const kept = key.getState(view.state)?.kept ?? []
        const now = JSON.stringify({ text: view.state.doc.textContent, kept: kept.map(({ kind, from, to }) => ({ kind, from, to })) })
        if (now === stored) return
        stored = now
        try {
          if (kept.length) localStorage.setItem(KEPT, now)
          else localStorage.removeItem(KEPT)
        } catch {
          // Storage refused: kept for this sitting only.
        }
      }
      return { update: () => (tell(), keep()), destroy: () => onHover(null) }
    },
    props: {
      decorations: (state) => key.getState(state)?.deco,
      handleKeyDown: (view, event) => {
        const state = key.getState(view.state)
        if (!state) return false
        // ⌘Z straight after keeping one plain lights it again, before any words are undone.
        if (event.key.toLowerCase() === 'z' && (event.metaKey || event.ctrlKey) && !event.shiftKey && !event.altKey) {
          const latest = state.kept.filter((one) => one.seq > state.edits).sort((a, b) => b.seq - a.seq)[0]
          if (!latest) return false
          rearm(view, latest.seq)
          return true
        }
        // Backspace right after a lit token keeps it as plain text; the next one deletes.
        if (event.key !== 'Backspace' || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return false
        if (view.dom.getAttribute('data-vim-mode') === 'normal') return false
        const { empty, from } = view.state.selection
        if (!empty) return false
        const token = state.plan.tokens.find((one) => one.to === from)
        if (!token) return false
        onKept(token, keepPlain(view, token))
        return true
      },
      handleDOMEvents: {
        // Pressed, not clicked: the press would otherwise open a tag or move the caret first.
        mousedown: (view, event) => {
          if (event.button !== 0 || event.altKey || event.metaKey) return false
          const token = hit(view, event.target)
          if (!token) return false
          event.preventDefault()
          onHover(null)
          onKept(token, keepPlain(view, token))
          return true
        },
        mouseover: (view, event) => {
          const chip = (event.target as Element | null)?.closest?.('.box-token')
          const token = hit(view, event.target)
          onHover(token && chip ? { token, rect: chip.getBoundingClientRect() } : null)
          return false
        },
        mouseout: (view, event) => {
          const to = (event.relatedTarget as Element | null)?.closest?.('.box-token')
          if (!to || !view.dom.contains(to)) onHover(null)
          return false
        }
      }
    }
  })
}
