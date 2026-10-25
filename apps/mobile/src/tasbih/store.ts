import { useEffect, useMemo, useState } from "react";
import { AppState } from "react-native";
import { dayKey, normalizeTasbih, resetCount, selectDhikr, setTarget, tap, undo } from "@tarteel/core";
import type { TasbihState } from "@tarteel/core";
import { useSettings } from "../state/settings";

/**
 * The local date, kept current while the screen is open. A phone that slept through midnight writes nothing, so without this the
 * screen would show yesterday's total under the label "today" until the next tap. It is checked when the app comes back to the
 * front and, while the screen is showing, every 30 seconds (cheap: it re-renders only when the date has really changed).
 */
function useToday(): string {
  const [day, setDay] = useState(() => dayKey(new Date()));
  useEffect(() => {
    const refresh = (): void => setDay(dayKey(new Date()));
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") refresh();
    });
    const timer = setInterval(refresh, 30_000);
    return () => {
      sub.remove();
      clearInterval(timer);
    };
  }, []);
  return day;
}

/** The counter's saved state, valid for today. Rendering never writes; only the actions below do. */
export function useTasbihState(): TasbihState {
  const raw = useSettings((s) => s.tasbih);
  const day = useToday();
  return useMemo(() => normalizeTasbih(raw, day), [raw, day]);
}

/** Reads the newest saved state at the moment of the action, so two quick taps never work from the same old state. */
function current(): { state: TasbihState; day: string } {
  const day = dayKey(new Date());
  return { state: normalizeTasbih(useSettings.getState().tasbih, day), day };
}

function save(next: TasbihState): void {
  useSettings.getState().set("tasbih", next);
}

export const tasbihActions = {
  /** One count. Returns whether it finished a round, so the screen can vibrate. */
  tap(): boolean {
    const { state, day } = current();
    const r = tap(state, day);
    save(r.state);
    return r.finishedRound;
  },
  undo(): void {
    const { state, day } = current();
    save(undo(state, day));
  },
  reset(): void {
    const { state, day } = current();
    save(resetCount(state, day));
  },
  select(id: string): void {
    const { state, day } = current();
    save(selectDhikr(state, id, day));
  },
  target(n: number): void {
    const { state, day } = current();
    save(setTarget(state, n, day));
  },
};
