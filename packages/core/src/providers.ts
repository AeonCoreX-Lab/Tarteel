/**
 * The online and built-in sources behind the Hadith and History parts of the app, described in one place: who publishes each, under
 * what terms it is used, what leaves the device when it is used, and whether it may be used at all yet. The "Sources" screens are
 * drawn from this list, so a source that is added here is shown there with the same facts the licence inventory holds.
 *
 * This is facts only. Whether a source is turned on in a given build is a build flag (apps/mobile), and whether the person allows
 * it is a setting; this list says what the source is.
 */

export type ProviderDomain = "hadith" | "history" | "books";

export type ProviderStatus =
  /** Terms read; the app may use it. */
  | "allowed"
  /** The publisher's agreement is still awaited; the code is in the app but switched off. */
  | "pending-permission";

export interface Text2 {
  en: string;
  bn: string;
}

export interface SourceProvider {
  id: string;
  domain: ProviderDomain;
  /** "live": asked over the internet when the person opens something. "pack": a signed pack installed on the device. "download": a text the person chooses to keep on the device. */
  mode: "live" | "pack" | "download";
  name: Text2;
  publisher: string;
  /** The licence or terms, in a few words. */
  licence: string;
  status: ProviderStatus;
  about: Text2;
  /** What leaves the device when the source is used. */
  sends: Text2;
  /** The preference that turns a live source on for the person; null for a pack. */
  settingKey: "onlineHadeethEnc" | "onlineHadith" | "onlineWikipedia" | "onlineQuranEnc" | "onlineQuranpedia" | "onlineIslamicBooks" | "onlineOpenIti" | null;
  /** The screen that opens the source; null when it appears inside other screens. */
  route: string | null;
  siteUrl: string;
}

const LIVE_SENDS: Text2 = {
  en: "Your IP address and what you open or search. No account, device id or location. Nothing is saved on this device.",
  bn: "আপনার IP ঠিকানা এবং আপনি কী খোলেন বা খোঁজেন। কোনো অ্যাকাউন্ট, ডিভাইস আইডি বা অবস্থান নয়। এই ডিভাইসে কিছু সংরক্ষিত হয় না।",
};

