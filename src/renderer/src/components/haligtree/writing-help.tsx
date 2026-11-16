import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react'
import { createRoot } from 'react-dom/client'
import { AnimatePresence, MotionConfig, motion } from 'motion/react'
import type { Editor } from '@tiptap/core'
import type { Mark } from '@tiptap/pm/model'
import { Plugin, PluginKey, type Transaction } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import { closeHistory } from '@tiptap/pm/history'
import { Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Button as BarButton } from '@/components/tiptap-ui-primitive/button'
import { menuIcon } from '@/components/ui/menu-icon-rules'
import { chime } from '@/lib/sound'
import { call, haligtree } from '@/lib/haligtree'
import { comboOf } from '@/lib/keys'
import { capsNow, meets, useHas } from '@/lib/needs'
import { EASE, keyedMotion, shift, still } from '@/lib/motion'
import { Kbd, refuse, toast, whyFailed } from './ui'
import { Orb } from './orb'
import { BarMenu } from './sub-menu'
import { keep, originOf, placeBy } from './reword'
import { num } from '../../../../main/dates'

/**
 * Writing help on picked words, by Apple Intelligence on this Mac (main/write.ts "ai:help"), only where the Mac has
 * it: one "Writing help" on the selection bar (⌃⌘W) and in the right click on picked words. Nothing is put in unseen:
 * a new wording shows in the note after your own words, yours struck beside it; ↵ uses it (one ⌘Z puts yours back),
 * Esc leaves your words as they were. A card, a question or a quote is shown in the card by the words first and made
 * only with ↵, with a notice and Undo. While the model writes, the orb; a model that fails, is slow or says nothing,
 * a plain line saying which. On a Mac without Apple Intelligence none of it is drawn (What Haligtree can do says what
 * it needs).
 */

export type Help = 'fix' | 'shorter' | 'friendlier' | 'plainer' | 'mine' | 'card' | 'ask' | 'quote'
type Row = { id: Help; label: string; does: string; working: string; /** It changes the words: never on a note locked for reading. */ edits?: true }
/** In the menu's order: the five that reword what you wrote, then the three that keep something from it. */
export const HELPS: Row[] = [
  { id: 'fix', label: 'Fix it', does: 'Spelling, punctuation and dictation slips; your words stay', working: 'Fixing it on this Mac…', edits: true },
  { id: 'shorter', label: 'Shorter', does: 'The same thought, tightened', working: 'Making it shorter on this Mac…', edits: true },
  { id: 'friendlier', label: 'Friendlier', does: 'The same thought, warmer', working: 'Making it friendlier on this Mac…', edits: true },
  { id: 'plainer', label: 'Plainer', does: 'The same thought, in everyday words', working: 'Making it plainer on this Mac…', edits: true },
  { id: 'mine', label: 'In my words', does: 'Retold in your voice, learned from your notes', working: 'Retelling it in your words on this Mac…', edits: true },
  { id: 'card', label: 'Make it a card', does: 'A question and its answer, for Review', working: 'Writing a card on this Mac…' },
  { id: 'ask', label: 'Ask me about this', does: 'A question you hold, to gather clues', working: 'Finding its question on this Mac…' },
  { id: 'quote', label: 'Pull the quote', does: 'The line worth keeping, as a gem', working: 'Finding the line worth keeping on this Mac…' }
]

type Said = { text: string } | { question: string; answer: string } | { error: string }
/**
 * Words picked where they cannot change (a PDF's, a web page's): where they are on screen, and how that reader keeps
 * what is made from them, with its book and page or its article under it, as its own cards and gems are kept.
 */
export type Away = { rect: { left: number; top: number; bottom: number }; where: string; card: (question: string, answer: string) => Promise<string>; gem: (line: string) => Promise<string> }
type Asked = {
  turn: number
  help: Row
  words: string
  said: Said | null
  /** In a note: its editor, and where the words are in it (kept up as the note changes). */
  editor?: Editor
  from: number
  to: number
  /** A pulled quote's line in the note. */
  line?: { from: number; to: number } | null
  /** In a reader instead. */
  away?: Away
}
let asked: Asked | null = null
let turns = 0
const told = new Set<() => void>()
const key = new PluginKey<DecorationSet>('writing-help')

