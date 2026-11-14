# LoadPacket approved landing page export

This archive contains the complete approved landing-page HTML, CSS, JavaScript and local media. It matches published source commit 1be1eae122ad2ee8c296246148de1e9bcad59398. No browser access is required to inspect or implement it.

## Files
- index.html: full source; styles and interactions are inline, including responsive rules, hero animation, guided product preview and sample RateCon demo.
- assets/road-ahead.webp: original AI-generated truck image and video poster.
- assets/loadpacket-overview.mp4: 20-second silent illustrated overview, H.264, 1280x720.
- assets/overview-captions.vtt: English captions for the overview.
- SHA256SUMS.json: byte checksums for the source and media.

## Preview
Extract this folder and open index.html, or serve it locally with an existing static server. A local HTTP server is preferable for caption loading. The source uses Google Fonts links for Manrope and DM Sans; font files are not bundled. The Next.js app already uses those fonts; reuse its existing font loading.

## Integrate into LoadPacket
Continue the original dashboard + landing implementation task. Use this export as the approved landing source of truth and retain the approved Figma dashboard references.

1. Keep the current dashboard at / and add the landing page at /welcome.
2. Port the source into normal Next.js components. Do not embed the entire HTML in an iframe, inject scripts through dangerouslySetInnerHTML, or add a second application framework.
3. Scope landing CSS (e.g. a CSS Module); do not copy body/header/button/global element rules into globals.css in a way that affects existing screens.
4. Move local media into apps/web/public/marketing/loadpacket/ and update src, poster and track references to /marketing/loadpacket/.... Keep media bytes intact.
5. Replace absolute Render login/register links with existing internal /login and /auth/register navigation. Preserve auth/return-to behavior.
6. Use component state, refs and effects for interactions. Clean up timers, animation callbacks and observers on unmount. Preserve keyboard tab semantics, replay/play-pause and reduced-motion behavior.
7. Keep sample RateCon data browser-local and explicitly fictional. The extract step reveals prepared values. Creating a sample load must never call the API, save account data, upload a document, or imply real OCR/AI extraction.
8. Preserve video controls, playsInline, poster, captions/transcript and user-initiated playback.
9. Make only the exact auth/proxy exception needed for /welcome and its public media. Leave other route protections unchanged.
10. Follow the original prompt's protections for uncommitted work, API/data contracts, environments, Docker and Render. No migrations, deployments or registry pushes.

## Validation
The static reference's sample selection, field editing, sample-summary creation and guided-demo controls were exercised in a browser. A phone-width iframe check showed no horizontal page overflow and 44px form inputs. Desktop layout and video playback were inspected. These checks do not replace targeted tests and visual validation of the Next.js implementation.

## Scope
This is a source/media export, not a drop-in React implementation and not the LoadPacket application repository. Dashboard Figma frame: https://www.figma.com/design/Ge53A07i6nshRYBLSXeV50?node-id=101-610 (mobile frame 101:830). Existing application behavior remains authoritative.

No credentials, environment files, private company data, Git metadata, or hosting configuration are included.
