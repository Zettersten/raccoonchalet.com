import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

const xml = value => String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[character]);

function wrapTitle(title) {
  const words = title.trim().split(/\s+/);
  const lines = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > 27 && current) {
      lines.push(current);
      current = word;
    } else current = candidate;
  }
  if (current) lines.push(current);
  if (lines.length > 5) throw new Error('OG title needs at most five lines.');
  return lines;
}

export async function createOgCard({ heroPath, outputPath, title, category }) {
  const lines = wrapTitle(title);
  const fontSize = lines.length >= 5 ? 45 : lines.length === 4 ? 54 : lines.length === 3 ? 64 : 76;
  const lineHeight = lines.length >= 5 ? 54 : lines.length === 4 ? 64 : lines.length === 3 ? 74 : 88;
  const startY = 315 - (lines.length - 1) * lineHeight / 2;
  const headline = lines.map((line, index) => `<text x="600" y="${startY + index * lineHeight}" text-anchor="middle" fill="#fffaf1" font-family="Georgia, DejaVu Serif, serif" font-size="${fontSize}" font-weight="400" letter-spacing="-1.5">${xml(line)}</text>`).join('');
  const overlay = `<svg width="1200" height="630" viewBox="0 0 1200 630" xmlns="http://www.w3.org/2000/svg">
    <defs><linearGradient id="shade" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#081b13" stop-opacity=".62"/><stop offset=".5" stop-color="#081b13" stop-opacity=".65"/><stop offset="1" stop-color="#081b13" stop-opacity=".85"/></linearGradient></defs>
    <rect width="1200" height="630" fill="url(#shade)"/>
    <path d="M520 90H680" stroke="#e2c09f" stroke-width="2"/>
    <text x="600" y="135" text-anchor="middle" fill="#ead6c1" font-family="DejaVu Sans, sans-serif" font-size="21" font-weight="600" letter-spacing="5">RACCOON CHALET</text>
    ${headline}
    <text x="600" y="535" text-anchor="middle" fill="#e5d6c2" font-family="DejaVu Sans, sans-serif" font-size="19" font-weight="600" letter-spacing="3">${xml(category.toUpperCase())} · BASYE, VIRGINIA</text>
    <path d="M520 558H680" stroke="#e2c09f" stroke-width="2"/>
  </svg>`;
  await mkdir(dirname(outputPath), { recursive: true });
  await sharp(heroPath).resize(1200, 630, { fit: 'cover', position: 'attention' }).composite([{ input: Buffer.from(overlay) }]).png({ compressionLevel: 9 }).toFile(outputPath);
}
