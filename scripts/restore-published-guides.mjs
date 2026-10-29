import { access, cp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { validateGuideContent, renderGuidePages } from './guide-pages.mjs';
import { fingerprintAssets } from './fingerprint-assets.mjs';

const publishedRoot = resolve(process.argv[2] ?? '');
const destinationRoot = resolve(process.argv[3] ?? 'dist');
if (!process.argv[2] || !process.argv[3] || publishedRoot === destinationRoot) {
  throw new Error('Usage: node scripts/restore-published-guides.mjs <published-snapshot> <dist>');
}

async function exists(path) {
  try { await access(path); return true; } catch { return false; }
}

async function copyPublishedImages(sourceDirectory, destinationDirectory, sourceRepoDirectory, sourceWins) {
  for (const entry of await readdir(sourceDirectory, { withFileTypes: true })) {
    const from = join(sourceDirectory, entry.name);
    const to = join(destinationDirectory, entry.name);
    const sourceRepoFile = join(sourceRepoDirectory, entry.name);
    if (entry.isDirectory()) await copyPublishedImages(from, to, sourceRepoFile, sourceWins);
    else if (entry.isFile() && !await exists(sourceRepoFile) && !(sourceWins && await exists(to))) {
      await mkdir(dirname(to), { recursive: true });
      await cp(from, to, { force: true });
    }
  }
}

function sourceGuidesChanged() {
  if (process.env.GUIDE_FORCE_SOURCE === 'true') return true;
  const before = process.env.GUIDE_SOURCE_BEFORE;
  const after = process.env.GUIDE_SOURCE_AFTER;
  if (!before || !after || /^0+$/.test(before)) return false;
  const names = execFileSync('git', ['diff', '--name-only', before, after, '--', 'guide-content.json'], { encoding: 'utf8' });
  return names.split(/\r?\n/).includes('guide-content.json');
}

const sourceContent = validateGuideContent(JSON.parse(await readFile(join(destinationRoot, 'guide-content.json'), 'utf8')));
const publishedPath = join(publishedRoot, 'guide-content.json');
if (await exists(publishedPath)) {
  const publishedContent = validateGuideContent(JSON.parse(await readFile(publishedPath, 'utf8')));
  const sourceWins = sourceGuidesChanged();
  let content = publishedContent;
  if (sourceWins) {
    const articles = new Map(publishedContent.articles.map(article => [article.slug, article]));
    for (const article of sourceContent.articles) articles.set(article.slug, article);
    content = {
      version: 1,
      updatedAt: [sourceContent.updatedAt, publishedContent.updatedAt].sort().at(-1),
      articles: [...articles.values()],
    };
  }
  await writeFile(join(destinationRoot, 'guide-content.json'), `${JSON.stringify(content, null, 2)}\n`, 'utf8');
  const imageRoot = join(publishedRoot, 'assets', 'guides');
  if (await exists(imageRoot)) await copyPublishedImages(imageRoot, join(destinationRoot, 'assets', 'guides'), join(process.cwd(), 'assets', 'guides'), sourceWins);
  console.log(`Restored published guide content; source article edits ${sourceWins ? 'merged' : 'not present'}.`);
}
await renderGuidePages(destinationRoot);
await fingerprintAssets(destinationRoot);
