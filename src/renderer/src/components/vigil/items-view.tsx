import { chime } from '@/lib/sound'
import { useEffect, useRef, useState } from 'react'
import type { Editor, JSONContent } from '@tiptap/core'
import { BookOpen, Brain, Calendar, Eye, EyeOff, FileText, History, Layers, Pause, Pin, Play, Plus, Quote, RefreshCw, SquareDashed, TriangleAlert, X } from 'lucide-react'

import { AnimatePresence, motion } from 'motion/react'

import { MindflowEditor, TAGS } from '../mindflow'
import { textOf } from '../rot-cards'
import { firstLineOf } from '@/extensions/tokens'
import { selectionActions } from './selection-actions'
import { ReadThrough } from './read-through'
import { CAPTURE_TYPES, CaptureKindPicker, type CaptureType } from '../capture-kinds/capture-kind-picker'
import { age } from '../capture-list'
import { findCaptures, findHeadings, follow } from '@/lib/capture-links'
import { interval, splitTags, useLive, vigil, when, whenInLine, type Item, type ItemFull } from '@/lib/vigil'
import { makeTask } from '@/lib/tasks'
import { useSameWords } from '@/lib/same-words'
import { Empty, Island, Page, Prop, Props, Tags, refuse, toast, useListKeys, useReadKey, typing, pin, VirtualList, Stepper, startAt, Rolling, Typed, showTopTitle } from './ui'
import { AGES, Display, arrange, period, useView, type Facet } from './display'
import { RowMenu, copy, type MenuItem } from './row-menu'
import { stickOnDesktop } from './sticky-note'
import { Lineage } from './lineage'
import { ReviewHistory } from './review-view'
import { Mentions } from './mentions'
import * as chrono from 'chrono-node'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Kbd, Tip } from '@/components/vigil/ui'
import { Button } from '@/components/ui/button'
import BookIcon from '@/components/ui/book-icon'
import { AliveIcon } from '@/components/vigil/alive-icon'
import AlarmClockPlusIcon from '@/components/ui/alarm-clock-plus-icon'
import { Archive, ArchiveRestore, Download } from 'lucide-react'
import { Aliases, KindFields, LayoutToggle, LocalGraph, NoteCards, NoteHeader, Thumb, useLayout } from './note-extras'
import { SortableList, SortableRow } from './sortable'
import { archive, changeKind, openWindow, saveAttachments, useOpenNote, useOwnOrder } from '@/lib/notes'
import { QuestionDetail } from './questions-view'
import { GlossTimeline } from './gloss-line'
import { dayjs, moment, num } from '../../../../main/dates'

const kindOf = (id: string): (typeof CAPTURE_TYPES)[number] => CAPTURE_TYPES.find((type) => type.id === id) ?? CAPTURE_TYPES[0]

/**
 * Nuggets and articles: the kept tiers. A nugget reads as its own words, two
 * lines of them, with a line saying how it comes back; an article as a titled
 * document. Same row underneath, so one view, drawn two ways.
 */
