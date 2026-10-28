import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const SOURCE = 'https://staybluemaple.com/wp-json/wp/v2/properties/57492/calendar';
const output = resolve(process.cwd(), process.argv[2] ?? 'calendar.json');
const requiredFields = ['price', 'min_stay', 'max_stay', 'available', 'checkin', 'checkout'];

function isDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

function validateCalendar(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('Calendar response must be an object keyed by date.');
  }

  const dates = Object.keys(data).sort();
  if (dates.length < 60) {
    throw new Error(`Calendar response has only ${dates.length} days; refusing to replace the existing file.`);
  }

  for (const date of dates) {
    if (!isDate(date)) throw new Error(`Invalid calendar date: ${date}`);
    const day = data[date];
    if (!day || typeof day !== 'object' || Array.isArray(day)) {
      throw new Error(`Invalid calendar entry for ${date}`);
    }
    for (const field of requiredFields) {
      if (!Number.isFinite(day[field]) || day[field] < 0 || (field !== 'price' && !Number.isInteger(day[field]))) {
        throw new Error(`Invalid ${field} for ${date}`);
      }
    }
    if (day.available !== 0 && day.available !== 1) {
      throw new Error(`Invalid available value for ${date}`);
    }
  }

  for (let i = 1; i < dates.length; i += 1) {
    const previous = new Date(`${dates[i - 1]}T00:00:00Z`);
    const current = new Date(`${dates[i]}T00:00:00Z`);
    if (current.valueOf() - previous.valueOf() !== 86_400_000) {
      throw new Error(`Calendar has a gap between ${dates[i - 1]} and ${dates[i]}`);
    }
  }

  return Object.fromEntries(dates.map((date) => [date, data[date]]));
}

async function fetchCalendar() {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const url = new URL(SOURCE);
      url.searchParams.set('_', Date.now().toString());
      const response = await fetch(url, {
        headers: { Accept: 'application/json' },
        cache: 'no-store',
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) throw new Error(`Calendar API returned HTTP ${response.status}`);
      return validateCalendar(await response.json());
    } catch (error) {
      lastError = error;
      if (attempt < 3) await new Promise((done) => setTimeout(done, attempt * 1_000));
    }
  }
  throw lastError;
}

const calendar = await fetchCalendar();
const temporary = `${output}.${process.pid}.tmp`;
await mkdir(dirname(output), { recursive: true });
try {
  await writeFile(temporary, `${JSON.stringify(calendar, null, 2)}\n`, 'utf8');
  await rename(temporary, output);
} finally {
  await rm(temporary, { force: true });
}
console.log(`Updated ${output} with ${Object.keys(calendar).length} days of availability.`);
