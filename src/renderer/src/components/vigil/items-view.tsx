import { useEffect, useRef, useState } from 'react'
import type { Editor, JSONContent } from '@tiptap/core'
import { AlarmClock, BookOpen, Brain, Calendar, Eye, EyeOff, FileText, History, Layers, Pause, Pin, Play, Plus, Quote, RefreshCw, SquareDashed, TriangleAlert, X } from 'lucide-react'

import { AnimatePresence, motion } from 'motion/react'

import { MindflowEditor, TAGS } from '../mindflow'
import { textOf } from '../rot-cards'
import { selectionActions } from './selection-actions'
import { ReadThrough } from './read-through'
import { CAPTURE_TYPES, CaptureKindPicker, type CaptureType } from '../capture-kinds/capture-kind-picker'
import { age } from '../capture-list'
import { findCaptures, follow } from '@/lib/capture-links'
import { interval, splitTags, useLive, vigil, when, type Item, type ItemFull } from '@/lib/vigil'
import { Empty, Page, Prop, PropLabel, Props, Tags, toast, useListKeys, typing, pin, VirtualList } from './ui'
import { AGES, Display, arrange, period, useView, type Facet } from './display'
import { RowMenu, copy } from './row-menu'
import { Lineage } from './lineage'
import * as chrono from 'chrono-node'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Tip } from '@/components/vigil/ui'
import { Button } from '@/components/ui/button'

const kindOf = (id: string): (typeof CAPTURE_TYPES)[number] => CAPTURE_TYPES.find((type) => type.id === id) ?? CAPTURE_TYPES[0]

/**
 * Nuggets and articles: the kept tiers. A nugget reads as its own words, two
 * lines of them, with a line saying how it comes back; an article as a titled
 * document. Same row underneath, so one view, drawn two ways.
 */