export function ItemsView({ tier, focus, onOpen }: { tier: 'nugget' | 'article'; focus?: string; onOpen?: (type: string, id: string) => void }): React.JSX.Element {
  const all = useLive(() => vigil.items(tier), [] as Item[], [tier], ['item'])
  const { groups, display, move, moveBy } = useItemDisplay(tier, all)
  const items = groups.flatMap(([, list]) => list)
  const [layout, setLayout] = useLayout(tier)
  const onMove = (id: string, target: string, after: boolean): void => move(all.map((one) => one.id), id, target, after)
  // Each group's name, on its first row.
  const heads = new Map(groups.map(([name, list]) => [list[0], name]))
  const [open, setOpen] = useState<ItemFull | null>(null)
  const pick = (id: string): void => void vigil.item(id).then(setOpen)
  // Opened in a window of its own: closed here, so only one editor saves it.
  useEffect(() => {
    const onApart = (event: Event): void => setOpen((was) => (was?.id === (event as CustomEvent).detail ? null : was))
    window.addEventListener('vigil:opened-apart', onApart)
    return () => window.removeEventListener('vigil:opened-apart', onApart)
  }, [])
  const [cursor, setCursor] = useListKeys(items.length, { onOpen: (index) => pick(items[index].id), onBack: () => setOpen(null) })
  // ⌥↑ and ⌥↓ (or ⌥K and ⌥J) move the row under the cursor in your own order.
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (!event.altKey || event.metaKey || event.ctrlKey || typing()) return
      const by = event.key === 'ArrowUp' || event.code === 'KeyK' ? -1 : event.key === 'ArrowDown' || event.code === 'KeyJ' ? 1 : 0
      const row = items[cursor]
      if (!by || !row) return
      event.preventDefault()
      if (moveBy(items.map((one) => one.id), row.id, by)) setCursor(cursor + by)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })
  // Reading through what is shown, one at a time with nothing else on screen.
  const [readFrom, setReadFrom] = useState<number | null>(null)
  useReadKey(() => setReadFrom(startAt(items, open?.id, cursor)), items.length)
  // x selects, the way Linear does it; several nuggets make one article.
  const [chosen, setChosen] = useState<string[]>([])
  // The Luhmann move: two unrelated nuggets side by side, for the connection
  // nobody would have gone looking for.
  const [pair, setPair] = useState<Awaited<ReturnType<typeof vigil.random>>>([])
  const toggle = (id: string): void => setChosen((ids) => (chime(ids.includes(id) ? 'off' : 'on'), ids.includes(id) ? ids.filter((one) => one !== id) : [...ids, id]))
  const at = useRef(cursor)
  at.current = cursor
  useEffect(() => {
    if (tier !== 'nugget') return
    const onKey = (event: KeyboardEvent): void => {
      if (typing()) return
      // Escape lets the selection go, and only that: taken first, so the
      // list does not also close what is open.
      if (event.key === 'Escape' && chosen.length) {
        event.preventDefault()
        chime('off')
        return setChosen([])
      }
      if (event.key !== 'x') return
      const item = items[at.current]
      if (item) toggle(item.id)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [items, tier, chosen.length])
  useEffect(() => {
    if (focus) pick(focus)
  }, [focus])
  // Re-read the open one when anything changes, so a gloss or a prompt shows.
  useEffect(() => window.api.captures.onChange(() => open && pick(open.id)), [open?.id])
  // The right-click menu: the same on a row and on a card.
  const menuFor = (item: Item): MenuItem[] => [
    { label: 'Open', keys: '↵', run: () => pick(item.id) },
    'separator',
    { label: item.pinnedAt ? 'Unpin' : 'Pin to the prompt', run: () => pin('nuggets', item.id, !item.pinnedAt) },
    ...itemMenu(item),
    tier === 'nugget' && { label: chosen.includes(item.id) ? 'Unselect' : 'Select', keys: 'X', run: () => toggle(item.id) },
    'separator',
    { label: 'Copy title', run: () => copy(item.title) }
  ]

  return (
    <>
      <Page aside={!!open}
        title={tier === 'nugget' ? 'Nuggets' : 'Articles'}
        count={items.length}
        actions={
          chosen.length ? (
            <span className="flex items-center gap-2 text-muted-foreground">
              <Rolling text={chosen.length} /> selected
              <Button variant="secondary" size="sm"
 
 onClick={() => void vigil.article(chosen).then((id) => {
 // The same words and the same landing as the prompt's: the article opens.
 chime('promote')
 toast(chosen.length > 1 ? `An article, from ${num(chosen.length)} nuggets` : 'An article, from this nugget')
 setChosen([])
 pick(id)
 })}
>
                Start an article
              </Button>
              <Tip label="Clear">
              <Button variant="ghost" size="icon-sm" onClick={() => setChosen([])}>
                <X className="size-3.5" />
              </Button>
              </Tip>
            </span>
          ) : (
            <span className="flex items-center gap-2 text-xs">
              {tier === 'nugget' && items.length > 1 && (
                <>
                  <span className="whitespace-nowrap"><Kbd>x</Kbd> to select</span>
                  <Button variant="ghost" size="sm" onClick={() => void vigil.random().then(setPair)}>
                    Two at random
                  </Button>
                </>
              )}
              {tier === 'article' && (
                <Button variant="ghost" size="sm" onClick={() => void vigil.newArticle().then((id) => (chime('promote'), pick(id)))}>
                  <Plus className="size-3.5" /> New article
                </Button>
              )}
              <Tip label="One note at a time, full screen, from the highlighted one  ⇧⌘R">
                <Button variant="ghost" size="sm" onClick={() => setReadFrom(startAt(items, open?.id, cursor))} disabled={!items.length}><AliveIcon icon={BookIcon} size={14} /> Read list</Button>
              </Tip>
              <LayoutToggle layout={layout} onChange={setLayout} />
              {display}
            </span>
          )
        }
      >
        <AnimatePresence>
          {pair.length === 2 && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden border-b"
            >
              <div className="grid grid-cols-2 gap-6 px-5 py-4">
                {pair.map((one) => (
                  <button key={one.id} type="button" onClick={() => pick(one.id)} className="line-clamp-5 self-start text-left whitespace-pre-line hover:text-foreground">
                    {textOf(one.body)}
                  </button>
                ))}
              </div>
              <p className="px-5 pb-3 text-xs text-muted-foreground">
                What connects these? <button type="button" className="underline-offset-2 hover:underline" onClick={() => setPair([])}>Close</button>
              </p>
            </motion.div>
          )}
        </AnimatePresence>
        {items.length && layout === 'cards' ? (
          <NoteCards table="nuggets" cards={items.map((one) => ({ id: one.id, title: one.title, kind: one.kind, type: tier, dim: !!one.suspended, private: !!one.private }))} selected={open?.id} cursor={cursor} onPick={pick}
            menu={(card) => menuFor(items.find((one) => one.id === card.id)!)} />
        ) : items.length ? (
          <SortableList items={items} keyOf={(item) => item.id} onMove={onMove}>
          {(items) => (
          <VirtualList items={items} keyOf={(item) => item.id} cursor={cursor} estimate={60} className="mx-3 my-2">
            {(item, index) => (
              <SortableRow id={item.id}>
              <div className="flex flex-col">
              {heads.get(item) && <div className={`px-2 pb-1 text-xs text-muted-foreground ${index === 0 ? 'pt-1' : 'pt-4'}`}>{heads.get(item)}</div>}
              <RowMenu items={menuFor(item)}>
              <button
                data-cursor={index === cursor || undefined}
                data-private={item.private ? "" : undefined}
                data-open={item.id === open?.id ? "" : undefined}
                type="button"
                data-row
                // ⌘-click: a window of its own, as in every other list; shift-click selects.
                onClick={(event) => (event.metaKey ? openWindow(tier, item.id) : event.shiftKey ? toggle(item.id) : pick(item.id))}
                className={`relative rounded-sm px-2 py-1.5 text-left transition-colors ${chosen.includes(item.id) ? 'bg-[color-mix(in_srgb,var(--tt-brand-color-400)_14%,transparent)]' : item.id === open?.id ? 'bg-accent' : index === cursor ? 'bg-accent/50' : 'hover:bg-accent/50'} ${item.suspended ? 'opacity-50' : ''}`}
              >
                {tier === 'nugget' ? <NuggetRow item={item} /> : <ArticleRow item={item} />}
              </button>
              </RowMenu>
              </div>
              </SortableRow>
            )}
          </VirtualList>
          )}
          </SortableList>
        ) : tier === 'nugget' ? (
          <Empty shape={['star', 3]} title="Nothing kept yet">
            A nugget is a capture worth keeping, cleaned up so it reads cold. Promote one from the inbox or a rot card and it lands here, ready to come back to you.
          </Empty>
        ) : (
          <Empty shape={['rectangle', 2]} title="No articles yet">
            An article is your own words on one idea: notes on linear algebra, a thesis, a guide. Start one from nothing with New article, or from nuggets with “Start an article”.
          </Empty>
        )}
      </Page>
      {readFrom !== null && (
        <ReadThrough
          items={items.map((one) => ({ type: tier, id: one.id }))}
          start={readFrom}
          onClose={() => setReadFrom(null)}
          onEdit={(_, id) => {
            setReadFrom(null)
            pick(id)
          }}
        />
      )}
      {open && <ItemDetail top={<Stepper at={items.findIndex((one) => one.id === open.id)} total={items.length} onStep={(to) => pick(items[to].id)} />} key={open.id} item={open} onOpen={(type, id) => (type === tier ? pick(id) : onOpen?.(type, id))} />}
    </>
  )
}

