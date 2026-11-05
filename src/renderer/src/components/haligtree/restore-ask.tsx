import { useEffect } from 'react'
import { APP_NAME } from '../../../../main/name'
import { askSure } from './ui'

/**
 * "Go back to this copy?", asked in Haligtree's own yes-or-no sheet (askSure)
 * rather than the Mac's plain message box: main picks the file, then waits
 * here for the answer (main/index.ts, restore). Escape or Cancel keeps
 * everything as it is.
 */
export function RestoreAsker(): null {
  useEffect(() => {
    const onAsk = (event: Event): void => {
      const { name, token } = (event as CustomEvent<{ name: string; token: string }>).detail
      void askSure(`Go back to ${name}?`,
        <>Everything changed since that copy will be replaced. <strong>What you have now is saved first</strong>, beside the backups, so this can be undone the same way. <strong>Then {APP_NAME} starts again.</strong></>,
        'Restore and start again', { danger: true }).then((ok) => window.api.answerRestore(token, ok))
    }
    window.addEventListener('haligtree:restore-ask', onAsk)
    return () => window.removeEventListener('haligtree:restore-ask', onAsk)
  }, [])
  return null
}
