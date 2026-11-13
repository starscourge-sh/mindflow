import { useEffect, useSyncExternalStore } from 'react'
import type { Editor } from '@tiptap/core'
import { chime } from '@/lib/sound'
import { call, haligtree } from '@/lib/haligtree'
import { frontPane, usePane } from '@/lib/split'
import { openNoteIn } from '@/lib/notes'
import { capsNow, meets } from '@/lib/needs'
import { Orb } from './orb'
import { CloseBeside, toast, refuse, whyFailed } from './ui'
import { DraftFoot, DraftList, type CardDraft } from './card-drafts'
import { draftFromWords, draftQuestions, type QuestionDraft } from '../../../../main/note-questions'
import { cutWords } from '../../../../main/study-ai'
import { num, plural } from '../../../../main/dates'

/**
 * Study questions from a note: drafted from its own headings, definitions,
 * lists and bold words (every Mac), phrased better by Apple Intelligence where
 * the Mac has it and each answer still stands in the note. Shown in the one
 * keep / change / drop list the reader's "Five cards from a chapter" uses
 * (card-drafts.tsx), docked where the note's Details open; none is a card
 * until it is kept, and a kept one says in Review which note and line it came from.
 */

type Draft = QuestionDraft & CardDraft & { id?: string }
type Asked = {
  note: string
  /** What made them: the note's shape, Apple Intelligence, or the note's shape because the model could not. */
  by: 'note' | 'ai' | 'fallback'
  drafts: Draft[] | null
  /** Picked words: one question, from them. */
  picked: boolean
  /** Which asking this is: a new one brings the list into view. */
  turn: number
  /** How many of them Apple Intelligence phrased (the rest are the note's own). */
  phrased: number
}
let turns = 0

// One list a pane ('' outside the panes), as the note open in each is.
const asked = new Map<string, Asked>()
const told = new Set<() => void>()
const tell = (): void => told.forEach((one) => one())
const put = (pane: string, next: Asked | null): void => void ((next ? asked.set(pane, next) : asked.delete(pane)), tell())
// Another note opened in the pane: its list was for the note before, so it goes (the same note again keeps it).
if (typeof window !== 'undefined') window.addEventListener('haligtree:note-open', () => {
  for (const [pane, one] of asked) {
    const now = openNoteIn(pane)
    if (now && now.id !== one.note) put(pane, null)
  }
})

/** The note's editor in a pane, as TipTap keeps it on its own page element. */
const editorIn = (pane: string): Editor | null =>
  ((pane ? document.querySelector(`[data-pane="${pane}"]`) : document)?.querySelector<HTMLElement & { editor?: Editor }>('.tiptap.ProseMirror')?.editor ?? null)

/** main/understand.ts "ai:phrase": none on a Mac without Apple Intelligence or with it off in Settings. */
type Phrased = { drafts: QuestionDraft[]; phrased: number } | { error: string } | { none: true }

/**
 * The drafts, phrased by the model where it can be and each answer still in the note; the note's own where not.
 * The model busy or refusing: the note's own, said so. The model changing none of them: simply the note's own.
 */
async function phrase(drafts: QuestionDraft[]): Promise<{ drafts: QuestionDraft[]; by: Asked['by']; phrased: number }> {
  if (!drafts.length) return { drafts, by: 'note', phrased: 0 }
  const said = await call<Phrased>('ai:phrase', drafts).catch((error: unknown) => ({ error: whyFailed(error) }))
  if ('none' in said) return { drafts, by: 'note', phrased: 0 }
  if ('error' in said) return { drafts, by: 'fallback', phrased: 0 }
  return said.phrased ? { drafts: said.drafts, by: 'ai', phrased: said.phrased } : { drafts, by: 'note', phrased: 0 }
}

/**
 * Shown at once: the drafts themselves on a Mac without Apple Intelligence; on one with it, the list waits in its
 * place (the orb) while the model phrases them.
 */
