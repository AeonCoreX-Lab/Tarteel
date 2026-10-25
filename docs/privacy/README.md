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
- Online hadith (only in a build that enables it, and only after the person turns it on in Settings, which is off by default): each search or opened hadith is a request to api.islamic.app, which can see the IP address and what is searched or opened. The app sends no account, device id or location, and stores nothing it receives. Requests carry a User-Agent that names Tarteel.
- Online hadith from HadeethEnc (enabled in the repository build, but only after the person turns it on in Settings, which is off by default): each opened topic or hadith is a request to hadeethenc.com, which can see the IP address and which topic or hadith is opened. The app sends no account, device id or location, and stores nothing it receives. Requests carry a User-Agent that names Tarteel.
- The tasbih counter keeps its counts and today's totals on the device only (in the preferences store). Nothing about it is sent anywhere, and it needs no network. The only permission it adds is Android's `VIBRATE`, which asks the person nothing.
- Online tafsir from QuranEnc (enabled in the repository build, but only after the person turns it on, in Settings or on the tafsir screen; off by default): opening a surah or an ayah is a request to quranenc.com, which can see the IP address and the surah and ayah opened. The app sends no account, device id or location, and stores nothing it receives. Requests carry a User-Agent that names Tarteel.
- Online classical tafsir from Quranpedia (enabled in the repository build, but only after the person turns it on, in Settings or on its screen; off by default): opening a surah or an ayah is a request to api.quranpedia.net, which can see the IP address and the surah, ayah and book opened. The app sends no account, device id or location, and stores nothing it receives.
- Background reading from Wikipedia (enabled in the repository build, but only after the person turns it on, in Settings or on the card that offers it; off by default): a search or an opened article is a request to wikipedia.org (the Wikimedia Foundation), which can see the IP address and the words searched or the article opened. The words are a surah's name or the name of an entry from an installed pack. The app sends no account, device id or location, and stores nothing it receives. Requests carry a User-Agent that names Tarteel.
- Knowledge packs (history and context) are the third network use, and only when the person asks: "Check for packs" fetches the catalogue
  and Install, Update or Repair downloads a pack. The pack host (GitHub Releases, once configured) sees the device IP address and which
  catalogue or pack file is requested; nothing else is sent. Opening the Library, reading an installed pack, and everything else send
  nothing. A build without a catalogue address and a publisher key (`apps/mobile/src/knowledge/config.json`) shows no Library and makes
  no pack request at all. Packs never contain, and are never opened with, bookmarks, notes or reading history: those stay in `user.db`.
  The only thing the app records about packs is which are installed (rows in `user.db`, table `downloads`). See
  [docs/architecture/KNOWLEDGE.md](../architecture/KNOWLEDGE.md).
- Future optional cloud features must be opt-in, off by default, and documented here before shipping.
