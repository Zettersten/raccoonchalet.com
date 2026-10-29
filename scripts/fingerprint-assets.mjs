import { createHash } from 'node:crypto';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';

const publicAssets = ['styles.css', 'guide.css', 'app.js', 'guide.js', 'calendar-ui.js', 'privacy.js'];
const localReference = /\b(href|src)="((?:\.\.?\/)*[a-z][\w-]*\.(?:css|js))(?:\?[^\"]*)?"/g;

export async function fingerprintAssets(root) {
  const versions = new Map();
  for (const asset of publicAssets) {
    const bytes = await readFile(join(root, asset));
    versions.set(asset, createHash('sha256').update(bytes).digest('hex').slice(0, 10));
  }

  async function updateHtml(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== 'assets' && entry.name !== '.git' && entry.name !== 'node_modules') {
          await updateHtml(path);
        }
        continue;
      }
      if (!entry.isFile() || !entry.name.endsWith('.html')) continue;
      const source = await readFile(path, 'utf8');
      const updated = source.replace(localReference, (match, attribute, url) => {
        const version = versions.get(basename(url));
        return version ? `${attribute}="${url}?v=${version}"` : match;
      });
      if (updated !== source) await writeFile(path, updated, 'utf8');
    }
  }

  await updateHtml(root);
}
