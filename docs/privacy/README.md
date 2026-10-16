# Privacy

- No analytics, ads, trackers or accounts. The core app makes no network requests.
- Bookmarks, notes, history and preferences live only on the device (`user.db`, MMKV).
- Android auto-backup is disabled (`allowBackup: false` in `apps/mobile/app.config.ts`) so notes are not uploaded to
  Google Drive backups. Revisit only with an explicit, user-controlled export/sync feature.
- Reading history is optional and can be turned off in Settings; the last-read pointer is always local.
- Recitation audio is the only other network use, and only when asked: a download, or streaming if the user turns it on
  (off by default). The audio host sees the device IP address and which reciter and surah are requested; nothing else is
  sent and playing downloaded audio sends nothing. No reciter ships yet: the host will be named here when one is added
  (see [docs/audio](../audio/README.md)). Last-listened position is stored locally in preferences only.
- Knowledge packs (history and context) are the third network use, and only when the person asks: "Check for packs" fetches the catalogue
  and Install, Update or Repair downloads a pack. The pack host (GitHub Releases, once configured) sees the device IP address and which
  catalogue or pack file is requested; nothing else is sent. Opening the Library, reading an installed pack, and everything else send
  nothing. A build without a catalogue address and a publisher key (`apps/mobile/src/knowledge/config.json`) shows no Library and makes
  no pack request at all. Packs never contain, and are never opened with, bookmarks, notes or reading history: those stay in `user.db`.
  The only thing the app records about packs is which are installed (rows in `user.db`, table `downloads`). See
  [docs/architecture/KNOWLEDGE.md](../architecture/KNOWLEDGE.md).
- Future optional cloud features must be opt-in, off by default, and documented here before shipping.
