import { Pin, X } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'

import { CAPTURE_TYPES } from './capture-kinds/capture-kind-picker'
import { useLive, vigil, type Pin as Pinned } from '@/lib/vigil'
import { RowMenu } from './vigil/row-menu'
import { Tip } from '@/components/vigil/ui'
import { Button } from '@/components/ui/button'

/**
 * Pinned: what you parked to see again soon, "mention the freight change at
 * 3pm". Three at most, so it stays a glance and never becomes a list to scan.
 * Gated like everything else that turns up unasked.
 */
export function Pins({ onOpen }: { onOpen: (type: string, id: string) => void }): React.JSX.Element | null {
  const pins = useLive(vigil.pins, [] as Pinned[])
  if (!pins.length) return null
  return (
    <div className="mb-3 flex flex-col gap-1">
      <AnimatePresence initial={false}>
        {pins.map((pin) => {
          const kind = CAPTURE_TYPES.find((type) => type.id === pin.kind) ?? CAPTURE_TYPES[0]
          const table = pin.type === 'capture' ? 'captures' : 'nuggets'
          // A pin stays only while it matters. After three days it asks, with
          // the three answers right there, or it turns into wallpaper.
          const stale = Date.now() - new Date(pin.pinnedAt).getTime() > 3 * 86400000
          return (
            <motion.div
              key={pin.id}
              layout
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, height: 0 }}
              className="group flex items-center gap-2 rounded-md bg-accent/50 px-2 py-1.5 text-sm"
            >
              <Pin className="size-3.5 shrink-0 text-[var(--tt-brand-color-400)]" />
              <kind.icon className="size-3.5 shrink-0" style={{ color: kind.tint }} />
              <RowMenu items={[
                { label: 'Open', run: () => onOpen(pin.type, pin.id) },
                pin.type === 'capture' && { label: 'Make it a task', run: () => void vigil.toTask(pin.id).then(() => vigil.pin(table, pin.id, false)) },
                'separator',
                { label: 'Unpin', run: () => void vigil.pin(table, pin.id, false) }
              ]}>
                <button type="button" className="flex-1 truncate text-left hover:underline" onClick={() => onOpen(pin.type, pin.id)}>{pin.title || 'Untitled'}</button>
              </RowMenu>
              {stale && (
                <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                  Still relevant?
                  <Button variant="ghost" size="sm" onClick={() => void vigil.pin(table, pin.id, true)}>Keep</Button>
                  {pin.type === 'capture' && (
                    <Button variant="ghost" size="sm" onClick={() => void vigil.toTask(pin.id).then(() => vigil.pin(table, pin.id, false))}>Task</Button>
                  )}
                </span>
              )}
              <Tip label="Unpin">
              <button
                type="button"
              
                className="rounded p-0.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:text-foreground"
                onClick={() => void vigil.pin(table, pin.id, false)}
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
