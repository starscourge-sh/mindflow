import { test } from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { readFileSync } from 'node:fs'
import { channels } from '../src/preload/hear.ts'

test('a hundred listeners on one channel are one listener on the wire, and all are told', () => {
  const wire = new EventEmitter()
  const heard = channels(wire)
  let told = 0
  const offs = Array.from({ length: 100 }, () => {
    const relay = (): void => void told++
    heard.on('window:shown', relay)
    return () => heard.off('window:shown', relay)
  })
  assert.equal(wire.listenerCount('window:shown'), 1)
  wire.emit('window:shown', {})
  assert.equal(told, 100)
  offs.forEach((off) => off())
  assert.equal(heard.counts()['window:shown'], 0)
  wire.emit('window:shown', {})
  assert.equal(told, 100)
})

test('opening and closing a hundred times leaves the count flat', () => {
  const wire = new EventEmitter()
  const heard = channels(wire)
  for (let i = 0; i < 100; i++) {
    const relay = (): void => undefined
    heard.on('window:hiding', relay)
    heard.off('window:hiding', relay)
  }
  assert.equal(heard.counts()['window:hiding'], 0)
  assert.equal(wire.listenerCount('window:hiding'), 1)
})

test('a listener taken off while the others are told is not told', () => {
  const wire = new EventEmitter()
  const heard = channels(wire)
  const said: string[] = []
  const second = (): void => void said.push('second')
  heard.on('x', () => (said.push('first'), heard.off('x', second)))
  heard.on('x', second)
  wire.emit('x', {}, 1)
  assert.deepEqual(said, ['first'])
})

test('the preload puts no listener straight on IpcRenderer, and every on* gives back its way off', () => {
  const source = readFileSync(new URL('../src/preload/index.ts', import.meta.url), 'utf8')
  assert.equal(/ipcRenderer\.(on|once|addListener)\(/.test(source), false, 'use heard.on (hear.ts)')
  // Each `on…: (listen…): X =>` helper that listens gives back a function.
  const helpers = source.split('\n').filter((line) => /^\s+on[A-Z]\w*: \(listen/.test(line))
  assert.ok(helpers.length > 40, `found ${helpers.length}`)
  const none = helpers.filter((line) => !line.includes('): (() => void) =>')).map((line) => line.trim().split(':')[0])
  assert.deepEqual(none, [])
})
