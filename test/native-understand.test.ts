// The Natural Language helper (native/understand.swift): says what this Mac can do, and reads words.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'

const helper = join(import.meta.dirname, '../resources/understand')
const mac = process.platform === 'darwin'

test('understand --status says what this Mac has', { skip: !mac }, () => {
  const { status } = JSON.parse(execFileSync(helper, ['--status'], { encoding: 'utf8' }))
  assert.ok(status.major >= 11)
  assert.ok(Array.isArray(status.embeddings))
  assert.match(status.ai, /^(available|not-enabled|not-eligible|not-ready|too-old)$/)
})

test('understand reads names, roots and language, and compares by meaning', { skip: !mac }, () => {
  const ask = [
    { id: 1, op: 'read', text: 'Ada Lovelace was running through the streets with Charles Babbage.' },
    { id: 2, op: 'embed', texts: ['The Stoics taught that we control only our judgements', 'Marcus Aurelius wrote about what is up to us', 'My recipe for banana bread'] }
  ].map((one) => JSON.stringify(one)).join('\n') + '\n'
  const said = execFileSync(helper, [], { input: ask, encoding: 'utf8' }).trim().split('\n').map((line) => JSON.parse(line))
  const read = said.find((one) => one.id === 1)
  assert.equal(read.lang, 'en')
  assert.equal(read.roots.running, 'run')
  assert.ok(read.names.some((one: { text: string; kind: string }) => one.text === 'Ada Lovelace' && one.kind === 'person'))
  const [a, b, c] = said.find((one) => one.id === 2).vectors.map((b64: string) => new Float32Array(Uint8Array.from(Buffer.from(b64, 'base64')).buffer))
  const cos = (x: Float32Array, y: Float32Array): number => { let d = 0, m = 0, n = 0; for (let i = 0; i < x.length; i++) { d += x[i] * y[i]; m += x[i] ** 2; n += y[i] ** 2 } return d / Math.sqrt(m * n) }
  assert.equal(a.length, 512)
  assert.ok(cos(a, b) > cos(a, c), 'two notes on the Stoics are nearer each other than one on bread')
})
