# Raccoon Chalet

A photo-led static website for Raccoon Chalet. The production site uses plain HTML, CSS, and JavaScript.

## Local development

Run `npm run dev` and open `http://127.0.0.1:4173`. Run `npm run check` and `npm run build` to verify and generate `dist/`.

The browser fetches `./calendar.json` and `./guide-content.json` at runtime. The local guide also has pre-rendered article pages and ordinary HTML links so search engines and visitors without JavaScript can read it.

## Local guide publishing

`guide-content.json` is the guide's source of truth. `npm run build` renders `/guide/<slug>/index.html`, adds article links to `/guide.html`, updates the sitemap, and creates a 1200 × 630 OG image for an article when its `ogImage` file is missing. The two initial articles use real Raccoon Chalet photos and their own generated OG cards. External source links carry `utm_source=raccoonchalet.com`, `utm_medium=referral`, and `utm_campaign=local_guide` while preserving any existing URL parameters.

The **Publish local guide** workflow is scheduled each Sunday at **9:00 AM America/New_York**, including daylight saving changes, or can run manually from the Actions tab. It reads the next unused, seasonally eligible topic in `editorial-topics.json`. The owner can add questions, eligible months, and firsthand notes there. The job uses OpenAI web search with an official-domain allowlist, checks that cited official pages are reachable, and runs a second independent factual and style review. It skips publication when there is no eligible curated topic or the checks fail. It does not fabricate visits or claim rental guests have access to Bryce Resort's member amenities. AI-assisted articles and illustrative images are labeled on their pages. Automated checks reduce errors, but the owner should still review new posts periodically.

To enable the weekly workflow, add an `OPENAI_API_KEY` **repository Actions secret** under **Settings → Secrets and variables → Actions → New repository secret**. Do not place the key in a file or issue. Until the secret exists, the scheduled workflow logs a skip and leaves the site unchanged. The default text model is `gpt-6-astra`; the image model is `gpt-image-2.5-flare`. Image access may require OpenAI organization verification. Run `node scripts/publish-guide.mjs dist editorial-topics.json --dry-run` to inspect the next topic without an API call.

Each successful run adds one generated WebP hero, one templated PNG OG card, an article HTML page, links on the guide index, and sitemap entries to the **published `gh-pages` snapshot**. It updates `guide-content.json` there and republishes the saved Pages artifact without rebuilding the website from `main`. The `main` branch is unchanged by weekly runs. GitHub Pages still requires a full artifact deployment even when only content files change. IndexNow receives the new article and guide index URLs after publication. The regular full-site deploy carries published guide content and generated images forward, so later site edits do not erase weekly articles. Edit `editorial-topics.json` to add future topics; if no unused topic is eligible that month, the workflow intentionally skips publication.

## Availability

`node scripts/update-calendar.mjs` downloads and validates a year of dates from the Stay Blue Maple API, then writes `calendar.json` atomically. It rejects incomplete or malformed responses. The site displays the API's `available` flag; final dates and booking terms are confirmed on Airbnb or Vrbo.

Set repository **Pages Source** to **GitHub Actions**.

- `deploy-site.yml` runs on source changes to `main`, refreshes the calendar, builds `dist/`, stores a `gh-pages` snapshot, and deploys the Pages artifact.
- `update-calendar.yml` runs hourly at minute 17 UTC or manually. It refreshes `calendar.json` in the saved snapshot and republishes that snapshot without running the site build. It skips publishing when the data is unchanged.

GitHub Pages requires an artifact deployment to publish a changed static file. Calendar-only updates leave the site's HTML, CSS, JavaScript, and media unchanged.

Run the full site workflow once before the calendar-only workflow so the `gh-pages` snapshot exists. Airbnb links prefill a selected date range; Vrbo links open the listing without dates.

## IndexNow

The root file `b37fe215b24148208f5c4a0492950f61.txt` verifies ownership for IndexNow. After a deployment succeeds, `scripts/submit-indexnow.mjs` notifies the IndexNow API about changed HTML page URLs. Homepage and shared-media changes submit `/`; privacy changes submit `/privacy.html`; guide changes submit `/guide.html` and its article URLs. Documentation-only changes submit nothing. A manual **Deploy site** run resubmits all published pages when needed. A successful weekly guide publication submits its new article and guide index.

The hourly calendar workflow does not send IndexNow notifications because it only changes `calendar.json`. Verify submitted URLs in Bing Webmaster Tools. IndexNow reports changes to participating search engines; the sitemap and Google Search Console remain the route for Google discovery.

## Privacy and analytics

The homepage footer contains the Microsoft Clarity site disclosure and links to `privacy.html`. Clarity loads only after a visitor allows analytics. `privacy.js` stores that choice in the visitor's browser for up to 180 days and sends Clarity Consent V2 with advertising storage denied. Visitors can change their choice from either page's footer. In the Clarity project, enable Consent Mode under **Settings → Setup** so the consent signal controls Clarity cookies.

## Custom domain

The canonical domain is `raccoonchalet.com`. The site's canonical tag, structured data, social previews, robots file, and sitemap all use this address. Relative asset URLs also let the default project URL work while DNS is being configured.

1. In the repository's **Settings → Pages**, keep **Source: GitHub Actions**, set **Custom domain** to `raccoonchalet.com`, and save. With an Actions-published site, no `CNAME` file is needed.
2. In DNSimple's advanced DNS editor, add an apex **ALIAS** record with a blank name (or `@`) pointing to `Zettersten.github.io.`. Add a **CNAME** record named `www` pointing to `Zettersten.github.io.`. Do not include `/raccoonchalet.com` in either target. Remove conflicting apex A/AAAA/ALIAS records and conflicting `www` records if any are present.
3. When DNS and certificate provisioning finish, enable **Enforce HTTPS** in the same GitHub Pages settings. GitHub redirects `www.raccoonchalet.com` to the canonical apex domain.
4. Verify `https://raccoonchalet.com/`, `/robots.txt`, and `/sitemap.xml` load. Add the domain to Google Search Console and Bing Webmaster Tools, verify ownership, and submit `https://raccoonchalet.com/sitemap.xml` to each.
