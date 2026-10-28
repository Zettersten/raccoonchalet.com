import { cp, mkdir, rm, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const destination = resolve(projectRoot, 'dist');
if (dirname(destination) !== projectRoot || destination === projectRoot) {
  throw new Error('Refusing to build outside the project root.');
}

const files = ['index.html', 'styles.css', 'app.js', 'calendar-ui.js', 'calendar.json', 'favicon.svg', 'robots.txt', 'sitemap.xml'];
for (const name of files) {
  await stat(join(projectRoot, name));
}

await rm(destination, { recursive: true, force: true });
await mkdir(destination, { recursive: true });
for (const name of files) {
  await cp(join(projectRoot, name), join(destination, name));
}
await cp(join(projectRoot, 'assets'), join(destination, 'assets'), {
  recursive: true,
  filter: source => !source.endsWith('social-mobile-video.mp4'),
});

console.log(`Built static site in ${destination}`);
