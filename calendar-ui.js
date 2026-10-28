const AIRBNB_URL = 'https://www.airbnb.com/rooms/1443504721219481379';
const DAY_MS = 86_400_000;

const dateFormat = new Intl.DateTimeFormat('en-US', {
  month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC',
});
const monthFormat = new Intl.DateTimeFormat('en-US', {
  month: 'long', year: 'numeric', timeZone: 'UTC',
});
const weekdayFormat = new Intl.DateTimeFormat('en-US', {
  weekday: 'short', timeZone: 'UTC',
});

function dateAtUTC(key) {
  return new Date(`${key}T12:00:00Z`);
}

function dateKey(date) {
  return date.toISOString().slice(0, 10);
}

function todayKey() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const value = Object.fromEntries(parts.map(({ type, value: item }) => [type, item]));
  return `${value.year}-${value.month}-${value.day}`;
}

function shiftDay(key, days) {
  return dateKey(new Date(dateAtUTC(key).getTime() + days * DAY_MS));
}

function monthIndex(key) {
  return Number(key.slice(0, 4)) * 12 + Number(key.slice(5, 7)) - 1;
}

function keyFromMonth(index) {
  return `${Math.floor(index / 12)}-${String(index % 12 + 1).padStart(2, '0')}-01`;
}

function formatDate(key) {
  return dateFormat.format(dateAtUTC(key));
}

function normalizeCalendar(payload) {
  const candidate = payload?.days ?? payload?.calendar ?? payload;
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
    throw new Error('Calendar data has an unexpected format.');
  }
  const days = new Map();
  for (const [key, value] of Object.entries(candidate)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(key) || !value || typeof value !== 'object') continue;
    if (value.available !== 0 && value.available !== 1 && value.available !== true && value.available !== false) continue;
    days.set(key, value.available === 1 || value.available === true);
  }
  if (!days.size) throw new Error('Calendar data contains no dates.');
  return days;
}

function getElements(root) {
  const find = (id) => root.querySelector(`#${id}`) ?? document.getElementById(id);
  return {
    root,
    month: find('calendar-month'),
    grid: find('calendar-grid'),
    previous: find('calendar-prev'),
    next: find('calendar-next'),
    status: find('calendar-status'),
    selection: find('calendar-selection'),
    booking: find('booking-link'),
    updated: find('calendar-updated'),
  };
}

