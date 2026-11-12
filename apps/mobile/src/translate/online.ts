import { createCloudTranslator } from "@tarteel/core";
import type { TranslatorPort } from "@tarteel/core";
import { translateWorkerUrl } from "../online/runtime";
import { createFetchTranslateHttp } from "./http";

/**
 * The online engine, or null when this build has no translation server address (config.json `translateWorkerUrl` is empty). With
 * null there is no online option anywhere and no request is made.
 */
export const onlineTranslator: TranslatorPort | null = translateWorkerUrl === "" ? null : createCloudTranslator({ http: createFetchTranslateHttp(), baseUrl: translateWorkerUrl });
