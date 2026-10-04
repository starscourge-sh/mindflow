import { useEffect, useState } from 'react'
import type { JSONContent } from '@tiptap/core'

import { EXITS, captureKey, takeExit } from '@/lib/capture-links'
import { chime } from '@/lib/sound'
import { wordsOf } from '../../../main/import'
import { AskWho, pin, toast } from './vigil/ui'
import { RowMenu, copy } from './vigil/row-menu'
import { vigil } from '@/lib/vigil'
import { Kbd, Tip } from '@/components/vigil/ui'
import { Button } from '@/components/ui/button'

type Capture = Awaited<ReturnType<typeof window.api.captures.rot>>[number]

/** A body's words, whether it arrived as Markdown or as the editor's JSON. */
export const textOf = (body: unknown): string => {
  // Markdown read as words: no list markers, links as their words, no marks.
  if (typeof body === 'string')
    return body
      .replace(/^\s*[-*]\s+/gm, '')
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, '$1')
      .replace(/\$(?=\S)([^$\n]*?\S)\$(?!\d)/g, '$1')
      .replace(/\*\*|__|`|==|~~/g, '')
  // Blocks on their own lines; inside one, its words as written, emoji and all.
  const walk = (node: JSONContent): string =>
    node.content?.some((child) => child.text !== undefined || child.type === 'emoji') ? wordsOf(node) : node.text ?? (node.content ?? []).map(walk).join('\n')
  return body ? walk(body as JSONContent) : ''
}

/**
 * What a card says: its words, once. The stored title is only shown over a
 * bare address, as a bookmark's page name, or when there are no words at all;
 * for anything else it is a cleaned copy of the first line, said twice.
 */
export const shown = (title: string, body: unknown): string => {
  const text = textOf(body).trim()
  return /^https?:\/\/\S+$/.test(text) && title && title !== text ? `${title}\n${text}` : text || title
}

/**
 * The rot sampler: three captures nobody has done anything with, leaning old,
 * each with its three exits right there. A sample, never a queue - it does not
 * empty, and nothing says it should.
 *
 * Drawn each time the window is brought up and after an exit, not on every
 * change elsewhere, or the cards would shuffle under you while you type.
 */
export function RotCards({ onOpen }: { onOpen: (id: string) => void }): React.JSX.Element | null {
  const [cards, setCards] = useState<Capture[]>([])
  // The card whose who is being asked, from its w key.
  const [asking, setAsking] = useState<string | null>(null)
  const reload = (): void => void window.api.captures.rot().then(setCards)
  useEffect(() => {
    reload()
    return window.api.onShown(reload)
  }, [])

  const exit = (id: string, status: string): void => {
    chime(status === 'discarded' ? 'away' : status === 'promoted' ? 'promote' : 'done')
    // A quote with no source is asked for one inside takeExit.
    void takeExit(id, status).then(reload)
  }

  if (!cards.length) return null
  return (
    <section className="mb-2">
      <Tip label="Three old captures with no exit yet, a new three each time you open this. A sample, not a list to clear. Click one to read or edit it.">
        <h3 className="w-fit px-2 pb-1 text-xs text-muted-foreground">Waiting on you</h3>
      </Tip>
      {cards.map((card) => (
        <div
          key={card.id}
          tabIndex={0}
          data-tone="knock"
          className="group border-b border-border/60 px-2 py-2 text-sm outline-none last:border-b-0 focus-visible:bg-accent/40"
          onKeyDown={(event) => {
            if (event.target !== event.currentTarget) return
            const picked = EXITS.find((one) => one.key === event.key)
            if (picked) exit(card.id, picked.status)
            else if (event.key === 'w') {
              event.preventDefault()
              setAsking(card.id)
            }
          }}
        >
          <RowMenu items={[
            { label: 'Open', run: () => onOpen(card.id) },
            'separator',
            ...EXITS.map((one) => ({ label: one.label, keys: one.key.toUpperCase(), danger: one.status === 'discarded', run: () => exit(card.id, one.status) })),
            { label: 'Make it a task', run: () => void vigil.toTask(card.id).then(() => { toast('Now a task'); reload() }) },
            { label: 'Say who said it', keys: 'W', run: () => setAsking(card.id) },
            'separator',
            { label: 'Pin to the prompt', run: () => pin('captures', card.id, true) },
            { label: `Copy ${captureKey(card.number)}`, run: () => copy(captureKey(card.number)) }
          ]}>
            <button type="button" data-row className="line-clamp-3 w-full whitespace-pre-line text-left" onClick={() => onOpen(card.id)}>
              {shown(card.title, card.body)}
            </button>
          </RowMenu>
          {asking === card.id ? (
            <div className="mt-1"><AskWho id={card.id} onDone={() => setAsking(null)} /></div>
          ) : (
          <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
            <span className="mr-auto truncate">
              {captureKey(card.number)} · {new Date(card.capturedAt).toLocaleDateString()}
            </span>
            {EXITS.map((one) => (
              <Tip key={one.key} label={<span className="flex items-center gap-2">{one.what}<Kbd>{one.key.toUpperCase()}</Kbd></span>}>
              <Button variant="ghost" size="sm"
 className="opacity-70 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
 style={{ color: `var(--tt-color-text-${one.tint})` }}
 onClick={() => exit(card.id, one.status)}
>
                {one.label}
              </Button>
              </Tip>
            ))}
            <Tip label={<span className="flex items-center gap-2">Say who said it: a quote needs one to be kept<Kbd>W</Kbd></span>}>
            <Button variant="ghost" size="sm"
 className="opacity-70 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
 
 onClick={() => setAsking(card.id)}
>
              {card.attribution ?? 'Who?'}
            </Button>
            </Tip>
          </div>
          )}
        </div>
      ))}
    </section>
  )
}
