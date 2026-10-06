import { chime } from '@/lib/sound'
import { useEffect, useState } from 'react'
import { Brain, EyeOff, Pin, Plus } from 'lucide-react'
import type { Readable } from './read-through'

import { CAPTURE_TYPES } from '../capture-kinds/capture-kind-picker'
import { useLive, vigil, type Item } from '@/lib/vigil'
import { makeTask } from '@/lib/tasks'
import { Chips } from './display'
import { RowMenu, copy } from './row-menu'
import { Empty, ask, pin, toast, typing, useListKeys, useReadKey, VirtualList, Strip, Tip, startAt, Rolling } from './ui'
import { GlossButton, GlossLine } from './gloss-line'
import { Button } from '@/components/ui/button'
import { useItemDisplay } from './items-view'
import { openWindow } from '@/lib/notes'
import BookIcon from '@/components/ui/book-icon'
import { AliveIcon } from '@/components/vigil/alive-icon'
import { QuestionRow, startQuestion } from './questions-view'

const TIERS = [{ id: 'nugget', label: 'Nuggets' }, { id: 'article', label: 'Articles' }, { id: 'question', label: 'Questions' }] as const

/**
 * What you kept, in the prompt: nuggets, articles and the questions you are
 * holding (open ones only; the settled wait in the main window), newest first, each one
 * opened right here. j and k move, Enter opens, and a right click has the rest.
 */
