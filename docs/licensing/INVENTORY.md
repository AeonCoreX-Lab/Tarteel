# Asset & license inventory

Never mark an asset "open source" without verification. Fill every column; "TBD" blocks release.

| Asset | Type | Source / URL | Version | License | Copyright | Attribution | Redistribution permitted | Verified by / date |
|---|---|---|---|---|---|---|---|---|
| Tarteel source code | code | this repo | 0.1.0 | AGPL-3.0-or-later | Tarteel contributors | — | yes | — |
| Mihrab (selected files) | code | https://github.com/MihrabHQ/Mihrab | see third_party/mihrab/UPSTREAM.lock.json | AGPL-3.0-or-later | (C) 2026 Hassan El Ghamri | keep NOTICE + copyright headers; mark changes | yes (AGPL terms) | read upstream LICENSE/NOTICE at import |
| react-native-notify-kit | code | https://github.com/marcocrupi/react-native-notify-kit | ^10.4.0 | Apache-2.0 (per its repository; confirm in package) | Marco Crupi / Invertase (Notifee) | keep NOTICE | yes | read repo LICENSE page 2026-10 |
| Tarteel logo, mark, lockup (`brand/source`) | brand | supplied by the project owner | 2026-10 | project-owned (confirm how the artwork was produced, see BRAND.md) | Tarteel project | n/a | yes | owner |
| Status-bar icon (`ic_stat_prayer.png`) | icon | derived from the Tarteel mark | - | project-owned | Tarteel project | n/a | yes | owner |
| Adhan audio | audio | NONE CHOSEN | - | - | - | - | - | Mihrab's 17 recordings are NOT used: no licence information exists for them |
| adhan (prayer-time calc) | code | https://github.com/batoulapps/adhan-js | ^4.4.3 | verify before release | verify | verify | verify | TBD |
| Quran text | data | https://tanzil.net/download/ (Uthmani) | 1.1 (Feb 2021) | Creative Commons Attribution 3.0 under Tanzil's terms: verbatim copies only, source credited with a link to tanzil.net, copyright block kept | Copyright (C) 2007-2026 Tanzil Project | "Tanzil Project, https://tanzil.net" in Settings -> Sources; COPYRIGHT-TANZIL.txt ships with the dataset | yes, per Tanzil's terms of use | terms read from the download page and the copyright block, 2026-10-12; owner to confirm before release. Only change: the Bismillah Tanzil prepends to ayah 1 of 112 surahs is removed (data/quran/tanzil-uthmani/PROVENANCE.md) |
| Bengali translation | data | https://tanzil.net/trans/ (bn.bengali, Muhiuddin Khan) | last update 2011-04-30 | Tanzil translation terms: non-commercial use; anything else needs the translator's or publisher's permission | Muhiuddin Khan (translator); compiled by Tanzil | "Bengali translation by Muhiuddin Khan, via the Tanzil Project" in Settings -> Sources | **owner decision**: yes for a free, non-commercial app only | NOT verified with the translator/publisher. Owner to confirm before release; set `redistributionPermitted` to false and re-run `npm run import:tanzil` if in doubt |
| English translation | data | https://tanzil.net/trans/ (en.sahih, Saheeh International) | last update 2011-04-24 | Tanzil translation terms: non-commercial use; anything else needs the translator's or publisher's permission | Saheeh International (translator); compiled by Tanzil | "English translation by Saheeh International, via the Tanzil Project" in Settings -> Sources | **owner decision**: yes for a free, non-commercial app only | NOT verified with the translator/publisher. Owner to confirm before release |
| Arabic reader font | font | TBD (system font used until chosen) | — | TBD | TBD | TBD | TBD | TBD |
| Libraries | code | see package-lock.json | — | run a license scan before release | — | — | — | — |