/** The marks on the words: lit while read; then yours struck with the new after them, or the quote lit. */
function marks(state: Asked): Decoration[] {
  const { from, to, said, help, turn } = state
  if (said && 'text' in said && help.edits) {
    const text = said.text
    return [
      Decoration.inline(from, to, { class: 'mf-help-was' }),
      // A fresh element each time it is placed (two editor freezes came from a widget handed a kept one).
      Decoration.widget(to, () => {
        const span = document.createElement('span')
        span.className = 'mf-help-new'
        span.dataset.helpNew = ''
        span.textContent = ` ${text}`
        return span
      }, { side: 1, key: `help-${turn}` })
    ]
  }
  if (state.line) return [Decoration.inline(from, to, { class: 'mf-help-around' }), Decoration.inline(state.line.from, state.line.to, { class: 'mf-help-quote' })]
  return [Decoration.inline(from, to, { class: 'mf-help-reading' })]
}

/** Drawn on the editor it is in; taken off again when it ends. */
const plugin = (): Plugin => new Plugin({
  key,
  state: {
    init: () => DecorationSet.empty,
    apply: (tr, was) => {
      const said = tr.getMeta(key) as Asked | null | undefined
      if (said === undefined) return was.map(tr.mapping, tr.doc)
      return said ? DecorationSet.create(tr.doc, marks(said)) : DecorationSet.empty
    }
  },
  props: { decorations: (state) => key.getState(state) ?? null }
})

/** Whether a change reached the words being helped with (typing right at their end counts: the new words sit there). */
function reached(tr: Transaction, from: number, to: number): boolean {
  let hit = false
  let [a, b] = [from, to]
  for (const map of tr.mapping.maps) {
    map.forEach((start, end) => void (start <= b && end >= a && (hit = true)))
    ;[a, b] = [map.map(a, 1), map.map(b, -1)]
  }
  return hit
}

const follow = ({ editor, transaction }: { editor: Editor; transaction: Transaction }): void => {
  if (!asked || asked.editor !== editor || !transaction.docChanged || transaction.getMeta(key) !== undefined) return
  if (reached(transaction, asked.from, asked.to)) return leave(false)
  asked = { ...asked, from: transaction.mapping.map(asked.from, 1), to: transaction.mapping.map(asked.to, -1) }
}

function set(next: Asked | null): void {
  const was = asked?.editor
  const now = next?.editor
  asked = next
  if (was && was !== now && !was.isDestroyed) {
    was.view.dispatch(was.state.tr.setMeta(key, null).setMeta('addToHistory', false))
    was.off('transaction', follow)
    was.unregisterPlugin(key)
  }
  if (next && now && !now.isDestroyed) {
    if (was !== now) (now.registerPlugin(plugin()), now.on('transaction', follow))
    now.view.dispatch(now.state.tr.setMeta(key, next).setMeta('addToHistory', false))
  }
  told.forEach((tell) => tell())
}

/** Ended, nothing changed: with `back` (Esc, "Keep mine"), the words in a note picked again as they were. */
function leave(back = true): void {
  const was = asked
  if (!was) return
  set(null)
  chime('fold')
  if (back && was.editor && !was.editor.isDestroyed) was.editor.chain().focus().setTextSelection({ from: was.from, to: was.to }).run()
}

/** The note round the words, for "Ask me about this": asked from the picked words and the note they sit in, nothing else. */
const noteText = (editor: Editor, from: number, to: number): string =>
  editor.state.doc.textBetween(Math.max(0, from - 1500), Math.min(editor.state.doc.content.size, to + 1500), '\n')