export async function initCalendar() {
  const root = document.getElementById('calendar-root');
  if (!root || root.dataset.calendarReady === 'true') return;
  const el = getElements(root);
  const required = ['month', 'grid', 'previous', 'next', 'status', 'selection', 'booking'];
  if (required.some((key) => !el[key])) return;

  root.dataset.calendarReady = 'true';
  el.booking.href = AIRBNB_URL;
  el.previous.disabled = true;
  el.next.disabled = true;
  el.status.textContent = 'Loading available dates…';

  let days;
  let currentMonth;
  let firstMonth;
  let lastMonth;
  let selectedStart = null;
  let selectedEnd = null;
  const today = todayKey();

  function updateBooking() {
    if (selectedStart && selectedEnd) {
      const url = new URL(AIRBNB_URL);
      url.searchParams.set('check_in', selectedStart);
      url.searchParams.set('check_out', selectedEnd);
      el.booking.href = url.toString();
      el.selection.textContent = `${formatDate(selectedStart)} – ${formatDate(selectedEnd)} selected. Confirm dates and booking terms on Airbnb.`;
    } else if (selectedStart) {
      el.booking.href = AIRBNB_URL;
      el.selection.textContent = `${formatDate(selectedStart)} selected for check-in. Choose a check-out date.`;
    } else {
      el.booking.href = AIRBNB_URL;
      el.selection.textContent = 'Choose your dates, or browse the listing for current booking details.';
    }
  }

  function isContiguousStay(start, end) {
    for (let key = start; key < end; key = shiftDay(key, 1)) {
      if (!days.get(key)) return false;
    }
    return true;
  }

  function selectDate(key) {
    if (!selectedStart || selectedEnd || key <= selectedStart) {
      selectedStart = key;
      selectedEnd = null;
      el.status.textContent = 'Check-in date selected.';
    } else if (isContiguousStay(selectedStart, key)) {
      selectedEnd = key;
      el.status.textContent = 'Stay selected. Continue to Airbnb to confirm availability.';
    } else {
      selectedStart = key;
      selectedEnd = null;
      el.status.textContent = 'That stay includes unavailable nights. A new check-in date was selected.';
    }
    updateBooking();
    render();
  }

  function render() {
    const monthKey = keyFromMonth(currentMonth);
    const firstDate = dateAtUTC(monthKey);
    const year = firstDate.getUTCFullYear();
    const month = firstDate.getUTCMonth();
    el.month.textContent = monthFormat.format(firstDate);
    el.previous.disabled = currentMonth <= firstMonth;
    el.next.disabled = currentMonth >= lastMonth;
    el.grid.replaceChildren();

    for (let weekday = 0; weekday < 7; weekday += 1) {
      const label = document.createElement('span');
      label.className = 'calendar-weekday';
      label.textContent = weekdayFormat.format(new Date(Date.UTC(2023, 0, 1 + weekday, 12)));
      label.setAttribute('aria-hidden', 'true');
      el.grid.append(label);
    }

    const offset = new Date(Date.UTC(year, month, 1, 12)).getUTCDay();
    for (let index = 0; index < offset; index += 1) {
      const spacer = document.createElement('span');
      spacer.className = 'calendar-spacer';
      spacer.setAttribute('aria-hidden', 'true');
      el.grid.append(spacer);
    }

    const count = new Date(Date.UTC(year, month + 1, 0, 12)).getUTCDate();
    for (let number = 1; number <= count; number += 1) {
      const key = dateKey(new Date(Date.UTC(year, month, number, 12)));
      const available = days.get(key) === true && key >= today;
      const known = days.has(key);
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'calendar-day';
      button.dataset.date = key;
      button.textContent = String(number);
      button.disabled = !available;
      button.classList.add(available ? 'is-available' : 'is-unavailable');
      if (key === today) button.classList.add('is-today');
      if (key === selectedStart) button.classList.add('is-selected-start');
      if (key === selectedEnd) button.classList.add('is-selected-end');
      if (selectedStart && selectedEnd && key > selectedStart && key < selectedEnd) {
        button.classList.add('is-in-range');
      }
      const status = key < today ? 'past date' : available ? 'available' : known ? 'unavailable' : 'availability not shown';
      button.setAttribute('aria-label', `${formatDate(key)}, ${status}`);
      if (key === selectedStart || key === selectedEnd) button.setAttribute('aria-pressed', 'true');
      if (available) button.addEventListener('click', () => selectDate(key));
      el.grid.append(button);
    }
  }

  el.previous.addEventListener('click', () => {
    if (currentMonth > firstMonth) { currentMonth -= 1; render(); }
  });
  el.next.addEventListener('click', () => {
    if (currentMonth < lastMonth) { currentMonth += 1; render(); }
  });

  try {
    const response = await fetch('./calendar.json', { cache: 'no-store' });
    if (!response.ok) throw new Error(`Calendar request returned ${response.status}.`);
    days = normalizeCalendar(await response.json());
    const keys = [...days.keys()].sort();
    firstMonth = Math.max(monthIndex(today), monthIndex(keys[0]));
    lastMonth = monthIndex(keys.at(-1));
    if (lastMonth < firstMonth) throw new Error('Calendar dates have expired.');
    const firstAvailable = keys.find((key) => key >= today && days.get(key) === true);
    currentMonth = firstAvailable ? Math.max(firstMonth, monthIndex(firstAvailable)) : firstMonth;
    el.status.textContent = 'Select an available date to start planning your stay.';
    if (el.updated) {
      const modified = response.headers.get('Last-Modified');
      const when = modified ? new Date(modified) : null;
      el.updated.textContent = when && !Number.isNaN(when.valueOf())
        ? `Calendar file updated ${new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(when)}.`
        : `Dates shown through ${formatDate(keys.at(-1))}.`;
    }
    updateBooking();
    render();
  } catch (error) {
    root.classList.add('calendar-error');
    el.status.textContent = 'The calendar could not load right now. Check current dates on Airbnb.';
    el.selection.textContent = 'The listing has the latest booking details.';
    if (el.updated) el.updated.textContent = '';
    el.grid.replaceChildren();
    el.previous.disabled = true;
    el.next.disabled = true;
    console.error('Availability calendar:', error);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initCalendar, { once: true });
} else {
  initCalendar();
}
