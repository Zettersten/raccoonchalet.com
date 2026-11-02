import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeDraft, normalizeDraftDescription, validateDraft } from '../scripts/publish-guide.mjs';

const resort = 'https://bryceresort.com/winter';
const hours = 'https://bryceresort.com/mountain-info/hours';
const topic = { allowedDomains: ['bryceresort.com'], officialSources: [resort, hours] };
const evidence = { calls: 1, urls: new Set([resort, hours]) };
const prose = Array(12).fill('Check the official resort page before planning an outing in the mountains.').join(' ');

test('a draft with the November failure pattern becomes publishable without weakening source rules', () => {
  const draft = {
    publishable: true,
    title: 'Planning a winter day around Bryce Resort',
    description: 'A useful mountain outing starts with a plan, an understanding of changing conditions, and room to adjust the day as the group needs. Check official pages before leaving the chalet for current details and access rules.',
    sections: Array.from({ length: 3 }, (_, index) => ({ heading: `Planning step ${index + 1}`, paragraphs: [prose] })),
    sources: [{ title: 'Bryce Resort winter activities', url: resort }],
    claims: Array.from({ length: 4 }, (_, index) => ({ text: `Claim ${index + 1}`, sourceUrl: resort })),
    heroAlt: 'Editorial illustration of a mountain in winter',
  };
  assert.match(validateDraft(draft, topic, evidence), /Description is outside editorial limits/);
  const repaired = normalizeDraft(draft, topic, evidence);
  assert.equal(repaired.sources.length, 2);
  assert.equal(repaired.sources[1].url, hours);
  assert.ok(repaired.description.length >= 80 && repaired.description.length <= 165);
  assert.equal(validateDraft(repaired, topic, evidence), null);
});

test('source repair accepts only official pages observed in web-search evidence', () => {
  const draft = { description: 'A valid description.', sections: [], sources: [{ title: 'Winter', url: resort }], claims: [] };
  const unobserved = { calls: 1, urls: new Set([resort, 'https://example.com/fake']) };
  const repaired = normalizeDraft(draft, topic, unobserved);
  assert.equal(repaired.sources.length, 1);
});

test('short descriptions can use article prose while remaining within editorial limits', () => {
  const description = normalizeDraftDescription('A short description.', [{ paragraphs: [prose] }]);
  assert.ok(description.length >= 80 && description.length <= 165);
});
