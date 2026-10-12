/**
 * What a kind of celebration plays, as chosen in Settings › “What plays for
 * each”: Vigil's own paper drawing, your own file, or a GIF from Giphy (the
 * one pinned, else a random one for your search words). A kind never chosen
 * plays your files if it has some, then its pinned GIF, then Giphy: Giphy is
 * on to start. A task done is the one exception: never chosen, it gets just
 * its tick, no card. Read by the main process and the windows alike.
 */
export type MomentSource = 'drawing' | 'file' | 'giphy'

export type SourceSettings = {
  celebrationSources?: Partial<Record<string, MomentSource>>
  celebrationPicks?: Partial<Record<string, string[]>>
  giphyPins?: Partial<Record<string, unknown>>
}

export function sourceOf(kind: string, saved: SourceSettings): MomentSource {
  const said = saved.celebrationSources?.[kind]
  if (said === 'drawing' || said === 'file' || said === 'giphy') return said
  if (saved.celebrationPicks?.[kind]?.length) return 'file'
  if (saved.giphyPins?.[kind]) return 'giphy'
  return kind === 'taskDone' ? 'drawing' : 'giphy'
}
