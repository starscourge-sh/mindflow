import { useEffect, useRef, useState } from 'react'
import type { JSONContent } from '@tiptap/core'
import { Archive, ArchiveRestore, Calendar, Download, EyeOff, Eye, Lightbulb, Orbit, Pin, PinOff, Plus, RotateCcw, Wind } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'

import { MindflowEditor, TAGS } from '../mindflow'
import { chime } from '@/lib/sound'
import { useLive, vigil, when, type Item, type ItemFull } from '@/lib/vigil'
import { findCaptures, findHeadings, flying, follow } from '@/lib/capture-links'
import { archive, openWindow, saveAttachments, useOpenNote } from '@/lib/notes'
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Chips } from './display'
import { Lineage } from './lineage'
import { pinQuestion } from './pinned-questions'
import { Mentions } from './mentions'
import { Aliases, LocalGraph, Versions } from './note-extras'
import { RowMenu, copy, type MenuItem } from './row-menu'
import { Empty, Island, Kbd, Page, Prop, Props, Rolling, Stepper, Tip, Typed, VirtualList, ask, refuse, showTopTitle, toast, useListKeys } from './ui'

/**
 * Questions: what you keep circling and cannot name yet. The tier between a
 * capture and a nugget that the promotion gate ("would it make sense cold?")
 * has no room for, because half-formed thinking never passes it. A question
 * is held, not tracked: it never rots, is never reviewed and never asks for an
 * exit. It collects clues, dated, until one day you have got it and write the
 * article, or let it go. Some stay open for years, and that is the point.
 */

/** How long it has been held, in plain words and a calm colour: "held 2 years". */
export function heldFor(at: string): string {
  const days = Math.floor((Date.now() - new Date(at).getTime()) / 86400000)
  if (days < 1) return 'held since today'
  const [n, unit] = days >= 365 ? [Math.floor(days / 365), 'year'] : days >= 60 ? [Math.floor(days / 30.4), 'month'] : days >= 14 ? [Math.floor(days / 7), 'week'] : [days, 'day']
  return `held ${n} ${unit}${n === 1 ? '' : 's'}`
}
export const cluesSaid = (n: number): string => (n ? `${n} ${n === 1 ? 'clue' : 'clues'}` : 'no clues yet')

/** A new question, asked for in your own words, then opened to write in. Undoable. */
export async function startQuestion(open: (type: string, id: string) => void): Promise<void> {
  const title = await ask('What do you keep circling? Say it as a question, in your own words.', 'e.g. Why does Sunday evening feel heavy?')
  if (!title) return
  const id = await vigil.newQuestion(title)
  chime('hold')
  toast('Holding it: add clues as they come', () => void vigil.dropQuestion(id))
  open('question', id)
}

/**
 * "+Sunday evening: felt it again after the call" in the box: a first line
 * starting with + names a question you are holding, and what follows (after a
 * colon, or on the lines below) is a clue for it rather than a capture. The
 * name matches the question it is part of, or the one sharing most words.
 * Written "+name", no space: "+ " makes a bulleted list as you type.
 */
export function clueTarget(line: string | null | undefined, held: Item[]): { name: string; rest: string; question: Item | null } | null {
  const said = /^\+(?!\s)(.+)$/.exec(line?.trim() ?? '')
  if (!said) return null
  const at = said[1].indexOf(':')
  const name = (at >= 0 ? said[1].slice(0, at) : said[1]).trim()
  const rest = at >= 0 ? said[1].slice(at + 1).trim() : ''
  const lower = name.toLowerCase()
  const words = lower.split(/\W+/).filter((word) => word.length > 2)
  const score = (one: Item): number => words.filter((word) => one.title.toLowerCase().includes(word)).length
  const best = [...held].sort((a, b) => score(b) - score(a))[0]
  const question = (lower && held.find((one) => one.title.toLowerCase().includes(lower))) || (best && score(best) >= Math.max(1, Math.ceil(words.length / 2)) ? best : null)
  return { name, rest, question }
}

type Picked = { id: string; title: string } | { title: string; id?: undefined }
/** Ask which question, from the open ones; words that match none can start one. */
export const pickQuestion = (): Promise<Picked | null> =>
  new Promise((answer) => void window.dispatchEvent(new CustomEvent('vigil:pick-question', { detail: { answer } })))

/**
 * A capture's words become a dated clue in a question, and the capture takes
 * its exit, kept there. Undone, the clue goes and the capture is open again.
 */
