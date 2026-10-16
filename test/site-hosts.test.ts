// Run with: node --test test/site-hosts.test.ts
// A site typed into "Block" is read as the website it names, and an address
// in a browser is matched to it, subdomains and all, but never a lookalike.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { blockedSite, hostOf, sitesIn, withSite } from '../src/main/site-hosts.ts'

test('a typed site becomes its host', () => {
  assert.equal(hostOf('https://www.YouTube.com/watch?v=1'), 'youtube.com')
  assert.equal(hostOf('x.com'), 'x.com')
  assert.equal(hostOf('  http://user@m.facebook.com:8080/path#top '), 'm.facebook.com')
  assert.equal(hostOf('reddit'), 'reddit.com')
  assert.equal(hostOf('www2.example.org/'), 'example.org')
  assert.equal(hostOf('news.ycombinator.com/item?id=1'), 'news.ycombinator.com')
  assert.equal(hostOf('bücher.de'), 'xn--bcher-kva.de')
  assert.equal(hostOf('X.COM.'), 'x.com')
})

test('what is not a website is refused', () => {
  for (const bad of ['', '   ', '192.168.0.1', 'http://', 'a b', 'foo_bar.com', '-x.com', 'x.c0m', 'file:///etc', '..']) assert.equal(hostOf(bad), null, bad)
})

test('an address matches its site and the parts of it, never a lookalike', () => {
  const list = ['x.com', 'youtube.com']
  assert.equal(blockedSite('https://x.com/home', list), 'x.com')
  assert.equal(blockedSite('https://www.youtube.com/watch?v=1', list), 'youtube.com')
  assert.equal(blockedSite('https://m.youtube.com/', list), 'youtube.com')
  assert.equal(blockedSite('https://notyoutube.com/', list), null)
  assert.equal(blockedSite('https://x.com.example.org/', list), null)
  assert.equal(blockedSite('about:blank', list), null)
  assert.equal(blockedSite('file:///Users/x.com', list), null)
  assert.equal(blockedSite(null, list), null)
})

test('the most exact site is the one said', () => {
  assert.equal(blockedSite('https://news.ycombinator.com/', ['ycombinator.com', 'news.ycombinator.com']), 'news.ycombinator.com')
})

test('a collection opens to its sites, less the ones taken out', () => {
  const all = sitesIn(['@social'])
  assert.equal(all.length, 8)
  assert.ok(all.includes('threads.net'))
  assert.deepEqual(sitesIn(['@social', '-reddit.com']).includes('reddit.com'), false)
  assert.equal(blockedSite('https://old.reddit.com/r/x', ['@social', '-reddit.com']), null)
  assert.equal(blockedSite('https://www.instagram.com/', ['@social']), 'instagram.com')
  assert.deepEqual(sitesIn(['@nothing', 'x.com']), ['x.com'])
})

test('adding a site keeps the list tidy', () => {
  assert.deepEqual(withSite(['x.com'], 'x.com'), ['x.com'])
  assert.deepEqual(withSite(['@social'], 'x.com'), ['@social'])
  assert.deepEqual(withSite(['@social', '-x.com'], 'x.com'), ['@social'])
  assert.deepEqual(withSite([], 'cnn.com'), ['cnn.com'])
})
