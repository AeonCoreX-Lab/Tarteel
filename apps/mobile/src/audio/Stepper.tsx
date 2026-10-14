import { Text, View } from "react-native";
import { clamp } from "@tarteel/core";
import { Button, Row } from "../components/ui";
import { useT } from "../i18n";
import { useTheme } from "../theme";

/** A labelled − value + control with 44dp targets, for the audio options. */
export function Stepper({ label, value, step, min, max, format, onChange }: {
  label: string; value: number; step: number; min: number; max: number; format?: (n: number) => string; onChange: (n: number) => void;
}) {
  const th = useTheme();
  const t = useT();
  const round = (n: number) => Math.round(n * 100) / 100;
  const shown = format ? format(value) : String(value);
  return (
    <View style={{ gap: 8 }}>
      <Text style={{ color: th.text, fontWeight: "600" }}>{label}</Text>
      <Row>
        <Button label={`− ${t("decrease")}`} onPress={() => onChange(clamp(round(value - step), min, max))} disabled={value <= min} />
        <Text accessibilityLabel={`${label}: ${shown}`} style={{ color: th.text, fontSize: 16, minWidth: 56, textAlign: "center" }}>{shown}</Text>
        <Button label={`+ ${t("increase")}`} onPress={() => onChange(clamp(round(value + step), min, max))} disabled={value >= max} />
      </Row>
    </View>
  );
}
