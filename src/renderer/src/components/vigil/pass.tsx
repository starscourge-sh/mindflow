import { useEffect, useRef, useState } from 'react'
import type { Editor, JSONContent } from '@tiptap/core'
import { AnimatePresence, motion } from 'motion/react'
import { EASE, TURN, byKeys } from '@/lib/motion'
import { Scale } from 'lucide-react'
import { alive } from '@/components/ui/alive-icon'
import PaintIcon from '@/components/ui/paint-icon'
import XIcon from '@/components/ui/x-icon'

import { MindflowEditor, TAGS } from '../mindflow'
import { chime, type Cue } from '@/lib/sound'
import { toMarkdown } from '@/lib/export'
import { EXITS, exit } from '@/lib/capture-links'
import { makeTask } from '@/lib/tasks'
import { archive, changeKind } from '@/lib/notes'
import { useLive, vigil, type PassItem, type Settings } from '@/lib/vigil'
import { Button } from '@/components/ui/button'
import { Kbd, Rolling, Tip, Typed, toast, Pressed, Remembered } from './ui'
import { CAPTURE_TYPES, asksFor, type CaptureType } from '../capture-kinds/capture-kind-picker'
import { Term } from './term'
import { textOf } from '../rot-cards'
import { PinnedQuestions, clueInto } from './pinned-questions'
import { dayjs, moment, num, weekdayName } from '../../../../main/dates'

// itshover drawings in lucide's place, moving when their control is pointed at.
const Brush = alive(PaintIcon)
const X = alive(XIcon)

export type PassMode = 'tidy' | 'decide'

/** Open a pass over whichever window asks: the tidy one, or the deciding one. `ids` walks just those. */
export const openPass = (mode: PassMode, ids?: string[]): void =>
  void window.dispatchEvent(new CustomEvent('vigil:pass', { detail: { mode, ids } }))

/** The weekly day by name, "Thursday": what "come back to this" means. */
export const decideDay = (settings: Pick<Settings, 'weeklyDay'> | null): string =>
  weekdayName(settings?.weeklyDay ?? 4)

/** What each way out reads as in the closing count: "6 saved as gems". */
const SUMMED: Record<string, [string, string]> = {
  'Saved as a gem': ['saved as a gem', 'saved as gems'],
  Resolved: ['resolved', 'resolved'],
  Discarded: ['let go', 'let go'],
  'Now a question': ['made a question', 'made questions'],
  'A task': ['made a task', 'made tasks'],
  Archived: ['archived', 'archived'],
  'Left open': ['left open', 'left open'],
  'A clue': ['made a clue', 'made clues']
}
/** A count and its words, "3 let go", in the order given, the empty ones left out. */
const counted = (parts: [number, string, string][]): string =>
  parts.filter(([n]) => n > 0).map(([n, one, many]) => `${num(n)} ${n === 1 ? one : many}`).join(', ')

