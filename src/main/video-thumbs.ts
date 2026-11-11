/**
 * YouTube's 4:3 thumbnails (default, hqdefault, sddefault, 0.jpg to 3.jpg,
 * hq1 to sd3) have black bands baked into the picture over and under a 16:9
 * frame. Cropping the box cannot take them out; the 16:9 sizes (mqdefault,
 * hq720, maxresdefault) have none. maxresdefault is the sharpest but missing
 * for many videos (a 404 with a 120x90 grey placeholder); mqdefault (320x180)
 * is there for every video.
 */
const THUMB = /^https?:\/\/(?:i\d?\.ytimg\.com|img\.youtube\.com)\/(vi(?:_webp)?)\/([\w-]{6,})\/([\w]+)\.(jpg|webp)(?:\?.*)?$/i
/** The 4:3 ones, and which 16:9 frame each matches: the cover, or one of the three stills. */
const BANDED: Record<string, string> = { default: 'mqdefault', hqdefault: 'mqdefault', sddefault: 'mqdefault', '0': 'mqdefault', '1': 'mq1', '2': 'mq2', '3': 'mq3', hq1: 'mq1', hq2: 'mq2', hq3: 'mq3', sd1: 'mq1', sd2: 'mq2', sd3: 'mq3' }

/** Whether this address is one of YouTube's banded 4:3 thumbnails. */
export const isBandedThumb = (src: string): boolean => {
  const found = src.match(THUMB)
  return !!found && found[3].toLowerCase() in BANDED
}

/** A banded YouTube thumbnail in its 16:9 size, or null if this is not one. */
export function wideThumb(src: string, size?: 'maxresdefault' | 'mqdefault'): string | null {
  const found = src.match(THUMB)
  const wide = found && BANDED[found[3].toLowerCase()]
  if (!found || !wide) return null
  const [, folder, id, , ext] = found
  return `https://i.ytimg.com/${folder}/${id}/${size && wide === 'mqdefault' ? size : wide}.${ext}`
}

/** Whether a card's link is a YouTube video, whose 4:3 thumbnails carry bands. */
export const isYouTube = (href: string): boolean => {
  try {
    return /(^|\.)(youtube\.com|youtu\.be|youtube-nocookie\.com)$/i.test(new URL(href).hostname)
  } catch {
    return false
  }
}

/** The video's id from any of YouTube's addresses: watch, youtu.be, embed, shorts, the no-cookie one. */
export function videoId(src: string): string | null {
  try {
    const url = new URL(src)
    if (!/(^|\.)(youtube\.com|youtu\.be|youtube-nocookie\.com)$/i.test(url.hostname)) return null
    const fromPath = url.pathname.match(/^\/(?:embed|shorts|live|v)\/([\w-]{6,})/)?.[1]
    if (fromPath) return fromPath
    if (/(^|\.)youtu\.be$/i.test(url.hostname)) return url.pathname.slice(1).split("/")[0] || null
    return url.searchParams.get("v")
  } catch {
    return null
  }
}

/** A video's picture straight from its id, with no wait for its page: the sharp 4:3 one (bands cut away where shown), or the 16:9 one every video has. */
export const idThumbs = (id: string): [string, string] => [`https://i.ytimg.com/vi/${id}/hqdefault.jpg`, `https://i.ytimg.com/vi/${id}/mqdefault.jpg`]
