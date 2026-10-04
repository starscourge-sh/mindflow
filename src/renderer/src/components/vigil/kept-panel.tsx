import { useState } from 'react'
import { Brain, Lock, Pin } from 'lucide-react'

import { CAPTURE_TYPES } from '../capture-kinds/capture-kind-picker'
import { useLive, vigil, type Item } from '@/lib/vigil'
import { Chips } from './display'
import { RowMenu, copy } from './row-menu'
import { ask, pin, toast, useListKeys, VirtualList } from './ui'
import { Button } from '@/components/ui/button'

const TIERS = [{ id: 'nugget', label: 'Nuggets' }, { id: 'article', label: 'Articles' }] as const

/**
 * What you kept, in the prompt: nuggets and articles, newest first, each one
 * opened right here. j and k move, Enter opens, and a right click has the rest.
 */
export function KeptPanel({ onOpen, open }: { onOpen: (type: string, id: string) => void; open?: string }): React.JSX.Element {
  const [tier, setTier] = useState<'nugget' | 'article'>('nugget')
  const items = useLive(() => vigil.items(tier), [] as Item[], [tier])
  const [cursor] = useListKeys(items.length, { onOpen: (index) => onOpen(tier, items[index].id) })
  return (
    <div className="flex flex-col gap-2 text-sm">
      <div className="flex items-center gap-2 px-1 pt-1">
        <Chips options={TIERS} on={(id) => id === tier} pick={(id) => setTier(id as 'nugget' | 'article')} />
        <span className="ml-auto text-xs text-muted-foreground tabular-nums">{items.length} {tier === "nugget" ? (items.length === 1 ? "nugget" : "nuggets") : items.length === 1 ? "article" : "articles"}</span>
        {tier === 'article' && (
          <Button variant="outline" size="sm" onClick={() => void vigil.newArticle().then((id) => onOpen('article', id))}>New article</Button>
        )}
      </div>
      {items.length ? (
        <VirtualList items={items} keyOf={(item) => item.id} cursor={cursor} estimate={40}>
          {(item, index) => {
            const kind = CAPTURE_TYPES.find((type) => type.id === item.kind) ?? CAPTURE_TYPES[0]
            return (
              <RowMenu items={[
                { label: 'Open', keys: '↵', run: () => onOpen(tier, item.id) },
                { label: item.prompt ? 'Change the question' : 'Test me on this', run: () => void ask('The question it answers', item.prompt ?? 'e.g. What does MVCC stand for?').then((prompt) => { if (prompt) void vigil.saveItem(item.id, { prompt }).then(() => toast('Now tested: it joins your review')) }) },
                { label: 'Study this', run: () => void ask('When will you study it?', 'e.g. read it again on Thursday').then((when) => { if (when) void vigil.study(item.id, `Study “${item.title}” ${when}`).then(() => toast('A task, with this linked')) }) },
                'separator',
                { label: item.pinnedAt ? 'Unpin' : 'Pin to the prompt', run: () => pin('nuggets', item.id, !item.pinnedAt) },
                { label: item.private ? 'Let it surface' : 'Make private', run: () => void vigil.setPrivate('nuggets', item.id, !item.private) },
                'separator',
                { label: 'Copy title', run: () => copy(item.title) }
              ]}>
                <button
                  type="button"
                  data-cursor={index === cursor || undefined}
                  onClick={() => onOpen(tier, item.id)}
                  className={`flex w-full items-center gap-2 rounded-md px-2 py-2 text-left hover:bg-accent/60 ${item.id === open ? 'bg-accent' : ''} ${index === cursor ? 'ring-1 ring-border' : ''}`}
                >
                  <kind.icon className="size-4 shrink-0" style={{ color: kind.tint }} />
                  <span className="flex-1 truncate">{item.title || 'Untitled'}</span>
                  {item.prompt && <Brain className="size-3 shrink-0 text-muted-foreground" />}
                  {item.pinnedAt && <Pin className="size-3 shrink-0 text-muted-foreground" />}
                  {item.private ? <Lock className="size-3 shrink-0 text-muted-foreground" /> : null}
                </button>
              </RowMenu>
            )
          }}
        </VirtualList>
      ) : (
        <p className="px-2 py-6 leading-relaxed text-muted-foreground">
          {tier === 'nugget' ? 'Nothing kept yet. Promote a capture and it lands here.' : 'No articles yet. Start one here with New article, or from a nugget.'}
        </p>
      )}
    </div>
  )
}
