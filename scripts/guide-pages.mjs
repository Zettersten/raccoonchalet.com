import { access, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createOgCard } from './guide-og.mjs';

const ORIGIN = 'https://raccoonchalet.com';
const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ASSET = /^assets\/[a-zA-Z0-9/_-]+\.(?:jpg|jpeg|png|webp)$/;
const AUTHOR_ORDER = ['erik-zettersten', 'wendy-zettersten'];
const AUTHORS = {
  'erik-zettersten': { name: 'Erik Zettersten', image: 'assets/erik-zettersten.jpg' },
  'wendy-zettersten': { name: 'Wendy Zettersten', image: 'assets/wendy-zettersten.jpg' },
};

function assert(ok, message) {
  if (!ok) throw new Error(`Guide content: ${message}`);
}

function validDate(value) {
  if (!DATE.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

export function guideAuthorIdAt(index) {
  assert(Number.isInteger(index) && index >= 0, 'invalid article position');
  return AUTHOR_ORDER[index % AUTHOR_ORDER.length];
}

export function validateGuideContent(content) {
  assert(content && typeof content === 'object' && !Array.isArray(content), 'expected an object');
  assert(content.version === 1, 'unsupported version');
  assert(validDate(content.updatedAt), 'invalid updatedAt');
  assert(Array.isArray(content.articles), 'articles must be an array');
  const seen = new Set();
  for (const article of content.articles) {
    assert(SLUG.test(article.slug ?? '') && article.slug.length <= 80, 'invalid article slug');
    assert(!seen.has(article.slug), `duplicate slug ${article.slug}`);
    seen.add(article.slug);
    for (const field of ['title', 'description', 'category', 'season']) {
      assert(typeof article[field] === 'string' && article[field].trim().length > 0, `${article.slug}: missing ${field}`);
    }
    // Older published snapshots may need their author filled during rendering.
    assert(article.author === undefined || Object.hasOwn(AUTHORS, article.author), `${article.slug}: invalid author`);
    assert(validDate(article.publishedAt) && validDate(article.updatedAt), `${article.slug}: invalid dates`);
    assert(article.hero && ASSET.test(article.hero.src ?? '') && typeof article.hero.alt === 'string' && article.hero.alt.trim(), `${article.slug}: invalid hero`);
    assert(ASSET.test(article.ogImage ?? ''), `${article.slug}: invalid ogImage`);
    assert(Number.isInteger(article.readingMinutes) && article.readingMinutes > 0 && article.readingMinutes < 30, `${article.slug}: invalid readingMinutes`);
    assert(Array.isArray(article.sections) && article.sections.length >= 2, `${article.slug}: not enough sections`);
    for (const section of article.sections) {
      assert(typeof section.heading === 'string' && section.heading.trim(), `${article.slug}: empty section heading`);
      assert(Array.isArray(section.paragraphs) && section.paragraphs.length, `${article.slug}: empty section`);
      assert(section.paragraphs.every(paragraph => typeof paragraph === 'string' && paragraph.trim()), `${article.slug}: empty paragraph`);
    }
    assert(Array.isArray(article.sources) && article.sources.length >= 1, `${article.slug}: no sources`);
    for (const source of article.sources) {
      assert(typeof source.title === 'string' && source.title.trim(), `${article.slug}: source title missing`);
      assert(validDate(source.checkedAt), `${article.slug}: invalid source date`);
      let url;
      try { url = new URL(source.url); } catch { throw new Error(`Guide content: ${article.slug}: invalid source URL`); }
      assert(url.protocol === 'https:', `${article.slug}: source must use HTTPS`);
    }
  }
  return content;
}

const escape = value => String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
const scriptJson = value => JSON.stringify(value).replace(/</g, '\\u003c');
const absolute = path => `${ORIGIN}/${path.replace(/^\//, '')}`;
const dateLabel = date => new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${date}T12:00:00Z`));
const guideArrow = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 19 19 5M8 5h11v11" /></svg>';

function cleanGeneratedParagraph(paragraph) {
  // The research model sometimes adds Markdown citations even when asked for plain text.
  // Verified, clickable citations are rendered separately from article.sources.
  return paragraph.replace(/\s*\(\[[^\]\n]{1,120}\]\(https?:\/\/[^\s)]+\)\)/g, '').trim();
}

function guideMetaHtml(article) {
  return `<p class="guide-story-meta"><span>${escape(article.category)}</span><time datetime="${escape(article.publishedAt)}">${escape(dateLabel(article.publishedAt))}</time></p>`;
}

function guideBylineHtml(article, prefix = '') {
  const author = AUTHORS[article.author];
  assert(author, `${article.slug}: missing author`);
  return `<p class="guide-byline"><img src="${prefix}${escape(author.image)}" alt="" width="44" height="44" loading="lazy" decoding="async" /><span>By ${escape(author.name)}</span></p>`;
}

function guideIndexHtml(articles) {
  if (!articles.length) return '<p class="guide-feed-status">The first local story is on its way. In the meantime, explore the chalet and its surroundings.</p>';
  const [featured, ...rest] = [...articles].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
  const featuredPath = `guide/${escape(featured.slug)}/`;
  const featuredHtml = `<article class="guide-feature"><a class="guide-feature-image" href="${featuredPath}" aria-label="Read ${escape(featured.title)}"><img src="${escape(featured.hero.src)}" alt="${escape(featured.hero.alt)}" loading="lazy" /></a><div class="guide-feature-copy">${guideMetaHtml(featured)}<h3><a href="${featuredPath}">${escape(featured.title)}</a></h3><p class="guide-feature-dek">${escape(featured.description)}</p>${guideBylineHtml(featured)}<a class="guide-read-link" href="${featuredPath}">Read the story ${guideArrow}</a></div></article>`;
  const restHtml = rest.length ? `<div class="guide-story-list">${rest.map(article => {
    const path = `guide/${escape(article.slug)}/`;
    return `<article class="guide-story-row"><div>${guideMetaHtml(article)}<h3><a href="${path}">${escape(article.title)}</a></h3><p class="guide-story-dek">${escape(article.description)}</p>${guideBylineHtml(article)}</div><a class="guide-story-arrow" href="${path}" aria-label="Read ${escape(article.title)}">${guideArrow}</a></article>`;
  }).join('')}</div>` : '';
  return featuredHtml + restHtml;
}

export function trackedSourceUrl(raw) {
  const url = new URL(raw);
  if (url.hostname !== 'raccoonchalet.com' && url.hostname !== 'www.raccoonchalet.com') {
    url.searchParams.set('utm_source', 'raccoonchalet.com');
    url.searchParams.set('utm_medium', 'referral');
    url.searchParams.set('utm_campaign', 'local_guide');
  }
  return url.toString();
}

function articleHtml(article) {
  const url = `${ORIGIN}/guide/${article.slug}/`;
  const title = `${article.title} | Raccoon Chalet`;
  const author = AUTHORS[article.author];
  assert(author, `${article.slug}: missing author`);
  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    '@id': `${url}#article`,
    url,
    headline: article.title,
    description: article.description,
    datePublished: article.publishedAt,
    dateModified: article.updatedAt,
    author: { '@type': 'Person', name: author.name, image: absolute(author.image) },
    publisher: { '@type': 'Organization', name: 'Raccoon Chalet', url: ORIGIN },
    image: absolute(article.ogImage),
    inLanguage: 'en-US',
    isPartOf: { '@id': `${ORIGIN}/guide.html#webpage` },
  };
  const sections = article.sections.map(section => `<section><h2>${escape(section.heading)}</h2>${section.paragraphs.map(paragraph => `<p>${escape(paragraph)}</p>`).join('')}</section>`).join('\n');
  const sources = article.sources.map(source => `<li><a href="${escape(trackedSourceUrl(source.url))}" target="_blank" rel="noopener noreferrer" referrerpolicy="origin">${escape(source.title)}</a><time datetime="${escape(source.checkedAt)}">Checked ${escape(dateLabel(source.checkedAt))}</time></li>`).join('\n');
  const disclosure = article.aiAssisted ? '<p class="guide-article-disclosure">This guide was prepared with AI assistance using the linked sources. Check current details with each destination before visiting.</p>' : '';
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="theme-color" content="#101d19" />
  <meta name="description" content="${escape(article.description)}" />
  <meta name="author" content="${escape(author.name)}" />
  <meta name="robots" content="index, follow, max-image-preview:large" />
  <link rel="canonical" href="${url}" />
  <meta property="og:type" content="article" />
  <meta property="og:site_name" content="Raccoon Chalet" />
  <meta property="og:url" content="${url}" />
  <meta property="og:title" content="${escape(title)}" />
  <meta property="og:description" content="${escape(article.description)}" />
  <meta property="og:image" content="${absolute(article.ogImage)}" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${escape(title)}" />
  <meta name="twitter:description" content="${escape(article.description)}" />
  <meta name="twitter:image" content="${absolute(article.ogImage)}" />
  <title>${escape(title)}</title>
  <script type="application/ld+json">${scriptJson(structuredData)}</script>
  <link rel="icon" href="../../favicon.svg" type="image/svg+xml" />
  <link rel="preload" href="../../assets/fonts/instrument-serif-latin.woff2" as="font" type="font/woff2" crossorigin />
  <link rel="preload" href="../../assets/fonts/dm-sans-latin.woff2" as="font" type="font/woff2" crossorigin />
  <link rel="stylesheet" href="../../styles.css?v=20261029-guide" />
  <link rel="stylesheet" href="../../guide.css?v=20261029-1" />
  <script type="module" src="../../guide-motion.js"></script>
</head>
<body class="guide-page guide-article-page">
  <a class="skip-link" href="#main">Skip to content</a>
  <header class="guide-header">
    <a class="brand" href="../../index.html" aria-label="Raccoon Chalet home"><span class="brand-symbol" aria-hidden="true"><svg viewBox="0 0 40 40" fill="none"><path d="M4 17.5 20 5l16 12.5v17H4v-17Z"/><path d="M13 35V23.5l7-5 7 5V35"/><path d="M12 13.5h3m10 0h3"/></svg></span><span class="brand-name">Raccoon <em>Chalet</em></span></a>
    <nav class="guide-nav" aria-label="Main navigation"><a href="../../index.html">The chalet</a><a href="../../guide.html" aria-current="page">Local guide</a><a class="guide-nav-book" href="../../index.html#availability">Check dates <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 19 19 5M8 5h11v11" /></svg></a></nav>
  </header>
  <main id="main"><article class="guide-article">
    <header class="guide-article-header"><div class="guide-reading-progress" aria-hidden="true"><span></span></div><div class="guide-article-head-inner">
      <a class="guide-back-link" href="../../guide.html">All stories</a>
      <p class="guide-story-meta">${escape(article.category)} <time datetime="${escape(article.publishedAt)}">${escape(dateLabel(article.publishedAt))}</time></p>
      <h1>${escape(article.title)}</h1><p class="guide-article-dek">${escape(article.description)}</p>${guideBylineHtml(article, '../../')}
    </div><figure class="guide-article-hero"><div class="guide-article-media"><img src="../../${escape(article.hero.src)}" alt="${escape(article.hero.alt)}" fetchpriority="high" /><canvas class="guide-photo-shader" data-guide-shader aria-hidden="true"></canvas></div>${article.imageDisclosure ? `<figcaption>${escape(article.imageDisclosure)}</figcaption>` : ''}</figure></header>
    <div class="guide-article-layout"><aside class="guide-article-sidebar"><p>${escape(article.season)}</p><p>${escape(article.readingMinutes)} min read</p><p>Updated <time datetime="${escape(article.updatedAt)}">${escape(dateLabel(article.updatedAt))}</time></p></aside>
      <div class="guide-article-body">${sections}
        <section class="guide-article-sources"><h2>Sources &amp; current details</h2><p>Hours, access, conditions, and fees can change. Check the destination’s official information before you go.</p><ul>${sources}</ul>${disclosure}</section>
      </div>
    </div>
  </article></main>
  <footer class="guide-footer"><div class="container guide-footer-disclosure"><p>With your permission, we use Microsoft Clarity to improve this website. Read our <a href="../../privacy.html">privacy notice</a> for details.</p></div><div class="container guide-footer-inner"><a class="brand" href="../../index.html"><span class="brand-symbol" aria-hidden="true"><svg viewBox="0 0 40 40" fill="none"><path d="M4 17.5 20 5l16 12.5v17H4v-17Z"/><path d="M13 35V23.5l7-5 7 5V35"/><path d="M12 13.5h3m10 0h3"/></svg></span><span class="brand-name">Raccoon <em>Chalet</em></span></a><nav aria-label="Footer"><a href="../../index.html">The chalet</a><a href="../../privacy.html">Privacy notice</a><button type="button" data-privacy-settings>Analytics choices</button><a href="mailto:erik@zettersten.com">Contact</a></nav></div><script type="module" src="../../privacy.js?v=20261028-2"></script></footer>
</body>
</html>\n`;
}

export async function renderGuidePages(root) {
  root = resolve(root);
  assert(root.startsWith(`${PROJECT_ROOT}${sep}`), 'site output must be inside the project workspace');
  const contentPath = join(root, 'guide-content.json');
  const content = validateGuideContent(JSON.parse(await readFile(contentPath, 'utf8')));
  let normalizedContent = false;
  for (const [index, article] of content.articles.entries()) {
    if (article.author === undefined) {
      article.author = guideAuthorIdAt(index);
      normalizedContent = true;
    }
    if (!article.aiAssisted) continue;
    for (const section of article.sections) {
      section.paragraphs = section.paragraphs.map(paragraph => {
        const cleaned = cleanGeneratedParagraph(paragraph);
        if (cleaned !== paragraph) normalizedContent = true;
        return cleaned;
      });
    }
  }
  if (normalizedContent) {
    validateGuideContent(content);
    await writeFile(contentPath, `${JSON.stringify(content, null, 2)}\n`, 'utf8');
  }
  const guideRoot = join(root, 'guide');
  assert(resolve(guideRoot) === resolve(root, 'guide'), 'guide output must remain inside site root');
  await rm(guideRoot, { recursive: true, force: true });
  await mkdir(guideRoot, { recursive: true });
  for (const article of content.articles) {
    const ogPath = join(root, article.ogImage);
    try {
      await access(ogPath);
    } catch {
      await createOgCard({ heroPath: join(root, article.hero.src), outputPath: ogPath, title: article.title, category: article.category });
    }
    const destination = join(guideRoot, article.slug);
    await mkdir(destination, { recursive: true });
    await writeFile(join(destination, 'index.html'), articleHtml(article), 'utf8');
  }
  const indexPath = join(root, 'guide.html');
  const indexHtml = await readFile(indexPath, 'utf8');
  const marker = /<!-- GUIDE_LINKS_START -->[\s\S]*?<!-- GUIDE_LINKS_END -->/;
  assert(marker.test(indexHtml), 'guide.html is missing static link markers');
  const links = guideIndexHtml(content.articles);
  await writeFile(indexPath, indexHtml.replace(marker, `<!-- GUIDE_LINKS_START -->\n${links}\n<!-- GUIDE_LINKS_END -->`), 'utf8');
  const sitemapPath = join(root, 'sitemap.xml');
  const currentSitemap = await readFile(sitemapPath, 'utf8');
  assert(currentSitemap.includes('</urlset>'), 'sitemap.xml is malformed');
  const withoutGuideEntries = currentSitemap.replace(/\s*<url>[\s\S]*?<\/url>/g, block => /<loc>https:\/\/raccoonchalet\.com\/guide(?:\.html|\/)/.test(block) ? '' : block);
  const entries = [
    `  <url><loc>${ORIGIN}/guide.html</loc></url>`,
    ...content.articles.map(article => `  <url><loc>${ORIGIN}/guide/${article.slug}/</loc><lastmod>${article.updatedAt}</lastmod></url>`),
  ];
  await writeFile(sitemapPath, withoutGuideEntries.replace('</urlset>', `${entries.join('\n')}\n</urlset>`), 'utf8');
  return content.articles.map(article => `${ORIGIN}/guide/${article.slug}/`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = resolve(process.argv[2] ?? '.');
  const pages = await renderGuidePages(root);
  console.log(`Rendered ${pages.length} guide article(s) in ${root}.`);
}
