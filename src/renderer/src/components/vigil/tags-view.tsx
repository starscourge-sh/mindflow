import { useState } from 'react'
import { toast } from './ui'
import { tick } from '@/lib/sound'
import { FileText, Gem, Inbox, ListTodo, Tag } from 'lucide-react'

import { useLive, vigil } from '@/lib/vigil'
import { Empty, Page, useListKeys } from './ui'

const ICON = { capture: Inbox, nugget: Gem, article: FileText, task: ListTodo }

/**
 * Every `#tag` in use, with how often: the retrospective index the plan asks
 * for, kept from the words themselves so it can never disagree with them. How
 * often a tag comes up is shown, never acted on: no threshold, no nagging.
 */
export function TagsView({ onOpen }: { onOpen: (type: string, id: string) => void }): React.JSX.Element {
  const tags = useLive(vigil.tags, [] as { tag: string; count: number }[])
  const [chosen, setChosen] = useState<string | null>(null)
  const items = useLive(() => (chosen ? vigil.tag(chosen) : Promise.resolve([])), [], [chosen])
  const [cursor] = useListKeys(tags.length, { onOpen: (index) => setChosen(tags[index].tag), onBack: () => setChosen(null) })
  const top = tags[0]?.count ?? 1

  return (
    <>
      <Page title="Tags" count={tags.length}>
        {tags.length ? (
          <div className="flex flex-col px-3 py-2">
            {tags.map(({ tag, count }, index) => (
              <button
                key={tag}
                type="button"
                onMouseEnter={tick}
                onClick={() => setChosen(tag)}
                className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-accent/60 ${chosen === tag ? 'bg-accent' : ''} ${index === cursor ? 'ring-1 ring-border' : ''}`}
              >
                <Tag className="size-4 text-muted-foreground" />
                <span className="w-40 truncate">{tag}</span>
                <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-border/50">
                  <span className="block h-full rounded-full bg-muted-foreground/40" style={{ width: `${(count / top) * 100}%` }} />
                </span>
                <span className="w-8 text-right text-xs text-muted-foreground tabular-nums">{count}</span>
              </button>
            ))}
          </div>
        ) : (
          <Empty shape={['polygon', 3]} title="No tags yet">
            Write a <span className="text-foreground">#word</span> anywhere in a capture, a nugget or a task and it shows up here, counted. The ones that keep coming up are the ones worth a home of their own.
          </Empty>
        )}
      </Page>
      {chosen && (
        <Page
          title={`#${chosen}`}
          count={items.length}
          actions={
            // Rename everywhere at once; renaming onto a tag that exists merges them.
            <input
              key={chosen}
              placeholder="Rename or merge into…"
              className="w-44 rounded-md border bg-transparent px-2 py-1 text-[13px] outline-none placeholder:text-muted-foreground focus:border-ring"
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
          }
        >
          <div className="flex flex-col px-3 py-2">
            {items.map((item) => {
              const Icon = ICON[item.type as keyof typeof ICON] ?? Inbox
              return (
                <button
                  key={`${item.type}-${item.id}`}
                  type="button"
                  onClick={() => onOpen(item.type, item.id)}
                  className="flex items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-accent/60"
                >
                  <Icon className="size-4 shrink-0 text-muted-foreground" />
                  <span className="flex-1 truncate">{item.title || 'Untitled'}</span>
                  <span className="text-xs text-muted-foreground capitalize">{item.type}</span>
                </button>
              )
            })}
          </div>
        </Page>
      )}
    </>
  )
}
