import { useEffect, useState } from 'react'
import { toast, VirtualList } from './ui'
import { RowMenu, copy } from './row-menu'
import { Switch } from '@/components/ui/switch'

const COLORS = ['gray', 'brown', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink', 'red'] as const
import { FileText, Gem, Inbox, ListTodo, Tag } from 'lucide-react'

import { splitTags, useLive, vigil } from '@/lib/vigil'
import { Empty, Page, useListKeys } from './ui'
import { Input } from '@/components/ui/input'
import { Tip } from '@/components/vigil/ui'

const ICON = { capture: Inbox, nugget: Gem, article: FileText, task: ListTodo }

/**
 * Every `#tag` in use, with how often: the retrospective index the plan asks
 * for, kept from the words themselves so it can never disagree with them. How
 * often a tag comes up is shown, never acted on: no threshold, no nagging.
 */
export function TagsView({ onOpen, focus }: { onOpen: (type: string, id: string) => void; focus?: string }): React.JSX.Element {
  const tags = useLive(vigil.tags, [] as Awaited<ReturnType<typeof vigil.tags>>)
  const [chosen, setChosen] = useState<string | null>(focus ?? null)
  useEffect(() => setChosen(focus ?? null), [focus])
  const items = useLive(() => (chosen ? vigil.tag(chosen) : Promise.resolve([])), [], [chosen])
  const [cursor] = useListKeys(tags.length, { onOpen: (index) => setChosen(tags[index].tag), onBack: () => setChosen(null) })
  const top = tags[0]?.count ?? 1
  const current = tags.find((one) => one.tag === chosen)

  return (
    <>
      {/* With a tag open, the list narrows to a column and the tag takes the rest. */}
      <div className={chosen ? 'flex w-72 shrink-0 border-r' : 'contents'}>
      <Page title="Tags" count={tags.length}>
        {tags.length ? (
          <VirtualList items={tags} keyOf={(one) => one.tag} cursor={cursor} estimate={36} className="mx-3 my-2">
            {({ tag, count, color }, index) => (
              <RowMenu items={[
                { label: 'Open', keys: '↵', run: () => setChosen(tag) },
                { label: `Copy #${tag}`, run: () => copy(`#${tag}`, `Copied #${tag}`) }
              ]}>
              <button
                type="button"
                data-row
                data-cursor={index === cursor || undefined}
                onClick={() => setChosen(tag)}
                className={`flex w-full items-center gap-2 rounded-[5px] px-2 py-1.5 text-left transition-colors hover:bg-accent/50 ${chosen === tag ? 'bg-accent' : index === cursor ? 'bg-accent/50' : ''}`}
              >
                <Tag className="size-4" style={{ color: color ? `var(--tt-color-text-${color})` : undefined }} />
                <span className={chosen ? 'min-w-0 flex-1 truncate' : 'w-40 truncate'}>{tag}</span>
                {!chosen && (
                  <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-border/50">
                    <span className="block h-full rounded-full bg-muted-foreground/40" style={{ width: `${(count / top) * 100}%` }} />
                  </span>
                )}
                <span className="w-8 text-right text-xs text-muted-foreground tabular-nums">{count}</span>
              </button>
              </RowMenu>
            )}
          </VirtualList>
        ) : (
          <Empty shape={['polygon', 3]} title="No tags yet">
            Write a <span className="text-foreground">#word</span> anywhere in a capture, a nugget or a task and it shows up here, counted. The ones that keep coming up are the ones worth a home of their own.
          </Empty>
        )}
      </Page>
      </div>
      {chosen && (
        <Page title={`#${chosen}`} count={items.length}>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b px-5 py-3">
            {/* A colour, and whether writing this tag makes a task, the way
                #bug does. Labels, not kinds: a colour and one behaviour. */}
            <span className="flex items-center gap-1">
              {COLORS.map((one) => (
                <Tip key={one} label={one}>
                <button
                  type="button"
                
                  onClick={() => void vigil.setTag(chosen, { color: one })}
                  className={`size-3.5 rounded-full ${current?.color === one ? 'ring-2 ring-foreground/60 ring-offset-1 ring-offset-background' : ''}`}
                  style={{ background: `var(--tt-color-text-${one})` }}
                />
                </Tip>
              ))}
            </span>
            <label className="flex items-center gap-1.5 text-xs">
              <Switch checked={!!current?.action} onCheckedChange={(action) => void vigil.setTag(chosen, { action }).then(() => toast(action ? `#${chosen} now makes a task` : `#${chosen} is only a label`))} />
              <span className="whitespace-nowrap">Makes a task</span>
            </label>
            {/* An alias: this tag counts as another without the words changing. */}
            <Input
              key={`alias-${chosen}`}
              placeholder="Counts as #…"
              className="w-32 text-[13px] h-8"
              onKeyDown={(event) => {
                const to = event.currentTarget.value.trim()
                if (event.key !== 'Enter') return
                void vigil.setTag(chosen, { aliasOf: to || null }).then(() => {
                  toast(to ? `#${chosen} now counts as #${to.replace(/^#/, '')}` : `#${chosen} counts as itself again`)
                  if (to) setChosen(to.replace(/^#/, '').toLowerCase())
                })
              }}
            />
            {/* Rename everywhere at once; renaming onto a tag that exists merges them. */}
            <Input
              key={chosen}
              placeholder="Rename or merge into…"
              className="w-44 text-[13px] h-8"
              onKeyDown={(event) => {
                const to = event.currentTarget.value.trim()
                if (event.key !== 'Enter' || !to) return
                void vigil.renameTag(chosen, to).then((done) => {
                  if (!done) return toast('A tag is letters, digits and dashes')
                  toast(`#${chosen} is now #${done} everywhere`)
                  setChosen(done)
                })
              }}
            />
            </div>
          <VirtualList items={items} keyOf={(item) => `${item.type}-${item.id}`} estimate={36} className="mx-3 my-2">
            {(item) => {
              const Icon = ICON[item.type as keyof typeof ICON] ?? Inbox
              return (
                <button
                  type="button"
                  onClick={() => onOpen(item.type, item.id)}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-accent/60"
                >
                  <Icon className="size-4 shrink-0 text-muted-foreground" />
                  <span className="flex-1 truncate">{splitTags(item.title).text || 'Untitled'}</span>
                  <span className="text-xs text-muted-foreground capitalize">{item.type}</span>
                </button>
              )
            }}
          </VirtualList>
        </Page>
      )}
    </>
  )
}