async function ask(pane: string, note: string, picked: boolean, drafts: QuestionDraft[]): Promise<void> {
  chime('slide')
  const turn = ++turns
  if (!drafts.length || !meets(capsNow(), 'ai')) return put(pane, { note, by: 'note', drafts: drafts.map((one) => ({ ...one, state: 'open' })), picked, turn, phrased: 0 })
  put(pane, { note, by: 'note', drafts: null, picked, turn, phrased: 0 })
  const made = await phrase(drafts)
  if (asked.get(pane)?.turn !== turn) return
  put(pane, { note, by: made.by, drafts: made.drafts.map((one) => ({ ...one, state: 'open' })), picked, turn, phrased: made.phrased })
}

/** The note a pane shows, when it is one questions can come from: a note (a capture), whose cards say which note made them. */
const noteHere = (pane: string): string | null => {
  const note = openNoteIn(pane)
  return note?.type === 'capture' ? note.id : null
}
/** Whether "Make study questions" and "Make a question" are offered for what a pane shows. */
export const questionsFit = (pane = frontPane() ?? ''): boolean => !!noteHere(pane)

/** "Make study questions" (a note's "…", ⌘K): three to five drafts from the note in a pane, in its list. */
export function makeQuestions(pane = frontPane() ?? ''): void {
  const note = noteHere(pane)
  const editor = editorIn(pane)
  if (!note || !editor) return refuse('Open a note first')
  void ask(pane, note, false, draftQuestions(editor.getJSON()))
}

/** "Make a question" on words picked in a note: one draft from them, in the same list. */
export function makeQuestion(editor: Editor, from: number, to: number): void {
  const pane = editor.view.dom.closest<HTMLElement>('[data-pane]')?.dataset.pane ?? ''
  const note = noteHere(pane)
  if (!note) return refuse('Open a note first')
  const $from = editor.state.doc.resolve(from)
  const around = editor.state.doc.textBetween($from.start(), $from.end(), ' ')
  const one = draftFromWords(editor.state.doc.textBetween(from, to, ' '), around)
  void ask(pane, note, true, one ? [one] : [])
}

/** Whether a pane's note has questions out, for Props to show them in the Details' place: the asking's number, 0 for none. */
export function useQuestionsHere(): number {
  const pane = usePane() ?? ''
  return useSyncExternalStore((one) => (told.add(one), () => void told.delete(one)), () => asked.get(pane)?.turn ?? 0)
}

/** The line a draft came from, found in the note on screen and picked there, so you see it in its place. */
function showLine(pane: string, from: string): void {
  const editor = editorIn(pane)
  if (!editor) return refuse('Open the note first')
  const needle = from.slice(0, 60)
  let found: { from: number; to: number } | null = null
  editor.state.doc.descendants((node, pos) => {
    if (found || !node.isTextblock) return !found
    const at = node.textContent.indexOf(needle)
    if (at >= 0) found = { from: pos + 1 + at, to: pos + 1 + Math.min(node.textContent.length, at + from.length) }
    return false
  })
  if (!found) return refuse('That line is not in the note any more')
  editor.chain().focus().setTextSelection(found).scrollIntoView().run()
}

const BY: Record<Asked['by'], string> = {
  note: 'From your headings and definitions',
  ai: 'Phrased by Apple Intelligence, from your words',
  fallback: 'From your headings and definitions: Apple Intelligence could not phrase them just now',
}

