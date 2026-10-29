import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const keyFile = 'b37fe215b24148208f5c4a0492950f61.txt';
const key = keyFile.slice(0, -4);
const origin = 'https://raccoonchalet.com';
const keyLocation = `${origin}/${keyFile}`;
const pages = { home: `${origin}/`, privacy: `${origin}/privacy.html` };

const fileContent = (await readFile(join(projectRoot, keyFile), 'utf8')).trim();
if (fileContent !== key) throw new Error('IndexNow key file content does not match its filename.');

const before = process.env.INDEXNOW_BEFORE;
const after = process.env.INDEXNOW_AFTER || 'HEAD';
const isManual = process.env.INDEXNOW_EVENT === 'workflow_dispatch';
let urlList;

if (isManual || (before && /^0+$/.test(before))) {
  urlList = [pages.home, pages.privacy];
} else {
  if (!before) throw new Error('Set INDEXNOW_BEFORE to the previous commit or use a manual deployment.');
  const changedFiles = execFileSync('git', ['diff', '--name-only', before, after], {
    cwd: projectRoot,
    encoding: 'utf8',
  }).split(/\r?\n/).filter(Boolean);
  const homeChanged = changedFiles.some(file =>
    ['index.html', 'styles.css', 'app.js', 'calendar-ui.js', keyFile].includes(file)
    || (file.startsWith('assets/') && file !== 'assets/social-mobile-video.mp4')
  );
  const privacyChanged = changedFiles.some(file =>
    ['privacy.html', 'styles.css'].includes(file)
  );
  urlList = [homeChanged && pages.home, privacyChanged && pages.privacy].filter(Boolean);
}

if (!urlList.length) {
  console.log('No changed HTML pages to submit to IndexNow.');
  process.exit(0);
}

console.log(`IndexNow pages: ${urlList.join(', ')}`);
if (process.argv.includes('--dry-run')) process.exit(0);

let keyIsLive = false;
for (let attempt = 0; attempt < 5; attempt++) {
  try {
    const response = await fetch(keyLocation, { signal: AbortSignal.timeout(10000) });
    keyIsLive = response.ok && (await response.text()).trim() === key;
    if (keyIsLive) break;
  } catch { /* GitHub Pages may still be propagating. */ }
  if (attempt < 4) await new Promise(resolve => setTimeout(resolve, 2000));
}
if (!keyIsLive) throw new Error(`IndexNow key file is not live at ${keyLocation}.`);

const response = await fetch('https://api.indexnow.org/indexnow', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json; charset=utf-8' },
  body: JSON.stringify({ host: 'raccoonchalet.com', key, keyLocation, urlList }),
  signal: AbortSignal.timeout(15000),
});
if (![200, 202].includes(response.status)) {
  throw new Error(`IndexNow submission failed with HTTP ${response.status}: ${(await response.text()).slice(0, 300)}`);
}
console.log(`IndexNow accepted ${urlList.length} URL(s) with HTTP ${response.status}.`);
