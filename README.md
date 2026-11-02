# Raccoon Chalet

A photo-led static website for Raccoon Chalet. The production site uses plain HTML, CSS, and JavaScript.

## Local development

Run `npm run dev` and open `http://127.0.0.1:4173`. Run `npm run check` and `npm run build` to verify and generate `dist/`.

The browser fetches `./calendar.json` and `./guide-content.json` at runtime. The local guide also has pre-rendered article pages and ordinary HTML links so search engines and visitors without JavaScript can read it.

## Local guide publishing

`guide-content.json` is the guide's source of truth. `npm run build` renders `/guide/<slug>/index.html`, adds article links to `/guide.html`, updates the sitemap, and creates a 1200 × 630 OG image for an article when its `ogImage` file is missing. The initial articles use real Raccoon Chalet photos and their own generated OG cards. Each article stores an `author` ID (`erik-zettersten` or `wendy-zettersten`) for its byline and portrait. Weekly stories alternate between them; existing bylines remain fixed in the JSON. External source links carry `utm_source=raccoonchalet.com`, `utm_medium=referral`, and `utm_campaign=local_guide` while preserving any existing URL parameters.

The **Publish local guide** workflow first attempts publication on Sunday at **9:00 AM America/New_York**, including daylight saving changes. It retries at 10:17 AM, 12:17 PM, 4:17 PM, 8:17 PM, and 11:17 PM on Sunday and at 9:17 AM Monday through Saturday until one story is live that week. A New York Sunday-to-Saturday gate prevents duplicate weekly posts; manual dispatch can intentionally override it with `force`. GitHub may delay or drop scheduled events, so 9:00 AM is a target rather than a guaranteed publication time.

The workflow reads unused, seasonally eligible topics in `editorial-topics.json`; the owner can add questions and firsthand notes there. OpenAI web search is restricted to official domains. The publisher verifies reachable sources, checks claims and style with an independent review, repairs ordinary source-list and description-format problems, and tries a second topic if needed. Failed checks, missing credentials, or no eligible topic now fail the run visibly instead of reporting a misleading success. A later scheduled attempt retries. The live-site check also republishes a saved guide if its Pages deployment did not reach the site. These checks do not fabricate visits or claim rental guests have access to Bryce Resort's member amenities. Article pages cite official sources and label illustrative images. The owner should still review new posts periodically.

To enable the weekly workflow, add an `OPENAI_API_KEY` **repository Actions secret** under **Settings → Secrets and variables → Actions → New repository secret**. Do not place the key in a file or issue. A missing secret now fails the run and leaves the site unchanged. The default text model is `gpt-6-astra`; the image model is `gpt-image-2.5-flare`. Image access may require OpenAI organization verification. Run `node scripts/publish-guide.mjs dist editorial-topics.json --dry-run` to inspect eligible topics without an API call.

Each successful run adds one generated WebP hero, one templated PNG OG card, an article HTML page, links on the guide index, and sitemap entries to the **published `gh-pages` snapshot**. It updates `guide-content.json` there and republishes the saved Pages artifact without rebuilding the website from `main`. The `main` branch is unchanged by weekly runs. GitHub Pages still requires a full artifact deployment even when only content files change. IndexNow receives the new article and guide index URLs after publication. The regular full-site deploy carries published guide content and generated images forward, so later site edits do not erase weekly articles. Keep `editorial-topics.json` stocked with eligible topics.

The retry system cannot guarantee a new factual article if GitHub, OpenAI, image generation, or all official sources are unavailable for the entire publication window. A stronger deadline promise requires a pre-reviewed reserve of ready articles stored outside the public `gh-pages` snapshot, plus an independent scheduler or monitor. Never store unpublished reserve articles on `gh-pages`: calendar and site deployments copy that branch into the public site.

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