export async function addToQuestion(captureId: string, onUndo?: () => void): Promise<void> {
  const picked = await pickQuestion()
  if (!picked) return
  if (!picked.id) {
    const id = await flying(captureId, 'question', () => vigil.newQuestion(picked.title, captureId))
    // A capture that already took another exit keeps it.
    if (!id) return refuse('That capture already took an exit. Put it back in the inbox first')
    chime('hold')
    return toast('Kept in a new question, as its first clue', () => void vigil.dropQuestion(id).then(() => onUndo?.()))
  }
  const clue = await flying(captureId, 'question', () => vigil.addClue(picked.id, '', captureId))
  if (!clue) return
  chime('clue')
  toast(`A clue in “${picked.title.length > 40 ? `${picked.title.slice(0, 40)}…` : picked.title}”`, () => void vigil.dropClue(clue).then(() => onUndo?.()))
}

/** The question picker over the page: type to narrow, Enter to choose. */
export function QuestionAsker(): React.JSX.Element | null {
  const [asked, setAsked] = useState<{ answer: (picked: Picked | null) => void } | null>(null)
  const [typed, setTyped] = useState('')
  const open = useLive(() => (asked ? vigil.items('question') : Promise.resolve([] as Item[])), [] as Item[], [!!asked])
  useEffect(() => {
    const onAsk = (event: Event): void => {
      chime('open')
      setTyped('')
      setAsked((event as CustomEvent).detail)
    }
    window.addEventListener('vigil:pick-question', onAsk)
    return () => window.removeEventListener('vigil:pick-question', onAsk)
  }, [])
  if (!asked) return null
  const done = (picked: Picked | null): void => {
    asked.answer(picked)
    setAsked(null)
  }
  const held = open.filter((one) => !one.closedAt && !one.archivedAt)
  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center bg-black/40 pt-[22vh]" onMouseDown={() => done(null)}>
      <div role="dialog" aria-modal="true" aria-label="Add to a question" className="w-[min(28rem,90vw)] overflow-hidden rounded-xl bg-popover shadow-(--mf-panel-shadow)" onMouseDown={(event) => event.stopPropagation()}>
        <Command onKeyDown={(event) => {
          event.stopPropagation()
          if (event.key === 'Escape') done(null)
        }}>
          <CommandInput autoFocus value={typed} onValueChange={setTyped} placeholder="Add it to which question…" />
          <CommandList>
            <CommandEmpty>No question holds that yet.</CommandEmpty>
            {held.map((one) => (
              <CommandItem key={one.id} value={`${one.title} ${one.id}`} onSelect={() => done({ id: one.id, title: one.title })}>
                <Orbit className="text-muted-foreground" />
                <span className="private-text min-w-0 flex-1 truncate">{one.title}</span>
                <span className="shrink-0 text-xs text-muted-foreground">{cluesSaid(one.clues)}</span>
              </CommandItem>
            ))}
            {/* Words that are not one of them yet can be the start of one. */}
            {typed.trim() && (
              <CommandItem value={`new ${typed}`} forceMount onSelect={() => done({ title: typed.trim() })}>
                <Plus className="text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate">Hold as a new question: “{typed.trim()}”</span>
              </CommandItem>
            )}
          </CommandList>
        </Command>
      </div>
    </div>
  )
}

/**
 * Holding, in the main window: the questions you are carrying, each with how
 * long and how many clues. The ones you have settled wait, quietly, under
 * Answered, still readable.
 */