/** A nugget's card: the kind, the words, and how it returns. */
function NuggetRow({ item }: { item: Item }): React.JSX.Element {
  const kind = kindOf(item.kind)
  const recall = !!item.prompt
  const { text, tags } = splitTags(item.title)
  return (
    <>
      <span className="flex items-start gap-2">
        <kind.icon className="mt-0.5 size-4 shrink-0" style={{ color: kind.tint }} />
        <span className="private-text line-clamp-2 flex-1">{text || 'Untitled'}</span>
        <Thumb id={item.id} />
      </span>
      <span className="mt-1 flex items-center gap-3 pl-6 text-xs text-muted-foreground">
        {/* Pointed at, a tested one shows its own past in review. */}
        <Tip label={recall && item.reviewed ? <ReviewHistory id={item.id} /> : null}>
        <span className="flex items-center gap-1">
          {recall ? <Brain className="size-3" /> : item.mode === 'pushed' ? <RefreshCw className="size-3" /> : <Eye className="size-3" />}
          <Rolling by="word" text={recall ? (item.dueAt ? `Recall · ${new Date(item.dueAt) <= new Date() ? 'due' : `in ${interval(item.dueAt)}`}` : 'Recall · new') : item.mode === 'pushed' ? 'On rotation' : 'Now and then'} />
        </span>
        </Tip>
        <Tags tags={tags} />
        {item.supersededBy && <span className="text-[var(--tt-color-text-orange)]">Superseded</span>}
        {item.lapses >= 4 && <TriangleAlert className="size-3 text-[var(--tt-color-text-orange)]" />}
        {item.pinnedAt && <Pin className="size-3" />}
        {item.private ? <EyeOff className="size-3" aria-label="Private" /> : null}
        <span className="ml-auto tabular-nums">{age(item.createdAt)}</span>
      </span>
    </>
  )
}

