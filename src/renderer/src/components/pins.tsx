import { AnimatePresence, motion } from 'motion/react'
import { EASE, shift } from '@/lib/motion'

import { CAPTURE_TYPES } from './capture-kinds/capture-kind-picker'
import { useLive, vigil, type Pin as Pinned } from '@/lib/vigil'
import { makeTask } from '@/lib/tasks'
import { RowMenu } from './vigil/row-menu'
import { Tip, pin as unpin } from '@/components/vigil/ui'
import { Button } from '@/components/ui/button'
import { daysSince } from '../../../main/dates'
import { orderItems, useInOrder, useOrder } from './vigil/places'
import { Bookmark as Pin, X } from '@/components/ui/icons'

/**
 * Pinned: what you parked to see again soon, "mention the freight change at
 * 3pm". Three at most, so it stays a glance and never becomes a list to scan.
 * Gated like everything else that turns up unasked.
 */
export function Pins({ onOpen, compact = false }: { onOpen: (type: string, id: string) => void; compact?: boolean }): React.JSX.Element | null {
  // In the order kept in the sidebar's Pinned, where they drag; a step at a time here.
  const usual = useLive(vigil.pins, [] as Pinned[])
  const pins = useInOrder(usual, 'pinOrder', (pin) => `${pin.type}:${pin.id}`)
  const custom = useOrder('pinOrder').length > 0
  if (!pins.length) return null
  return (
    // Short on room, they fold to one row of chips, each its title cut to fit, so the list under them keeps its rows.
    <div data-pins-compact={compact || undefined} className={compact ? 'relative mb-1.5 flex min-w-0 items-center gap-1' : 'relative mb-3 flex flex-col overflow-hidden rounded-lg bg-foreground/[0.045]'}>
      {compact && <Pin aria-hidden className="mx-1 size-3.5 shrink-0 text-[var(--tt-brand-color-400)]" />}
      {/* One unpinned fades out of the way and the rest close up on their layout. */}
      <AnimatePresence initial={false} mode="popLayout">
        {pins.map((pin) => {
          const kind = CAPTURE_TYPES.find((type) => type.id === pin.kind) ?? CAPTURE_TYPES[0]
          const table = pin.type === 'capture' ? 'captures' : 'nuggets'
          // A pin stays only while it matters. After three days it asks, with
          // the three answers right there, or it turns into wallpaper.
          const stale = daysSince(pin.pinnedAt) > 3
          return (
            <motion.div
              key={pin.id}
              layout="position"
              initial={{ opacity: 0, transform: shift('translateY(-4px)') }}
              animate={{ opacity: 1, transform: shift('translateY(0px)') }}
              exit={{ opacity: 0, transition: { duration: 0.14, ease: EASE } }}
              data-pin
              className={compact ? 'group flex min-w-0 max-w-fit flex-1 basis-0 items-center gap-1.5 rounded-full bg-foreground/[0.045] py-0.5 pr-1 pl-2 text-sm' : 'group flex items-center gap-2 px-2 py-1.5 text-sm'}
            >
              {!compact && <Pin className="size-3.5 shrink-0 text-[var(--tt-brand-color-400)]" />}
              <kind.icon className="size-3.5 shrink-0" style={{ color: kind.tint }} />
              <RowMenu items={[
                { label: 'Open', run: () => onOpen(pin.type, pin.id) },
                // Folded to a chip, its "Still relevant?" question is asked here instead.
                compact && stale && { label: 'Keep it pinned', hint: 'Still relevant', run: () => void vigil.pin(table, pin.id, true) },
                pin.type === 'capture' && { label: 'Make it a task', run: () => void makeTask({ capture: pin.id }, undefined, { onUndo: () => void vigil.pin(table, pin.id, true) }).then((made) => made && vigil.pin(table, pin.id, false)) },
                'separator',
                ...orderItems({ setting: 'pinOrder', usual: usual.map((one) => `${one.type}:${one.id}`), id: `${pin.type}:${pin.id}`, among: pins.map((one) => `${one.type}:${one.id}`), what: 'Pinned', name: pin.title || 'Untitled' }, custom),
                'separator',
                { label: 'Unpin', run: () => unpin(table, pin.id, false) }
              ]}>
                <button type="button" data-private={pin.private ? '' : undefined} className="min-w-0 flex-1 text-left hover:underline" onClick={() => onOpen(pin.type, pin.id)}>
                  {/* Cut inside the blurred words, so the "…" is blurred with them. */}
                  <span className="private-text block truncate">{pin.title || 'Untitled'}</span>
                </button>
              </RowMenu>
              {stale && !compact && (
                <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                  Still relevant?
                  <Button variant="ghost" size="sm" onClick={() => void vigil.pin(table, pin.id, true)}>Keep</Button>
                  {pin.type === 'capture' && (
                    <Button variant="ghost" size="sm" onClick={() => void makeTask({ capture: pin.id }, undefined, { onUndo: () => void vigil.pin(table, pin.id, true) }).then((made) => made && vigil.pin(table, pin.id, false))}>Task</Button>
                  )}
                </span>
              )}
              <Tip label="Unpin">
              <button
                type="button"
                aria-label="Unpin"
                className="relative rounded p-0.5 text-muted-foreground opacity-0 transition-opacity after:absolute after:-inset-1 after:rounded group-hover:opacity-100 focus-visible:opacity-100 hover:text-foreground"
                onClick={() => unpin(table, pin.id, false)}
              >
                <X className="size-3.5" />
              </button>
              </Tip>
            </motion.div>
          )
        })}
      </AnimatePresence>
    </div>
  )
}
