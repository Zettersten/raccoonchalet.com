# Raccoon Chalet

A photo-led static website for Raccoon Chalet. The production site uses plain HTML, CSS, and JavaScript.

## Local development

Run `npm run dev` and open `http://127.0.0.1:4173`. Run `npm run check` and `npm run build` to verify and generate `dist/`.

The browser fetches `./calendar.json` at runtime. Calendar data is separate from the page bundle.

## Availability

`node scripts/update-calendar.mjs` downloads and validates a year of dates from the Stay Blue Maple API, then writes `calendar.json` atomically. It rejects incomplete or malformed responses. The site displays the API's `available` flag; final dates and booking terms are confirmed on Airbnb or Vrbo.

Set repository **Pages Source** to **GitHub Actions**.

- `deploy-site.yml` runs on source changes to `main`, refreshes the calendar, builds `dist/`, stores a `gh-pages` snapshot, and deploys the Pages artifact.
- `update-calendar.yml` runs hourly at minute 17 UTC or manually. It refreshes `calendar.json` in the saved snapshot and republishes that snapshot without running the site build. It skips publishing when the data is unchanged.

GitHub Pages requires an artifact deployment to publish a changed static file. Calendar-only updates leave the site's HTML, CSS, JavaScript, and media unchanged.

Run the full site workflow once before the calendar-only workflow so the `gh-pages` snapshot exists. Airbnb links prefill a selected date range; Vrbo links open the listing without dates.

## Privacy and analytics

The homepage footer contains the Microsoft Clarity site disclosure and links to `privacy.html`. Clarity loads only after a visitor allows analytics. `privacy.js` stores that choice in the visitor's browser for up to 180 days and sends Clarity Consent V2 with advertising storage denied. Visitors can change their choice from either page's footer. In the Clarity project, enable Consent Mode under **Settings → Setup** so the consent signal controls Clarity cookies.

## Custom domain

The canonical domain is `raccoonchalet.com`. The site's canonical tag, structured data, social previews, robots file, and sitemap all use this address. Relative asset URLs also let the default project URL work while DNS is being configured.

1. In the repository's **Settings → Pages**, keep **Source: GitHub Actions**, set **Custom domain** to `raccoonchalet.com`, and save. With an Actions-published site, no `CNAME` file is needed.
2. In DNSimple's advanced DNS editor, add an apex **ALIAS** record with a blank name (or `@`) pointing to `Zettersten.github.io.`. Add a **CNAME** record named `www` pointing to `Zettersten.github.io.`. Do not include `/raccoonchalet.com` in either target. Remove conflicting apex A/AAAA/ALIAS records and conflicting `www` records if any are present.
3. When DNS and certificate provisioning finish, enable **Enforce HTTPS** in the same GitHub Pages settings. GitHub redirects `www.raccoonchalet.com` to the canonical apex domain.
4. Verify `https://raccoonchalet.com/`, `/robots.txt`, and `/sitemap.xml` load. Add the domain to Google Search Console and Bing Webmaster Tools, verify ownership, and submit `https://raccoonchalet.com/sitemap.xml` to each.