/** An article's line: a document, titled, dated. */
function ArticleRow({ item }: { item: Item }): React.JSX.Element {
  return (
    <span className="flex items-center gap-3">
      <FileText className="size-4 shrink-0 text-muted-foreground" />
      <span className="private-text flex-1 truncate">{item.title || 'Untitled'}</span>
      <Thumb id={item.id} className="size-7" />
      <span className="shrink-0 text-xs text-muted-foreground">{when(item.createdAt)}</span>
    </span>
  )
}

/** The open nugget, article or question, wherever it is opened: a question is drawn its own way. */
/** What a nugget or an article offers besides opening and pinning: its row menu and its note's dots share it. */
const itemMenu = (item: Item): MenuItem[] => [
  { label: item.private ? 'Not private' : 'Private', run: () => void vigil.setPrivate('nuggets', item.id, !item.private) },
  { label: 'Stick on the desktop', run: () => stickOnDesktop('nugget', item.id) },
  { label: 'Open in a new window', keys: '⌘-click', run: () => openWindow(item.tier, item.id) },
  'separator',
  item.tier === 'nugget' && { label: 'Change kind…', run: () => void changeKind('nuggets', item.id, item.kind) },
  { label: item.archivedAt ? 'Unarchive' : 'Archive', run: () => void archive('nuggets', [item.id], !item.archivedAt) },
  { label: 'Save its pictures and files…', run: () => void saveAttachments([{ table: 'nuggets', id: item.id }]) }
]

export function ItemDetail(props: { item: ItemFull; onOpen?: (type: string, id: string) => void; top?: React.ReactNode }): React.JSX.Element {
  return props.item.tier === 'question' ? <QuestionDetail {...props} /> : <NuggetDetail {...props} />
}

