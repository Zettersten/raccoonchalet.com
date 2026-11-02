import test from 'node:test';
import assert from 'node:assert/strict';
import { liveHasArticle, publicationDecision } from '../scripts/guide-publication-gate.mjs';

const content = publishedAt => ({
  version: 1,
  updatedAt: publishedAt,
  articles: [{ slug: 'published-guide', publishedAt }],
});

test('a Sunday publication blocks catch-up runs until the following Sunday', () => {
  const published = content('2026-11-01');
  assert.equal(publicationDecision(published, new Date('2026-11-02T15:00:00Z')).due, false);
  assert.equal(publicationDecision(published, new Date('2026-11-07T23:00:00Z')).due, false);
  assert.equal(publicationDecision(published, new Date('2026-11-08T14:00:00Z')).due, true);
});

test('an unpublished Sunday week stays due during catch-up days', () => {
  const previous = content('2026-10-29');
  assert.equal(publicationDecision(previous, new Date('2026-11-01T14:00:00Z')).due, true);
  assert.equal(publicationDecision(previous, new Date('2026-11-02T15:00:00Z')).due, true);
});

test('the gate uses New York dates across UTC midnight', () => {
  const published = content('2026-11-01');
  assert.equal(publicationDecision(published, new Date('2026-11-08T01:00:00Z')).due, false);
});

test('manual force can publish an extra article after validating data', () => {
  assert.equal(publicationDecision(content('2026-11-01'), new Date('2026-11-02T15:00:00Z'), { force: true }).due, true);
  assert.throws(() => publicationDecision(content('2026-02-30'), new Date('2026-11-02T15:00:00Z'), { force: true }), /invalid/i);
});

test('live verification requires both the content entry and rendered article', async () => {
  const responses = [
    new Response(JSON.stringify(content('2026-11-01')), { headers: { 'content-type': 'application/json' } }),
    new Response('<h1>Published guide</h1>', { headers: { 'content-type': 'text/html' } }),
  ];
  assert.equal(await liveHasArticle('published-guide', 'https://raccoonchalet.com', async () => responses.shift()), true);
  const missingArticle = [
    new Response(JSON.stringify(content('2026-11-01')), { headers: { 'content-type': 'application/json' } }),
    new Response('Missing', { status: 404, headers: { 'content-type': 'text/html' } }),
  ];
  assert.equal(await liveHasArticle('published-guide', 'https://raccoonchalet.com', async () => missingArticle.shift()), false);
});
