import { refuse, toast } from '@/components/vigil/ui'
import { chime } from '@/lib/sound'
import { vigil } from '@/lib/vigil'
import { ago } from '../../../main/dates'

/** "just now", "12 minutes ago", "2 hours ago", then by the calendar: "yesterday", "3 days ago". */
export const backedUpAgo = (at: number): string => {
  const minutes = Math.floor((Date.now() - at) / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'} ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 12 || ago(at) === 'today') return `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`
  return ago(at)
}

/**
 * Another folder for the backups, picked in the system's chooser, or back to
 * the usual place: a backup runs there at once and says whether it worked.
 * Settings and the "Backups have stopped" toast both come here.
 */
export async function chooseBackupFolder(usual = false): Promise<{ at: number | null; failing: string | null; chosen: boolean } | null> {
  const status = await vigil.chooseBackups(usual)
  if (!status) return null
  if (status.failing) refuse(`That folder didn't work either: ${status.failing}. Choose another`, 'error')
  else {
    chime('saved')
    toast(usual ? 'Backups go to the usual place again. A copy was made there just now' : 'Backups go to the new folder. A copy was made there just now')
  }
  window.dispatchEvent(new CustomEvent('vigil:backups'))
  return status
}