/** The open nugget or article: its words, its glosses, and down the right how it comes back. */
function NuggetDetail({ item, onOpen, top }: { item: ItemFull; onOpen?: (type: string, id: string) => void; top?: React.ReactNode }): React.JSX.Element {
  const [prompt, setPrompt] = useState(item.prompt ?? '')
  const glossWords = item.glosses.filter((one) => one.author === 'user').reduce((sum, one) => sum + one.body.split(/\s+/).filter(Boolean).length, 0)
  const editor = useRef<Editor | null>(null)
  // The words as opened or last saved, to tell a real edit from the editor settling.
  const seen = useRef<{ body: string; line: string } | null>(null)
  // An earlier version, shown in place of the editor while you look back; and
  // the words read again after one is restored, with a new key so the editor
  // opens on them.
  const [past, setPast] = useState<{ body: unknown; key: string } | null>(null)
  const [restored, setRestored] = useState<{ body: unknown; rev: number } | null>(null)
  // Saved only over the words it was opened on: another window's never lost.
  const words = useSameWords('nuggets', item.id, restored ? restored.body : item.body, (id, body, base) => vigil.saveItem(id, { body, base }))
  useOpenNote({ table: 'nuggets', type: item.tier, id: item.id, kind: item.kind, archived: !!item.archivedAt })
  // A cloze: the words you selected, blanked. Two keystrokes and no writing,
  // the cheapest way to make something testable, and right for a name or a
  // number; anything with a "because" in it is better as a question.
  const cloze = (): void => {
    const view = editor.current
    const { from, to } = view?.state.selection ?? { from: 0, to: 0 }
    const words = view?.state.doc.textBetween(from, to).trim()
    if (!view || !words) return refuse('Select the words to blank out first')
    const text = view.getText().replace(words, '_____')
    setPrompt(text)
    void vigil.saveItem(item.id, { prompt: text }).then(() => toast('Cloze made: it joins the review queue'))
  }
  const savePrompt = (): void => {
    if ((item.prompt ?? '') === prompt.trim()) return
    void vigil.saveItem(item.id, { prompt: prompt.trim() || null }).then(() =>
      toast(prompt.trim() ? 'Now tested: it will come up in review' : 'Back to coming up on its own')
    )
  }

  return (
    <div className="note-pane flex min-w-0 flex-[1.4] flex-col overflow-y-auto [--mf-padding:1rem_1.5rem_1rem_3.25rem] @[40rem]/page:flex-row @[40rem]/page:overflow-visible @[40rem]/page:[--mf-padding:1rem_4.75rem] @[56rem]/page:border-l [&>*:first-child]:min-h-[22rem] [&>*:first-child]:shrink-0 @[40rem]/page:[&>*:first-child]:min-h-0 @[40rem]/page:[&>*:first-child]:shrink">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col pt-6">
        <NoteHeader className="-mt-3 mb-1" left={top} type={item.tier} table="nuggets" id={item.id} onShow={(body, key) => setPast(body === null ? null : { body, key: key ?? '' })}
          onRestored={() => void vigil.item(item.id).then((fresh) => fresh && setRestored((was) => ({ body: fresh.body, rev: (was?.rev ?? 0) + 1 })))}
          edited={item.updatedAt} captured={item.createdAt} made={item.tier === 'article' ? 'Started' : 'Kept'}
          pinned={!!item.pinnedAt} onPin={() => pin('nuggets', item.id, !item.pinnedAt)}
          menu={[...itemMenu(item), 'separator', { label: 'Copy title', run: () => copy(item.title) }]} />
        {item.tier === 'article' && (
          <input
            className="page-narrow mx-auto mb-2 block w-full bg-transparent px-12 font-heading text-title font-semibold tracking-[-0.018em] text-balance outline-none placeholder:text-foreground/70"
            defaultValue={item.title}
            // A new article starts in its title, the stand-in name selected
            // so typing replaces it, and the button that made it does not
            // keep the keys.
            autoFocus={!item.title || item.title === 'Untitled'}
            onFocus={(event) => void (event.target.value === 'Untitled' && event.target.select())}
            placeholder="Untitled"
            onBlur={(event) => void vigil.saveItem(item.id, { title: event.target.value })}
          />
        )}
        {past ? (
          <MindflowEditor
            key={`past-${past.key}`}
            defaultContent={(past.body as JSONContent | string | null) ?? ''}
            readOnly
            toolbar={false}
            handles={false}
            slash={false}
            outline={false}
            search={false}
            autofocus={false}
          />
        ) : (
        <MindflowEditor
          key={restored?.rev ?? 0}
          host={window.api}
          tokens={TAGS}
          // A tag opens its page: everything carrying it.
          onTokenClick={(token) => token.name === 'tag' && onOpen?.('tag', token.value)}
          toolbar={{ fixed: false, selectionExtra: selectionActions({ captureId: item.captureId ?? undefined, attribution: item.attribution, from: item.id }) }}
          documentId={`item-${item.id}`}
          onTitleOut={showTopTitle}
          defaultContent={((restored ? restored.body : item.body) as JSONContent | string | null) ?? ''}
          findNotes={findCaptures}
          findHeadings={findHeadings}
          onOpenNote={(link, heading) => onOpen && follow(link, onOpen, heading)}
          after={<Mentions id={item.id} onOpen={onOpen} />}
          onReady={(instance) => {
            seen.current = { body: JSON.stringify(instance.getJSON()), line: firstLineOf(instance.state.doc)?.text ?? '' }
            words.ready(instance)
          }}
          onChange={(body, instance) => {
            editor.current = instance
            // The editor can tidy a document as it opens (a list first, say);
            // that is not an edit, and saving it once wiped a nugget's title.
            const now = { body: JSON.stringify(body), line: firstLineOf(instance.state.doc)?.text ?? '' }
            if (now.body === seen.current?.body) return
            // Named for its first line with words, and only when that line
            // changed: a blank one, or one the title never came from, keeps it.
            const title = item.tier === 'nugget' && now.line && now.line !== seen.current?.line ? now.line : undefined
            seen.current = now
            words.save(body, instance)
            if (title) void vigil.saveItem(item.id, { title })
          }}
        />
        )}

      </div>

      <Props>
        {item.tier === 'nugget' && (
          <>
            <Island compact title="Kind">
              <CaptureKindPicker flat value={item.kind as CaptureType} onChange={(kind) => void changeKind('nuggets', item.id, item.kind, kind)} />
            </Island>
            <KindFields table="nuggets" id={item.id} kind={item.kind} onOpen={onOpen} />
          </>
        )}
        <Aliases table="nuggets" id={item.id} />

        <Island compact title="Review">
          <Prop icon={item.prompt ? Brain : item.mode === 'pushed' ? RefreshCw : Eye} active>
            <Rolling by="word" text={item.prompt ? 'Tested, on a schedule' : item.mode === 'pushed' ? 'On rotation, always' : 'Now and then, as a hint'} />
          </Prop>
          {!item.prompt && (
            // Pushed: a standing principle that should keep coming round, the
            // note-to-self's way, rather than turning up by chance.
            <Prop
              icon={item.mode === 'pushed' ? Eye : RefreshCw}
              onClick={() => void vigil.saveItem(item.id, { mode: item.mode === 'pushed' ? 'encounter' : 'pushed' }).then(() =>
                (chime(item.mode === 'pushed' ? 'off' : 'on'), toast(item.mode === 'pushed' ? 'Back to turning up by chance' : 'On rotation: it will keep coming back')))}
            >
              {item.mode === 'pushed' ? 'Only now and then' : 'Keep showing me this'}
            </Prop>
          )}
          <Textarea
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            onBlur={savePrompt}
            rows={3}
            placeholder="A question this answers. Empty, it comes back on its own."
            className="resize-none text-control"
          />
          <Prop icon={SquareDashed} onClick={cloze}>Blank the selected words</Prop>
          {item.dueAt && <Prop icon={Calendar}>Next review {when(item.dueAt, false)}</Prop>}
          {!!item.reviewed && <div className="px-2 py-1.5 text-muted-foreground"><ReviewHistory id={item.id} /></div>}
          {item.lapses >= 4 && (
            <p className="px-2 py-1.5 text-xs leading-relaxed text-[var(--tt-color-text-orange)]">
              <Typed text={`Forgotten ${item.lapses} times. That is usually the prompt, not you: try rewriting it.`} step={28} />
            </p>
          )}
          <Prop
            icon={item.suspended ? Play : Pause}
            onClick={() => void vigil.saveItem(item.id, { suspended: !item.suspended }).then(() => (chime(item.suspended ? 'on' : 'off'), toast(item.suspended ? 'Back in rotation' : 'Suspended until you bring it back')))}
          >
            {item.suspended ? 'Bring back into rotation' : 'Suspend'}
          </Prop>
        </Island>

        <Island compact title="Surfacing">
          <Prop icon={item.private ? EyeOff : Eye} active={!!item.private} onClick={() => void vigil.setPrivate('nuggets', item.id, !item.private)}>
            {item.private ? 'Private' : 'Can surface any time'}
          </Prop>
          <Prop icon={Pin} active={!!item.pinnedAt} onClick={() => pin('nuggets', item.id, !item.pinnedAt)}>
            {item.pinnedAt ? 'Pinned' : 'Pin to the prompt'}
          </Prop>
          <RemindMe table="nuggets" id={item.id} at={item.remindAt} />
          <Prop icon={item.archivedAt ? ArchiveRestore : Archive} active={!!item.archivedAt} onClick={() => void archive('nuggets', [item.id], !item.archivedAt)}>
            {item.archivedAt ? 'Archived: bring it back' : 'Archive'}
          </Prop>
        </Island>

        {item.tier === 'nugget' ? (
          <>
            <Island compact title="Context">
              <Textarea
                defaultValue={item.context ?? ''}
                onBlur={(event) => void vigil.saveItem(item.id, { context: event.target.value.trim() || null })}
                rows={2}
                placeholder="What makes the answer make sense: shown after it in review"
                className="resize-none text-control"
              />
            </Island>
            <Island compact title="Why">
              <Textarea
                defaultValue={item.why ?? ''}
                onBlur={(event) => void vigil.saveItem(item.id, { why: event.target.value.trim() || null })}
                rows={1}
                placeholder="Why the answer is so, in a line: under it in review"
                className="resize-none text-control"
              />
            </Island>
            <Island compact title="Grow it">
              {/* Two hundred words of your own beside it is an article written
                  without noticing: said, never automated. */}
              {glossWords >= 200 && (
                <p className="px-2 py-1.5 text-xs leading-relaxed text-[var(--tt-color-text-purple)]">
                  Your glosses here run to {num(glossWords)} words: that is an article already. Start one and they come with it.
                </p>
              )}
              <Prop icon={Plus} onClick={() => void vigil.article([item.id]).then((id) => { chime('promote'); toast('An article, from this nugget'); onOpen?.('article', id) })}>
                Start an article
              </Prop>
              <StudyThis item={item} />
            </Island>
          </>
        ) : (
          <Island compact title="Made from">
            <Prop icon={Layers}>{item.origins.length ? `${num(item.origins.length)} nugget${item.origins.length === 1 ? '' : 's'}` : 'Written from scratch'}</Prop>
          </Island>
        )}
        <Lineage id={item.id} onOpen={onOpen} />
        <LocalGraph id={item.id} title={item.title} onOpen={onOpen} />
        <Island compact title="Wrong?">
          {item.supersededBy ? (
            <Prop icon={TriangleAlert}>Superseded: out of review, kept beside its correction</Prop>
          ) : (
            <Supersede item={item} />
          )}
        </Island>
        <Island compact title="Where it came from">
          <label className="flex items-center gap-2 px-2 py-1.5 focus-within:text-foreground hover:bg-accent">
            <Quote className="size-4 shrink-0" />
            <input
              defaultValue={item.attribution ?? ''}
              placeholder="Who, or where from"
              onBlur={(event) => void vigil.saveItem(item.id, { attribution: event.target.value.trim() || null })}
              className="min-w-0 flex-1 bg-transparent text-control outline-none placeholder:text-foreground/70"
            />
          </label>
        </Island>
        <Island compact title="Details">
          <Prop icon={Calendar}>Kept {when(item.createdAt)}</Prop>
          {item.revisions > 0 && <Prop icon={History}>Rewritten {item.revisions === 1 ? 'once' : `${item.revisions} times`}</Prop>}
          <Prop icon={Download} onClick={() => void saveAttachments([{ table: 'nuggets', id: item.id }])}>Save its pictures and files…</Prop>
        </Island>

        {/* Glosses: present-you beside the material, one row each and never an
            edit, so the history of your thinking about it stays readable. */}
        <GlossTimeline id={item.id} />
      </Props>
    </div>
  )
}

