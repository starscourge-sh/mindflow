import { useEffect, useState } from 'react'
import type { JSONContent } from '@tiptap/core'

import { EXITS, captureKey, takeExit } from '@/lib/capture-links'

type Capture = Awaited<ReturnType<typeof window.api.captures.rot>>[number]

/** A body's words, whether it arrived as Markdown or as the editor's JSON. */
export const textOf = (body: unknown): string => {
  // Markdown read as words: no list markers, no bold or code marks.
  if (typeof body === 'string') return body.replace(/^\s*[-*]\s+/gm, '').replace(/\*\*|__|`/g, '')
  const walk = (node: JSONContent): string => node.text ?? (node.content ?? []).map(walk).join('\n')
  return body ? walk(body as JSONContent) : ''
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
  const reload = (): void => void window.api.captures.rot().then(setCards)
  useEffect(() => {
    reload()
    return window.api.onShown(reload)
  }, [])

  const exit = (id: string, status: string): void => void takeExit(id, status).then(reload)

  if (!cards.length) return null
  return (
    <div className="mb-3 flex flex-col gap-2">
      {cards.map((card) => (
        <div
          key={card.id}
          tabIndex={0}
          className="rounded-md border p-2 text-sm outline-none focus:border-[var(--tt-brand-color-400)]"
          onKeyDown={(event) => {
            const picked = EXITS.find((one) => one.key === event.key)
            if (picked) exit(card.id, picked.status)
          }}
        >
          <button type="button" className="line-clamp-4 w-full whitespace-pre-line text-left" onClick={() => onOpen(card.id)}>
            {textOf(card.body)}
          </button>
          <div className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
            <span className="mr-auto truncate">
              {captureKey(card.number)} · {new Date(card.capturedAt).toLocaleDateString()}
            </span>
            {EXITS.map((one) => (
              <button
                key={one.key}
                type="button"
                className="rounded px-1.5 py-0.5 hover:bg-accent hover:text-foreground"
                title={`${one.label} (${one.key})`}
                onClick={() => exit(card.id, one.status)}
              >
                {one.label}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
