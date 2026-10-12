# Mihrab reuse report

Honest, per-feature record of what we checked in Mihrab and what we did with it. "Vendored" = pristine copy under
`third_party/mihrab` (AGPL). "Idea" = we read it, learned from it, wrote our own code. Update this file with every step.

| Feature | Mihrab code checked | Verdict | Why |
|---|---|---|---|
| On-device prayer calculation (`providers/localAdhan`, `utils/*`) | yes | **Vendored** | Clean 14-file closure, one dependency (`adhan`), works as-is. Wrapped by `packages/prayer` |
| Timing validation (`providers/validateTimings`) | yes | **Vendored**, but Tarteel also has its own `assertSane` | Same checks; ours is dependency-free and unit-tested without `adhan` |
| Hijri conversion (`hijri/convert`) | yes | **Vendored, NOT used** | Repeats/skips a day near year end (canary test). Tarteel has its own Umm al-Qura + tabular implementation with offset |
| Auto calculation method (`providers/autoMethod`) | yes | **Vendored, partly used** | Only Morocco is special-cased, everything else is MWL. Tarteel resolves method by country first |
| Onboarding (`src/onboarding`, 1.5k LOC) | yes | **Ideas only** | Steps are Mihrab-specific (salam, four madhabs), logic is tied to its settings blob. We took: Asr-by-school comparison, rejecting (0,0) as "no location", pure testable step order and progress. Tarteel differs: location optional, translation step. |
| Month times (`screens/month`, 0.5k LOC) | yes (sizes only) | **Not reused** | It is UI; the logic is a loop over days, which we wrote and tested |
| Compass / Qibla (`screens/compass`, `native/Compass*`) | yes | **Ideas only** | Mihrab uses a native Android module (GeomagneticField) for true heading; Tarteel uses `expo-location` true heading first. We took: circular smoothing/stability score, calibration prompt. Native module stays an option if `expo-location` proves inaccurate on real phones |
| Notifications / adhan alarms (`src/notifications`, Kotlin) | yes | **Kotlin: vendored (3 files). JS scheduler: ideas only.** See [NOTIFICATIONS-REPORT.md](NOTIFICATIONS-REPORT.md) | Scheduler is a 128-file hub; Notifee is archived (using notify-kit); DND module excluded (hard-coded Mihrab name); status icon is Mihrab branding (replaced); adhan audio has no licence info (not used) |
| Qibla math (`utils/qibla`) | not compared | **Not evaluated** | Tarteel's own formula is checked against published bearings (London, New York, Dhaka, Sydney) |

## Things we deliberately do not take
Donation/"help" chips and Mihrab branding. Streak features are opt-in only (Tarteel spec). Any content licence claim.

## Next candidates to evaluate (in order)
1. Phase 2 alerts proof of concept (study done, approval needed).
2. Duas / tasbih data and logic (content licence must be checked first).
3. Quran audio (`src/quran/audio`) and downloads.