/** Ask for one help on words picked in a note; shown by them while the model writes. */
export function helpWith(id: Help, editor: Editor, range: { from: number; to: number } = editor.state.selection): void {
  const help = HELPS.find((one) => one.id === id)
  const { from, to } = range
  const words = editor.state.doc.textBetween(from, to, '\n').trim()
  if (!help || !words) return
  if (!meets(capsNow(), 'ai')) return refuse('Writing help needs Apple Intelligence, turned on in System Settings', 'info')
  if (help.edits && !editor.isEditable) return refuse('This note is locked for reading: its words are kept as they are', 'info')
  // The words stay lit by the marks, not the selection: the bar steps away, and ↵ and Esc are the card's.
  editor.chain().focus().setTextSelection(to).run()
  start({ turn: 0, help, editor, from, to, words, said: null }, id === 'ask' ? noteText(editor, from, to) : '')
}

/** The same on words picked in a reader (read-bar.tsx): only the three that keep something, never a change to the words. */
export function helpWords(id: Help, words: string, away: Away): void {
  const help = HELPS.find((one) => one.id === id)
  if (!help || help.edits || !words.trim()) return
  if (!meets(capsNow(), 'ai')) return refuse('Writing help needs Apple Intelligence, turned on in System Settings', 'info')
  start({ turn: 0, help, from: 0, to: 0, words: words.trim(), said: null, away }, '')
}

/** Shown by the words at once, the orb while the model writes, then what it wrote or why not. */
function start(first: Asked, note: string): void {
  mount()
  const turn = ++turns
  set({ ...first, turn })
  chime('open')
  void call<Said>('ai:help', first.help.id, first.words, note)
    .catch((error: unknown) => ({ error: whyFailed(error) }))
    .then((said) => {
      if (asked?.turn !== turn) return
      const line = 'text' in said && first.help.id === 'quote' && asked.editor ? lineAt(asked.editor, asked.from, asked.to, said.text) : undefined
      set({ ...asked, said, line })
      if (!('error' in said)) chime('settled')
    })
}

/** Where a pulled quote's line is, inside the picked words. */
function lineAt(editor: Editor, from: number, to: number, line: string): { from: number; to: number } | null {
  let found: { from: number; to: number } | null = null
  editor.state.doc.nodesBetween(from, to, (node, pos) => {
    if (found || !node.isTextblock) return !found
    const at = node.textContent.indexOf(line)
    if (at >= 0) found = { from: Math.max(from, pos + 1 + at), to: Math.min(to, pos + 1 + at + line.length) }
    return false
  })
  return found
}

/** The marks every piece of the picked words shares (a bold sentence stays bold), for the new words. */
function shared(editor: Editor, from: number, to: number): Mark[] {
  let common: readonly Mark[] | null = null
  editor.state.doc.nodesBetween(from, to, (node) => void (node.isText && (common = common ? common.filter((mark) => mark.isInSet(node.marks)) : node.marks)))
  return [...(common ?? [])]
}

