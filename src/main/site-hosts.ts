/**
 * Websites blocked during a focus session: what a typed site means, which
 * collections there are, and whether an address is one of them. Plain
 * functions with no Electron in them, read by the main process (site-block.ts),
 * the Settings field and the tests alike.
 *
 * The list is kept as entries: a site ("x.com"), a collection ("@social"), or
 * a site taken out of a collection ("-reddit.com").
 */

/** The collections you add in one click, each shown as one chip that opens to its sites. */
export const COLLECTIONS: Record<string, { name: string; sites: readonly string[] }> = {
  social: { name: 'Social media', sites: ['x.com', 'instagram.com', 'facebook.com', 'tiktok.com', 'reddit.com', 'youtube.com', 'threads.net', 'linkedin.com'] }
}

/** Sites offered as you type, after the one you typed: the usual ones people block. */
export const SUGGESTED: readonly string[] = [
  ...COLLECTIONS.social.sites,
  'twitter.com', 'pinterest.com', 'snapchat.com', 'tumblr.com', 'bsky.app', 'mastodon.social', 'discord.com', 'web.whatsapp.com', 'messenger.com',
  'netflix.com', 'twitch.tv', 'primevideo.com', 'disneyplus.com', 'hulu.com', 'spotify.com',
  'news.ycombinator.com', 'cnn.com', 'bbc.com', 'nytimes.com', 'theguardian.com', 'espn.com',
  'amazon.com', 'ebay.com', 'aliexpress.com', 'temu.com', 'etsy.com', 'imgur.com', '9gag.com', 'quora.com', 'medium.com'
]

/**
 * What was typed or pasted, as a site: "https://www.YouTube.com/watch?v=1"
 * is "youtube.com". The scheme, a login, "www.", the port and everything
 * after the host go; a name with no dot gets ".com", so "reddit" is
 * "reddit.com". Null when it cannot be a website at all.
 */
export function hostOf(text: string): string | null {
  let rest = String(text ?? '').trim().toLowerCase()
  // Words with a space between are not one site.
  if (!rest || /\s/.test(rest.split(/[/?#]/)[0])) return null
  rest = rest.replace(/^[a-z][a-z0-9+.-]*:\/\//, '').replace(/^\/\//, '')
  rest = rest.split(/[/?#]/)[0]
  rest = rest.replace(/^[^@]*@/, '').replace(/:\d*$/, '').replace(/\.+$/, '')
  if (!rest) return null
  if (!rest.includes('.')) rest = `${rest}.com`
  let host: string
  try {
    host = new URL(`http://${rest}`).hostname
  } catch {
    return null
  }
  host = host.replace(/^www\d*\./, '')
  // An address by number is not a website anyone types to block.
  if (/^[\d.]+$/.test(host) || host.startsWith('[')) return null
  const labels = host.split('.')
  if (labels.length < 2 || labels.some((one) => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(one))) return null
  if (!/^(?:[a-z]{2,63}|xn--[a-z0-9-]+)$/.test(labels.at(-1)!)) return null
  return host
}

/** A collection's entry ("@social"), or null for a site. */
export const collectionOf = (entry: string): string | null => (entry.startsWith('@') && COLLECTIONS[entry.slice(1)] ? entry.slice(1) : null)

/** Every site the list blocks, collections opened up, sites taken out of them left out, each once. */
export function sitesIn(list: readonly string[]): string[] {
  const out = new Set<string>()
  const left = new Set(list.filter((one) => one.startsWith('-')).map((one) => one.slice(1)))
  for (const entry of list) {
    const name = collectionOf(entry)
    if (name) for (const site of COLLECTIONS[name].sites) !left.has(site) && out.add(site)
    else if (!entry.startsWith('-') && !entry.startsWith('@')) out.add(entry)
  }
  return [...out]
}

/** Whether `host` is `site` or a part of it: "m.youtube.com" is youtube.com, "notyoutube.com" is not. */
export const within = (host: string, site: string): boolean => host === site || host.endsWith(`.${site}`)

/**
 * The blocked site an address is on, or null: only web pages (http and
 * https), with "www." and subdomains counted as the site itself. The most
 * exact match wins, so "news.ycombinator.com" is said as itself.
 */
export function blockedSite(url: string | null | undefined, list: readonly string[]): string | null {
  if (!url || !/^https?:\/\//i.test(url)) return null
  let host: string
  try {
    host = new URL(url).hostname.toLowerCase().replace(/^www\d*\./, '').replace(/\.$/, '')
  } catch {
    return null
  }
  const hits = sitesIn(list).filter((site) => within(host, site))
  return hits.sort((a, b) => b.length - a.length)[0] ?? null
}

/** The list with a site added, once, at the end; one that was taken out of a collection is put back instead. */
export function withSite(list: readonly string[], site: string): string[] {
  if (list.includes(`-${site}`)) return list.filter((one) => one !== `-${site}`)
  return sitesIn(list).includes(site) ? [...list] : [...list, site]
}