/**
 * A reminder is a pin with a date: pick a time and the item pins itself to the
 * prompt when it comes round. The only kind of nudge that runs on your clock.
 */
export function RemindMe({ table, id, at }: { table: 'captures' | 'nuggets'; id: string; at: string | null }): React.JSX.Element {
  // Linear's picker: say when in words, or take one of four, each showing the
  // date it lands on.
  const [open, setOpen] = useState(false)
  const [words, setWords] = useState('')
  const nine = (days: number): Date => dayjs().add(days, 'day').hour(9).startOf('hour').toDate()
  const presets: [string, Date][] = [
    ['An hour from now', dayjs().add(1, 'hour').toDate()],
    ['Tomorrow', nine(1)],
    ['Next week', nine(7)],
    ['A month from now', nine(30)]
  ]
  const typed = words.trim() ? chrono.parseDate(/^\d+ \w+$/.test(words.trim()) ? `in ${words}` : words, new Date(), { forwardDate: true }) : null
  const set = (date: Date | null): void => {
    setOpen(false)
    setWords('')
    void vigil.remind(table, id, date ? date.toISOString() : null).then(() =>
      (chime(date ? 'pin' : 'off'), toast(date ? `Pins itself in the box's Inbox ${whenInLine(date.toISOString(), false)}, with a "waiting" chip at the top of the box` : 'Reminder cleared')))
  }
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-accent hover:text-foreground">
          <AliveIcon icon={AlarmClockPlusIcon} size={16} />
          <span className="text-control">{at ? `Reminds ${whenInLine(at, false)}` : 'Remind me…'}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 gap-0 p-1 text-sm">
        <input
          autoFocus
          value={words}
          onChange={(event) => setWords(event.target.value)}
          onKeyDown={(event) => event.key === 'Enter' && typed && set(typed)}
          placeholder="Try: 4 pm, 2 days, in 5 weeks…"
          className="w-full border-b bg-transparent px-2 py-2 outline-none placeholder:text-foreground/70"
        />
        {(typed ? [[words, typed] as [string, Date]] : presets).map(([label, date]) => (
          <button key={label} type="button" onClick={() => set(date)} className="flex w-full items-center justify-between rounded-md px-2 py-1.5 hover:bg-accent">
            <span>{label}</span>
            <span className="text-xs text-muted-foreground">{moment(date)}</span>
          </button>
        ))}
        {at && <button type="button" onClick={() => set(null)} className="w-full rounded-md px-2 py-1.5 text-left text-muted-foreground hover:bg-accent">Clear the reminder</button>}
      </PopoverContent>
    </Popover>
  )
}