/** ↵: what was asked for, done. */
async function use(): Promise<void> {
  const now = asked
  const said = now?.said
  if (!now || !said || 'error' in said) return leave(false)
  const { editor, from, to, help, words, away } = now
  const origin = editor ? originOf(editor) : {}
  set(null)
  try {
    if ('question' in said) {
      // A study card: in a note as the note's own drafted questions make one (note-questions.tsx); in a reader as its
      // own cards are, with the book and page or the article under it.
      const id = away ? await away.card(said.question, said.answer) : await call<string>('nugget:from', said.answer, { captureId: origin.captureId, passage: words, card: { gem: false } })
      // A reader's own card making plays its sound already: one action, one sound.
      if (!away) (await call('item:save', id, { prompt: said.question, title: said.question }), chime('saved'))
      return toast(away ? 'Card made, in Review, with where its words came from' : 'Card made, in Review: it says which note and line it came from', () => void haligtree.unlift('nugget', id), 'success', undefined, { type: 'nugget', id, title: said.question })
    }
    if (help.id === 'ask') {
      // A question you hold, with these words as its first clue, gathering more as you write.
      const id = await haligtree.newQuestion(said.text)
      await haligtree.addClue(id, away ? `${words} (${away.where})` : words)
      chime('promote')
      return toast('A question you hold now, with these words as its first clue', () => void haligtree.dropQuestion(id), 'success', { label: 'Open', key: 'O', run: () => window.api.openInHome('nugget', id) })
    }
    if (help.id === 'quote' && away) {
      const id = await away.gem(said.text)
      chime('saved')
      return toast('Kept as a gem, with where it came from', () => void haligtree.unlift('nugget', id), 'success', { label: 'Open', key: 'O', run: () => window.api.openInHome('nugget', id) }, { type: 'nugget', id, title: said.text })
    }
  } catch (error) {
    return refuse(`Not made: ${whyFailed(error)}`, 'error')
  }
  if (!editor || editor.isDestroyed) return
  if (help.id === 'quote') {
    // Kept as a gem, as the bar's Gem keeps words: the line marked in the note, with where it came from.
    const line = now.line ?? { from, to }
    return void keep('nugget', said.text, '', origin, null, { editor, from: line.from, to: line.to })
  }
  // The new words in place of yours, in one change: one ⌘Z puts yours back, and typing after it is a change of its own.
  const marks = shared(editor, from, to).map((mark) => mark.toJSON())
  const parts = said.text.split(/\n+/).map((one) => one.trim()).filter(Boolean)
  const text = (line: string): { type: 'text'; text: string; marks: unknown[] } => ({ type: 'text', text: line, marks })
  const content = parts.length > 1 || words.includes('\n') ? parts.map((line) => ({ type: 'paragraph', content: [text(line)] })) : [text(said.text)]
  editor.chain().focus().command(({ tr }) => (closeHistory(tr), true)).insertContentAt({ from, to }, content).run()
  editor.view.dispatch(closeHistory(editor.state.tr))
  chime('noted')
}

// ↵ uses it, Esc (or ⌘Z, before anything was used) leaves it, before the note or the window hears them; ⌃⌘W opens the
// bar's Writing help on picked words.
addEventListener('keydown', (event) => {
  const combo = comboOf(event)
  if (!combo) return
  if (asked) {
    if (combo === 'Esc' || combo === '⌘Z') return (event.preventDefault(), event.stopImmediatePropagation(), leave(combo === 'Esc'))
    if (combo === '↵' && asked.said) return (event.preventDefault(), event.stopImmediatePropagation(), void use())
    return
  }
  if (combo !== '⌃⌘W') return
  const dom = (event.target as HTMLElement | null)?.closest?.('.ProseMirror')
  const editor = dom && (dom as HTMLElement & { editor?: Editor }).editor
  if (!editor || editor.state.selection.empty) return
  event.preventDefault()
  event.stopImmediatePropagation()
  if (!meets(capsNow(), 'ai')) return refuse('Writing help needs Apple Intelligence, turned on in System Settings', 'info')
  dispatchEvent(new CustomEvent(opener(editor)))
}, true)

/** The event that opens one editor's Writing help, so ⌃⌘W opens the bar of the note it was pressed in, not every bar. */
const openers = new WeakMap<Editor, string>()
const opener = (editor: Editor): string => openers.get(editor) ?? (openers.set(editor, `haligtree:writing-help:${crypto.randomUUID()}`), openers.get(editor)!)

// A press anywhere but the card leaves the words as they are.
addEventListener('pointerdown', (event) => {
  if (asked && !(event.target as HTMLElement | null)?.closest?.('[data-writing-help]')) leave(false)
}, true)

/** "Writing help" on the selection bar: the eight, by name, each with its number; nothing at all on a Mac without Apple Intelligence. */
export function WritingHelp({ editor, reading = false }: { editor: Editor; reading?: boolean }): React.JSX.Element | null {
  const has = useHas('ai')
  if (!has) return null
  const rows = HELPS.filter((one) => !reading || !one.edits)
  return (
    <BarMenu label="Writing help" text="Writing help" icon={Sparkles} lit={false} column openOn={opener(editor)}>
      {(close) => <Rows rows={rows} pick={(id) => (close(), helpWith(id, editor))} />}
    </BarMenu>
  )
}