/** `#tags` in some words, lower-cased, once each. */
const tagsIn = (text: string): string[] => [...new Set([...text.matchAll(/(?:^|\s)#([a-z][\w-]*)/gi)].map((match) => match[1].toLowerCase()))]

/** Mark the line under the caret whole, or just what is selected. */
function wholeLine(editor: Editor, mark: 'bold' | 'strike'): boolean {
  const { selection } = editor.state
  const toggle = (chain: ReturnType<Editor['chain']>): ReturnType<Editor['chain']> => (mark === 'bold' ? chain.toggleBold() : chain.toggleStrike())
  if (!selection.empty) return toggle(editor.chain().focus()).run()
  const { $from } = selection
  if (!$from.parent.isTextblock || !$from.parent.content.size) return false
  return toggle(editor.chain().focus().setTextSelection({ from: $from.start(), to: $from.end() })).setTextSelection(selection.from).run()
}

/** A done item crossed off: a checkbox ticked if it is one, the line struck through if not. */
function crossOff(editor: Editor): boolean {
  const { $from } = editor.state.selection
  for (let depth = $from.depth; depth > 0; depth--) {
    const node = $from.node(depth)
    if (node.type.name !== 'taskItem') continue
    const at = $from.before(depth)
    return editor.chain().focus().command(({ tr }) => (tr.setNodeMarkup(at, undefined, { ...node.attrs, checked: !node.attrs.checked }), true)).run()
  }
  return wholeLine(editor, 'strike')
}

/**
 * Where the passes open, in either window: listens for `openPass` and lays
 * the pass over everything until it is closed.
 */
export function Passes({ onOpen }: { onOpen?: (type: string, id: string) => void }): React.JSX.Element | null {
  const [open, setOpen] = useState<{ mode: PassMode; ids?: string[]; at: number } | null>(null)
  useEffect(() => {
    const on = (event: Event): void => setOpen({ ...(event as CustomEvent<{ mode: PassMode; ids?: string[] }>).detail, at: Date.now() })
    window.addEventListener('vigil:pass', on)
    return () => window.removeEventListener('vigil:pass', on)
  }, [])
  if (!open) return null
  return <Pass key={open.at} mode={open.mode} ids={open.ids} onClose={() => setOpen(null)} onOpen={onOpen} />
}

/**
 * The two passes over what you caught, kept apart because they are different
 * jobs. Tidy, most days and a few minutes: tag it, bold the line that
 * matters, fold the rest, cross off what is done, or set it aside for
 * deciding day. Nothing is decided and nothing new is written: the words take
 * marks, not keys. Deciding, once a week: what you set aside, and what has
 * gone longest untouched, each with its exits.
 */
function Pass({ mode, ids, onClose, onOpen }: { mode: PassMode; ids?: string[]; onClose: () => void; onOpen?: (type: string, id: string) => void }): React.JSX.Element {
  const tidy = mode === 'tidy'
  const settings = useLive(vigil.settings, null as Settings | null)
  const day = decideDay(settings)
  // Read once when the pass opens: tidying one must not pull the list out from under you.
  const [items, setItems] = useState<PassItem[] | null>(null)
  useEffect(() => {
    void (ids
      ? Promise.all(ids.map((id) => Promise.all([window.api.captures.get(id), vigil.passState(id)]))).then((found) => found.flatMap(([one, state]) => (one ? [{ ...one, backAt: state?.backAt ?? null } as unknown as PassItem] : [])))
      : tidy ? vigil.tidyList() : vigil.decideList()
    ).then(setItems)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const [at, setAt] = useState(0)
  const item = items?.[at]
  const finished = !!items && at >= items.length
  // The words as stored now, read fresh for the page in front of you; `rev`
  // opens the editor again on words changed under it (a tag put on).
  const [page, setPage] = useState<{ id: string; body: JSONContent | string | null; rev: number } | null>(null)
  // Come back to this, per capture, as the pass has set it.
  const [back, setBack] = useState<Record<string, string | null>>({})
  // What each capture became in the deciding pass, said on its page if you step back to it.
  const [became, setBecame] = useState<Record<string, string>>({})
  // A kind changed here, per capture: its source fields follow it at once.
  const [kinds, setKinds] = useState<Record<string, string>>({})
  const editor = useRef<Editor | null>(null)
  // Whether you have touched the words on this page: a click (a checkbox) or a key (⌘B).
  const touched = useRef(false)
  const tagField = useRef<HTMLInputElement | null>(null)
  // What the pass did, for its closing count: which pages took a tag or a mark, which went to next week.
  const tagged = useRef(new Set<string>())
  const marked = useRef(new Set<string>())
  const later = useRef(new Set<string>())
  // The next thing, offered on the closing page: today's cards, if any wait.
  const due = useLive(vigil.dueCount, 0)

  useEffect(() => {
    if (!item) return
    let current = true
    touched.current = false
    editor.current = null
    setPage(null)
    void window.api.captures.get(item.id).then((found) => current && setPage({ id: item.id, body: (found?.body as JSONContent) ?? null, rev: 0 }))
    setBack((all) => (item.id in all ? all : { ...all, [item.id]: item.backAt }))
    return () => void (current = false)
  }, [item?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Saved a moment after each mark, and at once when the page turns.
  const saving = useRef<{ timer: ReturnType<typeof setTimeout>; run: () => Promise<unknown> } | null>(null)
  const flush = async (): Promise<void> => {
    if (!saving.current) return
    clearTimeout(saving.current.timer)
    const { run } = saving.current
    saving.current = null
    await run()
  }
  const save = (id: string, doc: JSONContent, from: Editor): void => {
    if (saving.current) clearTimeout(saving.current.timer)
    const run = (): Promise<unknown> => window.api.captures.save(id, { body: doc, markdown: (from.storage as { markdown?: unknown }).markdown ? toMarkdown(from) : undefined })
    saving.current = { run, timer: setTimeout(() => void ((saving.current = null), run()), 400) }
  }
  useEffect(() => () => void flush(), []) // eslint-disable-line react-hooks/exhaustive-deps

  const go = (to: number): void => {
    if (!items || to < 0 || to > items.length) return
    void flush()
    // Moving on is what tidied means: it is findable now, nothing more.
    if (item && to > at) void (tidy ? vigil.tidied(item.id) : !became[item.id] && vigil.passSeen(item.id))
    chime(to === items.length ? (tidy ? 'tidied' : 'sifted') : tidy && to > at ? 'tidy' : 'page')
    setAt(to)
  }

  // A tag on or off, written into its words and the page opened again on them.
  const tag = async (id: string, name: string, on: boolean, quiet = false): Promise<void> => {
    await flush()
    // The words as they were, so a tag taken off goes back where it was
    // written (mid-sentence, a later line), not onto the end of the first line.
    const before = on ? undefined : (await window.api.captures.get(id))?.body
    const doc = await vigil.passTag(id, name, on)
    if (doc === null) return void chime('nope')
    setPage((now) => (now && now.id === id ? { ...now, body: doc as JSONContent, rev: now.rev + 1 } : now))
    if (quiet) return
    if (on) tagged.current.add(id)
    chime(on ? 'tag' : 'untag')
    const putBack = async (): Promise<void> => {
      if (before === undefined) return tag(id, name, !on, true)
      await window.api.captures.save(id, { body: before })
      setPage((now) => (now && now.id === id ? { ...now, body: before as JSONContent, rev: now.rev + 1 } : now))
    }
    toast(on ? `Tagged #${name}` : `#${name} taken off`, () => void putBack().then(() => chime('undo')))
  }
  // Set aside for deciding day: a soft mark, said once, taken back the same way.
  const comeBack = (id: string): void => {
    const was = back[id] ?? null
    const on = !was
    const stamp = new Date().toISOString()
    setBack((all) => ({ ...all, [id]: on ? stamp : null }))
    chime(on ? 'back' : 'off')
    void vigil.comeBack(id, on).then(() =>
      toast(on ? `Set aside for ${day}` : `Not set aside after all`, () => {
        setBack((all) => ({ ...all, [id]: was }))
        void vigil.comeBack(id, !on, was).then(() => chime('undo'))
      }))
  }
  // In the deciding pass: not this week. It keeps (or gets) its mark and comes round again.
  const nextWeek = (id: string): void => {
    const was = back[id] ?? null
    chime('back')
    later.current.add(id)
    if (!was) void vigil.comeBack(id, true)
    setBack((all) => ({ ...all, [id]: was ?? new Date().toISOString() }))
    toast('Back next week', was ? undefined : () => void vigil.comeBack(id, false).then(() => (chime('undo'), setBack((all) => ({ ...all, [id]: null })))))
    go(at + 1)
  }
  // Marks on the words. Each says when there was nothing to mark.
  const mark = (run: (one: Editor) => boolean, cue: Cue): void => {
    touched.current = true
    const one = editor.current
    const done = !!one && run(one)
    if (done && item) marked.current.add(item.id)
    chime(done ? cue : 'nope')
  }
  // An exit taken here, then on to the next; undone, it is back as it was.
  const decide = (status: string): void => {
    if (!item || became[item.id]) return chime('nope')
    const id = item.id
    const here = at
    const label = EXITS.find((one) => one.status === status)?.done ?? 'Done'
    const done = (as = label): void => {
      setBecame((all) => ({ ...all, [id]: as }))
      go(here + 1)
    }
    const undo = (): void => {
      setBecame((all) => Object.fromEntries(Object.entries(all).filter(([key]) => key !== id)))
      setAt(here)
    }
    if (status === 'task') return void makeTask({ capture: id }, 'Now a task', { onUndo: undo }).then((made) => made && done('A task'))
    if (status === 'archive') return void archive('captures', [id], true, false, undo).then(() => done('Archived'))
    if (status === 'keep') {
      return void vigil.passState(id).then((was) => vigil.keepOpen(id).then(() => {
        chime('settled')
        toast('Left open: findable, and nothing to decide', () => void (was && vigil.unkeepOpen(id, was).then(() => (chime('undo'), undo()))))
        done('Left open')
      }))
    }
    void exit(id, status, undo).then(() => window.api.captures.get(id)).then((now) => {
      if (now?.status !== 'open' || status === 'question') done()
    })
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      // The tag field has its own keys; a question asked over the pass has the rest.
      if (document.activeElement === tagField.current && tagField.current) return
      if (document.querySelector('[role="dialog"]:not([data-pass])')) return
      if (event.metaKey || event.ctrlKey || event.altKey) {
        // Taking words out is writing too; the marks (⌘B, ⌘Z) are welcome.
        if (tidy && event.metaKey && ['x', 'v'].includes(event.key.toLowerCase()) && !event.shiftKey) event.preventDefault()
        return
      }
      const arrows = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown']
      // In tidy the arrows move the caret through the words; everything else is the pass's.
      if (tidy && arrows.includes(event.key)) return
      if (event.key === 'Shift') return
      event.preventDefault()
      event.stopPropagation()
      const key = event.key.toLowerCase()
      if (event.key === 'Escape') return onClose()
      if (finished) return void (key === 'k' ? go(at - 1) : event.key === 'Enter' && next && (chime('tap'), next.run()))
      if (key === 'j' || event.key === 'Enter' || (!tidy && (event.key === 'ArrowDown' || event.key === 'ArrowRight' || event.key === ' '))) return go(at + 1)
      if (key === 'k' || (!tidy && (event.key === 'ArrowUp' || event.key === 'ArrowLeft'))) return go(at - 1)
      if (!item) return
      if (key === 'c') return tidy ? comeBack(item.id) : nextWeek(item.id)
      if (tidy) {
        if (key === 't' || event.key === '#') return tagField.current?.focus()
        if (key === 'b') return mark((one) => wholeLine(one, 'bold'), 'noted')
        if (key === 'f') return mark((one) => one.chain().focus().toggleHeadingSection().run(), 'fold')
        if (key === 'x') return mark(crossOff, 'done')
        return
      }
      const exitKey = EXITS.find((one) => one.key === key)
      if (exitKey) return decide(exitKey.status)
      if (key === 't') return decide('task')
      if (key === 'a') return decide('archive')
      if (key === 'o') return decide('keep')
      if (key === 'e' && onOpen) return (onClose(), onOpen('capture', item.id))
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  })

  // Nothing typed lands in the words while tidying: no letters, no deleting, no
  // pasting. Marks arrive as commands, which this never sees.
  const words = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const box = words.current
    if (!box || !tidy) return
    const stop = (event: Event): void => event.preventDefault()
    const events = ['beforeinput', 'paste', 'cut', 'drop']
    for (const name of events) box.addEventListener(name, stop, true)
    // A click (a checkbox) or a ⌘ key (⌘B) is a mark; arrows only move the caret.
    const touch = (event: Event): void => void ((event.type === 'mousedown' || (event as KeyboardEvent).metaKey) && (touched.current = true))
    box.addEventListener('mousedown', touch, true)
    box.addEventListener('keydown', touch, true)
    return () => {
      for (const name of events) box.removeEventListener(name, stop, true)
      box.removeEventListener('mousedown', touch, true)
      box.removeEventListener('keydown', touch, true)
    }
  }, [tidy, page?.id])

  useEffect(() => {
    chime(tidy ? 'sweep' : 'sift')
    return () => chime('unread')
  }, [])

  const Icon = tidy ? Brush : Scale
  // The closing count: what this pass did, in a line. "14 tidied: 6 tagged, 2 set aside for Thursday".
  const ways = Object.values(became).reduce<Record<string, number>>((all, one) => ({ ...all, [one]: (all[one] ?? 0) + 1 }), {})
  const aside = items ? items.filter((one) => back[one.id]).length : 0
  const summary = !items?.length ? '' : tidy
    ? `${num(items.length)} tidied${(() => { const rest = counted([[tagged.current.size, 'tagged', 'tagged'], [marked.current.size, 'marked', 'marked'], [ways['A clue'] ?? 0, 'made a clue', 'made clues'], [aside, `set aside for ${day}`, `set aside for ${day}`]]); return rest ? `: ${rest}` : '' })()}`
    : `${num(items.length)} looked at${(() => { const rest = counted([...Object.entries(ways).map(([way, n]): [number, string, string] => [n, ...(SUMMED[way] ?? [way.toLowerCase(), way.toLowerCase()])]), [later.current.size, 'back next week', 'back next week']]); return rest ? `: ${rest}` : '' })()}`
  // One next thing, on Enter: the cards due today.
  const next = due > 0 ? { said: `Review ${num(due)} ${due === 1 ? 'card' : 'cards'}`, run: () => (onClose(), window.api.openInHome('view', 'review')) } : null
  const tags = page ? tagsIn(textOf(page.body)) : []
  const why = item?.why === 'back' ? `You set this aside to come back to` : item?.why === 'untidied' ? 'A week old, and you have not looked at it since' : item?.why === 'longest' ? 'Waiting the longest, and not opened in a while' : null
  const deciding = settings?.weeklyReview !== false && dayjs().day() === settings?.weeklyDay
  const lead = tidy
    ? 'Make each one easy to find again: add a tag, bold the line that matters, fold the rest. Nothing to decide today.'
    : `${deciding ? 'Deciding day. ' : ''}For each one: keep it, act on it, or let it go. Leaving it open is fine too.`
  const kind = item ? kinds[item.id] ?? item.kind : 'note'
  const setKind = (id: string, from: string): void =>
    void changeKind('captures', id, from).then(() => window.api.captures.get(id)).then((now) => now && setKinds((all) => ({ ...all, [id]: now.kind })))

  return (
    <div data-pass role="dialog" aria-label={tidy ? 'Tidy' : 'Deciding'} tabIndex={-1} className="fixed inset-0 z-[55] isolate flex flex-col bg-background outline-none">
      <header className="flex shrink-0 items-center gap-2 px-4 pt-3 text-sm">
        <span className="flex items-center gap-1.5 rounded-full border bg-accent/40 px-2.5 py-1 font-medium">
          <Icon className="size-3.5" style={{ color: `var(--tt-color-text-${tidy ? 'green' : 'purple'})` }} />
          <Term>{tidy ? 'Tidy' : 'Decide'}</Term>
        </span>
        <span className="min-w-0 flex-1 truncate text-muted-foreground"><Typed key={mode} text={lead} step={28} delay={300} /></span>
        <Tip label="Close  Esc">
          <Button variant="ghost" size="icon-sm" aria-label="Close" onClick={onClose}><X className="size-3.5" /></Button>
        </Tip>
      </header>

      {/* Each capture taken with its key (K, A, D...) gives way to the next at
          once; with a click, the next one rises into its place. */}
      <AnimatePresence mode="wait" initial={false} custom={byKeys()}>
        <motion.article
          key={finished ? 'end' : item?.id ?? 'none'}
          custom={byKeys()}
          variants={TURN}
          initial={byKeys() ? false : 'from'}
          animate="here"
          exit="gone"
          transition={{ duration: 0.16, ease: EASE }}
          className="mx-auto flex min-h-0 w-full max-w-[40rem] flex-1 flex-col overflow-y-auto px-8 pt-8 pb-6 [--mf-padding:0] [&_.tiptap-word-count]:hidden [&_.tiptap.ProseMirror]:text-[1.1rem] [&_.tiptap.ProseMirror]:leading-[1.65]"
        >
          {items && (finished || !items.length) ? (
            <div className="m-auto max-w-sm text-center">
              <p className="text-title font-semibold">{!items.length ? (tidy ? 'Nothing to tidy' : 'Nothing to decide') : tidy ? 'All tidy' : 'Decided for this week'}</p>
              {summary && <p data-pass-summary className="mt-3 text-heading font-medium text-pretty text-foreground">{summary}</p>}
              <p className="mt-2 text-muted-foreground">
                <Typed step={28} delay={200} text={!items.length
                  ? tidy ? 'Everything from the last week is findable already.' : 'Nothing is set aside, and nothing has waited too long. It all keeps.'
                  : tidy ? `Everything from the last few days is findable now. Nothing was decided, and nothing needed to be.` : `What you left open stays findable. Anything you set aside comes back next ${day}.`} />
              </p>
              <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
                {next && <Button data-pass-next variant="outline" size="lg" onClick={() => (chime('tap'), next.run())}>{next.said} <Kbd className="ml-1">↵</Kbd></Button>}
                <Button variant="ghost" size="sm" onClick={onClose}>Close <Kbd className="ml-1">Esc</Kbd></Button>
              </div>
            </div>
          ) : item && (
            <>
              <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <span>{moment(item.capturedAt, 'dddd')}</span>
                <KindChip kind={kind} onChange={() => setKind(item.id, kind)} />
                {why && <span className="text-[var(--tt-color-text-purple)]">{why}</span>}
                {became[item.id] && <span className="rounded-full bg-accent px-2 py-0.5 text-foreground"><Rolling text={became[item.id]} by="word" /></span>}
                {tidy && back[item.id] && (
                  <button type="button" onClick={() => comeBack(item.id)} className="rounded-full border border-[color-mix(in_srgb,var(--tt-color-text-orange)_35%,transparent)] px-2 py-0.5 text-[var(--tt-color-text-orange)] hover:bg-accent">
                    <Rolling text={`Back on ${day}`} by="word" />
                  </button>
                )}
              </div>
              {/* Everything shown can be put right here, in either pass: the tags, who and where. */}
              <TagRow key={item.id} tags={tags} field={tagField} onAdd={(name) => void tag(item.id, name, true)} onRemove={(name) => void tag(item.id, name, false)} onDone={() => (tidy ? editor.current?.commands.focus() : tagField.current?.blur())} />
              <Source key={`s${item.id}-${kind}`} item={{ ...item, kind }} />
              {tidy && (
                <>
                {/* Matched against what you are trying to work out, one click; undone, it is back as it was. */}
                {!became[item.id] && <PinnedQuestions className="mb-3" onPick={(question) => {
                  const id = item.id
                  // Copied in as a clue, the capture left where it is: moving it into
                  // the question would be deciding its fate, which Tidy never does.
                  void clueInto(question, { text: editor.current?.getText() ?? '' }, () => setBecame((all) => Object.fromEntries(Object.entries(all).filter(([key]) => key !== id))))
                    .then((ok) => ok && setBecame((all) => ({ ...all, [id]: 'A clue' })))
                }} />}
                </>
              )}
              <div ref={words} data-private={item.private ? '' : undefined} className={tidy ? '[&_.ProseMirror]:caret-[var(--tt-color-text-green)]' : ''}>
                {page && page.id === item.id && (
                  <MindflowEditor
                    key={`${item.id}-${page.rev}`}
                    host={window.api}
                    shape="document"
                    tokens={TAGS}
                    readOnly={!tidy}
                    // Only when the page first opens: opened again on a new tag, the tag field keeps the keys.
                    autofocus={tidy && page.rev === 0 ? 'start' : false}
                    defaultContent={page.body ?? ''}
                    onReady={(one) => void (editor.current = one)}
                    // Only once you have marked it: the editor tidying its own copy of old words is not an edit.
                    onChange={(doc, one) => tidy && touched.current && save(item.id, doc, one)}
                    toolbar={false}
                    handles={false}
                    slash={false}
                    outline={false}
                    vim={false}
                    search={false}
                  />
                )}
              </div>
              {/* Deciding takes single keys, so the words are not typed into here: changing them is one plain click away. */}
              {!tidy && onOpen && (
                <Tip label="Close Decide and open the note, to change its words">
                  <Button data-pass-edit variant="ghost" size="sm" className="mt-2 -ml-3 text-foreground/85" onMouseDown={(event) => event.preventDefault()} onClick={() => (onClose(), onOpen('capture', item.id))}>
                    Edit the words <Pressed className="ml-1" keys="E" />
                  </Button>
                </Tip>
              )}
            </>
          )}
        </motion.article>
      </AnimatePresence>

      {/* The only furniture: what can be done here, each with its key. */}
      {items && !finished && items.length > 0 && (
        <footer className="flex shrink-0 flex-wrap items-center justify-center gap-1 px-4 pb-3 text-xs text-muted-foreground">
          {tidy ? (
            <>
              <Action label="Tag" keys="T" tip="Add a tag; ⌫ in the empty field takes the last one off" run={() => tagField.current?.focus()} />
              <Action label="Bold the line" keys="B" tip="The line the caret is on, or what is selected" run={() => mark((one) => wholeLine(one, 'bold'), 'noted')} />
              <Action label="Fold" keys="F" tip="Fold what is under this line into a toggle" run={() => mark((one) => one.chain().focus().toggleHeadingSection().run(), 'fold')} />
              <Action label="Cross off" keys="X" tip="Tick it, or strike it through: done, and kept" run={() => mark(crossOff, 'done')} />
            </>
          ) : (
            <>
              {EXITS.map((one) => <Action key={one.key} label={one.label} keys={one.key.toUpperCase()} tip={one.what} tint={one.tint} run={() => decide(one.status)} />)}
              <Action label="Task" keys="T" tip="Make it a task: it goes into your tasks, linked to this note" tint="blue" run={() => decide('task')} />
              <Action label="Archive" keys="A" tip="Out of sight, not let go" tint="brown" run={() => decide('archive')} />
              <Action label="Leave open" keys="O" tip="Findable is enough: it stops asking" run={() => decide('keep')} />
            </>
          )}
          {item && tidy && <Action label={back[item.id] ? `Back on ${day}` : `Come back ${day}`} keys="C" tip={back[item.id] ? 'Set aside: it waits for deciding day. Press again to take the mark off' : `Set it aside until deciding day, ${day}, and let it go until then`} tint="orange" on={!!back[item.id]} run={() => comeBack(item.id)} />}
          {item && !tidy && <Action label="Next week" keys="C" tip="Not this week: it comes round again next week" tint="orange" run={() => nextWeek(item.id)} />}
          <span className="ml-2 flex items-center gap-1">
            <Pressed keys="J" /><span>{tidy ? 'tidied, next' : 'next'}</span>
            <Pressed className="ml-1" keys="K" /><span>back</span>
            <Kbd className="ml-1">Esc</Kbd><span>{tidy ? 'stop for now' : 'close'}</span>
          </span>
        </footer>
      )}
    </div>
  )
}

/** One thing the pass can do, as a quiet button with its key. */
function Action({ label, keys, tip, tint, on, run }: { label: string; keys: string; tip: string; tint?: string; on?: boolean; run: () => void }): React.JSX.Element {
  return (
    <Tip label={tip}>
      <Button variant="ghost" size="sm" onMouseDown={(event) => event.preventDefault()} onClick={run} aria-pressed={on}
        className={`font-medium text-foreground/85 transition-colors hover:text-[var(--tint)] ${on ? 'bg-accent text-[var(--tint)]' : ''}`}
        style={{ '--tint': tint ? `var(--tt-color-text-${tint})` : 'var(--foreground)' } as React.CSSProperties}>
        <Rolling text={label} by="word" /> <Pressed className="ml-1" keys={keys} />
      </Button>
    </Tip>
  )
}

/**
 * The tags on one capture, and a field to add another with the ones you
 * already use offered as you type. Enter, Tab, a space or a comma keeps it;
 * ⌫ in the empty field takes the last one off; Escape goes back to the words.
 */
export function TagRow({ tags, field, onAdd, onRemove, onDone, autoFocus = false }: {
  tags: string[]
  /** Takes the keys as soon as it shows, as it does when asked for from a card. */
  autoFocus?: boolean
  field: React.RefObject<HTMLInputElement | null>
  onAdd: (tag: string) => void
  onRemove: (tag: string) => void
  onDone: () => void
}): React.JSX.Element {
  const all = useLive(vigil.tags, [] as Awaited<ReturnType<typeof vigil.tags>>)
  const [text, setText] = useState('')
  const [pick, setPick] = useState(0)
  const [focused, setFocused] = useState(false)
  const typed = text.trim().replace(/^#/, '').toLowerCase().replace(/\s+/g, '-')
  // Starting with what you typed first, then containing it; most used first within each.
  const offered = typed
    ? [...all.filter((one) => one.tag.startsWith(typed)), ...all.filter((one) => !one.tag.startsWith(typed) && one.tag.includes(typed))].filter((one) => !tags.includes(one.tag)).slice(0, 6)
    : all.filter((one) => !tags.includes(one.tag)).slice(0, 6)
  useEffect(() => setPick(0), [typed])
  const keep = (name: string): void => {
    if (!/^[a-z][\w-]*$/.test(name)) return void (name && chime('nope'))
    onAdd(name)
    setText('')
  }
  return (
    <div className="relative mb-3 flex flex-wrap items-center gap-1.5 text-xs">
      {tags.map((one) => (
        <span key={one} className="group/tag flex items-center gap-0.5 rounded-full bg-accent py-0.5 pr-1 pl-2 text-foreground">
          #{one}
          <button type="button" aria-label={`Take #${one} off`} onMouseDown={(event) => event.preventDefault()} onClick={() => onRemove(one)}
            className="flex size-4 items-center justify-center rounded-full text-muted-foreground opacity-50 transition-opacity group-hover/tag:opacity-100 hover:bg-background hover:text-foreground">
            <X className="size-3" />
          </button>
        </span>
      ))}
      <input
        ref={field}
        autoFocus={autoFocus}
        value={text}
        onChange={(event) => setText(event.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder={tags.length ? 'Another tag…' : 'Add a tag…'}
        aria-label="Add a tag"
        className="field-sizing-content min-w-24 rounded-full bg-transparent px-2 py-0.5 outline-none placeholder:text-muted-foreground hover:bg-accent/50 focus:bg-accent/60"
        onKeyDown={(event) => {
          event.stopPropagation()
          if (event.key === 'Escape') {
            event.preventDefault()
            setText('')
            return onDone()
          }
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault()
            return setPick((n) => Math.max(0, Math.min(offered.length - 1, n + (event.key === 'ArrowDown' ? 1 : -1))))
          }
          if (event.key === 'Backspace' && !text && tags.length) return onRemove(tags[tags.length - 1])
          if (event.key === 'Enter' && !typed) {
            event.preventDefault()
            return onDone()
          }
          if (['Enter', 'Tab', ',', ' '].includes(event.key) && typed) {
            event.preventDefault()
            // Enter and Tab take the one offered; a space or a comma keeps what you typed.
            keep(['Enter', 'Tab'].includes(event.key) ? offered[pick]?.tag ?? typed : typed)
          }
        }}
      />
      {focused && offered.length > 0 && (
        <div className="absolute top-full left-0 z-30 mt-1 min-w-48 overflow-hidden rounded-lg border bg-popover p-1 text-sm shadow-lg">
          {offered.map((one, index) => (
            <button key={one.tag} type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => keep(one.tag)}
              className={`flex w-full items-center gap-2 rounded-md px-2 py-1 text-left ${index === pick ? 'bg-accent' : 'hover:bg-accent/60'}`}>
              <span className="flex-1 truncate" style={one.color ? { color: `var(--tt-color-text-${one.color})` } : undefined}>#{one.tag}</span>
              <span className="text-xs text-muted-foreground tabular-nums">{one.count}</span>
            </button>
          ))}
          <p className="px-2 pt-1 pb-0.5 text-xs text-muted-foreground"><Kbd>↵</Kbd> take it · <Kbd>Space</Kbd> keep what you typed</p>
        </div>
      )}
    </div>
  )
}

/**
 * The way into either pass, where the inbox is: offered only when there is
 * something for it, and never with a count of what is left to do.
 */
export function PassLinks({ className = '' }: { className?: string }): React.JSX.Element | null {
  const waiting = useLive(vigil.passWaiting, { tidy: 0, decide: 0 })
  const settings = useLive(vigil.settings, null as Settings | null)
  if (!waiting.tidy && !waiting.decide) return null
  const today = settings?.weeklyReview !== false && dayjs().day() === settings?.weeklyDay
  return (
    <div className={`flex flex-wrap items-center gap-1 text-xs text-muted-foreground ${className}`}>
      {waiting.tidy > 0 && (
        <Tip label="Tidy the last few days: tags and formatting, nothing to decide">
          <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-[var(--tt-color-text-green)]" onClick={() => openPass('tidy')}>
            <Brush className="size-3.5" /> Tidy
          </Button>
        </Tip>
      )}
      {waiting.decide > 0 && (
        <Tip label={`What you set aside, and what has waited longest: keep each, finish it or let it go. ${today ? 'Today is deciding day.' : `Its day is ${decideDay(settings)}, but any day works.`}`}>
          <Button variant="ghost" size="sm" className={today ? 'text-[var(--tt-color-text-purple)]' : 'text-muted-foreground hover:text-[var(--tt-color-text-purple)]'} onClick={() => openPass('decide')}>
            <Scale className="size-3.5" /> {today ? 'Deciding day' : 'Decide'}
          </Button>
        </Tip>
      )}
    </div>
  )
}

/**
 * Who said it and where it came from, for a kind that asks (a quote, a link,
 * a word): put right in passing, as Tidy is for, saved as you type.
 */
function Source({ item }: { item: PassItem }): React.JSX.Element | null {
  const asks = asksFor(item.kind as CaptureType, item.label)
  const [who, setWho] = useState(item.attribution ?? '')
  const [where, setWhere] = useState(item.medium ?? '')
  if (!asks.who && !asks.where) return null
  const field = 'field-sizing-content min-w-28 max-w-72 rounded-md px-2 py-1 text-control hover:bg-accent focus:bg-accent'
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2">
      {asks.who && <Remembered field="attribution" value={who} placeholder={asks.who} className={field} onChange={(value) => {
        setWho(value)
        void vigil.setCapture(item.id, 'attribution', value.trim() || null)
      }} />}
      {asks.where && <Remembered field="medium" value={where} placeholder={asks.where} className={field} onChange={(value) => {
        setWhere(value)
        void vigil.setCapture(item.id, 'medium', value.trim() || null)
      }} />}
    </div>
  )
}

/** What kind it is, said plainly, and a click to change it: its source fields follow. */
function KindChip({ kind, onChange }: { kind: string; onChange: () => void }): React.JSX.Element {
  const type = CAPTURE_TYPES.find((one) => one.id === kind) ?? CAPTURE_TYPES[0]
  const Icon = type.icon
  return (
    <Tip label={`A ${type.label.toLowerCase()}: ${type.does.charAt(0).toLowerCase()}${type.does.slice(1)}. Click to change what kind it is`}>
      <button type="button" data-pass-kind aria-label={`Kind: ${type.label}`} onMouseDown={(event) => event.preventDefault()} onClick={onChange}
        className="flex items-center gap-1 rounded-full px-2 py-0.5 text-foreground/85 transition-colors hover:bg-accent hover:text-foreground">
        <Icon className="size-3.5" style={{ color: type.tint }} />
        <Rolling text={type.label} by="word" />
      </button>
    </Tip>
  )
}