/** Study this: a task to read it by a date, linked, so it is waiting when the task opens. */
function StudyThis({ item }: { item: ItemFull }): React.JSX.Element {
  const [asking, setAsking] = useState(false)
  if (!asking) return <Prop icon={BookOpen} onClick={() => setAsking(true)}>Study this…</Prop>
  return (
    <Input
      autoFocus
      placeholder="When will you study it? e.g. thursday 9am"
      onBlur={() => setAsking(false)}
      onKeyDown={(event) => {
        if (event.key === 'Escape') setAsking(false)
        if (event.key !== 'Enter') return
        // One wording with the prompt's: the title, the toast, the sound.
        void makeTask({ item: item.id, text: `Study “${item.title}” ${event.currentTarget.value}` }, 'A task, with this linked').then(() => setAsking(false))
      }}
      className="h-8 w-auto text-control"
    />
  )
}

/**
 * This turned out to be wrong: write what is true, and the correction becomes a
 * nugget of its own while this one leaves review. A falsehood recalled with
 * confidence is worse than one forgotten, and meetings are not textbooks.
 */
function Supersede({ item }: { item: ItemFull }): React.JSX.Element {
  const [open, setOpen] = useState(false)
  if (!open) return <Prop icon={TriangleAlert} onClick={() => setOpen(true)}>This turned out wrong…</Prop>
  return (
    <Textarea
      autoFocus
      rows={2}
      placeholder="What is actually true? Enter to save"
      onBlur={() => setOpen(false)}
      onKeyDown={(event) => {
        if (event.key === 'Escape') setOpen(false)
        if (event.key !== 'Enter' || event.shiftKey || !event.currentTarget.value.trim()) return
        event.preventDefault()
        void vigil.supersede(item.id, event.currentTarget.value.trim()).then(() => toast('Corrected: the new version is a nugget, this one is out of review'))
      }}
      className="resize-none text-control"
    />
  )
}