/** The rows, with 1 to 8 picking while they show. */
function Rows({ rows, pick }: { rows: Row[]; pick: (id: Help) => void }): React.JSX.Element {
  useEffect(() => {
    const digit = (event: KeyboardEvent): void => {
      const n = /^Digit([1-9])$/.exec(event.code)
      const one = n && !event.metaKey && !event.ctrlKey && !event.altKey ? rows[Number(n[1]) - 1] : null
      if (!one) return
      event.preventDefault()
      event.stopImmediatePropagation()
      pick(one.id)
    }
    addEventListener('keydown', digit, true)
    return () => removeEventListener('keydown', digit, true)
  })
  return (
    <>
      {rows.map((one, n) => {
        const Icon = menuIcon(one.label)
        return (
          <BarButton key={one.id} type="button" variant="ghost" role="menuitem" tabIndex={-1} className="justify-start" data-help={one.id} onClick={() => pick(one.id)}>
            <Icon className="tiptap-button-icon" />
            <span className="tiptap-button-text">{one.label}</span>
            <Kbd className="ml-auto pl-4">{String(n + 1)}</Kbd>
          </BarButton>
        )
      })}
    </>
  )
}

/** The same eight in the right click on picked words (turn-into/clicked.tsx): none on a Mac without Apple Intelligence. */
export function helpLines(editor: Editor, from: number, to: number): { label: string; hint: string; data: string; run: () => void }[] {
  if (!meets(capsNow(), 'ai')) return []
  return HELPS.filter((one) => !one.edits || editor.isEditable).map((one) => ({ label: one.label, hint: one.does, data: `help-${one.id}`, run: () => helpWith(one.id, editor, { from, to }) }))
}

// --- the card by the words -------------------------------------------------------

const PRIMARY: Partial<Record<Help, string>> = { card: 'Make the card', ask: 'Hold this question', quote: 'Keep as a gem' }

/** By words picked in a reader: under them, or over them when there is no room below, always inside the window. */
function under(rect: Away['rect'], height: number): { left: number; top: number; origin: string } {
  const width = Math.min(360, innerWidth - 24)
  const left = Math.max(12, Math.min(innerWidth - width - 12, rect.left))
  const below = rect.bottom + 8
  const room = below + height <= innerHeight - 12 || rect.top - 8 - height < 12
  return { left, top: Math.max(12, Math.min(innerHeight - height - 12, room ? below : rect.top - 8 - height)), origin: room ? '0px 0px' : '0px 100%' }
}

