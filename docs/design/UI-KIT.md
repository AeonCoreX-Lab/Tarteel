# Tarteel UI kit (as implemented)

All screens use the same tokens (`apps/mobile/src/theme.ts`) and components (`apps/mobile/src/components`). Brand colours and
assets: [BRAND.md](BRAND.md). Direction and principles: [DESIGN-DIRECTION.md](DESIGN-DIRECTION.md).

## Components
| Component | Use |
|---|---|
| `Heading` | Serif title (platform serif, echoes the wordmark). Every screen starts with one |
| `Card` (`surface`, `alt`, `accent`) | The one panel style. `accent` = deep-green hero; `pattern` adds the quiet star lattice |
| `Segmented` | Single choice (theme, language, reading mode, Asr, Hijri adjustment). Radio group for screen readers |
| `Button`, `PillButton` | Secondary (outlined) and primary (full-width pill: Next, Get Started, Continue) |
| `Chip` | State labels: Now (gold), Next (green), Passed (muted) |
| `StarBadge` | 8-point star holding a surah / ayah number |
| `GeoPattern` | Repeating star lattice. Hero surfaces only |
| `WaqtArc` | The day as a half-ring: six ticks by real clock time, gold progress, marker |
| `Icon` | Outline glyph family (today, quran, bookmark, settings, search, compass, calendar, bell, pin, check, chevrons, sound) |
| `ScreenScroll` / `Column` | Safe-area aware, width-capped (720) reading column for phones, tablets and web |
| `BrandSplash`, `WelcomeCarousel` | First-run experience |

## Rules
1. Tabs: Today, Quran, Saved, Settings: icon **and** text label. No navigator header; each screen draws its own serif heading.
2. Gold marks the present moment only (current-prayer bar, progress, marker). Gold *text* uses `brassText`; green *text* uses `accentText`.
3. The reader is the quietest surface: no pattern, no gradient, one action per ayah.
4. Minimum touch target 44 dp; every control has a text label; countdowns and arcs are decorative and hidden from screen readers
   (the same facts are in text); reduce-motion is respected.
5. Lists are virtualised (`FlatList`); tables and cards never scroll horizontally.
6. Bangla is first-class: every string exists in `en` and `bn` (checked by script), Hijri months use the names used in Bangladesh.

## Screens
| Screen | What it shows |
|---|---|
| Today | Gregorian + Hijri date, location chip, **hero card with waqt arc + countdown**, six-row prayer list with state, tiles (Qibla, Month, Alerts), continue-reading card, calculation basis |
| Quran | Search pill, continue card (green + lattice), surah list with star badges and Arabic names, empty state |
| Reader | Framed surah header, reading-mode control, ayah rows (star number, Arabic, translation, bookmark) |
| Saved | Bookmarks with star badges; illustrated empty state |
| Settings | Grouped cards: Appearance, Reading (live preview with the brand's own words), Prayer times, Privacy, Sources, About |
| Month, Qibla, Search, Alerts (test), Setup | Same cards, headings and controls |

## Not yet designed
Duas, tasbih, log, fasting, khatmah, widgets, audio player (later phases). Share-month image. A dark lockup variant of the logo.