export function QuestionsView({ focus, onOpen }: { focus?: string; onOpen?: (type: string, id: string) => void }): React.JSX.Element {
  const all = useLive(() => vigil.items('question'), [] as Item[])
  const inView = new Set(useLive(vigil.pinnedQuestions, [] as Awaited<ReturnType<typeof vigil.pinnedQuestions>>).map((one) => one.id))
  const [show, setShow] = useState<'open' | 'answered'>('open')
  const items = all
    .filter((one) => !one.archivedAt && (show === 'open' ? !one.closedAt : !!one.closedAt))
    .sort((a, b) => (show === 'open' ? b.createdAt.localeCompare(a.createdAt) : (b.closedAt ?? '').localeCompare(a.closedAt ?? '')))
  const [open, setOpen] = useState<ItemFull | null>(null)
  const pick = (id: string): void => void vigil.item(id).then((found) => {
    setOpen(found)
    // One sent here that is already settled is found under Answered.
    if (found) setShow(found.closedAt ? 'answered' : 'open')
  })
  useEffect(() => void (focus && pick(focus)), [focus]) // eslint-disable-line react-hooks/exhaustive-deps
  // Read again when anything changes, so a clue added elsewhere shows.
  useEffect(() => window.api.captures.onChange(() => open && void vigil.item(open.id).then(setOpen)), [open?.id])
  useEffect(() => {
    const onApart = (event: Event): void => setOpen((was) => (was?.id === (event as CustomEvent).detail ? null : was))
    window.addEventListener('vigil:opened-apart', onApart)
    return () => window.removeEventListener('vigil:opened-apart', onApart)
  }, [])
  const [cursor] = useListKeys(items.length, { onOpen: (index) => pick(items[index].id), onBack: () => setOpen(null) })
  const go = (type: string, id: string): void => (type === 'question' ? pick(id) : onOpen?.(type, id))
  const menuFor = (item: Item): MenuItem[] => [
    { label: 'Open', keys: '↵', run: () => pick(item.id) },
    { label: 'Open in a new window', keys: '⌘-click', run: () => openWindow('question', item.id) },
    'separator',
    ...(item.closedAt ? [] : [{ label: inView.has(item.id) ? 'Out of view' : 'Keep in view while capturing', run: () => void pinQuestion(item.id, item.title, !inView.has(item.id)) }]),
    { label: item.private ? 'Not private' : 'Private', run: () => void vigil.setPrivate('nuggets', item.id, !item.private) },
    { label: item.archivedAt ? 'Unarchive' : 'Archive', run: () => void archive('nuggets', [item.id], !item.archivedAt) },
    'separator',
    { label: 'Copy the question', run: () => copy(item.title) }
  ]
  return (
    <>
      <Page aside={!!open} title="Holding" count={items.length}
        actions={
          <span className="flex items-center gap-2">
            <Chips className="shrink-0" options={[{ id: 'open', label: 'Holding' }, { id: 'answered', label: 'Answered' }]} on={(id) => id === show} pick={(id) => setShow(id as 'open' | 'answered')} />
            <Button variant="ghost" size="sm" onClick={() => void startQuestion(go)}><Plus className="size-3.5" /> New question</Button>
          </span>
        }
      >
        {items.length ? (
          <VirtualList items={items} keyOf={(item) => item.id} cursor={cursor} estimate={60} className="mx-3 my-2">
            {(item, index) => (
              <RowMenu items={menuFor(item)}>
                <button
                  type="button"
                  data-row
                  data-id={item.id}
                  data-cursor={index === cursor || undefined}
                  data-private={item.private ? '' : undefined}
                  data-open={item.id === open?.id ? '' : undefined}
                  onClick={(event) => (event.metaKey ? openWindow('question', item.id) : pick(item.id))}
                  className={`flex w-full flex-col rounded-sm px-2 py-1.5 text-left transition-colors ${item.id === open?.id ? 'bg-accent' : index === cursor ? 'bg-accent/50' : 'hover:bg-accent/50'}`}
                >
                  <QuestionRow item={item} inView={inView.has(item.id)} />
                </button>
              </RowMenu>
            )}
          </VirtualList>
        ) : show === 'open' ? (
          <Empty shape={['ellipse', 3]} title="Nothing held yet" action={<Button variant="secondary" size="sm" onClick={() => void startQuestion(go)}><Plus className="size-3.5" /> New question</Button>}>
            A question is for what you keep circling and cannot name yet. It never rots and is never tested: it just holds the clues, for as long as it takes. Press H on a capture to hold it as one.
          </Empty>
        ) : (
          <Empty shape={['moon', 1]} title="Nothing answered yet">
            When a question comes clear, “I've got it” starts an article from its clues, and the question rests here, still readable.
          </Empty>
        )}
      </Page>
      {open && <QuestionDetail key={open.id} item={open} onOpen={go}
        top={<Stepper at={items.findIndex((one) => one.id === open.id)} total={items.length} onStep={(to) => pick(items[to].id)} />} />}
    </>
  )
}