/**
 * Filter, sort and group for nuggets or articles, with the Display menu that
 * sets them: the same in the main window and the prompt's Kept tab.
 */
export function useItemDisplay(name: string, every: Item[]): {
  groups: [string, Item[]][]
  display: React.JSX.Element
  /** Drop a row before or after another, in your own order. */
  move: (ids: string[], id: string, target: string, after: boolean) => void
  /** One step up or down in your own order, from the keyboard; false at an end. */
  moveBy: (shown: string[], id: string, by: number) => boolean
} {
  const [view, setView] = useView(name, { sort: 'newest', group: 'none' })
  // Archived ones are out of sight until Display's Marked asks for them.
  const all = every.filter((one) => !!one.archivedAt === !!view.filter.flags?.includes('archived'))
  const own = useOwnOrder(name)
  // Moving a row is choosing your own order: the list switches to it.
  const mine = (): void => void (view.sort !== 'manual' && setView({ ...view, sort: 'manual' }))
  const move = (ids: string[], id: string, target: string, after: boolean): void => {
    mine()
    // From another sort, the order you see is the one the move starts from.
    own.move(ids, id, target, after, false, view.sort !== 'manual' ? groups.flatMap(([, list]) => list.map((one) => one.id)) : undefined)
  }
  const moveBy = (shown: string[], id: string, by: number): boolean => {
    const target = shown[shown.indexOf(id) + by]
    if (!target) return false
    mine()
    own.move(every.map((one) => one.id), id, target, by > 0, true, view.sort !== 'manual' ? shown : undefined)
    return true
  }
  const facets: Facet<Item>[] = [
    { key: 'kind', label: 'Kind', options: CAPTURE_TYPES.filter((type) => all.some((one) => one.kind === type.id)).map(({ id, label, icon, tint }) => ({ id, label, icon, tint })), test: (one, kind) => one.kind === kind },
    { key: 'when', label: 'Kept', options: AGES, test: (one, when) => period(one.createdAt) === when },
    { key: 'tested', label: 'Review', options: [{ id: 'tested', label: 'Tested' }, { id: 'not', label: 'Not tested' }, { id: 'leech', label: 'Forgotten often' }], test: (one, how) => (how === 'leech' ? one.lapses >= 4 : !!one.prompt === (how === 'tested')) },
    { key: 'flags', label: 'Marked', options: [{ id: 'pinned', label: 'Pinned' }, { id: 'private', label: 'Private' }, { id: 'pushed', label: 'Note to self' }, { id: 'archived', label: 'Archived' }], test: (one, flag) => (flag === 'pinned' ? !!one.pinnedAt : flag === 'private' ? !!one.private : flag === 'archived' ? !!one.archivedAt : one.mode === 'pushed') }
  ]
  const groups = arrange(all, view, facets, {
    newest: (a, b) => b.createdAt.localeCompare(a.createdAt),
    oldest: (a, b) => a.createdAt.localeCompare(b.createdAt),
    name: (a, b) => a.title.localeCompare(b.title),
    due: (a, b) => (a.dueAt ?? '9').localeCompare(b.dueAt ?? '9'),
    manual: (a, b) => own.compare(a.id, b.id) || b.createdAt.localeCompare(a.createdAt)
  }, {
    kind: (one) => CAPTURE_TYPES.find((type) => type.id === one.kind)?.label ?? 'Note',
    date: (one) => period(one.createdAt)
  })
  const display = (
    <Display
      view={view}
      onChange={setView}
      facets={facets}
      sorts={[{ id: 'newest', label: 'Newest' }, { id: 'oldest', label: 'Oldest' }, { id: 'name', label: 'Name' }, { id: 'due', label: 'Next review' }, { id: 'manual', label: 'Your order' }]}
      groups={[{ id: 'none', label: 'None' }, { id: 'kind', label: 'Kind' }, { id: 'date', label: 'Date' }]}
    />
  )
  return { groups, display, move, moveBy }
}
