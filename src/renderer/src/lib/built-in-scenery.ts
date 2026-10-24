import { call } from '@/lib/haligtree'
import wandererUrl from '@/assets/scenery/wanderer.webp'
import montBlancUrl from '@/assets/scenery/mont-blanc.webp'
import tahoeUrl from '@/assets/scenery/lake-tahoe.webp'
import landersUrl from '@/assets/scenery/landers-peak.webp'
import berninaUrl from '@/assets/scenery/bernina.webp'
import prairieUrl from '@/assets/scenery/evening-prairie.webp'
import jungfrauUrl from '@/assets/scenery/jungfrau.webp'
import harborUrl from '@/assets/scenery/harbor-entrance.webp'
import mananUrl from '@/assets/scenery/grand-manan.webp'
import lucerneUrl from '@/assets/scenery/lake-lucerne.webp'
import penobscotUrl from '@/assets/scenery/penobscot-bay.webp'
import sierraUrl from '@/assets/scenery/sierra-nevada.webp'
import oxbowUrl from '@/assets/scenery/the-oxbow.webp'
import twilightUrl from '@/assets/scenery/twilight-wilderness.webp'
import temeraireUrl from '@/assets/scenery/fighting-temeraire.webp'
import pineUrl from '@/assets/scenery/pine-forest.webp'
import waveUrl from '@/assets/scenery/ninth-wave.webp'
import haywainUrl from '@/assets/scenery/hay-wain.webp'
import yellowstoneUrl from '@/assets/scenery/yellowstone.webp'
import andesUrl from '@/assets/scenery/heart-of-the-andes.webp'

/** The public-domain landscapes Haligtree ships with, written to a folder of its own; that folder's path. */
export async function builtInScenery(): Promise<string> {
  const files = await Promise.all(([['wanderer.webp', wandererUrl], ['mont-blanc.webp', montBlancUrl], ['lake-tahoe.webp', tahoeUrl], ['landers-peak.webp', landersUrl], ['bernina.webp', berninaUrl], ['evening-prairie.webp', prairieUrl], ['jungfrau.webp', jungfrauUrl], ['harbor-entrance.webp', harborUrl], ['grand-manan.webp', mananUrl], ['lake-lucerne.webp', lucerneUrl], ['penobscot-bay.webp', penobscotUrl], ['sierra-nevada.webp', sierraUrl], ['the-oxbow.webp', oxbowUrl], ['twilight-wilderness.webp', twilightUrl], ['fighting-temeraire.webp', temeraireUrl], ['pine-forest.webp', pineUrl], ['ninth-wave.webp', waveUrl], ['hay-wain.webp', haywainUrl], ['yellowstone.webp', yellowstoneUrl], ['heart-of-the-andes.webp', andesUrl]] as const)
    .map(async ([name, url]) => ({ name, bytes: new Uint8Array(await (await fetch(url)).arrayBuffer()) })))
  return call<string>('sandbox:scenery', files)
}