/** A question's line: the words, then how long it has been held and its clues, in a calm grey. */
export function QuestionRow({ item, compact = false, inView = false }: { item: Item; compact?: boolean; inView?: boolean }): React.JSX.Element {
  const meta = item.closedAt ? `${item.closedHow === 'let go' ? 'let go' : 'answered'} ${when(item.closedAt).toLowerCase()} · ${cluesSaid(item.clues)}` : `${heldFor(item.createdAt)} · ${cluesSaid(item.clues)}`
  return (
    <>
      <span className="flex items-start gap-2">
        <Orbit className={`mt-0.5 size-4 shrink-0 ${item.closedAt ? 'text-muted-foreground/60' : 'text-muted-foreground'}`} />
        <span className={`private-text flex-1 ${compact ? 'truncate' : 'line-clamp-2'} ${item.closedAt ? 'text-muted-foreground' : ''}`}>{item.title || 'Untitled'}</span>
        {inView ? <Pin className="mt-1 size-3 shrink-0 text-muted-foreground" aria-label="Kept in view" /> : null}
        {item.private ? <EyeOff className="mt-1 size-3 shrink-0 text-muted-foreground" aria-label="Private" /> : null}
      </span>
      {!compact && (
        <span className="mt-0.5 pl-6 text-xs text-muted-foreground">
          <Rolling by="word" text={meta} />
        </span>
      )}
    </>
  )
}

/**
 * An open question: the question in your words, the page under it to write in
 * however it asks to be written, and its clues, newest first. Down the right,
 * how long it has been held and the two ways it can end.
 */
