import { PointerSensor, type PointerSensorOptions } from '@dnd-kit/core'
import type { PointerEvent } from 'react'

/**
 * The drag library's press sensor, deaf to a press that belongs to something inside the row with presses or drags of
 * its own, marked `data-own-press` (a folder under Writing in the sidebar, a scale under the Journal): the row is
 * not carried away by it.
 *
 * Those places used to stop the press where it was (`stopPropagation`). That kept it from the row, and also from the
 * document, where every open popover listens for a press outside itself: a folder's icon picker stayed up when
 * another folder's icon was pressed, two pickers at once (12 Nov), and no popover anywhere closed on a press there.
 * The press now travels on like any other; only the row's own carry lets it be.
 */
export class RowSensor extends PointerSensor {
  static activators = [
    {
      eventName: 'onPointerDown' as const,
      handler: (event: PointerEvent, options: PointerSensorOptions): boolean => {
        const own = (event.target as Element | null)?.closest?.('[data-own-press]')
        if (own && own !== event.currentTarget && (event.currentTarget as Element).contains(own)) return false
        return PointerSensor.activators[0].handler(event, options)
      }
    }
  ]
}
