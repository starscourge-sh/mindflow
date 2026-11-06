// Your sun (main/sun.ts): the time zone's city from macOS's own list, and its sunrise and sunset.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { allPlaces, coordinates, sunOn } from '../src/main/sun.ts'

test('zone.tab coordinates read right', () => {
  const london = coordinates('+513030-0000731')
  assert.ok(Math.abs(london.lat - 51.508) < 0.01 && Math.abs(london.lon + 0.125) < 0.01, JSON.stringify(london))
  const sydney = coordinates('-3352+15113')
  assert.ok(Math.abs(sydney.lat + 33.867) < 0.01 && Math.abs(sydney.lon - 151.217) < 0.01, JSON.stringify(sydney))
})
test('sunrise and sunset match the almanac within a few minutes', () => {
  // London, 21 June 2026: about 04:43 and 21:21 BST (03:43 and 20:21 UTC).
  const june = sunOn(new Date(2026, 5, 21), 51.5085, -0.1257)
  assert.ok(Math.abs(june.rise!.getUTCHours() * 60 + june.rise!.getUTCMinutes() - (3 * 60 + 43)) <= 4, june.rise!.toISOString())
  assert.ok(Math.abs(june.set!.getUTCHours() * 60 + june.set!.getUTCMinutes() - (20 * 60 + 21)) <= 4, june.set!.toISOString())
  // Tromsø in December: the sun does not rise.
  assert.equal(sunOn(new Date(2026, 11, 21), 69.65, 18.96).polar, 'night')
})
test('every time zone city on this Mac has a place', () => {
  const all = allPlaces()
  assert.ok(all.length > 300 && all.some((one) => one.zone === 'Europe/London' && one.city === 'London'))
})