export function QuestionDetail({ item, onOpen, top }: { item: ItemFull; onOpen?: (type: string, id: string) => void; top?: React.ReactNode }): React.JSX.Element {
  useOpenNote({ table: 'nuggets', type: 'question', id: item.id, kind: item.kind, archived: !!item.archivedAt })
  const seen = useRef<string | null>(null)
  const [past, setPast] = useState<{ body: unknown; key: string } | null>(null)
  const [restored, setRestored] = useState<{ body: unknown; rev: number } | null>(null)
  const inView = useLive(vigil.pinnedQuestions, [] as Awaited<ReturnType<typeof vigil.pinnedQuestions>>).some((one) => one.id === item.id)
  const settled = item.closedAt ? `${item.closedHow === 'let go' ? 'Let go' : 'Answered'} ${whenLower(item.closedAt)}` : null
  const gotIt = (): void => void vigil.closeQuestion(item.id, 'answered').then((done) => {
    if (!done?.article) return
    const article = done.article
    chime('answered')
    toast('Got it: an article, started from your clues', () => void vigil.reopenQuestion(item.id, article))
    onOpen?.('article', article)
  })
  const letGo = (): void => void vigil.closeQuestion(item.id, 'let go').then(() => {
    chime('release')
    toast('Let go: it rests under Answered, still readable', () => void vigil.reopenQuestion(item.id))
  })
  const holdAgain = (): void => {
    const how = item.closedHow ?? 'let go'
    void vigil.reopenQuestion(item.id).then(() => {
      chime('hold')
      toast('Held again', () => void vigil.closeQuestion(item.id, how, true))
    })
  }
  return (
    <div className="note-pane flex min-w-0 flex-[1.4] flex-col overflow-y-auto [--mf-padding:1rem_1.5rem_1rem_3.25rem] @[40rem]/page:flex-row @[40rem]/page:overflow-visible @[40rem]/page:[--mf-padding:1rem_4.75rem] @[56rem]/page:border-l [&>*:first-child]:min-h-[22rem] [&>*:first-child]:shrink-0 @[40rem]/page:[&>*:first-child]:min-h-0 @[40rem]/page:[&>*:first-child]:shrink">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col pt-6">
        <div className="-mt-3 mb-1 flex items-center justify-between gap-2 px-3 @[40rem]/page:px-[4.25rem]">
          {top ?? <span />}
          <Versions table="nuggets" id={item.id} onShow={(body, key) => setPast(body === null ? null : { body, key: key ?? '' })}
            onRestored={() => void vigil.item(item.id).then((fresh) => fresh && setRestored((was) => ({ body: fresh.body, rev: (was?.rev ?? 0) + 1 })))} />
        </div>
        <div className="page-narrow mx-auto w-full px-12">
          {/* The question itself, in your words: it can take a few lines. */}
          <textarea
            rows={1}
            className="block w-full resize-none bg-transparent text-title font-semibold text-balance outline-none [field-sizing:content] placeholder:text-foreground/70"
            defaultValue={item.title === 'Untitled' ? '' : item.title}
            autoFocus={!item.title || item.title === 'Untitled'}
            placeholder="What do you keep circling?"
            onKeyDown={(event) => {
              if (event.key !== 'Enter' || event.shiftKey) return
              event.preventDefault()
              event.currentTarget.blur()
            }}
            onBlur={(event) => {
              const title = event.target.value.trim()
              if (title && title !== item.title) void vigil.saveItem(item.id, { title }).then(() => chime('noted'))
            }}
          />
          <p className="mt-1 mb-2 text-control text-muted-foreground">
            <Rolling by="word" text={`${settled ?? heldFor(item.createdAt).replace(/^h/, 'H')} · ${cluesSaid(item.glosses.length)}`} />
          </p>
        </div>
        {past ? (
          <MindflowEditor key={`past-${past.key}`} defaultContent={(past.body as JSONContent | string | null) ?? ''} readOnly toolbar={false} handles={false} slash={false} outline={false} search={false} autofocus={false} />
        ) : (
          <MindflowEditor
            key={restored?.rev ?? 0}
            host={window.api}
            tokens={TAGS}
            onTokenClick={(token) => token.name === 'tag' && onOpen?.('tag', token.value)}
            toolbar={{ fixed: false }}
            documentId={`item-${item.id}`}
            onTitleOut={showTopTitle}
            placeholder="Write around it, however it asks to be written…"
            defaultContent={((restored ? restored.body : item.body) as JSONContent | string | null) ?? ''}
            findNotes={findCaptures}
            findHeadings={findHeadings}
            onOpenNote={(link, heading) => onOpen && follow(link, onOpen, heading)}
            autofocus={false}
            after={<><Clues item={item} /><Mentions id={item.id} onOpen={onOpen} /></>}
            onReady={(instance) => void (seen.current = JSON.stringify(instance.getJSON()))}
            onChange={(body) => {
              // The editor tidying a document as it opens is not an edit.
              const now = JSON.stringify(body)
              if (now === seen.current) return
              seen.current = now
              void vigil.saveItem(item.id, { body })
            }}
          />
        )}
      </div>

      <Props>
        <Island compact title="Holding">
          <Prop icon={Orbit} active>{settled ?? <Rolling by="word" text={heldFor(item.createdAt).replace(/^h/, 'H')} />}</Prop>
          {!item.closedAt && (
            <Prop icon={inView ? Pin : PinOff} active={inView} onClick={() => void pinQuestion(item.id, item.title, !inView)}>
              {inView ? 'In view: shows while you capture' : 'Keep in view while capturing'}
            </Prop>
          )}
          <Prop icon={Calendar}>Since {when(item.createdAt)}{new Date(item.createdAt).getFullYear() !== new Date().getFullYear() ? ` ${new Date(item.createdAt).getFullYear()}` : ''}</Prop>
        </Island>
        <Island compact title={item.closedAt ? 'Settled' : 'When it comes clear'}>
          {item.closedAt ? (
            <Prop icon={RotateCcw} onClick={holdAgain}>Hold it again</Prop>
          ) : (
            <>
              <Prop icon={Lightbulb} onClick={gotIt}>I've got it: start the article</Prop>
              <Prop icon={Wind} onClick={letGo}>Let it go</Prop>
            </>
          )}
        </Island>
        <Island compact title="Surfacing">
          <Prop icon={item.private ? EyeOff : Eye} active={!!item.private} onClick={() => void vigil.setPrivate('nuggets', item.id, !item.private)}>
            {item.private ? 'Private: never comes back unasked' : 'Can come back to you'}
          </Prop>
          <Prop icon={item.archivedAt ? ArchiveRestore : Archive} active={!!item.archivedAt} onClick={() => void archive('nuggets', [item.id], !item.archivedAt)}>
            {item.archivedAt ? 'Archived: bring it back' : 'Archive'}
          </Prop>
        </Island>
        <Aliases table="nuggets" id={item.id} />
        <Lineage id={item.id} onOpen={onOpen} />
        <LocalGraph id={item.id} title={item.title} onOpen={onOpen} />
        <Island compact title="Details">
          <Prop icon={Download} onClick={() => void saveAttachments([{ table: 'nuggets', id: item.id }])}>Save its pictures and files…</Prop>
        </Island>
      </Props>
    </div>
  )
}

const whenLower = (at: string): string => {
  const said = when(at)
  return /^(Today|Tomorrow|Yesterday)$/.test(said) ? said.toLowerCase() : `on ${said}`
}

/**
 * The clues: dated, newest first, one row each and never an edit, so the way
 * your thinking moved stays readable. A line at the top takes the next one.
 */
