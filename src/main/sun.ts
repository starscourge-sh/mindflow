import { readFileSync } from 'node:fs'

/**
 * Your sun, not the clock: sunrise and sunset where you are, from the city of
 * your Mac's time zone (or a city you pick in Settings), never your location:
 * no permission, no internet. The cities and where they lie come from macOS's
 * own time zone list (/usr/share/zoneinfo/zone.tab). The times are the usual
 * NOAA reckoning, good to a minute or two.
 */

export type Place = { zone: string; city: string; lat: number; lon: number }
export type Sun = { place: string; rise: string | null; set: string | null; /** Never sets, or never rises, today. */ polar?: 'day' | 'night' }

/** "+5130" or "+513030" (latitude, 2 digits of degrees), "-00007" or "-0000731" (longitude, 3): north and east positive. */
const degrees = (text: string, whole: number): number => {
  const digits = text.slice(1)
  const [deg, min, sec] = [digits.slice(0, whole), digits.slice(whole, whole + 2), digits.slice(whole + 2, whole + 4)].map((one) => Number(one || 0))
  return (text[0] === '-' ? -1 : 1) * (deg + min / 60 + sec / 3600)
}

/** Splits zone.tab's "+DDMM+DDDMM" (or with seconds) into latitude and longitude. */
export function coordinates(text: string): { lat: number; lon: number } {
  const at = text.slice(1).search(/[+-]/) + 1
  return { lat: degrees(text.slice(0, at), 2), lon: degrees(text.slice(at), 3) }
}

let places: Place[] | null = null
export function allPlaces(file = '/usr/share/zoneinfo/zone.tab'): Place[] {
  if (places) return places
  try {
    places = readFileSync(file, 'utf8').split('\n').filter((line) => line && !line.startsWith('#')).map((line) => {
      const [, coords, zone] = line.split('\t')
      return { zone, city: zone.split('/').at(-1)!.replace(/_/g, ' '), ...coordinates(coords) }
    }).sort((a, b) => a.city.localeCompare(b.city))
  } catch {
    places = []
  }
  return places
}

const rad = Math.PI / 180

/** Sunrise and sunset on a day (local midnight given) at a place, as moments; polar when the sun stays up or down. */
export function sunOn(day: Date, lat: number, lon: number): { rise: Date | null; set: Date | null; polar?: 'day' | 'night' } {
  // Days since J2000 at local noon, and the sun's place then.
  const noon = Date.UTC(day.getFullYear(), day.getMonth(), day.getDate(), 12) - (lon / 15) * 3600_000
  const n = Math.round((noon - Date.UTC(2000, 0, 1, 12)) / 86_400_000)
  const mean = n - lon / 360
  const anomaly = (357.5291 + 0.98560028 * mean) % 360
  const centre = 1.9148 * Math.sin(anomaly * rad) + 0.02 * Math.sin(2 * anomaly * rad) + 0.0003 * Math.sin(3 * anomaly * rad)
  const longitude = (anomaly + centre + 180 + 102.9372) % 360
  const transit = 2451545 + mean + 0.0053 * Math.sin(anomaly * rad) - 0.0069 * Math.sin(2 * longitude * rad)
  const declination = Math.asin(Math.sin(longitude * rad) * Math.sin(23.4397 * rad))
  const cos = (Math.sin(-0.833 * rad) - Math.sin(lat * rad) * Math.sin(declination)) / (Math.cos(lat * rad) * Math.cos(declination))
  if (cos < -1) return { rise: null, set: null, polar: 'day' }
  if (cos > 1) return { rise: null, set: null, polar: 'night' }
  const hour = Math.acos(cos) / rad / 360
  const moment = (julian: number): Date => new Date((julian - 2440587.5) * 86_400_000)
  return { rise: moment(transit - hour), set: moment(transit + hour) }
}

/** Where the sun is reckoned for: the city picked, else the time zone's own. */
export function placeFor(picked: string | null | undefined, zone = Intl.DateTimeFormat().resolvedOptions().timeZone): Place | null {
  const all = allPlaces()
  return all.find((one) => one.zone === picked) ?? all.find((one) => one.zone === zone) ?? null
}

export function sunToday(picked: string | null | undefined, now = new Date()): Sun | null {
  const place = placeFor(picked)
  if (!place) return null
  const times = sunOn(new Date(now.getFullYear(), now.getMonth(), now.getDate()), place.lat, place.lon)
  return { place: place.city, rise: times.rise?.toISOString() ?? null, set: times.set?.toISOString() ?? null, ...(times.polar && { polar: times.polar }) }
}
