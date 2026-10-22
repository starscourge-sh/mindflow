// Run with: node --test test/video-thumbs.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isBandedThumb, isYouTube, wideThumb } from '../src/main/video-thumbs.ts'

test('a banded YouTube thumbnail becomes its 16:9 size', () => {
  assert.equal(wideThumb('https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg'), 'https://i.ytimg.com/vi/dQw4w9WgXcQ/mqdefault.jpg')
  assert.equal(wideThumb('https://i.ytimg.com/vi/dQw4w9WgXcQ/sddefault.jpg'), 'https://i.ytimg.com/vi/dQw4w9WgXcQ/mqdefault.jpg')
  assert.equal(wideThumb('https://img.youtube.com/vi/a-b_c123/hqdefault.jpg', 'maxresdefault'), 'https://i.ytimg.com/vi/a-b_c123/maxresdefault.jpg')
  assert.equal(wideThumb('https://i9.ytimg.com/vi_webp/dQw4w9WgXcQ/hqdefault.webp?v=1'), 'https://i.ytimg.com/vi_webp/dQw4w9WgXcQ/mqdefault.webp')
  assert.equal(wideThumb('https://img.youtube.com/vi/YcJAc-x8XLQ/0.jpg'), 'https://i.ytimg.com/vi/YcJAc-x8XLQ/mqdefault.jpg')
  assert.equal(wideThumb('https://img.youtube.com/vi/YcJAc-x8XLQ/2.jpg', 'maxresdefault'), 'https://i.ytimg.com/vi/YcJAc-x8XLQ/mq2.jpg')
  assert.equal(wideThumb('https://i.ytimg.com/vi/YcJAc-x8XLQ/hqdefault.jpg?sqp=-oaymwEcCNACELwBSFXyq4qpAw4IARUAAIhCGAFwAcABBg==&rs=AOn4CLA'), 'https://i.ytimg.com/vi/YcJAc-x8XLQ/mqdefault.jpg')
  assert.equal(isBandedThumb('https://i.ytimg.com/vi/YcJAc-x8XLQ/sd3.jpg'), true)
})

test('left alone: already wide, or not YouTube', () => {
  assert.equal(wideThumb('https://i.ytimg.com/vi/dQw4w9WgXcQ/mqdefault.jpg'), null)
  assert.equal(wideThumb('https://i.ytimg.com/vi/dQw4w9WgXcQ/maxresdefault.jpg'), null)
  assert.equal(wideThumb('https://i.ytimg.com/vi/dQw4w9WgXcQ/hq720.jpg?sqp=abc'), null)
  assert.equal(isBandedThumb('https://i.ytimg.com/vi/dQw4w9WgXcQ/mqdefault.jpg'), false)
  assert.equal(wideThumb('https://example.com/vi/dQw4w9WgXcQ/hqdefault.jpg'), null)
  assert.equal(wideThumb('haligtree://assets/abc.jpg'), null)
})

test('YouTube links', () => {
  assert.equal(isYouTube('https://www.youtube.com/watch?v=x'), true)
  assert.equal(isYouTube('https://youtu.be/x'), true)
  assert.equal(isYouTube('https://vimeo.com/1'), false)
  assert.equal(isYouTube('not a url'), false)
})