export function ItemsView({ tier, focus, onOpen }: { tier: 'nugget' | 'article'; focus?: string; onOpen?: (type: string, id: string) => void }): React.JSX.Element {
  const all = useLive(() => vigil.items(tier), [] as Item[], [tier])
  const { groups, display } = useItemDisplay(tier, all)
  const items = groups.flatMap(([, list]) => list)
  // Each group's name, on its first row.
  const heads = new Map(groups.map(([name, list]) => [list[0], name]))
  const [open, setOpen] = useState<ItemFull | null>(null)
  const pick = (id: string): void => void vigil.item(id).then(setOpen)
  const [cursor] = useListKeys(items.length, { onOpen: (index) => pick(items[index].id), onBack: () => setOpen(null) })
  // Reading through what is shown, one at a time with nothing else on screen.
  const [readFrom, setReadFrom] = useState<number | null>(null)
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (!event.metaKey || !event.shiftKey || event.key.toLowerCase() !== 'r' || !items.length) return
      event.preventDefault()
      setReadFrom(Math.max(0, cursor))
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  })
  // x selects, the way Linear does it; several nuggets make one article.
  const [chosen, setChosen] = useState<string[]>([])
  // The Luhmann move: two unrelated nuggets side by side, for the connection
  // nobody would have gone looking for.
  const [pair, setPair] = useState<Awaited<ReturnType<typeof vigil.random>>>([])
  const toggle = (id: string): void => setChosen((ids) => (ids.includes(id) ? ids.filter((one) => one !== id) : [...ids, id]))
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

  return (
    <>
      <Page aside={!!open}
        title={tier === 'nugget' ? 'Nuggets' : 'Articles'}
        count={items.length}
        actions={
          chosen.length ? (
            <span className="flex items-center gap-2 text-muted-foreground">
              {chosen.length} selected
              <Button variant="secondary" size="sm"
 
 onClick={() => void vigil.article(chosen).then(() => {
 toast(`Article started from ${chosen.length} nugget${chosen.length === 1 ? '' : 's'}`)
 setChosen([])
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
                  x to select
                  <Button variant="ghost" size="sm" onClick={() => void vigil.random().then(setPair)}>
                    Two at random
                  </Button>
                </>
              )}
              {tier === 'article' && (
                <Button variant="ghost" size="sm" onClick={() => void vigil.newArticle().then(pick)}>
                  <Plus className="size-3.5" /> New article
                </Button>
              )}
              <Tip label="Read through these, one at a time  ⌘⇧R">
                <Button variant="ghost" size="sm" onClick={() => setReadFrom(Math.max(0, cursor))} disabled={!items.length}><BookOpen className="size-3.5" /> Read</Button>
              </Tip>
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
        {items.length ? (
          <VirtualList items={items} keyOf={(item) => item.id} cursor={cursor} estimate={60} className="mx-3 my-2">
            {(item, index) => (
              <div className="flex flex-col">
              {heads.get(item) && <div className={`px-2 pb-1 text-xs text-muted-foreground ${index === 0 ? 'pt-1' : 'pt-4'}`}>{heads.get(item)}</div>}
              <RowMenu items={[
                { label: 'Open', keys: '↵', run: () => pick(item.id) },
                'separator',
                { label: item.pinnedAt ? 'Unpin' : 'Pin to the prompt', run: () => pin('nuggets', item.id, !item.pinnedAt) },
                { label: item.private ? 'Let it surface' : 'Make private', run: () => void vigil.setPrivate('nuggets', item.id, !item.private) },
                tier === 'nugget' && { label: chosen.includes(item.id) ? 'Unselect' : 'Select', keys: 'X', run: () => toggle(item.id) },
                'separator',
                { label: 'Copy title', run: () => copy(item.title) }
              ]}>
              <button
                data-cursor={index === cursor || undefined}
                type="button"
                data-row
                onClick={(event) => (event.shiftKey || event.metaKey ? toggle(item.id) : pick(item.id))}
                className={`rounded-sm px-2 py-1.5 text-left transition-colors ${chosen.includes(item.id) ? 'bg-[color-mix(in_srgb,var(--tt-brand-color-400)_14%,transparent)]' : item.id === open?.id ? 'bg-accent' : index === cursor ? 'bg-accent/50' : 'hover:bg-accent/50'} ${item.suspended ? 'opacity-50' : ''}`}
              >
                {tier === 'nugget' ? <NuggetRow item={item} /> : <ArticleRow item={item} />}
              </button>
              </RowMenu>
              </div>
            )}
          </VirtualList>
        ) : tier === 'nugget' ? (
          <Empty shape={['misc', 3]} title="No nuggets yet">
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
      {open && <ItemDetail key={open.id} item={open} onOpen={(type, id) => (type === tier ? pick(id) : onOpen?.(type, id))} />}
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
        <span className="line-clamp-2 flex-1">{text || 'Untitled'}</span>
      </span>
      <span className="mt-1 flex items-center gap-3 pl-6 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          {recall ? <Brain className="size-3" /> : item.mode === 'pushed' ? <RefreshCw className="size-3" /> : <Eye className="size-3" />}
          {recall ? (item.dueAt ? `Recall · ${new Date(item.dueAt) <= new Date() ? 'due' : `in ${interval(item.dueAt)}`}` : 'Recall · new') : item.mode === 'pushed' ? 'On rotation' : 'Now and then'}
        </span>
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
      <span className="flex-1 truncate">{item.title || 'Untitled'}</span>
      <span className="shrink-0 text-xs text-muted-foreground">{when(item.createdAt)}</span>
    </span>
  )
}

/** The open nugget or article: its words, its glosses, and down the right how it comes back. */
export function ItemDetail({ item, onOpen }: { item: ItemFull; onOpen?: (type: string, id: string) => void }): React.JSX.Element {
  const [prompt, setPrompt] = useState(item.prompt ?? '')
  const [gloss, setGloss] = useState('')
  const glossWords = item.glosses.filter((one) => one.author === 'user').reduce((sum, one) => sum + one.body.split(/\s+/).filter(Boolean).length, 0)
  const editor = useRef<Editor | null>(null)
  // A cloze: the words you selected, blanked. Two keystrokes and no writing,
  // the cheapest way to make something testable, and right for a name or a
  // number; anything with a "because" in it is better as a question.
  const cloze = (): void => {
    const view = editor.current
    const { from, to } = view?.state.selection ?? { from: 0, to: 0 }
    const words = view?.state.doc.textBetween(from, to).trim()
    if (!view || !words) return toast('Select the words to blank out first')
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
    <div className="flex min-w-0 flex-[1.4] border-l">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col pt-6">
        {item.tier === 'article' && (
          <input
            className="mx-auto mb-2 block w-full max-w-[44rem] bg-transparent px-12 text-title font-semibold text-balance outline-none placeholder:text-muted-foreground"
            defaultValue={item.title}
            placeholder="Untitled"
            onBlur={(event) => void vigil.saveItem(item.id, { title: event.target.value })}
          />
        )}
        <MindflowEditor
          host={window.api}
          tokens={TAGS}
          // A tag opens its page: everything carrying it.
          onTokenClick={(token) => token.name === 'tag' && onOpen?.('tag', token.value)}
          toolbar={{ fixed: false, selectionExtra: selectionActions({ captureId: item.captureId ?? undefined, attribution: item.attribution, from: item.id }) }}
          documentId={`item-${item.id}`}
          defaultContent={(item.body as JSONContent | string | null) ?? ''}
          findNotes={findCaptures}
          onOpenNote={(link) => onOpen && follow(link, onOpen)}
          onChange={(body, instance) => {
            editor.current = instance
            void vigil.saveItem(item.id, { body, ...(item.tier === 'nugget' ? { title: instance.getText().split('\n')[0] } : {}) })
          }}
        />

      </div>

      <Props>
        {item.tier === 'nugget' && (
          <>
            <PropLabel>Kind</PropLabel>
            <div>
              <CaptureKindPicker value={item.kind as CaptureType} onChange={(kind) => void vigil.saveItem(item.id, { kind })} />
            </div>
          </>
        )}

        <PropLabel>How it comes back</PropLabel>
        <Prop icon={item.prompt ? Brain : item.mode === 'pushed' ? RefreshCw : Eye} active>
          {item.prompt ? 'Tested, on a schedule' : item.mode === 'pushed' ? 'On rotation, always' : 'Now and then, as a hint'}
        </Prop>
        {!item.prompt && (
          // Pushed: a standing principle that should keep coming round, the
          // note-to-self's way, rather than turning up by chance.
          <Prop
            icon={item.mode === 'pushed' ? Eye : RefreshCw}
            onClick={() => void vigil.saveItem(item.id, { mode: item.mode === 'pushed' ? 'encounter' : 'pushed' }).then(() =>
              toast(item.mode === 'pushed' ? 'Back to turning up by chance' : 'On rotation: it will keep coming back'))}
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
          className="mt-1 resize-none text-control"
        />
        <Prop icon={SquareDashed} onClick={cloze}>Blank the selected words</Prop>
        {item.dueAt && <Prop icon={Calendar}>Next review {when(item.dueAt, false)}</Prop>}
        {item.lapses >= 4 && (
          <p className="mx-2 my-1 text-xs leading-relaxed text-[var(--tt-color-text-orange)]">
            Forgotten {item.lapses} times. That is usually the prompt, not you: try rewriting it.
          </p>
        )}
        <Prop
          icon={item.suspended ? Play : Pause}
          onClick={() => void vigil.saveItem(item.id, { suspended: !item.suspended }).then(() => toast(item.suspended ? 'Back in rotation' : 'Suspended until you bring it back'))}
        >
          {item.suspended ? 'Bring back into rotation' : 'Suspend'}
        </Prop>

        <PropLabel>Surfacing</PropLabel>
        <Prop icon={item.private ? EyeOff : Eye} active={!!item.private} onClick={() => void vigil.setPrivate('nuggets', item.id, !item.private)}>
          {item.private ? 'Private: kept back in quiet hours' : 'Can surface any time'}
        </Prop>
        <Prop icon={Pin} active={!!item.pinnedAt} onClick={() => pin('nuggets', item.id, !item.pinnedAt)}>
          {item.pinnedAt ? 'Pinned' : 'Pin to the prompt'}
        </Prop>
        <RemindMe table="nuggets" id={item.id} at={item.remindAt} />

        {item.tier === 'nugget' ? (
          <>
            <PropLabel>Context</PropLabel>
            <Textarea
              defaultValue={item.context ?? ''}
              onBlur={(event) => void vigil.saveItem(item.id, { context: event.target.value.trim() || null })}
              rows={2}
              placeholder="What makes the answer make sense: shown after it in review"
              className="resize-none text-control"
            />
            <PropLabel>Grow it</PropLabel>
            {/* Two hundred words of your own beside it is an article written
                without noticing: said, never automated. */}
            {glossWords >= 200 && (
              <p className="mx-2 mb-1 text-xs leading-relaxed text-[var(--tt-color-text-purple)]">
                Your glosses here run to {glossWords} words: that is an article already. Start one and they come with it.
              </p>
            )}
            <Prop icon={Plus} onClick={() => void vigil.article([item.id]).then(() => toast('Article started from this nugget'))}>
              Start an article
            </Prop>
            <StudyThis item={item} />
          </>
        ) : (
          <>
            <PropLabel>Made from</PropLabel>
            <Prop icon={Layers}>{item.origins.length ? `${item.origins.length} nugget${item.origins.length === 1 ? '' : 's'}` : 'Written from scratch'}</Prop>
          </>
        )}
        <Lineage id={item.id} onOpen={onOpen} />
        <PropLabel>Wrong?</PropLabel>
        {item.supersededBy ? (
          <Prop icon={TriangleAlert}>Superseded: out of review, kept beside its correction</Prop>
        ) : (
          <Supersede item={item} />
        )}
        <PropLabel>Source</PropLabel>
        <label className="flex items-center gap-2 rounded-md px-2 py-1.5 focus-within:text-foreground hover:bg-accent">
          <Quote className="size-4 shrink-0" />
          <input
            defaultValue={item.attribution ?? ''}
            placeholder="Who, or where from"
            onBlur={(event) => void vigil.saveItem(item.id, { attribution: event.target.value.trim() || null })}
            className="min-w-0 flex-1 bg-transparent text-control outline-none placeholder:text-muted-foreground"
          />
        </label>
        <PropLabel>Details</PropLabel>
        <Prop icon={Calendar}>Kept {when(item.createdAt)}</Prop>
        {item.revisions > 0 && <Prop icon={History}>Rewritten {item.revisions === 1 ? 'once' : `${item.revisions} times`}</Prop>}

        {/* Glosses: present-you beside the material, one row each and never an
            edit, so the history of your thinking about it stays readable. */}
        <PropLabel>Glosses</PropLabel>
        {item.glosses.map((one) => (
          <div key={one.id} className="mx-2 mb-2 text-foreground">
            <p className="whitespace-pre-line">{one.body}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{when(one.createdAt)}{one.author === 'ai' ? ' · AI' : ''}</p>
          </div>
        ))}
        <Textarea
          value={gloss}
          onChange={(event) => setGloss(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== 'Enter' || event.shiftKey || !gloss.trim()) return
            event.preventDefault()
            void vigil.gloss(item.id, gloss.trim()).then(() => setGloss(''))
          }}
          rows={2}
          placeholder="Why you kept it, or where you disagree"
          className="resize-none text-control"
        />
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
  const hour = 3600000
  const presets: [string, Date][] = [
    ['An hour from now', new Date(Date.now() + hour)],
    ['Tomorrow', new Date(new Date(Date.now() + 24 * hour).setHours(9, 0, 0, 0))],
    ['Next week', new Date(new Date(Date.now() + 7 * 24 * hour).setHours(9, 0, 0, 0))],
    ['A month from now', new Date(new Date(Date.now() + 30 * 24 * hour).setHours(9, 0, 0, 0))]
  ]
  const typed = words.trim() ? chrono.parseDate(/^\d+ \w+$/.test(words.trim()) ? `in ${words}` : words, new Date(), { forwardDate: true }) : null
  const set = (date: Date | null): void => {
    setOpen(false)
    setWords('')
    void vigil.remind(table, id, date ? date.toISOString() : null).then(() =>
      toast(date ? `Will pin itself ${when(date.toISOString(), false).toLowerCase()}` : 'Reminder cleared'))
  }
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-accent hover:text-foreground">
          <AlarmClock className="size-4 shrink-0" />
          <span className="text-control">{at ? `Reminds ${when(at, false).toLowerCase()}` : 'Remind me…'}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 gap-0 p-1 text-sm">
        <input
          autoFocus
          value={words}
          onChange={(event) => setWords(event.target.value)}
          onKeyDown={(event) => event.key === 'Enter' && typed && set(typed)}
          placeholder="Try: 4 pm, 2 days, in 5 weeks…"
          className="w-full border-b bg-transparent px-2 py-2 outline-none placeholder:text-muted-foreground"
        />
        {(typed ? [[words, typed] as [string, Date]] : presets).map(([label, date]) => (
          <button key={label} type="button" onClick={() => set(date)} className="flex w-full items-center justify-between rounded-md px-2 py-1.5 hover:bg-accent">
            <span>{label}</span>
            <span className="text-xs text-muted-foreground">{date.toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</span>
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
      placeholder="When? e.g. thursday 9am"
      onBlur={() => setAsking(false)}
      onKeyDown={(event) => {
        if (event.key === 'Escape') setAsking(false)
        if (event.key !== 'Enter') return
        void vigil.study(item.id, `Study: ${item.title} ${event.currentTarget.value}`).then(() => {
          setAsking(false)
          toast('Task made, with this linked to it')
        })
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
export function useItemDisplay(name: string, all: Item[]): { groups: [string, Item[]][]; display: React.JSX.Element } {
  const [view, setView] = useView(name, { sort: 'newest', group: 'none' })
  const facets: Facet<Item>[] = [
    { key: 'kind', label: 'Kind', options: CAPTURE_TYPES.filter((type) => all.some((one) => one.kind === type.id)).map(({ id, label, icon, tint }) => ({ id, label, icon, tint })), test: (one, kind) => one.kind === kind },
    { key: 'when', label: 'Kept', options: AGES, test: (one, when) => period(one.createdAt) === when },
    { key: 'tested', label: 'Review', options: [{ id: 'tested', label: 'Tested' }, { id: 'not', label: 'Not tested' }, { id: 'leech', label: 'Forgotten often' }], test: (one, how) => (how === 'leech' ? one.lapses >= 4 : !!one.prompt === (how === 'tested')) },
    { key: 'flags', label: 'Marked', options: [{ id: 'pinned', label: 'Pinned' }, { id: 'private', label: 'Private' }, { id: 'pushed', label: 'Note to self' }], test: (one, flag) => (flag === 'pinned' ? !!one.pinnedAt : flag === 'private' ? !!one.private : one.mode === 'pushed') }
  ]
  const groups = arrange(all, view, facets, {
    newest: (a, b) => b.createdAt.localeCompare(a.createdAt),
    oldest: (a, b) => a.createdAt.localeCompare(b.createdAt),
    name: (a, b) => a.title.localeCompare(b.title),
    due: (a, b) => (a.dueAt ?? '9').localeCompare(b.dueAt ?? '9')
  }, {
    kind: (one) => CAPTURE_TYPES.find((type) => type.id === one.kind)?.label ?? 'Note',
    date: (one) => period(one.createdAt)
  })
  const display = (
    <Display
      view={view}
      onChange={setView}
      facets={facets}
      sorts={[{ id: 'newest', label: 'Newest' }, { id: 'oldest', label: 'Oldest' }, { id: 'name', label: 'Name' }, { id: 'due', label: 'Next review' }]}
      groups={[{ id: 'none', label: 'None' }, { id: 'kind', label: 'Kind' }, { id: 'date', label: 'Date' }]}
    />
  )
  return { groups, display }
}
