# Raccoon Chalet visual system

The site feels like a cinematic mountain journal: landscape photography carries the arrival, warm editorial type carries the story, and dark evergreen surfaces create quiet pauses between warmer rooms. Motion follows a single arc from arrival through the retreat rituals to booking. The interface stays restrained so the property can lead.

## Core materials

- Deep evergreen `#101d19` for immersion and nighttime sections.
- Warm paper `#f3eee5` and sand `#e3d8ca` for reading and practical details.
- Ember `#9c563e` for restrained wayfinding and active states.
- Instrument Serif for large, expressive lines; DM Sans for navigation, content, and controls. Both are self-hosted.
- Property photography stays recognizable. Image treatments are gentle and preserve the real setting.

## Composition

The first viewport is a full landscape view with the offer and availability action immediately legible. The page alternates open editorial layouts, a sticky four-chapter photo sequence, a horizontal interior gallery, a portrait film, a room breakdown, and a practical calendar. Repeated labels, badges, and decorative type stay out of the photographs' way. The bunk room and kids' loft are shown explicitly. Booking options for Airbnb and Vrbo are available from the calendar and close; header and hero actions lead to availability.

## Motion

The hero WebGL pass applies a slow current, an eased pointer-responsive lens, fine grain, and subtle color grading to the deck image. The CSS photo underneath is a complete fallback. A brief image-loading veil withdraws as soon as the hero photo decodes, without delaying the content. The ritual chapters crossfade photos with gentle scroll drift; shorter reveal transitions support the scene. Reduced-motion visitors receive visible content, still photography, and no shader loop.

## Interaction and accessibility

Controls are keyboard reachable, use visible focus rings, and keep native labels. The mobile menu contains focus and makes the page inert while open. The calendar offers large date targets, clear status states, and visible Airbnb and Vrbo paths. Airbnb links can carry selected dates; Vrbo links do not prefill dates. Availability is a guide because the booking platform confirms final dates and terms. Outbound links carry consistent source tags. Clarity loads asynchronously in the footer only after consent.