export function KeptPanel({ onOpen, open, onRead }: { onOpen: (type: string, id: string) => void; open?: string; onRead: (items: Readable[], start: number) => void }): React.JSX.Element {
  const [tier, setTier] = useState<'nugget' | 'article' | 'question'>('nugget')
  const all = useLive(() => vigil.items(tier).then((list) => (tier === 'question' ? list.filter((one) => !one.closedAt) : list)), [] as Item[], [tier])
  // The same filters as the main window's list, kept apart per tier.
  const { groups, display } = useItemDisplay(`prompt:${tier}`, all)
  const items = groups.flatMap(([, list]) => list)
  const [cursor] = useListKeys(items.length, { onOpen: (index) => onOpen(tier, items[index].id) })
  // x picks several nuggets, to start one article from them all.
  const [chosen, setChosen] = useState<string[]>([])
  useEffect(() => setChosen([]), [tier])
  // The row a thought is being written under, from ; or its hover button.
  const [glossing, setGlossing] = useState<string | null>(null)
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (typing() || event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return
      // ; a thought on the row under the cursor, written under it in place.
      if (event.key === ';' && items[cursor] && tier !== 'question') {
        event.preventDefault()
        chime('tap')
        return setGlossing(items[cursor].id)
      }
      if (tier !== 'nugget') return
      if (event.key === 'Escape' && chosen.length) {
        event.preventDefault()
        chime('off')
        return setChosen([])
      }
      const row = items[cursor]
      if (event.key === 'x' && row) setChosen((ids) => (chime(ids.includes(row.id) ? 'off' : 'on'), ids.includes(row.id) ? ids.filter((one) => one !== row.id) : [...ids, row.id]))
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  })
  const read = (): void => void (items.length && onRead(items.map((one) => ({ type: tier, id: one.id })), startAt(items, open, cursor)))
  // ⇧⌘R reads through what is shown, from the row under the cursor.
  useReadKey(read, items.length)
  const article = (ids: string[]): void =>
    void vigil.article(ids).then((id) => {
      chime('promote')
      setChosen([])
      toast(ids.length > 1 ? `An article, from ${ids.length} nuggets` : 'An article, from this nugget')
      onOpen('article', id)
    })
  return (
    <div className="flex flex-col gap-1 text-sm">
      <Strip className="flex h-8 min-w-0 items-center gap-1 px-1">
        <Chips className="shrink-0" options={TIERS} on={(id) => id === tier} pick={(id) => setTier(id as 'nugget' | 'article' | 'question')} />
        {/* Read only when there is something to read. */}
        {all.length > 0 && <Tip label="Read this list full screen, one note at a time, from the highlighted one (or the first). You can write in each as you go.  ⇧⌘R"><Button variant="ghost" size="sm" className="ml-auto" onClick={read}><AliveIcon icon={BookIcon} size={14} /> Read list</Button></Tip>}
        {tier !== 'question' && <span className={all.length ? '' : 'ml-auto'}>{display}</span>}
        {tier === 'article' && (
          <Button variant="ghost" size="sm" onClick={() => void vigil.newArticle().then((id) => (chime('promote'), onOpen('article', id)))}><Plus className="size-3.5" /> New article</Button>
        )}
        {tier === 'question' && (
          <Tip label="New question"><Button variant="ghost" size="icon-sm" aria-label="New question" className={all.length ? '' : 'ml-auto'} onClick={() => void startQuestion(onOpen)}><Plus className="size-3.5" /></Button></Tip>
        )}
      </Strip>
      {chosen.length > 0 && (
        <div className="flex items-center gap-1 px-1 text-xs text-muted-foreground">
          <span className="mr-auto"><Rolling text={chosen.length} /> selected</span>
          <Button variant="ghost" size="sm" onClick={() => article(chosen)}>Start an article from {chosen.length === 1 ? 'it' : 'these'}</Button>
        </div>
      )}
      {items.length ? (
        <VirtualList items={items} keyOf={(item) => item.id} cursor={cursor} estimate={40}>
          {(item, index) => {
            const kind = CAPTURE_TYPES.find((type) => type.id === item.kind) ?? CAPTURE_TYPES[0]
            // A question is held, not tested: its own short menu, and how long it has been held.
            if (tier === 'question') return (
              <RowMenu items={[
                { label: 'Open', keys: '↵', run: () => onOpen('question', item.id) },
                { label: item.private ? 'Not private' : 'Private', run: () => void vigil.setPrivate('nuggets', item.id, !item.private) },
                'separator',
                { label: 'Copy the question', run: () => copy(item.title) }
              ]}>
                <button
                  type="button"
                  data-row
                  data-cursor={index === cursor || undefined}
                  data-private={item.private ? '' : undefined}
                  data-open={item.id === open ? '' : undefined}
                  onClick={(event) => (event.metaKey ? openWindow('question', item.id) : onOpen('question', item.id))}
                  className={`flex w-full flex-col rounded-sm px-2 py-1.5 text-left hover:bg-accent/50 ${item.id === open ? 'bg-accent' : index === cursor ? 'bg-accent/50' : ''}`}
                >
                  <QuestionRow item={item} />
                </button>
              </RowMenu>
            )
            return (
              <div className="group/item relative">
              <RowMenu items={[
                { label: 'Open', keys: '↵', run: () => onOpen(tier, item.id) },
                { label: 'Add a thought', keys: ';', run: () => setGlossing(item.id) },
                { label: item.prompt ? 'Change the question' : 'Test me on this', run: () => void ask('The question it answers', item.prompt ?? 'e.g. What does MVCC stand for?').then((prompt) => { if (prompt) void vigil.saveItem(item.id, { prompt }).then(() => toast('Now tested: it will come up in review')) }) },
                ...(tier === 'nugget' ? [{ label: 'Start an article', run: () => article([item.id]) }] : []),
                { label: 'Study this', run: () => void ask('When will you study it?', 'e.g. read it again on Thursday').then((when) => { if (when) void makeTask({ item: item.id, text: `Study “${item.title}” ${when}` }, 'A task, with this linked') }) },
                'separator',
                { label: item.pinnedAt ? 'Unpin' : 'Pin to the prompt', run: () => pin('nuggets', item.id, !item.pinnedAt) },
                { label: item.private ? 'Not private' : 'Private', run: () => void vigil.setPrivate('nuggets', item.id, !item.private) },
                'separator',
                { label: 'Copy title', run: () => copy(item.title) }
              ]}>
                <button
                  type="button"
                  data-row
                  data-cursor={index === cursor || undefined}
                  data-private={item.private ? '' : undefined}
                  data-open={item.id === open ? '' : undefined}
                  // ⌘-click: a window of its own, as in every list.
                  onClick={(event) => (event.metaKey ? openWindow(tier, item.id) : onOpen(tier, item.id))}
                  className={`flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left hover:bg-accent/50 ${chosen.includes(item.id) ? 'bg-[color-mix(in_srgb,var(--tt-brand-color-400)_14%,transparent)]' : item.id === open ? 'bg-accent' : index === cursor ? 'bg-accent/50' : ''}`}
                >
                  <kind.icon className="size-4 shrink-0" style={{ color: kind.tint }} />
                  <span className="private-text flex-1 truncate">{item.title || 'Untitled'}</span>
                  {item.prompt && <Brain className="size-3 shrink-0 text-muted-foreground" />}
                  {item.pinnedAt && <Pin className="size-3 shrink-0 text-muted-foreground" />}
                  {item.private ? <EyeOff className="size-3 shrink-0 text-muted-foreground" aria-label="Private" /> : null}
                  {/* Room for the hover button, so the title never runs under it. */}
                  <span aria-hidden className="w-5 shrink-0" />
                </button>
              </RowMenu>
              {/* A thought without opening it: on hover, beside the row. */}
              <GlossButton onClick={() => setGlossing(item.id)} />
              {glossing === item.id && <GlossLine id={item.id} open onDone={() => setGlossing(null)} className="px-2 pt-0.5 pb-1" />}
              </div>
            )
          }}
        </VirtualList>
      ) : (
        <Empty compact shape={tier === 'nugget' ? ['star', 3] : tier === 'question' ? ['ellipse', 3] : ['polygon', 4]} title={tier === 'nugget' ? 'Nothing kept yet' : tier === 'question' ? 'Nothing held yet' : 'No articles yet'}>
          {tier === 'nugget' ? 'Promote a capture and it lands here, to come back to you.' : tier === 'question' ? 'For what you keep circling and cannot name yet. Press H on a capture to hold it as a question.' : 'Your own words on one idea. Start one with New article, or from a nugget.'}
        </Empty>
      )}
    </div>
  )
}
