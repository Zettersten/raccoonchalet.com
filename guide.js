const feed = document.getElementById('guide-feed');
const dateFormatter = new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });

function localImage(path) {
  if (typeof path !== 'string' || !path.trim()) return null;
  try {
    const url = new URL(path, document.baseURI);
    return url.origin === window.location.origin && !url.pathname.includes('/../') ? url.href : null;
  } catch {
    return null;
  }
}

function articlePath(slug) {
  return `guide/${slug}/`;
}

function articleDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : dateFormatter.format(date);
}

function textElement(tag, className, value) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  element.textContent = value;
  return element;
}

function articleMeta(article) {
  const meta = document.createElement('p');
  meta.className = 'guide-story-meta';
  const category = textElement('span', '', article.category || 'Local notes');
  meta.append(category);
  const date = articleDate(article.publishedAt);
  if (date) {
    const published = document.createElement('time');
    published.dateTime = article.publishedAt;
    published.textContent = date;
    meta.append(published);
  }
  if (article.aiAssisted === true) meta.append(textElement('span', 'guide-assisted', 'AI-assisted'));
  return meta;
}

function arrowIcon() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', 'M5 19 19 5M8 5h11v11');
  svg.append(path);
  return svg;
}

function createFeature(article) {
  const feature = document.createElement('article');
  feature.className = 'guide-feature';
  const imageUrl = localImage(article.hero?.src);
  if (imageUrl) {
    const imageLink = document.createElement('a');
    imageLink.className = 'guide-feature-image';
    imageLink.href = articlePath(article.slug);
    imageLink.setAttribute('aria-label', `Read ${article.title}`);
    const image = document.createElement('img');
    image.src = imageUrl;
    image.alt = article.hero?.alt || '';
    image.loading = 'lazy';
    imageLink.append(image);
    feature.append(imageLink);
  }

  const copy = document.createElement('div');
  copy.className = 'guide-feature-copy';
  copy.append(articleMeta(article));
  const heading = textElement('h3', '', '');
  const link = document.createElement('a');
  link.href = articlePath(article.slug);
  link.textContent = article.title;
  heading.append(link);
  copy.append(heading, textElement('p', 'guide-feature-dek', article.description));
  const read = document.createElement('a');
  read.className = 'guide-read-link';
  read.href = articlePath(article.slug);
  read.append(document.createTextNode('Read the story'), arrowIcon());
  copy.append(read);
  feature.append(copy);
  return feature;
}

function createRow(article) {
  const row = document.createElement('article');
  row.className = 'guide-story-row';
  const copy = document.createElement('div');
  copy.append(articleMeta(article));
  const heading = textElement('h3', '', '');
  const link = document.createElement('a');
  link.href = articlePath(article.slug);
  link.textContent = article.title;
  heading.append(link);
  copy.append(heading, textElement('p', 'guide-story-dek', article.description));
  row.append(copy);
  const read = document.createElement('a');
  read.className = 'guide-story-arrow';
  read.href = articlePath(article.slug);
  read.setAttribute('aria-label', `Read ${article.title}`);
  read.append(arrowIcon());
  row.append(read);
  return row;
}

function showStatus(message) {
  feed.replaceChildren(textElement('p', 'guide-feed-status', message));
  feed.setAttribute('aria-busy', 'false');
}

async function loadGuide() {
  if (!feed) return;
  feed.setAttribute('aria-busy', 'true');
  try {
    const response = await fetch('guide-content.json', { cache: 'no-cache' });
    if (!response.ok) throw new Error(`Guide request failed: ${response.status}`);
    const data = await response.json();
    if (data.version !== 1 || !Array.isArray(data.articles)) throw new Error('Guide format was not recognized');
    const articles = data.articles
      .filter(article => article && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(article.slug) &&
        typeof article.title === 'string' && article.title.trim() &&
        typeof article.description === 'string' && article.description.trim())
      .sort((a, b) => Date.parse(b.publishedAt || '') - Date.parse(a.publishedAt || ''));
    if (!articles.length) {
      showStatus('The first local story is on its way. In the meantime, explore the chalet and its surroundings.');
      return;
    }
    const fragment = document.createDocumentFragment();
    fragment.append(createFeature(articles[0]));
    if (articles.length > 1) {
      const rest = document.createElement('div');
      rest.className = 'guide-story-list';
      for (const article of articles.slice(1)) rest.append(createRow(article));
      fragment.append(rest);
    }
    feed.replaceChildren(fragment);
    feed.setAttribute('aria-busy', 'false');
  } catch {
    feed.setAttribute('aria-busy', 'false');
    const fallback = feed.querySelector('article');
    if (fallback) feed.prepend(textElement('p', 'guide-feed-status', 'The latest updates are unavailable, but you can read the stories below.'));
    else showStatus('The stories are temporarily unavailable. Please check back soon.');
  }
}

loadGuide();
