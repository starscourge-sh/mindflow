import { useEffect, useState } from 'react'
import type { JSONContent } from '@tiptap/core'

import { EXITS, captureKey, takeExit } from '@/lib/capture-links'
import { chime } from '@/lib/sound'
import { AskWho, toast } from './vigil/ui'

type Capture = Awaited<ReturnType<typeof window.api.captures.rot>>[number]

/** A body's words, whether it arrived as Markdown or as the editor's JSON. */
export const textOf = (body: unknown): string => {
  // Markdown read as words: no list markers, no bold or code marks.
  if (typeof body === 'string') return body.replace(/^\s*[-*]\s+/gm, '').replace(/\*\*|__|`/g, '')
  const walk = (node: JSONContent): string => node.text ?? (node.content ?? []).map(walk).join('\n')
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
    void takeExit(id, status).then((result) => {
      if (result === 'needs-source') toast('A quote needs a source first: open it and say who said it')
      reload()
    })
  }

  if (!cards.length) return null
  return (
    <section className="mb-2">
      <h3 className="px-2 pb-1 text-xs text-muted-foreground">Waiting on you</h3>
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
          <button type="button" data-row className="line-clamp-3 w-full whitespace-pre-line text-left" onClick={() => onOpen(card.id)}>
            {shown(card.title, card.body)}
          </button>
          {asking === card.id ? (
            <div className="mt-1"><AskWho id={card.id} onDone={() => setAsking(null)} /></div>
          ) : (
          <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
            <span className="mr-auto truncate">
              {captureKey(card.number)} · {new Date(card.capturedAt).toLocaleDateString()}
            </span>
            {EXITS.map((one) => (
              <button
                key={one.key}
                type="button"
                className="rounded px-1.5 py-0.5 opacity-70 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 hover:bg-accent hover:text-foreground"
                title={`${one.label} (${one.key})`}
                onClick={() => exit(card.id, one.status)}
              >
                {one.label}
              </button>
            ))}
            <button
              type="button"
              className="rounded px-1.5 py-0.5 opacity-70 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 hover:bg-accent hover:text-foreground"
              title="Who said it (w)"
              onClick={() => setAsking(card.id)}
            >
              {card.attribution ?? 'Who?'}
            </button>
          </div>
          )}
        </div>
      ))}
    </section>
  )
}
