import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, readdirSync, rmSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { copyNew } from '../src/main/copy-new.ts'

// The backup's copy of new pictures (backup.ts): a picture still being written is never copied, and one gone since the
// list was read never fails the run (the user's dev log, 13 Nov: "Backup failed: Error: ENOENT … .tmp").
test('a file still being written is skipped, and one gone mid-run fails nothing', async () => {
  const root = mkdtempSync(join(tmpdir(), 'copy-new-'))
  const from = join(root, 'from'), to = join(root, 'to')
  mkdirSync(from); mkdirSync(to)
  writeFileSync(join(from, 'a.jpg'), 'a')
  writeFileSync(join(from, 'b.jpg.8f1c-uuid.tmp'), 'half')
  writeFileSync(join(from, 'c.jpg'), 'c')
  writeFileSync(join(to, 'c.jpg'), 'c')
  try {
    // "gone.jpg" was listed, then went before its copy.
    await copyNew(from, to, new Set(readdirSync(to)), ['a.jpg', 'b.jpg.8f1c-uuid.tmp', 'gone.jpg', 'c.jpg'])
    assert.deepEqual(readdirSync(to).sort(), ['a.jpg', 'c.jpg'])
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
