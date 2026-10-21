import { useEffect, useMemo, useState } from 'react'
import type { JSONContent } from '@tiptap/core'
import { ArrowLeft } from 'lucide-react'

import { MindflowEditor, TAGS } from '../mindflow'
import { vigil, type Item, type ItemFull } from '@/lib/vigil'
import { chime } from '@/lib/sound'
import { tintOf, type NoteGroup } from '@/lib/groups'
import { num } from '../../../../main/dates'
import { CollectionHeader, Cover, PlayButton, pictureIn, useTint } from './collection-header'
import { ReadThrough } from './read-through'
import { SmoothScroll, Tip, useReadKey } from './ui'
import { GroupIcon } from './kept-groups'

/** A group's notes in order: its own, and each subgroup's under the subgroup's name. */
export type GroupParts = { sub?: NoteGroup; items: Item[] }[]

/**
 * A group read as a page, the way a tag's page reads: its name over a cover,
 * how many notes it holds, Read through, and every note in it whole, one
 * after another, each subgroup's under its name. A click on a note opens it;
 * the arrow at the top, or Escape, goes back to the list.
 */
export function GroupPage({ group, parts, onOpen, onClose }: { group: NoteGroup; parts: GroupParts; onOpen: (id: string) => void; onClose: () => void }): React.JSX.Element {
  const ids = parts.flatMap((part) => part.items.map((item) => item.id))
  const [full, setFull] = useState<Map<string, ItemFull>>(new Map())
  useEffect(() => {
    let live = true
    void Promise.all(ids.map((id) => vigil.item(id))).then((found) => live && setFull(new Map(found.filter((one): one is ItemFull => !!one).map((one) => [one.id, one]))))
    return () => void (live = false)
  }, [ids.join(' ')]) // eslint-disable-line react-hooks/exhaustive-deps
  const [reading, setReading] = useState(false)
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape' || reading || event.defaultPrevented) return
      event.preventDefault()
      chime('tuck')
      onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [reading, onClose])
  const readable = parts.flatMap((part) => part.items.filter((item) => !item.private).map((item) => ({ type: item.tier, id: item.id })))
  useReadKey(() => readable.length && setReading(true), readable.length, !reading)
  const cover = useMemo(() => [...full.values()].filter((one) => !one.private).map((one) => pictureIn(one.body)).find(Boolean) ?? null, [full])
  const colour = tintOf(group.color) ?? 'var(--tt-color-text-brown)'
  const tint = useTint(cover, colour)
  const subs = parts.filter((part) => part.sub).length
  return (
    <section data-group-page={group.id} className="relative flex min-w-0 flex-1 flex-col">
      {reading && <ReadThrough items={readable} onClose={() => setReading(false)} />}
      <header className="page-column flex h-10 shrink-0 items-center gap-2 border-b px-5 text-muted-foreground">
        <Tip label="Back to the list  Esc">
          <button type="button" data-group-page-back onClick={() => (chime('tuck'), onClose())}
            className="-ml-1.5 flex items-center gap-1.5 rounded-md px-1.5 py-1 text-control text-foreground transition-colors hover:bg-accent">
            <ArrowLeft className="size-4" />
            <GroupIcon icon={group.icon} color={group.color} className="size-3.5" />
            <span className="font-medium">{group.name}</span>
          </button>
        </Tip>
      </header>
      <SmoothScroll>
        <CollectionHeader
          tint={tint}
          backdrop={cover}
          cover={<Cover src={cover} colour={colour} seed={`group:${group.id}`}>{group.name}</Cover>}
          label="Group"
          title={<span>{group.name}</span>}
          length={group.name.length}
          meta={[`${num(ids.length)} ${ids.length === 1 ? 'note' : 'notes'}`, ...(subs ? [`${num(subs)} ${subs === 1 ? 'subgroup' : 'subgroups'}`] : [])]}
          actions={<PlayButton label="Read through  R" onClick={() => readable.length && setReading(true)} />}
        />
        <div data-group-stream className="page-column w-full px-5 [--mf-padding:0] @[44rem]/page:px-8">
          {parts.map((part, at) => (
            <section key={part.sub?.id ?? `own-${at}`} data-group-part={part.sub?.id ?? ''} className="[&>article+article]:mt-px [&>article+article]:shadow-[0_-1px_0_color-mix(in_oklab,var(--border)_50%,transparent)]">
              {part.sub && (
                <h2 className="mt-6 mb-1 flex items-center gap-2 font-heading text-lg font-bold tracking-[-0.01em] text-foreground">
                  <GroupIcon icon={part.sub.icon} color={part.sub.color} />
                  {part.sub.name}
                </h2>
              )}
              {part.items.map((item) => (
                <article key={item.id} data-group-note={item.id} data-private={item.private ? '' : undefined}
                  role="link" tabIndex={0} aria-label={`Open ${item.title || 'it'}`}
                  onClick={(event) => !(event.target as HTMLElement).closest('a, button, input, summary') && onOpen(item.id)}
                  onKeyDown={(event) => event.key === 'Enter' && event.target === event.currentTarget && onOpen(item.id)}
                  className="private-text -mx-2 cursor-pointer rounded-md px-2 py-4 outline-none transition-colors hover:bg-accent/30 focus-visible:ring-2 focus-visible:ring-ring/50 [&_.mindflow-editor-content]:p-0 [&_.tiptap.ProseMirror]:cursor-pointer">
                  {item.title && <h3 className="mb-1 font-semibold text-foreground">{item.title}</h3>}
                  {full.has(item.id) ? (
                    <MindflowEditor host={window.api} tokens={TAGS} readOnly defaultContent={(full.get(item.id)!.body as JSONContent | string | null) ?? ''}
                      toolbar={false} handles={false} slash={false} outline={false} search={false} vim={false} autofocus={false} />
                  ) : <div className="h-3 w-2/3 rounded-full bg-foreground/[0.06]" />}
                </article>
              ))}
            </section>
          ))}
        </div>
      </SmoothScroll>
    </section>
  )
}
