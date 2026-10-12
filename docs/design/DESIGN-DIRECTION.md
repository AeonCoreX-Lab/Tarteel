# Tarteel design direction

Mihrab's **information architecture** is our reference (tabs: Today, Quran, Log, Duas, Tasbih, Settings; hero + prayer
rows + status band on Home; mushaf and surah readers). Its **visual language is not**: name, icon, imagery, colours,
type and motion are Tarteel's own (Mihrab TRADEMARK.md).

## Principles
1. **Reverent, calm, legible.** The Quran reader is the quietest surface in the app. No decoration behind verses.
2. **Time is the hero.** On Today, the next prayer and its countdown dominate; everything else is secondary.
3. **Professional, not ornate.** Geometry as a quiet accent (one low-contrast star-tessellation motif in headers and
   empty states), never behind text that must be read. No neon, no glassmorphism, no heavy gradients.
4. **Trustworthy states.** Always show what the times are based on (location, method, Asr school, date) and when they
   were last computed; errors say what to do next.
5. **Accessible by default.** 44 dp targets, text-labelled controls, dynamic type, RTL, reduced motion, 4.5:1 contrast.

## Tarteel identity (differs from Mihrab on purpose)
| Aspect | Tarteel |
|---|---|
| Palette | Official: deep green `#03402E`, cream `#FBF9F4`, gold `#B88A2A` for the *current waqt only*, ink `#0A2B22`; dark `#0E1A17`; AMOLED black. Full table and contrast in [BRAND.md](BRAND.md) |
| Type | Headings: platform serif. Arabic Quran face: chosen after font audit. Body: system sans (falls back to Noto Sans Bengali for Bangla) |
| Home hero | A **waqt arc**: flat day-arc with the six times as ticks and a brass marker for now (Mihrab uses a sky scene) |
| Prayer rows | Name, time, state chip (passed / next / now); alert mode icon + text label |
| Icon set | Outline icons with text labels; app icon is calligraphic, original |
| Motion | Minimal; countdown ticks only; honours reduce-motion |
| Voice | Plain, respectful, bilingual (Bangla first-class), no gamified language |

## Screen map (Mihrab screen -> Tarteel screen)
Home/Today -> **Today** (waqt arc, next-prayer card, six rows, status band, Quran continue card, practice card)
MonthTimes -> **Month** (table + share image) · Compass -> **Qibla** · Quran/QuranSurah -> **Quran / Reader**
Khatmah/Downloads -> **Plan & Downloads** · Log -> **Log** · Fasting -> **Fasting** · Tasbih/Duas -> **Dhikr**
Settings/Sync/Backup -> **Settings** · Onboarding -> **Setup** (language, location, method, notifications)

## Build order for UI
Design tokens (`apps/mobile/src/theme.ts`, extend) -> components (Card, PrayerRow, WaqtArc, StatusBand, Chip, Sheet)
-> Today screen -> Month -> Qibla -> then each later phase brings its own screens.
