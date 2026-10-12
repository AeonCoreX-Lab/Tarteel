# Privacy

- No analytics, ads, trackers or accounts. The core app makes no network requests.
- Bookmarks, notes, history and preferences live only on the device (`user.db`, MMKV).
- Android auto-backup is disabled (`allowBackup: false` in `apps/mobile/app.config.ts`) so notes are not uploaded to
  Google Drive backups. Revisit only with an explicit, user-controlled export/sync feature.
- Reading history is optional and can be turned off in Settings; the last-read pointer is always local.
- Future optional cloud features must be opt-in, off by default, and documented here before shipping.
