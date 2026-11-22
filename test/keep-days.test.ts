import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readdir, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { keepNewest } from '../src/main/keep-days.ts'

// A person's backups: only the oldest daily copies go; the newest five days, one-off copies and anything else stay.
test('a book keeps its newest five daily copies and every one-off copy', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'keep-days-'))
  try {
    const days = ['2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05']
    for (const name of [...days.map((day) => `haligtree-${day}.db`), 'haligtree-before-folders-2026-10-30.db', 'notes.txt']) await writeFile(join(dir, name), '')
    await keepNewest(dir)
    assert.deepEqual((await readdir(dir)).sort(), [...days.slice(2).map((day) => `haligtree-${day}.db`), 'haligtree-before-folders-2026-10-30.db', 'notes.txt'].sort())
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
