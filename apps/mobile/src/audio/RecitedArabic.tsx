import { useEffect, useMemo, useState } from "react";
import { Text } from "react-native";
import type { TextStyle } from "react-native";
import { useProgress } from "react-native-track-player";
import { activeSpanAt, segmentsFor, timingsFitText, tokenRangeForSpan } from "@tarteel/audio";
import type { AyahRef, TimingTable } from "@tarteel/audio";
import { usePlaybackStatus } from "./hooks";
import { getTimings } from "./runtime";

/**
 * The Arabic text of the ayah being recited, with the word being recited lit.
 *
 * Mounted only for that one row, so the 4-times-a-second progress updates re-render one ayah and not the list.
 * Everything here is best-effort: without timings, or when the timings do not fit the text, it renders the plain
 * text and the row's own ayah highlight is all the reader sees. Never an error, never a wrong word.
 */
export function RecitedArabic({ ayah, text, style, lit }: { ayah: AyahRef; text: string; style: TextStyle; lit: TextStyle }) {
  const { reciterId } = usePlaybackStatus();
  const [table, setTable] = useState<TimingTable | null>(null);
  useEffect(() => {
    let cancelled = false;
    setTable(null);
    if (reciterId) void getTimings(reciterId).then((t) => { if (!cancelled) setTable(t); });
    return () => { cancelled = true; };
  }, [reciterId]);

  const tokens = useMemo(() => text.split(" "), [text]);
  const segments = useMemo(() => {
    const s = segmentsFor(table, ayah);
    // A table that counts words differently from this text is refused for the ayah, not guessed at.
    return s && timingsFitText(tokens, s) ? s : null;
  }, [table, ayah, tokens]);

  return segments ? <Lit tokens={tokens} segments={segments} text={text} style={style} lit={lit} /> : <Text selectable style={style}>{text}</Text>;
}

function Lit({ tokens, segments, text, style, lit }: { tokens: string[]; segments: NonNullable<ReturnType<typeof segmentsFor>>; text: string; style: TextStyle; lit: TextStyle }) {
  const { position } = useProgress(250);
  const range = tokenRangeForSpan(tokens, activeSpanAt(segments, position * 1000));
  if (!range) return <Text selectable style={style} accessibilityLabel={text}>{text}</Text>;
  return (
    <Text style={style} accessibilityLabel={text}>
      {tokens.map((w, i) => (
        <Text key={i} style={i >= range.from && i <= range.to ? lit : undefined}>
          {w}
          {i < tokens.length - 1 ? " " : ""}
        </Text>
      ))}
    </Text>
  );
}
