# Raccoon Chalet

<!-- impeccable:product-schema 1 -->

## Platform
web

## Stack
Static HTML, CSS, and JavaScript, published on GitHub Pages. The calendar is a separate JSON file fetched at runtime.

## Users
Prospective guests considering a family or group mountain getaway near Bryce Resort. They need to see the home, understand its amenities and practical details, check dates, and continue to a booking listing.

## Product Purpose
Present Raccoon Chalet as a memorable retreat and help guests decide whether it fits their stay. Make availability easy to inspect and direct booking to the property's external listing.

## Positioning
A mountain chalet five minutes from Bryce Resort with a saltwater hot tub, cedar sauna, private theater, pool and ping pong, and space to gather indoors and out.

## Capabilities and Constraints
- This is a static website hosted on GitHub Pages.
- The availability source is `https://staybluemaple.com/wp-json/wp/v2/properties/57492/calendar`.
- The published website reads a local `calendar.json` file at runtime so availability data is independent of the page bundle.
- GitHub Actions refresh the calendar from the source API and publish the updated static artifact.
- Confirmed booking destinations are Airbnb (`https://www.airbnb.com/rooms/1443504721219481379`) and Vrbo (`https://www.vrbo.com/5357826`).
- The homepage includes a Microsoft Clarity site disclosure and links to a dedicated privacy notice. Clarity loads only after visitors allow analytics; they can later change that choice.
- The site must support reduced motion and keyboard navigation alongside its immersive motion.

## Brand Commitments
- Name: Raccoon Chalet.
- The website should feel immersive, visually ambitious, and motion rich, with tasteful shader effects.
- Property photography and a short vertical video are available in `assets/`.

## Evidence on Hand
- The supplied property description establishes three bedrooms, a kids' loft, two full bathrooms, a hot tub, cedar sauna, theater, pool, ping pong, deck, fire pit, kitchen, keyless entry, Wi-Fi, laundry, and nearby recreation.
- Up to two dogs are allowed at $29 per pet per night; cats are not allowed.
- On-site parking accommodates up to two vehicles.
- A Ring doorbell camera is outside; there are no interior cameras.
- Stays of 14 nights or longer require an e-signed rental agreement.
- Bryce Resort amenities may require an extra fee.
- Guest capacity, direct-booking prices, and other listing URLs have not been supplied and should not be invented.

## Product Principles
- Let the actual property and its setting lead the story.
- Put booking and availability within easy reach.
- Keep practical stay policies findable without crowding the visual narrative.
- Treat source availability as a guide and confirm booking details on the chosen booking platform.
