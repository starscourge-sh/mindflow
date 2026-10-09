/**
 * YouTube's usual thumbnails (hqdefault, sddefault, default) are 4:3 with
 * black bands baked into the picture over and under a 16:9 frame. Cropping
 * the box cannot take them out; the 16:9 sizes have none. maxresdefault is
 * the sharpest but is missing for many videos (a 404 with a 120x90 grey
 * placeholder), and mqdefault (320x180) is there for every video.
 */
const THUMB = /^https?:\/\/(?:i\d?\.ytimg\.com|img\.youtube\.com)\/(vi(?:_webp)?)\/([\w-]{6,})\/(?:hq|sd)?default(\.jpg|\.webp)(\?.*)?$/i

/** A YouTube thumbnail in its 16:9 size, or null if this is not a banded one. */
export function wideThumb(src: string, size: 'maxresdefault' | 'mqdefault' = 'mqdefault'): string | null {
  const found = src.match(THUMB)
  if (!found) return null
  const [, folder, id, ext] = found
  return `https://i.ytimg.com/${folder}/${id}/${size}${ext}`
}

/** Whether a card's link is a YouTube video, whose 4:3 thumbnails carry bands. */
export const isYouTube = (href: string): boolean => {
  try {
    return /(^|\.)(youtube\.com|youtu\.be|youtube-nocookie\.com)$/i.test(new URL(href).hostname)
  } catch {
    return false
  }
}
