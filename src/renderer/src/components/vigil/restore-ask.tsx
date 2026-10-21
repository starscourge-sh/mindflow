import { useEffect, useState } from 'react'
import { History } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Kbd } from '@/components/ui/kbd'
import { chime } from '@/lib/sound'
import { APP_NAME } from '../../../../main/name'

/**
 * "Go back to this copy?", asked in Vigil's own sheet rather than the Mac's
 * plain message box: main picks the file, then waits here for the answer
 * (main/index.ts, restore). Escape or Cancel keeps everything as it is.
 */
export function RestoreAsker(): React.JSX.Element | null {
  const [asked, setAsked] = useState<{ name: string; token: string } | null>(null)
  useEffect(() => {
    const onAsk = (event: Event): void => {
      chime('open')
      setAsked((event as CustomEvent<{ name: string; token: string }>).detail)
    }
    window.addEventListener('vigil:restore-ask', onAsk)
    return () => window.removeEventListener('vigil:restore-ask', onAsk)
  }, [])
  if (!asked) return null
  const answer = (ok: boolean): void => {
    chime(ok ? 'tap' : 'fold')
    window.api.answerRestore(asked.token, ok)
    setAsked(null)
  }
  return (
    <div className="fixed inset-0 z-[80] flex items-start justify-center bg-black/40 pt-[22vh]" onMouseDown={() => answer(false)}>
      <div role="alertdialog" aria-modal="true" aria-labelledby="restore-ask-title" data-restore-ask
        className="flex w-[min(30rem,90vw)] flex-col gap-3 rounded-xl bg-popover p-5 shadow-(--mf-panel-shadow)"
        onMouseDown={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          event.stopPropagation()
          if (event.key === 'Escape') answer(false)
        }}>
        <p id="restore-ask-title" className="flex items-center gap-2 text-base font-semibold text-foreground">
          <History className="size-4 shrink-0" /> Go back to {asked.name}?
        </p>
        <p className="text-body text-foreground">
          Everything changed since that copy will be replaced. <strong className="font-semibold">What you have now is saved first</strong>, beside the backups, so this can be undone the same way. <strong className="font-semibold">Then {APP_NAME} starts again.</strong>
        </p>
        <div className="mt-1 flex items-center justify-end gap-2">
          <Button autoFocus variant="ghost" size="sm" onClick={() => answer(false)}>Cancel <Kbd>Esc</Kbd></Button>
          <Button data-restore-go variant="destructive" size="sm" onClick={() => answer(true)}>Restore and start again</Button>
        </div>
      </div>
    </div>
  )
}
