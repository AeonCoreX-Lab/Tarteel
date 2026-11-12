import { createIslamicBooksClient, createQuranEncClient, createQuranpediaClient, createWikiClient } from "@tarteel/core";
import type { IslamicBooksClient, QuranEncClient, QuranpediaClient, WikiClient } from "@tarteel/core";
import { createFetchHadithHttp } from "../hadith/runtime";

/* eslint-disable @typescript-eslint/no-require-imports */
const config = require("./config.json") as { wikipedia?: boolean; quranenc?: boolean; quranpedia?: boolean; islamicbooks?: boolean; openiti?: boolean; translateWorkerUrl?: string };

/**
 * The address of Tarteel's translation Worker (`workers/translate`), for the optional online translator. Empty until the Worker is
 * deployed (see its README). While it is empty there is no online option anywhere in the app and no request is ever made; only
 * an `https://` address counts.
 */
export const translateWorkerUrl: string = typeof config.translateWorkerUrl === "string" && config.translateWorkerUrl.startsWith("https://") ? config.translateWorkerUrl : "";

/**
 * Wikipedia background reading is offered only in a build that turns it on in config.json. With it off there is no card, no
 * screen, no setting, and no request to wikipedia.org, ever. Its text is CC BY-SA 4.0 (credit, licence link, author history).
 */
export const wikipediaEnabled: boolean = config.wikipedia === true;

/**
 * QuranEnc.com tafsir: allowed by the publisher's terms (shown unchanged, with credit). Live lookups only, never stored. With the
 * flag off there is no screen, no setting and no request to quranenc.com.
 */
export const quranEncEnabled: boolean = config.quranenc === true;

/**
 * Quranpedia.net (surah introductions, classical tafsir, reasons of revelation): the publisher offers its API free to apps that ask
 * it live. Live lookups only, one page at a time, never stored. With the flag off there is no screen, no setting and no request
 * to quranpedia.net.
 */
export const quranpediaEnabled: boolean = config.quranpedia === true;

/**
 * islamic.app Library (public-domain classical books, read live one book at a time, never stored). With the flag off there is no
 * screen, no setting and no request to api.islamic.app for books.
 */
export const islamicBooksEnabled: boolean = config.islamicbooks === true;

/**
 * OpenITI corpus (CC BY-NC-SA 4.0, KITAB project): the catalogue is fetched once on request; a book is downloaded only when the
 * person chooses to keep it, and is then read offline. With the flag off there is no screen, no setting and no request.
 */
export const openItiEnabled: boolean = config.openiti === true;

let client: WikiClient | null = null;

/** One client for the app, so its short in-memory cache and request spacing are shared. Never created while the feature is off. */
export function getWikiClient(): WikiClient {
  client ??= createWikiClient({ http: createFetchHadithHttp() });
  return client;
}

let quranEncClient: QuranEncClient | null = null;

/** One QuranEnc client for the app, so its short in-memory cache and request spacing are shared. Never created while that provider is off. */
export function getQuranEncClient(): QuranEncClient {
  quranEncClient ??= createQuranEncClient({ http: createFetchHadithHttp() });
  return quranEncClient;
}

let quranpediaClient: QuranpediaClient | null = null;

/** One Quranpedia client for the app, so its short in-memory cache and request spacing are shared. Never created while that provider is off. */
export function getQuranpediaClient(): QuranpediaClient {
  quranpediaClient ??= createQuranpediaClient({ http: createFetchHadithHttp() });
  return quranpediaClient;
}

let islamicBooksClient: IslamicBooksClient | null = null;

/** One islamic.app Library client for the app, so its short in-memory cache and request spacing are shared. Never created while that provider is off. */
export function getIslamicBooksClient(): IslamicBooksClient {
  islamicBooksClient ??= createIslamicBooksClient({ http: createFetchHadithHttp() });
  return islamicBooksClient;
}
