import { useState } from "react";
import { FlatList, Text, View } from "react-native";
import { Stack } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { LibraryRow } from "@tarteel/database";
import { Button, Caption, Card, Chip } from "../src/components/ui";
import { formatBytes } from "../src/audio/hooks";
import { useKnowledgeLibrary } from "../src/knowledge/hooks";
import { useSettings } from "../src/state/settings";
import { useT } from "../src/i18n";
import type { StringKey } from "../src/i18n";
import { HEADING_FONT, useTheme } from "../src/theme";

/** The pack's text in the app language, else English, else whatever language it has. */
const pick = (text: Record<string, string> | undefined, lang: string): string | undefined => text?.[lang] ?? text?.en ?? (text ? Object.values(text)[0] : undefined);

const STATUS_KEY: Record<LibraryRow["status"], StringKey | null> = {
  "not-installed": null,
  installed: "libInstalled",
  "update-available": "libUpdateAvailable",
  "not-listed": "libNotListed",
  "app-too-old": "libAppTooOld",
  "missing-dependency": "libNeedsOther",
};

/**
 * Optional knowledge packs (history and context). Nothing here is fetched until a button is tapped, and removing a pack
 * never touches the Quran, bookmarks or notes. As on the Reciters screen, deleting is two taps, in place.
 */
export default function LibraryScreen() {
  const th = useTheme();
  const t = useT();
  const insets = useSafeAreaInsets();
  const lang = useSettings((s) => s.uiLanguage);
  const lib = useKnowledgeLibrary();
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const header = (
    <View style={{ gap: 14, paddingBottom: 8 }}>
      <Card padding={16}>
        <View style={{ gap: 10 }}>
          <Text style={{ color: th.text, fontWeight: "700", fontFamily: HEADING_FONT, fontSize: 16 }}>{t("libraryTitle")}</Text>
          <Text style={{ color: th.muted, fontSize: 13, lineHeight: 19 }}>{t("libraryIntro")}</Text>
          <Text style={{ color: th.muted, fontSize: 13, lineHeight: 19 }}>{t("libraryPrivacy")}</Text>
          {lib.available ? (
            <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
              <Button label={lib.catalog === "loading" ? t("libChecking") : t("libCheck")} disabled={lib.catalog === "loading" || lib.busyId !== null} onPress={lib.checkForPacks} />
              {lib.catalog === "loading" ? <Button label={t("cancel")} onPress={lib.cancel} /> : null}
            </View>
          ) : null}
        </View>
      </Card>
      {lib.message ? (
        <Text accessibilityLiveRegion="polite" style={{ color: lib.message.tone === "error" ? th.text : th.muted, fontSize: 14, lineHeight: 20, fontWeight: lib.message.tone === "error" ? "700" : "400" }}>{t(lib.message.text)}</Text>
      ) : null}
    </View>
  );

  if (!lib.available)
    return (
      <>
        <Stack.Screen options={{ title: t("libraryTitle") }} />
        <View style={{ padding: 16, width: "100%", maxWidth: 720, alignSelf: "center" }}>
          <Card padding={16}>
            <Text style={{ color: th.text, fontSize: 15, lineHeight: 22 }}>{t("libraryUnavailable")}</Text>
          </Card>
        </View>
      </>
    );

  const renderRow = ({ item }: { item: LibraryRow }) => {
    const title = pick(item.manifest?.title, lang) ?? item.packId;
    const description = pick(item.manifest?.description, lang);
    const busy = lib.busyId === item.packId;
    const busyElsewhere = lib.busyId !== null && !busy;
    const integrity = lib.damaged.get(item.packId);
    const damaged = integrity !== undefined;
    const statusKey = STATUS_KEY[item.status];
    const installedSize = item.installed ? formatBytes(item.installed.sizeBytes) : null;
    return (
      <Card padding={14}>
        <View style={{ gap: 10 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
            <Text style={{ color: th.text, fontSize: 16, fontWeight: "700", flex: 1 }}>{title}</Text>
            {statusKey ? <Chip label={t(statusKey)} tone={item.status === "installed" ? "accent" : "muted"} /> : null}
          </View>
          {description ? <Text style={{ color: th.muted, fontSize: 14, lineHeight: 20 }}>{description}</Text> : null}
          <Caption>
            {[
              item.installed ? `${t("libVersion")} ${item.installed.packVersion}${installedSize ? ` · ${installedSize}` : ""}` : item.offer ? `${t("libVersion")} ${item.offer.manifest.packVersion} · ${t("approx")} ${formatBytes(item.offer.manifest.file.size)}` : null,
              item.manifest ? item.manifest.languages.join(", ") : null,
            ].filter(Boolean).join(" · ")}
          </Caption>
          {item.offer && item.status === "update-available" && item.manifest?.changelog ? <Caption>{item.manifest.changelog}</Caption> : null}
          {damaged ? <Text style={{ color: th.text, fontSize: 13, lineHeight: 18, fontWeight: "700" }}>{t(integrity === "untrusted" ? "libUntrusted" : "libDamaged")}</Text> : null}
          {busy ? <Text accessibilityLiveRegion="polite" style={{ color: th.text, fontSize: 13 }}>{t("libInstalling")}</Text> : null}
          <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
            {item.offer ? (
              busy ? (
                <Button label={t("cancel")} onPress={lib.cancel} />
              ) : (
                <Button label={item.installed ? t("libUpdate") : t("libInstall")} disabled={busyElsewhere || lib.busyId !== null} onPress={() => item.offer && lib.install(item.offer)} />
              )
            ) : null}
            {damaged && item.listed && !busy ? <Button label={t("libRepair")} disabled={lib.busyId !== null} onPress={() => item.listed && lib.install(item.listed, true)} /> : null}
            {item.installed && !busy ? (
              <Button
                label={confirmId === item.packId ? t("tapAgainToDelete") : t("libRemove")}
                disabled={lib.busyId !== null}
                onPress={() => {
                  if (confirmId !== item.packId) return setConfirmId(item.packId);
                  setConfirmId(null);
                  lib.remove(item.packId);
                }}
              />
            ) : null}
          </View>
          {item.manifest && item.manifest.licenses.length > 0 ? (
            <View style={{ gap: 2 }}>
              <Caption>{t("libLicences")}</Caption>
              {item.manifest.licenses.map((l) => (
                <Text key={l.id} selectable style={{ color: th.muted, fontSize: 12, lineHeight: 17 }}>{l.name}: {l.attribution}</Text>
              ))}
            </View>
          ) : null}
        </View>
      </Card>
    );
  };

  return (
    <>
      <Stack.Screen options={{ title: t("libraryTitle") }} />
      <FlatList
        data={lib.rows}
        keyExtractor={(r) => r.packId}
        renderItem={renderRow}
        ListHeaderComponent={header}
        ListEmptyComponent={lib.ready ? <Caption>{t("libNone")}</Caption> : null}
        ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
        extraData={[lib.busyId, lib.damaged, confirmId, lib.catalog, lang]}
        contentContainerStyle={{ width: "100%", maxWidth: 720, alignSelf: "center", paddingHorizontal: 16, paddingTop: 8, paddingBottom: insets.bottom + 32 }}
      />
    </>
  );
}