function Card({ now }: { now: Asked }): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  const [height, setHeight] = useState(120)
  const [, redraw] = useState(0)
  // Measured once drawn, so a card that would run off the bottom opens above the words instead.
  useLayoutEffect(() => {
    const drawn = ref.current?.offsetHeight
    if (drawn && Math.abs(drawn - height) > 1) setHeight(drawn)
  })
  // By the words, it follows them as the note scrolls.
  useEffect(() => {
    const again = (): void => redraw((n) => n + 1)
    addEventListener('scroll', again, true)
    addEventListener('resize', again)
    return () => (removeEventListener('scroll', again, true), removeEventListener('resize', again))
  }, [])
  const spot = now.editor ? placeBy({ editor: now.editor, from: now.from, to: now.to }, height) : now.away ? under(now.away.rect, height) : null
  const { said, help } = now
  const quick = still()
  const count = (text: string): number => text.split(/\s+/).filter(Boolean).length
  return (
    <motion.div
      ref={ref}
      data-writing-help={help.id}
      data-help-state={said ? ('error' in said ? 'error' : 'ready') : 'working'}
      role="dialog"
      aria-label={`Writing help: ${help.label}`}
      {...keyedMotion({ opacity: 0, transform: shift('scale(0.96)') }, { opacity: 1, transform: 'scale(1)' }, { duration: quick ? 0 : 0.16, ease: EASE },
        { opacity: 0, transform: shift('scale(0.97)'), transition: { duration: quick ? 0 : 0.12, ease: EASE } })}
      className="fixed z-[56] flex w-[min(360px,calc(100vw-24px))] flex-col gap-2 rounded-xl border bg-popover p-3 text-popover-foreground shadow-(--mf-panel-shadow)"
      style={{ ...(spot ? { left: spot.left, top: spot.top } : { left: -9999, top: -9999 }), transformOrigin: spot?.origin ?? '0% 0%' }}
    >
      <div className="flex items-center gap-1.5 text-control font-medium text-foreground [&_svg]:size-4 [&_svg]:text-muted-foreground">
        <Sparkles aria-hidden /> {help.label}
        <span className="ml-auto text-meta font-normal text-muted-foreground">Apple Intelligence, on this Mac</span>
      </div>
      {!said && <Orb label={help.working} stop={() => leave()} />}
      {said && 'error' in said && <p data-help-error className="text-body text-foreground">{said.error}.{help.edits ? ' Your words are as they were.' : ''}</p>}
      {said && 'question' in said && (
        <div data-help-card className="flex flex-col gap-1 rounded-lg bg-accent/50 px-2.5 py-2 text-body">
          <span className="text-meta text-muted-foreground">Question</span>
          <span className="font-medium text-foreground">{said.question}</span>
          <span className="mt-1 text-meta text-muted-foreground">Answer</span>
          <span className="text-foreground">{said.answer}</span>
        </div>
      )}
      {said && 'text' in said && help.id === 'ask' && <p data-help-question className="text-body font-medium text-foreground">{said.text}</p>}
      {said && 'text' in said && help.id === 'quote' && (now.away
        ? <p data-help-quote className="font-serif text-body text-foreground">“{said.text}”<span className="mt-1 block font-sans text-meta text-muted-foreground">{now.away.where}</span></p>
        : <p data-help-quote className="text-body text-foreground">Lit in your note: the line worth keeping, as its author wrote it.</p>)}
      {said && 'text' in said && help.edits && <p data-help-new-said className="text-body text-foreground">Shown in your note after your words: {num(count(now.words))} words become {num(count(said.text))}.</p>}
      <div className="flex items-center justify-end gap-1">
        {said && !('error' in said) ? (
          <>
            <Button variant="ghost" size="sm" className="text-muted-foreground" data-help-leave onClick={() => leave()}>
              {help.edits ? 'Keep mine' : 'Not now'} <Kbd className="ml-1">Esc</Kbd>
            </Button>
            <Button size="sm" data-help-use onClick={() => void use()}>
              {PRIMARY[help.id] ?? 'Use this'} <Kbd className="ml-1 border-primary-foreground/30 bg-transparent text-primary-foreground">↵</Kbd>
            </Button>
          </>
        ) : said ? (
          <Button variant="ghost" size="sm" className="text-muted-foreground" data-help-leave onClick={() => leave()}>
            Close <Kbd className="ml-1">Esc</Kbd>
          </Button>
        ) : null}
      </div>
    </motion.div>
  )
}

function Layer(): React.JSX.Element {
  const now = useSyncExternalStore((tell) => (told.add(tell), () => void told.delete(tell)), () => asked)
  return (
    <MotionConfig reducedMotion="user">
      <AnimatePresence>{now && <Card key={now.turn} now={now} />}</AnimatePresence>
    </MotionConfig>
  )
}

let mounted = false
/** Drawn in a layer of its own, the same in every window, as reword's cards are. */
function mount(): void {
  if (mounted) return
  mounted = true
  const root = document.createElement('div')
  root.id = 'haligtree-writing-help'
  document.body.append(root)
  createRoot(root).render(<Layer />)
}
