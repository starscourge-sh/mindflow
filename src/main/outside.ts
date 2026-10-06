import { lookup } from 'dns/promises'
import { BlockList, isIP } from 'net'

/**
 * Addresses on this machine or its own network: loopback, the private ranges,
 * link-local (where cloud metadata lives), and the odd reserved blocks. A page
 * you saved is never allowed to make the app ask one of these for anything.
 */
const inside = new BlockList()
for (const [address, bits] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12],
  ['192.0.0.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['224.0.0.0', 4], ['240.0.0.0', 4]
] as const)
  inside.addSubnet(address, bits, 'ipv4')
for (const [address, bits] of [['::', 128], ['::1', 128], ['fc00::', 7], ['fe80::', 10], ['ff00::', 8]] as const)
  inside.addSubnet(address, bits, 'ipv6')

const isInside = (address: string): boolean => {
  // An IPv4 address written as IPv6 (::ffff:127.0.0.1) is still that address.
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address)?.[1]
  if (mapped) return inside.check(mapped, 'ipv4')
  const family = isIP(address)
  return family === 4 ? inside.check(address, 'ipv4') : family === 6 ? inside.check(address, 'ipv6') : true
}

/** Whether an address is out on the internet: by its name, and by every address that name leads to. */
export async function isOutside(url: URL): Promise<boolean> {
  if (!['http:', 'https:'].includes(url.protocol)) return false
  const host = url.hostname.replace(/^\[|\]$/g, '')
  if (/^localhost$|\.localhost$|\.local$/i.test(host)) return false
  if (isIP(host)) return !isInside(host)
  try {
    const found = await lookup(host, { all: true })
    return found.length > 0 && found.every((one) => !isInside(one.address))
  } catch {
    return false
  }
}

/**
 * `fetch`, for addresses a page handed us: each hop of a redirect is checked
 * the same way, so a public page cannot bounce the request back inside.
 */
export async function fetchOutside(url: string | URL, init: RequestInit = {}): Promise<Response> {
  let at = new URL(url)
  for (let hop = 0; hop < 6; hop++) {
    if (!(await isOutside(at))) throw new Error(`Refused ${at.host}: not on the internet`)
    const response = await fetch(at, { ...init, redirect: 'manual' })
    const next = response.status >= 300 && response.status < 400 ? response.headers.get('location') : null
    if (!next) return response
    at = new URL(next, at)
  }
  throw new Error('Too many redirects')
}
