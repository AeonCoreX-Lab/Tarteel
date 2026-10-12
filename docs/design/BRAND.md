# Tarteel brand

Official identity, supplied by the project owner. Source files: `brand/source/` (never edit them).
Everything else is generated: `python3 scripts/brand/build_assets.py` (Pillow + numpy) rewrites `brand/png/`,
`apps/mobile/assets/brand/` and the Android notification icons.

## The mark and lockup
Open book under an ogee dome arch with a four-point star; deep green with gold. Lockup: mark, **Tarteel**, Arabic
**ترتيل**, tagline **QURAN FOR EVERY HEART** (Bangla: প্রতিটি হৃদয়ের জন্য কুরআন).

| Use | File |
|---|---|
| Mark on light backgrounds | `brand/png/mark-color.png` |
| Mark on dark / green backgrounds | `brand/png/mark-light.png` |
| Single-colour (white) mark for system UI | `brand/png/mark-mono-white.png` |
| Full lockup, light backgrounds ONLY | `brand/png/logo-primary-transparent.png` |
| App icon (full-bleed green tile) | `brand/png/app-icon-1024.png` |
| Android adaptive icon (fg / monochrome) | `adaptive-foreground-1024.png`, `adaptive-monochrome-1024.png`, background `#03402E` |
| Splash (light / dark) | `splash-light.png` on `#FBF9F4`, `splash-dark.png` on `#053227` |
| Notification small icon | generated into `native/tarteel-android/.../drawable-*dpi/ic_stat_prayer.png` |
| Web | `brand/png/web/*` (favicons, apple-touch, Android chrome, maskable, OG card, `site.webmanifest`, `head-snippet.html`) |

Rules: do not recolour, stretch, outline or add effects. Keep clear space of at least the star's width around the mark. On dark
backgrounds use `mark-light` plus live text (the lockup is dark-on-light only). Do not use the Mihrab app's arch/8-point-star glyph or
any of its branding anywhere (see `docs/upstream/`).

## Palette (sampled from the official files)
| Token | Hex | Where |
|---|---|---|
| Deep green | `#03402E` | app icon, buttons, hero card (light), adaptive background |
| Splash green | `#053227` | dark splash |
| Cream | `#FBF9F4` | light background, light splash |
| Gold | `#B88A2A` (marks) / `#8A6414` (text) | current-prayer bar, progress, star |
| Dark bg / surface | `#0E1A17` / `#15251F` | dark theme |
| AMOLED | `#000000` | AMOLED theme |
| Ink | `#0A2B22` | text on light |

Contrast (WCAG): all text pairs >= 4.5:1. In the dark themes plain green fails as text (2.2:1), so green *text* uses `accentText #7FCFA6`
and gold text uses `#E3B94F`. Light: text 14.4, muted 5.8, brassText 5.1, on-accent 11.2.

## Typography
Headings: platform serif (Noto Serif on Android), echoing the wordmark. Body: system sans. Arabic UI text: system Arabic.
**Quran text font is a separate decision** and needs a font + licence audit first (`docs/licensing/INVENTORY.md`).

## First-run experience (matches the brand sheet)
1. Native splash: mark on cream (light) / deep green (dark), set by `expo-splash-screen` in `app.config.ts`.
2. In-app splash (`BrandSplash`): mark, wordmark, Arabic name, tagline, thin gold progress bar (static if reduce-motion is on).
3. Intro carousel (`WelcomeCarousel`): *The Holy Quran in Your Hands*, *Multiple Translations*, *Offline First*; Skip, dots, pill button
   (**Next** / **Get Started**). Illustrations are original vector shapes (skyline, language cards, phone), not copied artwork.
4. Setup: language -> location -> method -> translation -> summary.

## Known limits
- The logo files are **raster** (1254 px). Transparent versions are produced by removing the flat background colour; edges are clean
  but a vector (SVG) master should be made before print or very large uses, and favicons at 16 px are only legible, not crisp.
- If the logo was produced with an AI image tool, check the tool's terms and the legal position on ownership/trademark before relying
  on it as a registered mark; a hand-redrawn SVG removes that doubt.
- The brand sheet's website mockup (hero, nav, four feature icons) is not built yet; the web assets above are ready for it.
