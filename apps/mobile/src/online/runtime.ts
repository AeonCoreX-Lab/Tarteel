import { createWikiClient } from "@tarteel/core";
import type { WikiClient } from "@tarteel/core";
import { createFetchHadithHttp } from "../hadith/runtime";

/* eslint-disable @typescript-eslint/no-require-imports */
const config = require("./config.json") as { wikipedia?: boolean };

/**
 * Wikipedia background reading is offered only in a build that turns it on in config.json. With it off there is no card, no
 * screen, no setting, and no request to wikipedia.org, ever. Its text is CC BY-SA 4.0 (credit, licence link, author history).
 */
export const wikipediaEnabled: boolean = config.wikipedia === true;

let client: WikiClient | null = null;

/** One client for the app, so its short in-memory cache and request spacing are shared. Never created while the feature is off. */
export function getWikiClient(): WikiClient {
  client ??= createWikiClient({ http: createFetchHadithHttp() });
  return client;
}
