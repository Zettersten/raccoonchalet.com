import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { renderGuidePages, validateGuideContent } from './guide-pages.mjs';
import { createOgCard } from './guide-og.mjs';
import { fingerprintAssets } from './fingerprint-assets.mjs';

const API = 'https://api.openai.com/v1';
const SITE = 'https://raccoonchalet.com';
const TEXT_MODEL = process.env.GUIDE_TEXT_MODEL || 'gpt-6-astra';
const IMAGE_MODEL = process.env.GUIDE_IMAGE_MODEL || 'gpt-image-2.5-flare';
const PROPERTY_FACTS = [
  'Raccoon Chalet is a vacation home in Basye, Virginia, about five minutes from Bryce Resort.',
  'The chalet has a private saltwater hot tub, cedar sauna, home theater, pool table, ping pong table, and an outdoor deck.',
  'The chalet has a fully equipped kitchen and a ski gear drop zone.',
  'The chalet welcomes up to two dogs.',
];
const publishedRoot = resolve(process.argv[2] ?? 'published');
const queuePath = resolve(process.argv[3] ?? 'editorial-topics.json');
const dryRun = process.argv.includes('--dry-run');
const key = process.env.OPENAI_API_KEY;

function todayInNewYork() {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date()).map(part => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function fail(message) { throw new Error(message); }
function isOfficialHost(host, domains) {
  return domains.some(domain => host === domain || host.endsWith(`.${domain}`));
}
function normalizeUrl(raw) {
  const url = new URL(raw);
  url.hash = '';
  url.search = '';
  url.pathname = url.pathname.replace(/\/$/, '') || '/';
  return url.toString();
}
function wordCount(text) { return text.trim().split(/\s+/).filter(Boolean).length; }
async function output(name, value) {
  if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `${name}=${value}\n`, 'utf8');
}

