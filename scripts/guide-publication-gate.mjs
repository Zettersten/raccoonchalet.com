import { appendFile, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SITE = 'https://raccoonchalet.com';
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function validDate(value) {
  if (typeof value !== 'string' || !DATE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}

function newYorkDate(now) {
  if (!(now instanceof Date) || Number.isNaN(now.valueOf())) throw new Error('Invalid current time.');
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now).map(part => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function sundayOf(date) {
  const noon = new Date(`${date}T12:00:00Z`);
  noon.setUTCDate(noon.getUTCDate() - noon.getUTCDay());
  return noon.toISOString().slice(0, 10);
}

export function publicationDecision(content, now = new Date(), { force = false } = {}) {
  if (!content || content.version !== 1 || !Array.isArray(content.articles) || !validDate(content.updatedAt)) {
    throw new Error('Published guide data is missing or invalid.');
  }
  const slugs = new Set();
  for (const article of content.articles) {
    if (!article || typeof article.slug !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(article.slug) ||
        slugs.has(article.slug) || !validDate(article.publishedAt)) {
      throw new Error('Published guide contains an invalid article slug or date.');
    }
    slugs.add(article.slug);
  }
  const today = newYorkDate(now);
  const weekStart = sundayOf(today);
  const published = [...content.articles].reverse().find(article =>
    article.publishedAt >= weekStart && article.publishedAt <= today);
  return {
    due: force || !published,
    weekStart,
    publishedSlug: published?.slug || '',
    reason: force ? 'Manual force requested.' : published ? `Already published ${published.slug} this week.` : 'No guide published this week.',
  };
}

export async function liveHasArticle(slug, site = SITE, request = fetch) {
  const contentUrl = new URL('/guide-content.json', site);
  contentUrl.searchParams.set('_', String(Date.now()));
  const articleUrl = new URL(`/guide/${slug}/`, site);
  articleUrl.searchParams.set('_', String(Date.now()));
  try {
    const options = { cache: 'no-store', signal: AbortSignal.timeout(15_000) };
    const contentResponse = await request(contentUrl, options);
    if (!contentResponse.ok) return false;
    const live = await contentResponse.json();
    if (!Array.isArray(live.articles) || !live.articles.some(article => article.slug === slug)) return false;
    const articleResponse = await request(articleUrl, options);
    await articleResponse.body?.cancel();
    return articleResponse.ok && (articleResponse.headers.get('content-type') || '').includes('text/html');
  } catch (error) {
    console.warn(`Could not verify live guide: ${error.message}. The saved site will be redeployed.`);
    return false;
  }
}

async function main() {
  const path = process.argv[2];
  if (!path) throw new Error('Usage: node scripts/guide-publication-gate.mjs <guide-content.json> [--force]');
  const force = process.argv.includes('--force');
  const content = JSON.parse(await readFile(path, 'utf8'));
  const decision = publicationDecision(content, new Date(), { force });
  const syncDue = !decision.due && !await liveHasArticle(decision.publishedSlug);
  const values = {
    due: String(decision.due),
    sync_due: String(syncDue),
    week_start: decision.weekStart,
    published_slug: decision.publishedSlug,
    published_url: decision.publishedSlug ? `${SITE}/guide/${decision.publishedSlug}/` : '',
  };
  if (process.env.GITHUB_OUTPUT) {
    await appendFile(process.env.GITHUB_OUTPUT, Object.entries(values).map(([key, value]) => `${key}=${value}\n`).join(''), 'utf8');
  }
  console.log(JSON.stringify({ ...values, reason: decision.reason }));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch(error => { console.error(error); process.exitCode = 1; });
}