function Clues({ item }: { item: ItemFull }): React.JSX.Element {
  const [words, setWords] = useState('')
  const clues = [...item.glosses].reverse()
  const keep = (): void => {
    const text = words.trim()
    if (!text) return
    setWords('')
    void vigil.addClue(item.id, text).then((clue) => {
      chime('clue')
      toast('A clue, kept', clue ? () => void vigil.dropClue(clue) : undefined)
    })
  }
  return (
    <section data-chrome className="page-narrow mx-auto mt-6 w-full border-t px-10 pt-4 text-body">
      <h3 className="mb-2 flex items-baseline gap-1.5 px-2 text-meta text-muted-foreground">
        Clues {clues.length > 0 && <Rolling text={clues.length} className="tabular-nums" />}
      </h3>
      <div className="mx-2 mb-3 flex items-start gap-2 rounded-lg border bg-accent/30 px-3 py-2 focus-within:border-foreground/25">
        <Plus className="mt-1 size-3.5 shrink-0 text-muted-foreground" />
        <textarea
          rows={1}
          value={words}
          onChange={(event) => setWords(event.target.value)}
          onKeyDown={(event) => {
            event.stopPropagation()
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              keep()
            }
            if (event.key === 'Escape') event.currentTarget.blur()
          }}
          placeholder="A clue: something you noticed, felt, or heard"
          className="min-w-0 flex-1 resize-none bg-transparent text-control outline-none [field-sizing:content] placeholder:text-foreground/60"
        />
        {words.trim() && <span className="mt-0.5 flex shrink-0 items-center gap-1 text-xs text-muted-foreground"><Kbd>↵</Kbd></span>}
      </div>
      {clues.length ? (
        <ol className="flex flex-col">
          <AnimatePresence initial={false}>
            {clues.map((clue) => (
              <motion.li
                key={clue.id}
                layout
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                className="grid grid-cols-[4.5rem_1fr] gap-3 rounded-md px-2 py-1.5"
              >
                <span className="pt-px text-xs text-muted-foreground tabular-nums">{clueDate(clue.createdAt)}</span>
                <span className="min-w-0">
                  <span className="private-text block whitespace-pre-line">{clue.body}</span>
                  {clue.sourceKey && <span className="text-xs text-muted-foreground">from {clue.sourceKey}</span>}
                </span>
              </motion.li>
            ))}
          </AnimatePresence>
        </ol>
      ) : (
        <p className="px-2 pb-2 text-control text-muted-foreground">
          <Typed text="No clues yet. Add one whenever it crosses your mind, from here, from the box with + and the question's name, or from any capture with H." step={28} />
        </p>
      )}
    </section>
  )
}

/** A clue's date: the day, and the year once it is not this one. */
const clueDate = (at: string): string => {
  const date = new Date(at)
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', ...(date.getFullYear() !== new Date().getFullYear() ? { year: 'numeric' } : {}) })
}

/**
 * A question still open, come back as a hint: things come back to you. Open
 * it, or drop a clue into it right here, or let it pass.
 */
export function QuestionBack({ back, onOpen, onDone }: {
  back: { id: string; title: string; createdAt: string; clues: number }
  onOpen: (type: string, id: string) => void
  onDone: () => void
}): React.JSX.Element {
  const [adding, setAdding] = useState(false)
  return (
    <>
      <p className="text-sm">
        <Typed text={`Still open: ${back.title}`} step={28} delay={120} />
      </p>
      {adding ? (
        <Input
          autoFocus
          placeholder="A clue: what you have noticed since. Enter keeps it"
          onBlur={() => setAdding(false)}
          onKeyDown={(event) => {
            event.stopPropagation()
            if (event.key === 'Escape') return setAdding(false)
            const text = event.currentTarget.value.trim()
            if (event.key !== 'Enter' || !text) return
            void vigil.addClue(back.id, text).then((clue) => {
              chime('clue')
              toast('A clue, kept', clue ? () => void vigil.dropClue(clue) : undefined)
              onDone()
            })
          }}
          className="mt-2 h-8 w-full"
        />
      ) : (
        <div className="mt-2 flex items-center gap-1 text-muted-foreground">
          <span className="mr-auto flex items-center gap-1.5 text-xs">
            <Orbit className="size-3.5" />
            <Rolling by="word" text={`${heldFor(back.createdAt)} · ${cluesSaid(back.clues)}`} />
          </span>
          <Button variant="ghost" size="sm" onClick={() => (chime('open'), onOpen('question', back.id), onDone())}>Open</Button>
          <Tip label="Drop a clue into it without leaving the box">
            <Button variant="ghost" size="sm" onClick={() => (chime('tap'), setAdding(true))}>Add a clue</Button>
          </Tip>
          <Button variant="ghost" size="sm" onClick={() => (chime('fold'), onDone())}>Not now</Button>
        </div>
      )}
    </>
  )
}
