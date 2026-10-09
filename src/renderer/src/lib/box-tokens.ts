import type { Editor } from '@tiptap/core'
import { Plugin, PluginKey, type EditorState, type Transaction } from '@tiptap/pm/state'
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'

import type { BlockColor } from '@/extensions/block-color'
import type { Item } from '@/lib/vigil'
import { readTask, PRIORITY_NAMES, bucketOf, type Span } from '../../../main/task-words'
import { kindOf } from '../../../main/import'
import { short } from '../../../main/dates'
import { lengthSaid, timerFrom } from './timer'
import { saidBy } from './welcome-box'
import { clueTarget } from '@/components/vigil/questions-view'
import { TAG_DOES } from '@/components/capture-kinds/kind-fields'
import type { CaptureType } from '@/components/capture-kinds/capture-kind-picker'

/**
 * The box reads plain words as commands: "5m tea" is a timer, "+name:" a clue,
 * "tomorrow 5pm" a task's date, "#bug" a task. Each one is lit where it stands
 * as you type, Todoist's way, in the colour of what it will do, and each can be
 * kept as plain text instead: click it, press Backspace straight after it, or
 * its × under the box. Nothing is written into the words; what was kept plain
 * is a list of places held beside them, moved as you type, for this capture
 * only. The send reads the same plan, so what is lit is what happens.
 */

export type TokenKind = 'clue' | 'clue-miss' | 'timer' | Span['kind'] | 'task-tag' | 'book' | 'bit' | 'signature' | 'link'

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
  url: URL | null
  /** It goes to the task list, and the words in its first line kept plain for that. */
  task: boolean
  taskPlain: { from: number; to: number; text: string }[]
  plainTags: string[]
  /** The quote's "- Name" is read into Who said it and taken off its line. */
  signature: { who: string; where: string } | null
  /** The quote's "- Name" was kept as plain text. */
  signatureKept: boolean
}

type Kept = { kind: TokenKind; from: number; to: number; seq: number }
type State = { kept: Kept[]; plan: BoxPlan; deco: DecorationSet; edits: number; seq: number }
type Meta = { keep?: Kept; rearm?: number; refresh?: true }

const COLOR: Record<TokenKind, BlockColor> = {
  clue: 'purple', 'clue-miss': 'gray', timer: 'yellow', date: 'blue', deadline: 'red', repeat: 'purple', priority: 'orange', plan: 'green', notify: 'pink',
  'task-tag': 'green', book: 'brown', bit: 'gray', signature: 'pink', link: 'blue'
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

const trimTitle = (title: string): string => (title.length > 36 ? `${title.slice(0, 36)}…` : title)

const EMPTY: BoxPlan = { tokens: [], kind: 'note', clue: null, miss: null, timer: null, url: null, task: false, taskPlain: [], plainTags: [], signature: null, signatureKept: false }

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
  if (!line) return { ...EMPTY, kind: ctx.chosen ? ctx.kind : 'note' }
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
  const kind: CaptureType = ctx.chosen ? ctx.kind : guessed === 'link' ? (url ? 'link' : 'note') : (guessed ?? 'note')

  // "5m tea", "timer 25m": a countdown, not a capture. Not when a kind was
  // picked or it is a todo, nor when the rest has a date, a repeat or a tag.
  const timed = !ctx.chosen && kind !== 'todo' && single ? timerFrom(full) : null
  if (timed) {
    const rest = readTask(timed.goal, now)
    const on = !rest.due && !rest.deadline && !rest.recurrence && !rest.plan && !/(?:^|\s)#[a-z]/i.test(full)
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
    for (const match of block.text.matchAll(/(?:^|\s)(#([a-z][\w-]*))/gi)) {
      const name = match[2].toLowerCase()
      const kindOfTag: TokenKind | null = ctx.actionTags.includes(name) ? 'task-tag' : TAG_DOES[name] ? (name === 'bit' ? 'bit' : 'book') : null
      if (!kindOfTag) continue
      const index = (match.index ?? 0) + match[0].length - match[1].length
      const [from, to] = [block.at[index], block.at[index + match[1].length]]
      if (isKept(kindOfTag, from, to)) {
        plainTags.push(name)
        continue
      }
      if (kindOfTag === 'task-tag') tagged = true
      tokens.push(token(kindOfTag, from, to, kindOfTag === 'task-tag' ? `Add to your tasks (#${name})` : kindOfTag === 'bit' ? 'Keep it private' : 'Make it a book: status, rating and takeaway'))
    }
  }
  // A tag kept plain in one place and lit in another still does its work.
  const lit = new Set(tokens.map((one) => one.text.slice(1).toLowerCase()))
  const plainOnly = [...new Set(plainTags)].filter((tag) => !lit.has(tag))

  // A task reads its first line for a day, a repeat, a priority.
  const task = kind === 'todo' || tagged
  const taskPlain: BoxPlan['taskPlain'] = []
  if (task) {
    const lineFrom = pos(0)
    const lineTo = pos(first.text.length)
    // Positions back to places in the line: the one kept plain, as readTask wants them.
    const offset = (at: number): number => {
      const index = first.block.at.indexOf(at, first.start)
      return index < 0 ? -1 : index - first.start
    }
    for (const one of kept) {
      if (!['date', 'deadline', 'repeat', 'priority', 'plan', 'notify'].includes(one.kind) || one.from < lineFrom || one.to > lineTo) continue
      const [from, to] = [offset(one.from), offset(one.to)]
      if (from >= 0 && to > from) taskPlain.push({ from, to, text: first.text.slice(from, to) })
    }
    const read = readTask(first.text, now, taskPlain)
    // "For tomorrow 17:00": a day word mid-sentence, in lower case.
    const when = (iso: string, allDay: boolean): string => short(iso, allDay).replace(/^(Today|Tomorrow)/, (word) => word.toLowerCase())
    for (const span of read.spans) {
      const words = first.text.slice(span.from, span.to)
      const effect =
        span.kind === 'date' && read.due ? `For ${when(read.due, read.allDay)}`
        : span.kind === 'deadline' && read.deadline ? `Due by ${when(read.deadline, !read.deadlineTimed)}`
        : span.kind === 'repeat' && /^until\b/i.test(words) && read.until ? `Until ${when(read.until, true)}`
        : span.kind === 'repeat' && read.recurrence ? `Repeat ${read.recurrence.replace(/^every!?\s*/i, 'every ')}`
        : span.kind === 'priority' ? `Priority: ${PRIORITY_NAMES[read.priority]}`
        : span.kind === 'plan' && read.plan ? `Plan it for ${{ month: 'this month', year: 'this year', next: 'later', someday: 'someday' }[bucketOf(read.plan) ?? 'someday']}`
        : span.kind === 'notify' && read.notify ? `Remind ${{ pull: 'only when you look', quiet: 'quietly', alerts: 'with an alert' }[read.notify]}`
        : null
      if (effect) tokens.push(token(span.kind, pos(span.from), pos(span.to), effect))
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

  return { tokens: tokens.sort((a, b) => a.from - b.from), kind, clue: null, miss, timer: null, url, task, taskPlain, plainTags: plainOnly, signature, signatureKept }
}

// --- the plugin -------------------------------------------------------------

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
const said = (plan: BoxPlan): string => JSON.stringify({ ...plan, tokens: plan.tokens.map((one) => [one.id, one.effect]), clue: plan.clue && [plan.clue.question.id, plan.clue.rest], url: plan.url?.href })

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
      init: (_, state) => make(state.doc, [], 0, 0),
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
      return { update: tell, destroy: () => onHover(null) }
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
