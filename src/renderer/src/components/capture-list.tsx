import { useEffect, useState } from 'react'
import { Lock, Pin } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'

import { CAPTURE_TYPES } from './capture-kinds/capture-kind-picker'
import { captureKey } from '@/lib/capture-links'
import { splitTags } from '@/lib/vigil'
import { tick } from '@/lib/sound'
import { Tags } from './vigil/ui'

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
export function age(at: string): string {
  const minutes = (Date.now() - new Date(at).getTime()) / 60000
  const units: [number, string][] = [[525600, 'y'], [43200, 'mo'], [1440, 'd'], [60, 'h'], [1, 'm']]
  const [size, unit] = units.find(([size]) => minutes >= size) ?? [1, 'm']
  return `${Math.floor(minutes / size)}${unit}`
}

/**
 * Two lines a capture: kind, title and age; then its handle and where it came
 * from. One that has taken an exit is dimmed, the way Linear dims what is read.
 * `cursor` is where the keyboard is, drawn as a ring rather than a fill, so it
 * reads apart from the one that is open.
 */
export function CaptureList({ captures, selected, cursor, chosen = [], onPick }: {
  captures: CaptureMeta[]
  selected?: string
  cursor?: number
  chosen?: string[]
  onPick?: (id: string) => void
}): React.JSX.Element {
  return (
    <div className="flex flex-col gap-0.5 text-sm">
      {/* A row that takes an exit slides out, and the rest close up behind it. */}
      <AnimatePresence initial={false}>
      {captures.map((capture, index) => {
        const kind = CAPTURE_TYPES.find((type) => type.id === capture.kind) ?? CAPTURE_TYPES[0]
        const { text, tags } = splitTags(capture.title)
        return (
          <motion.button
            key={capture.id}
            layout="position"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: capture.status === 'open' ? 1 : 0.5, y: 0 }}
            exit={{ opacity: 0, x: 16 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            ref={index === cursor ? (element) => element?.scrollIntoView({ block: 'nearest' }) : undefined}
            type="button"
            className={`flex flex-col gap-0.5 rounded-md px-2 py-2 text-left transition-colors hover:bg-accent/60 ${chosen.includes(capture.id) ? 'bg-[color-mix(in_srgb,var(--tt-brand-color-400)_14%,transparent)]' : capture.id === selected ? 'bg-accent' : ''} ${index === cursor ? 'ring-1 ring-border' : ''}`}
            onMouseEnter={tick}
            onClick={() => onPick?.(capture.id)}
          >
            <span className="flex items-center gap-2">
              <kind.icon className="size-4 shrink-0" style={{ color: kind.tint }} />
              <span className="flex-1 truncate">{text || 'Untitled'}</span>
              {capture.pinnedAt && <Pin className="size-3 shrink-0 text-muted-foreground" />}
              {capture.private ? <Lock className="size-3 shrink-0 text-muted-foreground" /> : null}
              <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{age(capture.capturedAt)}</span>
            </span>
            <span className="truncate pl-6 text-xs text-muted-foreground">
              {captureKey(capture.number)}
              {capture.source ? ` · ${capture.source.replace(/\.md$/, '')}` : ''}
              {tags.length ? <span className="ml-2 inline-flex"><Tags tags={tags} /></span> : null}
            </span>
          </motion.button>
        )
      })}
      </AnimatePresence>
    </div>
  )
}
