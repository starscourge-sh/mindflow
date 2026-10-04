import { useEffect, useState } from 'react'

import { CAPTURE_TYPES } from './capture-kinds/capture-kind-picker'
import { captureKey } from '@/lib/capture-links'

export type CaptureMeta = Awaited<ReturnType<typeof window.api.captures.list>>[number]

/** Every capture, newest first, reloaded whenever any window writes. */
export function useCaptures(): CaptureMeta[] {
  const [captures, setCaptures] = useState<CaptureMeta[]>([])
  useEffect(() => {
    const reload = (): void => void window.api.captures.list().then(setCaptures)
    reload()
    return window.api.captures.onChange(reload)
  }, [])
  return captures
}

/** How long ago, the way Linear writes it: 5m, 3h, 26d, 4mo, 2y. */
function age(at: string): string {
  const minutes = (Date.now() - new Date(at).getTime()) / 60000
  const units: [number, string][] = [[525600, 'y'], [43200, 'mo'], [1440, 'd'], [60, 'h'], [1, 'm']]
  const [size, unit] = units.find(([size]) => minutes >= size) ?? [1, 'm']
  return `${Math.floor(minutes / size)}${unit}`
}

/**
 * Two lines a capture: kind, title and age; then its handle and where it came
 * from. One that has taken an exit is dimmed, the way Linear dims what is read.
 */
export function CaptureList({ captures, selected, onPick }: {
  captures: CaptureMeta[]
  selected?: string
  onPick?: (id: string) => void
}): React.JSX.Element {
  return (
    <div className="flex flex-col gap-0.5 text-sm">
      {captures.map((capture) => {
        const kind = CAPTURE_TYPES.find((type) => type.id === capture.kind) ?? CAPTURE_TYPES[0]
        return (
          <button
            key={capture.id}
            type="button"
            className={`flex flex-col gap-0.5 rounded-md px-2 py-1.5 text-left hover:bg-accent ${capture.id === selected ? 'bg-accent' : ''} ${capture.status === 'open' ? '' : 'opacity-50'}`}
            onClick={() => onPick?.(capture.id)}
          >
            <span className="flex items-center gap-2">
              <kind.icon className="size-4 shrink-0" style={{ color: kind.tint }} />
              <span className="flex-1 truncate">{capture.title || 'Untitled'}</span>
              <span className="shrink-0 text-xs text-muted-foreground">{age(capture.capturedAt)}</span>
            </span>
            <span className="truncate pl-6 text-xs text-muted-foreground">
              {captureKey(capture.number)}
              {capture.source ? ` · ${capture.source.replace(/\.md$/, '')}` : ''}
            </span>
          </button>
        )
      })}
    </div>
  )
}