async function apiRequest(path, { method = 'GET', body, timeout = 120_000 } = {}) {
  const response = await fetch(`${API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${key}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(timeout),
  });
  if (!response.ok) {
    let detail = '';
    try { detail = (await response.json()).error?.message || ''; } catch { /* Status is enough. */ }
    fail(`OpenAI API returned HTTP ${response.status}${detail ? `: ${detail.slice(0, 240)}` : ''}`);
  }
  return response.json();
}

async function backgroundResponse(payload) {
  let response = await apiRequest('/responses', { method: 'POST', body: { ...payload, background: true }, timeout: 120_000 });
  const deadline = Date.now() + 14 * 60_000;
  while (['queued', 'in_progress'].includes(response.status)) {
    if (Date.now() > deadline) fail('OpenAI research exceeded the 14-minute limit.');
    await new Promise(done => setTimeout(done, 8_000));
    response = await apiRequest(`/responses/${encodeURIComponent(response.id)}`, { timeout: 30_000 });
  }
  if (response.status !== 'completed') fail(`OpenAI research ended with status ${response.status}.`);
  return response;
}

function responseText(response) {
  const parts = (response.output || []).filter(item => item.type === 'message')
    .flatMap(item => item.content || []).filter(item => item.type === 'output_text').map(item => item.text);
  if (!parts.length) fail('OpenAI returned no structured text.');
  return parts.join('\n');
}

function searchEvidence(response) {
  const calls = (response.output || []).filter(item => item.type === 'web_search_call');
  const urls = new Set();
  function collect(value) {
    if (!value || typeof value !== 'object') return;
    if (typeof value.url === 'string' && /^https:\/\//.test(value.url)) urls.add(normalizeUrl(value.url));
    for (const item of Object.values(value)) collect(item);
  }
  for (const call of calls) collect(call.action?.sources);
  for (const item of response.output || []) {
    if (item.type !== 'message') continue;
    for (const content of item.content || []) collect(content.annotations);
  }
  return { calls: calls.length, urls };
}

const paragraphSchema = {
  type: 'object', additionalProperties: false,
  properties: { heading: { type: 'string' }, paragraphs: { type: 'array', items: { type: 'string' } } },
  required: ['heading', 'paragraphs'],
};
const sourceSchema = {
  type: 'object', additionalProperties: false,
  properties: { title: { type: 'string' }, url: { type: 'string' } },
  required: ['title', 'url'],
};
const claimSchema = {
  type: 'object', additionalProperties: false,
  properties: { text: { type: 'string' }, sourceUrl: { type: 'string' } },
  required: ['text', 'sourceUrl'],
};
const draftSchema = {
  type: 'object', additionalProperties: false,
  properties: {
    publishable: { type: 'boolean' }, reason: { type: 'string' }, title: { type: 'string' },
    description: { type: 'string' }, sections: { type: 'array', items: paragraphSchema },
    sources: { type: 'array', items: sourceSchema }, claims: { type: 'array', items: claimSchema },
    heroPrompt: { type: 'string' }, heroAlt: { type: 'string' },
  },
  required: ['publishable', 'reason', 'title', 'description', 'sections', 'sources', 'claims', 'heroPrompt', 'heroAlt'],
};
const auditSchema = {
  type: 'object', additionalProperties: false,
  properties: {
    pass: { type: 'boolean' }, reason: { type: 'string' },
    unsupportedClaims: { type: 'array', items: { type: 'string' } },
    styleIssues: { type: 'array', items: { type: 'string' } },
    sourceConcerns: { type: 'array', items: { type: 'string' } },
  },
  required: ['pass', 'reason', 'unsupportedClaims', 'styleIssues', 'sourceConcerns'],
};

async function researchTopic(topic, queue, previousRejection = '') {
  const today = todayInNewYork();
  const prompt = `You are preparing ONE practical local guide for prospective guests at Raccoon Chalet in Basye, Virginia. Today is ${today}. Reader question: ${topic.question}\n\n` +
    `Start with these official pages: ${topic.officialSources.join(', ')}. Search further within these allowed official domains only: ${topic.allowedDomains.join(', ')}. Use current primary sources and do not copy their prose.\n\n` +
    `Verified property facts supplied by the owner: ${PROPERTY_FACTS.join(' ')} Do not state any other property fact. Owner-supplied context: ${queue.ownerContext || 'None'}. Topic-specific owner notes: ${topic.ownerNotes || 'None'}. Owner notes can support statements about the owners' experiences, but cannot prove any current third-party amenity, opening, rule, price, or access. Do not write as though you personally visited a destination. Do not suggest the chalet grants access to resort amenities. Do not mention resort pool, gym, or fitness access.\n\n` +
    `Write a useful 450-800 word article with 3-5 sections and concrete planning advice. Synthesize what the verified sources mean for a guest; do not paraphrase them section by section. Include at least 2 relevant official source URLs and a claim-to-source list covering each specific third-party factual assertion. Every sources[].url must be an absolute HTTPS URL from the official search results. Every claims[].sourceUrl must be an absolute HTTPS URL copied exactly from one sources[].url in this draft. Omit owner-supplied chalet facts from claims; they have no tourism source URL. Never put an empty string, an owner note, a relative URL, or a citation marker in sourceUrl. If the sources cannot support a genuinely useful guide, set publishable=false and explain why.\n\n` +
    `Avoid prices, hours, live conditions, unconfirmed access, and promises that an attraction is open. Direct the reader to official live details. Keep a calm, specific human voice. Remove inflated adjectives, stock travel clichés, em dashes, staged openers, forced lists of three, filler conclusions, and invented anecdotes. No HTML, Markdown, emojis, quotations, or first-person claims. The hero prompt must request an atmospheric stock-style AI illustration, not a documentary photo of any real place. The hero alt must clearly call it an illustration. Output the requested JSON schema only.` +
    (previousRejection ? `\n\nA previous draft failed this publication check: ${previousRejection}. Research again and correct that issue. If the official sources cannot support the article, set publishable=false.` : '');
  return backgroundResponse({
    model: TEXT_MODEL,
    reasoning: { effort: 'high' },
    tools: [{ type: 'web_search', filters: { allowed_domains: topic.allowedDomains } }],
    tool_choice: 'required',
    include: ['web_search_call.action.sources'],
    text: { format: { type: 'json_schema', name: 'raccoon_guide_draft', strict: true, schema: draftSchema } },
    input: prompt,
  });
}

function validateDraft(draft, topic, evidence) {
  if (!draft.publishable) return draft.reason || 'Research found no useful material.';
  if (evidence.calls < 1 || evidence.urls.size < 2) return 'Web search did not return enough cited source evidence.';
  if (!draft.title || draft.title.length > 90 || draft.title.length < 20) return 'Title is outside editorial limits.';
  if (!draft.description || draft.description.length < 80 || draft.description.length > 165) return 'Description is outside editorial limits.';
  if (!Array.isArray(draft.sections) || draft.sections.length < 3 || draft.sections.length > 5) return 'Article needs 3-5 sections.';
  const prose = draft.sections.flatMap(section => section.paragraphs || []).join(' ');
  if (wordCount(prose) < 400 || wordCount(prose) > 900) return 'Article is too thin or too long for this guide.';
  if (/[—–]|\b(?:I|we) (?:visited|tried|walked|rode|skied)\b/i.test(prose)) return 'Article contains style or invented firsthand language.';
  if (/\b(?:swimming pool|resort pool|bryce landing pool|gym|fitness center|workout gym)\b/i.test(prose)) return 'Resort pool or fitness access is not established for chalet guests.';
  if (!Array.isArray(draft.sources) || draft.sources.length < 2 || draft.sources.length > 6) return 'Article needs 2-6 official sources.';
  const sourceUrls = new Set();
  for (const source of draft.sources) {
    let url;
    try { url = new URL(source.url); } catch { return 'Article has an invalid source URL.'; }
    if (url.protocol !== 'https:' || !isOfficialHost(url.hostname, topic.allowedDomains)) return 'Article source is outside the official source allowlist.';
    if (!evidence.urls.has(normalizeUrl(source.url))) return 'Article cites a source not returned by web search.';
    sourceUrls.add(normalizeUrl(source.url));
  }
  if (sourceUrls.size < 2) return 'Article needs two distinct official pages.';
  if (!Array.isArray(draft.claims) || draft.claims.length < 4) return 'Article lacks a claim-to-source audit trail.';
  try {
    if (draft.claims.some(claim => !sourceUrls.has(normalizeUrl(claim.sourceUrl)))) return 'A factual claim is not linked to an article source.';
  } catch { return 'A factual claim has an invalid source URL.'; }
  if (!draft.heroAlt?.toLowerCase().includes('illustrat')) return 'Hero alt text must identify an illustration.';
  return null;
}

async function checkSources(sources, allowedDomains) {
  for (const source of sources) {
    const url = new URL(source.url);
    if (!isOfficialHost(url.hostname, allowedDomains)) return `Source host is not allowed: ${url.hostname}`;
    try {
      let current = url;
      let verified = false;
      for (let hop = 0; hop < 4; hop++) {
        const response = await fetch(current, {
          headers: { 'User-Agent': 'RaccoonChaletGuideBot/1.0 (+https://raccoonchalet.com)' },
          redirect: 'manual', signal: AbortSignal.timeout(15_000),
        });
        const location = response.headers.get('location');
        if (response.status >= 300 && response.status < 400 && location) {
          await response.body?.cancel();
          current = new URL(location, current);
          if (current.protocol !== 'https:' || !isOfficialHost(current.hostname, allowedDomains)) return `Source redirected outside approved domains: ${source.url}`;
          continue;
        }
        const kind = response.headers.get('content-type') || '';
        await response.body?.cancel();
        if (!response.ok || !/text\/html|application\/pdf/.test(kind)) return `Source did not return a readable official page: ${source.url}`;
        verified = true;
        break;
      }
      if (!verified) return `Source redirected too many times: ${source.url}`;
    } catch { return `Could not reach official source: ${source.url}`; }
  }
  return null;
}

async function auditDraft(draft, topic, today) {
  const prompt = `Independently audit this proposed Raccoon Chalet local guide as a skeptical travel editor. Today is ${today}. Use web search on the official domains ${topic.allowedDomains.join(', ')} and the cited URLs. Verify every specific factual statement, including distances, access, safety rules, seasonal status, hours, and facility availability. The only approved property facts are: ${PROPERTY_FACTS.join(' ')} Owner context can support only statements about owner experiences; it cannot support third-party operating facts. Reject property claims beyond the approved list. Reject any claim that reads like a firsthand visit by the author. Reject weak paraphrases or generic prose with no practical value. Reject unsupported claims even if a source URL is listed. Check for humanizer-style problems: staged openers, inflated praise, contrived contrast, em dashes, repetitive triads, and filler ending. Pass only if the factual claims are supported and the guide helps a guest make a real plan. Return JSON only.\n\nTopic: ${topic.question}\nDraft: ${JSON.stringify(draft)}`;
  return backgroundResponse({
    model: TEXT_MODEL,
    reasoning: { effort: 'high' },
    tools: [{ type: 'web_search', filters: { allowed_domains: topic.allowedDomains } }],
    tool_choice: 'required',
    include: ['web_search_call.action.sources'],
    text: { format: { type: 'json_schema', name: 'raccoon_guide_audit', strict: true, schema: auditSchema } },
    input: prompt,
  });
}

async function createHero(prompt, topic) {
  const imagePrompt = `Create a photorealistic stock-style editorial image for a Raccoon Chalet local guide about: ${topic.question}. ${prompt}. Appalachian mountain atmosphere, warm natural light, quiet, cozy, tactile color, cinematic composition. This is a fictional composite scene, never a documentary image of Bryce Resort, Lake Laura, a town, trail, golf course, or the chalet. Do not reproduce any recognizable landmark or branded building. No text, logos, signs, maps, people, or watermarks. Landscape 3:2.`;
  const response = await apiRequest('/images/generations', {
    method: 'POST', timeout: 360_000,
    body: { model: IMAGE_MODEL, prompt: imagePrompt, size: '1536x1024', quality: 'medium', output_format: 'webp', output_compression: 85, n: 1 },
  });
  const encoded = response.data?.[0]?.b64_json;
  if (!encoded) fail('OpenAI image generation returned no image.');
  const buffer = Buffer.from(encoded, 'base64');
  if (buffer.length < 20_000 || buffer.length > 8_000_000) fail('Generated hero image has an unexpected size.');
  return buffer;
}

const queue = JSON.parse(await readFile(queuePath, 'utf8'));
if (queue.version !== 1 || !Array.isArray(queue.topics)) fail('Editorial topic queue is invalid.');
const content = validateGuideContent(JSON.parse(await readFile(join(publishedRoot, 'guide-content.json'), 'utf8')));
const alreadyPublished = new Set(content.articles.map(article => article.slug));
const currentMonth = Number(todayInNewYork().slice(5, 7));
const topic = queue.topics.find(item => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(item.slug) &&
  !alreadyPublished.has(item.slug) && Array.isArray(item.months) && item.months.includes(currentMonth));
if (!topic) {
  console.log('No new curated topic is eligible this month. Skipping publication.');
  await output('changed', 'false');
  process.exit(0);
}
if (!Array.isArray(topic.allowedDomains) || !topic.allowedDomains.length || !Array.isArray(topic.officialSources) || !topic.officialSources.length) fail('Topic needs official sources and allowed domains.');
console.log(`Next curated topic: ${topic.slug}`);
if (dryRun) {
  console.log('Dry run: no OpenAI request or file write was made.');
  await output('changed', 'false');
  process.exit(0);
}
if (!key) {
  console.log('OPENAI_API_KEY repository secret is not configured. Skipping weekly guide publication.');
  await output('changed', 'false');
  process.exit(0);
}

const today = todayInNewYork();
async function checkResearch(response) {
  let draft;
  try { draft = JSON.parse(responseText(response)); } catch { fail('OpenAI returned invalid draft JSON.'); }
  const evidence = searchEvidence(response);
  let rejection = validateDraft(draft, topic, evidence);
  if (!rejection) rejection = await checkSources(draft.sources, topic.allowedDomains);
  return { draft, rejection };
}

let { draft, rejection } = await checkResearch(await researchTopic(topic, queue));
if (rejection && draft.publishable) {
  console.log(`First draft failed publication checks: ${rejection}. Retrying research once.`);
  ({ draft, rejection } = await checkResearch(await researchTopic(topic, queue, rejection)));
}
if (rejection) {
  console.log(`Publication skipped: ${rejection}`);
  await output('changed', 'false');
  process.exit(0);
}
const auditResponse = await auditDraft(draft, topic, today);
if (searchEvidence(auditResponse).calls < 1) fail('Independent audit did not use web search.');
let audit;
try { audit = JSON.parse(responseText(auditResponse)); } catch { fail('OpenAI returned invalid audit JSON.'); }
if (!audit.pass || audit.unsupportedClaims.length || audit.styleIssues.length || audit.sourceConcerns.length) {
  console.log(`Publication skipped by independent review: ${audit.reason || 'Quality gate did not pass.'}`);
  await output('changed', 'false');
  process.exit(0);
}

const heroFile = `assets/guides/${topic.slug}-hero.webp`;
const ogFile = `assets/guides/${topic.slug}-og.png`;
const heroBuffer = await createHero(draft.heroPrompt, topic);
const article = {
  slug: topic.slug,
  title: draft.title.trim(),
  description: draft.description.trim(),
  category: topic.category,
  season: topic.season,
  publishedAt: today,
  updatedAt: today,
  hero: { src: heroFile, alt: draft.heroAlt.trim() },
  ogImage: ogFile,
  readingMinutes: Math.max(2, Math.ceil(wordCount(draft.sections.flatMap(section => section.paragraphs).join(' ')) / 220)),
  sections: draft.sections.map(section => ({ heading: section.heading.trim(), paragraphs: section.paragraphs.map(paragraph => paragraph.trim()) })),
  sources: draft.sources.map(source => ({ title: source.title.trim(), url: source.url, checkedAt: today })),
  aiAssisted: true,
  imageDisclosure: 'AI-generated editorial illustration. It does not show Raccoon Chalet or a specific local destination.',
};
const nextContent = validateGuideContent({ version: 1, updatedAt: today, articles: [...content.articles, article] });
await mkdir(join(publishedRoot, 'assets', 'guides'), { recursive: true });
await writeFile(join(publishedRoot, heroFile), heroBuffer);
await createOgCard({ heroPath: join(publishedRoot, heroFile), outputPath: join(publishedRoot, ogFile), title: article.title, category: article.category });
await writeFile(join(publishedRoot, 'guide-content.json'), `${JSON.stringify(nextContent, null, 2)}\n`, 'utf8');
await renderGuidePages(publishedRoot);
await fingerprintAssets(publishedRoot);
await output('changed', 'true');
await output('new_url', `${SITE}/guide/${topic.slug}/`);
console.log(`Ready to publish ${SITE}/guide/${topic.slug}/ after research, source checks, and independent review.`);
