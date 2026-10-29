const CONSENT_KEY = 'raccoon-chalet-analytics-v1';
const CONSENT_AGE_MS = 180 * 24 * 60 * 60 * 1000;

function storedChoice() {
  try {
    const saved = JSON.parse(localStorage.getItem(CONSENT_KEY));
    if ((saved?.choice === 'accepted' || saved?.choice === 'declined') &&
        Number.isFinite(saved.at) && saved.at <= Date.now() &&
        Date.now() - saved.at < CONSENT_AGE_MS) {
      return saved.choice;
    }
  } catch {
    // A blocked storage API simply means the visitor chooses again next time.
  }
  return null;
}

function rememberChoice(choice) {
  try {
    localStorage.setItem(CONSENT_KEY, JSON.stringify({ choice, at: Date.now() }));
  } catch {
    // The current page still honors the choice when storage is unavailable.
  }
}

let choice = storedChoice();
let clarityLoaded = false;

function startClarity() {
  if (clarityLoaded) return;
  clarityLoaded = true;
  (function(c,l,a,r,i,t){
    c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
    t=l.createElement(r);t.async=1;t.src='https://www.clarity.ms/tag/'+i;
    (l.querySelector('footer') || l.body).appendChild(t);
  })(window, document, 'clarity', 'script', 'z4ymag6thv');
  window.clarity('consentv2', { ad_Storage: 'denied', analytics_Storage: 'granted' });
}

if (choice === 'accepted') startClarity();

function updateStatus() {
  const status = document.getElementById('analytics-status');
  if (status) {
    status.textContent = choice === 'accepted'
      ? 'Analytics are on. You can turn them off at any time.'
      : choice === 'declined'
        ? 'Analytics are off. You can turn them on at any time.'
        : 'Analytics are off until you choose to allow them.';
  }
}

function initChoices() {
  const panel = document.createElement('aside');
  panel.className = 'privacy-choice';
  panel.hidden = true;
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-labelledby', 'privacy-choice-title');
  panel.setAttribute('aria-describedby', 'privacy-choice-description');
  panel.innerHTML = `
    <div class="privacy-choice-top">
      <h2 id="privacy-choice-title">Your privacy choice</h2>
      <button class="privacy-choice-close" type="button">Close</button>
    </div>
    <p id="privacy-choice-description">We use Microsoft Clarity to see how visitors use this site and improve it. Allowing analytics enables cookies, heatmaps, and session replays. You can use the site without analytics.</p>
    <a class="privacy-choice-link" href="privacy.html">Read the privacy notice</a>
    <div class="privacy-choice-actions">
      <button type="button" data-choice="declined">Decline analytics</button>
      <button type="button" data-choice="accepted">Allow analytics</button>
    </div>`;
  document.body.append(panel);

  const privacyLink = panel.querySelector('.privacy-choice-link');
  privacyLink.href = location.pathname.endsWith('/privacy.html') ? '#analytics' : 'privacy.html#analytics';
  let returnFocus = null;
  const close = () => {
    panel.hidden = true;
    const target = returnFocus?.isConnected && returnFocus !== document.body
      ? returnFocus
      : document.querySelector('main');
    if (target?.tagName === 'MAIN') target.tabIndex = -1;
    target?.focus({ preventScroll: true });
  };
  const open = (event) => {
    returnFocus = event?.currentTarget ?? document.activeElement;
    panel.hidden = false;
    panel.querySelector('[data-choice="declined"]').focus({ preventScroll: true });
  };
  panel.querySelector('.privacy-choice-close').addEventListener('click', close);
  panel.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') close();
  });
  privacyLink.addEventListener('click', () => {
    panel.hidden = true;
    const heading = document.getElementById('analytics-title');
    if (heading) {
      heading.tabIndex = -1;
      heading.focus({ preventScroll: true });
    }
  });
  for (const button of panel.querySelectorAll('[data-choice]')) {
    button.addEventListener('click', () => {
      choice = button.dataset.choice;
      rememberChoice(choice);
      close();
      updateStatus();
      if (choice === 'accepted') {
        startClarity();
      } else if (clarityLoaded) {
        window.clarity('consentv2', { ad_Storage: 'denied', analytics_Storage: 'denied' });
        window.location.reload();
      }
    });
  }
  for (const button of document.querySelectorAll('[data-privacy-settings]')) {
    button.addEventListener('click', open);
  }
  updateStatus();
  if (!choice) open();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initChoices, { once: true });
} else {
  initChoices();
}