export const SOURCE_PROVIDERS: readonly SourceProvider[] = [
  {
    id: "hadeethenc",
    domain: "hadith",
    mode: "live",
    name: { en: "HadeethEnc", bn: "HadeethEnc" },
    publisher: "HadeethEnc.com, IslamHouse.com",
    licence: "Shown unchanged, with credit",
    status: "allowed",
    about: { en: "Hadith by topic, each with its source, grade and explanation. Bengali, English and Arabic.", bn: "বিষয় অনুযায়ী হাদিস, প্রতিটির উৎস, মান ও ব্যাখ্যাসহ। বাংলা, ইংরেজি ও আরবি।" },
    sends: LIVE_SENDS,
    settingKey: "onlineHadeethEnc",
    route: "/hadeeth",
    siteUrl: "https://hadeethenc.com",
  },
  {
    id: "sunnah",
    domain: "hadith",
    mode: "live",
    name: { en: "Sunnah.com", bn: "Sunnah.com" },
    publisher: "Sunnah.com",
    licence: "Terms need the publisher's agreement",
    status: "pending-permission",
    about: { en: "The large collections (Bukhari, Muslim and others) with search. Switched off until Sunnah.com agrees in writing.", bn: "বড় হাদিস সংকলন (বুখারি, মুসলিম ইত্যাদি), অনুসন্ধানসহ। Sunnah.com লিখিতভাবে সম্মতি না দেওয়া পর্যন্ত বন্ধ।" },
    sends: LIVE_SENDS,
    settingKey: "onlineHadith",
    route: "/hadith",
    siteUrl: "https://sunnah.com",
  },
  {
    id: "packs",
    domain: "history",
    mode: "pack",
    name: { en: "Installed knowledge packs", bn: "ইনস্টল করা জ্ঞান-প্যাক" },
    publisher: "Tarteel and the pack's own publishers",
    licence: "Each pack states its own, and is signed",
    status: "allowed",
    about: { en: "Context for surahs and ayahs, and the timeline of events, people and places, with an evidence label and sources on every item. Works offline.", bn: "সূরা ও আয়াতের প্রেক্ষাপট এবং ঘটনা, ব্যক্তি ও স্থানের টাইমলাইন, প্রতিটির সাথে প্রমাণের স্তর ও উৎস। অফলাইনে চলে।" },
    sends: { en: "Nothing. Packs are read on this device.", bn: "কিছুই না। প্যাক এই ডিভাইসেই পড়া হয়।" },
    settingKey: null,
    route: "/library",
    siteUrl: "https://github.com/AeonCoreX-Lab/Tarteel",
  },
  {
    id: "quranenc",
    domain: "history",
    mode: "live",
    name: { en: "QuranEnc tafsir", bn: "QuranEnc তাফসির" },
    publisher: "QuranEnc.com, Rowwad Translation Center, IslamHouse.com",
    licence: "Shown unchanged, with credit",
    status: "allowed",
    about: { en: "Tafsir for each ayah: the concise Al-Mukhtasar in Bengali, Tafsir al-Saʿdi in Arabic, and the Saheeh International translation with its notes (English).", bn: "প্রতিটি আয়াতের তাফসির: বাংলায় সংক্ষিপ্ত আল-মুখতাসার, আরবি তাফসির আস-সাদী এবং টীকাসহ সহীহ ইন্টারন্যাশনাল অনুবাদ (ইংরেজি)।" },
    sends: LIVE_SENDS,
    settingKey: "onlineQuranEnc",
    route: "/tafsir?surah=1",
    siteUrl: "https://quranenc.com",
  },
  {
    id: "quranpedia",
    domain: "history",
    mode: "live",
    name: { en: "Quranpedia", bn: "কুরআনপিডিয়া (Quranpedia)" },
    publisher: "الموسوعة القرآنية, Quranpedia.net",
    licence: "Free for apps, link appreciated; classical works only",
    status: "allowed",
    about: { en: "The introduction of each surah, and for each ayah the classical tafsir (al-Tabari, Ibn Kathir, al-Baghawi, al-Razi and others) and the reasons of revelation (al-Wahidi). Arabic.", bn: "প্রতিটি সূরার ভূমিকা, আর প্রতিটি আয়াতের ক্লাসিক্যাল তাফসির (তাবারী, ইবনে কাসীর, বাগাবী, রাযী প্রমুখ) ও শানে নুযূল (ওয়াহিদী)। আরবি।" },
    sends: LIVE_SENDS,
    settingKey: "onlineQuranpedia",
    route: "/quranpedia?surah=1",
    siteUrl: "https://quranpedia.net",
  },
  {
    id: "wikipedia",
    domain: "history",
    mode: "live",
    name: { en: "Wikipedia", bn: "উইকিপিডিয়া" },
    publisher: "Wikipedia contributors, Wikimedia Foundation",
    licence: "CC BY-SA 4.0",
    status: "allowed",
    about: { en: "Background on surahs, people, places and events. Written by volunteers; not Islamic scholarship. Offered on a surah's History page and on every Timeline entry.", bn: "সূরা, ব্যক্তি, স্থান ও ঘটনার প্রেক্ষাপট। স্বেচ্ছাসেবকদের লেখা; ইসলামী ইলম নয়। সূরার ইতিহাস-পাতায় ও টাইমলাইনের প্রতিটি এন্ট্রিতে দেখানো হয়।" },
    sends: LIVE_SENDS,
    settingKey: "onlineWikipedia",
    route: null,
    siteUrl: "https://www.wikipedia.org",
  },
  {
    id: "islamicbooks",
    domain: "books",
    mode: "live",
    name: { en: "islamic.app Library", bn: "islamic.app লাইব্রেরি" },
    publisher: "islamic.app. Texts gathered from usul.ai, turath.io, shamela.ws, waqfeya.net and others",
    licence: "Out-of-copyright classical works (the publisher's statement); no per-book licence",
    status: "allowed",
    about: {
      en: "Hundreds of classical Arabic books (tafsir, creed, fiqh, seerah, history, language) read live, chapter by chapter, or opened as a PDF. The publisher says it carries only works whose authors died over 100 years ago; Tarteel has not checked each book or its edition. Every book shows its own sources.",
      bn: "শত শত ক্লাসিক্যাল আরবি বই (তাফসির, আকীদা, ফিকহ, সীরাত, ইতিহাস, ভাষা) সরাসরি অধ্যায় ধরে পড়া যায়, বা PDF হিসেবে খোলা যায়। প্রকাশকের কথা, শুধু সেই বই যার লেখক ১০০ বছরের বেশি আগে মারা গেছেন; প্রতিটি বই বা তার সংস্করণ তারতিল যাচাই করেনি। প্রতিটি বইয়ে তার উৎস দেখানো হয়।",
    },
    sends: LIVE_SENDS,
    settingKey: "onlineIslamicBooks",
    route: "/books",
    siteUrl: "https://islamic.app",
  },
  {
    id: "openiti",
    domain: "books",
    mode: "download",
    name: { en: "OpenITI corpus (KITAB project)", bn: "OpenITI কর্পাস (KITAB প্রজেক্ট)" },
    publisher: "OpenITI / KITAB project (Nigst, Romanov, Savant, Seydi, Verkinderen), release 2025.1.9",
    licence: "CC BY-NC-SA 4.0: credit, non-commercial, share alike",
    status: "allowed",
    about: {
      en: "Thousands of premodern Arabic texts. You choose a book and keep a copy on this device to read offline. Tarteel hosts nothing: the list comes from Zenodo and each book from the corpus's own GitHub repository. The texts are scholarly transcriptions: they may hold errors, and their layout is not a printed page.",
      bn: "হাজার হাজার প্রাক-আধুনিক আরবি গ্রন্থ। আপনি একটি বই বেছে এই ডিভাইসে কপি রাখেন, অফলাইনে পড়ার জন্য। তারতিল কিছু হোস্ট করে না: তালিকা আসে Zenodo থেকে আর প্রতিটি বই কর্পাসের নিজস্ব GitHub রিপোজিটরি থেকে। এগুলো পণ্ডিতি প্রতিলিপি: ভুল থাকতে পারে, আর ছাপা পাতার বিন্যাস নেই।",
    },
    sends: {
      en: "Your IP address, to zenodo.org (the list) and raw.githubusercontent.com (a book you keep). No account, device id or location. Only the books you choose to keep are saved on this device; reading a kept book sends nothing.",
      bn: "আপনার IP ঠিকানা, zenodo.org (তালিকা) ও raw.githubusercontent.com (আপনার রাখা বই) এ। কোনো অ্যাকাউন্ট, ডিভাইস আইডি বা অবস্থান নয়। শুধু আপনার রাখা বইগুলো এই ডিভাইসে সংরক্ষিত হয়; রাখা বই পড়তে কিছু পাঠানো হয় না।",
    },
    settingKey: "onlineOpenIti",
    route: "/books",
    siteUrl: "https://kitab-project.org/data/download",
  },
];

export const providersFor = (domain: ProviderDomain): SourceProvider[] => SOURCE_PROVIDERS.filter((p) => p.domain === domain);