/** The list, in the note's Details column while it is out. */
export function NoteQuestions(): React.JSX.Element | null {
  const pane = usePane() ?? ''
  const here = useSyncExternalStore((one) => (told.add(one), () => void told.delete(one)), () => asked.get(pane) ?? null)
  const close = (): void => (chime('fold'), put(pane, null))
  // Esc puts the list away, as the reader's does, before anything under it hears it; a menu over it and the note's
  // own editor (Vim's Esc, a slash menu) keep theirs.
  useEffect(() => {
    if (!here) return
    const onKey = (event: KeyboardEvent): void => {
      const at = event.target as HTMLElement | null
      if (event.key !== 'Escape' || event.defaultPrevented || at?.closest?.('.ProseMirror, [role="menu"], [role="dialog"]')) return
      event.preventDefault()
      event.stopPropagation()
      close()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  })
  if (!here) return null
  const { drafts, by, note, picked } = here
  const set = (n: number, patch: Partial<Draft>): void => {
    const now = asked.get(pane)
    if (now?.drafts) put(pane, { ...now, drafts: now.drafts.map((one, at) => (at === n ? { ...one, ...patch } : one)) })
  }
  /** One kept: a study card in Review from this note, its passage the line, so Review's "Show in its note" finds it there. */
  const make = async (n: number): Promise<string | null> => {
    const one = asked.get(pane)?.drafts?.[n]
    if (!one || one.state !== 'open' || !one.question.trim() || !one.answer.trim()) return null
    set(n, { state: 'kept' })
    try {
      const id = await call<string>('nugget:from', one.answer.trim(), { captureId: note, passage: one.from, card: { gem: false } })
      await call('item:save', id, { prompt: one.question.trim(), title: one.question.trim() })
      set(n, { id })
      return id
    } catch (error) {
      set(n, { state: 'open' })
      refuse(`Not made: ${whyFailed(error)}`, 'error')
      return null
    }
  }
  /** Taken back (the notice's Undo or ⌘Z): the cards go, their drafts open to keep again. */
  const unmake = (made: { n: number; id: string }[]): void =>
    made.forEach(({ n, id }) => void haligtree.unlift('nugget', id).then((gone) => gone && set(n, { state: 'open', id: undefined })))
  const keep = async (n: number): Promise<void> => {
    const id = await make(n)
    if (!id) return
    chime('saved')
    toast('Card made, in Review: it says which note and line it came from', () => unmake([{ n, id }]), 'success', undefined, { type: 'nugget', id, title: asked.get(pane)?.drafts?.[n]?.question })
  }
  /** "Keep the N left": one notice and one Undo for them all. */
  const keepAll = async (): Promise<void> => {
    const made: { n: number; id: string }[] = []
    for (let n = 0; n < (drafts?.length ?? 0); n++) {
      const id = await make(n)
      if (id) made.push({ n, id })
    }
    if (!made.length) return
    chime('saved')
    toast(`${plural(made.length, 'card')} made, in Review: each says which note and line it came from`, () => unmake(made))
  }
  return (
    // Every Mac drafts them; Apple Intelligence only phrases them where the Mac has it, and the list says which.
    <div data-note-questions={drafts ? drafts.length : 'reading'} data-questions-by={by} data-mac-needs="every" className="flex min-h-0 flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <h3 className="chapter-cards-title text-foreground">{drafts?.length ? (picked ? 'A question from these words' : `${plural(drafts.length, 'question')} from this note`) : picked ? 'A question from these words' : 'Study questions'}</h3>
        {/* Its own fold sound is the close's one sound. */}
        <CloseBeside onClose={() => put(pane, null)} className="-mr-1 -mt-1" />
      </div>
      {drafts && drafts.length > 0 && (
        <p className="chapter-cards-note text-control">{by === 'ai' && here.phrased < drafts.length ? `${num(here.phrased)} of ${num(drafts.length)} phrased by Apple Intelligence, all from your words` : BY[by]}. <strong>Nothing is made until you keep it.</strong></p>
      )}
      {!drafts && <div className="flex min-h-10 items-center"><Orb label="Apple Intelligence is phrasing them, on this Mac…" stop={close} /></div>}
      {drafts && !drafts.length && (
        <div data-note-questions-none className="flex flex-col gap-2 text-control">
          <p className="text-body font-medium text-foreground">Not enough here to ask about yet.</p>
          <p className="chapter-cards-note">{picked ? 'Pick a whole sentence, or a few words inside one.' : 'Questions come from a heading with words under it, a line like “X is …”, a line ending in a colon before a list, and bold or highlighted words.'}</p>
        </div>
      )}
      {drafts && drafts.length > 0 && (
        <>
          <DraftList cards={drafts} onSet={set} onKeep={(n) => void keep(n)}
            link={(one) => ({ label: `“${cutWords(one.from, 26)}”`, mark: { 'data-note-question-line': '' }, run: () => showLine(pane, one.from) })} />
          <DraftFoot cards={drafts} onKeepAll={() => void keepAll()} onDone={close} />
        </>
      )}
    </div>
  )
}
